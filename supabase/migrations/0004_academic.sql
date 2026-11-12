-- 0004_academic.sql
-- Registration workflow, placement assessments, dated lesson records,
-- attendance with change history, and lesson materials with safe access rules.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Events and rate limits
-- ---------------------------------------------------------------------------
-- Business events (registration received, invoice issued, ...). Replaced in
-- 0006 by the notification engine; a no-op until then.
create or replace function public.emit_event(p_event text, p_ref_type text, p_ref_id uuid, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$ begin null; end $$;

create table if not exists rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (bucket, key_hash, window_start)
);
alter table rate_limits enable row level security;

create or replace function public.request_ip() returns text
language plpgsql stable as $$
declare h json;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  return coalesce(nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), h ->> 'x-real-ip', h ->> 'cf-connecting-ip');
exception when others then return null;
end $$;

create or replace function public.hit_rate_limit(p_bucket text, p_key text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_secs numeric := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_secs) * v_secs);
  v_hits int;
begin
  if coalesce(p_key, '') = '' or is_trusted_context() then return; end if;
  insert into rate_limits (bucket, key_hash, window_start)
  values (p_bucket, encode(extensions.digest(p_key, 'sha256'), 'hex'), v_start)
  on conflict (bucket, key_hash, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Too many requests. Please wait a while and try again.' using errcode = 'P0429';
  end if;
  if random() < 0.02 then delete from rate_limits where window_start < now() - interval '2 days'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lesson records (sessions)
-- ---------------------------------------------------------------------------
alter table sessions add column if not exists start_time time;
alter table sessions add column if not exists end_time time;
alter table sessions add column if not exists starts_at timestamptz;
alter table sessions add column if not exists ends_at timestamptz;
alter table sessions add column if not exists status text not null default 'scheduled';
alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check check (status in ('scheduled', 'completed', 'cancelled'));
alter table sessions add column if not exists schedule_id uuid references class_schedules on delete set null;
alter table sessions add column if not exists booking_id uuid references bookings on delete set null;
alter table sessions add column if not exists topic text;
alter table sessions add column if not exists notes text;
alter table sessions add column if not exists cancel_reason text;
alter table sessions add column if not exists rescheduled_from uuid references sessions on delete set null;
alter table sessions add column if not exists completed_at timestamptz;
alter table sessions add column if not exists completed_by uuid references profiles on delete set null;
alter table sessions add column if not exists created_by uuid references profiles on delete set null;
alter table sessions add column if not exists created_at timestamptz not null default now();
alter table sessions add column if not exists updated_at timestamptz not null default now();
alter table sessions drop constraint if exists sessions_class_or_booking_check;
alter table sessions add constraint sessions_class_or_booking_check check (class_id is not null or booking_id is not null);
alter table sessions drop constraint if exists sessions_time_check;
alter table sessions add constraint sessions_time_check check (end_time is null or start_time is null or end_time > start_time);
alter table sessions drop constraint if exists sessions_class_id_session_date_key;
create unique index if not exists sessions_class_slot_key
  on sessions (class_id, session_date, coalesce(start_time, '00:00'::time)) where class_id is not null;
create index if not exists sessions_teacher_idx on sessions (teacher_id, session_date);
create index if not exists sessions_date_idx on sessions (session_date);
create unique index if not exists sessions_booking_key on sessions (booking_id) where booking_id is not null and status <> 'cancelled';

-- Sessions created by the old attendance screen: fill in times and status.
update sessions s set start_time = cs.start_time, end_time = cs.end_time, schedule_id = cs.id
from class_schedules cs
where s.start_time is null and cs.class_id = s.class_id and cs.weekday = extract(dow from s.session_date)::int;
update sessions s set status = 'completed', completed_at = coalesce(s.completed_at, now())
where s.status = 'scheduled' and exists (select 1 from attendance a where a.session_id = s.id);

create or replace function public.sessions_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  if new.class_id is not null then
    select coalesce(timezone, biz_tz()) into v_tz from classes where id = new.class_id;
    if new.teacher_id is null then select teacher_id into new.teacher_id from classes where id = new.class_id; end if;
  end if;
  v_tz := coalesce(v_tz, biz_tz());
  if new.start_time is not null then
    new.starts_at := (new.session_date + new.start_time) at time zone v_tz;
    new.ends_at := (new.session_date + coalesce(new.end_time, new.start_time + interval '1 hour')) at time zone v_tz;
  elsif new.starts_at is not null then
    new.session_date := (new.starts_at at time zone v_tz)::date;
    new.start_time := (new.starts_at at time zone v_tz)::time;
    new.end_time := (coalesce(new.ends_at, new.starts_at + interval '1 hour') at time zone v_tz)::time;
    new.ends_at := coalesce(new.ends_at, new.starts_at + interval '1 hour');
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists sessions_defaults on sessions;
create trigger sessions_defaults before insert or update on sessions for each row execute function sessions_defaults();
update sessions set start_time = start_time where starts_at is null and start_time is not null;

-- Internal: create the dated lessons for active classes. Idempotent.
create or replace function public.generate_lessons_internal(p_class uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into sessions (class_id, session_date, start_time, end_time, teacher_id, schedule_id, status)
  select c.id, d::date, s.start_time, s.end_time, c.teacher_id, s.id, 'scheduled'
  from classes c
  join class_schedules s on s.class_id = c.id
  cross join lateral generate_series(greatest(p_from, coalesce(c.start_date, p_from)),
                                     least(p_to, coalesce(c.end_date, p_to)), interval '1 day') d
  where c.status = 'active' and (p_class is null or c.id = p_class)
    and extract(dow from d)::int = s.weekday
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.generate_lessons(p_from date default null, p_to date default null, p_class uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_from date := coalesce(p_from, biz_today());
        v_to date := coalesce(p_to, biz_today() + (7 * setting_num('academic.lesson_weeks_ahead', 8))::int);
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can generate lessons'; end if;
  if v_to < v_from then raise exception 'The end date is before the start date'; end if;
  if v_to - v_from > 400 then raise exception 'Generate at most about a year of lessons at a time'; end if;
  return generate_lessons_internal(p_class, v_from, v_to);
end $$;

-- Remove future, unrecorded, generated lessons that no longer match the class setup.
create or replace function public.cleanup_future_lessons(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from sessions s
  where s.class_id = p_class and s.status = 'scheduled' and s.session_date >= biz_today() and s.schedule_id is not null
    and not exists (select 1 from attendance a where a.session_id = s.id)
    and (
      not exists (select 1 from class_schedules cs where cs.id = s.schedule_id and cs.weekday = extract(dow from s.session_date)::int
                    and cs.start_time = s.start_time and cs.end_time = s.end_time)
      or exists (select 1 from classes c where c.id = p_class and (c.status <> 'active'
                   or (c.end_date is not null and s.session_date > c.end_date)
                   or (c.start_date is not null and s.session_date < c.start_date))));
end $$;

create or replace function public.class_schedules_lessons() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from sessions s where s.schedule_id = old.id and s.status = 'scheduled' and s.session_date >= biz_today()
      and not exists (select 1 from attendance a where a.session_id = s.id);
    return old;
  end if;
  perform cleanup_future_lessons(new.class_id);
  perform generate_lessons_internal(new.class_id, biz_today(), biz_today() + (7 * setting_num('academic.lesson_weeks_ahead', 8))::int);
  return null;
end $$;
drop trigger if exists class_schedules_lessons_del on class_schedules;
create trigger class_schedules_lessons_del before delete on class_schedules
  for each row execute function class_schedules_lessons();
drop trigger if exists class_schedules_lessons on class_schedules;
create trigger class_schedules_lessons after insert or update on class_schedules
  for each row execute function class_schedules_lessons();

create or replace function public.classes_lessons() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is distinct from old.teacher_id then
    update sessions set teacher_id = new.teacher_id
    where class_id = new.id and status = 'scheduled' and session_date >= biz_today()
      and teacher_id is not distinct from old.teacher_id;
  end if;
  if new.status is distinct from old.status or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date then
    perform cleanup_future_lessons(new.id);
    if new.status = 'active' then
      perform generate_lessons_internal(new.id, biz_today(), biz_today() + (7 * setting_num('academic.lesson_weeks_ahead', 8))::int);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists classes_lessons on classes;
create trigger classes_lessons after update on classes for each row execute function classes_lessons();

-- Teacher clash check for one-off lessons and substitutions.
create or replace function public.teacher_conflict(p_teacher uuid, p_start timestamptz, p_end timestamptz,
  p_exclude_session uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(c.name, 'a one-to-one lesson') || ' at ' || to_char(s.starts_at at time zone biz_tz(), 'DD Mon HH24:MI')
  from sessions s left join classes c on c.id = s.class_id
  where s.teacher_id = p_teacher and s.status <> 'cancelled' and s.id is distinct from p_exclude_session
    and s.starts_at < p_end and p_start < s.ends_at
  order by s.starts_at limit 1
$$;

create or replace function public.add_lesson(p_class uuid, p_date date, p_start time, p_end time,
  p_teacher uuid default null, p_topic text default null) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions; v_conflict text; v_teacher uuid;
begin
  if not is_admin() then raise exception 'Only an administrator can add lessons'; end if;
  if p_end <= p_start then raise exception 'The lesson must end after it starts'; end if;
  v_teacher := coalesce(p_teacher, (select teacher_id from classes where id = p_class));
  insert into sessions (class_id, session_date, start_time, end_time, teacher_id, topic, created_by)
  values (p_class, p_date, p_start, p_end, v_teacher, p_topic, auth.uid()) returning * into s;
  if v_teacher is not null then
    v_conflict := teacher_conflict(v_teacher, s.starts_at, s.ends_at, s.id);
    if v_conflict is not null then raise exception 'Schedule conflict: the teacher already has %', v_conflict; end if;
  end if;
  perform emit_event('lesson.added', 'session', s.id);
  return s;
end $$;

create or replace function public.cancel_lesson(p_session uuid, p_reason text) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_admin() then raise exception 'Only an administrator can cancel lessons'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for the cancellation'; end if;
  update sessions set status = 'cancelled', cancel_reason = p_reason
  where id = p_session and status = 'scheduled' returning * into s;
  if not found then raise exception 'Only scheduled lessons can be cancelled'; end if;
  perform emit_event('lesson.cancelled', 'session', s.id, jsonb_build_object('reason', p_reason));
  return s;
end $$;

create or replace function public.reschedule_lesson(p_session uuid, p_date date, p_start time, p_end time, p_reason text)
returns sessions language plpgsql security definer set search_path = public as $$
declare old_s sessions; new_s sessions; v_conflict text;
begin
  if not is_admin() then raise exception 'Only an administrator can reschedule lessons'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason for the change'; end if;
  if p_end <= p_start then raise exception 'The lesson must end after it starts'; end if;
  select * into old_s from sessions where id = p_session for update;
  if not found or old_s.status <> 'scheduled' then raise exception 'Only scheduled lessons can be rescheduled'; end if;
  update sessions set status = 'cancelled',
    cancel_reason = 'Rescheduled to ' || to_char(p_date, 'DD Mon YYYY') || ' ' || to_char(p_start, 'HH24:MI') || ': ' || p_reason
  where id = p_session;
  insert into sessions (class_id, booking_id, session_date, start_time, end_time, teacher_id, topic, rescheduled_from, created_by)
  values (old_s.class_id, old_s.booking_id, p_date, p_start, p_end, old_s.teacher_id, old_s.topic, old_s.id, auth.uid())
  returning * into new_s;
  if new_s.teacher_id is not null then
    v_conflict := teacher_conflict(new_s.teacher_id, new_s.starts_at, new_s.ends_at, new_s.id);
    if v_conflict is not null then raise exception 'Schedule conflict: the teacher already has %', v_conflict; end if;
  end if;
  perform emit_event('lesson.rescheduled', 'session', new_s.id, jsonb_build_object('from', old_s.id, 'reason', p_reason));
  return new_s;
end $$;

create or replace function public.assign_substitute(p_session uuid, p_teacher uuid, p_reason text default null)
returns sessions language plpgsql security definer set search_path = public as $$
declare s sessions; v_conflict text;
begin
  if not is_admin() then raise exception 'Only an administrator can assign substitutes'; end if;
  if not exists (select 1 from profiles where id = p_teacher and role = 'teacher' and status = 'active') then
    raise exception 'Choose an active teacher';
  end if;
  select * into s from sessions where id = p_session for update;
  if not found or s.status <> 'scheduled' then raise exception 'Only scheduled lessons can be reassigned'; end if;
  v_conflict := teacher_conflict(p_teacher, s.starts_at, s.ends_at, s.id);
  if v_conflict is not null then raise exception 'Schedule conflict: that teacher already has %', v_conflict; end if;
  update sessions set teacher_id = p_teacher,
    notes = trim(both from coalesce(notes, '') || case when p_reason is not null then E'\nSubstitute: ' || p_reason else '' end)
  where id = p_session returning * into s;
  perform emit_event('lesson.substitute', 'session', s.id);
  return s;
end $$;

create or replace function public.update_lesson_notes(p_session uuid, p_topic text, p_notes text) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not (is_admin() or teaches_session(p_session)) then raise exception 'You can only update your own lessons'; end if;
  update sessions set topic = p_topic, notes = p_notes where id = p_session returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Attendance
-- ---------------------------------------------------------------------------
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check check (status in ('present', 'absent', 'late', 'excused', 'pending'));
alter table attendance add column if not exists remarks text;
alter table attendance add column if not exists recorded_by uuid references profiles on delete set null;
alter table attendance add column if not exists recorded_at timestamptz not null default now();
alter table attendance add column if not exists updated_at timestamptz not null default now();
create index if not exists attendance_student_idx on attendance (student_id);

create table if not exists attendance_history (
  id bigint generated always as identity primary key,
  attendance_id uuid,
  session_id uuid,
  student_id uuid,
  old_status text,
  new_status text,
  old_remarks text,
  new_remarks text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists attendance_history_session_idx on attendance_history (session_id);
alter table attendance_history enable row level security;

create or replace function public.attendance_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status or old.remarks is distinct from new.remarks then
    insert into attendance_history (attendance_id, session_id, student_id, old_status, new_status, old_remarks, new_remarks, changed_by)
    values (new.id, new.session_id, new.student_id, old.status, new.status, old.remarks, new.remarks, auth.uid());
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists attendance_track on attendance;
create trigger attendance_track before update on attendance for each row execute function attendance_track();

-- Students who belong in a lesson: enrolled in the class on that date, or the
-- student who booked a one-to-one lesson.
create or replace function public.lesson_roster(p_session uuid)
returns table (student_id uuid, full_name text, student_code text, enrolment_status text)
language sql stable security definer set search_path = public as $$
  select st.id, st.full_name, st.student_code, e.status
  from sessions s
  join enrolments e on e.class_id = s.class_id
  join students st on st.id = e.student_id
  where s.id = p_session and (is_admin() or teaches_session(p_session))
    and e.status not in ('pending', 'waitlisted')
    and e.start_date <= s.session_date and (e.end_date is null or e.end_date >= s.session_date)
  union
  select st.id, st.full_name, st.student_code, 'booking'
  from sessions s join bookings b on b.id = s.booking_id join students st on st.id = b.student_id
  where s.id = p_session and (is_admin() or teaches_session(p_session))
  order by 2
$$;

create or replace function public.save_attendance(p_session uuid, p_records jsonb, p_complete boolean default true,
  p_topic text default null, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sessions; r jsonb; v_student uuid; v_status text; n int := 0; v_edit_days int;
begin
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found'; end if;
  if not (is_admin() or teaches_session(p_session)) then
    raise exception 'You can only record attendance for your own lessons';
  end if;
  if s.status = 'cancelled' then raise exception 'This lesson was cancelled'; end if;
  if s.session_date > biz_today() then raise exception 'Attendance can be recorded from the day of the lesson'; end if;
  v_edit_days := setting_num('academic.attendance_edit_days', 7)::int;
  if not is_admin() and s.session_date < biz_today() - v_edit_days then
    raise exception 'Attendance for lessons more than % days old can only be changed by an administrator', v_edit_days;
  end if;
  if jsonb_typeof(p_records) <> 'array' then raise exception 'Attendance records must be a list'; end if;
  for r in select * from jsonb_array_elements(p_records) loop
    v_student := try_uuid(r ->> 'student_id');
    v_status := r ->> 'status';
    if v_status not in ('present', 'absent', 'late', 'excused', 'pending') then
      raise exception 'Unknown attendance status %', coalesce(v_status, '(blank)');
    end if;
    if not exists (select 1 from lesson_roster(p_session) lr where lr.student_id = v_student) then
      raise exception 'A student in this list is not enrolled in this lesson';
    end if;
    insert into attendance (session_id, student_id, status, remarks, recorded_by, recorded_at)
    values (p_session, v_student, v_status, nullif(trim(r ->> 'remarks'), ''), auth.uid(), now())
    on conflict (session_id, student_id) do update
      set status = excluded.status, remarks = excluded.remarks, recorded_by = excluded.recorded_by, recorded_at = now();
    n := n + 1;
  end loop;
  if p_complete then
    if exists (select 1 from lesson_roster(p_session) lr
               where not exists (select 1 from attendance a where a.session_id = p_session and a.student_id = lr.student_id and a.status <> 'pending')) then
      raise exception 'Mark every student before completing the lesson (use Pending only to save a draft)';
    end if;
    update sessions set status = 'completed', completed_at = coalesce(completed_at, now()), completed_by = coalesce(completed_by, auth.uid()),
      topic = coalesce(p_topic, topic), notes = coalesce(p_notes, notes)
    where id = p_session;
  elsif p_topic is not null or p_notes is not null then
    update sessions set topic = coalesce(p_topic, topic), notes = coalesce(p_notes, notes) where id = p_session;
  end if;
  perform emit_event('attendance.saved', 'session', p_session, jsonb_build_object('completed', p_complete));
  return jsonb_build_object('saved', n, 'completed', p_complete);
end $$;

-- Attendance figures. Runs with the caller's permissions, so each role only
-- counts the lessons and records it is allowed to see.
create or replace function public.attendance_summary(p_from date default null, p_to date default null,
  p_class uuid default null, p_student uuid default null)
returns table (student_id uuid, student_name text, student_code text, class_id uuid, class_name text,
  scheduled bigint, present bigint, late bigint, absent bigint, excused bigint, unmarked bigint, attendance_percent numeric)
language sql stable security invoker set search_path = public as $$
  with lessons as (
    select s.id, s.class_id, s.session_date from sessions s
    where s.status <> 'cancelled' and s.class_id is not null and s.session_date <= biz_today()
      and (p_from is null or s.session_date >= p_from) and (p_to is null or s.session_date <= p_to)
      and (p_class is null or s.class_id = p_class)
  ), roster as (
    select l.id as session_id, l.class_id, e.student_id from lessons l
    join enrolments e on e.class_id = l.class_id and e.status not in ('pending', 'waitlisted')
      and e.start_date <= l.session_date and (e.end_date is null or e.end_date >= l.session_date)
    where p_student is null or e.student_id = p_student
  )
  select r.student_id, st.full_name, st.student_code, r.class_id, c.name,
    count(*) as scheduled,
    count(*) filter (where a.status = 'present'),
    count(*) filter (where a.status = 'late'),
    count(*) filter (where a.status = 'absent'),
    count(*) filter (where a.status = 'excused'),
    count(*) filter (where a.status is null or a.status = 'pending'),
    round(100.0 * count(*) filter (where a.status in ('present', 'late'))
          / nullif(count(*) filter (where a.status in ('present', 'late', 'absent')), 0), 1)
  from roster r
  join students st on st.id = r.student_id
  join classes c on c.id = r.class_id
  left join attendance a on a.session_id = r.session_id and a.student_id = r.student_id
  group by r.student_id, st.full_name, st.student_code, r.class_id, c.name
  order by c.name, st.full_name
$$;

-- Lessons that have ended without attendance being completed.
create or replace function public.lessons_missing_attendance(p_teacher uuid default null)
returns table (session_id uuid, class_id uuid, class_name text, session_date date, start_time time, teacher_id uuid, teacher_name text)
language sql stable security invoker set search_path = public as $$
  select s.id, s.class_id, coalesce(c.name, 'One-to-one lesson'), s.session_date, s.start_time, s.teacher_id, p.full_name
  from sessions s left join classes c on c.id = s.class_id left join profiles p on p.id = s.teacher_id
  where s.status = 'scheduled' and coalesce(s.ends_at, (s.session_date + 1)::timestamptz) < now()
    and (p_teacher is null or s.teacher_id = p_teacher)
  order by s.session_date, s.start_time
$$;

-- ---------------------------------------------------------------------------
-- 4. Registrations
-- ---------------------------------------------------------------------------
alter table registrations add column if not exists preferred_contact text not null default 'email';
alter table registrations drop constraint if exists registrations_preferred_contact_check;
alter table registrations add constraint registrations_preferred_contact_check check (preferred_contact in ('email', 'whatsapp', 'phone'));
alter table registrations add column if not exists date_of_birth date;
alter table registrations add column if not exists language_id uuid references languages on delete set null;
alter table registrations add column if not exists class_id uuid references classes on delete set null;
alter table registrations add column if not exists level_self text;
alter table registrations add column if not exists objectives text;
alter table registrations add column if not exists format text not null default 'group';
alter table registrations drop constraint if exists registrations_format_check;
alter table registrations add constraint registrations_format_check check (format in ('group', 'one_to_one', 'either'));
alter table registrations add column if not exists preferred_days int[];
alter table registrations add column if not exists preferred_times text[];
alter table registrations add column if not exists timezone text not null default 'Asia/Kuala_Lumpur';
alter table registrations add column if not exists mode text not null default 'online';
alter table registrations drop constraint if exists registrations_mode_check;
alter table registrations add constraint registrations_mode_check check (mode in ('online', 'physical', 'either'));
alter table registrations add column if not exists additional_info text;
alter table registrations add column if not exists consent_privacy boolean not null default false;
alter table registrations add column if not exists consent_marketing boolean not null default false;
alter table registrations add column if not exists consent_whatsapp boolean not null default false;
alter table registrations add column if not exists source text not null default 'website';
alter table registrations add column if not exists utm jsonb;
alter table registrations add column if not exists enquiry_id uuid references enquiries on delete set null;
alter table registrations add column if not exists recommended_class_id uuid references classes on delete set null;
alter table registrations add column if not exists recommendation_reason text;
alter table registrations add column if not exists assessment_attempt_id uuid;
alter table registrations add column if not exists student_id uuid references students on delete set null;
alter table registrations add column if not exists enrolment_id uuid references enrolments on delete set null;
alter table registrations add column if not exists decision_reason text;
alter table registrations add column if not exists info_request text;
alter table registrations add column if not exists admin_notes text;
alter table registrations add column if not exists reviewed_by uuid references profiles on delete set null;
alter table registrations add column if not exists reviewed_at timestamptz;
alter table registrations add column if not exists updated_at timestamptz not null default now();
alter table registrations drop constraint if exists registrations_status_check;
alter table registrations add constraint registrations_status_check
  check (status in ('pending', 'info_requested', 'waitlisted', 'approved', 'rejected', 'converted', 'cancelled'));
update registrations r set language_id = c.language_id from courses c where r.course_id = c.id and r.language_id is null;
create index if not exists registrations_status_idx on registrations (status, created_at desc);
create index if not exists registrations_email_idx on registrations (lower(email));
do $$ begin
  if not exists (select 1 from registrations where status in ('pending', 'info_requested', 'waitlisted')
                 group by lower(email), course_id having count(*) > 1) then
    create unique index if not exists registrations_open_key on registrations (lower(email), coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid))
      where status in ('pending', 'info_requested', 'waitlisted');
  else
    raise notice 'registrations_open_key not created: resolve duplicate open registrations first.';
  end if;
end $$;
drop trigger if exists registrations_touch on registrations;
create trigger registrations_touch before update on registrations for each row execute function touch_updated_at();

-- Suggest classes for a programme, scored on level, days, times, mode and spaces.
create or replace function public.recommend_classes(p_course uuid, p_level uuid default null, p_days int[] default null,
  p_times text[] default null, p_mode text default null, p_limit int default 3)
returns table (class_id uuid, class_name text, level_id uuid, level_name text, schedule text, mode text,
  spaces_left int, start_date date, fee numeric, billing_frequency text, score int)
language sql stable security definer set search_path = public as $$
  with target as (select rank from levels where id = p_level),
  c as (
    select cl.id, cl.name, cl.level_id, lv.name as level_name, lv.rank, cl.mode, cl.start_date, cl.fee, cl.billing_frequency,
      greatest(cl.capacity - (select count(*) from enrolments e where e.class_id = cl.id and e.status = 'active'), 0)::int as spaces,
      (select string_agg(trim(to_char(date '2000-01-02' + s.weekday, 'Dy')) || ' ' || to_char(s.start_time, 'HH24:MI')
              || '-' || to_char(s.end_time, 'HH24:MI'), ', ' order by s.weekday, s.start_time)
         from class_schedules s where s.class_id = cl.id) as schedule,
      (select array_agg(s.weekday) from class_schedules s where s.class_id = cl.id) as days,
      (select array_agg(case when s.weekday in (0, 6) then 'weekend' when s.start_time < '12:00' then 'morning'
                             when s.start_time < '17:00' then 'afternoon' else 'evening' end)
         from class_schedules s where s.class_id = cl.id) as times
    from classes cl left join levels lv on lv.id = cl.level_id
    where cl.course_id = p_course and cl.status = 'active' and cl.kind in ('group', 'special', 'trial')
      and (cl.end_date is null or cl.end_date >= biz_today())
  )
  select c.id, c.name, c.level_id, c.level_name, c.schedule, c.mode, c.spaces, c.start_date, c.fee, c.billing_frequency,
    (case when p_level is null then 0
          when c.level_id = p_level then 100
          when c.rank is not null and (select rank from target) is not null then 60 - 20 * abs(c.rank - (select rank from target))
          else 0 end
     + case when p_days is not null and c.days && p_days then 20 else 0 end
     + case when p_times is not null and c.times && p_times then 10 else 0 end
     + case when p_mode is null or p_mode = 'either' or c.mode = p_mode or c.mode = 'hybrid' then 10 else -30 end
     + case when c.spaces > 0 then 15 else -60 end)::int as score
  from c
  order by score desc, c.spaces desc, c.name
  limit greatest(p_limit, 1)
$$;

-- ---------------------------------------------------------------------------
-- 5. Placement assessments
-- ---------------------------------------------------------------------------
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_id uuid references courses on delete cascade,
  language_id uuid references languages on delete cascade,
  description text,
  instructions text,
  skills text[] not null default '{vocabulary,grammar,reading}',
  time_limit_minutes int check (time_limit_minutes between 1 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (course_id is not null or language_id is not null)
);
create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments on delete cascade,
  section text not null default 'grammar'
    check (section in ('vocabulary', 'grammar', 'reading', 'sentence_construction', 'listening', 'writing', 'speaking')),
  kind text not null default 'mcq' check (kind in ('mcq', 'short_text', 'writing')),
  prompt text not null,
  passage text,
  media_url text,
  options jsonb,
  correct_option int,
  accepted_answers text[],
  points numeric(6, 2) not null default 1 check (points > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (kind <> 'mcq' or (jsonb_typeof(options) = 'array' and correct_option is not null
                           and correct_option >= 0 and correct_option < jsonb_array_length(options)))
);
create table if not exists placement_bands (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments on delete cascade,
  level_id uuid not null references levels on delete cascade,
  min_percent numeric(5, 2) not null check (min_percent between 0 and 100),
  unique (assessment_id, level_id),
  unique (assessment_id, min_percent)
);
create table if not exists assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments on delete cascade,
  registration_id uuid references registrations on delete set null,
  student_id uuid references students on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'submitted', 'reviewed', 'expired')),
  started_at timestamptz,
  submitted_at timestamptz,
  auto_points numeric(8, 2),
  auto_max numeric(8, 2),
  percent numeric(5, 2),
  manual_points numeric(8, 2),
  manual_max numeric(8, 2),
  level_id uuid references levels on delete set null,
  recommended_class_id uuid references classes on delete set null,
  reviewed_by uuid references profiles on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index if not exists assessment_attempts_student_idx on assessment_attempts (student_id);
create table if not exists assessment_answers (
  attempt_id uuid not null references assessment_attempts on delete cascade,
  question_id uuid not null references assessment_questions on delete cascade,
  selected_option int,
  text_answer text,
  is_correct boolean,
  points_awarded numeric(6, 2),
  primary key (attempt_id, question_id)
);
alter table registrations drop constraint if exists registrations_assessment_attempt_id_fkey;
alter table registrations add constraint registrations_assessment_attempt_id_fkey
  foreign key (assessment_attempt_id) references assessment_attempts on delete set null;

create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade,
  course_id uuid references courses on delete set null,
  level_id uuid references levels on delete set null,
  class_id uuid references classes on delete set null,
  registration_id uuid references registrations on delete set null,
  attempt_id uuid references assessment_attempts on delete set null,
  source text not null check (source in ('assessment', 'registration', 'admin', 'reassessment', 'transfer')),
  reason text,
  decided_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists placements_student_idx on placements (student_id, created_at desc);

-- The active assessment for a programme (or, failing that, its language).
create or replace function public.assessment_for(p_course uuid, p_language uuid default null) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from assessments a
  where a.is_active and exists (select 1 from assessment_questions q where q.assessment_id = a.id)
    and (a.course_id = p_course
         or (a.course_id is null and a.language_id = coalesce(p_language, (select language_id from courses where id = p_course))))
  order by (a.course_id = p_course) desc nulls last, a.created_at desc
  limit 1
$$;

create or replace function public.assessment_result_json(p_attempt uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', a.status,
    'percent', a.percent,
    'auto_points', a.auto_points,
    'auto_max', a.auto_max,
    'writing_pending', coalesce(a.manual_max, 0) > 0 and a.manual_points is null,
    'level', case when lv.id is not null then jsonb_build_object('id', lv.id, 'name', lv.name) end,
    'recommended_class', case when c.id is not null then jsonb_build_object(
        'id', c.id, 'name', c.name,
        'schedule', (select string_agg(trim(to_char(date '2000-01-02' + s.weekday, 'Dy')) || ' ' || to_char(s.start_time, 'HH24:MI')
                                       || '-' || to_char(s.end_time, 'HH24:MI'), ', ' order by s.weekday) from class_schedules s where s.class_id = c.id)) end,
    'skills', ass.skills,
    'note', 'This result covers the ' || array_to_string(ass.skills, ', ') || ' questions you answered.'
      || case when not ('speaking' = any (ass.skills)) then ' Speaking is not assessed by this quiz; your teacher will confirm your level in your first lesson.' else '' end
      || ' The academy will review your placement before confirming your class.')
  from assessment_attempts a
  join assessments ass on ass.id = a.assessment_id
  left join levels lv on lv.id = a.level_id
  left join classes c on c.id = a.recommended_class_id
  where a.id = p_attempt
$$;

create or replace function public.get_assessment(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a assessment_attempts; s assessments;
begin
  perform hit_rate_limit('assessment', request_ip(), 120, interval '1 hour');
  select * into a from assessment_attempts where token = p_token;
  if not found or a.expires_at < now() then raise exception 'This assessment link is invalid or has expired.'; end if;
  select * into s from assessments where id = a.assessment_id;
  if a.status in ('submitted', 'reviewed') then
    return jsonb_build_object('status', a.status, 'title', s.title, 'result', assessment_result_json(a.id));
  end if;
  if a.status = 'not_started' then
    update assessment_attempts set status = 'in_progress', started_at = now() where id = a.id returning * into a;
  end if;
  return jsonb_build_object(
    'status', a.status, 'title', s.title, 'description', s.description, 'instructions', s.instructions,
    'skills', s.skills, 'time_limit_minutes', s.time_limit_minutes, 'started_at', a.started_at,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'section', q.section, 'kind', q.kind,
                    'prompt', q.prompt, 'passage', q.passage, 'media_url', q.media_url, 'options', q.options)
                    order by q.sort_order, q.created_at), '[]'::jsonb)
                  from assessment_questions q where q.assessment_id = s.id));
end $$;

create or replace function public.submit_assessment(p_token text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a assessment_attempts; s assessments; q assessment_questions; v_ans jsonb; v_sel int; v_text text; v_ok boolean;
  v_auto numeric := 0; v_max numeric := 0; v_manual_max numeric := 0; v_pct numeric; v_level uuid; v_class uuid;
  v_reg registrations; v_course uuid;
begin
  perform hit_rate_limit('assessment_submit', request_ip(), 30, interval '1 hour');
  select * into a from assessment_attempts where token = p_token for update;
  if not found or a.expires_at < now() then raise exception 'This assessment link is invalid or has expired.'; end if;
  if a.status in ('submitted', 'reviewed') then return assessment_result_json(a.id); end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then raise exception 'Answers must be a list'; end if;
  select * into s from assessments where id = a.assessment_id;
  for q in select * from assessment_questions where assessment_id = a.assessment_id loop
    select x into v_ans from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) x where x ->> 'question_id' = q.id::text limit 1;
    if q.kind = 'mcq' then
      v_max := v_max + q.points;
      v_sel := case when (v_ans ->> 'option') ~ '^\d+$' then (v_ans ->> 'option')::int end;
      v_ok := v_sel is not null and v_sel = q.correct_option;
      insert into assessment_answers values (a.id, q.id, v_sel, null, v_ok, case when v_ok then q.points else 0 end)
      on conflict (attempt_id, question_id) do update set selected_option = excluded.selected_option,
        is_correct = excluded.is_correct, points_awarded = excluded.points_awarded;
      if v_ok then v_auto := v_auto + q.points; end if;
    elsif q.kind = 'short_text' and q.accepted_answers is not null then
      v_max := v_max + q.points;
      v_text := left(trim(v_ans ->> 'text'), 500);
      v_ok := lower(coalesce(v_text, '')) in (select lower(trim(x)) from unnest(q.accepted_answers) x);
      insert into assessment_answers values (a.id, q.id, null, v_text, v_ok, case when v_ok then q.points else 0 end)
      on conflict (attempt_id, question_id) do update set text_answer = excluded.text_answer,
        is_correct = excluded.is_correct, points_awarded = excluded.points_awarded;
      if v_ok then v_auto := v_auto + q.points; end if;
    else
      v_manual_max := v_manual_max + q.points;
      insert into assessment_answers values (a.id, q.id, null, left(v_ans ->> 'text', 5000), null, null)
      on conflict (attempt_id, question_id) do update set text_answer = excluded.text_answer;
    end if;
  end loop;
  v_pct := case when v_max > 0 then round(v_auto * 100 / v_max, 2) end;
  select b.level_id into v_level from placement_bands b
  where b.assessment_id = a.assessment_id and b.min_percent <= coalesce(v_pct, 0)
  order by b.min_percent desc limit 1;
  select * into v_reg from registrations where id = a.registration_id;
  v_course := coalesce(s.course_id, v_reg.course_id);
  if v_course is not null then
    select rc.class_id into v_class from recommend_classes(v_course, v_level, v_reg.preferred_days, v_reg.preferred_times, v_reg.mode, 10) rc
    where rc.spaces_left > 0 order by rc.score desc limit 1;
  end if;
  update assessment_attempts set status = 'submitted', submitted_at = now(), started_at = coalesce(started_at, now()),
    auto_points = v_auto, auto_max = v_max, percent = v_pct, manual_max = nullif(v_manual_max, 0),
    level_id = v_level, recommended_class_id = v_class
  where id = a.id;
  if v_reg.id is not null then
    update registrations set assessment_attempt_id = a.id, recommended_class_id = coalesce(v_class, recommended_class_id),
      recommendation_reason = 'Placement assessment: ' || coalesce(v_pct::text || '%', 'writing only')
        || coalesce(', suggested level ' || (select name from levels where id = v_level), '')
    where id = v_reg.id;
  end if;
  perform emit_event('assessment.submitted', 'assessment_attempt', a.id);
  return assessment_result_json(a.id);
end $$;

-- A signed-in student starts (or resumes) a placement or reassessment.
create or replace function public.start_my_assessment(p_assessment uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_student uuid := my_student_id(); v_token text;
begin
  if v_student is null then raise exception 'Your login is not linked to a student record yet'; end if;
  if not exists (select 1 from assessments where id = p_assessment and is_active) then raise exception 'Assessment not available'; end if;
  select token into v_token from assessment_attempts
  where student_id = v_student and assessment_id = p_assessment and status in ('not_started', 'in_progress') and expires_at > now()
  limit 1;
  if v_token is null then
    insert into assessment_attempts (assessment_id, student_id) values (p_assessment, v_student) returning token into v_token;
  end if;
  return v_token;
end $$;

create or replace function public.review_assessment(p_attempt uuid, p_manual_points numeric, p_level uuid, p_notes text default null)
returns assessment_attempts language plpgsql security definer set search_path = public as $$
declare a assessment_attempts;
begin
  if not is_staff() then raise exception 'Only staff can review assessments'; end if;
  select * into a from assessment_attempts where id = p_attempt for update;
  if not found or a.status not in ('submitted', 'reviewed') then raise exception 'Only submitted assessments can be reviewed'; end if;
  if p_manual_points is not null and (p_manual_points < 0 or p_manual_points > coalesce(a.manual_max, 0)) then
    raise exception 'Writing points must be between 0 and %', coalesce(a.manual_max, 0);
  end if;
  update assessment_attempts set status = 'reviewed', manual_points = p_manual_points, level_id = coalesce(p_level, level_id),
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
  where id = p_attempt returning * into a;
  return a;
end $$;

create or replace function public.place_student(p_student uuid, p_course uuid, p_level uuid, p_class uuid default null,
  p_reason text default null, p_source text default 'admin') returns placements
language plpgsql security definer set search_path = public as $$
declare p placements;
begin
  if not is_admin() then raise exception 'Only an administrator can change placements'; end if;
  if p_source not in ('admin', 'reassessment', 'transfer') then raise exception 'Unsupported placement source'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record the reason for this placement'; end if;
  insert into placements (student_id, course_id, level_id, class_id, source, reason, decided_by)
  values (p_student, coalesce(p_course, (select course_id from classes where id = p_class)), p_level, p_class, p_source, p_reason, auth.uid())
  returning * into p;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Public registration and the review workflow
-- ---------------------------------------------------------------------------
create or replace function public.submit_registration(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p ->> 'student_name', '')), 120);
  v_email text := lower(trim(coalesce(p ->> 'email', '')));
  v_phone text := nullif(trim(coalesce(p ->> 'phone', '')), '');
  v_contact text := coalesce(nullif(p ->> 'preferred_contact', ''), 'email');
  v_lang uuid := try_uuid(p ->> 'language_id');
  v_course uuid := try_uuid(p ->> 'course_id');
  v_class uuid := try_uuid(p ->> 'class_id');
  v_dob date;
  v_days int[];
  v_times text[];
  v_format text := coalesce(nullif(p ->> 'format', ''), 'group');
  v_mode text := coalesce(nullif(p ->> 'mode', ''), 'online');
  v_reg registrations;
  v_assessment uuid;
  v_token text;
  v_recs jsonb;
