'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Shared
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (partial) => ipcRenderer.invoke('update-config', partial),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // Serial Finder
  searchSerial: (directory, serial) => ipcRenderer.invoke('search-serial', { directory, serial }),
  searchSerials: (directory, serials) => ipcRenderer.invoke('search-serials', { directory, serials }),
  getJobInfo: (filePath, jobNumber) => ipcRenderer.invoke('get-job-info', { filePath, jobNumber }),
  exportResults: (matches) => ipcRenderer.invoke('export-results', matches),

  // Label Printer - printer management
  detectPrinter: () => ipcRenderer.invoke('detect-printer'),
  listPrinters: () => ipcRenderer.invoke('list-printers'),

  // Label Printer - printing
  printCustomLabel: (payload) => ipcRenderer.invoke('build-and-print-custom-label', payload),
  printTemplateLabel: (payload) => ipcRenderer.invoke('build-and-print-template-label', payload),
  printCustomTemplates: (payload) => ipcRenderer.invoke('build-and-print-custom-templates', payload),

  // Label Printer - custom template management
  getCustomTemplates: () => ipcRenderer.invoke('get-custom-templates'),
  addCustomTemplate: (text) => ipcRenderer.invoke('add-custom-template', text),
  removeCustomTemplates: (items) => ipcRenderer.invoke('remove-custom-templates', items),
  moveCustomTemplate: (index, direction) => ipcRenderer.invoke('move-custom-template', { index, direction }),
});
