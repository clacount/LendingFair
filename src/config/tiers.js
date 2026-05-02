(function initializeLendingFairEntitlements(globalScope) {
  const SETTINGS_STORAGE_KEY = 'loan-randomizer-settings-v1';

  const TIERS = {
    BASIC: 'basic',
    PRO: 'pro',
    PLATINUM: 'platinum'
  };

  const ENGINES = {
    GLOBAL: 'global',
    OFFICER_LANE: 'officer_lane'
  };

  const OFFICER_ROLES = {
    SINGLE_ROLE: 'single_role',
    STANDARD_OFFICER: 'standard_officer',
    CONSUMER: 'consumer',
    MORTGAGE: 'mortgage',
    FLEX: 'flex'
  };

  const LOAN_CATEGORIES = {
    CONSUMER: 'consumer',
    MORTGAGE: 'mortgage'
  };

  const FEATURES = {
    GLOBAL_ENGINE: 'global_engine',
    OFFICER_LANE_ENGINE: 'officer_lane_engine',
    SINGLE_OFFICER_ROLE: 'single_officer_role',
    MULTI_OFFICER_ROLES: 'multi_officer_roles',
    CONSUMER_LOANS: 'consumer_loans',
    MORTGAGE_LOANS: 'mortgage_loans',
    BASIC_PDF_REPORT: 'basic_pdf_report',
    FAIRNESS_AUDIT_REPORT: 'fairness_audit_report',
    RUNNING_TOTALS_REPORT: 'running_totals_report',
    EOM_REPORT: 'eom_report',
    IMPORT_LOANS: 'import_loans',
    SIMULATION: 'simulation',
    LIVE_RUNS: 'live_runs',
    CUSTOM_BRANDING: 'custom_branding',
    SHAREPOINT_GRAPH_STUB: 'sharepoint_graph_stub',
    ADVANCED_ANALYTICS: 'advanced_analytics',
    DUPLICATE_LOAN_PREVENTION: 'duplicate_loan_prevention',
    MONTHLY_CSV_HISTORY: 'monthly_csv_history'
  };

  const BASIC_FEATURES = [
    FEATURES.GLOBAL_ENGINE,
    FEATURES.SINGLE_OFFICER_ROLE,
    FEATURES.CONSUMER_LOANS,
    FEATURES.BASIC_PDF_REPORT,
    FEATURES.RUNNING_TOTALS_REPORT,
    FEATURES.DUPLICATE_LOAN_PREVENTION,
    FEATURES.MONTHLY_CSV_HISTORY
  ];

  const PRO_FEATURES = [
    ...BASIC_FEATURES,
    FEATURES.OFFICER_LANE_ENGINE,
    FEATURES.MULTI_OFFICER_ROLES,
    FEATURES.MORTGAGE_LOANS,
    FEATURES.FAIRNESS_AUDIT_REPORT,
    FEATURES.EOM_REPORT,
    FEATURES.SIMULATION
  ];

  const PLATINUM_FEATURES = [
    ...PRO_FEATURES,
    FEATURES.IMPORT_LOANS,
    FEATURES.LIVE_RUNS,
    FEATURES.CUSTOM_BRANDING,
    FEATURES.SHAREPOINT_GRAPH_STUB,
    FEATURES.ADVANCED_ANALYTICS
  ];

  const TIER_LIMITS = Object.freeze({
    [TIERS.BASIC]: Object.freeze({
      simulationMaxDays: 0
    }),
    [TIERS.PRO]: Object.freeze({
      simulationMaxDays: 60
    }),
    [TIERS.PLATINUM]: Object.freeze({
      simulationMaxDays: null
    })
  });

  const TIER_CONFIG = Object.freeze({
    [TIERS.BASIC]: Object.freeze({
      tier: TIERS.BASIC,
      label: 'Basic',
      features: Object.freeze([...BASIC_FEATURES])
    }),
    [TIERS.PRO]: Object.freeze({
      tier: TIERS.PRO,
      label: 'Pro',
      features: Object.freeze([...PRO_FEATURES])
    }),
    [TIERS.PLATINUM]: Object.freeze({
      tier: TIERS.PLATINUM,
      label: 'Platinum',
      features: Object.freeze([...PLATINUM_FEATURES])
    })
  });

  function normalizeTier(tier) {
    const normalizedTier = String(tier || '').trim().toLowerCase();
    return TIER_CONFIG[normalizedTier] ? normalizedTier : TIERS.PLATINUM;
  }

  function readSettings() {
    try {
      const raw = globalScope.localStorage?.getItem(SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function writeSettings(nextSettings) {
    try {
      globalScope.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    } catch (error) {
      // Storage is optional for this first productization step.
    }
  }

  const customerConfig = globalScope.LendingFairCustomerConfig;
  const configuredTier = customerConfig?.getConfiguredTier?.();
  const hasCustomerTierError = Boolean(customerConfig?.isCustomerMode?.() && customerConfig?.getConfigurationError?.());
  const isTierLockedByCustomerConfig = Boolean(customerConfig?.isCustomerMode?.());

  let currentTier = configuredTier || (hasCustomerTierError ? TIERS.BASIC : normalizeTier(readSettings().currentTier));

  function getCurrentTier() {
    return currentTier;
  }

  function setCurrentTier(tier) {
    if (isTierLockedByCustomerConfig) {
      return currentTier;
    }

    currentTier = normalizeTier(tier);
    const settings = readSettings();
    settings.currentTier = currentTier;
    writeSettings(settings);
    try {
      globalScope.dispatchEvent?.(new CustomEvent('lendingfair:tierchange', { detail: { tier: currentTier } }));
    } catch (error) {
      // Non-browser tests do not need tier-change events.
    }
    return currentTier;
  }

  function getTierConfig(tier = getCurrentTier()) {
    return TIER_CONFIG[normalizeTier(tier)];
  }

  function getAvailableFeatures(tier = getCurrentTier()) {
    return [...getTierConfig(tier).features];
  }

  function getTierLimit(limitName, tier = getCurrentTier()) {
    const limits = TIER_LIMITS[normalizeTier(tier)] || {};
    return Object.prototype.hasOwnProperty.call(limits, limitName) ? limits[limitName] : null;
  }

  function getSimulationMaxDays(tier = getCurrentTier()) {
    return getTierLimit('simulationMaxDays', tier);
  }

  function canUseUnlimitedSimulation(tier = getCurrentTier()) {
    return canUseFeature(FEATURES.SIMULATION, tier) && getSimulationMaxDays(tier) === null;
  }

  function validateSimulationDays(businessDays, tier = getCurrentTier()) {
    const normalizedDays = Number(businessDays);
    const runTier = normalizeTier(tier);
    if (!canUseFeature(FEATURES.SIMULATION, runTier)) {
      return buildValidationFailure(
        'SIMULATION_NOT_AVAILABLE',
        'Monthly fairness simulation requires Pro or Platinum.',
        FEATURES.SIMULATION,
        runTier
      );
    }

    if (!Number.isFinite(normalizedDays) || normalizedDays <= 0 || !Number.isInteger(normalizedDays)) {
      return buildValidationFailure(
        'SIMULATION_DAYS_INVALID',
        'Business days must be a positive whole number.',
        FEATURES.SIMULATION,
        runTier
      );
    }

    const maxDays = getSimulationMaxDays(runTier);
    if (Number.isFinite(maxDays) && maxDays > 0 && normalizedDays > maxDays) {
      return buildValidationFailure(
        'SIMULATION_DAYS_LIMIT_EXCEEDED',
        `Pro simulations are limited to ${maxDays} days. Reduce the simulation length or upgrade to Platinum for unlimited simulation.`,
        FEATURES.SIMULATION,
        runTier
      );
    }

    return {
      valid: true,
      tier: runTier,
      businessDays: normalizedDays,
      maxDays
    };
  }

  function canUseFeature(feature, tier = getCurrentTier()) {
    return getTierConfig(tier).features.includes(feature);
  }

  function requiredTierForFeature(feature) {
    if (canUseFeature(feature, TIERS.BASIC)) {
      return TIERS.BASIC;
    }
    if (canUseFeature(feature, TIERS.PRO)) {
      return TIERS.PRO;
    }
    if (canUseFeature(feature, TIERS.PLATINUM)) {
      return TIERS.PLATINUM;
    }
    return null;
  }

  function getTierLabel(tier) {
    return getTierConfig(tier).label;
  }

  function getLockedFeatureMessage(feature, fallbackMessage = '') {
    const requiredTier = requiredTierForFeature(feature);
    if (requiredTier === TIERS.PRO) {
      return fallbackMessage || 'This feature requires Pro or Platinum.';
    }
    if (requiredTier === TIERS.PLATINUM) {
      return fallbackMessage || 'This feature requires Platinum.';
    }
    return fallbackMessage || 'This feature is not available for the current tier.';
  }

  function requireFeature(feature, contextMessage = '') {
    if (canUseFeature(feature)) {
      return { allowed: true, feature, tier: getCurrentTier() };
    }

    const message = getLockedFeatureMessage(feature, contextMessage);
    const error = new Error(message);
    error.code = 'FEATURE_NOT_AVAILABLE';
    error.feature = feature;
    error.tier = getCurrentTier();
    error.requiredTier = requiredTierForFeature(feature);
    throw error;
  }

  function canUseEngine(engineType, tier = getCurrentTier()) {
    return String(engineType || '').trim().toLowerCase() === ENGINES.OFFICER_LANE
      ? canUseFeature(FEATURES.OFFICER_LANE_ENGINE, tier)
      : canUseFeature(FEATURES.GLOBAL_ENGINE, tier);
  }

  function normalizeLoanCategory(category) {
    return String(category || '').trim().toLowerCase() === LOAN_CATEGORIES.MORTGAGE
      ? LOAN_CATEGORIES.MORTGAGE
      : LOAN_CATEGORIES.CONSUMER;
  }

  function inferLoanCategory(loan = {}) {
    if (loan.category) {
      return normalizeLoanCategory(loan.category);
    }

    const typeName = String(loan.type || loan.loanType || loan.name || '').trim();
    if (globalScope.getLoanCategoryForType && typeName) {
      return normalizeLoanCategory(globalScope.getLoanCategoryForType(typeName));
    }
    if (globalScope.LoanCategoryUtils?.classifyLoanTypeCategory && typeName) {
      return normalizeLoanCategory(globalScope.LoanCategoryUtils.classifyLoanTypeCategory(typeName));
    }

    const normalizedType = typeName.toLowerCase();
    return (
      normalizedType.includes('mortgage')
      || normalizedType.includes('refi')
      || normalizedType.includes('refinance')
      || normalizedType.includes('heloc')
      || normalizedType.includes('home equity')
    )
      ? LOAN_CATEGORIES.MORTGAGE
      : LOAN_CATEGORIES.CONSUMER;
  }

  function canUseLoanCategory(loanCategory, tier = getCurrentTier()) {
    return normalizeLoanCategory(loanCategory) === LOAN_CATEGORIES.MORTGAGE
      ? canUseFeature(FEATURES.MORTGAGE_LOANS, tier)
      : canUseFeature(FEATURES.CONSUMER_LOANS, tier);
  }

  function normalizeOfficerEligibility(eligibility = {}) {
    if (globalScope.LoanCategoryUtils?.normalizeOfficerEligibility) {
      return globalScope.LoanCategoryUtils.normalizeOfficerEligibility(eligibility);
    }

    return {
      consumer: typeof eligibility.consumer === 'boolean' ? eligibility.consumer : true,
      mortgage: typeof eligibility.mortgage === 'boolean' ? eligibility.mortgage : false
    };
  }

  function getOfficerRole(officer = {}) {
    const eligibility = normalizeOfficerEligibility(officer.eligibility);
    if (eligibility.consumer && eligibility.mortgage) {
      return OFFICER_ROLES.FLEX;
    }
    if (eligibility.mortgage) {
      return OFFICER_ROLES.MORTGAGE;
    }
    return OFFICER_ROLES.CONSUMER;
  }

  function canUseOfficerRole(officerRole, tier = getCurrentTier()) {
    const normalizedRole = String(officerRole || '').trim().toLowerCase();
    if (
      normalizedRole === OFFICER_ROLES.SINGLE_ROLE
      || normalizedRole === OFFICER_ROLES.STANDARD_OFFICER
      || normalizedRole === OFFICER_ROLES.CONSUMER
    ) {
      return canUseFeature(FEATURES.SINGLE_OFFICER_ROLE, tier);
    }

    return canUseFeature(FEATURES.MULTI_OFFICER_ROLES, tier);
  }

  function buildValidationFailure(code, message, feature = null, tier = getCurrentTier()) {
    return {
      valid: false,
      code,
      message,
      feature,
      tier,
      requiredTier: feature ? requiredTierForFeature(feature) : null
    };
  }

  function validateTierForRun({ tier = getCurrentTier(), engineType = ENGINES.GLOBAL, officers = [], loans = [] } = {}) {
    const runTier = normalizeTier(tier);
    const normalizedEngine = String(engineType || '').trim().toLowerCase() === ENGINES.OFFICER_LANE
      ? ENGINES.OFFICER_LANE
      : ENGINES.GLOBAL;

    if (!canUseEngine(normalizedEngine, runTier)) {
      return buildValidationFailure(
        'ENGINE_NOT_AVAILABLE',
        normalizedEngine === ENGINES.OFFICER_LANE
          ? 'Officer Lane Fairness requires Pro or Platinum.'
          : 'Global Fairness is not available for the current tier.',
        normalizedEngine === ENGINES.OFFICER_LANE ? FEATURES.OFFICER_LANE_ENGINE : FEATURES.GLOBAL_ENGINE,
        runTier
      );
    }

    const activeOfficers = Array.isArray(officers) ? officers.filter((officer) => !officer.isOnVacation) : [];
    const roleSet = new Set(activeOfficers.map(getOfficerRole));
    const hasLaneRole = [...roleSet].some((role) => role === OFFICER_ROLES.MORTGAGE || role === OFFICER_ROLES.FLEX);

    if (roleSet.size > 1 && !canUseFeature(FEATURES.MULTI_OFFICER_ROLES, runTier)) {
      return buildValidationFailure(
        'MULTI_OFFICER_ROLES_NOT_AVAILABLE',
        'Multiple officer roles require Pro or Platinum.',
        FEATURES.MULTI_OFFICER_ROLES,
        runTier
      );
    }

    if (hasLaneRole && !canUseFeature(FEATURES.MULTI_OFFICER_ROLES, runTier)) {
      return buildValidationFailure(
        'OFFICER_ROLE_NOT_AVAILABLE',
        'Mortgage and Flex officer roles require Pro or Platinum.',
        FEATURES.MULTI_OFFICER_ROLES,
        runTier
      );
    }

    const categories = new Set((Array.isArray(loans) ? loans : []).map(inferLoanCategory));
    if (categories.has(LOAN_CATEGORIES.MORTGAGE) && !canUseLoanCategory(LOAN_CATEGORIES.MORTGAGE, runTier)) {
      return buildValidationFailure(
        'MORTGAGE_LOANS_NOT_AVAILABLE',
        'Mortgage loan support requires Pro or Platinum.',
        FEATURES.MORTGAGE_LOANS,
        runTier
      );
    }

    return {
      valid: true,
      tier: runTier,
      engineType: normalizedEngine,
      loanCategories: [...categories],
      officerRoles: [...roleSet]
    };
  }

  const api = {
    TIERS,
    ENGINES,
    OFFICER_ROLES,
    LOAN_CATEGORIES,
    FEATURES,
    TIER_CONFIG,
    TIER_LIMITS,
    getCurrentTier,
    setCurrentTier,
    getTierConfig,
    getAvailableFeatures,
    getTierLimit,
    getSimulationMaxDays,
    canUseUnlimitedSimulation,
    validateSimulationDays,
    canUseFeature,
    requireFeature,
    canUseEngine,
    canUseOfficerRole,
    canUseLoanCategory,
    validateTierForRun,
    getOfficerRole,
    getTierLabel,
    getLockedFeatureMessage
  };

  globalScope.LendingFairEntitlements = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
