-- 0009: personal data requests (PDPA).
--   - Anyone signed in can download a copy of their personal data.
--   - Anyone signed in can ask for their data to be deleted; administrators are told.
--   - Administrators anonymise a former student: personal details are removed
--     everywhere, including old audit entries, while financial records are kept
--     as the law requires (invoices and receipts keep the details they were issued with).
begin;

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('export', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  profile_id uuid references profiles on delete set null,
  student_id uuid references students on delete set null,
  details text,
  response text,
  handled_by uuid references profiles on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists privacy_requests_open_deletion on privacy_requests (profile_id)
  where kind = 'deletion' and status = 'pending';
create index if not exists privacy_requests_status_idx on privacy_requests (status, created_at desc);
alter table privacy_requests enable row level security;
drop policy if exists admin_read on privacy_requests;
drop policy if exists own_read on privacy_requests;
create policy admin_read on privacy_requests for select to authenticated using ((select is_admin()));
create policy own_read on privacy_requests for select to authenticated using (profile_id = (select auth.uid()));
drop trigger if exists privacy_requests_no_delete on privacy_requests;
create trigger privacy_requests_no_delete before delete on privacy_requests for each row execute function forbid_delete();
select enable_audit('privacy_requests');

insert into message_templates (key, channel, subject, body, description) values
  ('admin_privacy_request', 'in_app', 'Personal data request', '{{requester}} asked for their personal data to be deleted.', null),
  ('admin_privacy_request', 'email', 'Personal data deletion request from {{requester}}',
   E'{{requester}} asked {{business_name}} to delete their personal data.\n\nReason given: {{reason}}\n\nReview it in Admin -> Accounts -> Privacy requests. Under the PDPA, reply within 21 days.',
   'Sent to the admin alert email when someone asks for their data to be deleted.')
on conflict (key, channel) do nothing;

-- Old audit entries may have personal fields removed during an erasure, but who
-- did what, and when, always stays.
create or replace function public.audit_logs_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
  if tg_op = 'UPDATE' and coalesce(current_setting('topmind.audit_redact', true), '') = 'on'
     and new.id = old.id and new.occurred_at = old.occurred_at and new.actor_id is not distinct from old.actor_id
     and new.action = old.action and new.table_name = old.table_name and new.record_id is not distinct from old.record_id then
    return new;
  end if;
  raise exception 'The audit log is append-only';
end $$;

create or replace function public.redact_personal(j jsonb) returns jsonb
language sql immutable as $$
  select case when j is null then null else j - array['full_name', 'name', 'student_name', 'guardian_name', 'guardian_phone', 'email',
    'phone', 'date_of_birth', 'learning_objectives', 'objectives', 'additional_info', 'notes', 'message', 'username', 'objective',
    'recipient', 'recipient_name', 'body', 'variables', 'utm', 'admin_notes', 'suspended_reason'] || '{"redacted": true}'::jsonb end
$$;

-- A copy of everything the system holds about the signed-in person.
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_students uuid[]; v jsonb;
begin
  if v_uid is null then raise exception 'Please sign in to download your data'; end if;
  perform hit_rate_limit('privacy_export', v_uid::text, 5, interval '1 hour');
  select lower(email) into v_email from profiles where id = v_uid;
  select coalesce(array_agg(id), '{}') into v_students from students where profile_id = v_uid;
  v := jsonb_build_object(
    'generated_at', now(),
    'about', 'A copy of the personal data ' || setting_text('business.name') || ' holds about you. Financial records are kept for as long as the law requires.',
    'data_controller', business_details(),
    'account', (select to_jsonb(p) - 'last_seen_at' from profiles p where p.id = v_uid),
    'student_records', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from students s where s.id = any (v_students)),
    'registrations', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from registrations r
                      where r.student_id = any (v_students) or (v_email is not null and lower(r.email) = v_email)),
    'enquiries', (select coalesce(jsonb_agg(jsonb_build_object('created_at', e.created_at, 'source', e.source, 'message', e.message,
                    'status', e.status) order by e.created_at), '[]') from enquiries e where v_email is not null and lower(e.email) = v_email),
    'assessments', (select coalesce(jsonb_agg(to_jsonb(a) - 'token' order by a.created_at), '[]') from assessment_attempts a
                    where a.student_id = any (v_students)),
    'placements', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from placements p where p.student_id = any (v_students)),
    'enrolments', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('class', c.name) order by e.start_date), '[]')
                   from enrolments e join classes c on c.id = e.class_id where e.student_id = any (v_students)),
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object('date', s.session_date, 'class', coalesce(c.name, 'One-to-one lesson'),
                    'status', a.status, 'remarks', a.remarks) order by s.session_date), '[]')
                   from attendance a join sessions s on s.id = a.session_id left join classes c on c.id = s.class_id
                   where a.student_id = any (v_students)),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('teacher', t.full_name) order by b.starts_at), '[]')
                 from bookings b left join profiles t on t.id = b.teacher_id where b.student_id = any (v_students)),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('items',
                   (select coalesce(jsonb_agg(to_jsonb(it)), '[]') from invoice_items it where it.invoice_id = i.id)) order by i.created_at), '[]')
                 from invoices i where i.student_id = any (v_students) and i.status <> 'draft'),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from payments p where p.student_id = any (v_students)),
    'messages_sent_to_you', (select coalesce(jsonb_agg(jsonb_build_object('created_at', m.created_at, 'channel', m.channel, 'recipient', m.recipient,
                               'subject', m.subject, 'status', m.status, 'sent_at', m.sent_at) order by m.created_at), '[]')
                             from message_outbox m where m.profile_id = v_uid or m.student_id = any (v_students)),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('created_at', n.created_at, 'title', n.title, 'body', n.body, 'read', n.read)
                        order by n.created_at), '[]') from notifications n where n.user_id = v_uid),
    'privacy_requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from privacy_requests r where r.profile_id = v_uid));
  if is_teacher() then
    v := v || jsonb_build_object(
      'teacher_profile', (select to_jsonb(t) from teacher_profiles t where t.profile_id = v_uid),
      'teaching_languages', (select coalesce(jsonb_agg(l.name), '[]') from teacher_languages tl join languages l on l.id = tl.language_id where tl.teacher_id = v_uid),
      'availability', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from teacher_availability a where a.teacher_id = v_uid),
      'time_off', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from teacher_time_off o where o.teacher_id = v_uid),
      'pay_rates', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from teacher_rates r where r.teacher_id = v_uid),
      'salary_statements', (select coalesce(jsonb_agg(to_jsonb(p) order by p.period), '[]') from teacher_payouts p
                            where p.teacher_id = v_uid and p.status in ('approved', 'partially_paid', 'paid')),
      'salary_payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_on), '[]') from teacher_payout_payments x
                          join teacher_payouts p on p.id = x.payout_id where p.teacher_id = v_uid));
  end if;
  insert into privacy_requests (kind, status, profile_id, student_id, handled_at)
  values ('export', 'completed', v_uid, v_students[1], now());
  return v;
