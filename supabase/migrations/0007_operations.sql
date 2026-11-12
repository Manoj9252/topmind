-- 0007_operations.sql
-- Monthly business checklist with automatic status from real records, the
-- automation engine (scheduled jobs, retries, run history), reports,
-- dashboards and the public catalogue.

begin;

-- ---------------------------------------------------------------------------
-- 1. Report runs (also used by the checklist)
-- ---------------------------------------------------------------------------
create table if not exists report_runs (
  id bigint generated always as identity primary key,
  report_key text not null,
  filters jsonb not null default '{}',
  row_count int,
  run_by uuid references profiles on delete set null,
  run_at timestamptz not null default now()
);
create index if not exists report_runs_key_idx on report_runs (report_key, run_at desc);

-- ---------------------------------------------------------------------------
-- 2. Monthly checklist
-- ---------------------------------------------------------------------------
create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null check (category in ('students', 'attendance', 'invoicing', 'payments', 'receipts', 'teachers', 'materials', 'reports')),
  title text not null,
  description text,
  auto_key text,
  due_offset_days int not null default 27 check (due_offset_days between 0 and 45),
  sort_order int not null default 0,
  is_active boolean not null default true
);

alter table checklists add column if not exists category text;
alter table checklists add column if not exists status text not null default 'pending';
alter table checklists drop constraint if exists checklists_status_check;
alter table checklists add constraint checklists_status_check check (status in ('pending', 'in_progress', 'completed', 'not_applicable'));
alter table checklists add column if not exists auto_key text;
alter table checklists add column if not exists auto_detail text;
alter table checklists add column if not exists auto_checked_at timestamptz;
alter table checklists add column if not exists template_id uuid references checklist_templates on delete set null;
alter table checklists add column if not exists notes text;
alter table checklists add column if not exists evidence text;
alter table checklists add column if not exists completed_at timestamptz;
alter table checklists add column if not exists completed_by uuid references profiles on delete set null;
alter table checklists add column if not exists updated_by uuid references profiles on delete set null;
alter table checklists add column if not exists created_at timestamptz not null default now();
alter table checklists add column if not exists updated_at timestamptz not null default now();
update checklists set status = 'completed', completed_at = coalesce(completed_at, now()) where done and status = 'pending';
update checklists set month = month_start(month) where month is not null and month <> month_start(month);
create unique index if not exists checklists_template_month_key on checklists (month, template_id) where template_id is not null;

insert into checklist_templates (key, category, title, auto_key, due_offset_days, sort_order) values
  ('students_registrations', 'students', 'Review new registrations', 'registrations_reviewed', 6, 1),
  ('students_enrolments', 'students', 'Approve student enrolments', 'enrolments_reviewed', 6, 2),
  ('students_profiles', 'students', 'Update student profiles', null, 24, 3),
  ('students_assignments', 'students', 'Review class assignments', null, 9, 4),
  ('students_inactive', 'students', 'Review inactive students', null, 24, 5),
  ('attendance_confirm', 'attendance', 'Confirm attendance for every scheduled lesson', 'attendance_complete', 32, 10),
  ('attendance_missing', 'attendance', 'Review missing attendance records', 'attendance_complete', 32, 11),
  ('attendance_absences', 'attendance', 'Review student absences', null, 32, 12),
  ('attendance_reports', 'attendance', 'Generate attendance reports', 'report_attendance', 34, 13),
  ('invoicing_generate', 'invoicing', 'Generate monthly invoices', 'invoices_generated', 2, 20),
  ('invoicing_verify', 'invoicing', 'Verify invoice amounts', null, 3, 21),
  ('invoicing_delivery', 'invoicing', 'Check invoice delivery', 'invoice_delivery', 5, 22),
  ('invoicing_overdue', 'invoicing', 'Identify overdue invoices', 'report_outstanding', 20, 23),
  ('payments_review', 'payments', 'Review incoming payments', 'payments_reviewed', 32, 30),
  ('payments_confirm', 'payments', 'Confirm manual payments', 'payments_reviewed', 32, 31),
  ('payments_update', 'payments', 'Update payment records', null, 32, 32),
  ('payments_outstanding', 'payments', 'Review outstanding balances', null, 24, 33),
  ('payments_reconcile', 'payments', 'Reconcile payment records', null, 34, 34),
  ('receipts_generate', 'receipts', 'Generate receipts', 'receipts_generated', 32, 40),
  ('receipts_verify', 'receipts', 'Verify receipt records', null, 34, 41),
  ('receipts_email', 'receipts', 'Check email delivery', 'receipt_email_delivery', 32, 42),
  ('receipts_whatsapp', 'receipts', 'Check WhatsApp delivery where configured', 'receipt_whatsapp_delivery', 32, 43),
  ('teachers_schedules', 'teachers', 'Verify teaching schedules', null, 2, 50),
  ('teachers_lessons', 'teachers', 'Review completed lessons', 'attendance_complete', 32, 51),
  ('teachers_earnings', 'teachers', 'Calculate teacher earnings', 'salary_statements_generated', 34, 52),
  ('teachers_statements', 'teachers', 'Verify salary statements', 'salary_statements_approved', 35, 53),
  ('teachers_payments', 'teachers', 'Record teacher payments', 'salary_paid', 37, 54),
  ('teachers_outstanding', 'teachers', 'Review outstanding salaries', null, 37, 55),
  ('materials_plans', 'materials', 'Confirm lesson plans are uploaded', 'lesson_plans_uploaded', 6, 60),
  ('materials_slides', 'materials', 'Confirm required slides are available', 'slides_uploaded', 6, 61),
  ('materials_worksheets', 'materials', 'Confirm worksheets are uploaded', 'worksheets_uploaded', 6, 62),
  ('materials_review', 'materials', 'Review class learning materials', null, 19, 63),
  ('reports_students', 'reports', 'Generate student reports', 'report_registrations', 34, 70),
  ('reports_attendance', 'reports', 'Generate attendance reports', 'report_attendance', 34, 71),
  ('reports_income', 'reports', 'Generate income reports', 'report_payments', 34, 72),
  ('reports_outstanding', 'reports', 'Generate outstanding payment reports', 'report_outstanding', 34, 73),
  ('reports_salaries', 'reports', 'Generate teacher salary reports', 'report_salaries', 37, 74)
on conflict (key) do nothing;

