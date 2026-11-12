-- Monthly checklist (automatic status from records) and the automation engine.
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((select count(*) from checklists where month = month_start(biz_today())), 37::bigint, 'the monthly checklist is created from the templates');
select tests.eq(generate_monthly_checklist(biz_today()), 0, 'creating the checklist again adds no duplicates');
select tests.throws($$update checklists set status = 'completed' where month = month_start(biz_today()) and title = 'Generate monthly invoices'$$,
  'completes automatically', 'a task cannot be ticked off before the work is actually done');
select tests.lives($$update checklists set status = 'completed', notes = 'Checked phone numbers' where month = month_start(biz_today()) and title = 'Update student profiles'$$,
  'manual tasks can be completed by hand');
select tests.ok((select done and completed_by = 'a0000000-0000-0000-0000-000000000001' from checklists
  where month = month_start(biz_today()) and title = 'Update student profiles'), 'who completed a task is recorded');
select tests.lives($$update checklists set status = 'not_applicable', notes = 'No physical classes yet' where month = month_start(biz_today()) and title = 'Review class learning materials'$$,
  'a task can be marked not applicable');

select generate_monthly_invoices(biz_today(), true);
select tests.ok(refresh_checklist(biz_today()) > 0, 'automatic tasks are re-checked');
select tests.eq((select status from checklists where month = month_start(biz_today()) and title = 'Generate monthly invoices'), 'completed',
  'generating the invoices completes the invoicing task automatically');
select tests.eq((select status from checklists where month = month_start(biz_today()) and title = 'Check WhatsApp delivery where configured'), 'not_applicable',
  'WhatsApp checks are not applicable while WhatsApp is off');
select tests.ok((select auto_detail from checklists where month = month_start(biz_today()) and title = 'Confirm attendance for every scheduled lesson') like '%past lessons still need attendance%',
  'automatic tasks explain what is still outstanding');
select tests.lives($$select run_report('outstanding', '{}')$$, 'running a report');
select refresh_checklist(biz_today());
select tests.eq((select status from checklists where month = month_start(biz_today()) and title = 'Generate outstanding payment reports'), 'completed',
  'running the report completes the matching task');

-- Automation engine
select tests.ok((run_automation('generate_lessons') ->> 'lessons_created') is not null, 'an automation can be run by hand');
select tests.eq((select status from automation_runs where job_key = 'generate_lessons' order by id desc limit 1), 'succeeded', 'each run is recorded with its result');
select tests.ok((run_automation('salary_statements') ->> 'created') is not null, 'the salary automation prepares statements');
select tests.ok((run_automation('checklist') ->> 'overdue') is not null, 'the checklist automation reports overdue tasks');
select tests.lives($$select run_automation('payment_reminders')$$, 'payment reminders run');
select tests.lives($$select run_automation('booking_reminders')$$, 'booking reminders run');
select tests.lives($$select run_automation('attendance_monitor')$$, 'the missing-attendance monitor runs');
select tests.lives($$select run_automation('cleanup')$$, 'housekeeping runs');
select tests.owner();
select tests.ok(exists (select 1 from notifications where type = 'teacher_missing_attendance' and user_id = 'b0000000-0000-0000-0000-000000000001'),
  'teachers are reminded about missing attendance');

-- A failing job is logged and the administrators are told. A new enrolment gives
-- the monthly run something to bill; a temporary constraint makes the insert fail.
insert into classes (id, name, capacity, fee, start_date, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Malay Basics', 5, 100, biz_today(), 'active');
insert into enrolments (student_id, class_id, status) values ('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'active');
alter table invoices add constraint tmp_break_invoices check (false) not valid;
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.ok((run_automation('monthly_invoices') ->> 'error') like '%tmp_break_invoices%', 'a failing job reports its error');
select tests.eq((select status from automation_runs where job_key = 'monthly_invoices' order by id desc limit 1), 'failed', 'the failed run is recorded');
select tests.owner();
select tests.ok(exists (select 1 from notifications where type = 'admin_automation_failed'), 'administrators are alerted to the failure');
alter table invoices drop constraint tmp_break_invoices;

-- Scheduled runs happen once per period
select tests.ok((run_due_automations() -> 'ran') ? 'booking_reminders', 'hourly jobs run when due');
select tests.ok(not ((run_due_automations() -> 'ran') ? 'booking_reminders'), 'a job does not run twice in the same period');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.throws($$select run_automation('cleanup')$$, 'administrator', 'students cannot run automations');
