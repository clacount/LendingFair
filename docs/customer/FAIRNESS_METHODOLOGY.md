# Fairness Methodology

## Plain-English Summary

LendingFair assigns each loan to one eligible officer. The assignment is based on configured eligibility rules and fairness balancing across the current loans and prior running totals.

The goal is to make assignment decisions more consistent, transparent, and reviewable.

## What the App Balances

LendingFair considers factors such as:

- loan type mix
- loan count
- goal-dollar totals
- officer eligibility
- historical running totals
- active/vacation status when supported

The app uses prior running totals from the selected monthly folder so fairness can continue across multiple assignment sessions.

## Credit Card / Count-Based Loans

Credit Card loans may be count-based or amount-excluded depending on the configured loan type behavior. In that setup, Credit Card loans still count as assigned opportunities, but their dollar amount may not contribute to goal-dollar balancing.

## Running Totals

Running totals are stored in the selected working folder and active monthly subfolder. They help LendingFair avoid treating each run as a blank slate.

Running totals can include:

- officer loan counts
- total assigned goal dollars
- loan type counts
- active sessions

## Global Fairness

Global Fairness compares the active officers as one shared assignment pool. This is the Basic model and is best suited for consumer-loan workflows where all included officers can receive the same kinds of loans.

## Officer Lane Fairness

Officer Lane Fairness accounts for Consumer/Mortgage role eligibility.

For example:

- Consumer officers receive consumer loans.
- Mortgage officers receive mortgage loans.
- Flex officers can support both lanes.

This prevents officers from being measured unfairly against work they are not eligible to receive.

## Recommended Fairness Model

The Recommended Fairness Model considers both the active officer setup and the current entered or imported loan mix. If mortgage-category loans are present and the active officer pool has Consumer, Mortgage, or Flex lane separation, the app may recommend Officer Lane Fairness.

If loans are imported before officers are configured, LendingFair can show preliminary loan-mix guidance. This preview can flag mortgage or mixed consumer/mortgage products, but the final recommendation requires the active officer roles to be loaded or configured.

If mortgage loans are present but all active officers share the same coverage pattern, Global Fairness may still be appropriate because the officers are being compared against the same eligible work.

Custom loan types should be assigned the correct Consumer or Mortgage category. File-imported loans with mortgage-like type names, such as Second Mortgage, Home Equity, HELOC, Refi, First Mortgage, real estate, construction loan, or land loan, can influence the recommendation.

## Flex Officers

Flex officers can be configured to support both consumer and mortgage lanes. Depending on the configured policy, flex officers may have focus weights or routing behavior that reflects whether they primarily support consumer or mortgage work.

## Vacation / Inactive Handling

When vacation or inactive handling is used, LendingFair can exclude unavailable officers from current assignment while preserving their prior totals. This helps avoid forcing catch-up behavior when an officer returns.

## Policy Role

LendingFair is intended to reduce perceived bias and improve consistency. It does not replace management policy.

The credit union should review and approve its own assignment policy, including:

- which loans are in scope
- which officers are eligible
- how mortgage and HELOC loans should be handled
- how vacations or inactive officers should be treated
- how reports should be reviewed and retained

## Disclaimer

LendingFair provides an auditable assignment recommendation based on configured rules and available data. The credit union remains responsible for reviewing, approving, and maintaining its own loan assignment policy.

## Fairness Review Workflow

When an initial assignment returns **REVIEW**, LendingFair runs a capped set of additional assignment attempts using the same inputs and selects the **best available assignment**.

- PASS on initial attempt: saves normally.
- REVIEW on initial attempt: runs additional assignment attempts.
- If a PASS is found: that PASS is selected and saved.
- If all attempts remain REVIEW: **manager confirmation required** before save/report generation.

This workflow improves review discipline and transparency; it does not hide REVIEW outcomes.
