(function initializeFocusWeightSettingsService(globalScope) {
  const DEFAULT_FOCUS_WEIGHTS_FILE = './default_focus_weights.json';
  const SAVED_FOCUS_WEIGHTS_FILE = 'focus_weights.json';

  const HARD_DEFAULT_FOCUS_WEIGHTS = {
    consumerFocused: {
      consumer: 70,
      mortgage: 30
    },
    mortgageFocused: {
      consumer: 30,
      mortgage: 70
    }
  };

  let fileAdapter = null;
  let cachedDefaultWeights = { ...HARD_DEFAULT_FOCUS_WEIGHTS };
  let cachedEffectiveWeights = { ...HARD_DEFAULT_FOCUS_WEIGHTS };

  function clampPercent(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  function normalizeFocusWeightPair(primaryValue, secondaryValue, defaultPrimary = 70) {
    const fallbackPrimary = clampPercent(defaultPrimary, 70);
    const normalizedPrimary = clampPercent(primaryValue, fallbackPrimary);

    if (secondaryValue === undefined || secondaryValue === null || secondaryValue === '') {
      return {
        primary: normalizedPrimary,
        secondary: 100 - normalizedPrimary
      };
    }

    const normalizedSecondary = clampPercent(secondaryValue, 100 - fallbackPrimary);
    const normalizedTotal = normalizedPrimary + normalizedSecondary;

    if (normalizedTotal === 100) {
      return {
        primary: normalizedPrimary,
        secondary: normalizedSecondary
      };
    }

    return {
      primary: normalizedPrimary,
      secondary: 100 - normalizedPrimary
    };
  }

  function getHardDefaultFocusWeights() {
    return {
      consumerFocused: {
        consumer: HARD_DEFAULT_FOCUS_WEIGHTS.consumerFocused.consumer,
        mortgage: HARD_DEFAULT_FOCUS_WEIGHTS.consumerFocused.mortgage
      },
      mortgageFocused: {
        consumer: HARD_DEFAULT_FOCUS_WEIGHTS.mortgageFocused.consumer,
        mortgage: HARD_DEFAULT_FOCUS_WEIGHTS.mortgageFocused.mortgage
      }
    };
  }

  function normalizeFocusWeights(weights = {}) {
    const defaults = getHardDefaultFocusWeights();
    const consumerPair = normalizeFocusWeightPair(
      weights?.consumerFocused?.consumer,
      weights?.consumerFocused?.mortgage,
      defaults.consumerFocused.consumer
    );
    const mortgagePair = normalizeFocusWeightPair(
      weights?.mortgageFocused?.mortgage,
      weights?.mortgageFocused?.consumer,
      defaults.mortgageFocused.mortgage
    );

    return {
      consumerFocused: {
        consumer: consumerPair.primary,
        mortgage: consumerPair.secondary
      },
      mortgageFocused: {
        consumer: mortgagePair.secondary,
        mortgage: mortgagePair.primary
      }
    };
  }

  async function loadDefaultFocusWeights() {
    try {
      const response = await globalScope.fetch(DEFAULT_FOCUS_WEIGHTS_FILE, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const parsed = await response.json();
      cachedDefaultWeights = normalizeFocusWeights(parsed);
      return cachedDefaultWeights;
    } catch (error) {
      cachedDefaultWeights = normalizeFocusWeights(getHardDefaultFocusWeights());
      return cachedDefaultWeights;
    }
  }

  async function loadSavedFocusWeights() {
    if (!fileAdapter?.readJson) {
      return null;
    }

    try {
      const parsed = await fileAdapter.readJson(SAVED_FOCUS_WEIGHTS_FILE);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return normalizeFocusWeights(parsed);
    } catch (error) {
      return null;
    }
  }

  async function loadEffectiveFocusWeights() {
    const savedWeights = await loadSavedFocusWeights();
    if (savedWeights) {
      cachedEffectiveWeights = savedWeights;
      return cachedEffectiveWeights;
    }

    const defaultWeights = await loadDefaultFocusWeights();
    cachedEffectiveWeights = normalizeFocusWeights(defaultWeights || getHardDefaultFocusWeights());
    return cachedEffectiveWeights;
  }

  async function saveFocusWeights(weights) {
    const normalizedWeights = normalizeFocusWeights(weights);

    if (!fileAdapter?.writeJson) {
      cachedEffectiveWeights = normalizedWeights;
      return {
        success: false,
        persisted: false,
        error: 'storage_unavailable',
        message: 'Focus weight override storage is not available.',
        weights: normalizedWeights
      };
    }

    try {
      await fileAdapter.writeJson(SAVED_FOCUS_WEIGHTS_FILE, normalizedWeights);
      const persistedWeights = await loadSavedFocusWeights();
      const didPersist = JSON.stringify(persistedWeights) === JSON.stringify(normalizedWeights);

      cachedEffectiveWeights = normalizedWeights;

      if (!didPersist) {
        return {
          success: false,
          persisted: false,
          error: 'readback_mismatch',
          message: 'Focus weight override write completed but persisted values could not be verified.',
          weights: normalizedWeights
        };
      }

      return {
        success: true,
        persisted: true,
        weights: normalizedWeights
      };
    } catch (error) {
      cachedEffectiveWeights = normalizedWeights;
      return {
        success: false,
        persisted: false,
        error: 'storage_write_failed',
        message: String(error?.message || 'Failed to write focus weight override.'),
        weights: normalizedWeights
      };
    }
  }

  async function deleteSavedFocusWeights() {
    if (!fileAdapter?.deleteFile) {
      return false;
    }

    try {
      return await fileAdapter.deleteFile(SAVED_FOCUS_WEIGHTS_FILE);
    } catch (error) {
      return false;
    }
  }

  async function resetFocusWeightsToDefaults() {
    await deleteSavedFocusWeights();
    const defaultWeights = await loadDefaultFocusWeights();
    cachedEffectiveWeights = normalizeFocusWeights(defaultWeights || getHardDefaultFocusWeights());
    return {
      success: true,
      weights: cachedEffectiveWeights
    };
  }

  function getDefaultFocusWeights() {
    return normalizeFocusWeights(cachedDefaultWeights || getHardDefaultFocusWeights());
  }

  function getSavedFocusWeights() {
    return normalizeFocusWeights(cachedEffectiveWeights || getHardDefaultFocusWeights());
  }

  function getConsumerFocusedWeights() {
    return getSavedFocusWeights().consumerFocused;
  }

  function getMortgageFocusedWeights() {
    return getSavedFocusWeights().mortgageFocused;
  }

  function setFileAdapter(adapter) {
    fileAdapter = adapter;
  }

  globalScope.FocusWeightSettingsService = {
    setFileAdapter,
    getDefaultFocusWeights,
    loadDefaultFocusWeights,
    loadSavedFocusWeights,
    loadEffectiveFocusWeights,
    getSavedFocusWeights,
    saveFocusWeights,
    resetFocusWeightsToDefaults,
    deleteSavedFocusWeights,
    normalizeFocusWeights,
    normalizeFocusWeightPair,
    getConsumerFocusedWeights,
    getMortgageFocusedWeights
  };
})(window);
