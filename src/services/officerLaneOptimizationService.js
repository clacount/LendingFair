(function initializeOfficerLaneOptimizationService(globalScope) {
  const REVIEW_THRESHOLD_PERCENT = 25;
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

  function isBetterCandidate(candidate, currentBest) {
    if (!currentBest) {
      return true;
    }

    if (candidate.consumerVariancePercent < currentBest.consumerVariancePercent) {
      return true;
    }

    if (candidate.consumerVariancePercent > currentBest.consumerVariancePercent) {
      return false;
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
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 0,
        reachedThreshold: false,
        initialVariancePercent: 0,
        finalVariancePercent: 0
      };
    }

    const consumerLoans = sortLoansDeterministically(
      [...initialLoanToOfficerMap.keys()]
        .filter((loan) => isConsumerLoan?.(loan))
        .filter((loan) => shouldIncludeLoan(loan))
    );

    const baselineFairness = evaluateCandidate(initialLoanToOfficerMap);
    const baselineVariance = getConsumerVariancePercent(baselineFairness);

    if (!consumerLoans.length || baselineVariance <= REVIEW_THRESHOLD_PERCENT) {
      return {
        improved: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 1,
        reachedThreshold: baselineVariance <= REVIEW_THRESHOLD_PERCENT,
        initialVariancePercent: baselineVariance,
        finalVariancePercent: baselineVariance,
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

      if (best.consumerVariancePercent <= REVIEW_THRESHOLD_PERCENT) {
        break;
      }
    }

    return {
      improved: best.consumerVariancePercent < baselineVariance,
      bestLoanToOfficerMap: best.loanToOfficerMap,
      evaluations,
      reachedThreshold: best.consumerVariancePercent <= REVIEW_THRESHOLD_PERCENT,
      initialVariancePercent: baselineVariance,
      finalVariancePercent: best.consumerVariancePercent,
      bestFairnessEvaluation: best.fairnessEvaluation
    };
  }

  const service = {
    REVIEW_THRESHOLD_PERCENT,
    optimizeConsumerLaneAssignments
  };

  globalScope.OfficerLaneOptimizationService = service;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = service;
  }
})(typeof window !== 'undefined' ? window : globalThis);
