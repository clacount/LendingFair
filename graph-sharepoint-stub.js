/**
 * SharePoint + Microsoft Graph integration stubs.
 *
 * This file intentionally does not implement live auth/token exchange.
 * It provides a stable scaffold so IT/dev teams can wire in:
 *  - Entra app registration
 *  - OAuth authorization-code + PKCE
 *  - Graph file upload endpoints
 */
(function initializeSharePointGraphStubs() {
  function buildGraphDriveUploadUrl({ siteId, driveId, folderPath = '', fileName }) {
    const normalizedFolderPath = String(folderPath || '')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const encodedFileName = encodeURIComponent(String(fileName || '').trim());

    if (!siteId || !driveId || !encodedFileName) {
      throw new Error('siteId, driveId, and fileName are required to build a Graph upload URL.');
    }

    const driveItemPath = normalizedFolderPath
      ? `${normalizedFolderPath}/${encodedFileName}`
      : encodedFileName;

    return `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/root:/${driveItemPath}:/content`;
  }

  function getGraphIntegrationChecklist() {
    return [
      'Register an Entra application for the credit union tenant.',
      'Grant delegated Graph scopes (for example: Files.ReadWrite, Sites.ReadWrite.All).',
      'Configure redirect URI for the app host location.',
      'Implement OAuth authorization code + PKCE token flow.',
      'Resolve target siteId and driveId for the SharePoint document library.',
      'Call upload endpoint with PUT https://graph.microsoft.com/v1.0/sites/{siteId}/drives/{driveId}/root:/path/file:/content.'
    ];
  }

  async function getAccessTokenWithPkceStub() {
    throw new Error(
      'Graph auth stub only: implement OAuth authorization code + PKCE token exchange before enabling SharePoint saves.'
    );
  }

  async function uploadFileToSharePointStub({ siteId, driveId, folderPath, fileName, body, accessToken }) {
    if (!accessToken) {
      throw new Error('Graph upload stub requires an accessToken.');
    }

    const uploadUrl = buildGraphDriveUploadUrl({ siteId, driveId, folderPath, fileName });

    throw new Error(
      `Graph upload stub only: target endpoint is ${uploadUrl}. Implement fetch PUT with Authorization: Bearer token and file body.`
    );
  }

  window.loanRandomizerGraphStubs = {
    buildGraphDriveUploadUrl,
    getGraphIntegrationChecklist,
    getAccessTokenWithPkceStub,
    uploadFileToSharePointStub
  };
})();
