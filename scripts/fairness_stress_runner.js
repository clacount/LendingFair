#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_ENGINE = 'both';
const ENGINE_VALUES = new Set(['global', 'officer_lane', 'both']);
const REVIEW_SAMPLE_LIMIT = 10;
const FEASIBILITY_SAMPLE_LIMIT = 10;
const EXACT_FEASIBILITY_MAX_LOANS = 10;
const EXACT_FEASIBILITY_MAX_OFFICERS = 6;
const EXACT_FEASIBILITY_AUTO_BUDGET_CAP = 20000;
const PROGRESS_LOG_INTERVAL_MS = 30000;
const FEASIBILITY_PROGRESS_LOG_INTERVAL_MS = 15000;
const CONSUMER_LOAN_TYPES = ['Personal', 'Auto', 'Credit Card', 'Collateralized'];
const MORTGAGE_LOAN_TYPES = ['HELOC', 'First Mortgage', 'Home Refi'];
let caseFileSequence = 0;
const OFFICER_ROLE_CODES = Object.freeze({
  CONSUMER: 'C',
  FLEX: 'F',
  MORTGAGE: 'M'
});

const FEASIBILITY_CLASSIFICATIONS = Object.freeze({
  AVOIDABLE: 'avoidable_review',
  UNAVOIDABLE: 'unavoidable_review',
  UNKNOWN: 'feasibility_unknown_budget_exhausted'
});

function isMortgageType(type = '') {
  return MORTGAGE_LOAN_TYPES.includes(String(type || ''));
}

function getLoanCategory(type = '') {
  return isMortgageType(type) ? 'mortgage' : 'consumer';
}

function getGoalAmountForLoan(loan = {}) {
  const amount = Number(loan.amountRequested);
  return Number.isFinite(amount) ? amount : 0;
}

