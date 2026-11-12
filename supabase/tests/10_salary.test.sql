-- Teacher salaries: only completed lessons count; statements, approval, adjustments, payments, privacy.
select tests.owner();
-- Use last month so the test does not depend on today's date.
select set_config('test.m', (month_start(biz_today()) - interval '1 month')::date::text, true);
update classes set start_date = current_setting('test.m')::date where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
update enrolments set start_date = current_setting('test.m')::date;
select generate_lessons_internal(null, current_setting('test.m')::date, biz_today());
select tests.login('a0000000-0000-0000-0000-000000000001');
-- Priya completes 3 lessons last month; Arjun completes 2.
select save_attendance(id, '[{"student_id":"d0000000-0000-0000-0000-000000000001","status":"present"},{"student_id":"d0000000-0000-0000-0000-000000000002","status":"late"}]')
from sessions where class_id = '10000000-0000-0000-0000-000000000001' and session_date between current_setting('test.m')::date and current_setting('test.m')::date + 2;
select save_attendance(id, '[{"student_id":"d0000000-0000-0000-0000-000000000002","status":"present"}]')
from sessions where class_id = '10000000-0000-0000-0000-000000000002' and session_date between current_setting('test.m')::date and current_setting('test.m')::date + 1;

do $$ declare c jsonb; begin
  c := calculate_teacher_pay('b0000000-0000-0000-0000-000000000001', current_setting('test.m')::date);
  perform tests.eq((c ->> 'lessons')::int, 3, 'only completed lessons are counted, not scheduled ones');
  perform tests.eq((c ->> 'hours')::numeric, 3.00, 'teaching hours come from the completed lessons');
  perform tests.eq((c ->> 'base_amount')::numeric, 150.00, 'hourly pay = 3 hours x RM50');
  perform tests.ok((c ->> 'missing_attendance')::int > 0, 'lessons still missing attendance are flagged');
  c := calculate_teacher_pay('b0000000-0000-0000-0000-000000000002', current_setting('test.m')::date);
  perform tests.eq((c ->> 'base_amount')::numeric, 60.00, 'per-lesson pay applies only to the matching lesson type (2 group lessons x RM30)');
end $$;

-- Per-student and fixed monthly arrangements
select tests.owner();
insert into teacher_rates (teacher_id, basis, rate, applies_to, effective_from) values
  ('b0000000-0000-0000-0000-000000000001', 'per_student', 20, 'all', current_setting('test.m')::date),
  ('b0000000-0000-0000-0000-000000000001', 'monthly', 500, 'all', current_setting('test.m')::date);
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((calculate_teacher_pay('b0000000-0000-0000-0000-000000000001', current_setting('test.m')::date) ->> 'base_amount')::numeric, 690.00,
  'arrangements combine: 150 hourly + 2 students x 20 + 500 monthly');

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.lives($$select calculate_teacher_pay('b0000000-0000-0000-0000-000000000001', current_setting('test.m')::date)$$, 'a teacher can see her own earnings estimate');
select tests.throws($$select calculate_teacher_pay('b0000000-0000-0000-0000-000000000002', current_setting('test.m')::date)$$, 'your own',
  'a teacher cannot see another teacher''s earnings');
select tests.throws($$select generate_salary_statements(current_setting('test.m')::date)$$, 'administrator', 'teachers cannot prepare salary statements');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((generate_salary_statements(current_setting('test.m')::date) ->> 'created')::int, 2, 'a draft statement is prepared for each teacher');
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('teacher_payouts'), 0::bigint, 'a teacher does not see a statement until it is approved');

select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.pp', (select id::text from teacher_payouts where teacher_id = 'b0000000-0000-0000-0000-000000000001'), true);
select tests.eq((select amount from teacher_payouts where id = current_setting('test.pp')::uuid), 690.00::numeric, 'the statement total matches the calculation');
select tests.eq((add_salary_item(current_setting('test.pp')::uuid, 'addition', 'Workshop', 50)).amount, 740.00::numeric, 'an approved addition increases the total');
select tests.eq((add_salary_item(current_setting('test.pp')::uuid, 'deduction', 'Advance repaid', 40)).amount, 700.00::numeric, 'a deduction reduces the total');
select tests.eq((approve_salary_statement(current_setting('test.pp')::uuid)).status, 'approved', 'the administrator approves the statement');
select tests.throws($$select add_salary_item(current_setting('test.pp')::uuid, 'addition', 'Late bonus', 10)$$, 'draft', 'an approved statement cannot be changed');
select tests.throws($$select record_salary_payment(current_setting('test.pp')::uuid, 800)$$, 'more than the outstanding', 'salary payments cannot exceed the statement');
select tests.eq((record_salary_payment(current_setting('test.pp')::uuid, 300, null, 'bank_transfer', 'TRX-1')).status, 'partially_paid', 'a part-payment is recorded');
select tests.eq((select amount - amount_paid from teacher_payouts where id = current_setting('test.pp')::uuid), 400.00::numeric, 'the outstanding salary updates');
select tests.throws($$select reopen_salary_statement(current_setting('test.pp')::uuid)$$, 'cannot be reopened', 'a statement with payments cannot be reopened');
select tests.eq((record_salary_payment(current_setting('test.pp')::uuid, 400, null, 'bank_transfer', 'TRX-2')).status, 'paid', 'the statement is paid in full');
select tests.eq((generate_salary_statements(current_setting('test.m')::date) ->> 'already_approved')::int, 1, 'recalculating leaves approved statements alone');

select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('teacher_payouts'), 1::bigint, 'the teacher sees her approved statement');
select tests.eq(tests.visible('teacher_payout_payments'), 2::bigint, 'the teacher sees her payment history');
select tests.eq(tests.visible('teacher_payout_items'), 2::bigint, 'the teacher sees the additions and deductions');
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.eq(tests.visible('teacher_payouts', 'teacher_id = ''b0000000-0000-0000-0000-000000000001'''), 0::bigint, 'teachers cannot see each other''s salary');
select tests.owner();
select tests.ok(exists (select 1 from message_outbox where template_key = 'salary_statement_ready' and recipient = 'priya@test.my'), 'the teacher is told the statement is ready');
select tests.throws($$delete from teacher_payout_payments where payout_id = current_setting('test.pp')::uuid$$, 'cannot be deleted', 'salary payments cannot be deleted');
