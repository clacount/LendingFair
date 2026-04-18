# Loan Randomizer

## Provided for internal testing and security review only.

This is a simple local web app for assigning loans to loan officers using fair random distribution.

## How to use
1. Download and unzip the project.
2. Open `index.html` in a current version of Microsoft Edge or Google Chrome.
3. Click **Connect Output Folder** and pick the parent folder where monthly loan-randomizer data should be saved.
4. The app automatically creates/uses a monthly subfolder in `YYYY-MM` format (for example, `2026-04`) and reads `loan-randomizer-running-totals.csv` from that month.
5. If the CSV does not exist yet for the active month, the app creates it and you can enter the initial loan officers manually.
6. On supported browsers, the app remembers your approved folder and tries to reconnect on next launch so you do not have to pick it each time.
7. Enter each loan name or ID, its **Amount Requested**, and its **Loan Type**.
8. Click **Run Fair Assignment**.

Each run creates a PDF named like `Loan-Randomized-Results-2026-04-14-091530.pdf` in the active monthly `YYYY-MM` subfolder. The PDF includes the timestamp, the total loan officers and loans entered, plus both **Assignments by Loan** and **Assignments by Officer** so managers can review every run.

The app also keeps a CSV state file named `loan-randomizer-running-totals.csv` in that same monthly subfolder. It stores running totals by officer, including loan count, dollar amount, and loan types already assigned, so the next run can keep balancing from prior history and restore the loan officer list when the app is reopened.

## Rule behavior
- You can use **any number of loan officers**.
- You must have **at least 1 loan officer**.
- Each loan is assigned to **one** officer.
- Each loan must have a type of **Auto**, **Personal**, **Credit Card**, or **Collateralized**.
- Each loan should include an **Amount Requested**.
- **Credit Card** loans are tracked by unit count and type, but their dollar amounts do not count toward goal-dollar balancing.
- The app groups loans by type and **shuffles each type separately**.
- Then it assigns each type in **random fair rounds**:
  - everyone gets one Auto before anyone gets a second Auto
  - everyone gets one Personal before anyone gets a second Personal
  - everyone gets one Credit Card before anyone gets a second Credit Card
  - everyone gets one Collateralized before anyone gets a second Collateralized
  - and so on within each type
- Within each type, the app compares a **balanced fairness score** that blends type distribution, goal-dollar distribution, and loan-count distribution, then chooses the assignment that leaves the team most even overall.
- Running totals are loaded from the CSV state file before each assignment so fairness can continue across multiple sessions instead of only the current screen.
- Officers who are missing from a single day's run are still kept in the CSV history so their prior totals are not lost.
- Fairness comparisons are normalized by each officer's **active sessions**, so someone returning from vacation is not automatically pushed into aggressive catch-up assignments.

## Examples
- **1 loan, 3 officers**: the single loan goes to one random officer.
- **2 loans, 3 officers**: two different officers get one each.
- **4 Auto loans, 4 officers**: each officer gets one Auto loan.
- **5 Personal loans, 2 officers**: one officer gets 3 Personal and the other gets 2 Personal, at random.
- **3 Auto, 1 Credit Card, 1 Collateralized with 3 officers**: each officer gets one Auto first, then the Credit Card and Collateralized loans go to two different officers because the app favors the lightest total load.
- **3 Auto loans of different sizes**: the larger Auto requests are placed first so the dollar totals stay as even as possible while the type stays fair.
- **7 mixed loans, 3 officers**: each type stays balanced separately while the total workload is kept as even as possible.

## Notes
- Loan officer names must be unique so totals display correctly.
- Amount Requested must be a valid non-negative number for every entered loan.
- Folder selection and direct PDF saving require a browser with the File System Access API.
- The CSV running-totals file is stored in the active `YYYY-MM` subfolder under the selected output folder and is reused the next time that folder is selected during that month.
- No install is needed.
- This runs fully in the browser and can be shared as files.

## Teams / SharePoint hosting notes
- If this app is opened *inside* a SharePoint/Teams page frame, folder-picker APIs may be blocked by browser/embed security settings.
- Recommended flow: open the app directly in Edge/Chrome (not embedded), then select a local OneDrive-synced folder that maps to the SharePoint document library.
- For true direct save to SharePoint without local folder selection, this app would need Microsoft Graph integration (authentication + upload API calls), which is not implemented in this local-file version.

## Graph auth/upload stub (for IT integration planning)
- A starter scaffold is included in `graph-sharepoint-stub.js`.
- The stubs expose `window.loanRandomizerGraphStubs` with:
  - `buildGraphDriveUploadUrl(...)`
  - `getGraphIntegrationChecklist()`
  - `getAccessTokenWithPkceStub()`
  - `uploadFileToSharePointStub(...)`
- This scaffold is intentionally non-functional for production auth/upload. It is a safe handoff point for IT/dev teams to wire tenant-specific Microsoft Graph auth and library upload logic.
- For a non-programmer rollout checklist, use `GRAPH-SETUP-EILI5.md`.


## New history and PDF features
- Generated PDFs now include a Fairness Audit section.
- Generated PDFs now include every officer's running totals for that run.
- Loan names and IDs are tracked in `loan-randomizer-loan-history.csv`.
- A loan cannot be entered again in a later session if it already exists in loan history.
- A **Remove Loan Number** button lets the user remove a loan from history when needed.
