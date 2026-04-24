#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_ENGINE = 'both';
const ENGINE_VALUES = new Set(['global', 'officer_lane', 'both']);
const REVIEW_SAMPLE_LIMIT = 10;
const CONSUMER_LOAN_TYPES = ['Personal', 'Auto', 'Credit Card', 'Collateralized'];
const MORTGAGE_LOAN_TYPES = ['HELOC', 'First Mortgage', 'Home Refi'];
let caseFileSequence = 0;
const OFFICER_ROLE_CODES = Object.freeze({
  CONSUMER: 'C',
  FLEX: 'F',
  MORTGAGE: 'M'
});

function parseArgs(argv) {
  const args = {
    durationMinutes: null,
    maxIterations: null,
    seedStart: 1,
    outputDir: null,
    engine: DEFAULT_ENGINE,
    maxCases: null,
    replay: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--duration-minutes':
        args.durationMinutes = Number(argv[++i]);
        break;
      case '--max-iterations':
        args.maxIterations = Number(argv[++i]);
        break;
      case '--seed-start':
        args.seedStart = Number(argv[++i]);
        break;
      case '--output':
        args.outputDir = argv[++i];
        break;
      case '--engine':
        args.engine = String(argv[++i] || DEFAULT_ENGINE).toLowerCase();
        break;
      case '--max-cases':
        args.maxCases = Number(argv[++i]);
        break;
      case '--replay':
        args.replay = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.outputDir) {
    throw new Error('--output is required');
  }
  if (!ENGINE_VALUES.has(args.engine)) {
    throw new Error(`--engine must be one of: global, officer_lane, both (received ${args.engine})`);
  }
  if (!args.replay && !(args.durationMinutes > 0)) {
    throw new Error('--duration-minutes must be > 0 when not using --replay');
  }
  if (!Number.isFinite(args.seedStart)) {
    throw new Error('--seed-start must be numeric');
  }

  return args;
}

function makeSeededRandom(seed = 1) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

function shuffle(random, arr) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * ((max - min) + 1));
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
    getContext() { return { clearRect() {}, fillText() {}, measureText() { return { width: 0 }; }, beginPath() {}, moveTo() {}, arc() {}, closePath() {}, fill() {}, fillRect() {} }; },
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

function loadAppContext(seedForMath = 42) {
  const localStorageStore = {};
  const seededMath = Object.create(Math);
  seededMath.random = makeSeededRandom(seedForMath);

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

  [
    'src/utils/loanCategoryUtils.js',
    'src/services/fairnessEngineService.js',
    'src/services/focusWeightSettingsService.js',
    'src/services/mortgageFocusRoutingService.js',
    'src/services/officerLaneOptimizationService.js',
    'src/bootstrap/initApp.js'
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
  });

  return context;
}

