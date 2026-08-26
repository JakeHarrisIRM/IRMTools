'use strict';

const fs = require('fs');
const path = require('path');

// Custom Template Label presets live in this JSON file, next to main.js -
// a simple array of strings, e.g. ["Wiped", "Grades B, C, D"].
const CUSTOM_TEMPLATES_PATH = path.join(__dirname, '..', 'custom_templates.json');

// Never throws - a missing, empty, or malformed file just yields an empty
// list, which the UI shows as a friendly "no templates yet" message rather
// than crashing.
function loadCustomTemplates() {
  try {
    if (!fs.existsSync(CUSTOM_TEMPLATES_PATH)) return [];
    const raw = fs.readFileSync(CUSTOM_TEMPLATES_PATH, 'utf8');
    if (!raw || !raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
  } catch (err) {
    console.log(`Note: couldn't read ${CUSTOM_TEMPLATES_PATH} (${err.message}). Starting with an empty template list.`);
    return [];
  }
}

function saveCustomTemplates(list) {
  try {
    fs.writeFileSync(CUSTOM_TEMPLATES_PATH, JSON.stringify(list, null, 2) + '\n', 'utf8');
    return true;
  } catch (err) {
    console.log(`Warning: couldn't save ${CUSTOM_TEMPLATES_PATH} (${err.message}).`);
    return false;
  }
}

function addCustomTemplate(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    return { error: 'New template text must be between 1 and 20 characters.' };
  }
  const templates = loadCustomTemplates();
  if (templates.includes(trimmed)) {
    return { error: 'That template already exists.' };
  }
  const updated = [...templates, trimmed];
  if (!saveCustomTemplates(updated)) {
    return { error: 'Could not save the template file.' };
  }
  return { success: true, templates: updated };
}

function removeCustomTemplates(itemsToRemove) {
  const toRemove = Array.isArray(itemsToRemove) ? itemsToRemove : [];
  if (toRemove.length === 0) {
    return { error: 'No templates were selected to remove.' };
  }
  const templates = loadCustomTemplates();
  const updated = templates.filter((t) => !toRemove.includes(t));
  if (!saveCustomTemplates(updated)) {
    return { error: 'Could not save the template file.' };
  }
  return { success: true, templates: updated };
}

// Moves one template up or down by one position (for the reorder arrows in
// the Manage Templates UI). No-op (but still succeeds) if already at that end.
function moveCustomTemplate(index, direction) {
  const templates = loadCustomTemplates();
  if (index < 0 || index >= templates.length) {
    return { error: 'That template no longer exists - the list may have changed.' };
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= templates.length) {
    return { success: true, templates }; // already at the edge, nothing to do
  }

  const updated = [...templates];
  [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];

  if (!saveCustomTemplates(updated)) {
    return { error: 'Could not save the template file.' };
  }
  return { success: true, templates: updated };
}

module.exports = {
  CUSTOM_TEMPLATES_PATH,
  loadCustomTemplates,
  saveCustomTemplates,
  addCustomTemplate,
  removeCustomTemplates,
  moveCustomTemplate,
};
