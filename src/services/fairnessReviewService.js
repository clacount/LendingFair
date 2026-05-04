(function initializeFairnessReviewService(globalScope) {
  const FAIRNESS_REVIEW_MAX_ATTEMPTS = 5;
  const STATUS_RANK = {
    PASS: 0,
    ADVISORY: 1,
    REVIEW: 2
  };

  function toFiniteNumber(value) {
    return Number.isFinite(value) ? value : null;
  }

  function collectScoreMetrics(metrics = {}) {
    return [
      toFiniteNumber(metrics.maxCountVariancePercent),
      toFiniteNumber(metrics.maxAmountVariancePercent),
      toFiniteNumber(metrics?.consumerVariance?.maxCountVariancePercent),
      toFiniteNumber(metrics?.consumerVariance?.maxAmountVariancePercent),
      toFiniteNumber(metrics?.mortgageVariance?.maxCountVariancePercent),
      toFiniteNumber(metrics?.mortgageVariance?.maxAmountVariancePercent),
      toFiniteNumber(metrics?.flexVariance?.maxCountVariancePercent),
      toFiniteNumber(metrics?.flexVariance?.maxAmountVariancePercent),
      toFiniteNumber(metrics?.helocWeightedVariancePercent)
    ].filter((value) => value !== null);
  }

  function deriveFairnessScore(attempt) {
    const values = collectScoreMetrics(attempt?.metrics || attempt?.fairnessEvaluation?.metrics);
    if (!values.length) {
      return null;
    }
    return values.reduce((sum, value) => sum + value, 0);
  }

  function selectBestFairnessAttempt(attempts = []) {
    if (!Array.isArray(attempts) || !attempts.length) {
      return { selectedAttempt: null, reason: 'no_attempts' };
    }

    const decorated = attempts.map((attempt, index) => {
      const status = String(attempt?.status || attempt?.fairnessEvaluation?.overallResult || 'REVIEW').toUpperCase();
      return { attempt, index, status, score: deriveFairnessScore(attempt) };
    });
    let best = decorated[0];
    for (const candidate of decorated.slice(1)) {
      const bestRank = STATUS_RANK[best.status] ?? STATUS_RANK.REVIEW;
      const candidateRank = STATUS_RANK[candidate.status] ?? STATUS_RANK.REVIEW;
      if (candidateRank < bestRank) {
        best = candidate;
        continue;
      }
      if (candidateRank > bestRank) {
        continue;
      }
      if (best.score === null && candidate.score !== null) {
        best = candidate;
        continue;
      }
      if (best.score !== null && candidate.score !== null && candidate.score < best.score) {
        best = candidate;
      }
    }
    return {
      selectedAttempt: best.attempt,
      reason: best.score === null ? 'no_comparable_metrics' : 'best_available_score'
    };
  }

  function resolveSelectedAttempt(selection, fallbackAttempt = null) {
    if (!selection) {
      return fallbackAttempt;
    }
    if (selection.selectedAttempt) {
      return selection.selectedAttempt;
    }
    if (selection.result || selection.attemptNumber) {
      return selection;
    }
    return fallbackAttempt;
  }

  globalScope.FairnessReviewService = {
    FAIRNESS_REVIEW_MAX_ATTEMPTS,
    deriveFairnessScore,
    selectBestFairnessAttempt,
    resolveSelectedAttempt
  };
})(window);
