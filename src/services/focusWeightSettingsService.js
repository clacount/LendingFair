(function initializeFocusWeightSettingsService(globalScope) {
  const SETTINGS_STORAGE_KEY = 'loan-randomizer-settings-v1';

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

  function getDefaultFocusWeights() {
    return {
      consumerFocused: {
        consumer: 70,
        mortgage: 30
      },
      mortgageFocused: {
        consumer: 30,
        mortgage: 70
      }
    };
  }

  function readSettings() {
    try {
      const raw = globalScope.localStorage?.getItem(SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function getStorageErrorCode(error) {
    const message = String(error?.message || '').toLowerCase();
    const name = String(error?.name || '').toLowerCase();

    if (
      name.includes('quotaexceeded') ||
      message.includes('quota') ||
      message.includes('storage full')
    ) {
      return 'quota_exceeded';
    }

    if (
      name.includes('securityerror') ||
      message.includes('security') ||
      message.includes('access is denied') ||
      message.includes('not allowed')
    ) {
      return 'security_restricted';
    }

    if (
      message.includes('localstorage') ||
      message.includes('storage') ||
      name.includes('invalidstateerror') ||
      name.includes('notsupportederror')
    ) {
      return 'storage_unavailable';
    }

    return 'unknown_storage_error';
  }

  function writeSettings(settings) {
    try {
      globalScope.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: getStorageErrorCode(error),
        message: String(error?.message || 'Failed to write settings.')
      };
    }
  }

  function normalizeFocusWeights(weights = {}) {
    const defaults = getDefaultFocusWeights();
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

  function getSavedFocusWeights() {
    const settings = readSettings();
    return normalizeFocusWeights(settings.focusWeights);
  }

  function saveFocusWeights(weights) {
    const settings = readSettings();
    const normalizedWeights = normalizeFocusWeights(weights);
    settings.focusWeights = normalizedWeights;

    const writeResult = writeSettings(settings);
    if (!writeResult.success) {
      return {
        success: false,
        persisted: false,
        error: writeResult.error,
        message: writeResult.message,
        weights: normalizedWeights
      };
    }

    const persistedWeights = normalizeFocusWeights(readSettings().focusWeights);
    const didPersist = JSON.stringify(persistedWeights) === JSON.stringify(normalizedWeights);

    if (!didPersist) {
      return {
        success: false,
        persisted: false,
        error: 'readback_mismatch',
        message: 'Settings write completed but persisted focus weights could not be verified.',
        weights: normalizedWeights
      };
    }

    return {
      success: true,
      persisted: true,
      weights: normalizedWeights
    };
  }

  function getConsumerFocusedWeights() {
    return getSavedFocusWeights().consumerFocused;
  }

  function getMortgageFocusedWeights() {
    return getSavedFocusWeights().mortgageFocused;
  }

  globalScope.FocusWeightSettingsService = {
    getDefaultFocusWeights,
    getSavedFocusWeights,
    saveFocusWeights,
    normalizeFocusWeightPair,
    getConsumerFocusedWeights,
    getMortgageFocusedWeights
  };
})(window);
