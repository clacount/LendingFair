# Pilot Release Checklist

Use this checklist before sharing a pilot build with a credit union.

## Basic Tier QA

- [ ] Basic customer mode loads with the product label showing Basic.
- [ ] Internal Tier Mode is hidden in Basic customer mode.
- [ ] Basic customer mode with a missing license blocks new operational actions.
- [ ] Basic customer mode with an active local license allows permitted Basic actions.
- [ ] Basic customer mode reads `lendingfair-license.json` from the selected working folder.
- [ ] Basic customer mode with an expired license blocks assignments/imports/edits but does not delete data.
- [ ] Basic assignment run completes with consumer loans.
- [ ] Basic allows Global Fairness with Auto, Personal, Credit Card, and Collateralized loans.
- [ ] Basic blocks mortgage loan support.
- [ ] Basic blocks Officer Lane Fairness.
- [ ] Basic blocks multiple officer roles such as Mortgage and Flex.
- [ ] Basic hides or blocks file-based loan import.
- [ ] Basic blocks simulation access.
- [ ] Basic generated PDF includes app version and active tier.
- [ ] Basic running totals persist after app reload.
- [ ] Basic duplicate loan prevention blocks a repeated loan ID.

## Pro Tier QA

- [ ] Pro customer mode loads with the product label showing Pro.
- [ ] Internal Tier Mode is hidden in Pro customer mode.
- [ ] Pro customer mode with a missing license blocks new operational actions.
- [ ] Pro customer mode with an active local license allows permitted Pro actions.
- [ ] Pro customer mode reads `lendingfair-license.json` from the selected working folder.
- [ ] Pro customer mode with an expired license blocks assignments/imports/edits but does not delete data.
- [ ] Updating the Base64 local license (paste/import) overwrites `lendingfair-license.json`, renews access, and refreshes the active tier/status display.
- [ ] Pro Global Fairness can be selected.
- [ ] Pro Officer Lane Fairness can be selected.
- [ ] Pro consumer loan run completes.
- [ ] Pro mortgage run completes.
- [ ] Pro role-aware run completes with Consumer, Mortgage, and Flex officers.
- [ ] Pro file-based loan import is available.
- [ ] Pro import preview and confirm flow works.
- [ ] Imported loans still generate valid assignments and PDFs.
- [ ] Duplicate loan prevention still works for imported loans.
- [ ] Pro simulation allows 60 business days.
- [ ] Pro simulation above 60 business days is blocked.
- [ ] Pro generated PDF includes app version and active tier.
- [ ] Pro EOM report works if available in the package.

## Platinum Verification, If Testing

- [ ] Platinum simulation above 60 business days is allowed, subject to existing validation.
- [ ] Platinum-only controls are available as expected.
- [ ] Platinum generated reports include app version and active tier.

## Persistence and Reporting

- [ ] Duplicate loan prevention works.
- [ ] Assignment PDF generation works.
- [ ] CSV persistence works after app reload.
- [ ] Monthly folder is created/used correctly.
- [ ] EOM report works if available.
- [ ] Version appears in UI footer.
- [ ] Version appears in assignment report.
- [ ] Version appears in EOM/custom/simulation reports when generated.
- [ ] Support package export downloads locally and includes app version, active tier, license status, and missing-file notes.

## Customer Configuration

- [ ] Customer config locks the intended tier.
- [ ] Installed license tier is authoritative over customer config tier when present.
- [ ] Customer config overrides any saved development/localStorage tier.
- [ ] Internal Tier Mode is hidden in customer mode.
- [ ] Demo controls are hidden in customer mode unless explicitly enabled.
- [ ] Invalid or missing customer tier fails closed and shows a configuration error.
- [ ] Customer name appears if configured.

## Pilot Handoff

- [ ] Customer has received the Getting Started guide.
- [ ] Customer has received the Basic or Pro user guide.
- [ ] Customer has reviewed the Fairness Methodology.
- [ ] Customer has reviewed Known Limitations.
- [ ] Customer understands pilot license expiration/renewal process.
- [ ] Customer has agreed to pilot scope and review cadence.
