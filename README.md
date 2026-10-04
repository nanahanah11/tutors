# APU Tutorial Attendance Management System

Internal web application for recording **SDM (`CT046-3-2-SDM`)** and **ISWE (`AAPP003-4-2-ISWE`)** tutorial attendance at Asia Pacific University (APU), Malaysia. It implements [PRD v1.2](PRD.md).

- **Tutors** (May, Amir, Arya, Latifa) enter a private code (`MAY###`), pick an assigned class, date and time, and mark each student Present or Absent. They can edit their own record only on the class date, in Malaysia time.
- **Ms Aida (lecturer)** reviews every saved session on one dashboard, corrects records, exports CSV, and tracks which sessions are still **Pending APSpace Entry** and which are **Keyed into APSpace**.

APSpace entry stays manual. The system does not connect to APSpace (PRD §5).

---

## Architecture

```text
Browser (React + TypeScript + Vite, hosted on Netlify)
 ├── Tutor screens ──► Netlify Functions (/api/tutor-auth/*, /api/tutor/*)
 │                       • validate tutor code (scrypt hash + pepper), rate limiting
 │                       • HttpOnly, SameSite=Strict session cookie (4 h max, 60 min idle, browser-session)
 │                       • tutor id taken from the signed token only
 │                       └─► Supabase Postgres via service role → api_tutor_* SQL functions
 │                             (assignment scoping, roster completeness, duplicate guard,
 │                              same-day edit rule in Asia/Kuala_Lumpur, audit)
 └── Lecturer screens ─► Supabase Auth (email/password) + PostgREST with Row Level Security
                          • lecturer_* SQL functions for corrections, APSpace status, import
                          • /api/admin/tutors (Netlify Function) to generate or regenerate tutor codes
```

The security rules live at the server and database boundary (PRD §15.4, BR-021). Hiding a button in the browser is never the only protection:

| Rule | Where it is enforced |
|---|---|
| No data until a valid code or lecturer login | Tutor API requires a signed cookie. Every table has RLS, and `anon` has no grants. |
| Tutor sees only assigned classes | `app.tutor_is_assigned()` in every `api_tutor_*` function |
| Every student marked; one record per student | Payload validation in SQL plus `unique (attendance_session_id, student_id)` |
| Duplicate session guard | `unique (tutorial_group_id, class_date, class_time)` |
| Same-day tutor edits only | `class_date = (now() at time zone 'Asia/Kuala_Lumpur')::date` checked in SQL |
| Tutors cannot change APSpace status or student data | The tutor API rejects unknown fields (`FORBIDDEN_FIELD`). There is no SQL path for it. |
| No hard deletes | No `DELETE` grants. Records are soft-deactivated. `audit_logs` is append-only (trigger). |
| Tutor codes never stored in plaintext | Only `scrypt$…` hashes are stored. The hash column cannot be read by browser roles. |
| Secrets never in the browser | Only `VITE_SUPABASE_URL` and the publishable key are bundled. CI checks `dist/`. |

## Repository layout

```text
src/
  shared/            pure domain logic used by the browser, the functions and the scripts
                     (tutor code format, Malaysia time, roster sort/search/counts, import parser, CSV)
  pages/             AccessPage, TutorDashboard, NewAttendancePage, TutorSessionPage,
                     LecturerLogin, LecturerDashboard, AttendanceDetailPage, admin/*
  components/        attendance marker, save confirmation, roster notice, layouts, UI parts
  services/          tutorApi (Netlify Functions), lecturerApi (Supabase)
  LecturerApp.tsx    lazy-loaded lecturer area (tutor devices never download it)
netlify/functions/
  validate-tutor-code.ts   POST /api/tutor-auth/login | logout
  tutor-attendance.ts      /api/tutor/*  (me, roster, sessions, lookup, create, same-day update)
  admin-tutors.ts          /api/admin/tutors (lecturer JWT: list, create tutor, regenerate code)
  _lib/                    handlers, token signing, code hashing, rate limiting, Supabase backend
supabase/
  migrations/        schema, RLS and grants, audit triggers, views, attendance API functions
  seed.sql           modules, tutorial groups, 4 tutor profiles and initial assignments (no personal data, no codes)
  dev/               fictitious students for local testing only
  tests/             SQL authorization and business-rule tests + local runner
scripts/             bootstrap (lecturer account), generate-tutor-codes, import-roster
tests/               unit, authorization, UI, integration (handlers → SQL), browser E2E
```

