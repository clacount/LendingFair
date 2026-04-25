const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.localStorage = { getItem() { return null; }, setItem() {} };

require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessEngineService.js');

function evalGlobal(officerStats) {
  return global.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers: officerStats.map((entry) => ({ name: entry.officer, eligibility: { consumer: true, mortgage: true } })),
    officerStats
  });
}

test('global fairness passes exactly at 15.0% count and 20.0% dollar thresholds', () => {
  const evaluation = evalGlobal([
    { officer: 'A', totalLoans: 23, totalAmount: 60, consumerLoanCount: 12, consumerAmount: 30, mortgageLoanCount: 11, mortgageAmount: 30, typeBreakdown: { Personal: 12, HELOC: 11 } },
    { officer: 'B', totalLoans: 17, totalAmount: 40, consumerLoanCount: 8, consumerAmount: 20, mortgageLoanCount: 9, mortgageAmount: 20, typeBreakdown: { Personal: 8, HELOC: 9 } }
  ]);

  assert.equal(evaluation.overallResult, 'PASS');
  assert.equal(evaluation.metrics.maxCountVariancePercent, 15);
  assert.equal(evaluation.metrics.maxAmountVariancePercent, 20);
  assert.match(evaluation.summaryItems.join(' | '), /Overall loan variance: 15\.0%/);
  assert.match(evaluation.summaryItems.join(' | '), /Overall dollar variance: 20\.0%/);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'global_dollar_variance');
  assert.equal(evaluation.statusMetricDescriptor?.label, 'Global dollar variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, 20);
  assert.equal(evaluation.statusMetricDescriptor?.contextLabel, 'Global thresholds');
});

test('global fairness flips to REVIEW just above thresholds and handles zero/empty amounts', () => {
  const evaluation = evalGlobal([
    { officer: 'A', totalLoans: 24, totalAmount: 61, consumerLoanCount: 15, consumerAmount: 61, mortgageLoanCount: 9, mortgageAmount: 0, typeBreakdown: { 'Credit Card': 15, HELOC: 9 } },
    { officer: 'B', totalLoans: 16, totalAmount: 39, consumerLoanCount: 7, consumerAmount: 39, mortgageLoanCount: 9, mortgageAmount: 0, typeBreakdown: { 'Credit Card': 7, HELOC: 9 } },
    { officer: 'C', totalLoans: 0, totalAmount: 0, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 0, mortgageAmount: 0, typeBreakdown: {} }
  ]);

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.maxAmountVariancePercent > 20);
  assert.ok(evaluation.notes.some((note) => note.includes('REVIEW')));
});

test('global fairness remains stable for mixed pools and uneven prior totals', () => {
  const evaluation = evalGlobal([
    { officer: 'C1', totalLoans: 40, totalAmount: 420000, consumerLoanCount: 28, consumerAmount: 110000, mortgageLoanCount: 12, mortgageAmount: 310000, typeBreakdown: { Personal: 20, 'Credit Card': 8, HELOC: 7, 'First Mortgage': 5 } },
    { officer: 'M1', totalLoans: 39, totalAmount: 418000, consumerLoanCount: 2, consumerAmount: 5000, mortgageLoanCount: 37, mortgageAmount: 413000, typeBreakdown: { Personal: 2, HELOC: 20, 'First Mortgage': 17 } },
    { officer: 'F1', totalLoans: 41, totalAmount: 421000, consumerLoanCount: 20, consumerAmount: 100000, mortgageLoanCount: 21, mortgageAmount: 321000, typeBreakdown: { Personal: 9, 'Credit Card': 11, HELOC: 9, 'Home Refi': 12 } }
  ]);

  assert.ok(Array.isArray(evaluation.summaryItems));
  assert.equal(evaluation.summaryItems.length, 6);
  assert.equal(evaluation.chartAnnotations.mortgageTitleSuffix, '');
  assert.equal(evaluation.roleAwareFlags.flexParticipationExpected, false);
  assert.ok(Number.isFinite(evaluation.metrics.consumerVariance.maxAmountVariancePercent));
  assert.ok(Number.isFinite(evaluation.metrics.mortgageVariance.maxAmountVariancePercent));
});

test('global fairness uses count variance descriptor when only count threshold fails', () => {
  const evaluation = evalGlobal([
    { officer: 'A', totalLoans: 24, totalAmount: 60, consumerLoanCount: 12, consumerAmount: 30, mortgageLoanCount: 12, mortgageAmount: 30, typeBreakdown: { Personal: 12, HELOC: 12 } },
    { officer: 'B', totalLoans: 16, totalAmount: 40, consumerLoanCount: 8, consumerAmount: 20, mortgageLoanCount: 8, mortgageAmount: 20, typeBreakdown: { Personal: 8, HELOC: 8 } }
  ]);

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.maxAmountVariancePercent <= 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'global_count_variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, evaluation.metrics.maxCountVariancePercent);
});

test('global fairness uses dollar variance descriptor when only dollar threshold fails', () => {
  const evaluation = evalGlobal([
    { officer: 'A', totalLoans: 23, totalAmount: 62, consumerLoanCount: 12, consumerAmount: 31, mortgageLoanCount: 11, mortgageAmount: 31, typeBreakdown: { Personal: 12, HELOC: 11 } },
    { officer: 'B', totalLoans: 17, totalAmount: 38, consumerLoanCount: 8, consumerAmount: 19, mortgageLoanCount: 9, mortgageAmount: 19, typeBreakdown: { Personal: 8, HELOC: 9 } }
  ]);

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.maxCountVariancePercent <= 15);
  assert.ok(evaluation.metrics.maxAmountVariancePercent > 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'global_dollar_variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, evaluation.metrics.maxAmountVariancePercent);
});

test('global fairness uses deterministic combined descriptor when both thresholds fail', () => {
  const evaluation = evalGlobal([
    { officer: 'A', totalLoans: 24, totalAmount: 62, consumerLoanCount: 13, consumerAmount: 31, mortgageLoanCount: 11, mortgageAmount: 31, typeBreakdown: { Personal: 13, HELOC: 11 } },
    { officer: 'B', totalLoans: 16, totalAmount: 38, consumerLoanCount: 7, consumerAmount: 19, mortgageLoanCount: 9, mortgageAmount: 19, typeBreakdown: { Personal: 7, HELOC: 9 } }
  ]);

  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.ok(evaluation.metrics.maxCountVariancePercent > 15);
  assert.ok(evaluation.metrics.maxAmountVariancePercent > 20);
  assert.equal(evaluation.statusMetricDescriptor?.key, 'global_count_and_dollar_variance');
  assert.equal(evaluation.statusMetricDescriptor?.valuePercent, evaluation.metrics.maxCountVariancePercent);
});
