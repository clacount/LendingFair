# LendingFair Basic User Guide

## Basic Scope

LendingFair Basic supports consumer-loan assignment only. It uses the Global fairness engine and one shared officer pool.

Supported consumer loan types:

- Auto
- Personal
- Credit Card
- Collateralized

Basic does not support mortgage loans, HELOC routing, Officer Lane Fairness, mortgage officer roles, flex officer roles, loan file import, simulation, EOM reporting, direct SharePoint upload, or LOS/LMS integration.

## Selecting a Working Folder
A working folder is required to save the assignment history. The working folder is selected at the beginning of the first session and can be changed as needed.
- The working folder is the folder where the app will save the generated PDF report.
- The working folder must be selected before entering loans.
- The working folder must be selected before running the assignment.
- The working folder must be selected before generating a PDF report.

## Enter A License Key
A proprietary license key will be provided to the credit union.
- A license key is required to access the app.
- The license key can be manually entered or imported from a file.
- The license key is case-sensitive.

## Adding Officers

1. Open LendingFair in Microsoft Edge or Google Chrome.
2. Select the working folder.
3. Add each loan officer who should be included in the assignment pool.
4. Confirm officer names are spelled consistently.

Officer names must be unique so running totals and history can be tracked correctly.

## Entering Loans

For each loan, enter:

- loan application number or ID
- loan type
- amount requested, when applicable

Credit Card loans may be tracked by count and type rather than goal-dollar amount if configured that way in the app.

## Importing Loans

Basic uses manual loan entry only.

File-based loan import, such as importing a CSV export with mapping and preview, requires Pro or Platinum. Basic users should enter loans manually unless the customer is upgraded to a tier that includes import.

## Running Assignment

After officers and loans are entered:

1. Review the officer list.
2. Review the loan list.
3. Click **Run Fair Assignment**.
4. Review the on-screen assignments and fairness information.
5. Open the generated PDF report from the active monthly folder.

## Finding PDFs

Generated assignment PDFs are saved in the active monthly folder under the working folder. The monthly folder is named in `YYYY-MM` format.

Example:

```text
Selected Working Folder/
  2026-05/
    Loan-Assignment-Report-2026-05-02-103000.pdf
```

## Duplicate Loan Prevention

LendingFair tracks loan history in the selected monthly folder. If a loan ID has already been processed, the app can prevent or flag duplicate assignment so the same loan is not assigned twice.

Use consistent loan IDs from your loan system or internal workflow so duplicate prevention works as intended.

## What Basic Does Not Include

Basic does not include:

- mortgage loan support
- HELOC-specific routing
- Consumer/Mortgage lane separation
- Consumer, Mortgage, and Flex officer roles
- Officer Lane Fairness
- file-based loan import
- fairness simulation
- EOM reporting
- custom branding
- direct SharePoint upload
- LOS/LMS integration
- backend database or centralized authentication
If a license is missing, invalid, or expired, LendingFair blocks new operational actions such as running assignments, importing loans, editing officers, editing loan types, simulations, and new report generation. Existing files are not deleted, and support export remains available.
