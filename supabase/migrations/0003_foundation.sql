-- 0003_foundation.sql
-- Core foundation for the Top Mind platform.
--  * Replaces the row-level security policies from 0001/0002, which referenced
--    each other and made Postgres abort every query on classes, students,
--    enrolments, sessions, attendance, invoices, payments, bookings and materials
--    ("infinite recursion detected in policy").
--  * Adds settings, an audit log, managed languages, teacher profiles, richer
--    student and class records, multi-day class schedules and enrolment history.
-- Additive and safe to run on a database that already ran 0001 and 0002.

begin;

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  category text not null default 'general',
  label text,
  description text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles on delete set null
);

insert into app_settings (key, value, category, label, description, is_public) values
  ('business.name', '"Top Mind Enterprise"', 'business', 'Business name', null, true),
  ('business.tagline', '"Language learning without fear of mistakes"', 'business', 'Tagline', null, true),
  ('business.email', '"etopmind@gmail.com"', 'business', 'Email', null, true),
  ('business.phone', '"+60 10-522 1300"', 'business', 'Phone', null, true),
  ('business.whatsapp', '"60105221300"', 'business', 'WhatsApp number', 'Digits only, with country code. Used for chat links.', true),
  ('business.address', '""', 'business', 'Address', 'Not provided yet.', true),
  ('business.website', '""', 'business', 'Website', null, true),
  ('business.registration_no', '""', 'business', 'Business registration number', null, true),
  ('business.logo_url', '"/logo.jpeg"', 'business', 'Logo', null, true),
  ('business.instagram_url', '"https://www.instagram.com/topmind_enterprise/"', 'business', 'Instagram', null, true),
  ('business.tiktok_url', '"https://www.tiktok.com/@topmind_enterprise"', 'business', 'TikTok', null, true),
  ('business.mission', '"To make language learning accessible, enjoyable and meaningful by providing a safe and supportive environment where learners can build strong foundations, express themselves confidently and learn without fear of making mistakes."', 'business', 'Mission', null, true),
  ('business.vision', '"To become a trusted global language-learning brand that empowers people to communicate confidently through accessible online education and welcoming physical learning centres, with the long-term ambition of expanding internationally through language centres and franchises."', 'business', 'Vision', null, true),
  ('system.timezone', '"Asia/Kuala_Lumpur"', 'system', 'Business time zone', 'Used for billing dates, reminders and automation schedules.', true),
  ('system.site_url', '""', 'system', 'Public site address', 'For example https://topmind.my. Used for links in emails.', true),
  ('privacy.policy_updated', '"2026-11-02"', 'privacy', 'Privacy policy last updated', null, true),
  ('privacy.financial_retention_years', '7', 'privacy', 'Financial record retention (years)', 'Invoices, payments and receipts are kept at least this long.', false),
  ('privacy.inactive_student_retention_years', '3', 'privacy', 'Inactive student retention (years)', 'Archived students older than this can be anonymised on request.', false)
on conflict (key) do nothing;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from app_settings where key = p_key
$$;

create or replace function public.setting_text(p_key text, p_default text default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select value from app_settings where key = p_key) #>> '{}', ''), p_default)
$$;

