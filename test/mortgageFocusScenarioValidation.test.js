const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeSeededRandom(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeElement() {
  const element = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    append() {},
    appendChild() {},
    replaceChildren() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getContext() { return {}; },
    focus() {},
    click() {},
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    disabled: false,
    open: false
  };

  return new Proxy(element, {
    get(target, property) {
      return property in target ? target[property] : undefined;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

function loadAppContext() {
  const localStorageStore = {};
  const seededMath = Object.create(Math);
  seededMath.random = makeSeededRandom(42);

  const documentStub = {
    getElementById() { return makeElement(); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {},
    body: makeElement()
  };

  const context = {
    console,
    window: null,
    document: documentStub,
    localStorage: {
      getItem(key) { return localStorageStore[key] ?? null; },
      setItem(key, value) { localStorageStore[key] = String(value); }
    },
    setTimeout,
    clearTimeout,
    Math: seededMath,
    Date,
    JSON,
    Map,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Promise,
    Error,
    parseFloat,
    parseInt,
    isNaN,
    Intl,
    location: { hostname: 'localhost' },
    confirm: () => false,
    prompt: () => null,
    alert: () => {}
  };

  context.window = context;
  context.global = context;

  vm.createContext(context);

  const root = path.resolve(__dirname, '..');
  [
    'src/utils/loanCategoryUtils.js',
    'src/services/fairnessEngines/globalFairnessEngine.js',
    'src/services/fairnessEngines/officerLaneFairnessEngine.js',
    'src/services/fairnessEngineService.js',
    'src/services/focusWeightSettingsService.js',
    'src/services/mortgageFocusRoutingService.js',
    'src/services/officerLaneOptimizationService.js',
    'src/bootstrap/initApp.js'
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
  });

  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  return context;
}

function summarizeAssignments(result) {
  return Object.fromEntries(Object.entries(result.officerAssignments).map(([officer, loans]) => {
    const amountTotal = loans.reduce((sum, loan) => (
      sum + (loan.type === 'Credit Card' ? 0 : Number(loan.amountRequested || 0))
    ), 0);
    const typeBreakdown = Object.fromEntries(loans.reduce((map, loan) => {
      map.set(loan.type, (map.get(loan.type) || 0) + 1);
      return map;
    }, new Map()));
    return [officer, { count: loans.length, amountTotal, typeBreakdown }];
  }));
}

function getOptimizationStatus(result) {
  return {
    ran: Boolean(result.optimizationApplied),
    tier: String(result.optimizationTierReached || ''),
    finalVariance: Number(result.optimizationFinalConsumerDollarVariance || 0),
    message: String(result.optimizationSummaryMessage || '')
  };
}

test('Scenario 1 HELOC-only: meaningful M/flex participation with bounded fairness outcome', () => {
  const context = loadAppContext();
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, weights: { consumer: 0, mortgage: 1 } }
  ];
  const loans = Array.from({ length: 8 }, (_, index) => ({
    name: `H${index + 1}`,
    type: 'HELOC',
    amountRequested: 100000
  }));

  const result = context.assignLoans(officers, loans, { officers: {} });
  const assignmentSummary = summarizeAssignments(result);

  assert.equal(assignmentSummary.M1.count > 0, true);
  assert.equal(assignmentSummary.F1.count + assignmentSummary.F2.count + assignmentSummary.F3.count > 0, true);
  assert.equal(assignmentSummary.M1.count < 8, true);
  assert.equal(assignmentSummary.F1.count + assignmentSummary.F2.count + assignmentSummary.F3.count + assignmentSummary.M1.count, 8);

  const flexVariance = result.fairnessEvaluation.metrics.flexVariance;
  assert.equal(Number.isFinite(flexVariance.maxCountVariancePercent), true);
  assert.equal(Number.isFinite(flexVariance.maxAmountVariancePercent), true);

  const strictPass = flexVariance.maxCountVariancePercent <= 15 && flexVariance.maxAmountVariancePercent <= 20;
  const advisoryPass = flexVariance.maxCountVariancePercent <= 25 && flexVariance.maxAmountVariancePercent <= 25;
  const optimization = getOptimizationStatus(result);

  assert.equal(optimization.ran, true);
  assert.equal(strictPass || advisoryPass || optimization.tier === 'best_available_over_25', true);

  const weightedVariance = Number(result.optimizationFinalHelocWeightedVariancePercent);
  assert.equal(Number.isFinite(weightedVariance), true);
  const summaryText = (result.fairnessEvaluation?.summaryItems || []).join(' | ');
  assert.equal(summaryText.includes('Weighted HELOC optimization variance: n/a%'), false);
  assert.equal(summaryText.includes(`Weighted HELOC optimization variance: ${weightedVariance.toFixed(1)}%`), true);
  assert.equal(result.fairnessEvaluation?.overallResult, 'PASS');

  assert.equal(result.fairnessEvaluation?.roleAwareFlags?.helocOnlySupportThresholdsApplied, true);
});

test('Scenario 1b HELOC-only with one flex and one mortgage-only uses shared support logic end-to-end', () => {
  const context = loadAppContext();
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, weights: { consumer: 0, mortgage: 1 } }
  ];
  const loans = Array.from({ length: 4 }, (_, index) => ({
    name: `H1b-${index + 1}`,
    type: 'HELOC',
    amountRequested: 100000
  }));

  const result = context.assignLoans(officers, loans, { officers: {} });
  const weightedVariance = Number(result.optimizationFinalHelocWeightedVariancePercent);
  const summaryText = (result.fairnessEvaluation?.summaryItems || []).join(' | ');

  assert.equal(Number.isFinite(weightedVariance), true);
  assert.equal(result.fairnessEvaluation?.roleAwareFlags?.helocOnlySupportThresholdsApplied, true);
  assert.equal(result.fairnessEvaluation?.statusMetricDescriptor?.key, 'heloc_weighted_variance');
  assert.equal(result.fairnessEvaluation?.metrics?.helocWeightedVariancePercent, weightedVariance);
  assert.equal(summaryText.includes('Weighted HELOC optimization variance: n/a%'), false);
  assert.equal(summaryText.includes(`Weighted HELOC optimization variance: ${weightedVariance.toFixed(1)}%`), true);
  assert.equal(result.fairnessEvaluation?.overallResult, 'PASS');
});

