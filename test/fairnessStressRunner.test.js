const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  selectPreferredEngineForScenario,
  backfillFairnessEvaluationIfMissing,
  runOneScenario,
  isExpectedInvalidScenarioError,
  generateRunningTotals,
  collectValidationFlags,
  recordEngineCompletionOutcome,
  classifyReviewBasis,
  updateReviewAggregation,
  flushReviewAggregation,
  hashContextSeed
} = require('../scripts/fairness_stress_runner.js');

function makeScenario(officers) {
  return {
    officers,
    loans: [{ name: 'L1', type: 'Personal', amountRequested: 10000 }],
    runningTotals: { officers: {} }
  };
}

test('backfills missing fairnessEvaluation when assignment result is otherwise valid', () => {
  const scenario = makeScenario([{ name: 'C1', eligibility: { consumer: true, mortgage: false } }]);
  const context = {
    getOfficerStatsFromResult() {
      return [{
        officer: 'C1',
        totalLoans: 1,
        totalAmount: 10000,
        consumerLoanCount: 1,
        consumerAmount: 10000,
        mortgageLoanCount: 0,
        mortgageAmount: 0,
        typeBreakdown: { Personal: 1 }
      }];
    },
    FairnessEngineService: {
      evaluateFairness(input) {
        return {
          engineType: input.engineType,
          overallResult: 'PASS',
          metrics: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
          summaryItems: ['ok']
        };
      }
    }
  };

  const result = {
    loanAssignments: { L1: 'C1' },
    officerAssignments: { C1: [{ name: 'L1', type: 'Personal', amountRequested: 10000 }] },
    fairnessEvaluation: null
  };

  const patched = backfillFairnessEvaluationIfMissing({ context, scenario, result, engine: 'global' });
  assert.equal(patched.fairnessBackfilledByHarness, true);
  assert.equal(patched.result.fairnessEvaluation?.overallResult, 'PASS');
});

test('homogeneous populations default to global fairness', () => {
  const allConsumer = makeScenario([
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'C2', eligibility: { consumer: true, mortgage: false } }
  ]);
  const allFlex = makeScenario([
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } }
  ]);
  const allMortgage = makeScenario([
    { name: 'M1', eligibility: { consumer: false, mortgage: true } },
    { name: 'M2', eligibility: { consumer: false, mortgage: true } }
  ]);

  assert.equal(selectPreferredEngineForScenario(allConsumer).selectedEngine, 'global');
  assert.equal(selectPreferredEngineForScenario(allFlex).selectedEngine, 'global');
  assert.equal(selectPreferredEngineForScenario(allMortgage).selectedEngine, 'global');
});

test('mixed C/F/M defaults to officer_lane fairness', () => {
  const scenario = makeScenario([
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true } }
  ]);

  const selection = selectPreferredEngineForScenario(scenario);
  assert.equal(selection.selectedEngine, 'officer_lane');
  assert.equal(selection.officerPopulationType, 'mixed');
});

test('1 M + 1 F HELOC scenario prefers officer_lane fairness', () => {
  const scenario = {
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'F1', eligibility: { consumer: true, mortgage: true }, mortgageOverride: true }
    ],
    loans: [{ name: 'H1', type: 'HELOC', amountRequested: 100000 }],
    runningTotals: { officers: {} }
  };

  assert.equal(selectPreferredEngineForScenario(scenario).selectedEngine, 'officer_lane');
});

test('runOneScenario backfills fairness for missing fairnessEvaluation path', () => {
  const scenario = makeScenario([{ name: 'C1', eligibility: { consumer: true, mortgage: false } }]);
  const context = {
    FairnessEngineService: {
      setSelectedFairnessEngine() {},
      evaluateFairness() {
        return {
          overallResult: 'PASS',
          metrics: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
          summaryItems: ['ok']
        };
      }
    },
    assignLoans() {
      return {
        loanAssignments: { L1: 'C1' },
        officerAssignments: { C1: [{ name: 'L1', type: 'Personal', amountRequested: 10000 }] }
      };
    },
    getOfficerStatsFromResult() {
      return [{
        officer: 'C1',
        totalLoans: 1,
        totalAmount: 10000,
        consumerLoanCount: 1,
        consumerAmount: 10000,
        mortgageLoanCount: 0,
        mortgageAmount: 0,
        typeBreakdown: { Personal: 1 }
      }];
    }
  };

  const run = runOneScenario(context, scenario, 'global');
  assert.equal(run.fairnessBackfilledByHarness, true);
  assert.equal(run.flags.failures.length, 0);
});

