(function initializeOfficerLaneFairnessEngine(globalScope) {
  class OfficerLaneFairnessEngine {
    constructor(dependencies = {}) {
      this.countVarianceThresholdPercent = dependencies.countVarianceThresholdPercent;
      this.amountVarianceThresholdPercent = dependencies.amountVarianceThresholdPercent;
      this.advisoryAmountVarianceUpperPercent = dependencies.advisoryAmountVarianceUpperPercent;
      this.helocSupportCountThresholdPercent = dependencies.helocSupportCountThresholdPercent;
      this.helocSupportAmountThresholdPercent = dependencies.helocSupportAmountThresholdPercent;
      this.normalizeOfficer = dependencies.normalizeOfficer;
      this.getOfficerClassCode = dependencies.getOfficerClassCode;
      this.isFlexOfficer = dependencies.isFlexOfficer;
      this.isMortgageOnlyOfficer = dependencies.isMortgageOnlyOfficer;
      this.hasSingleMortgageOnlyOfficer = dependencies.hasSingleMortgageOnlyOfficer;
      this.buildOfficerClassMap = dependencies.buildOfficerClassMap;
      this.buildLaneBreakdownText = dependencies.buildLaneBreakdownText;
      this.buildLaneVarianceStatusDescriptor = dependencies.buildLaneVarianceStatusDescriptor;
      this.isHomogeneousHelocSupportPool = dependencies.isHomogeneousHelocSupportPool;
      this.isFlexMortgageParticipationExpected = dependencies.isFlexMortgageParticipationExpected;
      this.didFlexMortgageParticipationViolateRules = dependencies.didFlexMortgageParticipationViolateRules;
    }

    evaluateHelocSupportFlexThresholds(flexVariance = {}) {
      const countVariance = Number(flexVariance.maxCountVariancePercent) || 0;
      const amountVariance = Number(flexVariance.maxAmountVariancePercent) || 0;
      const strictPass = countVariance <= this.helocSupportCountThresholdPercent && amountVariance <= this.helocSupportAmountThresholdPercent;
      const advisoryPass = countVariance <= this.advisoryAmountVarianceUpperPercent && amountVariance <= this.advisoryAmountVarianceUpperPercent;

      return {
        countVariance,
        amountVariance,
        strictPass,
        advisoryPass,
        overAdvisory: !advisoryPass,
        advisoryBandApplied: !strictPass && advisoryPass
      };
    }

    isSingleMloExpectedVarianceScenario(context = {}) {
      return Boolean(context.singleMlo && context.mortgageRoutingPass && !context.flexParticipationViolation);
    }

    isMortgageLaneVarianceBlockingReview(context = {}) {
      if (context.mortgageLanePass) {
        return false;
      }

      if (this.isSingleMloExpectedVarianceScenario(context)) {
        return false;
      }

      return true;
    }

    determineOfficerLaneOverallPass(context = {}) {
      return Boolean(
        context.consumerPass
        && context.flexLanePass
        && context.mortgageRoutingPass
        && !context.flexParticipationViolation
        && !this.isMortgageLaneVarianceBlockingReview(context)
      );
    }

    evaluate(context = {}) {
      const {
        officers,
        officerStats = [],
        categoryMetrics,
        mortgageByOfficer = [],
        mortgageByTypeByOfficer = {},
        flexVariance
      } = context;
      const singleMlo = this.hasSingleMortgageOnlyOfficer(officers);
      const normalizedOfficers = officers.map((officer) => this.normalizeOfficer(officer));
      const officerClassMap = this.buildOfficerClassMap(normalizedOfficers);
      const consumerLaneEntries = officerStats.filter((entry) => officerClassMap[entry.officer] === 'C');
      const mortgageOfficers = normalizedOfficers.filter((officer) => this.isMortgageOnlyOfficer(officer)).map((officer) => officer.name);
      const flexOfficers = normalizedOfficers.filter((officer) => this.isFlexOfficer(officer)).map((officer) => officer.name);
      const hasConsumerLane = normalizedOfficers.some((officer) => this.getOfficerClassCode(officer) === 'C');
      const hasMortgageLane = normalizedOfficers.some((officer) => this.getOfficerClassCode(officer) === 'M');
      const hasFlexLane = normalizedOfficers.some((officer) => this.getOfficerClassCode(officer) === 'F');

      const activeMortgageOnlyOfficerCount = normalizedOfficers.filter((officer) => this.isMortgageOnlyOfficer(officer) && !officer.isOnVacation).length;
      const hasAnyMortgageOnlyOfficer = mortgageOfficers.length > 0;
      const allowBroadFlexMortgageCoverage = normalizedOfficers.some((officer) => this.isFlexOfficer(officer) && officer.mortgageOverride);

      const totalMortgageAmount = mortgageByOfficer.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const mortgageAmountForM = mortgageByOfficer
        .filter((entry) => mortgageOfficers.includes(entry.officer))
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

      const mortgageRoutingShareToM = totalMortgageAmount ? (mortgageAmountForM / totalMortgageAmount) : 1;
      const mortgageRoutingPass = !hasMortgageLane || singleMlo || !totalMortgageAmount || mortgageRoutingShareToM >= 0.5;
      const flexMortgageTypesByOfficer = Object.fromEntries(
        flexOfficers.map((officerName) => [officerName, mortgageByTypeByOfficer[officerName] || {}])
      );

      const flexParticipationViolation = this.didFlexMortgageParticipationViolateRules({
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
      const isHelocOnlySupportPool = this.isHomogeneousHelocSupportPool({
        officers: normalizedOfficers,
        hasConsumerLoans: totalConsumerLoans > 0,
        loanTypeNames: allMortgageTypes
      });
      const helocSupportThresholds = this.evaluateHelocSupportFlexThresholds(categoryMetrics.flexVariance);
      const optimizationMetrics = context.optimizationMetrics || {};
      const parsedHelocWeightedVariancePercent = Number(optimizationMetrics.helocWeightedVariancePercent);
      const helocWeightedVariancePercent = Number.isFinite(parsedHelocWeightedVariancePercent)
        ? parsedHelocWeightedVariancePercent
        : null;
      const helocWeightedTargetPass = Number.isFinite(helocWeightedVariancePercent)
        ? helocWeightedVariancePercent <= this.helocSupportAmountThresholdPercent
        : false;
      const flexMortgageParticipationCount = Object.values(flexMortgageTypesByOfficer).reduce((sum, typeBreakdown) => {
        const helocCount = Number(typeBreakdown?.HELOC) || Number(typeBreakdown?.heloc) || 0;
        return sum + helocCount;
      }, 0);
      const flexParticipationMeaningful = flexMortgageParticipationCount > 0;
      const mortgageOfficerLoanCounts = mortgageOfficers.map((officerName) => Number((officerStats.find((entry) => entry.officer === officerName)?.mortgageLoanCount) || 0));
      const flexOfficerLoanCounts = flexOfficers.map((officerName) => Number((officerStats.find((entry) => entry.officer === officerName)?.mortgageLoanCount) || 0));
      const mortgageLoanCountForM = mortgageOfficerLoanCounts.reduce((sum, count) => sum + count, 0);
      const totalMortgageLoanCount = mortgageLoanCountForM + flexOfficerLoanCounts.reduce((sum, count) => sum + count, 0);
      const mortgageLoanCountShareToM = totalMortgageLoanCount ? (mortgageLoanCountForM / totalMortgageLoanCount) : 1;
      const maxMortgageOfficerLoanCount = mortgageOfficerLoanCounts.length ? Math.max(...mortgageOfficerLoanCounts) : 0;
      const maxFlexOfficerLoanCount = flexOfficerLoanCounts.length ? Math.max(...flexOfficerLoanCounts) : 0;
      const mortgageLeadershipPreserved = !hasMortgageLane || maxMortgageOfficerLoanCount >= maxFlexOfficerLoanCount;

      const consumerAmountVariancePercent = categoryMetrics.consumerVariance.maxAmountVariancePercent;
      const isConsumerDollarInAdvisoryBand = categoryMetrics.consumerVariance.countDistributionPass
        && consumerAmountVariancePercent > this.amountVarianceThresholdPercent
        && consumerAmountVariancePercent <= this.advisoryAmountVarianceUpperPercent;
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
        : this.determineOfficerLaneOverallPass({
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
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'consumer_lane',
          laneLabel: 'Consumer lane',
          laneVariance: categoryMetrics.consumerVariance,
          contextLabel: 'Consumer lane thresholds'
        });
      } else if (hasMortgageLane && !adjustedMortgageLanePass) {
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'mortgage_lane',
          laneLabel: 'Mortgage lane',
          laneVariance: categoryMetrics.mortgageVariance,
          contextLabel: 'Mortgage lane thresholds'
        });
      } else if (hasMortgageLane && !mortgageRoutingPass) {
        statusMetricDescriptor = {
          key: 'mortgage_routing_policy',
          label: 'Mortgage routing share to M officers',
          valuePercent: mortgageRoutingShareToM * 100,
          contextLabel: 'Mortgage lane policy checks'
        };
      } else if (hasMortgageLane && !mortgageLeadershipPreserved) {
        statusMetricDescriptor = {
          key: 'mortgage_leadership_policy',
          label: 'Mortgage leadership preservation',
          valuePercent: mortgageLoanCountShareToM * 100,
          contextLabel: 'Mortgage lane policy checks'
        };
      } else if (hasMortgageLane && flexParticipationViolation) {
        statusMetricDescriptor = {
          key: 'mortgage_flex_participation_policy',
          label: 'Flex mortgage participation policy',
          valuePercent: mortgageRoutingShareToM * 100,
          contextLabel: 'Mortgage lane policy checks'
        };
      } else if (hasFlexLane && !adjustedFlexLanePass) {
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'flex_lane',
          laneLabel: 'Flex lane',
          laneVariance: categoryMetrics.flexVariance,
          contextLabel: 'Flex lane thresholds'
        });
      } else if (hasConsumerLane) {
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'consumer_lane',
          laneLabel: 'Consumer lane',
          laneVariance: categoryMetrics.consumerVariance,
          contextLabel: 'Consumer lane thresholds'
        });
      } else if (hasFlexLane) {
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'flex_lane',
          laneLabel: 'Flex lane',
          laneVariance: categoryMetrics.flexVariance,
          contextLabel: 'Flex lane thresholds'
        });
      } else if (hasMortgageLane) {
        statusMetricDescriptor = this.buildLaneVarianceStatusDescriptor({
          laneKeyPrefix: 'mortgage_lane',
          laneLabel: 'Mortgage lane',
          laneVariance: categoryMetrics.mortgageVariance,
          contextLabel: 'Mortgage lane thresholds'
        });
      }

      return {
        overallResult: overallPass ? 'PASS' : 'REVIEW',
        summaryItems: [
          ...(hasConsumerLane ? [
            `Consumer loan variance (C lane): ${categoryMetrics.consumerVariance.maxCountVariancePercent.toFixed(1)}%`,
            `Consumer dollar variance (C lane): ${categoryMetrics.consumerVariance.maxAmountVariancePercent.toFixed(1)}%`,
            this.buildLaneBreakdownText(consumerLaneEntries, 'consumerLoanCount', 'Consumer counts')
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
            `HELOC-only support thresholds applied: ${this.helocSupportCountThresholdPercent.toFixed(1)}% count / ${this.helocSupportAmountThresholdPercent.toFixed(1)}% dollar with advisory to ${this.advisoryAmountVarianceUpperPercent.toFixed(1)}%.`,
            `Weighted HELOC optimization variance: ${Number.isFinite(helocWeightedVariancePercent) ? helocWeightedVariancePercent.toFixed(1) : 'n/a'}%`
          ] : []),
          ...(isConsumerDollarInAdvisoryBand ? [
            `Consumer dollar variance advisory band applied: ${this.amountVarianceThresholdPercent.toFixed(1)}%–${this.advisoryAmountVarianceUpperPercent.toFixed(1)}%`
          ] : [])
        ].filter(Boolean),
        notes: [
          'Model note: Officer Lane variance is measured on Consumer-lane and Mortgage-lane officers; Flex lane variance is measured and tracked separately.',
          ...(isConsumerDollarInAdvisoryBand
            ? [`Advisory note: Consumer dollar variance is slightly above the primary ${this.amountVarianceThresholdPercent.toFixed(1)}% threshold but within the ${this.advisoryAmountVarianceUpperPercent.toFixed(1)}% advisory band; flag for monitoring.`]
            : []),
          ...(hasFlexLane ? ['Flex officers are support roles and may cover HELOC or approved mortgage coverage scenarios.'] : []),
          ...(isHelocOnlySupportPool && helocSupportThresholds.advisoryBandApplied
            ? [`Advisory note: HELOC-only support flex variance is above ${this.helocSupportAmountThresholdPercent.toFixed(1)}% and within ${this.advisoryAmountVarianceUpperPercent.toFixed(1)}%; monitor distribution.`]
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
          flexParticipationExpected: this.isFlexMortgageParticipationExpected({
            totalMortgageAmount,
            activeMortgageOnlyOfficerCount,
            hasAnyMortgageOnlyOfficer,
            allowBroadFlexMortgageCoverage
          })
        },
        statusMetricDescriptor
      };
    }
  }

  globalScope.OfficerLaneFairnessEngine = OfficerLaneFairnessEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfficerLaneFairnessEngine;
  }
})(typeof window !== 'undefined' ? window : global);
