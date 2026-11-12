-- Portal helpers: students correct their own details (PDPA right of correction)
-- and see their own one-to-one bookings with the teacher's name.
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.lives($$select update_my_student_profile('{"full_name": "Aisha Binti Rahman", "phone": "+60 12-345 6789",
  "preferred_contact": "whatsapp", "learning_objectives": "Speak confidently at work", "consent_whatsapp": true,
  "date_of_birth": "2001-04-05", "status": "inactive", "email": "someone@else.my"}')$$, 'a student can correct their own details');
select tests.owner();
select tests.eq((select full_name from students where id = 'd0000000-0000-0000-0000-000000000001'), 'Aisha Binti Rahman', 'the student record is updated');
select tests.eq((select full_name from profiles where id = 'c0000000-0000-0000-0000-000000000001'), 'Aisha Binti Rahman', 'the login name follows the student record');
select tests.eq((select consent_whatsapp from students where id = 'd0000000-0000-0000-0000-000000000001'), true, 'WhatsApp consent is recorded');
select tests.eq((select email from students where id = 'd0000000-0000-0000-0000-000000000001'), 'aisha@test.my', 'the email address cannot be changed this way');
select tests.eq((select status from students where id = 'd0000000-0000-0000-0000-000000000001'), 'active', 'the student status cannot be changed this way');

select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.throws($$select update_my_student_profile('{"full_name": "A"}')$$, 'full name', 'a full name is required');
select tests.throws($$select update_my_student_profile('{"full_name": "Aisha", "phone": "call me"}')$$, 'valid phone', 'phone numbers are checked');
select tests.throws($$select update_my_student_profile('{"full_name": "Aisha", "preferred_contact": "whatsapp"}')$$, 'phone number',
  'WhatsApp as the contact method needs a phone number');
select tests.login('c0000000-0000-0000-0000-000000000003');
select tests.throws($$select update_my_student_profile('{"full_name": "Dana Ong"}')$$, 'not linked', 'a login without a student record cannot use it');
select tests.eq(my_bookings(), '[]'::jsonb, 'a login without a student record has no bookings');
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.throws($$select update_my_student_profile('{"full_name": "Priya Nair"}')$$, 'not linked', 'teachers cannot use the student update');

select tests.login('c0000000-0000-0000-0000-000000000001');
do $$ declare b bookings; begin
  b := request_booking('b0000000-0000-0000-0000-000000000002', tests.myt(4, '09:00'), 60, (select id from languages where slug = 'tamil'), 'Travel Tamil');
  perform set_config('test.b', b.id::text, true);
end $$;
select tests.eq(jsonb_array_length(my_bookings()), 1, 'a student sees their own booking');
select tests.eq(my_bookings() -> 0 ->> 'teacher', 'Arjun Das', 'with the teacher''s name');
select tests.eq(my_bookings() -> 0 ->> 'language', 'Tamil', 'and the language');
select tests.eq((my_bookings() -> 0 ->> 'can_change')::boolean, true, 'a pending request can still be moved or cancelled');
select tests.eq(tests.visible('profiles', $$id = 'b0000000-0000-0000-0000-000000000002'$$), 0::bigint, 'students still cannot read staff profiles directly');
select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.eq(jsonb_array_length(my_bookings()), 0, 'other students do not see it');

select tests.owner();
update bookings set status = 'approved', starts_at = now() + interval '3 hours', ends_at = now() + interval '4 hours'
where id = current_setting('test.b')::uuid;
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq((my_bookings() -> 0 ->> 'can_change')::boolean, false, 'a confirmed lesson inside the cancellation window cannot be changed by the student');

select tests.anon();
select tests.ok(public_settings() ? 'academic.attendance_edit_days', 'the attendance edit window is visible to the portals');
select tests.ok(not (public_settings() ? 'finance.invoice_prefix'), 'internal settings stay private');

-- The teacher and student pages read some tables directly; row-level security
-- must give each role exactly its own rows.
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('classes'), 1::bigint, 'a teacher sees only the classes they teach');
select tests.eq(tests.visible('class_schedules', $$class_id <> '10000000-0000-0000-0000-000000000001'$$), 0::bigint, 'and only those classes'' weekly times');
select tests.eq(tests.visible('enrolments'), 2::bigint, 'the class roster is visible to its teacher');
select tests.eq(tests.visible('students'), 2::bigint, 'as are the students in it, and no others');
select tests.eq(tests.visible('sessions', $$teacher_id <> 'b0000000-0000-0000-0000-000000000001'$$), 0::bigint, 'a teacher does not see other teachers'' lessons');
select tests.eq(tests.visible('teacher_profiles'), 1::bigint, 'a teacher sees only their own teacher profile');
select tests.ok(tests.visible('teacher_languages') > 0, 'teachers can read teaching languages for their profile page');
select tests.ok((select count(*) from lessons_missing_attendance('b0000000-0000-0000-0000-000000000001')) > 0, 'past lessons without attendance are listed for the teacher');

select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.ok((select count(*) from attendance_summary()) > 0, 'a student can read their own attendance summary');
select tests.eq((select count(*) from attendance_summary() where student_id <> 'd0000000-0000-0000-0000-000000000001'), 0::bigint, 'and nobody else''s');
select tests.eq(tests.visible('sessions', $$class_id = '10000000-0000-0000-0000-000000000002'$$), 0::bigint, 'a student does not see lessons of classes they are not in');
select tests.ok(tests.visible('payment_methods') > 0, 'students can read the active payment methods');
select tests.eq(tests.visible('payment_methods', 'not is_active'), 0::bigint, 'but not inactive ones');
select tests.eq(tests.visible('invoice_overview', $$student_id <> 'd0000000-0000-0000-0000-000000000001'$$), 0::bigint, 'the invoice list shows only the student''s own invoices');

select tests.anon();
select tests.eq(public_settings() -> 'finance.online_payments_enabled', 'false'::jsonb, 'online payments stay off until a gateway is configured');
