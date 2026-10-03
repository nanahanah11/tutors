-- =============================================================================
-- Authorization (PRD §15), audit triggers (§23) and reporting views
-- =============================================================================
-- Lecturer (Ms Aida)  : Supabase Auth JWT -> RLS policies below.
-- Tutors              : NO direct database access. Netlify Functions validate the
--                       tutor session token and call the api_tutor_* functions
--                       (migration 003) with the service role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
create or replace function app.current_lecturer_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role = 'lecturer'
    and p.is_active
  limit 1
$$;

create or replace function app.is_lecturer()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select app.current_lecturer_id() is not null $$;

-- Actor for audit rows: explicit actor set by trusted RPCs, else the lecturer JWT.
create or replace function app.actor_profile_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('app.actor_profile_id', true), '')::uuid,
    app.current_lecturer_id()
  )
$$;

create or replace function app.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_session_id uuid,
  p_old jsonb,
  p_new jsonb
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.actor_profile_id();
begin
  insert into public.audit_logs (actor_profile_id, actor_name, entity_type, entity_id, session_id, action, old_values, new_values)
  values (
    v_actor,
    (select full_name from public.profiles where id = v_actor),
    p_entity_type, p_entity_id, p_session_id, p_action, p_old, p_new
  );
end;
$$;

