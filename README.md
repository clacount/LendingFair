# Loan Randomizer

This is a simple local web app for assigning loans to loan officers using fair random distribution.

## How to use
1. Download and unzip the project.
2. Open `index.html` in a current version of Microsoft Edge or Google Chrome.
3. Click **Choose Output Folder** and pick the folder where audit PDFs and the loan officer history CSV should be saved.
4. The app reads `loan-randomizer-running-totals.csv` from that folder and loads the loan officers if the file already exists.
5. If the CSV does not exist yet, the app creates it and you can enter the initial loan officers manually.
6. Enter each loan name or ID, its **Amount Requested**, and its **Loan Type**.
7. Click **Randomize Assignments**.

Each run creates a PDF named like `Loan-Randomized-Results-2026-04-14-091530.pdf` in the selected folder. The PDF includes the timestamp, the total loan officers and loans entered, plus both **Assignments by Loan** and **Assignments by Officer** so managers can review every run.

The app also keeps a CSV state file named `loan-randomizer-running-totals.csv` in that same output folder. It stores running totals by officer, including loan count, dollar amount, and loan types already assigned, so the next run can keep balancing from prior history and restore the loan officer list when the app is reopened.

## Rule behavior
- You can use **any number of loan officers**.
- You must have **at least 1 loan officer**.
- Each loan is assigned to **one** officer.
- Each loan must have a type of **Auto**, **Personal**, **Credit Card**, or **Internet**.
- Each loan should include an **Amount Requested**.
- The app groups loans by type and **shuffles each type separately**.
- Then it assigns each type in **random fair rounds**:
  - everyone gets one Auto before anyone gets a second Auto
  - everyone gets one Personal before anyone gets a second Personal
  - everyone gets one Credit Card before anyone gets a second Credit Card
  - everyone gets one Internet before anyone gets a second Internet
  - and so on within each type
- When there is a tie inside a type, the app breaks it by choosing the officer with the **lightest total requested dollars**, then the **lightest total loan count**, which helps keep both volume and dollars fair.
- Running totals are loaded from the CSV state file before each assignment so fairness can continue across multiple sessions instead of only the current screen.
- If one officer's running dollar total is far ahead, the app temporarily prioritizes the lower-total officers until they reach at least **50%** of that highest dollar total.
- Officers who are missing from a single day's run are still kept in the CSV history so their prior totals are not lost.

## Examples
- **1 loan, 3 officers**: the single loan goes to one random officer.
- **2 loans, 3 officers**: two different officers get one each.
- **4 Auto loans, 4 officers**: each officer gets one Auto loan.
- **5 Personal loans, 2 officers**: one officer gets 3 Personal and the other gets 2 Personal, at random.
- **3 Auto, 1 Credit Card, 1 Internet with 3 officers**: each officer gets one Auto first, then the Credit Card and Internet go to two different officers because the app favors the lightest total load.
- **3 Auto loans of different sizes**: the larger Auto requests are placed first so the dollar totals stay as even as possible while the type stays fair.
- **7 mixed loans, 3 officers**: each type stays balanced separately while the total workload is kept as even as possible.

## Notes
- Loan officer names must be unique so totals display correctly.
- Amount Requested must be a valid non-negative number for every entered loan.
- Folder selection and direct PDF saving require a browser with the File System Access API.
- The CSV running-totals file is stored in the selected output folder and is reused the next time that folder is selected.
- No install is needed.
- This runs fully in the browser and can be shared as files.
