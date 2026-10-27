# CBT Hall Server â€” Windows packaging (pilot)

This folder builds the self-service hall server for a school-owned Windows PC. The
installer is intentionally **unsigned** for the pilot. It is suitable for controlled
schools that can verify the checksum, not for anonymous public download.

## What the installer does

- Installs to `C:\Program Files\CBT Hall Server`.
- Bundles Node 22 (`node\node.exe`), the compiled server, the React student/admin UI,
  the generated Prisma client, and an empty SQLite database template.
- Installs a Windows service named **CBT Hall Server** with WinSW. The service starts
  automatically on boot.
- Stores data in `C:\ProgramData\CBT\` (config, database, backups, logs). This survives
  uninstalling/reinstalling the application.
- Opens TCP 4000 for **private networks only** in Windows Firewall.
- Adds Start Menu and desktop shortcuts for the localhost setup wizard.

The service requires no internet during an exam. Internet is used only for pairing,
downloading papers, uploading results, and rotating a key.

## Build

Prerequisites:

- Node.js 22 and npm on the build machine.
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) with `iscc.exe` on `PATH`.
- Internet access to download `node.exe` and WinSW on the first build.

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1
```

Outputs:

- `packaging\windows\stage\` â€” staging tree.
- `dist\installer\CBT-Hall-Server-Setup-0.1.0.exe`
- `dist\installer\SHA256SUMS.txt`

If Inno Setup is not installed, run the staging step with `-SkipInstaller`, install
Inno Setup, then run:

```powershell
iscc.exe packaging\windows\cbt-hall-server.iss
```

## Pilot install steps

1. Copy the installer and `SHA256SUMS.txt` to the hall PC.
2. Verify the hash in PowerShell:

   ```powershell
   Get-FileHash .\CBT-Hall-Server-Setup-0.1.0.exe -Algorithm SHA256
   ```

3. Run the installer as an administrator. Windows SmartScreen will warn because the
   binary is unsigned. Confirm the publisher is the expected file/hash before choosing
   **More info â†’ Run anyway**. Never install a file whose hash does not match.
4. The setup wizard opens at `http://localhost:4000/setup`.
5. On the school dashboard, create the hall under **Local servers**, copy its one-time
   code, and enter it in the wizard.
6. Set the invigilator PIN.
7. Download the published LAN/HYBRID paper(s) while the PC has internet.
8. Give students the address shown by the wizard, e.g. `http://192.168.1.20:4000`.
9. After the exam, open `http://localhost:4000/admin`, sign in with the PIN, and press
   **Upload results**. Confirm the count before wiping or reimaging the PC.

The pairing step always shows the **Cloud address** field. Set it to the school
platform URL that issued the setup code before claiming.

## SmartScreen / antivirus

The pilot build is not code-signed, so Windows may show "Windows protected your PC".
This is expected. Publish the SHA256 alongside the installer and instruct schools to
verify it. For wider distribution, sign both the installer and `CBT-Hall-Server.exe`
with an Authenticode certificate; nothing in the build pipeline prevents that.

## Data retention

`C:\ProgramData\CBT\exam-hall.db` is the only copy of sittings that have not yet been
uploaded. The admin console creates consistent backups with `VACUUM INTO` under
`C:\ProgramData\CBT\backups`. Do not reimage a hall PC until the admin console shows
zero sittings awaiting upload.

## Uninstall

Uninstall removes the service and program files. `C:\ProgramData\CBT` is deliberately
left behind. Back it up or delete it manually after confirming there is nothing to
upload.

