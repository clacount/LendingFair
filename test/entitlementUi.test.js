const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

require('../src/utils/loanCategoryUtils.js');
const entitlements = require('../src/config/tiers.js');
const entitlementUi = require('../src/ui/entitlement-ui.js');

test('UI entitlement state locks Basic to global consumer single-role behavior', () => {
  entitlements.setCurrentTier(entitlements.TIERS.BASIC);

  const state = entitlementUi.getEntitlementState(entitlements);

  assert.equal(state.tier, entitlements.TIERS.BASIC);
  assert.equal(state.canUseOfficerLane, false);
  assert.equal(state.canUseMortgageLoans, false);
  assert.equal(state.canUseMultiOfficerRoles, false);
  assert.equal(state.canUseSimulation, false);
  assert.equal(state.canUseEom, false);
  assert.equal(state.canUseImportLoans, false);
});

test('UI entitlement state allows Pro lane-aware operating features and limited simulation without Platinum-only tools', () => {
  entitlements.setCurrentTier(entitlements.TIERS.PRO);

  const state = entitlementUi.getEntitlementState(entitlements);

  assert.equal(state.canUseOfficerLane, true);
  assert.equal(state.canUseMortgageLoans, true);
  assert.equal(state.canUseMultiOfficerRoles, true);
  assert.equal(state.canUseEom, true);
  assert.equal(state.canUseSimulation, true);
  assert.equal(state.canUseImportLoans, false);
  assert.equal(state.canUseCustomBranding, false);
  assert.equal(state.canUseSharePointGraph, false);
});

test('UI entitlement state preserves full Platinum behavior', () => {
  entitlements.setCurrentTier(entitlements.TIERS.PLATINUM);

  const state = entitlementUi.getEntitlementState(entitlements);

  assert.equal(state.canUseOfficerLane, true);
  assert.equal(state.canUseMortgageLoans, true);
  assert.equal(state.canUseMultiOfficerRoles, true);
  assert.equal(state.canUseSimulation, true);
  assert.equal(state.canUseEom, true);
  assert.equal(state.canUseImportLoans, true);
  assert.equal(state.canUseCustomBranding, true);
  assert.equal(state.canUseSharePointGraph, true);
});