create or replace function public.setting_num(p_key text, p_default numeric default null) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(((select value from app_settings where key = p_key) #>> '{}')::numeric, p_default)
$$;

create or replace function public.setting_bool(p_key text, p_default boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(((select value from app_settings where key = p_key) #>> '{}')::boolean, p_default)
$$;

create or replace function public.biz_tz() returns text
language sql stable as $$ select setting_text('system.timezone', 'Asia/Kuala_Lumpur') $$;

create or replace function public.biz_today() returns date
language sql stable as $$ select (now() at time zone biz_tz())::date $$;

create or replace function public.month_start(p_date date) returns date
language sql immutable as $$ select date_trunc('month', p_date)::date $$;

create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings where is_public
$$;

create or replace function public.slugify(p_text text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- True for the database owner (SQL editor, migrations, pg_cron) and the
-- service role used by Edge Functions; false for every browser request.
create or replace function public.is_trusted_context() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated'))
$$;

-- ---------------------------------------------------------------------------
-- 2. Accounts: status, suspension, safer signup
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists status text not null default 'active';
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check check (status in ('active', 'suspended', 'deactivated'));
alter table profiles add column if not exists suspended_reason text;
alter table profiles add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';
alter table profiles add column if not exists updated_at timestamptz not null default now();
alter table profiles add column if not exists last_seen_at timestamptz;

-- Suspended or deactivated accounts lose every role-based permission.
create or replace function public.current_role_() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_() = 'admin', false)
$$;
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_() = 'teacher', false)
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_() in ('admin', 'teacher'), false)
$$;

create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or is_trusted_context()) then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email or new.suspended_reason is distinct from old.suspended_reason then
      raise exception 'Only an administrator can change role, status or email';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles for each row execute function profiles_guard();

-- Roles never come from user-editable metadata. Accounts created by an
-- administrator through the admin-users Edge Function carry invited_role in
-- app_metadata, which only the service role can set.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role user_role := 'student';
begin
  if new.raw_app_meta_data ->> 'invited_role' in ('admin', 'teacher', 'student') then
    v_role := (new.raw_app_meta_data ->> 'invited_role')::user_role;
  end if;
  insert into profiles (id, full_name, email, role, phone)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          new.email, v_role, nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null then
    perform link_student_profile(new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Audit log and record protection
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[]
);
create index if not exists audit_logs_record_idx on audit_logs (table_name, record_id);
create index if not exists audit_logs_time_idx on audit_logs (occurred_at desc);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_changed text[]; v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k and k not in ('updated_at', 'last_seen_at');
    if v_changed is null then return null; end if;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key',
                   v_new ->> 'profile_id', v_old ->> 'profile_id');
  insert into audit_logs (actor_id, actor_role, action, table_name, record_id, old_data, new_data, changed_fields)
  values (auth.uid(), coalesce(current_role_()::text, auth.role(), 'system'), lower(tg_op), tg_table_name, v_id,
          v_old, v_new, v_changed);
  return null;
end $$;

create or replace function public.enable_audit(p_table text) returns void
language plpgsql as $$
begin
  execute format('drop trigger if exists audit_row on %I', p_table);
  execute format('create trigger audit_row after insert or update or delete on %I for each row execute function audit_row()', p_table);
end $$;

-- Financial and historical records are reversed or voided, never deleted.
-- A maintenance script can bypass this with: set local topmind.allow_delete = 'on';
create or replace function public.forbid_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
  raise exception '% cannot be deleted. Void, reverse or archive it instead.',
    initcap(replace(tg_table_name, '_', ' '));
end $$;

create or replace function public.audit_logs_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
  raise exception 'The audit log is append-only';
end $$;
drop trigger if exists audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function audit_logs_append_only();

-- ---------------------------------------------------------------------------
-- 4. Languages, programmes (courses), levels, centres, classrooms
-- ---------------------------------------------------------------------------
create table if not exists languages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  native_name text,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists languages_name_key on languages (lower(name));
create unique index if not exists languages_slug_key on languages (slug);

create or replace function public.languages_defaults() returns trigger
language plpgsql as $$
begin
  new.name := trim(new.name);
  if new.slug is null or new.slug = '' then new.slug := slugify(new.name); end if;
  return new;
end $$;
drop trigger if exists languages_defaults on languages;
create trigger languages_defaults before insert or update on languages for each row execute function languages_defaults();

-- Languages already named on existing programmes, then the business's own list.
insert into languages (name, slug)
select distinct on (lower(trim(language))) trim(language), slugify(language)
from courses where coalesce(trim(language), '') <> ''
on conflict do nothing;
insert into languages (name, slug, sort_order, is_active, description) values
  ('English', 'english', 1, true, 'Everyday, study and work English for adults, from first words to confident conversation.'),
  ('Tamil', 'tamil', 2, true, 'Speaking, reading and writing Tamil in a friendly, supportive class.'),
  ('Malay', 'malay', 3, true, 'Bahasa Melayu for everyday life, work and study.'),
  ('Chinese', 'chinese', 4, false, 'Mandarin Chinese. Coming soon.'),
  ('Hindi', 'hindi', 5, false, 'Hindi. Coming soon.')
on conflict do nothing;

alter table courses add column if not exists language_id uuid references languages on delete restrict;
alter table courses add column if not exists slug text;
alter table courses add column if not exists summary text;
alter table courses add column if not exists audience text not null default 'adults';
alter table courses drop constraint if exists courses_audience_check;
alter table courses add constraint courses_audience_check check (audience in ('adults', 'teens', 'children', 'all'));
alter table courses add column if not exists formats text[] not null default '{group}';
alter table courses add column if not exists sort_order int not null default 0;
alter table courses add column if not exists created_at timestamptz not null default now();
update courses c set language_id = l.id from languages l
where c.language_id is null and lower(trim(c.language)) = lower(l.name);
update courses set slug = slugify(name) where slug is null;
comment on column courses.language is 'Deprecated free-text language from 0001. Use language_id.';
comment on table courses is 'Programmes (for example "English for Beginners"). Shown as Programmes in the app.';

create or replace function public.courses_defaults() returns trigger
language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then new.slug := slugify(new.name); end if;
  if new.language_id is not null then
    select name into new.language from languages where id = new.language_id;
  end if;
  return new;
end $$;
drop trigger if exists courses_defaults on courses;
create trigger courses_defaults before insert or update on courses for each row execute function courses_defaults();

alter table levels add column if not exists rank int not null default 0;
alter table levels add column if not exists description text;
alter table levels add column if not exists is_active boolean not null default true;
comment on table levels is 'Configurable proficiency levels per programme, with a standard monthly fee.';

create table if not exists centres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  timezone text not null default 'Asia/Kuala_Lumpur',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table classrooms add column if not exists centre_id uuid references centres on delete set null;
alter table classrooms add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 5. Teachers
-- ---------------------------------------------------------------------------
create sequence if not exists teacher_code_seq;
create table if not exists teacher_profiles (
  profile_id uuid primary key references profiles on delete cascade,
  teacher_code text not null unique default ('TMT-' || lpad(nextval('teacher_code_seq')::text, 4, '0')),
  employment_start date,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'inactive')),
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'freelance')),
  qualifications text,
  bio text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists teacher_languages (
  teacher_id uuid not null references profiles on delete cascade,
  language_id uuid not null references languages on delete cascade,
  primary key (teacher_id, language_id)
);

