(function initializeOfficerLaneOptimizationService(globalScope) {
  const PRIMARY_TARGET_PERCENT = 20;
  const ADVISORY_TARGET_PERCENT = 25;
  const DEFAULT_MAX_EVALUATIONS = 220;

  function sortLoansDeterministically(loans = []) {
    return [...loans].sort((loanA, loanB) => {
      const typeCompare = String(loanA.type || '').localeCompare(String(loanB.type || ''));
      if (typeCompare !== 0) {
        return typeCompare;
      }
      const amountCompare = (Number(loanB.amountRequested) || 0) - (Number(loanA.amountRequested) || 0);
      if (amountCompare !== 0) {
        return amountCompare;
      }
      return String(loanA.name || '').localeCompare(String(loanB.name || ''));
    });
  }

  function cloneAssignmentMap(baseAssignmentMap = new Map()) {
    return new Map(baseAssignmentMap);
  }

  function getConsumerVariancePercent(fairnessEvaluation = {}) {
    return Number(fairnessEvaluation?.metrics?.consumerVariance?.maxAmountVariancePercent) || 0;
  }

  function scoreFairness(fairnessEvaluation = {}) {
    return Number(fairnessEvaluation?.metrics?.maxAmountVariancePercent) || 0;
  }

  function getTierRank(consumerVariancePercent) {
    if (consumerVariancePercent <= PRIMARY_TARGET_PERCENT) {
      return 0;
    }
    if (consumerVariancePercent <= ADVISORY_TARGET_PERCENT) {
      return 1;
    }
    return 2;
  }

  function getTierLabel(consumerVariancePercent) {
    if (consumerVariancePercent <= PRIMARY_TARGET_PERCENT) {
      return 'under_20';
    }
    if (consumerVariancePercent <= ADVISORY_TARGET_PERCENT) {
      return 'under_25';
    }
    return 'best_available_over_25';
  }

  function buildSummaryMessage(consumerVariancePercent, optimized) {
    if (!optimized) {
      return 'Initial assignment remained the selected result after bounded optimization review.';
    }

    if (consumerVariancePercent <= PRIMARY_TARGET_PERCENT) {
      return 'Optimization reached the primary consumer-dollar variance target band (<= 20.0%).';
    }

    if (consumerVariancePercent <= ADVISORY_TARGET_PERCENT) {
      return 'Optimization reached the consumer-dollar advisory band (> 20.0% and <= 25.0%).';
    }

    return 'This is the most optimized result achievable from the available loan distribution.';
  }

  function isBetterCandidate(candidate, currentBest) {
    if (!currentBest) {
      return true;
    }

    const candidateTier = getTierRank(candidate.consumerVariancePercent);
    const currentTier = getTierRank(currentBest.consumerVariancePercent);
    if (candidateTier !== currentTier) {
      return candidateTier < currentTier;
    }

    if (candidate.consumerVariancePercent !== currentBest.consumerVariancePercent) {
      return candidate.consumerVariancePercent < currentBest.consumerVariancePercent;
    }

    return candidate.overallVariancePercent < currentBest.overallVariancePercent;
  }

  function optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap,
    eligibleOfficersByLoan,
    evaluateCandidate,
    isConsumerLoan,
    shouldIncludeLoan = () => true,
    maxEvaluations = DEFAULT_MAX_EVALUATIONS
  } = {}) {
    if (!(initialLoanToOfficerMap instanceof Map) || typeof evaluateCandidate !== 'function') {
      return {
        improved: false,
        optimizationRan: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 0,
        initialVariancePercent: 0,
        finalVariancePercent: 0,
        tierReached: 'under_20',
        summaryMessage: ''
      };
    }

    const baselineFairness = evaluateCandidate(initialLoanToOfficerMap);
    const baselineVariance = getConsumerVariancePercent(baselineFairness);
    const consumerLoans = sortLoansDeterministically(
      [...initialLoanToOfficerMap.keys()]
        .filter((loan) => isConsumerLoan?.(loan))
        .filter((loan) => shouldIncludeLoan(loan))
    );

    // Tiered entry rule: if initial variance is already below 20%, keep the baseline result.
    if (baselineVariance < PRIMARY_TARGET_PERCENT || !consumerLoans.length) {
      return {
        improved: false,
        optimizationRan: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 1,
        initialVariancePercent: baselineVariance,
        finalVariancePercent: baselineVariance,
        tierReached: getTierLabel(baselineVariance),
        summaryMessage: '',
        bestFairnessEvaluation: baselineFairness
      };
    }

    let evaluations = 1;
    let best = {
      loanToOfficerMap: initialLoanToOfficerMap,
      fairnessEvaluation: baselineFairness,
      consumerVariancePercent: baselineVariance,
      overallVariancePercent: scoreFairness(baselineFairness)
    };

    const boundedMaxEvaluations = Math.max(1, Number(maxEvaluations) || DEFAULT_MAX_EVALUATIONS);

    const tryCandidate = (candidateMap) => {
      if (evaluations >= boundedMaxEvaluations) {
        return;
      }
      const fairnessEvaluation = evaluateCandidate(candidateMap);
      evaluations += 1;
      const candidate = {
        loanToOfficerMap: candidateMap,
        fairnessEvaluation,
        consumerVariancePercent: getConsumerVariancePercent(fairnessEvaluation),
        overallVariancePercent: scoreFairness(fairnessEvaluation)
      };

      if (isBetterCandidate(candidate, best)) {
        best = candidate;
      }
    };

    for (let loanIndex = 0; loanIndex < consumerLoans.length && evaluations < boundedMaxEvaluations; loanIndex += 1) {
      const loan = consumerLoans[loanIndex];
      const currentOfficer = best.loanToOfficerMap.get(loan);
      const eligibleOfficers = [...(eligibleOfficersByLoan.get(loan) || [])]
        .map((officer) => String(officer || '').trim())
        .filter(Boolean)
        .sort((officerA, officerB) => officerA.localeCompare(officerB));

      eligibleOfficers.forEach((candidateOfficer) => {
        if (evaluations >= boundedMaxEvaluations || candidateOfficer === currentOfficer) {
          return;
        }

        const candidateMap = cloneAssignmentMap(best.loanToOfficerMap);
        candidateMap.set(loan, candidateOfficer);
        tryCandidate(candidateMap);
      });

      for (let otherIndex = loanIndex + 1; otherIndex < consumerLoans.length && evaluations < boundedMaxEvaluations; otherIndex += 1) {
        const otherLoan = consumerLoans[otherIndex];
        const officerA = best.loanToOfficerMap.get(loan);
        const officerB = best.loanToOfficerMap.get(otherLoan);
        if (!officerA || !officerB || officerA === officerB) {
          continue;
        }

        const loanEligible = eligibleOfficersByLoan.get(loan) || [];
        const otherEligible = eligibleOfficersByLoan.get(otherLoan) || [];
        if (!loanEligible.includes(officerB) || !otherEligible.includes(officerA)) {
          continue;
        }

        const candidateMap = cloneAssignmentMap(best.loanToOfficerMap);
        candidateMap.set(loan, officerB);
        candidateMap.set(otherLoan, officerA);
        tryCandidate(candidateMap);
      }

      // Stop once we hit the primary tier, otherwise continue searching within bounded effort.
      if (best.consumerVariancePercent <= PRIMARY_TARGET_PERCENT) {
        break;
      }
    }

    const improved = best.loanToOfficerMap !== initialLoanToOfficerMap;
    return {
      improved,
      optimizationRan: true,
      bestLoanToOfficerMap: best.loanToOfficerMap,
      evaluations,
      initialVariancePercent: baselineVariance,
      finalVariancePercent: best.consumerVariancePercent,
      tierReached: getTierLabel(best.consumerVariancePercent),
      summaryMessage: buildSummaryMessage(best.consumerVariancePercent, improved),
      bestFairnessEvaluation: best.fairnessEvaluation
    };
  }

  const service = {
    PRIMARY_TARGET_PERCENT,
    ADVISORY_TARGET_PERCENT,
    optimizeConsumerLaneAssignments
  };

  globalScope.OfficerLaneOptimizationService = service;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = service;
  }
})(typeof window !== 'undefined' ? window : globalThis);
