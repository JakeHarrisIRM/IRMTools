(function () {
  const singleModeBtn = document.getElementById('singleModeBtn');
  const multiModeBtn = document.getElementById('multiModeBtn');
  const singleSearchSection = document.getElementById('singleSearchSection');
  const multiSearchSection = document.getElementById('multiSearchSection');

  const serialInput = document.getElementById('serialInput');
  const searchBtn = document.getElementById('searchBtn');

  const rawDataInput = document.getElementById('rawDataInput');
  const rawSearchBtn = document.getElementById('rawSearchBtn');

  const jobInfoOverlay = document.getElementById('jobInfoOverlay');
  const jobInfoTitle = document.getElementById('jobInfoTitle');
  const jobInfoBody = document.getElementById('jobInfoBody');
  const jobInfoCloseBtn = document.getElementById('jobInfoCloseBtn');

  const resultsEl = document.getElementById('results');

  const MAX_RAW_SERIALS = 50;
  let currentDirectory = '';
  let mode = 'single'; // 'single' | 'multi'
  let lastExportableMatches = [];
  let resultsViewMode = 'list'; // 'list' | 'grid' | 'basic'
  let lastMultiSerials = null;
  let lastMultiResult = null;

  // ---------- shared-state hookup ----------

  window.IRM.on('appReady', (config) => {
    currentDirectory = (config && config.workingDirectory) || '';
    if (config && ['list', 'grid', 'basic'].includes(config.resultsViewMode)) {
      resultsViewMode = config.resultsViewMode;
    }
  });

  window.IRM.on('directoryChanged', (dir) => {
    currentDirectory = dir;
  });

  window.IRM.on('pageChanged', (pageName) => {
    if (pageName === 'serialFinder') serialInput.focus();
  });

  // ---------- mode toggle ----------

  function setMode(newMode) {
    mode = newMode;
    const isSingle = mode === 'single';

    singleModeBtn.classList.toggle('active', isSingle);
    multiModeBtn.classList.toggle('active', !isSingle);
    singleSearchSection.style.display = isSingle ? '' : 'none';
    multiSearchSection.style.display = isSingle ? 'none' : '';

    setEmptyState(
      isSingle ? 'Enter a serial number and click Search.' : `Paste up to ${MAX_RAW_SERIALS} serial numbers and click Search.`
    );

    if (isSingle) {
      serialInput.focus();
    } else {
      rawDataInput.focus();
    }
  }

  singleModeBtn.addEventListener('click', () => setMode('single'));
  multiModeBtn.addEventListener('click', () => setMode('multi'));

  // ---------- job info modal ----------

  function closeJobInfoModal() {
    jobInfoOverlay.classList.remove('open');
  }

  jobInfoCloseBtn.addEventListener('click', closeJobInfoModal);
  jobInfoOverlay.addEventListener('click', (e) => {
    if (e.target === jobInfoOverlay) closeJobInfoModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeJobInfoModal();
  });

  async function openJobInfoModal(filePath, jobNumber) {
    jobInfoTitle.textContent = `Job ${jobNumber}`;
    jobInfoBody.innerHTML = `
      <div class="spinner-wrap"><div class="spinner"></div><span>Loading job info&hellip;</span></div>
    `;
    jobInfoOverlay.classList.add('open');

    try {
      const result = await window.api.getJobInfo(filePath, jobNumber);

      if (result.error) {
        jobInfoBody.innerHTML = `<div class="not-found">${escapeHtml(result.error)}</div>`;
        return;
      }

      const rows = result.counts
        .map(
          (c) => `
          <div class="job-info-row">
            <span>${escapeHtml(c.type)}</span>
            <span class="job-info-count">${c.count}</span>
          </div>`
        )
        .join('');

      jobInfoBody.innerHTML = `
        <div class="job-info-summary">${result.totalItems} item(s) total for this job.</div>
        <div class="job-info-list">${rows}</div>
        <div class="status" style="margin-top:8px;">From ${escapeHtml(result.fileName)}</div>
      `;
    } catch (err) {
      jobInfoBody.innerHTML = `<div class="not-found">Unexpected error: ${escapeHtml(err.message || String(err))}</div>`;
    }
  }

  function wireJobInfoButtons(container) {
    container.querySelectorAll('.jobInfoBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filePath = decodeURIComponent(btn.getAttribute('data-file'));
        const jobNumber = decodeURIComponent(btn.getAttribute('data-job'));
        openJobInfoModal(filePath, jobNumber);
      });
    });
  }

  // ---------- shared rendering helpers ----------

  function setEmptyState(message) {
    resultsEl.className = 'empty';
    resultsEl.innerHTML = message;
  }

  function setLoadingState(message) {
    resultsEl.className = 'empty';
    resultsEl.innerHTML = `
      <div class="spinner-wrap">
        <div class="spinner"></div>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function matchDetailsHtml(match) {
    const jobInfoBtnHtml = match.jobNumber
      ? `<button class="jobInfoBtn info-btn" title="Job info" data-file="${encodeURIComponent(
          match.filePath
        )}" data-job="${encodeURIComponent(match.jobNumber)}">&#9432;</button>`
      : '';

    const rows = [
      ['Type', match.type || 'N/A'],
      ['Job number', `<span class="job-number-value">${escapeHtml(match.jobNumber || 'N/A')}${jobInfoBtnHtml}</span>`, true],
      ['File', match.fileName],
      ['Sheet / Row', `${match.sheetName} (row ${match.rowNumber})`],
    ];

    let html = match.partial
      ? `<div class="partial-note">&#9432; Partial match — your search was found as part of a longer scanned barcode.</div>`
      : '';

    html += rows
      .map(
        ([label, value, isHtml]) => `
        <div class="result-row">
          <div class="label">${escapeHtml(label)}:</div>
          <div>${isHtml ? value : escapeHtml(String(value))}</div>
        </div>`
      )
      .join('');

    html += `<div class="result-row"><div class="label"></div><div><button class="openFileBtn" data-file="${encodeURIComponent(
      match.filePath
    )}">Open file</button></div></div>`;

    return html;
  }

  function wireOpenFileButtons(container) {
    container.querySelectorAll('.openFileBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const filePath = decodeURIComponent(btn.getAttribute('data-file'));
        const err = await window.api.openFile(filePath);
        if (err) {
          alert(`Could not open file: ${err}`);
        }
      });
    });
  }

  // ---------- single search ----------

  async function runSingleSearch() {
    const serial = serialInput.value.trim().toUpperCase();
    serialInput.value = serial;

    if (!currentDirectory) {
      setEmptyState('<span class="not-found">Please choose a working directory first (Settings).</span>');
      return;
    }
    if (!serial) {
      setEmptyState('<span class="not-found">Please enter a serial number.</span>');
      return;
    }

    searchBtn.disabled = true;
    setLoadingState('Searching\u2026');

    try {
      const result = await window.api.searchSerial(currentDirectory, serial);

      if (result.error) {
        setEmptyState(`<span class="not-found">${escapeHtml(result.error)}</span>`);
        return;
      }

      if (!result.matches || result.matches.length === 0) {
        resultsEl.className = '';
        resultsEl.innerHTML = `
          <h3 class="single-heading"><span class="not-found">&#10007;</span> ${escapeHtml(serial)}</h3>
          <div class="not-found">No match found.</div>
          <div class="status">Searched ${result.filesSearched} spreadsheet file(s) in the working directory (including subfolders).</div>
        `;
        return;
      }

      const matches = result.matches;
      resultsEl.className = '';
      resultsEl.innerHTML = `
        <h3 class="single-heading"><span class="found-label">&#10003;</span> ${escapeHtml(matches[0].serial)}${
        matches[0].partial ? '<span class="partial-badge">Partial match</span>' : ''
      }</h3>
        ${
          matches.length > 1
            ? `<div class="status" style="margin-bottom:8px;">Found in ${matches.length} spreadsheets — this usually means the same serial was scanned into more than one file by mistake.</div>`
            : ''
        }
        ${matches
          .map(
            (match, idx) => `
            <div class="match-item">
              ${matches.length > 1 ? `<div class="status">Match ${idx + 1} of ${matches.length}:</div>` : ''}
              ${matchDetailsHtml(match)}
            </div>`
          )
          .join('')}
      `;
      wireOpenFileButtons(resultsEl);
      wireJobInfoButtons(resultsEl);
    } catch (err) {
      setEmptyState(`<span class="not-found">Unexpected error: ${escapeHtml(err.message || String(err))}</span>`);
    } finally {
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', runSingleSearch);
  serialInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSingleSearch();
  });

  // ---------- shared multi-result rendering ----------

  function buildListView(serials, result) {
    const blocks = serials.map((serial) => {
      const matches = result.resultsBySerial[serial] || [];
      let inner;

      if (matches.length === 0) {
        inner = `<div class="not-found">Not found</div>`;
      } else {
        inner = matches
          .map(
            (match, idx) => `
            <div class="match-item">
              ${idx === 0 && matches.length > 1 ? `<div class="status">Found in ${matches.length} spreadsheets — this usually means the same serial was scanned into more than one file by mistake.</div>` : ''}
              ${matchDetailsHtml(match)}
            </div>`
          )
          .join('');
      }

      return `
        <div class="serial-block">
          <h3>${matches.length > 0 ? '<span class="found-label">&#10003;</span>' : '<span class="not-found">&#10007;</span>'} ${escapeHtml(serial)}${
        matches.length > 0 && matches[0].partial ? '<span class="partial-badge">Partial match</span>' : ''
      }</h3>
          ${inner}
        </div>
      `;
    });

    return `<div class="results-list">${blocks.join('')}</div>`;
  }

  function buildGridView(serials, result) {
    const cards = serials.map((serial) => {
      const matches = result.resultsBySerial[serial] || [];

      if (matches.length === 0) {
        return `
          <div class="grid-card not-found-card">
            <div class="grid-card-header"><span class="not-found">&#10007;</span> ${escapeHtml(serial)}</div>
            <div class="grid-card-body not-found">Not found</div>
          </div>
        `;
      }

      const first = matches[0];
      const jobInfoBtnHtml = first.jobNumber
        ? `<button class="jobInfoBtn info-btn" title="Job info" data-file="${encodeURIComponent(
            first.filePath
          )}" data-job="${encodeURIComponent(first.jobNumber)}">&#9432;</button>`
        : '';
      return `
        <div class="grid-card">
          <div class="grid-card-header"><span class="found-label">&#10003;</span> ${escapeHtml(first.serial)}</div>
          ${first.partial ? '<div><span class="partial-badge">Partial match</span></div>' : ''}
          <div class="grid-card-body">
            <div>${escapeHtml(first.type || 'N/A')}</div>
            <div class="grid-card-header-row">Job ${escapeHtml(first.jobNumber || 'N/A')}${jobInfoBtnHtml}</div>
            <div class="grid-card-file" title="${escapeHtml(first.fileName)}">${escapeHtml(first.fileName)}</div>
          </div>
          ${
            matches.length > 1
              ? `<div class="status">+${matches.length - 1} more match${matches.length - 1 === 1 ? '' : 'es'}</div>`
              : ''
          }
          <button class="openFileBtn" data-file="${encodeURIComponent(first.filePath)}">Open file</button>
        </div>
      `;
    });

    return `<div class="results-grid">${cards.join('')}</div>`;
  }

  function buildBasicView(serials, result) {
    const lines = serials.map((serial) => {
      const matches = result.resultsBySerial[serial] || [];

      if (matches.length === 0) {
        return `<div class="basic-row"><span class="not-found">&#10007; ${escapeHtml(serial)} — not found</span></div>`;
      }

      const first = matches[0];
      const extra = matches.length > 1 ? ` (+${matches.length - 1} more)` : '';
      const partialNote = first.partial ? ', partial match' : '';
      return `
        <div class="basic-row">
          <span class="found-label">&#10003;</span>
          ${escapeHtml(first.serial)} — ${escapeHtml(first.type || 'N/A')}, Job ${escapeHtml(first.jobNumber || 'N/A')}, found in ${escapeHtml(first.fileName)}${extra}${partialNote}
        </div>
      `;
    });

    return `<div class="results-basic">${lines.join('')}</div>`;
  }

  function renderMultiResults(serials, result) {
    lastMultiSerials = serials;
    lastMultiResult = result;

    resultsEl.className = '';

    const foundCount = serials.filter((s) => (result.resultsBySerial[s] || []).length > 0).length;

    lastExportableMatches = [];
    serials.forEach((serial) => {
      const matches = result.resultsBySerial[serial] || [];
      if (matches.length > 0) {
        matches.forEach((match) => lastExportableMatches.push(match));
      } else {
        lastExportableMatches.push({
          serial,
          type: '',
          jobNumber: '',
          id: '',
          collectionId: '',
          collectionDate: '',
          userName: '',
          qty: '',
          fileName: '',
          notFound: true,
        });
      }
    });

    let viewHtml;
    if (resultsViewMode === 'grid') viewHtml = buildGridView(serials, result);
    else if (resultsViewMode === 'basic') viewHtml = buildBasicView(serials, result);
    else viewHtml = buildListView(serials, result);

    resultsEl.innerHTML = `
      <div class="results-toolbar">
        <div class="mode-toggle results-view-toggle">
          <button id="viewListBtn" class="${resultsViewMode === 'list' ? 'active' : ''}">List</button>
          <button id="viewGridBtn" class="${resultsViewMode === 'grid' ? 'active' : ''}">Grid</button>
          <button id="viewBasicBtn" class="${resultsViewMode === 'basic' ? 'active' : ''}">Basic</button>
        </div>
        <button id="exportResultsBtn" ${lastExportableMatches.length === 0 ? 'disabled' : ''}>Export to Excel</button>
      </div>
      <div class="status" style="margin-bottom:8px;">
        Found ${foundCount} of ${serials.length} serial(s). Searched ${result.filesSearched} spreadsheet file(s) (including subfolders).
      </div>
      <div id="exportStatus"></div>
      ${viewHtml}
    `;
    wireOpenFileButtons(resultsEl);
    wireJobInfoButtons(resultsEl);

    const exportBtn = document.getElementById('exportResultsBtn');
    if (exportBtn) exportBtn.addEventListener('click', runExport);

    document.getElementById('viewListBtn').addEventListener('click', () => setResultsViewMode('list'));
    document.getElementById('viewGridBtn').addEventListener('click', () => setResultsViewMode('grid'));
    document.getElementById('viewBasicBtn').addEventListener('click', () => setResultsViewMode('basic'));
  }

  function setResultsViewMode(newViewMode) {
    resultsViewMode = newViewMode;
    window.api.updateConfig({ resultsViewMode: newViewMode });
    if (lastMultiSerials && lastMultiResult) {
      renderMultiResults(lastMultiSerials, lastMultiResult);
    }
  }

  // ---------- export to Excel ----------

  async function runExport() {
    const exportBtn = document.getElementById('exportResultsBtn');
    const exportStatusEl = document.getElementById('exportStatus');
    if (!exportStatusEl) return;

    if (exportBtn) exportBtn.disabled = true;
    exportStatusEl.innerHTML = `
      <div class="spinner-wrap"><div class="spinner"></div><span>Creating export&hellip;</span></div>
    `;

    try {
      const result = await window.api.exportResults(lastExportableMatches);

      if (result.error) {
        exportStatusEl.innerHTML = `<span class="export-error">Export failed: ${escapeHtml(result.error)}</span>`;
        return;
      }

      exportStatusEl.innerHTML = `
        <span class="export-success">&#10003; Export created: ${escapeHtml(result.fileName)} (${result.rowCount} row${
        result.rowCount === 1 ? '' : 's'
      })</span>
        <button id="openExportBtn">Open file</button>
      `;

      document.getElementById('openExportBtn').addEventListener('click', async () => {
        const err = await window.api.openFile(result.filePath);
        if (err) alert(`Could not open file: ${err}`);
      });
    } catch (err) {
      exportStatusEl.innerHTML = `<span class="export-error">Export failed: ${escapeHtml(err.message || String(err))}</span>`;
    } finally {
      if (exportBtn) exportBtn.disabled = false;
    }
  }

  // ---------- multiple search: raw data ----------

  function parseRawInput(rawText) {
    const trimmed = rawText.trim();

    if (!trimmed) {
      return { error: 'Please paste or type at least one serial number.' };
    }

    let tokens;

    if (/\r?\n/.test(trimmed)) {
      tokens = trimmed.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    } else if (/,/.test(trimmed)) {
      tokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (/\s/.test(trimmed)) {
      tokens = trimmed.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    } else {
      tokens = [trimmed];
    }

    if (tokens.length === 0) {
      return {
        error:
          'No serial numbers were detected. Supported formats: one serial per line, serials separated by spaces, or serials separated by commas.',
      };
    }

    const invalidTokens = tokens.filter((t) => !/^[A-Za-z0-9]+$/.test(t));
    if (invalidTokens.length > 0) {
      return {
        error: `Could not recognize the format. Supported formats are: one serial per line, serials separated by spaces, or serials separated by commas (not mixed together). Problem entr${
          invalidTokens.length === 1 ? 'y' : 'ies'
        }: ${invalidTokens.map((t) => `"${t}"`).join(', ')}`,
      };
    }

    if (tokens.length > MAX_RAW_SERIALS) {
      return { error: `A maximum of ${MAX_RAW_SERIALS} serial numbers can be searched at once (found ${tokens.length}).` };
    }

    return { serials: tokens };
  }

  async function runRawSearch() {
    rawDataInput.value = rawDataInput.value.toUpperCase();
    const parsed = parseRawInput(rawDataInput.value);

    if (parsed.error) {
      setEmptyState(`<span class="not-found">${escapeHtml(parsed.error)}</span>`);
      return;
    }

    const serials = parsed.serials;

    if (!currentDirectory) {
      setEmptyState('<span class="not-found">Please choose a working directory first (Settings).</span>');
      return;
    }

    rawSearchBtn.disabled = true;
    setLoadingState('Searching\u2026');

    try {
      const result = await window.api.searchSerials(currentDirectory, serials);

      if (result.error) {
        setEmptyState(`<span class="not-found">${escapeHtml(result.error)}</span>`);
        return;
      }

      renderMultiResults(serials, result);
    } catch (err) {
      setEmptyState(`<span class="not-found">Unexpected error: ${escapeHtml(err.message || String(err))}</span>`);
    } finally {
      rawSearchBtn.disabled = false;
    }
  }

  rawSearchBtn.addEventListener('click', runRawSearch);
})();