## Initial configuration (PRD §6.1)

| Tutorial class | Tutor |
|---|---|
| `CT046-3-2-SDM-T-39`, `CT046-3-2-SDM-T-40` | May |
| `CT046-3-2-SDM-T-41` | Latifa |
| `AAPP003-4-2-ISWE-T-7` | Amir |
| `AAPP003-4-2-ISWE-T-9` | Arya |
| `CT046-3-2-SDM-T-38`, `CT046-3-2-SDM-T-42`, `AAPP003-4-2-ISWE-T-8` | Unassigned, lecturer-controlled |

Student rosters are **not** in this repository, because they are personal data. Import the supplied workbooks with the CLI or the Import screen. A row with no tutorial group is always excluded and reported.

---

## Deployed instance

| Item | Value |
|---|---|
| Supabase project | `apu-tutorial-attendance` (`gywcohjrtnctpbyfrcyy`, region ap-southeast-1) – migrations, seed and the initial rosters are applied |
| Netlify site | `apu-tutorial-attendance` → https://apu-tutorial-attendance.netlify.app |
| Netlify env vars set | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `TUTOR_SESSION_SECRET`, `TUTOR_CODE_PEPPER` |
| Still to set by the project owner | `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys). It cannot be read through the Supabase connector, so it is never handled by Claude. |

## Deployment (PRD §32.1 go-live checklist)

### 1. Supabase

1. Create a Supabase project (production, plus a separate development project for UAT).
2. Apply the migrations and seed:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push            # applies supabase/migrations/*
   psql "<connection string>" -f supabase/seed.sql
   ```
   You can also paste each migration file, then `seed.sql`, into the SQL editor in order.
3. In **Authentication → Providers → Email**, keep email/password enabled and **disable sign-ups**.

### 2. Environment

Copy `.env.example` to `.env` (never commit it). Fill in:

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Netlify + local | Project URL (browser-safe) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Netlify + local | Publishable/anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify (Functions scope) + local scripts | **Server only** |
| `TUTOR_SESSION_SECRET` | Netlify (Functions scope) | **Server only**, 32+ random characters (`openssl rand -base64 48`) |
| `TUTOR_CODE_PEPPER` | Netlify (Functions scope) + local scripts | **Server only**, 16+ random characters. Keep it stable: changing it invalidates every tutor code. |

### 3. Lecturer account, tutor codes, rosters

```bash
npm ci
npm run bootstrap -- --email <ms-aida-email> --name "Ms Aida"   # creates Auth user + lecturer profile
npm run codes:generate                                            # prints MAY###, AMIR###, ARYA###, LATIFA### ONCE
npm run import:roster -- CT046_Student_List.xlsx AAPP003_ISWE_Student_List.xlsx            # preview
npm run import:roster -- CT046_Student_List.xlsx AAPP003_ISWE_Student_List.xlsx --commit   # write
```

`import:roster` checks the per-group counts against the PRD (SDM 38/39/40/41/42 = 44/35/42/46/11, ISWE 7/8/9 = 40/40/39). It also reports the one excluded ungrouped SDM row. Share each tutor code privately with that tutor only. Ms Aida can regenerate a code at any time under **Tutors & Codes**.

### 4. Netlify

1. Create a site from this Git repository. `netlify.toml` sets the build (`npm run build` → `dist`), the functions directory, the SPA redirect and the security headers (CSP, HSTS, frame denial).
2. Add the environment variables above. Scope the three server-only secrets to **Functions**.
3. Deploy. Use deploy previews and the development Supabase project for UAT.

### 5. Verify (checklist items 10–15)

- Log in as Ms Aida. **Tutorial Groups** should show the expected active counts and assigned tutors.
- As each tutor, enter the code and confirm only the assigned classes appear.
- Try 6 wrong codes. The 6th attempt is blocked for 15 minutes.
- Save a test attendance and confirm it appears on the dashboard. Edit it the same day. Mark it Keyed into APSpace.

