const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessEngineService.js');

test('fairness engine classes are registered behind the service facade', () => {
  assert.equal(typeof global.GlobalFairnessEngine, 'function');
  assert.equal(typeof global.OfficerLaneFairnessEngine, 'function');
  assert.equal(typeof global.FairnessEngineService.getFairnessEngineEvaluator, 'undefined');
});

test('officer_lane does not fail routing when no mortgage-only lane exists', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    officerStats: [
      {
        officer: 'F1',
        totalLoans: 10,
        totalAmount: 100,
        consumerLoanCount: 10,
        consumerAmount: 100,
        mortgageLoanCount: 0,
        mortgageAmount: 0,
        typeBreakdown: {}
      },
      {
        officer: 'F2',
        totalLoans: 10,
        totalAmount: 100,
        consumerLoanCount: 0,
        consumerAmount: 0,
        mortgageLoanCount: 10,
        mortgageAmount: 100,
        typeBreakdown: {}
      }
    ]
  });

  assert.equal(evaluation.metrics.flexVariance.maxCountVariancePercent, 0);
  assert.equal(evaluation.metrics.flexVariance.maxAmountVariancePercent, 0);
  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'flex_lane_dollar_variance');
});

test('homogeneous HELOC support pool can PASS with specialized thresholds and weighted optimization target', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } },
      { name: 'F3', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    optimizationMetrics: {
      helocWeightedVariancePercent: 12.6
    },
    officerStats: [
      { officer: 'F1', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'F2', totalLoans: 1, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100, typeBreakdown: { HELOC: 1 } },
      { officer: 'F3', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'M1', totalLoans: 3, totalAmount: 300, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 3, mortgageAmount: 300, typeBreakdown: { HELOC: 3 } }
    ]
  });

  assert.ok(evaluation.metrics.flexVariance.maxCountVariancePercent > 15, 'Would fail old generic 15% count threshold.');
  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.roleAwareFlags.helocOnlySupportThresholdsApplied, true);
  assert.equal(evaluation.metrics.helocWeightedVariancePercent, 12.6);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'heloc_weighted_variance');
  assert.equal(evaluation.statusMetricDescriptor?.label, 'Weighted HELOC variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, 12.6);
  assert.match(evaluation.summaryItems.join(' | '), /HELOC-only support thresholds applied/i);
});

test('fairness metrics keep HELOC weighted variance null when optimization metric is absent', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    officerStats: [
      { officer: 'F1', totalLoans: 1, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100, typeBreakdown: { HELOC: 1 } },
      { officer: 'M1', totalLoans: 1, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100, typeBreakdown: { HELOC: 1 } }
    ]
  });

  assert.equal(global.FairnessEngineService.isHomogeneousHelocSupportPool({
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    hasConsumerLoans: false,
    loanTypeNames: ['heloc']
  }), true);
  assert.equal(evaluation.roleAwareFlags.helocOnlySupportThresholdsApplied, true);
  assert.equal(evaluation.metrics.helocWeightedVariancePercent, null);
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, null);
});

test('homogeneous HELOC support pool remains REVIEW when flex variance exceeds 25%', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } },
      { name: 'F3', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    optimizationMetrics: {
      helocWeightedVariancePercent: 18
    },
    officerStats: [
      { officer: 'F1', totalLoans: 4, totalAmount: 400, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 4, mortgageAmount: 400, typeBreakdown: { HELOC: 4 } },
      { officer: 'F2', totalLoans: 0, totalAmount: 0, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: {} },
      { officer: 'F3', totalLoans: 0, totalAmount: 0, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: {} },
      { officer: 'M1', totalLoans: 4, totalAmount: 400, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 4, mortgageAmount: 400, typeBreakdown: { HELOC: 4 } }
    ]
  });

  assert.ok(evaluation.metrics.flexVariance.maxCountVariancePercent > 25);
  assert.equal(evaluation.overallResult, 'REVIEW');
});

test('homogeneous HELOC support pool remains REVIEW when weighted optimization target fails', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } },
      { name: 'F3', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    optimizationMetrics: {
      helocWeightedVariancePercent: 27
    },
    officerStats: [
      { officer: 'F1', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'F2', totalLoans: 1, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100, typeBreakdown: { HELOC: 1 } },
      { officer: 'F3', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'M1', totalLoans: 3, totalAmount: 300, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 3, mortgageAmount: 300, typeBreakdown: { HELOC: 3 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
});

test('homogeneous HELOC support pool remains REVIEW when M leadership policy fails', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } },
      { name: 'F3', eligibility: { consumer: true, mortgage: true } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } }
    ],
    optimizationMetrics: {
      helocWeightedVariancePercent: 12
    },
    officerStats: [
      { officer: 'F1', totalLoans: 3, totalAmount: 300, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 3, mortgageAmount: 300, typeBreakdown: { HELOC: 3 } },
      { officer: 'F2', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'F3', totalLoans: 2, totalAmount: 200, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 2, mortgageAmount: 200, typeBreakdown: { HELOC: 2 } },
      { officer: 'M1', totalLoans: 1, totalAmount: 100, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100, typeBreakdown: { HELOC: 1 } }
    ]
  });

  assert.equal(evaluation.overallResult, 'REVIEW');
});

test('mortgage leadership descriptor value uses mortgage loan-count share, not mortgage dollar share', () => {
  const evaluation = global.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    officerStats: [
      {
        officer: 'M1',
        totalLoans: 2,
        totalAmount: 900000,
        consumerLoanCount: 0,
        consumerAmount: 0,
        mortgageLoanCount: 2,
        mortgageAmount: 900000,
        typeBreakdown: { 'Home Refi': 2 }
      },
      {
        officer: 'F1',
        totalLoans: 3,
        totalAmount: 100000,
        consumerLoanCount: 0,
        consumerAmount: 0,
        mortgageLoanCount: 3,
        mortgageAmount: 100000,
        typeBreakdown: { 'Home Refi': 3 }
      },
      {
        officer: 'F2',
        totalLoans: 0,
        totalAmount: 0,
        consumerLoanCount: 0,
        consumerAmount: 0,
        mortgageLoanCount: 0,
        mortgageAmount: 0,
        typeBreakdown: {}
      }
    ]
  });

  const expectedCountSharePercent = (2 / 5) * 100;
  const mortgageRoutingSharePercent = (900000 / 1000000) * 100;

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'mortgage_leadership_policy');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, expectedCountSharePercent);
  assert.notEqual(evaluation.statusMetricDescriptor?.valuePercent, mortgageRoutingSharePercent);
});
