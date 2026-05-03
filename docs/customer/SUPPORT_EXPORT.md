# Support Export

LendingFair includes a local-only **Export Support Package** action for Basic, Pro, and Platinum pilots. Use it when a customer or support contact needs the key files for one active month without manually searching through the working folder.

## What It Creates

The export downloads a JSON support package to the browser downloads folder. It does not upload anything and does not send files to LendingFair automatically.

The package includes:

- app name, version, release channel, and build date
- active tier
- license status, license type, and expiration date when available
- selected fairness engine
- customer mode and customer name, if configured
- export timestamp
- browser user agent
- active month folder key or demo context
- available running totals file content
- available loan history file content
- available loan type configuration
- simulation history only when the current tier allows simulation
- recent generated PDF report filenames when the browser can enumerate them
- a missing-file list for expected files that were not found

## Privacy Reminder

The support package may include loan IDs, officer names, and assignment history from the selected month. Only share it with authorized support contacts under the credit union's approved process.

## When To Use It

Use a support export when:

- assignments or running totals need review
- duplicate loan history needs troubleshooting
- a generated report needs to be matched to source CSV data
- Basic/Pro tier behavior needs validation
- support needs app version, tier, and license metadata for a pilot

## What It Does Not Do

The support export does not:

- upload files to a backend
- email files
- collect data silently
- include browser storage secrets
- bypass tier entitlements
- create a database backup

If support needs generated PDFs, attach the relevant PDFs from the active monthly folder along with the support package.
