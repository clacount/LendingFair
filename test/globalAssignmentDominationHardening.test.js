const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeSeededRandom(seed = 8) {
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

function loadAppContext(seed = 8) {
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

function getGoalAmountForLoan(loan) {
  return String(loan?.type || '').trim().toLowerCase() === 'credit card' ? 0 : Number(loan?.amountRequested || 0);
}

function isMortgageType(type) {
  return ['heloc', 'home refi', 'first mortgage'].includes(String(type || '').trim().toLowerCase());
}

function buildOfficerStats(officers, officerAssignments, runningTotals = { officers: {} }) {
  return officers.map((officer) => {
    const prior = runningTotals.officers?.[officer.name] || {};
    const priorTypeBreakdown = prior.typeCounts && typeof prior.typeCounts === 'object' ? { ...prior.typeCounts } : {};
    const assignedLoans = officerAssignments[officer.name] || [];
    const typeBreakdown = { ...priorTypeBreakdown };
    assignedLoans.forEach((loan) => {
      typeBreakdown[loan.type] = (typeBreakdown[loan.type] || 0) + 1;
    });
    const runAmount = assignedLoans.reduce((sum, loan) => sum + getGoalAmountForLoan(loan), 0);
    const runLoanCount = assignedLoans.length;
    const priorLoanCount = Number(prior.loanCount || 0);
    const priorAmount = Number(prior.totalAmountRequested || 0);
    const priorMortgageLoanCount = Object.entries(priorTypeBreakdown).reduce((sum, [type, count]) => (
      isMortgageType(type) ? sum + (Number(count) || 0) : sum
    ), 0);
    const priorConsumerLoanCount = Math.max(0, priorLoanCount - priorMortgageLoanCount);
    const priorMortgageAmountFromStats = Number(prior.mortgageAmount);
    const priorConsumerAmountFromStats = Number(prior.consumerAmount);
    let priorMortgageAmount = Number.isFinite(priorMortgageAmountFromStats) ? priorMortgageAmountFromStats : NaN;
    let priorConsumerAmount = Number.isFinite(priorConsumerAmountFromStats) ? priorConsumerAmountFromStats : NaN;
    if (!Number.isFinite(priorMortgageAmount) || !Number.isFinite(priorConsumerAmount)) {
      if (priorMortgageLoanCount > 0 && priorConsumerLoanCount === 0) {
        priorMortgageAmount = priorAmount;
        priorConsumerAmount = 0;
      } else if (priorConsumerLoanCount > 0 && priorMortgageLoanCount === 0) {
        priorMortgageAmount = 0;
        priorConsumerAmount = priorAmount;
      } else {
        const priorTotalCategorizedLoans = priorMortgageLoanCount + priorConsumerLoanCount;
        const mortgageShare = priorTotalCategorizedLoans ? (priorMortgageLoanCount / priorTotalCategorizedLoans) : 0;
        priorMortgageAmount = priorAmount * mortgageShare;
        priorConsumerAmount = priorAmount - priorMortgageAmount;
      }
    }
    const assignedMortgageLoanCount = assignedLoans.reduce((sum, loan) => (isMortgageType(loan.type) ? sum + 1 : sum), 0);
    const assignedConsumerLoanCount = assignedLoans.length - assignedMortgageLoanCount;
    const assignedMortgageAmount = assignedLoans.reduce((sum, loan) => (
      isMortgageType(loan.type) ? sum + getGoalAmountForLoan(loan) : sum
    ), 0);
    const assignedConsumerAmount = assignedLoans.reduce((sum, loan) => (
      isMortgageType(loan.type) ? sum : sum + getGoalAmountForLoan(loan)
    ), 0);

    const totalLoans = priorLoanCount + runLoanCount;
    const totalAmount = priorAmount + runAmount;
    const mortgageLoanCount = priorMortgageLoanCount + assignedMortgageLoanCount;
    const consumerLoanCount = priorConsumerLoanCount + assignedConsumerLoanCount;
    const mortgageAmount = priorMortgageAmount + assignedMortgageAmount;
    const consumerAmount = priorConsumerAmount + assignedConsumerAmount;

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
}

test('global mode seed-8 style HELOC scenario avoids avoidable all-to-one domination and improves fairness over forced domination', () => {
  const context = loadAppContext(8);
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } }
  ];
  const loans = [
    { name: 'H1', type: 'HELOC', amountRequested: 188244 },
    { name: 'H2', type: 'HELOC', amountRequested: 127895 },
    { name: 'H3', type: 'HELOC', amountRequested: 147834 },
    { name: 'H4', type: 'HELOC', amountRequested: 142515 },
    { name: 'H5', type: 'HELOC', amountRequested: 101793 }
  ];
  const runningTotals = {
    officers: {
      F1: { loanCount: 29, totalAmountRequested: 635134, typeCounts: { HELOC: 29 }, activeSessionCount: 8 },
      F2: { loanCount: 28, totalAmountRequested: 1243543, typeCounts: { HELOC: 28 }, activeSessionCount: 0 }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);
  const countByOfficer = Object.fromEntries(Object.entries(result.officerAssignments).map(([officer, assignedLoans]) => [officer, assignedLoans.length]));
  assert.notEqual(countByOfficer.F1 === 5 || countByOfficer.F2 === 5, true);
  assert.equal(result.fairnessAudit.some((entry) => entry.scoredOfficers.some((score) => Number(score.globalRunDominationPenalty) > 0)), true);
  assert.equal(result.fairnessAudit.every((entry) => entry.selectedOfficer === entry.scoredOfficers[0]?.officer), true);
  const guardAppliedEntry = result.fairnessAudit.find((entry) => entry.scoredOfficers[0]?.globalDominationGuardApplied);
  assert.equal(Boolean(guardAppliedEntry), true);
  assert.equal(
    Number(guardAppliedEntry.scoredOfficers[0].score) >= Number(guardAppliedEntry.scoredOfficers[1]?.score),
    true
  );
  const guardExplanation = context.buildAuditExplanation(guardAppliedEntry);
  assert.equal(/Global domination guard/i.test(guardExplanation), true);
  assert.equal(/avoid current-run concentration/i.test(guardExplanation), true);
  assert.equal(/best overall balance/i.test(guardExplanation), false);
  assert.equal(/0\\.0%/.test(guardExplanation), false);
  assert.equal(
    context.getAuditStatusLabel(guardAppliedEntry, guardAppliedEntry.scoredOfficers[0], 0),
    'Domination guard (chosen)'
  );
  const rawScoreLeader = guardAppliedEntry.scoredOfficers.reduce((best, candidate) => (
    !best || candidate.score < best.score ? candidate : best
  ), null);
  if (rawScoreLeader && rawScoreLeader.officer !== guardAppliedEntry.selectedOfficer) {
    const rawScoreLeaderIndex = guardAppliedEntry.scoredOfficers.findIndex((candidate) => candidate.officer === rawScoreLeader.officer);
    const rawLeaderLabel = context.getAuditStatusLabel(guardAppliedEntry, rawScoreLeader, rawScoreLeaderIndex);
    assert.equal(rawLeaderLabel.startsWith('Raw score leader (guarded choice +'), true);
  }

  const balancedEvaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers,
    officerStats: buildOfficerStats(officers, result.officerAssignments, runningTotals)
  });
  const forcedDominationEvaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers,
    officerStats: buildOfficerStats(officers, { F1: loans, F2: [] }, runningTotals)
  });

  assert.equal(
    balancedEvaluation.metrics.maxCountVariancePercent < forcedDominationEvaluation.metrics.maxCountVariancePercent,
    true
  );
});

