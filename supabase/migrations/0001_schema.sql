create extension if not exists btree_gist;
create type user_role as enum ('admin','teacher','student');

create table profiles(id uuid primary key references auth.users on delete cascade,
  full_name text, phone text, role user_role not null default 'student', created_at timestamptz default now());
create function public.current_role_() returns user_role language sql stable security definer set search_path=public as
 $$ select role from profiles where id=auth.uid() $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as
 $$ select coalesce(current_role_()='admin',false) $$;
-- Public signups are ALWAYS students. Promote admins manually in SQL.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as
 $$ begin insert into profiles(id,full_name,role) values(new.id,new.raw_user_meta_data->>'full_name','student'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table courses(id uuid primary key default gen_random_uuid(), name text not null, language text, description text, active bool default true);
create table levels(id uuid primary key default gen_random_uuid(), course_id uuid references courses on delete cascade, name text not null, monthly_fee numeric(10,2) not null check(monthly_fee>=0));
create table classrooms(id uuid primary key default gen_random_uuid(), name text not null, capacity int not null check(capacity>0));
create table classes(id uuid primary key default gen_random_uuid(), level_id uuid references levels, teacher_id uuid references profiles,
  classroom_id uuid references classrooms, kind text not null default 'group' check(kind in ('group','one_to_one')),
  name text not null, capacity int not null default 10 check(capacity>0), fee numeric(10,2) not null default 0,
  weekday int not null check(weekday between 0 and 6), start_time time not null, end_time time not null check(end_time>start_time),
  slot tsrange generated always as (tsrange(timestamp '2000-01-02' + weekday*interval '1 day' + start_time, timestamp '2000-01-02' + weekday*interval '1 day' + end_time)) stored,
  exclude using gist (teacher_id with =, slot with &&),
  exclude using gist (classroom_id with =, slot with &&));
create table students(id uuid primary key default gen_random_uuid(), profile_id uuid unique references profiles, full_name text not null,
  guardian_name text, guardian_phone text, email text, created_at timestamptz default now());
create table enrolments(id uuid primary key default gen_random_uuid(), student_id uuid references students on delete cascade,
  class_id uuid references classes on delete cascade, status text default 'active' check(status in ('pending','active','completed','dropped')),
  unique(student_id,class_id));
create table sessions(id uuid primary key default gen_random_uuid(), class_id uuid references classes on delete cascade, session_date date not null, unique(class_id,session_date));
create table attendance(id uuid primary key default gen_random_uuid(), session_id uuid references sessions on delete cascade,
  student_id uuid references students on delete cascade, status text not null check(status in ('present','absent','late','excused')),
  unique(session_id,student_id));

create table invoices(id uuid primary key default gen_random_uuid(), student_id uuid references students, period date, description text,
  amount numeric(10,2) not null check(amount>0), status text not null default 'unpaid' check(status in ('unpaid','partial','paid')),
  due_date date, created_at timestamptz default now(), unique(student_id,period,description));
create table payments(id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices, amount numeric(10,2) not null check(amount>0),
  method text not null, paid_on date not null default current_date, reference text unique, receipt_no text unique not null, created_at timestamptz default now());
create sequence receipt_seq;
create function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text default null)
returns payments language plpgsql security definer set search_path=public as $$
declare inv invoices; paid numeric; pay payments;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into inv from invoices where id=p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  select coalesce(sum(amount),0) into paid from payments where invoice_id=p_invoice;
  if paid+p_amount>inv.amount then raise exception 'overpayment: outstanding is %', inv.amount-paid; end if;
  insert into payments(invoice_id,amount,method,reference,receipt_no)
   values(p_invoice,p_amount,p_method,p_ref,'RC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('receipt_seq')::text,6,'0')) returning * into pay;
  update invoices set status=case when paid+p_amount=amount then 'paid' else 'partial' end where id=p_invoice;
  return pay;
end $$;
create table expenses(id uuid primary key default gen_random_uuid(), category text not null, description text, amount numeric(10,2) not null check(amount>0), spent_on date not null default current_date);
create table teacher_rates(id uuid primary key default gen_random_uuid(), teacher_id uuid references profiles, basis text check(basis in ('hourly','monthly','per_student')), rate numeric(10,2) not null);
create table teacher_payouts(id uuid primary key default gen_random_uuid(), teacher_id uuid references profiles, period date, amount numeric(10,2), paid bool default false, paid_on date);

create table availability_slots(id uuid primary key default gen_random_uuid(), teacher_id uuid references profiles, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), is_booked bool default false,
  exclude using gist (teacher_id with =, tstzrange(starts_at,ends_at) with &&));
