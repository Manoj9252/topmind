-- Reports, dashboards and the public catalogue.
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv', (create_invoice('d0000000-0000-0000-0000-000000000001', '[{"kind":"tuition","description":"Tuition","unit_price":150,"class_id":"10000000-0000-0000-0000-000000000001"}]',
  null, null, null, true)).id::text, true);
select record_payment(current_setting('test.inv')::uuid, 100, 'cash');
select save_attendance(id, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"absent"}]')
from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date = biz_today() - 1;

do $$ declare k text; r jsonb; begin
  foreach k in array array['registrations', 'enrolments', 'classes', 'attendance', 'invoices', 'payments', 'outstanding', 'receipts',
                           'salaries', 'salary_payments', 'bookings', 'materials', 'proficiency', 'summary'] loop
    r := run_report(k, '{}');
    perform tests.eq(jsonb_typeof(r), 'array', 'the ' || k || ' report runs');
  end loop;
end $$;
select tests.eq(jsonb_array_length(run_report('payments', jsonb_build_object('month', to_char(biz_today(), 'YYYY-MM')))), 1, 'reports filter by month');
select tests.eq(jsonb_array_length(run_report('payments', jsonb_build_object('class_id', '10000000-0000-0000-0000-000000000002'))), 0, 'reports filter by class');
select tests.eq((run_report('outstanding', '{}') -> 0 ->> 'balance')::numeric, 50.00, 'the outstanding report shows the balance');
select tests.eq((select (r ->> 'collected')::numeric from jsonb_array_elements(run_report('summary', '{}')) r where r ->> 'month' = to_char(biz_today(), 'YYYY-MM')),
  100.00, 'the monthly summary separates cash collected from amounts invoiced');
select tests.eq((select (r ->> 'net_operating_balance')::numeric from jsonb_array_elements(run_report('summary', '{}')) r where r ->> 'month' = to_char(biz_today(), 'YYYY-MM')),
  100.00, 'the net operating balance subtracts salaries and expenses from cash collected');
select tests.ok((select count(*) from report_runs) >= 14, 'report runs are logged');

do $$ declare d jsonb; begin
  d := admin_dashboard();
  perform tests.eq((d ->> 'students_total')::int, 3, 'the dashboard counts students');
  perform tests.eq((d ->> 'students_active')::int, 2, 'the dashboard counts students with an active enrolment');
  perform tests.eq((d ->> 'collected_month')::numeric, 100.00, 'collected income counts only confirmed payments');
  perform tests.eq((d ->> 'invoiced_month')::numeric, 150.00, 'invoiced revenue is reported separately');
  perform tests.eq((d ->> 'outstanding_total')::numeric, 50.00, 'outstanding fees are reported');
  perform tests.ok(jsonb_array_length(d -> 'class_performance') = 2, 'class performance lists the active classes');
  perform tests.eq((d -> 'income_by_class' -> 0 ->> 'label'), 'English Beginners Daily', 'income is broken down by class');
  perform tests.eq((d -> 'income_by_language' -> 0 ->> 'label'), 'English', 'income is broken down by language');
  perform tests.eq(jsonb_array_length(d -> 'trend'), 6, 'six months of trend data');
end $$;

select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.throws($$select run_report('payments', '{}')$$, 'administrator', 'students cannot run reports');
select tests.throws($$select admin_dashboard()$$, 'administrator', 'students cannot open the admin dashboard');
do $$ declare d jsonb; begin
  d := student_dashboard();
  perform tests.ok((d ->> 'linked')::boolean, 'the student dashboard finds the linked record');
  perform tests.eq((d ->> 'balance')::numeric, 50.00, 'the student sees her outstanding balance');
  perform tests.eq((d -> 'attendance' ->> 'present')::int, 1, 'the student sees her attendance');
  perform tests.ok(jsonb_array_length(d -> 'next_lessons') > 0, 'the student sees upcoming lessons');
end $$;
select tests.ok(jsonb_array_length(lesson_calendar(biz_today(), biz_today() + 7)) >= 7, 'the student calendar shows her lessons');
select tests.eq((select count(*) from jsonb_array_elements(lesson_calendar(biz_today(), biz_today() + 7)) x
  where x ->> 'class_id' = '10000000-0000-0000-0000-000000000002'), 0::bigint, 'the calendar hides other classes');

select tests.login('c0000000-0000-0000-0000-000000000003');
select tests.eq(student_dashboard() ->> 'linked', 'false', 'a login without a student record is told it is not linked yet');
select tests.eq(jsonb_array_length(lesson_calendar(biz_today(), biz_today() + 7)), 0, 'an unlinked login sees no lessons');

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq((teacher_dashboard() ->> 'classes')::int, 1, 'the teacher dashboard counts her classes');
select tests.eq((teacher_dashboard() ->> 'students')::int, 2, 'the teacher dashboard counts her students');
select tests.eq(jsonb_array_length(my_students()), 2, 'the teacher sees her students with contact details');
select tests.ok((my_students() -> 0 ->> 'attendance_percent') is not null, 'the teacher sees each student''s attendance');
select tests.throws($$select teacher_dashboard() from (select tests.login('c0000000-0000-0000-0000-000000000001')) x$$, 'Teachers only',
  'only teachers can open the teacher dashboard');

select tests.anon();
do $$ declare c jsonb; begin
  c := public_catalog();
  perform tests.ok(c::text like '%General English%', 'the catalogue lists active programmes');
  perform tests.ok(c::text like '%"spaces_left": 0%', 'the catalogue shows when a class is full');
  perform tests.ok(c::text like '%"is_active": false%', 'languages that are coming soon are flagged');
end $$;
