; CBT Hall Server — Windows installer (Inno Setup 6)
;
; This is the unsigned pilot installer. It installs the server as a Windows service
; via WinSW, opens the LAN port, and launches the localhost setup wizard.
;
; Build:
;   powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1
;   iscc packaging\windows\cbt-hall-server.iss
;
; The staging folder is produced by build.ps1. Do not run iscc without it.

#define AppName "CBT Hall Server"
#define AppVersion "0.1.1"
#define AppPublisher "CBT Platform"
#define ServiceExe "CBT-Hall-Server.exe"
#define ServiceId "CBT-Hall-Server"

[Setup]
AppId={{9D5E4F5E-6C2F-4E4C-8B7A-3D1A2C5B7E10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\CBT Hall Server
DefaultGroupName=CBT Hall Server
DisableProgramGroupPage=yes
OutputDir=..\..\dist\installer
OutputBaseFilename=CBT-Hall-Server-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "open-setup.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion
; The database template is generated once at build time and never overwritten on upgrade.
Source: "stage\seed\exam-hall.db"; DestDir: "{commonappdata}\CBT"; DestName: "exam-hall.db"; Flags: onlyifdoesntexist uninsneveruninstall

[Dirs]
Name: "{commonappdata}\CBT"
Name: "{commonappdata}\CBT\backups"
Name: "{commonappdata}\CBT\logs"

[Icons]
Name: "{group}\Open Setup Wizard"; Filename: "http://localhost:4000/setup"
Name: "{group}\Open Admin Console"; Filename: "http://localhost:4000/admin"
Name: "{group}\Student Portal Address"; Filename: "http://localhost:4000"
Name: "{group}\Uninstall CBT Hall Server"; Filename: "{uninstallexe}"
Name: "{commondesktop}\CBT Hall Server Setup"; Filename: "http://localhost:4000/setup"

[Run]
Filename: "{app}\winsw\{#ServiceExe}"; Parameters: "install"; Flags: runhidden waituntilterminated
Filename: "{app}\winsw\{#ServiceExe}"; Parameters: "start"; Flags: runhidden waituntilterminated
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""CBT Hall Server"" dir=in action=allow protocol=TCP localport=4000 profile=private"; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\tools\open-setup.ps1"""; Description: "Open the setup wizard"; Flags: runhidden waituntilterminated postinstall skipifsilent

[UninstallRun]
Filename: "{app}\winsw\{#ServiceExe}"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopCbtHall"
Filename: "{app}\winsw\{#ServiceExe}"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveCbtHall"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CBT Hall Server"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveCbtFirewall"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExistingService: String;
  ResultCode: Integer;
begin
  Result := '';
  ExistingService := ExpandConstant('{app}\winsw\{#ServiceExe}');

  { Upgrades must remove the old service before its wrapper and XML are replaced. }
  if FileExists(ExistingService) then
  begin
    Exec(ExistingService, 'stopwait', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ExistingService, 'uninstall', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  { Avoid accumulating duplicate firewall rules across upgrades. }
  Exec(
    ExpandConstant('{sys}\netsh.exe'),
    'advfirewall firewall delete rule name="CBT Hall Server"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode
  );
end;