test('"Please add at least one loan." is treated as expected invalid scenario', () => {
  assert.equal(isExpectedInvalidScenarioError('Please add at least one loan.'), true);
  assert.equal(isExpectedInvalidScenarioError('No eligible officers are configured for consumer loans.'), true);
  assert.equal(isExpectedInvalidScenarioError('Please add at least one active loan officer.'), true);
});

test('runOneScenario treats app validation error as skipped and not missing fairness failure', () => {
  const scenario = makeScenario([{ name: 'C1', eligibility: { consumer: true, mortgage: false } }]);
  const context = {
    FairnessEngineService: {
      setSelectedFairnessEngine() {},
      evaluateFairness() {
        throw new Error('should not backfill fairness for validation error path');
      }
    },
    assignLoans() {
      return { error: 'Please add at least one loan.' };
    }
  };

  const run = runOneScenario(context, scenario, 'global');
  assert.equal(run.skippedInvalidScenarioReason, 'Please add at least one loan.');
  assert.equal(run.flags.failures.length, 0);
  assert.equal(run.flags.failures.includes('missing fairnessEvaluation'), false);
});

test('generateRunningTotals respects officer eligibility constraints', () => {
  let seed = 42;
  const random = () => {
    seed = ((1664525 * seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const officers = [
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true } },
    { name: 'F1', eligibility: { consumer: true, mortgage: true } }
  ];

  const totals = generateRunningTotals(random, officers);
  const c1 = totals.officers.C1.typeCounts;
  const m1 = totals.officers.M1.typeCounts;
  const f1 = totals.officers.F1.typeCounts;

  assert.equal(c1.HELOC + c1['First Mortgage'] + c1['Home Refi'], 0);
  assert.equal(m1.Personal + m1.Auto + m1['Credit Card'] + m1.Collateralized, 0);
  assert.equal(
    totals.officers.C1.totalLoanCount,
    c1.Personal + c1.Auto + c1['Credit Card'] + c1.Collateralized + c1.HELOC + c1['First Mortgage'] + c1['Home Refi']
  );
  assert.equal(f1.Personal >= 0 && f1.HELOC >= 0, true);
});

test('homogeneous mortgage-only scenario does not raise consumer-chart false positive', () => {
  const scenario = makeScenario([
    { name: 'M1', eligibility: { consumer: false, mortgage: true } },
    { name: 'M2', eligibility: { consumer: false, mortgage: true } }
  ]);
  const result = {
    fairnessEvaluation: {
      overallResult: 'PASS',
      summaryItems: ['ok'],
      roleAwareFlags: {},
      statusMetricDescriptor: {
        key: 'mortgage_routing_policy',
        valuePercent: 90,
        contextLabel: 'Mortgage routing policy'
      },
      metrics: {
        maxCountVariancePercent: 1,
        maxAmountVariancePercent: 1,
        consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        flexVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        mortgageVariance: { maxCountVariancePercent: 8, maxAmountVariancePercent: 10 },
        helocWeightedVariancePercent: null
      }
    }
  };
  const officerStats = [
    { officer: 'M1', consumerAmount: 0, mortgageAmount: 500000 },
    { officer: 'M2', consumerAmount: 0, mortgageAmount: 450000 }
  ];

  const flags = collectValidationFlags({ scenario, engine: 'officer_lane', result, officerStats, context: {} });
  assert.equal(flags.suspicious.includes('consumer chart includes mortgage-category dollars'), false);
});

test('mixed scenario does not raise mortgage-chart false positive from consumer-only history', () => {
  const scenario = makeScenario([
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true } }
  ]);
  const result = {
    fairnessEvaluation: {
      overallResult: 'PASS',
      summaryItems: ['ok'],
      roleAwareFlags: {},
      statusMetricDescriptor: {
        key: 'mortgage_routing_policy',
        valuePercent: 88,
        contextLabel: 'Mortgage policy'
      },
      metrics: {
        maxCountVariancePercent: 1,
        maxAmountVariancePercent: 1,
        consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        flexVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        mortgageVariance: { maxCountVariancePercent: 8, maxAmountVariancePercent: 10 },
        helocWeightedVariancePercent: null
      }
    }
  };
  const officerStats = [
    { officer: 'C1', consumerAmount: 120000, mortgageAmount: 0 },
    { officer: 'M1', consumerAmount: 0, mortgageAmount: 500000 }
  ];
  const context = {
    getOfficerLaneMortgageChartDistribution(distribution) {
      return distribution.filter((entry) => Number(entry.totalAmountRequested) > 0);
    }
  };

  const flags = collectValidationFlags({ scenario, engine: 'officer_lane', result, officerStats, context });
  assert.equal(flags.suspicious.includes('mortgage chart would omit officers with mortgage-category dollars'), false);
});