-- Whether an automatic checklist task is done, based on the records.
create or replace function public.checklist_check(p_key text, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := month_start(p_month);
  v_end date := (month_start(p_month) + interval '1 month - 1 day')::date;
  n int; m int;
  na jsonb := jsonb_build_object('state', 'not_applicable');
begin
  if v_start > biz_today() then return jsonb_build_object('state', 'not_met', 'detail', 'This month has not started yet'); end if;
  case p_key
  when 'registrations_reviewed' then
    select count(*) into n from registrations where status in ('pending', 'info_requested') and (created_at at time zone biz_tz())::date <= v_end;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' registrations waiting for review');
  when 'enrolments_reviewed' then
    select count(*) into n from registrations where status = 'approved';
    select count(*) into m from enrolments where status = 'pending';
    return jsonb_build_object('state', case when n + m = 0 then 'met' else 'not_met' end,
      'detail', n || ' approved students without a class, ' || m || ' pending enrolments');
  when 'attendance_complete' then
    select count(*) filter (where status = 'scheduled'), count(*) into n, m from sessions
    where session_date between v_start and least(v_end, biz_today()) and status <> 'cancelled' and coalesce(ends_at, now()) < now();
    if m = 0 then return na || jsonb_build_object('detail', 'No lessons took place'); end if;
    return jsonb_build_object('state', case when n = 0 and v_end < biz_today() then 'met' else 'not_met' end,
      'detail', n || ' of ' || m || ' past lessons still need attendance' || case when v_end >= biz_today() then ' (month still running)' else '' end);
  when 'invoices_generated' then
    select count(*) into m from enrolments e join classes c on c.id = e.class_id
    where e.status = 'active' and c.billing_frequency = 'monthly' and coalesce(e.fee_override, c.fee) > 0
      and e.start_date <= v_end and (e.end_date is null or e.end_date >= v_start);
    if m = 0 then return na || jsonb_build_object('detail', 'No monthly-billed enrolments'); end if;
    select count(*) into n from enrolments e join classes c on c.id = e.class_id
    where e.status = 'active' and c.billing_frequency = 'monthly' and coalesce(e.fee_override, c.fee) > 0
      and e.start_date <= v_end and (e.end_date is null or e.end_date >= v_start)
      and not exists (select 1 from invoice_items it join invoices i on i.id = it.invoice_id
                      where it.enrolment_id = e.id and it.kind = 'tuition' and i.status <> 'void' and i.period = v_start);
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' enrolments not invoiced');
  when 'invoice_delivery' then
    if not setting_bool('communication.email_enabled', true) then return na || jsonb_build_object('detail', 'Email sending is off'); end if;
    select count(*), count(*) filter (where not exists (select 1 from message_outbox o where o.related_type = 'invoice' and o.related_id = i.id
                                                          and o.template_key = 'invoice_issued' and o.status = 'sent'))
      into m, n
    from invoices i join students s on s.id = i.student_id
    where i.period = v_start and i.status not in ('draft', 'void') and s.email is not null;
    if m = 0 then return na || jsonb_build_object('detail', 'No invoices issued for this month'); end if;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' invoices not yet delivered by email');
  when 'payments_reviewed' then
    select count(*) into n from payments where status = 'pending' and (created_at at time zone biz_tz())::date <= v_end;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' payments waiting for confirmation');
  when 'receipts_generated' then
    select count(*) filter (where receipt_no is null), count(*) into n, m from payments where status in ('confirmed', 'refunded') and paid_on between v_start and v_end;
    if m = 0 then return na || jsonb_build_object('detail', 'No payments this month'); end if;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', m - n || ' of ' || m || ' payments have receipts');
  when 'receipt_email_delivery', 'receipt_whatsapp_delivery' then
    if p_key = 'receipt_email_delivery' and not setting_bool('communication.email_enabled', true) then return na || jsonb_build_object('detail', 'Email sending is off'); end if;
    if p_key = 'receipt_whatsapp_delivery' and not setting_bool('communication.whatsapp_enabled', false) then return na || jsonb_build_object('detail', 'WhatsApp is not configured'); end if;
    select count(*), count(*) filter (where not exists (select 1 from message_outbox o where o.related_type = 'payment' and o.related_id = p.id
                                        and o.template_key = 'payment_confirmed' and o.status = 'sent'
                                        and o.channel = case when p_key = 'receipt_email_delivery' then 'email' else 'whatsapp' end))
      into m, n
    from payments p join students s on s.id = p.student_id
    where p.status = 'confirmed' and p.paid_on between v_start and v_end
      and case when p_key = 'receipt_email_delivery' then s.email is not null else s.consent_whatsapp and s.phone is not null end;
    if m = 0 then return na || jsonb_build_object('detail', 'No receipts to deliver on this channel'); end if;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' receipts not yet delivered');
  when 'salary_statements_generated' then
    if v_end >= biz_today() then return jsonb_build_object('state', 'not_met', 'detail', 'Prepare statements after the month ends'); end if;
    select count(distinct s.teacher_id) into m from sessions s where s.status = 'completed' and s.session_date between v_start and v_end;
    if m = 0 then return na || jsonb_build_object('detail', 'No completed lessons'); end if;
    select count(distinct s.teacher_id) into n from sessions s where s.status = 'completed' and s.session_date between v_start and v_end
      and not exists (select 1 from teacher_payouts t where t.teacher_id = s.teacher_id and t.period = v_start and t.status <> 'void');
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' teachers without a statement');
  when 'salary_statements_approved' then
    select count(*) filter (where status = 'draft'), count(*) into n, m from teacher_payouts where period = v_start and status <> 'void';
    if m = 0 then return jsonb_build_object('state', 'not_met', 'detail', 'No statements prepared yet'); end if;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' statements still in draft');
  when 'salary_paid' then
    select count(*) filter (where status in ('draft', 'approved', 'partially_paid') and amount > amount_paid), count(*) into n, m
    from teacher_payouts where period = v_start and status <> 'void';
    if m = 0 then return jsonb_build_object('state', 'not_met', 'detail', 'No statements prepared yet'); end if;
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' statements not fully paid');
  when 'lesson_plans_uploaded', 'slides_uploaded', 'worksheets_uploaded' then
    select count(distinct c.id) into m from classes c join sessions s on s.class_id = c.id
    where c.status = 'active' and s.session_date between v_start and v_end and s.status <> 'cancelled';
    if m = 0 then return na || jsonb_build_object('detail', 'No active classes with lessons'); end if;
    select count(distinct c.id) into n from classes c join sessions s on s.class_id = c.id
    where c.status = 'active' and s.session_date between v_start and v_end and s.status <> 'cancelled'
      and not exists (select 1 from materials mt where mt.class_id = c.id and mt.deleted_at is null
                      and mt.kind = case p_key when 'lesson_plans_uploaded' then 'lesson_plan' when 'slides_uploaded' then 'slides' else 'worksheet' end
                      and (mt.created_at at time zone biz_tz())::date <= v_end);
    return jsonb_build_object('state', case when n = 0 then 'met' else 'not_met' end, 'detail', n || ' of ' || m || ' classes still missing this');
  else
    if p_key like 'report_%' then
      select count(*) into n from report_runs where report_key = substr(p_key, 8) and run_at >= v_start::timestamptz;
      return jsonb_build_object('state', case when n > 0 then 'met' else 'not_met' end,
        'detail', case when n > 0 then 'Report generated' else 'Run this report under Reports' end);
    end if;
    return jsonb_build_object('state', 'not_met', 'detail', 'Unknown check');
  end case;
end $$;

create or replace function public.checklists_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if new.month is not null then new.month := month_start(new.month); end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') and new.auto_key is not null
     and coalesce(current_setting('topmind.checklist_internal', true), '') <> 'on' then
    v := checklist_check(new.auto_key, coalesce(new.month, month_start(biz_today())));
    if v ->> 'state' <> 'met' then
      raise exception 'This task completes automatically once the work is done (%).', coalesce(v ->> 'detail', 'not yet');
    end if;
  end if;
  new.done := new.status = 'completed';
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(auth.uid(), new.completed_by);
  elsif new.status <> 'completed' then
    new.completed_at := null; new.completed_by := null;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists checklists_guard on checklists;
create trigger checklists_guard before insert or update on checklists for each row execute function checklists_guard();

