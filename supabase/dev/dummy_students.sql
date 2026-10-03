-- DEVELOPMENT ONLY – fictitious students for local testing / UAT rehearsal (PRD §27.1).
-- Never run against production.
insert into public.students (student_id, full_name)
select 'TP9' || lpad(n::text, 5, '0'),
       (array['Aiman','Nurul','Wei Jie','Priya','Hafiz','Siti','Jun Hao','Kavitha','Farah','Daniel',
              'Mei Ling','Arjun','Aisyah','Ravi','Zara','Hakim','Yi Xuan','Deepa','Irfan','Chloe'])[1 + (n % 20)]
       || ' ' ||
       (array['Abdullah','Tan','Lim','Raj','Ismail','Wong','Kumar','Ng','Rahman','Lee','Chong','Nair'])[1 + (n % 12)]
       || ' ' || n
from generate_series(1, 120) n
on conflict (student_id) do nothing;

-- 15 students per group across the 8 tutorial groups
insert into public.group_enrolments (tutorial_group_id, student_id)
select g.id, s.id
from (select id, row_number() over (order by student_id) - 1 as rn from public.students where student_id like 'TP9%') s
join (select id, row_number() over (order by tutorial_code) - 1 as gn from public.tutorial_groups) g
  on g.gn = (s.rn / 15)
on conflict (tutorial_group_id, student_id) do nothing;
