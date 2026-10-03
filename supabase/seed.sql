-- =============================================================================
-- Initial deployment configuration (PRD §6.1). Structural data only.
-- * NO student personal data is stored in source control – import the supplied
--   XLSX rosters with `npm run import:roster` or the lecturer Import screen.
-- * NO tutor codes are stored here (FR-TUT-007). Tutor profiles are created
--   with an unusable placeholder hash; run `npm run codes:generate` after
--   deployment to generate MAY###, AMIR###, ARYA###, LATIFA### privately.
-- Idempotent: safe to run more than once.
-- =============================================================================

insert into public.modules (module_code, short_name, module_name, intake_semester)
values
  ('CT046-3-2-SDM',    'SDM',  'System Development Methods',            null),
  ('AAPP003-4-2-ISWE', 'ISWE', 'Introduction to Software Engineering',  null)
on conflict (module_code) do nothing;

-- All tutorial groups present in the supplied rosters (§6.1.1, §6.1.3)
insert into public.tutorial_groups (module_id, group_number, tutorial_code)
select m.id, g.group_number, m.module_code || '-T-' || g.group_number
from (values
  ('CT046-3-2-SDM', '38'), ('CT046-3-2-SDM', '39'), ('CT046-3-2-SDM', '40'),
  ('CT046-3-2-SDM', '41'), ('CT046-3-2-SDM', '42'),
  ('AAPP003-4-2-ISWE', '7'), ('AAPP003-4-2-ISWE', '8'), ('AAPP003-4-2-ISWE', '9')
) as g(module_code, group_number)
join public.modules m on m.module_code = g.module_code
on conflict (module_id, group_number) do nothing;

-- Tutor profiles (FR-TUT-006). Placeholder hash cannot match any code.
insert into public.profiles (full_name, role, tutor_code_prefix, tutor_code_hash)
select t.full_name, 'tutor', t.prefix, 'unset:' || gen_random_uuid()
from (values ('May', 'MAY'), ('Amir', 'AMIR'), ('Arya', 'ARYA'), ('Latifa', 'LATIFA')) as t(full_name, prefix)
where not exists (
  select 1 from public.profiles p where p.role = 'tutor' and p.tutor_code_prefix = t.prefix
);

-- Initial assignments: May -> SDM 39/40, Latifa -> SDM 41, Amir -> ISWE 7, Arya -> ISWE 9.
-- SDM-T-38, SDM-T-42 and ISWE-T-8 remain lecturer-controlled / unassigned (§6.1.3).
insert into public.tutor_group_assignments (tutor_profile_id, tutorial_group_id)
select p.id, g.id
from (values
  ('MAY',    'CT046-3-2-SDM-T-39'),
  ('MAY',    'CT046-3-2-SDM-T-40'),
  ('LATIFA', 'CT046-3-2-SDM-T-41'),
  ('AMIR',   'AAPP003-4-2-ISWE-T-7'),
  ('ARYA',   'AAPP003-4-2-ISWE-T-9')
) as a(prefix, tutorial_code)
join public.profiles p on p.role = 'tutor' and p.tutor_code_prefix = a.prefix
join public.tutorial_groups g on g.tutorial_code = a.tutorial_code
where not exists (
  select 1 from public.tutor_group_assignments x
  where x.tutor_profile_id = p.id and x.tutorial_group_id = g.id and x.is_active
);
