const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;

global.FairnessEngineService = {
  FAIRNESS_ENGINES: { GLOBAL: 'global', OFFICER_LANE: 'officer_lane' },
  FAIRNESS_ENGINE_LABELS: {
    global: 'Global Fairness',
    officer_lane: 'Officer Lane Fairness'
  }
};

require('../src/services/fairnessDisplayService.js');

test('officer-lane methodology copy clarifies chart-share vs variance distinction', () => {
  const thresholdCopy = global.FairnessDisplayService.buildFairnessThresholdCopy('officer_lane');
  const methodologyCopy = global.FairnessDisplayService.buildFairnessMethodologyCopy('officer_lane');

  assert.match(thresholdCopy, /composition views/i);
  assert.match(methodologyCopy, /calculated separately from chart share percentages/i);
});
