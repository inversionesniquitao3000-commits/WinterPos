; =====================================================================
; INSTALADOR COMPLETO OFFLINE DE WINTERPOS PUNTO DE VENTA (VERSION ~350MB)
; INCLUYE MOTOR POSTGRESQL DESATENDIDO E INTEGRACIÓN OFFLINE
; =====================================================================

#define MyAppName "WinterPos Punto de Venta (Completo Offline)"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "WinterPos AL"
#define MyAppURL "https://winterpos.local"
#define MyAppExeName "Iniciar_WinterPos.vbs"

[Setup]
AppId={{D3F9B7A2-7E81-4C09-8F2B-9C8D4E1A5B3C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\WinterPos
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\installer_output
OutputBaseFilename=WinterPosSetup_Completo_Offline
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=app_icon.ico
UninstallDisplayIcon={app}\installer\app_icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "installpg"; Description: "🐘 Instalar Motor de Base de Datos PostgreSQL 15 (Recomendado para Servidor Central)"; GroupDescription: "Componentes del Servidor:"
Name: "installnode"; Description: "💚 Instalar Entorno de Ejecución Node.js v20 (Recomendado si la PC no posee Node.js previamente)"; GroupDescription: "Componentes del Servidor:"
Name: "debugmode"; Description: "⚙️ Activar Modo Depuración / Debugger (Muestra la consola CMD con logs en vivo)"; GroupDescription: "Opciones de Auditoría:"; Flags: unchecked

[Files]
; Explicitly bundle PostgreSQL & Node.js installers for full offline installation
Source: "postgresql-installer.exe"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist
Source: "postgresql-installer.exe.exe"; DestDir: "{app}\installer"; DestName: "postgresql-installer.exe"; Flags: ignoreversion skipifsourcedoesntexist
Source: "node-installer.msi"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist
Source: "node-installer.msi.msi"; DestDir: "{app}\installer"; DestName: "node-installer.msi"; Flags: ignoreversion skipifsourcedoesntexist

; Icono principal del sistema
Source: "app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "app_icon.ico"; DestDir: "{app}\installer"; Flags: ignoreversion

; Copy runtime files (Backend, Compiled Frontend Dist, Launchers, Dependencies) - EXCLUDES React source code and dev files
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.vscode\*,.gemini\*,brain\*,scratch\*,installer\*,installer_output\*,.wwebjs_auth\*,.wwebjs_cache\*,node_modules\.cache\*,WinterPosAL\src\*,WinterPosAL\public\*,WinterPosAL\node_modules\*,WinterPosAL\tsconfig*.json,WinterPosAL\vite.config.ts,WinterPosAL\generar_manuales.js"

[Icons]
; Modo Silencioso Principal (Por defecto para Cajero / Operario)
Name: "{group}\WinterPosAL"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; IconIndex: 0
Name: "{autodesktop}\WinterPosAL"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\app_icon.ico"; IconIndex: 0

; Modo Depuración / Debugger (Si se selecciona la casilla Debugger)
Name: "{autodesktop}\WinterPosAL (Debug CMD)"; Filename: "{app}\Iniciar_WinterPos.bat"; Tasks: desktopicon; IconFilename: "{app}\app_icon.ico"; IconIndex: 0; Check: IsDebugModeSelected

; Acceso directo de diagnóstico permanente en Menú Inicio
Name: "{group}\WinterPosAL - Modo Depuración (Logs CMD)"; Filename: "{app}\Iniciar_WinterPos.bat"; IconFilename: "{app}\app_icon.ico"; IconIndex: 0
[Dirs]
Name: "{app}"; Permissions: users-full
Name: "{app}\data"; Permissions: users-full

[Run]
; Otorgar permisos totales de escritura en la carpeta de instalación (licenciamiento y datos)
Filename: "icacls"; Parameters: """{app}"" /grant Users:(OI)(CI)F /T"; Flags: runhidden; StatusMsg: "Configurando permisos de escritura para licencia y datos..."

; Install Node.js silently if selected by user and installer exists
Filename: "msiexec.exe"; Parameters: "/i ""{app}\installer\node-installer.msi"" /qn /norestart"; Flags: runhidden; StatusMsg: "Instalando entorno Node.js v20 en segundo plano..."; Check: ShouldInstallNode

; Install PostgreSQL silently in Server Mode if PostgreSQL installer is present in installer folder and selected
Filename: "{app}\installer\postgresql-installer.exe"; Parameters: "--mode unattended --superpassword postgres --serverport 5432"; Flags: runhidden; StatusMsg: "Instalando motor PostgreSQL 15 en segundo plano (Modo Offline)..."; Check: ShouldInstallPg

; Register Windows Service automatically (Runs silently in background)
Filename: "cmd.exe"; Parameters: "/c node ""{app}\tools\install_service.js"""; Flags: runhidden; StatusMsg: "Registrando servicio de segundo plano WinterPos..."; Check: IsServerModeSelected

; Add Firewall Rule for WinterPos Web Server (Port 5000)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""WinterPos Server (Puerto 5000)"" dir=in action=allow protocol=TCP localport=5000 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5000)..."

; Add Firewall Rule for PostgreSQL Database (Port 5432)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""PostgreSQL Server (Puerto 5432)"" dir=in action=allow protocol=TCP localport=5432 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5432)..."

