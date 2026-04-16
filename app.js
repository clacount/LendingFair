const officerList = document.getElementById('officerList');
const loanList = document.getElementById('loanList');
const addOfficerBtn = document.getElementById('addOfficerBtn');
const importPriorMonthBtn = document.getElementById('importPriorMonthBtn');
const addLoanBtn = document.getElementById('addLoanBtn');
const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const endOfMonthBtn = document.getElementById('endOfMonthBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const removeLoanHistoryBtn = document.getElementById('removeLoanHistoryBtn');
const messageEl = document.getElementById('message');
const outputStepEl = document.getElementById('outputStep');
const outputStepCompactEl = document.getElementById('outputStepCompact');
const outputStepDetailsEl = document.getElementById('outputStepDetails');
const folderStatusEl = document.getElementById('folderStatus');
const folderPromptEl = document.getElementById('folderPrompt');
const loanAssignmentsEl = document.getElementById('loanAssignments');
const officerAssignmentsEl = document.getElementById('officerAssignments');
const fairnessAuditEl = document.getElementById('fairnessAudit');

let outputDirectoryHandle = null;
const LOAN_TYPES = ['Collateralized', 'Credit Card', 'Personal'];
const RUNNING_TOTALS_FILE_NAME = 'loan-randomizer-running-totals.csv';
const LOAN_HISTORY_FILE_NAME = 'loan-randomizer-loan-history.csv';

function setOfficerVacationState(row, isOnVacation) {
  row.dataset.active = String(!isOnVacation);

  const vacationBtn = row.querySelector('.vacation-btn');
  if (vacationBtn) {
    vacationBtn.textContent = isOnVacation ? 'Return' : 'Vacation';
    vacationBtn.dataset.state = isOnVacation ? 'vacation' : 'active';
  }

  row.classList.toggle('officer-on-vacation', isOnVacation);
}

function syncLoanAmountInput(typeSelect, amountInput) {
  const isCreditCard = typeSelect.value === 'Credit Card';

  amountInput.disabled = isCreditCard;
  amountInput.dataset.mode = isCreditCard ? 'unit' : 'amount';
  amountInput.placeholder = isCreditCard ? 'Per unit - not required' : 'Amount requested';

  if (isCreditCard) {
    amountInput.value = '';
  }
}

function createInputRow(type, value = '', loanType = LOAN_TYPES[0], amount = '', isOnVacation = false) {
  const row = document.createElement('div');
  row.className = type === 'loan' ? 'row loan-row' : 'row officer-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'officer' ? 'Loan officer name' : 'Loan name or ID';
  input.value = value;
  input.required = type === 'loan';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.className = 'remove-btn';
  removeBtn.addEventListener('click', () => row.remove());

  if (type === 'loan') {
    const typeSelect = document.createElement('select');
    typeSelect.className = 'loan-type-select';
    typeSelect.setAttribute('aria-label', 'Loan type');

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'loan-amount-input';
    amountInput.placeholder = 'Amount requested';
    amountInput.min = '0';
    amountInput.step = '0.01';
    amountInput.setAttribute('aria-label', 'Amount requested');
    amountInput.value = amount;

    LOAN_TYPES.forEach((typeOption) => {
      const option = document.createElement('option');
      option.value = typeOption;
      option.textContent = typeOption;
      option.selected = typeOption === loanType;
      typeSelect.appendChild(option);
    });

    typeSelect.addEventListener('change', () => {
      syncLoanAmountInput(typeSelect, amountInput);
    });

    row.appendChild(input);
    row.appendChild(amountInput);
    row.appendChild(typeSelect);
    row.appendChild(removeBtn);
    syncLoanAmountInput(typeSelect, amountInput);
    return row;
  }

  row.dataset.active = 'true';

  const vacationBtn = document.createElement('button');
  vacationBtn.type = 'button';
  vacationBtn.className = 'vacation-btn';
  vacationBtn.addEventListener('click', async () => {
    const isCurrentlyActive = row.dataset.active !== 'false';
    setOfficerVacationState(row, isCurrentlyActive);

    if (!outputDirectoryHandle) {
      return;
    }

    try {
      const { runningTotals } = await loadRunningTotals();
      await saveRunningTotals(buildRunningTotalsWithCurrentOfficerStatuses(runningTotals));
    } catch (error) {
      setMessage(`Could not save vacation status: ${error.message}`, 'warning');
    }
  });

  row.appendChild(input);
  row.appendChild(vacationBtn);
  row.appendChild(removeBtn);

  setOfficerVacationState(row, isOnVacation);
  return row;
}

function addOfficer(value = '', isOnVacation = false) {
  officerList.appendChild(createInputRow('officer', value, LOAN_TYPES[0], '', isOnVacation));
}

function addLoan(value = '', loanType = LOAN_TYPES[0], amount = '') {
  loanList.appendChild(createInputRow('loan', value, loanType, amount));
}

function getOfficerValues() {
  return [...officerList.querySelectorAll('.officer-row')]
    .filter((row) => row.dataset.active !== 'false')
    .map((row) => row.querySelector('input').value.trim())
    .filter(Boolean);
}

function getLoanValues() {
  return [...loanList.querySelectorAll('.loan-row')]
    .map((row) => {
      const nameInput = row.querySelector('input');
      const amountInput = row.querySelector('.loan-amount-input');
      const typeSelect = row.querySelector('select');
      const amountValue = amountInput.value.trim();

      return {
        name: nameInput.value.trim(),
        type: typeSelect.value,
        amountRequested: typeSelect.value === 'Credit Card'
          ? 0
          : amountValue === ''
            ? null
            : Number(amountValue)
      };
    })
    .filter((loan) => loan.name);
}

function getLoanRowValidationError() {
  const loanRows = [...loanList.querySelectorAll('.loan-row')];

  if (!loanRows.length) {
    return '';
  }

  const seenLoanNames = new Set();

  for (const row of loanRows) {
    const loanName = row.querySelector('input').value.trim();

    if (!loanName) {
      return 'Each loan row must include a Loan Name / ID.';
    }

    const normalizedLoanName = loanName.toLowerCase();
    if (seenLoanNames.has(normalizedLoanName)) {
      return `Loan ${loanName} is already entered on this screen.`;
    }

    seenLoanNames.add(normalizedLoanName);
  }

  return '';
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

function setMessage(text = '', tone = 'warning') {
  messageEl.textContent = text;
  messageEl.dataset.tone = text ? tone : '';
}

function supportsFolderSelection() {
  return typeof window.showDirectoryPicker === 'function';
}

function updateFolderStatus() {
  if (outputDirectoryHandle) {
    folderStatusEl.textContent = `Selected folder: ${outputDirectoryHandle.name}`;
    folderStatusEl.dataset.state = 'ready';
    outputStepEl.dataset.state = 'complete';
    outputStepCompactEl.hidden = false;
    outputStepDetailsEl.hidden = true;
    randomizeBtn.disabled = false;
    randomizeBtn.dataset.state = 'ready';
    return;
  }

  if (!supportsFolderSelection()) {
    folderPromptEl.textContent = 'Folder selection is not supported in this browser. Use a current version of Microsoft Edge or Google Chrome.';
    folderPromptEl.dataset.state = 'error';
    outputStepEl.dataset.state = 'error';
    outputStepCompactEl.hidden = true;
    outputStepDetailsEl.hidden = false;
    randomizeBtn.disabled = true;
    randomizeBtn.dataset.state = 'locked';
    return;
  }

  folderPromptEl.textContent = 'No output folder selected.';
  folderPromptEl.dataset.state = 'idle';
  outputStepEl.dataset.state = 'pending';
  outputStepCompactEl.hidden = true;
  outputStepDetailsEl.hidden = false;
  randomizeBtn.disabled = true;
  randomizeBtn.dataset.state = 'locked';
}

async function ensureDirectoryPermission(directoryHandle) {
  if (typeof directoryHandle.queryPermission !== 'function') {
    return true;
  }

  const options = { mode: 'readwrite' };
  if (await directoryHandle.queryPermission(options) === 'granted') {
    return true;
  }

  return (await directoryHandle.requestPermission(options)) === 'granted';
}

async function chooseOutputFolder() {
  if (!supportsFolderSelection()) {
    setMessage('Choose Output Folder is only available in browsers that support folder access, such as current Microsoft Edge or Google Chrome.', 'warning');
    updateFolderStatus();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const hasPermission = await ensureDirectoryPermission(directoryHandle);

    if (!hasPermission) {
      setMessage('Folder access was not granted. Please choose a folder and allow write access.', 'warning');
      return;
    }

    outputDirectoryHandle = directoryHandle;
    const { runningTotals, fileWasCreated } = await loadRunningTotals();
    await loadLoanHistory();
    const loadedOfficers = populateOfficersFromRunningTotals(runningTotals);
    renderLoadedRunningTotals(runningTotals);
    updateFolderStatus();

    if (loadedOfficers) {
      setMessage(`Output folder selected: ${directoryHandle.name}. Loaded loan officer history from ${RUNNING_TOTALS_FILE_NAME}.`, 'success');
      return;
    }

    if (fileWasCreated) {
      setMessage(`Output folder selected: ${directoryHandle.name}. Created ${RUNNING_TOTALS_FILE_NAME}; enter loan officers to begin tracking history.`, 'success');
      return;
    }

    setMessage(`Output folder selected: ${directoryHandle.name}. ${RUNNING_TOTALS_FILE_NAME} is ready and waiting for loan officers.`, 'success');
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }

    setMessage(`Unable to select an output folder: ${error.message}`, 'warning');
  }
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function buildPdfFileName(date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hours = padNumber(date.getHours());
  const minutes = padNumber(date.getMinutes());
  const seconds = padNumber(date.getSeconds());

  return `Loan-Randomized-Results-${year}-${month}-${day}-${hours}${minutes}${seconds}.pdf`;
}

function buildArchivedRunningTotalsFileName(date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  return `loan-randomizer-running-totals-${year}-${month}.csv`;
}

function buildArchivedRunningTotalsFileNameFromKey(monthKey) {
  return `loan-randomizer-running-totals-${monthKey}.csv`;
}

function getPreviousMonthKey() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function formatDisplayTimestamp(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatLoanLabel(loan) {
  return `${loan.name} (${loan.type}, ${formatCurrency(loan.amountRequested)})`;
}

function getGoalAmountForLoan(loan) {
  return loan.type === 'Credit Card' ? 0 : loan.amountRequested;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(amount);
}

function normalizeLoanHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const loanName = String(entry.loanName ?? '').trim();

  if (!loanName) {
    return null;
  }

  return {
    loanName,
    type: LOAN_TYPES.includes(entry.type) ? entry.type : LOAN_TYPES[0],
    amountRequested: Number.isFinite(entry.amountRequested) && entry.amountRequested >= 0 ? entry.amountRequested : 0,
    assignedOfficer: String(entry.assignedOfficer ?? '').trim(),
    generatedAt: String(entry.generatedAt ?? '').trim()
  };
}

function createEmptyLoanHistory() {
  return { loans: {} };
}

function createEmptyOfficerStats() {
  return {
    isOnVacation: false,
    activeSessionCount: 0,
    loanCount: 0,
    totalAmountRequested: 0,
    typeCounts: Object.fromEntries(LOAN_TYPES.map((loanType) => [loanType, 0]))
  };
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '');

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

function buildLoanHistoryCsv(loanHistory) {
  const rows = [
    'loan_name,type,amount_requested,assigned_officer,generated_at'
  ];

  Object.entries(loanHistory.loans || {})
    .sort(([loanA], [loanB]) => loanA.localeCompare(loanB))
    .forEach(([loanName, entry]) => {
      const normalizedEntry = normalizeLoanHistoryEntry(entry);

      if (!normalizedEntry) {
        return;
      }

      rows.push([
        normalizedEntry.loanName,
        normalizedEntry.type,
        normalizedEntry.amountRequested,
        normalizedEntry.assignedOfficer,
        normalizedEntry.generatedAt
      ].map(escapeCsvValue).join(','));
    });

  return `${rows.join('\n')}\n`;
}

function parseLoanHistoryCsv(csvText) {
  const trimmedText = csvText.trim();

  if (!trimmedText) {
    return createEmptyLoanHistory();
  }

  const [headerLine, ...dataLines] = trimmedText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase());
  const loans = {};

  dataLines.forEach((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const loanName = row.loan_name?.trim();

    if (!loanName) {
      return;
    }

    const entry = normalizeLoanHistoryEntry({
      loanName,
      type: row.type,
      amountRequested: Number(row.amount_requested),
      assignedOfficer: row.assigned_officer,
      generatedAt: row.generated_at
    });

    if (entry) {
      loans[loanName.toLowerCase()] = entry;
    }
  });

  return { loans };
}

function buildRunningTotalsCsv(runningTotals) {
  const rows = [
    'officer,is_on_vacation,active_session_count,loan_count,total_amount_requested,personal_count,credit_card_count,collateralized_count'
  ];

  Object.entries(runningTotals.officers || {})
    .sort(([officerA], [officerB]) => officerA.localeCompare(officerB))
    .forEach(([officer, stats]) => {
      const normalizedStats = normalizeOfficerStats(stats);
      rows.push([
        officer,
        normalizedStats.isOnVacation,
        normalizedStats.activeSessionCount,
        normalizedStats.loanCount,
        normalizedStats.totalAmountRequested,
        normalizedStats.typeCounts.Personal,
        normalizedStats.typeCounts['Credit Card'],
        normalizedStats.typeCounts.Collateralized
      ].map(escapeCsvValue).join(','));
    });

  return `${rows.join('\n')}\n`;
}

function parseRunningTotalsCsv(csvText) {
  const trimmedText = csvText.trim();

  if (!trimmedText) {
    return { officers: {} };
  }

  const [headerLine, ...dataLines] = trimmedText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase());
  const officers = {};

  dataLines.forEach((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const officerName = row.officer?.trim();

    if (!officerName) {
      return;
    }

    officers[officerName] = normalizeOfficerStats({
      isOnVacation: String(row.is_on_vacation).toLowerCase() === 'true',
      activeSessionCount: Number(row.active_session_count ?? (Number(row.loan_count) > 0 || Number(row.total_amount_requested) > 0 ? 1 : 0)),
      loanCount: Number(row.loan_count),
      totalAmountRequested: Number(row.total_amount_requested),
      typeCounts: {
        Personal: Number(row.personal_count),
        'Credit Card': Number(row.credit_card_count),
        Collateralized: Number(row.collateralized_count ?? row.internet_count)
      }
    });
  });

  return { officers };
}

