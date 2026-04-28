(function initializeFairnessEngineService(globalScope) {
  const COUNT_VARIANCE_THRESHOLD_PERCENT = 15;
  const AMOUNT_VARIANCE_THRESHOLD_PERCENT = 20;
  const ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT = 25;
  const HELOC_SUPPORT_COUNT_THRESHOLD_PERCENT = 20;
  const HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT = 20;
  const SETTINGS_STORAGE_KEY = 'loan-randomizer-settings-v1';

  const FAIRNESS_ENGINES = {
    GLOBAL: 'global',
    OFFICER_LANE: 'officer_lane'
  };

  const FAIRNESS_ENGINE_LABELS = {
    [FAIRNESS_ENGINES.GLOBAL]: 'Global Fairness',
    [FAIRNESS_ENGINES.OFFICER_LANE]: 'Officer Lane Fairness'
  };

  const GlobalFairnessEngineClass = globalScope.GlobalFairnessEngine
    || (typeof require === 'function' ? require('./fairnessEngines/globalFairnessEngine.js') : null);
  const OfficerLaneFairnessEngineClass = globalScope.OfficerLaneFairnessEngine
    || (typeof require === 'function' ? require('./fairnessEngines/officerLaneFairnessEngine.js') : null);

  function normalizeEngineType(engineType) {
    return engineType === FAIRNESS_ENGINES.OFFICER_LANE
      ? FAIRNESS_ENGINES.OFFICER_LANE
      : FAIRNESS_ENGINES.GLOBAL;
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
      // no-op
    }
  }

  function getSelectedFairnessEngine() {
    const settings = readSettings();
    return normalizeEngineType(settings.fairnessEngine);
  }

  function setSelectedFairnessEngine(engineType) {
    const normalizedEngine = normalizeEngineType(engineType);
    const settings = readSettings();
    settings.fairnessEngine = normalizedEngine;
    writeSettings(settings);
    return normalizedEngine;
  }

  function normalizeOfficer(officerConfig = {}) {
    const utils = globalScope.LoanCategoryUtils;
    const eligibility = utils?.normalizeOfficerEligibility(officerConfig.eligibility) || { consumer: true, mortgage: false };
    return {
      ...officerConfig,
      name: String(officerConfig.name || '').trim(),
      eligibility,
      mortgageOverride: Boolean(officerConfig.mortgageOverride),
      isOnVacation: Boolean(officerConfig.isOnVacation)
    };
  }

  function getOfficerClassCode(officerConfig = {}) {
    const normalizedOfficer = normalizeOfficer(officerConfig);
    if (normalizedOfficer.eligibility.consumer && normalizedOfficer.eligibility.mortgage) {
      return 'F';
    }
    if (normalizedOfficer.eligibility.mortgage) {
      return 'M';
    }
    return 'C';
  }

  function isFlexOfficer(officerConfig = {}) {
    return getOfficerClassCode(officerConfig) === 'F';
  }

  function isMortgageOnlyOfficer(officerConfig = {}) {
    return getOfficerClassCode(officerConfig) === 'M';
  }

  function hasSingleMortgageOnlyOfficer(officers = []) {
    return officers.filter((officer) => isMortgageOnlyOfficer(officer)).length === 1;
  }

  function normalizeOfficerStatsEntry(entry = {}) {
    const normalizedTypeBreakdown = entry.typeBreakdown && typeof entry.typeBreakdown === 'object'
      ? entry.typeBreakdown
      : (entry.typeCounts && typeof entry.typeCounts === 'object' ? entry.typeCounts : {});

    return {
      officer: String(entry.officer || '').trim(),
      totalLoans: Number(entry.totalLoans) || 0,
      totalAmount: Number(entry.totalAmount) || 0,
      consumerLoanCount: Number(entry.consumerLoanCount) || 0,
      consumerAmount: Number(entry.consumerAmount) || 0,
      mortgageLoanCount: Number(entry.mortgageLoanCount) || 0,
      mortgageAmount: Number(entry.mortgageAmount) || 0,
      typeBreakdown: normalizedTypeBreakdown
    };
  }

  function calculateMaxVariance(entries, valueKey) {
    if (!entries.length) {
      return 0;
    }

    const values = entries.map((entry) => Number(entry[valueKey]) || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) {
      return 0;
    }

    const highest = Math.max(...values);
    const lowest = Math.min(...values);

    // Report variance in percentage points of the lane/category total so UI values
    // match the visual spread shown in the donut charts.
    return ((highest - lowest) / total) * 100;
  }

  function buildCategoryVariance(entries, countKey, amountKey) {
    const maxCountVariancePercent = calculateMaxVariance(entries, countKey);
    const maxAmountVariancePercent = calculateMaxVariance(entries, amountKey);

    return {
      maxCountVariancePercent,
      maxAmountVariancePercent,
      countDistributionPass: maxCountVariancePercent <= COUNT_VARIANCE_THRESHOLD_PERCENT,
      amountDistributionPass: maxAmountVariancePercent <= AMOUNT_VARIANCE_THRESHOLD_PERCENT
    };
  }

  function buildLaneBreakdownText(entries = [], valueKey, unitLabel) {
    const valuesByOfficer = entries
      .map((entry) => ({
        officer: String(entry.officer || '').trim(),
        value: Number(entry[valueKey]) || 0
      }))
      .filter((entry) => entry.officer);

    const total = valuesByOfficer.reduce((sum, entry) => sum + entry.value, 0);
    if (!total || !valuesByOfficer.length) {
      return '';
    }

    const sorted = [...valuesByOfficer].sort((a, b) => b.value - a.value);
    const breakdown = sorted.map((entry) => `${entry.officer}: ${entry.value}`).join(', ');
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    const spreadPercent = ((highest.value - lowest.value) / total) * 100;

    return `${unitLabel} distribution (C lane): ${breakdown} (spread ${spreadPercent.toFixed(1)}%).`;
  }

  function buildOfficerClassMap(officers = []) {
    return Object.fromEntries(officers.map((officer) => [officer.name, getOfficerClassCode(officer)]));
  }

  function buildFlexVariance(flexEntries = []) {
    const enrichedEntries = flexEntries
      .map((entry) => {
        const consumerAmount = Number(entry.consumerAmount) || 0;
        const mortgageAmount = Number(entry.mortgageAmount) || 0;
        const totalAmount = consumerAmount + mortgageAmount;
        return {
          ...entry,
          consumerShare: totalAmount ? consumerAmount / totalAmount : 0,
          mortgageShare: totalAmount ? mortgageAmount / totalAmount : 0
        };
      })
      .filter((entry) => (Number(entry.consumerAmount) || 0) > 0 || (Number(entry.mortgageAmount) || 0) > 0);

    const consumerShareVariancePercent = calculateMaxVariance(enrichedEntries.map((entry) => ({ value: entry.consumerShare * 100 })), 'value');
    const mortgageShareVariancePercent = calculateMaxVariance(enrichedEntries.map((entry) => ({ value: entry.mortgageShare * 100 })), 'value');

    return {
      officerCount: enrichedEntries.length,
      consumerShareVariancePercent,
      mortgageShareVariancePercent,
      totalConsumerAmount: enrichedEntries.reduce((sum, entry) => sum + (Number(entry.consumerAmount) || 0), 0),
      totalMortgageAmount: enrichedEntries.reduce((sum, entry) => sum + (Number(entry.mortgageAmount) || 0), 0)
    };
  }

  function isAllowedFlexMortgageLoanType(typeName, loanTypeConfig = {}, context = {}) {
    const category = String(loanTypeConfig.category || '').toLowerCase();
    if (category && category !== 'mortgage') {
      return true;
    }

    const normalizedType = String(typeName || '').trim().toLowerCase();
    const allowedBaseTypes = new Set(['heloc']);

    if (allowedBaseTypes.has(normalizedType)) {
      return true;
    }

    if (context.allowBroadFlexMortgageCoverage || loanTypeConfig.allowFlexMortgage === true) {
      return true;
    }

    return false;
  }

  function isFlexMortgageParticipationExpected(context = {}) {
    if (!context.totalMortgageAmount) {
      return false;
    }
    if (context.allowBroadFlexMortgageCoverage) {
      return true;
    }
    if (!context.hasAnyMortgageOnlyOfficer) {
      return true;
    }
    return context.activeMortgageOnlyOfficerCount === 0;
  }

  function didFlexMortgageParticipationViolateRules(context = {}) {
    if (!context.flexMortgageTypesByOfficer || !Object.keys(context.flexMortgageTypesByOfficer).length) {
      return false;
    }

    const participationExpected = isFlexMortgageParticipationExpected(context);
    return Object.entries(context.flexMortgageTypesByOfficer).some(([, typeBreakdown]) => (
      Object.entries(typeBreakdown || {}).some(([typeName, count]) => {
        if ((Number(count) || 0) <= 0) {
          return false;
        }
        if (participationExpected) {
          return false;
        }

        const category = globalScope.getLoanCategoryForType ? globalScope.getLoanCategoryForType(typeName) : 'consumer';
        return !isAllowedFlexMortgageLoanType(typeName, { category }, context);
      })
    ));
  }

  function buildLaneVarianceStatusDescriptor({ laneKeyPrefix, laneLabel, laneVariance, contextLabel }) {
    const countVariance = Number(laneVariance?.maxCountVariancePercent) || 0;
    const dollarVariance = Number(laneVariance?.maxAmountVariancePercent) || 0;
    const countFail = !Boolean(laneVariance?.countDistributionPass);
    const dollarFail = !Boolean(laneVariance?.amountDistributionPass);

    if (countFail && dollarFail) {
      const countNormalizedMargin = (countVariance - COUNT_VARIANCE_THRESHOLD_PERCENT) / COUNT_VARIANCE_THRESHOLD_PERCENT;
      const dollarNormalizedMargin = (dollarVariance - AMOUNT_VARIANCE_THRESHOLD_PERCENT) / AMOUNT_VARIANCE_THRESHOLD_PERCENT;
      if (countNormalizedMargin >= dollarNormalizedMargin) {
        return {
          key: `${laneKeyPrefix}_count_variance`,
          label: `${laneLabel} count variance`,
          valuePercent: countVariance,
          contextLabel
        };
      }

      return {
        key: `${laneKeyPrefix}_dollar_variance`,
        label: `${laneLabel} dollar variance`,
        valuePercent: dollarVariance,
        contextLabel
      };
    }

    if (countFail) {
      return {
        key: `${laneKeyPrefix}_count_variance`,
        label: `${laneLabel} count variance`,
        valuePercent: countVariance,
        contextLabel
      };
    }

    return {
      key: `${laneKeyPrefix}_dollar_variance`,
      label: `${laneLabel} dollar variance`,
      valuePercent: dollarVariance,
      contextLabel
    };
  }

  function isHomogeneousHelocSupportPool({ officers = [], hasConsumerLoans = false, loanTypeNames = [] } = {}) {
    const normalizedOfficers = Array.isArray(officers) ? officers.map((officer) => normalizeOfficer(officer)) : [];
    const hasMortgageOnlyOfficer = normalizedOfficers.some((officer) => isMortgageOnlyOfficer(officer));
    const hasFlexOfficer = normalizedOfficers.some((officer) => isFlexOfficer(officer));
    if (!hasMortgageOnlyOfficer || !hasFlexOfficer) {
      return false;
    }

    if (hasConsumerLoans) {
      return false;
    }

    const normalizedLoanTypes = Array.isArray(loanTypeNames)
      ? loanTypeNames.map((typeName) => String(typeName || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (!normalizedLoanTypes.length) {
      return false;
    }

    return normalizedLoanTypes.every((typeName) => typeName === 'heloc');
  }

  function isMortgageTypeName(typeName = '') {
    const normalizedType = String(typeName || '').trim().toLowerCase();
    if (!normalizedType) {
      return false;
    }
    if (globalScope.getLoanCategoryForType) {
      return globalScope.getLoanCategoryForType(typeName) === 'mortgage';
    }
    return normalizedType.includes('mortgage') || normalizedType.includes('refi') || normalizedType === 'heloc';
  }

  function buildEngineDependencies() {
    return {
      countVarianceThresholdPercent: COUNT_VARIANCE_THRESHOLD_PERCENT,
      amountVarianceThresholdPercent: AMOUNT_VARIANCE_THRESHOLD_PERCENT,
      advisoryAmountVarianceUpperPercent: ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT,
      helocSupportCountThresholdPercent: HELOC_SUPPORT_COUNT_THRESHOLD_PERCENT,
      helocSupportAmountThresholdPercent: HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT,
      calculateMaxVariance,
      normalizeOfficer,
      getOfficerClassCode,
      isFlexOfficer,
      isMortgageOnlyOfficer,
      hasSingleMortgageOnlyOfficer,
      buildOfficerClassMap,
      buildLaneBreakdownText,
      buildLaneVarianceStatusDescriptor,
      isHomogeneousHelocSupportPool,
      isFlexMortgageParticipationExpected,
      didFlexMortgageParticipationViolateRules
    };
  }

  function getFairnessEngineEvaluator(engineType) {
    const dependencies = buildEngineDependencies();
    if (engineType === FAIRNESS_ENGINES.OFFICER_LANE) {
      if (!OfficerLaneFairnessEngineClass) {
        throw new Error('OfficerLaneFairnessEngine is unavailable.');
      }
      return new OfficerLaneFairnessEngineClass(dependencies);
    }

    if (!GlobalFairnessEngineClass) {
      throw new Error('GlobalFairnessEngine is unavailable.');
    }
    return new GlobalFairnessEngineClass(dependencies);
  }

  function evaluateFairness({ engineType, officers = [], officerStats = [], optimizationMetrics = {} } = {}) {
    const normalizedEngine = normalizeEngineType(engineType);
    const normalizedOfficers = Array.isArray(officers) ? officers.map((officer) => normalizeOfficer(officer)) : [];
    const activeOfficers = normalizedOfficers.filter((officer) => !officer.isOnVacation);
    const activeOfficerNames = new Set(activeOfficers.map((officer) => officer.name));
    const safeOfficerStats = Array.isArray(officerStats)
      ? officerStats.map((entry) => normalizeOfficerStatsEntry(entry)).filter((entry) => entry.officer)
      : [];
    const participatingOfficerStats = safeOfficerStats.filter((entry) => activeOfficerNames.has(entry.officer));

    const overallAverageLoanCount = participatingOfficerStats.length
      ? participatingOfficerStats.reduce((sum, entry) => sum + (Number(entry.totalLoans) || 0), 0) / participatingOfficerStats.length
      : 0;
    const overallAverageDollarAmount = participatingOfficerStats.length
      ? participatingOfficerStats.reduce((sum, entry) => sum + (Number(entry.totalAmount) || 0), 0) / participatingOfficerStats.length
      : 0;

    const officerClassMap = buildOfficerClassMap(activeOfficers);
    const consumerLaneEntries = participatingOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'C');
    const flexEntries = participatingOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'F');
    const mortgageLaneEntries = participatingOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'M');

    const consumerEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (consumerLaneEntries.length ? consumerLaneEntries : participatingOfficerStats)
      : participatingOfficerStats;
    const mortgageEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (mortgageLaneEntries.length ? mortgageLaneEntries : participatingOfficerStats)
      : participatingOfficerStats;

    const flexVariance = buildFlexVariance(flexEntries);
    const flexLaneVariance = buildCategoryVariance(flexEntries, 'totalLoans', 'totalAmount');

    const categoryMetrics = {
      consumerVariance: buildCategoryVariance(consumerEntries, 'consumerLoanCount', 'consumerAmount'),
      mortgageVariance: buildCategoryVariance(mortgageEntries, 'mortgageLoanCount', 'mortgageAmount'),
      flexVariance: {
        ...flexVariance,
        maxCountVariancePercent: flexLaneVariance.maxCountVariancePercent,
        maxAmountVariancePercent: flexLaneVariance.maxAmountVariancePercent,
        countDistributionPass: flexLaneVariance.countDistributionPass,
        amountDistributionPass: flexLaneVariance.amountDistributionPass
      }
    };

    const mortgageByOfficer = participatingOfficerStats.map((entry) => ({ officer: entry.officer, amount: Number(entry.mortgageAmount) || 0 }));
    const mortgageByTypeByOfficer = Object.fromEntries(
      participatingOfficerStats.map((entry) => {
        const typeBreakdown = entry.typeBreakdown || {};
        const mortgageTypes = Object.fromEntries(
Object.entries(typeBreakdown).filter(([typeName]) => isMortgageTypeName(typeName))
        );
        return [entry.officer, mortgageTypes];
      })
    );

    const context = {
      officers: activeOfficers,
      officerStats: participatingOfficerStats,
      categoryMetrics,
      mortgageByOfficer,
      mortgageByTypeByOfficer,
      flexVariance,
      optimizationMetrics
    };

    const engineResult = getFairnessEngineEvaluator(normalizedEngine).evaluate(context);

    return {
      engineType: normalizedEngine,
      overallResult: engineResult.overallResult,
      summaryItems: engineResult.summaryItems || [],
      notes: engineResult.notes || [],
      chartAnnotations: engineResult.chartAnnotations || {},
      roleAwareFlags: engineResult.roleAwareFlags || {},
      statusMetricDescriptor: engineResult.statusMetricDescriptor || null,
      metrics: {
        averageLoanCount: overallAverageLoanCount,
        averageDollarAmount: overallAverageDollarAmount,
        helocWeightedVariancePercent: Number.isFinite(Number(optimizationMetrics.helocWeightedVariancePercent))
          ? Number(optimizationMetrics.helocWeightedVariancePercent)
          : null,
        consumerVariance: categoryMetrics.consumerVariance,
        mortgageVariance: categoryMetrics.mortgageVariance,
        flexVariance: categoryMetrics.flexVariance,
        maxCountVariancePercent: calculateMaxVariance(participatingOfficerStats, 'totalLoans'),
        maxAmountVariancePercent: calculateMaxVariance(participatingOfficerStats, 'totalAmount')
      }
    };
  }

  globalScope.FairnessEngineService = {
    FAIRNESS_ENGINES,
    FAIRNESS_ENGINE_LABELS,
    getSelectedFairnessEngine,
    setSelectedFairnessEngine,
    getOfficerClassCode,
    hasSingleMortgageOnlyOfficer,
    isHomogeneousHelocSupportPool,
    evaluateFairness
  };
})(window);