create or replace function public.generate_monthly_checklist(p_month date default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_month date := month_start(coalesce(p_month, biz_today())); n int;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can create checklists'; end if;
  insert into checklists (month, title, category, auto_key, template_id, due_date, status)
  select v_month, t.title, t.category, t.auto_key, t.id, v_month + t.due_offset_days, 'pending'
  from checklist_templates t where t.is_active
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.refresh_checklist(p_month date default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_month date := month_start(coalesce(p_month, biz_today())); it checklists; v jsonb; v_status text; n int := 0;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can refresh checklists'; end if;
  perform set_config('topmind.checklist_internal', 'on', true);
  for it in select * from checklists where month = v_month and auto_key is not null loop
    v := checklist_check(it.auto_key, v_month);
    v_status := case v ->> 'state' when 'met' then 'completed' when 'not_applicable' then 'not_applicable'
                else case when it.status = 'in_progress' then 'in_progress' else 'pending' end end;
    update checklists set status = v_status, auto_detail = v ->> 'detail', auto_checked_at = now()
    where id = it.id and (status is distinct from v_status or auto_detail is distinct from v ->> 'detail');
    n := n + 1;
  end loop;
  perform set_config('topmind.checklist_internal', '', true);
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Automation engine
-- ---------------------------------------------------------------------------
create table if not exists automation_jobs (
  key text primary key,
  name text not null,
  description text,
  frequency text not null check (frequency in ('hourly', 'daily', 'monthly')),
  run_at_hour int not null default 1 check (run_at_hour between 0 and 23),
  run_on_day int check (run_on_day between 1 and 28),
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text
);
insert into automation_jobs (key, name, description, frequency, run_at_hour, run_on_day) values
  ('generate_lessons', 'Create upcoming lessons', 'Creates dated lessons from class schedules for the weeks ahead.', 'daily', 1, null),
  ('monthly_invoices', 'Monthly invoices', 'Creates (and, if set, issues) the month''s invoices for active enrolments and completed one-to-one lessons.', 'monthly', 8, 1),
  ('payment_reminders', 'Payment reminders', 'Reminds students before invoices fall due and at intervals while overdue.', 'daily', 9, null),
  ('booking_reminders', 'Booking reminders', 'Reminds students and teachers before one-to-one lessons.', 'hourly', 0, null),
  ('attendance_monitor', 'Missing attendance', 'Reminds teachers about past lessons without attendance.', 'daily', 9, null),
  ('salary_statements', 'Salary statements', 'Prepares draft salary statements for last month from completed lessons.', 'monthly', 6, 2),
  ('checklist', 'Monthly checklist', 'Creates the monthly checklist, updates automatic tasks and flags overdue ones.', 'daily', 7, null),
  ('cleanup', 'Housekeeping', 'Expires old assessment links and clears rate-limit records.', 'daily', 3, null)
on conflict (key) do nothing;
update automation_jobs set run_on_day = least(greatest(coalesce(setting_num('finance.billing_day', 1)::int, 1), 1), 28)
where key = 'monthly_invoices';

create table if not exists automation_runs (
  id bigint generated always as identity primary key,
  job_key text not null references automation_jobs on delete cascade,
  period_key text,
  trigger text not null default 'manual' check (trigger in ('schedule', 'manual')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  triggered_by uuid references profiles on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
create index if not exists automation_runs_job_idx on automation_runs (job_key, started_at desc);
create unique index if not exists automation_runs_scheduled_once on automation_runs (job_key, period_key)
  where trigger = 'schedule' and status = 'succeeded';

insert into app_settings (key, value, category, label, description) values
  ('automation.monthly_invoices_auto_issue', 'true', 'automation', 'Issue monthly invoices automatically',
   'When off, the monthly run creates drafts for you to check and issue.')
on conflict (key) do nothing;

create or replace function public.job_payment_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before int := setting_num('finance.reminder_days_before_due', 3)::int;
        v_every int := setting_num('finance.overdue_reminder_every_days', 7)::int; r record; n_due int := 0; n_over int := 0; v_vars jsonb;
begin
  for r in select * from invoices where status in ('unpaid', 'partial') and due_date is not null loop
    v_vars := jsonb_build_object('invoice_no', r.invoice_no, 'balance', fmt_money(invoice_balance(r.id)), 'due_date', fmt_date(r.due_date),
      'payment_instructions', coalesce(r.payment_instructions, setting_text('finance.payment_instructions', '')));
    if v_before > 0 and r.due_date = biz_today() + v_before then
      perform notify_student(r.student_id, 'payment_reminder', v_vars, 'invoice', r.id, 'reminder-due:' || r.id, '/student/invoices');
      n_due := n_due + 1;
    elsif v_every > 0 and r.due_date < biz_today() and (biz_today() - r.due_date - 1) % v_every = 0 then
      perform notify_student(r.student_id, 'payment_overdue', v_vars, 'invoice', r.id, 'reminder-overdue:' || r.id || ':' || biz_today(), '/student/invoices');
      n_over := n_over + 1;
    end if;
  end loop;
  return jsonb_build_object('due_soon', n_due, 'overdue', n_over);
end $$;

create or replace function public.job_booking_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from bookings where status = 'approved' and reminder_sent_at is null and starts_at > now()
             and starts_at <= now() + make_interval(hours => setting_num('booking.reminder_hours', 24)::int) loop
    perform emit_event('booking.reminder', 'booking', r.id);
    update bookings set reminder_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('reminders', n);
end $$;

create or replace function public.job_attendance_monitor() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select s.id, s.teacher_id, s.session_date, coalesce(c.name, 'One-to-one lesson') as class_name
           from sessions s left join classes c on c.id = s.class_id
           where s.status = 'scheduled' and s.session_date < biz_today() and s.session_date >= biz_today() - 30 and s.teacher_id is not null loop
    perform notify_profile(r.teacher_id, 'teacher_missing_attendance', jsonb_build_object('class_name', r.class_name,
      'lesson_date', fmt_date(r.session_date)), 'session', r.id, 'missing-attendance:' || r.id, '/teacher/attendance', false);
    n := n + 1;
  end loop;
  return jsonb_build_object('lessons_missing_attendance', n);
end $$;

create or replace function public.job_checklist() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_created int; r record; n int := 0;
begin
  v_created := generate_monthly_checklist(biz_today());
  perform refresh_checklist(biz_today());
  perform refresh_checklist((biz_today() - interval '1 month')::date);
  for r in select * from checklists where due_date < biz_today() and status in ('pending', 'in_progress')
             and month >= month_start((biz_today() - interval '2 months')::date) loop
    if r.assignee is not null then
      perform notify_profile(r.assignee, 'checklist_overdue', jsonb_build_object('title', r.title, 'due_date', fmt_date(r.due_date)),
        'checklist', r.id, 'checklist-overdue:' || r.id || ':' || to_char(biz_today(), 'IYYY-IW'), '/admin/checklist', false);
    else
      perform notify_admins_event('checklist_overdue', jsonb_build_object('title', r.title, 'due_date', fmt_date(r.due_date)),
        'checklist', r.id, 'checklist-overdue:' || r.id || ':' || to_char(biz_today(), 'IYYY-IW'), '/admin/checklist');
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('items_created', v_created, 'overdue', n);
end $$;

create or replace function public.job_cleanup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int;
begin
  update assessment_attempts set status = 'expired' where status in ('not_started', 'in_progress') and expires_at < now();
  get diagnostics n1 = row_count;
  delete from rate_limits where window_start < now() - interval '2 days';
  get diagnostics n2 = row_count;
  return jsonb_build_object('assessments_expired', n1, 'rate_limit_rows_removed', n2);
end $$;

create or replace function public.run_automation(p_job text, p_trigger text default 'manual', p_period text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_run bigint; v_result jsonb; v_err text;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can run automations'; end if;
  if not exists (select 1 from automation_jobs where key = p_job) then raise exception 'Unknown automation %', p_job; end if;
  insert into automation_runs (job_key, period_key, trigger, triggered_by) values (p_job, p_period, p_trigger, auth.uid())
  returning id into v_run;
  begin
    v_result := case p_job
      when 'generate_lessons' then jsonb_build_object('lessons_created',
        generate_lessons_internal(null, biz_today(), biz_today() + (7 * setting_num('academic.lesson_weeks_ahead', 8))::int))
      when 'monthly_invoices' then generate_monthly_invoices(biz_today(), null)
      when 'payment_reminders' then job_payment_reminders()
      when 'booking_reminders' then job_booking_reminders()
      when 'attendance_monitor' then job_attendance_monitor()
      when 'salary_statements' then generate_salary_statements((biz_today() - interval '1 month')::date)
      when 'checklist' then job_checklist()
      when 'cleanup' then job_cleanup()
    end;
    update automation_runs set status = 'succeeded', finished_at = now(), result = v_result where id = v_run;
    update automation_jobs set last_run_at = now(), last_status = 'succeeded' where key = p_job;
  exception when others then
    v_err := sqlerrm;
    update automation_runs set status = 'failed', finished_at = now(), error = v_err where id = v_run;
    update automation_jobs set last_run_at = now(), last_status = 'failed' where key = p_job;
    perform notify_admins_event('admin_automation_failed', jsonb_build_object('job', (select name from automation_jobs where key = p_job), 'error', v_err),
      'automation_run', null, 'automation-failed:' || p_job || ':' || biz_today(), '/admin/automations');
    v_result := jsonb_build_object('error', v_err);
  end;
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('run_id', v_run);
end $$;

-- Called every hour by pg_cron. Decides in Malaysia time which jobs are due,
-- runs each at most once per period, and retries failures up to 3 times.
create or replace function public.run_due_automations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare j automation_jobs; v_local timestamp := now() at time zone biz_tz(); v_period text; v_due boolean; v_ran jsonb := '[]';
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can run automations'; end if;
  for j in select * from automation_jobs where is_enabled order by key loop
    v_period := case j.frequency when 'hourly' then to_char(v_local, 'YYYY-MM-DD"T"HH24')
                                 when 'daily' then to_char(v_local, 'YYYY-MM-DD') else to_char(v_local, 'YYYY-MM') end;
    v_due := case j.frequency when 'hourly' then true
                              when 'daily' then extract(hour from v_local) >= j.run_at_hour
                              else extract(day from v_local) >= coalesce(j.run_on_day, 1) and extract(hour from v_local) >= j.run_at_hour end;
    if v_due
       and not exists (select 1 from automation_runs where job_key = j.key and period_key = v_period and trigger = 'schedule' and status = 'succeeded')
       and (select count(*) from automation_runs where job_key = j.key and period_key = v_period and trigger = 'schedule' and status = 'failed') < 3 then
      perform run_automation(j.key, 'schedule', v_period);
      v_ran := v_ran || to_jsonb(j.key);
    end if;
  end loop;
  return jsonb_build_object('ran', v_ran);
end $$;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'topmind-automations';
    perform cron.schedule('topmind-automations', '5 * * * *', 'select public.run_due_automations()');
  else
    raise notice 'pg_cron is not available: run_due_automations() must be scheduled another way.';
  end if;
exception when others then
  raise notice 'Could not schedule automations with pg_cron (%). Enable pg_cron and re-run this block.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reports
-- ---------------------------------------------------------------------------
create or replace function public.run_report(p_key text, p_filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_from date := nullif(f ->> 'from', '')::date;
  v_to date := nullif(f ->> 'to', '')::date;
  v_lang uuid := try_uuid(f ->> 'language_id');
  v_course uuid := try_uuid(f ->> 'course_id');
  v_class uuid := try_uuid(f ->> 'class_id');
  v_teacher uuid := try_uuid(f ->> 'teacher_id');
  v_status text := nullif(f ->> 'status', '');
  v jsonb;
begin
  if not is_admin() then raise exception 'Only an administrator can run reports'; end if;
  if nullif(f ->> 'month', '') is not null then
    v_from := (f ->> 'month' || '-01')::date;
    v_to := (v_from + interval '1 month - 1 day')::date;
  end if;

  if p_key = 'registrations' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v from (
      select (r.created_at at time zone biz_tz())::date as date, r.tracking_code as tracking, r.student_name as name, r.email, r.phone,
             l.name as language, c.name as programme, r.format, r.mode, r.source, r.status
      from registrations r left join languages l on l.id = r.language_id left join courses c on c.id = r.course_id
      where (v_from is null or (r.created_at at time zone biz_tz())::date >= v_from) and (v_to is null or (r.created_at at time zone biz_tz())::date <= v_to)
        and (v_lang is null or r.language_id = v_lang) and (v_course is null or r.course_id = v_course)
        and (v_class is null or r.class_id = v_class) and (v_status is null or r.status = v_status)) x;

  elsif p_key = 'enrolments' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.start_date desc), '[]') into v from (
      select s.student_code, s.full_name as student, cl.name as class, l.name as language, co.name as programme, p.full_name as teacher,
             e.status, e.start_date, e.end_date, e.reason
      from enrolments e join students s on s.id = e.student_id join classes cl on cl.id = e.class_id
      left join courses co on co.id = cl.course_id left join languages l on l.id = co.language_id left join profiles p on p.id = cl.teacher_id
      where (v_from is null or coalesce(e.end_date, 'infinity') >= v_from) and (v_to is null or e.start_date <= v_to)
        and (v_lang is null or co.language_id = v_lang) and (v_course is null or cl.course_id = v_course)
        and (v_class is null or cl.id = v_class) and (v_teacher is null or cl.teacher_id = v_teacher) and (v_status is null or e.status = v_status)) x;

  elsif p_key = 'classes' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.class), '[]') into v from (
      with alloc as (
        select it.class_id, round(p.amount * it.amount / nullif(tot.gross, 0), 2) as amount
        from payments p join invoice_items it on it.invoice_id = p.invoice_id and it.kind <> 'discount'
        join lateral (select sum(amount) as gross from invoice_items where invoice_id = p.invoice_id and kind <> 'discount') tot on true
        where p.status = 'confirmed' and (v_from is null or p.paid_on >= v_from) and (v_to is null or p.paid_on <= v_to))
      select cl.name as class, l.name as language, co.name as programme, lv.name as level, p.full_name as teacher, cl.status, cl.mode,
             cl.kind as type, cl.capacity, en.n as enrolled, greatest(cl.capacity - en.n, 0) as spaces,
             att.pct as attendance_percent, coalesce(inv.total, 0) as invoiced, coalesce((select sum(amount) from alloc where alloc.class_id = cl.id), 0) as collected
      from classes cl left join courses co on co.id = cl.course_id left join languages l on l.id = co.language_id
      left join levels lv on lv.id = cl.level_id left join profiles p on p.id = cl.teacher_id
      cross join lateral (select count(*)::int as n from enrolments where class_id = cl.id and status = 'active') en
      left join lateral (select round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                                      / nullif(count(*) filter (where a.status in ('present', 'late', 'absent')), 0), 1) as pct
                         from sessions s join attendance a on a.session_id = s.id
                         where s.class_id = cl.id and (v_from is null or s.session_date >= v_from) and (v_to is null or s.session_date <= v_to)) att on true
      left join lateral (select sum(it.amount) as total from invoice_items it join invoices i on i.id = it.invoice_id
                         where it.class_id = cl.id and i.status not in ('draft', 'void')
                           and (v_from is null or (i.issued_at at time zone biz_tz())::date >= v_from)
                           and (v_to is null or (i.issued_at at time zone biz_tz())::date <= v_to)) inv on true
      where (cl.status <> 'archived' or v_status = 'archived')
        and (v_lang is null or co.language_id = v_lang) and (v_course is null or cl.course_id = v_course)
        and (v_class is null or cl.id = v_class) and (v_teacher is null or cl.teacher_id = v_teacher)) x;

  elsif p_key = 'attendance' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.class, x.student), '[]') into v from (
      select a.student_code, a.student_name as student, a.class_name as class, p.full_name as teacher, a.scheduled, a.present, a.late,
             a.absent, a.excused, a.unmarked, a.attendance_percent,
             case when a.attendance_percent < setting_num('academic.attendance_warning_percent', 75) then 'below target' else '' end as flag
      from attendance_summary(v_from, v_to, v_class, null) a join classes cl on cl.id = a.class_id
      left join courses co on co.id = cl.course_id left join profiles p on p.id = cl.teacher_id
      where (v_teacher is null or cl.teacher_id = v_teacher) and (v_lang is null or co.language_id = v_lang)
        and (v_course is null or cl.course_id = v_course)) x;

  elsif p_key = 'invoices' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.issued desc nulls first), '[]') into v from (
      select o.invoice_no, (o.issued_at at time zone biz_tz())::date as issued, o.student_code, o.student_name as student, o.description,
             o.amount_due, o.amount_paid, o.balance, o.display_status as status, o.due_date
      from invoice_overview o
      where (v_from is null or coalesce((o.issued_at at time zone biz_tz())::date, o.period) >= v_from)
        and (v_to is null or coalesce((o.issued_at at time zone biz_tz())::date, o.period) <= v_to)
        and (v_status is null or o.display_status = v_status)
        and (v_class is null or exists (select 1 from invoice_items it where it.invoice_id = o.id and it.class_id = v_class))
        and (v_lang is null or exists (select 1 from invoice_items it join classes cl on cl.id = it.class_id join courses co on co.id = cl.course_id
                                       where it.invoice_id = o.id and co.language_id = v_lang))) x;

  elsif p_key = 'payments' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v from (
      select p.paid_on as date, p.receipt_no as receipt, s.student_code, s.full_name as student, i.invoice_no, pm.name as method,
             p.reference, p.amount, p.status,
             (select string_agg(distinct cl.name, ', ') from invoice_items it join classes cl on cl.id = it.class_id where it.invoice_id = i.id) as classes,
             (select string_agg(distinct l.name, ', ') from invoice_items it join classes cl on cl.id = it.class_id join courses co on co.id = cl.course_id
                join languages l on l.id = co.language_id where it.invoice_id = i.id) as languages
      from payments p join invoices i on i.id = p.invoice_id join students s on s.id = p.student_id left join payment_methods pm on pm.code = p.method
      where p.status in ('confirmed', 'refunded') and (v_from is null or p.paid_on >= v_from) and (v_to is null or p.paid_on <= v_to)
        and (v_status is null or p.status = v_status)
        and (v_class is null or exists (select 1 from invoice_items it where it.invoice_id = i.id and it.class_id = v_class))
        and (v_lang is null or exists (select 1 from invoice_items it join classes cl on cl.id = it.class_id join courses co on co.id = cl.course_id
                                       where it.invoice_id = i.id and co.language_id = v_lang))) x;

  elsif p_key = 'outstanding' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.days_overdue desc nulls last), '[]') into v from (
      select o.invoice_no, o.student_code, o.student_name as student, (o.issued_at at time zone biz_tz())::date as issued, o.due_date,
             greatest(biz_today() - o.due_date, 0) as days_overdue, o.amount_due, o.amount_paid, o.balance, o.display_status as status
      from invoice_overview o where o.status in ('unpaid', 'partial')
        and (v_class is null or exists (select 1 from invoice_items it where it.invoice_id = o.id and it.class_id = v_class))
        and (v_lang is null or exists (select 1 from invoice_items it join classes cl on cl.id = it.class_id join courses co on co.id = cl.course_id
                                       where it.invoice_id = o.id and co.language_id = v_lang))) x;

  elsif p_key = 'receipts' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.issued desc), '[]') into v from (
      select p.receipt_no as receipt, (p.receipt_issued_at at time zone biz_tz())::date as issued, s.student_code, s.full_name as student,
             i.invoice_no, p.amount, p.status,
             (select o.status from message_outbox o where o.related_type = 'payment' and o.related_id = p.id and o.channel = 'email'
              order by o.created_at desc limit 1) as email_delivery,
             (select o.status from message_outbox o where o.related_type = 'payment' and o.related_id = p.id and o.channel = 'whatsapp'
              order by o.created_at desc limit 1) as whatsapp_delivery
      from payments p join invoices i on i.id = p.invoice_id join students s on s.id = p.student_id
      where p.receipt_no is not null and (v_from is null or (p.receipt_issued_at at time zone biz_tz())::date >= v_from)
        and (v_to is null or (p.receipt_issued_at at time zone biz_tz())::date <= v_to)) x;

  elsif p_key = 'salaries' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.month desc, x.teacher), '[]') into v from (
      select pr.full_name as teacher, to_char(t.period, 'YYYY-MM') as month, t.status, t.lessons_completed as lessons, t.hours,
             t.base_amount, t.additions, t.deductions, t.amount as total, t.amount_paid as paid, t.amount - t.amount_paid as outstanding
      from teacher_payouts t join profiles pr on pr.id = t.teacher_id
      where t.status <> 'void' and (v_from is null or t.period >= month_start(v_from)) and (v_to is null or t.period <= v_to)
        and (v_teacher is null or t.teacher_id = v_teacher) and (v_status is null or t.status = v_status)) x;

  elsif p_key = 'salary_payments' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v from (
      select pp.paid_on as date, pr.full_name as teacher, to_char(t.period, 'YYYY-MM') as month, pp.amount, pp.method, pp.reference, pp.notes
      from teacher_payout_payments pp join teacher_payouts t on t.id = pp.payout_id join profiles pr on pr.id = t.teacher_id
      where (v_from is null or pp.paid_on >= v_from) and (v_to is null or pp.paid_on <= v_to) and (v_teacher is null or t.teacher_id = v_teacher)) x;

  elsif p_key = 'bookings' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.starts desc), '[]') into v from (
      select to_char(b.starts_at at time zone biz_tz(), 'YYYY-MM-DD HH24:MI') as starts, s.full_name as student, p.full_name as teacher,
             l.name as language, b.duration_minutes as minutes, b.mode, b.status, b.price, b.objective
      from bookings b join students s on s.id = b.student_id left join profiles p on p.id = b.teacher_id left join languages l on l.id = b.language_id
      where b.starts_at is not null and (v_from is null or (b.starts_at at time zone biz_tz())::date >= v_from)
        and (v_to is null or (b.starts_at at time zone biz_tz())::date <= v_to)
        and (v_teacher is null or b.teacher_id = v_teacher) and (v_lang is null or b.language_id = v_lang) and (v_status is null or b.status = v_status)) x;

  elsif p_key = 'materials' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v from (
      select (m.created_at at time zone biz_tz())::date as date, m.title, m.kind, cl.name as class, co.name as programme, l.name as language,
             p.full_name as uploaded_by, m.is_published as published, m.audience, round(coalesce(m.size_bytes, 0) / 1048576.0, 2) as size_mb
      from materials m left join classes cl on cl.id = m.class_id left join courses co on co.id = m.course_id
      left join languages l on l.id = m.language_id left join profiles p on p.id = m.uploaded_by
      where m.deleted_at is null and (v_from is null or (m.created_at at time zone biz_tz())::date >= v_from)
        and (v_to is null or (m.created_at at time zone biz_tz())::date <= v_to)
        and (v_class is null or m.class_id = v_class) and (v_lang is null or m.language_id = v_lang)
        and (v_teacher is null or m.uploaded_by = v_teacher)) x;

  elsif p_key = 'proficiency' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.class, x.level_rank), '[]') into v from (
      select cl.name as class, coalesce(lv.name, 'Not assessed') as level, coalesce(lv.rank, 999) as level_rank, count(*) as students
      from enrolments e join classes cl on cl.id = e.class_id
      left join lateral (select pl.level_id from placements pl where pl.student_id = e.student_id
                           and (pl.course_id = cl.course_id or pl.class_id = cl.id) order by pl.created_at desc limit 1) lp on true
      left join levels lv on lv.id = lp.level_id
      where e.status = 'active' and (v_class is null or cl.id = v_class) and (v_teacher is null or cl.teacher_id = v_teacher)
      group by cl.name, lv.name, lv.rank) x;

  elsif p_key = 'summary' then
    v_from := month_start(coalesce(v_from, (biz_today() - interval '5 months')::date));
    v_to := coalesce(v_to, biz_today());
    select coalesce(jsonb_agg(to_jsonb(x) order by x.month), '[]') into v from (
      select to_char(m, 'YYYY-MM') as month,
        (select count(*) from registrations where (created_at at time zone biz_tz())::date between m and me) as new_registrations,
        (select count(*) from enrolments where start_date between m and me and status not in ('pending', 'waitlisted')) as new_enrolments,
        (select count(distinct student_id) from enrolments where status not in ('pending', 'waitlisted') and start_date <= me
                                                              and (end_date is null or end_date >= m)) as active_students,
        (select count(*) from sessions where status = 'completed' and session_date between m and me) as lessons_delivered,
        (select round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*) filter (where a.status in ('present', 'late', 'absent')), 0), 1)
           from attendance a join sessions s on s.id = a.session_id where s.session_date between m and me) as attendance_percent,
        (select coalesce(sum(amount + adjustment_total), 0) from invoices where status not in ('draft', 'void')
                                                            and (issued_at at time zone biz_tz())::date between m and me) as invoiced,
        (select coalesce(sum(amount), 0) from payments where status in ('confirmed', 'refunded') and paid_on between m and me) as collected,
        (select coalesce(sum(amount), 0) from payments where status = 'refunded' and (refunded_at at time zone biz_tz())::date between m and me) as refunded,
        (select coalesce(sum(amount), 0) from teacher_payout_payments where paid_on between m and me) as salaries_paid,
        (select coalesce(sum(amount), 0) from expenses where spent_on between m and me) as expenses
      from (select gs::date as m, (gs + interval '1 month - 1 day')::date as me
            from generate_series(v_from, month_start(v_to), interval '1 month') gs) months) x;
    select coalesce(jsonb_agg(r || jsonb_build_object('net_operating_balance',
             (r ->> 'collected')::numeric - (r ->> 'refunded')::numeric - (r ->> 'salaries_paid')::numeric - (r ->> 'expenses')::numeric)), '[]')
      into v from jsonb_array_elements(v) r;
  else
    raise exception 'Unknown report %', p_key;
  end if;

  insert into report_runs (report_key, filters, row_count, run_by) values (p_key, f, jsonb_array_length(v), auth.uid());
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Dashboards and catalogue
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_m date := month_start(biz_today()); v_me date := (month_start(biz_today()) + interval '1 month - 1 day')::date; v jsonb;
begin
  if not is_admin() then raise exception 'Only an administrator can see the dashboard'; end if;
  with alloc as (
    select it.class_id, it.booking_id, round(p.amount * it.amount / nullif(tot.gross, 0), 2) as amount
    from payments p join invoice_items it on it.invoice_id = p.invoice_id and it.kind <> 'discount'
    join lateral (select sum(amount) as gross from invoice_items where invoice_id = p.invoice_id and kind <> 'discount') tot on true
    where p.status = 'confirmed' and p.paid_on between v_m and v_me)
  select jsonb_build_object(
    'month', v_m,
    'students_total', (select count(*) from students where status <> 'archived'),
    'students_active', (select count(distinct e.student_id) from enrolments e join students s on s.id = e.student_id
                        where e.status = 'active' and s.status = 'active'),
    'registrations_new', (select count(*) from registrations where (created_at at time zone biz_tz())::date >= v_m),
    'registrations_pending', (select count(*) from registrations where status in ('pending', 'info_requested')),
    'classes_total', (select count(*) from classes where status <> 'archived'),
    'classes_active', (select count(*) from classes where status = 'active'),
    'teachers_total', (select count(*) from profiles where role = 'teacher'),
    'teachers_active', (select count(*) from profiles p left join teacher_profiles tp on tp.profile_id = p.id
                        where p.role = 'teacher' and p.status = 'active' and coalesce(tp.employment_status, 'active') = 'active'),
    'collected_month', (select coalesce(sum(amount), 0) from payments where status = 'confirmed' and paid_on between v_m and v_me),
    'invoiced_month', (select coalesce(sum(amount + adjustment_total), 0) from invoices where status not in ('draft', 'void')
                       and (issued_at at time zone biz_tz())::date between v_m and v_me),
    'outstanding_total', (select coalesce(sum(balance), 0) from invoice_overview where status in ('unpaid', 'partial')),
    'overdue_total', (select coalesce(sum(balance), 0) from invoice_overview where is_overdue),
    'overdue_count', (select count(*) from invoice_overview where is_overdue),
    'partial_count', (select count(*) from invoices where status = 'partial'),
    'payments_pending', (select count(*) from payments where status = 'pending'),
    'salaries_month', (select coalesce(sum(amount), 0) from teacher_payouts where status <> 'void' and period = month_start((biz_today() - interval '1 month')::date)),
    'salaries_paid_month', (select coalesce(sum(amount), 0) from teacher_payout_payments where paid_on between v_m and v_me),
    'salaries_outstanding', (select coalesce(sum(amount - amount_paid), 0) from teacher_payouts where status in ('approved', 'partially_paid')),
    'expenses_month', (select coalesce(sum(amount), 0) from expenses where spent_on between v_m and v_me),
    'attendance_percent', (select round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                                        / nullif(count(*) filter (where a.status in ('present', 'late', 'absent')), 0), 1)
                           from attendance a join sessions s on s.id = a.session_id where s.session_date between v_m and v_me),
    'missing_attendance', (select count(*) from sessions where status = 'scheduled' and session_date < biz_today()),
    'checklist_pending', (select count(*) from checklists where month = v_m and status in ('pending', 'in_progress')),
    'checklist_overdue', (select count(*) from checklists where status in ('pending', 'in_progress') and due_date < biz_today()),
    'messages_failed', (select count(*) from message_outbox where status = 'failed'),
    'enquiries_open', (select count(*) from enquiries where status in ('new', 'in_progress', 'follow_up')),
    'bookings_requested', (select count(*) from bookings where status = 'requested'),
    'upcoming_lessons', (select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]') from (
        select jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'class', coalesce(c.name, 'One-to-one'), 'teacher', p.full_name, 'status', s.status) x
        from sessions s left join classes c on c.id = s.class_id left join profiles p on p.id = s.teacher_id
        where s.status = 'scheduled' and s.starts_at between now() and now() + interval '7 days' order by s.starts_at limit 12) y),
    'upcoming_bookings', (select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]') from (
        select jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'student', st.full_name, 'teacher', p.full_name, 'status', b.status) x
        from bookings b join students st on st.id = b.student_id left join profiles p on p.id = b.teacher_id
        where b.status in ('requested', 'approved') and b.starts_at between now() and now() + interval '7 days' order by b.starts_at limit 12) y),
    'income_by_class', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by amount desc), '[]') from (
        select coalesce(c.name, case when a.booking_id is not null then 'One-to-one lessons' else 'Other charges' end) as label, sum(a.amount) as amount
        from alloc a left join classes c on c.id = a.class_id group by 1) y),
    'income_by_language', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by amount desc), '[]') from (
        select coalesce(l.name, 'Unassigned') as label, sum(a.amount) as amount
        from alloc a left join classes c on c.id = a.class_id left join courses co on co.id = c.course_id
        left join bookings b on b.id = a.booking_id left join languages l on l.id = coalesce(co.language_id, b.language_id) group by 1) y),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon YY'),
        'invoiced', (select coalesce(sum(amount + adjustment_total), 0) from invoices where status not in ('draft', 'void')
                      and (issued_at at time zone biz_tz())::date between m and (m + interval '1 month - 1 day')::date),
        'collected', (select coalesce(sum(amount), 0) from payments where status = 'confirmed' and paid_on between m and (m + interval '1 month - 1 day')::date))
        order by m), '[]')
        from generate_series((v_m - interval '5 months')::date, v_m, interval '1 month') m),
    'class_performance', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'teacher', p.full_name, 'status', c.status,
        'capacity', c.capacity, 'enrolled', en.n, 'spaces', greatest(c.capacity - en.n, 0),
        'attendance_percent', (select round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                                            / nullif(count(*) filter (where a.status in ('present', 'late', 'absent')), 0), 1)
                               from attendance a join sessions s on s.id = a.session_id where s.class_id = c.id and s.session_date between v_m and v_me),
        'collected_month', coalesce((select sum(amount) from alloc where alloc.class_id = c.id), 0)) order by c.name), '[]')
        from classes c left join profiles p on p.id = c.teacher_id
        cross join lateral (select count(*)::int as n from enrolments where class_id = c.id and status = 'active') en
        where c.status in ('active', 'draft')))
  into v;
  return v;
