# Offline / LAN Exams — Runbook

How to run an exam in a hall with no internet, and get the results into the school's records
afterwards. Implements PRD §3.4 and §4.3.

For setup and day-to-day operation of the hall machine itself — prerequisites, environment
variables, the LAN API surface, and troubleshooting — see
[`../local-server/README.md`](../local-server/README.md).

The shape of it:

```
BEFORE (needs internet)          EXAM DAY (no internet)        AFTER (needs internet)
─────────────────────────        ──────────────────────        ──────────────────────
provision the hall server   →    students sit the exam    →    push results to cloud
pull the exam onto it            on the hall LAN               results appear in dashboard
```

---

## 1. Provision the hall server (once per machine)

A **School Admin** creates the device record and receives its key.

```bash
curl -s -b jar.txt -X POST http://localhost:3000/api/local-servers \
  -H 'content-type: application/json' \
  -d '{"name":"Exam Hall A"}'
```

The response carries the plaintext key **once**:

```json
{ "localServer": { "id": "clx...", "name": "Exam Hall A" },
  "deviceKey": { "value": "cbt_dev_7Kq2...", "warning": "Copy this now — ..." } }
```

Only a SHA-256 digest is stored, so the key cannot be re-read later. If it is lost:

```bash
curl -s -b jar.txt -X POST http://localhost:3000/api/local-servers/<id>/rotate-key
```

Rotation is immediate — the old key stops working at once. **Push any pending results
before rotating**, or the device will not be able to upload them until it is reconfigured.

To revoke a lost or retired machine without rotating, deactivate it. It stops syncing on its
next request:

```bash
curl -s -b jar.txt -X PATCH http://localhost:3000/api/local-servers/<id> \
  -H 'content-type: application/json' -d '{"isActive":false}'
```

## 2. Set up the hall machine (once)

```bash
cd local-server
cp .env.example .env      # set CLOUD_BASE_URL and CLOUD_DEVICE_KEY
npm install
npm run setup             # generates the client and creates exam-hall.db
```

`npm run setup` applies the migrations in `local-server/prisma/migrations`. A database
created by an older release with `prisma db push` is baselined automatically the first
time the new server starts, so an existing hall machine does not need to be reset. The cloud is
the system of record — with one exception, covered in step 5.

**Do this while still online.** `prisma generate` downloads engine binaries.

## 3. Stage the exam (needs internet, do it in advance)

The exam must be **published** and its mode must be `OFFLINE_LAN` or `HYBRID`. An `ONLINE`
exam is refused — staging copies its answer key onto a hall machine, which shouldn't happen
for a paper nobody asked to run offline.

```bash
npm run pull -- --exam=<examId>
```

This downloads the exam, its questions, **the answer key**, and the roster for that exam's
class level **including PINs** — everything needed to run and grade with no connectivity.

Watch the clock warning. Once offline, this machine's clock is the sole authority on every
exam deadline; a hall PC with a dead CMOS battery can hand out an extra hour or cut students
off early. Fix any drift before exam day.

Re-running `pull` picks up a corrected paper, but it **refuses** to run while unpushed
results are on the machine — re-staging could invalidate them. Push first.

## 4. Exam day (no internet needed)

```bash
npm run serve
```

It prints the LAN addresses to give students:

```
  Student devices should open:
    http://192.168.1.42:4000
```

Students log in with **registration number + PIN** — the same credentials as online,
validated against the cached roster. The school slug is not asked for; the machine serves one
school.

The exam behaves identically to online, and not by coincidence: the question shuffle, the
timing rules, the grading, and the option-belongs-to-question check are all *the same code*
as the cloud (`lib/core/grading-rules.ts`, `lib/timing.ts`, `lib/auth/student-credentials.ts`).
Because the shuffle is seeded from `studentId + examId`, a student sees the same question
order they would have seen online, and a teacher can reproduce it from the cloud months
later.

Check the hall server is reachable from a student device:

```
http://<lan-ip>:4000/api/health
```

**Note:** the student-facing browser UI is not part of this milestone — the endpoints above
are the API a client calls. See "Not included" below.

