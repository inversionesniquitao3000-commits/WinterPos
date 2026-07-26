; =====================================================================
; INSTALADOR LIVIANO DE WINTERPOS PUNTO DE VENTA (VERSION LAN DE 9MB)
; =====================================================================

#define MyAppName "WinterPos Punto de Venta (Liviano)"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "WinterPos AL"
#define MyAppURL "https://winterpos.local"
#define MyAppExeName "Iniciar_WinterPos.bat"

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
OutputBaseFilename=WinterPosSetup_Liviano
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Copy all workspace files (Backend, Frontend Dist, Batch, Node dependencies)
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.wwebjs_auth\*,.wwebjs_cache\*,node_modules\.cache\*,installer_output\*,WinterPosAL\node_modules\*"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Add Firewall Rule for WinterPos Web Server (Port 5000)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""WinterPos Server (Puerto 5000)"" dir=in action=allow protocol=TCP localport=5000 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5000)..."

; Add Firewall Rule for PostgreSQL Database (Port 5432)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""PostgreSQL Server (Puerto 5432)"" dir=in action=allow protocol=TCP localport=5432 profile=any"; Flags: runhidden; StatusMsg: "Configurando Cortafuegos de Windows (Puerto 5432)..."

; Launch program
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent

[Code]
var
  RolePage: TWizardPage;
  ServerRadio: TRadioButton;
  ClientRadio: TRadioButton;
  IpPage: TWizardPage;
  IpEdit: TNewEdit;
  IpLabel: TNewStaticText;
  HelpText: TNewStaticText;

procedure InitializeWizard;
begin
  // Page 1: Role Selection
  RolePage := CreateCustomPage(wpWelcome, 'Modo de Instalación (Liviano)', 'Seleccione el rol de este equipo en el sistema de ventas.');
  
  ServerRadio := TRadioButton.Create(RolePage);
  ServerRadio.Parent := RolePage.Surface;
  ServerRadio.Left := ScaleX(16);
  ServerRadio.Top := ScaleY(16);
  ServerRadio.Width := ScaleX(400);
  ServerRadio.Caption := '🖥️ Servidor Principal (Caja 1 / Central)';
  ServerRadio.Font.Style := [fsBold];
  ServerRadio.Checked := True;

  HelpText := TNewStaticText.Create(RolePage);
  HelpText.Parent := RolePage.Surface;
  HelpText.Left := ScaleX(36);
  HelpText.Top := ScaleY(40);
  HelpText.Width := ScaleX(420);
  HelpText.WordWrap := True;
  HelpText.Caption := 'Configura la PC central con la Base de Datos PostgreSQL, scraper BCV y Bot de WhatsApp. Utiliza PostgreSQL existente o descargado.';

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