function populateOfficersFromRunningTotals(runningTotals) {
  const officerNames = Object.keys(runningTotals.officers || {}).sort((officerA, officerB) => officerA.localeCompare(officerB));

  officerList.innerHTML = '';

  if (!officerNames.length) {
    addOfficer();
    return false;
  }

  officerNames.forEach((officer) => {
    addOfficer(officer, normalizeOfficerStats(runningTotals.officers?.[officer]).isOnVacation);
  });
  return true;
}

function appendOfficersFromRunningTotals(runningTotals) {
  const officerNames = Object.keys(runningTotals.officers || {}).sort((officerA, officerB) => officerA.localeCompare(officerB));
  const existingOfficerNames = new Set(
    [...officerList.querySelectorAll('.officer-row input')]
      .map((input) => input.value.trim())
      .filter(Boolean)
  );

  if (!existingOfficerNames.size) {
    officerList.innerHTML = '';
  }

  let importedCount = 0;

  officerNames.forEach((officer) => {
    if (existingOfficerNames.has(officer)) {
      return;
    }

    addOfficer(officer, normalizeOfficerStats(runningTotals.officers?.[officer]).isOnVacation);
    existingOfficerNames.add(officer);
    importedCount += 1;
  });

  if (![...officerList.querySelectorAll('.officer-row input')].some((input) => input.value.trim())) {
    addOfficer();
  }

  return importedCount;
}

