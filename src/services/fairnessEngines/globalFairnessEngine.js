(function initializeGlobalFairnessEngine(globalScope) {
  class GlobalFairnessEngine {
    constructor(dependencies = {}) {
      this.countVarianceThresholdPercent = dependencies.countVarianceThresholdPercent;
      this.amountVarianceThresholdPercent = dependencies.amountVarianceThresholdPercent;
      this.calculateMaxVariance = dependencies.calculateMaxVariance;
      this.hasSingleMortgageOnlyOfficer = dependencies.hasSingleMortgageOnlyOfficer;
    }

    evaluate(context = {}) {
      const { categoryMetrics } = context;
      const overallCountVariance = this.calculateMaxVariance(context.officerStats || [], 'totalLoans');
      const overallAmountVariance = this.calculateMaxVariance(context.officerStats || [], 'totalAmount');

      const overallPass = overallCountVariance <= this.countVarianceThresholdPercent
        && overallAmountVariance <= this.amountVarianceThresholdPercent;
      const thresholdBreaches = [];
      if (overallCountVariance > this.countVarianceThresholdPercent) {
        thresholdBreaches.push('Overall loan variance');
      }
      if (overallAmountVariance > this.amountVarianceThresholdPercent) {
        thresholdBreaches.push('Overall dollar variance');
      }

      const countFail = overallCountVariance > this.countVarianceThresholdPercent;
      const dollarFail = overallAmountVariance > this.amountVarianceThresholdPercent;
      let statusMetricDescriptor;

      if (countFail && dollarFail) {
        const countNormalizedMargin = (overallCountVariance - this.countVarianceThresholdPercent) / this.countVarianceThresholdPercent;
        const dollarNormalizedMargin = (overallAmountVariance - this.amountVarianceThresholdPercent) / this.amountVarianceThresholdPercent;
        statusMetricDescriptor = {
          key: 'global_count_and_dollar_variance',
          label: 'Global count and dollar variance',
          valuePercent: countNormalizedMargin >= dollarNormalizedMargin ? overallCountVariance : overallAmountVariance,
          contextLabel: 'Global thresholds'
        };
      } else if (countFail) {
        statusMetricDescriptor = {
          key: 'global_count_variance',
          label: 'Global count variance',
          valuePercent: overallCountVariance,
          contextLabel: 'Global thresholds'
        };
      } else if (dollarFail) {
        statusMetricDescriptor = {
          key: 'global_dollar_variance',
          label: 'Global dollar variance',
          valuePercent: overallAmountVariance,
          contextLabel: 'Global thresholds'
        };
      } else {
        const shouldUseDollarDescriptor = overallAmountVariance >= overallCountVariance;
        statusMetricDescriptor = shouldUseDollarDescriptor
          ? {
              key: 'global_dollar_variance',
              label: 'Global dollar variance',
              valuePercent: overallAmountVariance,
              contextLabel: 'Global thresholds'
            }
          : {
              key: 'global_count_variance',
              label: 'Global count variance',
              valuePercent: overallCountVariance,
              contextLabel: 'Global thresholds'
            };
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
        statusMetricDescriptor,
        roleAwareFlags: {
          hasSingleMortgageOnlyOfficer: this.hasSingleMortgageOnlyOfficer(context.officers),
          mortgageVarianceExpected: false,
          flexParticipationExpected: false
        }
      };
    }
  }

  globalScope.GlobalFairnessEngine = GlobalFairnessEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalFairnessEngine;
  }
})(typeof window !== 'undefined' ? window : global);
