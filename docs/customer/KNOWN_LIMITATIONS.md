# Known Limitations

This document describes current Basic/Pro limitations honestly for pilot and contract discussions.

## Local Browser App

Basic and Pro are local browser applications. They run in Microsoft Edge or Google Chrome and use local browser APIs to read/write selected folders.

## No Backend Database

Basic and Pro do not include a backend database. Data is stored in local or selected folders as CSV, JSON, and PDF files.

## No Centralized Authentication

Basic and Pro do not include centralized user authentication, role-based access control, or single sign-on.

Access control should be handled through device access, folder permissions, and internal operating procedures.

## No LOS/LMS Integration

Basic and Pro do not directly integrate with a Loan Origination System or Loan Management System.

Loan data is entered manually or through available local import workflows based on the package and configuration.

Pro supports file-based import only, such as a user-selected CSV export with mapping, preview, validation, and confirm. Pro file import does not include live sync, scheduled polling, API ingestion, database-backed workflows, or writeback to an LOS/LMS.

## Browser Compatibility

Folder selection and direct PDF saving require the File System Access API, which is supported in current Microsoft Edge and Google Chrome.

Other browsers may not support the required folder access behavior.

## Local File Storage

LendingFair stores operational files in the selected working folder, including:

- CSV running totals
- CSV loan history
- JSON configuration/state files
- PDF reports

Institutions should decide where these files should live and how they should be backed up or retained.

## Licensing

Basic/Pro customer pilots use a local offline license payload. The app does not perform online activation, payment processing, user account validation, or server-side license checks.

Pilot licenses can be issued for 30 or 60 days, and monthly/annual renewals are handled by entering updated Base64 license text (or importing a Base64 license text file). The installed license is saved as `lendingfair-license.json` as Base64 text only in the selected working folder root. Expired licenses block new operational actions but do not delete local data.

The current offline license layer is suitable for pilot packaging. It is not a full hosted licensing platform.

## SharePoint

Direct SharePoint upload is not implemented in Basic/Pro unless separately integrated. A common pilot approach is to use a local OneDrive-synced folder that maps to an approved SharePoint document library.

## Platinum Direction

Platinum is intended for a hosted or containerized backend architecture with:

- database-backed persistence
- APIs/webhooks or scheduled polling
- LOS/LMS integration
- SharePoint/Microsoft Graph integration
- centralized authentication
- advanced analytics
- live assignment runs

Those capabilities are not claimed as part of the Basic/Pro local-browser package.