function normalizeOfficerStats(stats) {
  const emptyStats = createEmptyOfficerStats();

  if (!stats || typeof stats !== 'object') {
    return emptyStats;
  }

  return {
    isOnVacation: Boolean(stats.isOnVacation),
    activeSessionCount: Number.isFinite(stats.activeSessionCount) && stats.activeSessionCount >= 0 ? stats.activeSessionCount : 0,
    loanCount: Number.isFinite(stats.loanCount) && stats.loanCount >= 0 ? stats.loanCount : 0,
    totalAmountRequested: Number.isFinite(stats.totalAmountRequested) && stats.totalAmountRequested >= 0 ? stats.totalAmountRequested : 0,
    typeCounts: Object.fromEntries(
      LOAN_TYPES.map((loanType) => {
        const typeCount = stats.typeCounts?.[loanType];
        return [loanType, Number.isFinite(typeCount) && typeCount >= 0 ? typeCount : 0];
      })
    )
  };
}

function buildRunningTotalsWithCurrentOfficerStatuses(priorRunningTotals) {
  const updatedOfficers = Object.fromEntries(
    Object.entries(priorRunningTotals.officers || {}).map(([officer, stats]) => [officer, normalizeOfficerStats(stats)])
  );

  [...officerList.querySelectorAll('.officer-row')].forEach((row) => {
    const officerName = row.querySelector('input').value.trim();

    if (!officerName) {
      return;
    }

    const priorStats = normalizeOfficerStats(updatedOfficers[officerName]);
    updatedOfficers[officerName] = {
      ...priorStats,
      isOnVacation: row.dataset.active === 'false'
    };
  });

  return { officers: updatedOfficers };
}

async function loadRunningTotals() {
  if (!outputDirectoryHandle) {
    return { runningTotals: { officers: {} }, fileWasCreated: false };
  }

  try {
    const fileHandle = await outputDirectoryHandle.getFileHandle(RUNNING_TOTALS_FILE_NAME);
    const file = await fileHandle.getFile();
    const fileText = await file.text();

    if (!fileText.trim()) {
      return { runningTotals: { officers: {} }, fileWasCreated: false };
    }

    return { runningTotals: parseRunningTotalsCsv(fileText), fileWasCreated: false };
  } catch (error) {
    if (error.name === 'NotFoundError') {
      const emptyRunningTotals = { officers: {} };
      await saveRunningTotals(emptyRunningTotals);
      return { runningTotals: emptyRunningTotals, fileWasCreated: true };
    }

    throw new Error(`The running totals CSV could not be read: ${error.message}`);
  }
}

async function loadLoanHistory() {
  if (!outputDirectoryHandle) {
    return { loanHistory: createEmptyLoanHistory(), fileWasCreated: false };
  }

  try {
    const fileHandle = await outputDirectoryHandle.getFileHandle(LOAN_HISTORY_FILE_NAME);
    const file = await fileHandle.getFile();
    const fileText = await file.text();

    if (!fileText.trim()) {
      return { loanHistory: createEmptyLoanHistory(), fileWasCreated: false };
    }

    return { loanHistory: parseLoanHistoryCsv(fileText), fileWasCreated: false };
  } catch (error) {
    if (error.name === 'NotFoundError') {
      const emptyLoanHistory = createEmptyLoanHistory();
      await saveLoanHistory(emptyLoanHistory);
      return { loanHistory: emptyLoanHistory, fileWasCreated: true };
    }

    throw new Error(`The loan history CSV could not be read: ${error.message}`);
  }
}

