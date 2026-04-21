const test = require('node:test');
const assert = require('node:assert/strict');

const {
  optimizeConsumerLaneAssignments,
  PRIMARY_TARGET_PERCENT,
  ADVISORY_TARGET_PERCENT
} = require('../src/services/officerLaneOptimizationService.js');

function evaluateConsumerVariance(loanToOfficerMap, officers) {
  const totals = Object.fromEntries(officers.map((officer) => [officer, 0]));
  for (const [loan, officer] of loanToOfficerMap.entries()) {
    totals[officer] += Number(loan.amountRequested) || 0;
  }

  const values = Object.values(totals);
  const total = values.reduce((sum, value) => sum + value, 0);
  const spread = total ? ((Math.max(...values) - Math.min(...values)) / total) * 100 : 0;

  return {
    overallResult: spread <= ADVISORY_TARGET_PERCENT ? 'PASS' : 'REVIEW',
    metrics: {
      consumerVariance: {
        maxAmountVariancePercent: spread
      },
      maxAmountVariancePercent: spread
    }
  };
}

test('optimizer runs at >=20% and can reach the primary <=20% tier', () => {
  const consumerOfficers = ['Consumer A', 'Consumer B'];
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 100 },
    { name: 'L2', type: 'Personal', amountRequested: 100 },
    { name: 'L3', type: 'Auto', amountRequested: 100 },
    { name: 'L4', type: 'Auto', amountRequested: 100 }
  ];

  const initialMap = new Map(loans.map((loan) => [loan, consumerOfficers[0]]));
  const eligibleOfficersByLoan = new Map(loans.map((loan) => [loan, [...consumerOfficers]]));

  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan,
    isConsumerLoan: () => true,
    shouldIncludeLoan: (loan) => loan.amountRequested > 0,
    maxEvaluations: 120,
    evaluateCandidate: (candidateMap) => evaluateConsumerVariance(candidateMap, consumerOfficers)
  });

  assert.equal(result.optimizationRan, true);
  assert.ok(result.initialVariancePercent >= PRIMARY_TARGET_PERCENT);
  assert.ok(result.finalVariancePercent <= PRIMARY_TARGET_PERCENT);
  assert.equal(result.tierReached, 'under_20');
});

test('optimizer prefers advisory-band result when <=20% is not reachable', () => {
  const consumerOfficers = ['Consumer A', 'Consumer B', 'Consumer C'];
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 60 },
    { name: 'L2', type: 'Personal', amountRequested: 40 },
    { name: 'L3', type: 'Auto', amountRequested: 30 }
  ];

  const initialMap = new Map([
    [loans[0], 'Consumer A'],
    [loans[1], 'Consumer A'],
    [loans[2], 'Consumer A']
  ]);
  const eligibleOfficersByLoan = new Map(loans.map((loan) => [loan, [...consumerOfficers]]));

  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan,
    isConsumerLoan: () => true,
    shouldIncludeLoan: (loan) => loan.amountRequested > 0,
    maxEvaluations: 120,
    evaluateCandidate: (candidateMap) => evaluateConsumerVariance(candidateMap, consumerOfficers)
  });

  assert.equal(result.optimizationRan, true);
  assert.ok(result.finalVariancePercent > PRIMARY_TARGET_PERCENT);
  assert.ok(result.finalVariancePercent <= ADVISORY_TARGET_PERCENT);
  assert.equal(result.tierReached, 'under_25');
  assert.match(result.summaryMessage, /advisory band/i);
});

test('over-25 fallback includes the required most-optimized message', () => {
  const consumerOfficers = ['Consumer A', 'Consumer B'];
  const mortgageOfficer = 'Mortgage Only';
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 100 },
    { name: 'L2', type: 'Auto', amountRequested: 30 }
  ];

  const initialMap = new Map([
    [loans[0], 'Consumer A'],
    [loans[1], 'Consumer A']
  ]);
  const eligibleOfficersByLoan = new Map(loans.map((loan) => [loan, [...consumerOfficers]]));

  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan,
    isConsumerLoan: () => true,
    shouldIncludeLoan: (loan) => loan.amountRequested > 0,
    maxEvaluations: 80,
    evaluateCandidate: (candidateMap) => evaluateConsumerVariance(candidateMap, consumerOfficers)
  });

  assert.equal(result.tierReached, 'best_available_over_25');
  assert.equal(result.summaryMessage, 'This is the most optimized result achievable from the available loan distribution.');

  const assignedOfficers = new Set([...result.bestLoanToOfficerMap.values()]);
  assert.equal(assignedOfficers.has(mortgageOfficer), false);
});

test('optimizer applies tie-break improvements when consumer variance is unchanged', () => {
  const consumerOfficers = ['Consumer A', 'Consumer B'];
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 100 }
  ];

  const initialMap = new Map([[loans[0], 'Consumer A']]);
  const eligibleOfficersByLoan = new Map([[loans[0], [...consumerOfficers]]]);

  const result = optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap: initialMap,
    eligibleOfficersByLoan,
    isConsumerLoan: () => true,
    shouldIncludeLoan: () => true,
    maxEvaluations: 25,
    evaluateCandidate: (candidateMap) => {
      const assignedOfficer = candidateMap.get(loans[0]);
      return {
        metrics: {
          consumerVariance: {
            maxAmountVariancePercent: 30
          },
          maxAmountVariancePercent: assignedOfficer === 'Consumer B' ? 10 : 15
        }
      };
    }
  });

  assert.equal(result.optimizationRan, true);
  assert.equal(result.improved, true);
  assert.equal(result.bestLoanToOfficerMap.get(loans[0]), 'Consumer B');
  assert.equal(result.finalVariancePercent, result.initialVariancePercent);
});
