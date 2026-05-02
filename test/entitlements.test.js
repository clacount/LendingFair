const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

require('../src/utils/loanCategoryUtils.js');
const entitlements = require('../src/config/tiers.js');

const {
  TIERS,
  ENGINES,
  OFFICER_ROLES,
  LOAN_CATEGORIES,
  FEATURES
} = entitlements;

test('default tier is Platinum', () => {
  assert.equal(entitlements.getCurrentTier(), TIERS.PLATINUM);
});

test('Platinum can use all known features', () => {
  Object.values(FEATURES).forEach((feature) => {
    assert.equal(entitlements.canUseFeature(feature, TIERS.PLATINUM), true, feature);
  });
});

test('Basic supports consumer loans and the global engine only', () => {
  assert.equal(entitlements.canUseFeature(FEATURES.GLOBAL_ENGINE, TIERS.BASIC), true);
  assert.equal(entitlements.canUseFeature(FEATURES.CONSUMER_LOANS, TIERS.BASIC), true);
  assert.equal(entitlements.canUseFeature(FEATURES.OFFICER_LANE_ENGINE, TIERS.BASIC), false);
  assert.equal(entitlements.canUseFeature(FEATURES.MULTI_OFFICER_ROLES, TIERS.BASIC), false);
  assert.equal(entitlements.canUseFeature(FEATURES.MORTGAGE_LOANS, TIERS.BASIC), false);
  assert.equal(entitlements.canUseFeature(FEATURES.IMPORT_LOANS, TIERS.BASIC), false);
  assert.equal(entitlements.canUseFeature(FEATURES.SIMULATION, TIERS.BASIC), false);
  assert.equal(entitlements.getSimulationMaxDays(TIERS.BASIC), 0);
});

test('Pro supports officer lane, consumer loans, mortgage loans, multiple officer roles, and limited simulation', () => {
  assert.equal(entitlements.canUseFeature(FEATURES.OFFICER_LANE_ENGINE, TIERS.PRO), true);
  assert.equal(entitlements.canUseFeature(FEATURES.CONSUMER_LOANS, TIERS.PRO), true);
  assert.equal(entitlements.canUseFeature(FEATURES.MORTGAGE_LOANS, TIERS.PRO), true);
  assert.equal(entitlements.canUseFeature(FEATURES.MULTI_OFFICER_ROLES, TIERS.PRO), true);
  assert.equal(entitlements.canUseFeature(FEATURES.IMPORT_LOANS, TIERS.PRO), false);
  assert.equal(entitlements.canUseFeature(FEATURES.SIMULATION, TIERS.PRO), true);
  assert.equal(entitlements.getSimulationMaxDays(TIERS.PRO), 60);
  assert.equal(entitlements.canUseUnlimitedSimulation(TIERS.PRO), false);
});

test('Platinum supports unlimited simulation', () => {
  assert.equal(entitlements.canUseFeature(FEATURES.SIMULATION, TIERS.PLATINUM), true);
  assert.equal(entitlements.getSimulationMaxDays(TIERS.PLATINUM), null);
  assert.equal(entitlements.canUseUnlimitedSimulation(TIERS.PLATINUM), true);
});

test('simulation day validation enforces Basic, Pro, and Platinum limits', () => {
  const basicResult = entitlements.validateSimulationDays(1, TIERS.BASIC);
  assert.equal(basicResult.valid, false);
  assert.equal(basicResult.code, 'SIMULATION_NOT_AVAILABLE');

  const proAllowed = entitlements.validateSimulationDays(60, TIERS.PRO);
  assert.equal(proAllowed.valid, true);

  const proBlocked = entitlements.validateSimulationDays(61, TIERS.PRO);
  assert.equal(proBlocked.valid, false);
  assert.equal(proBlocked.code, 'SIMULATION_DAYS_LIMIT_EXCEEDED');

  const platinumAllowed = entitlements.validateSimulationDays(120, TIERS.PLATINUM);
  assert.equal(platinumAllowed.valid, true);
});

test('validation rejects Basic with Officer Lane engine', () => {
  const result = entitlements.validateTierForRun({
    tier: TIERS.BASIC,
    engineType: ENGINES.OFFICER_LANE,
    officers: [{ name: 'A', eligibility: { consumer: true, mortgage: false } }],
    loans: [{ name: 'L1', type: 'Auto', category: LOAN_CATEGORIES.CONSUMER }]
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, 'ENGINE_NOT_AVAILABLE');
});

test('validation rejects Basic with multiple officer roles', () => {
  const result = entitlements.validateTierForRun({
    tier: TIERS.BASIC,
    engineType: ENGINES.GLOBAL,
    officers: [
      { name: 'C', eligibility: { consumer: true, mortgage: false } },
      { name: 'F', eligibility: { consumer: true, mortgage: true } }
    ],
    loans: [{ name: 'L1', type: 'Auto', category: LOAN_CATEGORIES.CONSUMER }]
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, 'MULTI_OFFICER_ROLES_NOT_AVAILABLE');
});

test('validation rejects Basic with mortgage loans', () => {
  const result = entitlements.validateTierForRun({
    tier: TIERS.BASIC,
    engineType: ENGINES.GLOBAL,
    officers: [{ name: 'A', eligibility: { consumer: true, mortgage: false } }],
    loans: [{ name: 'L1', type: 'HELOC', category: LOAN_CATEGORIES.MORTGAGE }]
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, 'MORTGAGE_LOANS_NOT_AVAILABLE');
});

test('validation allows Basic global engine with consumer loans and a single officer role', () => {
  const result = entitlements.validateTierForRun({
    tier: TIERS.BASIC,
    engineType: ENGINES.GLOBAL,
    officers: [
      { name: 'A', eligibility: { consumer: true, mortgage: false } },
      { name: 'B', eligibility: { consumer: true, mortgage: false } }
    ],
    loans: [
      { name: 'L1', type: 'Auto', category: LOAN_CATEGORIES.CONSUMER },
      { name: 'L2', type: 'Personal', category: LOAN_CATEGORIES.CONSUMER },
      { name: 'L3', type: 'Credit Card', category: LOAN_CATEGORIES.CONSUMER },
      { name: 'L4', type: 'Collateralized', category: LOAN_CATEGORIES.CONSUMER }
    ]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.officerRoles, [OFFICER_ROLES.CONSUMER]);
});

test('validation allows Platinum with current full-feature setup', () => {
  const result = entitlements.validateTierForRun({
    tier: TIERS.PLATINUM,
    engineType: ENGINES.OFFICER_LANE,
    officers: [
      { name: 'C', eligibility: { consumer: true, mortgage: false } },
      { name: 'M', eligibility: { consumer: false, mortgage: true } },
      { name: 'F', eligibility: { consumer: true, mortgage: true } }
    ],
    loans: [
      { name: 'L1', type: 'Auto', category: LOAN_CATEGORIES.CONSUMER },
      { name: 'L2', type: 'First Mortgage', category: LOAN_CATEGORIES.MORTGAGE }
    ]
  });

  assert.equal(result.valid, true);
});