## 5. Push the results (when internet returns)

```bash
npm run push
```

This first closes any sitting whose time expired but whose machine was switched off
mid-exam — an unfinished session is never uploaded, so without this sweep that student's work
would be stranded here permanently.

Then it uploads. The cloud:

- keys on `(localServerId, localId)`, so **re-running is safe** — anything already held comes
  back `ALREADY_SYNCED`
- **re-grades every sitting from the submitted selections** using its own answer key. A score
  claimed by the device is ignored entirely; a hall PC is a machine in a school office, and
  offline marks would otherwise be only as trustworthy as the least-secured one
- rejects individual sittings it cannot accept (stale paper, wrong class) **without failing
  the rest of the batch**

Rejected sittings stay on the machine with a reason, for a person to look at. Re-running will
not change the outcome.

Check what is still owed at any time:

```bash
npm run status
```

> **Never wipe or re-image a hall machine while `npm run status` reports sittings awaiting
> upload.** Those results exist nowhere else. Everything else on the device is a copy the
> cloud can regenerate.

## 6. Confirm in the dashboard

```bash
curl -s -b jar.txt "http://localhost:3000/api/exams/<examId>/sessions?status=SUBMITTED"
```

Synced sittings carry `localServerId` and `syncedAt`, so a result recorded in a hall is
distinguishable from one taken online — the provenance PRD §3.4 step 6 asks for. This is also
why deleting a local server is refused once sessions reference it: deletion would strip that
audit trail. Deactivate instead.

---

## Security: what a hall machine holds

Staging puts two things on the device that the cloud serves nowhere else:

1. **The answer key** (`Option.isCorrect`) — it must grade offline.
2. **Plaintext PINs for one class** — offline login compares against them.

Both are inherent to offline operation, and the schema sanctions the PIN cache explicitly:
the PIN is a throwaway exam credential, deliberately not a real account password, precisely
so caching it is survivable. Exposure is bounded to **one exam and one class level per
pull**, never a whole school.

What follows from that:

- Treat the hall machine as physically sensitive for as long as it holds a staged exam.
- Deactivate or rotate a device's key when it leaves the school's control.
- A leaked device key cannot reach another school's data — the sync endpoints derive their
  tenant scope from the device record, the same mechanism that isolates staff and students.

## Verifying the whole path

```bash
# cloud
npm run db:seed        # also provisions a demo "Exam Hall A" with a fixed dev key
npm run dev
npm run smoke          # M1 regression
npm run smoke-sync     # M2: provisioning, pull, push, re-grading, idempotency

# hall machine
cd local-server && npm run setup
npm run pull -- --exam=<examId>
npm run serve
npm run push
npm run status         # should report everything synced
```

`smoke-sync` simulates a device over HTTP and asserts the guarantees this document relies on,
including that a device-claimed score is ignored and that a repeated push creates no
duplicate.

## Not included in this milestone

- **The student-facing browser UI.** The LAN API is complete; rendering it is not built.
- **Automatic background sync.** PRD §6 leaves the trigger open; `push` is a manual command.
  The endpoint is idempotent and resumable, so scheduling it later needs no server change.
- **Multi-hall coordination.** Each device is independent. Two halls can run the same exam;
  their results reconcile separately and correctly.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `401` on pull/push | Key wrong, rotated, or the device was deactivated. Rotate and update `.env`. |
| `EXAM_NOT_PUBLISHED` | Publish the exam first. |
| Pull refused, mode `ONLINE` | Change the exam's mode to `OFFLINE_LAN` or `HYBRID`. |
| Pull refuses: unpushed results | Run `npm run push` first — re-staging could invalidate them. |
| Students can't reach the server | Same Wi-Fi/subnet? Try `/api/health` from a device. Check the host firewall on the port. |
| Push says `REJECTED: ... outdated copy of the paper` | The exam was edited after staging. The sitting needs manual review; its answers no longer match the cloud's questions. |
| Clock warning on pull | Fix the machine's system clock before exam day — it governs every deadline offline. |
