const officerList = document.getElementById('officerList');
const loanList = document.getElementById('loanList');
const addOfficerBtn = document.getElementById('addOfficerBtn');
const importPriorMonthBtn = document.getElementById('importPriorMonthBtn');
const addLoanBtn = document.getElementById('addLoanBtn');
const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const launchDemoModeBtn = document.getElementById('launchDemoModeBtn');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const quickLaunchDemoModeBtn = document.getElementById('quickLaunchDemoModeBtn');
const endDemoModeBtn = document.getElementById('endDemoModeBtn');
const clearDemoDataBtn = document.getElementById('clearDemoDataBtn');
const endOfMonthBtn = document.getElementById('endOfMonthBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const clearBtn = document.getElementById('clearBtn');
const removeLoanHistoryBtn = document.getElementById('removeLoanHistoryBtn');
const messageEl = document.getElementById('message');
const step1MessageEl = document.getElementById('step1Message');
const step2MessageEl = document.getElementById('step2Message');
const step3MessageEl = document.getElementById('step3Message');
const outputStepEl = document.getElementById('outputStep');
const outputStepCompactEl = document.getElementById('outputStepCompact');
const outputStepDetailsEl = document.getElementById('outputStepDetails');
const folderStatusEl = document.getElementById('folderStatus');
const folderPromptEl = document.getElementById('folderPrompt');
const loanAssignmentsEl = document.getElementById('loanAssignments');
const officerAssignmentsEl = document.getElementById('officerAssignments');
const fairnessAuditEl = document.getElementById('fairnessAudit');

const addLoanTypeBtn = document.getElementById('addLoanTypeBtn');
const loanTypeNameInput = document.getElementById('loanTypeNameInput');
const loanTypeStartInput = document.getElementById('loanTypeStartInput');
const loanTypeEndInput = document.getElementById('loanTypeEndInput');
const loanTypeListEl = document.getElementById('loanTypeList');
const loanTypeSummaryStatsEl = document.getElementById('loanTypeSummaryStats');

const distributionDetailsEl = document.getElementById('distributionDetails');
const distributionChartsEl = document.getElementById('distributionCharts');

const LOGO_PATH = './logo.png';

const logoEl = document.getElementById('logo');

if (logoEl && LOGO_PATH) {
  logoEl.onerror = () => {
    logoEl.style.display = 'none';
    logoEl.removeAttribute('src');
  };

  logoEl.onload = () => {
    logoEl.style.display = 'block';
  };

  logoEl.src = LOGO_PATH;
} else if (logoEl) {
  logoEl.style.display = 'none';
}

let outputDirectoryHandle = null;

let isFolderPickerOpen = false;

const RUNNING_TOTALS_FILE_NAME = 'loan-randomizer-running-totals.csv';
const LOAN_HISTORY_FILE_NAME = 'loan-randomizer-loan-history.csv';
const LOAN_TYPES_FILE_NAME = 'loan-types.json';
const SIMULATION_HISTORY_FILE_NAME = 'simulation-history.csv';
const DEMO_RUNNING_TOTALS_FILE_NAME = 'demo-running-totals.csv';
const DEMO_LOAN_HISTORY_FILE_NAME = 'demo-loan-history.csv';
const DEMO_LOAN_TYPES_FILE_NAME = 'demo-loan-types.json';
const DEMO_SIMULATION_HISTORY_FILE_NAME = 'demo-simulation-history.csv';
const DEMO_DATA_FOLDER_NAME = 'demo-data';
const MONTH_FOLDER_KEY_REGEX = /^\d{4}-\d{2}$/;
const FOLDER_HANDLE_DB_NAME = 'loan-randomizer-folder-access';
const FOLDER_HANDLE_STORE_NAME = 'settings';
const FOLDER_HANDLE_STORAGE_KEY = 'last-output-folder-handle';

let isDemoMode = false;

const DEFAULT_LOAN_TYPES = [
  {
    name: 'Collateralized',
    activeFrom: null,
    activeTo: null,
    isBuiltIn: true,
    amountOptional: false
  },
  {
    name: 'Credit Card',
    activeFrom: null,
    activeTo: null,
    isBuiltIn: true,
    amountOptional: true
  },
  {
    name: 'Personal',
    activeFrom: null,
    activeTo: null,
    isBuiltIn: true,
    amountOptional: false
  }
];

let allLoanTypes = [...DEFAULT_LOAN_TYPES];

function getSessionFileName(fileKind) {
  const standardFileNames = {
    runningTotals: RUNNING_TOTALS_FILE_NAME,
    loanHistory: LOAN_HISTORY_FILE_NAME,
    loanTypes: LOAN_TYPES_FILE_NAME,
    simulationHistory: SIMULATION_HISTORY_FILE_NAME
  };

  if (!isDemoMode) {
    return standardFileNames[fileKind];
  }

  const demoFileNames = {
    runningTotals: DEMO_RUNNING_TOTALS_FILE_NAME,
    loanHistory: DEMO_LOAN_HISTORY_FILE_NAME,
    loanTypes: DEMO_LOAN_TYPES_FILE_NAME,
    simulationHistory: DEMO_SIMULATION_HISTORY_FILE_NAME
  };

  return demoFileNames[fileKind];
}

function getMonthFolderKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isValidMonthFolderKey(value) {
  return MONTH_FOLDER_KEY_REGEX.test(String(value || ''));
}

function supportsPersistedDirectoryHandle() {
  return typeof window.indexedDB !== 'undefined';
}

async function openFolderHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(FOLDER_HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FOLDER_HANDLE_STORE_NAME)) {
        database.createObjectStore(FOLDER_HANDLE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local folder-access database.'));
  });
}

async function saveOutputDirectoryHandle(directoryHandle) {
  if (!supportsPersistedDirectoryHandle() || !directoryHandle) {
    return;
  }

  const database = await openFolderHandleDatabase();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FOLDER_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(FOLDER_HANDLE_STORE_NAME);
    store.put(directoryHandle, FOLDER_HANDLE_STORAGE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the selected output folder.'));
  });

  database.close();
}

async function loadSavedOutputDirectoryHandle() {
  if (!supportsPersistedDirectoryHandle()) {
    return null;
  }

  const database = await openFolderHandleDatabase();

  const handle = await new Promise((resolve, reject) => {
    const transaction = database.transaction(FOLDER_HANDLE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(FOLDER_HANDLE_STORE_NAME);
    const request = store.get(FOLDER_HANDLE_STORAGE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read the saved output folder.'));
  });

  database.close();
  return handle;
}

async function clearSavedOutputDirectoryHandle() {
  if (!supportsPersistedDirectoryHandle()) {
    return;
  }

  const database = await openFolderHandleDatabase();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FOLDER_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(FOLDER_HANDLE_STORE_NAME);
    store.delete(FOLDER_HANDLE_STORAGE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear the saved output folder.'));
  });

  database.close();
}

async function tryRestoreSavedOutputFolder() {
  try {
    const savedDirectoryHandle = await loadSavedOutputDirectoryHandle();
    if (!savedDirectoryHandle) {
      return false;
    }

    const hasPermission = await ensureDirectoryPermission(savedDirectoryHandle);
    if (!hasPermission) {
      return false;
    }

    const canRestoreSession = await hasRestorableSessionData(savedDirectoryHandle);
    if (!canRestoreSession) {
      await clearSavedOutputDirectoryHandle();
      return false;
    }

    await activateSessionInDirectory(savedDirectoryHandle, 'production');
    setMessage(`Production mode is active in ${savedDirectoryHandle.name}. Reconnected to your previously approved save folder.`, 'success');
    return true;
  } catch (error) {
    return false;
  }
}

async function getActiveDataDirectoryHandle() {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  if (isDemoMode) {
    return outputDirectoryHandle.getDirectoryHandle(DEMO_DATA_FOLDER_NAME, { create: true });
  }

  return outputDirectoryHandle.getDirectoryHandle(getMonthFolderKey(), { create: true });
}

async function hasRestorableSessionData(directoryHandle) {
  if (!directoryHandle) {
    return false;
  }

  let monthDirectoryHandle;
  try {
    monthDirectoryHandle = await directoryHandle.getDirectoryHandle(getMonthFolderKey());
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }

  const expectedFiles = [
    getSessionFileName('runningTotals'),
    getSessionFileName('loanHistory'),
    getSessionFileName('loanTypes')
  ];

  for (const fileName of expectedFiles) {
    try {
      await monthDirectoryHandle.getFileHandle(fileName);
      return true;
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw error;
      }
    }
  }

  return false;
}

