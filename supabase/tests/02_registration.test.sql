-- Public registration, duplicate prevention, tracking and the admin review workflow.
select tests.anon();
select tests.throws($$select submit_registration('{"student_name":"X Y","email":"bad","consent_privacy":true}')$$, 'valid email', 'registration rejects an invalid email');
select tests.throws($$select submit_registration('{"student_name":"Siti Aminah","email":"siti@test.my"}')$$, 'privacy policy', 'registration requires privacy consent');
select tests.throws($$select submit_registration(jsonb_build_object('student_name', 'Kid Learner', 'email', 'kid@test.my', 'consent_privacy', true,
  'date_of_birth', (biz_today() - 3650)::text))$$, 'guardian', 'learners under 18 need a guardian name');
select tests.throws($$select submit_registration('{"student_name":"Siti Aminah","email":"siti@test.my","consent_privacy":true,"preferred_contact":"whatsapp"}')$$,
  'phone number', 'choosing WhatsApp contact needs a phone number');
select tests.throws($$select submit_registration(jsonb_build_object('student_name', 'Siti Aminah', 'email', 'siti@test.my', 'consent_privacy', true,
  'course_id', 'e0000000-0000-0000-0000-000000000001', 'language_id', (select id from languages where slug = 'tamil')))$$,
  'not offered for the selected language', 'the programme must belong to the chosen language');

do $$ declare r jsonb; begin
  r := submit_registration(jsonb_build_object('student_name', 'Siti Aminah', 'email', 'Siti@Test.my', 'phone', '011-2233 4455',
    'consent_privacy', true, 'consent_whatsapp', true, 'course_id', 'e0000000-0000-0000-0000-000000000001',
    'preferred_days', '[1,3]'::jsonb, 'preferred_times', '["morning"]'::jsonb, 'mode', 'online', 'objectives', 'Speak confidently at work'));
  perform tests.eq(r ->> 'status', 'pending', 'a valid registration is accepted');
  perform tests.ok(length(r ->> 'tracking_code') = 10, 'a 10-character tracking code is issued');
  perform tests.ok(jsonb_array_length(r -> 'recommendations') >= 1, 'matching classes are recommended straight away');
  perform set_config('test.code', r ->> 'tracking_code', true);
end $$;
select tests.eq((select status from track_registration(current_setting('test.code'))), 'pending', 'the applicant can track the registration');
select tests.eq((select count(*) from track_registration('NOPE000000')), 0::bigint, 'an unknown tracking code shows nothing');
select tests.eq(submit_registration('{"student_name":"Siti Aminah","email":"siti@test.my","consent_privacy":true,"course_id":"e0000000-0000-0000-0000-000000000001"}') ->> 'status',
  'duplicate', 'a second open registration for the same email and programme is refused');
select tests.ok(submit_registration('{"student_name":"Bot","email":"bot@test.my","consent_privacy":true,"website":"spam.example"}') ->> 'tracking_code' is null,
  'honeypot submissions are dropped');

select tests.owner();
select tests.eq((select count(*) from registrations where email = 'siti@test.my'), 1::bigint, 'only one registration is stored for the duplicate');
select tests.eq((select count(*) from registrations where email = 'bot@test.my'), 0::bigint, 'nothing is stored for a bot');
select tests.ok(exists (select 1 from message_outbox where template_key = 'registration_received' and recipient = 'siti@test.my' and channel = 'email'),
  'an acknowledgement email is queued');
select tests.ok(exists (select 1 from message_outbox where template_key = 'registration_received' and recipient = 'siti@test.my'
  and dedupe_key like '%' || to_char(biz_today(), 'YYYY-MM-DD')), 'the duplicate attempt re-sends the confirmation (once a day)');
select tests.ok(exists (select 1 from message_outbox where template_key = 'admin_new_registration'), 'an administrator alert email is queued');
select tests.ok(exists (select 1 from notifications n join profiles p on p.id = n.user_id where p.role = 'admin' and n.type = 'admin_new_registration'),
  'administrators get an in-app alert');
