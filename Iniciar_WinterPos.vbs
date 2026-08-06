' =====================================================================
' WINTERPOS PUNTO DE VENTA - LANZADOR SILENCIOSO EN SEGUNDO PLANO
' =====================================================================
' Oculta la ventana de comandos CMD al iniciar el sistema para ofrecer
' una experiencia de aplicacion nativa limpia y profesional al cajero.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

' Ejecuta el script de arranque en modo oculto (0) de forma asincrona (False)
WshShell.Run "cmd /c Iniciar_WinterPos.bat", 0, False