; Launch program
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent

[Code]
function IsDebugModeSelected: Boolean;
begin
  Result := WizardIsTaskSelected('debugmode');
end;

function IsNodeInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Node.js') or 
            RegKeyExists(HKLM, 'SOFTWARE\WOW6432Node\Node.js') or 
            FileExists('C:\Program Files\nodejs\node.exe') or 
            FileExists('C:\Program Files (x86)\nodejs\node.exe');
end;

function IsPgInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\PostgreSQL\Services') or 
            RegKeyExists(HKLM, 'SOFTWARE\PostgreSQL\Installations') or 
            FileExists('C:\Program Files\PostgreSQL\15\bin\postgres.exe') or
            FileExists('C:\Program Files\PostgreSQL\16\bin\postgres.exe') or
            FileExists('C:\Program Files\PostgreSQL\14\bin\postgres.exe');
end;

function ShouldInstallPg: Boolean;
begin
  Result := WizardIsTaskSelected('installpg') and FileExists(ExpandConstant('{app}\installer\postgresql-installer.exe'));
end;

function ShouldInstallNode: Boolean;
begin
  Result := WizardIsTaskSelected('installnode') and FileExists(ExpandConstant('{app}\installer\node-installer.msi'));
end;

var
  RolePage: TWizardPage;
  ServerRadio: TRadioButton;
  ClientRadio: TRadioButton;
  IpPage: TWizardPage;
  IpEdit: TNewEdit;
  IpLabel: TNewStaticText;
  HelpText: TNewStaticText;

function IsServerModeSelected: Boolean;
begin
  Result := (ServerRadio <> nil) and ServerRadio.Checked;
end;

function IsPgSetupPresentAndServerMode: Boolean;
begin
  Result := ServerRadio.Checked and FileExists(ExpandConstant('{app}\installer\postgresql-installer.exe'));
end;