end $$;

create or replace function public.public_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('languages', coalesce((select jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'slug', l.slug, 'description', l.description, 'is_active', l.is_active,
    'programmes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', co.id, 'name', co.name, 'slug', co.slug, 'summary', co.summary, 'description', co.description, 'audience', co.audience,
      'formats', co.formats,
      'levels', coalesce((select jsonb_agg(jsonb_build_object('id', lv.id, 'name', lv.name, 'monthly_fee', lv.monthly_fee, 'description', lv.description)
                          order by lv.rank, lv.name) from levels lv where lv.course_id = co.id and lv.is_active), '[]'),
      'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'type', c.kind, 'mode', c.mode,
                            'level', (select name from levels where id = c.level_id), 'schedule', class_schedule_text(c.id),
                            'start_date', c.start_date, 'fee', c.fee, 'billing_frequency', c.billing_frequency, 'timezone', c.timezone,
                            'spaces_left', greatest(c.capacity - (select count(*) from enrolments e where e.class_id = c.id and e.status = 'active'), 0),
                            'teacher', (select split_part(full_name, ' ', 1) from profiles where id = c.teacher_id)) order by c.name)
                           from classes c where c.course_id = co.id and c.status = 'active' and c.kind in ('group', 'special', 'trial')
                             and (c.end_date is null or c.end_date >= biz_today())), '[]'),
      'has_assessment', assessment_for(co.id, l.id) is not null)
      order by co.sort_order, co.name) from courses co where co.language_id = l.id and co.active), '[]'))
    order by l.sort_order, l.name) from languages l), '[]'),
  'one_to_one', exists (select 1 from teacher_booking_settings where accepts_bookings))
