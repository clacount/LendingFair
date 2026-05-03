(function initializeLendingFairLicenseManager(globalScope) {
  const LICENSE_STORAGE_KEY = 'lendingfair-license-v1';
  const LICENSE_FILE_NAME = 'lendingfair-license.json';
  const EXPIRING_SOON_DAYS = 14;
  const VALID_TIERS = new Set(['basic', 'pro', 'platinum']);
  const VALID_LICENSE_TYPES = new Set(['pilot', 'monthly', 'annual']);
  const LICENSE_STATES = {
    DEVELOPMENT_UNLICENSED_ALLOWED: 'development_unlicensed_allowed',
    ACTIVE: 'active',
    EXPIRING_SOON: 'expiring_soon',
    EXPIRED: 'expired',
    INVALID: 'invalid',
    MISSING: 'missing'
  };

  // TODO: Add public-key signature verification for production-issued license envelopes.
  // The current pilot layer intentionally stores only local JSON license metadata and no secrets.
  const SIGNATURE_VERIFICATION_ENABLED = false;
  let fileAdapter = null;
  let fileLicenseInput = '';

  function getCustomerConfigApi() {
    return globalScope.LendingFairCustomerConfig || null;
  }

  function isCustomerMode() {
    return Boolean(getCustomerConfigApi()?.isCustomerMode?.());
  }

  function isDevelopmentMode() {
    const config = getCustomerConfigApi();
    return !config || config.isDevelopmentMode?.() === true;
  }

  function todayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function parseDateKey(value) {
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return null;
    }
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return todayKey(parsed) === normalized ? parsed : null;
  }

  function daysBetween(startKey, endKey) {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    if (!start || !end) {
      return null;
    }
    return Math.ceil((end.getTime() - start.getTime()) / 86400000);
  }

  function addDays(dateKey, days = 0) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return '';
    }
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return todayKey(date);
  }

  function readStoredLicenseInput() {
    if (fileLicenseInput) {
      return fileLicenseInput;
    }
    if (isCustomerMode()) {
      return '';
    }

    try {
      return globalScope.localStorage?.getItem(LICENSE_STORAGE_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function writeStoredLicenseInput(licenseInput) {
    fileLicenseInput = String(licenseInput || '');
    try {
      globalScope.localStorage?.setItem(LICENSE_STORAGE_KEY, String(licenseInput || ''));
    } catch (error) {
      // Local license persistence is best-effort in restricted browser contexts.
    }
  }

  function setFileAdapter(adapter = null) {
    fileAdapter = adapter && typeof adapter === 'object' ? adapter : null;
  }

  async function hydrateFromFile() {
    if (!fileAdapter?.readText) {
      return getLicenseState();
    }

    try {
      fileLicenseInput = await fileAdapter.readText(LICENSE_FILE_NAME) || '';
    } catch (error) {
      fileLicenseInput = '';
    }

    const state = getLicenseState();
    if (state.state === LICENSE_STATES.ACTIVE || state.state === LICENSE_STATES.EXPIRING_SOON) {
      globalScope.LendingFairEntitlements?.setCurrentTier?.(state.license.tier, { force: true, source: 'license-file' });
    }

    try {
      globalScope.dispatchEvent?.(new CustomEvent('lendingfair:licensechange', { detail: { license: state.license || null } }));
    } catch (error) {
      // Non-browser tests do not need license-change events.
    }

    return state;
  }

  async function writeLicenseFile(rawLicenseInput) {
    if (!fileAdapter?.writeText) {
      if (isCustomerMode()) {
        throw new Error(`Choose a working folder before installing a license so LendingFair can save ${LICENSE_FILE_NAME}.`);
      }
      writeStoredLicenseInput(rawLicenseInput);
      return;
    }

    await fileAdapter.writeText(LICENSE_FILE_NAME, rawLicenseInput);
    fileLicenseInput = String(rawLicenseInput || '');
    try {
      globalScope.localStorage?.removeItem?.(LICENSE_STORAGE_KEY);
    } catch (error) {
      // File-backed license persistence is authoritative when available.
    }
  }

  function parseLicenseInput(licenseInput) {
    if (!licenseInput) {
      return { license: null, raw: '', error: 'License is missing.' };
    }

    if (typeof licenseInput === 'object') {
      return { license: { ...licenseInput }, raw: JSON.stringify(licenseInput) };
    }

    const raw = String(licenseInput || '').trim();
    if (!raw) {
      return { license: null, raw, error: 'License is missing.' };
    }

    try {
      const parsed = JSON.parse(raw);
      const license = parsed?.payload && typeof parsed.payload === 'object'
        ? parsed.payload
        : parsed;
      return { license: { ...license }, raw };
    } catch (error) {
      return { license: null, raw, error: 'License JSON could not be parsed.' };
    }
  }

  function normalizeLicense(license = {}) {
    return {
      licenseId: String(license.licenseId || '').trim(),
      customerName: String(license.customerName || '').trim(),
      tier: String(license.tier || '').trim().toLowerCase(),
      licenseType: String(license.licenseType || '').trim().toLowerCase(),
      issuedAt: String(license.issuedAt || '').trim(),
      expiresAt: String(license.expiresAt || '').trim(),
      graceDays: Math.max(0, Number.parseInt(license.graceDays || 0, 10) || 0),
      notes: String(license.notes || '').trim()
    };
  }

  function validateLicense(licenseInput, { now = new Date(), allowExpired = true } = {}) {
    const parsed = parseLicenseInput(licenseInput);
    if (parsed.error) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: parsed.error,
        license: null,
        raw: parsed.raw
      };
    }

    const license = normalizeLicense(parsed.license);
    const missingFields = ['licenseId', 'customerName', 'tier', 'licenseType', 'issuedAt', 'expiresAt']
      .filter((field) => !license[field]);

    if (missingFields.length) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: `License is missing required field(s): ${missingFields.join(', ')}.`,
        license,
        raw: parsed.raw
      };
    }

    if (!VALID_TIERS.has(license.tier)) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: 'License tier must be basic, pro, or platinum.',
        license,
        raw: parsed.raw
      };
    }

    if (!VALID_LICENSE_TYPES.has(license.licenseType)) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: 'License type must be pilot, monthly, or annual.',
        license,
        raw: parsed.raw
      };
    }

    if (!parseDateKey(license.issuedAt) || !parseDateKey(license.expiresAt)) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: 'License dates must use YYYY-MM-DD format.',
        license,
        raw: parsed.raw
      };
    }

    if (daysBetween(license.issuedAt, license.expiresAt) < 0) {
      return {
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: 'License expiration date must be on or after the issue date.',
        license,
        raw: parsed.raw
      };
    }

    const nowKey = todayKey(now);
    const graceExpirationKey = addDays(license.expiresAt, license.graceDays);
    const daysUntilExpiration = daysBetween(nowKey, license.expiresAt);
    const daysUntilGraceExpiration = daysBetween(nowKey, graceExpirationKey);
    const isExpired = daysUntilGraceExpiration !== null && daysUntilGraceExpiration < 0;
    const state = isExpired
      ? LICENSE_STATES.EXPIRED
      : (daysUntilExpiration !== null && daysUntilExpiration <= EXPIRING_SOON_DAYS ? LICENSE_STATES.EXPIRING_SOON : LICENSE_STATES.ACTIVE);

    if (isExpired && !allowExpired) {
      return {
        valid: false,
        state,
        message: `License expired on ${license.expiresAt}.`,
        license,
        raw: parsed.raw,
        daysUntilExpiration,
        daysUntilGraceExpiration
      };
    }

    return {
      valid: !isExpired,
      state,
      message: isExpired ? `License expired on ${license.expiresAt}.` : 'License is valid.',
      license,
      raw: parsed.raw,
      daysUntilExpiration,
      daysUntilGraceExpiration,
      signatureVerified: SIGNATURE_VERIFICATION_ENABLED
    };
  }

  function getLicenseState({ now = new Date() } = {}) {
    const raw = readStoredLicenseInput();
    if (!raw) {
      if (isDevelopmentMode() && !isCustomerMode()) {
        return {
          state: LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED,
          valid: true,
          license: null,
          message: 'Development mode allows unlicensed usage.',
          daysUntilExpiration: null
        };
      }
      return {
        state: LICENSE_STATES.MISSING,
        valid: false,
        license: null,
        message: 'License is missing.',
        daysUntilExpiration: null
      };
    }

    const validation = validateLicense(raw, { now, allowExpired: true });
    if (!isCustomerMode() && isDevelopmentMode() && !validation.valid) {
      return {
        state: LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED,
        valid: true,
        license: null,
        message: 'Development mode allows unlicensed usage.',
        daysUntilExpiration: null
      };
    }

    return validation;
  }

  function getActiveLicense() {
    const state = getLicenseState();
    return state.state === LICENSE_STATES.ACTIVE || state.state === LICENSE_STATES.EXPIRING_SOON
      ? state.license
      : null;
  }

  function getEntitlementTier() {
    return getActiveLicense()?.tier || null;
  }

  function isLicenseActive(options = {}) {
    const state = getLicenseState(options);
    return state.state === LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED
      || state.state === LICENSE_STATES.ACTIVE
      || state.state === LICENSE_STATES.EXPIRING_SOON;
  }

  function isLicenseExpired(options = {}) {
    return getLicenseState(options).state === LICENSE_STATES.EXPIRED;
  }

  function getDaysUntilExpiration(options = {}) {
    return getLicenseState(options).daysUntilExpiration;
  }

  function getLicenseStatusLabel(options = {}) {
    const state = getLicenseState(options);
    if (state.state === LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED) {
      return 'Development: unlicensed allowed';
    }
    if (state.state === LICENSE_STATES.ACTIVE) {
      return 'License active';
    }
    if (state.state === LICENSE_STATES.EXPIRING_SOON) {
      return `License expires in ${Math.max(0, state.daysUntilExpiration)} day${state.daysUntilExpiration === 1 ? '' : 's'}`;
    }
    if (state.state === LICENSE_STATES.EXPIRED) {
      return `License expired on ${state.license?.expiresAt || 'unknown date'}`;
    }
    if (state.state === LICENSE_STATES.MISSING) {
      return 'License missing';
    }
    return 'License invalid';
  }

  function getLicenseExpirationMessage(options = {}) {
    const state = getLicenseState(options);
    if (state.state === LICENSE_STATES.EXPIRED) {
      return `This LendingFair pilot expired on ${state.license?.expiresAt || 'the configured expiration date'}. Enter an updated license to continue running assignments.`;
    }
    if (state.state === LICENSE_STATES.MISSING) {
      return 'Enter a valid LendingFair license to continue running assignments.';
    }
    if (state.state === LICENSE_STATES.INVALID) {
      return state.message || 'The installed LendingFair license is invalid.';
    }
    if (state.state === LICENSE_STATES.EXPIRING_SOON) {
      return `License expires in ${Math.max(0, state.daysUntilExpiration)} day${state.daysUntilExpiration === 1 ? '' : 's'}.`;
    }
    return state.message || '';
  }

  function canPerformOperationalAction(actionName = '', options = {}) {
    if (isLicenseActive(options)) {
      return { allowed: true, actionName, state: getLicenseState(options) };
    }

    return {
      allowed: false,
      actionName,
      state: getLicenseState(options),
      message: getLicenseExpirationMessage(options)
    };
  }

  async function installLicense(licenseInput) {
    const validation = validateLicense(licenseInput, { allowExpired: false });
    if (!validation.valid) {
      return { installed: false, ...validation };
    }

    try {
      await writeLicenseFile(validation.raw);
    } catch (error) {
      return {
        installed: false,
        valid: false,
        state: LICENSE_STATES.INVALID,
        message: error.message || `Could not save ${LICENSE_FILE_NAME}.`,
        license: validation.license,
        raw: validation.raw
      };
    }

    globalScope.LendingFairEntitlements?.setCurrentTier?.(validation.license.tier, { force: true, source: 'license' });
    try {
      globalScope.dispatchEvent?.(new CustomEvent('lendingfair:licensechange', { detail: { license: validation.license } }));
    } catch (error) {
      // Non-browser tests do not need license-change events.
    }
    return { installed: true, ...validation };
  }

  function getSupportMetadata() {
    const state = getLicenseState();
    return {
      licenseId: state.license?.licenseId || '',
      licenseType: state.license?.licenseType || '',
      expiresAt: state.license?.expiresAt || '',
      licenseStatus: state.state,
      activeTier: state.license?.tier || ''
    };
  }

  const api = {
    LICENSE_FILE_NAME,
    LICENSE_STORAGE_KEY,
    LICENSE_STATES,
    setFileAdapter,
    hydrateFromFile,
    getLicenseState,
    getActiveLicense,
    installLicense,
    validateLicense,
    isLicenseActive,
    isLicenseExpired,
    getLicenseStatusLabel,
    getLicenseExpirationMessage,
    getDaysUntilExpiration,
    canPerformOperationalAction,
    getEntitlementTier,
    getSupportMetadata
  };

  globalScope.LendingFairLicenseManager = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