function buildUpdatedRunningTotals(cleanOfficers, result, priorRunningTotals) {
  const updatedOfficers = Object.fromEntries(
    Object.entries(priorRunningTotals.officers || {}).map(([officer, stats]) => [officer, normalizeOfficerStats(stats)])
  );

  cleanOfficers.forEach((officer) => {
    const priorStats = normalizeOfficerStats(updatedOfficers[officer]);
    const assignedLoans = result.officerAssignments[officer] || [];
    const nextStats = {
      isOnVacation: priorStats.isOnVacation,
      activeSessionCount: priorStats.activeSessionCount + 1,
      loanCount: priorStats.loanCount + assignedLoans.length,
      totalAmountRequested: priorStats.totalAmountRequested + assignedLoans.reduce((sum, loan) => sum + getGoalAmountForLoan(loan), 0),
      typeCounts: { ...priorStats.typeCounts }
    };

    assignedLoans.forEach((loan) => {
      nextStats.typeCounts[loan.type] += 1;
    });

    updatedOfficers[officer] = nextStats;
  });

  return { officers: updatedOfficers };
}

function buildUpdatedLoanHistory(result, generatedAt, priorLoanHistory) {
  const updatedLoans = { ...(priorLoanHistory.loans || {}) };

  result.loanAssignments.forEach((entry) => {
    updatedLoans[entry.loan.name.toLowerCase()] = normalizeLoanHistoryEntry({
      loanName: entry.loan.name,
      type: entry.loan.type,
      amountRequested: entry.loan.amountRequested,
      assignedOfficer: entry.officers[0] || '',
      generatedAt: generatedAt.toISOString()
    });
  });

  return { loans: updatedLoans };
}

async function saveRunningTotals(runningTotals) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await outputDirectoryHandle.getFileHandle(RUNNING_TOTALS_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(buildRunningTotalsCsv(runningTotals));
  await writable.close();
}

async function saveLoanHistory(loanHistory) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await outputDirectoryHandle.getFileHandle(LOAN_HISTORY_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(buildLoanHistoryCsv(loanHistory));
  await writable.close();
}

async function readCsvFile(fileName) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await outputDirectoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeCsvFile(fileName, content) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await outputDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function removeFile(fileName) {
  if (!outputDirectoryHandle || typeof outputDirectoryHandle.removeEntry !== 'function') {
    return false;
  }

  try {
    await outputDirectoryHandle.removeEntry(fileName);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return false;
    }

    throw error;
  }
}

async function removeLoanFromHistory(loanName) {
  const normalizedLoanName = String(loanName || '').trim().toLowerCase();

  if (!normalizedLoanName) {
    throw new Error('Enter a loan name or ID to remove.');
  }

  const { loanHistory } = await loadLoanHistory();

  if (!loanHistory.loans[normalizedLoanName]) {
    throw new Error(`Loan ${loanName} was not found in history.`);
  }

  delete loanHistory.loans[normalizedLoanName];
  await saveLoanHistory(loanHistory);
}

async function archiveRunningTotalsForEndOfMonth() {
  if (!outputDirectoryHandle) {
    throw new Error('Choose an output folder before ending the month.');
  }

  const csvText = await readCsvFile(RUNNING_TOTALS_FILE_NAME);
  const archiveFileName = buildArchivedRunningTotalsFileName(new Date());
  await writeCsvFile(archiveFileName, csvText);
  await removeFile(RUNNING_TOTALS_FILE_NAME);

  try {
    const loanHistoryText = await readCsvFile(LOAN_HISTORY_FILE_NAME);
    const loanHistoryArchiveFileName = `loan-randomizer-loan-history-${new Date().getFullYear()}-${padNumber(new Date().getMonth() + 1)}.csv`;
    await writeCsvFile(loanHistoryArchiveFileName, loanHistoryText);
    await removeFile(LOAN_HISTORY_FILE_NAME);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      throw error;
    }
  }

  return archiveFileName;
}

function resetAppAfterEndOfMonth() {
  outputDirectoryHandle = null;
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  loanAssignmentsEl.className = 'results empty';
  officerAssignmentsEl.className = 'results empty';
  fairnessAuditEl.className = 'results empty';
  loanAssignmentsEl.textContent = 'No assignments yet.';
  officerAssignmentsEl.textContent = 'No assignments yet.';
  fairnessAuditEl.textContent = 'No fairness audit yet.';
  addOfficer('Loan Officer 1');
  addOfficer('Loan Officer 2');
  addOfficer('Loan Officer 3');
  addLoan('Loan A', 'Collateralized', '15000');
  addLoan('Loan B', 'Personal', '4000');
  updateFolderStatus();
}

function getDistinctTypeCount(typeCounts) {
  return Object.values(typeCounts).filter((count) => count > 0).length;
}

function getNormalizedFairnessValue(total, activeSessionCount) {
  return total / Math.max(activeSessionCount, 1);
}

