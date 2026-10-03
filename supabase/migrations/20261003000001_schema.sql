-- =============================================================================
-- APU Tutorial Attendance Management System – core schema (PRD v1.2 §12, §13, §22)
-- =============================================================================
-- Conventions
--   * All timestamps are timestamptz (UTC in storage). Business-date rules use
--     Asia/Kuala_Lumpur via app.my_today() (PRD §6 assumption 10, FR-SAVE-010).
--   * Historical data is never hard-deleted (BR-012, BR-017): every master table
--     carries is_active and there are no DELETE grants on attendance tables.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is 'Private helper functions for the attendance system (not exposed through PostgREST).';

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('lecturer', 'tutor');
create type public.apspace_status as enum ('pending', 'keyed_in');
create type public.attendance_status as enum ('present', 'absent');

-- ---------------------------------------------------------------------------
-- Time helpers – Malaysia time is the single source of truth for "today"
-- ---------------------------------------------------------------------------
create or replace function app.my_now()
returns timestamp
language sql stable
as $$ select (now() at time zone 'Asia/Kuala_Lumpur') $$;

create or replace function app.my_today()
returns date
language sql stable
as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (§12.2) – 1 lecturer + tutor profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique references auth.users (id) on delete set null,
  full_name         text not null check (length(btrim(full_name)) > 0),
  role              public.user_role not null,
  tutor_code_prefix text,
  tutor_code_hash   text,
  tutor_code_updated_at timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_tutor_code_required check (
    role <> 'tutor' or (tutor_code_prefix is not null and tutor_code_hash is not null)
  ),
  constraint profiles_lecturer_has_auth check (
    role <> 'lecturer' or auth_user_id is not null
  ),
  -- Prefix = tutor's first name in uppercase letters (FR-AUTH-003, §13.3)
  constraint profiles_tutor_code_prefix_format check (
    tutor_code_prefix is null or tutor_code_prefix ~ '^[A-Z]{2,20}$'
  )
);
comment on column public.profiles.tutor_code_hash is
  'scrypt hash of the full tutor access code. Never readable by browser roles (FR-AUTH-006).';

-- One active tutor per prefix so a code always resolves to exactly one profile (BR-001)
create unique index profiles_active_prefix_uq
  on public.profiles (tutor_code_prefix) where (is_active and role = 'tutor');
create unique index profiles_tutor_code_hash_uq
  on public.profiles (tutor_code_hash) where (tutor_code_hash is not null and is_active);