test('Scenario 2 mixed pool: consumer-first flex behavior with M-led mortgage routing', () => {
  const context = loadAppContext();
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, weights: { consumer: 0, mortgage: 1 } }
  ];
  const loans = [
    { name: 'H1', type: 'HELOC', amountRequested: 120000 },
    { name: 'H2', type: 'HELOC', amountRequested: 90000 },
    { name: 'R1', type: 'Home Refi', amountRequested: 180000 },
    { name: 'R2', type: 'Home Refi', amountRequested: 160000 },
    { name: 'FM1', type: 'First Mortgage', amountRequested: 240000 },
    { name: 'FM2', type: 'First Mortgage', amountRequested: 210000 },
    { name: 'P1', type: 'Personal', amountRequested: 18000 },
    { name: 'P2', type: 'Personal', amountRequested: 15000 },
    { name: 'CC1', type: 'Credit Card', amountRequested: 5000 }
  ];

  const result = context.assignLoans(officers, loans, { officers: {} });
  const assignmentSummary = summarizeAssignments(result);

  const mFullMortgageCount = (assignmentSummary.M1.typeBreakdown['Home Refi'] || 0)
    + (assignmentSummary.M1.typeBreakdown['First Mortgage'] || 0);
  assert.equal(mFullMortgageCount >= 3, true);

  const flexConsumerCount = ['F1', 'F2', 'F3'].reduce((sum, officer) => (
    sum + (assignmentSummary[officer].typeBreakdown.Personal || 0)
    + (assignmentSummary[officer].typeBreakdown['Credit Card'] || 0)
  ), 0);
  assert.equal(flexConsumerCount >= 2, true);

  const helocToFlexCount = ['F1', 'F2', 'F3'].reduce((sum, officer) => (
    sum + (assignmentSummary[officer].typeBreakdown.HELOC || 0)
  ), 0);
  const optimization = getOptimizationStatus(result);
  assert.equal((assignmentSummary.M1.typeBreakdown.HELOC || 0) + helocToFlexCount, 2);

  const flexVariance = result.fairnessEvaluation.metrics.flexVariance;
  assert.equal(Number.isFinite(flexVariance.maxCountVariancePercent), true);
  assert.equal(Number.isFinite(flexVariance.maxAmountVariancePercent), true);

  const strictPass = flexVariance.maxCountVariancePercent <= 15 && flexVariance.maxAmountVariancePercent <= 20;
  const advisoryPass = flexVariance.maxCountVariancePercent <= 25 && flexVariance.maxAmountVariancePercent <= 25;
  assert.equal(optimization.ran, true);
  assert.equal(strictPass || advisoryPass || optimization.tier === 'best_available_over_25', true);
  assert.equal(Boolean(result.fairnessEvaluation?.roleAwareFlags?.helocOnlySupportThresholdsApplied), false);
});

test('Scenario 3 override-enabled flex participates in full mortgage competition while non-override flex is excluded', () => {
  const context = loadAppContext();
  const officers = [
    { name: 'F_override', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 }, mortgageOverride: true },
    { name: 'F_no1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 }, mortgageOverride: false },
    { name: 'F_no2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 }, mortgageOverride: false },
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, weights: { consumer: 0, mortgage: 1 } }
  ];
  const loans = [
    { name: 'H1', type: 'HELOC', amountRequested: 100000 },
    { name: 'FM1', type: 'First Mortgage', amountRequested: 220000 },
    { name: 'R1', type: 'Home Refi', amountRequested: 180000 },
    { name: 'FM2', type: 'First Mortgage', amountRequested: 200000 }
  ];

  const result = context.assignLoans(officers, loans, { officers: {} });

  const fullMortgageEntries = result.fairnessAudit.filter((entry) => (
    entry.loan.type === 'First Mortgage' || entry.loan.type === 'Home Refi'
  ));
  assert.equal(fullMortgageEntries.length > 0, true);

  const overrideConsidered = fullMortgageEntries.every((entry) => (
    entry.scoredOfficers.some((candidate) => candidate.officer === 'F_override')
  ));
  const nonOverrideExcluded = fullMortgageEntries.every((entry) => (
    !entry.scoredOfficers.some((candidate) => candidate.officer === 'F_no1' || candidate.officer === 'F_no2')
  ));

  assert.equal(overrideConsidered, true);
  assert.equal(nonOverrideExcluded, true);

  const flexVariance = result.fairnessEvaluation.metrics.flexVariance;
  assert.equal(Number.isFinite(flexVariance.maxCountVariancePercent), true);
  assert.equal(Number.isFinite(flexVariance.maxAmountVariancePercent), true);

  const strictPass = flexVariance.maxCountVariancePercent <= 15 && flexVariance.maxAmountVariancePercent <= 20;
  const advisoryPass = flexVariance.maxCountVariancePercent <= 25 && flexVariance.maxAmountVariancePercent <= 25;
  const optimization = getOptimizationStatus(result);
  assert.equal(optimization.ran, true);
  assert.equal(strictPass || advisoryPass || optimization.tier === 'best_available_over_25', true);
});
