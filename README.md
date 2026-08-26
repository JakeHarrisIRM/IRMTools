# Iron Mountain Tools (IRMTools)

A single desktop app combining two internal tools:

- **Serial Finder** — search warehouse spreadsheets for a scanned serial number.
- **Label Printer** — print ZPL labels to a Zebra printer (e.g. ZD421) without
  Zebra Setup Utilities or manual "Send Command" steps.

Switch between them from the navbar at the top. More tools can be added to
the same navbar later.

## Setup

1. Install [Node.js](https://nodejs.org/) (LTS version) if you don't have it.
2. Open a terminal/PowerShell in this folder.
3. Run:
   ```
   npm install
   ```
   If npm reports pending install scripts being blocked (e.g. an
   `allow-scripts` warning), run `npm approve-scripts --allow-scripts-pending`
   and approve Electron's script, then run `npm install` again — Electron
   needs its postinstall step to download its actual binary.

## Running it

```
npm start
```

This works fine, but it leaves a command prompt window open behind the app
the whole time. For a cleaner launch with no visible console at all,
double-click **`Start IRMTools.vbs`** instead (or make a desktop/taskbar
shortcut to it) — it runs the exact same `npm start` under the hood, just
with the console window hidden. Only the app window itself appears.

If double-clicking the `.vbs` file doesn't seem to do anything, run
`npm start` (or `start.bat`) directly in a terminal instead so you can see
what error is happening — the hidden launcher suppresses output along with
the window, which is fine once things are working but unhelpful while
troubleshooting.

The app reopens on whichever page (Serial Finder or Label Printer) you had
open last time you closed it.

## Settings (gear icon, top right)

All shared configuration lives here now, saved to `config.json` next to the
app:

- **Dark mode** — toggle, remembered between launches.
- **Serial Finder → Working directory** — the folder Serial Finder scans.
  This used to be on the Serial Finder page itself; it's in Settings now
  since a future tool may reuse the same folder.
- **Label Printer → Printer** — shows the currently active printer. On first
  launch (or whenever no printer is saved yet), the app automatically tries
  to auto-detect an installed Zebra ZD421 (matching on `*ZD421*` in the
  printer name), exactly like the standalone label printer app did. If nothing
  is detected, or you use a different/multiple printers, you can:
  - Pick from a dropdown of every printer installed on the PC, or
  - Type an exact printer name manually (e.g. if it's not listed for some
    reason).

  Window size and position are also remembered automatically — no setting
  needed for that.

## Serial Finder

Unchanged from the standalone version, other than the working directory
moving into Settings:

- **Single search** — one serial at a time, case-insensitive, with a
  ⓘ button next to any Job number to see a per-job Type breakdown.
- **Multiple search** — paste up to 50 serials (one per line, space- or
  comma-separated), view results as **List / Grid / Basic**, and **Export to
  Excel** — a real Excel Table (banded rows, filter arrows, "White, Table
  Style Medium 1") with one row per searched serial (found or not), plus a
  per-job statistics table in column K.
- Handles Lenovo-style long scanned barcodes with partial matching (only
  against the Serial column, only for 15+ character values, clearly flagged
  as "Partial match" when it happens).

## Label Printer

If no printer is set up yet, this page shows a short explanation and a
button straight into Settings. Once a printer is active, there are three
label types, switchable via a segmented control at the top of the page:

### Custom Label

Two fields instead of the old "pick single vs multi-line first" menu:

- **Line 1 (required)** — always needed.
- **Line 2 (optional)** — leave it blank for a single-line label; fill it in
  (or check **Total Asset Count?**) and it automatically becomes a
  multi-line label. A hint under Line 1 tells you which character limit
  currently applies (1–20 for single-line, 1–30 for multi-line), since that
  limit depends on whether Line 2 ends up being used.
- **Total Asset Count?** — appends sequential `1 of N`, `2 of N`, ... text to
  Line 2 (or replaces it if Line 2 is blank). Because each label in the
  batch needs distinct text, this sends one full label per unit as a single
  back-to-back print job rather than using the printer's built-in quantity
  command.
- **Alignment** (Left / Center / Right) and **Quantity** (1–200), same as
  before.

### Templates

Three fixed-layout labels, selected from cards: **Failed Device Label**,
**Missing Components Label**, **Removed Components Label**. Each only takes
an optional **Job ID / CID** (max 15 characters) and a **Quantity** — the
rest of the layout is hardcoded, same as the standalone app. Removed
Components Label prints a 2-label bundle per unit (a parts checklist plus a
small "this HDD belongs to" tag), so quantity 5 prints 10 labels total.

### Custom Templates

Check off any saved presets (e.g. "Wiped", "Grades B, C, D") and set a
quantity that applies to each one checked. **Manage Templates** opens an
editor to add, remove, or reorder presets (up/down arrows) — changes save
straight to `custom_templates.json` next to the app, no manual file editing
needed.

### After printing

A green confirmation banner appears near the top of the screen for about 10
seconds describing what was sent. Input fields relevant to that label type
are cleared automatically (quantity always resets to `1`; alignment and the
selected template/card are left as-is, since those are more like ongoing
preferences than one-off input). If something goes wrong (bad printer name,
printer offline, validation failure), a red banner explains what to fix
instead.

## Files

- `Start IRMTools.vbs` — double-click launcher that runs the app with no
  visible console window (see "Running it" above).
- `start.bat` — plain `npm start` wrapper with a visible console, useful for
  troubleshooting.
- `main.js` — Electron main process: window/config management and all IPC
  handlers for both tools.
- `preload.js` — exposes the IPC API to the renderer safely.
- `index.html` — the whole app shell: navbar, both pages, Settings modal,
  Job Info modal, Manage Templates modal, alert banner.
- `renderer/app.js` — shared logic: navbar/page switching, Settings modal,
  dark mode, printer settings, the alert banner, and startup sequencing.
- `renderer/serialFinder.js` — Serial Finder page logic.
- `renderer/labelPrinter.js` — Label Printer page logic.
- `lib/config.js` — shared `config.json` read/write helper.
- `lib/serialSearch.js` — spreadsheet scanning logic for Serial Finder.
- `lib/exportBuilder.js` — Excel Table export builder for Serial Finder.
- `lib/printerService.js` — PowerShell-backed printer detection/listing and
  raw ZPL sending via the Windows print spooler.
- `lib/zplBuilder.js` — pure ZPL label-building functions.
- `lib/customTemplates.js` — custom template presets: load/save/add/remove/reorder.
- `custom_templates.json` — the custom label presets (a flat array of
  strings), editable via the in-app Manage Templates screen.
- `config.json` — created/updated automatically; stores dark mode, working
  directory, printer name, window bounds, results view, and last opened page.
- `favicon.png` — the app's window/taskbar icon.

## Notes on the printer integration

Printer detection, listing, and raw printing all shell out to PowerShell —
same mechanism as the standalone app, just triggered from the UI instead of
native message boxes. Sending ZPL uses the same low-level `winspool.drv`
`WritePrinter` call (via a small embedded C# helper class) that Zebra's own
"Send Command" utility uses, so no extra print driver configuration is
needed beyond having the printer installed on Windows.
