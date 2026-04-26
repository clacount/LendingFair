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

  function getTargetVariancePercent(fairnessEvaluation = {}, getVariancePercent) {
    if (typeof getVariancePercent === 'function') {
      const targetVariancePercent = Number(getVariancePercent(fairnessEvaluation));
      return Number.isFinite(targetVariancePercent) ? targetVariancePercent : Number.POSITIVE_INFINITY;
    }

    const defaultVariancePercent = Number(fairnessEvaluation?.metrics?.consumerVariance?.maxAmountVariancePercent);
    return Number.isFinite(defaultVariancePercent) ? defaultVariancePercent : Number.POSITIVE_INFINITY;
  }

  function scoreFairness(fairnessEvaluation = {}) {
    return Number(fairnessEvaluation?.metrics?.maxAmountVariancePercent) || 0;
  }

  function getTierRank(variancePercent, primaryTargetPercent = PRIMARY_TARGET_PERCENT, advisoryTargetPercent = ADVISORY_TARGET_PERCENT) {
    if (variancePercent <= primaryTargetPercent) {
      return 0;
    }
    if (variancePercent <= advisoryTargetPercent) {
      return 1;
    }
    return 2;
  }

  function getTierLabel(variancePercent, primaryTargetPercent = PRIMARY_TARGET_PERCENT, advisoryTargetPercent = ADVISORY_TARGET_PERCENT) {
    if (variancePercent <= primaryTargetPercent) {
      return 'under_20';
    }
    if (variancePercent <= advisoryTargetPercent) {
      return 'under_25';
    }
    return 'best_available_over_25';
  }

  function buildSummaryMessage(
    variancePercent,
    optimized,
    targetLabel = 'consumer-dollar variance',
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT
  ) {
    if (!optimized) {
      return 'Initial assignment remained the selected result after bounded optimization review.';
    }

    if (variancePercent <= primaryTargetPercent) {
      return `Optimization reached the primary ${targetLabel} target band (<= ${primaryTargetPercent.toFixed(1)}%).`;
    }

    if (variancePercent <= advisoryTargetPercent) {
      return `Optimization reached the ${targetLabel} advisory band (> ${primaryTargetPercent.toFixed(1)}% and <= ${advisoryTargetPercent.toFixed(1)}%).`;
    }

    return 'This is the most optimized result achievable from the available loan distribution.';
  }

  function isBetterCandidate(
    candidate,
    currentBest,
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT
  ) {
    if (!currentBest) {
      return true;
    }

    const candidateTier = getTierRank(candidate.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent);
    const currentTier = getTierRank(currentBest.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent);
    if (candidateTier !== currentTier) {
      return candidateTier < currentTier;
    }

    if (candidate.targetVariancePercent !== currentBest.targetVariancePercent) {
      return candidate.targetVariancePercent < currentBest.targetVariancePercent;
    }

    return candidate.overallVariancePercent < currentBest.overallVariancePercent;
  }

  function optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap,
    eligibleOfficersByLoan,
    evaluateCandidate,
    isConsumerLoan,
    shouldIncludeLoan = () => true,
    getVariancePercent,
    targetLabel = 'consumer-dollar variance',
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT,
    maxEvaluations = DEFAULT_MAX_EVALUATIONS,
    forceOptimizationRun = false
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
    const baselineVariance = getTargetVariancePercent(baselineFairness, getVariancePercent);
    const optimizedLoans = sortLoansDeterministically(
      [...initialLoanToOfficerMap.keys()]
        .filter((loan) => isConsumerLoan?.(loan))
        .filter((loan) => shouldIncludeLoan(loan))
    );

    if ((!forceOptimizationRun && baselineVariance < primaryTargetPercent) || !optimizedLoans.length) {
      return {
        improved: false,
        optimizationRan: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 1,
        initialVariancePercent: baselineVariance,
        finalVariancePercent: baselineVariance,
        tierReached: getTierLabel(baselineVariance, primaryTargetPercent, advisoryTargetPercent),
        summaryMessage: '',
        bestFairnessEvaluation: baselineFairness
      };
    }

    let evaluations = 1;
    let best = {
      loanToOfficerMap: initialLoanToOfficerMap,
      fairnessEvaluation: baselineFairness,
      targetVariancePercent: baselineVariance,
      overallVariancePercent: scoreFairness(baselineFairness)
    };

    const boundedMaxEvaluations = Math.max(1, Number(maxEvaluations) || DEFAULT_MAX_EVALUATIONS);

    const tryCandidate = (candidateMap) => {
      if (evaluations >= boundedMaxEvaluations) {
        return false;
      }
      const fairnessEvaluation = evaluateCandidate(candidateMap);
      evaluations += 1;
      const candidate = {
        loanToOfficerMap: candidateMap,
        fairnessEvaluation,
        targetVariancePercent: getTargetVariancePercent(fairnessEvaluation, getVariancePercent),
        overallVariancePercent: scoreFairness(fairnessEvaluation)
      };

      if (isBetterCandidate(candidate, best, primaryTargetPercent, advisoryTargetPercent)) {
        best = candidate;
        return true;
      }
      return false;
    };

    let improvedInPass = true;
    while (improvedInPass && evaluations < boundedMaxEvaluations && best.targetVariancePercent > primaryTargetPercent) {
      improvedInPass = false;

      for (let loanIndex = 0; loanIndex < optimizedLoans.length && evaluations < boundedMaxEvaluations; loanIndex += 1) {
        const loan = optimizedLoans[loanIndex];
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
          improvedInPass = tryCandidate(candidateMap) || improvedInPass;
        });

        for (let otherIndex = loanIndex + 1; otherIndex < optimizedLoans.length && evaluations < boundedMaxEvaluations; otherIndex += 1) {
          // 2) Pairwise swaps for loans currently held by different officers.
          const otherLoan = optimizedLoans[otherIndex];
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
          improvedInPass = tryCandidate(candidateMap) || improvedInPass;
        }

        if (best.targetVariancePercent <= primaryTargetPercent) {
          break;
        }
      }
    }

    const improved = best.loanToOfficerMap !== initialLoanToOfficerMap;
    return {
      improved,
      optimizationRan: true,
      bestLoanToOfficerMap: best.loanToOfficerMap,
      evaluations,
      initialVariancePercent: baselineVariance,
      finalVariancePercent: best.targetVariancePercent,
      tierReached: getTierLabel(best.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent),
      summaryMessage: buildSummaryMessage(
        best.targetVariancePercent,
        improved,
        targetLabel,
        primaryTargetPercent,
        advisoryTargetPercent
      ),
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
