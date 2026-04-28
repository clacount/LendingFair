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

function loadAppContext(seed = 42) {
  const localStorageStore = {};
  const seededMath = Object.create(Math);
  seededMath.random = makeSeededRandom(seed);

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

  context.FairnessEngineService.setSelectedFairnessEngine('global');
  return context;
}

test('vacationed officer receives no assignment while active officers continue to receive loans', () => {
  const context = loadAppContext(7);
  const officers = [
    { name: 'A1', eligibility: { consumer: true, mortgage: false }, isOnVacation: false },
    { name: 'A2', eligibility: { consumer: true, mortgage: false }, isOnVacation: false },
    { name: 'V1', eligibility: { consumer: true, mortgage: false }, isOnVacation: true }
  ];
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 20000 },
    { name: 'L2', type: 'Auto', amountRequested: 25000 },
    { name: 'L3', type: 'Collateralized', amountRequested: 18000 }
  ];
  const runningTotals = {
    officers: {
      A1: { loanCount: 2, totalAmountRequested: 20000, activeSessionCount: 2, typeCounts: {} },
      A2: { loanCount: 2, totalAmountRequested: 30000, activeSessionCount: 2, typeCounts: {} },
      V1: { loanCount: 9, totalAmountRequested: 90000, activeSessionCount: 9, typeCounts: { Personal: 9 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.error, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(result.officerAssignments, 'V1'), true);
  assert.equal(result.officerAssignments.V1.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(result.runningTotalsUsed, 'V1'), true);
  assert.equal(
    Object.values(result.officerAssignments).reduce((sum, assigned) => sum + assigned.length, 0),
    result.loanAssignments.length
  );
});

test('officer-lane assignment keeps vacationed officer context without counting vacationed officers in active fairness denominators', () => {
  const context = loadAppContext(29);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, isOnVacation: true },
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, isOnVacation: false },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, isOnVacation: false }
  ];
  const loans = [
    { name: 'H1', type: 'HELOC', amountRequested: 150000 },
    { name: 'H2', type: 'HELOC', amountRequested: 150000 },
    { name: 'H3', type: 'HELOC', amountRequested: 150000 },
    { name: 'H4', type: 'HELOC', amountRequested: 150000 }
  ];
  const runningTotals = {
    officers: {
      M1: { loanCount: 12, totalAmountRequested: 900000, activeSessionCount: 9, typeCounts: { HELOC: 12 } },
      F1: { loanCount: 1, totalAmountRequested: 150000, activeSessionCount: 3, typeCounts: { HELOC: 1 } },
      F2: { loanCount: 1, totalAmountRequested: 150000, activeSessionCount: 3, typeCounts: { HELOC: 1 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.error, undefined);
  assert.equal(result.officerAssignments.M1.length, 0);
  assert.ok(result.loanAssignments.every((entry) => entry.officers?.[0] !== 'M1'));
  assert.deepEqual(result.officersUsed.map((officer) => officer.name).sort(), ['F1', 'F2', 'M1']);
  assert.ok(result.runningTotalsUsed.M1);

  const statsByOfficer = Object.fromEntries(context.getOfficerStatsFromResult(result).map((entry) => [entry.officer, entry]));
  assert.equal(statsByOfficer.M1.totalLoans, 12);
  assert.equal(statsByOfficer.M1.mortgageAmount, 900000);

  assert.equal(result.fairnessEvaluation.roleAwareFlags.helocOnlySupportThresholdsApplied, false);
  assert.equal(result.fairnessEvaluation.metrics.averageLoanCount, 3);
  assert.equal(result.fairnessEvaluation.metrics.averageDollarAmount, 450000);
  assert.equal(result.fairnessEvaluation.metrics.flexVariance.officerCount, 2);
  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
});

test('all-vacation scenario returns clear active-officer validation error', () => {
  const context = loadAppContext(11);
  const officers = [
    { name: 'V1', eligibility: { consumer: true, mortgage: false }, isOnVacation: true },
    { name: 'V2', eligibility: { consumer: true, mortgage: false }, isOnVacation: true }
  ];
  const loans = [{ name: 'L1', type: 'Personal', amountRequested: 5000 }];

  const result = context.assignLoans(officers, loans, { officers: {} });
  assert.equal(result.error, 'Please add at least one active loan officer.');
});

test('fairness denominator excludes vacationed officers from active variance calculations', () => {
  const context = loadAppContext(19);
  const evaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers: [
      { name: 'A1', eligibility: { consumer: true, mortgage: true }, isOnVacation: false },
      { name: 'V1', eligibility: { consumer: true, mortgage: true }, isOnVacation: true }
    ],
    officerStats: [
      {
        officer: 'A1',
        totalLoans: 10,
        totalAmount: 100000,
        consumerLoanCount: 8,
        consumerAmount: 60000,
        mortgageLoanCount: 2,
        mortgageAmount: 40000,
        typeBreakdown: { Personal: 8, HELOC: 2 }
      },
      {
        officer: 'V1',
        totalLoans: 0,
        totalAmount: 0,
        consumerLoanCount: 0,
        consumerAmount: 0,
        mortgageLoanCount: 0,
        mortgageAmount: 0,
        typeBreakdown: {}
      }
    ]
  });

  assert.equal(evaluation.metrics.averageLoanCount, 10);
  assert.equal(evaluation.metrics.averageDollarAmount, 100000);
  assert.equal(evaluation.metrics.maxCountVariancePercent, 0);
  assert.equal(evaluation.metrics.maxAmountVariancePercent, 0);
});

test('non-vacation assignment behavior is unchanged versus default officer config', () => {
  const officersWithoutVacationFlag = [
    { name: 'O1', eligibility: { consumer: true, mortgage: false } },
    { name: 'O2', eligibility: { consumer: true, mortgage: false } }
  ];
  const officersExplicitlyActive = [
    { name: 'O1', eligibility: { consumer: true, mortgage: false }, isOnVacation: false },
    { name: 'O2', eligibility: { consumer: true, mortgage: false }, isOnVacation: false }
  ];
  const loans = [
    { name: 'L1', type: 'Personal', amountRequested: 10000 },
    { name: 'L2', type: 'Auto', amountRequested: 12000 },
    { name: 'L3', type: 'Collateralized', amountRequested: 15000 },
    { name: 'L4', type: 'Credit Card', amountRequested: 3000 }
  ];
  const runningTotals = { officers: { O1: { activeSessionCount: 1 }, O2: { activeSessionCount: 1 } } };

  const baselineContext = loadAppContext(31);
  const explicitContext = loadAppContext(31);
  const baselineResult = baselineContext.assignLoans(officersWithoutVacationFlag, loans, runningTotals);
  const explicitResult = explicitContext.assignLoans(officersExplicitlyActive, loans, runningTotals);

  assert.equal(
    JSON.stringify(baselineResult.officerAssignments),
    JSON.stringify(explicitResult.officerAssignments)
  );
  assert.equal(
    JSON.stringify(baselineResult.loanAssignments),
    JSON.stringify(explicitResult.loanAssignments)
  );
});
