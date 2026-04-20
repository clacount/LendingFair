(function initializeEndOfMonthReportFeature() {
  const fairnessEngineService = window.FairnessEngineService;
  const loanCategoryUtils = window.LoanCategoryUtils;
  function buildEomPdfFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `Loan-Randomized-EOM-Report-${year}-${month}-${day}-${hours}${minutes}${seconds}.pdf`;
  }

  function buildCustomReportPdfFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `Loan-Randomized-Custom-Report-${year}-${month}-${day}-${hours}${minutes}${seconds}.pdf`;
  }

  function getMonthLabel(date) {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long'
    }).format(date);
  }

  function setReportingMessage(element, text = '', tone = 'warning') {
    if (!element) {
      return;
    }

    element.textContent = text;
    element.dataset.tone = text ? tone : '';
  }

  function normalizeHistoryEntries(loanHistory) {
    return Object.values(loanHistory?.loans || {})
      .map((entry) => normalizeLoanHistoryEntry(entry))
      .filter(Boolean)
      .sort((entryA, entryB) => {
        const generatedAtA = entryA.generatedAt || '';
        const generatedAtB = entryB.generatedAt || '';
        return generatedAtA.localeCompare(generatedAtB) || entryA.loanName.localeCompare(entryB.loanName);
      });
  }

  function buildOfficerMonthlyStats(runningTotals) {
    return Object.entries(runningTotals?.officers || {})
      .sort(([officerA], [officerB]) => officerA.localeCompare(officerB))
      .map(([officer, stats]) => {
        const normalizedStats = normalizeOfficerStats(stats);
        return {
          officer,
          loanCount: normalizedStats.loanCount,
          totalAmountRequested: normalizedStats.totalAmountRequested,
          averageLoanAmount: normalizedStats.loanCount ? normalizedStats.totalAmountRequested / normalizedStats.loanCount : 0,
          typeCounts: normalizedStats.typeCounts,
          activeSessionCount: normalizedStats.activeSessionCount,
          isOnVacation: normalizedStats.isOnVacation,
          eligibility: normalizedStats.eligibility,
          mortgageOverride: normalizedStats.mortgageOverride
        };
      });
  }

  function buildOfficerStatsFromHistory(entries, officerConfigByName = {}) {
    const officerMap = new Map();

    entries.forEach((entry) => {
      const officer = String(entry.assignedOfficer || '').trim() || 'Unassigned';
      const officerConfig = normalizeOfficerStats(officerConfigByName[officer]);
      if (!officerMap.has(officer)) {
        officerMap.set(officer, {
          officer,
          loanCount: 0,
          totalAmountRequested: 0,
          averageLoanAmount: 0,
          typeCounts: {},
          activeSessionCount: 0,
          isOnVacation: false,
          eligibility: officerConfig.eligibility,
          mortgageOverride: officerConfig.mortgageOverride
        });
      }

      const stats = officerMap.get(officer);
      stats.loanCount += 1;
      stats.totalAmountRequested += Number(entry.amountRequested) || 0;
      stats.typeCounts[entry.type] = (stats.typeCounts[entry.type] || 0) + 1;
    });

    return Array.from(officerMap.values())
      .map((stats) => ({
        ...stats,
        averageLoanAmount: stats.loanCount ? stats.totalAmountRequested / stats.loanCount : 0,
        typeCounts: normalizeTypeCounts(stats.typeCounts)
      }))
      .sort((officerA, officerB) => officerA.officer.localeCompare(officerB.officer));
  }

  function normalizeFairnessEligibility(eligibility) {
    if (loanCategoryUtils?.normalizeOfficerEligibility) {
      return loanCategoryUtils.normalizeOfficerEligibility(eligibility);
    }

    return {
      consumer: typeof eligibility?.consumer === 'boolean' ? eligibility.consumer : true,
      mortgage: typeof eligibility?.mortgage === 'boolean' ? eligibility.mortgage : true
    };
  }

  function buildFairnessSummary(officerStats) {
    const officerFairnessStats = officerStats.map((entry) => {
      const totalLoans = Number(entry.loanCount) || 0;
      const totalAmount = Number(entry.totalAmountRequested) || 0;
      let consumerLoanCount = 0;
      let mortgageLoanCount = 0;

      Object.entries(entry.typeCounts || {}).forEach(([typeName, count]) => {
        if (getLoanCategoryForType(typeName) === 'mortgage') {
          mortgageLoanCount += Number(count) || 0;
        } else {
          consumerLoanCount += Number(count) || 0;
        }
      });

      const consumerShare = totalLoans ? consumerLoanCount / totalLoans : 0;
      const mortgageShare = totalLoans ? mortgageLoanCount / totalLoans : 0;

      return {
        officer: entry.officer,
        totalLoans,
        totalAmount,
        consumerLoanCount,
        consumerAmount: totalAmount * consumerShare,
        mortgageLoanCount,
        mortgageAmount: totalAmount * mortgageShare,
        typeBreakdown: entry.typeCounts || {}
      };
    });

    const fairnessEvaluation = fairnessEngineService.evaluateFairness({
      engineType: fairnessEngineService.getSelectedFairnessEngine(),
      officers: officerStats.map((entry) => ({
        name: entry.officer,
        eligibility: normalizeFairnessEligibility(entry.eligibility),
        mortgageOverride: Boolean(entry.mortgageOverride)
      })),
      officerStats: officerFairnessStats
    });

    return {
      averageLoanCount: fairnessEvaluation.metrics.averageLoanCount,
      averageDollarAmount: fairnessEvaluation.metrics.averageDollarAmount,
      highestLoanCount: officerStats.length ? Math.max(...officerStats.map((entry) => entry.loanCount)) : 0,
      lowestLoanCount: officerStats.length ? Math.min(...officerStats.map((entry) => entry.loanCount)) : 0,
      highestDollarAmount: officerStats.length ? Math.max(...officerStats.map((entry) => entry.totalAmountRequested)) : 0,
      lowestDollarAmount: officerStats.length ? Math.min(...officerStats.map((entry) => entry.totalAmountRequested)) : 0,
      maxCountVariancePercent: fairnessEvaluation.metrics.maxCountVariancePercent,
      maxAmountVariancePercent: fairnessEvaluation.metrics.maxAmountVariancePercent,
      countDistributionPass: fairnessEvaluation.metrics.maxCountVariancePercent <= 15,
      amountDistributionPass: fairnessEvaluation.metrics.maxAmountVariancePercent <= 20,
      overallPass: fairnessEvaluation.overallResult === 'PASS',
      evaluation: fairnessEvaluation
    };
  }


  function buildEomDistributionCharts(officerStats) {
    const distribution = officerStats.map((entry) => ({
      officer: entry.officer,
      loanCount: entry.loanCount,
      totalAmountRequested: entry.totalAmountRequested
    }));

    return [
      {
        title: 'End of Month Loan Count Distribution',
        imageDataUrl: drawDonutChart({
          title: 'End of Month Loan Count Distribution',
          distribution,
          field: 'loanCount',
          valueFormatter: (value) => `${value} loans`
        }).imageDataUrl
      },
      {
        title: 'End of Month Goal Dollar Distribution',
        imageDataUrl: drawDonutChart({
          title: 'End of Month Goal Dollar Distribution',
          distribution,
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      }
    ];
  }

  function buildCustomDistributionCharts(officerStats, titlePrefix) {
    const distribution = officerStats.map((entry) => ({
      officer: entry.officer,
      loanCount: entry.loanCount,
      totalAmountRequested: entry.totalAmountRequested
    }));

    return [
      {
        title: `${titlePrefix} Loan Count Distribution`,
        imageDataUrl: drawDonutChart({
          title: `${titlePrefix} Loan Count Distribution`,
          distribution,
          field: 'loanCount',
          valueFormatter: (value) => `${value} loans`
        }).imageDataUrl
      },
      {
        title: `${titlePrefix} Dollar Distribution`,
        imageDataUrl: drawDonutChart({
          title: `${titlePrefix} Dollar Distribution`,
          distribution,
          field: 'totalAmountRequested',
          valueFormatter: (value) => formatCurrency(value)
        }).imageDataUrl
      }
    ];
  }

  function buildEvaluationNoteLines(notes = []) {
    const normalizedNotes = notes
      .map((note) => String(note || '').replace(/^Note:\s*/i, '').trim())
      .filter(Boolean);

    if (!normalizedNotes.length) {
      return [];
    }

    return [
      { text: 'Notes:', size: 12, gapAfter: 4 },
      ...normalizedNotes.map((note) => ({ text: `- ${note}`, size: 10, gapAfter: 4 }))
    ];
  }

  function buildEomPdfLines(report) {
    const lines = [
      { text: 'End of Month Loan Assignment Report', size: 18, gapAfter: 16 },
      { text: `Month: ${report.monthLabel}`, size: 11, gapAfter: 4 },
      { text: `Generated: ${formatDisplayTimestamp(report.generatedAt)}`, size: 11, gapAfter: 4 },
      { text: `Loan officers tracked: ${report.officerStats.length}`, size: 11, gapAfter: 4 },
      { text: `Loans tracked: ${report.totalLoans}`, size: 11, gapAfter: 4 },
      { text: `Goal dollars tracked: ${formatCurrency(report.totalAmountRequested)}`, size: 11, gapAfter: 14 },
      { text: 'Monthly Summary', size: 14, gapAfter: 10 },
      { text: `Average loans per officer: ${report.fairnessSummary.averageLoanCount.toFixed(2)}`, size: 11, gapAfter: 4 },
      { text: `Average goal dollars per officer: ${formatCurrency(report.fairnessSummary.averageDollarAmount)}`, size: 11, gapAfter: 4 },
      { text: `Loan count variance: ${report.fairnessSummary.maxCountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 },
      { text: `Goal dollar variance: ${report.fairnessSummary.maxAmountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 },
      { text: `Fairness status: ${report.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}`, size: 11, gapAfter: 4 },
      { text: `Fairness model: ${fairnessEngineService.FAIRNESS_ENGINE_LABELS[report.fairnessSummary.evaluation.engineType]}`, size: 11, gapAfter: 4 },
      ...report.fairnessSummary.evaluation.summaryItems.map((item) => ({ text: item, size: 11, gapAfter: 4 })),
      ...buildEvaluationNoteLines(report.fairnessSummary.evaluation.notes),
      { text: '', size: 10, gapAfter: 6 },
      { text: 'Officer Totals', size: 14, gapAfter: 10 }
    ];

    report.officerStats.forEach((entry) => {
      lines.push({
        text: `${entry.officer} | Loans: ${entry.loanCount} | Goal dollars: ${formatCurrency(entry.totalAmountRequested)} | Avg loan: ${formatCurrency(entry.averageLoanAmount)} | Active sessions: ${entry.activeSessionCount} | ${formatTypeCounts(entry.typeCounts)}`,
        size: 11,
        gapAfter: 6
      });
    });

    lines.push({ text: '', size: 11, gapAfter: 8 });
    lines.push({ text: 'Monthly Loan History', size: 14, gapAfter: 10 });

    report.loanHistoryEntries.forEach((entry) => {
      const generatedAtLabel = entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : 'Unknown date';
      lines.push({
        text: `${generatedAtLabel} | ${entry.loanName} (${entry.type}, ${formatCurrency(entry.amountRequested)}) -> ${entry.assignedOfficer}`,
        size: 10,
        gapAfter: 4
      });
    });

    if (report.distributionCharts.length) {
      lines.push({ text: '', size: 11, gapAfter: 8 });
      lines.push({ text: 'Distribution Snapshot', size: 14, gapAfter: 10 });
      lines.push({ text: '__DISTRIBUTION_CHARTS__', size: 11, gapAfter: 0 });
    }

    return lines;
  }

  function buildCustomReportPdfLines(report) {
    const lines = [
      { text: `Loan Assignment ${report.reportTypeLabel}`, size: 18, gapAfter: 16 },
      { text: `Report type: ${report.reportTypeLabel}`, size: 11, gapAfter: 4 },
      { text: `Date range: ${report.startDateLabel} through ${report.endDateLabel}`, size: 11, gapAfter: 4 },
      { text: `Generated: ${formatDisplayTimestamp(report.generatedAt)}`, size: 11, gapAfter: 4 },
      { text: `Loan officers included: ${report.officerStats.length}`, size: 11, gapAfter: 4 },
      { text: `Loans included: ${report.totalLoans}`, size: 11, gapAfter: 4 },
      { text: `Total dollars included: ${formatCurrency(report.totalAmountRequested)}`, size: 11, gapAfter: 14 }
    ];

    if (report.includeSummary) {
      lines.push({ text: 'Summary', size: 14, gapAfter: 10 });
      lines.push({ text: `Average loans per officer: ${report.fairnessSummary.averageLoanCount.toFixed(2)}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Average dollars per officer: ${formatCurrency(report.fairnessSummary.averageDollarAmount)}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Fairness status: ${report.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Fairness model: ${fairnessEngineService.FAIRNESS_ENGINE_LABELS[report.fairnessSummary.evaluation.engineType]}`, size: 11, gapAfter: 4 });
      report.fairnessSummary.evaluation.summaryItems.forEach((item) => {
        lines.push({ text: item, size: 11, gapAfter: 4 });
      });
      buildEvaluationNoteLines(report.fairnessSummary.evaluation.notes).forEach((line) => {
        lines.push(line);
      });
      lines.push({ text: '', size: 10, gapAfter: 6 });
    }

    if (report.includeOfficerTotals) {
      lines.push({ text: 'Officer Totals', size: 14, gapAfter: 10 });
      report.officerStats.forEach((entry) => {
        lines.push({
          text: `${entry.officer} | Loans: ${entry.loanCount} | Dollars: ${formatCurrency(entry.totalAmountRequested)} | Avg loan: ${formatCurrency(entry.averageLoanAmount)} | ${formatTypeCounts(entry.typeCounts)}`,
          size: 11,
          gapAfter: 6
        });
      });
    }

    if (report.includeFairnessAudit) {
      lines.push({ text: '', size: 11, gapAfter: 8 });
      lines.push({ text: 'Fairness Audit', size: 14, gapAfter: 10 });
      lines.push({ text: `Loan count variance: ${report.fairnessSummary.maxCountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 });
      lines.push({ text: `Dollar variance: ${report.fairnessSummary.maxAmountVariancePercent.toFixed(1)}%`, size: 11, gapAfter: 4 });
      lines.push({ text: `Highest loan count: ${report.fairnessSummary.highestLoanCount}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Lowest loan count: ${report.fairnessSummary.lowestLoanCount}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Highest dollar total: ${formatCurrency(report.fairnessSummary.highestDollarAmount)}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Lowest dollar total: ${formatCurrency(report.fairnessSummary.lowestDollarAmount)}`, size: 11, gapAfter: 4 });
      lines.push({ text: `Fairness model: ${fairnessEngineService.FAIRNESS_ENGINE_LABELS[report.fairnessSummary.evaluation.engineType]}`, size: 11, gapAfter: 4 });
      report.fairnessSummary.evaluation.summaryItems.forEach((item) => {
        lines.push({ text: item, size: 11, gapAfter: 4 });
      });
      buildEvaluationNoteLines(report.fairnessSummary.evaluation.notes).forEach((line) => {
        lines.push(line);
      });
      lines.push({ text: '', size: 10, gapAfter: 4 });
    }

    if (report.includeLoanHistory) {
      lines.push({ text: 'Loan History', size: 14, gapAfter: 10 });
      report.loanHistoryEntries.forEach((entry) => {
        const generatedAtLabel = entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : 'Unknown date';
        lines.push({
          text: `${generatedAtLabel} | ${entry.loanName} (${entry.type}, ${formatCurrency(entry.amountRequested)}) -> ${entry.assignedOfficer}`,
          size: 10,
          gapAfter: 4
        });
      });
    }

    if (report.distributionCharts.length) {
      lines.push({ text: '', size: 11, gapAfter: 8 });
      lines.push({ text: 'Distribution Snapshot', size: 14, gapAfter: 10 });
      lines.push({ text: '__DISTRIBUTION_CHARTS__', size: 11, gapAfter: 0 });
    }

    return lines;
  }

  async function savePdfFromLines(fileName, lines, report, options = {}) {
    if (!outputDirectoryHandle) {
      throw new Error('Choose an output folder before generating a report.');
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('The PDF library did not load correctly.');
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    const logoDataUrl = await getLogoImageDataUrl();
    writePdfLines(doc, lines, report, {
      logoDataUrl
    });

    const pdfBlob = doc.output('blob');
    const targetDirectoryHandle = await getActiveDataDirectoryHandle();
    const fileHandle = await targetDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(pdfBlob);
    await writable.close();

    let previewUrl = '';
    if (options.openInNewTab) {
      previewUrl = URL.createObjectURL(pdfBlob);
      if (options.previewWindow && !options.previewWindow.closed) {
        options.previewWindow.location.href = previewUrl;
      } else {
        window.open(previewUrl, '_blank');
      }
    }

    return { fileName, previewUrl };
  }

  async function saveEomReportPdf(report, options = {}) {
    return savePdfFromLines(buildEomPdfFileName(report.generatedAt), buildEomPdfLines(report), report, options);
  }

  async function saveCustomReportPdf(report, options = {}) {
    return savePdfFromLines(buildCustomReportPdfFileName(report.generatedAt), buildCustomReportPdfLines(report), report, options);
  }

  async function buildEomReport() {
    const generatedAt = new Date();
    const [{ runningTotals }, { loanHistory }] = await Promise.all([
      loadRunningTotals(),
      loadLoanHistory()
    ]);

    const officerStats = buildOfficerMonthlyStats(runningTotals);
    const loanHistoryEntries = normalizeHistoryEntries(loanHistory);

    if (!officerStats.length && !loanHistoryEntries.length) {
      throw new Error('There is no current month data to include in an end-of-month report.');
    }

    return {
      monthLabel: getMonthLabel(generatedAt),
      generatedAt,
      officerStats,
      loanHistoryEntries,
      totalLoans: loanHistoryEntries.length,
      totalAmountRequested: officerStats.reduce((sum, entry) => sum + entry.totalAmountRequested, 0),
      fairnessSummary: buildFairnessSummary(officerStats),
      distributionCharts: buildEomDistributionCharts(officerStats)
    };
  }

  function parseDateInputToBounds(dateValue, isEndOfDay = false) {
    if (!dateValue) {
      return null;
    }

    const date = new Date(`${dateValue}T${isEndOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getCustomReportTypeSettings(reportType) {
    if (reportType === 'summary') {
      return {
        reportTypeLabel: 'Summary Report',
        includeSummary: true,
        includeOfficerTotals: true,
        includeFairnessAudit: false,
        includeLoanHistory: false
      };
    }

    if (reportType === 'fairness') {
      return {
        reportTypeLabel: 'Fairness Audit Report',
        includeSummary: true,
        includeOfficerTotals: true,
        includeFairnessAudit: true,
        includeLoanHistory: false
      };
    }

    if (reportType === 'history') {
      return {
        reportTypeLabel: 'Full Loan History Report',
        includeSummary: true,
        includeOfficerTotals: true,
        includeFairnessAudit: true,
        includeLoanHistory: true
      };
    }

    return {
      reportTypeLabel: 'Officer Totals Report',
      includeSummary: true,
      includeOfficerTotals: true,
      includeFairnessAudit: false,
      includeLoanHistory: false
    };
  }

  async function buildCustomReport(config) {
    const generatedAt = new Date();
    const [{ loanHistory }, { runningTotals }] = await Promise.all([
      loadLoanHistory(),
      loadRunningTotals()
    ]);
    const allEntries = normalizeHistoryEntries(loanHistory);
    const startBound = parseDateInputToBounds(config.startDate, false);
    const endBound = parseDateInputToBounds(config.endDate, true);

    if (!startBound || !endBound) {
      throw new Error('Select both a start date and an end date.');
    }

    if (startBound > endBound) {
      throw new Error('Start date must be on or before the end date.');
    }

    const filteredEntries = allEntries.filter((entry) => {
      const generatedAtDate = entry.generatedAt ? new Date(entry.generatedAt) : null;
      if (!generatedAtDate || Number.isNaN(generatedAtDate.getTime())) {
        return false;
      }
      return generatedAtDate >= startBound && generatedAtDate <= endBound;
    });

    if (!filteredEntries.length) {
      throw new Error('No loan history was found for the selected date range.');
    }

    const officerStats = buildOfficerStatsFromHistory(filteredEntries, runningTotals?.officers || {});
    const fairnessSummary = buildFairnessSummary(officerStats);
    const reportSettings = getCustomReportTypeSettings(config.reportType);

    return {
      generatedAt,
      startDateLabel: startBound.toLocaleDateString(),
      endDateLabel: endBound.toLocaleDateString(),
      officerStats,
      loanHistoryEntries: filteredEntries,
      totalLoans: filteredEntries.length,
      totalAmountRequested: filteredEntries.reduce((sum, entry) => sum + (Number(entry.amountRequested) || 0), 0),
      fairnessSummary,
      distributionCharts: buildCustomDistributionCharts(officerStats, 'Custom Report'),
      ...reportSettings
    };
  }

  async function handleEndOfMonthClick() {
    if (!outputDirectoryHandle) {
      setStepMessage('step1', 'Choose an output folder before ending the month.', 'warning');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to generate the end-of-month report and archive this month\'s loan tracking?');
    if (!confirmed) {
      return;
    }

    const previewWindow = window.open('', '_blank');

    try {
      const report = await buildEomReport();
      const result = await saveEomReportPdf(report, {
        openInNewTab: true,
        previewWindow
      });
      const archiveFileName = await archiveRunningTotalsForEndOfMonth();
      await resetAppAfterEndOfMonth();
      const successMessage = result.previewUrl
        ? `End-of-month report saved to ${result.fileName}, opened in a new tab, and loan tracking archived to ${archiveFileName}. Choose Output Folder to start the next month.`
        : `End-of-month report saved to ${result.fileName}. Loan tracking archived to ${archiveFileName}. Choose Output Folder to start the next month.`;
      setMessage(successMessage, 'success');
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      setMessage(`Could not complete End of Month: ${error.message}`, 'warning');
    }
  }

  async function handleCustomReportSubmit(event) {
    event.preventDefault();

    const customReportMessage = document.getElementById('customReportMessage');
    setReportingMessage(customReportMessage, 'Generating custom report...', 'success');

    if (!outputDirectoryHandle) {
      const warningMessage = 'Choose an output folder before generating a custom report.';
      setReportingMessage(customReportMessage, warningMessage, 'warning');
      setStepMessage('step1', warningMessage, 'warning');
      return;
    }

    const startDateInput = document.getElementById('customReportStartDate');
    const endDateInput = document.getElementById('customReportEndDate');
    const reportTypeInput = document.getElementById('customReportType');
    const previewWindow = window.open('', '_blank');

    try {
      const report = await buildCustomReport({
        startDate: startDateInput?.value || '',
        endDate: endDateInput?.value || '',
        reportType: reportTypeInput?.value || 'summary'
      });
      const result = await saveCustomReportPdf(report, {
        openInNewTab: true,
        previewWindow
      });
      const successMessage = result.previewUrl
        ? `Custom report saved to ${result.fileName} and opened in a new tab.`
        : `Custom report saved to ${result.fileName}.`;
      setReportingMessage(customReportMessage, successMessage, 'success');
      setMessage(successMessage, 'success');
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      const errorMessage = `Could not generate custom report: ${error.message}`;
      setReportingMessage(customReportMessage, errorMessage, 'warning');
      setMessage(errorMessage, 'warning');
    }
  }

  function initializeReportingHub(boundEndOfMonthButton) {
    const appRoot = document.querySelector('.app');
    const mainGrid = document.querySelector('main.grid');
    const simulationLaunchCard = document.getElementById('simulationLaunchCard');
    const runSimulationButton = document.getElementById('runSimulationBtn');

    if (!appRoot || !mainGrid || !simulationLaunchCard || !boundEndOfMonthButton || !runSimulationButton) {
      return;
    }

    const introSteps = appRoot.querySelector('.intro-steps');
    const viewSwitcher = document.createElement('div');
    viewSwitcher.className = 'view-switcher';
    viewSwitcher.innerHTML = `
      <button id="operationsViewBtn" class="view-switcher-btn active" type="button">Live Assignment Workspace</button>
      <button id="reportingViewBtn" class="view-switcher-btn" type="button">Reports &amp; Simulation</button>
    `;

    if (introSteps) {
      introSteps.insertAdjacentElement('afterend', viewSwitcher);
    } else {
      appRoot.insertBefore(viewSwitcher, mainGrid);
    }

    const operationsView = document.createElement('section');
    operationsView.className = 'workspace-view active';
    operationsView.id = 'operationsView';

    const reportingView = document.createElement('section');
    reportingView.className = 'workspace-view';
    reportingView.id = 'reportingView';
    reportingView.hidden = true;
    reportingView.innerHTML = `
      <div class="reporting-grid">
        <section class="card full reporting-hero-card">
          <h2>Reporting & Fairness Tools</h2>
          <p class="hint">Use this section to generate reports, review month-end data, and simulate fairness without cluttering the live assignment workflow.</p>
        </section>
        <section id="simulationReportingCard" class="card full reporting-card"></section>
        <section class="card reporting-card">
          <h2>End of Month Report</h2>
          <p class="hint">Generate the official month-end PDF and archive the current month’s tracking files.</p>
          <div class="reporting-actions">
            <button id="reportingEndOfMonthBtn" class="primary" type="button">Generate EOM Report</button>
          </div>
        </section>
        <section class="card reporting-card">
          <h2>Custom Date Range Reports</h2>
          <p class="hint">Generate a report for any tracked date range in the current loan history file.</p>
          <form id="customReportForm" class="custom-report-form">
            <label>
              <span>Start date</span>
              <input id="customReportStartDate" type="date" required />
            </label>
            <label>
              <span>End date</span>
              <input id="customReportEndDate" type="date" required />
            </label>
            <label class="full-width">
              <span>Report type</span>
              <select id="customReportType" class="loan-type-select">
                <option value="summary">Summary</option>
                <option value="officer_totals">Officer Totals</option>
                <option value="fairness">Fairness Audit</option>
                <option value="history">Full Loan History</option>
              </select>
            </label>
            <div id="customReportMessage" class="message full-width"></div>
            <div class="reporting-actions full-width">
              <button id="customReportSubmitBtn" class="primary" type="submit">Generate Custom Report</button>
            </div>
          </form>
        </section>
      </div>
    `;

    const originalChildren = Array.from(mainGrid.children);
    originalChildren.forEach((child) => operationsView.appendChild(child));

    mainGrid.appendChild(operationsView);
    mainGrid.appendChild(reportingView);

    const simulationReportingCard = document.getElementById('simulationReportingCard');
    if (simulationReportingCard) {
      simulationReportingCard.innerHTML = `
        <h2>Fairness Simulation</h2>
        <p class="hint">Run a full month simulation to validate fairness distribution without affecting production data.</p>
      `;
      simulationReportingCard.appendChild(simulationLaunchCard);
      simulationLaunchCard.classList.add('simulation-launch-card-reporting');
    }

    const operationsViewBtn = document.getElementById('operationsViewBtn');
    const reportingViewBtn = document.getElementById('reportingViewBtn');
    const reportingEndOfMonthBtn = document.getElementById('reportingEndOfMonthBtn');
    const customReportForm = document.getElementById('customReportForm');
    const customReportStartDate = document.getElementById('customReportStartDate');
    const customReportEndDate = document.getElementById('customReportEndDate');

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (customReportStartDate) {
      customReportStartDate.value = todayKey;
    }
    if (customReportEndDate) {
      customReportEndDate.value = todayKey;
    }

    function setActiveView(viewName) {
      const showingOperations = viewName === 'operations';
      operationsView.hidden = !showingOperations;
      reportingView.hidden = showingOperations;
      operationsViewBtn?.classList.toggle('active', showingOperations);
      reportingViewBtn?.classList.toggle('active', !showingOperations);
    }

    operationsViewBtn?.addEventListener('click', () => setActiveView('operations'));
    reportingViewBtn?.addEventListener('click', () => setActiveView('reporting'));
    reportingEndOfMonthBtn?.addEventListener('click', () => boundEndOfMonthButton.click());
    customReportForm?.addEventListener('submit', handleCustomReportSubmit);
  }

  const originalButton = document.getElementById('endOfMonthBtn');
  if (!originalButton) {
    return;
  }

  const replacementButton = originalButton.cloneNode(true);
  originalButton.replaceWith(replacementButton);
  replacementButton.addEventListener('click', handleEndOfMonthClick);
  initializeReportingHub(replacementButton);
})();
