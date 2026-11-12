-- 0006_engagement.sql
-- Notifications (in-app, email and WhatsApp outbox with templates, consent and
-- duplicate protection), announcements, the enquiry inbox with suggested
-- replies, and the one-to-one booking system.

begin;

insert into app_settings (key, value, category, label, description, is_public) values
  ('system.timezone_label', '"Malaysia time"', 'system', 'Time zone label', 'Shown next to times in messages.', true),
  ('communication.email_enabled', 'true', 'communication', 'Send emails', 'Emails are queued and sent by the dispatch-messages function.', false),
  ('communication.whatsapp_enabled', 'false', 'communication', 'Send WhatsApp messages',
     'Needs WhatsApp Business Platform credentials and approved templates.', false),
  ('communication.sender_name', '"Top Mind Enterprise"', 'communication', 'Sender name', null, false),
  ('communication.admin_alert_email', '"etopmind@gmail.com"', 'communication', 'Admin alert email', 'Receives alerts about registrations, payments and failures.', false),
  ('communication.absence_message_to_student', 'true', 'communication', 'Check in with students after repeated absences', null, false),
  ('booking.cancellation_window_hours', '24', 'booking', 'Cancellation window (hours)', 'Students can cancel or move a confirmed booking up to this many hours before it starts.', true),
  ('booking.reminder_hours', '24', 'booking', 'Booking reminder (hours before)', null, false),
  ('booking.default_price_per_hour', '0', 'booking', 'Default one-to-one price per hour', 'Used when a teacher has no price of their own. 0 means not charged.', false),
  ('enquiries.auto_reply_email', 'true', 'enquiries', 'Email an automatic answer to website enquiries', null, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Formatting helpers
-- ---------------------------------------------------------------------------
create or replace function public.fmt_money(p_amount numeric) returns text
language sql stable as $$ select setting_text('finance.currency_symbol', 'RM') || ' ' || to_char(coalesce(p_amount, 0), 'FM999,999,990.00') $$;

create or replace function public.fmt_date(p_date date) returns text
language sql immutable as $$ select to_char(p_date, 'Dy DD Mon YYYY') $$;

create or replace function public.fmt_time(p_time time) returns text
language sql immutable as $$ select ltrim(to_char(p_time, 'HH12:MI AM'), '0') $$;

create or replace function public.fmt_ts(p_ts timestamptz) returns text
language sql stable as $$
  select to_char(p_ts at time zone biz_tz(), 'Dy DD Mon YYYY, ') || ltrim(to_char(p_ts at time zone biz_tz(), 'HH12:MI AM'), '0')
         || ' (' || setting_text('system.timezone_label', biz_tz()) || ')'
$$;

create or replace function public.class_schedule_text(p_class uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(trim(to_char(date '2000-01-02' + weekday, 'Dy')) || ' ' || fmt_time(start_time) || '-' || fmt_time(end_time),
                             ', ' order by weekday, start_time), 'Schedule to be confirmed')
  from class_schedules where class_id = p_class
$$;

create or replace function public.normalize_phone(p_phone text) returns text
language sql immutable as $$
  select case when d = '' then null when d like '0%' then '60' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x
$$;

create or replace function public.render_template(p_text text, p_vars jsonb) returns text
language plpgsql immutable as $$
declare k text; v text; v_out text := coalesce(p_text, '');
begin
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  v_out := regexp_replace(v_out, '\{\{[a-z_0-9]+\}\}', '', 'g');
  return regexp_replace(v_out, E'\n{3,}', E'\n\n', 'g');
end $$;

create or replace function public.base_vars() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business_name', setting_text('business.name', 'Top Mind Enterprise'),
    'business_phone', setting_text('business.phone', ''),
    'business_email', setting_text('business.email', ''),
    'whatsapp_link', 'https://wa.me/' || setting_text('business.whatsapp', ''),
    'site_url', coalesce(setting_text('system.site_url'), ''),
    'portal_url', coalesce(setting_text('system.site_url'), '') || '/login')
$$;

-- ---------------------------------------------------------------------------
-- 2. Templates, outbox, in-app notifications
-- ---------------------------------------------------------------------------
alter table notifications add column if not exists type text;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists related_type text;
alter table notifications add column if not exists related_id uuid;
alter table notifications add column if not exists read_at timestamptz;
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists message_templates (
  key text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'in_app')),
  subject text,
  body text not null,
  wa_template_name text,
  wa_language text not null default 'en',
  wa_params text[],
  is_active boolean not null default true,
  description text,
  updated_at timestamptz not null default now(),
  primary key (key, channel)
);

create table if not exists message_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  template_key text,
  recipient text not null,
  recipient_name text,
  student_id uuid references students on delete set null,
  profile_id uuid references profiles on delete set null,
  subject text,
  body text not null,
  variables jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider text,
  provider_message_id text,
  related_type text,
  related_id uuid,
  dedupe_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists message_outbox_dedupe_key on message_outbox (dedupe_key) where dedupe_key is not null;
create index if not exists message_outbox_queue_idx on message_outbox (status, next_attempt_at);
create index if not exists message_outbox_related_idx on message_outbox (related_type, related_id);
create index if not exists message_outbox_student_idx on message_outbox (student_id, created_at desc);
drop trigger if exists message_outbox_touch on message_outbox;
create trigger message_outbox_touch before update on message_outbox for each row execute function touch_updated_at();

create or replace function public.notify_user(p_user uuid, p_title text, p_body text, p_type text default null,
  p_link text default null, p_related_type text default null, p_related_id uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, type, link, related_type, related_id)
  select p_user, p_title, p_body, p_type, p_link, p_related_type, p_related_id
  where p_user is not null and exists (select 1 from profiles where id = p_user and status = 'active')
$$;