function getSessionModeLabel() {
  return isDemoMode ? 'Demo mode' : 'Production mode';
}

function createDemoRunningTotals() {
  return {
    officers: {
      'Avery Stone': {
        isOnVacation: false,
        activeSessionCount: 12,
        loanCount: 36,
        totalAmountRequested: 486200,
        typeCounts: {
          Collateralized: 13,
          'Credit Card': 9,
          Personal: 14
        }
      },
      'Jordan Blake': {
        isOnVacation: false,
        activeSessionCount: 12,
        loanCount: 33,
        totalAmountRequested: 451900,
        typeCounts: {
          Collateralized: 12,
          'Credit Card': 10,
          Personal: 11
        }
      },
      'Casey Moore': {
        isOnVacation: false,
        activeSessionCount: 12,
        loanCount: 34,
        totalAmountRequested: 462300,
        typeCounts: {
          Collateralized: 11,
          'Credit Card': 11,
          Personal: 12
        }
      }
    }
  };
}

function createDemoLoanHistory() {
  return {
    loans: {
      'dm-240301-001': normalizeLoanHistoryEntry({
        loanName: 'DM-240301-001',
        type: 'Collateralized',
        amountRequested: 28000,
        assignedOfficer: 'Avery Stone',
        generatedAt: '2026-03-01T15:20:00.000Z'
      }),
      'dm-240301-002': normalizeLoanHistoryEntry({
        loanName: 'DM-240301-002',
        type: 'Credit Card',
        amountRequested: 0,
        assignedOfficer: 'Jordan Blake',
        generatedAt: '2026-03-01T15:20:00.000Z'
      }),
      'dm-240302-003': normalizeLoanHistoryEntry({
        loanName: 'DM-240302-003',
        type: 'Personal',
        amountRequested: 7200,
        assignedOfficer: 'Casey Moore',
        generatedAt: '2026-03-02T15:20:00.000Z'
      }),
      'dm-240303-004': normalizeLoanHistoryEntry({
        loanName: 'DM-240303-004',
        type: 'Collateralized',
        amountRequested: 15800,
        assignedOfficer: 'Jordan Blake',
        generatedAt: '2026-03-03T15:20:00.000Z'
      }),
      'dm-240304-005': normalizeLoanHistoryEntry({
        loanName: 'DM-240304-005',
        type: 'Personal',
        amountRequested: 5400,
        assignedOfficer: 'Avery Stone',
        generatedAt: '2026-03-04T15:20:00.000Z'
      })
    }
  };
}

const DEFAULT_DEMO_LOAN_TYPES = [
  ...DEFAULT_LOAN_TYPES,
  {
    name: 'Auto',
    activeFrom: null,
    activeTo: null,
    isBuiltIn: false,
    amountOptional: false
  },
  {
    name: 'HELOC',
    activeFrom: null,
    activeTo: null,
    isBuiltIn: false,
    amountOptional: false
  }
];

const DEFAULT_DEMO_SESSION_LOANS = [
  { name: 'DEMO-LIVE-101', type: 'Collateralized', amount: '25000' },
  { name: 'DEMO-LIVE-102', type: 'Personal', amount: '8200' },
  { name: 'DEMO-LIVE-103', type: 'HELOC', amount: '46000' },
  { name: 'DEMO-LIVE-104', type: 'Credit Card', amount: '' },
  { name: 'DEMO-LIVE-105', type: 'Auto', amount: '17500' },
  { name: 'DEMO-LIVE-106', type: 'Personal', amount: '6400' }
];

function getTodayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function getLogoImageDataUrl() {
  if (!LOGO_PATH) {
    return null;
  }

  try {
    const response = await fetch(LOGO_PATH);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The logo image could not be read.'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return null;
  }
}

function normalizeLoanType(type) {
  if (!type || typeof type !== 'object') {
    return null;
  }

  const name = String(type.name ?? '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    activeFrom: type.activeFrom || null,
    activeTo: type.activeTo || null,
    isBuiltIn: Boolean(type.isBuiltIn),
    amountOptional: Boolean(type.amountOptional)
  };
}

function getAllLoanTypeNames() {
  return [...new Set(allLoanTypes.map((loanType) => loanType.name))];
}

function isLoanTypeActive(loanType, todayKey = getTodayKey()) {
  if (!loanType) {
    return false;
  }

  if (loanType.activeFrom && todayKey < loanType.activeFrom) {
    return false;
  }

  if (loanType.activeTo && todayKey > loanType.activeTo) {
    return false;
  }

  return true;
}

function getActiveLoanTypes() {
  return allLoanTypes.filter((loanType) => isLoanTypeActive(loanType));
}

function getActiveLoanTypeNames() {
  return getActiveLoanTypes().map((loanType) => loanType.name);
}

function isKnownLoanType(typeName) {
  return getAllLoanTypeNames().includes(typeName);
}

function isAmountOptionalForType(typeName) {
  const match = allLoanTypes.find((loanType) => loanType.name === typeName);
  return Boolean(match?.amountOptional);
}

function getLoanTypeByName(typeName) {
  return allLoanTypes.find((loanType) => loanType.name === typeName) || null;
}

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
  const isOptional = isAmountOptionalForType(typeSelect.value);

  amountInput.disabled = isOptional;
  amountInput.dataset.mode = isOptional ? 'unit' : 'amount';
  amountInput.placeholder = isOptional ? 'Per unit - not required' : 'Amount requested';

  if (isOptional) {
    amountInput.value = '';
  }
}

function buildLoanTypeSelectOptions(typeSelect, selectedType = '') {
  typeSelect.innerHTML = '';

  const activeTypes = getActiveLoanTypeNames();
  const optionsToShow = getAllLoanTypeNames();

  optionsToShow.forEach((typeOption) => {
    const loanType = getLoanTypeByName(typeOption);
    const isActive = isLoanTypeActive(loanType);
    const option = document.createElement('option');
    option.value = typeOption;
    option.textContent = isActive ? typeOption : `${typeOption} (inactive)`;
    option.disabled = !isActive;
    option.selected = typeOption === selectedType;
    typeSelect.appendChild(option);
  });

  const selectedLoanType = getLoanTypeByName(typeSelect.value);
  const selectedTypeIsActive = isLoanTypeActive(selectedLoanType);

  if ((!typeSelect.value || !selectedTypeIsActive) && activeTypes.length) {
    if (!selectedType || selectedTypeIsActive) {
      [typeSelect.value] = activeTypes;
    }
  }
}

