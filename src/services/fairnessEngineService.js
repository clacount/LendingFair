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

  function isSingleMloExpectedVarianceScenario(context = {}) {
    // Officer-lane design: a single mortgage-only officer can legitimately concentrate mortgage lane volume.
    return Boolean(context.singleMlo && context.mortgageRoutingPass && !context.flexParticipationViolation);
  }

  function isMortgageLaneVarianceBlockingReview(context = {}) {
    if (context.mortgageLanePass) {
      return false;
    }

    // Keep mortgage variance non-blocking only for intentional single-MLO lane concentration.
    if (isSingleMloExpectedVarianceScenario(context)) {
      return false;
    }

    return true;
  }

  function determineOfficerLaneOverallPass(context = {}) {
    return Boolean(
      context.consumerPass
      && context.flexLanePass
      && context.mortgageRoutingPass
      && !context.flexParticipationViolation
      && !isMortgageLaneVarianceBlockingReview(context)
    );
  }

  function evaluateGlobalFairness(context) {
    const { categoryMetrics } = context;
    const overallCountVariance = calculateMaxVariance(context.officerStats || [], 'totalLoans');
    const overallAmountVariance = calculateMaxVariance(context.officerStats || [], 'totalAmount');

    const overallPass = overallCountVariance <= COUNT_VARIANCE_THRESHOLD_PERCENT
      && overallAmountVariance <= AMOUNT_VARIANCE_THRESHOLD_PERCENT;
    const thresholdBreaches = [];
    if (overallCountVariance > COUNT_VARIANCE_THRESHOLD_PERCENT) {
      thresholdBreaches.push('Overall loan variance');
    }
    if (overallAmountVariance > AMOUNT_VARIANCE_THRESHOLD_PERCENT) {
      thresholdBreaches.push('Overall dollar variance');
    }

    return {
      overallResult: overallPass ? 'PASS' : 'REVIEW',
      summaryItems: [
        `Overall loan variance: ${overallCountVariance.toFixed(1)}%`,
        `Overall dollar variance: ${overallAmountVariance.toFixed(1)}%`,
        `Consumer loan variance: ${categoryMetrics.consumerVariance.maxCountVariancePercent.toFixed(1)}%`,
        `Consumer dollar variance: ${categoryMetrics.consumerVariance.maxAmountVariancePercent.toFixed(1)}%`,
        `Mortgage loan variance: ${categoryMetrics.mortgageVariance.maxCountVariancePercent.toFixed(1)}%`,
        `Mortgage dollar variance: ${categoryMetrics.mortgageVariance.maxAmountVariancePercent.toFixed(1)}%`
      ],
      notes: [
        overallPass
          ? 'Threshold status: PASS (all global variance thresholds are within limits).'
          : `Threshold status: REVIEW (${thresholdBreaches.join(', ')} exceeded threshold${thresholdBreaches.length > 1 ? 's' : ''}).`,
        'Global Fairness compares distribution across all officers and categories.',
        'Large cross-officer variance should be reviewed when thresholds are exceeded.'
      ],
      chartAnnotations: {
        mortgageTitleSuffix: '',
        mortgageNote: 'Mortgage concentrations are evaluated with global cross-officer variance thresholds.'
      },
      roleAwareFlags: {
        hasSingleMortgageOnlyOfficer: hasSingleMortgageOnlyOfficer(context.officers),
        mortgageVarianceExpected: false,
        flexParticipationExpected: false
      }
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

  function evaluateHelocSupportFlexThresholds(flexVariance = {}) {
    const countVariance = Number(flexVariance.maxCountVariancePercent) || 0;
    const amountVariance = Number(flexVariance.maxAmountVariancePercent) || 0;
    const strictPass = countVariance <= HELOC_SUPPORT_COUNT_THRESHOLD_PERCENT && amountVariance <= HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT;
    const advisoryPass = countVariance <= ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT && amountVariance <= ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT;

    return {
      countVariance,
      amountVariance,
      strictPass,
      advisoryPass,
      overAdvisory: !advisoryPass,
      advisoryBandApplied: !strictPass && advisoryPass
    };
  }

  function evaluateOfficerLaneFairness(context) {
    const {
      officers,
      officerStats = [],
      categoryMetrics,
      mortgageByOfficer = [],
      mortgageByTypeByOfficer = {},
      flexVariance
    } = context;
    const singleMlo = hasSingleMortgageOnlyOfficer(officers);
    const normalizedOfficers = officers.map((officer) => normalizeOfficer(officer));
    const officerClassMap = buildOfficerClassMap(normalizedOfficers);
    const consumerLaneEntries = officerStats.filter((entry) => officerClassMap[entry.officer] === 'C');
    const mortgageOfficers = normalizedOfficers.filter((officer) => isMortgageOnlyOfficer(officer)).map((officer) => officer.name);
    const flexOfficers = normalizedOfficers.filter((officer) => isFlexOfficer(officer)).map((officer) => officer.name);
    const hasConsumerLane = normalizedOfficers.some((officer) => getOfficerClassCode(officer) === 'C');
    const hasMortgageLane = normalizedOfficers.some((officer) => getOfficerClassCode(officer) === 'M');
    const hasFlexLane = normalizedOfficers.some((officer) => getOfficerClassCode(officer) === 'F');

    const activeMortgageOnlyOfficerCount = normalizedOfficers.filter((officer) => isMortgageOnlyOfficer(officer) && !officer.isOnVacation).length;
    const hasAnyMortgageOnlyOfficer = mortgageOfficers.length > 0;
    const allowBroadFlexMortgageCoverage = normalizedOfficers.some((officer) => isFlexOfficer(officer) && officer.mortgageOverride);

    const totalMortgageAmount = mortgageByOfficer.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const mortgageAmountForM = mortgageByOfficer
      .filter((entry) => mortgageOfficers.includes(entry.officer))
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

    const mortgageRoutingShareToM = totalMortgageAmount ? (mortgageAmountForM / totalMortgageAmount) : 1;
    const mortgageRoutingPass = !hasMortgageLane || singleMlo || !totalMortgageAmount || mortgageRoutingShareToM >= 0.5;
    const flexMortgageTypesByOfficer = Object.fromEntries(
      flexOfficers.map((officerName) => [officerName, mortgageByTypeByOfficer[officerName] || {}])
    );

    const flexParticipationViolation = didFlexMortgageParticipationViolateRules({
      flexMortgageTypesByOfficer,
      totalMortgageAmount,
      activeMortgageOnlyOfficerCount,
      hasAnyMortgageOnlyOfficer,
      allowBroadFlexMortgageCoverage
    });

    const totalConsumerLoans = officerStats.reduce((sum, entry) => sum + (Number(entry.consumerLoanCount) || 0), 0);
    const allMortgageTypes = officerStats
      .flatMap((entry) => Object.entries(entry.typeBreakdown || {}))
      .filter(([, count]) => (Number(count) || 0) > 0)
      .map(([typeName]) => String(typeName || '').trim().toLowerCase());
    const isHelocOnlySupportPool = isHomogeneousHelocSupportPool({
      officers: normalizedOfficers,
      hasConsumerLoans: totalConsumerLoans > 0,
      loanTypeNames: allMortgageTypes
    });
    const helocSupportThresholds = evaluateHelocSupportFlexThresholds(categoryMetrics.flexVariance);
    const optimizationMetrics = context.optimizationMetrics || {};
    const parsedHelocWeightedVariancePercent = Number(optimizationMetrics.helocWeightedVariancePercent);
    const helocWeightedVariancePercent = Number.isFinite(parsedHelocWeightedVariancePercent)
      ? parsedHelocWeightedVariancePercent
      : null;
    const helocWeightedTargetPass = Number.isFinite(helocWeightedVariancePercent)
      ? helocWeightedVariancePercent <= HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT
      : false;
    const flexMortgageParticipationCount = Object.values(flexMortgageTypesByOfficer).reduce((sum, typeBreakdown) => {
      const helocCount = Number(typeBreakdown?.HELOC) || Number(typeBreakdown?.heloc) || 0;
      return sum + helocCount;
    }, 0);
    const flexParticipationMeaningful = flexMortgageParticipationCount > 0;
    const mortgageOfficerLoanCounts = mortgageOfficers.map((officerName) => Number((officerStats.find((entry) => entry.officer === officerName)?.mortgageLoanCount) || 0));
    const flexOfficerLoanCounts = flexOfficers.map((officerName) => Number((officerStats.find((entry) => entry.officer === officerName)?.mortgageLoanCount) || 0));
    const maxMortgageOfficerLoanCount = mortgageOfficerLoanCounts.length ? Math.max(...mortgageOfficerLoanCounts) : 0;
    const maxFlexOfficerLoanCount = flexOfficerLoanCounts.length ? Math.max(...flexOfficerLoanCounts) : 0;
    const mortgageLeadershipPreserved = !hasMortgageLane || maxMortgageOfficerLoanCount >= maxFlexOfficerLoanCount;

    const consumerAmountVariancePercent = categoryMetrics.consumerVariance.maxAmountVariancePercent;
    const isConsumerDollarInAdvisoryBand = categoryMetrics.consumerVariance.countDistributionPass
      && consumerAmountVariancePercent > AMOUNT_VARIANCE_THRESHOLD_PERCENT
      && consumerAmountVariancePercent <= ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT;
    const consumerPass = categoryMetrics.consumerVariance.countDistributionPass
      && (
        categoryMetrics.consumerVariance.amountDistributionPass
        || isConsumerDollarInAdvisoryBand
      );
    const mortgageLanePass = categoryMetrics.mortgageVariance.countDistributionPass
      && categoryMetrics.mortgageVariance.amountDistributionPass;
    const flexLanePass = categoryMetrics.flexVariance.countDistributionPass
      && categoryMetrics.flexVariance.amountDistributionPass;
    const adjustedConsumerPass = !hasConsumerLane || consumerPass;
    const adjustedMortgageLanePass = !hasMortgageLane || mortgageLanePass;
    const helocSupportPolicyPass = mortgageRoutingPass && !flexParticipationViolation && mortgageLeadershipPreserved && flexParticipationMeaningful;
    const helocSupportPass = isHelocOnlySupportPool
      && helocSupportPolicyPass
      && helocWeightedTargetPass
      && !helocSupportThresholds.overAdvisory;
    const adjustedFlexLanePass = isHelocOnlySupportPool
      ? helocSupportPass
      : (!hasFlexLane || flexLanePass);

    const overallPass = isHelocOnlySupportPool
      ? (adjustedConsumerPass && adjustedMortgageLanePass && adjustedFlexLanePass)
      : determineOfficerLaneOverallPass({
        singleMlo,
        consumerPass: adjustedConsumerPass,
        mortgageLanePass: adjustedMortgageLanePass,
        flexLanePass: adjustedFlexLanePass,
        mortgageRoutingPass,
        flexParticipationViolation
      });

    let statusMetricDescriptor;
    if (isHelocOnlySupportPool) {
      statusMetricDescriptor = {
        key: 'heloc_weighted_variance',
        label: 'Weighted HELOC variance',
        valuePercent: helocWeightedVariancePercent,
        contextLabel: 'HELOC-only support thresholds'
      };
    } else if (hasConsumerLane && !adjustedConsumerPass) {
      statusMetricDescriptor = {
        key: 'consumer_lane_dollar_variance',
        label: 'Consumer lane dollar variance',
        valuePercent: Number(categoryMetrics.consumerVariance.maxAmountVariancePercent) || 0,
        contextLabel: 'Consumer lane thresholds'
      };
    } else if (hasFlexLane && !adjustedFlexLanePass) {
      statusMetricDescriptor = {
        key: 'flex_lane_dollar_variance',
        label: 'Flex lane dollar variance',
        valuePercent: Number(categoryMetrics.flexVariance.maxAmountVariancePercent) || 0,
        contextLabel: 'Flex lane thresholds'
      };
    } else if (hasConsumerLane) {
      statusMetricDescriptor = {
        key: 'consumer_lane_dollar_variance',
        label: 'Consumer lane dollar variance',
        valuePercent: Number(categoryMetrics.consumerVariance.maxAmountVariancePercent) || 0,
        contextLabel: 'Consumer lane thresholds'
      };
    } else if (hasFlexLane) {
      statusMetricDescriptor = {
        key: 'flex_lane_dollar_variance',
        label: 'Flex lane dollar variance',
        valuePercent: Number(categoryMetrics.flexVariance.maxAmountVariancePercent) || 0,
        contextLabel: 'Flex lane thresholds'
      };
    }

    return {
      overallResult: overallPass ? 'PASS' : 'REVIEW',
      summaryItems: [
        ...(hasConsumerLane ? [
          `Consumer loan variance (C lane): ${categoryMetrics.consumerVariance.maxCountVariancePercent.toFixed(1)}%`,
          `Consumer dollar variance (C lane): ${categoryMetrics.consumerVariance.maxAmountVariancePercent.toFixed(1)}%`,
          buildLaneBreakdownText(consumerLaneEntries, 'consumerLoanCount', 'Consumer counts')
        ] : []),
        ...(hasMortgageLane ? [
          `Mortgage loan variance (M lane): ${categoryMetrics.mortgageVariance.maxCountVariancePercent.toFixed(1)}%`,
          `Mortgage dollar variance (M lane): ${categoryMetrics.mortgageVariance.maxAmountVariancePercent.toFixed(1)}%`
        ] : []),
        ...(hasFlexLane ? [
          `Flex loan variance (F lane): ${categoryMetrics.flexVariance.maxCountVariancePercent.toFixed(1)}%`,
          `Flex dollar variance (F lane): ${categoryMetrics.flexVariance.maxAmountVariancePercent.toFixed(1)}%`
        ] : []),
        ...(hasFlexLane && flexVariance.officerCount ? [
          `Flex consumer-vs-mortgage share variance: ${flexVariance.consumerShareVariancePercent.toFixed(1)}%`,
          `Flex total dollars (consumer/mortgage): ${flexVariance.totalConsumerAmount.toFixed(0)} / ${flexVariance.totalMortgageAmount.toFixed(0)}`
        ] : []),
        ...(hasMortgageLane ? [`Mortgage lane routing to M officers: ${(mortgageRoutingShareToM * 100).toFixed(1)}%`] : []),
        ...(isHelocOnlySupportPool ? [
          `HELOC-only support thresholds applied: ${HELOC_SUPPORT_COUNT_THRESHOLD_PERCENT.toFixed(1)}% count / ${HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT.toFixed(1)}% dollar with advisory to ${ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT.toFixed(1)}%.`,
          `Weighted HELOC optimization variance: ${Number.isFinite(helocWeightedVariancePercent) ? helocWeightedVariancePercent.toFixed(1) : 'n/a'}%`
        ] : []),
        ...(isConsumerDollarInAdvisoryBand ? [
          `Consumer dollar variance advisory band applied: ${AMOUNT_VARIANCE_THRESHOLD_PERCENT.toFixed(1)}%–${ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT.toFixed(1)}%`
        ] : [])
      ].filter(Boolean),
      notes: [
        'Model note: Officer Lane variance is measured on Consumer-lane and Mortgage-lane officers; Flex lane variance is measured and tracked separately.',
        ...(isConsumerDollarInAdvisoryBand
          ? [`Advisory note: Consumer dollar variance is slightly above the primary ${AMOUNT_VARIANCE_THRESHOLD_PERCENT.toFixed(1)}% threshold but within the ${ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT.toFixed(1)}% advisory band; flag for monitoring.`]
          : []),
        ...(hasFlexLane ? ['Flex officers are support roles and may cover HELOC or approved mortgage coverage scenarios.'] : []),
        ...(isHelocOnlySupportPool && helocSupportThresholds.advisoryBandApplied
          ? [`Advisory note: HELOC-only support flex variance is above ${HELOC_SUPPORT_AMOUNT_THRESHOLD_PERCENT.toFixed(1)}% and within ${ADVISORY_AMOUNT_VARIANCE_UPPER_PERCENT.toFixed(1)}%; monitor distribution.`]
          : [])
      ],
      chartAnnotations: {
        mortgageTitleSuffix: ' (Role-Based)',
        mortgageNote: singleMlo
          ? 'Primary mortgage allocation to MLOs is expected in this one-MLO lane configuration.'
          : 'Primary mortgage allocation to MLOs is expected. Flex participation may be limited to approved support scenarios.'
      },
      roleAwareFlags: {
        hasSingleMortgageOnlyOfficer: singleMlo,
        mortgageVarianceExpected: singleMlo,
        consumerDollarAdvisoryBandApplied: isConsumerDollarInAdvisoryBand,
        helocOnlySupportThresholdsApplied: isHelocOnlySupportPool,
        flexParticipationExpected: isFlexMortgageParticipationExpected({
          totalMortgageAmount,
          activeMortgageOnlyOfficerCount,
          hasAnyMortgageOnlyOfficer,
          allowBroadFlexMortgageCoverage
        })
      },
      statusMetricDescriptor
    };
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

  function evaluateFairness({ engineType, officers = [], officerStats = [], optimizationMetrics = {} } = {}) {
    const normalizedEngine = normalizeEngineType(engineType);
    const safeOfficers = Array.isArray(officers) ? officers.map((officer) => normalizeOfficer(officer)) : [];
    const safeOfficerStats = Array.isArray(officerStats)
      ? officerStats.map((entry) => normalizeOfficerStatsEntry(entry)).filter((entry) => entry.officer)
      : [];

    const overallAverageLoanCount = safeOfficerStats.length
      ? safeOfficerStats.reduce((sum, entry) => sum + (Number(entry.totalLoans) || 0), 0) / safeOfficerStats.length
      : 0;
    const overallAverageDollarAmount = safeOfficerStats.length
      ? safeOfficerStats.reduce((sum, entry) => sum + (Number(entry.totalAmount) || 0), 0) / safeOfficerStats.length
      : 0;

    const officerClassMap = buildOfficerClassMap(safeOfficers);
    const consumerLaneEntries = safeOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'C');
    const flexEntries = safeOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'F');
    const mortgageLaneEntries = safeOfficerStats.filter((entry) => officerClassMap[entry.officer] === 'M');

    const consumerEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (consumerLaneEntries.length ? consumerLaneEntries : safeOfficerStats)
      : safeOfficerStats;
    const mortgageEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (mortgageLaneEntries.length ? mortgageLaneEntries : safeOfficerStats)
      : safeOfficerStats;

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

    const mortgageByOfficer = safeOfficerStats.map((entry) => ({ officer: entry.officer, amount: Number(entry.mortgageAmount) || 0 }));
    const mortgageByTypeByOfficer = Object.fromEntries(
      safeOfficerStats.map((entry) => {
        const typeBreakdown = entry.typeBreakdown || {};
        const mortgageTypes = Object.fromEntries(
Object.entries(typeBreakdown).filter(([typeName]) => isMortgageTypeName(typeName))
        );
        return [entry.officer, mortgageTypes];
      })
    );

    const context = {
      officers: safeOfficers,
      officerStats: safeOfficerStats,
      categoryMetrics,
      mortgageByOfficer,
      mortgageByTypeByOfficer,
      flexVariance,
      optimizationMetrics
    };

    const engineResult = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? evaluateOfficerLaneFairness(context)
      : evaluateGlobalFairness(context);

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
        maxCountVariancePercent: calculateMaxVariance(safeOfficerStats, 'totalLoans'),
        maxAmountVariancePercent: calculateMaxVariance(safeOfficerStats, 'totalAmount')
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
