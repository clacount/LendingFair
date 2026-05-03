(function initializeLendingFairLicenseManager(globalScope) {
  const LICENSE_STORAGE_KEY = 'lendingfair-license-v1';
  const LICENSE_FILE_NAME = 'lendingfair-license.json';
  const LEGACY_LICENSE_OBFUSCATION_PREFIX = 'b64:';
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

  const SIGNATURE_VERIFICATION_ENABLED = false;
  let fileAdapter = null;
  let fileLicenseInput = '';

  function getCustomerConfigApi() { return globalScope.LendingFairCustomerConfig || null; }
  function isCustomerMode() { return Boolean(getCustomerConfigApi()?.isCustomerMode?.()); }
  function isDevelopmentMode() { const c=getCustomerConfigApi(); return !c || c.isDevelopmentMode?.()===true; }
  function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
  function parseDateKey(value) { const n=String(value||'').trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null; const p=new Date(`${n}T00:00:00Z`); return Number.isNaN(p.getTime())||todayKey(p)!==n?null:p; }
  function daysBetween(startKey,endKey){const s=parseDateKey(startKey);const e=parseDateKey(endKey);if(!s||!e)return null;return Math.ceil((e.getTime()-s.getTime())/86400000);} 
  function addDays(dateKey,days=0){const d=parseDateKey(dateKey);if(!d)return '';d.setUTCDate(d.getUTCDate()+Number(days||0));return todayKey(d);} 

  function normalizeBase64LicenseInput(input) {
    return String(input ?? '').trim().replace(/\s+/g, '');
  }

  function isProbablyRawJson(input) {
    const trimmed = String(input ?? '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  function decodeBase64ToUtf8(value) {
    if (typeof globalScope.atob === 'function') {
      return decodeURIComponent(escape(globalScope.atob(value)));
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
    throw new Error('decoder unavailable.');
  }

  function decodeBase64LicenseInput(base64Text) {
    const normalized = normalizeBase64LicenseInput(base64Text);
    if (!normalized) {
      return { decoded: '', error: 'License is missing.' };
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
      return { decoded: '', error: 'License text is invalid.' };
    }
    try {
      const decoded = decodeBase64ToUtf8(normalized);
      if (!decoded.trim()) {
        return { decoded: '', error: 'License text is invalid.' };
      }
      return { decoded, error: '' };
    } catch (error) {
      return { decoded: '', error: 'License text is invalid.' };
    }
  }

  function parseBase64LicenseInput(base64Text) {
    const normalizedInput = String(base64Text ?? '');
    if (!normalizedInput.trim()) {
      return { license: null, encoded: '', decoded: '', error: 'License is missing.' };
    }
    if (isProbablyRawJson(normalizedInput)) {
      return { license: null, encoded: '', decoded: '', error: 'License must be an encoded key, not raw JSON.' };
    }
    const encoded = normalizeBase64LicenseInput(normalizedInput);
    const decodeResult = decodeBase64LicenseInput(encoded);
    if (decodeResult.error) {
      return { license: null, encoded, decoded: '', error: decodeResult.error };
    }

    try {
      const parsed = JSON.parse(decodeResult.decoded);
      const license = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed;
      if (!license || typeof license !== 'object' || Array.isArray(license)) {
        return { license: null, encoded, decoded: decodeResult.decoded, error: 'Decoded license payload must be a JSON object.' };
      }
      return { license: { ...license }, encoded, decoded: decodeResult.decoded, error: '' };
    } catch {
      return { license: null, encoded, decoded: decodeResult.decoded, error: 'License decoded key is not valid JSON.' };
    }
  }

  function parseStoredValueWithLegacyMigration(value) {
    const raw = String(value || '').trim();
    if (!raw) return { stored: '', migrated: false };
    if (!raw.startsWith(LEGACY_LICENSE_OBFUSCATION_PREFIX)) {
      return { stored: normalizeBase64LicenseInput(raw), migrated: false };
    }
    const stripped = normalizeBase64LicenseInput(raw.slice(LEGACY_LICENSE_OBFUSCATION_PREFIX.length));
    const parsed = parseBase64LicenseInput(stripped);
    if (parsed.error) return { stored: raw, migrated: false };
    return { stored: stripped, migrated: true };
  }

  function readStoredLicenseInput() {
    if (fileLicenseInput) return fileLicenseInput;
    if (isCustomerMode()) return '';
    try {
      const current = globalScope.localStorage?.getItem(LICENSE_STORAGE_KEY) || '';
      const migration = parseStoredValueWithLegacyMigration(current);
      if (migration.migrated) {
        globalScope.localStorage?.setItem(LICENSE_STORAGE_KEY, migration.stored);
      }
      return migration.stored;
    } catch { return ''; }
  }

  function writeStoredLicenseInput(licenseInput) {
    const normalized = normalizeBase64LicenseInput(licenseInput);
    fileLicenseInput = normalized;
    try { globalScope.localStorage?.setItem(LICENSE_STORAGE_KEY, normalized); } catch {}
  }

  function setFileAdapter(adapter = null) { fileAdapter = adapter && typeof adapter === 'object' ? adapter : null; }

  async function hydrateFromFile() {
    if (!fileAdapter?.readText) return getLicenseState();
    try {
      const rawFile = await fileAdapter.readText(LICENSE_FILE_NAME) || '';
      const migration = parseStoredValueWithLegacyMigration(rawFile);
      fileLicenseInput = migration.stored;
      if (migration.migrated && fileAdapter?.writeText) {
        await fileAdapter.writeText(LICENSE_FILE_NAME, migration.stored);
      }
    } catch { fileLicenseInput = ''; }
    const state = getLicenseState();
    if (state.state === LICENSE_STATES.ACTIVE || state.state === LICENSE_STATES.EXPIRING_SOON) {
      globalScope.LendingFairEntitlements?.setCurrentTier?.(state.license.tier, { force: true, source: 'license-file' });
    }
    try { globalScope.dispatchEvent?.(new CustomEvent('lendingfair:licensechange', { detail: { license: state.license || null } })); } catch {}
    return state;
  }

  async function writeLicenseFile(rawLicenseInput) {
    const normalized = normalizeBase64LicenseInput(rawLicenseInput);
    if (!fileAdapter?.writeText) {
      if (isCustomerMode()) throw new Error(`Choose a working folder before installing a license so LendingFair can save ${LICENSE_FILE_NAME}.`);
      writeStoredLicenseInput(normalized);return;
    }
    await fileAdapter.writeText(LICENSE_FILE_NAME, normalized);
    fileLicenseInput = normalized;
    try { globalScope.localStorage?.removeItem?.(LICENSE_STORAGE_KEY);} catch {}
  }

  function normalizeLicense(license={}){return {licenseId:String(license.licenseId||'').trim(),customerName:String(license.customerName||'').trim(),tier:String(license.tier||'').trim().toLowerCase(),licenseType:String(license.licenseType||'').trim().toLowerCase(),issuedAt:String(license.issuedAt||'').trim(),expiresAt:String(license.expiresAt||'').trim(),graceDays:Math.max(0,Number.parseInt(license.graceDays||0,10)||0),notes:String(license.notes||'').trim()};}

  function validateLicense(licenseInput,{now=new Date(),allowExpired=true}={}){
    if (typeof licenseInput === 'object' && licenseInput !== null) {
      return { valid:false,state:LICENSE_STATES.INVALID,message:'License must be an encoded key, not a JSON object.',license:null,encoded:'',decoded:'' };
    }
    const parsed=parseBase64LicenseInput(licenseInput);
    if(parsed.error){return {valid:false,state:LICENSE_STATES.INVALID,message:parsed.error,license:null,encoded:parsed.encoded,decoded:parsed.decoded};}
    const license=normalizeLicense(parsed.license);
    const missingFields=['licenseId','customerName','tier','licenseType','issuedAt','expiresAt'].filter((f)=>!license[f]);
    if(missingFields.length){return {valid:false,state:LICENSE_STATES.INVALID,message:`License is missing required field(s): ${missingFields.join(', ')}.`,license,encoded:parsed.encoded,decoded:parsed.decoded};}
    if(!VALID_TIERS.has(license.tier)){return {valid:false,state:LICENSE_STATES.INVALID,message:'License tier must be basic, pro, or platinum.',license,encoded:parsed.encoded,decoded:parsed.decoded};}
    if(!VALID_LICENSE_TYPES.has(license.licenseType)){return {valid:false,state:LICENSE_STATES.INVALID,message:'License type must be pilot, monthly, or annual.',license,encoded:parsed.encoded,decoded:parsed.decoded};}
    if(!parseDateKey(license.issuedAt)||!parseDateKey(license.expiresAt)){return {valid:false,state:LICENSE_STATES.INVALID,message:'License dates must use YYYY-MM-DD format.',license,encoded:parsed.encoded,decoded:parsed.decoded};}
    if(daysBetween(license.issuedAt,license.expiresAt)<0){return {valid:false,state:LICENSE_STATES.INVALID,message:'License expiration date must be on or after the issue date.',license,encoded:parsed.encoded,decoded:parsed.decoded};}
    const nowKey=todayKey(now);const graceExpirationKey=addDays(license.expiresAt,license.graceDays);const daysUntilExpiration=daysBetween(nowKey,license.expiresAt);const daysUntilGraceExpiration=daysBetween(nowKey,graceExpirationKey);const isExpired=daysUntilGraceExpiration!==null&&daysUntilGraceExpiration<0;const state=isExpired?LICENSE_STATES.EXPIRED:(daysUntilExpiration!==null&&daysUntilExpiration<=EXPIRING_SOON_DAYS?LICENSE_STATES.EXPIRING_SOON:LICENSE_STATES.ACTIVE);
    if(isExpired&&!allowExpired){return {valid:false,state,message:`License expired on ${license.expiresAt}.`,license,encoded:parsed.encoded,decoded:parsed.decoded,daysUntilExpiration,daysUntilGraceExpiration};}
    return {valid:!isExpired,state,message:isExpired?`License expired on ${license.expiresAt}.`:'License is valid.',license,encoded:parsed.encoded,decoded:parsed.decoded,daysUntilExpiration,daysUntilGraceExpiration,signatureVerified:SIGNATURE_VERIFICATION_ENABLED};
  }

  function getLicenseState({now=new Date()}={}){const raw=readStoredLicenseInput(); if(!raw){ if(isDevelopmentMode()&&!isCustomerMode()) return {state:LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED,valid:true,license:null,message:'Development mode allows unlicensed usage.',daysUntilExpiration:null}; return {state:LICENSE_STATES.MISSING,valid:false,license:null,message:'License is missing.',daysUntilExpiration:null};} const validation=validateLicense(raw,{now,allowExpired:true}); if(!isCustomerMode()&&isDevelopmentMode()&&!validation.valid){return {state:LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED,valid:true,license:null,message:'Development mode allows unlicensed usage.',daysUntilExpiration:null};} return validation;}
  function getActiveLicense(){const s=getLicenseState(); return s.state===LICENSE_STATES.ACTIVE||s.state===LICENSE_STATES.EXPIRING_SOON?s.license:null;}
  function getEntitlementTier(){return getActiveLicense()?.tier||null;}
  function isLicenseActive(o={}){const s=getLicenseState(o);return s.state===LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED||s.state===LICENSE_STATES.ACTIVE||s.state===LICENSE_STATES.EXPIRING_SOON;}
  function isLicenseExpired(o={}){return getLicenseState(o).state===LICENSE_STATES.EXPIRED;}
  function getDaysUntilExpiration(o={}){return getLicenseState(o).daysUntilExpiration;}
  function getLicenseStatusLabel(o={}){const s=getLicenseState(o); if(s.state===LICENSE_STATES.DEVELOPMENT_UNLICENSED_ALLOWED)return 'Development: unlicensed allowed'; if(s.state===LICENSE_STATES.ACTIVE)return 'License active'; if(s.state===LICENSE_STATES.EXPIRING_SOON)return `License expires in ${Math.max(0,s.daysUntilExpiration)} day${s.daysUntilExpiration===1?'':'s'}`; if(s.state===LICENSE_STATES.EXPIRED)return `License expired on ${s.license?.expiresAt||'unknown date'}`; if(s.state===LICENSE_STATES.MISSING)return 'License missing'; return 'License invalid';}
  function getLicenseExpirationMessage(o={}){const s=getLicenseState(o); if(s.state===LICENSE_STATES.EXPIRED)return `This LendingFair pilot expired on ${s.license?.expiresAt||'the configured expiration date'}. Enter an updated license to continue running assignments.`; if(s.state===LICENSE_STATES.MISSING)return 'Enter a valid LendingFair license to continue running assignments.'; if(s.state===LICENSE_STATES.INVALID)return s.message||'The installed LendingFair license is invalid.'; if(s.state===LICENSE_STATES.EXPIRING_SOON)return `License expires in ${Math.max(0,s.daysUntilExpiration)} day${s.daysUntilExpiration===1?'':'s'}.`; return s.message||'';}
  function canPerformOperationalAction(actionName='',o={}){if(isLicenseActive(o))return {allowed:true,actionName,state:getLicenseState(o)}; return {allowed:false,actionName,state:getLicenseState(o),message:getLicenseExpirationMessage(o)};}
  async function installLicense(licenseInput){const validation=validateLicense(licenseInput,{allowExpired:false}); if(!validation.valid)return {installed:false,...validation}; try{await writeLicenseFile(validation.encoded);}catch(error){return {installed:false,valid:false,state:LICENSE_STATES.INVALID,message:error.message||`Could not save ${LICENSE_FILE_NAME}.`,license:validation.license,encoded:validation.encoded,decoded:''};} globalScope.LendingFairEntitlements?.setCurrentTier?.(validation.license.tier,{force:true,source:'license'}); try{globalScope.dispatchEvent?.(new CustomEvent('lendingfair:licensechange',{detail:{license:validation.license}}));}catch{} return {installed:true,...validation};}
  function getSupportMetadata(){const s=getLicenseState(); return {licenseId:s.license?.licenseId||'',licenseType:s.license?.licenseType||'',expiresAt:s.license?.expiresAt||'',licenseStatus:s.state,activeTier:s.license?.tier||''};}

  const api={LICENSE_FILE_NAME,LICENSE_STORAGE_KEY,LICENSE_STATES,setFileAdapter,hydrateFromFile,getLicenseState,getActiveLicense,installLicense,validateLicense,isLicenseActive,isLicenseExpired,getLicenseStatusLabel,getLicenseExpirationMessage,getDaysUntilExpiration,canPerformOperationalAction,getEntitlementTier,getSupportMetadata,normalizeBase64LicenseInput,isProbablyRawJson,decodeBase64LicenseInput,parseBase64LicenseInput};
  globalScope.LendingFairLicenseManager=api; if(typeof module!=='undefined'&&module.exports){module.exports=api;}
})(typeof window !== 'undefined' ? window : globalThis);