test('global domination guard still respects prior totals and does not force equal counts', () => {
  const context = loadAppContext(8);
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } }
  ];
  const loans = Array.from({ length: 6 }, (_, index) => ({
    name: `H${index + 1}`,
    type: 'HELOC',
    amountRequested: 90000
  }));
  const runningTotals = {
    officers: {
      F1: { loanCount: 5, totalAmountRequested: 300000, typeCounts: { HELOC: 5 }, activeSessionCount: 4 },
      F2: { loanCount: 45, totalAmountRequested: 4200000, typeCounts: { HELOC: 45 }, activeSessionCount: 4 }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);
  const f1Count = result.officerAssignments.F1.length;
  const f2Count = result.officerAssignments.F2.length;
  assert.equal(f1Count >= f2Count, true);
});

test('global domination guard avoids obvious dollar-variance regressions when loan sizes are uneven', () => {
  const context = loadAppContext(8);
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.3 } }
  ];
  const loans = [
    { name: 'H1', type: 'HELOC', amountRequested: 250000 },
    { name: 'H2', type: 'HELOC', amountRequested: 30000 },
    { name: 'H3', type: 'HELOC', amountRequested: 30000 },
    { name: 'H4', type: 'HELOC', amountRequested: 30000 },
    { name: 'H5', type: 'HELOC', amountRequested: 30000 }
  ];
  const runningTotals = { officers: { F1: { activeSessionCount: 2 }, F2: { activeSessionCount: 2 } } };
  const result = context.assignLoans(officers, loans, runningTotals);
  const evaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers,
    officerStats: buildOfficerStats(officers, result.officerAssignments, runningTotals)
  });
  const forcedDominationEvaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'global',
    officers,
    officerStats: buildOfficerStats(officers, { F1: loans, F2: [] }, runningTotals)
  });

  assert.equal(evaluation.metrics.maxAmountVariancePercent <= forcedDominationEvaluation.metrics.maxAmountVariancePercent, true);
});

test('global post-assignment repair converts confirmed avoidable seed-45 count-variance REVIEW into PASS', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/global_seed45_avoidable_case.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const context = loadAppContext(fixture.seed);
  const result = context.assignLoans(fixture.officers, fixture.loans, fixture.runningTotals);

  assert.equal(fixture.observedFairness.overallResult, 'REVIEW');
  assert.equal(fixture.observedFairness.metrics.maxCountVariancePercent > 15, true);
  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.fairnessEvaluation.metrics.maxCountVariancePercent <= 15, true);
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTierReached, 'under_20');
  assert.equal(Number.isFinite(result.optimizationInitialGlobalVariancePercent), true);
  assert.equal(Number.isFinite(result.optimizationFinalGlobalVariancePercent), true);
  assert.equal(result.optimizationTargetLabel, 'global count variance');
  assert.equal(result.optimizationTargetDescriptorKey, 'global_count_variance');
  assert.equal(result.optimizationFinalGlobalVariancePercent <= result.optimizationInitialGlobalVariancePercent, true);
});

test('global baseline PASS does not emit misleading global-repair metadata', () => {
  const context = loadAppContext(11);
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } }
  ];
  const loans = [
    { name: 'L1', type: 'HELOC', amountRequested: 500000 },
    { name: 'L2', type: 'HELOC', amountRequested: 500000 }
  ];
  const runningTotals = { officers: { F1: { activeSessionCount: 2 }, F2: { activeSessionCount: 2 } } };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, false);
  assert.equal(result.optimizationTargetLabel ?? null, null);
  assert.equal(result.optimizationInitialGlobalVariancePercent ?? null, null);
  assert.equal(result.optimizationFinalGlobalVariancePercent ?? null, null);
});

