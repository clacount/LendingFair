(function initializeFairnessView(globalScope) {
  function updateFairnessMethodologyCopy(options = {}) {
    const displayService = globalScope.FairnessDisplayService;
    const methodEl = options.methodEl || document.querySelector('.fairness-methodology');
    const thresholdEl = options.thresholdEl || document.querySelector('.fairness-thresholds');
    const hintEl = options.hintEl || document.getElementById('fairnessModelHint');
    const modelBadgeEls = options.modelBadgeEls || document.querySelectorAll('[data-fairness-model-badge]');

    if (!displayService || !methodEl) {
      return;
    }

    const engineType = options.engineType || globalScope.FairnessEngineService?.getSelectedFairnessEngine?.() || 'global';
    const modelLabel = displayService.getFairnessModelLabel(engineType);

    methodEl.textContent = displayService.buildFairnessMethodologyCopy(engineType);
    if (thresholdEl) {
      thresholdEl.textContent = displayService.buildFairnessThresholdCopy(engineType);
    }
    if (hintEl) {
      hintEl.textContent = engineType === 'officer_lane'
        ? 'Officer Lane Fairness evaluates fairness within officer roles and lanes.'
        : 'Global Fairness compares all officers more evenly across total opportunity.';
    }
    modelBadgeEls.forEach((el) => {
      // Shared badge update keeps the active model visible in live and simulation areas.
      el.textContent = modelLabel;
    });
  }

  function renderLiveFairnessSummaryCard(containerEl, evaluation) {
    if (!containerEl || !evaluation) {
      return;
    }

    const notes = globalScope.FairnessDisplayService?.buildFairnessNotesForDisplay(evaluation) || [];
    const modelNote = notes.find((note) => note.startsWith('Model note:')) || '';
    const detailNotes = notes.filter((note) => note !== modelNote);
    const statusLabel = String(evaluation.overallResult || 'REVIEW').toUpperCase();
    const statusClass = statusLabel.toLowerCase();
    const card = document.createElement('div');
    card.className = 'audit-card';
    card.innerHTML = `
      <h3>Live Fairness Summary <span class="badge badge-${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span></h3>
      <div class="audit-summary">
        <div class="audit-summary-line"><strong>Fairness model:</strong> ${escapeHtml(globalScope.FairnessDisplayService?.getFairnessModelLabel(evaluation.engineType) || 'Global Fairness')}</div>
        ${modelNote ? `<div class="audit-summary-line">${escapeHtml(modelNote.replace(/^Model note:\s*/i, 'Model note: '))}</div>` : ''}
        ${(evaluation.summaryItems || []).map((item) => `<div class="audit-summary-line">${escapeHtml(String(item))}</div>`).join('')}
        ${detailNotes.map((note) => `<div class="audit-summary-line">${escapeHtml(note)}</div>`).join('')}
      </div>
    `;

    containerEl.appendChild(card);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  globalScope.FairnessView = {
    updateFairnessMethodologyCopy,
    renderLiveFairnessSummaryCard
  };
})(window);
