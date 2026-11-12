-- LOCAL TESTING ONLY. Shared test data. Fixed IDs keep the tests readable.
--   admin        a0..01          teacher Priya b0..01      teacher Arjun b0..02
--   student logins: Aisha c0..01, Ben c0..02, Dana c0..03 (no student record)
--   student records: Aisha d0..01, Ben d0..02, Chen d0..03 (no login)
--   programmes: General English e0..01, Conversational Tamil e0..02
--   classes: English Beginners Daily 10..01 (Priya, capacity 2, RM150 monthly)
--            Tamil Starter 10..02 (Arjun, RM40 per lesson)

insert into students (id, full_name, email, phone, status, consent_privacy_at) values
  ('d0000000-0000-0000-0000-000000000001', 'Aisha Rahman', 'aisha@test.my', '012-345 6789', 'active', now()),
  ('d0000000-0000-0000-0000-000000000002', 'Ben Lim', 'ben@test.my', '013-111 2222', 'active', now()),
  ('d0000000-0000-0000-0000-000000000003', 'Chen Wei', 'chen@test.my', null, 'active', now());

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@test.my', now(), '{"full_name":"Owner Admin"}', '{"invited_role":"admin"}'),
  ('b0000000-0000-0000-0000-000000000001', 'priya@test.my', now(), '{"full_name":"Priya Nair"}', '{"invited_role":"teacher"}'),
  ('b0000000-0000-0000-0000-000000000002', 'arjun@test.my', now(), '{"full_name":"Arjun Das"}', '{"invited_role":"teacher"}'),
  ('c0000000-0000-0000-0000-000000000001', 'aisha@test.my', now(), '{"full_name":"Aisha Rahman"}', '{}'),
  ('c0000000-0000-0000-0000-000000000002', 'ben@test.my', now(), '{"full_name":"Ben Lim"}', '{}'),
  ('c0000000-0000-0000-0000-000000000003', 'dana@test.my', now(), '{"full_name":"Dana Ong"}', '{}');

insert into teacher_languages (teacher_id, language_id)
select 'b0000000-0000-0000-0000-000000000001'::uuid, id from languages where slug = 'english'
union all select 'b0000000-0000-0000-0000-000000000002'::uuid, id from languages where slug in ('english', 'tamil');

insert into courses (id, name, language_id, description, active) values
  ('e0000000-0000-0000-0000-000000000001', 'General English', (select id from languages where slug = 'english'), 'Everyday English', true),
  ('e0000000-0000-0000-0000-000000000002', 'Conversational Tamil', (select id from languages where slug = 'tamil'), 'Speak Tamil', true);
insert into levels (id, course_id, name, monthly_fee, rank) values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Beginner', 120, 1),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Intermediate', 150, 2),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'Starter', 100, 1);

insert into classes (id, name, kind, level_id, teacher_id, capacity, fee, billing_frequency, start_date, mode, meeting_link, status) values
  ('10000000-0000-0000-0000-000000000001', 'English Beginners Daily', 'group', 'f0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 2, 150, 'monthly', biz_today() - 28, 'online', 'https://meet.example/eng', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Tamil Starter', 'group', 'f0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000002', 5, 40, 'per_lesson', biz_today() - 28, 'online', null, 'active');
insert into class_schedules (class_id, weekday, start_time, end_time)
select '10000000-0000-0000-0000-000000000001'::uuid, d, '10:00'::time, '11:00'::time from generate_series(0, 6) d
union all
select '10000000-0000-0000-0000-000000000002'::uuid, d, '14:00'::time, '15:00'::time from generate_series(0, 6) d;

insert into enrolments (student_id, class_id, status, start_date) values
  ('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active', biz_today() - 28),
  ('d0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'active', biz_today() - 28),
  ('d0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'active', biz_today() - 28);

select generate_lessons_internal(null, biz_today() - 28, biz_today() + 14);

insert into teacher_rates (teacher_id, basis, rate, applies_to) values
  ('b0000000-0000-0000-0000-000000000001', 'hourly', 50, 'all'),
  ('b0000000-0000-0000-0000-000000000002', 'per_lesson', 30, 'group'),
  ('b0000000-0000-0000-0000-000000000002', 'per_lesson', 60, 'one_to_one');

insert into teacher_booking_settings (teacher_id, accepts_bookings, min_notice_hours, max_advance_days, durations,
  slot_interval_minutes, requires_approval, price_per_hour)
values ('b0000000-0000-0000-0000-000000000002', true, 24, 30, '{60}', 60, true, 80);
insert into teacher_availability (teacher_id, weekday, start_time, end_time)
select 'b0000000-0000-0000-0000-000000000002', d, t.s, t.e
from generate_series(0, 6) d cross join (values ('08:00'::time, '12:00'::time), ('14:00', '18:00')) t(s, e);

-- Messages created by the fixtures are not part of any test.
delete from message_outbox;
delete from notifications;