begin
  if coalesce(p ->> 'website', '') <> '' then
    return jsonb_build_object('status', 'pending');  -- honeypot field filled in: almost certainly a bot
  end if;
  perform hit_rate_limit('registration_ip', request_ip(), 10, interval '1 hour');
  perform hit_rate_limit('registration_email', v_email, 5, interval '1 day');

  if length(v_name) < 2 then raise exception 'Please enter your full name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'Please enter a valid email address'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Please enter a valid phone number'; end if;
  if v_contact not in ('email', 'whatsapp', 'phone') then raise exception 'Unknown contact preference'; end if;
  if v_contact in ('whatsapp', 'phone') and v_phone is null then raise exception 'Please give a phone number so we can contact you that way'; end if;
  if v_format not in ('group', 'one_to_one', 'either') then raise exception 'Unknown learning format'; end if;
  if v_mode not in ('online', 'physical', 'either') then raise exception 'Unknown learning mode'; end if;
  if coalesce((p ->> 'consent_privacy')::boolean, false) is not true then
    raise exception 'Please agree to the privacy policy so we can process your registration';
  end if;
  begin
    v_dob := nullif(p ->> 'date_of_birth', '')::date;
  exception when others then raise exception 'Please enter a valid date of birth';
  end;
  if v_dob is not null and (v_dob > biz_today() or v_dob < date '1900-01-01') then raise exception 'Please enter a valid date of birth'; end if;
  if v_dob is not null and age(biz_today(), v_dob) < interval '18 years' and coalesce(trim(p ->> 'guardian_name'), '') = '' then
    raise exception 'Learners under 18 need a parent or guardian name';
  end if;
  select coalesce(array_agg(x::int), '{}') into v_days from jsonb_array_elements_text(coalesce(p -> 'preferred_days', '[]')) x where x ~ '^[0-6]$';
  select coalesce(array_agg(x), '{}') into v_times from jsonb_array_elements_text(coalesce(p -> 'preferred_times', '[]')) x
    where x in ('morning', 'afternoon', 'evening', 'weekend');

  if v_lang is not null and not exists (select 1 from languages where id = v_lang and is_active) then
    raise exception 'That language is not open for registration';
  end if;
  if v_course is not null then
    if not exists (select 1 from courses where id = v_course and active) then raise exception 'That programme is not open for registration'; end if;
    if v_lang is null then select language_id into v_lang from courses where id = v_course; end if;
    if v_lang is not null and not exists (select 1 from courses where id = v_course and language_id = v_lang) then
      raise exception 'That programme is not offered for the selected language';
    end if;
  end if;
  if v_class is not null and not exists (select 1 from classes where id = v_class and status = 'active'
                                         and (v_course is null or course_id = v_course)) then
    raise exception 'That class is not open for registration';
  end if;

  -- Same person, same programme, still open: do not create a duplicate.
  select * into v_reg from registrations
  where lower(email) = v_email and coalesce(course_id, '00000000-0000-0000-0000-000000000000') = coalesce(v_course, '00000000-0000-0000-0000-000000000000')
    and status in ('pending', 'info_requested', 'waitlisted')
  limit 1;
  if found then
    perform emit_event('registration.duplicate', 'registration', v_reg.id);
    return jsonb_build_object('status', 'duplicate',
      'message', 'We already have an open registration for this email and programme. We have re-sent your confirmation email.');
  end if;

  insert into registrations (student_name, guardian_name, email, phone, preferred_contact, date_of_birth, language_id, course_id,
    class_id, level_self, objectives, format, preferred_days, preferred_times, timezone, mode, additional_info,
    consent_privacy, consent_marketing, consent_whatsapp, source, utm, tracking_code, status, student_id)
  values (v_name, nullif(left(trim(p ->> 'guardian_name'), 120), ''), v_email, v_phone, v_contact, v_dob, v_lang, v_course,
    v_class, left(p ->> 'level_self', 40), left(p ->> 'objectives', 2000), v_format, nullif(v_days, '{}'), nullif(v_times, '{}'),
    coalesce(nullif(p ->> 'timezone', ''), biz_tz()), v_mode, left(p ->> 'additional_info', 2000),
    true, coalesce((p ->> 'consent_marketing')::boolean, false), coalesce((p ->> 'consent_whatsapp')::boolean, false),
    case when p ->> 'source' in ('website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'referral', 'walk_in', 'other')
         then p ->> 'source' else 'website' end,
    case when jsonb_typeof(p -> 'utm') = 'object' then p -> 'utm' end,
    upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)), 'pending',
    (select id from students where lower(email) = v_email limit 1))
  returning * into v_reg;

  if v_course is not null then
    select coalesce(jsonb_agg(to_jsonb(rc) - 'score'), '[]'::jsonb) into v_recs
    from recommend_classes(v_course, null, nullif(v_days, '{}'), nullif(v_times, '{}'), v_mode, 3) rc;
    v_assessment := assessment_for(v_course, v_lang);
  elsif v_lang is not null then
    v_assessment := (select a.id from assessments a where a.is_active and a.language_id = v_lang and a.course_id is null
                     and exists (select 1 from assessment_questions q where q.assessment_id = a.id) limit 1);
  end if;
  if v_assessment is not null then
    insert into assessment_attempts (assessment_id, registration_id, student_id)
    values (v_assessment, v_reg.id, v_reg.student_id) returning token into v_token;
    update registrations set assessment_attempt_id = (select id from assessment_attempts where token = v_token) where id = v_reg.id;
  end if;

  perform emit_event('registration.received', 'registration', v_reg.id);
  return jsonb_build_object('status', 'pending', 'tracking_code', v_reg.tracking_code,
    'recommendations', coalesce(v_recs, '[]'::jsonb),
    'assessment', case when v_token is not null then jsonb_build_object('token', v_token,
       'title', (select title from assessments where id = v_assessment)) end);