create or replace function public.ensure_teacher_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'teacher' then
    insert into teacher_profiles (profile_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists ensure_teacher_profile on profiles;
create trigger ensure_teacher_profile after insert or update of role on profiles
  for each row execute function ensure_teacher_profile();
insert into teacher_profiles (profile_id) select id from profiles where role = 'teacher' on conflict do nothing;

-- Teachers may edit their own bio and qualifications; employment fields are admin-only.
create or replace function public.teacher_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or is_trusted_context()) then
    if new.employment_start is distinct from old.employment_start
       or new.employment_status is distinct from old.employment_status
       or new.employment_type is distinct from old.employment_type
       or new.notes is distinct from old.notes or new.teacher_code is distinct from old.teacher_code then
      raise exception 'Only an administrator can change employment details';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists teacher_profiles_guard on teacher_profiles;
create trigger teacher_profiles_guard before update on teacher_profiles
  for each row execute function teacher_profiles_guard();

-- ---------------------------------------------------------------------------
-- 6. Students
-- ---------------------------------------------------------------------------
create sequence if not exists student_code_seq;
alter table students add column if not exists student_code text;
do $$ declare r record; begin
  for r in select id from students where student_code is null order by created_at, id loop
    update students set student_code = 'TMS-' || lpad(nextval('student_code_seq')::text, 5, '0') where id = r.id;
  end loop;
end $$;
alter table students alter column student_code set default ('TMS-' || lpad(nextval('student_code_seq')::text, 5, '0'));
alter table students alter column student_code set not null;
create unique index if not exists students_student_code_key on students (student_code);

alter table students add column if not exists phone text;
alter table students add column if not exists date_of_birth date;
alter table students add column if not exists preferred_language_id uuid references languages on delete set null;
alter table students add column if not exists learning_objectives text;
alter table students add column if not exists status text not null default 'active';
alter table students drop constraint if exists students_status_check;
alter table students add constraint students_status_check check (status in ('active', 'inactive', 'suspended', 'archived'));
alter table students add column if not exists notes text;
alter table students add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';
alter table students add column if not exists preferred_contact text not null default 'email';
alter table students drop constraint if exists students_preferred_contact_check;
alter table students add constraint students_preferred_contact_check check (preferred_contact in ('email', 'whatsapp', 'phone'));
alter table students add column if not exists consent_privacy_at timestamptz;
alter table students add column if not exists consent_marketing boolean not null default false;
alter table students add column if not exists consent_whatsapp boolean not null default false;
alter table students add column if not exists source text not null default 'admin';
alter table students add column if not exists archived_at timestamptz;
alter table students add column if not exists updated_at timestamptz not null default now();
comment on column students.guardian_name is 'Emergency contact or guardian name';
comment on column students.guardian_phone is 'Emergency contact or guardian phone';

do $$ begin
  if not exists (select lower(email) from students where email is not null group by lower(email) having count(*) > 1) then
    create unique index if not exists students_email_key on students (lower(email)) where email is not null;
  else
    raise notice 'students_email_key not created: duplicate student emails exist. Merge them, then create the index.';
  end if;