function calculateVariance(values) {
  if (!values.length) {
    return 0;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
}

function buildProjectedLoads(cleanOfficers, currentTotals, officerActiveSessions, selectedOfficer, increment) {
  return cleanOfficers.map((officer) => getNormalizedFairnessValue(
    currentTotals[officer] + (officer === selectedOfficer ? increment : 0),
    officerActiveSessions[officer]
  ));
}

function chooseOfficerForLoan(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, officerActiveSessions, loan) {
  const goalAmount = getGoalAmountForLoan(loan);
  const shuffledOfficers = shuffle(cleanOfficers);

  const scoredOfficers = shuffledOfficers.map((officer) => {
    const currentTypeTotals = Object.fromEntries(
      cleanOfficers.map((currentOfficer) => [currentOfficer, officerTypeCounts[currentOfficer][loan.type]])
    );

    const projectedTypeLoads = buildProjectedLoads(cleanOfficers, currentTypeTotals, officerActiveSessions, officer, 1);
    const projectedAmountLoads = buildProjectedLoads(cleanOfficers, officerAmountTotals, officerActiveSessions, officer, goalAmount);
    const projectedLoanLoads = buildProjectedLoads(cleanOfficers, officerLoanTotals, officerActiveSessions, officer, 1);

    const typeVariance = calculateVariance(projectedTypeLoads);
    const amountVariance = calculateVariance(projectedAmountLoads);
    const loanVariance = calculateVariance(projectedLoanLoads);
    const distinctTypePenalty = getDistinctTypeCount(officerTypeCounts[officer]) * 0.0025;
    const currentAmountPenalty = getNormalizedFairnessValue(officerAmountTotals[officer] + goalAmount, officerActiveSessions[officer]) * 0.00001;
    const score = (typeVariance * 4) + (amountVariance * 3) + (loanVariance * 2) + distinctTypePenalty + currentAmountPenalty;

    return {
      officer,
      score,
      typeVariance,
      amountVariance,
      loanVariance,
      distinctTypePenalty,
      currentAmountPenalty,
      projectedTypeLoad: getNormalizedFairnessValue(officerTypeCounts[officer][loan.type] + 1, officerActiveSessions[officer]),
      projectedAmountLoad: getNormalizedFairnessValue(officerAmountTotals[officer] + goalAmount, officerActiveSessions[officer]),
      projectedLoanLoad: getNormalizedFairnessValue(officerLoanTotals[officer] + 1, officerActiveSessions[officer])
    };
  });

  scoredOfficers.sort((officerA, officerB) => officerA.score - officerB.score);
  return {
    selectedOfficer: scoredOfficers[0].officer,
    scoredOfficers
  };
}

function formatProjectedCurrencyLoad(value) {
  return `${formatCurrency(value)} per active session`;
}

function formatProjectedCountLoad(value) {
  return `${value.toFixed(2)} per active session`;
}

function formatScoreGapPercent(bestScore, comparedScore) {
  if (!Number.isFinite(bestScore) || bestScore <= 0 || !Number.isFinite(comparedScore)) {
    return '0%';
  }

  const percent = ((comparedScore - bestScore) / bestScore) * 100;
  return `${Math.max(percent, 0).toFixed(1)}%`;
}

function getAuditReasonLabels(selectedOfficerScore, runnerUpScore, loanType) {
  if (!runnerUpScore) {
    return ['Only available officer'];
  }

  const comparisons = [
    {
      label: `${loanType} balance`,
      selectedValue: selectedOfficerScore.typeVariance,
      runnerUpValue: runnerUpScore.typeVariance
    },
    {
      label: 'goal-dollar balance',
      selectedValue: selectedOfficerScore.amountVariance,
      runnerUpValue: runnerUpScore.amountVariance
    },
    {
      label: 'overall loan count balance',
      selectedValue: selectedOfficerScore.loanVariance,
      runnerUpValue: runnerUpScore.loanVariance
    }
  ];

  return comparisons
    .filter((comparison) => comparison.selectedValue < comparison.runnerUpValue)
    .sort((comparisonA, comparisonB) => {
      const differenceA = comparisonA.runnerUpValue - comparisonA.selectedValue;
      const differenceB = comparisonB.runnerUpValue - comparisonB.selectedValue;
      return differenceB - differenceA;
    })
    .map((comparison) => comparison.label)
    .slice(0, 2);
}

function buildAuditExplanation(entry) {
  const [selectedOfficerScore, runnerUpScore] = entry.scoredOfficers;
  const reasonLabels = getAuditReasonLabels(selectedOfficerScore, runnerUpScore, entry.loan.type);

  if (!runnerUpScore) {
    return `${entry.selectedOfficer} was the only available officer for this loan.`;
  }

  if (!reasonLabels.length) {
    return `${entry.selectedOfficer} produced the best overall balance, finishing ${formatScoreGapPercent(selectedOfficerScore.score, runnerUpScore.score)} ahead of ${runnerUpScore.officer}.`;
  }

  return `${entry.selectedOfficer} ranked best because this choice kept ${reasonLabels.join(' and ')} more even across the team. It finished ${formatScoreGapPercent(selectedOfficerScore.score, runnerUpScore.score)} ahead of ${runnerUpScore.officer}.`;
}

function getAuditStatusLabel(entry, scoredOfficer, index) {
  if (scoredOfficer.officer === entry.selectedOfficer) {
    return 'Chosen';
  }

  if (index === 1) {
    return `Next best (+${formatScoreGapPercent(entry.scoredOfficers[0].score, scoredOfficer.score)})`;
  }

  return `Behind winner (+${formatScoreGapPercent(entry.scoredOfficers[0].score, scoredOfficer.score)})`;
}

function buildPdfLines(result, officers, loans, generatedAt) {
  const lines = [
    { text: 'Loan Randomized Results', size: 18, gapAfter: 18 },
    { text: `Generated: ${formatDisplayTimestamp(generatedAt)}`, size: 11, gapAfter: 6 },
    { text: `Loan officers entered: ${officers.length}`, size: 11, gapAfter: 4 },
    { text: `Loans entered: ${loans.length}`, size: 11, gapAfter: 14 },
    { text: 'Assignments by Loan', size: 14, gapAfter: 10 }
  ];

  result.loanAssignments.forEach((entry) => {
    lines.push({ text: `${formatLoanLabel(entry.loan)} -> ${entry.officers[0]}`, size: 11, gapAfter: 6 });
  });

  lines.push({ text: '', size: 11, gapAfter: 8 });
  lines.push({ text: 'Assignments by Officer', size: 14, gapAfter: 10 });

  Object.entries(result.officerAssignments).forEach(([officer, assignedLoans]) => {
    lines.push({ text: `${officer} (${assignedLoans.length})`, size: 12, gapAfter: 6 });

    if (!assignedLoans.length) {
      lines.push({ text: 'No loans assigned.', size: 11, indent: 16, gapAfter: 6 });
      return;
    }

    assignedLoans.forEach((loan) => {
      lines.push({ text: `- ${formatLoanLabel(loan)}`, size: 11, indent: 16, gapAfter: 5 });
    });

    lines.push({ text: '', size: 11, gapAfter: 4 });
  });

  lines.push({ text: 'Fairness Audit', size: 14, gapAfter: 10 });

  result.fairnessAudit.forEach((entry) => {
    lines.push({ text: `${entry.loan.name} (${entry.loan.type})`, size: 12, gapAfter: 4 });
    lines.push({ text: `Chosen officer: ${entry.selectedOfficer}`, size: 11, indent: 16, gapAfter: 4 });
    lines.push({ text: buildAuditExplanation(entry), size: 11, indent: 16, gapAfter: 8 });
  });

  lines.push({ text: 'Officer Running Totals', size: 14, gapAfter: 10 });

  Object.entries(result.updatedRunningTotals?.officers || {}).forEach(([officer, stats]) => {
    const normalizedStats = normalizeOfficerStats(stats);
    lines.push({
      text: `${officer} | Active sessions: ${normalizedStats.activeSessionCount} | Loans: ${normalizedStats.loanCount} | Goal dollars: ${formatCurrency(normalizedStats.totalAmountRequested)} | ${formatTypeCounts(normalizedStats.typeCounts)}`,
      size: 11,
      gapAfter: 6
    });
  });

  return lines;
}

function writePdfLines(doc, lines) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = 500;
  const left = 54;
  const top = 64;
  const bottom = 54;
  let currentY = top;

  lines.forEach((line) => {
    const fontSize = line.size || 11;
    const indent = line.indent || 0;
    const text = line.text || ' ';
    const wrappedLines = doc.splitTextToSize(text, maxWidth - indent);
    const lineHeight = fontSize + 4;
    const requiredHeight = wrappedLines.length * lineHeight + (line.gapAfter || 0);

    if (currentY + requiredHeight > pageHeight - bottom) {
      doc.addPage();
      currentY = top;
    }

    doc.setFont('helvetica', fontSize >= 14 ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.text(wrappedLines, left + indent, currentY);
    currentY += wrappedLines.length * lineHeight + (line.gapAfter || 0);
  });
}

async function saveResultPdf(result, officers, loans, generatedAt) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('The PDF library did not load correctly.');
  }

  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
  writePdfLines(doc, buildPdfLines(result, officers, loans, generatedAt));

  const pdfBlob = doc.output('blob');
  const fileName = buildPdfFileName(generatedAt);
  const fileHandle = await outputDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(pdfBlob);
  await writable.close();

  return fileName;
}

