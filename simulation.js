(function initializeFairnessSimulationFeature() {
  const COUNT_VARIANCE_THRESHOLD_PERCENT = 15;
  const AMOUNT_VARIANCE_THRESHOLD_PERCENT = 20;
  const DEFAULT_EOM_GOAL_PER_OFFICER = 100000;
  const DEFAULT_BUSINESS_DAYS = 22;
  const DEFAULT_MIN_LOANS_PER_DAY = 8;
  const DEFAULT_MAX_LOANS_PER_DAY = 16;

  const simulationModalEl = document.getElementById('simulationModal');
  const simulationFormEl = document.getElementById('simulationForm');
  const runSimulationBtn = document.getElementById('runSimulationBtn');
  const closeSimulationModalBtn = document.getElementById('closeSimulationModalBtn');
  const cancelSimulationBtn = document.getElementById('cancelSimulationBtn');
  const simulationMonthInput = document.getElementById('simulationMonthInput');
  const simulationBusinessDaysInput = document.getElementById('simulationBusinessDaysInput');
  const simulationMinLoansInput = document.getElementById('simulationMinLoansInput');
  const simulationMaxLoansInput = document.getElementById('simulationMaxLoansInput');
  const simulationEomGoalInput = document.getElementById('simulationEomGoalInput');
  const simulationOfficerNameInput = document.getElementById('simulationOfficerNameInput');
  const simulationAddOfficerBtn = document.getElementById('simulationAddOfficerBtn');
  const simulationOfficerListEl = document.getElementById('simulationOfficerList');
  const simulationModalMessageEl = document.getElementById('simulationModalMessage');
  const simulationOfficerState = [];

  function getCurrentMonthKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function setSimulationModalMessage(text = '', tone = 'warning') {
    if (!simulationModalMessageEl) {
      return;
    }

    simulationModalMessageEl.textContent = text;
    simulationModalMessageEl.dataset.tone = text ? tone : '';
  }

  function populateSimulationDefaults() {
    if (simulationMonthInput) {
      simulationMonthInput.value = getCurrentMonthKey();
    }
    if (simulationBusinessDaysInput) {
      simulationBusinessDaysInput.value = String(DEFAULT_BUSINESS_DAYS);
    }
    if (simulationMinLoansInput) {
      simulationMinLoansInput.value = String(DEFAULT_MIN_LOANS_PER_DAY);
    }
    if (simulationMaxLoansInput) {
      simulationMaxLoansInput.value = String(DEFAULT_MAX_LOANS_PER_DAY);
    }
    if (simulationEomGoalInput) {
      simulationEomGoalInput.value = String(DEFAULT_EOM_GOAL_PER_OFFICER);
    }
  }

  function getOfficerValuesForSimulationSeed() {
    return [...officerList.querySelectorAll('.officer-row')]
      .map((row) => row.querySelector('input')?.value?.trim() || '')
      .filter(Boolean);
  }

  function renderSimulationOfficerList() {
    if (!simulationOfficerListEl) {
      return;
    }

    simulationOfficerListEl.innerHTML = '';

    if (!simulationOfficerState.length) {
      simulationOfficerListEl.className = 'stack results empty';
      simulationOfficerListEl.textContent = 'No simulation officers yet. Add at least one officer to run the simulation.';
      return;
    }

    simulationOfficerListEl.className = 'stack';

    simulationOfficerState.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'simulation-officer-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = entry.name;
      nameInput.placeholder = 'Loan officer name';
      nameInput.setAttribute('aria-label', 'Simulation loan officer name');
      nameInput.addEventListener('input', () => {
        simulationOfficerState[index].name = nameInput.value.trim();
      });

      const vacationInput = document.createElement('input');
      vacationInput.type = 'number';
      vacationInput.min = '0';
      vacationInput.step = '1';
      vacationInput.value = String(entry.vacationDays);
      vacationInput.placeholder = '0';
      vacationInput.setAttribute('aria-label', 'Vacation days in month');
      vacationInput.addEventListener('input', () => {
        const rawDays = Number.parseInt(vacationInput.value || '0', 10);
        simulationOfficerState[index].vacationDays = Number.isFinite(rawDays) && rawDays >= 0 ? rawDays : 0;
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove ${entry.name || 'simulation officer'}`);
      removeBtn.addEventListener('click', () => {
        simulationOfficerState.splice(index, 1);
        renderSimulationOfficerList();
      });

      row.appendChild(nameInput);
      row.appendChild(vacationInput);
      row.appendChild(removeBtn);
      simulationOfficerListEl.appendChild(row);
    });
  }

  function seedSimulationOfficerStateFromMainScreen() {
    simulationOfficerState.length = 0;

    getOfficerValuesForSimulationSeed().forEach((name) => {
      simulationOfficerState.push({ name, vacationDays: 0 });
    });

    renderSimulationOfficerList();
  }

  function handleAddSimulationOfficer() {
    const name = simulationOfficerNameInput?.value?.trim() || '';

    if (!name) {
      setSimulationModalMessage('Enter a simulation officer name before adding.', 'warning');
      simulationOfficerNameInput?.focus();
      return;
    }

    simulationOfficerState.push({ name, vacationDays: 0 });
    if (simulationOfficerNameInput) {
      simulationOfficerNameInput.value = '';
    }

    setSimulationModalMessage('');
    renderSimulationOfficerList();
  }

  function openSimulationModal() {
    if (!simulationModalEl) {
      return;
    }

    populateSimulationDefaults();
    if (!simulationOfficerState.length) {
      seedSimulationOfficerStateFromMainScreen();
    }
    renderSimulationOfficerList();
    setSimulationModalMessage('');
    simulationModalEl.hidden = false;
    simulationMonthInput?.focus();
  }

  function closeSimulationModal() {
    if (!simulationModalEl) {
      return;
    }

    simulationModalEl.hidden = true;
    setSimulationModalMessage('');
  }

  function preventEnterSubmit(event) {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault();
    }
  }

  function createSeededRandom(seed) {
    let state = Math.trunc(seed) || 1;

    return function seededRandom() {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleWithRandom(items, randomFn) {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomFn() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
  }

  function chooseOfficerForLoanWithRandom(cleanOfficers, officerLoanTotals, officerTypeCounts, officerAmountTotals, officerActiveSessions, loan, randomFn) {
    const goalAmount = getGoalAmountForLoan(loan);
    const shuffledOfficers = shuffleWithRandom(cleanOfficers, randomFn);

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

  function assignLoansWithRandom(officers, loans, runningTotals, randomFn) {
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

    if (!cleanOfficers.length) {
      return { error: 'Please add at least one loan officer before running a fairness simulation.' };
    }

    if (!cleanLoans.length) {
      return { error: 'The fairness simulation could not generate any loans.' };
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
      const loansForType = shuffleWithRandom(cleanLoans.filter((loan) => loan.type === loanType), randomFn);

      if (!loansForType.length) {
        return;
      }

      const orderedLoansForType = [...loansForType].sort((loanA, loanB) => getGoalAmountForLoan(loanB) - getGoalAmountForLoan(loanA));

      orderedLoansForType.forEach((loan) => {
        const assignmentDecision = chooseOfficerForLoanWithRandom(
          cleanOfficers,
          officerLoanTotals,
          officerTypeCounts,
          officerAmountTotals,
          officerActiveSessions,
          loan,
          randomFn
        );

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
      loanAssignments: shuffleWithRandom(loanAssignments, randomFn),
      officerAssignments,
      fairnessAudit,
      runningTotalsUsed: Object.fromEntries(cleanOfficers.map((officer) => [officer, normalizeOfficerStats(runningTotals.officers?.[officer])]))
    };
  }

  function getDefaultAmountRange(loanType) {
    const normalizedType = String(loanType || '').toLowerCase();

    if (normalizedType === 'credit card') {
      return { min: 500, max: 8000 };
    }

    if (normalizedType === 'personal') {
      return { min: 1000, max: 15000 };
    }

    if (normalizedType === 'collateralized') {
      return { min: 8000, max: 45000 };
    }

    return { min: 1000, max: 25000 };
  }

  function chooseSimulatedLoanType(activeTypes, randomFn) {
    if (!activeTypes.length) {
      return 'Collateralized';
    }

    const weightedTypes = activeTypes.map((typeName) => {
      const normalizedType = String(typeName).toLowerCase();

      if (normalizedType === 'credit card') {
        return { typeName, weight: 0.35 };
      }

      if (normalizedType === 'personal') {
        return { typeName, weight: 0.4 };
      }

      if (normalizedType === 'collateralized') {
        return { typeName, weight: 0.25 };
      }

      return { typeName, weight: 1 / activeTypes.length };
    });

    const totalWeight = weightedTypes.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = randomFn() * totalWeight;

    for (const entry of weightedTypes) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        return entry.typeName;
      }
    }

    return weightedTypes[weightedTypes.length - 1].typeName;
  }

  function generateBusinessDates(monthLabel, businessDays) {
    const [year, month] = String(monthLabel || '').split('-').map(Number);

    if (!year || !month) {
      throw new Error('Enter the simulation month in YYYY-MM format.');
    }

    const dates = [];
    const currentDate = new Date(year, month - 1, 1);

    while (dates.length < businessDays) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function generateSimulatedLoansForDate(date, loanCount, activeTypes, randomFn, startingSequence) {
    const loans = [];
    let sequence = startingSequence;

    for (let index = 0; index < loanCount; index += 1) {
      const loanType = chooseSimulatedLoanType(activeTypes, randomFn);
      const amountRange = getDefaultAmountRange(loanType);
      const rawAmount = amountRange.min + ((amountRange.max - amountRange.min) * randomFn());
      const roundedAmount = Math.round(rawAmount / 100) * 100;
      const paddedSequence = String(sequence).padStart(4, '0');

      loans.push({
        name: `SIM-${formatDateKey(date).replaceAll('-', '')}-${paddedSequence}`,
        type: loanType,
        amountRequested: roundedAmount
      });

      sequence += 1;
    }

    return loans;
  }

  function cloneRunningTotals(runningTotals) {
    return {
      officers: Object.fromEntries(
        Object.entries(runningTotals.officers || {}).map(([officer, stats]) => [officer, normalizeOfficerStats(stats)])
      )
    };
  }

  function getSimulationConfigFromModal() {
    const monthLabel = simulationMonthInput?.value?.trim() || '';
    const businessDays = Number.parseInt(simulationBusinessDaysInput?.value || '', 10);
    const minLoansPerDay = Number.parseInt(simulationMinLoansInput?.value || '', 10);
    const maxLoansPerDay = Number.parseInt(simulationMaxLoansInput?.value || '', 10);
    const eomGoalPerOfficer = Number.parseFloat(simulationEomGoalInput?.value || '');
    const seed = Date.now();
    const simulationOfficers = simulationOfficerState
      .map((entry) => ({
        name: String(entry.name || '').trim(),
        vacationDays: Number.isFinite(entry.vacationDays) ? Math.max(0, Math.trunc(entry.vacationDays)) : 0
      }))
      .filter((entry) => entry.name);

    const seenNames = new Set();
    simulationOfficers.forEach((entry) => {
      const normalizedName = entry.name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        throw new Error(`Simulation officer ${entry.name} is duplicated. Use each name once.`);
      }
      seenNames.add(normalizedName);
    });

    if (!/^\d{4}-\d{2}$/.test(monthLabel)) {
      throw new Error('Enter the simulation month in YYYY-MM format.');
    }

    if (!Number.isFinite(businessDays) || businessDays <= 0) {
      throw new Error('Business days must be a positive whole number.');
    }

    if (!Number.isFinite(minLoansPerDay) || minLoansPerDay <= 0) {
      throw new Error('Minimum loans per day must be a positive whole number.');
    }

    if (!Number.isFinite(maxLoansPerDay) || maxLoansPerDay < minLoansPerDay) {
      throw new Error('Maximum loans per day must be greater than or equal to the minimum.');
    }

    if (!Number.isFinite(eomGoalPerOfficer) || eomGoalPerOfficer < 0) {
      throw new Error('End-of-month goal dollars must be zero or greater.');
    }

    if (!simulationOfficers.length) {
      throw new Error('Add at least one simulation officer before running the fairness simulation.');
    }

    const maxVacationDays = Math.max(0, businessDays - 1);
    simulationOfficers.forEach((entry) => {
      if (entry.vacationDays > maxVacationDays) {
        throw new Error(`Vacation days for ${entry.name} cannot exceed ${maxVacationDays} for this setup.`);
      }
    });

    return {
      monthLabel,
      simulationOfficers,
      officerNames: simulationOfficers.map((entry) => entry.name),
      businessDays,
      minLoansPerDay,
      maxLoansPerDay,
      eomGoalPerOfficer,
      seed
    };
  }

  function getRandomInteger(randomFn, min, max) {
    return Math.floor(randomFn() * (max - min + 1)) + min;
  }

  function buildSimulationOfficerStats(officers, loanHistoryEntries, eomGoalPerOfficer) {
    return officers.map((officer) => {
      const assignedLoans = loanHistoryEntries.filter((entry) => entry.assignedOfficer === officer);
      const totalLoans = assignedLoans.length;
      const totalAmount = assignedLoans.reduce((sum, entry) => sum + getGoalAmountForLoan(entry.loan), 0);
      const typeBreakdown = assignedLoans.reduce((counts, entry) => {
        counts[entry.loan.type] = (counts[entry.loan.type] || 0) + 1;
        return counts;
      }, {});

      return {
        officer,
        totalLoans,
        totalAmount,
        averageLoanAmount: totalLoans ? totalAmount / totalLoans : 0,
        percentOfGoal: eomGoalPerOfficer > 0 ? (totalAmount / eomGoalPerOfficer) * 100 : 0,
        typeBreakdown
      };
    });
  }

  function buildSimulationFairnessSummary(officerStats) {
    const loanCounts = officerStats.map((entry) => entry.totalLoans);
    const dollarAmounts = officerStats.map((entry) => entry.totalAmount);
    const averageLoanCount = loanCounts.length
      ? loanCounts.reduce((sum, value) => sum + value, 0) / loanCounts.length
      : 0;
    const averageDollarAmount = dollarAmounts.length
      ? dollarAmounts.reduce((sum, value) => sum + value, 0) / dollarAmounts.length
      : 0;

    const highestLoanCount = Math.max(...loanCounts, 0);
    const lowestLoanCount = Math.min(...loanCounts, 0);
    const highestDollarAmount = Math.max(...dollarAmounts, 0);
    const lowestDollarAmount = Math.min(...dollarAmounts, 0);

    const maxCountVariancePercent = averageLoanCount
      ? ((highestLoanCount - lowestLoanCount) / averageLoanCount) * 100
      : 0;
    const maxAmountVariancePercent = averageDollarAmount
      ? ((highestDollarAmount - lowestDollarAmount) / averageDollarAmount) * 100
      : 0;

    const countDistributionPass = maxCountVariancePercent <= COUNT_VARIANCE_THRESHOLD_PERCENT;
    const amountDistributionPass = maxAmountVariancePercent <= AMOUNT_VARIANCE_THRESHOLD_PERCENT;

    return {
      averageLoanCount,
      averageDollarAmount,
      highestLoanCount,
      lowestLoanCount,
      highestDollarAmount,
      lowestDollarAmount,
      maxCountVariancePercent,
      maxAmountVariancePercent,
      countDistributionPass,
      amountDistributionPass,
      overallPass: countDistributionPass && amountDistributionPass
    };
  }

  function buildSimulationDistributionCharts(officerStats) {
    return [
      {
        title: 'Monthly Loan Count Distribution',
        imageDataUrl: drawDonutChart({
          title: 'Monthly Loan Count Distribution',
          distribution: officerStats.map((entry) => ({
            officer: entry.officer,
            loanCount: entry.totalLoans,
            totalAmountRequested: entry.totalAmount
          })),
          field: 'loanCount',
          valueFormatter: (value) => `${value} loans`
        }).imageDataUrl
      },
      {
        title: 'Monthly Goal Dollar Distribution',
        imageDataUrl: drawDonutChart({
          title: 'Monthly Goal Dollar Distribution',
          distribution: officerStats.map((entry) => ({
            officer: entry.officer,
            loanCount: entry.totalLoans,
            totalAmountRequested: entry.totalAmount
          })),
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      }
    ];
  }

  function buildSimulationPdfLines(simulationResult) {
    const lines = [
      { text: 'SIMULATION REPORT - NOT ACTUAL PRODUCTION DATA', size: 18, gapAfter: 16 },
      { text: `Simulation month: ${simulationResult.monthLabel}`, size: 11, gapAfter: 4 },
      { text: `Business days: ${simulationResult.businessDays}`, size: 11, gapAfter: 4 },
      { text: `Loan officers: ${simulationResult.officers.length}`, size: 11, gapAfter: 4 },
      { text: `Total simulated loans: ${simulationResult.totalLoans}`, size: 11, gapAfter: 4 },
      { text: `Total simulated goal dollars: ${formatCurrency(simulationResult.totalAmount)}`, size: 11, gapAfter: 4 },
      { text: `End-of-month goal per officer: ${formatCurrency(simulationResult.eomGoalPerOfficer)}`, size: 11, gapAfter: 4 },
      { text: `Planned vacation days (all officers): ${simulationResult.simulationOfficers.reduce((sum, officer) => sum + officer.vacationDays, 0)}`, size: 11, gapAfter: 14 },
      { text: 'Fairness Summary', size: 14, gapAfter: 10 },
      { text: `Overall result: ${simulationResult.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}`, size: 12, gapAfter: 4 },
      { text: `Average loans per officer: ${simulationResult.fairnessSummary.averageLoanCount.toFixed(2)}`, size: 11, gapAfter: 4 },
      { text: `Average goal dollars per officer: ${formatCurrency(simulationResult.fairnessSummary.averageDollarAmount)}`, size: 11, gapAfter: 4 },
      { text: `Loan count variance: ${simulationResult.fairnessSummary.maxCountVariancePercent.toFixed(1)}% (threshold ${COUNT_VARIANCE_THRESHOLD_PERCENT}%)`, size: 11, gapAfter: 4 },
      { text: `Goal dollar variance: ${simulationResult.fairnessSummary.maxAmountVariancePercent.toFixed(1)}% (threshold ${AMOUNT_VARIANCE_THRESHOLD_PERCENT}%)`, size: 11, gapAfter: 10 },
      { text: 'Officer Monthly Totals', size: 14, gapAfter: 10 }
    ];

    const simulationOfficerMap = Object.fromEntries(simulationResult.simulationOfficers.map((entry) => [entry.name, entry]));

    simulationResult.officerStats.forEach((entry) => {
      lines.push({
        text: `${entry.officer} | Loans: ${entry.totalLoans} | Goal dollars: ${formatCurrency(entry.totalAmount)} | Avg loan: ${formatCurrency(entry.averageLoanAmount)} | Goal progress: ${entry.percentOfGoal.toFixed(1)}% | Vacation days: ${simulationOfficerMap[entry.officer]?.vacationDays || 0} | ${formatTypeCounts(entry.typeBreakdown)}`,
        size: 11,
        gapAfter: 6
      });
    });

    lines.push({ text: '', size: 11, gapAfter: 8 });
    lines.push({ text: 'Simulation Loan History', size: 14, gapAfter: 10 });

    simulationResult.loanHistoryEntries.forEach((entry) => {
      lines.push({
        text: `${entry.assignedDate} | ${formatLoanLabel(entry.loan)} -> ${entry.assignedOfficer}`,
        size: 10,
        gapAfter: 4
      });
    });

    if (simulationResult.distributionCharts.length) {
      lines.push({ text: '', size: 11, gapAfter: 8 });
      lines.push({ text: 'Distribution Snapshot', size: 14, gapAfter: 10 });
      lines.push({ text: '__DISTRIBUTION_CHARTS__', size: 11, gapAfter: 0 });
    }

    return lines;
  }

  function buildSimulationPdfFileName(monthLabel) {
    const stamp = new Date();
    const year = stamp.getFullYear();
    const month = String(stamp.getMonth() + 1).padStart(2, '0');
    const day = String(stamp.getDate()).padStart(2, '0');
    const hours = String(stamp.getHours()).padStart(2, '0');
    const minutes = String(stamp.getMinutes()).padStart(2, '0');
    const seconds = String(stamp.getSeconds()).padStart(2, '0');

    return `Loan-Randomized-Results-Simulation-${monthLabel}-${year}-${month}-${day}-${hours}${minutes}${seconds}.pdf`;
  }

  function openSimulationPdfInNewTab(pdfBlob) {
    if (!pdfBlob || typeof window === 'undefined' || typeof window.URL?.createObjectURL !== 'function') {
      return false;
    }

    const objectUrl = window.URL.createObjectURL(pdfBlob);
    const previewTab = window.open(objectUrl, '_blank', 'noopener,noreferrer');

    if (!previewTab) {
      window.URL.revokeObjectURL(objectUrl);
      return false;
    }

    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 60 * 1000);

    return true;
  }

  async function saveSimulationPdf(simulationResult) {
    if (!outputDirectoryHandle) {
      throw new Error('Choose an output folder before running the fairness simulation.');
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('The PDF library did not load correctly.');
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    writePdfLines(doc, buildSimulationPdfLines(simulationResult), simulationResult);

    const pdfBlob = doc.output('blob');
    const fileName = buildSimulationPdfFileName(simulationResult.monthLabel);
    const targetDirectoryHandle = await getActiveDataDirectoryHandle();
    const fileHandle = await targetDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(pdfBlob);
    await writable.close();

    return { fileName, pdfBlob };
  }

  function renderSimulationResults(simulationResult) {
    loanAssignmentsEl.className = 'results';
    officerAssignmentsEl.className = 'results';
    fairnessAuditEl.className = 'results';

    loanAssignmentsEl.innerHTML = '';
    officerAssignmentsEl.innerHTML = '';
    fairnessAuditEl.innerHTML = '';

    const summaryCard = document.createElement('div');
    summaryCard.className = 'result-group';
    summaryCard.innerHTML = `
      <h3>Monthly Simulation Summary <span class="badge">${simulationResult.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}</span></h3>
      <div class="amount-summary">Simulation month: ${escapeHtml(simulationResult.monthLabel)}</div>
      <div class="amount-summary">Business days: ${escapeHtml(String(simulationResult.businessDays))}</div>
      <div class="amount-summary">Loans simulated: ${escapeHtml(String(simulationResult.totalLoans))}</div>
      <div class="amount-summary">Goal dollars simulated: ${escapeHtml(formatCurrency(simulationResult.totalAmount))}</div>
      <div class="amount-summary">Total planned vacation days: ${escapeHtml(String(simulationResult.simulationOfficers.reduce((sum, officer) => sum + officer.vacationDays, 0)))}</div>
    `;
    loanAssignmentsEl.appendChild(summaryCard);

    const simulationOfficerMap = Object.fromEntries(simulationResult.simulationOfficers.map((entry) => [entry.name, entry]));

    simulationResult.officerStats.forEach((entry) => {
      const officerCard = document.createElement('div');
      officerCard.className = 'result-group';
      officerCard.innerHTML = `
        <h3>${escapeHtml(entry.officer)} <span class="badge">${escapeHtml(String(entry.totalLoans))} simulated loans</span></h3>
        <div class="amount-summary">Goal dollars: ${escapeHtml(formatCurrency(entry.totalAmount))}</div>
        <div class="amount-summary">Average simulated loan: ${escapeHtml(formatCurrency(entry.averageLoanAmount))}</div>
        <div class="amount-summary">Percent to EOM goal: ${escapeHtml(entry.percentOfGoal.toFixed(1))}%</div>
        <div class="amount-summary">Type mix: ${escapeHtml(formatTypeCounts(entry.typeBreakdown))}</div>
        <div class="amount-summary">Vacation days configured: ${escapeHtml(String(simulationOfficerMap[entry.officer]?.vacationDays || 0))}</div>
      `;
      officerAssignmentsEl.appendChild(officerCard);
    });

    const fairnessCard = document.createElement('div');
    fairnessCard.className = 'audit-card';
    fairnessCard.innerHTML = `
      <h3>Fairness Simulation Audit</h3>
      <div class="audit-summary">
        <div class="audit-summary-line"><strong>Overall status:</strong> ${escapeHtml(simulationResult.fairnessSummary.overallPass ? 'PASS' : 'REVIEW')}</div>
        <div class="audit-summary-line"><strong>Average loans per officer:</strong> ${escapeHtml(simulationResult.fairnessSummary.averageLoanCount.toFixed(2))}</div>
        <div class="audit-summary-line"><strong>Average goal dollars per officer:</strong> ${escapeHtml(formatCurrency(simulationResult.fairnessSummary.averageDollarAmount))}</div>
        <div class="audit-summary-line"><strong>Loan count variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.maxCountVariancePercent.toFixed(1))}% (threshold ${COUNT_VARIANCE_THRESHOLD_PERCENT}%)</div>
        <div class="audit-summary-line"><strong>Goal dollar variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.maxAmountVariancePercent.toFixed(1))}% (threshold ${AMOUNT_VARIANCE_THRESHOLD_PERCENT}%)</div>
      </div>
    `;
    fairnessAuditEl.appendChild(fairnessCard);

    if (distributionDetailsEl) {
      distributionDetailsEl.open = true;
    }

    if (distributionChartsEl) {
      distributionChartsEl.innerHTML = '';
      distributionChartsEl.className = 'distribution-charts';

      simulationResult.distributionCharts.forEach((chart) => {
        const chartCard = document.createElement('div');
        chartCard.className = 'distribution-chart-card';
        const image = document.createElement('img');
        image.src = chart.imageDataUrl;
        image.alt = chart.title;
        image.className = 'distribution-chart-image';
        chartCard.appendChild(image);
        distributionChartsEl.appendChild(chartCard);
      });
    }
  }

  function buildOfficerVacationCalendar(simulationOfficers, businessDates, randomFn) {
    const businessDateKeys = businessDates.map((date) => formatDateKey(date));
    const vacationByOfficer = {};

    simulationOfficers.forEach((entry) => {
      const availableDates = [...businessDateKeys];
      const selected = new Set();
      const daysToSchedule = Math.min(entry.vacationDays, businessDateKeys.length);

      for (let dayIndex = 0; dayIndex < daysToSchedule; dayIndex += 1) {
        if (!availableDates.length) {
          break;
        }

        const randomIndex = Math.floor(randomFn() * availableDates.length);
        const [chosenDate] = availableDates.splice(randomIndex, 1);
        selected.add(chosenDate);
      }

      vacationByOfficer[entry.name] = selected;
    });

    businessDateKeys.forEach((dateKey) => {
      const availableCount = simulationOfficers.filter((entry) => !vacationByOfficer[entry.name].has(dateKey)).length;
      if (!availableCount) {
        throw new Error(`Every simulation officer is on vacation on ${dateKey}. Reduce vacation days and try again.`);
      }
    });

    return vacationByOfficer;
  }

  async function runFairnessSimulationFromConfig(config) {
    const activeTypes = getActiveLoanTypeNames();
    if (!activeTypes.length) {
      throw new Error('At least one active loan type is required for the fairness simulation.');
    }

    const randomFn = createSeededRandom(config.seed);
    const businessDates = generateBusinessDates(config.monthLabel, config.businessDays);
    const vacationByOfficer = buildOfficerVacationCalendar(config.simulationOfficers, businessDates, randomFn);
    let runningTotals = cloneRunningTotals({ officers: {} });
    let loanSequence = 1;
    const loanHistoryEntries = [];

    businessDates.forEach((date) => {
      const loanCount = getRandomInteger(randomFn, config.minLoansPerDay, config.maxLoansPerDay);
      const dayLoans = generateSimulatedLoansForDate(date, loanCount, activeTypes, randomFn, loanSequence);
      loanSequence += dayLoans.length;

      const dateKey = formatDateKey(date);
      const availableOfficers = config.officerNames.filter((officer) => !vacationByOfficer[officer]?.has(dateKey));
      const dayResult = assignLoansWithRandom(availableOfficers, dayLoans, runningTotals, randomFn);
      if (dayResult.error) {
        throw new Error(dayResult.error);
      }

      dayResult.loanAssignments.forEach((entry) => {
        loanHistoryEntries.push({
          assignedDate: formatDateKey(date),
          loan: entry.loan,
          assignedOfficer: entry.officers[0]
        });
      });

      runningTotals = buildUpdatedRunningTotals(availableOfficers, dayResult, runningTotals);
    });

    const officerStats = buildSimulationOfficerStats(config.officerNames, loanHistoryEntries, config.eomGoalPerOfficer);
    const fairnessSummary = buildSimulationFairnessSummary(officerStats);

    return {
      monthLabel: config.monthLabel,
      businessDays: config.businessDays,
      eomGoalPerOfficer: config.eomGoalPerOfficer,
      officers: config.officerNames,
      simulationOfficers: config.simulationOfficers,
      totalLoans: loanHistoryEntries.length,
      totalAmount: loanHistoryEntries.reduce((sum, entry) => sum + getGoalAmountForLoan(entry.loan), 0),
      loanHistoryEntries,
      officerStats,
      fairnessSummary,
      distributionCharts: buildSimulationDistributionCharts(officerStats)
    };
  }

  async function handleSimulationSubmit(event) {
    event.preventDefault();

    if (!outputDirectoryHandle) {
      setSimulationModalMessage('Choose an output folder before running the fairness simulation.', 'warning');
      return;
    }

    try {
      setSimulationModalMessage('');
      const config = getSimulationConfigFromModal();
      const simulationResult = await runFairnessSimulationFromConfig(config);
      renderSimulationResults(simulationResult);
      const { fileName, pdfBlob } = await saveSimulationPdf(simulationResult);
      await appendSimulationHistoryEntry({
        generatedAt: new Date().toISOString(),
        monthLabel: simulationResult.monthLabel,
        businessDays: simulationResult.businessDays,
        totalLoans: simulationResult.totalLoans,
        totalGoalAmount: simulationResult.totalAmount,
        seed: config.seed,
        officers: simulationResult.officers.join('|')
      });
      const openedPreview = openSimulationPdfInNewTab(pdfBlob);
      closeSimulationModal();
      const simulationHistoryFileName = getSessionFileName('simulationHistory');
      setMessage(
        openedPreview
          ? `Fairness simulation completed, opened in a new tab, and saved to ${fileName}. Simulation history was appended to ${simulationHistoryFileName}.`
          : `Fairness simulation completed and saved to ${fileName}. Simulation history was appended to ${simulationHistoryFileName}. (Pop-up blocked, so preview tab could not be opened.)`,
        openedPreview ? 'success' : 'warning'
      );
    } catch (error) {
      setSimulationModalMessage(error.message, 'warning');
    }
  }

  runSimulationBtn?.addEventListener('click', openSimulationModal);
  simulationAddOfficerBtn?.addEventListener('click', handleAddSimulationOfficer);
  simulationOfficerNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddSimulationOfficer();
    }
  });
  closeSimulationModalBtn?.addEventListener('click', closeSimulationModal);
  cancelSimulationBtn?.addEventListener('click', closeSimulationModal);
  simulationFormEl?.addEventListener('submit', handleSimulationSubmit);
  simulationFormEl?.addEventListener('keydown', preventEnterSubmit);
  simulationModalEl?.addEventListener('click', (event) => {
    if (event.target === simulationModalEl) {
      closeSimulationModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && simulationModalEl && !simulationModalEl.hidden) {
      closeSimulationModal();
    }
  });
})();
