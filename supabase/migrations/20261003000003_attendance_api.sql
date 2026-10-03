-- =============================================================================
-- Attendance API – trusted database functions
-- =============================================================================
-- api_tutor_*     : executable by service_role ONLY. Called by Netlify Functions
--                   after the tutor session token has been verified; the tutor
--                   profile id comes from the verified token, never the browser.
--                   Enforces assignment scoping (BR-007), roster completeness
--                   (BR-008), duplicate prevention (FR-SES-009) and the same-day
--                   Asia/Kuala_Lumpur edit window (BR-010, BR-021).
-- lecturer_*      : executable by authenticated; each checks app.is_lecturer().
-- Business errors are returned as {"ok": false, "error": "<CODE>", ...} so the
-- callers can show friendly messages (PRD §20).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function app.active_tutor(p_tutor_profile_id uuid)
returns public.profiles
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.* from public.profiles p
  where p.id = p_tutor_profile_id and p.role = 'tutor' and p.is_active
$$;

create or replace function app.tutor_is_assigned(p_tutor_profile_id uuid, p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tutor_group_assignments a
    join public.tutorial_groups g on g.id = a.tutorial_group_id and g.is_active
    join public.modules m on m.id = g.module_id and m.is_active
    join public.profiles p on p.id = a.tutor_profile_id and p.is_active and p.role = 'tutor'
    where a.tutor_profile_id = p_tutor_profile_id
      and a.tutorial_group_id = p_group_id
      and a.is_active
  )
$$;

