; =====================================================================
; SCRIPT DE INSTALADOR INNO SETUP PARA WINTERPOS PUNTO DE VENTA
; =====================================================================

#define MyAppName "WinterPos Punto de Venta"
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
OutputBaseFilename=WinterPosSetup_v1.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=app_icon.ico
UninstallDisplayIcon={app}\installer\app_icon.ico
WizardImageFile=wizard_sidebar.bmp
WizardSmallImageFile=wizard_small.bmp

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "firewallrules"; Description: "🛡️ Configurar reglas en Firewall de Windows (Puertos 5000 Web y 5432 Base de Datos para acceso en Red LAN)"; GroupDescription: "Configuración de Red y Seguridad:"; Flags: checkedonce
Name: "debugmode"; Description: "⚙️ Activar Modo Depuración / Debugger (Muestra la consola CMD con logs en vivo)"; GroupDescription: "Opciones de Auditoría:"; Flags: unchecked

[Files]
; Icono principal del sistema
Source: "app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "wizard_card.bmp"; Flags: dontcopy

; Launchers and root scripts
Source: "..\Iniciar_WinterPos.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Iniciar_WinterPos.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist_root\desktop-main.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\desktop-main.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Protected Backend (Takes obfuscated files from dist_backend)
Source: "..\dist_backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
; Backend runtime dependencies (Node modules)
Source: "..\backend\node_modules\*"; DestDir: "{app}\backend\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".cache\*,**\.cache\*"

; Compiled Frontend Dist (React Vite)
Source: "..\WinterPosAL\dist\*"; DestDir: "{app}\WinterPosAL\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Modo Silencioso Principal (Por defecto para Cajero / Operario) - Usa wscript para garantizar 0 ventanas de CMD
Name: "{group}\WinterPosAL"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; IconFilename: "{app}\app_icon.ico"; IconIndex: 0
Name: "{autodesktop}\WinterPosAL"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Tasks: desktopicon; IconFilename: "{app}\app_icon.ico"; IconIndex: 0

; Modo Depuración / Debugger (Si se selecciona la casilla Debugger)
Name: "{autodesktop}\WinterPosAL (Debug CMD)"; Filename: "{app}\Iniciar_WinterPos.bat"; Tasks: desktopicon; IconFilename: "{app}\app_icon.ico"; IconIndex: 0; Check: IsDebugModeSelected

; Acceso directo de diagnóstico permanente en Menú Inicio
Name: "{group}\WinterPosAL - Modo Depuración (Logs CMD)"; Filename: "{app}\Iniciar_WinterPos.bat"; IconFilename: "{app}\app_icon.ico"; IconIndex: 0
Name: "{group}\Desinstalar WinterPosAL"; Filename: "{uninstallexe}"

[Dirs]
Name: "{app}"; Permissions: users-full
Name: "{app}\data"; Permissions: users-full
Name: "{app}\data\product_images"; Permissions: users-full
Name: "{app}\backend\data"; Permissions: users-full
Name: "{app}\backend\data\product_images"; Permissions: users-full

[Run]
; Otorgar permisos totales de escritura en la carpeta de instalación (licenciamiento y datos)
Filename: "icacls"; Parameters: """{app}"" /grant Users:(OI)(CI)F /T"; Flags: runhidden; StatusMsg: "Configurando permisos de escritura para licencia y datos..."

; Register Windows Service automatically (Runs silently in background)
Filename: "cmd.exe"; Parameters: "/c node ""{app}\backend\service\install_service.js"""; Flags: runhidden; StatusMsg: "Registrando servicio de segundo plano WinterPos..."; Check: IsServerModeSelected

; Limpiar reglas duplicadas antiguas y configurar regla única para Servidor Web (Puerto 5000)
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""WinterPos Server (Puerto 5000)"""; Flags: runhidden; Check: IsFirewallTaskSelected
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""WinterPos Server (Puerto 5000)"" dir=in action=allow protocol=TCP localport=5000 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5000)..."; Check: IsFirewallTaskSelected

; Limpiar reglas duplicadas antiguas y configurar regla única para PostgreSQL (Puerto 5432) en Servidor Principal
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""PostgreSQL Server (Puerto 5432)"""; Flags: runhidden; Check: ShouldConfigurePgFirewall
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""PostgreSQL Server (Puerto 5432)"" dir=in action=allow protocol=TCP localport=5432 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5432)..."; Check: ShouldConfigurePgFirewall

Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent

[Code]
var
  AuthPage: TWizardPage;
  UserEdit: TNewEdit;
  PassEdit: TNewEdit;
  ShowPassCheck: TNewCheckBox;
  RolePage: TWizardPage;
  ServerRadio: TRadioButton;
  ClientRadio: TRadioButton;
  IpPage: TWizardPage;
  IpEdit: TNewEdit;
  IpLabel: TNewStaticText;
  HelpText: TNewStaticText;

function IsDebugModeSelected: Boolean;
begin
  Result := WizardIsTaskSelected('debugmode');
end;

function IsFirewallTaskSelected: Boolean;
begin
  Result := WizardIsTaskSelected('firewallrules');
end;

function IsServerModeSelected: Boolean;
begin
  Result := (ServerRadio <> nil) and ServerRadio.Checked;
end;

function ShouldConfigurePgFirewall: Boolean;
begin
  Result := IsFirewallTaskSelected and IsServerModeSelected;
end;

procedure OnShowPassCheckClick(Sender: TObject);
begin
  if (ShowPassCheck <> nil) and (PassEdit <> nil) then
  begin
    if ShowPassCheck.Checked then
      PassEdit.PasswordChar := #0
    else
      PassEdit.PasswordChar := '*';
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (AuthPage <> nil) and (CurPageID = AuthPage.ID) then
  begin
    if (Trim(UserEdit.Text) <> 'laguna12') or (PassEdit.Text <> 'Osopolar*01') then
    begin
      MsgBox('⛔ ACCESO DENEGADO' + #13#10 + #13#10 +
             'El usuario o la contraseña de instalación son incorrectos.' + #13#10 +
             'No está autorizado para instalar este software en este equipo.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure InitializeWizard;
var
  InfoLabel: TNewStaticText;
  UserLabel: TNewStaticText;
  PassLabel: TNewStaticText;
  CardImage: TBitmapImage;
  CardImage2: TBitmapImage;
  CardFile: string;
begin
  ExtractTemporaryFile('wizard_card.bmp');
  CardFile := ExpandConstant('{tmp}\wizard_card.bmp');

  // Page 0: Autenticación de Seguridad de Instalador
  AuthPage := CreateCustomPage(wpWelcome, '🔒 Autenticación de Seguridad del Instalador', 'Ingrese las credenciales autorizadas del técnico para desbloquear la instalación.');

  // Visual card branding preview
  CardImage := TBitmapImage.Create(AuthPage);
  CardImage.Parent := AuthPage.Surface;
  CardImage.Left := ScaleX(290);
  CardImage.Top := ScaleY(10);
  CardImage.Width := ScaleX(175);
  CardImage.Height := ScaleY(205);
  CardImage.Stretch := True;
  CardImage.AutoSize := False;
  if FileExists(CardFile) then
    CardImage.Bitmap.LoadFromFile(CardFile);

  InfoLabel := TNewStaticText.Create(AuthPage);
  InfoLabel.Parent := AuthPage.Surface;
  InfoLabel.Left := ScaleX(10);
  InfoLabel.Top := ScaleY(10);
  InfoLabel.Width := ScaleX(270);
  InfoLabel.WordWrap := True;
  InfoLabel.Caption := 'Este paquete de instalación está protegido. Para continuar con la instalación de WinterPos en este equipo, introduzca las credenciales autorizadas:';

  UserLabel := TNewStaticText.Create(AuthPage);
  UserLabel.Parent := AuthPage.Surface;
  UserLabel.Left := ScaleX(10);
  UserLabel.Top := ScaleY(65);
  UserLabel.Caption := 'Usuario de Instalación:';
  UserLabel.Font.Style := [fsBold];

  UserEdit := TNewEdit.Create(AuthPage);
  UserEdit.Parent := AuthPage.Surface;
  UserEdit.Left := ScaleX(10);
  UserEdit.Top := ScaleY(85);
  UserEdit.Width := ScaleX(265);
  UserEdit.Text := '';

  PassLabel := TNewStaticText.Create(AuthPage);
  PassLabel.Parent := AuthPage.Surface;
  PassLabel.Left := ScaleX(10);
  PassLabel.Top := ScaleY(125);
  PassLabel.Caption := 'Contraseña de Acceso:';
  PassLabel.Font.Style := [fsBold];

  PassEdit := TNewEdit.Create(AuthPage);
  PassEdit.Parent := AuthPage.Surface;
  PassEdit.Left := ScaleX(10);
  PassEdit.Top := ScaleY(145);
  PassEdit.Width := ScaleX(265);
  PassEdit.PasswordChar := '*';
  PassEdit.Text := '';

  ShowPassCheck := TNewCheckBox.Create(AuthPage);
  ShowPassCheck.Parent := AuthPage.Surface;
  ShowPassCheck.Left := ScaleX(10);
  ShowPassCheck.Top := ScaleY(180);
  ShowPassCheck.Width := ScaleX(265);
  ShowPassCheck.Caption := '👁️ Mostrar contraseña';
  ShowPassCheck.OnClick := @OnShowPassCheckClick;

  // Page 1: Role Selection
  RolePage := CreateCustomPage(AuthPage.ID, 'Modo de Instalación', 'Seleccione el rol de este equipo en el sistema de ventas.');
  
  CardImage2 := TBitmapImage.Create(RolePage);
  CardImage2.Parent := RolePage.Surface;
  CardImage2.Left := ScaleX(295);
  CardImage2.Top := ScaleY(10);
  CardImage2.Width := ScaleX(170);
  CardImage2.Height := ScaleY(205);
  CardImage2.Stretch := True;
  CardImage2.AutoSize := False;
  if FileExists(CardFile) then
    CardImage2.Bitmap.LoadFromFile(CardFile);

  ServerRadio := TRadioButton.Create(RolePage);
  ServerRadio.Parent := RolePage.Surface;
  ServerRadio.Left := ScaleX(10);
  ServerRadio.Top := ScaleY(10);
  ServerRadio.Width := ScaleX(275);
  ServerRadio.Caption := '🖥️ Servidor Principal (Caja 1 / Central)';
  ServerRadio.Font.Style := [fsBold];
  ServerRadio.Checked := True;

  HelpText := TNewStaticText.Create(RolePage);
  HelpText.Parent := RolePage.Surface;
  HelpText.Left := ScaleX(26);
  HelpText.Top := ScaleY(34);
  HelpText.Width := ScaleX(260);
  HelpText.WordWrap := True;
  HelpText.Caption := 'Instala el servidor central, PostgreSQL, el scraper BCV y el bot de WhatsApp.';

  ClientRadio := TRadioButton.Create(RolePage);
  ClientRadio.Parent := RolePage.Surface;
  ClientRadio.Left := ScaleX(10);
  ClientRadio.Top := ScaleY(105);
  ClientRadio.Width := ScaleX(275);
  ClientRadio.Caption := '💻 Caja Secundaria (Terminal LAN)';
  ClientRadio.Font.Style := [fsBold];

  HelpText := TNewStaticText.Create(RolePage);
  HelpText.Parent := RolePage.Surface;
  HelpText.Left := ScaleX(26);
  HelpText.Top := ScaleY(129);
  HelpText.Width := ScaleX(260);
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
  IpEdit.Text := '127.0.0.1';

  HelpText := TNewStaticText.Create(IpPage);
  HelpText.Parent := IpPage.Surface;
  HelpText.Left := ScaleX(16);
  HelpText.Top := ScaleY(80);
  HelpText.Width := ScaleX(440);
  HelpText.WordWrap := True;
  HelpText.Caption := '💡 Ayuda: Si este equipo es la Caja Secundaria, introduzca la dirección IP local de la PC Servidor (ejemplo: 192.168.1.105). En la PC Servidor puede averiguar la IP ejecutando "cmd" y luego "ipconfig".';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // If Server mode selected, skip IP input page (defaults to 127.0.0.1)
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