function hashContextSeed(seed, engine) {
  const input = `${Number(seed) || 0}:${String(engine || 'global')}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function loadScenarioAppContext(seed, engine) {
  return loadAppContext(hashContextSeed(seed, engine));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function generateOfficerMix(random) {
  const templates = [
    'consumer-only',
    'flex-only',
    'mortgage-only',
    'mixed-cfm',
    'override-enabled-flex'
  ];
  const kind = pick(random, templates);

  const officers = [];
  const addOfficer = (name, config) => officers.push({ name, ...config });

  if (kind === 'consumer-only') {
    const n = randomInt(random, 2, 6);
    for (let i = 0; i < n; i += 1) {
      addOfficer(`C${i + 1}`, { eligibility: { consumer: true, mortgage: false } });
    }
  } else if (kind === 'flex-only') {
    const n = randomInt(random, 2, 6);
    for (let i = 0; i < n; i += 1) {
      addOfficer(`F${i + 1}`, {
        eligibility: { consumer: true, mortgage: true },
        weights: { consumer: Number((0.5 + (random() * 0.5)).toFixed(2)), mortgage: Number((0.2 + (random() * 0.8)).toFixed(2)) },
        mortgageOverride: false
      });
    }
  } else if (kind === 'mortgage-only') {
    const n = randomInt(random, 2, 6);
    for (let i = 0; i < n; i += 1) {
      addOfficer(`M${i + 1}`, { eligibility: { consumer: false, mortgage: true } });
    }
  } else if (kind === 'mixed-cfm') {
    const c = randomInt(random, 1, 3);
    const f = randomInt(random, 1, 3);
    const m = randomInt(random, 1, 3);
    for (let i = 0; i < c; i += 1) addOfficer(`C${i + 1}`, { eligibility: { consumer: true, mortgage: false } });
    for (let i = 0; i < f; i += 1) addOfficer(`F${i + 1}`, { eligibility: { consumer: true, mortgage: true }, mortgageOverride: false });
    for (let i = 0; i < m; i += 1) addOfficer(`M${i + 1}`, { eligibility: { consumer: false, mortgage: true } });
  } else {
    const f = randomInt(random, 2, 4);
    const m = randomInt(random, 1, 2);
    for (let i = 0; i < f; i += 1) {
      addOfficer(`F${i + 1}`, {
        eligibility: { consumer: true, mortgage: true },
        mortgageOverride: i === 0 || random() > 0.6,
        weights: { consumer: Number((0.5 + (random() * 0.5)).toFixed(2)), mortgage: Number((0.2 + (random() * 0.8)).toFixed(2)) }
      });
    }
    for (let i = 0; i < m; i += 1) addOfficer(`M${i + 1}`, { eligibility: { consumer: false, mortgage: true } });
  }

  officers.forEach((officer) => {
    officer.isOnVacation = random() < 0.15;
  });

  return { kind, officers };
}

function generateLoans(random) {
  const types = {
    consumer: ['Personal', 'Auto', 'Collateralized', 'Credit Card'],
    mortgage: ['First Mortgage', 'Home Refi'],
    heloc: ['HELOC']
  };
  const loanMixes = ['consumer-only', 'mortgage-only', 'heloc-only', 'mixed-pool'];
  const mix = pick(random, loanMixes);
  const loanCount = randomInt(random, 4, 30);

  let pool;
  if (mix === 'consumer-only') {
    pool = types.consumer;
  } else if (mix === 'mortgage-only') {
    pool = types.mortgage;
  } else if (mix === 'heloc-only') {
    pool = types.heloc;
  } else {
    pool = [...types.consumer, ...types.mortgage, ...types.heloc];
  }

  const loans = Array.from({ length: loanCount }, (_, i) => {
    const type = pick(random, pool);
    const amount = type === 'Credit Card'
      ? randomInt(random, 1000, 25000)
      : randomInt(random, 10000, 1200000);
    return {
      name: `L${i + 1}`,
      type,
      amountRequested: amount
    };
  });

  return { mix, loans: shuffle(random, loans) };
}

function generateRunningTotals(random, officers) {
  const totals = { officers: {} };
  officers.forEach((officer) => {
    const roleCode = getOfficerRoleCode(officer);
    const sessions = randomInt(random, 1, 8);
    const allowedConsumer = roleCode === OFFICER_ROLE_CODES.CONSUMER || roleCode === OFFICER_ROLE_CODES.FLEX;
    const allowedMortgage = roleCode === OFFICER_ROLE_CODES.MORTGAGE || roleCode === OFFICER_ROLE_CODES.FLEX;

    const typeCounts = Object.fromEntries([...CONSUMER_LOAN_TYPES, ...MORTGAGE_LOAN_TYPES].map((loanType) => [loanType, 0]));
    if (allowedConsumer) {
      typeCounts.Personal = randomInt(random, 0, 12);
      typeCounts.Auto = randomInt(random, 0, 8);
      typeCounts['Credit Card'] = randomInt(random, 0, 10);
      typeCounts.Collateralized = randomInt(random, 0, 6);
    }
    if (allowedMortgage) {
      typeCounts.HELOC = randomInt(random, 0, 10);
      typeCounts['First Mortgage'] = randomInt(random, 0, 10);
      typeCounts['Home Refi'] = randomInt(random, 0, 10);
    }

    const totalLoanCount = Object.values(typeCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
    const consumerAmount = (typeCounts.Personal * randomInt(random, 8000, 40000))
      + (typeCounts.Auto * randomInt(random, 12000, 50000))
      + (typeCounts['Credit Card'] * randomInt(random, 1000, 25000))
      + (typeCounts.Collateralized * randomInt(random, 8000, 60000));
    const mortgageAmount = (typeCounts.HELOC * randomInt(random, 50000, 350000))
      + (typeCounts['First Mortgage'] * randomInt(random, 120000, 800000))
      + (typeCounts['Home Refi'] * randomInt(random, 90000, 600000));
    const totalAmountRequested = consumerAmount + mortgageAmount;

    totals.officers[officer.name] = {
      officer: officer.name,
      totalLoanCount,
      totalAmountRequested,
      sessions,
      typeCounts
    };
  });
  return totals;
}

function buildOfficerStats(result, context) {
  if (Array.isArray(result?.officerStats) && result.officerStats.length) {
    return result.officerStats;
  }
  if (typeof context.getOfficerStatsFromResult === 'function') {
    return context.getOfficerStatsFromResult(result);
  }
  return [];
}

function getOfficerRoleCode(officer = {}) {
  const eligibility = officer?.eligibility || {};
  const hasConsumer = Boolean(eligibility.consumer);
  const hasMortgage = Boolean(eligibility.mortgage);
  if (hasConsumer && hasMortgage) return OFFICER_ROLE_CODES.FLEX;
  if (hasMortgage) return OFFICER_ROLE_CODES.MORTGAGE;
  return OFFICER_ROLE_CODES.CONSUMER;
}

function selectPreferredEngineForScenario(scenario = {}) {
  const officers = Array.isArray(scenario.officers) ? scenario.officers : [];
  const roleSet = new Set(officers.map((officer) => getOfficerRoleCode(officer)));
  const isHomogeneousRolePopulation = roleSet.size <= 1;

  if (isHomogeneousRolePopulation) {
    return {
      selectedEngine: 'global',
      officerPopulationType: 'homogeneous',
      selectionReason: 'Homogeneous officer role population; lane-specific routing checks are not primary.'
    };
  }

  return {
    selectedEngine: 'officer_lane',
    officerPopulationType: 'mixed',
    selectionReason: 'Mixed officer role population; lane-aware routing and policy checks are primary.'
  };
}

function buildEngineRunPlan(engineFilter, scenario = {}) {
  const preferred = selectPreferredEngineForScenario(scenario);

  if (engineFilter === 'both') {
    const secondaryEngine = preferred.selectedEngine === 'global' ? 'officer_lane' : 'global';
    return {
      preferred,
      plan: [
        { engine: preferred.selectedEngine, role: 'primary' },
        { engine: secondaryEngine, role: 'secondary' }
      ]
    };
  }

  return {
    preferred,
    plan: [{ engine: engineFilter, role: engineFilter === preferred.selectedEngine ? 'primary' : 'forced' }]
  };
}

function isAssignmentResultShapeValid(result) {
  return Boolean(result && typeof result === 'object'
    && result.loanAssignments && typeof result.loanAssignments === 'object'
    && result.officerAssignments && typeof result.officerAssignments === 'object');
}

function deriveOptimizationMetricsForFairness(result = {}) {
  const weighted = Number(result.optimizationFinalHelocWeightedVariancePercent);
  return {
    helocWeightedVariancePercent: Number.isFinite(weighted) ? weighted : null
  };
}

function backfillFairnessEvaluationIfMissing({ context, scenario, result, engine }) {
  if (result?.fairnessEvaluation) {
    return { result, fairnessBackfilledByHarness: false, fairnessBackfillError: null };
  }

  if (!isAssignmentResultShapeValid(result)) {
    return { result, fairnessBackfilledByHarness: false, fairnessBackfillError: 'result shape is not assignment-compatible' };
  }

  const officerStats = buildOfficerStats(result, context);
  if (!Array.isArray(officerStats) || !officerStats.length) {
    return { result, fairnessBackfilledByHarness: false, fairnessBackfillError: 'unable to derive officer stats for fairness backfill' };
  }

  const evaluateFairness = context?.FairnessEngineService?.evaluateFairness;
  if (typeof evaluateFairness !== 'function') {
    return { result, fairnessBackfilledByHarness: false, fairnessBackfillError: 'FairnessEngineService.evaluateFairness unavailable' };
  }

  const fairnessEvaluation = evaluateFairness({
    engineType: engine,
    officers: scenario.officers || [],
    officerStats,
    optimizationMetrics: deriveOptimizationMetricsForFairness(result)
  });

  if (!fairnessEvaluation || typeof fairnessEvaluation !== 'object') {
    return { result, fairnessBackfilledByHarness: false, fairnessBackfillError: 'fairness engine did not return a valid evaluation' };
  }

  return {
    result: {
      ...result,
      fairnessEvaluation,
      fairnessBackfilledByHarness: true
    },
    fairnessBackfilledByHarness: true,
    fairnessBackfillError: null
  };
}

function parseVariance(summaryItems = [], labelPrefix) {
  const line = summaryItems.find((item) => String(item).startsWith(labelPrefix));
  if (!line) return null;
  const match = String(line).match(/([0-9]+(?:\.[0-9]+)?)%/);
  return match ? Number(match[1]) : null;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isExpectedInvalidScenarioError(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const knownInvalidScenarioPatterns = [
    /^no eligible officers are configured for (consumer|mortgage) loans\.?$/,
    /^no eligible officers are configured for [a-z\s-]+ loans\.?$/,
    /^please add at least one loan\.?$/
  ];

  return knownInvalidScenarioPatterns.some((pattern) => pattern.test(normalized));
}

function getMetricForVarianceDescriptor(descriptorKey, metrics = {}) {
  const varianceDescriptors = {
    consumer_lane_dollar_variance: metrics.consumerVariance?.maxAmountVariancePercent,
    flex_lane_dollar_variance: metrics.flexVariance?.maxAmountVariancePercent,
    mortgage_lane_dollar_variance: metrics.mortgageVariance?.maxAmountVariancePercent,
    heloc_weighted_variance: metrics.helocWeightedVariancePercent
  };
  return varianceDescriptors[descriptorKey];
}

function isPolicyDescriptorKey(descriptorKey) {
  return [
    'mortgage_routing_policy',
    'mortgage_leadership_policy',
    'mortgage_flex_participation_policy'
  ].includes(descriptorKey);
}

function collectValidationFlags({ scenario, engine, result, officerStats, context = {} }) {
  const failures = [];
  const suspicious = [];

  const evalObj = result?.fairnessEvaluation;
  if (!evalObj) {
    failures.push('missing fairnessEvaluation');
    return { failures, suspicious };
  }

  if (!evalObj.metrics || typeof evalObj.metrics !== 'object') {
    failures.push('invalid result structure: metrics missing');
    return { failures, suspicious };
  }

  const metrics = evalObj.metrics;
  if (!isFiniteNumber(metrics.maxCountVariancePercent) || !isFiniteNumber(metrics.maxAmountVariancePercent)) {
    suspicious.push('missing/invalid top-level variance metric values');
  }

  const summaryItems = Array.isArray(evalObj.summaryItems) ? evalObj.summaryItems : [];
  if (summaryItems.length === 0) {
    suspicious.push('missing summaryItems');
  }

  if (engine === 'global') {
    const expectedPass = isFiniteNumber(metrics.maxCountVariancePercent)
      && isFiniteNumber(metrics.maxAmountVariancePercent)
      && metrics.maxCountVariancePercent <= 15
      && metrics.maxAmountVariancePercent <= 20;

    if (evalObj.overallResult === 'PASS' && !expectedPass) {
      suspicious.push('PASS when global threshold logic appears violated');
    }
    if (evalObj.overallResult === 'REVIEW' && expectedPass) {
      suspicious.push('REVIEW when all visible global thresholds appear satisfied');
    }

    const overallLoanVarianceSummary = parseVariance(summaryItems, 'Overall loan variance');
    if (isFiniteNumber(overallLoanVarianceSummary) && isFiniteNumber(metrics.maxCountVariancePercent)
      && Math.abs(overallLoanVarianceSummary - metrics.maxCountVariancePercent) > 0.2) {
      suspicious.push('summary/status contradiction on overall loan variance');
    }
  } else {
    const descriptor = evalObj.statusMetricDescriptor;
    if (!descriptor || typeof descriptor !== 'object') {
      suspicious.push('missing statusMetricDescriptor for officer_lane');
    }

    const roleAware = evalObj.roleAwareFlags || {};
    const supportMode = Boolean(roleAware.helocOnlySupportThresholdsApplied);
    const weighted = metrics.helocWeightedVariancePercent;

    if (supportMode && descriptor?.key !== 'heloc_weighted_variance') {
      suspicious.push('statusMetricDescriptor inconsistent with HELOC-only support mode');
    }
    if (supportMode && (weighted === null || weighted === undefined)) {
      suspicious.push('PASS/REVIEW with missing required weighted HELOC metric in support mode');
    }
    if (supportMode && summaryItems.some((item) => String(item).includes('Weighted HELOC optimization variance: n/a%'))) {
      suspicious.push('n/a% weighted HELOC variance where support mode is active');
    }

    const descriptorKey = descriptor?.key;
    const metricUsed = getMetricForVarianceDescriptor(descriptorKey, metrics);
    const descriptorUsesVarianceMetric = descriptorKey in {
      consumer_lane_dollar_variance: true,
      flex_lane_dollar_variance: true,
      mortgage_lane_dollar_variance: true,
      heloc_weighted_variance: true
    };

    if (descriptorUsesVarianceMetric
      && descriptor
      && descriptor.valuePercent !== null
      && descriptor.valuePercent !== undefined
      && isFiniteNumber(metricUsed)
      && Math.abs(Number(descriptor.valuePercent) - Number(metricUsed)) > 0.2) {
      suspicious.push('statusMetricDescriptor inconsistent with actual result basis');
    }

    if (isPolicyDescriptorKey(descriptorKey)) {
      if (!isFiniteNumber(Number(descriptor?.valuePercent))) {
        suspicious.push('statusMetricDescriptor policy metric missing/invalid');
      }
      const policyContext = String(descriptor?.contextLabel || '').toLowerCase();
      if (!policyContext.includes('mortgage') && !policyContext.includes('policy')) {
        suspicious.push('statusMetricDescriptor policy context label missing mortgage/policy context');
      }
    }

    const hasNullMetricInDescriptorPath = descriptorUsesVarianceMetric && (metricUsed === null || metricUsed === undefined);
    if (hasNullMetricInDescriptorPath && evalObj.overallResult === 'PASS') {
      suspicious.push('null/undefined metric silently treated as success');
    }

    const strictConsumerPass = isFiniteNumber(metrics.consumerVariance?.maxCountVariancePercent)
      && isFiniteNumber(metrics.consumerVariance?.maxAmountVariancePercent)
      && metrics.consumerVariance.maxCountVariancePercent <= 15
      && metrics.consumerVariance.maxAmountVariancePercent <= 20;
    const strictFlexPass = isFiniteNumber(metrics.flexVariance?.maxCountVariancePercent)
      && isFiniteNumber(metrics.flexVariance?.maxAmountVariancePercent)
      && metrics.flexVariance.maxCountVariancePercent <= 15
      && metrics.flexVariance.maxAmountVariancePercent <= 20;

    if (!supportMode && evalObj.overallResult === 'PASS' && !(strictConsumerPass || strictFlexPass)) {
      suspicious.push('PASS when officer-lane threshold logic appears violated');
    }

    const hasOptimizationSummary = summaryItems.some((item) => String(item).toLowerCase().includes('weighted heloc optimization variance'));
    if (supportMode && !hasOptimizationSummary) {
      suspicious.push('optimization summary inconsistent with selected result');
    }

    const mortgageEligibleOfficersWithMortgageDollars = officerStats
      .filter((entry) => Number(entry.mortgageAmount || 0) > 0)
      .filter((entry) => scenario.officers.some((o) => o.name === entry.officer && o.eligibility?.mortgage))
      .map((entry) => entry.officer);

    const mortgageChartFilter = context.getOfficerLaneMortgageChartDistribution;
    if (typeof mortgageChartFilter === 'function') {
      const chartDistribution = officerStats.map((entry) => ({
        officer: entry.officer,
        totalAmountRequested: Number(entry.mortgageAmount || 0)
      }));
      const filtered = mortgageChartFilter(chartDistribution) || [];
      const included = new Set(filtered.map((entry) => entry.officer));
      mortgageEligibleOfficersWithMortgageDollars.forEach((officer) => {
        if (!included.has(officer)) {
          suspicious.push('mortgage chart would omit officers with mortgage-category dollars');
        }
      });
    }
  }

  return { failures, suspicious: [...new Set(suspicious)] };
}

function summarizeScenario(scenario) {
  return {
    officerMix: scenario.officerMix,
    loanMix: scenario.loanMix,
    officerCount: scenario.officers.length,
    loanCount: scenario.loans.length,
    vacationCount: scenario.officers.filter((o) => o.isOnVacation).length
  };
}

function buildCaseFileName({ seed, engine }) {
  caseFileSequence += 1;
  return `${seed}_${engine}_${Date.now()}_${process.pid}_${caseFileSequence}.json`;
}

function runOneScenario(context, scenario, engine, engineSelection = null) {
  context.FairnessEngineService.setSelectedFairnessEngine(engine);
  const rawResult = context.assignLoans(scenario.officers, scenario.loans, scenario.runningTotals);

  if (isExpectedInvalidScenarioError(rawResult?.error)) {
    return {
      result: rawResult,
      officerStats: [],
      flags: { failures: [], suspicious: [] },
      skippedInvalidScenarioReason: String(rawResult.error),
      fairnessBackfilledByHarness: false,
      fairnessBackfillError: null,
      engineSelection
    };
  }

  const withFairness = backfillFairnessEvaluationIfMissing({
    context,
    scenario,
    result: rawResult,
    engine
  });

  const result = withFairness.result;
  const officerStats = buildOfficerStats(result, context);
  const flags = collectValidationFlags({ scenario, engine, result, officerStats, context });
  return {
    result,
    officerStats,
    flags,
    skippedInvalidScenarioReason: null,
    fairnessBackfilledByHarness: withFairness.fairnessBackfilledByHarness,
    fairnessBackfillError: withFairness.fairnessBackfillError,
    engineSelection
  };
}

function writeCaseFile({ outputDir, seed, engine, scenario, result, reason, classification, runMetadata = {} }) {
  const casesDir = path.join(outputDir, 'cases');
  ensureDir(casesDir);
  const fileName = buildCaseFileName({ seed, engine });
  const payload = {
    timestamp: nowIso(),
    classification,
    seed,
    engine,
    scenarioSummary: summarizeScenario(scenario),
    officers: scenario.officers,
    loans: scenario.loans,
    runningTotals: scenario.runningTotals,
    optimizationMetrics: {
      optimizationApplied: Boolean(result?.optimizationApplied),
      optimizationTierReached: result?.optimizationTierReached ?? null,
      optimizationSummaryMessage: result?.optimizationSummaryMessage ?? null,
      optimizationFinalConsumerDollarVariance: result?.optimizationFinalConsumerDollarVariance ?? null,
      optimizationFinalHelocWeightedVariancePercent: result?.optimizationFinalHelocWeightedVariancePercent ?? null
    },
    fairnessEvaluation: result?.fairnessEvaluation ?? null,
    fairnessBackfilledByHarness: Boolean(runMetadata.fairnessBackfilledByHarness),
    fairnessBackfillError: runMetadata.fairnessBackfillError ?? null,
    engineSelection: runMetadata.engineSelection || null,
    observedResult: result,
    reasonFlagged: reason
  };

  const filePath = path.join(casesDir, fileName);
  writeJsonFile(filePath, payload);
  return filePath;
}

function updateReasonAggregation(reasonAggregationMap, {
  reasonFlagged,
  caseFile,
  engine,
  seed
}) {
  if (!reasonFlagged) {
    return;
  }
  if (!reasonAggregationMap.has(reasonFlagged)) {
    reasonAggregationMap.set(reasonFlagged, {
      count: 0,
      sampleCaseFiles: [],
      engines: new Set(),
      firstSeed: null,
      lastSeed: null
    });
  }

  const entry = reasonAggregationMap.get(reasonFlagged);
  entry.count += 1;
  entry.engines.add(String(engine || 'unknown'));
  if (entry.sampleCaseFiles.length < 10) {
    entry.sampleCaseFiles.push(caseFile);
  }
  const numericSeed = Number(seed);
  if (Number.isFinite(numericSeed)) {
    entry.firstSeed = entry.firstSeed === null ? numericSeed : Math.min(entry.firstSeed, numericSeed);
    entry.lastSeed = entry.lastSeed === null ? numericSeed : Math.max(entry.lastSeed, numericSeed);
  }
}

function flushReasonAggregation(reasonCountsFile, reasonAggregationMap) {
  const output = {};
  [...reasonAggregationMap.entries()].forEach(([reason, entry]) => {
    output[reason] = {
      count: entry.count,
      sampleCaseFiles: entry.sampleCaseFiles,
      engines: [...entry.engines],
      firstSeed: entry.firstSeed,
      lastSeed: entry.lastSeed
    };
  });
  writeJsonFile(reasonCountsFile, output);
}

function recordEngineCompletionOutcome(engineRunStats, engine, overallResult) {
  const stats = engineRunStats?.[engine];
  if (!stats) {
    return;
  }
  stats.completedRuns += 1;
  if (overallResult === 'PASS') {
    stats.passCount += 1;
  } else if (overallResult === 'REVIEW') {
    stats.reviewCount += 1;
  } else {
    stats.unknownResultCount += 1;
  }
}

function classifyGlobalReviewBasis(metrics = {}) {
  const countVariance = Number(metrics.maxCountVariancePercent);
  const dollarVariance = Number(metrics.maxAmountVariancePercent);
  const countFail = Number.isFinite(countVariance) && countVariance > 15;
  const dollarFail = Number.isFinite(dollarVariance) && dollarVariance > 20;
  if (countFail && dollarFail) return 'global_count_and_dollar_variance';
  if (countFail) return 'global_count_variance';
  if (dollarFail) return 'global_dollar_variance';
  return 'global_review_unknown_basis';
}

function classifyLaneVarianceBasis(variance = {}, lanePrefix) {
  const countFail = Number(variance?.maxCountVariancePercent) > 15;
  const dollarFail = Number(variance?.maxAmountVariancePercent) > 20;
  if (countFail && dollarFail) return `${lanePrefix}_count_and_dollar_variance`;
  if (dollarFail) return `${lanePrefix}_dollar_variance`;
  if (countFail) return `${lanePrefix}_count_variance`;
  return null;
}

function classifyOfficerLaneReviewBasis(fairnessEvaluation = {}) {
  const descriptorKey = fairnessEvaluation?.statusMetricDescriptor?.key;
  if (descriptorKey) {
    return descriptorKey;
  }

  const metrics = fairnessEvaluation?.metrics || {};
  const varianceBasis = classifyLaneVarianceBasis(metrics.consumerVariance, 'consumer_lane')
    || classifyLaneVarianceBasis(metrics.mortgageVariance, 'mortgage_lane')
    || classifyLaneVarianceBasis(metrics.flexVariance, 'flex_lane');
  if (varianceBasis) {
    return varianceBasis;
  }
  if ((fairnessEvaluation?.summaryItems || []).some((item) => String(item).toLowerCase().includes('routing'))) {
    return 'mortgage_routing_policy';
  }
  return 'unknown_review_basis';
}

function classifyReviewBasis(run = {}, engine = 'global') {
  const fairnessEvaluation = run?.result?.fairnessEvaluation || {};
  const metrics = fairnessEvaluation.metrics || {};
  if (engine === 'global') {
    return classifyGlobalReviewBasis(metrics);
  }
  return classifyOfficerLaneReviewBasis(fairnessEvaluation);
}

function classifyReviewExpectation(run = {}, reviewBasis = '') {
  const result = run?.result || {};
  const fairnessEvaluation = result.fairnessEvaluation || {};
  const needsTriage = (
    (result.optimizationApplied === false && reviewBasis.includes('dollar_variance'))
    || result.optimizationTierReached === 'best_available_over_25'
    || (!fairnessEvaluation.statusMetricDescriptor && run?.engineSelection?.selectedEngine === 'officer_lane')
    || reviewBasis === 'unknown_review_basis'
    || (
      fairnessEvaluation?.roleAwareFlags?.helocOnlySupportThresholdsApplied
      && fairnessEvaluation?.metrics?.helocWeightedVariancePercent == null
    )
  );
  return needsTriage ? 'needs_triage' : 'expected_review';
}

function updateReviewAggregation(reviewAggregationMap, {
  reviewBasis,
  engine,
  seed,
  sampleCaseFile = null,
  classification = 'expected_review'
}) {
  if (!reviewBasis) {
    return;
  }
  if (!reviewAggregationMap.has(reviewBasis)) {
    reviewAggregationMap.set(reviewBasis, {
      count: 0,
      engines: new Set(),
      firstSeed: null,
      lastSeed: null,
      sampleCaseFiles: [],
      classification: 'expected_review'
    });
  }
  const entry = reviewAggregationMap.get(reviewBasis);
  entry.count += 1;
  entry.engines.add(String(engine || 'unknown'));
  if (sampleCaseFile && entry.sampleCaseFiles.length < REVIEW_SAMPLE_LIMIT) {
    entry.sampleCaseFiles.push(sampleCaseFile);
  }
  const numericSeed = Number(seed);
  if (Number.isFinite(numericSeed)) {
    entry.firstSeed = entry.firstSeed === null ? numericSeed : Math.min(entry.firstSeed, numericSeed);
    entry.lastSeed = entry.lastSeed === null ? numericSeed : Math.max(entry.lastSeed, numericSeed);
  }
  if (classification === 'needs_triage') {
    entry.classification = 'needs_triage';
  }
}

function flushReviewAggregation(reviewCountsFile, reviewAggregationMap) {
  const output = {};
  [...reviewAggregationMap.entries()].forEach(([basis, entry]) => {
    output[basis] = {
      count: entry.count,
      engines: [...entry.engines],
      firstSeed: entry.firstSeed,
      lastSeed: entry.lastSeed,
      sampleCaseFiles: entry.sampleCaseFiles,
      classification: entry.classification
    };
  });
  writeJsonFile(reviewCountsFile, output);
}

function buildScenario(seed) {
  const random = makeSeededRandom(seed);
  const { kind: officerMix, officers } = generateOfficerMix(random);
  const { mix: loanMix, loans } = generateLoans(random);
  const runningTotals = generateRunningTotals(random, officers);
  return {
    seed,
    officerMix,
    loanMix,
    officers,
    loans,
    runningTotals
  };
}

function buildEngineList(engineFilter) {
  if (engineFilter === 'both') return ['global', 'officer_lane'];
  return [engineFilter];
}

function topPatterns(counterMap, limit = 5) {
  return [...counterMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function initLogs(outputDir) {
  ensureDir(outputDir);
  const summaryLog = path.join(outputDir, 'summary.log');
  const failuresLog = path.join(outputDir, 'failures.log');
  const suspiciousLog = path.join(outputDir, 'suspicious.log');
  const skippedLog = path.join(outputDir, 'skipped.log');
  const reasonCountsFile = path.join(outputDir, 'reason_counts.json');
  const reviewCountsFile = path.join(outputDir, 'review_counts.json');
  [summaryLog, failuresLog, suspiciousLog, skippedLog].forEach((p) => fs.writeFileSync(p, '', 'utf8'));
  writeJsonFile(reasonCountsFile, {});
  writeJsonFile(reviewCountsFile, {});
  return {
    summaryLog,
    failuresLog,
    suspiciousLog,
    skippedLog,
    reasonCountsFile,
    reasonAggregationMap: new Map(),
    reviewCountsFile,
    reviewAggregationMap: new Map()
  };
}

function replayCase(args) {
  const logs = initLogs(args.outputDir);
  const casePayload = JSON.parse(fs.readFileSync(args.replay, 'utf8'));

  const scenario = {
    seed: Number(casePayload.seed),
    officerMix: casePayload.scenarioSummary?.officerMix || 'replay',
    loanMix: casePayload.scenarioSummary?.loanMix || 'replay',
    officers: casePayload.officers || [],
    loans: casePayload.loans || [],
    runningTotals: casePayload.runningTotals || { officers: {} }
  };

  const engine = String(casePayload.engine || 'global');
  const context = loadScenarioAppContext(scenario.seed, engine);
  const startedAt = nowIso();
  appendLine(logs.summaryLog, `[${startedAt}] replay start seed=${scenario.seed} engine=${engine}`);

  const selection = selectPreferredEngineForScenario(scenario);
  const run = runOneScenario(context, scenario, engine, {
    selectedEngine: engine,
    officerPopulationType: selection.officerPopulationType,
    selectionReason: selection.selectionReason,
    runRole: engine === selection.selectedEngine ? 'primary' : 'forced'
  });
  const totalFailures = run.flags.failures.length;
  const totalSuspicious = run.flags.suspicious.length;
  const skippedInvalidScenarioCount = run.skippedInvalidScenarioReason ? 1 : 0;

  if (run.skippedInvalidScenarioReason) {
    appendLine(logs.skippedLog, JSON.stringify({
      timestamp: nowIso(),
      seed: scenario.seed,
      engine,
      scenarioSummary: summarizeScenario(scenario),
      reason: run.skippedInvalidScenarioReason
    }));
  }

  run.flags.failures.forEach((reason) => {
    const caseFile = writeCaseFile({
      outputDir: args.outputDir,
      seed: scenario.seed,
      engine,
      scenario,
      result: run.result,
      reason,
      classification: 'failure',
      runMetadata: run
    });
    appendLine(logs.failuresLog, JSON.stringify({ timestamp: nowIso(), seed: scenario.seed, engine, reason, caseFile }));
    updateReasonAggregation(logs.reasonAggregationMap, {
      reasonFlagged: reason,
      caseFile,
      engine,
      seed: scenario.seed
    });
  });
  run.flags.suspicious.forEach((reason) => {
    const caseFile = writeCaseFile({
      outputDir: args.outputDir,
      seed: scenario.seed,
      engine,
      scenario,
      result: run.result,
      reason,
      classification: 'suspicious',
      runMetadata: run
    });
    appendLine(logs.suspiciousLog, JSON.stringify({ timestamp: nowIso(), seed: scenario.seed, engine, reason, caseFile }));
    updateReasonAggregation(logs.reasonAggregationMap, {
      reasonFlagged: reason,
      caseFile,
      engine,
      seed: scenario.seed
    });
  });

  const summary = {
    mode: 'replay',
    seed: scenario.seed,
    engine,
    failures: totalFailures,
    suspicious: totalSuspicious,
    skippedInvalidScenarioCount,
    outputDirectory: args.outputDir
  };
  appendLine(logs.summaryLog, JSON.stringify(summary));
  flushReasonAggregation(logs.reasonCountsFile, logs.reasonAggregationMap);
  flushReviewAggregation(logs.reviewCountsFile, logs.reviewAggregationMap);
  console.log(JSON.stringify(summary, null, 2));
}

function runStress(args) {
  const logs = initLogs(args.outputDir);
  const startedAt = nowIso();
  const endTime = Date.now() + Math.floor(args.durationMinutes * 60 * 1000);

  let iteration = 0;
  let seed = Math.trunc(args.seedStart);
  let failuresCount = 0;
  let suspiciousCount = 0;
  let skippedInvalidScenarioCount = 0;
  let capturedCases = 0;
  const suspiciousPatterns = new Map();
  const reviewPatterns = new Map();
  const testedSeeds = [];
  const engineRunStats = {
    global: {
      attemptedRuns: 0,
      skippedInvalidScenarioCount: 0,
      suspiciousCount: 0,
      failureCount: 0,
      completedRuns: 0,
      passCount: 0,
      reviewCount: 0,
      unknownResultCount: 0
    },
    officer_lane: {
      attemptedRuns: 0,
      skippedInvalidScenarioCount: 0,
      suspiciousCount: 0,
      failureCount: 0,
      completedRuns: 0,
      passCount: 0,
      reviewCount: 0,
      unknownResultCount: 0
    }
  };

  appendLine(logs.summaryLog, `[${startedAt}] start durationMinutes=${args.durationMinutes} engineFilter=${args.engine} seedStart=${seed}`);

  while (Date.now() < endTime) {
    if (args.maxIterations && iteration >= args.maxIterations) break;
    if (args.maxCases && capturedCases >= args.maxCases) break;

    iteration += 1;
    testedSeeds.push(seed);
    const scenario = buildScenario(seed);

    const enginePlan = buildEngineRunPlan(args.engine, scenario);
    enginePlan.plan.forEach(({ engine, role }) => {
      if (engineRunStats[engine]) {
        engineRunStats[engine].attemptedRuns += 1;
      }
      try {
        const context = loadScenarioAppContext(seed, engine);
        const run = runOneScenario(context, scenario, engine, {
          selectedEngine: enginePlan.preferred.selectedEngine,
          officerPopulationType: enginePlan.preferred.officerPopulationType,
          selectionReason: enginePlan.preferred.selectionReason,
          runRole: role
        });
        if (run.skippedInvalidScenarioReason) {
          skippedInvalidScenarioCount += 1;
          if (engineRunStats[engine]) {
            engineRunStats[engine].skippedInvalidScenarioCount += 1;
          }
          appendLine(logs.skippedLog, JSON.stringify({
            timestamp: nowIso(),
            seed,
            engine,
            engineSelection: run.engineSelection,
            scenarioSummary: summarizeScenario(scenario),
            reason: run.skippedInvalidScenarioReason
          }));
          return;
        }

        if (run.result?.fairnessEvaluation && typeof run.result.fairnessEvaluation === 'object') {
          recordEngineCompletionOutcome(engineRunStats, engine, run.result.fairnessEvaluation.overallResult);
          if (run.result.fairnessEvaluation.overallResult === 'REVIEW') {
            const reviewBasis = classifyReviewBasis(run, engine);
            const reviewClassification = classifyReviewExpectation(run, reviewBasis);
            reviewPatterns.set(reviewBasis, (reviewPatterns.get(reviewBasis) || 0) + 1);

            let reviewCaseFile = null;
            const bucket = logs.reviewAggregationMap.get(reviewBasis);
            const sampleCount = bucket?.sampleCaseFiles?.length || 0;
            if (sampleCount < REVIEW_SAMPLE_LIMIT) {
              reviewCaseFile = writeCaseFile({
                outputDir: args.outputDir,
                seed,
                engine,
                scenario,
                result: run.result,
                reason: `review_basis:${reviewBasis}`,
                classification: 'review_sample',
                runMetadata: run
              });
            }

            updateReviewAggregation(logs.reviewAggregationMap, {
              reviewBasis,
              engine,
              seed,
              sampleCaseFile: reviewCaseFile,
              classification: reviewClassification
            });
          }
        }

        run.flags.failures.forEach((reason) => {
          failuresCount += 1;
          if (engineRunStats[engine]) {
            engineRunStats[engine].failureCount += 1;
          }
          capturedCases += 1;
          const caseFile = writeCaseFile({
            outputDir: args.outputDir,
            seed,
            engine,
            scenario,
            result: run.result,
            reason,
            classification: 'failure',
            runMetadata: run
          });
          appendLine(logs.failuresLog, JSON.stringify({
            timestamp: nowIso(),
            seed,
            engine,
            engineSelection: run.engineSelection,
            scenarioSummary: summarizeScenario(scenario),
            reason,
            caseFile
          }));
          updateReasonAggregation(logs.reasonAggregationMap, {
            reasonFlagged: reason,
            caseFile,
            engine,
            seed
          });
        });

        run.flags.suspicious.forEach((reason) => {
          suspiciousCount += 1;
          if (engineRunStats[engine]) {
            engineRunStats[engine].suspiciousCount += 1;
          }
          capturedCases += 1;
          suspiciousPatterns.set(reason, (suspiciousPatterns.get(reason) || 0) + 1);
          const caseFile = writeCaseFile({
            outputDir: args.outputDir,
            seed,
            engine,
            scenario,
            result: run.result,
            reason,
            classification: 'suspicious',
            runMetadata: run
          });
          appendLine(logs.suspiciousLog, JSON.stringify({
            timestamp: nowIso(),
            seed,
            engine,
            engineSelection: run.engineSelection,
            scenarioSummary: summarizeScenario(scenario),
            reason,
            caseFile
          }));
          updateReasonAggregation(logs.reasonAggregationMap, {
            reasonFlagged: reason,
            caseFile,
            engine,
            seed
          });
        });
      } catch (error) {
        if (isExpectedInvalidScenarioError(error?.message || error)) {
          skippedInvalidScenarioCount += 1;
          appendLine(logs.skippedLog, JSON.stringify({
            timestamp: nowIso(),
            seed,
            engine,
            engineSelection: {
              selectedEngine: enginePlan.preferred.selectedEngine,
              officerPopulationType: enginePlan.preferred.officerPopulationType,
              selectionReason: enginePlan.preferred.selectionReason,
              runRole: role
            },
            scenarioSummary: summarizeScenario(scenario),
            reason: String(error?.message || error)
          }));
          return;
        }

        failuresCount += 1;
        if (engineRunStats[engine]) {
          engineRunStats[engine].failureCount += 1;
        }
        capturedCases += 1;
        const reason = `uncaught exception: ${error?.message || String(error)}`;
        const caseFile = writeCaseFile({ outputDir: args.outputDir, seed, engine, scenario, result: { error: reason, stack: error?.stack || null }, reason, classification: 'failure' });
        appendLine(logs.failuresLog, JSON.stringify({
          timestamp: nowIso(),
          seed,
          engine,
          engineSelection: {
            selectedEngine: enginePlan.preferred.selectedEngine,
            officerPopulationType: enginePlan.preferred.officerPopulationType,
            selectionReason: enginePlan.preferred.selectionReason,
            runRole: role
          },
          scenarioSummary: summarizeScenario(scenario),
          reason,
          stack: error?.stack || null,
          caseFile
        }));
        updateReasonAggregation(logs.reasonAggregationMap, {
          reasonFlagged: reason,
          caseFile,
          engine,
          seed
        });
      }
    });

    seed += 1;
  }

  const patterns = topPatterns(suspiciousPatterns, 5);
  const reviewReasonPatterns = topPatterns(reviewPatterns, 5);
  const completedRuns = engineRunStats.global.completedRuns + engineRunStats.officer_lane.completedRuns;
  const passCount = engineRunStats.global.passCount + engineRunStats.officer_lane.passCount;
  const reviewCount = engineRunStats.global.reviewCount + engineRunStats.officer_lane.reviewCount;
  const unknownResultCount = engineRunStats.global.unknownResultCount + engineRunStats.officer_lane.unknownResultCount;
  const summary = {
    mode: 'stress',
    startedAt,
    endedAt: nowIso(),
    totalIterations: iteration,
    seedsTested: testedSeeds.length,
    firstSeed: testedSeeds[0] ?? null,
    lastSeed: testedSeeds[testedSeeds.length - 1] ?? null,
    failuresCount,
    suspiciousCount,
    skippedInvalidScenarioCount,
    completedRuns,
    passCount,
    reviewCount,
    unknownResultCount,
    engineRunStats,
    outputDirectory: args.outputDir,
    reviewReasonCountsPath: logs.reviewCountsFile,
    topRepeatedReviewReasons: reviewReasonPatterns.map(([reason, count]) => ({ reason, count })),
    topRepeatedSuspiciousPatterns: patterns.map(([reason, count]) => ({ reason, count }))
  };

  appendLine(logs.summaryLog, JSON.stringify(summary, null, 2));
  flushReasonAggregation(logs.reasonCountsFile, logs.reasonAggregationMap);
  flushReviewAggregation(logs.reviewCountsFile, logs.reviewAggregationMap);
  console.log(JSON.stringify(summary, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.replay) {
    replayCase(args);
  } else {
    runStress(args);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  selectPreferredEngineForScenario,
  buildEngineRunPlan,
  backfillFairnessEvaluationIfMissing,
  runOneScenario,
  isExpectedInvalidScenarioError,
  generateRunningTotals,
  collectValidationFlags,
  recordEngineCompletionOutcome,
  classifyReviewBasis,
  updateReviewAggregation,
  flushReviewAggregation,
  hashContextSeed,
  loadScenarioAppContext
};
