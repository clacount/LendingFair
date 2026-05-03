const test = require('node:test');
const assert = require('node:assert/strict');

const customerConfigPath = require.resolve('../src/config/customerConfig.js');
const tiersPath = require.resolve('../src/config/tiers.js');

function loadCustomerConfigScenario({ config = null, savedTier = '' } = {}) {
  delete require.cache[customerConfigPath];
  delete require.cache[tiersPath];
  delete global.LendingFairCustomerConfig;
  delete global.LendingFairEntitlements;
  delete global.LENDINGFAIR_CUSTOMER_CONFIG;

  const storage = {};
  if (savedTier) {
    storage['loan-randomizer-settings-v1'] = JSON.stringify({ currentTier: savedTier });
  }

  global.window = global;
  global.localStorage = {
    getItem(key) {
      return storage[key] ?? null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    }
  };

  global.LENDINGFAIR_CUSTOMER_CONFIG = config || {};

  const customerConfig = require('../src/config/customerConfig.js');
  const entitlements = require('../src/config/tiers.js');
  return { customerConfig, entitlements, storage };
}

test('development mode preserves Platinum default and internal tier selector', () => {
  const { customerConfig, entitlements } = loadCustomerConfigScenario();

  assert.equal(customerConfig.isDevelopmentMode(), true);
  assert.equal(customerConfig.shouldShowInternalTierSelector(), true);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.PLATINUM);
});

test('customer config with Basic tier sets current tier to Basic', () => {
  const { customerConfig, entitlements } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'basic' }
  });

  assert.equal(customerConfig.isCustomerMode(), true);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);
});

test('customer config with Pro tier sets current tier to Pro', () => {
  const { entitlements } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'pro' }
  });

  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.PRO);
});

test('customer mode suppresses internal tier selector helper', () => {
  const { customerConfig } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'basic', showInternalTierSelector: true }
  });

  assert.equal(customerConfig.shouldShowInternalTierSelector(), false);
});

test('customer mode hides demo controls unless explicitly enabled', () => {
  const hiddenScenario = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'basic' }
  });
  assert.equal(hiddenScenario.customerConfig.shouldShowDemoControls(), false);

  const enabledScenario = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'basic', showDemoControls: true }
  });
  assert.equal(enabledScenario.customerConfig.shouldShowDemoControls(), true);
});

test('development mode allows internal tier selector helper', () => {
  const { customerConfig } = loadCustomerConfigScenario({
    config: { appMode: 'development', showInternalTierSelector: true }
  });

  assert.equal(customerConfig.shouldShowInternalTierSelector(), true);
});

test('customer config tier overrides saved localStorage tier and prevents UI switching', () => {
  const { entitlements } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'basic' },
    savedTier: 'platinum'
  });

  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);
  entitlements.setCurrentTier(entitlements.TIERS.PLATINUM);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);
});

test('missing customer tier records a configuration error and fails closed to Basic', () => {
  const { customerConfig, entitlements } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: '' },
    savedTier: 'platinum'
  });

  assert.match(customerConfig.getConfigurationError(), /Missing LendingFair customer tier/);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);
});

test('invalid customer tier records a configuration error and fails closed to Basic', () => {
  const { customerConfig, entitlements } = loadCustomerConfigScenario({
    config: { appMode: 'customer', tier: 'enterprise' },
    savedTier: 'platinum'
  });

  assert.match(customerConfig.getConfigurationError(), /Invalid LendingFair customer tier/);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);
});
