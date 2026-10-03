-- Lecturer RLS, corrections, APSpace workflow and roster import tests
-- (PRD §15, §26.3, AC-010, AC-013, AC-014, §18.3). Rolled back at the end.
begin;

-- Lecturer (Ms Aida) auth user + profile, plus an unrelated authenticated user
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a1da', 'aida@apu.edu.my'),
  ('00000000-0000-0000-0000-0000000000bb', 'someone@example.com');
insert into public.profiles (auth_user_id, full_name, role)
values ('00000000-0000-0000-0000-00000000a1da', 'Ms Aida', 'lecturer');

-- A saved session by May (via the trusted tutor API)
select id as may_id from public.profiles where tutor_code_prefix = 'MAY' \gset
select id as g40 from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-40' \gset
select (public.api_tutor_save_attendance(
          :'may_id', null, :'g40', app.my_today(), '09:00',
          (select jsonb_agg(jsonb_build_object('student_id', s ->> 'id', 'status', 'present'))
             from jsonb_array_elements(public.api_tutor_roster(:'may_id', :'g40') -> 'students') s)
        ) -> 'session' ->> 'id') as sid \gset
select set_config('t.sid', :'sid', false) \g /dev/null

-- ---------------------------------------------------------------- anon: nothing
set local role anon;
do $$ begin
  perform 1 from public.students;
  raise exception 'FAIL: anon read students';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.attendance_session_summary;
  raise exception 'FAIL: anon read attendance';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- authenticated non-lecturer: no rows, no writes
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', true) \g /dev/null
do $$ begin
  assert (select count(*) from public.students) = 0, 'non-lecturer sees no students';
  assert (select count(*) from public.attendance_session_summary) = 0, 'non-lecturer sees no sessions';
  assert (select count(*) from public.profiles) = 0, 'non-lecturer sees no profiles';
end $$;
do $$ begin
  insert into public.students (student_id, full_name) values ('TP000001', 'Intruder');
  raise exception 'FAIL: non-lecturer inserted student';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.lecturer_set_apspace_status(array[current_setting('t.sid')::uuid], 'keyed_in');
  raise exception 'FAIL: non-lecturer changed APSpace status';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- lecturer
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a1da', true) \g /dev/null

do $$ begin
  assert (select count(*) from public.students) = 120, 'lecturer reads all students';
  assert (select count(*) from public.attendance_session_summary) = 1, 'lecturer sees saved session immediately (AC-007)';
  assert (select tutor_name_snapshot from public.attendance_session_summary limit 1) = 'May', 'tutor visible';
  assert (select present_count from public.attendance_session_summary limit 1) = 15, 'present counts in summary';
end $$;

-- tutor code hashes are never readable from the browser
do $$ begin
  perform tutor_code_hash from public.profiles;
  raise exception 'FAIL: lecturer read tutor_code_hash';
exception when insufficient_privilege then null; end $$;

-- direct writes to attendance are blocked (must go through audited RPC)
do $$ begin
  update public.attendance_records set status = 'absent';
  raise exception 'FAIL: direct attendance update allowed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.attendance_sessions;
  raise exception 'FAIL: hard delete allowed (BR-017)';
exception when insufficient_privilege then null; end $$;

-- AC-010 lecturer correction, even after the tutor window has closed
reset role;
update public.attendance_sessions set class_date = app.my_today() - 3 where id = current_setting('t.sid')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a1da', true) \g /dev/null
do $$
declare v jsonb; st uuid;
begin
  select student_uuid into st from public.attendance_record_details
   where attendance_session_id = current_setting('t.sid')::uuid order by student_name limit 1;
  v := public.lecturer_correct_attendance(current_setting('t.sid')::uuid,
         jsonb_build_array(jsonb_build_object('student_id', st, 'status', 'absent', 'remark', 'Medical leave')));
  assert (v ->> 'ok')::boolean and (v ->> 'changed')::int = 1, format('correction: %s', v);
  assert (select absent_count from public.attendance_session_summary where id = current_setting('t.sid')::uuid) = 1, 'absent now 1';
  assert (select count(*) from public.audit_logs where session_id = current_setting('t.sid')::uuid
          and action = 'lecturer_correct' and actor_name = 'Ms Aida') = 1, 'correction audited with actor';
end $$;

