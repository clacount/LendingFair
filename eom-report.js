(function initializeEndOfMonthReportFeature() {
  function buildEomPdfFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `Loan-Randomized-EOM-Report-${year}-${month}-${day}-${hours}${minutes}${seconds}.pdf`;
  }

  function getMonthLabel(date) {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long'
    }).format(date);
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
          isOnVacation: normalizedStats.isOnVacation
        };
      });
  }

  function buildFairnessSummary(officerStats) {
    const loanCounts = officerStats.map((entry) => entry.loanCount);
    const dollarAmounts = officerStats.map((entry) => entry.totalAmountRequested);
    const averageLoanCount = loanCounts.length
      ? loanCounts.reduce((sum, value) => sum + value, 0) / loanCounts.length
      : 0;
    const averageDollarAmount = dollarAmounts.length
      ? dollarAmounts.reduce((sum, value) => sum + value, 0) / dollarAmounts.length
      : 0;
    const highestLoanCount = loanCounts.length ? Math.max(...loanCounts) : 0;
    const lowestLoanCount = loanCounts.length ? Math.min(...loanCounts) : 0;
    const highestDollarAmount = dollarAmounts.length ? Math.max(...dollarAmounts) : 0;
    const lowestDollarAmount = dollarAmounts.length ? Math.min(...dollarAmounts) : 0;
    const maxCountVariancePercent = averageLoanCount
      ? ((highestLoanCount - lowestLoanCount) / averageLoanCount) * 100
      : 0;
    const maxAmountVariancePercent = averageDollarAmount
      ? ((highestDollarAmount - lowestDollarAmount) / averageDollarAmount) * 100
      : 0;

    return {
      averageLoanCount,
      averageDollarAmount,
      highestLoanCount,
      lowestLoanCount,
      highestDollarAmount,
      lowestDollarAmount,
      maxCountVariancePercent,
      maxAmountVariancePercent,
      countDistributionPass: maxCountVariancePercent <= 15,
      amountDistributionPass: maxAmountVariancePercent <= 20,
      overallPass: maxCountVariancePercent <= 15 && maxAmountVariancePercent <= 20
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

  function buildEomPdfLines(report) {
    const lines = [
      { text: 'End of Month Loan Randomizer Report', size: 18, gapAfter: 16 },
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
      { text: `Fairness status: ${report.fairnessSummary.overallPass ? 'PASS' : 'REVIEW'}`, size: 11, gapAfter: 12 },
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

  async function saveEomReportPdf(report) {
    if (!outputDirectoryHandle) {
      throw new Error('Choose an output folder before ending the month.');
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('The PDF library did not load correctly.');
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    writePdfLines(doc, buildEomPdfLines(report), report);

    const pdfBlob = doc.output('blob');
    const fileName = buildEomPdfFileName(report.generatedAt);
    const fileHandle = await outputDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(pdfBlob);
    await writable.close();

    return fileName;
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

  async function handleEndOfMonthClick() {
    if (!outputDirectoryHandle) {
      setMessage('Choose an output folder before ending the month.', 'warning');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to generate the end-of-month report and archive this month\'s loan tracking?');
    if (!confirmed) {
      return;
    }

    try {
      const report = await buildEomReport();
      const pdfFileName = await saveEomReportPdf(report);
      const archiveFileName = await archiveRunningTotalsForEndOfMonth();
      resetAppAfterEndOfMonth();
      setMessage(`End-of-month report saved to ${pdfFileName}. Loan tracking archived to ${archiveFileName}. Choose Output Folder to start the next month.`, 'success');
    } catch (error) {
      setMessage(`Could not complete End of Month: ${error.message}`, 'warning');
    }
  }

  const originalButton = document.getElementById('endOfMonthBtn');
  if (!originalButton) {
    return;
  }

  const replacementButton = originalButton.cloneNode(true);
  originalButton.replaceWith(replacementButton);
  replacementButton.addEventListener('click', handleEndOfMonthClick);
})();