create index profiles_tutor_code_prefix_idx on public.profiles (tutor_code_prefix);

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- modules (§12.3)
-- ---------------------------------------------------------------------------
create table public.modules (
  id              uuid primary key default gen_random_uuid(),
  module_code     text not null unique check (length(btrim(module_code)) > 0),
  short_name      text not null check (length(btrim(short_name)) > 0),
  module_name     text not null check (length(btrim(module_name)) > 0),
  intake_semester text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.modules.short_name is 'Short label shown to tutors, e.g. SDM / ISWE.';

create trigger modules_touch before update on public.modules
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tutorial_groups (§12.4)
-- ---------------------------------------------------------------------------
create table public.tutorial_groups (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules (id),
  group_number  text not null check (group_number ~ '^[0-9]+$'),
  tutorial_code text not null unique check (length(btrim(tutorial_code)) > 0),
  display_name  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tutorial_groups_module_group_uq unique (module_id, group_number)  -- BR-004
);
create index tutorial_groups_module_group_idx on public.tutorial_groups (module_id, group_number);

create trigger tutorial_groups_touch before update on public.tutorial_groups
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- students (§12.5)
-- ---------------------------------------------------------------------------
create table public.students (
  id         uuid primary key default gen_random_uuid(),
  student_id text not null unique check (student_id = upper(btrim(student_id)) and length(student_id) > 0), -- BR-003
  full_name  text not null check (length(btrim(full_name)) > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_student_id_idx on public.students (student_id);
create index students_full_name_idx on public.students (lower(full_name));

create trigger students_touch before update on public.students
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- group_enrolments (§12.6)
-- ---------------------------------------------------------------------------
create table public.group_enrolments (
  id                uuid primary key default gen_random_uuid(),
  tutorial_group_id uuid not null references public.tutorial_groups (id),
  student_id        uuid not null references public.students (id),
  is_active         boolean not null default true,
  enrolled_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint group_enrolments_uq unique (tutorial_group_id, student_id)
);
create index group_enrolments_group_active_idx on public.group_enrolments (tutorial_group_id, is_active);
create index group_enrolments_student_idx on public.group_enrolments (student_id);

create trigger group_enrolments_touch before update on public.group_enrolments
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tutor_group_assignments (§12.7)
-- ---------------------------------------------------------------------------
create table public.tutor_group_assignments (
  id                uuid primary key default gen_random_uuid(),
  tutor_profile_id  uuid not null references public.profiles (id),
  tutorial_group_id uuid not null references public.tutorial_groups (id),
  is_active         boolean not null default true,
  is_temporary_cover boolean not null default false,  -- FR-TUT-004
  note              text,
  assigned_by       uuid references public.profiles (id),
  assigned_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- "Unique active assignment should be logically enforced for the tutor/group combination."
create unique index tutor_group_assignments_active_uq
  on public.tutor_group_assignments (tutor_profile_id, tutorial_group_id) where is_active;
create index tutor_group_assignments_tutor_active_idx on public.tutor_group_assignments (tutor_profile_id, is_active);
create index tutor_group_assignments_group_active_idx on public.tutor_group_assignments (tutorial_group_id, is_active);

create trigger tutor_group_assignments_touch before update on public.tutor_group_assignments
  for each row execute function app.touch_updated_at();

-- Only tutor profiles can be assigned to groups
create or replace function app.check_assignment_role()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.tutor_profile_id and p.role = 'tutor') then
    raise exception 'Only tutor profiles can be assigned to tutorial groups' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tutor_group_assignments_role before insert or update on public.tutor_group_assignments
  for each row execute function app.check_assignment_role();

-- ---------------------------------------------------------------------------
-- attendance_sessions (§12.8)
-- ---------------------------------------------------------------------------
create table public.attendance_sessions (
  id                  uuid primary key default gen_random_uuid(),
  module_id           uuid not null references public.modules (id),
  tutorial_group_id   uuid not null references public.tutorial_groups (id),
  tutor_profile_id    uuid not null references public.profiles (id),
  tutor_name_snapshot text not null,
  class_date          date not null,
  class_time          time not null,
  saved_at            timestamptz not null default now(),
  last_tutor_edit_at  timestamptz,
  last_lecturer_edit_at timestamptz,
  apspace_status      public.apspace_status not null default 'pending',  -- FR-APS-001
  apspace_keyed_at    timestamptz,
  apspace_keyed_by    uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- FR-SES-009 duplicate guard
  constraint attendance_sessions_duplicate_guard unique (tutorial_group_id, class_date, class_time),
  constraint attendance_sessions_keyed_consistency check (
    (apspace_status = 'pending' and apspace_keyed_at is null and apspace_keyed_by is null)
    or (apspace_status = 'keyed_in' and apspace_keyed_at is not null and apspace_keyed_by is not null)
  )
);
create index attendance_sessions_class_date_idx on public.attendance_sessions (class_date);
create index attendance_sessions_module_date_idx on public.attendance_sessions (module_id, class_date);
create index attendance_sessions_group_date_idx on public.attendance_sessions (tutorial_group_id, class_date);
create index attendance_sessions_tutor_date_idx on public.attendance_sessions (tutor_profile_id, class_date);
create index attendance_sessions_apspace_date_idx on public.attendance_sessions (apspace_status, class_date);

create trigger attendance_sessions_touch before update on public.attendance_sessions
  for each row execute function app.touch_updated_at();

-- Session module must match the tutorial group's module
create or replace function app.check_session_module()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.tutorial_groups g
    where g.id = new.tutorial_group_id and g.module_id = new.module_id
  ) then
    raise exception 'Session module does not match tutorial group module' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger attendance_sessions_module_check before insert or update of module_id, tutorial_group_id
  on public.attendance_sessions for each row execute function app.check_session_module();

-- ---------------------------------------------------------------------------
-- attendance_records (§12.9)
-- ---------------------------------------------------------------------------
create table public.attendance_records (
  id                    uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.attendance_sessions (id),
  student_id            uuid not null references public.students (id),
  status                public.attendance_status not null,
  remark                text check (remark is null or length(remark) <= 500),
  -- Snapshots preserve historical reporting even if master data later changes (§13.8)
  student_number_snapshot text not null,
  student_name_snapshot   text not null,
  marked_by_profile_id  uuid not null references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint attendance_records_uq unique (attendance_session_id, student_id)  -- FR-ATT-009 / BR-009
);
create index attendance_records_session_idx on public.attendance_records (attendance_session_id);
create index attendance_records_student_idx on public.attendance_records (student_id);

create trigger attendance_records_touch before update on public.attendance_records
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs (§12.10, §23)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id),
  actor_name       text,
  entity_type      text not null,
  entity_id        uuid,
  session_id       uuid references public.attendance_sessions (id),
  action           text not null check (action in (
                     'save', 'tutor_edit', 'lecturer_correct', 'apspace_keyed', 'apspace_reverted',
                     'roster_change', 'roster_import', 'tutor_assignment_change',
                     'tutor_code_generated', 'tutor_profile_change', 'master_data_change')),
  old_values       jsonb,
  new_values       jsonb,
  created_at       timestamptz not null default now()
);
create index audit_logs_session_idx on public.audit_logs (session_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- Audit rows are append-only for everyone, including the service role (FR-AUD-006)
create or replace function app.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app.audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- import_batches (§12.11)
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  filename        text,
  module_id       uuid references public.modules (id),
  uploaded_by     uuid references public.profiles (id),
  uploaded_at     timestamptz not null default now(),
  total_rows      integer not null default 0,
  successful_rows integer not null default 0,
  failed_rows     integer not null default 0,
  excluded_rows   integer not null default 0,
  students_created integer not null default 0,
  students_updated integer not null default 0,
  enrolments_created integer not null default 0,
  enrolments_moved integer not null default 0,
  enrolments_deactivated integer not null default 0,
  error_summary   jsonb
);

-- ---------------------------------------------------------------------------
-- tutor_code_attempts – server-side rate limiting store (FR-AUTH-007)
-- ---------------------------------------------------------------------------
create table public.tutor_code_attempts (
  id           bigint generated always as identity primary key,
  client_hash  text not null,        -- SHA-256 of client IP; raw IPs are not stored
  code_prefix  text,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);
create index tutor_code_attempts_client_idx on public.tutor_code_attempts (client_hash, attempted_at desc);
create index tutor_code_attempts_prefix_idx on public.tutor_code_attempts (code_prefix, attempted_at desc);
