'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const EXPORT_HEADERS = [
  'ID',
  'Serial',
  'Type',
  'JonNumber',
  'Collection_ID',
  'Collection_Date',
  'User_Name',
  'QTY',
  'Found in Filename',
];
const COLLECTION_DATE_COL_INDEX = 6; // 1-based column F, matches EXPORT_HEADERS[5]

function buildTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}-${pad(now.getSeconds())}`;
}

async function exportResults(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { error: 'There are no results to export yet — run a search first.' };
  }

  try {
    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
  } catch (err) {
    return { error: `Could not create the exports folder: ${err.message}` };
  }

  const rows = matches.map((m) => [
    m.id ?? '',
    m.serial ?? '',
    m.type ?? '',
    m.jobNumber ?? '',
    m.collectionId ?? '',
    m.collectionDate ?? '',
    m.userName ?? '',
    m.qty ?? '',
    m.notFound ? 'Not Found' : m.fileName ?? '',
  ]);

  // Column K stats table: found-serial count per job (keyed by the source
  // filename without its extension, e.g. "NED075(65123)" from
  // "NED075(65123).xls" - this is more precise than the JonNumber column
  // alone, since two different files can share the same short job prefix),
  // highest to lowest, plus a row for how many searched serials weren't
  // found at all.
  const jobCounts = new Map();
  let failedCount = 0;
  matches.forEach((m) => {
    if (m.notFound) {
      failedCount++;
    } else if (m.fileName) {
      const key = m.fileName.replace(/\.(xlsx|xls)$/i, '');
      jobCounts.set(key, (jobCounts.get(key) || 0) + 1);
    }
  });
  const statsRows = Array.from(jobCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([job, count]) => [job, count]);
  statsRows.push(['Failed to Find', failedCount]);

  let filePath;
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Search Results');

    worksheet.columns = [
      { width: 10 }, // A - ID
      { width: 18 }, // B - Serial
      { width: 12 }, // C - Type
      { width: 12 }, // D - JonNumber
      { width: 14 }, // E - Collection_ID
      { width: 20 }, // F - Collection_Date
      { width: 18 }, // G - User_Name
      { width: 8 }, // H - QTY
      { width: 26 }, // I - Found in Filename
      { width: 3 }, // J - spacer
      { width: 18 }, // K - Job Number (stats)
      { width: 14 }, // L - Assets Found (stats)
    ];

    // A real Excel Table (not just formatted cells) so it carries a proper
    // built-in style, filter arrows, and structured formatting when opened.
    // "TableStyleMedium1" is the same style Excel itself labels
    // "White, Table Style Medium 1" - black header, banded white/grey rows.
    // filterButton: true is required on every column or Excel hides the
    // dropdown arrows even though the table style still renders correctly.
    worksheet.addTable({
      name: 'SearchResultsTable',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium1',
        showRowStripes: true,
      },
      columns: EXPORT_HEADERS.map((name) => ({ name, filterButton: true })),
      rows,
    });

    // Match the source spreadsheet's look: give Collection_Date a real date
    // format instead of showing the raw Excel serial number.
    rows.forEach((_, idx) => {
      const cell = worksheet.getCell(idx + 2, COLLECTION_DATE_COL_INDEX);
      if (typeof cell.value === 'number') {
        cell.numFmt = 'm/d/yyyy h:mm';
      }
    });

    // Second table, in column K, with the per-job breakdown.
    worksheet.addTable({
      name: 'JobStatsTable',
      ref: 'K1',
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium1',
        showRowStripes: true,
      },
      columns: [
        { name: 'Job Number', filterButton: true },
        { name: 'Assets Found', filterButton: true },
      ],
      rows: statsRows,
    });

    const fileName = `serial-search-results_${buildTimestamp()}.xlsx`;
    filePath = path.join(EXPORTS_DIR, fileName);
    await workbook.xlsx.writeFile(filePath);
  } catch (err) {
    return { error: `Failed to create the export file: ${err.message}` };
  }

  return { success: true, filePath, fileName: path.basename(filePath), rowCount: rows.length };
}

module.exports = { exportResults };