end $$;

drop function if exists public.track_registration(text);
create function public.track_registration(code text)
returns table (student_name text, status text, programme text, submitted_on date, next_step text, assessment_token text)
language plpgsql security definer set search_path = public as $$
begin
  perform hit_rate_limit('track', request_ip(), 30, interval '1 hour');
  return query
  select r.student_name, r.status, c.name, (r.created_at at time zone biz_tz())::date,
    case r.status
      when 'pending' then 'We are reviewing your registration and will contact you soon.'
      when 'info_requested' then 'We need a little more information. Please check your email or contact us.'
      when 'waitlisted' then 'You are on the waiting list. We will contact you when a place opens.'
      when 'approved' then 'Approved. We will confirm your class placement shortly.'
      when 'converted' then 'Approved and placed in a class. Check your email for class details and portal access.'
      when 'rejected' then 'We could not offer a place this time. Please contact us if you have questions.'
      else 'Please contact us for an update.' end,
    case when a.status in ('not_started', 'in_progress') and a.expires_at > now() then a.token end
  from registrations r
  left join courses c on c.id = r.course_id
  left join assessment_attempts a on a.id = r.assessment_attempt_id
  where r.tracking_code = upper(trim(code));
end $$;

-- Find the student with the registration's email (reactivating an archived
-- record) or create one. Prevents duplicate student records.
create or replace function public.registration_student(r registrations) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_student uuid;
begin
  select id into v_student from students where lower(email) = lower(r.email) limit 1;
  if v_student is null then
    insert into students (full_name, email, phone, guardian_name, date_of_birth, preferred_language_id, learning_objectives,
      timezone, preferred_contact, consent_privacy_at, consent_marketing, consent_whatsapp, source, notes)
    values (r.student_name, lower(r.email), r.phone, r.guardian_name, r.date_of_birth,
      coalesce(r.language_id, (select language_id from courses where id = r.course_id)), r.objectives, r.timezone,
      r.preferred_contact, case when r.consent_privacy then r.created_at end, r.consent_marketing, r.consent_whatsapp,
      r.source, r.additional_info)
    returning id into v_student;
  else
    update students set status = case when status in ('archived', 'inactive') then 'active' else status end,
      phone = coalesce(phone, r.phone), date_of_birth = coalesce(date_of_birth, r.date_of_birth),
      learning_objectives = coalesce(learning_objectives, r.objectives),
      consent_privacy_at = coalesce(consent_privacy_at, case when r.consent_privacy then r.created_at end),
      consent_whatsapp = consent_whatsapp or r.consent_whatsapp
    where id = v_student;
  end if;
  return v_student;
