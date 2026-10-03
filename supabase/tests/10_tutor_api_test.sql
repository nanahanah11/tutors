-- Tutor API authorization + business-rule tests (PRD §26.2, §26.3, AC-001..AC-012, AC-014)
-- Runs inside a transaction that is rolled back.
begin;

select id as may_id    from public.profiles where tutor_code_prefix = 'MAY' \gset
select id as amir_id   from public.profiles where tutor_code_prefix = 'AMIR' \gset
select id as g39       from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-39' \gset
select id as g40       from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-40' \gset
select id as g41       from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-41' \gset
select id as g38       from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-38' \gset

-- ---------------------------------------------------------------- browser roles cannot reach tutor API
set local role anon;
do $$ begin
  perform public.api_tutor_context(gen_random_uuid());
  raise exception 'FAIL: anon executed api_tutor_context';
exception when insufficient_privilege then null; end $$;
reset role;

set local role authenticated;
do $$ begin
  perform public.api_tutor_save_attendance(gen_random_uuid(), null, gen_random_uuid(), current_date, '10:00', '[]');
  raise exception 'FAIL: authenticated executed api_tutor_save_attendance';
exception when insufficient_privilege then null; end $$;
reset role;

set local role service_role;

-- ---------------------------------------------------------------- AC-001 / AC-002: only assigned classes
select set_config('t.may', :'may_id', true), set_config('t.amir', :'amir_id', true),
       set_config('t.g39', :'g39', true), set_config('t.g40', :'g40', true),
       set_config('t.g41', :'g41', true), set_config('t.g38', :'g38', true) \g /dev/null

do $$
declare v jsonb; codes text[];
begin
  v := public.api_tutor_context(current_setting('t.may')::uuid);
  assert (v ->> 'ok')::boolean, 'context ok';
  assert v -> 'tutor' ->> 'full_name' = 'May', 'tutor resolved as May';
  select array_agg(c ->> 'tutorial_code' order by c ->> 'tutorial_code') into codes from jsonb_array_elements(v -> 'classes') c;
  assert codes = array['CT046-3-2-SDM-T-39', 'CT046-3-2-SDM-T-40'], format('May classes wrong: %s', codes);
end $$;

-- ---------------------------------------------------------------- unassigned roster is refused
do $$
declare v jsonb;
begin
  v := public.api_tutor_roster(current_setting('t.may')::uuid, current_setting('t.g41')::uuid);
  assert v ->> 'error' = 'NOT_ASSIGNED', 'May cannot read SDM-T-41 roster';
  assert v -> 'students' is null, 'no student data leaked';
  v := public.api_tutor_roster(current_setting('t.may')::uuid, current_setting('t.g38')::uuid);
  assert v ->> 'error' = 'NOT_ASSIGNED', 'unassigned SDM-T-38 is lecturer-controlled';
end $$;

-- ---------------------------------------------------------------- AC-003 / AC-004 roster + ordering
do $$
declare v jsonb; names text[]; sorted text[];
begin
  v := public.api_tutor_roster(current_setting('t.may')::uuid, current_setting('t.g40')::uuid);
  assert (v ->> 'ok')::boolean, 'roster ok';
  assert jsonb_array_length(v -> 'students') = 15, 'exactly the 15 active students';
  select array_agg(s ->> 'full_name' order by ord) into names
    from jsonb_array_elements(v -> 'students') with ordinality as x(s, ord);
  select array_agg(n order by lower(n), n) into sorted from unnest(names) n;
  assert names = sorted, 'roster sorted A–Z by full name';
end $$;

-- ---------------------------------------------------------------- validation rules
create temp table t_payload as
select jsonb_agg(jsonb_build_object('student_id', (s ->> 'id'), 'status', case when i % 5 = 0 then 'absent' else 'present' end)) as full_payload
from jsonb_array_elements((public.api_tutor_roster(current_setting('t.may')::uuid, current_setting('t.g40')::uuid)) -> 'students')
     with ordinality as x(s, i);

do $$
declare v jsonb; p jsonb := (select full_payload from t_payload);
begin
  -- AC-006: one unmarked student blocks the save
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', p - 0);
  assert v ->> 'error' = 'UNMARKED_STUDENTS' and (v ->> 'count')::int = 1, format('unmarked check: %s', v);

  -- status other than present/absent
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', jsonb_set(p, '{0,status}', '"late"'));
  assert v ->> 'error' = 'UNMARKED_STUDENTS', 'invalid status rejected';

  -- duplicate student in payload (BR-009)
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', p || jsonb_build_array(p -> 0));
  assert v ->> 'error' = 'DUPLICATE_STUDENT', 'duplicate student rejected';

  -- FR-SES-005: no future dates
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today() + 1, '10:45', p);
  assert v ->> 'error' = 'FUTURE_DATE', 'future date rejected';

  -- Missing time
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), null, p);
  assert v ->> 'error' = 'TIME_REQUIRED', 'time required';

  -- BR-007: cannot create for an unassigned class (Amir -> SDM 40)
  v := public.api_tutor_save_attendance(current_setting('t.amir')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', p);
  assert v ->> 'error' = 'NOT_ASSIGNED', 'Amir cannot create SDM-T-40 attendance';

  -- BR-006: student from another group rejected
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g39')::uuid,
         app.my_today(), '10:45', p);
  assert v ->> 'error' = 'NOT_IN_ROSTER', 'students of another group rejected';
end $$;

