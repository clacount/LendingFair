(function initializeFairnessDisplayService(globalScope) {
  const fallbackFairnessEngineService = {
    FAIRNESS_ENGINES: { GLOBAL: 'global', OFFICER_LANE: 'officer_lane' },
    FAIRNESS_ENGINE_LABELS: {
      global: 'Global Fairness',
      officer_lane: 'Officer Lane Fairness'
    }
  };

  function getFairnessEngineService() {
    return globalScope.FairnessEngineService || fallbackFairnessEngineService;
  }

  function normalizeFairnessEngineType(engineType) {
    const fairnessEngineService = getFairnessEngineService();
    return engineType === fairnessEngineService.FAIRNESS_ENGINES.OFFICER_LANE
      ? fairnessEngineService.FAIRNESS_ENGINES.OFFICER_LANE
      : fairnessEngineService.FAIRNESS_ENGINES.GLOBAL;
  }

  function getFairnessModelLabel(engineType) {
    const fairnessEngineService = getFairnessEngineService();
    const normalized = normalizeFairnessEngineType(engineType);
    return fairnessEngineService.FAIRNESS_ENGINE_LABELS?.[normalized]
      || fallbackFairnessEngineService.FAIRNESS_ENGINE_LABELS[normalized];
  }

  function buildFairnessThresholdCopy(engineType) {
    if (normalizeFairnessEngineType(engineType) === 'officer_lane') {
      return 'Thresholds: PASS when applicable lane count/dollar variance checks are within 15.0% / 20.0% and mortgage routing/policy checks pass; consumer-dollar variance in the 20.0%–25.0% advisory band may pass with monitoring note. Donut slice shares are composition views and are not the fairness variance formula.';
    }

    return 'Thresholds: PASS when overall loan-count variance ≤ 15.0% and overall dollar variance ≤ 20.0%; otherwise REVIEW will be displayed.';
  }

  function buildFairnessMethodologyCopy(engineType) {
    if (normalizeFairnessEngineType(engineType) === 'officer_lane') {
      return 'Role-aware lane fairness is active: consumer fairness is evaluated within consumer-lane participation, while mortgage concentration to M officers may be expected by design. Fairness variance is calculated separately from chart share percentages.';
    }

    return 'Assignments are balanced using loan type mix, total goal dollars, loan count, and historical distribution to keep workloads more even and reduce perceived bias.';
  }

  function buildFairnessNotesForDisplay(evaluation, options = {}) {
    const stripPrefix = options.stripNotePrefix !== false;
    return (evaluation?.notes || [])
      .map((note) => {
        const text = String(note || '').trim();
        return stripPrefix ? text.replace(/^Note:\s*/i, '').trim() : text;
      })
      .filter(Boolean);
  }

  function getFairnessEvaluationDisplayLines(evaluation, options = {}) {
    const includeModel = options.includeModel !== false;
    const lines = [];
    if (includeModel) {
      lines.push(`Fairness model: ${getFairnessModelLabel(evaluation?.engineType)}`);
    }
    (evaluation?.summaryItems || []).forEach((item) => lines.push(String(item)));
    buildFairnessNotesForDisplay(evaluation).forEach((note) => lines.push(`- ${note}`));
    return lines;
  }

  globalScope.FairnessDisplayService = {
    normalizeFairnessEngineType,
    getFairnessModelLabel,
    buildFairnessThresholdCopy,
    buildFairnessMethodologyCopy,
    buildFairnessNotesForDisplay,
    getFairnessEvaluationDisplayLines
  };
})(window);