test('officer-lane runs do not receive global post-assignment repair metadata', () => {
  const context = loadAppContext(12);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } }
  ];
  const loans = [
    { name: 'L1', type: 'HELOC', amountRequested: 400000 },
    { name: 'L2', type: 'HELOC', amountRequested: 420000 },
    { name: 'L3', type: 'HELOC', amountRequested: 410000 }
  ];
  const runningTotals = { officers: { F1: { activeSessionCount: 1 }, F2: { activeSessionCount: 1 } } };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.notEqual(result.optimizationTargetLabel, 'global variance');
  assert.equal(result.optimizationInitialGlobalVariancePercent ?? null, null);
  assert.equal(result.optimizationFinalGlobalVariancePercent ?? null, null);
});

test('officer-lane post-assignment optimization improves confirmed seed-46 flex-count avoidable REVIEW', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/officer_lane_seed46_flex_count_avoidable_case.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const context = loadAppContext(fixture.seed);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const result = context.assignLoans(fixture.officers, fixture.loans, fixture.runningTotals);

  assert.equal(fixture.observedFairness.overallResult, 'REVIEW');
  assert.equal(fixture.observedFairness.statusMetricDescriptor?.key, 'flex_lane_count_variance');
  assert.equal(fixture.observedFairness.metrics.flexVariance.maxCountVariancePercent > 15, true);
  // This captured scenario was originally avoidable. Deterministic replay should now land in a fair state
  // even if the baseline assignment itself already clears the issue before repair needs to run.
  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.match(String(result.optimizationTargetLabel || result.fairnessEvaluation?.statusMetricDescriptor?.label || ''), /flex-lane|flex/i);
  if (result.optimizationApplied) {
    assert.equal(result.optimizationTargetDescriptorKey, 'flex_lane_dollar_variance');
    assert.equal(result.optimizationInitialConsumerDollarVariance >= result.optimizationFinalConsumerDollarVariance, true);
  }
  const fixtureOfficersByName = Object.fromEntries(fixture.officers.map((officer) => [officer.name, officer]));
  result.loanAssignments.forEach((entry) => {
    const selectedOfficer = entry.officers?.[0];
    const officerConfig = fixtureOfficersByName[selectedOfficer];
    assert.equal(Boolean(officerConfig), true);
    assert.equal(officerConfig.isOnVacation, false);
    assert.equal(context.isOfficerEligibleForLoanType(officerConfig, entry.loan), true);
  });
  assert.equal(fixture.reviewFeasibilityBestMetrics.flexVariance.maxCountVariancePercent <= 15, true);
  assert.equal(fixture.reviewFeasibilityBestMetrics.flexVariance.maxAmountVariancePercent <= 20, true);
  assert.equal(Object.keys(fixture.reviewFeasibilityBestAssignmentMap || {}).length, fixture.loans.length);
});

test('officer-lane descriptor-targeted flex count optimization improves variance without policy/eligibility regressions on deterministic two-officer flex case', () => {
  const context = loadAppContext(101);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, isOnVacation: false },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, isOnVacation: false }
  ];
  const loans = [
    { name: 'L1', type: 'HELOC', amountRequested: 300000 },
    { name: 'L2', type: 'HELOC', amountRequested: 300000 },
    { name: 'L3', type: 'HELOC', amountRequested: 300000 },
    { name: 'L4', type: 'HELOC', amountRequested: 300000 }
  ];
  const runningTotals = {
    officers: {
      F1: { loanCount: 12, totalAmountRequested: 3600000, typeCounts: { HELOC: 12 }, activeSessionCount: 4 },
      F2: { loanCount: 0, totalAmountRequested: 0, typeCounts: { HELOC: 0 }, activeSessionCount: 4 }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);
  const forcedBaselineEvaluation = context.FairnessEngineService.evaluateFairness({
    engineType: 'officer_lane',
    officers,
    officerStats: buildOfficerStats(
      officers,
      { F1: loans, F2: [] },
      runningTotals
    )
  });

  assert.equal(result.optimizationTargetDescriptorKey, 'flex_lane_count_variance');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.fairnessEvaluation.metrics.flexVariance.maxCountVariancePercent < forcedBaselineEvaluation.metrics.flexVariance.maxCountVariancePercent, true);
  result.loanAssignments.forEach((entry) => {
    const officerName = entry.officers?.[0];
    const officer = officers.find((candidate) => candidate.name === officerName);
    assert.equal(Boolean(officer), true);
    assert.equal(officer.isOnVacation, false);
    assert.equal(context.isOfficerEligibleForLoanType(officer, entry.loan), true);
  });
});