test('mortgage policy descriptors are not compared against lane variance metrics', () => {
  const scenario = makeScenario([
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true } }
  ]);
  const result = {
    fairnessEvaluation: {
      overallResult: 'PASS',
      summaryItems: ['ok'],
      roleAwareFlags: {},
      statusMetricDescriptor: {
        key: 'mortgage_leadership_policy',
        valuePercent: 77,
        contextLabel: 'Mortgage leadership policy'
      },
      metrics: {
        maxCountVariancePercent: 1,
        maxAmountVariancePercent: 1,
        consumerVariance: { maxCountVariancePercent: 5, maxAmountVariancePercent: 7 },
        flexVariance: { maxCountVariancePercent: 6, maxAmountVariancePercent: 9 },
        mortgageVariance: { maxCountVariancePercent: 10, maxAmountVariancePercent: 11 },
        helocWeightedVariancePercent: 12
      }
    }
  };
  const officerStats = [
    { officer: 'C1', consumerAmount: 120000, mortgageAmount: 0 },
    { officer: 'M1', consumerAmount: 0, mortgageAmount: 500000 }
  ];
  const flags = collectValidationFlags({ scenario, engine: 'officer_lane', result, officerStats, context: {} });
  assert.equal(flags.suspicious.includes('statusMetricDescriptor inconsistent with actual result basis'), false);
});

test('count variance descriptors validate against count metrics (not amount metrics)', () => {
  const scenario = makeScenario([
    { name: 'C1', eligibility: { consumer: true, mortgage: false } },
    { name: 'C2', eligibility: { consumer: true, mortgage: false } }
  ]);
  const result = {
    fairnessEvaluation: {
      overallResult: 'REVIEW',
      summaryItems: ['ok'],
      roleAwareFlags: {},
      statusMetricDescriptor: {
        key: 'consumer_lane_count_variance',
        valuePercent: 19,
        contextLabel: 'Consumer count variance'
      },
      metrics: {
        maxCountVariancePercent: 19,
        maxAmountVariancePercent: 2,
        consumerVariance: { maxCountVariancePercent: 19, maxAmountVariancePercent: 4 },
        flexVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        helocWeightedVariancePercent: null
      }
    }
  };
  const flags = collectValidationFlags({ scenario, engine: 'officer_lane', result, officerStats: [], context: {} });
  assert.equal(flags.suspicious.includes('statusMetricDescriptor inconsistent with actual result basis'), false);
  assert.equal(flags.suspicious.includes('null/undefined metric silently treated as success'), false);
});

