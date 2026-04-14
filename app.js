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
const messageEl = document.getElementById('message');
const outputStepEl = document.getElementById('outputStep');
const outputStepCompactEl = document.getElementById('outputStepCompact');
const outputStepDetailsEl = document.getElementById('outputStepDetails');
const folderStatusEl = document.getElementById('folderStatus');
const folderPromptEl = document.getElementById('folderPrompt');
const loanAssignmentsEl = document.getElementById('loanAssignments');
const officerAssignmentsEl = document.getElementById('officerAssignments');

let outputDirectoryHandle = null;
const LOAN_TYPES = ['Auto', 'Personal', 'Credit Card', 'Internet'];
const RUNNING_TOTALS_FILE_NAME = 'loan-randomizer-running-totals.csv';

function createInputRow(type, value = '', loanType = LOAN_TYPES[0], amount = '') {
  const row = document.createElement('div');
  row.className = type === 'loan' ? 'row loan-row' : 'row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'officer' ? 'Loan officer name' : 'Loan name or ID';
  input.value = value;

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

    row.appendChild(input);
    row.appendChild(amountInput);
    row.appendChild(typeSelect);
    row.appendChild(removeBtn);
    return row;
  }

  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

function addOfficer(value = '') {
  officerList.appendChild(createInputRow('officer', value));
}

function addLoan(value = '', loanType = LOAN_TYPES[0], amount = '') {
  loanList.appendChild(createInputRow('loan', value, loanType, amount));
}

function getOfficerValues() {
  return [...officerList.querySelectorAll('input')]
    .map((input) => input.value.trim())
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
        amountRequested: amountValue === '' ? null : Number(amountValue)
      };
    })
    .filter((loan) => loan.name);
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

function formatCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(amount);
}