$$;

create or replace function public.my_classes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'enrolment_id', e.id, 'status', e.status, 'start_date', e.start_date, 'end_date', e.end_date,
    'class', jsonb_build_object('id', c.id, 'name', c.name, 'type', c.kind, 'mode', c.mode, 'schedule', class_schedule_text(c.id),
      'timezone', c.timezone, 'location', coalesce(c.location_note, (select name from classrooms where id = c.classroom_id)),
      'meeting_link', case when e.status = 'active' then c.meeting_link end,
      'programme', (select name from courses where id = c.course_id), 'level', (select name from levels where id = c.level_id),
      'language', (select l.name from courses co join languages l on l.id = co.language_id where co.id = c.course_id)),
    'teacher', (select jsonb_build_object('name', p.full_name, 'bio', tp.bio) from profiles p left join teacher_profiles tp on tp.profile_id = p.id
                where p.id = c.teacher_id))
    order by case when e.status = 'active' then 0 else 1 end, e.start_date desc), '[]'::jsonb)
  from enrolments e join classes c on c.id = e.class_id
  where e.student_id in (select my_student_ids())
$$;

-- Lessons visible to the caller between two dates (calendar views).
create or replace function public.lesson_calendar(p_from date, p_to date, p_teacher uuid default null, p_class uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'status', s.status, 'topic', s.topic, 'cancel_reason', s.cancel_reason, 'class_id', s.class_id, 'booking_id', s.booking_id,
    'class', coalesce(c.name, 'One-to-one: ' || coalesce((select full_name from students where id = b.student_id), '')),
    'mode', coalesce(c.mode, b.mode), 'teacher_id', s.teacher_id, 'teacher', p.full_name,
    'is_substitute', c.teacher_id is not null and s.teacher_id is distinct from c.teacher_id,
    'meeting_link', case when is_admin() or s.teacher_id = auth.uid() or active_in_class(s.class_id) then c.meeting_link end,
    'attendance_taken', exists (select 1 from attendance a where a.session_id = s.id))
    order by s.starts_at), '[]'::jsonb)
  from sessions s left join classes c on c.id = s.class_id left join bookings b on b.id = s.booking_id left join profiles p on p.id = s.teacher_id
  where s.session_date between p_from and least(p_to, p_from + 92)
    and (p_teacher is null or s.teacher_id = p_teacher) and (p_class is null or s.class_id = p_class)
    and (is_admin()
         or (is_teacher() and (s.teacher_id = auth.uid() or c.teacher_id = auth.uid()))
         or in_class(s.class_id)
         or (b.id is not null and is_my_student(b.student_id)))
