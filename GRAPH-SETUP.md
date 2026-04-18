# Microsoft Graph Setup

This guide is for IT staff who are **not programmers**.

Goal: make the Loan Randomizer app able to save directly into a SharePoint document library using Microsoft Graph.

---

## What you will edit

Only this file in the app folder:

- `graph-sharepoint-stub.js` (replace the two `throw new Error(...)` stubs with real token/upload calls)

And these values in the same file/function inputs:

- `tenantId`
- `clientId`
- `siteId`
- `driveId`
- target folder path

---

## 1) Register an app in Entra ID

1. Go to **Microsoft Entra admin center**.
2. Open **App registrations**.
3. Click **New registration**.
4. Name it: `Loan Randomizer Graph`.
5. Choose your org tenant.
6. Add a redirect URI for where this app runs (web URL).
7. Save.

Write down:

- **Application (client) ID** → this is `clientId`.
- **Directory (tenant) ID** → this is `tenantId`.

---

## 2) Grant Graph permissions

In the new app registration:

1. Open **API permissions**.
2. Add delegated permissions:
   - `Files.ReadWrite`
   - `Sites.ReadWrite.All` (or a least-privilege option your policy allows)
3. Click **Grant admin consent**.

---

## 3) Find SharePoint IDs once

You need:

- `siteId`
- `driveId` (the document library)

Your IT/dev admin can get these from Graph Explorer or PowerShell once, then paste them into the app config.

---

## 4) Wire the two stub functions

In `graph-sharepoint-stub.js`:

- `getAccessTokenWithPkceStub()`  
  Replace with real OAuth Authorization Code + PKCE token logic.

- `uploadFileToSharePointStub(...)`  
  Replace with real `fetch(..., { method: 'PUT' })` upload call to:
  `https://graph.microsoft.com/v1.0/sites/{siteId}/drives/{driveId}/root:/path/file:/content`

---

## 5) Do a quick smoke test

1. Open app in Edge/Chrome.
2. Trigger Graph auth.
3. Upload one tiny test file (`hello.txt`) to the target library folder.
4. Confirm file appears in SharePoint.

If this test passes, Loan Randomizer file uploads can use the same path/token pattern.

---

## 6) Security notes

- Use least-privilege permissions.
- Prefer delegated permissions tied to signed-in users.
- Keep auth in browser-safe flows (PKCE).  
- Do **not** embed long-lived secrets in front-end code.

---

## Plain-English summary

Yes, this is possible.  
The current app already includes Graph scaffolding, and IT can complete it by adding tenant app registration details + token flow + upload call.
