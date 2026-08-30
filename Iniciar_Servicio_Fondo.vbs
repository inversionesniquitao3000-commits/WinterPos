' =====================================================================
' WINTERPOS PUNTO DE VENTA - SERVIDOR EN SEGUNDO PLANO
' =====================================================================
' Inicia el backend de Node.js en modo 100% oculto (0 ventanas CMD)
' al iniciar sesion en Windows para apertura instantanea de la app.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

WshShell.Environment("PROCESS")("DEBUG_MODE") = "false"
WshShell.Run "cmd /c Iniciar_Servicio_Fondo.bat", 0, False