end $$;

create or replace function public.request_account_deletion(p_reason text default null) returns privacy_requests
language plpgsql security definer set search_path = public as $$
declare r privacy_requests; v_name text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from privacy_requests where profile_id = auth.uid() and kind = 'deletion' and status = 'pending') then
    raise exception 'You already have a deletion request waiting for the academy';
  end if;
  perform hit_rate_limit('privacy_deletion', auth.uid()::text, 3, interval '1 day');
  insert into privacy_requests (kind, profile_id, student_id, details)
  values ('deletion', auth.uid(), (select id from students where profile_id = auth.uid() order by created_at limit 1),
          left(nullif(trim(p_reason), ''), 2000))
  returning * into r;
  select coalesce(full_name, email, 'A user') into v_name from profiles where id = auth.uid();
  perform notify_admins_event('admin_privacy_request', jsonb_build_object('requester', v_name, 'reason', coalesce(r.details, 'not given')),
                              'privacy_request', r.id, 'privacy:' || r.id, '/admin/accounts');
  return r;
end $$;

create or replace function public.cancel_privacy_request(p_request uuid) returns privacy_requests
language plpgsql security definer set search_path = public as $$
declare r privacy_requests;
begin
  update privacy_requests set status = 'cancelled', handled_at = now()
  where id = p_request and profile_id = auth.uid() and status = 'pending'
  returning * into r;
  if not found then raise exception 'There is no open request to cancel'; end if;
  return r;
end $$;

create or replace function public.resolve_privacy_request(p_request uuid, p_status text, p_response text default null) returns privacy_requests
language plpgsql security definer set search_path = public as $$
declare r privacy_requests;
begin
  if not is_admin() then raise exception 'Only an administrator can resolve privacy requests'; end if;
  if p_status not in ('completed', 'rejected') then raise exception 'Choose completed or rejected'; end if;
  if p_status = 'rejected' and coalesce(trim(p_response), '') = '' then raise exception 'Please explain why the request is refused'; end if;
  update privacy_requests set status = p_status, response = nullif(trim(p_response), ''), handled_by = auth.uid(), handled_at = now()
  where id = p_request and status = 'pending'
  returning * into r;
  if not found then raise exception 'This request is not open'; end if;
  if r.profile_id is not null and exists (select 1 from profiles where id = r.profile_id and status = 'active') then
    perform notify_user(r.profile_id, 'Your personal data request',
      case when p_status = 'completed' then 'Your request has been completed.' else 'Your request was not completed: ' || r.response end,
      'privacy_request', null, 'privacy_request', r.id);
  end if;
  return r;
