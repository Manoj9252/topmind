-- Personal data requests (PDPA): a copy of your data, deletion requests, and
-- anonymising a former student while financial records are kept.
select tests.owner();
insert into registrations (student_name, email, phone, status, student_id)
values ('Aisha Rahman', 'aisha@test.my', '012-345 6789', 'converted', 'd0000000-0000-0000-0000-000000000001');
insert into enquiries (name, email, message, source) values ('Aisha', 'aisha@test.my', 'Do you teach evening classes?', 'website');
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv', (create_invoice('d0000000-0000-0000-0000-000000000001', '[{"description":"Tuition","unit_price":150}]', null, null, null, true)).id::text, true);

-- A copy of your own data, and only yours.
select tests.login('c0000000-0000-0000-0000-000000000001');
do $$ declare v jsonb := export_my_data(); begin
  perform tests.eq(v -> 'account' ->> 'email', 'aisha@test.my', 'the export contains the account');
  perform tests.eq(v -> 'student_records' -> 0 ->> 'full_name', 'Aisha Rahman', 'and the student record');
  perform tests.eq(jsonb_array_length(v -> 'enrolments'), 1, 'and the enrolments');
  perform tests.eq(jsonb_array_length(v -> 'invoices'), 1, 'and issued invoices');
  perform tests.eq(jsonb_array_length(v -> 'registrations'), 1, 'and registrations');
  perform tests.eq(jsonb_array_length(v -> 'enquiries'), 1, 'and enquiries sent with the same email');
  perform tests.ok(v::text not like '%Ben Lim%' and v::text not like '%ben@test.my%', 'nothing about other students is included');
  perform tests.ok(v -> 'data_controller' ->> 'name' is not null, 'the academy is named as the data controller');
  perform tests.ok(not (v ? 'teacher_profile'), 'students get no staff sections');
end $$;
select tests.eq((select status from privacy_requests where kind = 'export' and profile_id = 'c0000000-0000-0000-0000-000000000001'), 'completed',
  'each export is recorded');
select export_my_data() from generate_series(1, 4);
select tests.throws($$select export_my_data()$$, 'too many|try again', 'exports are rate-limited');

select tests.login('b0000000-0000-0000-0000-000000000002');
do $$ declare v jsonb := export_my_data(); begin
  perform tests.ok(v -> 'teacher_profile' ->> 'teacher_code' like 'TMT-%', 'a teacher''s export includes the teacher profile');
  perform tests.eq(jsonb_array_length(v -> 'pay_rates'), 2, 'and their pay rates');
  perform tests.eq(jsonb_array_length(v -> 'student_records'), 0, 'and no student records');
end $$;
select tests.anon();
select tests.throws($$select export_my_data()$$, 'permission denied|sign in', 'visitors cannot export anything');

-- Deletion requests.
select tests.login('c0000000-0000-0000-0000-000000000001');
select set_config('test.req', (request_account_deletion('Moving abroad')).id::text, true);
select tests.eq((select status from privacy_requests where id = current_setting('test.req')::uuid), 'pending', 'a deletion request waits for the academy');
select tests.throws($$select request_account_deletion()$$, 'already have', 'only one open deletion request at a time');
select tests.lives($$select cancel_privacy_request(current_setting('test.req')::uuid)$$, 'the person can cancel their request');
select set_config('test.req', (request_account_deletion('Moving abroad')).id::text, true);
select tests.owner();
select tests.ok(exists (select 1 from notifications where user_id = 'a0000000-0000-0000-0000-000000000001' and type = 'admin_privacy_request'),
  'administrators are notified in the app');
select tests.ok(exists (select 1 from message_outbox where template_key = 'admin_privacy_request' and channel = 'email'), 'and by email');

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.throws($$select resolve_privacy_request(current_setting('test.req')::uuid, 'completed')$$, 'administrator', 'teachers cannot resolve requests');
select tests.throws($$select anonymise_student('d0000000-0000-0000-0000-000000000001', 'test')$$, 'administrator', 'or anonymise students');
select tests.eq(tests.visible('privacy_requests'), 0::bigint, 'and cannot see other people''s requests');

-- Anonymising: refused while the student is still active, then removes personal details everywhere but the finances.
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select resolve_privacy_request(current_setting('test.req')::uuid, 'rejected')$$, 'explain', 'a refusal needs a reason');
select tests.throws($$select anonymise_student('d0000000-0000-0000-0000-000000000001', '')$$, 'reason', 'anonymising needs a recorded reason');
select tests.throws($$select anonymise_student('d0000000-0000-0000-0000-000000000001', 'Request of 2 Nov')$$, 'current enrolments',
  'a student with a current enrolment cannot be anonymised');
select change_enrolment_status((select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000001' and status = 'active'),
  'withdrawn', 'Moving abroad');
select tests.lives($$select anonymise_student('d0000000-0000-0000-0000-000000000001', 'Deletion request of 2 Nov 2026')$$, 'a former student can be anonymised');
select tests.owner();
select tests.ok((select full_name like 'Anonymised student TMS-%' and email is null and phone is null and profile_id is null and status = 'archived'
  from students where id = 'd0000000-0000-0000-0000-000000000001'), 'the student record keeps only its code');
select tests.ok((select status = 'deactivated' and full_name = 'Anonymised user' and phone is null from profiles where id = 'c0000000-0000-0000-0000-000000000001'),
  'the login is deactivated and its name removed');
select tests.eq((select count(*) from registrations where email = 'aisha@test.my' or student_name = 'Aisha Rahman'), 0::bigint, 'registrations are anonymised');
select tests.eq((select count(*) from enquiries where email = 'aisha@test.my'), 0::bigint, 'enquiries are anonymised');
select tests.eq((select count(*) from audit_logs where table_name in ('students', 'registrations', 'enquiries', 'profiles')
  and (coalesce(old_data::text, '') || coalesce(new_data::text, '')) ilike '%aisha%'), 0::bigint, 'old audit entries no longer hold the personal details');
select tests.ok(exists (select 1 from audit_logs where action = 'anonymise' and record_id = 'd0000000-0000-0000-0000-000000000001'),
  'the anonymisation itself is audited');
select tests.ok(exists (select 1 from invoices where id = current_setting('test.inv')::uuid and student_id = 'd0000000-0000-0000-0000-000000000001'),
  'invoices are kept, as the law requires');
select tests.eq((select status from privacy_requests where id = current_setting('test.req')::uuid), 'completed', 'the open deletion request is completed');
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select anonymise_student('d0000000-0000-0000-0000-000000000001', 'again')$$, 'already anonymised', 'anonymising twice is refused');

-- The audit log stays append-only outside an anonymisation.
select tests.owner();
select tests.throws($$update audit_logs set action = 'changed' where id = (select min(id) from audit_logs)$$, 'append-only', 'audit entries cannot be edited');
select tests.throws($$select set_config('topmind.audit_redact', 'on', true); update audit_logs set action = 'changed', old_data = null where id = (select min(id) from audit_logs)$$,
  'append-only', 'even redaction mode cannot change who did what');
select set_config('topmind.audit_redact', 'off', true);
select tests.login('b0000000-0000-0000-0000-000000000001');
do $$ declare n int; begin
  perform set_config('topmind.audit_redact', 'on', true);
  update audit_logs set old_data = null;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'signed-in users cannot touch the audit log, even with the redaction flag');
end $$;
