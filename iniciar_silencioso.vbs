Set objShell = CreateObject("WScript.Shell")
Dim strPath : strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = strPath
objShell.Run "node --use-system-ca backend/app.js", 0, False
WScript.Sleep 4000
objShell.Run "node --use-system-ca backend/sync_continuo.js", 0, False
