(function initializeLendingFairEntitlementUI(globalScope) {
  function getEntitlements() {
    return globalScope.LendingFairEntitlements || null;
  }

  function getCustomerConfig() {
    return globalScope.LendingFairCustomerConfig || null;
  }

  function getAppMetadata() {
    return globalScope.LendingFairAppMetadata || null;
  }

  function canUseFeature(feature, entitlements = getEntitlements()) {
    return !entitlements || entitlements.canUseFeature(feature);
  }

  function getEntitlementState(entitlements = getEntitlements()) {
    if (!entitlements) {
      return {
        tier: 'platinum',
        tierLabel: 'Platinum',
        canUseOfficerLane: true,
        canUseMortgageLoans: true,
        canUseMultiOfficerRoles: true,
        canUseSimulation: true,
        canUseEom: true,
        canUseImportLoans: true,
        canUseCustomBranding: true,
        canUseSharePointGraph: true,
        canUseAdvancedAnalytics: true
      };
    }

    const { FEATURES } = entitlements;
    const tier = entitlements.getCurrentTier();
    return {
      tier,
      tierLabel: entitlements.getTierLabel?.(tier) || tier,
      canUseOfficerLane: entitlements.canUseFeature(FEATURES.OFFICER_LANE_ENGINE),
      canUseMortgageLoans: entitlements.canUseFeature(FEATURES.MORTGAGE_LOANS),
      canUseMultiOfficerRoles: entitlements.canUseFeature(FEATURES.MULTI_OFFICER_ROLES),
      canUseSimulation: entitlements.canUseFeature(FEATURES.SIMULATION),
      canUseEom: entitlements.canUseFeature(FEATURES.EOM_REPORT),
      canUseImportLoans: entitlements.canUseFeature(FEATURES.IMPORT_LOANS),
      canUseCustomBranding: entitlements.canUseFeature(FEATURES.CUSTOM_BRANDING),
      canUseSharePointGraph: entitlements.canUseFeature(FEATURES.SHAREPOINT_GRAPH_STUB),
      canUseAdvancedAnalytics: entitlements.canUseFeature(FEATURES.ADVANCED_ANALYTICS)
    };
  }

  function setControlAvailability(control, isAllowed, message) {
    if (!control) {
      return;
    }

    control.disabled = !isAllowed;
    control.dataset.locked = isAllowed ? 'false' : 'true';
    if (isAllowed) {
      control.removeAttribute('aria-disabled');
      control.removeAttribute('title');
      return;
    }

    control.setAttribute('aria-disabled', 'true');
    control.title = message;
  }

  function setOptionAvailability(selectEl, optionValue, isAllowed, message) {
    const option = selectEl?.querySelector?.(`option[value="${optionValue}"]`);
    if (!option) {
      return;
    }

    option.disabled = !isAllowed;
    option.title = isAllowed ? '' : message;
  }

  function syncInternalTierSelector(state, entitlements = getEntitlements()) {
    const customerConfig = getCustomerConfig();
    const shouldShowSelector = !customerConfig || customerConfig.shouldShowInternalTierSelector?.() !== false;
    const tierControl = globalScope.document?.querySelector?.('.internal-tier-control');
    const tierSelect = globalScope.document?.getElementById?.('internalTierModeSelect');
    const tierStatus = globalScope.document?.getElementById?.('internalTierModeStatus');

    if (tierControl) {
      tierControl.hidden = !shouldShowSelector;
    }
    if (!shouldShowSelector) {
      if (tierSelect) {
        tierSelect.disabled = true;
      }
      return;
    }

    if (tierSelect && entitlements) {
      tierSelect.disabled = false;
      tierSelect.value = state.tier;
    }
    if (tierStatus) {
      tierStatus.hidden = customerConfig?.shouldShowDevLabels?.() === false;
      tierStatus.textContent = `Current internal tier: ${state.tierLabel}. Licensing is not implemented yet.`;
    }
  }

  function renderCustomerProductLabel(state) {
    const customerConfig = getCustomerConfig();
    const appMetadata = getAppMetadata();
    const labelEl = globalScope.document?.getElementById?.('customerProductLabel');
    if (!labelEl || !customerConfig?.isCustomerMode?.()) {
      if (labelEl) {
        labelEl.hidden = true;
        labelEl.textContent = '';
        labelEl.dataset.state = '';
      }
      return;
    }

    const configurationError = customerConfig.getConfigurationError?.() || '';
    labelEl.hidden = false;
    if (configurationError) {
      labelEl.textContent = configurationError;
      labelEl.dataset.state = 'error';
      return;
    }

    const productLabel = appMetadata?.getProductVersionLabel?.(state.tierLabel)
      || customerConfig.getProductLabel?.(state.tierLabel)
      || `LendingFair ${state.tierLabel}`;
    const customerName = customerConfig.getCustomerConfig?.().customerName || '';
    labelEl.textContent = customerName
      ? `${productLabel} | Configured for: ${customerName}`
      : productLabel;
    labelEl.dataset.state = 'ready';
  }

  function renderAppVersionLabel(state) {
    const appMetadata = getAppMetadata();
    const labelEl = globalScope.document?.getElementById?.('appVersionLabel');
    if (!labelEl || !appMetadata) {
      return;
    }

    const customerName = getCustomerConfig()?.getCustomerConfig?.().customerName || '';
    labelEl.textContent = customerName
      ? `${appMetadata.getProductVersionLabel?.(state.tierLabel)} | Configured for: ${customerName}`
      : appMetadata.getProductVersionLabel?.(state.tierLabel);
  }

  function applyCustomerModeControls() {
    const customerConfig = getCustomerConfig();
    const doc = globalScope.document;
    if (!doc || !customerConfig) {
      return;
    }

    const showDemoControls = customerConfig.shouldShowDemoControls?.() !== false;
    [
      'launchDemoModeBtn',
      'quickLaunchDemoModeBtn',
      'endDemoModeBtn',
      'clearDemoDataBtn'
    ].forEach((id) => {
      const control = doc.getElementById(id);
      if (control && !showDemoControls) {
        control.hidden = true;
        control.disabled = true;
      }
    });
  }

  function applyOfficerClassEntitlements(selectEl, state) {
    if (!selectEl) {
      return;
    }

    selectEl.disabled = false;
    selectEl.dataset.locked = state.canUseMultiOfficerRoles ? 'false' : 'partial';
    selectEl.title = state.canUseMultiOfficerRoles
      ? ''
      : 'Basic allows Consumer Only officers. Choose Consumer Only to make legacy officers compliant.';

    [...selectEl.options].forEach((option) => {
      const isSingleRoleOption = option.value === 'consumer-only';
      option.disabled = !state.canUseMultiOfficerRoles && !isSingleRoleOption;
      option.title = option.disabled ? 'Multiple officer roles require Pro or Platinum.' : '';
    });
  }

  function applyTierEntitlementsToUI(options = {}) {
    const entitlements = getEntitlements();
    const state = getEntitlementState(entitlements);
    const doc = globalScope.document;
    if (!doc) {
      return state;
    }

    syncInternalTierSelector(state, entitlements);
    renderCustomerProductLabel(state);
    renderAppVersionLabel(state);
    applyCustomerModeControls();

    const fairnessSelect = options.fairnessModelSelect || doc.getElementById('fairnessModelSelect');
    setOptionAvailability(
      fairnessSelect,
      'officer_lane',
      state.canUseOfficerLane,
      'Officer Lane Fairness requires Pro or Platinum.'
    );
    if (
      !state.canUseOfficerLane
      && options.getSelectedFairnessEngine?.() === 'officer_lane'
      && typeof options.setSelectedFairnessEngine === 'function'
    ) {
      options.setSelectedFairnessEngine('global');
    }

    setControlAvailability(
      doc.getElementById('endOfMonthBtn'),
      state.canUseEom,
      'End-of-month reporting requires Pro or Platinum.'
    );
    setControlAvailability(
      doc.getElementById('reportingEndOfMonthBtn'),
      state.canUseEom,
      'End-of-month reporting requires Pro or Platinum.'
    );
    setControlAvailability(
      doc.getElementById('runSimulationBtn'),
      state.canUseSimulation,
      'Monthly fairness simulation requires Pro or Platinum.'
    );
    setControlAvailability(
      doc.getElementById('importLoansBtn'),
      state.canUseImportLoans,
      'Loan import requires Pro or Platinum.'
    );

    const mortgageCategoryOption = doc.getElementById('loanTypeEditorCategoryInput')?.querySelector?.('option[value="mortgage"]');
    if (mortgageCategoryOption) {
      mortgageCategoryOption.disabled = !state.canUseMortgageLoans;
      mortgageCategoryOption.title = state.canUseMortgageLoans ? '' : 'Mortgage loan support requires Pro or Platinum.';
    }

    applyOfficerClassEntitlements(
      options.officerEditorClassSelect || doc.getElementById('officerEditorClassSelect'),
      state
    );

    [
      'consumerFocusedPrimaryInput',
      'consumerFocusedSecondaryInput',
      'mortgageFocusedPrimaryInput',
      'mortgageFocusedSecondaryInput',
      'saveFocusWeightsBtn',
      'resetFocusWeightsBtn'
    ].forEach((id) => {
      setControlAvailability(
        doc.getElementById(id),
        state.canUseMultiOfficerRoles,
        'Multiple officer roles require Pro or Platinum.'
      );
    });

    doc.querySelectorAll?.('[data-feature="simulation"]').forEach((element) => {
      setControlAvailability(element, state.canUseSimulation, 'Monthly fairness simulation requires Pro or Platinum.');
    });
    doc.querySelectorAll?.('[data-feature="custom-branding"]').forEach((element) => {
      setControlAvailability(element, state.canUseCustomBranding, 'This feature requires Platinum.');
    });
    doc.querySelectorAll?.('[data-feature="sharepoint-graph"]').forEach((element) => {
      setControlAvailability(element, state.canUseSharePointGraph, 'This feature requires Platinum.');
    });
    doc.querySelectorAll?.('[data-feature="advanced-analytics"]').forEach((element) => {
      setControlAvailability(element, state.canUseAdvancedAnalytics, 'This feature requires Platinum.');
    });

    return state;
  }

  function bindInternalTierSelector(options = {}) {
    const entitlements = getEntitlements();
    const customerConfig = getCustomerConfig();
    const tierSelect = globalScope.document?.getElementById?.('internalTierModeSelect');
    if (
      !entitlements
      || !tierSelect
      || tierSelect.dataset.bound === 'true'
      || customerConfig?.shouldShowInternalTierSelector?.() === false
    ) {
      return;
    }

    tierSelect.dataset.bound = 'true';
    tierSelect.value = entitlements.getCurrentTier();
    tierSelect.addEventListener('change', () => {
      entitlements.setCurrentTier(tierSelect.value);
      applyTierEntitlementsToUI(options);
      options.onTierChange?.(entitlements.getCurrentTier());
    });
  }

  const api = {
    getEntitlementState,
    canUseFeature,
    setControlAvailability,
    setOptionAvailability,
    applyTierEntitlementsToUI,
    bindInternalTierSelector
  };

  globalScope.LendingFairEntitlementUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