end $$;

create or replace function public.approve_registration(p_registration uuid, p_class uuid default null, p_level uuid default null,
  p_start date default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r registrations; v_student uuid; e enrolments; v_status text; v_course uuid; v_level uuid;
begin
  if not is_admin() then raise exception 'Only an administrator can approve registrations'; end if;
  select * into r from registrations where id = p_registration for update;
  if not found then raise exception 'Registration not found'; end if;
  if r.status not in ('pending', 'info_requested', 'waitlisted', 'approved') then
    raise exception 'This registration is already %', r.status;
  end if;
  v_student := registration_student(r);

  v_course := coalesce((select course_id from classes where id = p_class), r.course_id);
  v_level := coalesce(p_level, (select level_id from classes where id = p_class),
                      (select level_id from assessment_attempts where id = r.assessment_attempt_id));
  if v_level is not null or p_class is not null then
    insert into placements (student_id, registration_id, course_id, level_id, class_id, attempt_id, source, reason, decided_by)
    values (v_student, r.id, v_course, v_level, p_class, r.assessment_attempt_id,
            case when r.assessment_attempt_id is not null then 'assessment' else 'registration' end, p_note, auth.uid());
  end if;

  if p_class is not null then
    select * into e from enrolments where student_id = v_student and class_id = p_class
      and status in ('pending', 'waitlisted', 'active', 'suspended');
    if found then
      if e.status = 'waitlisted' and (select count(*) from enrolments where class_id = p_class and status = 'active')
                                     < (select capacity from classes where id = p_class) then
        update enrolments set status = 'active', start_date = coalesce(p_start, biz_today()) where id = e.id returning * into e;
      end if;
    else
      e := enrol_student(v_student, p_class, p_start, true, p_note);
    end if;
    v_status := case when e.status = 'waitlisted' then 'waitlisted' else 'converted' end;
  else
    v_status := 'approved';
  end if;

  update registrations set status = v_status, student_id = v_student, enrolment_id = e.id, class_id = coalesce(p_class, class_id),
    reviewed_by = auth.uid(), reviewed_at = now(), admin_notes = coalesce(p_note, admin_notes)
  where id = r.id;
  perform emit_event('registration.' || v_status, 'registration', r.id, jsonb_build_object('enrolment_id', e.id));
  return jsonb_build_object('student_id', v_student, 'enrolment_id', e.id, 'enrolment_status', e.status,
                            'registration_status', v_status);
end $$;

create or replace function public.reject_registration(p_registration uuid, p_reason text) returns registrations
language plpgsql security definer set search_path = public as $$
declare r registrations;
begin
  if not is_admin() then raise exception 'Only an administrator can reject registrations'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record a reason for the rejection'; end if;
  update registrations set status = 'rejected', decision_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_registration and status in ('pending', 'info_requested', 'waitlisted', 'approved') returning * into r;
  if not found then raise exception 'Only open registrations can be rejected'; end if;
  perform emit_event('registration.rejected', 'registration', r.id);
  return r;
end $$;

create or replace function public.request_registration_info(p_registration uuid, p_message text) returns registrations
language plpgsql security definer set search_path = public as $$
declare r registrations;
begin
  if not is_admin() then raise exception 'Only an administrator can request information'; end if;
  if coalesce(trim(p_message), '') = '' then raise exception 'Please write what information you need'; end if;
  update registrations set status = 'info_requested', info_request = p_message, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_registration and status in ('pending', 'info_requested', 'waitlisted') returning * into r;
  if not found then raise exception 'Only open registrations can be updated'; end if;
  perform emit_event('registration.info_requested', 'registration', r.id);
  return r;
end $$;

create or replace function public.waitlist_registration(p_registration uuid, p_class uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r registrations; v_student uuid; v_enrolment uuid;
begin
  if not is_admin() then raise exception 'Only an administrator can manage the waiting list'; end if;
  select * into r from registrations where id = p_registration for update;
  if not found then raise exception 'Registration not found'; end if;
  if r.status not in ('pending', 'info_requested', 'waitlisted', 'approved') then
    raise exception 'This registration is already %', r.status;
  end if;
  if not exists (select 1 from classes where id = p_class and status in ('draft', 'active')) then
    raise exception 'Choose an open class for the waiting list';
  end if;
  v_student := registration_student(r);
  select id into v_enrolment from enrolments where student_id = v_student and class_id = p_class
    and status in ('pending', 'waitlisted', 'active', 'suspended');
  if v_enrolment is null then
    insert into enrolments (student_id, class_id, status, notes, created_by)
    values (v_student, p_class, 'waitlisted', p_note, auth.uid()) returning id into v_enrolment;
  end if;
  update registrations set status = 'waitlisted', class_id = p_class, student_id = v_student, enrolment_id = v_enrolment,
    reviewed_by = auth.uid(), reviewed_at = now(), admin_notes = coalesce(p_note, admin_notes)
  where id = p_registration;
  perform emit_event('registration.waitlisted', 'registration', p_registration);
  return jsonb_build_object('student_id', v_student, 'enrolment_id', v_enrolment, 'registration_status', 'waitlisted');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Lesson materials
-- ---------------------------------------------------------------------------
alter table materials add column if not exists description text;
alter table materials add column if not exists course_id uuid references courses on delete set null;
alter table materials add column if not exists language_id uuid references languages on delete set null;
alter table materials add column if not exists level_id uuid references levels on delete set null;
alter table materials add column if not exists session_id uuid references sessions on delete set null;
alter table materials add column if not exists topic text;
alter table materials add column if not exists lesson_label text;
alter table materials add column if not exists file_name text;
alter table materials add column if not exists mime_type text;
alter table materials add column if not exists size_bytes bigint;
alter table materials add column if not exists audience text not null default 'students';
alter table materials drop constraint if exists materials_audience_check;
alter table materials add constraint materials_audience_check check (audience in ('students', 'teachers'));
alter table materials add column if not exists is_published boolean not null default true;
alter table materials add column if not exists deleted_at timestamptz;
alter table materials add column if not exists updated_at timestamptz not null default now();
alter table materials drop constraint if exists materials_kind_check;
alter table materials add constraint materials_kind_check check (kind in ('material', 'homework', 'lesson_plan', 'slides',
  'worksheet', 'document', 'image', 'audio', 'video', 'quiz', 'resource'));
alter table materials drop constraint if exists materials_scope_check;
alter table materials add constraint materials_scope_check check (class_id is not null or course_id is not null or language_id is not null);
create index if not exists materials_class_idx on materials (class_id) where deleted_at is null;
update materials m set course_id = c.course_id from classes c where m.class_id = c.id and m.course_id is null;
update materials m set language_id = co.language_id from courses co where m.course_id = co.id and m.language_id is null;

create or replace function public.materials_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and new.course_id is null then select course_id into new.course_id from classes where id = new.class_id; end if;
  if new.course_id is not null and new.language_id is null then select language_id into new.language_id from courses where id = new.course_id; end if;
  if new.kind = 'lesson_plan' and tg_op = 'INSERT' then new.audience := 'teachers'; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if not (is_admin() or is_trusted_context()) and (new.uploaded_by is distinct from old.uploaded_by
        or new.storage_path is distinct from old.storage_path) then
      raise exception 'The owner and file of a material cannot be changed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists materials_defaults on materials;
create trigger materials_defaults before insert or update on materials for each row execute function materials_defaults();

create or replace function public.enrolled_in_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e join classes c on c.id = e.class_id
                 where c.course_id = p_course and e.status = 'active' and e.student_id in (select my_student_ids()))
$$;
create or replace function public.teaches_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_teacher() and exists (select 1 from classes where course_id = p_course and teacher_id = auth.uid()
                                  and status in ('draft', 'active'))
$$;
-- Administrators and the uploader also see removed (soft-deleted) materials.
create or replace function public.can_read_material(m materials) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or (is_teacher() and m.uploaded_by = auth.uid())
    or (m.deleted_at is null and (
      (is_teacher() and ((m.class_id is not null and teaches_class(m.class_id))
        or (m.class_id is null and m.course_id is not null and teaches_course(m.course_id))
        or (m.class_id is null and m.course_id is null and m.language_id is not null
            and exists (select 1 from teacher_languages tl where tl.teacher_id = auth.uid() and tl.language_id = m.language_id))))
      or (m.is_published and m.audience = 'students' and (
        (m.class_id is not null and active_in_class(m.class_id))
        or (m.class_id is null and m.course_id is not null and enrolled_in_course(m.course_id))))))
$$;
create or replace function public.can_read_material_file(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from materials m where m.storage_path = p_path and can_read_material(m))
$$;

drop policy if exists teacher_read on materials;
drop policy if exists student_read on materials;
create policy member_read on materials for select to authenticated using (can_read_material(materials));
create policy teacher_insert on materials for insert to authenticated with check (
  (select is_teacher()) and uploaded_by = (select auth.uid()) and class_id is not null and teaches_class(class_id));
create policy teacher_update on materials for update to authenticated
  using ((select is_teacher()) and uploaded_by = (select auth.uid()))
  with check ((select is_teacher()) and uploaded_by = (select auth.uid()) and (class_id is null or teaches_class(class_id)));

-- Storage: files live at class/<class id>/<file>, course/<course id>/<file> or
-- general/<file>. Teachers upload only into classes they teach; reading needs a
-- materials record the reader is allowed to see.
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'materials';

drop policy if exists materials_insert on storage.objects;
create policy materials_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'materials' and (
    (select is_admin())
    or ((select is_teacher()) and (storage.foldername(name))[1] = 'class'
        and teaches_class(try_uuid((storage.foldername(name))[2])))));