-- Active roster of a group, alphabetical A–Z by full name (FR-STU-006, BR-018)
create or replace function app.group_roster(p_group_id uuid)
returns table (student_uuid uuid, student_id text, full_name text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id, s.student_id, s.full_name
  from public.group_enrolments e
  join public.students s on s.id = e.student_id
  where e.tutorial_group_id = p_group_id
    and e.is_active
    and s.is_active
  order by lower(s.full_name), s.full_name, s.student_id
$$;

create or replace function app.session_json(p_session_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'module_code', m.module_code,
    'module_short_name', m.short_name,
    'module_name', m.module_name,
    'tutorial_group_id', g.id,
    'tutorial_code', g.tutorial_code,
    'group_number', g.group_number,
    'tutor_profile_id', s.tutor_profile_id,
    'tutor_name', s.tutor_name_snapshot,
    'class_date', s.class_date,
    'class_time', to_char(s.class_time, 'HH24:MI'),
    'saved_at', s.saved_at,
    'updated_at', s.updated_at,
    'last_tutor_edit_at', s.last_tutor_edit_at,
    'apspace_status', s.apspace_status,
    'tutor_editable', (s.class_date = app.my_today()),
    'total_students', (select count(*) from public.attendance_records r where r.attendance_session_id = s.id),
    'present_count', (select count(*) from public.attendance_records r where r.attendance_session_id = s.id and r.status = 'present'),
    'absent_count', (select count(*) from public.attendance_records r where r.attendance_session_id = s.id and r.status = 'absent')
  )
  from public.attendance_sessions s
  join public.modules m on m.id = s.module_id
  join public.tutorial_groups g on g.id = s.tutorial_group_id
  where s.id = p_session_id
$$;

-- Parse and validate an attendance payload: [{student_id: uuid, status, remark?}]
-- Returns error code or null. Populates temp table _att_payload.
create or replace function app.load_payload(p_records jsonb)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_elem jsonb;
begin
  create temp table if not exists _att_payload (
    student_uuid uuid primary key,
    status public.attendance_status not null,
    remark text
  ) on commit drop;
  truncate _att_payload;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    return 'INVALID_PAYLOAD';
  end if;

  for v_elem in select * from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_elem) <> 'object'
       or (v_elem ->> 'student_id') is null
       or (v_elem ->> 'student_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'INVALID_PAYLOAD';
    end if;
    if coalesce(v_elem ->> 'status', '') not in ('present', 'absent') then
      return 'UNMARKED_STUDENTS';
    end if;
    if exists (select 1 from _att_payload where student_uuid = (v_elem ->> 'student_id')::uuid) then
      return 'DUPLICATE_STUDENT';
    end if;
    if length(coalesce(v_elem ->> 'remark', '')) > 500 then
      return 'INVALID_PAYLOAD';
    end if;
    insert into _att_payload values (
      (v_elem ->> 'student_id')::uuid,
      (v_elem ->> 'status')::public.attendance_status,
      nullif(btrim(coalesce(v_elem ->> 'remark', '')), '')
    );
  end loop;
  return null;
end;
$$;

-- Upsert payload rows into a session and return {changes: [...]} diff for audit.
create or replace function app.apply_payload(p_session_id uuid, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  r record;
begin
  for r in
    select p.student_uuid, p.status, p.remark, s.student_id as tp, s.full_name,
           ar.id as record_id, ar.status as old_status, ar.remark as old_remark
    from _att_payload p
    join public.students s on s.id = p.student_uuid
    left join public.attendance_records ar
      on ar.attendance_session_id = p_session_id and ar.student_id = p.student_uuid
  loop
    if r.record_id is null then
      insert into public.attendance_records
        (attendance_session_id, student_id, status, remark, student_number_snapshot, student_name_snapshot, marked_by_profile_id)
      values (p_session_id, r.student_uuid, r.status, r.remark, r.tp, r.full_name, p_actor);
      v_changes := v_changes || jsonb_build_object('student_id', r.tp, 'student_name', r.full_name,
                                                   'old_status', null, 'new_status', r.status, 'remark', r.remark);
    elsif r.old_status is distinct from r.status or r.old_remark is distinct from r.remark then
      update public.attendance_records
         set status = r.status, remark = r.remark, marked_by_profile_id = p_actor
       where id = r.record_id;
      v_changes := v_changes || jsonb_build_object('student_id', r.tp, 'student_name', r.full_name,
                                                   'old_status', r.old_status, 'new_status', r.status,
                                                   'old_remark', r.old_remark, 'remark', r.remark);
    end if;
  end loop;
  return v_changes;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tutor API (service_role only)
-- ---------------------------------------------------------------------------

-- Tutor home: identity + assigned classes (FR-AUTH-005, FR-MOD-004, AC-001)
create or replace function public.api_tutor_context(p_tutor_profile_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_tutor public.profiles;
begin
  v_tutor := app.active_tutor(p_tutor_profile_id);
  if v_tutor.id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'today', app.my_today(),
    'tutor', jsonb_build_object('id', v_tutor.id, 'full_name', v_tutor.full_name),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tutorial_group_id', g.id,
               'tutorial_code', g.tutorial_code,
               'group_number', g.group_number,
               'module_code', m.module_code,
               'module_short_name', m.short_name,
               'module_name', m.module_name,
               'student_count', (select count(*) from app.group_roster(g.id))
             ) order by m.short_name, g.group_number::int)
      from public.tutor_group_assignments a
      join public.tutorial_groups g on g.id = a.tutorial_group_id and g.is_active
      join public.modules m on m.id = g.module_id and m.is_active
      where a.tutor_profile_id = v_tutor.id and a.is_active
    ), '[]'::jsonb)
  );
end;
$$;

-- Roster for an assigned class only (FR-ATT-001, §15.2)
create or replace function public.api_tutor_roster(p_tutor_profile_id uuid, p_group_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if (app.active_tutor(p_tutor_profile_id)).id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;
  if not app.tutor_is_assigned(p_tutor_profile_id, p_group_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  end if;
  return jsonb_build_object(
    'ok', true,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.student_uuid, 'student_id', r.student_id, 'full_name', r.full_name))
      from app.group_roster(p_group_id) r
    ), '[]'::jsonb)
  );
end;
$$;