end $$;

-- Link a confirmed login to the student record with the same email.
create or replace function public.link_student_profile(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = p_user and email_confirmed_at is not null;
  if v_email is null then return; end if;
  if exists (select 1 from profiles where id = p_user and role = 'student') then
    update students set profile_id = p_user
    where profile_id is null and lower(email) = lower(v_email)
      and not exists (select 1 from students s2 where s2.profile_id = p_user);
  end if;
end $$;

create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform link_student_profile(new.id);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function handle_user_confirmed();

-- ---------------------------------------------------------------------------
-- 7. Classes and multi-day schedules
-- ---------------------------------------------------------------------------
alter table classes add column if not exists course_id uuid references courses on delete set null;
update classes c set course_id = l.course_id from levels l where c.level_id = l.id and c.course_id is null;
alter table classes add column if not exists description text;
alter table classes add column if not exists mode text not null default 'online';
alter table classes drop constraint if exists classes_mode_check;
alter table classes add constraint classes_mode_check check (mode in ('online', 'physical', 'hybrid'));
update classes set mode = 'physical' where classroom_id is not null and mode = 'online';
alter table classes add column if not exists meeting_link text;
alter table classes add column if not exists location_note text;
alter table classes add column if not exists start_date date;
alter table classes add column if not exists end_date date;
alter table classes add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';
alter table classes add column if not exists status text not null default 'active';
alter table classes drop constraint if exists classes_status_check;
alter table classes add constraint classes_status_check check (status in ('draft', 'active', 'inactive', 'completed', 'archived'));
alter table classes add column if not exists billing_frequency text not null default 'monthly';
alter table classes drop constraint if exists classes_billing_frequency_check;
alter table classes add constraint classes_billing_frequency_check
  check (billing_frequency in ('monthly', 'per_lesson', 'package', 'one_off', 'free'));
alter table classes add column if not exists currency text not null default 'MYR';
alter table classes add column if not exists lesson_minutes int check (lesson_minutes between 5 and 600);
alter table classes add column if not exists archived_at timestamptz;
alter table classes add column if not exists created_at timestamptz not null default now();
alter table classes add column if not exists updated_at timestamptz not null default now();
alter table classes drop constraint if exists classes_kind_check;
alter table classes add constraint classes_kind_check check (kind in ('group', 'one_to_one', 'special', 'trial'));
alter table classes drop constraint if exists classes_dates_check;
alter table classes add constraint classes_dates_check check (start_date is null or end_date is null or end_date >= start_date);
alter table classes drop constraint if exists classes_fee_check;
alter table classes add constraint classes_fee_check check (fee >= 0);

create table if not exists class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (class_id, weekday, start_time)
);
create index if not exists class_schedules_weekday_idx on class_schedules (weekday);

-- Move the single weekly slot from 0001 into class_schedules, then retire it.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'classes' and column_name = 'weekday') then
    execute 'insert into class_schedules (class_id, weekday, start_time, end_time)
             select id, weekday, start_time, end_time from classes
             where weekday is not null and start_time is not null and end_time is not null
             on conflict do nothing';
    alter table classes drop constraint if exists classes_teacher_id_slot_excl;
    alter table classes drop constraint if exists classes_classroom_id_slot_excl;
    alter table classes drop constraint if exists classes_check;
    alter table classes drop constraint if exists classes_weekday_check;
    alter table classes drop column if exists slot;
    alter table classes drop column if exists weekday;
    alter table classes drop column if exists start_time;
    alter table classes drop column if exists end_time;
  end if;
end $$;

