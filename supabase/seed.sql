-- OPTIONAL sample catalogue for a new, empty project. Run AFTER all migrations.
--
-- Fills the public pages with sample programmes, levels and rooms while you set up.
-- It adds programmes and levels for the active languages, one centre and two rooms.
-- The fees are placeholders: set real fees in Admin → Catalogue before
-- registrations open, or delete what you do not need.
-- It creates no students, teachers, classes or invoices. Safe to run more than once.
begin;

insert into courses (name, language_id, summary, description, audience, formats, sort_order)
select v.name, l.id, v.summary, v.description, v.audience, v.formats, v.sort_order
from (values
  ('english', 'General English', 'Everyday English for work, study and travel',
   'Build confidence in speaking, listening, reading and writing through real-life practice in small groups.', 'adults', '{group,one_to_one}'::text[], 1),
  ('english', 'English for Beginners', 'Start from zero at a friendly pace',
   'For learners with little or no English. Slow-paced lessons with plenty of speaking practice and no fear of mistakes.', 'all', '{group}'::text[], 2),
  ('tamil', 'Conversational Tamil', 'Speak Tamil with family, friends and colleagues',
   'Practical speaking and listening first, with reading and writing introduced step by step.', 'all', '{group,one_to_one}'::text[], 3),
  ('malay', 'Bahasa Melayu for Everyday Life', 'Malay for daily conversations in Malaysia',
   'Greetings, shopping, directions and work conversations, taught through role-play and real situations.', 'adults', '{group,one_to_one}'::text[], 4)
) as v(lang, name, summary, description, audience, formats, sort_order)
join languages l on l.slug = v.lang
where not exists (select 1 from courses c where c.slug = slugify(v.name) or lower(c.name) = lower(v.name));

insert into levels (course_id, name, rank, monthly_fee, description)
select c.id, v.name, v.rank, v.fee, v.description
from courses c
cross join (values
  ('Level 1', 1, 120.00, 'Foundations: everyday words, simple sentences and confident introductions.'),
  ('Level 2', 2, 140.00, 'Building up: longer conversations, common grammar and short texts.')
) as v(name, rank, fee, description)
where c.name in ('General English', 'English for Beginners', 'Conversational Tamil', 'Bahasa Melayu for Everyday Life')
  and not exists (select 1 from levels l where l.course_id = c.id and l.name = v.name);

insert into centres (name, address)
select 'Main centre', null
where not exists (select 1 from centres);

insert into classrooms (name, capacity, centre_id)
select v.name, v.capacity, (select id from centres order by created_at limit 1)
from (values ('Room A', 12), ('Room B', 8)) as v(name, capacity)
where not exists (select 1 from classrooms r where r.name = v.name);

commit;