-- ---------------------------------------------------------------- successful save + audit (AC-007)
do $$
declare v jsonb; sid uuid; p jsonb := (select full_payload from t_payload);
begin
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', p);
  assert (v ->> 'ok')::boolean, format('save failed: %s', v);
  sid := (v -> 'session' ->> 'id')::uuid;
  perform set_config('t.sid', sid::text, false);
  assert (v -> 'session' ->> 'total_students')::int = 15, 'total 15';
  assert (v -> 'session' ->> 'absent_count')::int = 3, 'absent 3';
  assert (v -> 'session' ->> 'apspace_status') = 'pending', 'FR-APS-001 pending by default';
  assert (select tutor_name_snapshot from public.attendance_sessions where id = sid) = 'May', 'tutor snapshot';
  assert (select count(*) from public.audit_logs where session_id = sid and action = 'save') = 1, 'save audited';
  assert (select actor_name from public.audit_logs where session_id = sid and action = 'save') = 'May', 'actor = May';
end $$;

-- ---------------------------------------------------------------- AC-012 duplicate prevention
do $$
declare v jsonb; p jsonb := (select full_payload from t_payload);
begin
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, null, current_setting('t.g40')::uuid,
         app.my_today(), '10:45', p);
  assert v ->> 'error' = 'DUPLICATE_SESSION', 'duplicate blocked';
  assert v ->> 'existing_session_id' = current_setting('t.sid'), 'points to existing session';
  v := public.api_tutor_find_session(current_setting('t.may')::uuid, current_setting('t.g40')::uuid, app.my_today(), '10:45');
  assert (v ->> 'exists')::boolean and (v ->> 'own')::boolean and (v ->> 'tutor_editable')::boolean, 'find_session reports own editable';
end $$;

-- ---------------------------------------------------------------- AC-008 same-day edit
do $$
declare v jsonb; p jsonb := (select full_payload from t_payload);
begin
  p := jsonb_set(p, '{1,status}', '"absent"');
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, current_setting('t.sid')::uuid, null, null, null, p);
  assert (v ->> 'ok')::boolean and (v ->> 'changed')::int = 1, format('same-day edit: %s', v);
  assert (select count(*) from public.audit_logs where session_id = current_setting('t.sid')::uuid and action = 'tutor_edit') = 1,
    'tutor edit audited';
  assert (select last_tutor_edit_at from public.attendance_sessions where id = current_setting('t.sid')::uuid) is not null,
    'last_tutor_edit_at stamped';
end $$;

-- ---------------------------------------------------------------- other tutor cannot read/update
do $$
declare v jsonb; p jsonb := (select full_payload from t_payload);
begin
  v := public.api_tutor_save_attendance(current_setting('t.amir')::uuid, current_setting('t.sid')::uuid, null, null, null, p);
  assert v ->> 'error' = 'NOT_OWNER', 'Amir cannot update May''s session';
  v := public.api_tutor_session_detail(current_setting('t.amir')::uuid, current_setting('t.sid')::uuid);
  assert v ->> 'error' = 'NOT_OWNER', 'Amir cannot read May''s session';
  v := public.api_tutor_sessions(current_setting('t.amir')::uuid);
  assert jsonb_array_length(v -> 'sessions') = 0, 'Amir sees only own sessions';
  v := public.api_tutor_sessions(current_setting('t.may')::uuid);
  assert jsonb_array_length(v -> 'sessions') = 1, 'May sees her session';
end $$;

-- ---------------------------------------------------------------- AC-009 edit lock after class date
reset role;
update public.attendance_sessions set class_date = app.my_today() - 1 where id = current_setting('t.sid')::uuid;
set local role service_role;
do $$
declare v jsonb; p jsonb := (select full_payload from t_payload);
begin
  v := public.api_tutor_save_attendance(current_setting('t.may')::uuid, current_setting('t.sid')::uuid, null, null, null, p);
  assert v ->> 'error' = 'EDIT_WINDOW_CLOSED', format('edit lock: %s', v);
  v := public.api_tutor_session_detail(current_setting('t.may')::uuid, current_setting('t.sid')::uuid);
  assert not (v -> 'session' ->> 'tutor_editable')::boolean, 'detail reports read-only';
end $$;

-- ---------------------------------------------------------------- inactive tutor / removed assignment
reset role;
update public.tutor_group_assignments set is_active = false
 where tutor_profile_id = current_setting('t.may')::uuid and tutorial_group_id = current_setting('t.g39')::uuid;
set local role service_role;
do $$
declare v jsonb;
begin
  v := public.api_tutor_roster(current_setting('t.may')::uuid, current_setting('t.g39')::uuid);
  assert v ->> 'error' = 'NOT_ASSIGNED', 'deactivated assignment revokes access';
end $$;
reset role;
update public.profiles set is_active = false where id = current_setting('t.amir')::uuid;
set local role service_role;
do $$
declare v jsonb;
begin
  v := public.api_tutor_context(current_setting('t.amir')::uuid);
  assert v ->> 'error' = 'TUTOR_INACTIVE', 'inactive tutor has no access';
end $$;

-- ---------------------------------------------------------------- APSpace / audit not reachable by tutor path
reset role;
do $$ begin
  assert (select apspace_status from public.attendance_sessions where id = current_setting('t.sid')::uuid) = 'pending',
    'tutor API never changes APSpace status';
end $$;

-- Audit log is append-only (FR-AUD-006)
do $$ begin
  update public.audit_logs set action = 'save';
  raise exception 'FAIL: audit log updated';
exception when insufficient_privilege then null; end $$;

\echo '  tutor API tests passed'
rollback;
