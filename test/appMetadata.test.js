const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.LendingFairEntitlements = {
  getCurrentTier() {
    return 'pro';
  },
  getTierLabel() {
    return 'Pro';
  }
};
global.LendingFairCustomerConfig = {
  getCustomerConfig() {
    return { customerName: 'Example Credit Union' };
  }
};

const metadata = require('../src/config/appMetadata.js');

test('app metadata object exposes non-empty version fields', () => {
  assert.equal(metadata.APP_NAME, 'LendingFair');
  assert.equal(typeof metadata.APP_VERSION, 'string');
  assert.equal(metadata.APP_VERSION.length > 0, true);
  assert.equal(metadata.APP_METADATA.APP_VERSION, metadata.APP_VERSION);
});

test('product version label combines app name, tier, and version', () => {
  assert.equal(metadata.getProductVersionLabel('Pro'), `LendingFair Pro v${metadata.APP_VERSION}`);
});

test('report metadata lines include version, tier, engine, generated timestamp, and customer', () => {
  const lines = metadata.buildReportMetadataLines({
    generatedAtLabel: 'May 2, 2026, 10:00 AM',
    fairnessEngineLabel: 'Officer Lane Fairness'
  });

  assert.equal(lines.some((line) => line.includes(`LendingFair Pro v${metadata.APP_VERSION}`)), true);
  assert.equal(lines.some((line) => line.includes('Officer Lane Fairness')), true);
  assert.equal(lines.some((line) => line.includes('May 2, 2026')), true);
  assert.equal(lines.some((line) => line.includes('Example Credit Union')), true);
});