$$;

create or replace function public.student_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_student uuid := my_student_id(); v jsonb;
begin
  if v_student is null then return jsonb_build_object('linked', false); end if;
  select jsonb_build_object(
    'linked', true,
    'student', (select jsonb_build_object('id', id, 'name', full_name, 'code', student_code, 'status', status) from students where id = v_student),
    'classes', my_classes(),
    'next_lessons', (select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]') from (
        select jsonb_build_object('starts_at', s.starts_at, 'class', coalesce(c.name, 'One-to-one lesson'), 'status', s.status,
                                  'meeting_link', c.meeting_link, 'mode', coalesce(c.mode, b.mode)) x
        from sessions s left join classes c on c.id = s.class_id left join bookings b on b.id = s.booking_id
        where s.starts_at between now() - interval '2 hours' and now() + interval '14 days' and s.status <> 'cancelled'
          and ((s.class_id is not null and exists (select 1 from enrolments e where e.class_id = s.class_id and e.student_id = v_student and e.status = 'active'))
               or b.student_id = v_student)
        order by s.starts_at limit 8) y),
    'attendance', (select jsonb_build_object('present', coalesce(sum(present), 0), 'late', coalesce(sum(late), 0), 'absent', coalesce(sum(absent), 0),
        'excused', coalesce(sum(excused), 0),
        'percent', round(100.0 * (coalesce(sum(present), 0) + coalesce(sum(late), 0)) / nullif(coalesce(sum(present), 0) + coalesce(sum(late), 0) + coalesce(sum(absent), 0), 0), 1))
        from attendance_summary(null, null, null, v_student)),
    'balance', (select coalesce(sum(invoice_balance(id)), 0) from invoices where student_id = v_student and status in ('unpaid', 'partial')),
    'overdue', (select count(*) from invoices where student_id = v_student and status in ('unpaid', 'partial') and due_date < biz_today()),
    'pending_payments', (select count(*) from payments where student_id = v_student and status = 'pending'),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'status', b.status,
                   'teacher', (select full_name from profiles where id = b.teacher_id)) order by b.starts_at), '[]')
                 from bookings b where b.student_id = v_student and b.status in ('requested', 'approved') and b.starts_at > now()),
    'level', (select jsonb_build_object('level', lv.name, 'programme', co.name, 'date', (pl.created_at at time zone biz_tz())::date)
              from placements pl left join levels lv on lv.id = pl.level_id left join courses co on co.id = pl.course_id
              where pl.student_id = v_student and pl.level_id is not null order by pl.created_at desc limit 1),
    'unread', (select count(*) from notifications where user_id = auth.uid() and not read))
  into v;
  return v;