-- Teacher and room clashes, aware of class terms and status. Replaces the
-- 0001 exclusion constraints, which ignored start/end dates.
create or replace function public.check_schedule_conflicts(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c classes; r record;
begin
  select * into c from classes where id = p_class;
  if not found or c.status not in ('draft', 'active') then return; end if;
  if c.teacher_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('teacher-schedule:' || c.teacher_id::text, 0));
    select o.name, s2.weekday, s2.start_time, s2.end_time into r
    from class_schedules s1
    join class_schedules s2 on s2.weekday = s1.weekday and s2.start_time < s1.end_time and s1.start_time < s2.end_time
    join classes o on o.id = s2.class_id
    where s1.class_id = c.id and o.id <> c.id and o.teacher_id = c.teacher_id and o.status in ('draft', 'active')
      and daterange(coalesce(o.start_date, '-infinity'), coalesce(o.end_date, 'infinity'), '[]')
       && daterange(coalesce(c.start_date, '-infinity'), coalesce(c.end_date, 'infinity'), '[]')
    limit 1;
    if found then
      raise exception 'Schedule conflict: this teacher already teaches "%" on % from % to %.',
        r.name, trim(to_char(date '2000-01-02' + r.weekday, 'Day')), to_char(r.start_time, 'HH24:MI'), to_char(r.end_time, 'HH24:MI');
    end if;
  end if;
  if c.classroom_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('room-schedule:' || c.classroom_id::text, 0));
    select o.name, s2.weekday, s2.start_time, s2.end_time into r
    from class_schedules s1
    join class_schedules s2 on s2.weekday = s1.weekday and s2.start_time < s1.end_time and s1.start_time < s2.end_time
    join classes o on o.id = s2.class_id
    where s1.class_id = c.id and o.id <> c.id and o.classroom_id = c.classroom_id and o.status in ('draft', 'active')
      and daterange(coalesce(o.start_date, '-infinity'), coalesce(o.end_date, 'infinity'), '[]')
       && daterange(coalesce(c.start_date, '-infinity'), coalesce(c.end_date, 'infinity'), '[]')
    limit 1;
    if found then
      raise exception 'Schedule conflict: this room is already used by "%" on % from % to %.',
        r.name, trim(to_char(date '2000-01-02' + r.weekday, 'Day')), to_char(r.start_time, 'HH24:MI'), to_char(r.end_time, 'HH24:MI');
    end if;
  end if;
end $$;

create or replace function public.class_schedules_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform check_schedule_conflicts(new.class_id);
  return null;
end $$;
drop trigger if exists class_schedules_check on class_schedules;
create trigger class_schedules_check after insert or update on class_schedules
  for each row execute function class_schedules_check();

create or replace function public.classes_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.teacher_id is distinct from old.teacher_id or new.classroom_id is distinct from old.classroom_id
     or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
     or new.status is distinct from old.status then
    perform check_schedule_conflicts(new.id);
  end if;
  return null;
end $$;
drop trigger if exists classes_check on classes;
create trigger classes_check after insert or update on classes for each row execute function classes_check();

create or replace function public.classes_defaults() returns trigger
language plpgsql as $$
begin
  if new.course_id is null and new.level_id is not null then
    select course_id into new.course_id from levels where id = new.level_id;
  end if;
  if new.status = 'archived' and new.archived_at is null then new.archived_at := now(); end if;
  if new.status <> 'archived' then new.archived_at := null; end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists classes_defaults on classes;
create trigger classes_defaults before insert or update on classes for each row execute function classes_defaults();

-- The teacher who actually takes a lesson (substitutes included). Lesson
-- records are extended further in 0004.
alter table sessions add column if not exists teacher_id uuid references profiles on delete set null;
alter table sessions add column if not exists status text not null default 'scheduled';
update sessions s set teacher_id = c.teacher_id from classes c where c.id = s.class_id and s.teacher_id is null;

-- ---------------------------------------------------------------------------
-- 8. Enrolments with history
-- ---------------------------------------------------------------------------
update enrolments set status = 'active' where status is null;
alter table enrolments alter column status set not null;
alter table enrolments drop constraint if exists enrolments_student_id_class_id_key;
alter table enrolments drop constraint if exists enrolments_status_check;
alter table enrolments add constraint enrolments_status_check
  check (status in ('pending', 'waitlisted', 'active', 'suspended', 'completed', 'transferred', 'withdrawn', 'dropped'));
alter table enrolments add column if not exists start_date date not null default biz_today();
alter table enrolments add column if not exists end_date date;
alter table enrolments add column if not exists reason text;
alter table enrolments add column if not exists transferred_from uuid references enrolments on delete set null;
alter table enrolments add column if not exists fee_override numeric(10, 2) check (fee_override >= 0);
alter table enrolments add column if not exists discount_percent numeric(5, 2) not null default 0
  check (discount_percent between 0 and 100);
alter table enrolments add column if not exists notes text;
alter table enrolments add column if not exists created_by uuid references profiles on delete set null;
alter table enrolments add column if not exists created_at timestamptz not null default now();
alter table enrolments add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from enrolments where student_id is null or class_id is null) then
    alter table enrolments alter column student_id set not null;
    alter table enrolments alter column class_id set not null;
  else
    raise notice 'enrolments has rows without a student or class; NOT NULL not applied.';
  end if;
end $$;
-- One current enrolment per student and class; ended rows stay as history.
create unique index if not exists enrolments_current_key on enrolments (student_id, class_id)
  where status in ('pending', 'waitlisted', 'active', 'suspended');
