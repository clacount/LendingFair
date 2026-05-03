const test = require('node:test');
const assert = require('node:assert/strict');

const customerConfigPath = require.resolve('../src/config/customerConfig.js');
const licenseManagerPath = require.resolve('../src/config/licenseManager.js');
const tiersPath = require.resolve('../src/config/tiers.js');

function createStorage(initial = {}) {
  const storage = { ...initial };
  return {
    storage,
    api: {
      getItem(key) {
        return storage[key] ?? null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      }
    }
  };
}

function resetGlobals({ config = {}, storage = {} } = {}) {
  delete require.cache[customerConfigPath];
  delete require.cache[licenseManagerPath];
  delete require.cache[tiersPath];
  delete global.LendingFairCustomerConfig;
  delete global.LendingFairLicenseManager;
  delete global.LendingFairEntitlements;
  delete global.LENDINGFAIR_CUSTOMER_CONFIG;

  const localStorage = createStorage(storage);
  global.window = global;
  global.localStorage = localStorage.api;
  global.LENDINGFAIR_CUSTOMER_CONFIG = config;
  global.CustomEvent = global.CustomEvent || class CustomEvent {
    constructor(type, params = {}) {
      this.type = type;
      this.detail = params.detail;
    }
  };
  global.dispatchEvent = global.dispatchEvent || function dispatchEvent() {};

  const customerConfig = require('../src/config/customerConfig.js');
  const licenseManager = require('../src/config/licenseManager.js');
  return { customerConfig, licenseManager, localStorage: localStorage.storage };
}

function attachMemoryLicenseFile(licenseManager, initialFiles = {}) {
  const files = { ...initialFiles };
  licenseManager.setFileAdapter({
    async readText(fileName) {
      return files[fileName] || '';
    },
    async writeText(fileName, value) {
      files[fileName] = String(value || '');
    }
  });
  return files;
}

function toBase64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function encodeLicense(license) {
  return toBase64(JSON.stringify(license));
}

function validLicense(overrides = {}) {
  return {
    licenseId: 'pilot-001',
    customerName: 'Example Credit Union',
    tier: 'pro',
    licenseType: 'pilot',
    issuedAt: '2026-05-01',
    expiresAt: '2026-06-30',
    graceDays: 0,
    ...overrides
  };
}

test('development mode allows unlicensed usage', () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'development' } });

  const state = licenseManager.getLicenseState({ now: new Date('2026-05-03T12:00:00Z') });
  const action = licenseManager.canPerformOperationalAction('run-assignment', { now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(state.state, licenseManager.LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED);
  assert.equal(state.valid, true);
  assert.equal(action.allowed, true);
});

test('development mode does not block when a stale invalid license is stored', () => {
  const { licenseManager } = resetGlobals({
    config: { appMode: 'development' },
    storage: { 'lendingfair-license-v1': encodeLicense(validLicense({ issuedAt: '2026-04-01', expiresAt: '2026-04-30' })) }
  });

  const action = licenseManager.canPerformOperationalAction('run-assignment', { now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(action.allowed, true);
  assert.equal(action.state.state, licenseManager.LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED);
});

test('customer mode with missing license blocks operational actions', () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'basic' } });

  const state = licenseManager.getLicenseState({ now: new Date('2026-05-03T12:00:00Z') });
  const action = licenseManager.canPerformOperationalAction('run-assignment', { now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(state.state, licenseManager.LICENSE_STATES.MISSING);
  assert.equal(action.allowed, false);
  assert.match(action.message, /valid LendingFair license/i);
});

test('valid active pilot license allows operational actions', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  attachMemoryLicenseFile(licenseManager);

  const installResult = await licenseManager.installLicense(encodeLicense(validLicense()));
  const action = licenseManager.canPerformOperationalAction('run-assignment', { now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(installResult.installed, true);
  assert.equal(action.allowed, true);
  assert.equal(action.state.state, licenseManager.LICENSE_STATES.ACTIVE);
});

test('expired license blocks operational actions', async () => {
  const expiredLicense = encodeLicense(validLicense({ issuedAt: '2026-04-01', expiresAt: '2026-04-30' }));
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  attachMemoryLicenseFile(licenseManager, { [licenseManager.LICENSE_FILE_NAME]: expiredLicense });
  await licenseManager.hydrateFromFile();

  const action = licenseManager.canPerformOperationalAction('run-assignment', { now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(action.allowed, false);
  assert.equal(action.state.state, licenseManager.LICENSE_STATES.EXPIRED);
  assert.match(action.message, /expired on 2026-04-30/);
});

test('license expiring within 14 days returns expiring soon', async () => {
  const expiringLicense = encodeLicense(validLicense({ expiresAt: '2026-05-10' }));
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  attachMemoryLicenseFile(licenseManager, { [licenseManager.LICENSE_FILE_NAME]: expiringLicense });
  await licenseManager.hydrateFromFile();

  const state = licenseManager.getLicenseState({ now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(state.state, licenseManager.LICENSE_STATES.EXPIRING_SOON);
  assert.equal(state.daysUntilExpiration, 7);
});

test('license can hydrate from shared working-folder file', async () => {
  const fileLicense = encodeLicense(validLicense({ tier: 'pro' }));
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'basic' } });
  attachMemoryLicenseFile(licenseManager, { [licenseManager.LICENSE_FILE_NAME]: fileLicense });
  const entitlements = require('../src/config/tiers.js');

  const state = await licenseManager.hydrateFromFile();

  assert.equal(state.state, licenseManager.LICENSE_STATES.ACTIVE);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.PRO);
});

test('customer mode cannot install license until file storage is available', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });

  const result = await licenseManager.installLicense(encodeLicense(validLicense()));

  assert.equal(result.installed, false);
  assert.match(result.message, /working folder/i);
});

