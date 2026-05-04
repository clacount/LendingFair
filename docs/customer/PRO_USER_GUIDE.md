# LendingFair Pro User Guide

## Pro Scope

LendingFair Pro includes the Basic consumer-loan workflow and adds support for mortgage loan categories, officer roles, Officer Lane Fairness, file-based loan import, fairness audit reporting, EOM reporting when available, and fairness simulation up to 60 business days.

## Loan Categories

Pro supports:

- Consumer loans
- Mortgage loans

Consumer loan examples include Auto, Personal, Credit Card, and Collateralized.

Mortgage loan examples may include First Mortgage, Home Refinance, HELOC, or other configured mortgage-related loan types.

## Officer Roles

Pro supports lane-aware officer roles:

- **Consumer**: eligible for consumer loans.
- **Mortgage**: eligible for mortgage loans.
- **Flex**: eligible for both consumer and mortgage loans.

Officer setup should reflect the credit union's actual assignment policy.

## Configuring Officers

When adding or editing officers:

1. Enter the officer name.
2. Choose the appropriate role or class.
3. Configure mortgage/flex behavior if applicable.
4. Confirm vacation or inactive status if supported for the current workflow.
5. Save the officer.

Flex officers can support both lanes and may use configured focus weights depending on the selected officer setup.

## Configuring Loan Types

Loan types should be assigned to the correct category:

- Consumer
- Mortgage

Correct categorization matters because Officer Lane Fairness uses category and officer eligibility to decide who can receive each loan.

The Recommended Fairness Model also uses these categories. Custom loan types should be assigned the correct Consumer or Mortgage category so the recommendation can reflect the actual entered or imported loan mix.

If loans are imported before officers are configured, the recommendation card can provide preliminary loan-mix guidance. The final recommendation requires active officer roles to be loaded or configured.

## Officer Lane Fairness

Officer Lane Fairness accounts for Consumer/Mortgage role eligibility. The app assigns each loan only to an eligible officer and then evaluates fairness within the applicable officer pool and lane-aware context.

This helps avoid comparing officers unfairly when some officers are not eligible for certain loan categories.

## Running Assignments

1. Select the working folder.
2. Confirm officers and roles.
3. Confirm loan types and categories.
4. Enter the current loans manually or import a loan file.
5. Choose the appropriate fairness model.
6. Run the assignment.
7. Review the generated PDF and fairness audit.

## File-Based Loan Import

Pro supports user-driven file import for loan data, such as importing a CSV export from an approved source. The import workflow should be treated as a file-based operational step, not a live system integration.

When importing:

1. Select the loan file.
2. Review detected headers.
3. Map the loan ID, amount, and loan type columns.
4. Preview the import results.
5. Confirm the import only after validating the preview.

Imported loans still use the configured loan types and categories. They remain subject to duplicate loan prevention, assignment validation, and the selected fairness engine before any assignments are generated.

Imported files with mortgage-like loan type names, such as Second Mortgage, Home Equity, HELOC, Refi, or First Mortgage, can influence the Recommended Fairness Model even before a custom type is fully configured. Review the preview and loan type category before assignment.

## PDF and Fairness Audit Output

Pro reports may include:

- app version and active tier
- generated timestamp
- fairness engine used
- assignments by loan
- assignments by officer
- lane-aware fairness audit details
- running totals
- distribution snapshots when available

## End-of-Month Reporting

If EOM reporting is enabled for the package, Pro can generate month-end reporting and archive current monthly tracking. Confirm the retention process with management and IT before using EOM closeout in production.

## Simulation

Pro includes fairness simulation up to 60 business days. Simulations are intended for validation, training, and policy review. They do not modify production assignment history.

Platinum is intended to allow unlimited simulation subject to normal input validation.

## What Pro Does Not Include

Pro does not include:

- automated LOS/LMS integration
- scheduled or live loan data sync
- live API/webhook assignment runs
- backend database persistence
- centralized user authentication
- direct SharePoint upload unless separately integrated
- unlimited simulation
- Platinum custom integration workflows

## Fairness Review

For REVIEW status runs, LendingFair evaluates additional assignment attempts and selects the best available assignment. If the selected attempt remains REVIEW, manager confirmation is required before final save and report generation. Confirmed REVIEW assignments are captured in fairness audit metadata.
