const test = require('node:test');
const assert = require('node:assert/strict');

const { optimizeConsumerLaneAssignments } = require('../src/services/officerLaneOptimizationService.js');

function buildLoan(name, type, amountRequested) {
  return { name, type, amountRequested };
}

test('optimizer skips when baseline is under threshold unless forceOptimizationRun is set', () => {
  const loan = buildLoan('L1', 'Personal', 1000);
  const initialMap = new Map([[loan, 'A']]);
  const eligible = new Map([[loan, ['A', 'B']]]);
  const evaluateCandidate = () => ({ metrics: { consumerVariance: { maxAmountVariancePercent: 19.9 }, maxAmountVariancePercent: 19.9 } });

  const skipped = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan: eligible,
    evaluateCandidate,
    isConsumerLoan: () => true
  });
  assert.equal(skipped.optimizationRan, false);
  assert.equal(skipped.finalVariancePercent, 19.9);

  const forced = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan: eligible,
    evaluateCandidate,
    isConsumerLoan: () => true,
    forceOptimizationRun: true
  });
  assert.equal(forced.optimizationRan, true);
  assert.ok(forced.evaluations >= 1);
});

test('optimizer baseline over threshold but not improvable reports selected baseline and correct summary', () => {
  const l1 = buildLoan('L1', 'Personal', 1000);
  const initialMap = new Map([[l1, 'A']]);
  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan: new Map([[l1, ['A']]]),
    evaluateCandidate: () => ({ metrics: { consumerVariance: { maxAmountVariancePercent: 32 }, maxAmountVariancePercent: 32 } }),
    isConsumerLoan: () => true
  });

  assert.equal(result.improved, false);
  assert.equal(result.tierReached, 'best_available_over_25');
  assert.equal(result.summaryMessage, 'Initial assignment remained the selected result after bounded optimization review.');
});

test('optimizer uses provided target metric selector and never coerces missing metric to success', () => {
  const l1 = buildLoan('L1', 'HELOC', 50000);
  const l2 = buildLoan('L2', 'HELOC', 40000);
  const initialMap = new Map([[l1, 'M1'], [l2, 'F1']]);
  const eligible = new Map([[l1, ['M1', 'F1']], [l2, ['M1', 'F1']]]);

  let call = 0;
  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan: eligible,
    isConsumerLoan: () => true,
    getVariancePercent: (fairness) => fairness.metrics.helocWeightedVariancePercent,
    evaluateCandidate: () => {
      call += 1;
      return call === 1
        ? { metrics: { helocWeightedVariancePercent: undefined, maxAmountVariancePercent: 5 } }
        : { metrics: { helocWeightedVariancePercent: 22, maxAmountVariancePercent: 30 } };
    },
    forceOptimizationRun: true,
    targetLabel: 'weighted HELOC variance'
  });

  assert.equal(result.initialVariancePercent, Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(result.finalVariancePercent));
  assert.equal(result.tierReached, 'under_25');
  assert.match(result.summaryMessage, /weighted HELOC variance advisory band/i);
});
