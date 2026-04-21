(function initializeOfficerEditorModal(globalScope) {
  function setModalMessage(messageEl, text = '', tone = 'warning') {
    if (!messageEl) {
      return;
    }
    messageEl.textContent = text;
    messageEl.dataset.tone = text ? tone : '';
  }

  function closeModal(modalEl, onClose) {
    if (typeof onClose === 'function') {
      onClose();
    }
    if (modalEl) {
      modalEl.hidden = true;
    }
  }

  globalScope.OfficerEditorModal = {
    setModalMessage,
    closeModal
  };
})(window);
