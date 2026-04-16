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
  const simulationModalMessageEl = document.getElementById('simulationModalMessage');

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

  function openSimulationModal() {
    if (!simulationModalEl) {
      return;
    }

    populateSimulationDefaults();
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
        type: activeLoanTypes.includes(loan.type) ? loan.type : activeLoanTypes[0],
        amountRequested: loan.amountRequested
      }))
      .filter((loan) => loan.name);

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

  function getSimulationConfigFromModal(officers) {
    const monthLabel = simulationMonthInput?.value?.trim() || '';
    const businessDays = Number.parseInt(simulationBusinessDaysInput?.value || '', 10);
    const minLoansPerDay = Number.parseInt(simulationMinLoansInput?.value || '', 10);
    const maxLoansPerDay = Number.parseInt(simulationMaxLoansInput?.value || '', 10);
    const eomGoalPerOfficer = Number.parseFloat(simulationEomGoalInput?.value || '');
    const seed = Date.now();

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

    return {
      monthLabel,
      officerNames: officers,
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
      { text: `End-of-month goal per officer: ${formatCurrency(simulationResult.eomGoalPerOfficer)}`, size: 11, gapAfter: 14 },
      { text: 'Fairness Summary', size: 14, gapAfter: 10 },
      { text: `Overall result: ${simulationResult.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}`, size: 12, gapAfter: 4 },
      { text: `Average loans per officer: ${simulationResult.fairnessSummary.averageLoanCount.toFixed(2)}`, size: 11, gapAfter: 4 },
      { text: `Average goal dollars per officer: ${formatCurrency(simulationResult.fairnessSummary.averageDollarAmount)}`, size: 11, gapAfter: 4 },
      { text: `Loan count variance: ${simulationResult.fairnessSummary.maxCountVariancePercent.toFixed(1)}% (threshold ${COUNT_VARIANCE_THRESHOLD_PERCENT}%)`, size: 11, gapAfter: 4 },
      { text: `Goal dollar variance: ${simulationResult.fairnessSummary.maxAmountVariancePercent.toFixed(1)}% (threshold ${AMOUNT_VARIANCE_THRESHOLD_PERCENT}%)`, size: 11, gapAfter: 10 },
      { text: 'Officer Monthly Totals', size: 14, gapAfter: 10 }
    ];

    simulationResult.officerStats.forEach((entry) => {
      lines.push({
        text: `${entry.officer} | Loans: ${entry.totalLoans} | Goal dollars: ${formatCurrency(entry.totalAmount)} | Avg loan: ${formatCurrency(entry.averageLoanAmount)} | Goal progress: ${entry.percentOfGoal.toFixed(1)}% | ${formatTypeCounts(entry.typeBreakdown)}`,
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
    const fileHandle = await outputDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(pdfBlob);
    await writable.close();

    return fileName;
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
    `;
    loanAssignmentsEl.appendChild(summaryCard);

    simulationResult.officerStats.forEach((entry) => {
      const officerCard = document.createElement('div');
      officerCard.className = 'result-group';
      officerCard.innerHTML = `
        <h3>${escapeHtml(entry.officer)} <span class="badge">${escapeHtml(String(entry.totalLoans))} simulated loans</span></h3>
        <div class="amount-summary">Goal dollars: ${escapeHtml(formatCurrency(entry.totalAmount))}</div>
        <div class="amount-summary">Average simulated loan: ${escapeHtml(formatCurrency(entry.averageLoanAmount))}</div>
        <div class="amount-summary">Percent to EOM goal: ${escapeHtml(entry.percentOfGoal.toFixed(1))}%</div>
        <div class="amount-summary">Type mix: ${escapeHtml(formatTypeCounts(entry.typeBreakdown))}</div>
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

  async function runFairnessSimulationFromConfig(config) {
    const activeTypes = getActiveLoanTypeNames();
    if (!activeTypes.length) {
      throw new Error('At least one active loan type is required for the fairness simulation.');
    }

    const randomFn = createSeededRandom(config.seed);
    const businessDates = generateBusinessDates(config.monthLabel, config.businessDays);
    let runningTotals = cloneRunningTotals({ officers: {} });
    let loanSequence = 1;
    const loanHistoryEntries = [];

    businessDates.forEach((date) => {
      const loanCount = getRandomInteger(randomFn, config.minLoansPerDay, config.maxLoansPerDay);
      const dayLoans = generateSimulatedLoansForDate(date, loanCount, activeTypes, randomFn, loanSequence);
      loanSequence += dayLoans.length;

      const dayResult = assignLoansWithRandom(config.officerNames, dayLoans, runningTotals, randomFn);
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

      runningTotals = buildUpdatedRunningTotals(config.officerNames, dayResult, runningTotals);
    });

    const officerStats = buildSimulationOfficerStats(config.officerNames, loanHistoryEntries, config.eomGoalPerOfficer);
    const fairnessSummary = buildSimulationFairnessSummary(officerStats);

    return {
      monthLabel: config.monthLabel,
      businessDays: config.businessDays,
      eomGoalPerOfficer: config.eomGoalPerOfficer,
      officers: config.officerNames,
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

    const officers = getOfficerValues();
    if (!officers.length) {
      setSimulationModalMessage('Add at least one active loan officer before running the fairness simulation.', 'warning');
      return;
    }

    try {
      setSimulationModalMessage('');
      const config = getSimulationConfigFromModal(officers);
      const simulationResult = await runFairnessSimulationFromConfig(config);
      renderSimulationResults(simulationResult);
      const fileName = await saveSimulationPdf(simulationResult);
      closeSimulationModal();
      setMessage(`Fairness simulation completed and saved to ${fileName}.`, 'success');
    } catch (error) {
      setSimulationModalMessage(error.message, 'warning');
    }
  }

  runSimulationBtn?.addEventListener('click', openSimulationModal);
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
