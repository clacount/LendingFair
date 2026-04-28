const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessDisplayService.js');
require('../src/services/scenarioEngineRecommendationService.js');

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
  assert.equal(recommendation.matchesCurrent, false);
  assert.equal(recommendation.isActionable, true);
  assert.equal(recommendation.confidence, 'high');
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
  assert.equal(recommendation.matchesCurrent, true);
  assert.equal(recommendation.isActionable, true);
});

test('returns a low-confidence placeholder before enough scenario inputs exist', () => {
  const recommendation = global.ScenarioEngineRecommendationService.buildRecommendation({
    currentEngine: 'officer_lane',
    officers: [{ name: 'F1', eligibility: { consumer: true, mortgage: true } }],
    loans: []
  });

  assert.equal(recommendation.recommendedEngine, 'global');
  assert.equal(recommendation.confidence, 'low');
  assert.equal(recommendation.isActionable, false);
});
