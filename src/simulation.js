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
  const loanCategoryUtils = window.LoanCategoryUtils;

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
      .map((row) => {
        const name = String(row.dataset.officerName || '').trim();
        const eligibility = loanCategoryUtils.normalizeOfficerEligibility({
          consumer: row.dataset.eligibilityConsumer === 'true',
          mortgage: row.dataset.eligibilityMortgage === 'true'
        });
        return {
          name,
          eligibility: loanCategoryUtils.normalizeOfficerEligibility(eligibility),
          weights: loanCategoryUtils.normalizeOfficerWeights({
            consumer: row.dataset.weightConsumer,
            mortgage: row.dataset.weightMortgage
          }, eligibility),
          mortgageOverride: row.dataset.mortgageOverride === 'true'
        };
      })
      .filter((entry) => entry.name);
  }

  function getClassCodeFromEligibility(eligibility) {
    const normalizedEligibility = loanCategoryUtils.normalizeOfficerEligibility(eligibility);
    if (normalizedEligibility.consumer && normalizedEligibility.mortgage) {
      return 'F';
    }
    if (normalizedEligibility.mortgage) {
      return 'M';
    }
    return 'C';
  }

  function rotateOfficerClass(index) {
    const entry = simulationOfficerState[index];
    if (!entry) {
      return;
    }

    const classOrder = ['C', 'F', 'M'];
    const currentClass = getClassCodeFromEligibility(entry.eligibility);
    const currentIndex = classOrder.indexOf(currentClass);
    const nextClass = classOrder[(currentIndex + 1) % classOrder.length];
    const scopeByClass = {
      C: loanCategoryUtils.OFFICER_SCOPES.CONSUMER_ONLY,
      F: loanCategoryUtils.OFFICER_SCOPES.CONSUMER_AND_MORTGAGE,
      M: loanCategoryUtils.OFFICER_SCOPES.MORTGAGE_ONLY
    };
    const nextScope = scopeByClass[nextClass] || loanCategoryUtils.OFFICER_SCOPES.CONSUMER_AND_MORTGAGE;
    entry.eligibility = loanCategoryUtils.getEligibilityFromScope(nextScope);
    entry.weights = loanCategoryUtils.getDefaultWeightsForScope(nextScope);
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
      row.className = 'simulation-officer-row officer-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'officer-name-value';
      nameEl.textContent = entry.name;

      const classBtn = document.createElement('button');
      classBtn.type = 'button';
      classBtn.className = 'officer-class-label';
      classBtn.textContent = getClassCodeFromEligibility(entry.eligibility);
      classBtn.setAttribute('aria-label', `Rotate class for ${entry.name || 'simulation officer'}`);
      classBtn.title = 'Click to cycle class: C → F → M';
      classBtn.addEventListener('click', () => {
        rotateOfficerClass(index);
        renderSimulationOfficerList();
      });

      const vacationInput = document.createElement('input');
      vacationInput.type = 'number';
      vacationInput.className = 'simulation-vacation-input';
      vacationInput.min = '0';
      vacationInput.step = '1';
      vacationInput.value = String(Number.isFinite(entry.vacationDays) ? entry.vacationDays : 0);
      vacationInput.setAttribute('aria-label', `Vacation days for ${entry.name || 'simulation officer'}`);
      vacationInput.addEventListener('input', () => {
        const rawDays = Number.parseInt(vacationInput.value || '0', 10);
        simulationOfficerState[index].vacationDays = Number.isFinite(rawDays) && rawDays >= 0 ? rawDays : 0;
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'officer-edit-btn danger-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove ${entry.name || 'simulation officer'}`);
      removeBtn.addEventListener('click', () => {
        simulationOfficerState.splice(index, 1);
        renderSimulationOfficerList();
      });

      row.appendChild(nameEl);
      row.appendChild(classBtn);
      row.appendChild(vacationInput);
      row.appendChild(removeBtn);
      simulationOfficerListEl.appendChild(row);
    });
  }

  function seedSimulationOfficerStateFromMainScreen() {
    simulationOfficerState.length = 0;

    getOfficerValuesForSimulationSeed().forEach((officerConfig) => {
      simulationOfficerState.push({ ...officerConfig, vacationDays: 0 });
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

    const eligibility = loanCategoryUtils.getDefaultOfficerEligibility();
    simulationOfficerState.push({
      name,
      vacationDays: 0,
      eligibility,
      weights: loanCategoryUtils.getDefaultWeightsForScope(loanCategoryUtils.getOfficerScopeFromConfig(eligibility)),
      mortgageOverride: false
    });
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

  function chooseOfficerForLoanWithRandom(officersByName, officerLoanTotals, officerTypeCounts, officerAmountTotals, officerActiveSessions, loan, randomFn) {
    const loanCategory = getLoanCategoryForType(loan.type);
    let eligibleOfficers = Object.values(officersByName).filter((officerConfig) => isOfficerEligibleForLoanType(officerConfig, loan));
    const isHelocLoan = String(loan?.type || '').trim().toLowerCase() === 'heloc';
    if (loanCategory === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE && !isHelocLoan) {
      const mortgageOnlyOfficers = eligibleOfficers.filter((officerConfig) => {
        const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officerConfig.eligibility);
        return !eligibility.consumer && eligibility.mortgage;
      });
      if (mortgageOnlyOfficers.length) {
        eligibleOfficers = mortgageOnlyOfficers;
      }
    }
    if (!eligibleOfficers.length && loanCategory === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE) {
      eligibleOfficers = Object.values(officersByName).filter((officerConfig) => {
        const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officerConfig.eligibility);
        return eligibility.consumer && eligibility.mortgage;
      });
    }
    const eligibleOfficerNames = eligibleOfficers.map((officer) => officer.name);
    if (!eligibleOfficerNames.length) {
      return { error: `No eligible officers are configured for ${loanCategory} loans.` };
    }

    const goalAmount = getGoalAmountForLoan(loan);
    const shuffledOfficers = shuffleWithRandom(eligibleOfficerNames, randomFn);
    const categoryLoanTotals = Object.fromEntries(
      eligibleOfficerNames.map((officerName) => [officerName, getCategoryCountFromTypeCounts(officerTypeCounts[officerName], loanCategory)])
    );
    const categoryAmountTotals = Object.fromEntries(
      eligibleOfficerNames.map((officerName) => [officerName, getEstimatedCategoryAmountTotal(
        officerTypeCounts[officerName],
        officerAmountTotals[officerName],
        loanCategory
      )])
    );

    const scoredOfficers = shuffledOfficers.map((officer) => {
      const currentTypeTotals = Object.fromEntries(
        eligibleOfficerNames.map((currentOfficer) => [currentOfficer, officerTypeCounts[currentOfficer][loan.type] || 0])
      );

      const projectedTypeLoads = buildProjectedLoads(eligibleOfficerNames, currentTypeTotals, officerActiveSessions, officer, 1);
      const projectedAmountLoads = eligibleOfficerNames.map((officerName) => getNormalizedAmountFairnessValue(
        categoryAmountTotals[officerName] + (officerName === officer ? goalAmount : 0),
        officerActiveSessions[officerName]
      ));
      const projectedRawAmountLoads = eligibleOfficerNames.map((officerName) => getNormalizedFairnessValue(
        categoryAmountTotals[officerName] + (officerName === officer ? goalAmount : 0),
        officerActiveSessions[officerName]
      ));
      const projectedLoanLoads = buildProjectedLoads(eligibleOfficerNames, categoryLoanTotals, officerActiveSessions, officer, 1);

      const typeVariance = calculateVariance(projectedTypeLoads);
      const amountVariance = calculateVariance(projectedAmountLoads);
      const loanVariance = calculateVariance(projectedLoanLoads);
      const distinctTypePenalty = getDistinctTypeCount(officerTypeCounts[officer]) * 0.0025;
      const currentAmountPenalty = getNormalizedAmountFairnessValue(
        categoryAmountTotals[officer] + goalAmount,
        officerActiveSessions[officer]
      ) * 0.01;
      let consumerDollarDriftPenalty = 0;
      if (loanCategory === loanCategoryUtils.LOAN_CATEGORIES.CONSUMER && projectedRawAmountLoads.length) {
        const projectedRawAverage = projectedRawAmountLoads.reduce((sum, value) => sum + value, 0) / projectedRawAmountLoads.length;
        const projectedOfficerRawAmountLoad = getNormalizedFairnessValue(
          categoryAmountTotals[officer] + goalAmount,
          officerActiveSessions[officer]
        );
        const allowedConsumerAmountLoad = projectedRawAverage * 1.2;
        if (projectedOfficerRawAmountLoad > allowedConsumerAmountLoad && projectedRawAverage > 0) {
          const overageRatio = (projectedOfficerRawAmountLoad - allowedConsumerAmountLoad) / projectedRawAverage;
          consumerDollarDriftPenalty = (overageRatio ** 2) * 6;
        }
      }
      const amountWeightMultiplier = loanCategory === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? 6 : 5;
      const loanWeightMultiplier = loanCategory === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? 1 : 1.5;
      const fairnessScore = (typeVariance * 4) + (amountVariance * amountWeightMultiplier) + (loanVariance * loanWeightMultiplier) + distinctTypePenalty + currentAmountPenalty + consumerDollarDriftPenalty;
      const categoryWeight = loanCategoryUtils.getCategoryWeightForOfficer(officersByName[officer], loanCategory);
      const participationBias = getOfficerCategoryParticipationBias(officersByName[officer], loanCategory, eligibleOfficers);
      const score = fairnessScore / (getCategoryWeightBias(categoryWeight) * participationBias);

      return {
        officer,
        score,
        categoryWeight,
        fairnessScore,
        typeVariance,
        amountVariance,
        loanVariance,
        distinctTypePenalty,
        currentAmountPenalty,
        consumerDollarDriftPenalty,
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
    const cleanOfficers = [...new Set(officers.map((officer) => officer.name.trim()).filter(Boolean))]
      .map((name) => officers.find((officer) => officer.name === name));
    const cleanOfficerNames = cleanOfficers.map((officer) => officer.name);
    const officersByName = Object.fromEntries(cleanOfficers.map((officer) => [officer.name, officer]));
    const cleanLoans = loans
      .map((loan) => ({
        name: loan.name.trim(),
        type: loan.type,
        amountRequested: loan.amountRequested
      }))
      .filter((loan) => loan.name)
      .filter((loan) => activeLoanTypes.includes(loan.type));

    if (!cleanOfficerNames.length) {
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

    cleanOfficerNames.forEach((officer) => {
      const priorStats = normalizeOfficerStats(runningTotals.officers?.[officer]);
      officerAssignments[officer] = [];
      officerTypeCounts[officer] = { ...priorStats.typeCounts };
      officerAmountTotals[officer] = priorStats.totalAmountRequested;
      officerLoanTotals[officer] = priorStats.loanCount;
      officerActiveSessions[officer] = priorStats.activeSessionCount + 1;
    });

    const loanAssignments = [];
    const fairnessAudit = [];

    try {
      activeLoanTypes.forEach((loanType) => {
        const loansForType = shuffleWithRandom(cleanLoans.filter((loan) => loan.type === loanType), randomFn);

        if (!loansForType.length) {
          return;
        }

      const orderedLoansForType = [...loansForType].sort((loanA, loanB) => getGoalAmountForLoan(loanB) - getGoalAmountForLoan(loanA));

        orderedLoansForType.forEach((loan) => {
        const assignmentDecision = chooseOfficerForLoanWithRandom(
          officersByName,
          officerLoanTotals,
          officerTypeCounts,
          officerAmountTotals,
          officerActiveSessions,
          loan,
          randomFn
        );
        if (assignmentDecision.error) {
          throw new Error(assignmentDecision.error);
        }

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
    } catch (error) {
      return { error: error.message || 'The fairness simulation could not complete assignments.' };
    }

    return {
      loanAssignments: shuffleWithRandom(loanAssignments, randomFn),
      officerAssignments,
      fairnessAudit,
      runningTotalsUsed: Object.fromEntries(cleanOfficerNames.map((officer) => [officer, normalizeOfficerStats(runningTotals.officers?.[officer])]))
    };
  }

  function getDefaultAmountRange(loanType) {
    const normalizedType = String(loanType || '').toLowerCase();

    if (normalizedType === 'first mortgage') {
      return { min: 90000, max: 350000 };
    }

    if (normalizedType === 'home refi') {
      return { min: 85000, max: 300000 };
    }

    if (normalizedType === 'heloc') {
      return { min: 10000, max: 120000 };
    }

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

  function getSimulatedLoanAmount(loanType, randomFn) {
    const normalizedType = String(loanType || '').toLowerCase();
    const amountRange = getDefaultAmountRange(loanType);

    if (normalizedType === 'first mortgage' || normalizedType === 'home refi') {
      const belowSixFigureProbability = 0.2;
      const useBelowSixFigureRange = randomFn() < belowSixFigureProbability;
      const highBandMin = 100000;
      const highBandRange = Math.max(amountRange.max - highBandMin, 0);

      if (useBelowSixFigureRange) {
        const lowBandMin = amountRange.min;
        const lowBandMax = Math.min(99900, amountRange.max);
        const lowBandRange = Math.max(lowBandMax - lowBandMin, 0);
        return Math.round((lowBandMin + (lowBandRange * randomFn())) / 100) * 100;
      }

      return Math.round((highBandMin + (highBandRange * randomFn())) / 100) * 100;
    }

    const rawAmount = amountRange.min + ((amountRange.max - amountRange.min) * randomFn());
    return Math.round(rawAmount / 100) * 100;
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

      if (normalizedType === 'first mortgage') {
        return { typeName, weight: 0.05 };
      }

      if (normalizedType === 'home refi') {
        return { typeName, weight: 0.05 };
      }

      if (normalizedType === 'heloc') {
        return { typeName, weight: 0.08 };
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
      const roundedAmount = getSimulatedLoanAmount(loanType, randomFn);
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
        vacationDays: Number.isFinite(entry.vacationDays) ? Math.max(0, Math.trunc(entry.vacationDays)) : 0,
        eligibility: loanCategoryUtils.normalizeOfficerEligibility(entry.eligibility),
        weights: loanCategoryUtils.normalizeOfficerWeights(entry.weights, entry.eligibility),
        mortgageOverride: Boolean(entry.mortgageOverride)
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
      const consumerLoans = assignedLoans.filter((entry) => getLoanCategoryForType(entry.loan.type) === loanCategoryUtils.LOAN_CATEGORIES.CONSUMER);
      const mortgageLoans = assignedLoans.filter((entry) => getLoanCategoryForType(entry.loan.type) === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE);
      const consumerLoanCount = consumerLoans.length;
      const mortgageLoanCount = mortgageLoans.length;
      const consumerAmount = consumerLoans.reduce((sum, entry) => sum + getGoalAmountForLoan(entry.loan), 0);
      const mortgageAmount = mortgageLoans.reduce((sum, entry) => sum + getGoalAmountForLoan(entry.loan), 0);
      const typeBreakdown = assignedLoans.reduce((counts, entry) => {
        counts[entry.loan.type] = (counts[entry.loan.type] || 0) + 1;
        return counts;
      }, {});

      return {
        officer,
        totalLoans,
        totalAmount,
        consumerLoanCount,
        mortgageLoanCount,
        consumerAmount,
        mortgageAmount,
        averageLoanAmount: totalLoans ? totalAmount / totalLoans : 0,
        percentOfGoal: eomGoalPerOfficer > 0 ? (totalAmount / eomGoalPerOfficer) * 100 : 0,
        typeBreakdown
      };
    });
  }

  function calculateCategoryVarianceStats(officerStats, simulationOfficers, categoryKey) {
    const eligibleOfficerNames = simulationOfficers
      .filter((officer) => loanCategoryUtils.isOfficerEligibleForCategory(officer, categoryKey))
      .map((officer) => officer.name);
    const eligibleStats = officerStats.filter((entry) => eligibleOfficerNames.includes(entry.officer));

    if (!eligibleStats.length) {
      return {
        officerCount: 0,
        averageLoanCount: 0,
        averageDollarAmount: 0,
        maxCountVariancePercent: 0,
        maxAmountVariancePercent: 0,
        countDistributionPass: true,
        amountDistributionPass: true
      };
    }

    const statsByOfficer = Object.fromEntries(officerStats.map((entry) => [entry.officer, entry]));
    const eligibleOfficerConfigs = simulationOfficers.filter((officer) => eligibleOfficerNames.includes(officer.name));
    const hasMortgageOnlyOfficer = eligibleOfficerConfigs.some((officer) => {
      const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officer.eligibility);
      return !eligibility.consumer && eligibility.mortgage;
    });

    const roleNormalizationWeights = eligibleOfficerConfigs.map((officer) => {
      const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officer.eligibility);
      const isFlex = eligibility.consumer && eligibility.mortgage;
      const normalizedCategoryWeight = Math.max(loanCategoryUtils.getCategoryWeightForOfficer(officer, categoryKey), 0.05);
      let roleNormalizationFactor = 1;

      if (isFlex && categoryKey === loanCategoryUtils.LOAN_CATEGORIES.CONSUMER && hasMortgageOnlyOfficer) {
        roleNormalizationFactor = 0.8;
      }

      if (isFlex && categoryKey === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE && hasMortgageOnlyOfficer) {
        roleNormalizationFactor = 0.6;
      }

      return normalizedCategoryWeight * roleNormalizationFactor;
    });

    const totalRoleWeight = roleNormalizationWeights.reduce((sum, weight) => sum + weight, 0);
    const normalizedRoleWeights = roleNormalizationWeights.map((weight) => (totalRoleWeight ? weight / totalRoleWeight : 0));
    const totalCategoryLoanCount = eligibleOfficerConfigs.reduce((sum, officer) => {
      const stats = statsByOfficer[officer.name];
      return sum + (categoryKey === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? (stats?.mortgageLoanCount || 0) : (stats?.consumerLoanCount || 0));
    }, 0);
    const totalCategoryDollarAmount = eligibleOfficerConfigs.reduce((sum, officer) => {
      const stats = statsByOfficer[officer.name];
      return sum + (categoryKey === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? (stats?.mortgageAmount || 0) : (stats?.consumerAmount || 0));
    }, 0);

    let maxCountVariancePercent = 0;
    let maxAmountVariancePercent = 0;

    eligibleOfficerConfigs.forEach((officer, index) => {
      const stats = statsByOfficer[officer.name];
      const actualCategoryLoanCount = categoryKey === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? (stats?.mortgageLoanCount || 0) : (stats?.consumerLoanCount || 0);
      const actualCategoryDollarAmount = categoryKey === loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE ? (stats?.mortgageAmount || 0) : (stats?.consumerAmount || 0);
      const expectedCategoryLoanCount = totalCategoryLoanCount * normalizedRoleWeights[index];
      const expectedCategoryDollarAmount = totalCategoryDollarAmount * normalizedRoleWeights[index];
      const countVariancePercent = expectedCategoryLoanCount
        ? (Math.abs(actualCategoryLoanCount - expectedCategoryLoanCount) / expectedCategoryLoanCount) * 100
        : 0;
      const amountVariancePercent = expectedCategoryDollarAmount
        ? (Math.abs(actualCategoryDollarAmount - expectedCategoryDollarAmount) / expectedCategoryDollarAmount) * 100
        : 0;

      maxCountVariancePercent = Math.max(maxCountVariancePercent, countVariancePercent);
      maxAmountVariancePercent = Math.max(maxAmountVariancePercent, amountVariancePercent);
    });

    const averageLoanCount = eligibleOfficerConfigs.length ? totalCategoryLoanCount / eligibleOfficerConfigs.length : 0;
    const averageDollarAmount = eligibleOfficerConfigs.length ? totalCategoryDollarAmount / eligibleOfficerConfigs.length : 0;

    return {
      officerCount: eligibleStats.length,
      averageLoanCount,
      averageDollarAmount,
      maxCountVariancePercent,
      maxAmountVariancePercent,
      countDistributionPass: maxCountVariancePercent <= COUNT_VARIANCE_THRESHOLD_PERCENT,
      amountDistributionPass: maxAmountVariancePercent <= AMOUNT_VARIANCE_THRESHOLD_PERCENT
    };
  }

  function buildSimulationFairnessSummary(officerStats, simulationOfficers) {
    const averageLoanCount = officerStats.length
      ? officerStats.reduce((sum, entry) => sum + entry.totalLoans, 0) / officerStats.length
      : 0;
    const averageDollarAmount = officerStats.length
      ? officerStats.reduce((sum, entry) => sum + entry.totalAmount, 0) / officerStats.length
      : 0;

    const consumerVariance = calculateCategoryVarianceStats(officerStats, simulationOfficers, loanCategoryUtils.LOAN_CATEGORIES.CONSUMER);
    const mortgageVariance = calculateCategoryVarianceStats(officerStats, simulationOfficers, loanCategoryUtils.LOAN_CATEGORIES.MORTGAGE);
    const maxCountVariancePercent = Math.max(consumerVariance.maxCountVariancePercent, mortgageVariance.maxCountVariancePercent);
    const maxAmountVariancePercent = Math.max(consumerVariance.maxAmountVariancePercent, mortgageVariance.maxAmountVariancePercent);
    const countDistributionPass = consumerVariance.countDistributionPass && mortgageVariance.countDistributionPass;
    const amountDistributionPass = consumerVariance.amountDistributionPass && mortgageVariance.amountDistributionPass;

    return {
      averageLoanCount,
      averageDollarAmount,
      highestLoanCount: officerStats.length ? Math.max(...officerStats.map((entry) => entry.totalLoans)) : 0,
      lowestLoanCount: officerStats.length ? Math.min(...officerStats.map((entry) => entry.totalLoans)) : 0,
      highestDollarAmount: officerStats.length ? Math.max(...officerStats.map((entry) => entry.totalAmount)) : 0,
      lowestDollarAmount: officerStats.length ? Math.min(...officerStats.map((entry) => entry.totalAmount)) : 0,
      maxCountVariancePercent,
      maxAmountVariancePercent,
      consumerVariance,
      mortgageVariance,
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
        title: 'Monthly Consumer Goal Dollar Distribution',
        imageDataUrl: drawDonutChart({
          title: 'Monthly Consumer Goal Dollar Distribution',
          distribution: officerStats.map((entry) => ({
            officer: entry.officer,
            loanCount: entry.consumerLoanCount,
            totalAmountRequested: entry.consumerAmount
          })).filter((entry) => entry.totalAmountRequested > 0),
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      },
      {
        title: 'Monthly Mortgage Goal Dollar Distribution',
        imageDataUrl: drawDonutChart({
          title: 'Monthly Mortgage Goal Dollar Distribution',
          distribution: officerStats.map((entry) => ({
            officer: entry.officer,
            loanCount: entry.mortgageLoanCount,
            totalAmountRequested: entry.mortgageAmount
          })),
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      },
      {
        title: 'Consumer vs Mortgage Goal Dollars',
        imageDataUrl: drawDonutChart({
          title: 'Consumer vs Mortgage Goal Dollars',
          distribution: [
            {
              officer: 'Consumer',
              loanCount: officerStats.reduce((sum, entry) => sum + entry.consumerLoanCount, 0),
              totalAmountRequested: officerStats.reduce((sum, entry) => sum + entry.consumerAmount, 0)
            },
            {
              officer: 'Mortgage',
              loanCount: officerStats.reduce((sum, entry) => sum + entry.mortgageLoanCount, 0),
              totalAmountRequested: officerStats.reduce((sum, entry) => sum + entry.mortgageAmount, 0)
            }
          ],
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      }
    ];
  }

  function buildSimulationPdfLines(simulationResult) {
    const mortgageOnlyOfficerCount = simulationResult.simulationOfficers
      .filter((officer) => {
        const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officer.eligibility);
        return !eligibility.consumer && eligibility.mortgage;
      }).length;
    const singleMloVarianceNote = mortgageOnlyOfficerCount === 1
      ? 'Note: Mortgage variance can remain elevated when only one mortgage-only officer is configured.'
      : '';

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
      { text: `Consumer loan variance: ${simulationResult.fairnessSummary.consumerVariance.maxCountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 },
      { text: `Consumer dollar variance: ${simulationResult.fairnessSummary.consumerVariance.maxAmountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 },
      { text: 'Consumer variance is calculated from consumer-category loans only (mortgage loans excluded).', size: 10, gapAfter: 4 },
      { text: 'Flex officers are normalized by role-share in variance calculations when MLOs are present.', size: 10, gapAfter: 4 },
      { text: `Mortgage loan variance: ${simulationResult.fairnessSummary.mortgageVariance.maxCountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 },
      { text: `Mortgage dollar variance: ${simulationResult.fairnessSummary.mortgageVariance.maxAmountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: singleMloVarianceNote ? 4 : 10 },
      ...(singleMloVarianceNote ? [{ text: singleMloVarianceNote, size: 10, gapAfter: 10 }] : []),
      { text: 'Officer Monthly Totals', size: 14, gapAfter: 10 }
    ];

    const simulationOfficerMap = Object.fromEntries(simulationResult.simulationOfficers.map((entry) => [entry.name, entry]));

    simulationResult.officerStats.forEach((entry) => {
      lines.push({
        text: `${entry.officer} | Loans: ${entry.totalLoans} | Goal dollars: ${formatCurrency(entry.totalAmount)} | Consumer dollars: ${formatCurrency(entry.consumerAmount)} | Mortgage dollars: ${formatCurrency(entry.mortgageAmount)} | Avg loan: ${formatCurrency(entry.averageLoanAmount)} | Goal progress: ${entry.percentOfGoal.toFixed(1)}% | Vacation days: ${simulationOfficerMap[entry.officer]?.vacationDays || 0} | ${formatTypeCounts(entry.typeBreakdown)}`,
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
    const logoDataUrl = await getLogoImageDataUrl();
    writePdfLines(doc, buildSimulationPdfLines(simulationResult), simulationResult, {
      logoDataUrl
    });

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
    const mortgageOnlyOfficerCount = simulationResult.simulationOfficers
      .filter((officer) => {
        const eligibility = loanCategoryUtils.normalizeOfficerEligibility(officer.eligibility);
        return !eligibility.consumer && eligibility.mortgage;
      }).length;
    const singleMloVarianceNote = mortgageOnlyOfficerCount === 1
      ? 'Note: Mortgage variance can be higher when only one mortgage-only officer is configured.'
      : '';

    simulationResult.officerStats.forEach((entry) => {
      const officerCard = document.createElement('div');
      officerCard.className = 'result-group';
      officerCard.innerHTML = `
        <h3>${escapeHtml(entry.officer)} <span class="badge">${escapeHtml(String(entry.totalLoans))} simulated loans</span></h3>
        <div class="amount-summary">Goal dollars: ${escapeHtml(formatCurrency(entry.totalAmount))}</div>
        <div class="amount-summary">Consumer goal dollars: ${escapeHtml(formatCurrency(entry.consumerAmount))}</div>
        <div class="amount-summary">Mortgage goal dollars: ${escapeHtml(formatCurrency(entry.mortgageAmount))}</div>
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
        <div class="audit-summary-line"><strong>Consumer loan variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.consumerVariance.maxCountVariancePercent.toFixed(1))}%</div>
        <div class="audit-summary-line"><strong>Consumer dollar variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.consumerVariance.maxAmountVariancePercent.toFixed(1))}%</div>
        <div class="audit-summary-line">Consumer variance uses consumer-category loans only (mortgage loans excluded).</div>
        <div class="audit-summary-line">Flex officers are normalized by role-share in variance calculations when MLOs are present.</div>
        <div class="audit-summary-line"><strong>Mortgage loan variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.mortgageVariance.maxCountVariancePercent.toFixed(1))}%</div>
        <div class="audit-summary-line"><strong>Mortgage dollar variance:</strong> ${escapeHtml(simulationResult.fairnessSummary.mortgageVariance.maxAmountVariancePercent.toFixed(1))}%</div>
        ${singleMloVarianceNote ? `<div class="audit-summary-line">${escapeHtml(singleMloVarianceNote)}</div>` : ''}
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
      const availableOfficers = config.simulationOfficers.filter((officer) => !vacationByOfficer[officer.name]?.has(dateKey));
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

    const officerStats = buildSimulationOfficerStats(config.simulationOfficers.map((entry) => entry.name), loanHistoryEntries, config.eomGoalPerOfficer);
    const fairnessSummary = buildSimulationFairnessSummary(officerStats, config.simulationOfficers);

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