end $$;

create or replace function public.teacher_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_teacher() then raise exception 'Teachers only'; end if;
  select jsonb_build_object(
    'classes', (select count(*) from classes where teacher_id = auth.uid() and status = 'active'),
    'students', (select count(distinct e.student_id) from enrolments e join classes c on c.id = e.class_id
                 where c.teacher_id = auth.uid() and e.status = 'active'),
    'today', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
                'class', coalesce(c.name, 'One-to-one'), 'meeting_link', c.meeting_link,
                'attendance_taken', exists (select 1 from attendance a where a.session_id = s.id)) order by s.starts_at), '[]')
              from sessions s left join classes c on c.id = s.class_id
              where s.teacher_id = auth.uid() and s.session_date = biz_today() and s.status <> 'cancelled'),
    'week', (select count(*) from sessions where teacher_id = auth.uid() and status <> 'cancelled'
             and session_date between biz_today() and biz_today() + 6),
    'missing_attendance', (select count(*) from sessions where teacher_id = auth.uid() and status = 'scheduled' and session_date < biz_today()),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'status', b.status,
                   'student', (select full_name from students where id = b.student_id)) order by b.starts_at), '[]')
                 from bookings b where b.teacher_id = auth.uid() and b.status in ('requested', 'approved') and b.starts_at > now()),
    'earnings', calculate_teacher_pay(auth.uid(), biz_today()),
    'salary_outstanding', (select coalesce(sum(amount - amount_paid), 0) from teacher_payouts
                           where teacher_id = auth.uid() and status in ('approved', 'partially_paid')),
    'announcements', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body, 'published_at', a.published_at)
                        order by a.published_at desc), '[]')
                      from (select * from announcements a where can_see_announcement(a) order by published_at desc limit 5) a),
    'unread', (select count(*) from notifications where user_id = auth.uid() and not read))
  into v;
  return v;