function assignLoans(officers, loans, runningTotals = { officers: {} }) {
  const cleanOfficers = [...new Set(officers.map((name) => name.trim()).filter(Boolean))];
  const cleanLoans = loans
    .map((loan) => ({
      name: loan.name.trim(),
      type: LOAN_TYPES.includes(loan.type) ? loan.type : LOAN_TYPES[0],
      amountRequested: loan.amountRequested
    }))
    .filter((loan) => loan.name);

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

  const hasInvalidAmount = cleanLoans.some((loan) => loan.type !== 'Credit Card' && (!Number.isFinite(loan.amountRequested) || loan.amountRequested < 0));
  if (hasInvalidAmount) {
    return { error: 'Each loan must include a valid non-negative Amount Requested.' };
  }

  const officerAssignments = {};
  const officerTypeCounts = {};
  const officerAmountTotals = {};
  const officerLoanTotals = {};
  const officerActiveSessions = {};

  cleanOfficers.forEach((officer) => {
    const priorStats = normalizeOfficerStats(runningTotals.officers?.[officer]);
    officerAssignments[officer] = [];
    officerTypeCounts[officer] = { ...priorStats.typeCounts };
    officerAmountTotals[officer] = priorStats.totalAmountRequested;
    officerLoanTotals[officer] = priorStats.loanCount;
    officerActiveSessions[officer] = priorStats.activeSessionCount + 1;
  });

  const loanAssignments = [];
  const fairnessAudit = [];

  LOAN_TYPES.forEach((loanType) => {
    const loansForType = shuffle(cleanLoans.filter((loan) => loan.type === loanType));

    if (!loansForType.length) {
      return;
    }

    const orderedLoansForType = [...loansForType].sort((loanA, loanB) => getGoalAmountForLoan(loanB) - getGoalAmountForLoan(loanA));

    orderedLoansForType.forEach((loan) => {
      const assignmentDecision = chooseOfficerForLoan(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, officerActiveSessions, loan);
      const assignedOfficer = assignmentDecision.selectedOfficer;
      officerAssignments[assignedOfficer].push(loan);
      officerTypeCounts[assignedOfficer][loanType] += 1;
      officerAmountTotals[assignedOfficer] += getGoalAmountForLoan(loan);
      officerLoanTotals[assignedOfficer] += 1;
      loanAssignments.push({
        loan,
        officers: [assignedOfficer],
        shared: false
      });
      fairnessAudit.push({
        loan,
        selectedOfficer: assignedOfficer,
        scoredOfficers: assignmentDecision.scoredOfficers
      });
    });
  });

  return {
    loanAssignments: shuffle(loanAssignments),
    officerAssignments,
    fairnessAudit,
    runningTotalsUsed: Object.fromEntries(cleanOfficers.map((officer) => [officer, normalizeOfficerStats(runningTotals.officers?.[officer])]))
  };
}

