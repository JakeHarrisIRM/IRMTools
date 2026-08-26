'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Helper: run a PowerShell script and return its trimmed stdout
// ---------------------------------------------------------------------------
function runPowerShellScript(scriptContent) {
  const tmpFile = path.join(os.tmpdir(), `irmtools-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(tmpFile, scriptContent, 'utf8');
  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
      { encoding: 'utf8' }
    );
    return output.trim();
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {
      /* ignore */
    }
  }
}

// Try to auto-detect an installed Zebra ZD421 printer by name. Returns the
// printer name if found, or null if nothing matched (unlike the standalone
// app this was merged from, there's no hardcoded fallback name here - the
// Settings screen handles the "nothing detected" case explicitly, letting
// the user pick from the full printer list or type one in).
function detectPrinterName() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$p = Get-Printer | Where-Object { $_.Name -like '*ZD421*' } | Select-Object -First 1 -ExpandProperty Name
if ($p) { Write-Output $p }
`;
  try {
    const result = runPowerShellScript(script);
    return result || null;
  } catch (_) {
    return null;
  }
}

// Lists every installed printer name, for the Settings "choose a printer"
// dropdown. Always returns an array, even with zero or one printer
// installed (PowerShell would otherwise emit a bare string for a single
// result instead of a JSON array).
function listPrinters() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$names = @(Get-Printer | Select-Object -ExpandProperty Name)
Write-Output ($names | ConvertTo-Json -Compress)
`;
  try {
    const raw = runPowerShellScript(script);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch (err) {
    console.error('Failed to list printers:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Send raw ZPL bytes directly to the printer via the Windows Print Spooler
// (winspool.drv) API, the same mechanism Zebra's own "Send Command" tool uses.
// ---------------------------------------------------------------------------
function sendZplToPrinter(zpl, printerName) {
  const tmpDataFile = path.join(os.tmpdir(), `zpl-${Date.now()}.txt`);
  fs.writeFileSync(tmpDataFile, zpl, 'ascii');

  const escapedFilePath = tmpDataFile.replace(/'/g, "''");
  const escapedPrinterName = printerName.replace(/'/g, "''");

  const script = `
$signature = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes, int dwCount)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        int dwWritten = 0;
        bool bSuccess = false;
        di.pDocName = "ZPL Raw Document";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(dwCount);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, dwCount);
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, dwCount, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

Add-Type -TypeDefinition $signature -Language CSharp

$bytes = [System.IO.File]::ReadAllBytes('${escapedFilePath}')
$ok = [RawPrinterHelper]::SendBytesToPrinter('${escapedPrinterName}', $bytes, $bytes.Length)
Write-Output $ok
`;

  let success = false;
  try {
    const result = runPowerShellScript(script);
    success = result.trim().toLowerCase() === 'true';
  } finally {
    try {
      fs.unlinkSync(tmpDataFile);
    } catch (_) {
      /* ignore */
    }
  }
  return success;
}

module.exports = { detectPrinterName, listPrinters, sendZplToPrinter };
