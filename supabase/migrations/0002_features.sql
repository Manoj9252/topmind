alter table profiles add column if not exists email text;
update profiles p set email=u.email from auth.users u where u.id=p.id;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as
 $$ begin insert into profiles(id,full_name,email,role) values(new.id,new.raw_user_meta_data->>'full_name',new.email,'student'); return new; end $$;

-- Public course schedules
create policy public_classes on classes for select using (kind='group');
-- Students see sessions of their classes
create policy student_sessions on sessions for select using (exists(select 1 from enrolments e join students s on s.id=e.student_id where e.class_id=sessions.class_id and s.profile_id=auth.uid()));
-- Capacity enforcement
create function public.check_capacity() returns trigger language plpgsql as $$
declare cap int; cnt int; begin
  if new.status='active' then
    select capacity into cap from classes where id=new.class_id;
    select count(*) into cnt from enrolments where class_id=new.class_id and status='active' and id is distinct from new.id;
    if cnt>=cap then raise exception 'Class is full (capacity %)', cap; end if; end if; return new; end $$;
create trigger enrol_capacity before insert or update on enrolments for each row execute function check_capacity();

-- Storage for materials (private bucket)
insert into storage.buckets(id,name,public) values('materials','materials',false) on conflict do nothing;
create policy mat_obj_write on storage.objects for insert with check (bucket_id='materials' and (is_admin() or current_role_()='teacher'));
create policy mat_obj_read on storage.objects for select using (bucket_id='materials' and (is_admin() or exists(
  select 1 from materials m where m.storage_path=name and (m.uploaded_by=auth.uid() or exists(
   select 1 from enrolments e join students s on s.id=e.student_id where e.class_id=m.class_id and s.profile_id=auth.uid())))));

-- Notifications
create function public.notify_admins(t text,b text) returns void language sql security definer set search_path=public as
 $$ insert into notifications(user_id,title,body) select id,t,b from profiles where role='admin' $$;
create function public.trg_notify() returns trigger language plpgsql security definer set search_path=public as
 $$ begin perform notify_admins(tg_argv[0],tg_argv[1]); return new; end $$;
create trigger n_reg after insert on registrations for each row execute function trg_notify('New registration','A student registration was submitted');
create trigger n_enq after insert on enquiries for each row execute function trg_notify('New enquiry','A website enquiry was received');
create trigger n_book after insert on bookings for each row execute function trg_notify('Booking request','A student requested a one-to-one lesson');
create function public.trg_student_notify() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; begin
  if tg_table_name='invoices' then select profile_id into pid from students where id=new.student_id;
  else select s.profile_id into pid from invoices i join students s on s.id=i.student_id where i.id=new.invoice_id; end if;
  if pid is not null then insert into notifications(user_id,title,body) values(pid,tg_argv[0],tg_argv[1]); end if; return new; end $$;
create trigger n_inv after insert on invoices for each row execute function trg_student_notify('New invoice','A new invoice has been issued');
create trigger n_pay after insert on payments for each row execute function trg_student_notify('Payment received','Your payment was recorded. Receipt available in Invoices.');