end $$;

-- Removes a former student's personal details. Financial records (invoices,
-- receipts, payments) keep the details they were issued with, as tax law requires.
create or replace function public.anonymise_student(p_student uuid, p_reason text) returns students
language plpgsql security definer set search_path = public as $$
declare s students; v_email text; v_profile uuid; v_regs uuid[]; v_enqs uuid[];
begin
  if not is_admin() then raise exception 'Only an administrator can anonymise a student'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record the reason, for example the request date'; end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'Student not found'; end if;
  if s.full_name like 'Anonymised student%' then raise exception 'This student is already anonymised'; end if;
  if exists (select 1 from enrolments where student_id = p_student and status in ('pending', 'waitlisted', 'active', 'suspended')) then
    raise exception 'End or withdraw this student''s current enrolments first';
  end if;
  if exists (select 1 from bookings where student_id = p_student and status in ('requested', 'approved') and ends_at > now()) then
    raise exception 'Cancel this student''s upcoming one-to-one lessons first';
  end if;
  v_email := lower(s.email);
  v_profile := s.profile_id;
  select coalesce(array_agg(id), '{}') into v_regs from registrations
  where student_id = p_student or (v_email is not null and lower(email) = v_email);
  select coalesce(array_agg(id), '{}') into v_enqs from enquiries
  where (v_email is not null and lower(email) = v_email) or registration_id = any (v_regs);

  update students set full_name = 'Anonymised student ' || student_code, email = null, phone = null, date_of_birth = null,
    guardian_name = null, guardian_phone = null, learning_objectives = null, notes = null, profile_id = null,
    consent_marketing = false, consent_whatsapp = false, preferred_contact = 'email', status = 'archived',
    archived_at = coalesce(archived_at, now())
  where id = p_student returning * into s;
  update registrations set student_name = 'Anonymised', guardian_name = null, email = 'removed+' || id || '@invalid', phone = null,
    date_of_birth = null, objectives = null, additional_info = null, utm = null, admin_notes = null
  where id = any (v_regs);
  update enquiries set name = 'Anonymised', email = null, phone = null, username = null, message = '[removed]', notes = null, utm = null
  where id = any (v_enqs);
  update enquiry_messages set body = '[removed]' where enquiry_id = any (v_enqs);
  update bookings set objective = null, notes = null where student_id = p_student;
  update message_outbox set recipient = 'removed', recipient_name = null, body = '[removed]', subject = null, variables = '{}'::jsonb,
    status = case when status in ('queued', 'sending') then 'cancelled' else status end
  where student_id = p_student or (v_profile is not null and profile_id = v_profile);
  if v_profile is not null then
    update profiles set full_name = 'Anonymised user', phone = null, status = 'deactivated',
      suspended_reason = 'Personal data erased on request'
    where id = v_profile and role = 'student';
    delete from notifications where user_id = v_profile;
  end if;

  -- Remove the same details from earlier audit entries (who did what, and when, stays).
  perform set_config('topmind.audit_redact', 'on', true);
  update audit_logs set old_data = redact_personal(old_data), new_data = redact_personal(new_data)
  where (table_name = 'students' and record_id = p_student::text)
     or (table_name = 'registrations' and record_id = any (select x::text from unnest(v_regs) x))
     or (table_name = 'enquiries' and record_id = any (select x::text from unnest(v_enqs) x))
     or (table_name = 'bookings' and record_id in (select id::text from bookings where student_id = p_student))
     or (v_profile is not null and table_name = 'profiles' and record_id = v_profile::text);
  perform set_config('topmind.audit_redact', 'off', true);

  update privacy_requests set status = 'completed', handled_by = auth.uid(), handled_at = now(),
    response = 'Personal details removed. Financial records are kept as the law requires.'
  where kind = 'deletion' and status = 'pending' and (student_id = p_student or (v_profile is not null and profile_id = v_profile));
  insert into audit_logs (actor_id, actor_role, action, table_name, record_id, new_data)
  values (auth.uid(), 'admin', 'anonymise', 'students', p_student::text, jsonb_build_object('reason', left(p_reason, 500)));
  return s;
end $$;

revoke execute on function redact_personal(jsonb) from public, anon, authenticated;
revoke execute on function export_my_data(), request_account_deletion(text), cancel_privacy_request(uuid),
  resolve_privacy_request(uuid, text, text), anonymise_student(uuid, text) from public, anon;
grant execute on function export_my_data(), request_account_deletion(text), cancel_privacy_request(uuid),
  resolve_privacy_request(uuid, text, text), anonymise_student(uuid, text) to authenticated;

commit;
