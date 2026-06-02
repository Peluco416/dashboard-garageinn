Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\Claudia Peluco\Documents\dashboard-vendas"
objShell.Run "node backend/app.js", 0, False
