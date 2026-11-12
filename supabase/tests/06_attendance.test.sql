-- Attendance: teacher scope, roster checks, edit window, history, summaries, absence alerts.
select tests.owner();
select set_config('test.y1', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() - 1), true);
select set_config('test.y2', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() - 2), true);
select set_config('test.y3', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() - 3), true);
select set_config('test.old', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() - 10), true);
select set_config('test.tomorrow', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() + 1), true);
select set_config('test.other', (select id::text from sessions where class_id = '10000000-0000-0000-0000-000000000002' and session_date = biz_today() - 1), true);

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq((select count(*) from lesson_roster(current_setting('test.y1')::uuid)), 2::bigint, 'the lesson roster lists the enrolled students');
do $$ declare r jsonb; v uuid := current_setting('test.y1')::uuid; begin
  r := save_attendance(v, jsonb_build_array(
    jsonb_build_object('student_id', 'd0000000-0000-0000-0000-000000000001', 'status', 'present'),
    jsonb_build_object('student_id', 'd0000000-0000-0000-0000-000000000002', 'status', 'absent', 'remarks', 'Sick')), true, 'Past tense', null);
  perform tests.eq((r ->> 'saved')::int, 2, 'the teacher records attendance for the whole class');
  perform tests.eq((select status from sessions where id = v), 'completed', 'the lesson is marked completed');
  perform tests.eq((select recorded_by from attendance where session_id = v limit 1), 'b0000000-0000-0000-0000-000000000001'::uuid, 'who recorded it is stored');
  perform tests.eq((select topic from sessions where id = v), 'Past tense', 'the lesson topic is saved');
end $$;
select tests.throws($$select save_attendance(current_setting('test.other')::uuid, '[]')$$, 'own lessons', 'a teacher cannot record another teacher''s lesson');
select tests.throws($$select save_attendance(current_setting('test.y2')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000003","status":"present"}]')$$,
  'not enrolled', 'students who are not in the class cannot be marked');
select tests.throws($$select save_attendance(current_setting('test.tomorrow')::uuid, '[]')$$, 'day of the lesson', 'future lessons cannot be marked yet');
select tests.throws($$select save_attendance(current_setting('test.old')::uuid, '[]')$$, 'only be changed by an administrator',
  'teachers cannot change attendance after the edit window');
select tests.throws($$select save_attendance(current_setting('test.y2')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"}]', true)$$,
  'Mark every student', 'a lesson cannot be completed with students unmarked');
select tests.lives($$select save_attendance(current_setting('test.y2')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"pending"}]', false)$$,
  'a partial register can be saved as a draft');
select tests.eq((select status from sessions where id = current_setting('test.y2')::uuid), 'scheduled', 'a draft register does not complete the lesson');
select tests.throws($$insert into attendance (session_id, student_id, status) values (current_setting('test.y2')::uuid, 'd0000000-0000-0000-0000-000000000002', 'present')$$,
  'row-level security', 'attendance can only be written through the checked function');

-- Changes are kept
select tests.lives($$select save_attendance(current_setting('test.y1')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000002","status":"excused","remarks":"Doctor note"}]')$$,
  'a teacher can correct attendance inside the edit window');
select tests.ok(exists (select 1 from attendance_history where session_id = current_setting('test.y1')::uuid and old_status = 'absent' and new_status = 'excused'),
  'the change is recorded in the attendance history');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.lives($$select save_attendance(current_setting('test.old')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"late"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"present"}]')$$,
  'an administrator can correct older attendance');

-- Student view and summaries
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('attendance', 'student_id = ''d0000000-0000-0000-0000-000000000002'''), 0::bigint, 'a student cannot see classmates'' attendance');
do $$ declare s record; begin
  select * into s from attendance_summary(null, null, '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
  perform tests.eq(s.present, 2::bigint, 'the summary counts lessons attended');
  perform tests.eq(s.late, 1::bigint, 'the summary counts late arrivals');
  perform tests.eq(s.attendance_percent, 100.0, 'the attendance percentage uses marked lessons');
  perform tests.ok(s.scheduled >= 28, 'the summary counts every scheduled lesson so far');
  perform tests.ok(s.unmarked > 0, 'unmarked lessons are reported separately');
end $$;

-- Missing attendance and repeated absences (threshold set to 2 for the test)
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.ok((select count(*) from lessons_missing_attendance()) > 20, 'past lessons without attendance are listed for the teacher');
select tests.owner();
update app_settings set value = '2' where key = 'academic.absence_alert_threshold';
delete from notifications; delete from message_outbox;
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.lives($$select save_attendance(current_setting('test.y3')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"absent"}]')$$,
  'marking a first absence');
select tests.owner();
select tests.eq((select count(*) from notifications where type = 'admin_absence_alert'), 0::bigint, 'no alert before the threshold');
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.lives($$select save_attendance(current_setting('test.y2')::uuid, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"absent"}]')$$,
  'marking a second absence');
select tests.owner();
select tests.ok(exists (select 1 from notifications where type = 'admin_absence_alert'), 'administrators are alerted after repeated absences');
select tests.ok(exists (select 1 from message_outbox where template_key = 'absence_check_in' and recipient = 'ben@test.my'),
  'the student gets a supportive check-in message');
