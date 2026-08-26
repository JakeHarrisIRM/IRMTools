' Launches IRMTools without a visible console/terminal window.
' Double-click this file (or make a desktop shortcut to it) instead of
' running "npm start" directly in a terminal.
'
' It works by running "npm start" via WshShell.Run with window style 0
' (hidden) - the Electron app window itself still opens normally, only the
' console/terminal that npm would otherwise show is suppressed.

Dim WshShell, fso, scriptDir

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Always run relative to this script's own folder, regardless of where it's
' launched from (double-click, shortcut, pinned taskbar icon, etc.)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' 0 = hidden window, False = don't wait for it to finish
WshShell.Run "cmd /c npm start", 0, False