-- Generic row-change audit trigger. TG_ARGV[0] = audit action.
create or replace function app.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'tutor_code_hash' - 'updated_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'tutor_code_hash' - 'updated_at' end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;  -- no material change
  end if;
  perform app.write_audit(
    tg_argv[0],
    tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    null,
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

create trigger group_enrolments_audit after insert or update on public.group_enrolments
  for each row execute function app.audit_row_change('roster_change');
create trigger students_audit after insert or update on public.students
  for each row execute function app.audit_row_change('roster_change');
create trigger tutor_group_assignments_audit after insert or update on public.tutor_group_assignments
  for each row execute function app.audit_row_change('tutor_assignment_change');
create trigger modules_audit after insert or update on public.modules
  for each row execute function app.audit_row_change('master_data_change');
create trigger tutorial_groups_audit after insert or update on public.tutorial_groups
  for each row execute function app.audit_row_change('master_data_change');
create trigger profiles_audit after insert or update on public.profiles
  for each row execute function app.audit_row_change('tutor_profile_change');

-- Stamp the assigning lecturer automatically
create or replace function app.stamp_assigned_by()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_by := coalesce(new.assigned_by, app.actor_profile_id());
  end if;
  return new;
end;
$$;
create trigger tutor_group_assignments_stamp before insert on public.tutor_group_assignments
  for each row execute function app.stamp_assigned_by();

create or replace function app.stamp_created_by()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.created_by := coalesce(new.created_by, app.actor_profile_id());
  return new;
end;
$$;
create trigger modules_stamp before insert on public.modules
  for each row execute function app.stamp_created_by();

-- ---------------------------------------------------------------------------
-- Grants: least privilege (NFR §21.3). Start from nothing, then add back.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
revoke all on all functions in schema app from public;
grant usage on schema app to authenticated, service_role;
-- RLS policies call these as the invoking user:
grant execute on function app.is_lecturer() to authenticated, service_role;
grant execute on function app.current_lecturer_id() to authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Lecturer-facing grants (RLS further restricts these to the lecturer only)
grant select (id, auth_user_id, full_name, role, tutor_code_prefix, tutor_code_updated_at, is_active, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, is_active) on public.profiles to authenticated;

grant select, insert, update on public.modules to authenticated;
grant select, insert, update on public.tutorial_groups to authenticated;
grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.group_enrolments to authenticated;
grant select, insert, update on public.tutor_group_assignments to authenticated;
grant select on public.attendance_sessions to authenticated;   -- writes only via audited RPCs
grant select on public.attendance_records to authenticated;    -- writes only via audited RPCs
grant select on public.audit_logs to authenticated;
grant select on public.import_batches to authenticated;
-- tutor_code_attempts: service role only.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.modules                enable row level security;
alter table public.tutorial_groups        enable row level security;
alter table public.students               enable row level security;
alter table public.group_enrolments       enable row level security;
alter table public.tutor_group_assignments enable row level security;
alter table public.attendance_sessions    enable row level security;
alter table public.attendance_records     enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.import_batches         enable row level security;
alter table public.tutor_code_attempts    enable row level security;

-- profiles
create policy profiles_lecturer_select on public.profiles
  for select to authenticated using (app.is_lecturer());
create policy profiles_lecturer_update_tutors on public.profiles
  for update to authenticated
  using (app.is_lecturer() and role = 'tutor')
  with check (app.is_lecturer() and role = 'tutor');

-- master data: lecturer CRUD (no DELETE – soft delete via is_active)
create policy modules_lecturer_select on public.modules for select to authenticated using (app.is_lecturer());
create policy modules_lecturer_insert on public.modules for insert to authenticated with check (app.is_lecturer());
create policy modules_lecturer_update on public.modules for update to authenticated using (app.is_lecturer()) with check (app.is_lecturer());

create policy tutorial_groups_lecturer_select on public.tutorial_groups for select to authenticated using (app.is_lecturer());
create policy tutorial_groups_lecturer_insert on public.tutorial_groups for insert to authenticated with check (app.is_lecturer());
create policy tutorial_groups_lecturer_update on public.tutorial_groups for update to authenticated using (app.is_lecturer()) with check (app.is_lecturer());

create policy students_lecturer_select on public.students for select to authenticated using (app.is_lecturer());
create policy students_lecturer_insert on public.students for insert to authenticated with check (app.is_lecturer());
create policy students_lecturer_update on public.students for update to authenticated using (app.is_lecturer()) with check (app.is_lecturer());

create policy group_enrolments_lecturer_select on public.group_enrolments for select to authenticated using (app.is_lecturer());
create policy group_enrolments_lecturer_insert on public.group_enrolments for insert to authenticated with check (app.is_lecturer());
create policy group_enrolments_lecturer_update on public.group_enrolments for update to authenticated using (app.is_lecturer()) with check (app.is_lecturer());

create policy tga_lecturer_select on public.tutor_group_assignments for select to authenticated using (app.is_lecturer());
create policy tga_lecturer_insert on public.tutor_group_assignments for insert to authenticated with check (app.is_lecturer());
create policy tga_lecturer_update on public.tutor_group_assignments for update to authenticated using (app.is_lecturer()) with check (app.is_lecturer());

-- attendance + audit: lecturer read; writes only through security-definer RPCs
create policy attendance_sessions_lecturer_select on public.attendance_sessions for select to authenticated using (app.is_lecturer());
create policy attendance_records_lecturer_select on public.attendance_records for select to authenticated using (app.is_lecturer());
create policy audit_logs_lecturer_select on public.audit_logs for select to authenticated using (app.is_lecturer());
create policy import_batches_lecturer_select on public.import_batches for select to authenticated using (app.is_lecturer());

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker => caller's RLS applies)
-- ---------------------------------------------------------------------------
create view public.attendance_session_summary
with (security_invoker = true) as
select
  s.id,
  s.module_id,
  m.module_code,
  m.short_name       as module_short_name,
  m.module_name,
  s.tutorial_group_id,
  g.group_number,
  g.tutorial_code,
  s.tutor_profile_id,
  s.tutor_name_snapshot,
  t.tutor_code_prefix,
  s.class_date,
  s.class_time,
  s.saved_at,
  s.last_tutor_edit_at,
  s.last_lecturer_edit_at,
  s.apspace_status,
  s.apspace_keyed_at,
  s.apspace_keyed_by,
  k.full_name        as apspace_keyed_by_name,
  s.created_at,
  s.updated_at,
  coalesce(c.total, 0)   as total_students,
  coalesce(c.present, 0) as present_count,
  coalesce(c.absent, 0)  as absent_count
from public.attendance_sessions s
join public.modules m          on m.id = s.module_id
join public.tutorial_groups g  on g.id = s.tutorial_group_id
left join public.profiles t    on t.id = s.tutor_profile_id
left join public.profiles k    on k.id = s.apspace_keyed_by
left join lateral (
  select count(*)::int as total,
         count(*) filter (where r.status = 'present')::int as present,
         count(*) filter (where r.status = 'absent')::int  as absent
  from public.attendance_records r
  where r.attendance_session_id = s.id
) c on true;

create view public.attendance_record_details
with (security_invoker = true) as
select
  r.id,
  r.attendance_session_id,
  s.class_date,
  s.class_time,
  m.module_code,
  m.short_name as module_short_name,
  g.group_number,
  g.tutorial_code,
  s.tutor_profile_id,
  s.tutor_name_snapshot,
  s.apspace_status,
  r.student_id          as student_uuid,
  r.student_number_snapshot as student_id,
  r.student_name_snapshot   as student_name,
  r.status,
  r.remark,
  r.marked_by_profile_id,
  r.updated_at
from public.attendance_records r
join public.attendance_sessions s on s.id = r.attendance_session_id
join public.modules m             on m.id = s.module_id
join public.tutorial_groups g     on g.id = s.tutorial_group_id;

create view public.tutorial_group_overview
with (security_invoker = true) as
select
  g.id,
  g.module_id,
  m.module_code,
  m.short_name as module_short_name,
  g.group_number,
  g.tutorial_code,
  g.display_name,
  g.is_active,
  (select count(*)::int from public.group_enrolments e
     join public.students st on st.id = e.student_id
   where e.tutorial_group_id = g.id and e.is_active and st.is_active) as active_students,
  coalesce((
    select string_agg(p.full_name, ', ' order by p.full_name)
    from public.tutor_group_assignments a
    join public.profiles p on p.id = a.tutor_profile_id
    where a.tutorial_group_id = g.id and a.is_active and p.is_active
  ), '') as assigned_tutors
from public.tutorial_groups g
join public.modules m on m.id = g.module_id;

grant select on public.attendance_session_summary to authenticated, service_role;
grant select on public.attendance_record_details to authenticated, service_role;
grant select on public.tutorial_group_overview to authenticated, service_role;