function refreshLoanTypeSelects() {
  [...loanList.querySelectorAll('.loan-row')].forEach((row) => {
    const typeSelect = row.querySelector('select');
    const amountInput = row.querySelector('.loan-amount-input');
    const selectedType = typeSelect.value;
    buildLoanTypeSelectOptions(typeSelect, selectedType);
    syncLoanAmountInput(typeSelect, amountInput);
  });
}

function createInputRow(type, value = '', loanType = '', amount = '', isOnVacation = false) {
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

    buildLoanTypeSelectOptions(typeSelect, loanType || getActiveLoanTypeNames()[0] || '');

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
  officerList.appendChild(createInputRow('officer', value, '', '', isOnVacation));
}

function addLoan(value = '', loanType = '', amount = '') {
  loanList.appendChild(createInputRow('loan', value, loanType, amount));
}

function loadDemoLoansIntoForm() {
  loanList.innerHTML = '';

  const activeTypes = getActiveLoanTypeNames();
  const fallbackType = activeTypes[0] || 'Collateralized';

  DEFAULT_DEMO_SESSION_LOANS.forEach((loan) => {
    const preferredType = activeTypes.includes(loan.type) ? loan.type : fallbackType;
    addLoan(loan.name, preferredType, loan.amount);
  });
}

function removeLoansWithType(typeName) {
  let removedCount = 0;

  [...loanList.querySelectorAll('.loan-row')].forEach((row) => {
    const typeSelect = row.querySelector('select');
    if (typeSelect?.value === typeName) {
      row.remove();
      removedCount += 1;
    }
  });

  return removedCount;
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
        amountRequested: isAmountOptionalForType(typeSelect.value)
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
    const amountInput = row.querySelector('.loan-amount-input');
    const typeSelect = row.querySelector('select');
    const amountValue = amountInput.value.trim();

    if (!loanName) {
      return 'Each loan row must include a Loan Name / ID.';
    }

    if (!typeSelect.value) {
      return `Loan ${loanName} must have a loan type selected.`;
    }

    if (!isLoanTypeActive(getLoanTypeByName(typeSelect.value))) {
      return `Loan ${loanName} is set to an inactive loan type (${typeSelect.value}). Reactivate that type or remove this loan.`;
    }

    const normalizedLoanName = loanName.toLowerCase();
    if (seenLoanNames.has(normalizedLoanName)) {
      return `Loan ${loanName} is already entered on this screen.`;
    }

    seenLoanNames.add(normalizedLoanName);

    if (!isAmountOptionalForType(typeSelect.value)) {
      if (amountValue === '' || !Number.isFinite(Number(amountValue)) || Number(amountValue) < 0) {
        return `Loan ${loanName} must include a valid non-negative Amount Requested.`;
      }
    }
  }

  return '';
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseRandom(items, count) {
  return shuffle(items).slice(0, count);
}

function setMessage(text = '', tone = 'warning') {
  [step1MessageEl, step2MessageEl, step3MessageEl].forEach((stepMessageEl) => {
    if (!stepMessageEl) {
      return;
    }
    stepMessageEl.textContent = '';
    stepMessageEl.dataset.tone = '';
  });
  messageEl.textContent = text;
  messageEl.dataset.tone = text ? tone : '';
}

function setStepMessage(stepKey, text = '', tone = 'warning') {
  const stepMessageMap = {
    step1: step1MessageEl,
    step2: step2MessageEl,
    step3: step3MessageEl,
    step4: messageEl
  };

  Object.values(stepMessageMap).forEach((stepMessageEl) => {
    if (!stepMessageEl) {
      return;
    }
    stepMessageEl.textContent = '';
    stepMessageEl.dataset.tone = '';
  });

  const targetMessageEl = stepMessageMap[stepKey] || messageEl;
  targetMessageEl.textContent = text;
  targetMessageEl.dataset.tone = text ? tone : '';
}

function supportsFolderSelection() {
  return typeof window.showDirectoryPicker === 'function';
}

function isLikelySharePointOrTeamsHost() {
  const host = String(window.location?.hostname || '').toLowerCase();
  return host.includes('sharepoint.com') || host.includes('teams.microsoft.com');
}

function getUnsupportedFolderAccessMessage() {
  if (isLikelySharePointOrTeamsHost()) {
    return 'Folder access is blocked in this SharePoint/Teams context. Open this app directly in Edge/Chrome (outside the SharePoint frame) and select a synced OneDrive/SharePoint folder, or add Microsoft Graph upload support for direct cloud saves.';
  }

  return 'Folder selection is not supported in this browser. Use a current version of Microsoft Edge or Google Chrome.';
}

function updateFolderStatus() {
  if (outputDirectoryHandle) {
    const activeDataPath = isDemoMode ? `/${DEMO_DATA_FOLDER_NAME}` : `/${getMonthFolderKey()}`;
    const folderSummary = `Selected folder: ${outputDirectoryHandle.name} (using ${activeDataPath})`;
    folderStatusEl.textContent = folderSummary;
    folderStatusEl.dataset.state = 'ready';
    outputStepEl.dataset.state = 'complete';
    outputStepCompactEl.hidden = false;
    outputStepDetailsEl.hidden = true;
    if (endDemoModeBtn) {
      endDemoModeBtn.hidden = !isDemoMode;
    }
    if (quickLaunchDemoModeBtn) {
      quickLaunchDemoModeBtn.hidden = isDemoMode;
    }
    if (clearDemoDataBtn) {
      clearDemoDataBtn.hidden = !isDemoMode;
    }
    randomizeBtn.disabled = false;
    randomizeBtn.dataset.state = 'ready';
    return;
  }

  if (!supportsFolderSelection()) {
    folderPromptEl.textContent = getUnsupportedFolderAccessMessage();
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
  if (endDemoModeBtn) {
    endDemoModeBtn.hidden = true;
  }
  if (quickLaunchDemoModeBtn) {
    quickLaunchDemoModeBtn.hidden = true;
  }
  if (clearDemoDataBtn) {
    clearDemoDataBtn.hidden = true;
  }
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

async function loadLoanTypes() {
  if (!outputDirectoryHandle) {
    allLoanTypes = [...DEFAULT_LOAN_TYPES];
    renderLoanTypes();
    refreshLoanTypeSelects();
    return { fileWasCreated: false };
  }

  try {
    const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('loanTypes'));
    const file = await fileHandle.getFile();
    const fileText = await file.text();

    if (!fileText.trim()) {
      allLoanTypes = [...DEFAULT_LOAN_TYPES];
      await saveLoanTypes(allLoanTypes);
      renderLoanTypes();
      refreshLoanTypeSelects();
      return { fileWasCreated: true };
    }

    let parsed;
    try {
      parsed = JSON.parse(fileText);
    } catch (error) {
      allLoanTypes = [...DEFAULT_LOAN_TYPES];
      renderLoanTypes();
      refreshLoanTypeSelects();
      throw new Error(`${getSessionFileName('loanTypes')} contains invalid JSON. Falling back to default loan types.`);
    }

    const parsedTypes = Array.isArray(parsed)
      ? parsed.map(normalizeLoanType).filter(Boolean)
      : [];

    if (!parsedTypes.length) {
      allLoanTypes = [...DEFAULT_LOAN_TYPES];
      await saveLoanTypes(allLoanTypes);
      renderLoanTypes();
      refreshLoanTypeSelects();
      return { fileWasCreated: true };
    }

    const parsedTypeMap = new Map(
      parsedTypes.map((loanType) => [loanType.name.toLowerCase(), loanType])
    );

    const mergedTypes = DEFAULT_LOAN_TYPES.map((defaultType) => {
      const jsonType = parsedTypeMap.get(defaultType.name.toLowerCase());
      return jsonType || defaultType;
    });

    const defaultTypeNames = new Set(
      DEFAULT_LOAN_TYPES.map((loanType) => loanType.name.toLowerCase())
    );

    parsedTypes.forEach((loanType) => {
      if (!defaultTypeNames.has(loanType.name.toLowerCase())) {
        mergedTypes.push(loanType);
      }
    });

    allLoanTypes = mergedTypes;
    renderLoanTypes();
    refreshLoanTypeSelects();
    return { fileWasCreated: false };
  } catch (error) {
    if (error.name === 'NotFoundError') {
      allLoanTypes = [...DEFAULT_LOAN_TYPES];
      await saveLoanTypes(allLoanTypes);
      renderLoanTypes();
      refreshLoanTypeSelects();
      return { fileWasCreated: true };
    }

    if (error.message?.includes('invalid JSON')) {
      setMessage(error.message, 'warning');
      return { fileWasCreated: false };
    }

    throw new Error(`The loan types file could not be read: ${error.message}`);
  }
}

async function saveLoanTypes(loanTypes) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('loanTypes'), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(loanTypes, null, 2));
  await writable.close();
}