create table bookings(id uuid primary key default gen_random_uuid(), slot_id uuid unique references availability_slots, student_id uuid references students,
  status text default 'requested' check(status in ('requested','approved','rejected','cancelled')), created_at timestamptz default now());
create table materials(id uuid primary key default gen_random_uuid(), class_id uuid references classes, uploaded_by uuid references profiles, title text, storage_path text not null, kind text default 'material', created_at timestamptz default now());
create table checklists(id uuid primary key default gen_random_uuid(), month date, title text not null, assignee uuid references profiles, due_date date, done bool default false);
create table enquiries(id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, message text, source text default 'website', created_at timestamptz default now());
create table registrations(id uuid primary key default gen_random_uuid(), tracking_code text unique default substr(md5(random()::text),1,10), student_name text not null, guardian_name text,
  email text not null, phone text, course_id uuid references courses, status text default 'pending' check(status in ('pending','approved','rejected')), created_at timestamptz default now());
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid references profiles, title text, body text, read bool default false, created_at timestamptz default now());

do $$ declare t text; begin
 foreach t in array array['profiles','courses','levels','classrooms','classes','students','enrolments','sessions','attendance','invoices','payments','expenses','teacher_rates','teacher_payouts','availability_slots','bookings','materials','checklists','enquiries','registrations','notifications'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())',t);
 end loop; end $$;
create policy own_profile on profiles for select using (id=auth.uid());
create policy own_profile_upd on profiles for update using (id=auth.uid()) with check (id=auth.uid() and role=(select role from profiles where id=auth.uid()));
create policy catalog_read on courses for select using (active);
create policy levels_read on levels for select using (true);
create policy teacher_classes on classes for select using (teacher_id=auth.uid());
create policy student_classes on classes for select using (exists(select 1 from enrolments e join students s on s.id=e.student_id where e.class_id=classes.id and s.profile_id=auth.uid()));
create policy own_student on students for select using (profile_id=auth.uid());
create policy teacher_students on students for select using (exists(select 1 from enrolments e join classes c on c.id=e.class_id where e.student_id=students.id and c.teacher_id=auth.uid()));
create policy own_enrol on enrolments for select using (exists(select 1 from students s where s.id=student_id and s.profile_id=auth.uid()));
create policy teacher_enrol on enrolments for select using (exists(select 1 from classes c where c.id=class_id and c.teacher_id=auth.uid()));
create policy teacher_sessions on sessions for all using (exists(select 1 from classes c where c.id=class_id and c.teacher_id=auth.uid())) with check (exists(select 1 from classes c where c.id=class_id and c.teacher_id=auth.uid()));
create policy teacher_att on attendance for all using (exists(select 1 from sessions s join classes c on c.id=s.class_id where s.id=session_id and c.teacher_id=auth.uid())) with check (exists(select 1 from sessions s join classes c on c.id=s.class_id where s.id=session_id and c.teacher_id=auth.uid()));
create policy student_att on attendance for select using (exists(select 1 from students s where s.id=student_id and s.profile_id=auth.uid()));
create policy student_inv on invoices for select using (exists(select 1 from students s where s.id=student_id and s.profile_id=auth.uid()));
create policy student_pay on payments for select using (exists(select 1 from invoices i join students s on s.id=i.student_id where i.id=invoice_id and s.profile_id=auth.uid()));
create policy teacher_pay on teacher_payouts for select using (teacher_id=auth.uid());
create policy teacher_rate on teacher_rates for select using (teacher_id=auth.uid());
create policy teacher_slots on availability_slots for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy open_slots on availability_slots for select using (not is_booked);
create policy student_book on bookings for all using (exists(select 1 from students s where s.id=student_id and s.profile_id=auth.uid())) with check (exists(select 1 from students s where s.id=student_id and s.profile_id=auth.uid()) and status='requested');
create policy teacher_book on bookings for select using (exists(select 1 from availability_slots a where a.id=slot_id and a.teacher_id=auth.uid()));
create policy mat_teacher on materials for all using (uploaded_by=auth.uid()) with check (uploaded_by=auth.uid());
create policy mat_student on materials for select using (exists(select 1 from enrolments e join students s on s.id=e.student_id where e.class_id=materials.class_id and s.profile_id=auth.uid()));
create policy own_notif on notifications for select using (user_id=auth.uid());
create policy public_enquiry on enquiries for insert with check (true);
create policy public_register on registrations for insert with check (status='pending');
create function public.track_registration(code text) returns table(student_name text,status text) language sql security definer set search_path=public as
 $$ select student_name,status from registrations where tracking_code=code $$;
grant execute on function public.track_registration to anon, authenticated;
