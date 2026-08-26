'use strict';

const fs = require('fs');
const path = require('path');

// config.json lives next to the app files (same folder as main.js), so it's
// easy to find/inspect/back up - matches the pattern from the standalone
// Serial Finder app this was merged from.
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read config.json:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write config.json:', err);
    return false;
  }
}

function updateConfig(partial) {
  const config = loadConfig();
  Object.assign(config, partial || {});
  saveConfig(config);
  return config;
}

module.exports = { CONFIG_PATH, loadConfig, saveConfig, updateConfig };
