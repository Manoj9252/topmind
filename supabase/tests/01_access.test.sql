-- Accounts and access control: each check runs as that user with row-level security on.
select tests.owner();
select tests.eq((select profile_id from students where id = 'd0000000-0000-0000-0000-000000000001'),
  'c0000000-0000-0000-0000-000000000001'::uuid, 'a confirmed login is linked to the student record with the same email');
select tests.eq((select role::text from profiles where id = 'b0000000-0000-0000-0000-000000000001'), 'teacher', 'an invited teacher gets the teacher role');
select tests.eq((select role::text from profiles where id = 'c0000000-0000-0000-0000-000000000003'), 'student', 'a public signup is always a student');
select tests.ok(exists (select 1 from teacher_profiles where profile_id = 'b0000000-0000-0000-0000-000000000001'), 'a teacher profile is created automatically');
select tests.ok((select student_code from students where id = 'd0000000-0000-0000-0000-000000000001') ~ '^TMS-\d{5}$', 'students get a readable student ID');

-- Signup with role metadata in user-editable data cannot create an admin.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('c0000000-0000-0000-0000-000000000099', 'sneaky@test.my', now(), '{"full_name":"Sneaky","role":"admin","invited_role":"admin"}');
select tests.eq((select role::text from profiles where id = 'c0000000-0000-0000-0000-000000000099'), 'student',
  'roles in user-editable signup data are ignored');

-- Visitors
select tests.anon();
select tests.eq(tests.visible('students'), 0::bigint, 'visitors cannot read students');
select tests.eq(tests.visible('classes'), 0::bigint, 'visitors cannot read class records directly');
select tests.eq(tests.visible('availability_slots'), 0::bigint, 'visitors cannot read teacher availability');
select tests.eq(tests.visible('profiles'), 0::bigint, 'visitors cannot read profiles');
select tests.ok(tests.visible('courses') >= 2, 'visitors can read active programmes');
select tests.ok(jsonb_array_length(public_catalog() -> 'languages') >= 3, 'the public catalogue lists languages');
select tests.ok(position('meet.example' in public_catalog()::text) = 0, 'the public catalogue never exposes meeting links');
select tests.ok(public_settings() ->> 'business.email' = 'etopmind@gmail.com', 'public business details come from settings');
select tests.ok(public_settings() -> 'finance.invoice_prefix' is null, 'private settings are not public');
select tests.throws($$select admin_dashboard()$$, 'permission denied|administrator', 'visitors cannot open the admin dashboard');
select tests.throws($$select available_booking_slots()$$, 'permission denied|sign in', 'visitors cannot browse teacher availability');

-- Student Aisha
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('students'), 1::bigint, 'a student sees only her own student record');
select tests.eq(tests.visible('enrolments'), 1::bigint, 'a student sees only her own enrolment');
select tests.eq(tests.visible('classes'), 1::bigint, 'a student sees only her own class');
select tests.eq(tests.visible('profiles'), 1::bigint, 'a student sees only her own profile');
select tests.eq(tests.visible('teacher_rates'), 0::bigint, 'a student cannot see teacher pay rates');
select tests.eq(tests.visible('teacher_payouts'), 0::bigint, 'a student cannot see salary records');
select tests.eq(tests.visible('audit_logs'), 0::bigint, 'a student cannot see the audit log');
select tests.ok(tests.visible('sessions') > 0, 'a student sees the lessons of her class');
select tests.eq(tests.visible('sessions', 'class_id = ''10000000-0000-0000-0000-000000000002'''), 0::bigint,
  'a student cannot see lessons of other classes');
select tests.throws($$update profiles set role = 'admin' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'administrator', 'a student cannot promote herself');
select tests.throws($$update profiles set status = 'deactivated' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'administrator', 'a student cannot change her account status');
select tests.lives($$update profiles set phone = '012-000 0000' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'a student can update her own phone number');
select tests.throws($$select run_report('payments', '{}')$$, 'administrator', 'a student cannot run reports');
select tests.throws($$select enrol_student('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$$, 'administrator', 'a student cannot enrol herself');
select tests.throws($$select generate_monthly_invoices()$$, 'administrator', 'a student cannot generate invoices');
select tests.throws($$insert into students (full_name) values ('Fake')$$, 'row-level security', 'a student cannot create student records');

-- Teacher Priya
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('classes'), 1::bigint, 'a teacher sees only her own class');
select tests.eq(tests.visible('students'), 2::bigint, 'a teacher sees only students in her class');
select tests.eq(tests.visible('students', 'id = ''d0000000-0000-0000-0000-000000000003'''), 0::bigint, 'a teacher cannot see unrelated students');
select tests.eq(tests.visible('teacher_rates'), 1::bigint, 'a teacher sees only her own pay rate');
select tests.eq(tests.visible('invoices'), 0::bigint, 'a teacher cannot see invoices');
select tests.eq(tests.visible('payments'), 0::bigint, 'a teacher cannot see payments');
select tests.eq(tests.visible('sessions', 'class_id = ''10000000-0000-0000-0000-000000000002'''), 0::bigint,
  'a teacher cannot see another teacher''s lessons');
select tests.eq(tests.visible('app_settings', 'not is_public'), 0::bigint, 'a teacher cannot read private settings');
update app_settings set value = '"Hacked"' where key = 'business.name';
update students set full_name = 'Renamed' where id = 'd0000000-0000-0000-0000-000000000001';
select tests.owner();
select tests.ok((select value from app_settings where key = 'business.name') <> '"Hacked"'::jsonb, 'a teacher cannot change settings');
select tests.ok((select full_name from students where id = 'd0000000-0000-0000-0000-000000000001') <> 'Renamed', 'a teacher cannot edit student records');
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.throws($$update teacher_profiles set employment_status = 'inactive' where profile_id = 'b0000000-0000-0000-0000-000000000001'$$,
  'administrator', 'a teacher cannot change her own employment details');
select tests.lives($$update teacher_profiles set bio = 'I love grammar' where profile_id = 'b0000000-0000-0000-0000-000000000001'$$, 'a teacher can edit her own bio');

-- Administrator
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('students'), 3::bigint, 'the administrator sees every student');
select tests.eq(tests.visible('classes'), 2::bigint, 'the administrator sees every class');
select tests.ok(tests.visible('audit_logs') > 0, 'the administrator can read the audit log');
select tests.lives($$update app_settings set value = '"Top Mind Enterprise Sdn Bhd"' where key = 'business.name'$$, 'the administrator can change settings');
select tests.ok(exists (select 1 from audit_logs where table_name = 'app_settings' and actor_id = 'a0000000-0000-0000-0000-000000000001'),
  'setting changes are recorded in the audit log with who made them');

-- Suspension is enforced in the database, not just hidden in the app.
select tests.lives($$update profiles set status = 'suspended' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'the administrator can suspend an account');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('students'), 0::bigint, 'a suspended student loses access to her records');
select tests.eq(tests.visible('profiles'), 1::bigint, 'a suspended student can still see her own profile status');
select tests.owner();
update profiles set status = 'suspended' where id = 'a0000000-0000-0000-0000-000000000001';
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('students'), 0::bigint, 'a suspended administrator loses admin access');
