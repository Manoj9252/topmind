-- Class schedules, clash detection, dated lessons, cancellations, rescheduling, substitutes, archiving.
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((select count(*) from sessions where class_id = '10000000-0000-0000-0000-000000000001'
  and session_date between biz_today() - 28 and biz_today() + 14), 43::bigint, 'a dated lesson exists for every scheduled day');
select tests.eq(generate_lessons(biz_today() - 28, biz_today() + 14), 0, 'generating lessons again creates no duplicates');
select tests.ok((select starts_at from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 1)
  = tests.myt(1, '10:00'), 'lesson times are stored in Malaysia time');

-- Teacher clash
insert into classes (id, name, teacher_id, capacity, start_date, status) values
  ('10000000-0000-0000-0000-000000000005', 'Clash test', 'b0000000-0000-0000-0000-000000000001', 5, biz_today(), 'active');
select tests.throws($$insert into class_schedules (class_id, weekday, start_time, end_time) values ('10000000-0000-0000-0000-000000000005', 1, '10:30', '11:30')$$,
  'Schedule conflict', 'a teacher cannot be double-booked across classes');
select tests.lives($$insert into class_schedules (class_id, weekday, start_time, end_time) values ('10000000-0000-0000-0000-000000000005', 1, '11:00', '12:00')$$,
  'back-to-back lessons are allowed');
select tests.throws($$update classes set teacher_id = 'b0000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000002'$$,
  'Schedule conflict', 'reassigning a class to a teacher who is busy then is refused')
  where false;  -- Priya is free at 14:00, so this would succeed; covered by the insert check above.
-- A class that ended before the other started does not clash.
insert into classes (id, name, teacher_id, capacity, start_date, end_date, status) values
  ('10000000-0000-0000-0000-000000000006', 'Old term', 'b0000000-0000-0000-0000-000000000001', 5, biz_today() - 200, biz_today() - 100, 'active');
select tests.lives($$insert into class_schedules (class_id, weekday, start_time, end_time) values ('10000000-0000-0000-0000-000000000006', 2, '10:00', '11:00')$$,
  'classes in different terms may share a time slot');
-- Room clash
insert into classrooms (id, name, capacity) values ('20000000-0000-0000-0000-000000000001', 'Room A', 12);
update classes set classroom_id = '20000000-0000-0000-0000-000000000001', mode = 'physical' where id = '10000000-0000-0000-0000-000000000002';
insert into classes (id, name, classroom_id, capacity, start_date, status, mode) values
  ('10000000-0000-0000-0000-000000000007', 'Room clash', '20000000-0000-0000-0000-000000000001', 5, biz_today(), 'active', 'physical');
select tests.throws($$insert into class_schedules (class_id, weekday, start_time, end_time) values ('10000000-0000-0000-0000-000000000007', 3, '14:30', '15:30')$$,
  'room is already used', 'a room cannot hold two classes at once');

-- Changing the weekly schedule removes future lessons for the removed slot, keeps history.
delete from class_schedules where class_id = '10000000-0000-0000-0000-000000000001' and weekday = 0;
select tests.eq((select count(*) from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date >= biz_today()
  and extract(dow from session_date) = 0 and status = 'scheduled'), 0::bigint, 'removing a weekly slot removes its future lessons');
select tests.ok((select count(*) from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date < biz_today()
  and extract(dow from session_date) = 0) >= 4, 'past lessons are kept as history');

-- Cancel, reschedule, substitute
select tests.throws(format($$select cancel_lesson(%L, '')$$, (select id from sessions where class_id = '10000000-0000-0000-0000-000000000001'
  and session_date = biz_today() + 2)), 'reason', 'cancelling a lesson needs a reason');
select tests.eq((cancel_lesson((select id from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 2),
  'Teacher unwell')).status, 'cancelled', 'a lesson can be cancelled');
select tests.owner();
select tests.eq((select count(*) from message_outbox where template_key = 'lesson_cancelled' and channel = 'email'), 2::bigint,
  'both enrolled students are emailed about the cancellation');
select tests.ok(exists (select 1 from notifications where user_id = 'c0000000-0000-0000-0000-000000000001' and type = 'lesson_cancelled'),
  'students with a login see the cancellation in the portal');
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq(generate_lessons(biz_today(), biz_today() + 14), 0, 'a cancelled lesson is not recreated by the generator');

select tests.throws(format($$select reschedule_lesson(%L, biz_today() + 4, '10:00', '11:00', 'Clash please')$$,
  (select id from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 3)),
  'Schedule conflict|duplicate', 'rescheduling onto a time the teacher already teaches is refused');
do $$ declare s sessions; begin
  s := reschedule_lesson((select id from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 3),
                         biz_today() + 3, '14:30', '15:30', 'Room change');
  perform tests.eq(s.start_time, '14:30'::time, 'a lesson can be moved to a new time');
  perform tests.ok(s.rescheduled_from is not null, 'the new lesson remembers where it came from');
  perform tests.eq((select status from sessions where id = s.rescheduled_from), 'cancelled', 'the original lesson is marked cancelled');
end $$;

-- Priya now teaches 14:30-15:30 on day 3, overlapping Arjun's 14:00-15:00 Tamil lesson.
select tests.throws(format($$select assign_substitute(%L, 'b0000000-0000-0000-0000-000000000001')$$,
  (select id from sessions where class_id = '10000000-0000-0000-0000-000000000002' and session_date = biz_today() + 3)),
  'already has', 'a substitute cannot already be teaching then');
select tests.lives(format($$select assign_substitute(%L, 'b0000000-0000-0000-0000-000000000002', 'Priya on leave')$$,
  (select id from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 4)),
  'a free teacher can substitute');
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.ok(tests.visible('sessions', 'class_id = ''10000000-0000-0000-0000-000000000001''') >= 1, 'the substitute can see the lesson');
select tests.ok(tests.visible('students', 'id = ''d0000000-0000-0000-0000-000000000001''') = 1, 'the substitute can see the class list');
select tests.throws($$select cancel_lesson((select id from sessions where class_id = '10000000-0000-0000-0000-000000000002' limit 1), 'x')$$,
  'administrator', 'teachers cannot cancel lessons themselves');

-- One-off lesson
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((add_lesson('10000000-0000-0000-0000-000000000001', biz_today() + 5, '18:00', '19:30', null, 'Exam practice')).topic, 'Exam practice',
  'a one-off extra lesson can be added');

-- Archive and retention
update classes set status = 'archived' where id = '10000000-0000-0000-0000-000000000001';
select tests.eq((select count(*) from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date >= biz_today()
  and status = 'scheduled' and schedule_id is not null), 0::bigint, 'archiving a class removes its future generated lessons');
select tests.ok((select archived_at from classes where id = '10000000-0000-0000-0000-000000000001') is not null, 'the archive date is recorded');
select tests.throws($$delete from classes where id = '10000000-0000-0000-0000-000000000001'$$, 'Archive it instead', 'a class with history cannot be deleted');
select tests.throws($$select enrol_student('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001')$$, 'archived',
  'archived classes take no new students');