test('global combined descriptor optimization includes count-sensitive loans and widens the search seeds', () => {
  const context = loadAppContext(202);
  context.FairnessEngineService.setSelectedFairnessEngine('global');

  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } },
    { name: 'F3', eligibility: { consumer: true, mortgage: true } }
  ];
  const loans = [
    { name: 'C1', type: 'Credit Card', amountRequested: 5000 },
    { name: 'H1', type: 'HELOC', amountRequested: 300000 },
    { name: 'H2', type: 'HELOC', amountRequested: 120000 }
  ];
  const runningTotals = { officers: {} };

  const result = {
    loanAssignments: loans.map((loan) => ({ loan, officers: ['F1'], shared: false })),
    officerAssignments: { F1: [...loans], F2: [], F3: [] },
    fairnessAudit: []
  };

  const captured = {};
  context.FairnessEngineService.evaluateFairness = () => ({
    overallResult: 'REVIEW',
    statusMetricDescriptor: { key: 'global_count_and_dollar_variance', valuePercent: 24 },
    metrics: {
      maxCountVariancePercent: 18,
      maxAmountVariancePercent: 24,
      consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 },
      mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }
    },
    summaryItems: [],
    notes: []
  });
  context.OfficerLaneOptimizationService.optimizeConsumerLaneAssignments = (options) => {
    captured.options = options;
    return {
      improved: false,
      optimizationRan: true,
      bestLoanToOfficerMap: new Map(result.loanAssignments.map((entry) => [entry.loan, entry.officers[0]])),
      evaluations: 3,
      initialVariancePercent: 24,
      finalVariancePercent: 20,
      tierReached: 'under_20',
      summaryMessage: 'stub'
    };
  };

  const optimized = context.optimizeGlobalAssignmentsResult({
    activeLoanTypes: ['Credit Card', 'HELOC'],
    cleanLoans: loans,
    cleanOfficerNames: officers.map((officer) => officer.name),
    allOfficerNames: officers.map((officer) => officer.name),
    officersByName: Object.fromEntries(officers.map((officer) => [officer.name, officer])),
    runningTotals,
    result
  });

  assert.equal(captured.options.targetLabel, 'global count/dollar variance');
  assert.equal(captured.options.shouldIncludeLoan(loans[0]), true);
  assert.equal(captured.options.frontierWidth > 1, true);
  assert.equal(captured.options.maxEvaluations >= 700, true);
  assert.equal((captured.options.seedLoanToOfficerMaps || []).length >= 3, true);
  assert.equal(optimized.optimizationTargetDescriptorKey, 'global_count_and_dollar_variance');
  assert.equal(optimized.optimizationTargetLabel, 'global count/dollar variance');
});

test('global optimization can continue across more than one descriptor transition', () => {
  const context = loadAppContext(203);
  context.FairnessEngineService.setSelectedFairnessEngine('global');

  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true } },
    { name: 'F2', eligibility: { consumer: true, mortgage: true } }
  ];
  const loans = [
    { name: 'L1', type: 'HELOC', amountRequested: 200000 },
    { name: 'L2', type: 'HELOC', amountRequested: 180000 }
  ];
  const runningTotals = { officers: {} };
  const result = {
    loanAssignments: loans.map((loan) => ({ loan, officers: ['F1'], shared: false })),
    officerAssignments: { F1: [...loans], F2: [] },
    fairnessAudit: []
  };

  const evaluations = [
    { overallResult: 'REVIEW', statusMetricDescriptor: { key: 'global_count_and_dollar_variance' }, metrics: { maxCountVariancePercent: 18, maxAmountVariancePercent: 24, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] },
    { overallResult: 'REVIEW', statusMetricDescriptor: { key: 'global_count_variance' }, metrics: { maxCountVariancePercent: 16, maxAmountVariancePercent: 18, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] },
    { overallResult: 'REVIEW', statusMetricDescriptor: { key: 'global_count_variance' }, metrics: { maxCountVariancePercent: 16, maxAmountVariancePercent: 18, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] },
    { overallResult: 'REVIEW', statusMetricDescriptor: { key: 'global_dollar_variance' }, metrics: { maxCountVariancePercent: 14, maxAmountVariancePercent: 21, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] },
    { overallResult: 'REVIEW', statusMetricDescriptor: { key: 'global_dollar_variance' }, metrics: { maxCountVariancePercent: 14, maxAmountVariancePercent: 21, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] },
    { overallResult: 'PASS', statusMetricDescriptor: { key: 'global_dollar_variance' }, metrics: { maxCountVariancePercent: 10, maxAmountVariancePercent: 19, consumerVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 }, mortgageVariance: { maxCountVariancePercent: 0, maxAmountVariancePercent: 0 } }, summaryItems: [], notes: [] }
  ];
  let evaluationIndex = 0;
  let optimizationCalls = 0;
  context.FairnessEngineService.evaluateFairness = () => evaluations[evaluationIndex++] || evaluations[evaluations.length - 1];
  context.OfficerLaneOptimizationService.optimizeConsumerLaneAssignments = () => {
    optimizationCalls += 1;
    return {
      improved: true,
      optimizationRan: true,
      bestLoanToOfficerMap: new Map([
        [loans[0], optimizationCalls % 2 === 1 ? 'F1' : 'F2'],
        [loans[1], 'F2']
      ]),
      evaluations: 5,
      initialVariancePercent: 24,
      finalVariancePercent: 19,
      tierReached: 'under_20',
      summaryMessage: 'stub'
    };
  };

  const optimized = context.optimizeGlobalAssignmentsResult({
    activeLoanTypes: ['HELOC'],
    cleanLoans: loans,
    cleanOfficerNames: officers.map((officer) => officer.name),
    allOfficerNames: officers.map((officer) => officer.name),
    officersByName: Object.fromEntries(officers.map((officer) => [officer.name, officer])),
    runningTotals,
    result
  });

  assert.equal(optimizationCalls, 3);
  assert.equal(optimized.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(optimized.optimizationTargetDescriptorKey, 'global_count_and_dollar_variance');
});

