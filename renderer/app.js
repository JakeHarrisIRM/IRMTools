// ---------------------------------------------------------------------------
// Tiny pub/sub so the independently-loaded page modules (serialFinder.js,
// labelPrinter.js) can react to shared-state changes (printer, directory)
// made from the Settings modal, without a bundler or strict load-order
// coupling beyond "app.js loads first".
// ---------------------------------------------------------------------------
window.IRM = (function () {
  const listeners = {};
  return {
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
    },
    emit(event, data) {
      (listeners[event] || []).forEach((cb) => cb(data));
    },
  };
})();

// ---------------------------------------------------------------------------
// Alert banner (shared across pages) - green for success, red for error.
// Auto-hides after ~10s; re-showing resets the timer.
// ---------------------------------------------------------------------------
const alertBanner = document.getElementById('alertBanner');
const alertBannerText = document.getElementById('alertBannerText');
const alertBannerClose = document.getElementById('alertBannerClose');
let alertHideTimeout = null;

function showAlert(message, type = 'success', durationMs = 10000) {
  clearTimeout(alertHideTimeout);
  alertBannerText.textContent = message;
  alertBanner.classList.toggle('error', type === 'error');
  alertBanner.classList.add('show');
  alertHideTimeout = setTimeout(hideAlert, durationMs);
}

function hideAlert() {
  clearTimeout(alertHideTimeout);
  alertBanner.classList.remove('show');
}

alertBannerClose.addEventListener('click', hideAlert);
window.showAlert = showAlert;

// ---------------------------------------------------------------------------
// Navbar / page switching
// ---------------------------------------------------------------------------
const navCards = document.querySelectorAll('.nav-card');
const pages = document.querySelectorAll('.page');

function switchPage(pageName, opts = {}) {
  navCards.forEach((card) => card.classList.toggle('active', card.dataset.page === pageName));
  pages.forEach((page) => page.classList.toggle('active', page.id === `page-${pageName}`));

  if (!opts.skipSave) {
    window.api.updateConfig({ lastPage: pageName });
  }
  window.IRM.emit('pageChanged', pageName);
}

navCards.forEach((card) => {
  card.addEventListener('click', () => switchPage(card.dataset.page));
});

window.switchPage = switchPage;

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

function openSettings() {
  settingsOverlay.classList.add('open');
  refreshPrinterDropdown();
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeSettings();
  window.IRM.emit('escapePressed');
});

window.openSettings = openSettings;
window.closeSettings = closeSettings;

function applyDarkMode(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  darkModeToggle.checked = isDark;
}

darkModeToggle.addEventListener('change', async () => {
  const isDark = darkModeToggle.checked;
  applyDarkMode(isDark);
  await window.api.updateConfig({ darkMode: isDark });
});

// ---------------------------------------------------------------------------
// Working directory (Settings) - shared with Serial Finder
// ---------------------------------------------------------------------------
const directoryInput = document.getElementById('directoryInput');
const browseBtn = document.getElementById('browseBtn');

browseBtn.addEventListener('click', async () => {
  const chosen = await window.api.selectDirectory();
  if (chosen) {
    directoryInput.value = chosen;
    window.IRM.emit('directoryChanged', chosen);
  }
});

// ---------------------------------------------------------------------------
// Printer settings (Settings) - shared with Label Printer
// ---------------------------------------------------------------------------
const printerNameDisplay = document.getElementById('printerNameDisplay');
const redetectPrinterBtn = document.getElementById('redetectPrinterBtn');
const printerSelect = document.getElementById('printerSelect');
const usePrinterSelectBtn = document.getElementById('usePrinterSelectBtn');
const printerManualInput = document.getElementById('printerManualInput');
const usePrinterManualBtn = document.getElementById('usePrinterManualBtn');
const printerSettingsStatus = document.getElementById('printerSettingsStatus');

async function setPrinter(name, statusMessage) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  await window.api.updateConfig({ printerName: trimmed });
  printerNameDisplay.value = trimmed;
  printerSettingsStatus.textContent = statusMessage || `Printer set to "${trimmed}".`;
  window.IRM.emit('printerChanged', trimmed);
}

redetectPrinterBtn.addEventListener('click', async () => {
  printerSettingsStatus.textContent = 'Detecting...';
  const detected = await window.api.detectPrinter();
  if (detected) {
    await setPrinter(detected, `Auto-detected "${detected}".`);
  } else {
    printerSettingsStatus.textContent = 'No Zebra ZD421 printer was auto-detected. Choose one below instead.';
  }
});

usePrinterSelectBtn.addEventListener('click', async () => {
  if (!printerSelect.value) {
    printerSettingsStatus.textContent = 'Choose a printer from the list first.';
    return;
  }
  await setPrinter(printerSelect.value);
});

usePrinterManualBtn.addEventListener('click', async () => {
  if (!printerManualInput.value.trim()) {
    printerSettingsStatus.textContent = 'Type a printer name first.';
    return;
  }
  await setPrinter(printerManualInput.value);
  printerManualInput.value = '';
});

async function refreshPrinterDropdown() {
  printerSelect.innerHTML = '<option value="">Loading printers&hellip;</option>';
  const printers = await window.api.listPrinters();
  if (printers.length === 0) {
    printerSelect.innerHTML = '<option value="">No printers found on this PC</option>';
    return;
  }
  printerSelect.innerHTML =
    '<option value="">Select a printer&hellip;</option>' +
    printers.map((p) => `<option value="${escapeHtmlAttr(p)}">${escapeHtmlAttr(p)}</option>`).join('');
}

function escapeHtmlAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// "Change" shortcut button on the Label Printer page itself opens Settings
// directly, scrolled to the printer section (the section is short enough
// that just opening Settings is sufficient).
document.getElementById('labelSettingsShortcut')?.addEventListener('click', openSettings);
document.getElementById('goToSettingsBtn')?.addEventListener('click', openSettings);

// ---------------------------------------------------------------------------
// App startup
// ---------------------------------------------------------------------------
async function initApp() {
  const config = await window.api.getConfig();

  applyDarkMode(!!(config && config.darkMode));

  if (config && config.workingDirectory) {
    directoryInput.value = config.workingDirectory;
  }

  let printerName = config && config.printerName ? config.printerName : null;

  if (!printerName) {
    // Matches the standalone app's startup behavior: try to auto-detect a
    // Zebra ZD421 the first time there's no saved printer.
    printerName = await window.api.detectPrinter();
    if (printerName) {
      await window.api.updateConfig({ printerName });
    }
  }

  if (printerName) {
    printerNameDisplay.value = printerName;
  } else {
    printerNameDisplay.value = '';
  }

  window.IRM.emit('printerChanged', printerName || null);

  const lastPage = config && ['serialFinder', 'labelPrinter'].includes(config.lastPage) ? config.lastPage : 'serialFinder';
  switchPage(lastPage, { skipSave: true });

  window.IRM.emit('appReady', config);
}

initApp();
