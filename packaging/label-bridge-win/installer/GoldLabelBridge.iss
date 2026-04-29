; Inno Setup 6 — compile after packaging/label-bridge-win/scripts/build-release.ps1
; Example:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\label-bridge-win\installer\GoldLabelBridge.iss

#define MyAppName "Gold Label Bridge"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Gold"

[Setup]
AppId={{F3E2D1C0-BA98-7654-3210-FEDCBA987654}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\GoldLabelBridge
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\output
OutputBaseFilename=GoldLabelBridge-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\GoldLabelBridge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\Start Gold Label Bridge.bat"; WorkingDir: "{app}"
Name: "{group}\README"; Filename: "{app}\README-USER.txt"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\Start Gold Label Bridge.bat"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\Start Gold Label Bridge.bat"; Description: "Start the label bridge now"; Flags: postinstall shellexec skipifsilent unchecked