select tests.eq((select count(*) from message_outbox where channel = 'whatsapp'), 0::bigint, 'no WhatsApp messages while WhatsApp is not enabled');
select tests.ok((select body from message_outbox where template_key = 'registration_received' and recipient = 'siti@test.my' limit 1) like '%' || current_setting('test.code') || '%',
  'the acknowledgement contains the tracking code');

select tests.anon();
select tests.throws($$insert into registrations (student_name, email, status) values ('X', 'x@test.my', 'pending')$$, 'row-level security|permission',
  'browsers cannot bypass validation with direct inserts');

select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.throws($$select approve_registration('00000000-0000-0000-0000-000000000000')$$, 'administrator', 'students cannot approve registrations');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws(format($$select reject_registration(%L, '  ')$$, (select id from registrations where email = 'siti@test.my')), 'reason',
  'a rejection needs a reason');

-- English Beginners Daily is full (2 of 2), so approval puts the student on the waiting list.
do $$ declare r jsonb; v_reg uuid := (select id from registrations where email = 'siti@test.my'); begin
  r := approve_registration(v_reg, '10000000-0000-0000-0000-000000000001', null, null, 'Placed by test');
  perform tests.eq(r ->> 'registration_status', 'waitlisted', 'approving into a full class puts the student on the waiting list');
  perform tests.eq(r ->> 'enrolment_status', 'waitlisted', 'the enrolment is waitlisted, not active');
  perform tests.eq((select count(*) from students where lower(email) = 'siti@test.my'), 1::bigint, 'a student record is created from the registration');
  perform tests.ok(exists (select 1 from placements where registration_id = v_reg), 'the placement decision is recorded');
  perform tests.ok((select consent_privacy_at from students where lower(email) = 'siti@test.my') is not null, 'privacy consent carries over to the student record');
end $$;

-- An email that already belongs to a student is linked, not duplicated.
do $$ declare v_code text; r jsonb; begin
  perform tests.anon();
  v_code := submit_registration('{"student_name":"Chen Wei","email":"CHEN@test.my","consent_privacy":true,"course_id":"e0000000-0000-0000-0000-000000000002"}') ->> 'tracking_code';
  perform tests.login('a0000000-0000-0000-0000-000000000001');
  r := approve_registration((select id from registrations where tracking_code = v_code), '10000000-0000-0000-0000-000000000002');
  perform tests.eq((r ->> 'student_id')::uuid, 'd0000000-0000-0000-0000-000000000003'::uuid, 'the existing student record is reused, not duplicated');
  perform tests.eq(r ->> 'registration_status', 'converted', 'the registration is converted when the class has space');
  perform tests.eq(r ->> 'enrolment_status', 'active', 'the student is actively enrolled');
  perform tests.throws(format('select approve_registration(%L)', (select id from registrations where tracking_code = v_code)), 'already converted',
    'a converted registration cannot be approved twice');
end $$;
select tests.owner();
select tests.ok(exists (select 1 from message_outbox where template_key = 'class_assigned' and recipient = 'chen@test.my'), 'a class assignment email is queued');
select tests.ok((select body from message_outbox where template_key = 'class_assigned' and recipient = 'chen@test.my' limit 1) like '%Tamil Starter%',
  'the class email names the class');
select tests.ok(exists (select 1 from message_outbox where template_key = 'registration_approved' and recipient = 'chen@test.my'), 'an approval email is queued');

select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ declare v_code text; begin
  perform tests.anon();
  v_code := submit_registration('{"student_name":"Info Needed","email":"info@test.my","consent_privacy":true}') ->> 'tracking_code';
  perform tests.login('a0000000-0000-0000-0000-000000000001');
  perform request_registration_info((select id from registrations where tracking_code = v_code), 'Which days suit you?');
  perform tests.eq((select status from registrations where tracking_code = v_code), 'info_requested', 'the administrator can request more information');
  perform reject_registration((select id from registrations where tracking_code = v_code), 'No reply received');
  perform tests.eq((select decision_reason from registrations where tracking_code = v_code), 'No reply received', 'the rejection reason is recorded');
  perform tests.ok(exists (select 1 from message_outbox where template_key = 'registration_rejected' and recipient = 'info@test.my'),
    'the applicant is told about the rejection');
end $$;
