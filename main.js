'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const { loadConfig, updateConfig } = require('./lib/config');
const serialSearch = require('./lib/serialSearch');
const exportBuilder = require('./lib/exportBuilder');
const printerService = require('./lib/printerService');
const customTemplates = require('./lib/customTemplates');
const zplBuilder = require('./lib/zplBuilder');

let mainWindow;

const DEFAULT_WINDOW_BOUNDS = { width: 900, height: 700 };

// Debounced save so we're not hitting disk on every pixel of a resize/move.
let boundsSaveTimeout = null;
function scheduleBoundsSave(win) {
  clearTimeout(boundsSaveTimeout);
  boundsSaveTimeout = setTimeout(() => saveWindowBounds(win), 400);
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.getBounds();
    updateConfig({ windowBounds: bounds });
  } catch (err) {
    console.error('Failed to save window bounds:', err);
  }
}

function createWindow() {
  const config = loadConfig();
  const savedBounds = config.windowBounds || {};

  mainWindow = new BrowserWindow({
    width: savedBounds.width || DEFAULT_WINDOW_BOUNDS.width,
    height: savedBounds.height || DEFAULT_WINDOW_BOUNDS.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 720,
    minHeight: 560,
    resizable: true,
    icon: path.join(__dirname, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setIcon(path.join(__dirname, 'favicon.png'));
  mainWindow.loadFile('index.html');

  mainWindow.on('resize', () => scheduleBoundsSave(mainWindow));
  mainWindow.on('move', () => scheduleBoundsSave(mainWindow));
  mainWindow.on('close', () => {
    clearTimeout(boundsSaveTimeout);
    saveWindowBounds(mainWindow);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===========================================================================
// Shared config IPC
// ===========================================================================

ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('update-config', (event, partial) => {
  return updateConfig(partial);
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const chosenDir = result.filePaths[0];
  updateConfig({ workingDirectory: chosenDir });
  return chosenDir;
});

ipcMain.handle('open-file', async (event, filePath) => {
  const errorMessage = await shell.openPath(filePath);
  return errorMessage; // empty string means success
});

// ===========================================================================
// Serial Finder IPC
// ===========================================================================

ipcMain.handle('search-serial', async (event, { directory, serial }) => {
  if (!directory) {
    return { error: 'No working directory has been set yet. Set one in Settings.' };
  }
  if (!serial) {
    return { error: 'Please enter a serial number to search for.' };
  }

  const { filesSearched, resultsBySerial } = serialSearch.searchSerialsInDirectory(directory, [serial]);
  const key = Object.keys(resultsBySerial)[0];

  return {
    filesSearched,
    matches: resultsBySerial[key] || [],
  };
});

ipcMain.handle('search-serials', async (event, { directory, serials }) => {
  if (!directory) {
    return { error: 'No working directory has been set yet. Set one in Settings.' };
  }
  if (!Array.isArray(serials) || serials.filter((s) => String(s).trim()).length === 0) {
    return { error: 'Please enter at least one serial number to search for.' };
  }
  if (serials.length > 50) {
    return { error: 'A maximum of 50 serial numbers can be searched at once.' };
  }

  const { filesSearched, resultsBySerial } = serialSearch.searchSerialsInDirectory(directory, serials);
  return { filesSearched, resultsBySerial };
});

ipcMain.handle('get-job-info', async (event, { filePath, jobNumber }) => {
  return serialSearch.getJobInfo(filePath, jobNumber);
});

ipcMain.handle('export-results', async (event, matches) => {
  return exportBuilder.exportResults(matches);
});

// ===========================================================================
// Label Printer IPC
// ===========================================================================

ipcMain.handle('detect-printer', async () => {
  return printerService.detectPrinterName();
});

ipcMain.handle('list-printers', async () => {
  return printerService.listPrinters();
});

ipcMain.handle('print-zpl', async (event, { zpl, printerName }) => {
  if (!printerName) {
    return { error: 'No printer is set up. Choose one in Settings first.' };
  }
  if (!zpl) {
    return { error: 'Nothing to print.' };
  }
  try {
    const success = printerService.sendZplToPrinter(zpl, printerName);
    if (!success) {
      return { error: `Could not send to "${printerName}". Check it's powered on, online, and the name is exact.` };
    }
    return { success: true };
  } catch (err) {
    return { error: `Printing failed: ${err.message}` };
  }
});

ipcMain.handle('build-and-print-custom-label', async (event, payload) => {
  const { line1, line2, quantity, align, assetCount, printerName } = payload || {};

  if (!printerName) {
    return { error: 'No printer is set up. Choose one in Settings first.' };
  }

  const qty = Number.parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 200) {
    return { error: 'Quantity must be a whole number between 1 and 200.' };
  }

  const trimmedLine1 = String(line1 || '').trim();
  const trimmedLine2 = String(line2 || '').trim();
  const isMultiLine = assetCount || trimmedLine2.length > 0;

  if (isMultiLine) {
    if (trimmedLine1.length < 1 || trimmedLine1.length > 30) {
      return { error: 'Line 1 must be between 1 and 30 characters.' };
    }
    if (!assetCount && (trimmedLine2.length < 1 || trimmedLine2.length > 30)) {
      return { error: 'Line 2 must be between 1 and 30 characters.' };
    }
    if (assetCount && trimmedLine2.length > 30) {
      return { error: 'Line 2 must be at most 30 characters.' };
    }
  } else {
    if (trimmedLine1.length < 1 || trimmedLine1.length > 20) {
      return { error: 'Text must be between 1 and 20 characters.' };
    }
  }

  const safeAlign = ['left', 'center', 'right'].includes(align) ? align : 'left';

  let zpl;
  let description;
  if (!isMultiLine) {
    zpl = zplBuilder.buildSingleLineZpl(trimmedLine1, qty, safeAlign);
    description = `single-line label "${trimmedLine1}" (x${qty})`;
  } else if (assetCount) {
    zpl = zplBuilder.buildMultiLineZplWithAssetCount(trimmedLine1, trimmedLine2, qty, safeAlign);
    description = `multi-line label "${trimmedLine1}" with asset count (x${qty})`;
  } else {
    zpl = zplBuilder.buildMultiLineZpl(trimmedLine1, trimmedLine2, qty, safeAlign);
    description = `multi-line label "${trimmedLine1}" / "${trimmedLine2}" (x${qty})`;
  }

  try {
    const success = printerService.sendZplToPrinter(zpl, printerName);
    if (!success) {
      return { error: `Could not send to "${printerName}". Check it's powered on, online, and the name is exact.` };
    }
    return { success: true, description };
  } catch (err) {
    return { error: `Printing failed: ${err.message}` };
  }
});

const FIXED_TEMPLATES = {
  failed: { title: 'Failed Device Label', build: zplBuilder.buildFailedDeviceLabelZpl },
  missing: { title: 'Missing Components Label', build: zplBuilder.buildMissingComponentsLabelZpl },
  removed: { title: 'Removed Components Label', build: zplBuilder.buildRemovedComponentsLabelZpl },
};

ipcMain.handle('build-and-print-template-label', async (event, payload) => {
  const { templateKey, jobCid, quantity, printerName } = payload || {};

  if (!printerName) {
    return { error: 'No printer is set up. Choose one in Settings first.' };
  }

  const template = FIXED_TEMPLATES[templateKey];
  if (!template) {
    return { error: 'Unknown template.' };
  }

  const qty = Number.parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 200) {
    return { error: 'Quantity must be a whole number between 1 and 200.' };
  }

  const trimmedJobCid = String(jobCid || '').trim();
  if (trimmedJobCid.length > 15) {
    return { error: 'Job ID / CID must be at most 15 characters.' };
  }

  const zpl = template.build(qty, trimmedJobCid);
  const totalLabels = templateKey === 'removed' ? qty * 2 : qty;
  const description = `${template.title} (x${qty}${templateKey === 'removed' ? `, ${totalLabels} labels total` : ''})`;

  try {
    const success = printerService.sendZplToPrinter(zpl, printerName);
    if (!success) {
      return { error: `Could not send to "${printerName}". Check it's powered on, online, and the name is exact.` };
    }
    return { success: true, description };
  } catch (err) {
    return { error: `Printing failed: ${err.message}` };
  }
});

ipcMain.handle('get-custom-templates', async () => {
  return customTemplates.loadCustomTemplates();
});

ipcMain.handle('add-custom-template', async (event, text) => {
  return customTemplates.addCustomTemplate(text);
});

ipcMain.handle('remove-custom-templates', async (event, items) => {
  return customTemplates.removeCustomTemplates(items);
});

ipcMain.handle('move-custom-template', async (event, { index, direction }) => {
  return customTemplates.moveCustomTemplate(index, direction);
});

ipcMain.handle('build-and-print-custom-templates', async (event, payload) => {
  const { selected, quantity, printerName } = payload || {};

  if (!printerName) {
    return { error: 'No printer is set up. Choose one in Settings first.' };
  }
  if (!Array.isArray(selected) || selected.length === 0) {
    return { error: 'Select at least one template.' };
  }

  const qty = Number.parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 200) {
    return { error: 'Quantity must be a whole number between 1 and 200.' };
  }

  const zpl = selected.map((text) => zplBuilder.buildSingleLineZpl(text, qty, 'left')).join('\n');
  const description = `${selected.length} custom template${selected.length === 1 ? '' : 's'} (x${qty} each, ${
    selected.length * qty
  } labels total)`;

  try {
    const success = printerService.sendZplToPrinter(zpl, printerName);
    if (!success) {
      return { error: `Could not send to "${printerName}". Check it's powered on, online, and the name is exact.` };
    }
    return { success: true, description };
  } catch (err) {
    return { error: `Printing failed: ${err.message}` };
  }
});
