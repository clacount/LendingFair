const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessDisplayService.js');
require('../src/services/scenarioEngineRecommendationService.js');

function separatedOfficers() {
  return [
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true } },
    { name: 'F1', eligibility: { consumer: true, mortgage: true } }
  ];
}

test('no loans and no officers returns insufficient data mode', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [],
    loans: []
  });

  assert.equal(recommendation.mode, 'insufficient_data');
  assert.equal(recommendation.isActionable, false);
  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(
    recommendation.reasons.includes('Add loans and at least two active officers to evaluate the best-fit fairness model.'),
    true
  );
});

test('mortgage loans imported before officers give preliminary officer lane guidance', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [],
    loans: [
      { name: 'L1', type: 'Second Mortgage' }
    ]
  });

  assert.equal(recommendation.mode, 'loan_mix_only');
  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.equal(recommendation.isActionable, false);
  assert.equal(recommendation.confidence, 'preliminary');
  assert.equal(
    recommendation.reasons.some((reason) => reason.includes('mortgage products')),
    true
  );
  assert.equal(
    recommendation.reasons.some((reason) => reason.includes('Add at least two active officers')),
    true
  );
});

test('mixed loans before officers give preliminary officer lane guidance and category diagnostics', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [],
    loans: [
      { name: 'L1', type: 'Auto' },
      { name: 'L2', type: 'HELOC' }
    ]
  });

  assert.equal(recommendation.mode, 'loan_mix_only');
  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 1, mortgage: 1 });
  assert.equal(recommendation.hasMixedLoanCategories, true);
});

test('consumer-only loans before officers keep preliminary global guidance', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [],
    loans: [
      { name: 'L1', type: 'Auto' },
      { name: 'L2', type: 'Personal' }
    ]
  });

  assert.equal(recommendation.mode, 'loan_mix_only');
  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(recommendation.isActionable, false);
  assert.equal(
    recommendation.reasons.some((reason) => reason.includes('Global Fairness is likely sufficient')),
    true
  );
});

test('recommends officer lane for mixed consumer, mortgage, and flex officers', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    loans: [
      { name: 'L1', type: 'Personal' },
      { name: 'L2', type: 'HELOC' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.equal(recommendation.mode, 'full_scenario');
  assert.equal(recommendation.matchesCurrent, false);
  assert.equal(recommendation.isActionable, true);
  assert.equal(recommendation.confidence, 'high');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 1, mortgage: 1 });
  assert.deepEqual(recommendation.officerRoleCounts, { consumerOnly: 1, mortgageOnly: 1, flex: 2 });
});

test('keeps global recommendation for homogeneous officer pools', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    loans: [
      { name: 'L1', type: 'Personal' },
      { name: 'L2', type: 'HELOC' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(recommendation.mode, 'full_scenario');
  assert.equal(recommendation.matchesCurrent, true);
  assert.equal(recommendation.isActionable, true);
  assert.equal(
    recommendation.reasons.some((reason) => reason.includes('share the same coverage pattern')),
    true
  );
});

test('returns a low-confidence placeholder before enough scenario inputs exist', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'officer_lane',
    officers: [{ name: 'F1', eligibility: { consumer: true, mortgage: true } }],
    loans: []
  });

  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(recommendation.mode, 'insufficient_data');
  assert.equal(recommendation.confidence, 'low');
  assert.equal(recommendation.isActionable, false);
});

test('keeps global for consumer-only officers and consumer-only loans', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [
      { name: 'C1', eligibility: { consumer: true, mortgage: false } },
      { name: 'C2', eligibility: { consumer: true, mortgage: false } }
    ],
    loans: [
      { name: 'L1', type: 'Auto' },
      { name: 'L2', type: 'Personal' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(recommendation.mode, 'full_scenario');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 2, mortgage: 0 });
});

test('explicit mortgage category on imported custom loan recommends officer lane with separated roles', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Auto', category: 'consumer' },
      { name: 'L2', type: 'Second Mortgage', category: 'mortgage' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.equal(recommendation.confidence, 'high');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 1, mortgage: 1 });
  assert.equal(
    recommendation.reasons.includes('The current loan mix includes mortgage loans and the active officer pool has consumer/mortgage lane separation.'),
    true
  );
});

test('loanCategory mortgage on imported loan recommends officer lane with separated roles', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Share Secured', loanCategory: 'consumer' },
      { name: 'L2', type: 'Custom Product', loanCategory: 'mortgage' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 1, mortgage: 1 });
});

test('mortgage keyword fallback classifies unconfigured Second Mortgage as mortgage', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Second Mortgage' }
    ]
  });

  assert.equal(global.ScenarioEngineRecommendationService.getLoanCategory({ type: 'Second Mortgage' }), 'mortgage');
  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 0, mortgage: 1 });
});

test('configured loan type registry category influences imported loan recommendation', () => {
  global.LendingFairLoanTypeRegistry = {
    getLoanCategoryForType(typeName) {
      return typeName === 'Portfolio Construction' ? 'mortgage' : '';
    },
    getLoanTypes() {
      return [];
    }
  };

  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Portfolio Construction' }
    ]
  });

  delete global.LendingFairLoanTypeRegistry;

  assert.equal(recommendation.recommendedEngine, 'officer_lane');
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 0, mortgage: 1 });
});

test('mortgage keyword fallback still runs when global helper defaults unknown type to consumer', () => {
  global.getLoanCategoryForType = () => 'consumer';

  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Construction Loan' },
      { name: 'L2', type: 'Land Loan' },
      { name: 'L3', type: 'Real Estate' }
    ]
  });

  delete global.getLoanCategoryForType;

  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 0, mortgage: 3 });
  assert.equal(recommendation.recommendedEngine, 'officer_lane');
});

test('configured registry consumer category can override mortgage-like type name', () => {
  global.LendingFairLoanTypeRegistry = {
    getLoanCategoryForType() {
      return 'consumer';
    },
    getLoanTypes() {
      return [{ name: 'Construction Loan', category: 'consumer' }];
    }
  };

  assert.equal(global.ScenarioEngineRecommendationService.getLoanCategory({ type: 'Construction Loan' }), 'consumer');

  delete global.LendingFairLoanTypeRegistry;
});

test('mortgage loans with role-homogeneous officers keep global with shared-coverage reason', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: [
      { name: 'F1', eligibility: { consumer: true, mortgage: true } },
      { name: 'F2', eligibility: { consumer: true, mortgage: true } }
    ],
    loans: [
      { name: 'L1', type: 'Second Mortgage' }
    ]
  });

  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(
    recommendation.reasons.some((reason) => reason.includes('share the same coverage pattern')),
    true
  );
  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 0, mortgage: 1 });
});

test('unknown custom type with no mortgage keywords defaults to consumer', () => {
  assert.equal(global.ScenarioEngineRecommendationService.getLoanCategory({ type: 'Relationship Builder' }), 'consumer');

  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'global',
    officers: separatedOfficers(),
    loans: [
      { name: 'L1', type: 'Relationship Builder' }
    ]
  });

  assert.deepEqual(recommendation.loanCategoryCounts, { consumer: 1, mortgage: 0 });
});
