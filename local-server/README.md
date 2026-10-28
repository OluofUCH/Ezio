# CBT Hall Server

Runs an exam in a hall with **no internet**, then uploads the results when connectivity
returns. One school-owned Windows PC serves one hall on the school network.

The installed app is self-service: the School Admin creates the hall on the dashboard,
receives a one-time code, and the wizard on the hall PC exchanges it for its device key.
Nobody edits a 48-character secret into a config file.

```
OFFICE (internet)                         HALL (no internet)
create hall + one-time code  â”€â”€â”€â”€â”€â”€â”€â”€â–º    paste code into localhost/setup
                                          set invigilator PIN
download published paper(s)  â”€â”€â”€â”€â”€â”€â”€â”€â–º    students open the LAN address
                                          exam runs; results grade locally
afterwards, press Upload results  â—„â”€â”€â”€â”€  admin console
```

See [`../packaging/windows/README.md`](../packaging/windows/README.md) for the installer.

---

## The one rule

> **Never wipe, re-image, or hand back a hall machine while the admin console shows
> sittings awaiting upload.** Those results exist nowhere else in the world. Everything
> else on the machine â€” the staged exam, answer key and roster â€” is a copy the cloud can
> regenerate.

## Install and pair (pilot)

1. On the school dashboard, open **Local servers** and create the hall.
2. Copy the one-time setup code (valid 30 minutes, single use).
3. Use **Download Windows installer** in the pairing dialog, then install
   `CBT-Hall-Server-Setup-*.exe` on the hall PC. The service starts automatically.
4. Open `http://localhost:4000/setup`.
5. Paste the setup code and cloud address shown in the dashboard, claim the hall, and
   choose a 6â€“8 digit invigilator PIN.
6. Download the published `OFFLINE_LAN` or `HYBRID` paper(s) while the PC has internet.
7. Give students the LAN address shown by the wizard, e.g. `http://192.168.1.20:4000`.
8. After the exam, open `http://localhost:4000/admin`, sign in, and press **Upload results**.

The pairing step shows the **Cloud address** field. Set it to the school platform URL
that issued the setup code before claiming.

## Local-only surfaces

- `/setup` and `/api/setup/*` â€” loopback only. Pairing, PIN, paper download.
- `/admin` and `/api/admin/*` â€” loopback only, PIN session cookie. Push, pull, backup,
  timeout sweep, auto-upload.
- `/` and `/api/student/*` â€” reachable on the hall LAN. Student login and exam only.

The old unauthenticated `/api/invigilator/sweep-expired` still exists for compatibility
but is now loopback-only; the admin console is the normal path.

## Data and backups

- Config: `C:\ProgramData\CBT\config.json` (device key, school, PIN hash, auto-upload).
- Database: `C:\ProgramData\CBT\exam-hall.db`.
- Backups: `C:\ProgramData\CBT\backups`, created with SQLite `VACUUM INTO`.
- Logs: `C:\ProgramData\CBT\logs`.

The installer leaves `C:\ProgramData\CBT` in place on uninstall. Back it up or delete it
manually only after confirming there is nothing left to upload.

## Development

```powershell
cd local-server
npm install
$env:LOCAL_DATABASE_URL='file:C:/path/to/local-server/data/exam-hall.db'
npm run setup          # prisma generate + apply SQLite migrations
npm run serve          # http://localhost:4000
npm run dev:web        # Vite UI at http://localhost:5173, proxying /api
```

Build a production bundle:

```powershell
npm run build          # dist/web + dist/server/server.mjs
npm start
```

### Why `@/*` points at the cloud repo

`local-server/tsconfig.json` maps `@/*` to `../*`, so this server imports the cloud's exam
rules by the same specifier the cloud uses: `@/lib/timing`,
`@/lib/core/grading-rules`, `@/lib/auth/student-credentials`, `@/lib/errors`,
`@/lib/core/domain`, `@/lib/sync/payload`.

Offline and online grading therefore cannot drift â€” they execute the same functions.
Only modules with no runtime dependency on the cloud's Postgres Prisma client, `next/*`
or a database may be imported this way. The packaged server bundles these modules, so the
installed app does **not** need the whole repository present.

## Sync semantics

- **Pull** downloads one exam, its questions, the answer key and the roster for that class
  level, including exam PINs. It refuses to stage while completed sittings are unpushed.
- **Push** sends only closed sittings (`SUBMITTED`, `AUTO_SUBMITTED`, `FLAGGED`), never an
  `IN_PROGRESS` one. The cloud re-grades from selections; a device-supplied score is
  ignored.
- Every sitting has a local id. `(localServerId, localId)` is the idempotency key, so a
  retried push cannot create a duplicate.
- A higher `syncVersion` replaces a prior push. Equal or lower is a no-op.
- Auto-upload is optional. It runs every five minutes only when enabled, internet is
  available, and no exam is currently in progress. The manual button always works.

Unsynced sittings are the only irreplaceable data. The admin console surfaces the count
and the backup button exists for exactly that reason.

