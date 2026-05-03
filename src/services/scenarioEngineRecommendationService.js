(function initializeScenarioEngineRecommendationService(globalScope) {
  const ENGINE_TYPES = {
    GLOBAL: 'global',
    OFFICER_LANE: 'officer_lane'
  };

  const LOAN_CATEGORIES = {
    CONSUMER: 'consumer',
    MORTGAGE: 'mortgage'
  };

  const RECOMMENDATION_MODES = {
    INSUFFICIENT_DATA: 'insufficient_data',
    LOAN_MIX_ONLY: 'loan_mix_only',
    FULL_SCENARIO: 'full_scenario'
  };

  const MORTGAGE_KEYWORDS = [
    'first mortgage',
    'second mortgage',
    'mortgage',
    'home equity',
    'heloc',
    'refi',
    'refinance',
    'real estate',
    'construction loan',
    'land loan'
  ];

  function normalizeLoanCategory(category) {
    return String(category || '').trim().toLowerCase() === LOAN_CATEGORIES.MORTGAGE
      ? LOAN_CATEGORIES.MORTGAGE
      : LOAN_CATEGORIES.CONSUMER;
  }

  function getOfficerRole(officer = {}) {
    const eligibility = globalScope.LoanCategoryUtils?.normalizeOfficerEligibility?.(officer.eligibility) || { consumer: true, mortgage: false };
    if (eligibility.consumer && eligibility.mortgage) {
      return 'flex';
    }
    if (eligibility.mortgage) {
      return 'mortgage-only';
    }
    return 'consumer-only';
  }

  function getConfiguredLoanCategoryForType(typeName) {
    const trimmedType = String(typeName || '').trim();
    if (!trimmedType) {
      return null;
    }

    const registry = globalScope.LendingFairLoanTypeRegistry;
    const configuredTypes = registry?.getLoanTypes?.();
    if (Array.isArray(configuredTypes)) {
      const match = configuredTypes.find((loanType) => String(loanType?.name || '').trim().toLowerCase() === trimmedType.toLowerCase());
      if (match?.category) {
        return normalizeLoanCategory(match.category);
      }
    }

    const registryCategory = registry?.getLoanCategoryForType?.(trimmedType);
    if (normalizeLoanCategory(registryCategory) === LOAN_CATEGORIES.MORTGAGE) {
      return LOAN_CATEGORIES.MORTGAGE;
    }

    if (typeof globalScope.getLoanCategoryForType === 'function') {
      const helperCategory = normalizeLoanCategory(globalScope.getLoanCategoryForType(trimmedType));
      if (helperCategory === LOAN_CATEGORIES.MORTGAGE) {
        return helperCategory;
      }
    }

    return null;
  }

  function classifyMortgageKeywordCategory(typeName) {
    const normalizedType = String(typeName || '').trim().toLowerCase();
    if (!normalizedType) {
      return LOAN_CATEGORIES.CONSUMER;
    }

    return MORTGAGE_KEYWORDS.some((keyword) => normalizedType.includes(keyword))
      ? LOAN_CATEGORIES.MORTGAGE
      : LOAN_CATEGORIES.CONSUMER;
  }

  function getLoanCategory(loan = {}) {
    if (loan.category) {
      return normalizeLoanCategory(loan.category);
    }

    if (loan.loanCategory) {
      return normalizeLoanCategory(loan.loanCategory);
    }

    const typeName = String(loan.type || loan.loanType || '').trim();
    const configuredCategory = getConfiguredLoanCategoryForType(typeName);
    if (configuredCategory) {
      return configuredCategory;
    }

    const classifiedCategory = globalScope.LoanCategoryUtils?.classifyLoanTypeCategory?.(typeName);
    if (classifiedCategory) {
      const normalizedClassifiedCategory = normalizeLoanCategory(classifiedCategory);
      if (normalizedClassifiedCategory === LOAN_CATEGORIES.MORTGAGE) {
        return normalizedClassifiedCategory;
      }
    }

    return classifyMortgageKeywordCategory(typeName);
  }

  function getFairnessModelLabel(engineType) {
    return globalScope.FairnessDisplayService?.getFairnessModelLabel?.(engineType)
      || (engineType === ENGINE_TYPES.OFFICER_LANE ? 'Officer Lane Fairness' : 'Global Fairness');
  }

  function buildRecommendationResult({
    mode,
    recommendedEngine,
    currentEngine,
    confidence,
    reasons,
    isActionable,
    loanCategoryCounts,
    officerRoleCounts,
    hasConsumerLoans,
    hasMortgageLoans,
    hasMixedLoanCategories
  }) {
    return {
      mode,
      recommendedEngine,
      recommendedLabel: getFairnessModelLabel(recommendedEngine),
      currentEngine,
      currentLabel: getFairnessModelLabel(currentEngine),
      confidence,
      reasons,
      isActionable,
      matchesCurrent: currentEngine === recommendedEngine,
      loanCategoryCounts,
      officerRoleCounts,
      hasConsumerLoans,
      hasMortgageLoans,
      hasMixedLoanCategories
    };
  }

  function buildRecommendation({ officers = [], loans = [], currentEngine = ENGINE_TYPES.GLOBAL } = {}) {
    const activeOfficers = (Array.isArray(officers) ? officers : [])
      .filter((officer) => !officer.isOnVacation && String(officer.name || '').trim());
    const activeLoans = (Array.isArray(loans) ? loans : [])
      .filter((loan) => String(loan.name || '').trim());
    const roleCounts = activeOfficers.reduce((counts, officer) => {
      const role = getOfficerRole(officer);
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});
    const loanCategoryCounts = activeLoans.reduce((counts, loan) => {
      const category = getLoanCategory(loan);
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, { consumer: 0, mortgage: 0 });
    const officerRoleCounts = {
      consumerOnly: roleCounts['consumer-only'] || 0,
      mortgageOnly: roleCounts['mortgage-only'] || 0,
      flex: roleCounts.flex || 0
    };
    const hasConsumerOnly = (roleCounts['consumer-only'] || 0) > 0;
    const hasMortgageOnly = (roleCounts['mortgage-only'] || 0) > 0;
    const hasFlex = (roleCounts.flex || 0) > 0;
    const hasConsumerLoans = loanCategoryCounts.consumer > 0;
    const hasMortgageLoans = loanCategoryCounts.mortgage > 0;
    const hasMixedLoanCategories = hasConsumerLoans && hasMortgageLoans;
    const roleKinds = Object.values(roleCounts).filter((count) => count > 0).length;
    const hasRoleSeparatedOfficers = roleKinds > 1;
    const hasDedicatedMortgageCoverage = hasMortgageOnly || hasFlex;
    const hasDistinctConsumerAndMortgageCoverage = hasConsumerOnly && (hasMortgageOnly || hasFlex);
    const reasons = [];
    let recommendedEngine = ENGINE_TYPES.GLOBAL;
    let confidence = 'normal';

    if (activeLoans.length < 1 && activeOfficers.length < 2) {
      reasons.push('Add loans and at least two active officers to evaluate the best-fit fairness model.');
      return buildRecommendationResult({
        mode: RECOMMENDATION_MODES.INSUFFICIENT_DATA,
        recommendedEngine,
        currentEngine,
        confidence: 'low',
        reasons,
        isActionable: false,
        loanCategoryCounts,
        officerRoleCounts,
        hasConsumerLoans,
        hasMortgageLoans,
        hasMixedLoanCategories
      });
    }

    if (activeLoans.length > 0 && activeOfficers.length < 2) {
      if (hasMixedLoanCategories) {
        recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
        reasons.push('The current loan mix spans consumer and mortgage products. Add officer roles to confirm whether Officer Lane Fairness is the best fit.');
      } else if (hasMortgageLoans) {
        recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
        reasons.push('The current loan mix includes mortgage products. Officer Lane Fairness may be recommended once consumer/mortgage officer roles are configured.');
      }
      if (!hasMortgageLoans) {
        reasons.push('The current loan mix is consumer-only. Global Fairness is likely sufficient unless the officer pool has role-specific coverage.');
      }
      reasons.push('Add at least two active officers to complete the recommendation.');

      return buildRecommendationResult({
        mode: RECOMMENDATION_MODES.LOAN_MIX_ONLY,
        recommendedEngine,
        currentEngine,
        confidence: 'preliminary',
        reasons,
        isActionable: false,
        loanCategoryCounts,
        officerRoleCounts,
        hasConsumerLoans,
        hasMortgageLoans,
        hasMixedLoanCategories
      });
    }

    if (activeLoans.length < 1) {
      if (roleKinds > 1 && (hasFlex || (hasConsumerOnly && hasMortgageOnly))) {
        recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
        reasons.push('The active officer pool has role-specific coverage, but loans are needed before confirming the best-fit fairness model.');
      }
      reasons.push('Add at least one loan to include the current loan mix in the recommendation.');

      return buildRecommendationResult({
        mode: RECOMMENDATION_MODES.INSUFFICIENT_DATA,
        recommendedEngine,
        currentEngine,
        confidence: 'low',
        reasons,
        isActionable: false,
        loanCategoryCounts,
        officerRoleCounts,
        hasConsumerLoans,
        hasMortgageLoans,
        hasMixedLoanCategories
      });
    }

    if (hasMortgageLoans && hasDistinctConsumerAndMortgageCoverage) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'high';
      reasons.push('The current loan mix includes mortgage loans and the active officer pool has consumer/mortgage lane separation.');
    } else if (hasMixedLoanCategories && hasRoleSeparatedOfficers) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'high';
      reasons.push('The current loan mix spans consumer and mortgage products, and the officer pool has role-specific coverage.');
    } else if (hasMortgageLoans && hasDedicatedMortgageCoverage && roleKinds > 1) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'medium';
      reasons.push('Mortgage loans are present and at least one active officer has mortgage-specific coverage.');
    } else if (roleKinds > 1 && (hasFlex || (hasConsumerOnly && hasMortgageOnly))) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'medium';
      reasons.push('The active officer pool mixes role-specific and flexible coverage. This recommendation is based on officer configuration because the current loan mix does not include mortgage loans.');
    }

    if (recommendedEngine === ENGINE_TYPES.GLOBAL) {
      if (hasMortgageLoans && roleKinds === 1) {
        reasons.push('Mortgage loans are present, but the active officers share the same coverage pattern, so Global Fairness can still balance the pool.');
      } else if (hasMixedLoanCategories && roleKinds === 1) {
        reasons.push('The loan mix spans consumer and mortgage types, but the active officers share the same coverage pattern.');
      } else {
        reasons.push('The active officer pool is role-homogeneous enough for global cross-officer balancing.');
      }
    }

    return buildRecommendationResult({
      mode: RECOMMENDATION_MODES.FULL_SCENARIO,
      recommendedEngine,
      currentEngine,
      confidence,
      reasons,
      isActionable: true,
      loanCategoryCounts,
      officerRoleCounts,
      hasConsumerLoans,
      hasMortgageLoans,
      hasMixedLoanCategories
    });
  }

  globalScope.ScenarioEngineRecommendationService = {
    buildRecommendation,
    getLoanCategory,
    RECOMMENDATION_MODES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalScope.ScenarioEngineRecommendationService;
  }
})(typeof window !== 'undefined' ? window : global);
