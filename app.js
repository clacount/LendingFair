const officerList = document.getElementById('officerList');
const loanList = document.getElementById('loanList');
const addOfficerBtn = document.getElementById('addOfficerBtn');
const addLoanBtn = document.getElementById('addLoanBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const messageEl = document.getElementById('message');
const loanAssignmentsEl = document.getElementById('loanAssignments');
const officerAssignmentsEl = document.getElementById('officerAssignments');

function createInputRow(type, value = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'officer' ? 'Loan officer name' : 'Loan name or ID';
  input.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.className = 'remove-btn';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

function addOfficer(value = '') {
  officerList.appendChild(createInputRow('officer', value));
}

function addLoan(value = '') {
  loanList.appendChild(createInputRow('loan', value));
}

function getValues(container) {
  return [...container.querySelectorAll('input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseRandom(items, count) {
  return shuffle(items).slice(0, count);
}

function assignLoans(officers, loans) {
  const cleanOfficers = [...new Set(officers.map((name) => name.trim()).filter(Boolean))];
  const cleanLoans = loans.map((loan) => loan.trim()).filter(Boolean);

  const loanCount = cleanLoans.length;
  const officerCount = cleanOfficers.length;

  if (officerCount < 1) {
    return { error: 'Please add at least one loan officer.' };
  }

  if (officerCount !== officers.length) {
    return { error: 'Loan officer names must be unique so assignments are tracked correctly.' };
  }

  if (!loanCount) {
    return { error: 'Please add at least one loan.' };
  }

  const officerAssignments = {};
  cleanOfficers.forEach((officer) => {
    officerAssignments[officer] = [];
  });

  const loanAssignments = [];
  const shuffledLoans = shuffle(cleanLoans);

  // Build randomized assignment slots in fair rounds.
  // Example with 2 officers and 5 loans:
  // round 1 => [Ashley, Jade] in random order
  // round 2 => [Ashley, Jade] in new random order
  // round 3 => [Ashley] or [Jade] depending on the random order
  const assignmentSlots = [];
  while (assignmentSlots.length < loanCount) {
    assignmentSlots.push(...shuffle(cleanOfficers));
  }

  const selectedSlots = assignmentSlots.slice(0, loanCount);

  shuffledLoans.forEach((loan, index) => {
    const assignedOfficer = selectedSlots[index];
    officerAssignments[assignedOfficer].push(loan);
    loanAssignments.push({
      loan,
      officers: [assignedOfficer],
      shared: false
    });
  });

  return { loanAssignments, officerAssignments };
}

function renderResults(result) {
  if (result.error) {
    messageEl.textContent = result.error;
    loanAssignmentsEl.className = 'results empty';
    officerAssignmentsEl.className = 'results empty';
    loanAssignmentsEl.textContent = 'No assignments yet.';
    officerAssignmentsEl.textContent = 'No assignments yet.';
    return;
  }

  messageEl.textContent = '';

  loanAssignmentsEl.className = 'results';
  officerAssignmentsEl.className = 'results';

  loanAssignmentsEl.innerHTML = '';
  officerAssignmentsEl.innerHTML = '';

  result.loanAssignments.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'loan-line';

    if (entry.shared) {
      div.innerHTML = `
        <div><span class="assignment-name">${escapeHtml(entry.loan)}</span></div>
        <div class="shared">Shared across: ${entry.officers.map(escapeHtml).join(', ')}</div>
      `;
    } else {
      div.innerHTML = `
        <div><span class="assignment-name">${escapeHtml(entry.loan)}</span></div>
        <div>Assigned to: ${escapeHtml(entry.officers[0])}</div>
      `;
    }

    loanAssignmentsEl.appendChild(div);
  });

  Object.entries(result.officerAssignments).forEach(([officer, assignedLoans]) => {
    const group = document.createElement('div');
    group.className = 'result-group';

    const badge = `<span class="badge">${assignedLoans.length} assigned</span>`;
    group.innerHTML = `<h3>${escapeHtml(officer)} ${badge}</h3>`;

    if (!assignedLoans.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No loans assigned.';
      group.appendChild(empty);
    } else {
      assignedLoans.forEach((loan) => {
        const pill = document.createElement('span');
        pill.className = 'loan-pill';
        pill.textContent = loan;
        group.appendChild(pill);
      });
    }

    officerAssignmentsEl.appendChild(group);
  });
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

addOfficerBtn.addEventListener('click', () => addOfficer());
addLoanBtn.addEventListener('click', () => addLoan());

randomizeBtn.addEventListener('click', () => {
  const officers = getValues(officerList);
  const loans = getValues(loanList);
  const result = assignLoans(officers, loans);
  renderResults(result);
});

sampleBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';

  ['Alex', 'Brooke', 'Chris', 'Dana'].forEach(addOfficer);
  ['Loan 101', 'Loan 102', 'Loan 103', 'Loan 104', 'Loan 105'].forEach(addLoan);

  const result = assignLoans(getValues(officerList), getValues(loanList));
  renderResults(result);
});

clearBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  messageEl.textContent = '';
  loanAssignmentsEl.className = 'results empty';
  officerAssignmentsEl.className = 'results empty';
  loanAssignmentsEl.textContent = 'No assignments yet.';
  officerAssignmentsEl.textContent = 'No assignments yet.';
  addOfficer();
  addOfficer();
  addOfficer();
  addOfficer();
});

addOfficer('Loan Officer 1');
addOfficer('Loan Officer 2');
addOfficer('Loan Officer 3');
addOfficer('Loan Officer 4');
addLoan('Loan A');
addLoan('Loan B');
