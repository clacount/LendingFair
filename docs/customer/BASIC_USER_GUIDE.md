# LendingFair Basic User Guide

## Basic Scope

LendingFair Basic supports consumer-loan assignment only. It uses the Global fairness engine and one shared officer pool.

Supported consumer loan types:

- Auto
- Personal
- Credit Card
- Collateralized

Basic does not support mortgage loans, HELOC routing, Officer Lane Fairness, mortgage officer roles, flex officer roles, simulation, EOM reporting, direct SharePoint upload, or LOS/LMS integration.

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

Loan import availability depends on the configured tier. In the current go-to-market packaging, Import Loans is treated as a Platinum-level feature because file formats often require institution-specific customization.

Basic users should expect to enter loans manually unless a separate customer-specific import workflow has been configured.

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
- fairness simulation
- EOM reporting
- custom branding
- direct SharePoint upload
- LOS/LMS integration
- backend database or centralized authentication
