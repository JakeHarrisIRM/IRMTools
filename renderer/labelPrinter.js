(function () {
  const noPrinterState = document.getElementById('noPrinterState');
  const labelPrinterMain = document.getElementById('labelPrinterMain');
  const activePrinterName = document.getElementById('activePrinterName');

  const customLabelModeBtn = document.getElementById('customLabelModeBtn');
  const templatesModeBtn = document.getElementById('templatesModeBtn');
  const customTemplatesModeBtn = document.getElementById('customTemplatesModeBtn');
  const customLabelSection = document.getElementById('customLabelSection');
  const templatesSection = document.getElementById('templatesSection');
  const customTemplatesSection = document.getElementById('customTemplatesSection');

  // Custom Label elements
  const labelLine1 = document.getElementById('labelLine1');
  const labelLine2 = document.getElementById('labelLine2');
  const line1Hint = document.getElementById('line1Hint');
  const assetCountCheckbox = document.getElementById('assetCountCheckbox');
  const labelQty = document.getElementById('labelQty');
  const printCustomLabelBtn = document.getElementById('printCustomLabelBtn');

  // Templates elements
  const templateCardList = document.getElementById('templateCardList');
  const templateJobCid = document.getElementById('templateJobCid');
  const templateQty = document.getElementById('templateQty');
  const printTemplateLabelBtn = document.getElementById('printTemplateLabelBtn');

  // Custom Templates elements
  const presetList = document.getElementById('presetList');
  const manageTemplatesBtn = document.getElementById('manageTemplatesBtn');
  const customTemplateQty = document.getElementById('customTemplateQty');
  const printCustomTemplatesBtn = document.getElementById('printCustomTemplatesBtn');

  // Manage Templates modal
  const manageTemplatesOverlay = document.getElementById('manageTemplatesOverlay');
  const manageTemplatesList = document.getElementById('manageTemplatesList');
  const manageTemplatesCloseBtn = document.getElementById('manageTemplatesCloseBtn');
  const newTemplateInput = document.getElementById('newTemplateInput');
  const addTemplateBtn = document.getElementById('addTemplateBtn');
  const manageTemplatesStatus = document.getElementById('manageTemplatesStatus');

  let currentPrinterName = null;
  let selectedTemplateKey = 'failed';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- shared-state hookup ----------

  window.IRM.on('printerChanged', (name) => {
    currentPrinterName = name || null;
    updatePrinterVisibility();
  });

  window.IRM.on('pageChanged', (pageName) => {
    if (pageName === 'labelPrinter' && labelSubModeIsCustomTemplates()) {
      loadPresets();
    }
  });

  function labelSubModeIsCustomTemplates() {
    return customTemplatesSection.style.display !== 'none';
  }

  function updatePrinterVisibility() {
    if (currentPrinterName) {
      noPrinterState.style.display = 'none';
      labelPrinterMain.style.display = '';
      activePrinterName.textContent = currentPrinterName;
    } else {
      noPrinterState.style.display = '';
      labelPrinterMain.style.display = 'none';
    }
  }

  // ---------- sub-mode toggle ----------

  function setSubMode(subMode) {
    customLabelModeBtn.classList.toggle('active', subMode === 'custom');
    templatesModeBtn.classList.toggle('active', subMode === 'templates');
    customTemplatesModeBtn.classList.toggle('active', subMode === 'customTemplates');

    customLabelSection.style.display = subMode === 'custom' ? '' : 'none';
    templatesSection.style.display = subMode === 'templates' ? '' : 'none';
    customTemplatesSection.style.display = subMode === 'customTemplates' ? '' : 'none';

    if (subMode === 'customTemplates') loadPresets();
  }

  customLabelModeBtn.addEventListener('click', () => setSubMode('custom'));
  templatesModeBtn.addEventListener('click', () => setSubMode('templates'));
  customTemplatesModeBtn.addEventListener('click', () => setSubMode('customTemplates'));

  // ---------- Custom Label ----------

  function isMultiLineNow() {
    return assetCountCheckbox.checked || labelLine2.value.trim().length > 0;
  }

  function updateLine1Hint() {
    line1Hint.textContent = isMultiLineNow()
      ? 'Multi-line label: Line 1 must be 1–30 characters.'
      : 'Single-line label: 1–20 characters.';
  }

  labelLine2.addEventListener('input', updateLine1Hint);
  assetCountCheckbox.addEventListener('change', updateLine1Hint);
  updateLine1Hint();

  function getCheckedAlign() {
    const checked = document.querySelector('input[name="labelAlign"]:checked');
    return checked ? checked.value : 'left';
  }

  async function printCustomLabel() {
    if (!currentPrinterName) return;

    printCustomLabelBtn.disabled = true;
    try {
      const result = await window.api.printCustomLabel({
        line1: labelLine1.value,
        line2: labelLine2.value,
        quantity: labelQty.value,
        align: getCheckedAlign(),
        assetCount: assetCountCheckbox.checked,
        printerName: currentPrinterName,
      });

      if (result.error) {
        window.showAlert(result.error, 'error', 10000);
        return;
      }

      window.showAlert(`Sent to printer: ${result.description}`, 'success', 10000);
      labelLine1.value = '';
      labelLine2.value = '';
      assetCountCheckbox.checked = false;
      labelQty.value = '1';
      updateLine1Hint();
    } catch (err) {
      window.showAlert(`Printing failed: ${err.message || String(err)}`, 'error', 10000);
    } finally {
      printCustomLabelBtn.disabled = false;
    }
  }

  printCustomLabelBtn.addEventListener('click', printCustomLabel);

  // ---------- Templates ----------

  templateCardList.addEventListener('click', (e) => {
    const card = e.target.closest('.template-card');
    if (!card) return;
    selectedTemplateKey = card.dataset.template;
    templateCardList.querySelectorAll('.template-card').forEach((c) => c.classList.toggle('active', c === card));
  });

  async function printTemplateLabel() {
    if (!currentPrinterName) return;

    printTemplateLabelBtn.disabled = true;
    try {
      const result = await window.api.printTemplateLabel({
        templateKey: selectedTemplateKey,
        jobCid: templateJobCid.value,
        quantity: templateQty.value,
        printerName: currentPrinterName,
      });

      if (result.error) {
        window.showAlert(result.error, 'error', 10000);
        return;
      }

      window.showAlert(`Sent to printer: ${result.description}`, 'success', 10000);
      templateJobCid.value = '';
      templateQty.value = '1';
    } catch (err) {
      window.showAlert(`Printing failed: ${err.message || String(err)}`, 'error', 10000);
    } finally {
      printTemplateLabelBtn.disabled = false;
    }
  }

  printTemplateLabelBtn.addEventListener('click', printTemplateLabel);

  // ---------- Custom Templates ----------

  async function loadPresets() {
    const templates = await window.api.getCustomTemplates();

    if (templates.length === 0) {
      presetList.innerHTML = `<div class="hint">No custom templates found yet. Use "Manage Templates" above to add one.</div>`;
      return;
    }

    presetList.innerHTML = templates
      .map(
        (tpl, i) => `
        <div class="preset-row">
          <input type="checkbox" id="preset-${i}" value="${escapeHtml(tpl)}" />
          <label for="preset-${i}">${escapeHtml(tpl)}</label>
        </div>`
      )
      .join('');
  }

  function getCheckedPresets() {
    return Array.from(presetList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }

  async function printCustomTemplates() {
    if (!currentPrinterName) return;

    const selected = getCheckedPresets();

    printCustomTemplatesBtn.disabled = true;
    try {
      const result = await window.api.printCustomTemplates({
        selected,
        quantity: customTemplateQty.value,
        printerName: currentPrinterName,
      });

      if (result.error) {
        window.showAlert(result.error, 'error', 10000);
        return;
      }

      window.showAlert(`Sent to printer: ${result.description}`, 'success', 10000);
      presetList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      customTemplateQty.value = '1';
    } catch (err) {
      window.showAlert(`Printing failed: ${err.message || String(err)}`, 'error', 10000);
    } finally {
      printCustomTemplatesBtn.disabled = false;
    }
  }

  printCustomTemplatesBtn.addEventListener('click', printCustomTemplates);

  // ---------- Manage Templates modal ----------

  function openManageTemplates() {
    manageTemplatesStatus.textContent = '';
    newTemplateInput.value = '';
    manageTemplatesOverlay.classList.add('open');
    renderManageList();
  }

  function closeManageTemplates() {
    manageTemplatesOverlay.classList.remove('open');
    loadPresets(); // reflect any changes made while the modal was open
  }

  async function renderManageList() {
    const templates = await window.api.getCustomTemplates();

    if (templates.length === 0) {
      manageTemplatesList.innerHTML = `<div class="hint">No templates yet - add one below.</div>`;
      return;
    }

    manageTemplatesList.innerHTML = templates
      .map(
        (tpl, i) => `
        <div class="manage-row">
          <span>${escapeHtml(tpl)}</span>
          <div class="manage-controls">
            <button class="moveUpBtn" data-index="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">&#8593;</button>
            <button class="moveDownBtn" data-index="${i}" ${i === templates.length - 1 ? 'disabled' : ''} title="Move down">&#8595;</button>
            <button class="removeTemplateBtn" data-value="${escapeHtml(tpl)}" title="Remove">Remove</button>
          </div>
        </div>`
      )
      .join('');

    manageTemplatesList.querySelectorAll('.moveUpBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = Number.parseInt(btn.dataset.index, 10);
        const result = await window.api.moveCustomTemplate(index, 'up');
        if (result.error) manageTemplatesStatus.textContent = result.error;
        renderManageList();
      });
    });
    manageTemplatesList.querySelectorAll('.moveDownBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = Number.parseInt(btn.dataset.index, 10);
        const result = await window.api.moveCustomTemplate(index, 'down');
        if (result.error) manageTemplatesStatus.textContent = result.error;
        renderManageList();
      });
    });
    manageTemplatesList.querySelectorAll('.removeTemplateBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const result = await window.api.removeCustomTemplates([btn.dataset.value]);
        if (result.error) {
          manageTemplatesStatus.textContent = result.error;
        } else {
          manageTemplatesStatus.textContent = `Removed "${btn.dataset.value}".`;
        }
        renderManageList();
      });
    });
  }

  addTemplateBtn.addEventListener('click', async () => {
    const result = await window.api.addCustomTemplate(newTemplateInput.value);
    if (result.error) {
      manageTemplatesStatus.textContent = result.error;
      return;
    }
    manageTemplatesStatus.textContent = `Added "${newTemplateInput.value.trim()}".`;
    newTemplateInput.value = '';
    renderManageList();
  });

  newTemplateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTemplateBtn.click();
  });

  manageTemplatesBtn.addEventListener('click', openManageTemplates);
  manageTemplatesCloseBtn.addEventListener('click', closeManageTemplates);
  manageTemplatesOverlay.addEventListener('click', (e) => {
    if (e.target === manageTemplatesOverlay) closeManageTemplates();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && manageTemplatesOverlay.classList.contains('open')) closeManageTemplates();
  });

  // ---------- init ----------

  updatePrinterVisibility();
})();