test('officer-lane post-assignment optimization uses zero-goal swap enablers to clear seed-119 flex-dollar review', () => {
  const context = loadAppContext(119);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    {
      name: 'F1',
      eligibility: { consumer: true, mortgage: true },
      weights: { consumer: 0.65, mortgage: 0.26 },
      mortgageOverride: false,
      isOnVacation: false
    },
    {
      name: 'F2',
      eligibility: { consumer: true, mortgage: true },
      weights: { consumer: 0.85, mortgage: 0.68 },
      mortgageOverride: false,
      isOnVacation: false
    }
  ];
  const loans = [
    { name: 'L7', type: 'Personal', amountRequested: 938905 },
    { name: 'L5', type: 'Credit Card', amountRequested: 5118 },
    { name: 'L13', type: 'Auto', amountRequested: 524597 },
    { name: 'L2', type: 'Credit Card', amountRequested: 4634 },
    { name: 'L10', type: 'Credit Card', amountRequested: 15250 },
    { name: 'L9', type: 'Auto', amountRequested: 1074079 },
    { name: 'L8', type: 'Credit Card', amountRequested: 21183 },
    { name: 'L15', type: 'Credit Card', amountRequested: 1010 },
    { name: 'L4', type: 'Credit Card', amountRequested: 3892 },
    { name: 'L12', type: 'Personal', amountRequested: 649686 },
    { name: 'L11', type: 'Auto', amountRequested: 583231 },
    { name: 'L1', type: 'Credit Card', amountRequested: 6525 },
    { name: 'L3', type: 'Personal', amountRequested: 1176299 },
    { name: 'L14', type: 'Collateralized', amountRequested: 1188702 },
    { name: 'L6', type: 'Credit Card', amountRequested: 13440 }
  ];
  const runningTotals = {
    officers: {
      F1: {
        officer: 'F1',
        totalLoanCount: 24,
        totalAmountRequested: 1693704,
        sessions: 4,
        typeCounts: {
          Personal: 7,
          Auto: 2,
          'Credit Card': 7,
          Collateralized: 2,
          HELOC: 2,
          'First Mortgage': 1,
          'Home Refi': 3
        }
      },
      F2: {
        officer: 'F2',
        totalLoanCount: 12,
        totalAmountRequested: 2005290,
        sessions: 8,
        typeCounts: {
          Personal: 0,
          Auto: 1,
          'Credit Card': 2,
          Collateralized: 3,
          HELOC: 0,
          'First Mortgage': 3,
          'Home Refi': 3
        }
      }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.fairnessEvaluation.metrics.flexVariance.maxAmountVariancePercent <= 20, true);
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationSummaryMessage.includes('primary flex-lane variance target band'), true);
});

test('officer-lane post-assignment optimization clears mortgage-only dollar review for seed-429 replay', () => {
  const context = loadAppContext(1834399973);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, isOnVacation: false },
    { name: 'M2', eligibility: { consumer: false, mortgage: true }, isOnVacation: false }
  ];
  const loans = [
    { name: 'L2', type: 'Home Refi', amountRequested: 280369 },
    { name: 'L13', type: 'First Mortgage', amountRequested: 687851 },
    { name: 'L10', type: 'First Mortgage', amountRequested: 964846 },
    { name: 'L12', type: 'Home Refi', amountRequested: 1153026 },
    { name: 'L3', type: 'First Mortgage', amountRequested: 631164 },
    { name: 'L8', type: 'First Mortgage', amountRequested: 1194380 },
    { name: 'L6', type: 'First Mortgage', amountRequested: 1000805 },
    { name: 'L11', type: 'First Mortgage', amountRequested: 828111 },
    { name: 'L4', type: 'Home Refi', amountRequested: 265702 },
    { name: 'L5', type: 'Home Refi', amountRequested: 568826 },
    { name: 'L9', type: 'Home Refi', amountRequested: 22508 },
    { name: 'L1', type: 'First Mortgage', amountRequested: 806891 },
    { name: 'L14', type: 'Home Refi', amountRequested: 627861 },
    { name: 'L7', type: 'First Mortgage', amountRequested: 97596 }
  ];
  const runningTotals = {
    officers: {
      M1: {
        officer: 'M1',
        totalLoanCount: 11,
        totalAmountRequested: 4792201,
        sessions: 6,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 0,
          'First Mortgage': 4,
          'Home Refi': 7
        }
      },
      M2: {
        officer: 'M2',
        totalLoanCount: 14,
        totalAmountRequested: 2390072,
        sessions: 1,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 2,
          'First Mortgage': 7,
          'Home Refi': 5
        }
      }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'mortgage_lane_dollar_variance');
  assert.equal(result.fairnessEvaluation.metrics.mortgageVariance.maxAmountVariancePercent <= 20, true);
  assert.equal(result.optimizationSummaryMessage.includes('primary mortgage-lane variance target band'), true);
});

test('officer-lane post-assignment optimization clears mortgage-only count review for seed-434 replay', () => {
  const context = loadAppContext(715548839);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, isOnVacation: false },
    { name: 'M2', eligibility: { consumer: false, mortgage: true }, isOnVacation: false },
    { name: 'M3', eligibility: { consumer: false, mortgage: true }, isOnVacation: false },
    { name: 'M4', eligibility: { consumer: false, mortgage: true }, isOnVacation: true },
    { name: 'M5', eligibility: { consumer: false, mortgage: true }, isOnVacation: false }
  ];
  const loans = [
    { name: 'L2', type: 'Home Refi', amountRequested: 690211 },
    { name: 'L6', type: 'Home Refi', amountRequested: 553361 },
    { name: 'L7', type: 'Home Refi', amountRequested: 344748 },
    { name: 'L8', type: 'First Mortgage', amountRequested: 1156004 },
    { name: 'L9', type: 'First Mortgage', amountRequested: 118856 },
    { name: 'L3', type: 'Home Refi', amountRequested: 129628 },
    { name: 'L1', type: 'Home Refi', amountRequested: 859252 },
    { name: 'L11', type: 'First Mortgage', amountRequested: 442125 },
    { name: 'L10', type: 'Home Refi', amountRequested: 1115880 },
    { name: 'L5', type: 'Home Refi', amountRequested: 1163785 },
    { name: 'L4', type: 'Home Refi', amountRequested: 220226 }
  ];
  const runningTotals = {
    officers: {
      M1: {
        officer: 'M1',
        totalLoanCount: 11,
        totalAmountRequested: 3174262,
        sessions: 2,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 5,
          'First Mortgage': 4,
          'Home Refi': 2
        }
      },
      M2: {
        officer: 'M2',
        totalLoanCount: 7,
        totalAmountRequested: 2368366,
        sessions: 7,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 7,
          'First Mortgage': 0,
          'Home Refi': 0
        }
      },
      M3: {
        officer: 'M3',
        totalLoanCount: 20,
        totalAmountRequested: 4112877,
        sessions: 7,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 3,
          'First Mortgage': 10,
          'Home Refi': 7
        }
      },
      M4: {
        officer: 'M4',
        totalLoanCount: 19,
        totalAmountRequested: 4539550,
        sessions: 5,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 6,
          'First Mortgage': 9,
          'Home Refi': 4
        }
      },
      M5: {
        officer: 'M5',
        totalLoanCount: 10,
        totalAmountRequested: 4255851,
        sessions: 1,
        typeCounts: {
          Personal: 0,
          Auto: 0,
          'Credit Card': 0,
          Collateralized: 0,
          HELOC: 2,
          'First Mortgage': 3,
          'Home Refi': 5
        }
      }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'mortgage_lane_count_variance');
  assert.equal(result.fairnessEvaluation.metrics.mortgageVariance.maxCountVariancePercent <= 15, true);
  assert.equal(result.fairnessEvaluation.metrics.mortgageVariance.maxAmountVariancePercent <= 20, true);
  assert.equal(result.optimizationSummaryMessage.includes('primary mortgage-lane variance target band'), true);
});