create or replace function public.enqueue_message(p_channel text, p_template text, p_recipient text, p_name text, p_vars jsonb,
  p_student uuid default null, p_profile uuid default null, p_related_type text default null, p_related_id uuid default null,
  p_dedupe text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t message_templates; v_vars jsonb; v_id uuid; v_status text := 'queued'; v_err text;
begin
  if coalesce(trim(p_recipient), '') = '' then return null; end if;
  select * into t from message_templates where key = p_template and channel = p_channel and is_active;
  if not found then return null; end if;
  v_vars := base_vars() || jsonb_build_object('name', coalesce(nullif(split_part(trim(p_name), ' ', 1), ''), 'there'))
            || coalesce(p_vars, '{}'::jsonb);
  if p_channel = 'email' and not setting_bool('communication.email_enabled', true) then
    v_status := 'skipped'; v_err := 'Email sending is turned off in settings';
  elsif p_channel = 'whatsapp' and not setting_bool('communication.whatsapp_enabled', false) then
    v_status := 'skipped'; v_err := 'WhatsApp is not enabled in settings';
  end if;
  insert into message_outbox (channel, template_key, recipient, recipient_name, student_id, profile_id, subject, body,
                              variables, status, last_error, related_type, related_id, dedupe_key, created_by)
  values (p_channel, p_template, trim(p_recipient), p_name, p_student, p_profile, render_template(t.subject, v_vars),
          render_template(t.body, v_vars), v_vars, v_status, v_err, p_related_type, p_related_id, p_dedupe, auth.uid())
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;

-- In-app + email + WhatsApp (only with consent) for a student. Email is the
-- fallback whenever WhatsApp is not possible.
create or replace function public.notify_student(p_student uuid, p_template text, p_vars jsonb, p_related_type text default null,
  p_related_id uuid default null, p_dedupe text default null, p_link text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s students; v_vars jsonb; t message_templates; v_wa boolean;
begin
  select * into s from students where id = p_student;
  if not found then return; end if;
  v_vars := base_vars() || jsonb_build_object('name', coalesce(nullif(split_part(s.full_name, ' ', 1), ''), 'there'),
            'student_name', s.full_name, 'student_code', s.student_code) || coalesce(p_vars, '{}'::jsonb);
  if s.profile_id is not null then
    select * into t from message_templates where key = p_template and channel = 'in_app' and is_active;
    if found then
      perform notify_user(s.profile_id, render_template(t.subject, v_vars), render_template(t.body, v_vars), p_template, p_link,
                          p_related_type, p_related_id);
    end if;
  end if;
  v_wa := s.consent_whatsapp and normalize_phone(s.phone) is not null and setting_bool('communication.whatsapp_enabled', false)
          and exists (select 1 from message_templates where key = p_template and channel = 'whatsapp' and is_active);
  if v_wa then
    perform enqueue_message('whatsapp', p_template, normalize_phone(s.phone), s.full_name, v_vars, s.id, s.profile_id,
                            p_related_type, p_related_id, p_dedupe || ':whatsapp');
  end if;
  if s.email is not null and not (v_wa and s.preferred_contact = 'whatsapp') then
    perform enqueue_message('email', p_template, s.email, s.full_name, v_vars, s.id, s.profile_id, p_related_type, p_related_id,
                            p_dedupe || ':email');
  end if;
end $$;

create or replace function public.notify_profile(p_profile uuid, p_template text, p_vars jsonb, p_related_type text default null,
  p_related_id uuid default null, p_dedupe text default null, p_link text default null, p_email boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles; v_vars jsonb; t message_templates;
begin
  select * into p from profiles where id = p_profile and status = 'active';
  if not found then return; end if;
  v_vars := base_vars() || jsonb_build_object('name', coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'there')) || coalesce(p_vars, '{}'::jsonb);
  select * into t from message_templates where key = p_template and channel = 'in_app' and is_active;
  if found then
    perform notify_user(p.id, render_template(t.subject, v_vars), render_template(t.body, v_vars), p_template, p_link, p_related_type, p_related_id);
  end if;
  if p_email and p.email is not null then
    perform enqueue_message('email', p_template, p.email, p.full_name, v_vars, null, p.id, p_related_type, p_related_id, p_dedupe || ':email');
  end if;
end $$;

create or replace function public.notify_admins_event(p_template text, p_vars jsonb, p_related_type text default null,
  p_related_id uuid default null, p_dedupe text default null, p_link text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_vars jsonb := base_vars() || coalesce(p_vars, '{}'::jsonb); t message_templates;
begin
  select * into t from message_templates where key = p_template and channel = 'in_app' and is_active;
  if found then
    for r in select id from profiles where role = 'admin' and status = 'active' loop
      perform notify_user(r.id, render_template(t.subject, v_vars), render_template(t.body, v_vars), p_template, p_link, p_related_type, p_related_id);
    end loop;
  end if;
  perform enqueue_message('email', p_template, setting_text('communication.admin_alert_email'), 'Admin', v_vars, null, null,
                          p_related_type, p_related_id, p_dedupe || ':admin-email');
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read = true, read_at = now()
  where user_id = auth.uid() and not read and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.retry_message(p_id uuid) returns message_outbox
language plpgsql security definer set search_path = public as $$
declare m message_outbox;
begin
  if not is_admin() then raise exception 'Only an administrator can retry messages'; end if;
  update message_outbox set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null
  where id = p_id and status in ('failed', 'skipped', 'cancelled') returning * into m;
  if not found then raise exception 'Only failed, skipped or cancelled messages can be retried'; end if;
  return m;
end $$;

create or replace function public.resend_message(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m message_outbox; v_id uuid;
begin
  if not is_admin() then raise exception 'Only an administrator can resend messages'; end if;
  select * into m from message_outbox where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  insert into message_outbox (channel, template_key, recipient, recipient_name, student_id, profile_id, subject, body, variables,
                              related_type, related_id, created_by)
  values (m.channel, m.template_key, m.recipient, m.recipient_name, m.student_id, m.profile_id, m.subject, m.body, m.variables,
          m.related_type, m.related_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an administrator can cancel messages'; end if;
  update message_outbox set status = 'cancelled' where id = p_id and status in ('queued', 'failed');
  if not found then raise exception 'Only queued or failed messages can be cancelled'; end if;
end $$;

-- Re-send an invoice or receipt on request (admin).
create or replace function public.resend_document(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an administrator can resend documents'; end if;
  if p_type = 'invoice' then perform emit_event('invoice.resend', 'invoice', p_id);
  elsif p_type = 'receipt' then perform emit_event('payment.resend', 'payment', p_id);
  else raise exception 'Unknown document type'; end if;
end $$;

-- The dispatch-messages Edge Function claims due messages with this, so two
-- runs never send the same message.
create or replace function public.claim_messages(p_limit int default 25) returns setof message_outbox
language plpgsql security definer set search_path = public as $$
begin
  if not is_trusted_context() then raise exception 'Only the dispatcher can claim messages'; end if;
  update message_outbox set status = 'queued', last_error = coalesce(last_error, 'Sending timed out')
  where status = 'sending' and updated_at < now() - interval '10 minutes';
  return query
  update message_outbox m set status = 'sending', attempts = attempts + 1
  where m.id in (select id from message_outbox where status = 'queued' and next_attempt_at <= now()
                 order by created_at limit p_limit for update skip locked)
  returning m.*;
end $$;

create or replace function public.complete_message(p_id uuid, p_ok boolean, p_provider text default null,
  p_provider_id text default null, p_error text default null, p_permanent boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare m message_outbox;
begin
  if not is_trusted_context() then raise exception 'Only the dispatcher can update messages'; end if;
  select * into m from message_outbox where id = p_id for update;
  if not found then return; end if;
  if p_ok then
    update message_outbox set status = 'sent', sent_at = now(), provider = p_provider, provider_message_id = p_provider_id,
      last_error = null where id = p_id;
    if m.related_type = 'invoice' and m.template_key in ('invoice_issued', 'payment_reminder', 'payment_overdue') then
      update invoices set last_sent_at = now() where id = m.related_id;
    end if;
  elsif p_permanent or m.attempts >= m.max_attempts then
    update message_outbox set status = 'failed', provider = p_provider, last_error = left(p_error, 1000) where id = p_id;
    -- WhatsApp could not be delivered: fall back to email when the student has one.
    if m.channel = 'whatsapp' and m.student_id is not null then
      perform enqueue_message('email', m.template_key, (select email from students where id = m.student_id), m.recipient_name,
                              m.variables, m.student_id, m.profile_id, m.related_type, m.related_id,
                              coalesce(m.dedupe_key, m.id::text) || ':fallback-email');
    end if;
  else
    update message_outbox set status = 'queued', provider = p_provider, last_error = left(p_error, 1000),
      next_attempt_at = now() + make_interval(mins => (power(2, m.attempts) * 5)::int) where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Default message templates (editable in Settings)
-- ---------------------------------------------------------------------------
insert into message_templates (key, channel, subject, body, wa_template_name, wa_params, description) values
('registration_received', 'email', 'We have received your registration, {{name}}',
 E'Hi {{name}},\n\nThank you for registering with {{business_name}}. We are glad you are taking this step.\n\nProgramme: {{programme}}\nYour tracking code: {{tracking_code}}\n{{assessment_line}}\n\nOur team will review your registration and contact you soon. You can check your status any time at {{track_url}}.\n\nQuestions? Reply to this email or message us on WhatsApp: {{whatsapp_link}}\n\nWarm regards,\n{{business_name}}',
 null, null, 'Sent to the applicant after a website registration.'),
('registration_received', 'whatsapp', null,
 'Hi {{name}}, thank you for registering with {{business_name}} for {{programme}}. Your tracking code is {{tracking_code}}. We will be in touch soon.',
 'topmind_registration_received', '{name,programme,tracking_code}', null),
('admin_new_registration', 'in_app', 'New registration: {{applicant}}', '{{applicant}} registered for {{programme}}. Review it under Registrations.', null, null, null),
('admin_new_registration', 'email', 'New registration: {{applicant}}',
 E'{{applicant}} ({{email}}, {{phone}}) registered for {{programme}}.\n\nReview it in the admin portal: {{portal_url}}', null, null, null),
('registration_approved', 'email', 'Welcome to {{business_name}}, {{name}}',
 E'Hi {{name}},\n\nGreat news: your registration has been approved. {{next_step}}\n\nYou can sign in to the student portal at {{portal_url}} with this email address. If you have not set a password yet, look out for our invitation email, or choose "Forgot password" on the sign-in page.\n\nWe are looking forward to learning with you.\n\n{{business_name}}', null, null, null),
('registration_approved', 'whatsapp', null, 'Hi {{name}}, your registration with {{business_name}} has been approved. Welcome! We will send your class details shortly.',
 'topmind_registration_approved', '{name}', null),
('registration_approved', 'in_app', 'Your registration is approved', 'Welcome to {{business_name}}! {{next_step}}', null, null, null),
('registration_waitlisted', 'email', 'You are on our waiting list',
 E'Hi {{name}},\n\nThank you for your patience. {{class_name}} is full at the moment, so we have added you to the waiting list. We will contact you as soon as a place opens, or suggest another class that suits you.\n\n{{business_name}}', null, null, null),
('registration_rejected', 'email', 'About your registration',
 E'Hi {{name}},\n\nThank you for your interest in {{business_name}}. Unfortunately we cannot offer you a place at the moment.\n\n{{reason}}\n\nIf you have any questions, or would like to discuss other options, please reply to this email or message us on WhatsApp: {{whatsapp_link}}\n\nKind regards,\n{{business_name}}', null, null, null),
('registration_info_requested', 'email', 'We need a little more information',
 E'Hi {{name}},\n\nThank you for registering with {{business_name}}. Before we can confirm your place, we need a little more information:\n\n{{message}}\n\nPlease reply to this email or message us on WhatsApp: {{whatsapp_link}}\n\nThank you,\n{{business_name}}', null, null, null),
('class_assigned', 'email', 'You are in: {{class_name}}',
 E'Hi {{name}},\n\nYou have been placed in {{class_name}}.\n\nSchedule: {{schedule}}\nStarts: {{start_date}}\nTeacher: {{teacher_name}}\nWhere: {{where}}\n\nYou can see your schedule, materials and invoices in the student portal: {{portal_url}}\n\nSee you in class!\n{{business_name}}', null, null, null),
('class_assigned', 'whatsapp', null, 'Hi {{name}}, you are in {{class_name}} ({{schedule}}), starting {{start_date}}. See you in class!',
 'topmind_class_assigned', '{name,class_name,schedule,start_date}', null),
('class_assigned', 'in_app', 'You have joined {{class_name}}', '{{schedule}}. Starts {{start_date}}.', null, null, null),
('lesson_cancelled', 'email', '{{class_name}} on {{lesson_date}} is cancelled',
 E'Hi {{name}},\n\nThe {{class_name}} lesson on {{lesson_date}} at {{lesson_time}} is cancelled.\n\nReason: {{reason}}\n\nWe are sorry for the change. Your other lessons are not affected.\n\n{{business_name}}', null, null, null),
('lesson_cancelled', 'whatsapp', null, 'Hi {{name}}, the {{class_name}} lesson on {{lesson_date}} is cancelled. Reason: {{reason}}.',
 'topmind_lesson_cancelled', '{name,class_name,lesson_date,reason}', null),
('lesson_cancelled', 'in_app', 'Lesson cancelled: {{class_name}}', '{{lesson_date}} at {{lesson_time}}. {{reason}}', null, null, null),
('lesson_rescheduled', 'email', '{{class_name}} has moved to {{lesson_date}}',
 E'Hi {{name}},\n\nThe {{class_name}} lesson has moved to {{lesson_date}} at {{lesson_time}}.\n\nReason: {{reason}}\n\n{{business_name}}', null, null, null),
('lesson_rescheduled', 'in_app', 'Lesson moved: {{class_name}}', 'Now on {{lesson_date}} at {{lesson_time}}. {{reason}}', null, null, null),
('schedule_changed', 'email', 'Schedule update for {{class_name}}',
 E'Hi {{name}},\n\n{{message}}\n\nThe schedule for {{class_name}} is now: {{schedule}}\n\n{{business_name}}', null, null, null),
('schedule_changed', 'in_app', 'Schedule update: {{class_name}}', '{{message}} New schedule: {{schedule}}', null, null, null),
('teacher_lesson_assigned', 'in_app', 'Lesson assigned: {{class_name}}', '{{lesson_date}} at {{lesson_time}}. {{message}}', null, null, null),
('teacher_lesson_assigned', 'email', 'Lesson assigned: {{class_name}} on {{lesson_date}}',
 E'Hi {{name}},\n\nYou have been assigned the {{class_name}} lesson on {{lesson_date}} at {{lesson_time}}. {{message}}\n\nSee your schedule in the teacher portal: {{portal_url}}', null, null, null),
('teacher_missing_attendance', 'in_app', 'Attendance needed: {{class_name}}', 'Please record attendance for the lesson on {{lesson_date}}.', null, null, null),
('absence_check_in', 'email', 'We missed you in {{class_name}}',
 E'Hi {{name}},\n\nWe noticed you have missed a few {{class_name}} lessons recently, and we just wanted to check in. Everything okay?\n\nIf your schedule has changed or something is making it hard to attend, let us know. We are happy to help you find a time or format that works for you.\n\nWarm regards,\n{{business_name}}', null, null, null),
('admin_absence_alert', 'in_app', 'Repeated absences: {{student_name}}', '{{student_name}} has {{absences}} absences in {{class_name}} in the last {{days}} days.', null, null, null),
('invoice_issued', 'email', 'Invoice {{invoice_no}} from {{business_name}}',
 E'Hi {{name}},\n\nHere is your invoice {{invoice_no}}.\n\n{{lines}}\n\nTotal due: {{amount}}\nDue date: {{due_date}}\n\nHow to pay:\n{{payment_instructions}}\n\nYou can download this invoice as a PDF and upload your payment slip in the student portal: {{portal_url}}\n\nThank you,\n{{business_name}}', null, null, null),
('invoice_issued', 'whatsapp', null, 'Hi {{name}}, invoice {{invoice_no}} for {{amount}} is ready, due on {{due_date}}. You can view and download it in the student portal.',
 'topmind_invoice_issued', '{name,invoice_no,amount,due_date}', null),
('invoice_issued', 'in_app', 'New invoice {{invoice_no}}', '{{amount}} due on {{due_date}}.', null, null, null),
('invoice_voided', 'email', 'Invoice {{invoice_no}} has been cancelled',
 E'Hi {{name}},\n\nInvoice {{invoice_no}} has been cancelled and no longer needs to be paid.\n\nReason: {{reason}}\n\n{{business_name}}', null, null, null),
('invoice_voided', 'in_app', 'Invoice {{invoice_no}} cancelled', '{{reason}}', null, null, null),
('payment_reminder', 'email', 'Friendly reminder: invoice {{invoice_no}} is due on {{due_date}}',
 E'Hi {{name}},\n\nThis is a friendly reminder that invoice {{invoice_no}} ({{balance}} outstanding) is due on {{due_date}}.\n\nHow to pay:\n{{payment_instructions}}\n\nIf you have already paid, thank you, and please ignore this message.\n\n{{business_name}}', null, null, null),
('payment_reminder', 'whatsapp', null, 'Hi {{name}}, a friendly reminder that invoice {{invoice_no}} ({{balance}}) is due on {{due_date}}. Thank you!',
 'topmind_payment_reminder', '{name,invoice_no,balance,due_date}', null),
('payment_reminder', 'in_app', 'Invoice {{invoice_no}} due {{due_date}}', '{{balance}} outstanding.', null, null, null),
('payment_overdue', 'email', 'Invoice {{invoice_no}} is now overdue',
 E'Hi {{name}},\n\nOur records show that invoice {{invoice_no}} ({{balance}} outstanding) was due on {{due_date}}.\n\nHow to pay:\n{{payment_instructions}}\n\nIf you have already paid, please upload your payment slip in the student portal or send it to us on WhatsApp so we can update our records. If you need more time, just let us know.\n\n{{business_name}}', null, null, null),
('payment_overdue', 'whatsapp', null, 'Hi {{name}}, invoice {{invoice_no}} ({{balance}}) was due on {{due_date}}. If you have paid already, please send us your slip. Thank you!',
 'topmind_payment_overdue', '{name,invoice_no,balance,due_date}', null),
('payment_overdue', 'in_app', 'Invoice {{invoice_no}} is overdue', '{{balance}} outstanding since {{due_date}}.', null, null, null),
('payment_confirmed', 'email', 'Payment received: receipt {{receipt_no}}',
 E'Hi {{name}},\n\nThank you! We have received your payment.\n\nReceipt: {{receipt_no}}\nAmount: {{amount}}\nInvoice: {{invoice_no}}\nRemaining balance: {{balance}}\n\nYou can download your receipt in the student portal: {{portal_url}}\n\n{{business_name}}', null, null, null),
('payment_confirmed', 'whatsapp', null, 'Hi {{name}}, thank you! We received {{amount}}. Your receipt number is {{receipt_no}}.',
 'topmind_payment_confirmed', '{name,amount,receipt_no}', null),
('payment_confirmed', 'in_app', 'Payment received: {{receipt_no}}', '{{amount}} for invoice {{invoice_no}}. Your receipt is ready to download.', null, null, null),
('payment_rejected', 'email', 'We could not confirm your payment',
 E'Hi {{name}},\n\nWe could not confirm the payment of {{amount}} you submitted for invoice {{invoice_no}}.\n\nReason: {{reason}}\n\nPlease check the details and submit it again, or contact us and we will help.\n\n{{business_name}}', null, null, null),
('payment_rejected', 'in_app', 'Payment not confirmed', '{{amount}} for invoice {{invoice_no}}: {{reason}}', null, null, null),
('payment_refunded', 'email', 'Refund for invoice {{invoice_no}}',
 E'Hi {{name}},\n\nA payment of {{amount}} on invoice {{invoice_no}} (receipt {{receipt_no}}) has been refunded.\n\nReason: {{reason}}\n\n{{business_name}}', null, null, null),
('payment_refunded', 'in_app', 'Payment refunded', '{{amount}} on invoice {{invoice_no}}.', null, null, null),
('admin_payment_submitted', 'in_app', 'Payment to confirm: {{student_name}}', '{{amount}} for invoice {{invoice_no}} via {{method}}.', null, null, null),
('admin_payment_submitted', 'email', 'Payment to confirm: {{student_name}}',
 E'{{student_name}} submitted {{amount}} for invoice {{invoice_no}} via {{method}} (reference {{reference}}).\n\nReview it under Payments in the admin portal: {{portal_url}}', null, null, null),
('salary_statement_ready', 'in_app', 'Salary statement for {{month}}', 'Your statement ({{amount}}) is ready to view.', null, null, null),
('salary_statement_ready', 'email', 'Your salary statement for {{month}}',
 E'Hi {{name}},\n\nYour salary statement for {{month}} has been approved: {{amount}} for {{lessons}} lessons.\n\nView the details in the teacher portal: {{portal_url}}\n\n{{business_name}}', null, null, null),
('salary_paid', 'in_app', 'Salary payment recorded', '{{amount}} paid for {{month}}. Outstanding: {{outstanding}}.', null, null, null),
('salary_paid', 'email', 'Salary payment for {{month}}',
 E'Hi {{name}},\n\nWe have recorded a payment of {{amount}} for your {{month}} statement. Outstanding: {{outstanding}}.\n\n{{business_name}}', null, null, null),
('booking_request', 'in_app', 'New one-to-one request', '{{student_name}} requested {{when}} ({{duration}} minutes).', null, null, null),
('admin_booking_request', 'in_app', 'One-to-one request', '{{student_name}} requested {{teacher_name}} for {{when}}.', null, null, null),
('booking_request', 'email', 'New one-to-one request from {{student_name}}',
 E'Hi {{name}},\n\n{{student_name}} has requested a one-to-one lesson on {{when}} ({{duration}} minutes).\nObjective: {{objective}}\n\nApprove or decline it in the teacher portal: {{portal_url}}', null, null, null),
('booking_confirmed', 'email', 'Your one-to-one lesson is confirmed',
 E'Hi {{name}},\n\nYour one-to-one lesson with {{teacher_name}} is confirmed for {{when}} ({{duration}} minutes, {{mode}}).\n\nYou can cancel or move it up to {{window}} hours before it starts in the student portal: {{portal_url}}\n\n{{business_name}}', null, null, null),
('booking_confirmed', 'whatsapp', null, 'Hi {{name}}, your one-to-one lesson with {{teacher_name}} is confirmed for {{when}}.',
 'topmind_booking_confirmed', '{name,teacher_name,when}', null),
('booking_confirmed', 'in_app', 'One-to-one confirmed', '{{teacher_name}}, {{when}}.', null, null, null),
('booking_rejected', 'email', 'About your one-to-one request',
 E'Hi {{name}},\n\nUnfortunately {{teacher_name}} cannot take the lesson on {{when}}.\n\n{{reason}}\n\nPlease choose another time in the student portal: {{portal_url}}\n\n{{business_name}}', null, null, null),
('booking_rejected', 'in_app', 'One-to-one request declined', '{{when}}. {{reason}}', null, null, null),
('booking_cancelled', 'email', 'One-to-one lesson cancelled',
 E'Hi {{name}},\n\nThe one-to-one lesson on {{when}} has been cancelled.\n\nReason: {{reason}}\n\n{{business_name}}', null, null, null),
('booking_cancelled', 'in_app', 'One-to-one cancelled', '{{when}}. {{reason}}', null, null, null),
('booking_reminder', 'email', 'Reminder: one-to-one lesson {{when}}',
 E'Hi {{name}},\n\nA reminder that your one-to-one lesson with {{teacher_name}} is on {{when}}.\n\nSee you soon!\n{{business_name}}', null, null, null),
('booking_reminder', 'whatsapp', null, 'Hi {{name}}, a reminder that your one-to-one lesson with {{teacher_name}} is on {{when}}. See you soon!',
 'topmind_booking_reminder', '{name,teacher_name,when}', null),
('booking_reminder', 'in_app', 'Upcoming one-to-one', '{{teacher_name}}, {{when}}.', null, null, null),
('announcement', 'in_app', '{{title}}', '{{body}}', null, null, null),
('announcement', 'email', '{{title}}', E'Hi {{name}},\n\n{{body}}\n\n{{business_name}}', null, null, null),
('admin_new_enquiry', 'in_app', 'New {{source}} enquiry', '{{enquirer}}: {{preview}}', null, null, null),
('enquiry_auto_reply', 'email', 'Thanks for your message, {{name}}',
 E'Hi {{name}},\n\nThank you for contacting {{business_name}}. Here is a quick answer, and a member of our team will follow up personally soon.\n\n{{answer}}\n\nWarm regards,\n{{business_name}}', null, null, null),
('admin_assessment_submitted', 'in_app', 'Placement assessment completed', '{{student_name}} scored {{percent}}{{level_text}}.', null, null, null),
('admin_automation_failed', 'in_app', 'Automation failed: {{job}}', '{{error}}', null, null, null),
('admin_automation_failed', 'email', 'Automation failed: {{job}}', E'The {{job}} automation failed:\n\n{{error}}\n\nOpen Automations in the admin portal to retry it: {{portal_url}}', null, null, null),
('checklist_overdue', 'in_app', 'Checklist task overdue', '{{title}} was due on {{due_date}}.', null, null, null)
on conflict (key, channel) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Announcements
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null,
  audience text not null default 'everyone' check (audience in ('everyone', 'teachers', 'students', 'class')),
  class_id uuid references classes on delete cascade,
  send_email boolean not null default false,
  published_at timestamptz,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  check (audience <> 'class' or class_id is not null)
);

create or replace function public.can_see_announcement(a announcements) returns boolean
language sql stable security definer set search_path = public as $$
  select a.published_at is not null and (
    is_admin()
    or a.audience = 'everyone'
    or (a.audience = 'teachers' and is_teacher())
    or (a.audience = 'students' and my_student_id() is not null)
    or (a.audience = 'class' and (active_in_class(a.class_id) or teaches_class(a.class_id))))
$$;

create or replace function public.publish_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare a announcements; r record; n int := 0; v_vars jsonb;
begin
  if not is_admin() then raise exception 'Only an administrator can publish announcements'; end if;
  update announcements set published_at = now() where id = p_id and published_at is null returning * into a;
  if not found then raise exception 'Announcement not found or already published'; end if;
  v_vars := jsonb_build_object('title', a.title, 'body', a.body);
  for r in
    select p.id from profiles p where p.status = 'active' and (
      a.audience = 'everyone'
      or (a.audience = 'teachers' and p.role in ('teacher', 'admin'))
      or (a.audience = 'students' and p.role = 'student' and exists (select 1 from students s where s.profile_id = p.id and s.status = 'active'))
      or (a.audience = 'class' and (exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = p.id)
          or exists (select 1 from students s join enrolments e on e.student_id = s.id
                     where s.profile_id = p.id and e.class_id = a.class_id and e.status = 'active'))))
  loop
    perform notify_profile(r.id, 'announcement', v_vars, 'announcement', a.id, 'announcement:' || a.id || ':' || r.id, null, a.send_email);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Business events -> notifications (replaces the 0004 stub)
-- ---------------------------------------------------------------------------
drop trigger if exists n_reg on registrations;
drop trigger if exists n_enq on enquiries;
drop trigger if exists n_book on bookings;

create or replace function public.emit_event(p_event text, p_ref_type text, p_ref_id uuid, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  r registrations; inv invoices; pay payments; s sessions; b bookings; c classes; e enrolments; t teacher_payouts;
  v_vars jsonb; v_prog text; v_track text; v_token text; v_rec record; v_class_name text; v_when text;
begin
  if p_event like 'registration.%' then
    select * into r from registrations where id = p_ref_id;
    if not found then return; end if;
    v_prog := coalesce((select name from courses where id = r.course_id), (select name from languages where id = r.language_id), 'our classes');
    v_vars := jsonb_build_object('name', split_part(r.student_name, ' ', 1), 'applicant', r.student_name, 'programme', v_prog,
      'tracking_code', r.tracking_code, 'email', r.email, 'phone', coalesce(r.phone, '-'),
      'track_url', coalesce(setting_text('system.site_url'), '') || '/track?code=' || r.tracking_code,
      'reason', coalesce(r.decision_reason, ''), 'message', coalesce(r.info_request, ''),
      'class_name', coalesce((select name from classes where id = r.class_id), 'The class you chose'));
    if p_event in ('registration.received', 'registration.duplicate') then
      select token into v_token from assessment_attempts where id = r.assessment_attempt_id and status in ('not_started', 'in_progress');
      v_vars := v_vars || jsonb_build_object('assessment_line', case when v_token is not null then
        E'\nPlacement assessment: take a short quiz so we can suggest the right class: '
        || coalesce(setting_text('system.site_url'), '') || '/assessment/' || v_token || E'\n' else '' end);
      perform enqueue_message('email', 'registration_received', r.email, r.student_name, v_vars, r.student_id, null,
                              'registration', r.id, 'reg-ack:' || r.id || ':' || case when p_event = 'registration.duplicate' then biz_today()::text else 'first' end);
      if p_event = 'registration.received' then
        if r.consent_whatsapp and normalize_phone(r.phone) is not null and setting_bool('communication.whatsapp_enabled', false) then
          perform enqueue_message('whatsapp', 'registration_received', normalize_phone(r.phone), r.student_name, v_vars, r.student_id,
                                  null, 'registration', r.id, 'reg-ack:' || r.id || ':whatsapp');
        end if;
        perform notify_admins_event('admin_new_registration', v_vars, 'registration', r.id, 'reg-admin:' || r.id, '/admin/registrations');
      end if;
    elsif p_event in ('registration.approved', 'registration.converted') then
      v_vars := v_vars || jsonb_build_object('next_step', case when p_event = 'registration.converted'
        then 'Your class details are in a separate message.' else 'We will confirm your class placement shortly.' end);
      if r.student_id is not null then
        perform notify_student(r.student_id, 'registration_approved', v_vars, 'registration', r.id, 'reg-approved:' || r.id, '/student');
      end if;
    elsif p_event = 'registration.waitlisted' then
      perform enqueue_message('email', 'registration_waitlisted', r.email, r.student_name, v_vars, r.student_id, null,
                              'registration', r.id, 'reg-waitlist:' || r.id || ':' || coalesce(r.class_id::text, ''));
    elsif p_event = 'registration.rejected' then
      perform enqueue_message('email', 'registration_rejected', r.email, r.student_name, v_vars, r.student_id, null,
                              'registration', r.id, 'reg-rejected:' || r.id);
    elsif p_event = 'registration.info_requested' then
      perform enqueue_message('email', 'registration_info_requested', r.email, r.student_name, v_vars, r.student_id, null,
                              'registration', r.id, 'reg-info:' || r.id || ':' || md5(coalesce(r.info_request, '')));
    end if;

  elsif p_event = 'assessment.submitted' then
    select a.percent, a.student_id, a.registration_id, lv.name as level_name into v_rec
    from assessment_attempts a left join levels lv on lv.id = a.level_id where a.id = p_ref_id;
    perform notify_admins_event('admin_assessment_submitted', jsonb_build_object(
      'student_name', coalesce((select full_name from students where id = v_rec.student_id),
                               (select student_name from registrations where id = v_rec.registration_id), 'An applicant'),
      'percent', coalesce(v_rec.percent::text || '%', 'writing only'),
      'level_text', coalesce(', suggested level ' || v_rec.level_name, '')), 'assessment_attempt', p_ref_id, null, '/admin/registrations');

  elsif p_event = 'enrolment.active' then
    select * into e from enrolments where id = p_ref_id;
    select * into c from classes where id = e.class_id;
    perform notify_student(e.student_id, 'class_assigned', jsonb_build_object(
      'class_name', c.name, 'schedule', class_schedule_text(c.id),
      'start_date', fmt_date(greatest(e.start_date, coalesce(c.start_date, e.start_date))),
      'teacher_name', coalesce((select full_name from profiles where id = c.teacher_id), 'To be confirmed'),
      'where', case when c.mode = 'online' then 'Online' || coalesce(' (' || nullif(c.meeting_link, '') || ')', ' (link shared before the first lesson)')
                    else coalesce(nullif(c.location_note, ''), (select name from classrooms where id = c.classroom_id), 'Our learning centre') end),
      'enrolment', e.id, 'class-assigned:' || e.id, '/student/classes');

  elsif p_event in ('lesson.cancelled', 'lesson.rescheduled', 'lesson.added', 'lesson.substitute') then
    select * into s from sessions where id = p_ref_id;
    v_class_name := coalesce((select name from classes where id = s.class_id), 'One-to-one lesson');
    v_vars := jsonb_build_object('class_name', v_class_name, 'lesson_date', fmt_date(s.session_date), 'lesson_time', fmt_time(s.start_time),
      'reason', coalesce(p_data ->> 'reason', s.cancel_reason, ''), 'schedule', class_schedule_text(s.class_id),
      'message', case p_event when 'lesson.added' then 'An extra lesson has been added on ' || fmt_date(s.session_date) || '.'
                              when 'lesson.substitute' then 'You are covering this lesson.' else '' end);
    if p_event = 'lesson.substitute' then
      perform notify_profile(s.teacher_id, 'teacher_lesson_assigned', v_vars, 'session', s.id, 'lesson-sub:' || s.id || ':' || s.teacher_id, '/teacher/schedule');
      return;
    end if;
    if s.class_id is not null then
      for v_rec in select student_id from enrolments where class_id = s.class_id and status = 'active' loop
        perform notify_student(v_rec.student_id,
          case p_event when 'lesson.cancelled' then 'lesson_cancelled' when 'lesson.rescheduled' then 'lesson_rescheduled' else 'schedule_changed' end,
          v_vars, 'session', s.id, p_event || ':' || s.id || ':' || v_rec.student_id, '/student/schedule');
      end loop;
    elsif s.booking_id is not null then
      perform notify_student((select student_id from bookings where id = s.booking_id),
        case when p_event = 'lesson.cancelled' then 'lesson_cancelled' else 'lesson_rescheduled' end,
        v_vars, 'session', s.id, p_event || ':' || s.id, '/student/book');
    end if;
    if s.teacher_id is not null and p_event <> 'lesson.added' then
      perform notify_user(s.teacher_id, case when p_event = 'lesson.cancelled' then 'Lesson cancelled: ' else 'Lesson moved: ' end || v_class_name,
        fmt_date(s.session_date) || ' at ' || fmt_time(s.start_time), p_event, '/teacher/schedule', 'session', s.id);
    elsif s.teacher_id is not null then
      perform notify_profile(s.teacher_id, 'teacher_lesson_assigned', v_vars, 'session', s.id, 'lesson-added:' || s.id, '/teacher/schedule');
    end if;

  elsif p_event = 'schedule.changed' then
    select * into c from classes where id = p_ref_id;
    if not found or c.status <> 'active' then return; end if;
    for v_rec in select student_id from enrolments where class_id = c.id and status = 'active' loop
      perform notify_student(v_rec.student_id, 'schedule_changed', jsonb_build_object('class_name', c.name,
        'schedule', class_schedule_text(c.id), 'message', 'The weekly schedule has changed.'),
        'class', c.id, 'schedule-changed:' || c.id || ':' || v_rec.student_id || ':' || biz_today(), '/student/schedule');
    end loop;

  elsif p_event = 'attendance.saved' then
    perform check_absences(p_ref_id);

  elsif p_event in ('invoice.issued', 'invoice.resend', 'invoice.voided') then
    select * into inv from invoices where id = p_ref_id;
    if not found then return; end if;
    v_vars := jsonb_build_object('invoice_no', inv.invoice_no, 'amount', fmt_money(inv.amount + inv.adjustment_total),
      'balance', fmt_money(invoice_balance(inv.id)), 'due_date', fmt_date(inv.due_date), 'reason', coalesce(inv.void_reason, ''),
      'payment_instructions', coalesce(inv.payment_instructions, setting_text('finance.payment_instructions', '')),
      'lines', (select string_agg(it.description || case when it.quantity <> 1 then ' x ' || trim(to_char(it.quantity, 'FM999990.##')) else '' end
                                  || ': ' || fmt_money(it.amount), E'\n' order by it.sort_order) from invoice_items it where it.invoice_id = inv.id));
    perform notify_student(inv.student_id, case when p_event = 'invoice.voided' then 'invoice_voided' else 'invoice_issued' end, v_vars,
      'invoice', inv.id, p_event || ':' || inv.id || case when p_event = 'invoice.resend' then ':' || extract(epoch from now())::bigint else '' end,
      '/student/invoices');

  elsif p_event in ('payment.confirmed', 'payment.resend', 'payment.rejected', 'payment.refunded', 'payment.submitted') then
    select * into pay from payments where id = p_ref_id;
    if not found then return; end if;
    select * into inv from invoices where id = pay.invoice_id;
    v_vars := jsonb_build_object('amount', fmt_money(pay.amount), 'receipt_no', coalesce(pay.receipt_no, '-'), 'invoice_no', inv.invoice_no,
      'balance', fmt_money(invoice_balance(inv.id)), 'reason', coalesce(pay.rejected_reason, pay.refund_reason, ''),
      'method', (select name from payment_methods where code = pay.method), 'reference', coalesce(pay.reference, '-'),
      'student_name', (select full_name from students where id = pay.student_id));
    if p_event = 'payment.submitted' then
      perform notify_admins_event('admin_payment_submitted', v_vars, 'payment', pay.id, 'payment-submitted:' || pay.id, '/admin/payments');
    else
      perform notify_student(pay.student_id,
        case p_event when 'payment.rejected' then 'payment_rejected' when 'payment.refunded' then 'payment_refunded' else 'payment_confirmed' end,
        v_vars, 'payment', pay.id,
        p_event || ':' || pay.id || case when p_event = 'payment.resend' then ':' || extract(epoch from now())::bigint else '' end,
        '/student/receipts');
    end if;

  elsif p_event in ('salary.approved', 'salary.paid') then
    select * into t from teacher_payouts where id = p_ref_id;
    perform notify_profile(t.teacher_id, case when p_event = 'salary.approved' then 'salary_statement_ready' else 'salary_paid' end,
      jsonb_build_object('month', to_char(t.period, 'FMMonth YYYY'), 'lessons', t.lessons_completed,
        'amount', fmt_money(case when p_event = 'salary.paid' then (select amount from teacher_payout_payments where payout_id = t.id
                                                                 order by created_at desc limit 1) else t.amount end),
        'outstanding', fmt_money(t.amount - t.amount_paid)),
      'teacher_payout', t.id, p_event || ':' || t.id || ':' || t.amount_paid, '/teacher/salary');

  elsif p_event like 'booking.%' then
    select * into b from bookings where id = p_ref_id;
    if not found then return; end if;
    v_when := fmt_ts(b.starts_at);
    v_vars := jsonb_build_object('when', v_when, 'duration', b.duration_minutes, 'mode', b.mode, 'objective', coalesce(b.objective, '-'),
      'teacher_name', (select full_name from profiles where id = b.teacher_id),
      'student_name', (select full_name from students where id = b.student_id),
      'reason', coalesce(b.cancel_reason, b.decision_reason, ''), 'window', setting_num('booking.cancellation_window_hours', 24));
    if p_event = 'booking.requested' then
      if b.status = 'requested' then
        perform notify_profile(b.teacher_id, 'booking_request', v_vars, 'booking', b.id, 'booking-request:' || b.id, '/teacher/bookings');
      end if;
    elsif p_event = 'booking.approved' then
      perform notify_student(b.student_id, 'booking_confirmed', v_vars, 'booking', b.id, 'booking-confirmed:' || b.id, '/student/book');
    elsif p_event = 'booking.rejected' then
      perform notify_student(b.student_id, 'booking_rejected', v_vars, 'booking', b.id, 'booking-rejected:' || b.id, '/student/book');
    elsif p_event = 'booking.cancelled' then
      if b.cancelled_by is distinct from (select profile_id from students where id = b.student_id) then
        perform notify_student(b.student_id, 'booking_cancelled', v_vars, 'booking', b.id, 'booking-cancelled:' || b.id, '/student/book');
      end if;
      if b.cancelled_by is distinct from b.teacher_id then
        perform notify_user(b.teacher_id, 'One-to-one cancelled', v_when || '. ' || coalesce(b.cancel_reason, ''), 'booking_cancelled',
                            '/teacher/bookings', 'booking', b.id);
      end if;
    elsif p_event = 'booking.reminder' then
      perform notify_student(b.student_id, 'booking_reminder', v_vars, 'booking', b.id, 'booking-reminder:' || b.id, '/student/book');
      perform notify_user(b.teacher_id, 'Upcoming one-to-one', (v_vars ->> 'student_name') || ', ' || v_when, 'booking_reminder',
                          '/teacher/bookings', 'booking', b.id);
    end if;

  elsif p_event = 'enquiry.received' then
    perform notify_admins_event('admin_new_enquiry', (select jsonb_build_object('source', q.source, 'enquirer', q.name,
      'preview', left(coalesce(q.message, ''), 140)) from enquiries q where q.id = p_ref_id), 'enquiry', p_ref_id, null, '/admin/enquiries');
  end if;
end $$;

-- Repeated absences: alert admins and (if enabled) check in with the student.
create or replace function public.check_absences(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_threshold int := setting_num('academic.absence_alert_threshold', 3)::int;
        v_days int := setting_num('academic.absence_alert_window_days', 30)::int; r record; s sessions;
begin
  if v_threshold <= 0 then return; end if;
  select * into s from sessions where id = p_session;
  if s.class_id is null then return; end if;
  for r in
    select a.student_id, count(*) as absences
    from attendance a join sessions x on x.id = a.session_id
    where x.class_id = s.class_id and a.status = 'absent' and x.session_date > biz_today() - v_days
      and a.student_id in (select student_id from attendance where session_id = p_session and status = 'absent')
    group by a.student_id having count(*) >= v_threshold
  loop
    perform notify_admins_event('admin_absence_alert', jsonb_build_object('student_name', (select full_name from students where id = r.student_id),
      'absences', r.absences, 'class_name', (select name from classes where id = s.class_id), 'days', v_days),
      'student', r.student_id, 'absence-admin:' || r.student_id || ':' || s.class_id || ':' || to_char(biz_today(), 'IYYY-IW'), '/admin/attendance');
    if setting_bool('communication.absence_message_to_student', true) then
      perform notify_student(r.student_id, 'absence_check_in', jsonb_build_object('class_name', (select name from classes where id = s.class_id)),
        'student', r.student_id, 'absence-student:' || r.student_id || ':' || s.class_id || ':' || to_char(biz_today(), 'YYYY-MM'));
    end if;
  end loop;
end $$;

create or replace function public.enrolments_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform emit_event('enrolment.active', 'enrolment', new.id);
  end if;
  return null;
end $$;
drop trigger if exists enrolments_events on enrolments;
create trigger enrolments_events after insert or update of status on enrolments for each row execute function enrolments_events();

create or replace function public.class_schedules_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform emit_event('schedule.changed', 'class', coalesce(new.class_id, old.class_id));
  return null;
end $$;
drop trigger if exists class_schedules_events on class_schedules;
create trigger class_schedules_events after insert or update or delete on class_schedules
  for each row execute function class_schedules_events();

-- ---------------------------------------------------------------------------
-- 6. Enquiries
-- ---------------------------------------------------------------------------
alter table enquiries add column if not exists username text;
alter table enquiries add column if not exists interested_language_id uuid references languages on delete set null;
alter table enquiries add column if not exists interested_course_id uuid references courses on delete set null;
alter table enquiries add column if not exists status text not null default 'new';
alter table enquiries drop constraint if exists enquiries_status_check;
alter table enquiries add constraint enquiries_status_check
  check (status in ('new', 'in_progress', 'responded', 'follow_up', 'converted', 'closed', 'spam'));
alter table enquiries add column if not exists category text;
alter table enquiries add column if not exists assigned_to uuid references profiles on delete set null;
alter table enquiries add column if not exists follow_up_date date;
alter table enquiries add column if not exists notes text;
alter table enquiries add column if not exists external_id text;
alter table enquiries add column if not exists conversation_id text;
alter table enquiries add column if not exists registration_id uuid references registrations on delete set null;
alter table enquiries add column if not exists utm jsonb;
alter table enquiries add column if not exists last_contacted_at timestamptz;
alter table enquiries add column if not exists updated_at timestamptz not null default now();
alter table enquiries drop constraint if exists enquiries_source_check;
update enquiries set source = 'other' where source not in ('website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'phone', 'walk_in', 'email', 'referral', 'other');
alter table enquiries add constraint enquiries_source_check
  check (source in ('website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'phone', 'walk_in', 'email', 'referral', 'other'));
create unique index if not exists enquiries_external_key on enquiries (source, external_id) where external_id is not null;
create index if not exists enquiries_status_idx on enquiries (status, created_at desc);
drop trigger if exists enquiries_touch on enquiries;
create trigger enquiries_touch before update on enquiries for each row execute function touch_updated_at();

create table if not exists enquiry_messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'note')),
  body text not null,
  channel text,
  status text not null default 'logged' check (status in ('logged', 'sent', 'failed')),
  external_id text,
  sent_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists enquiry_messages_external_key on enquiry_messages (external_id) where external_id is not null;

create table if not exists response_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  keywords text[] not null default '{}',
  body text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
insert into response_templates (key, title, keywords, body, sort_order) values
 ('classes', 'What classes are available?', '{what classes,which classes,classes available,classes do you,courses,programme,program,what do you offer,what do you teach}',
  E'Here are the programmes we offer right now:\n{{programmes}}\n\nYou can see details and register here: {{register_url}}', 1),
 ('fees', 'How much are the class fees?', '{fee,fees,price,prices,cost,how much,rm,charge,payment}',
  E'Our current fees:\n{{fees}}\n\nYou only pay for the programme you join. Register here: {{register_url}}', 2),
 ('beginners', 'Is English for Beginners available?', '{beginner,beginners,basic,zero,start,never learned}',
  E'Yes! Our beginner-friendly classes start from the very basics, in a relaxed and supportive group where mistakes are welcome.\n{{beginner_classes}}\n\nRegister here: {{register_url}}', 3),
 ('languages', 'Which languages do you teach?', '{tamil,malay,bahasa,chinese,mandarin,hindi,english,language,languages}',
  E'{{language_answer}}\n\nAll our languages: {{languages}}\n\nRegister here: {{register_url}}', 4),
 ('online', 'Are classes online?', '{online,zoom,meet,virtual,physical,centre,center,in person,location,where}',
  E'{{online_info}}\n\nTell us which you prefer when you register: {{register_url}}', 5),
 ('register', 'How do I register?', '{register,registration,sign up,signup,join,enrol,enroll,apply}',
  E'Registering takes about 3 minutes: {{register_url}}\n\nAfter you register you can take a short placement quiz so we can suggest the right class. We will then confirm your place.', 6),
 ('one_to_one', 'How do I book a one-to-one lesson?', '{one to one,one-to-one,1 to 1,1-to-1,private,personal,tutor,individual}',
  E'{{one_to_one_info}}\n\nRegister first, then book a time that suits you in the student portal: {{register_url}}', 7),
 ('schedules', 'What are the class schedules?', '{schedule,schedules,time,times,timing,when,day,days,weekend,evening,morning}',
  E'Current class times:\n{{schedules}}\n\nRegister here and tell us the times that suit you: {{register_url}}', 8)
on conflict (key) do nothing;

-- Live facts for replies, so prices and schedules are never hardcoded.
create or replace function public.enquiry_facts(p_text text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_site text := coalesce(setting_text('system.site_url'), ''); v_lang_answer text; v_l record; v_found text[] := '{}';
begin
  for v_l in select name, is_active from languages order by sort_order, name loop
    if position(lower(v_l.name) in lower(coalesce(p_text, ''))) > 0
       or (v_l.name = 'Malay' and lower(coalesce(p_text, '')) like '%bahasa%')
       or (v_l.name = 'Chinese' and lower(coalesce(p_text, '')) like '%mandarin%') then
      v_found := v_found || case when v_l.is_active then 'Yes, we teach ' || v_l.name || '.' else v_l.name || ' classes are coming soon. We can add you to our interest list.' end;
    end if;
  end loop;
  v_lang_answer := coalesce(nullif(array_to_string(v_found, ' '), ''), 'Here are the languages we teach.');
  return jsonb_build_object(
    'register_url', v_site || '/register',
    'booking_url', v_site || '/one-to-one',
    'contact_phone', setting_text('business.phone', ''),
    'language_answer', v_lang_answer,
    'language_specific', cardinality(v_found) > 0,
    'languages', coalesce((select string_agg(name || case when is_active then '' else ' (coming soon)' end, ', ' order by sort_order, name) from languages), '-'),
    'programmes', coalesce((select string_agg('- ' || c.name || coalesce(' (' || l.name || ')', ''), E'\n' order by l.sort_order, c.sort_order, c.name)
                   from courses c left join languages l on l.id = c.language_id where c.active), 'Our programme list is being updated. Please contact us.'),
    'fees', coalesce((select string_agg('- ' || f.name || ': from ' || fmt_money(f.min_fee) || f.unit, E'\n' order by f.name, f.unit)
                      from (select c.name, x.unit, min(x.fee) as min_fee
                            from courses c join lateral (
                              select cl.fee, case cl.billing_frequency when 'per_lesson' then ' per lesson' when 'monthly' then ' a month' else '' end as unit
                              from classes cl where cl.course_id = c.id and cl.status = 'active' and cl.fee > 0
                              union all select lv.monthly_fee, ' a month' from levels lv where lv.course_id = c.id and lv.monthly_fee > 0 and lv.is_active
                            ) x on true where c.active group by c.name, x.unit) f),
                     'Please contact us for current fees.'),
    'schedules', coalesce((select string_agg('- ' || cl.name || ': ' || class_schedule_text(cl.id) || ' (' || cl.mode || ')', E'\n' order by cl.name)
                           from classes cl where cl.status = 'active' and cl.kind in ('group', 'special', 'trial')), 'New class times are being arranged. Tell us what suits you.'),
    'beginner_classes', coalesce((select string_agg('- ' || cl.name || ': ' || class_schedule_text(cl.id), E'\n')
                                  from classes cl left join levels lv on lv.id = cl.level_id left join courses co on co.id = cl.course_id
                                  where cl.status = 'active' and (lv.rank <= 1 or co.name ilike '%beginner%' or lv.name ilike '%beginner%')), ''),
    'online_info', case
      when exists (select 1 from classes where status = 'active' and mode = 'online') and exists (select 1 from classes where status = 'active' and mode <> 'online')
        then 'We run both online classes and classes at our learning centre.'
      when exists (select 1 from classes where status = 'active' and mode <> 'online') then 'Our current classes are held at our learning centre.'
      else 'Yes, our classes are online, so you can join from anywhere.' end,
    'one_to_one_info', case when exists (select 1 from teacher_booking_settings where accepts_bookings)
      then 'Yes, we offer one-to-one lessons with lessons planned around your own goals.'
      else 'One-to-one lessons can be arranged. Contact us and we will match you with a teacher.' end);
end $$;

create or replace function public.suggest_enquiry_reply(p_enquiry uuid default null, p_text text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_text text; t response_templates; v_best response_templates; v_best_score int := 0; v_score int; k text; v_name text;
  v_facts jsonb;
begin
  if p_enquiry is not null then
    if not is_admin() then raise exception 'Only an administrator can see enquiries'; end if;
    select coalesce(message, ''), name into v_text, v_name from enquiries where id = p_enquiry;
  else
    v_text := coalesce(p_text, '');
  end if;
  for t in select * from response_templates where is_active order by sort_order loop
    v_score := 0;
    foreach k in array t.keywords loop
      if position(lower(k) in lower(v_text)) > 0 then v_score := v_score + 1; end if;
    end loop;
    if v_score > v_best_score then v_best := t; v_best_score := v_score; end if;
  end loop;
  if v_best.id is null then
    select * into v_best from response_templates where key = 'classes';
  end if;
  v_facts := enquiry_facts(v_text);
  -- A question naming a language always gets a direct answer about it first.
  return jsonb_build_object('category', coalesce(v_best.key, 'other'), 'title', v_best.title, 'matched', v_best_score > 0,
    'reply', 'Hi ' || coalesce(nullif(split_part(trim(v_name), ' ', 1), ''), 'there') || E',\n\n'
             || case when (v_facts ->> 'language_specific')::boolean and v_best.key <> 'languages'
                     then (v_facts ->> 'language_answer') || E'\n\n' else '' end
             || render_template(v_best.body, v_facts) || E'\n\n' || setting_text('business.name', ''));
end $$;

create or replace function public.submit_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q enquiries; v_email text := lower(trim(coalesce(p ->> 'email', ''))); v_sugg jsonb;
begin
  if coalesce(p ->> 'website', '') <> '' then return jsonb_build_object('status', 'received'); end if;
  perform hit_rate_limit('enquiry_ip', request_ip(), 10, interval '1 hour');
  perform hit_rate_limit('enquiry_email', v_email, 5, interval '1 day');
  if length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Please enter your name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address'; end if;
  if length(trim(coalesce(p ->> 'message', ''))) < 5 then raise exception 'Please write a short message'; end if;
  v_sugg := suggest_enquiry_reply(null, p ->> 'message');
  insert into enquiries (name, email, phone, message, source, category, interested_language_id, interested_course_id, utm)
  values (left(trim(p ->> 'name'), 120), v_email, left(nullif(trim(p ->> 'phone'), ''), 30), left(trim(p ->> 'message'), 4000),
          case when p ->> 'source' in ('website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'referral') then p ->> 'source' else 'website' end,
          v_sugg ->> 'category', try_uuid(p ->> 'language_id'), try_uuid(p ->> 'course_id'),
          case when jsonb_typeof(p -> 'utm') = 'object' then p -> 'utm' end)
  returning * into q;
  insert into enquiry_messages (enquiry_id, direction, body, channel) values (q.id, 'inbound', q.message, q.source);
  if setting_bool('enquiries.auto_reply_email', true) and (v_sugg ->> 'matched')::boolean then
    perform enqueue_message('email', 'enquiry_auto_reply', v_email, q.name,
      jsonb_build_object('answer', regexp_replace(v_sugg ->> 'reply', '^Hi [^\n]*\n\n', '')), null, null, 'enquiry', q.id, 'enquiry-auto:' || q.id);
  end if;
  perform emit_event('enquiry.received', 'enquiry', q.id);
  return jsonb_build_object('status', 'received');
end $$;

-- Social messages arriving through the social-webhook Edge Function.
create or replace function public.ingest_social_message(p_platform text, p_message_id text, p_sender_id text, p_username text,
  p_name text, p_text text, p_sent_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public as $$
declare q enquiries; v_sugg jsonb;
begin
  if not is_trusted_context() then raise exception 'Only the social webhook can add messages'; end if;
  if exists (select 1 from enquiry_messages where external_id = p_platform || ':' || p_message_id) then return null; end if;
  select * into q from enquiries where source = p_platform and conversation_id = p_sender_id
    and status not in ('converted', 'closed', 'spam') and created_at > now() - interval '30 days'
  order by created_at desc limit 1;
  if not found then
    v_sugg := suggest_enquiry_reply(null, p_text);
    insert into enquiries (name, username, message, source, category, external_id, conversation_id, created_at)
    values (coalesce(nullif(p_name, ''), nullif(p_username, ''), 'Social media visitor'), p_username, left(p_text, 4000), p_platform,
            v_sugg ->> 'category', p_message_id, p_sender_id, coalesce(p_sent_at, now()))
    returning * into q;
    perform emit_event('enquiry.received', 'enquiry', q.id);
  else
    update enquiries set status = case when status in ('responded', 'follow_up') then 'in_progress' else status end where id = q.id;
  end if;
  insert into enquiry_messages (enquiry_id, direction, body, channel, external_id, created_at)
  values (q.id, 'inbound', left(p_text, 4000), p_platform, p_platform || ':' || p_message_id, coalesce(p_sent_at, now()));
  return q.id;
end $$;

create or replace function public.log_enquiry_message(p_enquiry uuid, p_direction text, p_body text, p_channel text default null,
  p_status text default 'logged') returns enquiry_messages
language plpgsql security definer set search_path = public as $$
declare m enquiry_messages;
begin
  if not is_admin() then raise exception 'Only an administrator can update enquiries'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'The message is empty'; end if;
  insert into enquiry_messages (enquiry_id, direction, body, channel, status, sent_by)
  values (p_enquiry, p_direction, p_body, p_channel, p_status, auth.uid()) returning * into m;
  if p_direction = 'outbound' then
    update enquiries set status = case when status in ('new', 'in_progress') then 'responded' else status end, last_contacted_at = now()
    where id = p_enquiry;
  end if;
  return m;
end $$;

create or replace function public.convert_enquiry(p_enquiry uuid, p_email text default null, p_course uuid default null)
returns registrations language plpgsql security definer set search_path = public as $$
declare q enquiries; r registrations; v_email text;
begin
  if not is_admin() then raise exception 'Only an administrator can convert enquiries'; end if;
  select * into q from enquiries where id = p_enquiry for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if q.registration_id is not null then raise exception 'This enquiry has already been converted'; end if;
  v_email := lower(trim(coalesce(nullif(p_email, ''), q.email)));
  if coalesce(v_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add the enquirer''s email address to create a registration'; end if;
  insert into registrations (student_name, email, phone, course_id, language_id, status, source, enquiry_id, consent_privacy,
                             tracking_code, admin_notes, utm)
  values (q.name, v_email, q.phone, coalesce(p_course, q.interested_course_id),
          coalesce(q.interested_language_id, (select language_id from courses where id = coalesce(p_course, q.interested_course_id))),
          'pending', case when q.source in ('website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'referral', 'walk_in') then q.source else 'other' end,
          q.id, false, upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)),
          'Created from enquiry. Confirm privacy consent with the student.', q.utm)
  returning * into r;
  update enquiries set status = 'converted', registration_id = r.id, email = coalesce(email, v_email) where id = q.id;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 7. One-to-one bookings
-- ---------------------------------------------------------------------------
create table if not exists teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create index if not exists teacher_availability_teacher_idx on teacher_availability (teacher_id, weekday);

create table if not exists teacher_time_off (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists teacher_booking_settings (
  teacher_id uuid primary key references profiles on delete cascade,
  accepts_bookings boolean not null default false,
  min_notice_hours int not null default 24 check (min_notice_hours between 0 and 720),
  max_advance_days int not null default 30 check (max_advance_days between 1 and 120),
  durations int[] not null default '{60}',
  slot_interval_minutes int not null default 30 check (slot_interval_minutes in (15, 20, 30, 45, 60)),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  mode text not null default 'online' check (mode in ('online', 'physical', 'either')),
  requires_approval boolean not null default true,
  price_per_hour numeric(10, 2) check (price_per_hour >= 0),
  timezone text not null default 'Asia/Kuala_Lumpur',
  updated_at timestamptz not null default now(),
  check (durations <@ array[30, 45, 60, 90, 120] and cardinality(durations) > 0)
);

alter table bookings drop constraint if exists bookings_slot_id_key;
alter table bookings add column if not exists teacher_id uuid references profiles on delete restrict;
alter table bookings add column if not exists starts_at timestamptz;
alter table bookings add column if not exists ends_at timestamptz;
alter table bookings add column if not exists duration_minutes int;
alter table bookings add column if not exists language_id uuid references languages on delete set null;
alter table bookings add column if not exists course_id uuid references courses on delete set null;
alter table bookings add column if not exists mode text not null default 'online';
alter table bookings add column if not exists objective text;
alter table bookings add column if not exists notes text;
alter table bookings add column if not exists price numeric(10, 2) not null default 0;
alter table bookings add column if not exists currency text not null default 'MYR';
alter table bookings add column if not exists decision_reason text;
alter table bookings add column if not exists approved_by uuid references profiles on delete set null;
alter table bookings add column if not exists approved_at timestamptz;
alter table bookings add column if not exists cancelled_by uuid references profiles on delete set null;
alter table bookings add column if not exists cancelled_at timestamptz;
alter table bookings add column if not exists cancel_reason text;
alter table bookings add column if not exists rescheduled_from uuid references bookings on delete set null;
alter table bookings add column if not exists reminder_sent_at timestamptz;
alter table bookings add column if not exists completed_at timestamptz;
alter table bookings add column if not exists updated_at timestamptz not null default now();
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('requested', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'));
update bookings b set teacher_id = a.teacher_id, starts_at = a.starts_at, ends_at = a.ends_at,
  duration_minutes = (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int
from availability_slots a where a.id = b.slot_id and b.teacher_id is null;
do $$ begin
  alter table bookings drop constraint if exists bookings_no_teacher_overlap;
  alter table bookings add constraint bookings_no_teacher_overlap
    exclude using gist (teacher_id with =, tstzrange(starts_at, ends_at) with &&) where (status in ('requested', 'approved'));
  alter table bookings drop constraint if exists bookings_no_student_overlap;
  alter table bookings add constraint bookings_no_student_overlap
    exclude using gist (student_id with =, tstzrange(starts_at, ends_at) with &&) where (status in ('requested', 'approved'));
exception when others then
  raise notice 'Booking overlap constraints not added (%). Resolve overlapping bookings and re-run.', sqlerrm;
end $$;
create index if not exists bookings_teacher_idx on bookings (teacher_id, starts_at);
create index if not exists bookings_student_idx on bookings (student_id, starts_at);
drop trigger if exists bookings_touch on bookings;
create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();
comment on column bookings.slot_id is 'Legacy from 0001. New bookings use teacher_id, starts_at and ends_at.';

-- Teachers also see the students who book them for one-to-one lessons.
create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and (
    exists (select 1 from enrolments e
            where e.student_id = p_student and e.status in ('pending', 'waitlisted', 'active', 'suspended', 'completed')
              and teaches_class(e.class_id))
    or exists (select 1 from bookings b where b.student_id = p_student and b.teacher_id = auth.uid()
               and b.status in ('requested', 'approved', 'completed', 'no_show')))
$$;

create or replace function public.available_booking_slots(p_teacher uuid default null, p_from date default null, p_to date default null,
  p_duration int default 60, p_language uuid default null, p_exclude_booking uuid default null)
returns table (teacher_id uuid, teacher_name text, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_from date := greatest(coalesce(p_from, biz_today()), biz_today()); v_to date := coalesce(p_to, biz_today() + 14);
begin
  if auth.uid() is null and not is_trusted_context() then raise exception 'Please sign in to see available times'; end if;
  if v_to > v_from + 62 then v_to := v_from + 62; end if;
  return query
  with t as (
    select p.id, p.full_name, bs.timezone as tz, bs.min_notice_hours, bs.max_advance_days, bs.slot_interval_minutes, bs.buffer_minutes
    from profiles p
    join teacher_booking_settings bs on bs.teacher_id = p.id
    left join teacher_profiles tp on tp.profile_id = p.id
    where p.role = 'teacher' and p.status = 'active' and bs.accepts_bookings and coalesce(tp.employment_status, 'active') = 'active'
      and p_duration = any (bs.durations)
      and (p_teacher is null or p.id = p_teacher)
      and (p_language is null or exists (select 1 from teacher_languages tl where tl.teacher_id = p.id and tl.language_id = p_language))
  ), windows as (
    select t.id, (d::date + a.start_time) at time zone t.tz as w_start, (d::date + a.end_time) at time zone t.tz as w_end
    from t join teacher_availability a on a.teacher_id = t.id
    cross join lateral generate_series(v_from - 1, v_to + 1, interval '1 day') d
    where extract(dow from d)::int = a.weekday
      and (a.effective_from is null or d::date >= a.effective_from) and (a.effective_to is null or d::date <= a.effective_to)
    union
    select t.id, s.starts_at, s.ends_at from t join availability_slots s on s.teacher_id = t.id
    where s.ends_at > now() and s.starts_at < (v_to + 2)::timestamp
  ), candidates as (
    select distinct w.id, gs as c_start, gs + make_interval(mins => p_duration) as c_end
    from windows w join t on t.id = w.id
    cross join lateral generate_series(w.w_start, w.w_end - make_interval(mins => p_duration), make_interval(mins => t.slot_interval_minutes)) gs
  )
  select c.id, t.full_name, c.c_start, c.c_end
  from candidates c join t on t.id = c.id
  where c.c_start >= now() + make_interval(hours => t.min_notice_hours)
    and c.c_start <= now() + make_interval(days => t.max_advance_days)
    and (c.c_start at time zone biz_tz())::date between v_from and v_to
    and not exists (select 1 from teacher_time_off o where o.teacher_id = c.id and o.starts_at < c.c_end and c.c_start < o.ends_at)
    and not exists (select 1 from bookings b where b.teacher_id = c.id and b.status in ('requested', 'approved')
                      and b.id is distinct from p_exclude_booking
                      and b.starts_at < c.c_end + make_interval(mins => t.buffer_minutes)
                      and c.c_start < b.ends_at + make_interval(mins => t.buffer_minutes))
    and not exists (select 1 from sessions s where s.teacher_id = c.id and s.status <> 'cancelled'
                      and (s.booking_id is null or s.booking_id is distinct from p_exclude_booking)
                      and s.starts_at < c.c_end + make_interval(mins => t.buffer_minutes)
                      and c.c_start < s.ends_at + make_interval(mins => t.buffer_minutes))
    and not exists (select 1 from class_schedules cs join classes cl on cl.id = cs.class_id
                    where cl.teacher_id = c.id and cl.status = 'active'
                      and cs.weekday = extract(dow from (c.c_start at time zone cl.timezone))::int
                      and (c.c_start at time zone cl.timezone)::date between coalesce(cl.start_date, '-infinity') and coalesce(cl.end_date, 'infinity')
                      and cs.start_time < (c.c_end at time zone cl.timezone)::time
                      and (c.c_start at time zone cl.timezone)::time < cs.end_time)
  order by c.c_start, t.full_name;
end $$;

-- Teachers available for one-to-one lessons, with languages (for the booking page).
create or replace function public.booking_teachers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'bio', tp.bio, 'durations', bs.durations,
    'mode', bs.mode, 'requires_approval', bs.requires_approval,
    'price_per_hour', coalesce(bs.price_per_hour, setting_num('booking.default_price_per_hour', 0)),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name), '[]')
                  from teacher_languages tl join languages l on l.id = tl.language_id where tl.teacher_id = p.id))
    order by p.full_name), '[]'::jsonb)
  from profiles p join teacher_booking_settings bs on bs.teacher_id = p.id left join teacher_profiles tp on tp.profile_id = p.id
  where p.role = 'teacher' and p.status = 'active' and bs.accepts_bookings and coalesce(tp.employment_status, 'active') = 'active'
$$;

create or replace function public.approve_booking_internal(p_booking uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  update bookings set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_booking and status = 'requested' returning * into b;
  if not found then raise exception 'Only requested bookings can be approved'; end if;
  insert into sessions (booking_id, starts_at, ends_at, teacher_id, session_date, status, created_by)
  values (b.id, b.starts_at, b.ends_at, b.teacher_id, (b.starts_at at time zone biz_tz())::date, 'scheduled', auth.uid());
  perform emit_event('booking.approved', 'booking', b.id);
  return b;
end $$;

create or replace function public.request_booking(p_teacher uuid, p_starts_at timestamptz, p_duration int, p_language uuid default null,
  p_objective text default null, p_mode text default null, p_notes text default null) returns bookings
language plpgsql security definer set search_path = public as $$
declare v_student uuid := my_student_id(); bs teacher_booking_settings; b bookings; v_day date := (p_starts_at at time zone biz_tz())::date;
begin
  if v_student is null then raise exception 'Your login is not linked to a student record yet. Please contact the academy.'; end if;
  if (select status from students where id = v_student) <> 'active' then raise exception 'Your student account is not active'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking:' || p_teacher::text, 0));
  if not exists (select 1 from available_booking_slots(p_teacher, v_day - 1, v_day + 1, p_duration, p_language) s
                 where s.starts_at = p_starts_at) then
    raise exception 'That time is no longer available. Please choose another slot.';
  end if;
  select * into bs from teacher_booking_settings where teacher_id = p_teacher;
  insert into bookings (student_id, teacher_id, starts_at, ends_at, duration_minutes, language_id, mode, objective, notes, status, price, currency)
  values (v_student, p_teacher, p_starts_at, p_starts_at + make_interval(mins => p_duration), p_duration, p_language,
          case when p_mode in ('online', 'physical') then p_mode when bs.mode = 'physical' then 'physical' else 'online' end,
          left(p_objective, 500), left(p_notes, 1000), 'requested',
          round(coalesce(bs.price_per_hour, setting_num('booking.default_price_per_hour', 0)) * p_duration / 60.0, 2),
          setting_text('finance.currency', 'MYR'))
  returning * into b;
  if not bs.requires_approval then
    b := approve_booking_internal(b.id);
  else
    perform emit_event('booking.requested', 'booking', b.id);
    perform notify_admins_event('admin_booking_request', jsonb_build_object('student_name', (select full_name from students where id = v_student),
      'teacher_name', (select full_name from profiles where id = p_teacher), 'when', fmt_ts(b.starts_at)), 'booking', b.id, null, '/admin/bookings');
  end if;
  return b;
end $$;

create or replace function public.decide_booking(p_booking uuid, p_approve boolean, p_reason text default null) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if not (is_admin() or (is_teacher() and b.teacher_id = auth.uid())) then raise exception 'You can only decide on your own bookings'; end if;
  if b.status <> 'requested' then raise exception 'This booking is already %', b.status; end if;
  if p_approve then return approve_booking_internal(p_booking); end if;
  update bookings set status = 'rejected', decision_reason = p_reason, approved_by = auth.uid(), approved_at = now()
  where id = p_booking returning * into b;
  perform emit_event('booking.rejected', 'booking', b.id);
  return b;
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text default null) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings; v_window int := setting_num('booking.cancellation_window_hours', 24)::int; v_student boolean;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  v_student := is_my_student(b.student_id);
  if not (is_admin() or v_student or (is_teacher() and b.teacher_id = auth.uid())) then raise exception 'You cannot cancel this booking'; end if;
  if b.status not in ('requested', 'approved') then raise exception 'This booking is already %', b.status; end if;
  if v_student and not is_admin() and b.status = 'approved' and b.starts_at < now() + make_interval(hours => v_window) then
    raise exception 'Confirmed lessons can be cancelled up to % hours before they start. Please contact the academy.', v_window;
  end if;
  if not v_student and coalesce(trim(p_reason), '') = '' then raise exception 'Please give the student a reason'; end if;
  update bookings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
  where id = p_booking returning * into b;
  update sessions set status = 'cancelled', cancel_reason = coalesce(b.cancel_reason, 'Booking cancelled')
  where booking_id = b.id and status = 'scheduled';
  perform emit_event('booking.cancelled', 'booking', b.id);
  return b;
end $$;

create or replace function public.reschedule_booking(p_booking uuid, p_starts_at timestamptz, p_teacher uuid default null)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings; nb bookings; v_window int := setting_num('booking.cancellation_window_hours', 24)::int;
  v_student boolean; v_teacher uuid; v_day date := (p_starts_at at time zone biz_tz())::date; v_staff boolean;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  v_student := is_my_student(b.student_id);
  v_staff := is_admin() or (is_teacher() and b.teacher_id = auth.uid());
  if not (v_student or v_staff) then raise exception 'You cannot move this booking'; end if;
  if b.status not in ('requested', 'approved') then raise exception 'Only upcoming bookings can be moved'; end if;
  if v_student and not v_staff and b.status = 'approved' and b.starts_at < now() + make_interval(hours => v_window) then
    raise exception 'Confirmed lessons can be moved up to % hours before they start. Please contact the academy.', v_window;
  end if;
  v_teacher := coalesce(case when is_admin() then p_teacher end, b.teacher_id);
  perform pg_advisory_xact_lock(hashtextextended('booking:' || v_teacher::text, 0));
  if not exists (select 1 from available_booking_slots(v_teacher, v_day - 1, v_day + 1, b.duration_minutes, null, b.id) s
                 where s.starts_at = p_starts_at) then
    raise exception 'That time is not available. Please choose another slot.';
  end if;
  update bookings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
    cancel_reason = 'Moved to ' || fmt_ts(p_starts_at) where id = b.id;
  update sessions set status = 'cancelled', cancel_reason = 'Booking moved' where booking_id = b.id and status = 'scheduled';
  insert into bookings (student_id, teacher_id, starts_at, ends_at, duration_minutes, language_id, course_id, mode, objective, notes,
                        status, price, currency, rescheduled_from)
  values (b.student_id, v_teacher, p_starts_at, p_starts_at + make_interval(mins => b.duration_minutes), b.duration_minutes, b.language_id,
          b.course_id, b.mode, b.objective, b.notes, 'requested', b.price, b.currency, b.id)
  returning * into nb;
  if v_staff or not coalesce((select requires_approval from teacher_booking_settings where teacher_id = v_teacher), true) then
    nb := approve_booking_internal(nb.id);
  else
    perform emit_event('booking.requested', 'booking', nb.id);
  end if;
  return nb;
end $$;

-- Give a booking to another teacher at the same time (administrators).
create or replace function public.reassign_booking(p_booking uuid, p_teacher uuid, p_reason text default null) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings; v_conflict text;
begin
  if not is_admin() then raise exception 'Only an administrator can reassign bookings'; end if;
  if not exists (select 1 from profiles where id = p_teacher and role = 'teacher' and status = 'active') then
    raise exception 'Choose an active teacher';
  end if;
  select * into b from bookings where id = p_booking for update;
  if not found or b.status not in ('requested', 'approved') then raise exception 'Only upcoming bookings can be reassigned'; end if;
  if b.teacher_id = p_teacher then raise exception 'That teacher already has this booking'; end if;
  v_conflict := teacher_conflict(p_teacher, b.starts_at, b.ends_at, null);
  if v_conflict is not null then raise exception 'Schedule conflict: that teacher already has %', v_conflict; end if;
  if exists (select 1 from teacher_time_off where teacher_id = p_teacher and starts_at < b.ends_at and b.starts_at < ends_at) then
    raise exception 'That teacher is unavailable then';
  end if;
  update bookings set teacher_id = p_teacher, notes = trim(both from coalesce(notes, '') || coalesce(E'\nReassigned: ' || p_reason, ''))
  where id = p_booking returning * into b;
  update sessions set teacher_id = p_teacher where booking_id = b.id and status = 'scheduled';
  perform notify_profile(p_teacher, 'booking_request', jsonb_build_object('student_name', (select full_name from students where id = b.student_id),
    'when', fmt_ts(b.starts_at), 'duration', b.duration_minutes, 'objective', coalesce(b.objective, '-')), 'booking', b.id,
    'booking-reassigned:' || b.id || ':' || p_teacher, '/teacher/bookings');
  return b;
end $$;

create or replace function public.complete_booking(p_booking uuid, p_attendance text, p_notes text default null) returns bookings
language plpgsql security definer set search_path = public as $$
declare b bookings; v_session uuid;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if not (is_admin() or (is_teacher() and b.teacher_id = auth.uid())) then raise exception 'You can only complete your own lessons'; end if;
  if b.status <> 'approved' then raise exception 'Only confirmed bookings can be completed'; end if;
  if b.starts_at > now() then raise exception 'This lesson has not started yet'; end if;
  if p_attendance not in ('present', 'late', 'absent', 'excused') then raise exception 'Choose present, late, absent or excused'; end if;
  select id into v_session from sessions where booking_id = b.id and status <> 'cancelled';
  if v_session is null then
    insert into sessions (booking_id, starts_at, ends_at, teacher_id, session_date, status)
    values (b.id, b.starts_at, b.ends_at, b.teacher_id, (b.starts_at at time zone biz_tz())::date, 'scheduled') returning id into v_session;
  end if;
  perform save_attendance(v_session, jsonb_build_array(jsonb_build_object('student_id', b.student_id, 'status', p_attendance)), true, null, p_notes);
  update bookings set status = case when p_attendance = 'absent' then 'no_show' else 'completed' end, completed_at = now(),
    notes = coalesce(p_notes, notes) where id = p_booking returning * into b;
  return b;
end $$;

-- Completed (and no-show) one-to-one lessons with a price are billed in the
-- monthly run after they happen.
create or replace function public.collect_extra_billing(p_period date) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into _billing (student_id, kind, description, quantity, unit_price, enrolment_id, class_id, booking_id, service_start, service_end, billing_key)
  select b.student_id, 'booking', 'One-to-one lesson with ' || coalesce(p.full_name, 'teacher') || ', ' || fmt_date((b.starts_at at time zone biz_tz())::date)
         || case when b.status = 'no_show' then ' (missed)' else '' end,
         1, b.price, null, null, b.id, (b.starts_at at time zone biz_tz())::date, (b.starts_at at time zone biz_tz())::date, 'booking:' || b.id
  from bookings b left join profiles p on p.id = b.teacher_id
  where b.status in ('completed', 'no_show') and b.price > 0 and (b.starts_at at time zone biz_tz())::date < p_period;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Policies, auditing, grants
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['message_templates', 'message_outbox', 'announcements', 'enquiry_messages', 'response_templates',
                           'teacher_availability', 'teacher_time_off', 'teacher_booking_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end $$;
create policy own_messages on message_outbox for select to authenticated using (
  (profile_id = (select auth.uid()) and (select is_staff())) or is_my_student(student_id));
create policy members_read on announcements for select to authenticated using (can_see_announcement(announcements));
do $$ declare t text; begin
  foreach t in array array['teacher_availability', 'teacher_time_off', 'teacher_booking_settings'] loop
    execute format('create policy own_rows on %I for all to authenticated using (teacher_id = (select auth.uid()) and (select is_teacher())) with check (teacher_id = (select auth.uid()) and (select is_teacher()))', t);
  end loop;
end $$;

-- Bookings change only through the booking functions.
drop policy if exists admin_all on bookings;
drop policy if exists teacher_read on bookings;
create policy admin_read on bookings for select to authenticated using ((select is_admin()));
create policy teacher_read on bookings for select to authenticated using (teacher_id = (select auth.uid()) and (select is_teacher()));
drop policy if exists student_read on sessions;
create policy student_read on sessions for select to authenticated using (
  in_class(class_id) or (booking_id is not null and exists (select 1 from bookings b where b.id = booking_id and is_my_student(b.student_id))));

-- Website enquiries now go through submit_enquiry (validation and rate limits).
drop policy if exists public_insert on enquiries;

do $$ declare t text; begin
  foreach t in array array['message_templates', 'announcements', 'enquiries', 'enquiry_messages', 'response_templates', 'bookings',
                           'teacher_availability', 'teacher_time_off', 'teacher_booking_settings'] loop
    perform enable_audit(t);
  end loop;
end $$;

-- 0002 notification helpers are superseded.
drop function if exists public.trg_notify() cascade;
drop function if exists public.trg_student_notify() cascade;

revoke execute on function emit_event(text, text, uuid, jsonb), check_absences(uuid), enrolments_events(), class_schedules_events(),
  notify_user(uuid, text, text, text, text, text, uuid), enqueue_message(text, text, text, text, jsonb, uuid, uuid, text, uuid, text),
  notify_student(uuid, text, jsonb, text, uuid, text, text), notify_profile(uuid, text, jsonb, text, uuid, text, text, boolean),
  notify_admins_event(text, jsonb, text, uuid, text, text), approve_booking_internal(uuid), collect_extra_billing(date),
  base_vars(), enquiry_facts(text)
  from public, anon, authenticated;
revoke execute on function claim_messages(int), complete_message(uuid, boolean, text, text, text, boolean),
  ingest_social_message(text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function available_booking_slots(uuid, date, date, int, uuid, uuid), booking_teachers() from public, anon;
grant execute on function available_booking_slots(uuid, date, date, int, uuid, uuid), booking_teachers() to authenticated;

commit;