---

## Operating guide

### Tutors
1. Open the site and enter your tutor code, for example `MAY123`.
2. Select **New Attendance**, then choose the **Class / Subject**, the **Class Date** (defaults to today; future dates are blocked) and the **Class Time**.
3. Mark every student **Present** or **Absent**. You can use **Mark All Present** and then change individual students. Search by name or TP number; your selections stay when you clear the search.
4. **Save Attendance** stays disabled until every student is marked. Check the confirmation summary and absent list, then select **Confirm Save**.
5. You can reopen and edit your record until **11:59 PM Malaysia time on the class date**. After that it is read-only, so contact Ms Aida.
6. **Any changes related to the student list, please let Ms Aida know ASAP.** Tutors cannot add, remove or move students.

### Ms Aida
- **Dashboard**: newest sessions first. Filter by module, group, tutor, date range and APSpace status. Rows still pending APSpace entry have an amber marker. Select several pending rows to mark them keyed in together. **Export CSV (filtered)** downloads student-level rows.
- **Session detail**: metadata (tutor, tutor profile ID, saved and updated times), totals, the full roster with remarks, **Edit / Correct**, **Export CSV**, **Print**, **Mark as Keyed into APSpace** (or revert) and the audit trail.
- **Students / Tutorial Groups / Modules**: maintain master data. Deactivate or archive instead of deleting; history is kept.
- **Tutors & Codes**: add tutors, generate or regenerate codes (each code is shown once), deactivate tutors, and assign tutors to classes, including temporary cover.
- **Import**: upload an XLSX or CSV file, review the file check and server preview, then commit. **Audit Log**: every attendance, roster, assignment and code change.

### Semester rollover (PRD §32.3)
Create or activate modules and groups. Import the new roster with *Deactivate enrolments for students not in this file*, then update tutor assignments. Old sessions remain.

---

## Development & testing

```bash
npm ci
npm run dev            # frontend only (Vite)
npm run dev:netlify    # frontend + functions (requires Netlify CLI and .env)

npm run typecheck
npm test               # unit, authorization (fake backend), UI component tests
npm run test:db        # SQL tests on a local PostgreSQL + handler→SQL integration tests
npm run test:e2e       # full browser E2E: local Postgres + PostgREST + real handlers + Chromium
```

`test:db` and `test:e2e` only need a local PostgreSQL server (`PGHOST`/`PGUSER` are respected). `test:e2e` downloads PostgREST into `node_modules/.cache` on first run. It also runs the `import-roster` and `generate-tutor-codes` scripts against the same stack. CI (`.github/workflows/ci.yml`) runs all of these.

Test coverage against PRD §26:
- **Unit**: code format, A–Z sorting, name/TP search, counters, required fields, the Malaysia-time edit window, XLSX/CSV parsing with ungrouped-row exclusion, APSpace labels, CSV escaping.
- **Authorization**: unvalidated visitor, invalid code, rate limiting, forged token, idle and absolute expiry, unassigned roster or create, another tutor's session, same-day vs next-day edit, APSpace change refused, lecturer corrections and RLS for `anon`, non-lecturer and lecturer.
- **E2E**: all six critical flows in §26.4.

## Decisions taken for PRD §34 open items

| Item | Decision |
|---|---|
| Tutor session length | 4 hours maximum, 60 minutes idle timeout, and ends when the browser closes. Configurable with `TUTOR_SESSION_MAX_HOURS` and `TUTOR_SESSION_IDLE_MINUTES`. |
| Tutor history visibility | Own records only |
| Mark All Present | Enabled. Individual students can still be changed. |
| Unmapped classes (SDM-T-38, SDM-T-42, ISWE-T-8) | Unassigned until Ms Aida assigns a tutor |
| Remarks | Optional per-student remark, which tutors can add while marking and Ms Aida can edit |

## Privacy

Student names and TP numbers are personal data. No analytics are used, and `robots.txt` blocks indexing. Rosters and codes are git-ignored (`*.xlsx`, `tutor-codes*.txt`). Rate-limit records store a SHA-256 hash of the client IP, never the raw IP, and are pruned after 7 days. Confirm retention against APU policy and the Malaysian PDPA before go-live (PRD §21.4).