function createEmptyOfficerStats() {
  return {
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

function buildRunningTotalsCsv(runningTotals) {
  const rows = [
    'officer,loan_count,total_amount_requested,auto_count,personal_count,credit_card_count,internet_count'
  ];

  Object.entries(runningTotals.officers || {})
    .sort(([officerA], [officerB]) => officerA.localeCompare(officerB))
    .forEach(([officer, stats]) => {
      const normalizedStats = normalizeOfficerStats(stats);
      rows.push([
        officer,
        normalizedStats.loanCount,
        normalizedStats.totalAmountRequested,
        normalizedStats.typeCounts.Auto,
        normalizedStats.typeCounts.Personal,
        normalizedStats.typeCounts['Credit Card'],
        normalizedStats.typeCounts.Internet
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
      loanCount: Number(row.loan_count),
      totalAmountRequested: Number(row.total_amount_requested),
      typeCounts: {
        Auto: Number(row.auto_count),
        Personal: Number(row.personal_count),
        'Credit Card': Number(row.credit_card_count),
        Internet: Number(row.internet_count)
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

  officerNames.forEach(addOfficer);
  return true;
}

function appendOfficersFromRunningTotals(runningTotals) {
  const officerNames = Object.keys(runningTotals.officers || {}).sort((officerA, officerB) => officerA.localeCompare(officerB));
  const existingOfficerNames = new Set(getOfficerValues());

  if (!existingOfficerNames.size) {
    officerList.innerHTML = '';
  }

  let importedCount = 0;

  officerNames.forEach((officer) => {
    if (existingOfficerNames.has(officer)) {
      return;
    }

    addOfficer(officer);
    existingOfficerNames.add(officer);
    importedCount += 1;
  });

  if (!getOfficerValues().length) {
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

function buildUpdatedRunningTotals(cleanOfficers, result, priorRunningTotals) {
  const updatedOfficers = Object.fromEntries(
    Object.entries(priorRunningTotals.officers || {}).map(([officer, stats]) => [officer, normalizeOfficerStats(stats)])
  );

  cleanOfficers.forEach((officer) => {
    const priorStats = normalizeOfficerStats(updatedOfficers[officer]);
    const assignedLoans = result.officerAssignments[officer] || [];
    const nextStats = {
      loanCount: priorStats.loanCount + assignedLoans.length,
      totalAmountRequested: priorStats.totalAmountRequested + assignedLoans.reduce((sum, loan) => sum + loan.amountRequested, 0),
      typeCounts: { ...priorStats.typeCounts }
    };

    assignedLoans.forEach((loan) => {
      nextStats.typeCounts[loan.type] += 1;
    });

    updatedOfficers[officer] = nextStats;
  });

  return { officers: updatedOfficers };
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

async function archiveRunningTotalsForEndOfMonth() {
  if (!outputDirectoryHandle) {
    throw new Error('Choose an output folder before ending the month.');
  }

  const csvText = await readCsvFile(RUNNING_TOTALS_FILE_NAME);
  const archiveFileName = buildArchivedRunningTotalsFileName(new Date());
  await writeCsvFile(archiveFileName, csvText);
  await removeFile(RUNNING_TOTALS_FILE_NAME);
  return archiveFileName;
}

function resetAppAfterEndOfMonth() {
  outputDirectoryHandle = null;
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  loanAssignmentsEl.className = 'results empty';
  officerAssignmentsEl.className = 'results empty';
  loanAssignmentsEl.textContent = 'No assignments yet.';
  officerAssignmentsEl.textContent = 'No assignments yet.';
  addOfficer('Loan Officer 1');
  addOfficer('Loan Officer 2');
  addOfficer('Loan Officer 3');
  addOfficer('Loan Officer 4');
  addLoan('Loan A', 'Auto', '15000');
  addLoan('Loan B', 'Internet', '4000');
  updateFolderStatus();
}

function getDistinctTypeCount(typeCounts) {
  return Object.values(typeCounts).filter((count) => count > 0).length;
}

function hasLargeDollarImbalance(officerAmountTotals) {
  const totals = Object.values(officerAmountTotals);

  if (totals.length < 2) {
    return false;
  }

  const highestTotal = Math.max(...totals);
  if (highestTotal <= 0) {
    return false;
  }

  return totals.some((total) => total < highestTotal * 0.5);
}

function chooseOfficerForLoan(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, loanType) {
  const shuffledOfficers = shuffle(cleanOfficers);
  const prioritizeDollarCatchUp = hasLargeDollarImbalance(officerAmountTotals);
  const sortedOfficers = shuffledOfficers.sort((officerA, officerB) => {
    if (prioritizeDollarCatchUp) {
      const amountDifference = officerAmountTotals[officerA] - officerAmountTotals[officerB];
      if (amountDifference !== 0) {
        return amountDifference;
      }

      const totalLoanDifference = officerLoanTotals[officerA] - officerLoanTotals[officerB];
      if (totalLoanDifference !== 0) {
        return totalLoanDifference;
      }

      const typeCountDifference = officerTypeCounts[officerA][loanType] - officerTypeCounts[officerB][loanType];
      if (typeCountDifference !== 0) {
        return typeCountDifference;
      }

      return getDistinctTypeCount(officerTypeCounts[officerA]) - getDistinctTypeCount(officerTypeCounts[officerB]);
    }

    const typeCountDifference = officerTypeCounts[officerA][loanType] - officerTypeCounts[officerB][loanType];
    if (typeCountDifference !== 0) {
      return typeCountDifference;
    }

    const amountDifference = officerAmountTotals[officerA] - officerAmountTotals[officerB];
    if (amountDifference !== 0) {
      return amountDifference;
    }

    const totalLoanDifference = officerLoanTotals[officerA] - officerLoanTotals[officerB];
    if (totalLoanDifference !== 0) {
      return totalLoanDifference;
    }

    return getDistinctTypeCount(officerTypeCounts[officerA]) - getDistinctTypeCount(officerTypeCounts[officerB]);
  });

  return sortedOfficers[0];
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

  const hasInvalidAmount = cleanLoans.some((loan) => !Number.isFinite(loan.amountRequested) || loan.amountRequested < 0);
  if (hasInvalidAmount) {
    return { error: 'Each loan must include a valid non-negative Amount Requested.' };
  }

  const officerAssignments = {};
  const officerTypeCounts = {};
  const officerAmountTotals = {};
  const officerLoanTotals = {};

  cleanOfficers.forEach((officer) => {
    const priorStats = normalizeOfficerStats(runningTotals.officers?.[officer]);
    officerAssignments[officer] = [];
    officerTypeCounts[officer] = { ...priorStats.typeCounts };
    officerAmountTotals[officer] = priorStats.totalAmountRequested;
    officerLoanTotals[officer] = priorStats.loanCount;
  });

  const loanAssignments = [];

  LOAN_TYPES.forEach((loanType) => {
    const loansForType = shuffle(cleanLoans.filter((loan) => loan.type === loanType));

    if (!loansForType.length) {
      return;
    }

    const orderedLoansForType = [...loansForType].sort((loanA, loanB) => loanB.amountRequested - loanA.amountRequested);

    orderedLoansForType.forEach((loan) => {
      const assignedOfficer = chooseOfficerForLoan(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, loanType);
      officerAssignments[assignedOfficer].push(loan);
      officerTypeCounts[assignedOfficer][loanType] += 1;
      officerAmountTotals[assignedOfficer] += loan.amountRequested;
      officerLoanTotals[assignedOfficer] += 1;
      loanAssignments.push({
        loan,
        officers: [assignedOfficer],
        shared: false
      });
    });
  });

  return {
    loanAssignments: shuffle(loanAssignments),
    officerAssignments,
    runningTotalsUsed: Object.fromEntries(cleanOfficers.map((officer) => [officer, normalizeOfficerStats(runningTotals.officers?.[officer])]))
  };
}

function renderResults(result) {
  if (result.error) {
    setMessage(result.error, 'warning');
    loanAssignmentsEl.className = 'results empty';
    officerAssignmentsEl.className = 'results empty';
    loanAssignmentsEl.textContent = 'No assignments yet.';
    officerAssignmentsEl.textContent = 'No assignments yet.';
    return;
  }

  setMessage('');

  loanAssignmentsEl.className = 'results';
  officerAssignmentsEl.className = 'results';

  loanAssignmentsEl.innerHTML = '';
  officerAssignmentsEl.innerHTML = '';

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

    const totalAmount = assignedLoans.reduce((sum, loan) => sum + loan.amountRequested, 0);
    const priorStats = normalizeOfficerStats(result.runningTotalsUsed?.[officer]);
    const newRunningAmount = priorStats.totalAmountRequested + totalAmount;

    const badge = `<span class="badge">${assignedLoans.length} assigned</span>`;
    group.innerHTML = `<h3>${escapeHtml(officer)} ${badge}</h3><div class="amount-summary">This run: ${escapeHtml(formatCurrency(totalAmount))}</div><div class="amount-summary">Running total: ${escapeHtml(formatCurrency(newRunningAmount))}</div>`;

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
      <div class="assignment-amount">Running total: ${escapeHtml(formatCurrency(stats.totalAmountRequested))}</div>
      <div>Loans tracked: ${escapeHtml(String(stats.loanCount))}</div>
      <div class="assignment-amount">Types: ${escapeHtml(formatTypeCounts(stats.typeCounts))}</div>
    `;
    loanAssignmentsEl.appendChild(loanSummary);

    const officerSummary = document.createElement('div');
    officerSummary.className = 'result-group';
    officerSummary.innerHTML = `
      <h3>${escapeHtml(officer)} <span class="badge">${escapeHtml(String(stats.loanCount))} tracked</span></h3>
      <div class="amount-summary">Running total: ${escapeHtml(formatCurrency(stats.totalAmountRequested))}</div>
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

  const officers = getOfficerValues();
  const loans = getLoanValues();

  let runningTotals;

  try {
    ({ runningTotals } = await loadRunningTotals());
  } catch (error) {
    setMessage(error.message, 'warning');
    return;
  }

  const result = assignLoans(officers, loans, runningTotals);
  renderResults(result);

  if (result.error) {
    return;
  }

  try {
    const generatedAt = new Date();
    const fileName = await saveResultPdf(result, officers, loans, generatedAt);
    const updatedRunningTotals = buildUpdatedRunningTotals([...new Set(officers.map((name) => name.trim()).filter(Boolean))], result, runningTotals);
    await saveRunningTotals(updatedRunningTotals);
    setMessage(`Assignments randomized and saved to ${fileName}. Officer history was updated in ${RUNNING_TOTALS_FILE_NAME}.`, 'success');
  } catch (error) {
    setMessage(`Assignments were generated, but the files could not be fully saved: ${error.message}`, 'warning');
  }
});

sampleBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';

  ['Alex', 'Brooke', 'Chris', 'Dana'].forEach(addOfficer);
  [
    ['Loan 101', 'Auto', '25000'],
    ['Loan 102', 'Auto', '18000'],
    ['Loan 103', 'Personal', '7500'],
    ['Loan 104', 'Credit Card', '3200'],
    ['Loan 105', 'Personal', '6800'],
    ['Loan 106', 'Credit Card', '4100'],
    ['Loan 107', 'Internet', '9200']
  ].forEach(([loanName, loanType, loanAmount]) => addLoan(loanName, loanType, loanAmount));

  const result = assignLoans(getOfficerValues(), getLoanValues());
  renderResults(result);
});

clearBtn.addEventListener('click', () => {
  officerList.innerHTML = '';
  loanList.innerHTML = '';
  setMessage('');
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
addLoan('Loan A', 'Auto', '15000');
addLoan('Loan B', 'Internet', '4000');
updateFolderStatus();