async function addCustomLoanType(name, activeFrom = null, activeTo = null) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw new Error('Enter a loan type name.');
  }

  const exists = allLoanTypes.some((type) => type.name.toLowerCase() === trimmedName.toLowerCase());
  if (exists) {
    throw new Error(`Loan type ${trimmedName} already exists.`);
  }

  if (activeFrom && activeTo && activeFrom > activeTo) {
    throw new Error('Loan type start date must be on or before the end date.');
  }

  const newType = normalizeLoanType({
    name: trimmedName,
    activeFrom: activeFrom || null,
    activeTo: activeTo || null,
    isBuiltIn: false,
    amountOptional: false
  });

  allLoanTypes.push(newType);
  await saveLoanTypes(allLoanTypes);
}

function getYesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function deactivateCustomLoanType(typeName) {
  const normalizedTypeName = String(typeName || '').trim().toLowerCase();
  const target = allLoanTypes.find((type) => type.name.toLowerCase() === normalizedTypeName);

  if (!target) {
    throw new Error(`Loan type ${typeName} was not found.`);
  }

  if (target.isBuiltIn) {
    throw new Error(`Built-in loan type ${typeName} cannot be removed.`);
  }

  target.activeTo = getYesterdayKey();
  await saveLoanTypes(allLoanTypes);
}

async function removeCustomLoanType(typeName) {
  const normalizedTypeName = String(typeName || '').trim().toLowerCase();
  const target = allLoanTypes.find((type) => type.name.toLowerCase() === normalizedTypeName);

  if (!target) {
    throw new Error(`Loan type ${typeName} was not found.`);
  }

  if (target.isBuiltIn) {
    throw new Error(`Built-in loan type ${typeName} cannot be removed.`);
  }

  allLoanTypes = allLoanTypes.filter(
    (type) => type.name.toLowerCase() !== normalizedTypeName
  );

  await saveLoanTypes(allLoanTypes);
}

function getBeforeRunDistribution(runningTotals, officers) {
  const cleanOfficers = [...new Set(officers.map((name) => name.trim()).filter(Boolean))];

  return cleanOfficers.map((officer) => {
    const stats = normalizeOfficerStats(runningTotals.officers?.[officer]);
    return {
      officer,
      loanCount: stats.loanCount,
      totalAmountRequested: stats.totalAmountRequested
    };
  });
}

function getAfterRunDistribution(result, officers, runningTotals) {
  const cleanOfficers = [...new Set(officers.map((name) => name.trim()).filter(Boolean))];

  return cleanOfficers.map((officer) => {
    const priorStats = normalizeOfficerStats(runningTotals.officers?.[officer]);
    const assignedLoans = result.officerAssignments?.[officer] || [];
    const assignedAmount = assignedLoans.reduce((sum, loan) => sum + getGoalAmountForLoan(loan), 0);

    return {
      officer,
      loanCount: priorStats.loanCount + assignedLoans.length,
      totalAmountRequested: priorStats.totalAmountRequested + assignedAmount
    };
  });
}

function getChartSegments(distribution, field) {
  const total = distribution.reduce((sum, entry) => sum + entry[field], 0);

  if (!total) {
    return distribution.map((entry) => ({
      officer: entry.officer,
      value: entry[field],
      percent: 0
    }));
  }

  return distribution.map((entry) => ({
    officer: entry.officer,
    value: entry[field],
    percent: entry[field] / total
  }));
}

function getDonutColor(index) {
  const palette = [
    '#126c45',
    '#d97706',
    '#2a4d84',
    '#8e44ad',
    '#c93d2b',
    '#0f9d58',
    '#7a8795',
    '#008b8b'
  ];

  return palette[index % palette.length];
}

