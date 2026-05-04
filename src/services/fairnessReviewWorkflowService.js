(function initializeFairnessReviewWorkflowService(globalScope) {
  const FAIRNESS_REVIEW_MAX_ATTEMPTS = 5;
  const STATUS_RANK = {
    PASS: 0,
    ADVISORY: 1,
    REVIEW: 2
  };

  function normalizeStatus(status) {
    const normalizedStatus = String(status || 'REVIEW').trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(STATUS_RANK, normalizedStatus)
      ? normalizedStatus
      : 'REVIEW';
  }

  function getNumericMetric(value) {
    const normalizedValue = Number(value);
    return Number.isFinite(normalizedValue) ? normalizedValue : null;
  }

  function collectVarianceMetrics(fairnessEvaluation = {}) {
    const metrics = fairnessEvaluation.metrics || {};
    const values = [
      metrics.maxCountVariancePercent,
      metrics.maxAmountVariancePercent,
      metrics.helocWeightedVariancePercent,
      metrics.consumerVariance?.maxCountVariancePercent,
      metrics.consumerVariance?.maxAmountVariancePercent,
      metrics.mortgageVariance?.maxCountVariancePercent,
      metrics.mortgageVariance?.maxAmountVariancePercent,
      metrics.flexVariance?.maxCountVariancePercent,
      metrics.flexVariance?.maxAmountVariancePercent,
      fairnessEvaluation.statusMetricDescriptor?.valuePercent
    ]
      .map(getNumericMetric)
      .filter((value) => value !== null);

    return values;
  }

  function getFairnessAttemptScore(fairnessEvaluation = {}) {
    const values = collectVarianceMetrics(fairnessEvaluation);
    if (!values.length) {
      return Number.POSITIVE_INFINITY;
    }
    return values.reduce((sum, value) => sum + value, 0);
  }

  function buildFairnessAttempt({ attemptNumber, result }) {
    const fairnessEvaluation = result?.fairnessEvaluation || {};
    const status = normalizeStatus(fairnessEvaluation.overallResult);
    return {
      attemptNumber: Number(attemptNumber) || 1,
      result,
      fairnessEvaluation,
      status,
      metrics: fairnessEvaluation.metrics || {},
      score: getFairnessAttemptScore(fairnessEvaluation)
    };
  }

  function compareFairnessAttempts(attemptA, attemptB) {
    const statusDelta = STATUS_RANK[normalizeStatus(attemptA?.status)] - STATUS_RANK[normalizeStatus(attemptB?.status)];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const scoreA = getNumericMetric(attemptA?.score);
    const scoreB = getNumericMetric(attemptB?.score);
    const normalizedScoreA = scoreA === null ? Number.POSITIVE_INFINITY : scoreA;
    const normalizedScoreB = scoreB === null ? Number.POSITIVE_INFINITY : scoreB;
    if (normalizedScoreA !== normalizedScoreB) {
      return normalizedScoreA - normalizedScoreB;
    }

    return (Number(attemptA?.attemptNumber) || 0) - (Number(attemptB?.attemptNumber) || 0);
  }

  function selectBestFairnessAttempt(attempts = []) {
    const validAttempts = (Array.isArray(attempts) ? attempts : [])
      .filter((attempt) => attempt?.result && !attempt.result.error)
      .map((attempt, index) => ({
        ...attempt,
        attemptNumber: Number(attempt.attemptNumber) || index + 1,
        status: normalizeStatus(attempt.status || attempt.fairnessEvaluation?.overallResult),
        fairnessEvaluation: attempt.fairnessEvaluation || attempt.result?.fairnessEvaluation || {},
        metrics: attempt.metrics || attempt.fairnessEvaluation?.metrics || attempt.result?.fairnessEvaluation?.metrics || {},
        score: getNumericMetric(attempt.score) ?? getFairnessAttemptScore(attempt.fairnessEvaluation || attempt.result?.fairnessEvaluation || {})
      }));

    if (!validAttempts.length) {
      return null;
    }

    return [...validAttempts].sort(compareFairnessAttempts)[0];
  }

  function shouldRequireManagerConfirmation(attempt) {
    return normalizeStatus(attempt?.status || attempt?.fairnessEvaluation?.overallResult) === 'REVIEW';
  }

  const api = {
    FAIRNESS_REVIEW_MAX_ATTEMPTS,
    normalizeStatus,
    getFairnessAttemptScore,
    buildFairnessAttempt,
    selectBestFairnessAttempt,
    shouldRequireManagerConfirmation
  };

  globalScope.FairnessReviewWorkflowService = api;
  globalScope.FairnessReviewService = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : global);