test('customer mode ignores browser localStorage license without shared file storage', () => {
  const { licenseManager } = resetGlobals({
    config: { appMode: 'customer', tier: 'pro' },
    storage: { 'lendingfair-license-v1': encodeLicense(validLicense()) }
  });

  const state = licenseManager.getLicenseState({ now: new Date('2026-05-03T12:00:00Z') });

  assert.equal(state.state, licenseManager.LICENSE_STATES.MISSING);
});

test('newer valid license can replace an old stored license', async () => {
  const oldLicense = encodeLicense(validLicense({ licenseId: 'pilot-old', expiresAt: '2026-05-10' }));
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  const files = attachMemoryLicenseFile(licenseManager, { [licenseManager.LICENSE_FILE_NAME]: oldLicense });
  await licenseManager.hydrateFromFile();

  const result = await licenseManager.installLicense(encodeLicense(validLicense({
    licenseId: 'pilot-renewed',
    expiresAt: '2026-12-31'
  })));

  assert.equal(result.installed, true);
  assert.equal(files[licenseManager.LICENSE_FILE_NAME], encodeLicense(validLicense({
    licenseId: 'pilot-renewed',
    expiresAt: '2026-12-31'
  })));
});

test('license tier hydrates entitlements in customer mode', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'basic' } });
  attachMemoryLicenseFile(licenseManager);
  const entitlements = require('../src/config/tiers.js');

  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.BASIC);

  const result = await licenseManager.installLicense(encodeLicense(validLicense({ tier: 'pro' })));

  assert.equal(result.installed, true);
  assert.equal(entitlements.getCurrentTier(), entitlements.TIERS.PRO);
});

test('invalid license is rejected', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });

  const result = await licenseManager.installLicense(encodeLicense(validLicense({ expiresAt: '2026-02-31' })));

  assert.equal(result.installed, false);
  assert.equal(result.state, licenseManager.LICENSE_STATES.INVALID);
  assert.match(result.message, /YYYY-MM-DD/);
});

test('support metadata includes license status and active tier', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  attachMemoryLicenseFile(licenseManager);

  await licenseManager.installLicense(encodeLicense(validLicense({ tier: 'pro', licenseType: 'monthly' })));
  const metadata = licenseManager.getSupportMetadata();

  assert.equal(metadata.licenseId, 'pilot-001');
  assert.equal(metadata.licenseType, 'monthly');
  assert.equal(metadata.licenseStatus, licenseManager.LICENSE_STATES.ACTIVE);
  assert.equal(metadata.activeTier, 'pro');
});

test('raw JSON license input is rejected', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  const result = await licenseManager.installLicense(JSON.stringify(validLicense()));
  assert.equal(result.installed, false);
  assert.equal(result.message, 'License must be an encoded key, not raw JSON.');
});

test('object license input is rejected', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  const result = await licenseManager.installLicense(validLicense());
  assert.equal(result.installed, false);
  assert.match(result.message, /an encoded key/);
});

test('invalid license is rejected', async () => {
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  const result = await licenseManager.installLicense('not-base64!!');
  assert.equal(result.installed, false);
  assert.match(result.message, /text is invalid/);
});

test('legacy b64 prefix license is migrated on hydrate', async () => {
  const encoded = encodeLicense(validLicense());
  const { licenseManager } = resetGlobals({ config: { appMode: 'customer', tier: 'pro' } });
  const files = attachMemoryLicenseFile(licenseManager, { [licenseManager.LICENSE_FILE_NAME]: `b64:${encoded}` });
  await licenseManager.hydrateFromFile();
  assert.equal(files[licenseManager.LICENSE_FILE_NAME], encoded);
});