-- Own sessions only (PRD §34.4 recommendation: own records only)
create or replace function public.api_tutor_sessions(p_tutor_profile_id uuid, p_limit int default 50)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if (app.active_tutor(p_tutor_profile_id)).id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;
  return jsonb_build_object(
    'ok', true,
    'today', app.my_today(),
    'sessions', coalesce((
      select jsonb_agg(app.session_json(x.id) order by x.class_date desc, x.class_time desc, x.saved_at desc)
      from (
        select s.id, s.class_date, s.class_time, s.saved_at
        from public.attendance_sessions s
        where s.tutor_profile_id = p_tutor_profile_id
        order by s.class_date desc, s.class_time desc, s.saved_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Session detail for the recording tutor (view/edit)
create or replace function public.api_tutor_session_detail(p_tutor_profile_id uuid, p_session_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
  v_editable boolean;
begin
  if (app.active_tutor(p_tutor_profile_id)).id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;
  select * into v_session from public.attendance_sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_session.tutor_profile_id <> p_tutor_profile_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_OWNER');
  end if;

  v_editable := v_session.class_date = app.my_today()
                and app.tutor_is_assigned(p_tutor_profile_id, v_session.tutorial_group_id);

  return jsonb_build_object(
    'ok', true,
    'today', app.my_today(),
    'session', app.session_json(v_session.id) || jsonb_build_object('tutor_editable', v_editable),
    -- Roster = everyone recorded in the session + any currently active student not yet recorded,
    -- alphabetical by name.
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.student_uuid, 'student_id', x.student_id, 'full_name', x.full_name,
               'status', x.status, 'remark', x.remark)
             order by lower(x.full_name), x.full_name, x.student_id)
      from (
        select r.student_id as student_uuid, r.student_number_snapshot as student_id,
               r.student_name_snapshot as full_name, r.status::text as status, r.remark
        from public.attendance_records r
        where r.attendance_session_id = v_session.id
        union all
        select g.student_uuid, g.student_id, g.full_name, null, null
        from app.group_roster(v_session.tutorial_group_id) g
        where v_editable
          and not exists (select 1 from public.attendance_records r
                          where r.attendance_session_id = v_session.id and r.student_id = g.student_uuid)
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Duplicate lookup before marking (PRD §20.3, AC-012)
create or replace function public.api_tutor_find_session(
  p_tutor_profile_id uuid, p_group_id uuid, p_class_date date, p_class_time time)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
begin
  if (app.active_tutor(p_tutor_profile_id)).id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;
  if not app.tutor_is_assigned(p_tutor_profile_id, p_group_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  end if;
  select * into v_session from public.attendance_sessions
   where tutorial_group_id = p_group_id and class_date = p_class_date and class_time = p_class_time;
  if v_session.id is null then
    return jsonb_build_object('ok', true, 'exists', false);
  end if;
  return jsonb_build_object(
    'ok', true, 'exists', true,
    'session_id', v_session.id,
    'recorded_by', v_session.tutor_name_snapshot,
    'own', v_session.tutor_profile_id = p_tutor_profile_id,
    'tutor_editable', v_session.tutor_profile_id = p_tutor_profile_id and v_session.class_date = app.my_today()
  );
end;
$$;

-- Create (p_session_id null) or same-day update of a tutor's attendance session.
create or replace function public.api_tutor_save_attendance(
  p_tutor_profile_id uuid,
  p_session_id uuid,
  p_tutorial_group_id uuid,
  p_class_date date,
  p_class_time time,
  p_records jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tutor public.profiles;
  v_group public.tutorial_groups;
  v_session public.attendance_sessions;
  v_err text;
  v_missing int;
  v_extra int;
  v_changes jsonb;
  v_today date := app.my_today();
  v_existing uuid;
begin
  v_tutor := app.active_tutor(p_tutor_profile_id);
  if v_tutor.id is null then
    return jsonb_build_object('ok', false, 'error', 'TUTOR_INACTIVE');
  end if;
  perform set_config('app.actor_profile_id', v_tutor.id::text, true);

  v_err := app.load_payload(p_records);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  if p_session_id is null then
    ---------------------------------------------------------------- create
    if p_tutorial_group_id is null then
      return jsonb_build_object('ok', false, 'error', 'CLASS_REQUIRED');
    end if;
    if p_class_date is null then
      return jsonb_build_object('ok', false, 'error', 'DATE_REQUIRED');
    end if;
    if p_class_time is null then
      return jsonb_build_object('ok', false, 'error', 'TIME_REQUIRED');
    end if;
    if p_class_date > v_today then
      return jsonb_build_object('ok', false, 'error', 'FUTURE_DATE');   -- FR-SES-005
    end if;
    if not app.tutor_is_assigned(v_tutor.id, p_tutorial_group_id) then
      return jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');  -- BR-007 / FR-TUT-003
    end if;
    select * into v_group from public.tutorial_groups where id = p_tutorial_group_id;

    select id into v_existing from public.attendance_sessions
     where tutorial_group_id = p_tutorial_group_id and class_date = p_class_date and class_time = p_class_time;
    if v_existing is not null then
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_SESSION', 'existing_session_id', v_existing);
    end if;

    -- Payload must match the active roster exactly (BR-006, BR-008, §13.6)
    select count(*) into v_missing from app.group_roster(p_tutorial_group_id) g
     where not exists (select 1 from _att_payload p where p.student_uuid = g.student_uuid);
    select count(*) into v_extra from _att_payload p
     where not exists (select 1 from app.group_roster(p_tutorial_group_id) g where g.student_uuid = p.student_uuid);
    if v_extra > 0 then
      return jsonb_build_object('ok', false, 'error', 'NOT_IN_ROSTER', 'count', v_extra);
    end if;
    if v_missing > 0 then
      return jsonb_build_object('ok', false, 'error', 'UNMARKED_STUDENTS', 'count', v_missing);
    end if;
    if not exists (select 1 from _att_payload) then
      return jsonb_build_object('ok', false, 'error', 'EMPTY_ROSTER');
    end if;

    begin
      insert into public.attendance_sessions
        (module_id, tutorial_group_id, tutor_profile_id, tutor_name_snapshot, class_date, class_time, saved_at)
      values (v_group.module_id, v_group.id, v_tutor.id, v_tutor.full_name, p_class_date, p_class_time, now())
      returning * into v_session;
    exception when unique_violation then
      select id into v_existing from public.attendance_sessions
       where tutorial_group_id = p_tutorial_group_id and class_date = p_class_date and class_time = p_class_time;
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_SESSION', 'existing_session_id', v_existing);
    end;

    v_changes := app.apply_payload(v_session.id, v_tutor.id);
    perform app.write_audit('save', 'attendance_session', v_session.id, v_session.id, null,
      jsonb_build_object(
        'tutorial_code', v_group.tutorial_code,
        'class_date', p_class_date,
        'class_time', to_char(p_class_time, 'HH24:MI'),
        'tutor', v_tutor.full_name,
        'present', (select count(*) from _att_payload where status = 'present'),
        'absent', (select count(*) from _att_payload where status = 'absent'),
        'total', (select count(*) from _att_payload)));

    return jsonb_build_object('ok', true, 'created', true, 'session', app.session_json(v_session.id));
  end if;

  ------------------------------------------------------------------ update
  select * into v_session from public.attendance_sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_session.tutor_profile_id <> v_tutor.id then
    return jsonb_build_object('ok', false, 'error', 'NOT_OWNER');
  end if;
  -- Same-day rule, evaluated in Asia/Kuala_Lumpur on the server (FR-SAVE-005..007)
  if v_session.class_date <> v_today then
    return jsonb_build_object('ok', false, 'error', 'EDIT_WINDOW_CLOSED');
  end if;
  if not app.tutor_is_assigned(v_tutor.id, v_session.tutorial_group_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_ASSIGNED');
  end if;

  -- Required: every active roster student. Allowed: active roster + already recorded students.
  select count(*) into v_missing from app.group_roster(v_session.tutorial_group_id) g
   where not exists (select 1 from _att_payload p where p.student_uuid = g.student_uuid);
  select count(*) into v_extra from _att_payload p
   where not exists (select 1 from app.group_roster(v_session.tutorial_group_id) g where g.student_uuid = p.student_uuid)
     and not exists (select 1 from public.attendance_records r
                     where r.attendance_session_id = v_session.id and r.student_id = p.student_uuid);
  if v_extra > 0 then
    return jsonb_build_object('ok', false, 'error', 'NOT_IN_ROSTER', 'count', v_extra);
  end if;
  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'error', 'UNMARKED_STUDENTS', 'count', v_missing);
  end if;

  v_changes := app.apply_payload(v_session.id, v_tutor.id);
  update public.attendance_sessions set last_tutor_edit_at = now() where id = v_session.id;
  if jsonb_array_length(v_changes) > 0 then
    perform app.write_audit('tutor_edit', 'attendance_session', v_session.id, v_session.id, null,
      jsonb_build_object('changes', v_changes));
  end if;

  return jsonb_build_object('ok', true, 'created', false, 'changed', jsonb_array_length(v_changes),
                            'session', app.session_json(v_session.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturer API (authenticated + app.is_lecturer())
-- ---------------------------------------------------------------------------

-- Administrative correction at any time (FR-SAVE-008, AC-010)
create or replace function public.lecturer_correct_attendance(p_session_id uuid, p_records jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := app.current_lecturer_id();
  v_session public.attendance_sessions;
  v_err text;
  v_extra int;
  v_changes jsonb;
begin
  if v_lecturer is null then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  perform set_config('app.actor_profile_id', v_lecturer::text, true);

  select * into v_session from public.attendance_sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  v_err := app.load_payload(p_records);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  -- Lecturer may correct recorded students and add currently enrolled (incl. inactive) students of the group.
  select count(*) into v_extra from _att_payload p
   where not exists (select 1 from public.attendance_records r
                     where r.attendance_session_id = v_session.id and r.student_id = p.student_uuid)
     and not exists (select 1 from public.group_enrolments e
                     where e.tutorial_group_id = v_session.tutorial_group_id and e.student_id = p.student_uuid);
  if v_extra > 0 then
    return jsonb_build_object('ok', false, 'error', 'NOT_IN_ROSTER', 'count', v_extra);
  end if;

  v_changes := app.apply_payload(v_session.id, v_lecturer);
  if jsonb_array_length(v_changes) > 0 then
    update public.attendance_sessions set last_lecturer_edit_at = now() where id = v_session.id;
    perform app.write_audit('lecturer_correct', 'attendance_session', v_session.id, v_session.id, null,
      jsonb_build_object('changes', v_changes));
  end if;
  return jsonb_build_object('ok', true, 'changed', jsonb_array_length(v_changes));
end;
$$;

-- APSpace workflow status (FR-APS-002..005, BR-014). Supports bulk marking.
create or replace function public.lecturer_set_apspace_status(p_session_ids uuid[], p_status public.apspace_status)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := app.current_lecturer_id();
  r record;
  v_count int := 0;
begin
  if v_lecturer is null then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  if p_status is null or p_session_ids is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  end if;
  perform set_config('app.actor_profile_id', v_lecturer::text, true);

  for r in select * from public.attendance_sessions where id = any(p_session_ids) for update loop
    continue when r.apspace_status = p_status;
    if p_status = 'keyed_in' then
      update public.attendance_sessions
         set apspace_status = 'keyed_in', apspace_keyed_at = now(), apspace_keyed_by = v_lecturer
       where id = r.id;
      perform app.write_audit('apspace_keyed', 'attendance_session', r.id, r.id,
        jsonb_build_object('apspace_status', r.apspace_status),
        jsonb_build_object('apspace_status', 'keyed_in', 'apspace_keyed_at', now()));
    else
      update public.attendance_sessions
         set apspace_status = 'pending', apspace_keyed_at = null, apspace_keyed_by = null
       where id = r.id;
      perform app.write_audit('apspace_reverted', 'attendance_session', r.id, r.id,
        jsonb_build_object('apspace_status', r.apspace_status, 'apspace_keyed_at', r.apspace_keyed_at),
        jsonb_build_object('apspace_status', 'pending'));
    end if;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_count);
end;
$$;

-- Roster import (PRD §18.3). Rows: [{student_id, student_name, group_number}] already
-- normalised and pre-validated by the client; validated again here.
-- p_dry_run = true -> returns the summary without writing (preview, §18.3.11).
create or replace function public.lecturer_import_roster(
  p_module_id uuid,
  p_rows jsonb,
  p_filename text default null,
  p_dry_run boolean default true,
  p_deactivate_missing boolean default false,
  p_excluded_rows int default 0
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := app.current_lecturer_id();
  v_module public.modules;
  v_elem jsonb;
  v_idx int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_sid text;
  v_name text;
  v_grp text;
  v_group_id uuid;
  v_student public.students;
  v_created int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_enrol_created int := 0;
  v_enrol_moved int := 0;
  v_enrol_reactivated int := 0;
  v_deactivated int := 0;
  v_valid int := 0;
  v_batch uuid;
begin
  if v_lecturer is null then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  perform set_config('app.actor_profile_id', v_lecturer::text, true);

  select * into v_module from public.modules where id = p_module_id;
  if v_module.id is null then
    return jsonb_build_object('ok', false, 'error', 'MODULE_NOT_FOUND');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  end if;

  create temp table if not exists _import_rows (
    row_no int, student_id text primary key, student_name text, group_id uuid, group_number text
  ) on commit drop;
  truncate _import_rows;

  for v_elem in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_sid := upper(btrim(coalesce(v_elem ->> 'student_id', '')));
    v_name := regexp_replace(btrim(coalesce(v_elem ->> 'student_name', '')), '\s+', ' ', 'g');
    v_grp := btrim(coalesce(v_elem ->> 'group_number', ''));
    v_grp := regexp_replace(v_grp, '\.0+$', '');
    if v_sid = '' or v_name = '' then
      v_errors := v_errors || jsonb_build_object('row', coalesce((v_elem ->> 'row_no')::int, v_idx), 'student_id', v_sid,
                                                 'error', 'Missing student ID or name');
      continue;
    end if;
    if v_grp = '' then
      v_errors := v_errors || jsonb_build_object('row', coalesce((v_elem ->> 'row_no')::int, v_idx), 'student_id', v_sid,
                                                 'error', 'Missing tutorial group (excluded)');
      continue;
    end if;
    select id into v_group_id from public.tutorial_groups where module_id = v_module.id and group_number = v_grp;
    if v_group_id is null then
      v_errors := v_errors || jsonb_build_object('row', coalesce((v_elem ->> 'row_no')::int, v_idx), 'student_id', v_sid,
                                                 'error', format('Tutorial group %s is not configured for %s', v_grp, v_module.module_code));
      continue;
    end if;
    if exists (select 1 from _import_rows where student_id = v_sid) then
      v_errors := v_errors || jsonb_build_object('row', coalesce((v_elem ->> 'row_no')::int, v_idx), 'student_id', v_sid,
                                                 'error', 'Duplicate student ID in file');
      continue;
    end if;
    insert into _import_rows values (coalesce((v_elem ->> 'row_no')::int, v_idx), v_sid, v_name, v_group_id, v_grp);
    v_valid := v_valid + 1;
  end loop;

  -- Compute effects (shared by preview and commit)
  select count(*) into v_created from _import_rows i where not exists (select 1 from public.students s where s.student_id = i.student_id);
  select count(*) into v_updated from _import_rows i join public.students s on s.student_id = i.student_id
   where s.full_name <> i.student_name or not s.is_active;
  select count(*) into v_unchanged from _import_rows i join public.students s on s.student_id = i.student_id
   where s.full_name = i.student_name and s.is_active;
  select count(*) into v_enrol_created from _import_rows i
   where not exists (select 1 from public.group_enrolments e join public.students s on s.id = e.student_id
                     where s.student_id = i.student_id and e.tutorial_group_id = i.group_id);
  select count(*) into v_enrol_reactivated from _import_rows i
   join public.students s on s.student_id = i.student_id
   join public.group_enrolments e on e.student_id = s.id and e.tutorial_group_id = i.group_id and not e.is_active;
  select count(*) into v_enrol_moved from _import_rows i
   join public.students s on s.student_id = i.student_id
   where exists (select 1 from public.group_enrolments e join public.tutorial_groups g on g.id = e.tutorial_group_id
                 where e.student_id = s.id and e.is_active and g.module_id = v_module.id and e.tutorial_group_id <> i.group_id);
  if p_deactivate_missing then
    select count(*) into v_deactivated from public.group_enrolments e
     join public.tutorial_groups g on g.id = e.tutorial_group_id and g.module_id = v_module.id
     join public.students s on s.id = e.student_id
     where e.is_active and not exists (select 1 from _import_rows i where i.student_id = s.student_id);
  end if;

  if not p_dry_run then
    if jsonb_array_length(v_errors) > 0 and v_valid = 0 then
      return jsonb_build_object('ok', false, 'error', 'NO_VALID_ROWS', 'errors', v_errors);
    end if;

    -- 1. Upsert students on student_id
    insert into public.students (student_id, full_name, is_active)
    select student_id, student_name, true from _import_rows
    on conflict (student_id) do update
      set full_name = excluded.full_name, is_active = true
      where public.students.full_name <> excluded.full_name or not public.students.is_active;

    -- 2. Deactivate enrolments in OTHER groups of the same module (student moved group)
    update public.group_enrolments e set is_active = false
      from _import_rows i, public.students s, public.tutorial_groups g
     where s.student_id = i.student_id and e.student_id = s.id and g.id = e.tutorial_group_id
       and g.module_id = v_module.id and e.tutorial_group_id <> i.group_id and e.is_active;

    -- 3. Create / reactivate enrolment
    insert into public.group_enrolments (tutorial_group_id, student_id, is_active)
    select i.group_id, s.id, true from _import_rows i join public.students s on s.student_id = i.student_id
    on conflict (tutorial_group_id, student_id) do update set is_active = true
      where not public.group_enrolments.is_active;

    -- 4. Optional: deactivate module enrolments for students absent from this file (semester rollover)
    if p_deactivate_missing then
      update public.group_enrolments e set is_active = false
        from public.tutorial_groups g, public.students s
       where g.id = e.tutorial_group_id and g.module_id = v_module.id and s.id = e.student_id and e.is_active
         and not exists (select 1 from _import_rows i where i.student_id = s.student_id);
    end if;

    insert into public.import_batches (filename, module_id, uploaded_by, total_rows, successful_rows, failed_rows,
                                       excluded_rows, students_created, students_updated, enrolments_created,
                                       enrolments_moved, enrolments_deactivated, error_summary)
    values (p_filename, v_module.id, v_lecturer, v_idx + coalesce(p_excluded_rows, 0), v_valid,
            jsonb_array_length(v_errors), coalesce(p_excluded_rows, 0), v_created, v_updated,
            v_enrol_created, v_enrol_moved, v_deactivated, v_errors)
    returning id into v_batch;

    perform app.write_audit('roster_import', 'import_batch', v_batch, null, null,
      jsonb_build_object('filename', p_filename, 'module_code', v_module.module_code, 'rows', v_valid,
                         'students_created', v_created, 'students_updated', v_updated,
                         'enrolments_created', v_enrol_created, 'enrolments_moved', v_enrol_moved,
                         'enrolments_deactivated', v_deactivated));
  end if;

  return jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'batch_id', v_batch,
    'module_code', v_module.module_code,
    'rows_processed', v_idx,
    'valid_rows', v_valid,
    'students_created', v_created,
    'students_updated', v_updated,
    'students_unchanged', v_unchanged,
    'enrolments_created', v_enrol_created,
    'enrolments_reactivated', v_enrol_reactivated,
    'enrolments_moved', v_enrol_moved,
    'enrolments_deactivated', v_deactivated,
    'errors', v_errors,
    'group_counts', coalesce((select jsonb_object_agg(group_number, n) from (
        select group_number, count(*) n from _import_rows group by group_number) c), '{}'::jsonb)
  );
end;
$$;

-- Tutor profile + code management (called by the admin Netlify Function with the
-- service role after verifying the lecturer JWT; the function hashes the code).
create or replace function public.api_admin_upsert_tutor(
  p_actor_profile_id uuid,
  p_tutor_profile_id uuid,
  p_full_name text,
  p_code_prefix text,
  p_code_hash text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tutor public.profiles;
begin
  if not exists (select 1 from public.profiles where id = p_actor_profile_id and role = 'lecturer' and is_active) then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  perform set_config('app.actor_profile_id', p_actor_profile_id::text, true);

  if p_code_prefix is null or p_code_prefix !~ '^[A-Z]{2,20}$' or p_code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  end if;
  if exists (select 1 from public.profiles where role = 'tutor' and is_active and tutor_code_prefix = p_code_prefix
             and id is distinct from p_tutor_profile_id) then
    return jsonb_build_object('ok', false, 'error', 'PREFIX_IN_USE');
  end if;

  if p_tutor_profile_id is null then
    if coalesce(btrim(p_full_name), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
    end if;
    insert into public.profiles (full_name, role, tutor_code_prefix, tutor_code_hash, tutor_code_updated_at)
    values (btrim(p_full_name), 'tutor', p_code_prefix, p_code_hash, now())
    returning * into v_tutor;
  else
    update public.profiles
       set tutor_code_prefix = p_code_prefix,
           tutor_code_hash = p_code_hash,
           tutor_code_updated_at = now(),
           full_name = coalesce(nullif(btrim(p_full_name), ''), full_name)
     where id = p_tutor_profile_id and role = 'tutor'
     returning * into v_tutor;
    if v_tutor.id is null then
      return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
    end if;
  end if;

  perform app.write_audit('tutor_code_generated', 'profiles', v_tutor.id, null, null,
    jsonb_build_object('tutor', v_tutor.full_name, 'prefix', v_tutor.tutor_code_prefix));
  return jsonb_build_object('ok', true, 'tutor', jsonb_build_object(
    'id', v_tutor.id, 'full_name', v_tutor.full_name, 'tutor_code_prefix', v_tutor.tutor_code_prefix,
    'is_active', v_tutor.is_active));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.api_tutor_context(uuid) from public, anon, authenticated;
revoke all on function public.api_tutor_roster(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_tutor_sessions(uuid, int) from public, anon, authenticated;
revoke all on function public.api_tutor_session_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_tutor_find_session(uuid, uuid, date, time) from public, anon, authenticated;
revoke all on function public.api_tutor_save_attendance(uuid, uuid, uuid, date, time, jsonb) from public, anon, authenticated;
revoke all on function public.api_admin_upsert_tutor(uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.api_tutor_context(uuid) to service_role;
grant execute on function public.api_tutor_roster(uuid, uuid) to service_role;
grant execute on function public.api_tutor_sessions(uuid, int) to service_role;
grant execute on function public.api_tutor_session_detail(uuid, uuid) to service_role;
grant execute on function public.api_tutor_find_session(uuid, uuid, date, time) to service_role;
grant execute on function public.api_tutor_save_attendance(uuid, uuid, uuid, date, time, jsonb) to service_role;
grant execute on function public.api_admin_upsert_tutor(uuid, uuid, text, text, text) to service_role;

revoke all on function public.lecturer_correct_attendance(uuid, jsonb) from public, anon;
revoke all on function public.lecturer_set_apspace_status(uuid[], public.apspace_status) from public, anon;
revoke all on function public.lecturer_import_roster(uuid, jsonb, text, boolean, boolean, int) from public, anon;
grant execute on function public.lecturer_correct_attendance(uuid, jsonb) to authenticated, service_role;
grant execute on function public.lecturer_set_apspace_status(uuid[], public.apspace_status) to authenticated, service_role;
grant execute on function public.lecturer_import_roster(uuid, jsonb, text, boolean, boolean, int) to authenticated, service_role;

-- Helper functions in app schema are internal; they are SECURITY DEFINER and only
-- reachable through the RPCs above or RLS policies.
revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_lecturer() to authenticated, service_role;
grant execute on function app.current_lecturer_id() to authenticated, service_role;
grant execute on function app.my_today() to authenticated, service_role;
grant execute on function app.my_now() to authenticated, service_role;