-- AC-013 APSpace keyed in
do $$
declare v jsonb; s record;
begin
  v := public.lecturer_set_apspace_status(array[current_setting('t.sid')::uuid], 'keyed_in');
  assert (v ->> 'updated')::int = 1, 'keyed';
  select * into s from public.attendance_session_summary where id = current_setting('t.sid')::uuid;
  assert s.apspace_status = 'keyed_in' and s.apspace_keyed_at is not null and s.apspace_keyed_by_name = 'Ms Aida',
    'timestamp and lecturer identity recorded';
  assert (select count(*) from public.audit_logs where action = 'apspace_keyed') = 1, 'apspace audited';
end $$;

-- Lecturer master data: tutor assignment change is audited
do $$
declare g38 uuid; may uuid;
begin
  select id into g38 from public.tutorial_groups where tutorial_code = 'CT046-3-2-SDM-T-38';
  select id into may from public.profiles where tutor_code_prefix = 'MAY';
  insert into public.tutor_group_assignments (tutor_profile_id, tutorial_group_id, is_temporary_cover)
  values (may, g38, true);
  assert (select assigned_by from public.tutor_group_assignments where tutorial_group_id = g38 and is_active)
         = app.current_lecturer_id(), 'assigned_by stamped';
  assert (select count(*) from public.audit_logs where action = 'tutor_assignment_change') >= 1, 'assignment audited';
end $$;

-- Lecturer cannot change her own role / promote anyone via profiles
do $$ begin
  update public.profiles set role = 'lecturer';
  raise exception 'FAIL: role column writable';
exception when insufficient_privilege then null; end $$;

-- ---------------------------------------------------------------- roster import (§18.3)
do $$
declare v jsonb; sdm uuid; rows jsonb;
begin
  select id into sdm from public.modules where module_code = 'CT046-3-2-SDM';
  rows := jsonb_build_array(
    jsonb_build_object('row_no', 2, 'student_id', ' tp100001 ', 'student_name', 'Zulkifli  Bin Ahmad', 'group_number', '40'),
    jsonb_build_object('row_no', 3, 'student_id', 'TP100002', 'student_name', 'Alya Tan', 'group_number', '41.0'),
    jsonb_build_object('row_no', 4, 'student_id', 'TP100003', 'student_name', 'No Group Student', 'group_number', ''),
    jsonb_build_object('row_no', 5, 'student_id', 'TP100001', 'student_name', 'Duplicate', 'group_number', '40'),
    jsonb_build_object('row_no', 6, 'student_id', 'TP100004', 'student_name', 'Wrong Group', 'group_number', '99'),
    -- existing dummy student moves to group 39
    jsonb_build_object('row_no', 7, 'student_id', (select student_id from public.attendance_record_details
                                                    where attendance_session_id = current_setting('t.sid')::uuid
                                                    order by student_name desc limit 1),
                       'student_name', 'Moved Student', 'group_number', '39')
  );

  v := public.lecturer_import_roster(sdm, rows, 'test.xlsx', true, false, 0);
  assert (v ->> 'ok')::boolean and (v ->> 'dry_run')::boolean, 'preview ok';
  assert (v ->> 'valid_rows')::int = 3, format('valid rows: %s', v);
  assert jsonb_array_length(v -> 'errors') = 3, 'missing group, duplicate, unknown group flagged';
  assert (select count(*) from public.students where student_id = 'TP100001') = 0, 'dry run writes nothing';

  v := public.lecturer_import_roster(sdm, rows, 'test.xlsx', false, false, 0);
  assert (v ->> 'students_created')::int = 2, format('created: %s', v);
  assert (v ->> 'students_updated')::int = 1, 'renamed student updated';
  assert (v ->> 'enrolments_moved')::int = 1, 'moved student detected';
  assert (select full_name from public.students where student_id = 'TP100001') = 'Zulkifli Bin Ahmad', 'trimmed + normalised';
  assert not exists (select 1 from public.students where student_id = 'TP100003'), 'ungrouped row excluded (BR-020)';
  assert (select count(*) from public.group_enrolments e join public.students s on s.id = e.student_id
          join public.tutorial_groups g on g.id = e.tutorial_group_id
          where s.full_name = 'Moved Student' and e.is_active and g.module_id = sdm) = 1, 'one active SDM enrolment after move';
  assert (select count(*) from public.import_batches) = 1, 'import batch recorded';
  -- historical attendance kept the original name snapshot
  assert not exists (select 1 from public.attendance_record_details where student_name = 'Moved Student'),
    'historical snapshot preserved';
end $$;

reset role;
\echo '  lecturer RLS tests passed'
rollback;