function renderResults(result) {
  if (result.error) {
    setMessage(result.error, 'warning');
    loanAssignmentsEl.className = 'results empty';
    officerAssignmentsEl.className = 'results empty';
    fairnessAuditEl.className = 'results empty';
    loanAssignmentsEl.textContent = 'No assignments yet.';
    officerAssignmentsEl.textContent = 'No assignments yet.';
    fairnessAuditEl.textContent = 'No fairness audit yet.';
    return;
  }

  setMessage('');

  loanAssignmentsEl.className = 'results';
  officerAssignmentsEl.className = 'results';
  fairnessAuditEl.className = 'results';

  loanAssignmentsEl.innerHTML = '';
  officerAssignmentsEl.innerHTML = '';
  fairnessAuditEl.innerHTML = '';

  result.loanAssignments.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'loan-line';

    if (entry.shared) {
      div.innerHTML = `
        <div><span class="assignment-name">${escapeHtml(entry.loan.name)}</span> <span class="type-badge">${escapeHtml(entry.loan.type)}</span></div>
        <div class="assignment-amount">Requested: ${escapeHtml(formatCurrency(entry.loan.amountRequested))}</div>
        <div class="shared">Shared across: ${entry.officers.map(escapeHtml).join(', ')}</div>
      `;
    } else {
      div.innerHTML = `
        <div><span class="assignment-name">${escapeHtml(entry.loan.name)}</span> <span class="type-badge">${escapeHtml(entry.loan.type)}</span></div>
        <div class="assignment-amount">Requested: ${escapeHtml(formatCurrency(entry.loan.amountRequested))}</div>
        <div>Assigned to: ${escapeHtml(entry.officers[0])}</div>
      `;
    }

    loanAssignmentsEl.appendChild(div);
  });

  Object.entries(result.officerAssignments).forEach(([officer, assignedLoans]) => {
    const group = document.createElement('div');
    group.className = 'result-group';

    const totalAmount = assignedLoans.reduce((sum, loan) => sum + getGoalAmountForLoan(loan), 0);
    const priorStats = normalizeOfficerStats(result.runningTotalsUsed?.[officer]);
    const newRunningAmount = priorStats.totalAmountRequested + totalAmount;

    const badge = `<span class="badge">${assignedLoans.length} assigned</span>`;
    group.innerHTML = `<h3>${escapeHtml(officer)} ${badge}</h3><div class="amount-summary">This run goal dollars: ${escapeHtml(formatCurrency(totalAmount))}</div><div class="amount-summary">Running goal dollars: ${escapeHtml(formatCurrency(newRunningAmount))}</div>`;

    if (!assignedLoans.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No loans assigned.';
      group.appendChild(empty);
    } else {
      assignedLoans.forEach((loan) => {
        const pill = document.createElement('span');
        pill.className = 'loan-pill';
        pill.textContent = formatLoanLabel(loan);
        group.appendChild(pill);
      });
    }

    officerAssignmentsEl.appendChild(group);
  });

  result.fairnessAudit.forEach((entry) => {
    const auditCard = document.createElement('div');
    auditCard.className = 'audit-card';

    const auditRows = entry.scoredOfficers
      .map((scoredOfficer, index) => `
        <tr${scoredOfficer.officer === entry.selectedOfficer ? ' class="winner"' : ''}>
          <td>${escapeHtml(scoredOfficer.officer)}</td>
          <td>${escapeHtml(getAuditStatusLabel(entry, scoredOfficer, index))}</td>
          <td>${scoredOfficer.projectedTypeLoad.toFixed(2)} per active session</td>
          <td>${escapeHtml(formatProjectedCurrencyLoad(scoredOfficer.projectedAmountLoad))}</td>
          <td>${escapeHtml(formatProjectedCountLoad(scoredOfficer.projectedLoanLoad))}</td>
        </tr>
      `)
      .join('');

    const selectedOfficerScore = entry.scoredOfficers[0];
    const runnerUpScore = entry.scoredOfficers[1];

    auditCard.innerHTML = `
      <h3>${escapeHtml(entry.loan.name)} <span class="type-badge">${escapeHtml(entry.loan.type)}</span></h3>
      <div class="audit-summary">
        <div class="audit-summary-line"><strong>Chosen officer:</strong> ${escapeHtml(entry.selectedOfficer)}</div>
        <div class="audit-summary-line">${escapeHtml(buildAuditExplanation(entry))}</div>
        <div class="audit-summary-metrics">
          <span class="audit-metric"><strong>${escapeHtml(entry.loan.type)} load after assignment:</strong> ${selectedOfficerScore.projectedTypeLoad.toFixed(2)} per active session</span>
          <span class="audit-metric"><strong>Projected goal dollars:</strong> ${escapeHtml(formatProjectedCurrencyLoad(selectedOfficerScore.projectedAmountLoad))}</span>
          <span class="audit-metric"><strong>Projected total loans:</strong> ${escapeHtml(formatProjectedCountLoad(selectedOfficerScore.projectedLoanLoad))}</span>
        </div>
        ${runnerUpScore ? `<div class="audit-summary-line">Closest alternative: ${escapeHtml(runnerUpScore.officer)}.</div>` : ''}
      </div>
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Officer</th>
              <th>Result</th>
              <th>Projected ${escapeHtml(entry.loan.type)} load</th>
              <th>Projected goal dollars</th>
              <th>Projected total loans</th>
            </tr>
          </thead>
          <tbody>
            ${auditRows}
          </tbody>
        </table>
      </div>
    `;

    fairnessAuditEl.appendChild(auditCard);
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

function formatTypeCounts(typeCounts) {
  return LOAN_TYPES
    .map((loanType) => `${loanType}: ${typeCounts[loanType] || 0}`)
    .join(' | ');
}

function renderLoadedRunningTotals(runningTotals) {
  const officerEntries = Object.entries(runningTotals.officers || {}).sort(([officerA], [officerB]) => officerA.localeCompare(officerB));

  if (!officerEntries.length) {
    loanAssignmentsEl.className = 'results empty';
    officerAssignmentsEl.className = 'results empty';
    loanAssignmentsEl.textContent = 'No saved officer totals found yet.';
    officerAssignmentsEl.textContent = 'No saved officer totals found yet.';
    return;
  }

  loanAssignmentsEl.className = 'results';
  officerAssignmentsEl.className = 'results';
  loanAssignmentsEl.innerHTML = '';
  officerAssignmentsEl.innerHTML = '';

  officerEntries.forEach(([officer, rawStats]) => {
    const stats = normalizeOfficerStats(rawStats);

    const loanSummary = document.createElement('div');
    loanSummary.className = 'loan-line';
    loanSummary.innerHTML = `
      <div><span class="assignment-name">${escapeHtml(officer)}</span></div>
      <div class="assignment-amount">Running goal dollars: ${escapeHtml(formatCurrency(stats.totalAmountRequested))}</div>
      <div>Active sessions: ${escapeHtml(String(stats.activeSessionCount))}</div>
      <div>Loans tracked: ${escapeHtml(String(stats.loanCount))}</div>
      <div class="assignment-amount">Types: ${escapeHtml(formatTypeCounts(stats.typeCounts))}</div>
    `;
    loanAssignmentsEl.appendChild(loanSummary);

    const officerSummary = document.createElement('div');
    officerSummary.className = 'result-group';
    officerSummary.innerHTML = `
      <h3>${escapeHtml(officer)} <span class="badge">${escapeHtml(String(stats.loanCount))} tracked</span></h3>
      <div class="amount-summary">Running goal dollars: ${escapeHtml(formatCurrency(stats.totalAmountRequested))}</div>
      <div class="amount-summary">Active sessions: ${escapeHtml(String(stats.activeSessionCount))}</div>
      <div class="amount-summary">${escapeHtml(formatTypeCounts(stats.typeCounts))}</div>
    `;
    officerAssignmentsEl.appendChild(officerSummary);
  });
}

function handleChooseFolderClick(event) {
  event?.preventDefault();
  chooseOutputFolder();
}

async function handleImportPriorMonthClick() {
  if (!outputDirectoryHandle) {
    setMessage('Choose an output folder before importing officers from a prior month.', 'warning');
    return;
  }

  const monthKey = window.prompt(
    'Enter the prior month to import from using YYYY-MM.',
    getPreviousMonthKey()
  );

  if (monthKey === null) {
    return;
  }

  const normalizedMonthKey = monthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(normalizedMonthKey)) {
    setMessage('Enter the prior month in YYYY-MM format, such as 2026-03.', 'warning');
    return;
  }

  const fileName = buildArchivedRunningTotalsFileNameFromKey(normalizedMonthKey);

  try {
    const csvText = await readCsvFile(fileName);
    const priorMonthTotals = parseRunningTotalsCsv(csvText);
    const importedCount = appendOfficersFromRunningTotals(priorMonthTotals);

    if (!importedCount) {
      setMessage(`No new loan officers were found in ${fileName}.`, 'warning');
      return;
    }

    setMessage(`Imported ${importedCount} loan officer${importedCount === 1 ? '' : 's'} from ${fileName}.`, 'success');
  } catch (error) {
    if (error.name === 'NotFoundError') {
      setMessage(`Could not find ${fileName} in the selected output folder.`, 'warning');
      return;
    }

    setMessage(`Could not import officers from the prior month: ${error.message}`, 'warning');
  }
}

addOfficerBtn.addEventListener('click', () => addOfficer());
importPriorMonthBtn.addEventListener('click', () => {
  handleImportPriorMonthClick();
});
addLoanBtn.addEventListener('click', () => addLoan());
chooseFolderBtn.addEventListener('click', handleChooseFolderClick);
chooseFolderBtn.onclick = handleChooseFolderClick;
changeFolderBtn.addEventListener('click', handleChooseFolderClick);
changeFolderBtn.onclick = handleChooseFolderClick;
endOfMonthBtn?.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setMessage('Choose an output folder before ending the month.', 'warning');
    return;
  }

  const confirmed = window.confirm('Are you sure you want to end this month\'s loan tracking?');
  if (!confirmed) {
    return;
  }

  try {
    const archiveFileName = await archiveRunningTotalsForEndOfMonth();
    resetAppAfterEndOfMonth();
    setMessage(`Loan tracking archived to ${archiveFileName}. Choose Output Folder to start the next month.`, 'success');
  } catch (error) {
    setMessage(`Could not complete End of Month: ${error.message}`, 'warning');
  }
});