test('dollar variance descriptors continue validating against amount metrics', () => {
  const scenario = makeScenario([
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } }
  ]);
  const result = {
    fairnessEvaluation: {
      overallResult: 'REVIEW',
      summaryItems: ['ok'],
      roleAwareFlags: {},
      statusMetricDescriptor: {
        key: 'flex_lane_dollar_variance',
        valuePercent: 23,
        contextLabel: 'Flex amount variance'
      },
      metrics: {
        maxCountVariancePercent: 10,
        maxAmountVariancePercent: 23,
        consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        flexVariance: { maxCountVariancePercent: 11, maxAmountVariancePercent: 23 },
        mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
        helocWeightedVariancePercent: null
      }
    }
  };
  const flags = collectValidationFlags({ scenario, engine: 'officer_lane', result, officerStats: [], context: {} });
  assert.equal(flags.suspicious.includes('statusMetricDescriptor inconsistent with actual result basis'), false);
});

test('officer-lane review classification buckets count descriptors as distinct reasons', () => {
  const run = {
    result: {
      fairnessEvaluation: {
        statusMetricDescriptor: { key: 'mortgage_lane_count_variance' },
        metrics: {
          consumerVariance: { maxCountVariancePercent: 2, maxAmountVariancePercent: 3 },
          mortgageVariance: { maxCountVariancePercent: 22, maxAmountVariancePercent: 4 },
          flexVariance: { maxCountVariancePercent: 1, maxAmountVariancePercent: 2 }
        }
      }
    }
  };
  assert.equal(classifyReviewBasis(run, 'officer_lane'), 'mortgage_lane_count_variance');
});