create index if not exists enrolments_class_idx on enrolments (class_id, status);
comment on column enrolments.status is 'dropped is the 0001 name for withdrawn and is kept for old rows.';

create or replace function public.check_capacity() returns trigger
language plpgsql as $$
declare cap int; cnt int; v_status text;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.class_id <> new.class_id) then
    select capacity, status into cap, v_status from classes where id = new.class_id for update;
    if v_status in ('archived', 'completed', 'inactive') then
      raise exception 'This class is %, so students cannot be enrolled.', v_status;
    end if;
    select count(*) into cnt from enrolments
    where class_id = new.class_id and status = 'active' and id is distinct from new.id;
    if cnt >= cap then raise exception 'Class is full (capacity %)', cap; end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Row-level security helpers (security definer, so policies never recurse)
-- ---------------------------------------------------------------------------
create or replace function public.my_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s join profiles p on p.id = s.profile_id
  where s.profile_id = auth.uid() and p.status = 'active'
$$;
create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select i from my_student_ids() i limit 1
$$;
create or replace function public.is_my_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_student_ids() i where i = p_student)
$$;
-- The class teacher, or a substitute with a lesson in the class in the last 30 days or ahead.
create or replace function public.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and (
    exists (select 1 from classes where id = p_class and teacher_id = auth.uid())
    or exists (select 1 from sessions where class_id = p_class and teacher_id = auth.uid()
               and session_date >= biz_today() - 30 and status <> 'cancelled'))
$$;
create or replace function public.in_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e
                 where e.class_id = p_class and e.student_id in (select my_student_ids())
                   and e.status in ('active', 'suspended', 'completed', 'transferred', 'withdrawn', 'dropped'))
$$;
create or replace function public.active_in_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e
                 where e.class_id = p_class and e.student_id in (select my_student_ids()) and e.status = 'active')
$$;
create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and exists (
    select 1 from enrolments e
    where e.student_id = p_student and e.status in ('pending', 'waitlisted', 'active', 'suspended', 'completed')
      and teaches_class(e.class_id))
$$;
create or replace function public.teaches_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and exists (
    select 1 from sessions s left join classes c on c.id = s.class_id
    where s.id = p_session and (s.teacher_id = auth.uid() or c.teacher_id = auth.uid()))
$$;
create or replace function public.is_my_invoice(p_invoice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from invoices where id = p_invoice and student_id in (select my_student_ids()))
$$;
create or replace function public.try_uuid(p_text text) returns uuid
language plpgsql immutable as $$
begin return p_text::uuid; exception when others then return null; end $$;

