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
    if (!simulationModalMessageEl) return;
    simulationModalMessageEl.textContent = text;
    simulationModalMessageEl.dataset.tone = text ? tone : '';
  }

  function populateSimulationDefaults() {
    simulationMonthInput && (simulationMonthInput.value = getCurrentMonthKey());
    simulationBusinessDaysInput && (simulationBusinessDaysInput.value = DEFAULT_BUSINESS_DAYS);
    simulationMinLoansInput && (simulationMinLoansInput.value = DEFAULT_MIN_LOANS_PER_DAY);
    simulationMaxLoansInput && (simulationMaxLoansInput.value = DEFAULT_MAX_LOANS_PER_DAY);
    simulationEomGoalInput && (simulationEomGoalInput.value = DEFAULT_EOM_GOAL_PER_OFFICER);
  }

  function openSimulationModal() {
    if (!simulationModalEl) return;
    populateSimulationDefaults();
    setSimulationModalMessage('');
    simulationModalEl.hidden = false;
    simulationMonthInput?.focus();
  }

  function closeSimulationModal() {
    if (!simulationModalEl) return;
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
    return function () {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getSimulationConfigFromModal(officers) {
    const monthLabel = simulationMonthInput.value.trim();
    const businessDays = parseInt(simulationBusinessDaysInput.value, 10);
    const minLoansPerDay = parseInt(simulationMinLoansInput.value, 10);
    const maxLoansPerDay = parseInt(simulationMaxLoansInput.value, 10);
    const eomGoalPerOfficer = parseFloat(simulationEomGoalInput.value);
    const seed = Date.now();

    if (!/^\d{4}-\d{2}$/.test(monthLabel)) throw new Error('Invalid month');
    if (businessDays <= 0) throw new Error('Invalid business days');
    if (minLoansPerDay <= 0) throw new Error('Invalid min loans');
    if (maxLoansPerDay < minLoansPerDay) throw new Error('Max must be >= min');

    return { monthLabel, officerNames: officers, businessDays, minLoansPerDay, maxLoansPerDay, eomGoalPerOfficer, seed };
  }

  async function handleSimulationSubmit(event) {
    event.preventDefault();
    try {
      const config = getSimulationConfigFromModal(getOfficerValues());
      const result = await runFairnessSimulationFromConfig(config);
      renderSimulationResults(result);
      await saveSimulationPdf(result);
      closeSimulationModal();
      setMessage('Simulation complete', 'success');
    } catch (err) {
      setSimulationModalMessage(err.message);
    }
  }

  runSimulationBtn?.addEventListener('click', openSimulationModal);
  closeSimulationModalBtn?.addEventListener('click', closeSimulationModal);
  cancelSimulationBtn?.addEventListener('click', closeSimulationModal);
  simulationFormEl?.addEventListener('submit', handleSimulationSubmit);
  simulationFormEl?.addEventListener('keydown', preventEnterSubmit);

  simulationModalEl?.addEventListener('click', (e) => {
    if (e.target === simulationModalEl) closeSimulationModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !simulationModalEl.hidden) closeSimulationModal();
  });
})();
