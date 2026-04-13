# Loan Randomizer

This is a simple local web app for assigning loans to loan officers using fair random distribution.

## How to use
1. Download and unzip the project.
2. Open `index.html` in any modern browser.
3. Enter your loan officer names.
4. Enter your loan names or IDs.
5. Click **Randomize Assignments**.

## Rule behavior
- You can use **any number of loan officers**.
- You must have **at least 1 loan officer**.
- Each loan is assigned to **one** officer.
- The app first **shuffles the loans**.
- Then it assigns them in **random fair rounds**:
  - everyone gets one before anyone gets a second
  - everyone gets two before anyone gets a third
  - everyone gets three before anyone gets a fourth
  - and so on

## Examples
- **1 loan, 3 officers**: the single loan goes to one random officer.
- **2 loans, 3 officers**: two different officers get one each.
- **5 loans, 4 officers**: each officer gets one, then one random officer gets the fifth.
- **5 loans, 2 officers**: one officer gets 3 and the other gets 2, at random.
- **7 loans, 3 officers**: each officer gets two before one random officer gets the seventh.

## Notes
- Loan officer names must be unique so totals display correctly.
- No install is needed.
- This runs fully in the browser and can be shared as files.