randomizeBtn.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setMessage('Choose an output folder before randomizing assignments.', 'warning');
    updateFolderStatus();
    return;
  }

  const loanRowValidationError = getLoanRowValidationError();
  if (loanRowValidationError) {
    setMessage(loanRowValidationError, 'warning');
    return;
  }

  const officers = getOfficerValues();
  const loans = getLoanValues();

  let runningTotals;
  let loanHistory;

  try {
    ({ runningTotals } = await loadRunningTotals());
    ({ loanHistory } = await loadLoanHistory());
  } catch (error) {
    setMessage(error.message, 'warning');
    return;
  }

  const duplicateExistingLoan = loans.find((loan) => loanHistory.loans?.[loan.name.toLowerCase()]);
  if (duplicateExistingLoan) {
    setMessage(`${duplicateExistingLoan.name} has already been entered. Please remove it from history before entering it again.`, 'warning');
    return;
  }

  const result = assignLoans(officers, loans, runningTotals);
  renderResults(result);

  if (result.error) {
    return;
  }

  try {
    const generatedAt = new Date();
    const updatedRunningTotals = buildUpdatedRunningTotals([...new Set(officers.map((name) => name.trim()).filter(Boolean))], result, runningTotals);
    result.updatedRunningTotals = buildRunningTotalsWithCurrentOfficerStatuses(updatedRunningTotals);
    const fileName = await saveResultPdf(result, officers, loans, generatedAt);
    await saveRunningTotals(result.updatedRunningTotals);
    await saveLoanHistory(buildUpdatedLoanHistory(result, generatedAt, loanHistory));
    setMessage(`Assignments randomized and saved to ${fileName}. Officer history was updated in ${RUNNING_TOTALS_FILE_NAME}, and loan history was updated in ${LOAN_HISTORY_FILE_NAME}.`, 'success');
  } catch (error) {
    setMessage(`Assignments were generated, but the files could not be fully saved: ${error.message}`, 'warning');
  }
});

sampleBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';

  ['Alex', 'Brooke', 'Chris', 'Dana'].forEach(addOfficer);
  [
    ['Loan 101', 'Collateralized', '25000'],
    ['Loan 102', 'Personal', '18000'],
    ['Loan 103', 'Personal', '7500'],
    ['Loan 104', 'Credit Card', '3200'],
    ['Loan 105', 'Personal', '6800'],
    ['Loan 106', 'Credit Card', '4100'],
    ['Loan 107', 'Collateralized', '9200']
  ].forEach(([loanName, loanType, loanAmount]) => addLoan(loanName, loanType, loanAmount));

  const result = assignLoans(getOfficerValues(), getLoanValues());
  renderResults(result);
});

removeLoanHistoryBtn?.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setMessage('Choose an output folder before removing loan history.', 'warning');
    return;
  }

  const loanName = window.prompt('Enter the loan name or ID to remove from history.');

  if (loanName === null) {
    return;
  }

  try {
    await removeLoanFromHistory(loanName.trim());
    setMessage(`Removed ${loanName.trim()} from ${LOAN_HISTORY_FILE_NAME}.`, 'success');
  } catch (error) {
    setMessage(error.message, 'warning');
  }
});

clearBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  setMessage('');
  loanAssignmentsEl.className = 'results empty';
  officerAssignmentsEl.className = 'results empty';
  fairnessAuditEl.className = 'results empty';
  loanAssignmentsEl.textContent = 'No assignments yet.';
  officerAssignmentsEl.textContent = 'No assignments yet.';
  fairnessAuditEl.textContent = 'No fairness audit yet.';
  addOfficer();
  addOfficer();
  addOfficer();
  addOfficer();
});

addOfficer('Loan Officer 1');
addOfficer('Loan Officer 2');
addOfficer('Loan Officer 3');
addLoan('Loan A', 'Collateralized', '15000');
addLoan('Loan B', 'Personal', '4000');
updateFolderStatus();
