# LendingFair Getting Started

## What LendingFair Is

LendingFair is a local browser application that helps assign loan applications to loan officers using configured eligibility rules and fairness balancing. It creates audit-ready PDF reports and keeps local monthly state so assignments can continue from prior running totals.

LendingFair is intended to improve consistency, reduce perceived bias, and make assignment decisions easier to review.

## Basic vs. Pro

**LendingFair Basic** is designed for consumer-loan assignment using one shared officer pool and the Global fairness engine.

**LendingFair Pro** adds mortgage loan support, officer roles, Officer Lane Fairness, file-based loan import, fairness audit reporting, EOM reporting, and limited fairness simulation.

**LendingFair Platinum** is the future enterprise direction for hosted/backend capabilities, database-backed persistence, APIs, live runs, and deeper institution-specific integrations. Platinum architecture is not part of the Basic/Pro local-browser package.

## Local Browser Operation

Basic and Pro run locally in the browser. No backend database or hosted LendingFair service is required for the current Basic/Pro package.

Supported browsers:

- Microsoft Edge
- Google Chrome

The app relies on the browser File System Access API for selecting a working folder and writing local output files.

## Local Pilot License

Basic and Pro customer pilots require a local LendingFair license payload. The license can be issued for a pilot period such as 30 or 60 days, or for a monthly/annual renewal period.

No online activation is required. To renew or extend access, choose **Update License** in the app and paste the updated license JSON provided by LendingFair support.

When a working folder is selected, LendingFair saves the installed license as:

```text
lendingfair-license.json
```

This file lives in the root of the selected working folder, not inside a monthly folder. If another authorized user opens LendingFair and selects the same working folder, the app reads that same license file.

If a license is missing, invalid, or expired, LendingFair blocks new operational actions such as running assignments, importing loans, editing officers, editing loan types, simulations, and new report generation. Existing files are not deleted, and support export remains available.

## Working Folder Selection

When you open LendingFair, select a working folder. This folder is where LendingFair stores monthly state files and generated reports.

Use a folder that your institution is comfortable using for operational records, such as a local secured folder or a OneDrive-synced folder approved by your IT team.

## Monthly Folder Behavior

LendingFair creates or uses a monthly subfolder named in `YYYY-MM` format, such as:

```text
2026-05
```

The active monthly folder contains files such as:

- running totals CSV
- loan history CSV
- generated assignment PDFs
- generated EOM or custom reports when available

## PDF and CSV Outputs

Each assignment run can generate a PDF report showing:

- app version and active tier
- generated timestamp
- fairness engine used
- assignments by loan
- assignments by officer
- fairness audit details when included by the tier
- running totals

CSV files are used for local persistence, duplicate prevention, monthly history, and running totals.

## No LOS/LMS Integration in Basic or Pro

Basic and Pro do not connect directly to a Loan Origination System or Loan Management System. Basic uses manual loan entry. Pro supports file-based loan import, such as a user-selected CSV export with mapping, preview, validation, and confirm.

Direct LOS/LMS polling, API/webhook ingestion, automated live assignment runs, and writeback are part of the Platinum roadmap and would require a backend/integration architecture.

## Platinum Roadmap

Platinum is intended for future enterprise needs such as:

- hosted or containerized backend service
- database-backed officer state and audit history
- API/webhook or scheduled polling integrations
- SharePoint/Microsoft Graph integration
- custom reporting and institution-specific automation
- live production assignment runs

These capabilities should be discussed separately from the Basic/Pro local-browser package.
