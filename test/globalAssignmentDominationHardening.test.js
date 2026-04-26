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
  assert.equal(result.optimizationTargetLabel, 'global variance');
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
  // This captured scenario is stochastic at assignment time; the optimizer should still target and improve
  // the failing flex count descriptor even when a full PASS is not guaranteed for every deterministic replay.
  assert.equal(result.optimizationTargetDescriptorKey, 'flex_lane_count_variance');
  assert.match(String(result.optimizationTargetLabel || ''), /flex-lane|flex/i);
  assert.equal(result.optimizationApplied, true);
  assert.equal(result.optimizationInitialConsumerDollarVariance > result.optimizationFinalConsumerDollarVariance, true);
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
