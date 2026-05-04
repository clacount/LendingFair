const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../src/services/fairnessReviewService.js');

test('selectBestFairnessAttempt prefers PASS over REVIEW', () => {
  const { selectedAttempt } = global.FairnessReviewService.selectBestFairnessAttempt([
    { attemptNumber: 1, status: 'REVIEW', metrics: { maxCountVariancePercent: 3, maxAmountVariancePercent: 3 } },
    { attemptNumber: 2, status: 'PASS', metrics: { maxCountVariancePercent: 20, maxAmountVariancePercent: 20 } }
  ]);
  assert.equal(selectedAttempt.attemptNumber, 2);
});

test('resolveSelectedAttempt unwraps browser selection payload', () => {
  const fallbackAttempt = { attemptNumber: 1, status: 'REVIEW' };
  const passAttempt = { attemptNumber: 2, status: 'PASS' };
  const selection = { selectedAttempt: passAttempt, reason: 'best_available_score' };

  assert.equal(global.FairnessReviewService.resolveSelectedAttempt(selection, fallbackAttempt), passAttempt);
});

test('resolveSelectedAttempt accepts direct attempt shape', () => {
  const fallbackAttempt = { attemptNumber: 1, status: 'REVIEW' };
  const advisoryAttempt = { attemptNumber: 3, status: 'ADVISORY', result: {} };

  assert.equal(global.FairnessReviewService.resolveSelectedAttempt(advisoryAttempt, fallbackAttempt), advisoryAttempt);
});

test('selectBestFairnessAttempt chooses lower variance among PASS attempts', () => {
  const { selectedAttempt } = global.FairnessReviewService.selectBestFairnessAttempt([
    { attemptNumber: 1, status: 'PASS', metrics: { maxCountVariancePercent: 9, maxAmountVariancePercent: 9 } },
    { attemptNumber: 2, status: 'PASS', metrics: { maxCountVariancePercent: 2, maxAmountVariancePercent: 2 } }
  ]);
  assert.equal(selectedAttempt.attemptNumber, 2);
});

test('selectBestFairnessAttempt chooses lower variance among REVIEW attempts when no PASS exists', () => {
  const { selectedAttempt } = global.FairnessReviewService.selectBestFairnessAttempt([
    { attemptNumber: 1, status: 'REVIEW', metrics: { maxCountVariancePercent: 12, maxAmountVariancePercent: 12 } },
    { attemptNumber: 2, status: 'REVIEW', metrics: { maxCountVariancePercent: 5, maxAmountVariancePercent: 5 } }
  ]);
  assert.equal(selectedAttempt.attemptNumber, 2);
});

test('selectBestFairnessAttempt handles missing metrics safely', () => {
  const response = global.FairnessReviewService.selectBestFairnessAttempt([
    { attemptNumber: 1, status: 'REVIEW', metrics: {} },
    { attemptNumber: 2, status: 'REVIEW', metrics: {} }
  ]);
  assert.equal(response.selectedAttempt.attemptNumber, 1);
  assert.equal(response.reason, 'no_comparable_metrics');
});

test('attempt cap constant is set to 5 total attempts', () => {
  assert.equal(global.FairnessReviewService.FAIRNESS_REVIEW_MAX_ATTEMPTS, 5);
});