test('global post-assignment optimization clears heloc-only dollar review for seed-272 replay', () => {
  const context = loadAppContext(1034497293);
  context.FairnessEngineService.setSelectedFairnessEngine('global');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.53, mortgage: 0.79 }, mortgageOverride: false, isOnVacation: true },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.83, mortgage: 1 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.79, mortgage: 0.87 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F4', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.94, mortgage: 0.37 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F5', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.61, mortgage: 0.21 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F6', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.66, mortgage: 0.82 }, mortgageOverride: false, isOnVacation: false }
  ];
  const loans = [
    { name: 'L13', type: 'HELOC', amountRequested: 297416 },
    { name: 'L21', type: 'HELOC', amountRequested: 853053 },
    { name: 'L2', type: 'HELOC', amountRequested: 531281 },
    { name: 'L12', type: 'HELOC', amountRequested: 1107181 },
    { name: 'L6', type: 'HELOC', amountRequested: 385559 },
    { name: 'L17', type: 'HELOC', amountRequested: 541134 },
    { name: 'L1', type: 'HELOC', amountRequested: 905038 },
    { name: 'L8', type: 'HELOC', amountRequested: 910499 },
    { name: 'L15', type: 'HELOC', amountRequested: 48156 },
    { name: 'L9', type: 'HELOC', amountRequested: 506944 },
    { name: 'L20', type: 'HELOC', amountRequested: 978576 },
    { name: 'L19', type: 'HELOC', amountRequested: 1160741 },
    { name: 'L3', type: 'HELOC', amountRequested: 315456 },
    { name: 'L14', type: 'HELOC', amountRequested: 997099 },
    { name: 'L5', type: 'HELOC', amountRequested: 266350 },
    { name: 'L10', type: 'HELOC', amountRequested: 86473 },
    { name: 'L11', type: 'HELOC', amountRequested: 250864 },
    { name: 'L4', type: 'HELOC', amountRequested: 60587 },
    { name: 'L18', type: 'HELOC', amountRequested: 52653 },
    { name: 'L7', type: 'HELOC', amountRequested: 739516 },
    { name: 'L16', type: 'HELOC', amountRequested: 74909 }
  ];
  const runningTotals = {
    officers: {
      F1: { officer: 'F1', totalLoanCount: 35, totalAmountRequested: 8588570, sessions: 1, typeCounts: { Personal: 8, Auto: 0, 'Credit Card': 10, Collateralized: 1, HELOC: 4, 'First Mortgage': 3, 'Home Refi': 9 } },
      F2: { officer: 'F2', totalLoanCount: 44, totalAmountRequested: 13090651, sessions: 2, typeCounts: { Personal: 11, Auto: 4, 'Credit Card': 3, Collateralized: 3, HELOC: 6, 'First Mortgage': 9, 'Home Refi': 8 } },
      F3: { officer: 'F3', totalLoanCount: 21, totalAmountRequested: 2469550, sessions: 4, typeCounts: { Personal: 3, Auto: 6, 'Credit Card': 1, Collateralized: 5, HELOC: 3, 'First Mortgage': 1, 'Home Refi': 2 } },
      F4: { officer: 'F4', totalLoanCount: 43, totalAmountRequested: 5892442, sessions: 2, typeCounts: { Personal: 11, Auto: 2, 'Credit Card': 8, Collateralized: 3, HELOC: 9, 'First Mortgage': 5, 'Home Refi': 5 } },
      F5: { officer: 'F5', totalLoanCount: 36, totalAmountRequested: 3732219, sessions: 3, typeCounts: { Personal: 6, Auto: 3, 'Credit Card': 4, Collateralized: 5, HELOC: 7, 'First Mortgage': 4, 'Home Refi': 7 } },
      F6: { officer: 'F6', totalLoanCount: 20, totalAmountRequested: 1446658, sessions: 3, typeCounts: { Personal: 1, Auto: 4, 'Credit Card': 7, Collateralized: 3, HELOC: 3, 'First Mortgage': 1, 'Home Refi': 1 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'global_dollar_variance');
  assert.equal(result.fairnessEvaluation.metrics.maxAmountVariancePercent <= 20, true);
  assert.equal(result.optimizationSummaryMessage.includes('primary global dollar variance target band'), true);
});

test('officer-lane post-assignment optimization clears flex-dollar heloc review for seed-272 replay', () => {
  const context = loadAppContext(2765049527);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.53, mortgage: 0.79 }, mortgageOverride: false, isOnVacation: true },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.83, mortgage: 1 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.79, mortgage: 0.87 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F4', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.94, mortgage: 0.37 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F5', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.61, mortgage: 0.21 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F6', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.66, mortgage: 0.82 }, mortgageOverride: false, isOnVacation: false }
  ];
  const loans = [
    { name: 'L13', type: 'HELOC', amountRequested: 297416 },
    { name: 'L21', type: 'HELOC', amountRequested: 853053 },
    { name: 'L2', type: 'HELOC', amountRequested: 531281 },
    { name: 'L12', type: 'HELOC', amountRequested: 1107181 },
    { name: 'L6', type: 'HELOC', amountRequested: 385559 },
    { name: 'L17', type: 'HELOC', amountRequested: 541134 },
    { name: 'L1', type: 'HELOC', amountRequested: 905038 },
    { name: 'L8', type: 'HELOC', amountRequested: 910499 },
    { name: 'L15', type: 'HELOC', amountRequested: 48156 },
    { name: 'L9', type: 'HELOC', amountRequested: 506944 },
    { name: 'L20', type: 'HELOC', amountRequested: 978576 },
    { name: 'L19', type: 'HELOC', amountRequested: 1160741 },
    { name: 'L3', type: 'HELOC', amountRequested: 315456 },
    { name: 'L14', type: 'HELOC', amountRequested: 997099 },
    { name: 'L5', type: 'HELOC', amountRequested: 266350 },
    { name: 'L10', type: 'HELOC', amountRequested: 86473 },
    { name: 'L11', type: 'HELOC', amountRequested: 250864 },
    { name: 'L4', type: 'HELOC', amountRequested: 60587 },
    { name: 'L18', type: 'HELOC', amountRequested: 52653 },
    { name: 'L7', type: 'HELOC', amountRequested: 739516 },
    { name: 'L16', type: 'HELOC', amountRequested: 74909 }
  ];
  const runningTotals = {
    officers: {
      F1: { officer: 'F1', totalLoanCount: 35, totalAmountRequested: 8588570, sessions: 1, typeCounts: { Personal: 8, Auto: 0, 'Credit Card': 10, Collateralized: 1, HELOC: 4, 'First Mortgage': 3, 'Home Refi': 9 } },
      F2: { officer: 'F2', totalLoanCount: 44, totalAmountRequested: 13090651, sessions: 2, typeCounts: { Personal: 11, Auto: 4, 'Credit Card': 3, Collateralized: 3, HELOC: 6, 'First Mortgage': 9, 'Home Refi': 8 } },
      F3: { officer: 'F3', totalLoanCount: 21, totalAmountRequested: 2469550, sessions: 4, typeCounts: { Personal: 3, Auto: 6, 'Credit Card': 1, Collateralized: 5, HELOC: 3, 'First Mortgage': 1, 'Home Refi': 2 } },
      F4: { officer: 'F4', totalLoanCount: 43, totalAmountRequested: 5892442, sessions: 2, typeCounts: { Personal: 11, Auto: 2, 'Credit Card': 8, Collateralized: 3, HELOC: 9, 'First Mortgage': 5, 'Home Refi': 5 } },
      F5: { officer: 'F5', totalLoanCount: 36, totalAmountRequested: 3732219, sessions: 3, typeCounts: { Personal: 6, Auto: 3, 'Credit Card': 4, Collateralized: 5, HELOC: 7, 'First Mortgage': 4, 'Home Refi': 7 } },
      F6: { officer: 'F6', totalLoanCount: 20, totalAmountRequested: 1446658, sessions: 3, typeCounts: { Personal: 1, Auto: 4, 'Credit Card': 7, Collateralized: 3, HELOC: 3, 'First Mortgage': 1, 'Home Refi': 1 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'flex_lane_dollar_variance');
  assert.equal(result.fairnessEvaluation.metrics.flexVariance.maxAmountVariancePercent <= 20, true);
  assert.equal(result.optimizationSummaryMessage.includes('primary flex-lane variance target band'), true);
});

test('global post-assignment optimization clears seed-311 consumer-only dollar review with fresh prior-balanced seed', () => {
  const context = loadAppContext(1425908945);
  context.FairnessEngineService.setSelectedFairnessEngine('global');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.88, mortgage: 0.34 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.83, mortgage: 0.33 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.7, mortgage: 0.65 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F4', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.86, mortgage: 0.56 }, mortgageOverride: false, isOnVacation: false }
  ];
  const loans = [
    { name: 'L3', type: 'Auto', amountRequested: 701954 },
    { name: 'L12', type: 'Auto', amountRequested: 166813 },
    { name: 'L4', type: 'Credit Card', amountRequested: 14171 },
    { name: 'L2', type: 'Personal', amountRequested: 525847 },
    { name: 'L16', type: 'Collateralized', amountRequested: 221175 },
    { name: 'L7', type: 'Auto', amountRequested: 150046 },
    { name: 'L1', type: 'Auto', amountRequested: 56376 },
    { name: 'L9', type: 'Credit Card', amountRequested: 24158 },
    { name: 'L5', type: 'Collateralized', amountRequested: 805733 },
    { name: 'L11', type: 'Personal', amountRequested: 979585 },
    { name: 'L6', type: 'Auto', amountRequested: 215414 },
    { name: 'L13', type: 'Personal', amountRequested: 914124 },
    { name: 'L8', type: 'Personal', amountRequested: 325576 },
    { name: 'L14', type: 'Collateralized', amountRequested: 1091221 },
    { name: 'L10', type: 'Collateralized', amountRequested: 724299 },
    { name: 'L15', type: 'Credit Card', amountRequested: 22294 }
  ];
  const runningTotals = {
    officers: {
      F1: { officer: 'F1', totalLoanCount: 38, totalAmountRequested: 8965474, sessions: 7, typeCounts: { Personal: 5, Auto: 8, 'Credit Card': 3, Collateralized: 0, HELOC: 8, 'First Mortgage': 8, 'Home Refi': 6 } },
      F2: { officer: 'F2', totalLoanCount: 20, totalAmountRequested: 2048019, sessions: 3, typeCounts: { Personal: 5, Auto: 7, 'Credit Card': 0, Collateralized: 3, HELOC: 0, 'First Mortgage': 2, 'Home Refi': 3 } },
      F3: { officer: 'F3', totalLoanCount: 24, totalAmountRequested: 1525097, sessions: 1, typeCounts: { Personal: 2, Auto: 3, 'Credit Card': 9, Collateralized: 4, HELOC: 0, 'First Mortgage': 0, 'Home Refi': 6 } },
      F4: { officer: 'F4', totalLoanCount: 37, totalAmountRequested: 4730356, sessions: 4, typeCounts: { Personal: 10, Auto: 8, 'Credit Card': 0, Collateralized: 5, HELOC: 6, 'First Mortgage': 7, 'Home Refi': 1 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'global_dollar_variance');
  assert.equal(result.fairnessEvaluation.metrics.maxAmountVariancePercent <= 20, true);
});

test('officer-lane post-assignment optimization clears seed-388 flex-dollar review with fresh prior-balanced seed', () => {
  const context = loadAppContext(4165324145);
  context.FairnessEngineService.setSelectedFairnessEngine('officer_lane');
  const officers = [
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.74, mortgage: 0.22 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.99, mortgage: 0.79 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F3', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.79, mortgage: 0.29 }, mortgageOverride: false, isOnVacation: false },
    { name: 'F4', eligibility: { consumer: true, mortgage: true }, weights: { consumer: 0.94, mortgage: 0.9 }, mortgageOverride: false, isOnVacation: false }
  ];
  const loans = [
    { name: 'L1', type: 'HELOC', amountRequested: 259181 },
    { name: 'L8', type: 'HELOC', amountRequested: 259433 },
    { name: 'L12', type: 'HELOC', amountRequested: 502194 },
    { name: 'L11', type: 'HELOC', amountRequested: 139573 },
    { name: 'L4', type: 'HELOC', amountRequested: 93805 },
    { name: 'L6', type: 'HELOC', amountRequested: 292513 },
    { name: 'L7', type: 'HELOC', amountRequested: 784364 },
    { name: 'L3', type: 'HELOC', amountRequested: 1103961 },
    { name: 'L2', type: 'HELOC', amountRequested: 861565 },
    { name: 'L9', type: 'HELOC', amountRequested: 791974 },
    { name: 'L5', type: 'HELOC', amountRequested: 828883 },
    { name: 'L13', type: 'HELOC', amountRequested: 320765 },
    { name: 'L10', type: 'HELOC', amountRequested: 785795 }
  ];
  const runningTotals = {
    officers: {
      F1: { officer: 'F1', totalLoanCount: 34, totalAmountRequested: 4425083, sessions: 5, typeCounts: { Personal: 1, Auto: 8, 'Credit Card': 5, Collateralized: 4, HELOC: 8, 'First Mortgage': 2, 'Home Refi': 6 } },
      F2: { officer: 'F2', totalLoanCount: 30, totalAmountRequested: 4037168, sessions: 4, typeCounts: { Personal: 7, Auto: 6, 'Credit Card': 0, Collateralized: 3, HELOC: 3, 'First Mortgage': 6, 'Home Refi': 5 } },
      F3: { officer: 'F3', totalLoanCount: 47, totalAmountRequested: 11066193, sessions: 3, typeCounts: { Personal: 10, Auto: 2, 'Credit Card': 4, Collateralized: 3, HELOC: 9, 'First Mortgage': 9, 'Home Refi': 10 } },
      F4: { officer: 'F4', totalLoanCount: 31, totalAmountRequested: 2433711, sessions: 8, typeCounts: { Personal: 7, Auto: 4, 'Credit Card': 10, Collateralized: 4, HELOC: 1, 'First Mortgage': 3, 'Home Refi': 2 } }
    }
  };

  const result = context.assignLoans(officers, loans, runningTotals);

  assert.equal(result.fairnessEvaluation.overallResult, 'PASS');
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationTargetDescriptorKey, 'flex_lane_dollar_variance');
  assert.equal(result.fairnessEvaluation.metrics.flexVariance.maxAmountVariancePercent <= 20, true);
});

test('fresh prior-balanced seed preserves assignments for non-optimized loans', () => {
  const context = loadAppContext(8);
  const preservedLoan = { name: 'L0', type: 'Personal', amountRequested: 0 };
  const optimizedLoan = { name: 'L1', type: 'Personal', amountRequested: 100000 };
  const initialLoanToOfficerMap = new Map([
    [preservedLoan, 'F1'],
    [optimizedLoan, 'F2']
  ]);
  const seedMap = context.buildFreshAmountBalancedSeedAssignmentMap({
    initialLoanToOfficerMap,
    optimizedLoans: [optimizedLoan],
    eligibleOfficersByLoan: new Map([[optimizedLoan, ['F1', 'F2']]]),
    activeOfficerNames: ['F1', 'F2'],
    runningTotals: { officers: { F1: { totalLoanCount: 10, totalAmountRequested: 1000 }, F2: { totalLoanCount: 10, totalAmountRequested: 5000 } } },
    prioritizeLargestLoan: true
  });

  assert.equal(seedMap instanceof Map, true);
  assert.equal(seedMap.get(preservedLoan), 'F1');
  assert.notEqual(seedMap.get(optimizedLoan), undefined);
});
