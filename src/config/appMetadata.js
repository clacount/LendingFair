(function initializeLendingFairAppMetadata(globalScope) {
  const APP_NAME = 'LendingFair';
  const APP_VERSION = '0.1.0';
  const APP_RELEASE_CHANNEL = 'pilot';
  const APP_BUILD_DATE = '2026-05-02';

  function getEntitlements() {
    return globalScope.LendingFairEntitlements || null;
  }

  function getCustomerConfig() {
    return globalScope.LendingFairCustomerConfig || null;
  }

  function getActiveTierLabel() {
    const entitlements = getEntitlements();
    const tier = entitlements?.getCurrentTier?.();
    return entitlements?.getTierLabel?.(tier) || 'Platinum';
  }

  function getCustomerName() {
    return getCustomerConfig()?.getCustomerConfig?.().customerName || '';
  }

  function getProductVersionLabel(tierLabel = getActiveTierLabel()) {
    return `${APP_NAME} ${tierLabel} v${APP_VERSION}`;
  }

  function getReleaseMetadata() {
    return {
      appName: APP_NAME,
      appVersion: APP_VERSION,
      releaseChannel: APP_RELEASE_CHANNEL,
      buildDate: APP_BUILD_DATE,
      activeTier: getEntitlements()?.getCurrentTier?.() || 'platinum',
      activeTierLabel: getActiveTierLabel(),
      customerName: getCustomerName()
    };
  }

  function buildReportMetadataLines({ generatedAtLabel = '', fairnessEngineLabel = '' } = {}) {
    const metadata = getReleaseMetadata();
    const lines = [
      `${metadata.appName} ${metadata.activeTierLabel} v${metadata.appVersion}`,
      `Release channel: ${metadata.releaseChannel}`
    ];

    if (metadata.buildDate) {
      lines.push(`Build date: ${metadata.buildDate}`);
    }
    if (generatedAtLabel) {
      lines.push(`Generated: ${generatedAtLabel}`);
    }
    if (fairnessEngineLabel) {
      lines.push(`Fairness engine: ${fairnessEngineLabel}`);
    }
    if (metadata.customerName) {
      lines.push(`Configured for: ${metadata.customerName}`);
    }

    return lines;
  }

  const APP_METADATA = Object.freeze({
    APP_NAME,
    APP_VERSION,
    APP_RELEASE_CHANNEL,
    APP_BUILD_DATE
  });

  const api = {
    APP_NAME,
    APP_VERSION,
    APP_RELEASE_CHANNEL,
    APP_BUILD_DATE,
    APP_METADATA,
    getActiveTierLabel,
    getProductVersionLabel,
    getReleaseMetadata,
    buildReportMetadataLines
  };

  globalScope.LendingFairAppMetadata = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
