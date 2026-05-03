(function initializeLendingFairSupportExport(globalScope) {
  const SUPPORT_FILE_KINDS = Object.freeze({
    RUNNING_TOTALS: 'runningTotals',
    LOAN_HISTORY: 'loanHistory',
    LOAN_TYPES: 'loanTypes',
    SIMULATION_HISTORY: 'simulationHistory'
  });

  function shouldIncludeSimulationHistory(entitlements = globalScope.LendingFairEntitlements) {
    return Boolean(entitlements?.canUseFeature?.(entitlements?.FEATURES?.SIMULATION));
  }

  function createIncludedFileRecord({ fileName, kind, content = '', size = 0, lastModified = null }) {
    return {
      fileName,
      kind,
      status: 'included',
      size,
      lastModified,
      content
    };
  }

  function createMissingFileRecord({ fileName, kind, reason = 'File was not found in the active month folder.' }) {
    return {
      fileName,
      kind,
      status: 'missing',
      reason
    };
  }

  function normalizeReportFilenames(reportFilenames = []) {
    return [...reportFilenames]
      .filter(Boolean)
      .map((report) => {
        if (typeof report === 'string') {
          return { fileName: report };
        }
        return report;
      })
      .sort((first, second) => String(first.fileName || '').localeCompare(String(second.fileName || '')));
  }

  function buildSupportManifest({
    appMetadata = {},
    activeTier = '',
    activeTierLabel = '',
    fairnessEngine = '',
    fairnessEngineLabel = '',
    customerMode = '',
    customerName = '',
    exportTimestamp = new Date().toISOString(),
    userAgent = '',
    monthFolderKey = '',
    sessionMode = 'production',
    licenseMetadata = {},
    files = [],
    reportFilenames = []
  } = {}) {
    const normalizedFiles = Array.isArray(files) ? files : [];
    const includedFiles = normalizedFiles.filter((file) => file?.status === 'included');
    const missingFiles = normalizedFiles.filter((file) => file?.status === 'missing');

    return {
      packageType: 'lendingfair-support-package',
      schemaVersion: 1,
      generatedAt: exportTimestamp,
      app: {
        name: appMetadata.appName || appMetadata.APP_NAME || 'LendingFair',
        version: appMetadata.appVersion || appMetadata.APP_VERSION || '',
        releaseChannel: appMetadata.releaseChannel || appMetadata.APP_RELEASE_CHANNEL || '',
        buildDate: appMetadata.buildDate || appMetadata.APP_BUILD_DATE || ''
      },
      context: {
        activeTier,
        activeTierLabel,
        fairnessEngine,
        fairnessEngineLabel,
        customerMode,
        customerName,
        userAgent,
        monthFolderKey,
        sessionMode
      },
      license: {
        licenseId: licenseMetadata.licenseId || '',
        licenseType: licenseMetadata.licenseType || '',
        expiresAt: licenseMetadata.expiresAt || '',
        licenseStatus: licenseMetadata.licenseStatus || '',
        activeTier: licenseMetadata.activeTier || activeTier
      },
      files: normalizedFiles,
      reports: normalizeReportFilenames(reportFilenames),
      summary: {
        includedFileCount: includedFiles.length,
        missingFileCount: missingFiles.length,
        reportFilenameCount: normalizeReportFilenames(reportFilenames).length
      },
      privacyNotice: 'This package may include loan IDs, officer names, and assignment history from the selected month. Only share it with authorized support contacts.'
    };
  }

  const api = {
    SUPPORT_FILE_KINDS,
    shouldIncludeSimulationHistory,
    createIncludedFileRecord,
    createMissingFileRecord,
    buildSupportManifest
  };

  globalScope.LendingFairSupportExport = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