drop policy if exists materials_read on storage.objects;
create policy materials_read on storage.objects for select to authenticated using (
  bucket_id = 'materials' and ((select is_admin()) or owner = (select auth.uid()) or can_read_material_file(name)));
drop policy if exists materials_delete on storage.objects;
create policy materials_delete on storage.objects for delete to authenticated using (
  bucket_id = 'materials' and ((select is_admin()) or owner = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 8. Policies for the new tables
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['assessments', 'assessment_questions', 'placement_bands', 'assessment_attempts',
                           'assessment_answers', 'placements', 'attendance_history'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
  end loop;
end $$;
create policy staff_read on assessments for select to authenticated using ((select is_teacher()));
create policy staff_read on placement_bands for select to authenticated using ((select is_teacher()));
create policy teacher_read on assessment_attempts for select to authenticated using (teaches_student(student_id));
create policy own_attempts on assessment_attempts for select to authenticated using (is_my_student(student_id));
create policy teacher_read on assessment_answers for select to authenticated using (
  exists (select 1 from assessment_attempts a where a.id = attempt_id and teaches_student(a.student_id)));
create policy own_placements on placements for select to authenticated using (is_my_student(student_id));
create policy teacher_read on placements for select to authenticated using (teaches_student(student_id));
create policy teacher_read on attendance_history for select to authenticated using (teaches_session(session_id));

-- Registrations now go through submit_registration (validation, duplicate
-- checks, rate limits); direct inserts from the browser are no longer allowed.
drop policy if exists public_insert on registrations;

do $$ declare t text; begin
  foreach t in array array['sessions', 'attendance', 'registrations', 'assessments', 'assessment_questions',
                           'placement_bands', 'placements', 'materials'] loop
    perform enable_audit(t);
  end loop;
end $$;

insert into app_settings (key, value, category, label, description) values
  ('academic.attendance_edit_days', '7', 'academic', 'Attendance edit window (days)', 'Teachers can change attendance for this many days after a lesson.'),
  ('academic.absence_alert_threshold', '3', 'academic', 'Absence alert threshold', 'Alert after this many absences within the alert window. 0 turns alerts off.'),
  ('academic.absence_alert_window_days', '30', 'academic', 'Absence alert window (days)', null),
  ('academic.attendance_warning_percent', '75', 'academic', 'Attendance warning (%)', 'Students below this attendance rate are flagged.'),
  ('academic.default_lesson_minutes', '60', 'academic', 'Default lesson length (minutes)', null),
  ('academic.default_class_capacity', '10', 'academic', 'Default class capacity', null),
  ('academic.lesson_weeks_ahead', '8', 'academic', 'Lessons scheduled ahead (weeks)', 'How far ahead dated lessons are created from class schedules.')
on conflict (key) do nothing;

-- Lessons for existing active classes.
do $$ begin perform generate_lessons_internal(null, biz_today(), biz_today() + 56); end $$;

revoke execute on function emit_event(text, text, uuid, jsonb), hit_rate_limit(text, text, int, interval),
  generate_lessons_internal(uuid, date, date), cleanup_future_lessons(uuid), class_schedules_lessons(), classes_lessons(),
  attendance_track(), sessions_defaults(), materials_defaults(), assessment_result_json(uuid), registration_student(registrations)
  from public, anon, authenticated;

commit;
