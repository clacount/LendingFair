(function initializeLoanCategoryUtils(globalScope) {
  const LOAN_CATEGORIES = {
    CONSUMER: 'consumer',
    MORTGAGE: 'mortgage'
  };

  const OFFICER_SCOPES = {
    CONSUMER_ONLY: 'consumer-only',
    CONSUMER_AND_MORTGAGE: 'consumer-mortgage',
    MORTGAGE_ONLY: 'mortgage-only'
  };

  const MORTGAGE_NAME_PATTERNS = [
    'first mortgage',
    'mortgage',
    'home refi',
    'refi',
    'refinance',
    'heloc',
    'home equity',
    'home equity line'
  ];

  function normalizeLoanCategory(category) {
    return String(category || '').trim().toLowerCase() === LOAN_CATEGORIES.MORTGAGE
      ? LOAN_CATEGORIES.MORTGAGE
      : LOAN_CATEGORIES.CONSUMER;
  }

  function classifyLoanTypeCategory(typeName = '') {
    const normalizedName = String(typeName || '').trim().toLowerCase();
    if (!normalizedName) {
      return LOAN_CATEGORIES.CONSUMER;
    }

    const isMortgage = MORTGAGE_NAME_PATTERNS.some((pattern) => normalizedName.includes(pattern));
    return isMortgage ? LOAN_CATEGORIES.MORTGAGE : LOAN_CATEGORIES.CONSUMER;
  }

  function normalizeLoanTypeCategory(type = {}) {
    return normalizeLoanCategory(type.category || classifyLoanTypeCategory(type.name));
  }

  function getDefaultOfficerEligibility() {
    return { consumer: true, mortgage: false };
  }

  function getDefaultOfficerWeights() {
    return { consumer: 1.0, mortgage: 0.0 };
  }

  function sanitizeWeight(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function getEligibilityFromScope(scopeValue) {
    const scope = String(scopeValue || '').trim().toLowerCase();

    if (scope === OFFICER_SCOPES.MORTGAGE_ONLY) {
      return { consumer: false, mortgage: true };
    }

    if (scope === OFFICER_SCOPES.CONSUMER_AND_MORTGAGE) {
      return { consumer: true, mortgage: true };
    }

    return { consumer: true, mortgage: false };
  }

  function getOfficerScopeFromConfig(eligibility) {
    const normalized = normalizeOfficerEligibility(eligibility);

    if (normalized.consumer && normalized.mortgage) {
      return OFFICER_SCOPES.CONSUMER_AND_MORTGAGE;
    }

    if (!normalized.consumer && normalized.mortgage) {
      return OFFICER_SCOPES.MORTGAGE_ONLY;
    }

    return OFFICER_SCOPES.CONSUMER_ONLY;
  }

  function getDefaultWeightsForScope(scopeValue) {
    const scope = String(scopeValue || '').trim().toLowerCase();

    if (scope === OFFICER_SCOPES.MORTGAGE_ONLY) {
      return { consumer: 0.0, mortgage: 1.0 };
    }

    if (scope === OFFICER_SCOPES.CONSUMER_AND_MORTGAGE) {
      return { consumer: 0.5, mortgage: 0.5 };
    }

    return { consumer: 1.0, mortgage: 0.0 };
  }

  function normalizeOfficerEligibility(eligibility = {}) {
    const defaults = getDefaultOfficerEligibility();
    return {
      consumer: typeof eligibility.consumer === 'boolean' ? eligibility.consumer : defaults.consumer,
      mortgage: typeof eligibility.mortgage === 'boolean' ? eligibility.mortgage : defaults.mortgage
    };
  }

  function normalizeOfficerWeights(weights = {}, eligibility = getDefaultOfficerEligibility()) {
    const defaultWeights = getDefaultWeightsForScope(getOfficerScopeFromConfig(eligibility));
    return {
      consumer: sanitizeWeight(weights.consumer, defaultWeights.consumer),
      mortgage: sanitizeWeight(weights.mortgage, defaultWeights.mortgage)
    };
  }

  function getCategoryWeightForOfficer(officerConfig, category) {
    const normalizedCategory = normalizeLoanCategory(category);
    const weights = normalizeOfficerWeights(officerConfig?.weights, officerConfig?.eligibility);
    const rawWeight = normalizedCategory === LOAN_CATEGORIES.MORTGAGE ? weights.mortgage : weights.consumer;
    return Math.max(rawWeight, 0.01);
  }

  function isOfficerEligibleForCategory(officerConfig, category) {
    const normalizedEligibility = normalizeOfficerEligibility(officerConfig?.eligibility);
    const normalizedCategory = normalizeLoanCategory(category);
    return normalizedCategory === LOAN_CATEGORIES.MORTGAGE
      ? normalizedEligibility.mortgage
      : normalizedEligibility.consumer;
  }

  function getEligibleOfficersForLoan(officers, category) {
    return officers.filter((officerConfig) => isOfficerEligibleForCategory(officerConfig, category));
  }

  globalScope.LoanCategoryUtils = {
    LOAN_CATEGORIES,
    OFFICER_SCOPES,
    classifyLoanTypeCategory,
    normalizeLoanCategory,
    normalizeLoanTypeCategory,
    getDefaultOfficerEligibility,
    getDefaultOfficerWeights,
    getOfficerScopeFromConfig,
    getEligibilityFromScope,
    getDefaultWeightsForScope,
    normalizeOfficerEligibility,
    normalizeOfficerWeights,
    getCategoryWeightForOfficer,
    isOfficerEligibleForCategory,
    getEligibleOfficersForLoan
  };
})(window);
