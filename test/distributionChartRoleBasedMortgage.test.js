const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeElement(tagName = 'div') {
  const element = {
    tagName,
    style: {},
    dataset: {},
    className: '',
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    children: [],
    textContent: '',
    innerHTML: '',
    append() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
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
  const elementsById = {};
  const documentStub = {
    getElementById(id) {
      if (!elementsById[id]) {
        elementsById[id] = makeElement('div');
      }
      return elementsById[id];
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement(tagName) { return makeElement(tagName); },
    addEventListener() {},
    body: makeElement('body')
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
    Math,
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
  context.__elementsById = elementsById;

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

  return context;
}

test('role-based mortgage dollar donut includes flex mortgage participation and keeps consumer donut HELOC-excluded', () => {
  const context = loadAppContext();
  context.setSelectedFairnessEngine('officer_lane');

  const chartConfigs = [];
  context.DistributionChartRenderer = {
    drawDonutChart(config) {
      chartConfigs.push(config);
      return { canvas: makeElement('canvas'), imageDataUrl: 'data:image/png;base64,stub' };
    }
  };

  const officers = [
    { name: 'Jade', eligibility: { consumer: true, mortgage: true } },
    { name: 'Kash', eligibility: { consumer: false, mortgage: true } },
    { name: 'Casey', eligibility: { consumer: true, mortgage: false } }
  ];
  const runningTotals = { officers: {} };
  const result = {
    officerAssignments: {
      Jade: [{ type: 'HELOC', amountRequested: 46000 }],
      Kash: [{ type: 'HELOC', amountRequested: 38500 }],
      Casey: [{ type: 'Personal', amountRequested: 9000 }]
    },
    fairnessEvaluation: {
      chartAnnotations: {
        mortgageTitleSuffix: ' (Role-Based)',
        mortgageNote: 'Primary mortgage allocation to MLOs is expected.'
      },
      statusMetricDescriptor: {
        key: 'flex_lane_dollar_variance',
        label: 'Flex lane dollar variance',
        valuePercent: 11.7,
        contextLabel: 'Flex lane thresholds'
      }
    }
  };

  context.renderDistributionCharts(result, officers, runningTotals);

  const mortgageAfterConfig = chartConfigs.find((config) => config.title.startsWith('Mortgage Goal Dollars After Run'));
  assert.ok(mortgageAfterConfig, 'Mortgage role-based chart config should be rendered.');
  assert.deepEqual(
    Array.from(mortgageAfterConfig.distribution, (entry) => entry.officer),
    ['Jade', 'Kash'],
    'Mortgage role-based chart should include flex and mortgage-only officers with mortgage dollars.'
  );
  assert.equal(mortgageAfterConfig.distribution.find((entry) => entry.officer === 'Jade')?.totalAmountRequested, 46000);
  assert.equal(mortgageAfterConfig.distribution.find((entry) => entry.officer === 'Kash')?.totalAmountRequested, 38500);

  const consumerAfterConfig = chartConfigs.find((config) => config.title.startsWith('Consumer Goal Dollars After Run'));
  assert.ok(consumerAfterConfig, 'Consumer role-based chart config should be rendered.');
  assert.equal(
    consumerAfterConfig.distribution.find((entry) => entry.officer === 'Jade')?.totalAmountRequested,
    0,
    'Consumer role-based chart should continue excluding HELOC amounts from consumer dollars.'
  );

  const distributionCharts = context.__elementsById.distributionCharts;
  const mortgageAfterCard = distributionCharts.children[5];
  const noteTexts = mortgageAfterCard.children
    .filter((child) => child.tagName === 'p')
    .map((child) => child.textContent);
  assert.ok(noteTexts.some((text) => text.includes('Distribution share view: this donut is composition only; fairness status is based on lane variance metrics.')));
  assert.ok(noteTexts.some((text) => text.includes('Officers with zero mortgage-category dollars are excluded from this mortgage lane chart.')));
});

test('mortgage flex participation descriptor is treated as mortgage-lane driven in parity notes', () => {
  const context = loadAppContext();
  const evaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers: [
      { name: 'M1', eligibility: { consumer: false, mortgage: true } },
      { name: 'F1', eligibility: { consumer: true, mortgage: true } }
    ],
    officerStats: [
      { officer: 'M1', totalLoans: 6, totalAmount: 600000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 6, mortgageAmount: 600000, typeBreakdown: { 'Home Refi': 6 } },
      { officer: 'F1', totalLoans: 1, totalAmount: 100000, consumerLoanCount: 0, consumerAmount: 0, mortgageLoanCount: 1, mortgageAmount: 100000, typeBreakdown: { 'Home Refi': 1 } }
    ]
  });
  assert.equal(evaluation.overallResult, 'REVIEW');
  assert.equal(evaluation.statusMetricDescriptor?.key, 'mortgage_flex_participation_policy');

  const parityNotes = context.getOfficerLaneChartParityNotes({
    chartLane: 'mortgage',
    fairnessEvaluation: evaluation
  });

  assert.match(parityNotes.statusMetricLine, /Flex mortgage participation policy/);
  assert.match(parityNotes.statusMetricLine, /Mortgage lane policy checks/);
  assert.match(parityNotes.alignmentLine, /mortgage policy check/i);
  assert.doesNotMatch(parityNotes.alignmentLine, /driven by flex-lane variance/i);
});