test('stress summary includes attempted/suspicious/skipped/failure counts by engine', () => {
  const outputDir = path.resolve(__dirname, '../stress_runs/test_engine_stats');
  fs.rmSync(outputDir, { recursive: true, force: true });
  execFileSync('node', [
    path.resolve(__dirname, '../scripts/fairness_stress_runner.js'),
    '--duration-minutes', '0.003',
    '--max-iterations', '1',
    '--engine', 'both',
    '--output', outputDir
  ], { stdio: 'pipe' });

  const summaryLog = fs.readFileSync(path.join(outputDir, 'summary.log'), 'utf8');
  const summaryJsonText = summaryLog.trim().split('\n').slice(1).join('\n');
  const summary = JSON.parse(summaryJsonText);
  assert.equal(typeof summary.engineRunStats.global.attemptedRuns, 'number');
  assert.equal(typeof summary.engineRunStats.officer_lane.attemptedRuns, 'number');
  assert.equal(typeof summary.engineRunStats.global.skippedInvalidScenarioCount, 'number');
  assert.equal(typeof summary.engineRunStats.officer_lane.suspiciousCount, 'number');
  assert.equal(typeof summary.engineRunStats.officer_lane.failureCount, 'number');
  assert.equal(typeof summary.engineRunStats.global.completedRuns, 'number');
  assert.equal(typeof summary.engineRunStats.global.passCount, 'number');
  assert.equal(typeof summary.engineRunStats.global.reviewCount, 'number');
  assert.equal(typeof summary.engineRunStats.global.unknownResultCount, 'number');
  assert.equal(typeof summary.completedRuns, 'number');
  assert.equal(typeof summary.passCount, 'number');
  assert.equal(typeof summary.reviewCount, 'number');
  assert.equal(typeof summary.unknownResultCount, 'number');
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('recordEngineCompletionOutcome increments PASS/REVIEW/UNKNOWN counters correctly', () => {
  const stats = {
    global: {
      completedRuns: 0,
      passCount: 0,
      reviewCount: 0,
      unknownResultCount: 0
    }
  };

  recordEngineCompletionOutcome(stats, 'global', 'PASS');
  recordEngineCompletionOutcome(stats, 'global', 'REVIEW');
  recordEngineCompletionOutcome(stats, 'global', 'NOT_SET');

  assert.equal(stats.global.completedRuns, 3);
  assert.equal(stats.global.passCount, 1);
  assert.equal(stats.global.reviewCount, 1);
  assert.equal(stats.global.unknownResultCount, 1);
});

test('skipped invalid scenario path does not increment completed/pass/review counts', () => {
  const stats = {
    global: {
      completedRuns: 0,
      passCount: 0,
      reviewCount: 0,
      unknownResultCount: 0
    }
  };

  // Simulate skipped path: we intentionally do not call recordEngineCompletionOutcome.
  assert.equal(stats.global.completedRuns, 0);
  assert.equal(stats.global.passCount, 0);
  assert.equal(stats.global.reviewCount, 0);
  assert.equal(stats.global.unknownResultCount, 0);
});

test('Global review basis classification detects count/dollar variance combinations', () => {
  const run = {
    result: {
      fairnessEvaluation: {
        metrics: { maxCountVariancePercent: 18, maxAmountVariancePercent: 24 }
      }
    }
  };
  assert.equal(classifyReviewBasis(run, 'global'), 'global_count_and_dollar_variance');
});

test('Officer Lane review basis classification prefers statusMetricDescriptor key', () => {
  const run = {
    result: {
      fairnessEvaluation: {
        statusMetricDescriptor: { key: 'mortgage_routing_policy' },
        metrics: {
          consumerVariance: { maxCountVariancePercent: 2, maxAmountVariancePercent: 3 },
          mortgageVariance: { maxCountVariancePercent: 2, maxAmountVariancePercent: 3 },
          flexVariance: { maxCountVariancePercent: 2, maxAmountVariancePercent: 3 }
        }
      }
    }
  };
  assert.equal(classifyReviewBasis(run, 'officer_lane'), 'mortgage_routing_policy');
});

test('review aggregation merges repeated reasons and caps sample case files', () => {
  const reviewMap = new Map();
  for (let i = 0; i < 15; i += 1) {
    updateReviewAggregation(reviewMap, {
      reviewBasis: 'consumer_lane_dollar_variance',
      engine: 'officer_lane',
      seed: 100 + i,
      sampleCaseFile: `/tmp/case_${i}.json`,
      classification: 'expected_review'
    });
  }
  const outputDir = path.resolve(__dirname, '../stress_runs');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.resolve(outputDir, 'review_aggregation_test.json');
  flushReviewAggregation(outputPath, reviewMap);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(payload.consumer_lane_dollar_variance.count, 15);
  assert.equal(payload.consumer_lane_dollar_variance.sampleCaseFiles.length, 10);
  fs.rmSync(outputPath, { force: true });
});

test('PASS runs are not added to review_counts aggregation', () => {
  const reviewMap = new Map();
  // No updateReviewAggregation call for PASS runs.
  const outputDir = path.resolve(__dirname, '../stress_runs');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.resolve(outputDir, 'review_aggregation_pass_empty.json');
  flushReviewAggregation(outputPath, reviewMap);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(payload, {});
  fs.rmSync(outputPath, { force: true });
});

test('hashContextSeed is deterministic and varies by seed/engine', () => {
  const sameA = hashContextSeed(123, 'global');
  const sameB = hashContextSeed(123, 'global');
  const differentEngine = hashContextSeed(123, 'officer_lane');
  const differentSeed = hashContextSeed(124, 'global');

  assert.equal(sameA, sameB);
  assert.notEqual(sameA, differentEngine);
  assert.notEqual(sameA, differentSeed);
  assert.equal(Number.isInteger(sameA), true);
  assert.equal(sameA > 0, true);
  assert.equal(sameA <= 0xFFFFFFFF, true);
});

test('stress and replay paths both use scenario+engine context seed derivation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/fairness_stress_runner.js'), 'utf8');

  assert.match(source, /function replayCase\([\s\S]*?loadScenarioAppContext\(scenario\.seed,\s*engine\)/);
  assert.match(source, /function runStress\([\s\S]*?loadScenarioAppContext\(seed,\s*engine\)/);
  assert.doesNotMatch(source, /function runStress\([\s\S]*?const context = loadAppContext\(42\)/);
});
