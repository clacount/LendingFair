(function initializeScenarioEngineRecommendationService(globalScope) {
  const ENGINE_TYPES = {
    GLOBAL: 'global',
    OFFICER_LANE: 'officer_lane'
  };

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

  function getLoanCategory(loan = {}) {
    return globalScope.LoanCategoryUtils?.classifyLoanTypeCategory?.(loan.type) || 'consumer';
  }

  function getFairnessModelLabel(engineType) {
    return globalScope.FairnessDisplayService?.getFairnessModelLabel?.(engineType)
      || (engineType === ENGINE_TYPES.OFFICER_LANE ? 'Officer Lane Fairness' : 'Global Fairness');
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
    const loanCategories = new Set(activeLoans.map(getLoanCategory));
    const hasConsumerOnly = (roleCounts['consumer-only'] || 0) > 0;
    const hasMortgageOnly = (roleCounts['mortgage-only'] || 0) > 0;
    const hasFlex = (roleCounts.flex || 0) > 0;
    const hasConsumerLoans = loanCategories.has('consumer');
    const hasMortgageLoans = loanCategories.has('mortgage');
    const roleKinds = Object.values(roleCounts).filter((count) => count > 0).length;
    const reasons = [];
    let recommendedEngine = ENGINE_TYPES.GLOBAL;
    let confidence = 'normal';

    if (activeOfficers.length < 2 || activeLoans.length < 1) {
      reasons.push('Add at least two active officers and one loan to evaluate the scenario.');
      return {
        recommendedEngine,
        recommendedLabel: getFairnessModelLabel(recommendedEngine),
        currentEngine,
        currentLabel: getFairnessModelLabel(currentEngine),
        confidence: 'low',
        reasons,
        isActionable: false,
        matchesCurrent: currentEngine === recommendedEngine
      };
    }

    if (hasMortgageOnly && hasFlex && hasMortgageLoans) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'high';
      reasons.push('Mortgage-only and flex officers are active with mortgage loans, so role-aware lane fairness is the better fit.');
    }

    if (hasConsumerOnly && hasMortgageOnly && hasFlex) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = 'high';
      reasons.push('Consumer-only, mortgage-only, and flex officers are all active, so the scenario has distinct operating lanes.');
    } else if (roleKinds > 1 && (hasFlex || (hasConsumerOnly && hasMortgageOnly))) {
      recommendedEngine = ENGINE_TYPES.OFFICER_LANE;
      confidence = confidence === 'high' ? confidence : 'medium';
      reasons.push('The active officer pool mixes role-specific and flexible coverage.');
    }

    if (recommendedEngine === ENGINE_TYPES.GLOBAL) {
      reasons.push('The active officer pool is role-homogeneous enough for global cross-officer balancing.');
      if (hasConsumerLoans && hasMortgageLoans && roleKinds === 1) {
        reasons.push('The loan mix spans consumer and mortgage types, but the active officers share the same coverage pattern.');
      }
    }

    return {
      recommendedEngine,
      recommendedLabel: getFairnessModelLabel(recommendedEngine),
      currentEngine,
      currentLabel: getFairnessModelLabel(currentEngine),
      confidence,
      reasons,
      isActionable: true,
      matchesCurrent: currentEngine === recommendedEngine
    };
  }

  globalScope.ScenarioEngineRecommendationService = {
    buildRecommendation
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalScope.ScenarioEngineRecommendationService;
  }
})(typeof window !== 'undefined' ? window : global);
