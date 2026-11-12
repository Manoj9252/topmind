-- 0011_free_classes.sql
-- Free classes / open workshops showcase and public spot reservation.

begin;

create table free_classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  instructor text not null,
  language text not null default 'English',
  target_audience text,
  mode text not null default 'In-Person' check (mode in ('In-Person', 'Online', 'Hybrid')),
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  image_url text,
  capacity int check (capacity is null or capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index free_classes_active_starts_idx on free_classes (active, starts_at, ends_at);

create trigger free_classes_touch
  before update on free_classes
  for each row execute function touch_updated_at();

select enable_audit('free_classes');

alter table free_classes enable row level security;

create policy public_read on free_classes
  for select to anon, authenticated
  using (active = true);

create policy admin_all on free_classes
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- Public free-class seat reservation. Keeps direct inserts on registrations
-- locked down under RLS while letting visitors reserve a free spot safely.
create or replace function public.reserve_free_class(
  p_free_class uuid,
  p_name text,
  p_email text,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fc free_classes;
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_lang uuid;
  v_mode text;
  v_code text;
  v_reserved int;
  v_existing registrations;
  v_reg registrations;
begin
  perform hit_rate_limit('free_class_ip', request_ip(), 15, interval '1 hour');
  perform hit_rate_limit('free_class_email', v_email, 10, interval '1 day');

  if length(v_name) < 2 then raise exception 'Please enter your full name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Please enter a valid email address';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{6,20}$' then
    raise exception 'Please enter a valid WhatsApp or phone number';
  end if;

  select * into v_fc from free_classes
  where id = p_free_class and active = true
  for update;

  if not found then
    raise exception 'This free class is no longer available';
  end if;
  if v_fc.ends_at <= now() then
    raise exception 'This free class session has already ended';
  end if;

  -- Idempotent per email + free class so repeat clicks do not consume extra seats.
  select * into v_existing from registrations
  where utm ->> 'free_class_id' = v_fc.id::text
    and lower(email) = v_email
    and status <> 'cancelled'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status', v_existing.status,
      'tracking_code', v_existing.tracking_code,
      'already_reserved', true
    );
  end if;

  if v_fc.capacity is not null then
    select count(*) into v_reserved from registrations
    where utm ->> 'free_class_id' = v_fc.id::text
      and status <> 'cancelled';
    if v_reserved >= v_fc.capacity then
      raise exception 'Sorry, all free seats for this session have been reserved';
    end if;
  end if;

  select id into v_lang from languages
  where lower(name) = lower(trim(coalesce(v_fc.language, '')))
  limit 1;

  v_mode := case v_fc.mode
    when 'In-Person' then 'physical'
    when 'Online' then 'online'
    else 'either'
  end;

  loop
    v_code := 'FREE-' || upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from registrations where tracking_code = v_code);
  end loop;

  insert into registrations (
    student_name, email, phone, preferred_contact, language_id, course_id,
    format, mode, additional_info, consent_privacy, source, utm, tracking_code,
    status, student_id
  )
  values (
    v_name,
    v_email,
    v_phone,
    case when v_phone is not null then 'whatsapp' else 'email' end,
    v_lang,
    null,
    'group',
    v_mode,
    'Free class reservation: ' || v_fc.title || ' (' || to_char(v_fc.starts_at at time zone biz_tz(), 'DD Mon YYYY HH24:MI') || ')',
    true,
    'free_class',
    jsonb_build_object('free_class_id', v_fc.id, 'free_class_title', v_fc.title),
    v_code,
    'approved',
    (select id from students where lower(email) = v_email limit 1)
  )
  returning * into v_reg;

  perform emit_event('registration.received', 'registration', v_reg.id);

  return jsonb_build_object(
    'status', v_reg.status,
    'tracking_code', v_reg.tracking_code
  );
end $$;

revoke all on function public.reserve_free_class(uuid, text, text, text) from public;
grant execute on function public.reserve_free_class(uuid, text, text, text) to anon, authenticated;

commit;