-- ---------------------------------------------------------------------------
-- 10. Replace every policy from 0001/0002 with a non-recursive set
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname in ('mat_obj_read', 'mat_obj_write') loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['app_settings', 'audit_logs', 'languages', 'centres', 'teacher_profiles', 'teacher_languages', 'class_schedules'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Administrators manage these tables directly.
do $$ declare t text; begin
  foreach t in array array['profiles', 'courses', 'levels', 'classrooms', 'centres', 'languages', 'classes', 'class_schedules',
                           'students', 'enrolments', 'teacher_profiles', 'teacher_languages', 'app_settings', 'sessions',
                           'attendance', 'teacher_rates', 'availability_slots', 'bookings', 'materials', 'checklists',
                           'enquiries', 'registrations', 'notifications', 'expenses'] loop
    execute format('create policy admin_all on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end $$;

-- Financial tables: administrators read; every change goes through checked functions.
create policy admin_read on invoices for select to authenticated using ((select is_admin()));
create policy admin_read on payments for select to authenticated using ((select is_admin()));
create policy admin_read on teacher_payouts for select to authenticated using ((select is_admin()));
create policy admin_read on audit_logs for select to authenticated using ((select is_admin()));

-- A suspended user can still read their own profile (to see the status) and nothing else.
create policy own_profile on profiles for select to authenticated using (id = (select auth.uid()));
create policy own_profile_update on profiles for update to authenticated
  using (id = (select auth.uid()) and status = 'active') with check (id = (select auth.uid()));

create policy public_read on app_settings for select to anon, authenticated using (is_public);
create policy public_read on languages for select to anon, authenticated using (is_active or (select is_staff()));
create policy public_read on courses for select to anon, authenticated using (active or (select is_staff()));
create policy public_read on levels for select to anon, authenticated using (true);
create policy staff_read on classrooms for select to authenticated using ((select is_staff()));
create policy staff_read on centres for select to authenticated using ((select is_staff()));

create policy own_teacher_profile on teacher_profiles for select to authenticated
  using (profile_id = (select auth.uid()) and (select is_teacher()));
create policy own_teacher_profile_update on teacher_profiles for update to authenticated
  using (profile_id = (select auth.uid()) and (select is_teacher())) with check (profile_id = (select auth.uid()));
create policy staff_read on teacher_languages for select to authenticated using ((select is_staff()));

create policy teacher_read on classes for select to authenticated using (teaches_class(id));
create policy student_read on classes for select to authenticated using (in_class(id));
create policy class_members_read on class_schedules for select to authenticated
  using (teaches_class(class_id) or in_class(class_id));

create policy own_student on students for select to authenticated using (is_my_student(id));
create policy teacher_read on students for select to authenticated using (teaches_student(id));

create policy own_enrolments on enrolments for select to authenticated using (is_my_student(student_id));
create policy teacher_read on enrolments for select to authenticated using (teaches_class(class_id));

create policy teacher_read on sessions for select to authenticated
  using ((select is_teacher()) and (teacher_id = (select auth.uid()) or teaches_class(class_id)));
create policy student_read on sessions for select to authenticated using (in_class(class_id));

create policy teacher_read on attendance for select to authenticated using (teaches_session(session_id));
create policy own_attendance on attendance for select to authenticated using (is_my_student(student_id));

create policy own_invoices on invoices for select to authenticated
  using (is_my_student(student_id) and status <> 'draft');
create policy own_payments on payments for select to authenticated using (is_my_invoice(invoice_id));

create policy own_rates on teacher_rates for select to authenticated
  using (teacher_id = (select auth.uid()) and (select is_teacher()));
create policy own_payouts on teacher_payouts for select to authenticated
  using (teacher_id = (select auth.uid()) and (select is_teacher()));

create policy own_slots on availability_slots for all to authenticated
  using (teacher_id = (select auth.uid()) and (select is_teacher()))
  with check (teacher_id = (select auth.uid()) and (select is_teacher()));
create policy own_bookings on bookings for select to authenticated using (is_my_student(student_id));
create policy teacher_read on bookings for select to authenticated using (
  (select is_teacher()) and exists (select 1 from availability_slots a where a.id = slot_id and a.teacher_id = (select auth.uid())));

create policy own_notifications on notifications for select to authenticated using (user_id = (select auth.uid()));

-- Website forms keep working until 0004/0006 move them to validated functions.
create policy public_insert on enquiries for insert to anon, authenticated with check (true);
create policy public_insert on registrations for insert to anon, authenticated with check (status = 'pending');

-- Materials: rebuilt with class ownership checks in 0004.
create policy teacher_read on materials for select to authenticated using (
  (select is_teacher()) and (uploaded_by = (select auth.uid()) or (class_id is not null and teaches_class(class_id))));
create policy student_read on materials for select to authenticated using (class_id is not null and active_in_class(class_id));

-- ---------------------------------------------------------------------------
-- 11. Retention guards, auditing, timestamps
-- ---------------------------------------------------------------------------
create or replace function public.students_before_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
  if exists (select 1 from enrolments where student_id = old.id)
     or exists (select 1 from attendance where student_id = old.id)
     or exists (select 1 from invoices where student_id = old.id) then
    raise exception 'This student has enrolment, attendance or billing history. Archive the student instead.';
  end if;
  return old;
end $$;
drop trigger if exists students_before_delete on students;
create trigger students_before_delete before delete on students for each row execute function students_before_delete();

create or replace function public.classes_before_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
  if exists (select 1 from enrolments where class_id = old.id) or exists (select 1 from sessions where class_id = old.id) then
    raise exception 'This class has enrolments or lessons. Archive it instead.';
  end if;
  return old;
end $$;
drop trigger if exists classes_before_delete on classes;
create trigger classes_before_delete before delete on classes for each row execute function classes_before_delete();

drop trigger if exists invoices_no_delete on invoices;
create trigger invoices_no_delete before delete on invoices for each row execute function forbid_delete();
drop trigger if exists payments_no_delete on payments;
create trigger payments_no_delete before delete on payments for each row execute function forbid_delete();
drop trigger if exists teacher_payouts_no_delete on teacher_payouts;
create trigger teacher_payouts_no_delete before delete on teacher_payouts for each row execute function forbid_delete();
drop trigger if exists expenses_no_delete on expenses;
create trigger expenses_no_delete before delete on expenses for each row execute function forbid_delete();

drop trigger if exists students_touch on students;
create trigger students_touch before update on students for each row execute function touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['profiles', 'students', 'teacher_profiles', 'teacher_languages', 'languages', 'courses', 'levels',
                           'centres', 'classrooms', 'classes', 'class_schedules', 'enrolments', 'invoices', 'payments',
                           'teacher_rates', 'teacher_payouts', 'expenses', 'app_settings'] loop
    perform enable_audit(t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Enrolment functions
-- ---------------------------------------------------------------------------
create or replace function public.enrol_student(p_student uuid, p_class uuid, p_start date default null,
  p_waitlist_if_full boolean default true, p_notes text default null) returns enrolments
language plpgsql security definer set search_path = public as $$
declare v_cap int; v_count int; v_status text; e enrolments; v_class classes;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can enrol students'; end if;
  select * into v_class from classes where id = p_class for update;
  if not found then raise exception 'Class not found'; end if;
  if v_class.status not in ('active', 'draft') then raise exception 'This class is %, so students cannot be enrolled.', v_class.status; end if;
  if not exists (select 1 from students where id = p_student and status <> 'archived') then
    raise exception 'Student not found or archived';
  end if;
  select * into e from enrolments where student_id = p_student and class_id = p_class
    and status in ('pending', 'waitlisted', 'active', 'suspended');
  if found then raise exception 'This student is already enrolled in this class (status: %).', e.status; end if;
  select count(*) into v_count from enrolments where class_id = p_class and status = 'active';
  v_cap := v_class.capacity;
  if v_count >= v_cap then
    if not p_waitlist_if_full then raise exception 'Class is full (capacity %)', v_cap; end if;
    v_status := 'waitlisted';
  else
    v_status := 'active';
  end if;
  insert into enrolments (student_id, class_id, status, start_date, notes, created_by)
  values (p_student, p_class, v_status, coalesce(p_start, greatest(biz_today(), coalesce(v_class.start_date, biz_today()))), p_notes, auth.uid())
  returning * into e;
  return e;
end $$;

create or replace function public.change_enrolment_status(p_enrolment uuid, p_status text, p_reason text default null,
  p_end_date date default null) returns enrolments
language plpgsql security definer set search_path = public as $$
declare e enrolments;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can change enrolments'; end if;
  select * into e from enrolments where id = p_enrolment for update;
  if not found then raise exception 'Enrolment not found'; end if;
  if p_status not in ('active', 'suspended', 'completed', 'withdrawn', 'waitlisted', 'pending') then
    raise exception 'Unsupported status %', p_status;
  end if;
  if e.status in ('completed', 'transferred', 'withdrawn', 'dropped') and p_status <> e.status then
    raise exception 'This enrolment has ended (%). Enrol the student again instead.', e.status;
  end if;
  if p_status = 'withdrawn' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Please record a reason for the withdrawal';
  end if;
  update enrolments set status = p_status, reason = coalesce(p_reason, reason),
    end_date = case when p_status in ('completed', 'withdrawn') then coalesce(p_end_date, biz_today()) else end_date end
  where id = p_enrolment returning * into e;
  return e;
end $$;

create or replace function public.transfer_enrolment(p_enrolment uuid, p_new_class uuid, p_reason text,
  p_date date default null) returns enrolments
language plpgsql security definer set search_path = public as $$
declare old_e enrolments; new_e enrolments; v_date date := coalesce(p_date, biz_today());
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can transfer students'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record a reason for the transfer'; end if;
  select * into old_e from enrolments where id = p_enrolment for update;
  if not found then raise exception 'Enrolment not found'; end if;
  if old_e.status not in ('active', 'suspended', 'waitlisted', 'pending') then raise exception 'Only current enrolments can be transferred'; end if;
  if old_e.class_id = p_new_class then raise exception 'The student is already in that class'; end if;
  update enrolments set status = 'transferred', end_date = v_date, reason = p_reason where id = p_enrolment;
  insert into enrolments (student_id, class_id, status, start_date, transferred_from, reason, fee_override, discount_percent, created_by)
  values (old_e.student_id, p_new_class, 'active', v_date, old_e.id, p_reason, old_e.fee_override, old_e.discount_percent, auth.uid())
  returning * into new_e;
  return new_e;
end $$;

-- Internal helpers are not callable from the browser.
revoke execute on function audit_row(), enable_audit(text), forbid_delete(), audit_logs_append_only(),
  link_student_profile(uuid), handle_user_confirmed(), ensure_teacher_profile(), check_schedule_conflicts(uuid),
  class_schedules_check(), classes_check(), students_before_delete(), classes_before_delete()
  from public, anon, authenticated;

commit;