end $$;

-- Teacher's students with contact details and attendance.
create or replace function public.my_students() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('student_id', s.id, 'name', s.full_name, 'code', s.student_code, 'email', s.email,
    'phone', s.phone, 'preferred_contact', s.preferred_contact, 'emergency_name', s.guardian_name, 'emergency_phone', s.guardian_phone,
    'objectives', s.learning_objectives, 'class_id', c.id, 'class', c.name, 'enrolment_status', e.status,
    'attendance_percent', (select attendance_percent from attendance_summary(null, null, c.id, s.id) limit 1),
    'level', (select lv.name from placements pl join levels lv on lv.id = pl.level_id where pl.student_id = s.id
              and (pl.course_id = c.course_id or pl.class_id = c.id) order by pl.created_at desc limit 1))
    order by c.name, s.full_name), '[]'::jsonb)
  from enrolments e join classes c on c.id = e.class_id join students s on s.id = e.student_id
  where is_teacher() and c.teacher_id = auth.uid() and e.status in ('active', 'suspended', 'waitlisted')
$$;

-- Students correct their own details (PDPA right of correction). Email and
-- status changes go through the academy.
create or replace function public.update_my_student_profile(p jsonb) returns students
language plpgsql security definer set search_path = public as $$
declare v_student uuid := my_student_id(); s students; v_phone text := nullif(trim(coalesce(p ->> 'phone', '')), '');
begin
  if v_student is null then raise exception 'Your login is not linked to a student record yet'; end if;
  if length(trim(coalesce(p ->> 'full_name', ''))) < 2 then raise exception 'Please enter your full name'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Please enter a valid phone number'; end if;
  if coalesce(p ->> 'preferred_contact', 'email') not in ('email', 'whatsapp', 'phone') then raise exception 'Unknown contact preference'; end if;
  if p ->> 'preferred_contact' in ('whatsapp', 'phone') and v_phone is null then raise exception 'Add a phone number to be contacted that way'; end if;
  update students set full_name = left(trim(p ->> 'full_name'), 120), phone = v_phone,
    preferred_contact = coalesce(p ->> 'preferred_contact', preferred_contact),
    timezone = coalesce(nullif(p ->> 'timezone', ''), timezone),
    learning_objectives = left(p ->> 'learning_objectives', 2000),
    guardian_name = left(nullif(trim(p ->> 'guardian_name'), ''), 120), guardian_phone = left(nullif(trim(p ->> 'guardian_phone'), ''), 30),
    date_of_birth = coalesce(nullif(p ->> 'date_of_birth', '')::date, date_of_birth),
    consent_marketing = coalesce((p ->> 'consent_marketing')::boolean, consent_marketing),
    consent_whatsapp = coalesce((p ->> 'consent_whatsapp')::boolean, consent_whatsapp)
  where id = v_student returning * into s;
  update profiles set full_name = s.full_name, phone = s.phone where id = auth.uid();
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Policies, auditing, grants
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['report_runs', 'checklist_templates', 'automation_jobs', 'automation_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['checklist_templates', 'checklists', 'automation_jobs'] loop
    perform enable_audit(t);
  end loop;
end $$;

-- Starter checklist for the current month.
do $$ begin perform generate_monthly_checklist(biz_today()); end $$;

revoke execute on function checklists_guard(), job_payment_reminders(), job_booking_reminders(), job_attendance_monitor(),
  job_checklist(), job_cleanup(), checklist_check(text, date) from public, anon, authenticated;
revoke execute on function admin_dashboard(), run_report(text, jsonb), run_automation(text, text, text), run_due_automations(),
  generate_monthly_checklist(date), refresh_checklist(date) from anon;
grant execute on function public_catalog(), public_settings(), submit_registration(jsonb), submit_enquiry(jsonb),
  track_registration(text), get_assessment(text), submit_assessment(text, jsonb) to anon, authenticated;

commit;
