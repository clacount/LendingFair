const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.localStorage = { getItem() { return null; }, setItem() {} };
require('../src/utils/loanCategoryUtils.js');
require('../src/services/fairnessEngineService.js');

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function buildRandomScenario(seed) {
  const random = rng(seed);
  const officerCount = 2 + Math.floor(random() * 5);
  const mix = pick(random, ['C_ONLY', 'F_ONLY', 'M_ONLY', 'MIXED']);
  const officers = [];

  for (let i = 0; i < officerCount; i += 1) {
    const name = `O${seed}_${i}`;
    const classCode = mix === 'MIXED' ? pick(random, ['C', 'F', 'M']) : (mix === 'C_ONLY' ? 'C' : mix === 'F_ONLY' ? 'F' : 'M');
    officers.push({
      name,
      eligibility: classCode === 'C' ? { consumer: true, mortgage: false } : classCode === 'F' ? { consumer: true, mortgage: true } : { consumer: false, mortgage: true },
      mortgageOverride: classCode === 'F' && random() > 0.75,
      isOnVacation: random() > 0.9
    });
  }

  const loanMode = pick(random, ['consumer', 'mortgage', 'heloc_only', 'mixed']);
  const types = loanMode === 'consumer'
    ? ['Personal', 'Credit Card']
    : loanMode === 'mortgage'
      ? ['HELOC', 'Home Refi', 'First Mortgage']
      : loanMode === 'heloc_only'
        ? ['HELOC']
        : ['HELOC', 'Home Refi', 'First Mortgage', 'Personal', 'Credit Card'];

  const officerStats = officers.map((officer) => {
    const typeBreakdown = {};
    let consumerLoanCount = 0;
    let mortgageLoanCount = 0;
    let consumerAmount = 0;
    let mortgageAmount = 0;
    const typeEntries = 1 + Math.floor(random() * Math.min(4, types.length));

    for (let j = 0; j < typeEntries; j += 1) {
      const type = pick(random, types);
      const count = Math.floor(random() * 5);
      const amountPerLoan = type === 'Credit Card' ? 0 : 500 + Math.floor(random() * 200000);
      typeBreakdown[type] = (typeBreakdown[type] || 0) + count;
      if (['HELOC', 'Home Refi', 'First Mortgage'].includes(type)) {
        mortgageLoanCount += count;
        mortgageAmount += count * amountPerLoan;
      } else {
        consumerLoanCount += count;
        consumerAmount += count * amountPerLoan;
      }
    }

    const totalLoans = consumerLoanCount + mortgageLoanCount;
    const totalAmount = consumerAmount + mortgageAmount;

    return {
      officer: officer.name,
      totalLoans,
      totalAmount,
      consumerLoanCount,
      consumerAmount,
      mortgageLoanCount,
      mortgageAmount,
      typeBreakdown
    };
  });

  const optimizationMetrics = loanMode === 'heloc_only' ? { helocWeightedVariancePercent: Math.floor(random() * 30) } : {};

  return { officers, officerStats, optimizationMetrics };
}

test('bounded seeded randomized scenarios stay internally consistent for global and officer-lane engines', () => {
  const seeds = Array.from({ length: 250 }, (_, i) => 1000 + i);

  seeds.forEach((seed) => {
    const scenario = buildRandomScenario(seed);
    ['global', 'officer_lane'].forEach((engineType) => {
      const evaluation = global.FairnessEngineService.evaluateFairness({ engineType, ...scenario });
      assert.ok(evaluation, `Missing evaluation for seed ${seed}/${engineType}`);
      assert.ok(Array.isArray(evaluation.summaryItems), `Summary missing for seed ${seed}/${engineType}`);
      assert.ok(evaluation.metrics, `Metrics missing for seed ${seed}/${engineType}`);
      assert.ok(Number.isFinite(evaluation.metrics.maxCountVariancePercent));
      assert.ok(Number.isFinite(evaluation.metrics.maxAmountVariancePercent));

      if (engineType === 'global' && evaluation.overallResult === 'PASS') {
        assert.ok(evaluation.metrics.maxCountVariancePercent <= 15.000001, `PASS/count mismatch for seed ${seed}`);
        assert.ok(evaluation.metrics.maxAmountVariancePercent <= 20.000001, `PASS/amount mismatch for seed ${seed}`);
      }

      if (evaluation.roleAwareFlags?.helocOnlySupportThresholdsApplied) {
        assert.equal(evaluation.statusMetricDescriptor?.key, 'heloc_weighted_variance');
        if (evaluation.overallResult === 'PASS') {
          assert.ok(Number.isFinite(evaluation.statusMetricDescriptor?.valuePercent), `HELOC PASS missing weighted metric seed ${seed}`);
        }
      }

      if (engineType === 'officer_lane' && evaluation.overallResult === 'REVIEW') {
        const descriptorKey = String(evaluation.statusMetricDescriptor?.key || '');
        const consumerFail = !evaluation.metrics.consumerVariance.countDistributionPass || !evaluation.metrics.consumerVariance.amountDistributionPass;
        const mortgageFail = !evaluation.metrics.mortgageVariance.countDistributionPass || !evaluation.metrics.mortgageVariance.amountDistributionPass;
        if (!consumerFail && mortgageFail) {
          assert.notEqual(
            descriptorKey,
            'consumer_lane_dollar_variance',
            `Consumer descriptor should not be used when only mortgage lane fails (seed ${seed}).`
          );
        }
      }
    });
  });
});

function makeElement(tagName = 'div') {
  return {
    tagName,
    style: {},
    dataset: {},
    className: '',
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    children: [],
    textContent: '',
    innerHTML: '',
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    getContext() { return {}; }
  };
}

function loadAppContext() {
  const elementsById = {};
  const context = {
    console,
    window: null,
    global: null,
    document: {
      getElementById(id) {
        if (!elementsById[id]) elementsById[id] = makeElement('div');
        return elementsById[id];
      },
      querySelector() { return makeElement(); },
      querySelectorAll() { return []; },
      createElement(tagName) { return makeElement(tagName); },
      addEventListener() {},
      body: makeElement('body')
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { hostname: 'localhost' },
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
    'src/bootstrap/initApp.js'
  ].forEach((relativePath) => {
    vm.runInContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context, { filename: relativePath });
  });

  return context;
}

test('chart rendering path remains non-throwing for mortgage-only officer-lane scenarios', () => {
  const context = loadAppContext();
  context.setSelectedFairnessEngine('officer_lane');
  context.DistributionChartRenderer = {
    drawDonutChart() {
      return { canvas: makeElement('canvas'), imageDataUrl: 'data:image/png;base64,stub' };
    }
  };

  const officers = [
    { name: 'M1', eligibility: { consumer: false, mortgage: true } },
    { name: 'M2', eligibility: { consumer: false, mortgage: true } }
  ];

  assert.doesNotThrow(() => {
    context.renderDistributionCharts({
      officerAssignments: {
        M1: [{ type: 'HELOC', amountRequested: 35000 }],
        M2: [{ type: 'First Mortgage', amountRequested: 45000 }]
      },
      fairnessEvaluation: {
        statusMetricDescriptor: {
          key: 'mortgage_lane_dollar_variance',
          label: 'Mortgage lane dollar variance',
          valuePercent: 12.5,
          contextLabel: 'Mortgage lane thresholds'
        },
        metrics: { mortgageVariance: { maxAmountVariancePercent: 12.5 } },
        chartAnnotations: { mortgageTitleSuffix: ' (Role-Based)', mortgageNote: 'Primary mortgage allocation to MLOs is expected.' }
      }
    }, officers, { officers: {} });
  });
});