function parseArgs(argv) {
  const args = {
    durationMinutes: null,
    maxIterations: null,
    seedStart: 1,
    outputDir: null,
    engine: DEFAULT_ENGINE,
    maxCases: null,
    replay: null,
    analyzeReviewFeasibility: false,
    feasibilityBudget: 2000
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
      case '--analyze-review-feasibility':
        args.analyzeReviewFeasibility = true;
        break;
      case '--feasibility-budget':
        args.feasibilityBudget = Number(argv[++i]);
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
  if (!(args.feasibilityBudget > 0)) {
    throw new Error('--feasibility-budget must be > 0');
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
    'src/services/fairnessEngines/globalFairnessEngine.js',
    'src/services/fairnessEngines/officerLaneFairnessEngine.js',
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

function formatDurationSeconds(totalSeconds = 0) {
  const normalizedSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function logStressProgress({
  logs,
  startedAtMs,
  endTimeMs,
  iteration,
  nextSeed,
  engineRunStats,
  failuresCount,
  suspiciousCount,
  skippedInvalidScenarioCount,
  avoidableReviewCount,
  unavoidableReviewCount,
  feasibilityUnknownCount
}) {
  const completedRuns = engineRunStats.global.completedRuns + engineRunStats.officer_lane.completedRuns;
  const passCount = engineRunStats.global.passCount + engineRunStats.officer_lane.passCount;
  const reviewCount = engineRunStats.global.reviewCount + engineRunStats.officer_lane.reviewCount;
  const unknownResultCount = engineRunStats.global.unknownResultCount + engineRunStats.officer_lane.unknownResultCount;
  const elapsedSeconds = (Date.now() - startedAtMs) / 1000;
  const remainingSeconds = Math.max(0, (endTimeMs - Date.now()) / 1000);
  const progressLine = `[${nowIso()}] progress iterations=${iteration} nextSeed=${nextSeed} elapsed=${formatDurationSeconds(elapsedSeconds)} remaining=${formatDurationSeconds(remainingSeconds)} completedRuns=${completedRuns} passCount=${passCount} reviewCount=${reviewCount} avoidableReviewCount=${avoidableReviewCount} unavoidableReviewCount=${unavoidableReviewCount} feasibilityUnknownCount=${feasibilityUnknownCount} failuresCount=${failuresCount} suspiciousCount=${suspiciousCount} skippedInvalidScenarioCount=${skippedInvalidScenarioCount} unknownResultCount=${unknownResultCount}`;
  console.log(progressLine);
  appendLine(logs.summaryLog, progressLine);
}

function logFeasibilityProgress({
  logs,
  seed,
  engine,
  reviewBasis,
  searchType,
  evaluationsRun,
  evaluationBudget
}) {
  const progressLine = `[${nowIso()}] feasibility_progress seed=${seed} engine=${engine} reviewBasis=${reviewBasis} searchType=${searchType} evaluationsRun=${evaluationsRun} evaluationBudget=${evaluationBudget}`;
  console.log(progressLine);
  appendLine(logs.summaryLog, progressLine);
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
    /^please add at least one loan\.?$/,
    /^please add at least one active loan officer\.?$/
  ];

  return knownInvalidScenarioPatterns.some((pattern) => pattern.test(normalized));
}

function getMetricForVarianceDescriptor(descriptorKey, metrics = {}) {
  const globalCountVariance = metrics.maxCountVariancePercent;
  const globalDollarVariance = metrics.maxAmountVariancePercent;
  const globalCountNormalizedMargin = isFiniteNumber(globalCountVariance)
    ? (globalCountVariance - 15) / 15
    : null;
  const globalDollarNormalizedMargin = isFiniteNumber(globalDollarVariance)
    ? (globalDollarVariance - 20) / 20
    : null;

  const varianceDescriptors = {
    global_count_variance: globalCountVariance,
    global_dollar_variance: globalDollarVariance,
    global_count_and_dollar_variance:
      isFiniteNumber(globalCountNormalizedMargin) && isFiniteNumber(globalDollarNormalizedMargin)
        ? (globalCountNormalizedMargin >= globalDollarNormalizedMargin ? globalCountVariance : globalDollarVariance)
        : null,
    consumer_lane_count_variance: metrics.consumerVariance?.maxCountVariancePercent,
    consumer_lane_dollar_variance: metrics.consumerVariance?.maxAmountVariancePercent,
    flex_lane_count_variance: metrics.flexVariance?.maxCountVariancePercent,
    flex_lane_dollar_variance: metrics.flexVariance?.maxAmountVariancePercent,
    mortgage_lane_count_variance: metrics.mortgageVariance?.maxCountVariancePercent,
    mortgage_lane_dollar_variance: metrics.mortgageVariance?.maxAmountVariancePercent,
    heloc_weighted_variance: metrics.helocWeightedVariancePercent
  };
  return varianceDescriptors[descriptorKey];
}

function isVarianceDescriptorKey(descriptorKey) {
  return descriptorKey in {
    global_count_variance: true,
    global_dollar_variance: true,
    global_count_and_dollar_variance: true,
    consumer_lane_count_variance: true,
    consumer_lane_dollar_variance: true,
    flex_lane_count_variance: true,
    flex_lane_dollar_variance: true,
    mortgage_lane_count_variance: true,
    mortgage_lane_dollar_variance: true,
    heloc_weighted_variance: true
  };
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

    const descriptor = evalObj.statusMetricDescriptor;
    if (!descriptor || typeof descriptor !== 'object') {
      suspicious.push('missing statusMetricDescriptor for global');
    } else {
      const descriptorKey = descriptor.key;
      const allowedGlobalDescriptorKeys = {
        global_count_variance: true,
        global_dollar_variance: true,
        global_count_and_dollar_variance: true
      };
      if (!allowedGlobalDescriptorKeys[descriptorKey]) {
        suspicious.push('statusMetricDescriptor key invalid for global');
      }

      const metricUsed = getMetricForVarianceDescriptor(descriptorKey, metrics);
      if (descriptor.valuePercent !== null
        && descriptor.valuePercent !== undefined
        && isFiniteNumber(metricUsed)
        && Math.abs(Number(descriptor.valuePercent) - Number(metricUsed)) > 0.2) {
        suspicious.push('statusMetricDescriptor inconsistent with actual result basis');
      }
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
    const descriptorUsesVarianceMetric = isVarianceDescriptorKey(descriptorKey);

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
    reviewFeasibility: runMetadata.reviewFeasibility || null,
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
  if (isVarianceDescriptorKey(descriptorKey) || isPolicyDescriptorKey(descriptorKey)) {
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
    return fairnessEvaluation?.statusMetricDescriptor?.key || classifyGlobalReviewBasis(metrics);
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

function createEmptyAssignments(officers = []) {
  return Object.fromEntries(officers.map((officer) => [officer.name, []]));
}

function createLoanAssignmentsFromMap(assignmentMap = {}, loansByName = {}) {
  return Object.entries(assignmentMap).map(([loanName, officerName]) => ({
    loan: loansByName[loanName],
    officers: [officerName],
    shared: false
  })).filter((entry) => entry.loan && entry.officers[0]);
}

function normalizeEligibilityForCandidate(officer = {}, context = {}) {
  if (context?.LoanCategoryUtils?.normalizeOfficerEligibility) {
    return context.LoanCategoryUtils.normalizeOfficerEligibility(officer.eligibility);
  }
  const eligibility = officer?.eligibility || {};
  return {
    consumer: Boolean(eligibility.consumer),
    mortgage: Boolean(eligibility.mortgage)
  };
}

function getLoanCategoryForCandidate(context = {}, loan = {}) {
  if (typeof context.getLoanCategoryForType === 'function') {
    return context.getLoanCategoryForType(loan.type);
  }
  const normalizedType = String(loan?.type || '').toLowerCase();
  if (normalizedType.includes('mortgage') || normalizedType.includes('refi') || normalizedType.includes('heloc')) {
    return 'mortgage';
  }
  return 'consumer';
}

function getMortgagePermissionLevelForCandidate(context = {}, loan = {}) {
  if (typeof context.getMortgageLoanPermissionLevel === 'function') {
    return context.getMortgageLoanPermissionLevel(loan.type);
  }
  return String(loan?.type || '').toLowerCase().includes('heloc') ? 'heloc' : 'full-mortgage';
}

function getCandidateOfficerNamesForLoan({ context = {}, scenario = {}, loan = {}, engine = 'global' }) {
  const officers = Array.isArray(scenario.officers) ? scenario.officers : [];
  const activeOfficers = officers.filter((officer) => !officer.isOnVacation);
  const loanCategory = getLoanCategoryForCandidate(context, loan);
  const mortgagePermissionLevel = getMortgagePermissionLevelForCandidate(context, loan);

  return activeOfficers
    .filter((officer) => {
      const eligibility = normalizeEligibilityForCandidate(officer, context);
      if (loanCategory === 'mortgage') {
        if (!eligibility.mortgage || (!eligibility.consumer && !eligibility.mortgage)) {
          return false;
        }
        const isFlex = eligibility.consumer && eligibility.mortgage;
        if (mortgagePermissionLevel !== 'heloc' && isFlex && !officer.mortgageOverride) {
          return false;
        }
      } else if (!eligibility.consumer) {
        return false;
      }

      if (engine === 'officer_lane' && typeof context.isOfficerEligibleForLoanType === 'function') {
        return context.isOfficerEligibleForLoanType(officer, loan);
      }
      if (typeof context.isOfficerEligibleForLoanType === 'function') {
        return context.isOfficerEligibleForLoanType(officer, loan);
      }
      return true;
    })
    .map((officer) => officer.name);
}

function detectHelocOnlySupportPool({ context = {}, scenario = {} }) {
  const loans = Array.isArray(scenario.loans) ? scenario.loans : [];
  const allScenarioOfficers = Array.isArray(scenario.officers) ? scenario.officers : [];
  const loanTypeNames = loans.map((loan) => (
    typeof context.getMortgageLoanPermissionLevel === 'function'
      ? context.getMortgageLoanPermissionLevel(loan.type)
      : getMortgagePermissionLevelForCandidate(context, loan)
  ));

  if (typeof context?.FairnessEngineService?.isHomogeneousHelocSupportPool === 'function') {
    return context.FairnessEngineService.isHomogeneousHelocSupportPool({
      officers: allScenarioOfficers,
      hasConsumerLoans: false,
      loanTypeNames
    });
  }

  return loans.length > 0 && loans.every((loan) => getMortgagePermissionLevelForCandidate(context, loan) === 'heloc');
}

function buildCandidateOptimizationMetrics({ context = {}, scenario = {}, assignmentMap = {}, fallbackOptimizationMetrics = {} }) {
  const helocOnlySupportPool = detectHelocOnlySupportPool({ context, scenario });
  if (!helocOnlySupportPool) {
    return { optimizationMetrics: fallbackOptimizationMetrics, helocRecalculationUnavailable: false };
  }

  if (typeof context.getHomogeneousHelocWeightedVariancePercent !== 'function') {
    return { optimizationMetrics: { helocWeightedVariancePercent: null }, helocRecalculationUnavailable: true };
  }

  const officers = (scenario.officers || []).filter((officer) => !officer.isOnVacation);
  const cleanOfficerNames = officers.map((officer) => officer.name);
  const officersByName = Object.fromEntries(officers.map((officer) => [officer.name, officer]));
  const loansByName = Object.fromEntries((scenario.loans || []).map((loan) => [loan.name, loan]));
  const loanToOfficerMap = new Map(Object.entries(assignmentMap).map(([loanName, officerName]) => [loansByName[loanName], officerName]).filter(([loan]) => Boolean(loan)));
  const weighted = context.getHomogeneousHelocWeightedVariancePercent({
    loanToOfficerMap,
    cleanLoans: scenario.loans || [],
    cleanOfficerNames,
    officersByName
  });

  return {
    optimizationMetrics: { helocWeightedVariancePercent: Number.isFinite(weighted) ? weighted : null },
    helocRecalculationUnavailable: false
  };
}

function evaluateAssignmentCandidate({
  context,
  scenario,
  engine,
  assignmentMap,
  optimizationMetrics = {}
}) {
  const officers = Array.isArray(scenario.officers) ? scenario.officers : [];
  const allOfficerNames = officers.map((officer) => officer.name);
  const officerAssignments = Object.fromEntries(allOfficerNames.map((officerName) => [officerName, []]));
  const loansByName = Object.fromEntries((scenario.loans || []).map((loan) => [loan.name, loan]));

  Object.entries(assignmentMap || {}).forEach(([loanName, officerName]) => {
    const loan = loansByName[loanName];
    if (loan && officerAssignments[officerName]) {
      officerAssignments[officerName].push(loan);
    }
  });

  const result = {
    officerAssignments,
    runningTotalsUsed: scenario.runningTotals?.officers || {},
    loanAssignments: createLoanAssignmentsFromMap(assignmentMap, loansByName),
    optimizationFinalHelocWeightedVariancePercent: optimizationMetrics.helocWeightedVariancePercent
  };

  const officerStats = typeof context.getOfficerStatsFromResult === 'function'
    ? context.getOfficerStatsFromResult(result)
    : buildOfficerStats(result, context);

  const candidateOptimization = buildCandidateOptimizationMetrics({
    context,
    scenario,
    assignmentMap,
    fallbackOptimizationMetrics: optimizationMetrics
  });

  const fairnessEvaluation = context.FairnessEngineService.evaluateFairness({
    engineType: engine,
    officers,
    officerStats,
    optimizationMetrics: candidateOptimization.optimizationMetrics
  });

  return {
    fairnessEvaluation,
    officerStats,
    result,
    helocRecalculationUnavailable: candidateOptimization.helocRecalculationUnavailable
  };
}

function getMetricDistanceToPass(fairnessEvaluation = {}, engine = 'global') {
  const metrics = fairnessEvaluation?.metrics || {};
  const over = (value, threshold) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue - threshold) : 0;
  };

  if (engine === 'global') {
    return over(metrics.maxCountVariancePercent, 15) + over(metrics.maxAmountVariancePercent, 20);
  }

  const roleAwareFlags = fairnessEvaluation?.roleAwareFlags || {};
  const supportMode = Boolean(roleAwareFlags.helocOnlySupportThresholdsApplied);
  if (supportMode) {
    const weighted = Number(metrics.helocWeightedVariancePercent);
    if (!Number.isFinite(weighted)) {
      return Number.POSITIVE_INFINITY;
    }
    return over(weighted, 20) + over(weighted, 25);
  }

  const lanePenalty = (
    over(metrics.consumerVariance?.maxCountVariancePercent, 15)
    + over(metrics.consumerVariance?.maxAmountVariancePercent, 20)
    + over(metrics.flexVariance?.maxCountVariancePercent, 15)
    + over(metrics.flexVariance?.maxAmountVariancePercent, 20)
    + over(metrics.mortgageVariance?.maxCountVariancePercent, 15)
    + over(metrics.mortgageVariance?.maxAmountVariancePercent, 20)
  );

  if (lanePenalty > 0) {
    return lanePenalty;
  }

  return fairnessEvaluation?.overallResult === 'PASS' ? 0 : 1000;
}

function buildFeasibilityCandidateSummary({
  fairnessEvaluation = null,
  assignmentMap = null,
  reviewBasis = '',
  evaluationsRun = 0
}) {
  return {
    foundPassAssignment: fairnessEvaluation?.overallResult === 'PASS',
    bestAchievableMetrics: fairnessEvaluation?.metrics || null,
    bestDescriptor: fairnessEvaluation?.statusMetricDescriptor || null,
    bestAssignmentMap: assignmentMap,
    reviewBasis,
    feasibilityEvaluationsRun: evaluationsRun
  };
}

function normalizeRunningTotalsOfficerStats(stats = {}) {
  const typeCounts = stats && typeof stats.typeCounts === 'object' ? stats.typeCounts : {};
  const totalLoanCount = Number(stats.totalLoanCount ?? stats.loanCount ?? 0) || 0;
  const totalAmountRequested = Number(stats.totalAmountRequested || 0) || 0;
  const mortgageLoanCount = Object.entries(typeCounts).reduce((sum, [typeName, count]) => (
    isMortgageType(typeName) ? sum + (Number(count) || 0) : sum
  ), 0);
  const consumerLoanCount = Math.max(0, totalLoanCount - mortgageLoanCount);
  let mortgageAmount = Number(stats.mortgageAmount);
  let consumerAmount = Number(stats.consumerAmount);

  if (!Number.isFinite(mortgageAmount) || !Number.isFinite(consumerAmount)) {
    if (mortgageLoanCount > 0 && consumerLoanCount === 0) {
      mortgageAmount = totalAmountRequested;
      consumerAmount = 0;
    } else if (consumerLoanCount > 0 && mortgageLoanCount === 0) {
      mortgageAmount = 0;
      consumerAmount = totalAmountRequested;
    } else {
      const categorizedLoanCount = mortgageLoanCount + consumerLoanCount;
      const mortgageShare = categorizedLoanCount ? (mortgageLoanCount / categorizedLoanCount) : 0;
      mortgageAmount = totalAmountRequested * mortgageShare;
      consumerAmount = totalAmountRequested - mortgageAmount;
    }
  }

  return {
    totalLoanCount,
    totalAmountRequested,
    mortgageLoanCount,
    consumerLoanCount,
    mortgageAmount,
    consumerAmount
  };
}

function getActiveOfficerPopulationForReviewBasis(scenario = {}, reviewBasis = '') {
  const activeOfficers = (scenario.officers || []).filter((officer) => !officer.isOnVacation);
  if (reviewBasis === 'flex_lane_dollar_variance') {
    return activeOfficers.filter((officer) => officer.eligibility?.consumer && officer.eligibility?.mortgage);
  }
  if (reviewBasis === 'consumer_lane_dollar_variance') {
    const consumerOnlyOfficers = activeOfficers.filter((officer) => officer.eligibility?.consumer && !officer.eligibility?.mortgage);
    return consumerOnlyOfficers.length ? consumerOnlyOfficers : activeOfficers;
  }
  if (reviewBasis === 'mortgage_lane_dollar_variance') {
    const mortgageOnlyOfficers = activeOfficers.filter((officer) => !officer.eligibility?.consumer && officer.eligibility?.mortgage);
    return mortgageOnlyOfficers.length ? mortgageOnlyOfficers : activeOfficers;
  }
  return activeOfficers;
}

function getRelevantFixedAmountsForReviewBasis(scenario = {}, reviewBasis = '') {
  const relevantOfficers = getActiveOfficerPopulationForReviewBasis(scenario, reviewBasis);
  return relevantOfficers.map((officer) => {
    const prior = normalizeRunningTotalsOfficerStats(scenario.runningTotals?.officers?.[officer.name] || {});
    if (reviewBasis === 'consumer_lane_dollar_variance') {
      return Number(prior.consumerAmount) || 0;
    }
    if (reviewBasis === 'mortgage_lane_dollar_variance') {
      return Number(prior.mortgageAmount) || 0;
    }
    return Number(prior.totalAmountRequested) || 0;
  });
}

function getRelevantAssignableAmountForReviewBasis(loans = [], reviewBasis = '') {
  return loans.reduce((sum, loan) => {
    const amount = getGoalAmountForLoan(loan);
    if (reviewBasis === 'consumer_lane_dollar_variance') {
      return getLoanCategory(loan.type) === 'consumer' ? sum + amount : sum;
    }
    if (reviewBasis === 'mortgage_lane_dollar_variance') {
      return getLoanCategory(loan.type) === 'mortgage' ? sum + amount : sum;
    }
    return sum + amount;
  }, 0);
}

function calculateOptimisticMinimumWithAdditionalAmount(fixedAmounts = [], additionalAmount = 0) {
  if (!fixedAmounts.length) {
    return 0;
  }
  let low = Math.min(...fixedAmounts);
  let high = Math.max(...fixedAmounts);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const needed = fixedAmounts.reduce((sum, amount) => (
      sum + Math.max(0, Math.min(mid, high) - amount)
    ), 0);
    if (needed <= additionalAmount) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.min(low, Math.max(...fixedAmounts));
}

function getDollarVarianceUnavoidabilityLowerBoundPercent(scenario = {}, loans = [], reviewBasis = '') {
  if (!String(reviewBasis || '').endsWith('_dollar_variance') && reviewBasis !== 'global_dollar_variance') {
    return null;
  }
  const fixedAmounts = getRelevantFixedAmountsForReviewBasis(scenario, reviewBasis);
  if (!fixedAmounts.length) {
    return null;
  }
  const additionalAmount = getRelevantAssignableAmountForReviewBasis(loans, reviewBasis);
  const totalAmount = fixedAmounts.reduce((sum, amount) => sum + amount, 0) + additionalAmount;
  if (!totalAmount) {
    return 0;
  }
  const highestFixedAmount = Math.max(...fixedAmounts);
  const optimisticMinimum = calculateOptimisticMinimumWithAdditionalAmount(fixedAmounts, additionalAmount);
  return ((highestFixedAmount - optimisticMinimum) / totalAmount) * 100;
}

function getDollarVarianceUnavoidabilityThreshold(reviewBasis = '') {
  if (reviewBasis === 'consumer_lane_dollar_variance') {
    return 25;
  }
  return 20;
}

function estimateExactFeasibilitySearchSpace(loans = [], eligibleByLoan = {}, cap = EXACT_FEASIBILITY_AUTO_BUDGET_CAP) {
  let total = 1;
  for (let i = 0; i < loans.length; i += 1) {
    const loan = loans[i];
    const eligibleCount = Array.isArray(eligibleByLoan[loan.name]) ? eligibleByLoan[loan.name].length : 0;
    if (!eligibleCount) {
      return 0;
    }
    total *= eligibleCount;
    if (!Number.isFinite(total) || total > cap) {
      return null;
    }
  }
  return total;
}

function analyzeReviewFeasibility({
  context,
  scenario,
  engine,
  run,
  reviewBasis,
  evaluationBudget = 2000,
  autoExpandExactSearchBudget = true,
  onProgress = null
}) {
  const activeOfficers = (scenario.officers || []).filter((officer) => !officer.isOnVacation);
  const scenarioLoans = Array.isArray(scenario.loans) ? scenario.loans : [];
  const scenarioLoanByName = Object.fromEntries(scenarioLoans.map((loan) => [loan.name, loan]));
  const runLoanAssignments = Array.isArray(run?.result?.loanAssignments) ? run.result.loanAssignments : [];
  const runLoanNames = new Set(
    runLoanAssignments
      .map((entry) => entry?.loan?.name)
      .map((loanName) => String(loanName || '').trim())
      .filter(Boolean)
  );
  const loans = runLoanNames.size > 0
    ? [...runLoanNames].map((loanName) => scenarioLoanByName[loanName]).filter(Boolean)
    : scenarioLoans;
  const optimizationMetrics = deriveOptimizationMetricsForFairness(run?.result || {});
  const eligibleByLoan = {};
  loans.forEach((loan) => {
    const eligible = getCandidateOfficerNamesForLoan({
      context,
      scenario,
      loan,
      engine
    });
    eligibleByLoan[loan.name] = eligible;
  });

  if (loans.some((loan) => !eligibleByLoan[loan.name]?.length)) {
    return {
      classification: FEASIBILITY_CLASSIFICATIONS.UNAVOIDABLE,
      searchType: 'exact_search',
      ...buildFeasibilityCandidateSummary({
        fairnessEvaluation: run?.result?.fairnessEvaluation || null,
        assignmentMap: null,
        reviewBasis,
        evaluationsRun: 0
      })
    };
  }

  const searchType = (loans.length <= EXACT_FEASIBILITY_MAX_LOANS && activeOfficers.length <= EXACT_FEASIBILITY_MAX_OFFICERS)
    ? 'exact_search'
    : 'heuristic_bounded_search';
  const exactSearchSpaceSize = searchType === 'exact_search'
    ? estimateExactFeasibilitySearchSpace(loans, eligibleByLoan)
    : null;
  const effectiveEvaluationBudget = (
    searchType === 'exact_search'
    && autoExpandExactSearchBudget
    && Number.isFinite(exactSearchSpaceSize)
    && exactSearchSpaceSize !== null
  )
    ? Math.max(evaluationBudget, exactSearchSpaceSize)
    : evaluationBudget;
  let nextProgressLogAt = Date.now() + FEASIBILITY_PROGRESS_LOG_INTERVAL_MS;

  let evaluationsRun = 0;
  let bestFairness = run?.result?.fairnessEvaluation || null;
  let bestAssignmentMap = null;
  let bestDistance = getMetricDistanceToPass(bestFairness, engine);
  let helocRecalculationUnavailable = false;
  let passFairness = null;
  let passAssignmentMap = null;
  const lowerBoundDollarVariancePercent = getDollarVarianceUnavoidabilityLowerBoundPercent(scenario, loans, reviewBasis);
  const lowerBoundUnavoidabilityThreshold = getDollarVarianceUnavoidabilityThreshold(reviewBasis);
  if (Number.isFinite(lowerBoundDollarVariancePercent) && lowerBoundDollarVariancePercent > lowerBoundUnavoidabilityThreshold) {
    return {
      classification: FEASIBILITY_CLASSIFICATIONS.UNAVOIDABLE,
      searchType,
      ...buildFeasibilityCandidateSummary({
        fairnessEvaluation: run?.result?.fairnessEvaluation || null,
        assignmentMap: null,
        reviewBasis,
        evaluationsRun: 0
      })
    };
  }

  const evaluateMap = (assignmentMap) => {
    if (evaluationsRun >= effectiveEvaluationBudget) {
      return null;
    }
    evaluationsRun += 1;
    if (typeof onProgress === 'function' && Date.now() >= nextProgressLogAt) {
      onProgress({
        searchType,
        evaluationsRun,
        evaluationBudget: effectiveEvaluationBudget
      });
      nextProgressLogAt = Date.now() + FEASIBILITY_PROGRESS_LOG_INTERVAL_MS;
    }
    const candidate = evaluateAssignmentCandidate({
      context,
      scenario,
      engine,
      assignmentMap,
      optimizationMetrics
    });
    helocRecalculationUnavailable = helocRecalculationUnavailable || Boolean(candidate.helocRecalculationUnavailable);
    if (candidate.fairnessEvaluation?.overallResult === 'PASS') {
      passFairness = candidate.fairnessEvaluation;
      passAssignmentMap = { ...assignmentMap };
    }
    const candidateDistance = getMetricDistanceToPass(candidate.fairnessEvaluation, engine);
    if (candidateDistance < bestDistance || bestAssignmentMap === null) {
      bestDistance = candidateDistance;
      bestFairness = candidate.fairnessEvaluation;
      bestAssignmentMap = { ...assignmentMap };
    }
    return candidate;
  };

  if (searchType === 'exact_search') {
    const orderedLoans = [...loans].sort((a, b) => (eligibleByLoan[a.name].length - eligibleByLoan[b.name].length));
    const assignmentMap = {};
    let foundPass = false;
    let exhausted = true;
    let budgetExhausted = false;

    const walk = (loanIndex) => {
      if (foundPass) return;
      if (evaluationsRun >= effectiveEvaluationBudget) {
        budgetExhausted = true;
        exhausted = false;
        return;
      }
      if (loanIndex >= orderedLoans.length) {
        const candidate = evaluateMap(assignmentMap);
        if (!candidate) {
          budgetExhausted = true;
          exhausted = false;
          return;
        }
        if (candidate.fairnessEvaluation?.overallResult === 'PASS') {
          foundPass = true;
        }
        return;
      }
      const loan = orderedLoans[loanIndex];
      const eligible = eligibleByLoan[loan.name] || [];
      for (let i = 0; i < eligible.length; i += 1) {
        assignmentMap[loan.name] = eligible[i];
        walk(loanIndex + 1);
        if (foundPass) return;
        delete assignmentMap[loan.name];
      }
    };
    walk(0);

    const classification = foundPass
      ? FEASIBILITY_CLASSIFICATIONS.AVOIDABLE
      : (budgetExhausted || !exhausted || helocRecalculationUnavailable
        ? FEASIBILITY_CLASSIFICATIONS.UNKNOWN
        : FEASIBILITY_CLASSIFICATIONS.UNAVOIDABLE);

    return {
      classification,
      searchType,
      ...buildFeasibilityCandidateSummary({
        fairnessEvaluation: passFairness || bestFairness,
        assignmentMap: passAssignmentMap || bestAssignmentMap,
        reviewBasis,
        evaluationsRun
      })
    };
  }

  const baseAssignmentMap = Object.fromEntries((run?.result?.loanAssignments || []).map((entry) => [entry?.loan?.name, entry?.officers?.[0]]).filter((entry) => entry[0] && entry[1]));
  const queue = [];
  const seen = new Set();
  const enqueue = (map) => {
    const key = loans.map((loan) => `${loan.name}:${map[loan.name] || ''}`).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    queue.push({ ...map });
  };

  if (Object.keys(baseAssignmentMap).length === loans.length) {
    enqueue(baseAssignmentMap);
  }
  const deterministicStart = {};
  loans.forEach((loan) => { deterministicStart[loan.name] = eligibleByLoan[loan.name][0]; });
  enqueue(deterministicStart);
  const alternateStart = {};
  loans.forEach((loan) => {
    const eligible = eligibleByLoan[loan.name];
    alternateStart[loan.name] = eligible[(eligible.length > 1 ? 1 : 0)];
  });
  enqueue(alternateStart);

  let foundPass = false;
  let exhausted = true;
  let budgetExhausted = false;
  while (queue.length && evaluationsRun < evaluationBudget && !foundPass) {
    const current = queue.shift();
    const currentEval = evaluateMap(current);
    if (!currentEval) {
      budgetExhausted = true;
      exhausted = false;
      break;
    }
    if (currentEval.fairnessEvaluation?.overallResult === 'PASS') {
      foundPass = true;
      break;
    }

    loans.forEach((loan) => {
      const eligible = eligibleByLoan[loan.name];
      eligible.forEach((officerName) => {
        if (officerName === current[loan.name]) return;
        const next = { ...current, [loan.name]: officerName };
        enqueue(next);
      });
    });
  }
  if (queue.length > 0 && !foundPass && evaluationsRun >= evaluationBudget) {
    budgetExhausted = true;
    exhausted = false;
  }

  return {
    classification: foundPass
      ? (helocRecalculationUnavailable ? FEASIBILITY_CLASSIFICATIONS.UNKNOWN : FEASIBILITY_CLASSIFICATIONS.AVOIDABLE)
      : ((budgetExhausted || !exhausted || helocRecalculationUnavailable)
        ? FEASIBILITY_CLASSIFICATIONS.UNKNOWN
        : FEASIBILITY_CLASSIFICATIONS.UNAVOIDABLE),
    searchType,
    ...buildFeasibilityCandidateSummary({
      fairnessEvaluation: passFairness || bestFairness,
      assignmentMap: passAssignmentMap || bestAssignmentMap,
      reviewBasis,
      evaluationsRun
    })
  };
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

function createFeasibilityAggregationEntry() {
  return {
    count: 0,
    engines: new Set(),
    reviewBasis: new Set(),
    sampleCaseFiles: [],
    seeds: [],
    currentMetrics: [],
    bestAchievableMetrics: [],
    foundPassAssignment: false,
    bestAssignmentMap: null,
    feasibilitySearchType: new Set(),
    feasibilityEvaluationsRun: 0
  };
}

function updateFeasibilityAggregation(map, {
  reasonKey,
  engine,
  seed,
  caseFile,
  reviewBasis,
  currentMetrics,
  bestAchievableMetrics,
  foundPassAssignment,
  bestAssignmentMap,
  feasibilitySearchType,
  feasibilityEvaluationsRun
}) {
  if (!map.has(reasonKey)) {
    map.set(reasonKey, createFeasibilityAggregationEntry());
  }
  const entry = map.get(reasonKey);
  entry.count += 1;
  entry.engines.add(engine);
  if (reviewBasis) entry.reviewBasis.add(reviewBasis);
  if (caseFile && entry.sampleCaseFiles.length < FEASIBILITY_SAMPLE_LIMIT) entry.sampleCaseFiles.push(caseFile);
  if (entry.seeds.length < FEASIBILITY_SAMPLE_LIMIT) entry.seeds.push(seed);
  if (entry.currentMetrics.length < FEASIBILITY_SAMPLE_LIMIT) entry.currentMetrics.push(currentMetrics || null);
  if (entry.bestAchievableMetrics.length < FEASIBILITY_SAMPLE_LIMIT) entry.bestAchievableMetrics.push(bestAchievableMetrics || null);
  entry.foundPassAssignment = entry.foundPassAssignment || Boolean(foundPassAssignment);
  if (bestAssignmentMap && !entry.bestAssignmentMap) {
    entry.bestAssignmentMap = bestAssignmentMap;
  }
  if (feasibilitySearchType) entry.feasibilitySearchType.add(feasibilitySearchType);
  entry.feasibilityEvaluationsRun += Number(feasibilityEvaluationsRun) || 0;
}

function flushFeasibilityAggregation(filePath, map) {
  const output = {};
  [...map.entries()].forEach(([key, entry]) => {
    output[key] = {
      count: entry.count,
      engines: [...entry.engines],
      reviewBasis: [...entry.reviewBasis],
      sampleCaseFiles: entry.sampleCaseFiles,
      seeds: entry.seeds,
      currentMetrics: entry.currentMetrics,
      bestAchievableMetrics: entry.bestAchievableMetrics,
      foundPassAssignment: entry.foundPassAssignment,
      bestAssignmentMap: entry.bestAssignmentMap,
      feasibilitySearchType: [...entry.feasibilitySearchType],
      feasibilityEvaluationsRun: entry.feasibilityEvaluationsRun
    };
  });
  writeJsonFile(filePath, output);
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

function topAggregationPatterns(aggregationMap, limit = 5) {
  return [...aggregationMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([reason, entry]) => ({ reason, count: entry.count }));
}

function initLogs(outputDir) {
  ensureDir(outputDir);
  const summaryLog = path.join(outputDir, 'summary.log');
  const failuresLog = path.join(outputDir, 'failures.log');
  const suspiciousLog = path.join(outputDir, 'suspicious.log');
  const skippedLog = path.join(outputDir, 'skipped.log');
  const reasonCountsFile = path.join(outputDir, 'reason_counts.json');
  const reviewCountsFile = path.join(outputDir, 'review_counts.json');
  const reviewFeasibilitySummaryFile = path.join(outputDir, 'review_feasibility_summary.json');
  const avoidableReviewCountsFile = path.join(outputDir, 'avoidable_review_counts.json');
  const unavoidableReviewCountsFile = path.join(outputDir, 'unavoidable_review_counts.json');
  const feasibilityUnknownCountsFile = path.join(outputDir, 'feasibility_unknown_counts.json');
  [summaryLog, failuresLog, suspiciousLog, skippedLog].forEach((p) => fs.writeFileSync(p, '', 'utf8'));
  writeJsonFile(reasonCountsFile, {});
  writeJsonFile(reviewCountsFile, {});
  writeJsonFile(reviewFeasibilitySummaryFile, {});
  writeJsonFile(avoidableReviewCountsFile, {});
  writeJsonFile(unavoidableReviewCountsFile, {});
  writeJsonFile(feasibilityUnknownCountsFile, {});
  return {
    summaryLog,
    failuresLog,
    suspiciousLog,
    skippedLog,
    reasonCountsFile,
    reasonAggregationMap: new Map(),
    reviewCountsFile,
    reviewAggregationMap: new Map(),
    reviewFeasibilitySummaryFile,
    avoidableReviewCountsFile,
    unavoidableReviewCountsFile,
    feasibilityUnknownCountsFile,
    avoidableReviewAggregationMap: new Map(),
    unavoidableReviewAggregationMap: new Map(),
    feasibilityUnknownAggregationMap: new Map()
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
  const startedAtMs = Date.now();
  const endTime = startedAtMs + Math.floor(args.durationMinutes * 60 * 1000);
  let nextProgressLogAt = startedAtMs + PROGRESS_LOG_INTERVAL_MS;

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
      avoidableReviewCount: 0,
      unavoidableReviewCount: 0,
      feasibilityUnknownCount: 0,
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
      avoidableReviewCount: 0,
      unavoidableReviewCount: 0,
      feasibilityUnknownCount: 0,
      unknownResultCount: 0
    }
  };
  let avoidableReviewCount = 0;
  let unavoidableReviewCount = 0;
  let feasibilityUnknownCount = 0;

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

            if (args.analyzeReviewFeasibility) {
              appendLine(logs.summaryLog, `[${nowIso()}] feasibility_start seed=${seed} engine=${engine} reviewBasis=${reviewBasis}`);
              const feasibility = analyzeReviewFeasibility({
                context,
                scenario,
                engine,
                run,
                reviewBasis,
                evaluationBudget: args.feasibilityBudget,
                onProgress: ({ searchType, evaluationsRun, evaluationBudget }) => {
                  logFeasibilityProgress({
                    logs,
                    seed,
                    engine,
                    reviewBasis,
                    searchType,
                    evaluationsRun,
                    evaluationBudget
                  });
                }
              });
              appendLine(logs.summaryLog, `[${nowIso()}] feasibility_end seed=${seed} engine=${engine} reviewBasis=${reviewBasis} classification=${feasibility.classification} evaluationsRun=${feasibility.feasibilityEvaluationsRun || 0}`);

              const feasibilityCaseFile = writeCaseFile({
                outputDir: args.outputDir,
                seed,
                engine,
                scenario,
                result: run.result,
                reason: `review_feasibility:${reviewBasis}:${feasibility.classification}`,
                classification: feasibility.classification,
                runMetadata: {
                  ...run,
                  reviewFeasibility: feasibility
                }
              });

              if (feasibility.classification === FEASIBILITY_CLASSIFICATIONS.AVOIDABLE) {
                avoidableReviewCount += 1;
                if (engineRunStats[engine]) engineRunStats[engine].avoidableReviewCount += 1;
                updateFeasibilityAggregation(logs.avoidableReviewAggregationMap, {
                  reasonKey: reviewBasis,
                  engine,
                  seed,
                  caseFile: feasibilityCaseFile,
                  reviewBasis,
                  currentMetrics: run.result?.fairnessEvaluation?.metrics || null,
                  bestAchievableMetrics: feasibility.bestAchievableMetrics,
                  foundPassAssignment: feasibility.foundPassAssignment,
                  bestAssignmentMap: feasibility.bestAssignmentMap,
                  feasibilitySearchType: feasibility.searchType,
                  feasibilityEvaluationsRun: feasibility.feasibilityEvaluationsRun
                });
              } else if (feasibility.classification === FEASIBILITY_CLASSIFICATIONS.UNAVOIDABLE) {
                unavoidableReviewCount += 1;
                if (engineRunStats[engine]) engineRunStats[engine].unavoidableReviewCount += 1;
                updateFeasibilityAggregation(logs.unavoidableReviewAggregationMap, {
                  reasonKey: reviewBasis,
                  engine,
                  seed,
                  caseFile: feasibilityCaseFile,
                  reviewBasis,
                  currentMetrics: run.result?.fairnessEvaluation?.metrics || null,
                  bestAchievableMetrics: feasibility.bestAchievableMetrics,
                  foundPassAssignment: feasibility.foundPassAssignment,
                  bestAssignmentMap: feasibility.bestAssignmentMap,
                  feasibilitySearchType: feasibility.searchType,
                  feasibilityEvaluationsRun: feasibility.feasibilityEvaluationsRun
                });
              } else {
                feasibilityUnknownCount += 1;
                if (engineRunStats[engine]) engineRunStats[engine].feasibilityUnknownCount += 1;
                updateFeasibilityAggregation(logs.feasibilityUnknownAggregationMap, {
                  reasonKey: reviewBasis,
                  engine,
                  seed,
                  caseFile: feasibilityCaseFile,
                  reviewBasis,
                  currentMetrics: run.result?.fairnessEvaluation?.metrics || null,
                  bestAchievableMetrics: feasibility.bestAchievableMetrics,
                  foundPassAssignment: feasibility.foundPassAssignment,
                  bestAssignmentMap: feasibility.bestAssignmentMap,
                  feasibilitySearchType: feasibility.searchType,
                  feasibilityEvaluationsRun: feasibility.feasibilityEvaluationsRun
                });
              }
            }
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

    if (Date.now() >= nextProgressLogAt) {
      logStressProgress({
        logs,
        startedAtMs,
        endTimeMs: endTime,
        iteration,
        nextSeed: seed + 1,
        engineRunStats,
        failuresCount,
        suspiciousCount,
        skippedInvalidScenarioCount,
        avoidableReviewCount,
        unavoidableReviewCount,
        feasibilityUnknownCount
      });
      nextProgressLogAt = Date.now() + PROGRESS_LOG_INTERVAL_MS;
    }

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
    avoidableReviewCount,
    unavoidableReviewCount,
    feasibilityUnknownCount,
    unknownResultCount,
    engineRunStats,
    outputDirectory: args.outputDir,
    reviewReasonCountsPath: logs.reviewCountsFile,
    reviewFeasibilitySummaryPath: logs.reviewFeasibilitySummaryFile,
    avoidableReviewCountsPath: logs.avoidableReviewCountsFile,
    unavoidableReviewCountsPath: logs.unavoidableReviewCountsFile,
    feasibilityUnknownCountsPath: logs.feasibilityUnknownCountsFile,
    topAvoidableReasons: topAggregationPatterns(logs.avoidableReviewAggregationMap),
    topUnavoidableReasons: topAggregationPatterns(logs.unavoidableReviewAggregationMap),
    topUnknownReasons: topAggregationPatterns(logs.feasibilityUnknownAggregationMap),
    engineChangesMade: [],
    topRepeatedReviewReasons: reviewReasonPatterns.map(([reason, count]) => ({ reason, count })),
    topRepeatedSuspiciousPatterns: patterns.map(([reason, count]) => ({ reason, count }))
  };

  appendLine(logs.summaryLog, JSON.stringify(summary, null, 2));
  flushReasonAggregation(logs.reasonCountsFile, logs.reasonAggregationMap);
  flushReviewAggregation(logs.reviewCountsFile, logs.reviewAggregationMap);
  const feasibilitySummary = {
    completedRuns,
    passCount,
    reviewCount,
    avoidableReviewCount,
    unavoidableReviewCount,
    feasibilityUnknownCount,
    topAvoidableReasons: summary.topAvoidableReasons,
    topUnavoidableReasons: summary.topUnavoidableReasons,
    topUnknownReasons: summary.topUnknownReasons,
    engineRunStats,
    engineChangesMade: []
  };
  writeJsonFile(logs.reviewFeasibilitySummaryFile, feasibilitySummary);
  flushFeasibilityAggregation(logs.avoidableReviewCountsFile, logs.avoidableReviewAggregationMap);
  flushFeasibilityAggregation(logs.unavoidableReviewCountsFile, logs.unavoidableReviewAggregationMap);
  flushFeasibilityAggregation(logs.feasibilityUnknownCountsFile, logs.feasibilityUnknownAggregationMap);
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
  analyzeReviewFeasibility,
  evaluateAssignmentCandidate,
  getCandidateOfficerNamesForLoan,
  flushFeasibilityAggregation,
  hashContextSeed,
  loadScenarioAppContext
};
