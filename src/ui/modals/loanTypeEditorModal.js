(function initializeLoanTypeEditorModal(globalScope) {
  function setModalMessage(messageEl, text = '', tone = 'warning') {
    if (!messageEl) {
      return;
    }
    messageEl.textContent = text;
    messageEl.dataset.tone = text ? tone : '';
  }

  function syncSeasonalAvailability({ availabilityInput, startInput, endInput }) {
    const isSeasonal = availabilityInput?.value === 'seasonal';
    if (startInput) {
      startInput.disabled = !isSeasonal;
      if (!isSeasonal) {
        startInput.value = '';
      }
    }
    if (endInput) {
      endInput.disabled = !isSeasonal;
      if (!isSeasonal) {
        endInput.value = '';
      }
    }
  }

  function closeModal(modalEl, onClose) {
    if (typeof onClose === 'function') {
      onClose();
    }
    if (modalEl) {
      modalEl.hidden = true;
    }
  }

  globalScope.LoanTypeEditorModal = {
    setModalMessage,
    syncSeasonalAvailability,
    closeModal
  };
})(window);
