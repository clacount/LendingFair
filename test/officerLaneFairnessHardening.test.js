const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.localStorage = { getItem() { return null; }, setItem() {} };

require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessEngineService.js');

function evaluate(params) {
  return global.FairnessEngineService.evaluateFairness({ engineType: 'officer_lane', ...params });
}

test('officer-lane consumer-only pool uses consumer status descriptor and passes exact threshold boundary', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'C2', eligibility: { consumer: true, mortgage: false } }
    ],
    officerStats: [
      { officer: 'C1', totalLoans: 23, totalAmount: 60, consumerLoanCount: 23, consumerAmount: 60, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 12, 'Credit Card': 11 } },
      { officer: 'C2', totalLoans: 17, totalAmount: 40, consumerLoanCount: 17, consumerAmount: 40, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 9, 'Credit Card': 8 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'consumer_lane_dollar_variance');
  assert.equal(evaluation.metrics.consumerVariance.maxCountVariancePercent, 15);
  assert.equal(evaluation.metrics.consumerVariance.maxAmountVariancePercent, 20);
});

test('officer-lane mortgage-only pool emits mortgage descriptor instead of null/flex fallback', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'M2', eligibility: { consumer: false, mortgage: true } }
    ],
    officerStats: [
      { officer: 'M1', totalLoans: 10, totalAmount: 500000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 10, mortgageAmount: 500000, typeBreakdown: { HELOC: 6, 'First Mortgage': 4 } },
      { officer: 'M2', totalLoans: 10, totalAmount: 500000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 10, mortgageAmount: 500000, typeBreakdown: { HELOC: 5, 'First Mortgage': 5 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'mortgage_lane_dollar_variance');
  assert.equal(evaluation.statusMetricDescriptor?.contextLabel, 'Mortgage lane thresholds');
});

test('officer-lane excludes vacationed mortgage-only officers from active HELOC-only support fairness', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true }, isOnVacation: true },
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    optimizationMetrics: { helocWeightedVariancePercent: 18 },
    officerStats: [
      { officer: 'M1', totalLoans: 0, totalAmount: 0, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: {} },
      { officer: 'F1', totalLoans: 5, totalAmount: 250000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 5, mortgageAmount: 250000, typeBreakdown: { HELOC: 5 } },
      { officer: 'F2', totalLoans: 5, totalAmount: 250000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 5, mortgageAmount: 250000, typeBreakdown: { HELOC: 5 } }
    ]
  });

  assert.equal(evaluation.roleAwareFlags.helocOnlySupportThresholdsApplied, false);
  assert.equal(evaluation.roleAwareFlags.flexParticipationExpected, true);
  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'flex_lane_dollar_variance');
  assert.equal(evaluation.metrics.helocWeightedVariancePercent, 18);
});

test('officer-lane REVIEW from mortgage variance does not report consumer status descriptor', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'M2', eligibility: { consumer: false, mortgage: true } }
    ],
    officerStats: [
      { officer: 'C1', totalLoans: 2, totalAmount: 40000, consumerLoanCount: 2, consumerAmount: 40000, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 2 } },
      { officer: 'M1', totalLoans: 1, totalAmount: 100000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100000, typeBreakdown: { HELOC: 1 } },
      { officer: 'M2', totalLoans: 6, totalAmount: 600000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 6, mortgageAmount: 600000, typeBreakdown: { HELOC: 6 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.mortgageVariance.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.mortgageVariance.maxAmountVariancePercent > 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'mortgage_lane_count_variance');
});

test('officer-lane flex REVIEW reports count descriptor when count fails and dollar passes', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    officerStats: [
      { officer: 'F1', totalLoans: 8, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 8, mortgageAmount: 100, typeBreakdown: { HELOC: 8 } },
      { officer: 'F2', totalLoans: 2, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 100, typeBreakdown: { HELOC: 2 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.flexVariance.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.flexVariance.maxAmountVariancePercent <= 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'flex_lane_count_variance');
});

test('officer-lane mortgage REVIEW reports dollar descriptor when dollar fails and count passes', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'M2', eligibility: { consumer: false, mortgage: true } }
    ],
    officerStats: [
      { officer: 'M1', totalLoans: 5, totalAmount: 900, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 5, mortgageAmount: 900, typeBreakdown: { HELOC: 5 } },
      { officer: 'M2', totalLoans: 5, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 5, mortgageAmount: 100, typeBreakdown: { HELOC: 5 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.mortgageVariance.maxCountVariancePercent <= 15);
  assert.ok(evaluation.metrics.mortgageVariance.maxAmountVariancePercent > 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'mortgage_lane_dollar_variance');
});

test('officer-lane consumer REVIEW reports count descriptor when count fails and dollar passes', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'C2', eligibility: { consumer: true, mortgage: false } }
    ],
    officerStats: [
      { officer: 'C1', totalLoans: 8, totalAmount: 100, consumerLoanCount: 8, consumerAmount: 100, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 8 } },
      { officer: 'C2', totalLoans: 2, totalAmount: 100, consumerLoanCount: 2, consumerAmount: 100, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 2 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.consumerVariance.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.consumerVariance.maxAmountVariancePercent <= 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'consumer_lane_count_variance');
});

test('officer-lane lane descriptor is deterministic when both count and dollar fail', () => {
  const evaluation = evaluate({
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'C2', eligibility: { consumer: true, mortgage: false } }
    ],
    officerStats: [
      { officer: 'C1', totalLoans: 8, totalAmount: 190, consumerLoanCount: 8, consumerAmount: 190, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 8 } },
      { officer: 'C2', totalLoans: 2, totalAmount: 10, consumerLoanCount: 2, consumerAmount: 10, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: { Personal: 2 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.consumerVariance.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.consumerVariance.maxAmountVariancePercent > 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'consumer_lane_dollar_variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, evaluation.metrics.consumerVariance.maxAmountVariancePercent);
});
