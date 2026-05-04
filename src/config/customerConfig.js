(function initializeLendingFairCustomerConfig(globalScope) {
  // Edit this object when packaging a customer build without adding an inline script.
  // Leave it empty for normal development behavior.
  const LOCAL_CUSTOMER_CONFIG = {
     // customerName: 'Example Federal Credit Union',
     // tier: 'pro',
     // appMode: 'customer',
     // showInternalTierSelector: false,
     // showDemoControls: false,
     // showDevLabels: false
  };

  const APP_MODES = {
    DEVELOPMENT: 'development',
    CUSTOMER: 'customer',
    DEMO: 'demo'
  };

  const VALID_TIERS = new Set(['basic', 'pro', 'platinum']);
  const VALID_APP_MODES = new Set(Object.values(APP_MODES));

  const DEFAULT_CONFIG = Object.freeze({
    customerName: '',
    tier: '',
    appMode: APP_MODES.DEVELOPMENT,
    showInternalTierSelector: true,
    showDemoControls: true,
    showDevLabels: true
  });

  function readProvidedConfig() {
    const explicitConfig = globalScope.LENDINGFAIR_CUSTOMER_CONFIG || globalScope.LendingFairCustomerConfig;
    if (explicitConfig && typeof explicitConfig === 'object') {
      return explicitConfig;
    }
    return LOCAL_CUSTOMER_CONFIG;
  }

  function normalizeAppMode(appMode) {
    const normalizedMode = String(appMode || '').trim().toLowerCase();
    return VALID_APP_MODES.has(normalizedMode) ? normalizedMode : APP_MODES.DEVELOPMENT;
  }

  function normalizeTier(tier) {
    const normalizedTier = String(tier || '').trim().toLowerCase();
    return VALID_TIERS.has(normalizedTier) ? normalizedTier : null;
  }

  function resolveBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  const providedConfig = readProvidedConfig();
  const appMode = normalizeAppMode(providedConfig.appMode);
  const configuredTier = normalizeTier(providedConfig.tier);
  const customerName = String(providedConfig.customerName || '').trim();
  const hasTierValue = String(providedConfig.tier || '').trim().length > 0;
  const tierConfigurationError = appMode === APP_MODES.CUSTOMER && !configuredTier
    ? (
      hasTierValue
        ? `Invalid LendingFair customer tier "${providedConfig.tier}". Expected basic, pro, or platinum.`
        : 'Missing LendingFair customer tier. Expected basic, pro, or platinum.'
    )
    : '';

  const config = Object.freeze({
    ...DEFAULT_CONFIG,
    ...providedConfig,
    customerName,
    tier: configuredTier || '',
    appMode,
    showInternalTierSelector: resolveBoolean(
      providedConfig.showInternalTierSelector,
      appMode === APP_MODES.DEVELOPMENT || appMode === APP_MODES.DEMO
    ),
    showDemoControls: resolveBoolean(
      providedConfig.showDemoControls,
      appMode === APP_MODES.DEVELOPMENT || appMode === APP_MODES.DEMO
    ),
    showDevLabels: resolveBoolean(
      providedConfig.showDevLabels,
      appMode === APP_MODES.DEVELOPMENT || appMode === APP_MODES.DEMO
    )
  });

  function getCustomerConfig() {
    return config;
  }

  function isCustomerMode() {
    return config.appMode === APP_MODES.CUSTOMER;
  }

  function isDevelopmentMode() {
    return config.appMode === APP_MODES.DEVELOPMENT;
  }

  function isDemoMode() {
    return config.appMode === APP_MODES.DEMO;
  }

  function shouldShowInternalTierSelector() {
    return !isCustomerMode() && config.showInternalTierSelector;
  }

  function shouldShowDemoControls() {
    return isCustomerMode() ? config.showDemoControls === true : config.showDemoControls;
  }

  function shouldShowDevLabels() {
    return !isCustomerMode() && config.showDevLabels;
  }

  function getConfiguredTier() {
    return configuredTier;
  }

  function getConfigurationError() {
    return tierConfigurationError;
  }

  function getProductLabel(tierLabel = '') {
    const normalizedTierLabel = String(tierLabel || config.tier || '').trim();
    return normalizedTierLabel ? `LendingFair ${normalizedTierLabel}` : 'LendingFair';
  }

  const api = {
    APP_MODES,
    getCustomerConfig,
    isCustomerMode,
    isDevelopmentMode,
    isDemoMode,
    shouldShowInternalTierSelector,
    shouldShowDemoControls,
    shouldShowDevLabels,
    getConfiguredTier,
    getConfigurationError,
    getProductLabel
  };

  globalScope.LendingFairCustomerConfig = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
