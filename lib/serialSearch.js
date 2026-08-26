'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Recursively collect all .xls / .xlsx files under a directory (skips Excel lock files like ~$foo.xlsx)
function collectSpreadsheetFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error('Could not read directory:', dir, err);
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(collectSpreadsheetFiles(fullPath));
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      const isSpreadsheet = lower.endsWith('.xls') || lower.endsWith('.xlsx');
      const isLockFile = entry.name.startsWith('~$');
      if (isSpreadsheet && !isLockFile) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// Find the header row index (assumed to be row 0) and map useful column names
// to their column index. Matching is case-insensitive and tolerant of the
// "JonNumber" typo some spreadsheets use instead of "JobNumber".
function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((cell, colIndex) => {
    const key = String(cell || '').trim().toLowerCase();
    if (key === 'id') map.id = colIndex;
    else if (key === 'serial') map.serial = colIndex;
    else if (key === 'type') map.type = colIndex;
    else if (key === 'jonnumber' || key === 'jobnumber' || key === 'job number' || key === 'job_number') {
      map.jobNumber = colIndex;
    } else if (key === 'collection_id' || key === 'collection id' || key === 'collectionid') {
      map.collectionId = colIndex;
    } else if (key === 'collection_date' || key === 'collection date' || key === 'collectiondate') {
      map.collectionDate = colIndex;
    } else if (key === 'user_name' || key === 'user name' || key === 'username') {
      map.userName = colIndex;
    } else if (key === 'qty') {
      map.qty = colIndex;
    }
  });
  return map;
}

// Lenovo-style barcodes are sometimes scanned in full (e.g.
// "1S10B7S01900PC002PRG") while the reference report only lists the tail
// end (e.g. "PC002PRG"). If no exact match is found, fall back to a
// substring check - but only against the Serial column, and only when that
// cell's value is at least this long, so short legitimate serials never
// get accidentally substring-matched against each other.
const PARTIAL_MATCH_MIN_CELL_LENGTH = 15;
const PARTIAL_MATCH_MIN_SEARCH_LENGTH = 3;

// Searches for one or more serials across every spreadsheet in `directory`,
// reading each file only once regardless of how many serials are requested.
// Returns { filesSearched, resultsBySerial: { [originalSerialInput]: match[] } }
function searchSerialsInDirectory(directory, serials) {
  // Map of lowercased/trimmed target -> original input string (for reporting back)
  const targets = new Map();
  for (const s of serials) {
    const clean = String(s).trim();
    if (clean) targets.set(clean.toLowerCase(), clean);
  }

  const resultsBySerial = {};
  for (const original of targets.values()) {
    resultsBySerial[original] = [];
  }

  const files = collectSpreadsheetFiles(directory);

  for (const filePath of files) {
    let workbook;
    try {
      workbook = XLSX.readFile(filePath, { cellDates: false });
    } catch (err) {
      console.error('Could not read workbook:', filePath, err);
      continue;
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (rows.length === 0) continue;

      const headerRow = rows[0];
      const colMap = mapHeaders(headerRow);

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];

        // Build the set of lowercase cell values once per row for efficient matching
        const cellValues = row.map((cell) => String(cell).trim().toLowerCase());
        const serialCellValue = colMap.serial !== undefined ? cellValues[colMap.serial] : null;

        for (const [targetLower, original] of targets.entries()) {
          let matched = cellValues.includes(targetLower);
          let isPartial = false;

          if (
            !matched &&
            targetLower.length >= PARTIAL_MATCH_MIN_SEARCH_LENGTH &&
            serialCellValue &&
            serialCellValue.length >= PARTIAL_MATCH_MIN_CELL_LENGTH &&
            serialCellValue.includes(targetLower)
          ) {
            matched = true;
            isPartial = true;
          }

          if (matched) {
            resultsBySerial[original].push({
              fileName: path.basename(filePath),
              filePath,
              sheetName,
              rowNumber: r + 1, // 1-indexed, matches what you'd see in Excel
              type: colMap.type !== undefined ? String(row[colMap.type]) : null,
              jobNumber: colMap.jobNumber !== undefined ? String(row[colMap.jobNumber]) : null,
              serial: colMap.serial !== undefined ? String(row[colMap.serial]) : original,
              partial: isPartial,
              // Extra raw fields kept for export - not shown in the UI, so keep
              // original types (numbers stay numbers, e.g. for dates/IDs).
              id: colMap.id !== undefined ? row[colMap.id] : '',
              collectionId: colMap.collectionId !== undefined ? row[colMap.collectionId] : '',
              collectionDate: colMap.collectionDate !== undefined ? row[colMap.collectionDate] : '',
              userName: colMap.userName !== undefined ? row[colMap.userName] : '',
              qty: colMap.qty !== undefined ? row[colMap.qty] : '',
            });
          }
        }
      }
    }
  }

  return { filesSearched: files.length, resultsBySerial };
}

// For a given spreadsheet + job number, tallies how many rows of each Type
// exist for that job, sorted highest to lowest.
function getJobInfo(filePath, jobNumber) {
  if (!filePath || !jobNumber) {
    return { error: 'Missing file or job number.' };
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: false });
  } catch (err) {
    return { error: `Could not read the spreadsheet: ${err.message}` };
  }

  const targetJob = String(jobNumber).trim().toLowerCase();
  const typeCounts = new Map();
  let totalItems = 0;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length === 0) continue;

    const colMap = mapHeaders(rows[0]);
    if (colMap.jobNumber === undefined) continue; // this sheet has no job number column to match against

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rowJob = String(row[colMap.jobNumber] ?? '').trim().toLowerCase();
      if (rowJob !== targetJob) continue;

      const typeValue = colMap.type !== undefined ? String(row[colMap.type] ?? '').trim() : '';
      const label = typeValue || '(blank)';
      typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
      totalItems++;
    }
  }

  if (totalItems === 0) {
    return { error: `No rows found for job "${jobNumber}" in this spreadsheet.` };
  }

  const counts = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { counts, totalItems, fileName: path.basename(filePath) };
}

module.exports = {
  collectSpreadsheetFiles,
  mapHeaders,
  searchSerialsInDirectory,
  getJobInfo,
};
