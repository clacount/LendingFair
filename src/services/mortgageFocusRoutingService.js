(function initializeMortgageFocusRoutingService(globalScope) {
  function getCategoryWeightBias(categoryWeight) {
    return 0.8 + (0.2 * Math.max(0, Math.min(1, Number(categoryWeight) || 0)));
  }

  function getMortgageParticipationBias({ mortgagePermissionLevel = 'full-mortgage', hasMortgageOnlyOfficer = false, isMortgageOnly = false, isFlex = false } = {}) {
    if (!hasMortgageOnlyOfficer) {
      return 1;
    }

    if (mortgagePermissionLevel === 'heloc') {
      // HELOC intentionally allows flex support; keep M advantage but avoid hard lockout.
      if (isMortgageOnly) {
        return 1.2;
      }
      if (isFlex) {
        return 0.9;
      }
      return 1;
    }

    if (isMortgageOnly) {
      return 1.15;
    }
    if (isFlex) {
      return 0.6;
    }

    return 1;
  }


  function isMortgageOnlyOfficer(officerConfig = {}) {
    const eligibility = officerConfig.eligibility || {};
    return Boolean(eligibility.mortgage) && !Boolean(eligibility.consumer);
  }

  function isFlexOfficer(officerConfig = {}) {
    const eligibility = officerConfig.eligibility || {};
    return Boolean(eligibility.consumer) && Boolean(eligibility.mortgage);
  }

  function selectMortgageCompetitionPool(officers = [], mortgagePermissionLevel = 'full-mortgage') {
    const safeOfficers = Array.isArray(officers) ? officers : [];
    if (mortgagePermissionLevel === 'heloc') {
      return safeOfficers;
    }

    const mortgageOnlyOfficers = safeOfficers.filter((officer) => isMortgageOnlyOfficer(officer));
    const overrideFlexOfficers = safeOfficers.filter((officer) => isFlexOfficer(officer) && Boolean(officer.mortgageOverride));

    // For full mortgage products, M officers lead; override-enabled flex officers remain in the pool as explicit support.
    if (mortgageOnlyOfficers.length) {
      return [...mortgageOnlyOfficers, ...overrideFlexOfficers];
    }

    if (overrideFlexOfficers.length) {
      return overrideFlexOfficers;
    }

    return safeOfficers.filter((officer) => isFlexOfficer(officer));
  }

  function getMortgageCompetitionStrength({ rawWeight = 0, mortgagePermissionLevel = 'full-mortgage', hasMortgageOnlyOfficer = false, isMortgageOnly = false, isFlex = false } = {}) {
    const clampedWeight = Math.max(0.01, Number(rawWeight) || 0);
    const weightBias = getCategoryWeightBias(clampedWeight);
    const participationBias = getMortgageParticipationBias({
      mortgagePermissionLevel,
      hasMortgageOnlyOfficer,
      isMortgageOnly,
      isFlex
    });

    return weightBias * participationBias;
  }

  globalScope.MortgageFocusRoutingService = {
    getMortgageParticipationBias,
    getMortgageCompetitionStrength,
    selectMortgageCompetitionPool
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalScope.MortgageFocusRoutingService;
  }
})(typeof window !== 'undefined' ? window : globalThis);
