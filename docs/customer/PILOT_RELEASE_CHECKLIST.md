# Pilot Release Checklist

Use this checklist before sharing a pilot build with a credit union.

## Basic Tier QA

- [ ] Basic assignment run completes with consumer loans.
- [ ] Basic blocks mortgage loan support.
- [ ] Basic blocks Officer Lane Fairness.
- [ ] Basic blocks simulation access.
- [ ] Basic generated PDF includes app version and active tier.
- [ ] Basic running totals persist after app reload.

## Pro Tier QA

- [ ] Pro mortgage run completes.
- [ ] Pro role-aware run completes with Consumer, Mortgage, and Flex officers.
- [ ] Pro Officer Lane Fairness can be selected.
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

## Customer Configuration

- [ ] Customer config locks the intended tier.
- [ ] Internal Tier Mode is hidden in customer mode.
- [ ] Demo controls are hidden in customer mode unless explicitly enabled.
- [ ] Invalid or missing customer tier fails closed and shows a configuration error.
- [ ] Customer name appears if configured.

## Pilot Handoff

- [ ] Customer has received the Getting Started guide.
- [ ] Customer has received the Basic or Pro user guide.
- [ ] Customer has reviewed the Fairness Methodology.
- [ ] Customer has reviewed Known Limitations.
- [ ] Customer has agreed to pilot scope and review cadence.
