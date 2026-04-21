const test = require('node:test');
const assert = require('node:assert/strict');

const { optimizeConsumerLaneAssignments, REVIEW_THRESHOLD_PERCENT } = require('../src/services/officerLaneOptimizationService.js');

function evaluateConsumerVariance(loanToOfficerMap, officers) {
  const totals = Object.fromEntries(officers.map((officer) => [officer, 0]));
  for (const [loan, officer] of loanToOfficerMap.entries()) {
    totals[officer] += Number(loan.amountRequested) || 0;
  }

  const values = Object.values(totals);
  const total = values.reduce((sum, value) => sum + value, 0);
  const spread = total ? ((Math.max(...values) - Math.min(...values)) / total) * 100 : 0;

  return {
    overallResult: spread <= REVIEW_THRESHOLD_PERCENT ? 'PASS' : 'REVIEW',
    metrics: {
      consumerVariance: {
        maxAmountVariancePercent: spread
      },
      maxAmountVariancePercent: spread
    }
  };
}

test('bounded optimization reassigns consumer loans among consumer-only officers and improves variance', () => {
  const consumerOfficers = ['Consumer A', 'Consumer B'];
  const mortgageOfficer = 'Mortgage Only';

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

  assert.equal(result.improved, true);
  assert.ok(result.initialVariancePercent > REVIEW_THRESHOLD_PERCENT);
  assert.ok(result.finalVariancePercent <= REVIEW_THRESHOLD_PERCENT);

  const assignedOfficers = new Set([...result.bestLoanToOfficerMap.values()]);
  assert.equal(assignedOfficers.has(mortgageOfficer), false);
});
