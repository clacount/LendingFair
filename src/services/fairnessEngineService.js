(function initializeFairnessEngineService(globalScope) {
  const COUNT_VARIANCE_THRESHOLD_PERCENT = 15;
  const AMOUNT_VARIANCE_THRESHOLD_PERCENT = 20;
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

  function getOfficerClassCode(officerConfig = {}) {
    const utils = globalScope.LoanCategoryUtils;
    const eligibility = utils?.normalizeOfficerEligibility(officerConfig.eligibility) || { consumer: true, mortgage: false };
    if (eligibility.consumer && eligibility.mortgage) {
      return 'F';
    }
    if (eligibility.mortgage) {
      return 'M';
    }
    return 'C';
  }

  function hasSingleMortgageOnlyOfficer(officers = []) {
    return officers.filter((officer) => getOfficerClassCode(officer) === 'M').length === 1;
  }

  function calculateMaxVariance(entries, valueKey) {
    if (!entries.length) {
      return 0;
    }

    const values = entries.map((entry) => Number(entry[valueKey]) || 0);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (!average) {
      return 0;
    }

    const highest = Math.max(...values);
    const lowest = Math.min(...values);
    return ((highest - lowest) / average) * 100;
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

    const consumerShareVariancePercent = calculateMaxVariance(
      enrichedEntries.map((entry) => ({ value: entry.consumerShare * 100 })),
      'value'
    );
    const mortgageShareVariancePercent = calculateMaxVariance(
      enrichedEntries.map((entry) => ({ value: entry.mortgageShare * 100 })),
      'value'
    );

    return {
      officerCount: enrichedEntries.length,
      consumerShareVariancePercent,
      mortgageShareVariancePercent,
      totalConsumerAmount: enrichedEntries.reduce((sum, entry) => sum + (Number(entry.consumerAmount) || 0), 0),
      totalMortgageAmount: enrichedEntries.reduce((sum, entry) => sum + (Number(entry.mortgageAmount) || 0), 0)
    };
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
    const thresholdStatusNote = overallPass
      ? 'Threshold status: PASS (all global variance thresholds are within limits).'
      : `Threshold status: REVIEW (${thresholdBreaches.join(', ')} exceeded threshold${thresholdBreaches.length > 1 ? 's' : ''}).`;

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
        thresholdStatusNote,
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

  function evaluateOfficerLaneFairness(context) {
    const { officers, categoryMetrics, mortgageByOfficer = [], mortgageByTypeByOfficer = {}, flexVariance } = context;
    const singleMlo = hasSingleMortgageOnlyOfficer(officers);
    const mortgageOfficers = officers.filter((officer) => getOfficerClassCode(officer) === 'M').map((officer) => officer.name);
    const flexOfficers = officers.filter((officer) => getOfficerClassCode(officer) === 'F').map((officer) => officer.name);

    const totalMortgageAmount = mortgageByOfficer.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const mortgageAmountForM = mortgageByOfficer
      .filter((entry) => mortgageOfficers.includes(entry.officer))
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

    const mortgagePrimaryToM = totalMortgageAmount ? (mortgageAmountForM / totalMortgageAmount) >= 0.5 : true;
    const unsupportedFlexMortgage = flexOfficers.some((officer) => {
      const typeBreakdown = mortgageByTypeByOfficer[officer] || {};
      return Object.entries(typeBreakdown)
        .some(([typeName, count]) => Number(count) > 0 && !String(typeName || '').toLowerCase().includes('heloc') && !String(typeName || '').toLowerCase().includes('vacation'));
    });

    const consumerPass = categoryMetrics.consumerVariance.countDistributionPass
      && categoryMetrics.consumerVariance.amountDistributionPass;
    const mortgageLanePass = categoryMetrics.mortgageVariance.countDistributionPass
      && categoryMetrics.mortgageVariance.amountDistributionPass;
    const flexLanePass = categoryMetrics.flexVariance.countDistributionPass
      && categoryMetrics.flexVariance.amountDistributionPass;

    const mortgageRoutingPass = singleMlo ? true : mortgagePrimaryToM;
    const flexParticipationPass = !unsupportedFlexMortgage;
    const overallPass = consumerPass
      && mortgageLanePass
      && flexLanePass
      && mortgageRoutingPass
      && flexParticipationPass;

    return {
      overallResult: overallPass ? 'PASS' : 'REVIEW',
      summaryItems: [
        `Consumer loan variance (C lane): ${categoryMetrics.consumerVariance.maxCountVariancePercent.toFixed(1)}%`,
        `Consumer dollar variance (C lane): ${categoryMetrics.consumerVariance.maxAmountVariancePercent.toFixed(1)}%`,
        `Mortgage loan variance (M lane): ${categoryMetrics.mortgageVariance.maxCountVariancePercent.toFixed(1)}%`,
        `Mortgage dollar variance (M lane): ${categoryMetrics.mortgageVariance.maxAmountVariancePercent.toFixed(1)}%`,
        `Flex loan variance (F lane): ${categoryMetrics.flexVariance.maxCountVariancePercent.toFixed(1)}%`,
        `Flex dollar variance (F lane): ${categoryMetrics.flexVariance.maxAmountVariancePercent.toFixed(1)}%`,
        ...(flexVariance.officerCount
          ? [
            `Flex consumer-vs-mortgage share variance: ${flexVariance.consumerShareVariancePercent.toFixed(1)}%`,
            `Flex total dollars (consumer/mortgage): ${flexVariance.totalConsumerAmount.toFixed(0)} / ${flexVariance.totalMortgageAmount.toFixed(0)}`
          ]
          : []),
        `Mortgage lane routing to M officers: ${totalMortgageAmount ? ((mortgageAmountForM / totalMortgageAmount) * 100).toFixed(1) : '0.0'}%`
      ],
      notes: [
        'Consumer variance is calculated from consumer-category loans only (mortgage loans excluded).',
        'Officer Lane consumer variance is measured on Consumer-lane officers; Flex lane variance is measured separately.',
        'Officer Lane mortgage variance is measured on Mortgage-lane officers; Flex mortgage support is tracked separately.',
        'Flex officers are normalized by role-share in variance calculations when MLOs are present.',
        'Note: Mortgage variance can remain elevated when only one mortgage-only officer is configured.'
      ],
      chartAnnotations: {
        mortgageTitleSuffix: ' (Role-Based)',
        mortgageNote: singleMlo
          ? 'Primary mortgage allocation to MLOs is expected in this one-MLO lane configuration.'
          : 'Primary mortgage allocation to MLOs is expected. Flex participation may be limited to HELOCs and coverage.'
      },
      roleAwareFlags: {
        hasSingleMortgageOnlyOfficer: singleMlo,
        mortgageVarianceExpected: singleMlo,
        flexParticipationExpected: flexOfficers.length > 0
      }
    };
  }

  function evaluateFairness({ engineType, officers = [], officerStats = [] }) {
    const normalizedEngine = normalizeEngineType(engineType);
    const overallAverageLoanCount = officerStats.length
      ? officerStats.reduce((sum, entry) => sum + (Number(entry.totalLoans) || 0), 0) / officerStats.length
      : 0;
    const overallAverageDollarAmount = officerStats.length
      ? officerStats.reduce((sum, entry) => sum + (Number(entry.totalAmount) || 0), 0) / officerStats.length
      : 0;

    const officerClassMap = buildOfficerClassMap(officers);
    const allConsumerEntries = officerStats;
    const consumerLaneEntries = officerStats.filter((entry) => officerClassMap[entry.officer] === 'C');
    const flexEntries = officerStats.filter((entry) => officerClassMap[entry.officer] === 'F');
    const allMortgageEntries = officerStats;
    const mortgageLaneEntries = officerStats.filter((entry) => officerClassMap[entry.officer] === 'M');

    const consumerEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (consumerLaneEntries.length ? consumerLaneEntries : allConsumerEntries)
      : allConsumerEntries;
    const mortgageEntries = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? (mortgageLaneEntries.length ? mortgageLaneEntries : allMortgageEntries)
      : allMortgageEntries;

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

    const mortgageByOfficer = officerStats.map((entry) => ({
      officer: entry.officer,
      amount: Number(entry.mortgageAmount) || 0
    }));

    const mortgageByTypeByOfficer = Object.fromEntries(
      officerStats.map((entry) => {
        const typeBreakdown = entry.typeBreakdown || entry.typeCounts || {};
        const mortgageTypes = Object.fromEntries(
          Object.entries(typeBreakdown).filter(([typeName]) => {
            const category = globalScope.getLoanCategoryForType ? globalScope.getLoanCategoryForType(typeName) : 'consumer';
            return category === 'mortgage';
          })
        );

        return [entry.officer, mortgageTypes];
      })
    );

    const context = { officers, officerStats, categoryMetrics, mortgageByOfficer, mortgageByTypeByOfficer, flexVariance };
    const engineResult = normalizedEngine === FAIRNESS_ENGINES.OFFICER_LANE
      ? evaluateOfficerLaneFairness(context)
      : evaluateGlobalFairness(context);

    return {
      engineType: normalizedEngine,
      overallResult: engineResult.overallResult,
      summaryItems: engineResult.summaryItems,
      notes: engineResult.notes,
      chartAnnotations: engineResult.chartAnnotations,
      roleAwareFlags: engineResult.roleAwareFlags,
      metrics: {
        averageLoanCount: overallAverageLoanCount,
        averageDollarAmount: overallAverageDollarAmount,
        consumerVariance: categoryMetrics.consumerVariance,
        mortgageVariance: categoryMetrics.mortgageVariance,
        flexVariance: categoryMetrics.flexVariance,
        maxCountVariancePercent: calculateMaxVariance(officerStats, 'totalLoans'),
        maxAmountVariancePercent: calculateMaxVariance(officerStats, 'totalAmount')
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
    evaluateFairness
  };
})(window);