procedure InitializeWizard;
begin
  // Detección automática: Si Node.js o PostgreSQL ya están instalados en el sistema, desmarcar casillas por defecto
  if IsNodeInstalled then
    WizardSelectTasks('!installnode');
    
  if IsPgInstalled then
    WizardSelectTasks('!installpg');
  // Page 1: Role Selection
  RolePage := CreateCustomPage(wpWelcome, 'Modo de Instalación (Completo Offline)', 'Seleccione el rol de este equipo en el sistema de ventas.');
  
  ServerRadio := TRadioButton.Create(RolePage);
  ServerRadio.Parent := RolePage.Surface;
  ServerRadio.Left := ScaleX(16);
  ServerRadio.Top := ScaleY(16);
  ServerRadio.Width := ScaleX(400);
  ServerRadio.Caption := '🖥️ Servidor Principal (Caja 1 / Central - Offline)';
  ServerRadio.Font.Style := [fsBold];
  ServerRadio.Checked := True;

  HelpText := TNewStaticText.Create(RolePage);
  HelpText.Parent := RolePage.Surface;
  HelpText.Left := ScaleX(36);
  HelpText.Top := ScaleY(40);
  HelpText.Width := ScaleX(420);
  HelpText.WordWrap := True;
  HelpText.Caption := 'Instala la PC central con el motor PostgreSQL 15 integrado, sin necesidad de conexión a internet. Inicializa tablas, BCV y WhatsApp.';

  ClientRadio := TRadioButton.Create(RolePage);
  ClientRadio.Parent := RolePage.Surface;
  ClientRadio.Left := ScaleX(16);
  ClientRadio.Top := ScaleY(100);
  ClientRadio.Width := ScaleX(400);
  ClientRadio.Caption := '💻 Caja Secundaria (Terminal Cliente LAN)';
  ClientRadio.Font.Style := [fsBold];

  HelpText := TNewStaticText.Create(RolePage);
  HelpText.Parent := RolePage.Surface;
  HelpText.Left := ScaleX(36);
  HelpText.Top := ScaleY(124);
  HelpText.Width := ScaleX(420);
  HelpText.WordWrap := True;
  HelpText.Caption := 'Se conecta a la PC Servidor por la red local (Wi-Fi o Cable Ethernet) para facturar de forma simultánea.';

  // Page 2: Server IP Configuration
  IpPage := CreateCustomPage(RolePage.ID, 'Configuración de Red Local (LAN)', 'Especifique la IP del Servidor Principal.');

  IpLabel := TNewStaticText.Create(IpPage);
  IpLabel.Parent := IpPage.Surface;
  IpLabel.Left := ScaleX(16);
  IpLabel.Top := ScaleY(16);
  IpLabel.Caption := 'Dirección IP de la PC Servidor Principal:';

  IpEdit := TNewEdit.Create(IpPage);
  IpEdit.Parent := IpPage.Surface;
  IpEdit.Left := ScaleX(16);
  IpEdit.Top := ScaleY(40);
  IpEdit.Width := ScaleX(250);
  IpEdit.Text := '192.168.11.40';

  HelpText := TNewStaticText.Create(IpPage);
  HelpText.Parent := IpPage.Surface;
  HelpText.Left := ScaleX(16);
  HelpText.Top := ScaleY(80);
  HelpText.Width := ScaleX(440);
  HelpText.WordWrap := True;
  HelpText.Caption := '💡 Ayuda: Si este equipo es la Caja Secundaria, introduzca la dirección IP local de la PC Servidor (ejemplo: 192.168.11.40). En la PC Servidor puede averiguar la IP ejecutando "cmd" y luego "ipconfig".';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  if (PageID = IpPage.ID) and (ServerRadio.Checked) then
    Result := True
  else
    Result := False;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvContent: string;
  EnvFile: string;
  ServerHost: string;
begin
  if CurStep = ssPostInstall then
  begin
    if ServerRadio.Checked then
      ServerHost := 'localhost'
    else
      ServerHost := IpEdit.Text;

    EnvFile := ExpandConstant('{app}\backend\.env');
    EnvContent := 
      'PORT=5000' + #13#10 +
      'DB_USER=postgres' + #13#10 +
      'DB_PASSWORD=postgres' + #13#10 +
      'DB_HOST=' + ServerHost + #13#10 +
      'DB_PORT=5432' + #13#10 +
      'DB_DATABASE=Winter' + #13#10;

    SaveStringToFile(EnvFile, EnvContent, False);
  end;
end;