function drawDonutChart(config) {
  const {
    title,
    distribution,
    field,
    valueFormatter
  } = config;

  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 320;

  const ctx = canvas.getContext('2d');
  const centerX = 120;
  const centerY = 130;
  const outerRadius = 70;
  const innerRadius = 40;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1c2430';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(title, 20, 28);

  const segments = getChartSegments(distribution, field);
  const totalValue = distribution.reduce((sum, entry) => sum + entry[field], 0);

  if (!totalValue) {
    ctx.fillStyle = '#5e6b7a';
    ctx.font = '14px Arial';
    ctx.fillText('No data available', 55, centerY);
    return { canvas, imageDataUrl: canvas.toDataURL('image/png') };
  }

  let startAngle = -Math.PI / 2;

  segments.forEach((segment, index) => {
    const angle = segment.percent * Math.PI * 2;
    const endAngle = startAngle + angle;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = getDonutColor(index);
    ctx.fill();

    startAngle = endAngle;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#1c2430';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Total', centerX, centerY - 4);
  ctx.font = 'bold 14px Arial';
  ctx.fillText(field === 'loanCount' ? String(totalValue) : valueFormatter(totalValue), centerX, centerY + 18);

  ctx.textAlign = 'left';
  let legendY = 60;

  segments.forEach((segment, index) => {
    const legendX = 215;
    ctx.fillStyle = getDonutColor(index);
    ctx.fillRect(legendX, legendY - 10, 12, 12);

    ctx.fillStyle = '#1c2430';
    ctx.font = '12px Arial';
    const percentLabel = `${(segment.percent * 100).toFixed(1)}%`;
    const valueLabel = valueFormatter(segment.value);
    ctx.fillText(`${segment.officer}`, legendX + 18, legendY);
    ctx.fillText(`${valueLabel} • ${percentLabel}`, legendX + 18, legendY + 14);

    legendY += 34;
  });

  return { canvas, imageDataUrl: canvas.toDataURL('image/png') };
}

function renderDistributionCharts(result, officers, runningTotals) {
  if (!distributionChartsEl) {
    return;
  }

  const beforeDistribution = getBeforeRunDistribution(runningTotals, officers);
  const afterDistribution = getAfterRunDistribution(result, officers, runningTotals);

  const chartConfigs = [
    {
      title: 'Loan Count Before Run',
      distribution: beforeDistribution,
      field: 'loanCount',
      valueFormatter: (value) => `${value} loans`
    },
    {
      title: 'Loan Count After Run',
      distribution: afterDistribution,
      field: 'loanCount',
      valueFormatter: (value) => `${value} loans`
    },
    {
      title: 'Goal Dollars Before Run',
      distribution: beforeDistribution,
      field: 'totalAmountRequested',
      valueFormatter: (value) => formatCurrency(value)
    },
    {
      title: 'Goal Dollars After Run',
      distribution: afterDistribution,
      field: 'totalAmountRequested',
      valueFormatter: (value) => formatCurrency(value)
    }
  ];

  distributionChartsEl.innerHTML = '';
  distributionChartsEl.className = 'distribution-charts';

  const chartImages = [];

  chartConfigs.forEach((config) => {
    const chartCard = document.createElement('div');
    chartCard.className = 'distribution-chart-card';

    const { canvas, imageDataUrl } = drawDonutChart(config);
    chartImages.push({
      title: config.title,
      imageDataUrl
    });

    chartCard.appendChild(canvas);
    distributionChartsEl.appendChild(chartCard);
  });

  result.distributionCharts = chartImages;
}

function renderLoanTypes() {
  if (!loanTypeListEl) {
    return;
  }

  const totalConfigured = allLoanTypes.length;
  const activeTypes = getActiveLoanTypes();
  const seasonalActiveCount = activeTypes.filter(
    (loanType) => loanType.activeFrom || loanType.activeTo
  ).length;

  if (loanTypeSummaryStatsEl) {
    loanTypeSummaryStatsEl.innerHTML = `
      <span class="badge">${totalConfigured} configured</span>
      <span class="badge">${activeTypes.length} active</span>
      <span class="badge">${seasonalActiveCount} seasonal active</span>
    `;
  }

  loanTypeListEl.innerHTML = '';
  loanTypeListEl.className = 'results';

  allLoanTypes.forEach((loanType) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'result-group';

    const isActive = isLoanTypeActive(loanType);
    const activeLabel = isActive ? 'Active' : 'Inactive';
    const seasonalLabel = loanType.activeFrom || loanType.activeTo ? 'Seasonal' : 'Always available';

    wrapper.innerHTML = `
      <div class="loan-type-card-top">
        <div class="loan-type-card-copy">
          <h3>${escapeHtml(loanType.name)} <span class="badge">${escapeHtml(activeLabel)}</span></h3>
          <div class="amount-summary">Availability: ${escapeHtml(seasonalLabel)}</div>
          <div class="amount-summary">Start: ${escapeHtml(loanType.activeFrom || 'Always')}</div>
          <div class="amount-summary">End: ${escapeHtml(loanType.activeTo || 'Always')}</div>
          <div class="amount-summary">Amount optional: ${loanType.amountOptional ? 'Yes' : 'No'}</div>
        </div>
      </div>
    `;

    if (!loanType.isBuiltIn) {
      const actionRow = document.createElement('div');
      actionRow.className = 'loan-type-action-row';

      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.textContent = isActive ? 'Deactivate' : 'Activate';
      toggleButton.className = `loan-type-action-btn ${isActive ? 'deactivate' : 'activate'}`;

      toggleButton.addEventListener('click', async () => {
        try {
          if (isActive) {
            await deactivateCustomLoanType(loanType.name);
            setMessage(`Loan type ${loanType.name} was deactivated.`, 'success');
          } else {
            await activateCustomLoanType(loanType.name);
            setMessage(`Loan type ${loanType.name} was activated.`, 'success');
          }

          renderLoanTypes();
          refreshLoanTypeSelects();
        } catch (error) {
          setMessage(error.message, 'warning');
        }
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.className = 'loan-type-remove-btn';
      removeButton.setAttribute('aria-label', `Remove ${loanType.name}`);

      removeButton.addEventListener('click', async () => {
        const confirmed = window.confirm(`Remove ${loanType.name} from available loan types?`);
        if (!confirmed) {
          return;
        }

        try {
          await removeCustomLoanType(loanType.name);
          const removedLoanCount = removeLoansWithType(loanType.name);
          setMessage(
            removedLoanCount
              ? `Loan type ${loanType.name} was removed, and ${removedLoanCount} loan row${removedLoanCount === 1 ? '' : 's'} using that type were deleted.`
              : `Loan type ${loanType.name} was removed.`,
            'success'
          );
          renderLoanTypes();
          refreshLoanTypeSelects();
        } catch (error) {
          setMessage(error.message, 'warning');
        }
      });

      actionRow.appendChild(toggleButton);
      actionRow.appendChild(removeButton);
      wrapper.appendChild(actionRow);
    }

    loanTypeListEl.appendChild(wrapper);
  });
}

async function activateCustomLoanType(typeName) {
  const normalizedTypeName = String(typeName || '').trim().toLowerCase();
  const target = allLoanTypes.find((type) => type.name.toLowerCase() === normalizedTypeName);

  if (!target) {
    throw new Error(`Loan type ${typeName} was not found.`);
  }

  if (target.isBuiltIn) {
    throw new Error(`Built-in loan type ${typeName} does not need activation.`);
  }

  const todayKey = getTodayKey();

  if (target.activeFrom && target.activeFrom > todayKey) {
    target.activeFrom = todayKey;
  }

  if (target.activeTo && target.activeTo < todayKey) {
    target.activeTo = null;
  }

  if (!target.activeFrom) {
    target.activeFrom = todayKey;
  }

  await saveLoanTypes(allLoanTypes);
}

async function ensureDemoDataSeeded() {
  const dataDirectoryHandle = await getActiveDataDirectoryHandle();
  const demoSeeds = [
    {
      fileName: getSessionFileName('loanTypes'),
      content: JSON.stringify(DEFAULT_DEMO_LOAN_TYPES, null, 2)
    },
    {
      fileName: getSessionFileName('runningTotals'),
      content: buildRunningTotalsCsv(createDemoRunningTotals())
    },
    {
      fileName: getSessionFileName('loanHistory'),
      content: buildLoanHistoryCsv(createDemoLoanHistory())
    },
    {
      fileName: getSessionFileName('simulationHistory'),
      content: 'generated_at,month,business_days,total_loans,total_goal_amount,seed,officers\n'
    }
  ];

  for (const demoSeed of demoSeeds) {
    try {
      await dataDirectoryHandle.getFileHandle(demoSeed.fileName);
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw error;
      }
      const fileHandle = await dataDirectoryHandle.getFileHandle(demoSeed.fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(demoSeed.content);
      await writable.close();
    }
  }
}

async function activateSessionInDirectory(directoryHandle, sessionMode = 'production') {
  outputDirectoryHandle = directoryHandle;
  isDemoMode = sessionMode === 'demo';

  if (sessionMode === 'production') {
    await saveOutputDirectoryHandle(directoryHandle);
  }

  if (isDemoMode) {
    await ensureDemoDataSeeded();
  }

  await loadLoanTypes();
  const { runningTotals, fileWasCreated } = await loadRunningTotals();
  await loadLoanHistory();
  const loadedOfficers = populateOfficersFromRunningTotals(runningTotals);
  renderLoadedRunningTotals(runningTotals);

  if (isDemoMode) {
    loadDemoLoansIntoForm();
  }

  updateFolderStatus();

  const demoLoanMessage = isDemoMode ? ` Loaded ${DEFAULT_DEMO_SESSION_LOANS.length} demo loans into Step 3.` : '';

  if (loadedOfficers) {
    setMessage(`${getSessionModeLabel()} is active in ${directoryHandle.name}. Loaded loan officer history from ${getSessionFileName('runningTotals')}.${demoLoanMessage}`, 'success');
    return;
  }

  if (fileWasCreated) {
    setMessage(`${getSessionModeLabel()} is active in ${directoryHandle.name}. Created ${getSessionFileName('runningTotals')}; enter loan officers to begin tracking history.${demoLoanMessage}`, 'success');
    return;
  }

  setMessage(`${getSessionModeLabel()} is active in ${directoryHandle.name}. ${getSessionFileName('runningTotals')} is ready and waiting for loan officers.${demoLoanMessage}`, 'success');
}

async function chooseOutputFolder(sessionMode = 'production') {
  if (isFolderPickerOpen) {
    return;
  }

  if (!supportsFolderSelection()) {
    setMessage(getUnsupportedFolderAccessMessage(), 'warning');
    updateFolderStatus();
    return;
  }

  isFolderPickerOpen = true;

  try {
    const directoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
      id: 'loan-randomizer-output-folder'
    });
    const hasPermission = await ensureDirectoryPermission(directoryHandle);

    if (!hasPermission) {
      setStepMessage('step1', 'Folder access was not granted. Please choose a folder and allow write access.', 'warning');
      return;
    }

    await activateSessionInDirectory(directoryHandle, sessionMode);
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }

    if (error.message?.includes('File picker already active')) {
      setMessage('The folder picker is already open. Please finish that selection first.', 'warning');
      return;
    }

    setMessage(`Unable to select an output folder: ${error.message}`, 'warning');
  } finally {
    isFolderPickerOpen = false;
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

function buildArchiveBackupFileName(fileName, date = new Date()) {
  const extensionIndex = fileName.lastIndexOf('.');
  const hasExtension = extensionIndex > 0;
  const fileBase = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex) : '';
  const timestamp = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}-${padNumber(date.getHours())}${padNumber(date.getMinutes())}${padNumber(date.getSeconds())}`;
  return `${fileBase}-backup-${timestamp}${extension}`;
}

async function preserveExistingArchiveFile(fileName) {
  try {
    const existingArchiveText = await readCsvFile(fileName);
    const backupFileName = buildArchiveBackupFileName(fileName, new Date());
    await writeCsvFile(backupFileName, existingArchiveText);
    return backupFileName;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
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
  return isAmountOptionalForType(loan.type) ? 0 : loan.amountRequested;
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
    type: isKnownLoanType(entry.type) ? entry.type : getAllLoanTypeNames()[0],
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
    typeCounts: Object.fromEntries(getAllLoanTypeNames().map((loanType) => [loanType, 0]))
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
    .forEach(([, entry]) => {
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

function buildSimulationHistoryCsv(historyEntries) {
  const rows = [
    'generated_at,month,business_days,total_loans,total_goal_amount,seed,officers'
  ];

  historyEntries.forEach((entry) => {
    rows.push([
      entry.generatedAt,
      entry.monthLabel,
      entry.businessDays,
      entry.totalLoans,
      entry.totalGoalAmount,
      entry.seed,
      entry.officers
    ].map(escapeCsvValue).join(','));
  });

  return `${rows.join('\n')}\n`;
}

function parseSimulationHistoryCsv(csvText) {
  const trimmedText = csvText.trim();

  if (!trimmedText) {
    return [];
  }

  const [headerLine, ...dataLines] = trimmedText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase());

  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));

    return {
      generatedAt: String(row.generated_at ?? '').trim(),
      monthLabel: String(row.month ?? '').trim(),
      businessDays: Number(row.business_days) || 0,
      totalLoans: Number(row.total_loans) || 0,
      totalGoalAmount: Number(row.total_goal_amount) || 0,
      seed: Number(row.seed) || 0,
      officers: String(row.officers ?? '').trim()
    };
  });
}

async function appendSimulationHistoryEntry(entry) {
  const simulationHistoryFileName = getSessionFileName('simulationHistory');
  let existingEntries = [];

  try {
    const existingCsv = await readCsvFile(simulationHistoryFileName);
    existingEntries = parseSimulationHistoryCsv(existingCsv);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      throw error;
    }
  }

  existingEntries.push({
    generatedAt: entry.generatedAt,
    monthLabel: entry.monthLabel,
    businessDays: entry.businessDays,
    totalLoans: entry.totalLoans,
    totalGoalAmount: entry.totalGoalAmount,
    seed: entry.seed,
    officers: entry.officers
  });

  await writeCsvFile(simulationHistoryFileName, buildSimulationHistoryCsv(existingEntries));
}

function normalizeTypeCounts(typeCounts = {}) {
  const allTypeNames = getAllLoanTypeNames();
  const normalized = Object.fromEntries(allTypeNames.map((typeName) => [typeName, 0]));

  Object.entries(typeCounts || {}).forEach(([typeName, count]) => {
    if (!normalized[typeName]) {
      normalized[typeName] = 0;
    }
    normalized[typeName] = Number.isFinite(Number(count)) && Number(count) >= 0 ? Number(count) : 0;
  });

  return normalized;
}

function buildRunningTotalsCsv(runningTotals) {
  const rows = [
    'officer,is_on_vacation,active_session_count,loan_count,total_amount_requested,type_counts_json'
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
        JSON.stringify(normalizedStats.typeCounts)
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

    let parsedTypeCounts = {};

    if (row.type_counts_json) {
      try {
        parsedTypeCounts = JSON.parse(row.type_counts_json);
      } catch (error) {
        parsedTypeCounts = {};
      }
    } else {
      parsedTypeCounts = {
        Personal: Number(row.personal_count),
        'Credit Card': Number(row.credit_card_count),
        Collateralized: Number(row.collateralized_count ?? row.internet_count)
      };
    }

    officers[officerName] = normalizeOfficerStats({
      isOnVacation: String(row.is_on_vacation).toLowerCase() === 'true',
      activeSessionCount: Number(row.active_session_count ?? (Number(row.loan_count) > 0 || Number(row.total_amount_requested) > 0 ? 1 : 0)),
      loanCount: Number(row.loan_count),
      totalAmountRequested: Number(row.total_amount_requested),
      typeCounts: parsedTypeCounts
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
    typeCounts: normalizeTypeCounts(stats.typeCounts || {})
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
    const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('runningTotals'));
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
    const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('loanHistory'));
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
      if (nextStats.typeCounts[loan.type] === undefined) {
        nextStats.typeCounts[loan.type] = 0;
      }
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

  const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('runningTotals'), { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(buildRunningTotalsCsv(runningTotals));
  await writable.close();
}

async function saveLoanHistory(loanHistory) {
  if (!outputDirectoryHandle) {
    throw new Error('No output folder has been selected.');
  }

  const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(getSessionFileName('loanHistory'), { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(buildLoanHistoryCsv(loanHistory));
  await writable.close();
}

async function readCsvFile(fileName) {
  const dataDirectoryHandle = await getActiveDataDirectoryHandle();
  const fileHandle = await dataDirectoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function readCsvFileFromMonth(fileName, monthKey) {
  if (!outputDirectoryHandle || !isValidMonthFolderKey(monthKey)) {
    throw new Error('A valid month in YYYY-MM format is required.');
  }

  const monthDirectoryHandle = await outputDirectoryHandle.getDirectoryHandle(monthKey);
  const fileHandle = await monthDirectoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeCsvFile(fileName, content) {
  const dataDirectoryHandle = await getActiveDataDirectoryHandle();
  const fileHandle = await dataDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function removeFile(fileName) {
  if (!outputDirectoryHandle) {
    return false;
  }

  try {
    const dataDirectoryHandle = await getActiveDataDirectoryHandle();
    if (typeof dataDirectoryHandle.removeEntry !== 'function') {
      return false;
    }
    await dataDirectoryHandle.removeEntry(fileName);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return false;
    }

    throw error;
  }
}

async function clearDemoDataFolder() {
  if (!outputDirectoryHandle) {
    throw new Error('Choose an output folder before clearing demo data.');
  }

  let demoDirectoryHandle;
  try {
    demoDirectoryHandle = await outputDirectoryHandle.getDirectoryHandle(DEMO_DATA_FOLDER_NAME);
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return 0;
    }
    throw error;
  }

  let removedEntries = 0;

  // eslint-disable-next-line no-restricted-syntax
  for await (const [entryName, entryHandle] of demoDirectoryHandle.entries()) {
    await demoDirectoryHandle.removeEntry(entryName, { recursive: entryHandle.kind === 'directory' });
    removedEntries += 1;
  }

  return removedEntries;
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

  const csvText = await readCsvFile(getSessionFileName('runningTotals'));
  const archiveFileName = buildArchivedRunningTotalsFileName(new Date());
  await preserveExistingArchiveFile(archiveFileName);
  await writeCsvFile(archiveFileName, csvText);
  await removeFile(getSessionFileName('runningTotals'));

  try {
    const loanHistoryText = await readCsvFile(getSessionFileName('loanHistory'));
    const loanHistoryArchiveFileName = `loan-randomizer-loan-history-${new Date().getFullYear()}-${padNumber(new Date().getMonth() + 1)}.csv`;
    await preserveExistingArchiveFile(loanHistoryArchiveFileName);
    await writeCsvFile(loanHistoryArchiveFileName, loanHistoryText);
    await removeFile(getSessionFileName('loanHistory'));
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      throw error;
    }
  }

  return archiveFileName;
}

function resetToInitialScreen() {
  outputDirectoryHandle = null;
  isDemoMode = false;
  allLoanTypes = [...DEFAULT_LOAN_TYPES];
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  loanAssignmentsEl.className = 'results empty';
  officerAssignmentsEl.className = 'results empty';
  fairnessAuditEl.className = 'results empty';
  loanAssignmentsEl.textContent = 'No assignments yet.';
  officerAssignmentsEl.textContent = 'No assignments yet.';
  fairnessAuditEl.textContent = 'No fairness audit yet.';

  if (distributionChartsEl) {
    distributionChartsEl.className = 'distribution-charts empty';
    distributionChartsEl.textContent = 'No distribution charts yet.';
  }

  if (distributionDetailsEl) {
    distributionDetailsEl.open = false;
  }

  addOfficer('Loan Officer 1');
  addOfficer('Loan Officer 2');
  addOfficer('Loan Officer 3');
  addLoan('Loan A', 'Collateralized', '15000');
  addLoan('Loan B', 'Personal', '4000');
  renderLoanTypes();
  updateFolderStatus();
}

async function resetAppAfterEndOfMonth() {
  await clearSavedOutputDirectoryHandle();
  resetToInitialScreen();
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
      cleanOfficers.map((currentOfficer) => [currentOfficer, officerTypeCounts[currentOfficer][loan.type] || 0])
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
      projectedTypeLoad: getNormalizedFairnessValue((officerTypeCounts[officer][loan.type] || 0) + 1, officerActiveSessions[officer]),
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

  if (result.distributionCharts?.length) {
    lines.push({ text: '', size: 11, gapAfter: 8 });
    lines.push({ text: 'Distribution Snapshot', size: 14, gapAfter: 10 });
    lines.push({ text: '__DISTRIBUTION_CHARTS__', size: 11, gapAfter: 0 });
  }

  return lines;
}

function writePdfLines(doc, lines, result = null, options = {}) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = 500;
  const left = 54;
  const top = 64;
  const bottom = 54;
  const logoDataUrl = options.logoDataUrl || null;
  let currentY = top;

  if (logoDataUrl) {
    const logoWidth = 120;
    const logoHeight = 48;
    doc.addImage(logoDataUrl, 'PNG', left, currentY, logoWidth, logoHeight);
    currentY += logoHeight + 18;
  }

  lines.forEach((line) => {
    if (line.text === '__DISTRIBUTION_CHARTS__') {
      const charts = result?.distributionCharts || [];

      charts.forEach((chart, index) => {
        const chartWidth = 240;
        const chartHeight = 210;
        const x = index % 2 === 0 ? 54 : pageWidth / 2 + 10;

        if (index % 2 === 0 && currentY + chartHeight > pageHeight - bottom) {
          doc.addPage();
          currentY = top;
        }

        doc.addImage(chart.imageDataUrl, 'PNG', x, currentY, chartWidth, chartHeight);

        if (index % 2 === 1) {
          currentY += chartHeight + 18;
        }
      });

      if ((charts.length % 2) === 1) {
        currentY += 228;
      }

      return;
    }

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
  const logoDataUrl = await getLogoImageDataUrl();
  writePdfLines(doc, buildPdfLines(result, officers, loans, generatedAt), result, { logoDataUrl });

  const pdfBlob = doc.output('blob');
  const fileName = buildPdfFileName(generatedAt);
  const fileHandle = await (await getActiveDataDirectoryHandle()).getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(pdfBlob);
  await writable.close();

  return fileName;
}

function assignLoans(officers, loans, runningTotals = { officers: {} }) {
  const activeLoanTypes = getActiveLoanTypeNames();

  const cleanOfficers = [...new Set(officers.map((name) => name.trim()).filter(Boolean))];
  const cleanLoans = loans
    .map((loan) => ({
      name: loan.name.trim(),
      type: loan.type,
      amountRequested: loan.amountRequested
    }))
    .filter((loan) => loan.name)
    .filter((loan) => activeLoanTypes.includes(loan.type));

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

  const hasInvalidAmount = cleanLoans.some((loan) => !isAmountOptionalForType(loan.type) && (!Number.isFinite(loan.amountRequested) || loan.amountRequested < 0));
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

  activeLoanTypes.forEach((loanType) => {
    const loansForType = shuffle(cleanLoans.filter((loan) => loan.type === loanType));

    if (!loansForType.length) {
      return;
    }

    const orderedLoansForType = [...loansForType].sort((loanA, loanB) => getGoalAmountForLoan(loanB) - getGoalAmountForLoan(loanA));

    orderedLoansForType.forEach((loan) => {
      const assignmentDecision = chooseOfficerForLoan(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, officerActiveSessions, loan);
      const assignedOfficer = assignmentDecision.selectedOfficer;

      officerAssignments[assignedOfficer].push(loan);

      if (officerTypeCounts[assignedOfficer][loanType] === undefined) {
        officerTypeCounts[assignedOfficer][loanType] = 0;
      }

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

    if (distributionChartsEl) {
      distributionChartsEl.className = 'distribution-charts empty';
      distributionChartsEl.textContent = 'No distribution charts yet.';
    }

    if (distributionDetailsEl) {
      distributionDetailsEl.open = false;
    }

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

    div.innerHTML = `
      <div><span class="assignment-name">${escapeHtml(entry.loan.name)}</span> <span class="type-badge">${escapeHtml(entry.loan.type)}</span></div>
      <div class="assignment-amount">Requested: ${escapeHtml(formatCurrency(entry.loan.amountRequested))}</div>
      <div>Assigned to: ${escapeHtml(entry.officers[0])}</div>
    `;

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
  return Object.entries(typeCounts || {})
    .filter(([, count]) => count > 0)
    .map(([loanType, count]) => `${loanType}: ${count}`)
    .join(' | ') || 'No types tracked';
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
  chooseOutputFolder('production');
}

function handleLaunchDemoModeClick(event) {
  event?.preventDefault();
  chooseOutputFolder('demo');
}

async function handleQuickLaunchDemoModeClick(event) {
  event?.preventDefault();

  if (!outputDirectoryHandle) {
    setStepMessage('step1', 'Choose an output folder before launching demo mode.', 'warning');
    return;
  }

  if (isDemoMode) {
    setMessage('Demo mode is already active.', 'success');
    return;
  }

  try {
    await activateSessionInDirectory(outputDirectoryHandle, 'demo');
  } catch (error) {
    setMessage(`Could not launch demo mode: ${error.message}`, 'warning');
  }
}

async function handleImportPriorMonthClick() {
  if (!outputDirectoryHandle) {
    setStepMessage('step1', 'Choose an output folder before importing officers from a prior month.', 'warning');
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

  try {
    let csvText;
    const archivedFileName = buildArchivedRunningTotalsFileNameFromKey(normalizedMonthKey);

    try {
      csvText = await readCsvFileFromMonth(getSessionFileName('runningTotals'), normalizedMonthKey);
    } catch (monthDirectoryError) {
      if (monthDirectoryError.name !== 'NotFoundError') {
        throw monthDirectoryError;
      }
      csvText = await readCsvFile(archivedFileName);
    }

    const priorMonthTotals = parseRunningTotalsCsv(csvText);
    const importedCount = appendOfficersFromRunningTotals(priorMonthTotals);

    if (!importedCount) {
      setMessage(`No new loan officers were found in ${normalizedMonthKey}.`, 'warning');
      return;
    }

    setMessage(`Imported ${importedCount} loan officer${importedCount === 1 ? '' : 's'} from ${normalizedMonthKey}.`, 'success');
  } catch (error) {
    if (error.name === 'NotFoundError') {
      setMessage(`Could not find running totals for ${normalizedMonthKey} in the selected output folder.`, 'warning');
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
launchDemoModeBtn?.addEventListener('click', handleLaunchDemoModeClick);
quickLaunchDemoModeBtn?.addEventListener('click', handleQuickLaunchDemoModeClick);
changeFolderBtn.addEventListener('click', handleChooseFolderClick);


addLoanTypeBtn?.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setStepMessage('step2', 'Choose an output folder before adding loan types.', 'warning');
    return;
  }

  try {
    await addCustomLoanType(
      loanTypeNameInput.value.trim(),
      loanTypeStartInput.value || null,
      loanTypeEndInput.value || null
    );

    loanTypeNameInput.value = '';
    loanTypeStartInput.value = '';
    loanTypeEndInput.value = '';

    renderLoanTypes();
    refreshLoanTypeSelects();
    setMessage('Loan type added successfully.', 'success');
  } catch (error) {
    setMessage(error.message, 'warning');
  }
});

endOfMonthBtn?.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setStepMessage('step1', 'Choose an output folder before ending the month.', 'warning');
    return;
  }

  const confirmed = window.confirm('Are you sure you want to end this month\'s loan tracking?');
  if (!confirmed) {
    return;
  }

  try {
    const archiveFileName = await archiveRunningTotalsForEndOfMonth();
    await resetAppAfterEndOfMonth();
    setMessage(`Loan tracking archived to ${archiveFileName}. Choose Output Folder to start the next month.`, 'success');
  } catch (error) {
    setMessage(`Could not complete End of Month: ${error.message}`, 'warning');
  }
});

endDemoModeBtn?.addEventListener('click', () => {
  if (!isDemoMode) {
    return;
  }

  const confirmed = window.confirm('End Demo Mode and reset the screen? This will not modify demo files.');
  if (!confirmed) {
    return;
  }

  resetToInitialScreen();
  setMessage('Demo mode ended. The app has been reset to the initial screen.', 'success');
});

clearDemoDataBtn?.addEventListener('click', async () => {
  if (!isDemoMode || !outputDirectoryHandle) {
    setMessage('Launch Demo Mode before clearing demo data.', 'warning');
    return;
  }

  const confirmed = window.confirm('Clear all files in /demo-data and end Demo Mode? This cannot be undone.');
  if (!confirmed) {
    return;
  }

  try {
    const removedEntries = await clearDemoDataFolder();
    resetToInitialScreen();
    setMessage(`Cleared ${removedEntries} item${removedEntries === 1 ? '' : 's'} from /${DEMO_DATA_FOLDER_NAME}. Demo mode ended and the app was reset.`, 'success');
  } catch (error) {
    setMessage(`Could not clear demo data: ${error.message}`, 'warning');
  }
});

randomizeBtn.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setStepMessage('step1', 'Choose an output folder before randomizing assignments.', 'warning');
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

  renderDistributionCharts(result, officers, runningTotals);

  try {
    const generatedAt = new Date();
    const updatedRunningTotals = buildUpdatedRunningTotals([...new Set(officers.map((name) => name.trim()).filter(Boolean))], result, runningTotals);
    result.updatedRunningTotals = buildRunningTotalsWithCurrentOfficerStatuses(updatedRunningTotals);
    const fileName = await saveResultPdf(result, officers, loans, generatedAt);
    await saveRunningTotals(result.updatedRunningTotals);
    await saveLoanHistory(buildUpdatedLoanHistory(result, generatedAt, loanHistory));
    setMessage(`Assignments randomized and saved to ${fileName}. Officer history was updated in ${getSessionFileName('runningTotals')}, and loan history was updated in ${getSessionFileName('loanHistory')}.`, 'success');
  } catch (error) {
    setMessage(`Assignments were generated, but the files could not be fully saved: ${error.message}`, 'warning');
  }
});

removeLoanHistoryBtn?.addEventListener('click', async () => {
  if (!outputDirectoryHandle) {
    setStepMessage('step1', 'Choose an output folder before removing loan history.', 'warning');
    return;
  }

  const loanName = window.prompt('Enter the loan name or ID to remove from history.');

  if (loanName === null) {
    return;
  }

  try {
    await removeLoanFromHistory(loanName.trim());
    setMessage(`Removed ${loanName.trim()} from ${getSessionFileName('loanHistory')}.`, 'success');
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

  if (distributionChartsEl) {
    distributionChartsEl.className = 'distribution-charts empty';
    distributionChartsEl.textContent = 'No distribution charts yet.';
  }

  if (distributionDetailsEl) {
    distributionDetailsEl.open = false;
  }

  addOfficer();
  addOfficer();
  addOfficer();
  addOfficer();
});

(async function initializeApp() {
  renderLoanTypes();

  if (distributionChartsEl) {
    distributionChartsEl.className = 'distribution-charts empty';
    distributionChartsEl.textContent = 'No distribution charts yet.';
  }

  const restoredSavedFolder = await tryRestoreSavedOutputFolder();
  if (restoredSavedFolder) {
    return;
  }

  addOfficer('Loan Officer 1');
  addOfficer('Loan Officer 2');
  addOfficer('Loan Officer 3');
  addLoan('Loan A', 'Collateralized', '15000');
  addLoan('Loan B', 'Personal', '4000');
  updateFolderStatus();
})();
