# LendingFair Implementation Checklist

Use this checklist before piloting or deploying LendingFair Basic or Pro.

## Tier and Scope

- [ ] Confirm selected tier: Basic or Pro.
- [ ] Confirm departments in scope.
- [ ] Confirm whether only consumer loans are included.
- [ ] Confirm whether mortgage loans are included.
- [ ] Confirm whether HELOC loans are included.
- [ ] Confirm whether simulation is needed during pilot validation.

## Loan Types

- [ ] Confirm all consumer loan types.
- [ ] Confirm all mortgage loan types, if using Pro.
- [ ] Confirm whether Credit Card loans are count-based or amount-based.
- [ ] Confirm whether any loan types should be inactive or seasonal.
- [ ] Confirm loan type names match operational terminology.

## Officers

- [ ] Confirm full officer list.
- [ ] Confirm officer names are spelled consistently.
- [ ] Confirm officer roles.
- [ ] Confirm Consumer officers.
- [ ] Confirm Mortgage officers.
- [ ] Confirm Flex officers.
- [ ] Confirm vacation/inactive handling policy.

## Fairness Engine

- [ ] Confirm Global Fairness for Basic.
- [ ] Confirm whether Pro should use Global Fairness or Officer Lane Fairness.
- [ ] Confirm lane/role fairness assumptions with management.
- [ ] Sign off on fairness methodology.

## Working Folder and Retention

- [ ] Confirm output folder location.
- [ ] Confirm monthly folder behavior.
- [ ] Confirm who can access the folder.
- [ ] Confirm PDF retention process.
- [ ] Confirm CSV/JSON retention process.
- [ ] Confirm backup or OneDrive/SharePoint sync process if applicable.

## Operators

- [ ] Confirm who can run assignments.
- [ ] Confirm who reviews reports.
- [ ] Confirm who handles correction or exception cases.
- [ ] Confirm how duplicate loan warnings are handled.

## Validation

- [ ] Run a sample Basic month if using Basic.
- [ ] Run a sample Pro month if using Pro.
- [ ] Confirm output PDFs are acceptable.
- [ ] Confirm running totals persist after reload.
- [ ] Confirm duplicate loan prevention behavior.
- [ ] Confirm EOM reporting behavior if available.
- [ ] Confirm tier lock/customer config behavior.
- [ ] Confirm app version appears in UI and generated reports.

## Sign-Off

- [ ] Lending team sign-off.
- [ ] Operations/management sign-off.
- [ ] IT/security review if using shared folders or synced storage.
- [ ] Pilot start date confirmed.
- [ ] Pilot review date confirmed.
