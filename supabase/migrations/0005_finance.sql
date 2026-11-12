-- 0005_finance.sql
-- Invoicing with line items, numbering, adjustments and void; manual payment
-- confirmation with evidence uploads, refunds and receipt numbering; teacher
-- salary statements from verified lessons; payment gateway groundwork.
-- Every change to money goes through a checked function; nothing is deleted.

begin;

-- The 0002 notification triggers fired on any invoice or payment insert,
-- including drafts. Notifications are event-driven from 0006 onwards.
drop trigger if exists n_inv on invoices;
drop trigger if exists n_pay on payments;

insert into app_settings (key, value, category, label, description, is_public) values
  ('finance.currency', '"MYR"', 'finance', 'Currency', 'ISO currency code for new invoices.', true),
  ('finance.currency_symbol', '"RM"', 'finance', 'Currency symbol', null, true),
  ('finance.invoice_prefix', '"INV"', 'finance', 'Invoice number prefix', null, false),
  ('finance.receipt_prefix', '"RC"', 'finance', 'Receipt number prefix', null, false),
  ('finance.invoice_due_days', '7', 'finance', 'Days until an invoice is due', null, false),
  ('finance.billing_day', '1', 'finance', 'Monthly billing day', 'Day of the month the monthly invoice run happens (1-28).', false),
  ('finance.payment_instructions', '"Please pay by bank transfer or DuitNow and use your invoice number as the payment reference. You can upload your payment slip in the student portal."', 'finance', 'Payment instructions', 'Printed on every invoice.', true),
  ('finance.bank_details', '""', 'finance', 'Bank account details', 'Bank name, account name and number shown on invoices. Not set yet.', true),
  ('finance.reminder_days_before_due', '3', 'finance', 'Reminder before due date (days)', '0 turns the reminder off.', false),
  ('finance.overdue_reminder_every_days', '7', 'finance', 'Overdue reminder interval (days)', '0 turns overdue reminders off.', false),
  ('finance.allow_payment_evidence', 'true', 'finance', 'Students can upload payment slips', 'Uploaded slips wait for administrator confirmation.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Payment methods
-- ---------------------------------------------------------------------------
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  instructions text,
  requires_reference boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into payment_methods (code, name, requires_reference, is_active, sort_order) values
  ('bank_transfer', 'Bank transfer', true, true, 1),
  ('duitnow', 'DuitNow', true, true, 2),
  ('cash', 'Cash', false, true, 3),
  ('other', 'Other', false, true, 9),
  ('online_gateway', 'Online payment', true, false, 10),
  ('card', 'Card', false, false, 20),
  ('ewallet', 'E-wallet', false, false, 21),
  ('cheque', 'Cheque', false, false, 22)
on conflict (code) do nothing;
-- Older free-text methods become codes so they can reference payment_methods.
update payments set method = coalesce(nullif(trim(both '_' from regexp_replace(lower(trim(method)), '[^a-z0-9]+', '_', 'g')), ''), 'other')
where method !~ '^[a-z0-9_]+$';
insert into payment_methods (code, name, is_active, sort_order)
select distinct p.method, initcap(replace(p.method, '_', ' ')), false, 50 from payments p
where not exists (select 1 from payment_methods m where m.code = p.method)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Invoices, line items, adjustments
-- ---------------------------------------------------------------------------
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('draft', 'unpaid', 'partial', 'paid', 'void'));
alter table invoices drop constraint if exists invoices_amount_check;
alter table invoices add constraint invoices_amount_check check (amount >= 0);
alter table invoices drop constraint if exists invoices_student_id_period_description_key;
alter table invoices add column if not exists invoice_no text;
alter table invoices add column if not exists currency text not null default 'MYR';
alter table invoices add column if not exists issued_at timestamptz;
alter table invoices add column if not exists period_start date;
alter table invoices add column if not exists period_end date;
alter table invoices add column if not exists subtotal numeric(12, 2) not null default 0;
alter table invoices add column if not exists discount_total numeric(12, 2) not null default 0;
alter table invoices add column if not exists adjustment_total numeric(12, 2) not null default 0;
alter table invoices add column if not exists notes text;
alter table invoices add column if not exists payment_instructions text;
alter table invoices add column if not exists bill_to jsonb;
alter table invoices add column if not exists source text not null default 'manual';
alter table invoices drop constraint if exists invoices_source_check;
alter table invoices add constraint invoices_source_check check (source in ('manual', 'monthly_run', 'booking', 'registration', 'gateway'));
alter table invoices add column if not exists voided_at timestamptz;
alter table invoices add column if not exists void_reason text;
alter table invoices add column if not exists voided_by uuid references profiles on delete set null;
alter table invoices add column if not exists created_by uuid references profiles on delete set null;
alter table invoices add column if not exists issued_by uuid references profiles on delete set null;
alter table invoices add column if not exists last_sent_at timestamptz;
alter table invoices add column if not exists updated_at timestamptz not null default now();
create unique index if not exists invoices_invoice_no_key on invoices (invoice_no) where invoice_no is not null;
create index if not exists invoices_student_idx on invoices (student_id, created_at desc);
create index if not exists invoices_status_idx on invoices (status, due_date);
create sequence if not exists invoice_no_seq;

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete cascade,
  kind text not null default 'charge'
    check (kind in ('tuition', 'lesson', 'package', 'trial', 'booking', 'registration', 'charge', 'discount')),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null,
  amount numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  enrolment_id uuid references enrolments on delete set null,
  class_id uuid references classes on delete set null,
  booking_id uuid references bookings on delete set null,
  service_period_start date,
  service_period_end date,
  billing_key text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'discount' and unit_price <= 0) or (kind <> 'discount' and unit_price >= 0))
);
create index if not exists invoice_items_invoice_idx on invoice_items (invoice_id);
create unique index if not exists invoice_items_billing_key on invoice_items (billing_key) where billing_key is not null;

create table if not exists invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete restrict,
  kind text not null default 'credit_note' check (kind in ('credit_note', 'debit_note', 'write_off')),
  amount numeric(12, 2) not null check (amount <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

-- Existing invoices from 0001 were already issued: give them numbers and one line each.
do $$ declare r record; begin
  for r in select id, created_at from invoices where invoice_no is null and status <> 'draft' order by created_at, id loop
    update invoices set invoice_no = 'INV-' || to_char(r.created_at, 'YYYY') || '-' || lpad(nextval('invoice_no_seq')::text, 6, '0'),
      issued_at = coalesce(issued_at, r.created_at)
    where id = r.id;
  end loop;
end $$;
insert into invoice_items (invoice_id, kind, description, quantity, unit_price)
select i.id, case when i.description ilike '%fee%' then 'tuition' else 'charge' end,
       coalesce(nullif(i.description, ''), 'Fees'), 1, i.amount
from invoices i where not exists (select 1 from invoice_items it where it.invoice_id = i.id);
update invoices set subtotal = amount where subtotal = 0 and amount > 0;
update invoices set period_start = period, period_end = (period + interval '1 month - 1 day')::date
where period is not null and period_start is null;

create or replace function public.invoice_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is null or v_status = 'draft' or coalesce(current_setting('topmind.invoice_internal', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'This invoice has been issued and cannot be edited. Add an adjustment, or void it and issue a new one.';
end $$;
drop trigger if exists invoice_items_guard on invoice_items;
create trigger invoice_items_guard before insert or update or delete on invoice_items
  for each row execute function invoice_items_guard();

create or replace function public.invoice_items_totals() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_invoice uuid := coalesce(new.invoice_id, old.invoice_id); v_sub numeric; v_disc numeric;
begin
  if not exists (select 1 from invoices where id = v_invoice and status = 'draft') then return null; end if;
  select coalesce(sum(amount) filter (where kind <> 'discount'), 0), coalesce(-sum(amount) filter (where kind = 'discount'), 0)
    into v_sub, v_disc from invoice_items where invoice_id = v_invoice;
  if v_disc > v_sub then raise exception 'Discounts cannot exceed the invoice subtotal'; end if;
  update invoices set subtotal = v_sub, discount_total = v_disc, amount = v_sub - v_disc where id = v_invoice;
  return null;
end $$;
drop trigger if exists invoice_items_totals on invoice_items;
create trigger invoice_items_totals after insert or update or delete on invoice_items
  for each row execute function invoice_items_totals();

create or replace function public.invoices_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' or coalesce(current_setting('topmind.allow_delete', true), '') = 'on' then return old; end if;
    raise exception 'Issued invoices cannot be deleted. Void the invoice instead.';
  end if;
  if old.status <> 'draft' and coalesce(current_setting('topmind.invoice_internal', true), '') <> 'on' and (
       new.amount is distinct from old.amount or new.subtotal is distinct from old.subtotal
       or new.discount_total is distinct from old.discount_total or new.student_id is distinct from old.student_id
       or new.currency is distinct from old.currency or new.invoice_no is distinct from old.invoice_no
       or new.issued_at is distinct from old.issued_at) then
    raise exception 'Issued invoices cannot be changed. Add an adjustment, or void it and issue a new one.';
  end if;
  if old.status = 'void' and new.status <> 'void' then raise exception 'A void invoice cannot be reopened'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists invoices_no_delete on invoices;
drop trigger if exists invoices_guard on invoices;
create trigger invoices_guard before update or delete on invoices for each row execute function invoices_guard();

-- ---------------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------------
alter table payments alter column receipt_no drop not null;
alter table payments add column if not exists status text not null default 'confirmed';
alter table payments drop constraint if exists payments_status_check;
alter table payments add constraint payments_status_check check (status in ('pending', 'confirmed', 'rejected', 'refunded'));
alter table payments add column if not exists student_id uuid references students on delete restrict;
alter table payments add column if not exists currency text not null default 'MYR';
alter table payments add column if not exists evidence_path text;
alter table payments add column if not exists remarks text;
alter table payments add column if not exists submitted_by uuid references profiles on delete set null;
alter table payments add column if not exists confirmed_by uuid references profiles on delete set null;
alter table payments add column if not exists confirmed_at timestamptz;
alter table payments add column if not exists rejected_reason text;
alter table payments add column if not exists refunded_at timestamptz;
alter table payments add column if not exists refund_reason text;
alter table payments add column if not exists refunded_by uuid references profiles on delete set null;
alter table payments add column if not exists receipt_issued_at timestamptz;
alter table payments add column if not exists gateway text;
alter table payments add column if not exists gateway_txn_id text;
alter table payments add column if not exists updated_at timestamptz not null default now();
alter table payments drop constraint if exists payments_reference_key;
create unique index if not exists payments_reference_key on payments (lower(reference))
  where reference is not null and status in ('pending', 'confirmed');
create unique index if not exists payments_gateway_txn_key on payments (gateway, gateway_txn_id) where gateway_txn_id is not null;
create index if not exists payments_invoice_idx on payments (invoice_id);
create index if not exists payments_status_idx on payments (status, created_at desc);
update payments p set student_id = i.student_id from invoices i where i.id = p.invoice_id and p.student_id is null;
update payments set confirmed_at = coalesce(confirmed_at, created_at), receipt_issued_at = coalesce(receipt_issued_at, created_at)
where status = 'confirmed';
alter table payments drop constraint if exists payments_method_fkey;
alter table payments add constraint payments_method_fkey foreign key (method) references payment_methods (code) on update cascade;

create or replace function public.payments_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('topmind.payment_internal', true), '') <> 'on' and (
       new.amount is distinct from old.amount or new.invoice_id is distinct from old.invoice_id
       or new.receipt_no is distinct from old.receipt_no or (old.status <> 'pending' and new.status is distinct from old.status)) then
    raise exception 'Payments are changed only through confirm, reject and refund.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists payments_guard on payments;
create trigger payments_guard before update on payments for each row execute function payments_guard();

-- Recalculate an issued invoice's status from confirmed payments and adjustments.
create or replace function public.refresh_invoice_status(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices; v_paid numeric; v_adj numeric; v_due numeric; v_status text;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.status in ('draft', 'void') then return; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice and status = 'confirmed';
  select coalesce(sum(amount), 0) into v_adj from invoice_adjustments where invoice_id = p_invoice;
  v_due := inv.amount + v_adj;
  v_status := case when v_paid >= v_due then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end;
  perform set_config('topmind.invoice_internal', 'on', true);
  update invoices set status = v_status, adjustment_total = v_adj where id = p_invoice;
  perform set_config('topmind.invoice_internal', '', true);
end $$;

create or replace function public.invoice_balance(p_invoice uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(i.amount + i.adjustment_total
                  - coalesce((select sum(amount) from payments where invoice_id = i.id and status = 'confirmed'), 0), 0)
  from invoices i where i.id = p_invoice
$$;

create or replace function public.assign_receipt(p_payment uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_no text;
begin
  select receipt_no into v_no from payments where id = p_payment;
  if v_no is not null then return v_no; end if;
  v_no := setting_text('finance.receipt_prefix', 'RC') || '-' || to_char(biz_today(), 'YYYY') || '-'
          || lpad(nextval('receipt_seq')::text, 6, '0');
  perform set_config('topmind.payment_internal', 'on', true);
  update payments set receipt_no = v_no, receipt_issued_at = now() where id = p_payment;
  perform set_config('topmind.payment_internal', '', true);
  return v_no;
end $$;

-- Older invoices could have payments that never updated their status.
do $$ declare r record; begin
  for r in select id from invoices where status in ('unpaid', 'partial', 'paid') loop
    perform refresh_invoice_status(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Invoice functions
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice_internal(p_invoice uuid) returns invoices
language plpgsql security definer set search_path = public as $$
declare inv invoices; s students;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'This invoice has already been issued'; end if;
  if not exists (select 1 from invoice_items where invoice_id = p_invoice) then raise exception 'Add at least one line before issuing'; end if;
  select * into s from students where id = inv.student_id;
  update invoices set
    invoice_no = setting_text('finance.invoice_prefix', 'INV') || '-' || to_char(biz_today(), 'YYYY') || '-'
                 || lpad(nextval('invoice_no_seq')::text, 6, '0'),
    issued_at = now(), issued_by = auth.uid(),
    due_date = coalesce(due_date, biz_today() + setting_num('finance.invoice_due_days', 7)::int),
    status = case when amount = 0 then 'paid' else 'unpaid' end,
    payment_instructions = coalesce(payment_instructions, nullif(trim(setting_text('finance.payment_instructions', '') || E'\n'
                                                                      || setting_text('finance.bank_details', '')), '')),
    bill_to = jsonb_build_object('name', s.full_name, 'student_code', s.student_code, 'email', s.email, 'phone', s.phone)
  where id = p_invoice returning * into inv;
  perform emit_event('invoice.issued', 'invoice', inv.id);
  return inv;
end $$;

create or replace function public.issue_invoice(p_invoice uuid) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an administrator can issue invoices'; end if;
  return issue_invoice_internal(p_invoice);
end $$;

create or replace function public.write_invoice_items(p_invoice uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_kind text; v_n int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one invoice line'; end if;
  delete from invoice_items where invoice_id = p_invoice;
  for it in select * from jsonb_array_elements(p_items) loop
    v_kind := coalesce(nullif(it ->> 'kind', ''), 'charge');
    if v_kind not in ('tuition', 'lesson', 'package', 'trial', 'booking', 'registration', 'charge', 'discount') then
      raise exception 'Unknown invoice line type %', v_kind;
    end if;
    if coalesce(trim(it ->> 'description'), '') = '' then raise exception 'Every invoice line needs a description'; end if;
    if coalesce(it ->> 'unit_price', '') !~ '^-?\d+(\.\d+)?$' then raise exception 'Every invoice line needs a valid price'; end if;
    if coalesce(it ->> 'quantity', '1') !~ '^\d+(\.\d+)?$' or coalesce(nullif(it ->> 'quantity', '')::numeric, 1) <= 0 then
      raise exception 'Quantities must be above zero';
    end if;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, class_id, enrolment_id, sort_order)
    values (p_invoice, v_kind, trim(it ->> 'description'), coalesce(nullif(it ->> 'quantity', '')::numeric, 1),
            case when v_kind = 'discount' then -abs((it ->> 'unit_price')::numeric) else (it ->> 'unit_price')::numeric end,
            try_uuid(it ->> 'class_id'), try_uuid(it ->> 'enrolment_id'), v_n);
    v_n := v_n + 1;
  end loop;
end $$;

create or replace function public.create_invoice(p_student uuid, p_items jsonb, p_due_date date default null,
  p_period date default null, p_notes text default null, p_issue boolean default false, p_description text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if not is_admin() then raise exception 'Only an administrator can create invoices'; end if;
  if not exists (select 1 from students where id = p_student) then raise exception 'Student not found'; end if;
  insert into invoices (student_id, period, period_start, period_end, description, amount, status, due_date, notes, currency, created_by, source)
  values (p_student, month_start(coalesce(p_period, biz_today())), month_start(coalesce(p_period, biz_today())),
          (month_start(coalesce(p_period, biz_today())) + interval '1 month - 1 day')::date,
          coalesce(nullif(trim(p_description), ''), 'Fees'), 0, 'draft', p_due_date, p_notes,
          setting_text('finance.currency', 'MYR'), auth.uid(), 'manual')
  returning * into inv;
  perform write_invoice_items(inv.id, p_items);
  if p_issue then return issue_invoice_internal(inv.id); end if;
  select * into inv from invoices where id = inv.id;
  return inv;
end $$;

create or replace function public.update_draft_invoice(p_invoice uuid, p_items jsonb, p_due_date date default null,
  p_notes text default null, p_description text default null) returns invoices
language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if not is_admin() then raise exception 'Only an administrator can edit invoices'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.status <> 'draft' then raise exception 'Only draft invoices can be edited'; end if;
  perform write_invoice_items(p_invoice, p_items);
  update invoices set due_date = p_due_date, notes = p_notes, description = coalesce(nullif(trim(p_description), ''), description)
  where id = p_invoice returning * into inv;
  return inv;
end $$;

create or replace function public.discard_draft_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an administrator can discard invoices'; end if;
  delete from invoices where id = p_invoice and status = 'draft';
  if not found then raise exception 'Only draft invoices can be discarded'; end if;
end $$;

create or replace function public.set_invoice_due_date(p_invoice uuid, p_due_date date) returns invoices
language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if not is_admin() then raise exception 'Only an administrator can change due dates'; end if;
  update invoices set due_date = p_due_date where id = p_invoice and status in ('draft', 'unpaid', 'partial') returning * into inv;
  if not found then raise exception 'The due date of a paid or void invoice cannot be changed'; end if;
  return inv;
end $$;

create or replace function public.void_invoice(p_invoice uuid, p_reason text) returns invoices
language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if not is_admin() then raise exception 'Only an administrator can void invoices'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record a reason for voiding the invoice'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status = 'void' then raise exception 'This invoice is already void'; end if;
  if inv.status = 'draft' then raise exception 'Discard a draft instead of voiding it'; end if;
  if exists (select 1 from payments where invoice_id = p_invoice and status = 'pending') then
    raise exception 'Confirm or reject the pending payments on this invoice first';
  end if;
  if exists (select 1 from payments where invoice_id = p_invoice and status = 'confirmed') then
    raise exception 'This invoice has confirmed payments. Refund them before voiding.';
  end if;
  perform set_config('topmind.invoice_internal', 'on', true);
  update invoice_items set billing_key = null where invoice_id = p_invoice;  -- frees the period to be billed again
  update invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
  where id = p_invoice returning * into inv;
  perform set_config('topmind.invoice_internal', '', true);
  perform emit_event('invoice.voided', 'invoice', inv.id);
  return inv;
end $$;

create or replace function public.add_invoice_adjustment(p_invoice uuid, p_amount numeric, p_reason text,
  p_kind text default 'credit_note') returns invoice_adjustments
language plpgsql security definer set search_path = public as $$
declare inv invoices; adj invoice_adjustments; v_paid numeric; v_due_after numeric;
begin
  if not is_admin() then raise exception 'Only an administrator can adjust invoices'; end if;
  if p_kind not in ('credit_note', 'debit_note', 'write_off') then raise exception 'Unknown adjustment type'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Enter a non-zero amount'; end if;
  if p_kind in ('credit_note', 'write_off') and p_amount > 0 then p_amount := -p_amount; end if;
  if p_kind = 'debit_note' and p_amount < 0 then p_amount := -p_amount; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.status not in ('unpaid', 'partial', 'paid') then raise exception 'Only issued invoices can be adjusted'; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice and status = 'confirmed';
  v_due_after := inv.amount + inv.adjustment_total + p_amount;
  if v_due_after < 0 then raise exception 'The adjustment would make the invoice total negative'; end if;
  if v_due_after < v_paid then raise exception 'The credit is larger than the unpaid balance. Refund a payment instead.'; end if;
  insert into invoice_adjustments (invoice_id, kind, amount, reason, created_by)
  values (p_invoice, p_kind, p_amount, p_reason, auth.uid()) returning * into adj;
  perform refresh_invoice_status(p_invoice);
  perform emit_event('invoice.adjusted', 'invoice', p_invoice);
  return adj;
end $$;

-- Hook for extra monthly billing lines (one-to-one bookings are added in 0006).
create or replace function public.collect_extra_billing(p_period date) returns void
language plpgsql as $$ begin null; end $$;

-- Monthly run: tuition for the month in advance, per-lesson charges for lessons
-- attended last month, plus anything collect_extra_billing adds. Repeat-safe:
-- every line carries a billing key that can be billed only once.
create or replace function public.generate_monthly_invoices(p_period date default null, p_issue boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_period date := month_start(coalesce(p_period, biz_today()));
  v_end date := (month_start(coalesce(p_period, biz_today())) + interval '1 month - 1 day')::date;
  v_prev date := (month_start(coalesce(p_period, biz_today())) - interval '1 month')::date;
  v_issue boolean := coalesce(p_issue, setting_bool('automation.monthly_invoices_auto_issue', true));
  v_label text := to_char(month_start(coalesce(p_period, biz_today())), 'FMMonth YYYY');
  r record; v_invoice uuid; n int; v_items int := 0; v_invoices int := 0;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can generate invoices'; end if;
  perform pg_advisory_xact_lock(hashtextextended('monthly-invoices', 0));

  create temp table if not exists _billing (student_id uuid, kind text, description text, quantity numeric, unit_price numeric,
    enrolment_id uuid, class_id uuid, booking_id uuid, service_start date, service_end date, billing_key text) on commit drop;
  truncate _billing;

  insert into _billing
  select e.student_id, 'tuition', c.name || ' tuition, ' || v_label, 1, coalesce(e.fee_override, c.fee), e.id, c.id, null,
         greatest(v_period, e.start_date), least(v_end, coalesce(e.end_date, v_end)),
         'tuition:' || e.id || ':' || to_char(v_period, 'YYYY-MM')
  from enrolments e join classes c on c.id = e.class_id
  where e.status = 'active' and c.billing_frequency = 'monthly' and c.status in ('active', 'draft')
    and coalesce(e.fee_override, c.fee) > 0 and e.start_date <= v_end and (e.end_date is null or e.end_date >= v_period);

  insert into _billing
  select b.student_id, 'discount', 'Discount ' || trim(to_char(e.discount_percent, 'FM990.##')) || '% on ' || c.name, 1,
         -round(b.unit_price * e.discount_percent / 100, 2), e.id, c.id, null, b.service_start, b.service_end,
         'discount:' || e.id || ':' || to_char(v_period, 'YYYY-MM')
  from _billing b join enrolments e on e.id = b.enrolment_id join classes c on c.id = e.class_id
  where b.kind = 'tuition' and e.discount_percent > 0;

  insert into _billing
  select e.student_id, 'lesson', c.name || ' lessons attended, ' || to_char(v_prev, 'FMMonth YYYY'), count(*),
         coalesce(e.fee_override, c.fee), e.id, c.id, null, v_prev, v_period - 1,
         'lessons:' || e.id || ':' || to_char(v_prev, 'YYYY-MM')
  from enrolments e
  join classes c on c.id = e.class_id
  join sessions s on s.class_id = c.id and s.status = 'completed' and s.session_date >= v_prev and s.session_date < v_period
  join attendance a on a.session_id = s.id and a.student_id = e.student_id and a.status in ('present', 'late')
  where c.billing_frequency = 'per_lesson' and coalesce(e.fee_override, c.fee) > 0
    and e.start_date <= s.session_date and (e.end_date is null or e.end_date >= s.session_date)
  group by e.student_id, e.id, c.id, c.name, e.fee_override, c.fee;

  perform collect_extra_billing(v_period);

  delete from _billing b where exists (select 1 from invoice_items i where i.billing_key = b.billing_key);
  delete from _billing d where d.kind = 'discount'
    and not exists (select 1 from _billing t where t.kind = 'tuition' and t.enrolment_id = d.enrolment_id);

  for r in select distinct b.student_id from _billing b join students s on s.id = b.student_id order by 1 loop
    insert into invoices (student_id, period, period_start, period_end, description, amount, status, source, currency, created_by)
    values (r.student_id, v_period, v_period, v_end, 'Fees for ' || v_label, 0, 'draft', 'monthly_run',
            setting_text('finance.currency', 'MYR'), auth.uid())
    returning id into v_invoice;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, enrolment_id, class_id, booking_id,
                               service_period_start, service_period_end, billing_key, sort_order)
    select v_invoice, kind, description, quantity, unit_price, enrolment_id, class_id, booking_id, service_start, service_end, billing_key,
           row_number() over (order by kind = 'discount', description)
    from _billing where student_id = r.student_id;
    get diagnostics n = row_count;
    v_items := v_items + n;
    v_invoices := v_invoices + 1;
    if v_issue then perform issue_invoice_internal(v_invoice); end if;
  end loop;
  return jsonb_build_object('period', v_period, 'invoices_created', v_invoices, 'lines_created', v_items, 'issued', v_issue);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Payment functions
-- ---------------------------------------------------------------------------
create or replace function public.check_payment_method(p_method text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from payment_methods where code = p_method and is_active) then
    raise exception 'Choose an active payment method';
  end if;
end $$;

drop function if exists public.record_payment(uuid, numeric, text, text);
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text default null,
  p_paid_on date default null, p_remarks text default null) returns payments
language plpgsql security definer set search_path = public as $$
declare inv invoices; pay payments; v_balance numeric;
begin
  if not is_admin() then raise exception 'Only an administrator can record payments'; end if;
  perform check_payment_method(p_method);
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount above zero'; end if;
  if (select requires_reference from payment_methods where code = p_method) and coalesce(trim(p_ref), '') = '' then
    raise exception 'This payment method needs a transaction reference';
  end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status not in ('unpaid', 'partial') then raise exception 'Payments can only be recorded on unpaid or partly paid invoices'; end if;
  v_balance := invoice_balance(p_invoice);
  if p_amount > v_balance then raise exception 'Overpayment: the outstanding balance is %', v_balance; end if;
  insert into payments (invoice_id, student_id, amount, method, reference, paid_on, remarks, status, currency,
                        submitted_by, confirmed_by, confirmed_at)
  values (p_invoice, inv.student_id, p_amount, p_method, nullif(trim(p_ref), ''), coalesce(p_paid_on, biz_today()),
          p_remarks, 'confirmed', inv.currency, auth.uid(), auth.uid(), now())
  returning * into pay;
  perform assign_receipt(pay.id);
  perform refresh_invoice_status(p_invoice);
  perform emit_event('payment.confirmed', 'payment', pay.id);
  select * into pay from payments where id = pay.id;
  return pay;
end $$;

create or replace function public.submit_payment(p_invoice uuid, p_amount numeric, p_method text, p_ref text default null,
  p_paid_on date default null, p_evidence_path text default null, p_remarks text default null) returns payments
language plpgsql security definer set search_path = public as $$
declare inv invoices; pay payments;
begin
  if not (is_admin() or is_my_invoice(p_invoice)) then raise exception 'You can only pay your own invoices'; end if;
  if not is_admin() and not setting_bool('finance.allow_payment_evidence', true) then
    raise exception 'Online payment slips are not being accepted. Please contact the academy.';
  end if;
  perform check_payment_method(p_method);
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount above zero'; end if;
  if (select requires_reference from payment_methods where code = p_method) and coalesce(trim(p_ref), '') = '' then
    raise exception 'Please enter the transaction reference from your bank or DuitNow receipt';
  end if;
  select * into inv from invoices where id = p_invoice for update;
  if inv.status not in ('unpaid', 'partial') then raise exception 'This invoice is not awaiting payment'; end if;
  if p_amount > invoice_balance(p_invoice) then raise exception 'The amount is more than the outstanding balance of %', invoice_balance(p_invoice); end if;
  if p_evidence_path is not null and not is_admin()
     and split_part(p_evidence_path, '/', 1) is distinct from inv.student_id::text then
    raise exception 'Upload the payment slip to your own folder';
  end if;
  insert into payments (invoice_id, student_id, amount, method, reference, paid_on, evidence_path, remarks, status, currency, submitted_by)
  values (p_invoice, inv.student_id, p_amount, p_method, nullif(trim(p_ref), ''), coalesce(p_paid_on, biz_today()),
          p_evidence_path, left(p_remarks, 1000), 'pending', inv.currency, auth.uid())
  returning * into pay;
  perform emit_event('payment.submitted', 'payment', pay.id);
  return pay;
end $$;

create or replace function public.confirm_payment(p_payment uuid) returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments; inv invoices;
begin
  if not is_admin() then raise exception 'Only an administrator can confirm payments'; end if;
  select * into pay from payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if pay.status <> 'pending' then raise exception 'Only pending payments can be confirmed (this one is %)', pay.status; end if;
  select * into inv from invoices where id = pay.invoice_id for update;
  if inv.status not in ('unpaid', 'partial') then raise exception 'The invoice is no longer awaiting payment'; end if;
  if pay.amount > invoice_balance(pay.invoice_id) then
    raise exception 'Confirming this would overpay the invoice (outstanding %)', invoice_balance(pay.invoice_id);
  end if;
  perform set_config('topmind.payment_internal', 'on', true);
  update payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment;
  perform set_config('topmind.payment_internal', '', true);
  perform assign_receipt(p_payment);
  perform refresh_invoice_status(pay.invoice_id);
  perform emit_event('payment.confirmed', 'payment', p_payment);
  select * into pay from payments where id = p_payment;
  return pay;
end $$;

create or replace function public.reject_payment(p_payment uuid, p_reason text) returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  if not is_admin() then raise exception 'Only an administrator can reject payments'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please tell the student why the payment was rejected'; end if;
  update payments set status = 'rejected', rejected_reason = p_reason, confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_payment and status = 'pending' returning * into pay;
  if not found then raise exception 'Only pending payments can be rejected'; end if;
  perform emit_event('payment.rejected', 'payment', p_payment);
  return pay;
end $$;

create or replace function public.refund_payment(p_payment uuid, p_reason text) returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  if not is_admin() then raise exception 'Only an administrator can refund payments'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record a reason for the refund'; end if;
  select * into pay from payments where id = p_payment for update;
  if not found or pay.status <> 'confirmed' then raise exception 'Only confirmed payments can be refunded'; end if;
  perform set_config('topmind.payment_internal', 'on', true);
  update payments set status = 'refunded', refunded_at = now(), refunded_by = auth.uid(), refund_reason = p_reason
  where id = p_payment returning * into pay;
  perform set_config('topmind.payment_internal', '', true);
  perform refresh_invoice_status(pay.invoice_id);
  perform emit_event('payment.refunded', 'payment', p_payment);
  return pay;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Documents (data for invoice and receipt PDFs)
-- ---------------------------------------------------------------------------
create or replace function public.business_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', setting_text('business.name'), 'email', setting_text('business.email'),
    'phone', setting_text('business.phone'), 'address', setting_text('business.address', ''),
    'registration_no', setting_text('business.registration_no', ''), 'website', setting_text('business.website', ''),
    'currency_symbol', setting_text('finance.currency_symbol', 'RM'))
$$;

create or replace function public.invoice_document(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (is_admin() or (is_my_invoice(p_invoice) and (select status from invoices where id = p_invoice) <> 'draft')) then
    raise exception 'Invoice not found';
  end if;
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'bill_to',
    'bill_to', coalesce(i.bill_to, jsonb_build_object('name', s.full_name, 'student_code', s.student_code, 'email', s.email, 'phone', s.phone)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', it.kind, 'description', it.description, 'quantity', it.quantity,
               'unit_price', it.unit_price, 'amount', it.amount) order by it.sort_order, it.created_at), '[]') from invoice_items it where it.invoice_id = i.id),
    'adjustments', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'amount', a.amount, 'reason', a.reason,
               'date', (a.created_at at time zone biz_tz())::date) order by a.created_at), '[]') from invoice_adjustments a where a.invoice_id = i.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('receipt_no', p.receipt_no, 'paid_on', p.paid_on, 'method',
               (select name from payment_methods where code = p.method), 'amount', p.amount) order by p.paid_on), '[]')
               from payments p where p.invoice_id = i.id and p.status = 'confirmed'),
    'amount_due', i.amount + i.adjustment_total,
    'amount_paid', coalesce((select sum(amount) from payments where invoice_id = i.id and status = 'confirmed'), 0),
    'balance', invoice_balance(i.id),
    'is_overdue', i.status in ('unpaid', 'partial') and i.due_date < biz_today(),
    'business', business_details())
  into v
  from invoices i join students s on s.id = i.student_id
  where i.id = p_invoice;
  return v;
end $$;

create or replace function public.receipt_document(p_payment uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (is_admin() or exists (select 1 from payments where id = p_payment and is_my_invoice(invoice_id))) then
    raise exception 'Receipt not found';
  end if;
  select jsonb_build_object(
    'receipt_no', p.receipt_no, 'issued_at', p.receipt_issued_at, 'paid_on', p.paid_on, 'amount', p.amount, 'currency', p.currency,
    'status', p.status, 'method', (select name from payment_methods where code = p.method), 'reference', p.reference,
    'invoice_no', i.invoice_no, 'invoice_description', i.description, 'period_start', i.period_start, 'period_end', i.period_end,
    'classes', (select string_agg(distinct c.name, ', ') from invoice_items it join classes c on c.id = it.class_id where it.invoice_id = i.id),
    'student', jsonb_build_object('name', s.full_name, 'student_code', s.student_code, 'email', s.email),
    'balance_after', invoice_balance(i.id),
    'refunded_at', p.refunded_at,
    'business', business_details())
  into v
  from payments p join invoices i on i.id = p.invoice_id join students s on s.id = i.student_id
  where p.id = p_payment and p.receipt_no is not null;
  if v is null then raise exception 'No receipt has been issued for this payment yet'; end if;
  return v;
end $$;

create or replace view public.invoice_overview with (security_invoker = true) as
select i.id, i.invoice_no, i.student_id, s.full_name as student_name, s.student_code, i.description, i.period, i.period_start,
  i.period_end, i.status, i.source, i.currency, i.subtotal, i.discount_total, i.adjustment_total, i.amount,
  i.amount + i.adjustment_total as amount_due,
  coalesce(p.paid, 0) as amount_paid,
  greatest(i.amount + i.adjustment_total - coalesce(p.paid, 0), 0) as balance,
  coalesce(p.pending, 0) as pending_count,
  i.due_date, i.issued_at, i.created_at, i.voided_at, i.void_reason, i.last_sent_at,
  (i.status in ('unpaid', 'partial') and i.due_date < biz_today()) as is_overdue,
  case when i.status in ('unpaid', 'partial') and i.due_date < biz_today() then 'overdue' else i.status end as display_status
from invoices i
left join students s on s.id = i.student_id
left join lateral (select sum(amount) filter (where status = 'confirmed') as paid,
                          count(*) filter (where status = 'pending') as pending
                   from payments where invoice_id = i.id) p on true;

-- ---------------------------------------------------------------------------
-- 7. Payment evidence storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists evidence_insert on storage.objects;
create policy evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-evidence' and ((select is_admin()) or (storage.foldername(name))[1] = (select my_student_id())::text));
drop policy if exists evidence_read on storage.objects;
create policy evidence_read on storage.objects for select to authenticated using (
  bucket_id = 'payment-evidence' and ((select is_admin()) or (storage.foldername(name))[1] = (select my_student_id())::text));

-- ---------------------------------------------------------------------------
-- 8. Teacher pay
-- ---------------------------------------------------------------------------
alter table teacher_rates drop constraint if exists teacher_rates_basis_check;
alter table teacher_rates add constraint teacher_rates_basis_check
  check (basis in ('hourly', 'monthly', 'per_lesson', 'per_student', 'custom'));
alter table teacher_rates drop constraint if exists teacher_rates_rate_check;
alter table teacher_rates add constraint teacher_rates_rate_check check (rate >= 0);
alter table teacher_rates add column if not exists applies_to text not null default 'all';
alter table teacher_rates drop constraint if exists teacher_rates_applies_to_check;
alter table teacher_rates add constraint teacher_rates_applies_to_check check (applies_to in ('all', 'group', 'one_to_one'));
alter table teacher_rates add column if not exists effective_from date not null default date '2000-01-01';
alter table teacher_rates add column if not exists effective_to date;
alter table teacher_rates add column if not exists notes text;
alter table teacher_rates add column if not exists created_at timestamptz not null default now();
alter table teacher_rates drop constraint if exists teacher_rates_dates_check;
alter table teacher_rates add constraint teacher_rates_dates_check check (effective_to is null or effective_to >= effective_from);
comment on table teacher_rates is 'Teacher payment arrangements. per_student pays per distinct student who attended the teacher''s lessons in the month.';

alter table teacher_payouts add column if not exists period_start date;
alter table teacher_payouts add column if not exists period_end date;
alter table teacher_payouts add column if not exists lessons_completed int not null default 0;
alter table teacher_payouts add column if not exists hours numeric(8, 2) not null default 0;
alter table teacher_payouts add column if not exists students_count int not null default 0;
alter table teacher_payouts add column if not exists base_amount numeric(12, 2) not null default 0;
alter table teacher_payouts add column if not exists additions numeric(12, 2) not null default 0;
alter table teacher_payouts add column if not exists deductions numeric(12, 2) not null default 0;
alter table teacher_payouts add column if not exists amount_paid numeric(12, 2) not null default 0;
alter table teacher_payouts add column if not exists breakdown jsonb;
alter table teacher_payouts add column if not exists notes text;
alter table teacher_payouts add column if not exists approved_by uuid references profiles on delete set null;
alter table teacher_payouts add column if not exists approved_at timestamptz;
alter table teacher_payouts add column if not exists void_reason text;
alter table teacher_payouts add column if not exists created_at timestamptz not null default now();
alter table teacher_payouts add column if not exists updated_at timestamptz not null default now();
-- Payouts created before statements existed were already agreed: approved or paid.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'teacher_payouts' and column_name = 'status') then
    alter table teacher_payouts add column status text not null default 'draft';
    update teacher_payouts set status = case when paid then 'paid' else 'approved' end, base_amount = coalesce(amount, 0),
      amount_paid = case when paid then coalesce(amount, 0) else 0 end, period = month_start(period),
      period_start = month_start(period), period_end = (month_start(period) + interval '1 month - 1 day')::date
    where period is not null;
  end if;
end $$;
alter table teacher_payouts drop constraint if exists teacher_payouts_status_check;
alter table teacher_payouts add constraint teacher_payouts_status_check
  check (status in ('draft', 'approved', 'partially_paid', 'paid', 'void'));
do $$ begin
  if not exists (select 1 from teacher_payouts where status <> 'void' group by teacher_id, period having count(*) > 1) then
    create unique index if not exists teacher_payouts_period_key on teacher_payouts (teacher_id, period) where status <> 'void';
  else
    raise notice 'teacher_payouts_period_key not created: several payouts exist for one teacher and month.';
  end if;
end $$;

create table if not exists teacher_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references teacher_payouts on delete cascade,
  kind text not null check (kind in ('addition', 'deduction')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists teacher_payout_payments (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references teacher_payouts on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text,
  reference text,
  notes text,
  recorded_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
insert into teacher_payout_payments (payout_id, amount, paid_on, notes)
select id, amount, coalesce(paid_on, biz_today()), 'Recorded before salary statements were introduced'
from teacher_payouts p where paid and amount > 0 and not exists (select 1 from teacher_payout_payments x where x.payout_id = p.id);

create or replace function public.refresh_payout(p_payout uuid) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare t teacher_payouts; v_add numeric; v_ded numeric; v_paid numeric; v_last date;
begin
  select coalesce(sum(amount) filter (where kind = 'addition'), 0), coalesce(sum(amount) filter (where kind = 'deduction'), 0)
    into v_add, v_ded from teacher_payout_items where payout_id = p_payout;
  select coalesce(sum(amount), 0), max(paid_on) into v_paid, v_last from teacher_payout_payments where payout_id = p_payout;
  update teacher_payouts set additions = v_add, deductions = v_ded, amount = greatest(base_amount + v_add - v_ded, 0),
    amount_paid = v_paid,
    status = case when status in ('draft', 'void') then status
                  when v_paid >= greatest(base_amount + v_add - v_ded, 0) and v_paid > 0 then 'paid'
                  when v_paid > 0 then 'partially_paid' else 'approved' end,
    paid = v_paid > 0 and v_paid >= greatest(base_amount + v_add - v_ded, 0), paid_on = v_last, updated_at = now()
  where id = p_payout returning * into t;
  return t;
end $$;

-- Earnings for one teacher and month, from completed lessons only.
create or replace function public.calculate_teacher_pay(p_teacher uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := month_start(p_month);
  v_end date := (month_start(p_month) + interval '1 month - 1 day')::date;
  r teacher_rates; v_lines jsonb := '[]'; v_base numeric := 0; v_qty numeric; v_amount numeric;
  v_lessons int; v_hours numeric; v_students int;
begin
  if not (is_admin() or is_trusted_context() or (p_teacher = auth.uid() and is_teacher())) then
    raise exception 'You can only see your own earnings';
  end if;
  select count(*), coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600), 0) into v_lessons, v_hours
  from sessions where teacher_id = p_teacher and status = 'completed' and session_date between v_start and v_end;
  select count(distinct a.student_id) into v_students
  from sessions s join attendance a on a.session_id = s.id and a.status in ('present', 'late')
  where s.teacher_id = p_teacher and s.status = 'completed' and s.session_date between v_start and v_end;
  for r in select * from teacher_rates where teacher_id = p_teacher and effective_from <= v_end
             and (effective_to is null or effective_to >= v_start) order by effective_from loop
    with scope as (
      select s.id, s.starts_at, s.ends_at from sessions s left join classes c on c.id = s.class_id
      where s.teacher_id = p_teacher and s.status = 'completed'
        and s.session_date between greatest(v_start, r.effective_from) and least(v_end, coalesce(r.effective_to, v_end))
        and (r.applies_to = 'all' or (r.applies_to = 'one_to_one') = (s.booking_id is not null or c.kind = 'one_to_one'))
    )
    select case r.basis
      when 'hourly' then (select coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600), 0) from scope)
      when 'per_lesson' then (select count(*) from scope)
      when 'per_student' then (select count(distinct a.student_id) from scope join attendance a on a.session_id = scope.id
                                and a.status in ('present', 'late'))
      when 'monthly' then 1
      else 0 end
    into v_qty;
    v_amount := round(v_qty * r.rate, 2);
    v_base := v_base + v_amount;
    v_lines := v_lines || jsonb_build_object('rate_id', r.id, 'basis', r.basis, 'applies_to', r.applies_to,
                 'rate', r.rate, 'quantity', round(v_qty, 2), 'amount', v_amount);
  end loop;
  return jsonb_build_object('teacher_id', p_teacher, 'month', v_start, 'lessons', v_lessons, 'hours', round(v_hours, 2),
    'students', v_students, 'base_amount', v_base, 'lines', v_lines,
    'missing_attendance', (select count(*) from sessions where teacher_id = p_teacher and status = 'scheduled'
                            and session_date between v_start and least(v_end, biz_today() - 1)));
end $$;

create or replace function public.generate_salary_statements(p_month date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_start date := month_start(coalesce(p_month, (biz_today() - interval '1 month')::date));
  r record; c jsonb; t teacher_payouts; v_created int := 0; v_updated int := 0; v_skipped int := 0;
begin
  if not (is_admin() or is_trusted_context()) then raise exception 'Only an administrator can prepare salary statements'; end if;
  for r in
    select p.id from profiles p where p.role = 'teacher' and (
      exists (select 1 from teacher_rates tr where tr.teacher_id = p.id and tr.effective_from <= (v_start + interval '1 month - 1 day')::date
              and (tr.effective_to is null or tr.effective_to >= v_start))
      or exists (select 1 from sessions s where s.teacher_id = p.id and s.status = 'completed'
                 and s.session_date between v_start and (v_start + interval '1 month - 1 day')::date))
  loop
    c := calculate_teacher_pay(r.id, v_start);
    select * into t from teacher_payouts where teacher_id = r.id and period = v_start and status <> 'void' for update;
    if not found then
      insert into teacher_payouts (teacher_id, period, period_start, period_end, status, lessons_completed, hours, students_count,
                                   base_amount, amount, breakdown)
      values (r.id, v_start, v_start, (v_start + interval '1 month - 1 day')::date, 'draft', (c ->> 'lessons')::int,
              (c ->> 'hours')::numeric, (c ->> 'students')::int, (c ->> 'base_amount')::numeric, (c ->> 'base_amount')::numeric, c)
      returning * into t;
      v_created := v_created + 1;
    elsif t.status = 'draft' then
      update teacher_payouts set lessons_completed = (c ->> 'lessons')::int, hours = (c ->> 'hours')::numeric,
        students_count = (c ->> 'students')::int, base_amount = (c ->> 'base_amount')::numeric, breakdown = c
      where id = t.id;
      v_updated := v_updated + 1;
    else
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform refresh_payout(t.id);
  end loop;
  return jsonb_build_object('month', v_start, 'created', v_created, 'recalculated', v_updated, 'already_approved', v_skipped);
end $$;

create or replace function public.approve_salary_statement(p_payout uuid) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare t teacher_payouts;
begin
  if not is_admin() then raise exception 'Only an administrator can approve salary statements'; end if;
  update teacher_payouts set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_payout and status = 'draft' returning * into t;
  if not found then raise exception 'Only draft statements can be approved'; end if;
  t := refresh_payout(p_payout);
  perform emit_event('salary.approved', 'teacher_payout', p_payout);
  return t;
end $$;

create or replace function public.reopen_salary_statement(p_payout uuid) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare t teacher_payouts;
begin
  if not is_admin() then raise exception 'Only an administrator can reopen salary statements'; end if;
  if exists (select 1 from teacher_payout_payments where payout_id = p_payout) then
    raise exception 'Payments have been recorded against this statement, so it cannot be reopened';
  end if;
  update teacher_payouts set status = 'draft', approved_by = null, approved_at = null
  where id = p_payout and status = 'approved' returning * into t;
  if not found then raise exception 'Only approved statements can be reopened'; end if;
  return t;
end $$;

create or replace function public.add_salary_item(p_payout uuid, p_kind text, p_description text, p_amount numeric)
returns teacher_payouts language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an administrator can adjust salary statements'; end if;
  if not exists (select 1 from teacher_payouts where id = p_payout and status = 'draft') then
    raise exception 'Additions and deductions can only be changed on draft statements';
  end if;
  insert into teacher_payout_items (payout_id, kind, description, amount, created_by)
  values (p_payout, p_kind, p_description, p_amount, auth.uid());
  return refresh_payout(p_payout);
end $$;

create or replace function public.remove_salary_item(p_item uuid) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare v_payout uuid;
begin
  if not is_admin() then raise exception 'Only an administrator can adjust salary statements'; end if;
  delete from teacher_payout_items i using teacher_payouts t
  where i.id = p_item and t.id = i.payout_id and t.status = 'draft' returning i.payout_id into v_payout;
  if v_payout is null then raise exception 'Only items on draft statements can be removed'; end if;
  return refresh_payout(v_payout);
end $$;

create or replace function public.record_salary_payment(p_payout uuid, p_amount numeric, p_paid_on date default null,
  p_method text default null, p_reference text default null, p_notes text default null) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare t teacher_payouts;
begin
  if not is_admin() then raise exception 'Only an administrator can record salary payments'; end if;
  select * into t from teacher_payouts where id = p_payout for update;
  if not found or t.status not in ('approved', 'partially_paid') then
    raise exception 'Approve the statement before recording payments';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount above zero'; end if;
  if p_amount > t.amount - t.amount_paid then raise exception 'That is more than the outstanding % ', t.amount - t.amount_paid; end if;
  insert into teacher_payout_payments (payout_id, amount, paid_on, method, reference, notes, recorded_by)
  values (p_payout, p_amount, coalesce(p_paid_on, biz_today()), p_method, nullif(trim(p_reference), ''), p_notes, auth.uid());
  t := refresh_payout(p_payout);
  perform emit_event('salary.paid', 'teacher_payout', p_payout);
  return t;
end $$;

create or replace function public.void_salary_statement(p_payout uuid, p_reason text) returns teacher_payouts
language plpgsql security definer set search_path = public as $$
declare t teacher_payouts;
begin
  if not is_admin() then raise exception 'Only an administrator can void salary statements'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please record a reason'; end if;
  if exists (select 1 from teacher_payout_payments where payout_id = p_payout) then
    raise exception 'Payments have been recorded against this statement, so it cannot be voided';
  end if;
  update teacher_payouts set status = 'void', void_reason = p_reason where id = p_payout and status in ('draft', 'approved')
  returning * into t;
  if not found then raise exception 'This statement cannot be voided'; end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Online payment gateway groundwork (no provider connected yet)
-- ---------------------------------------------------------------------------
create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete restrict,
  provider text not null,
  external_id text,
  url text,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'paid', 'expired', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz,
  unique (provider, external_id)
);
create table if not exists payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  signature_valid boolean not null default false,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed', 'duplicate')),
  error text,
  payment_id uuid references payments on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- Called only by the payment-webhook Edge Function after it has verified the
-- provider's signature. A browser redirect never confirms a payment.
create or replace function public.apply_gateway_payment(p_provider text, p_event_id text, p_event_type text,
  p_external_id text, p_amount numeric, p_txn_id text, p_paid_at timestamptz, p_payload jsonb, p_signature_valid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev payment_gateway_events; lk payment_links; inv invoices; pay payments;
begin
  if not is_trusted_context() then raise exception 'Only the payment webhook can apply gateway payments'; end if;
  insert into payment_gateway_events (provider, event_id, event_type, signature_valid, payload)
  values (p_provider, p_event_id, p_event_type, p_signature_valid, p_payload)
  on conflict (provider, event_id) do nothing returning * into ev;
  if ev.id is null then return jsonb_build_object('status', 'duplicate'); end if;
  if not p_signature_valid then
    update payment_gateway_events set status = 'failed', error = 'Invalid signature', processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid signature');
  end if;
  select * into lk from payment_links where provider = p_provider and external_id = p_external_id for update;
  if not found then
    update payment_gateway_events set status = 'ignored', error = 'Unknown payment link', processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'ignored');
  end if;
  if exists (select 1 from payments where gateway = p_provider and gateway_txn_id = p_txn_id) then
    update payment_gateway_events set status = 'duplicate', processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'duplicate');
  end if;
  select * into inv from invoices where id = lk.invoice_id for update;
  if p_amount <= 0 or p_amount > invoice_balance(inv.id) then
    update payment_gateway_events set status = 'failed', error = 'Amount does not match the outstanding balance', processed_at = now()
    where id = ev.id;
    return jsonb_build_object('status', 'failed', 'reason', 'amount mismatch');
  end if;
  insert into payments (invoice_id, student_id, amount, method, reference, paid_on, status, currency, gateway, gateway_txn_id, confirmed_at)
  values (inv.id, inv.student_id, p_amount, 'online_gateway', p_txn_id, (coalesce(p_paid_at, now()) at time zone biz_tz())::date,
          'confirmed', inv.currency, p_provider, p_txn_id, now())
  returning * into pay;
  perform assign_receipt(pay.id);
  perform refresh_invoice_status(inv.id);
  update payment_links set status = 'paid', paid_at = coalesce(p_paid_at, now()) where id = lk.id;
  update payment_gateway_events set status = 'processed', processed_at = now(), payment_id = pay.id where id = ev.id;
  perform emit_event('payment.confirmed', 'payment', pay.id);
  return jsonb_build_object('status', 'processed', 'payment_id', pay.id);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Policies, auditing, grants
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['payment_methods', 'invoice_items', 'invoice_adjustments', 'teacher_payout_items',
                           'teacher_payout_payments', 'payment_links', 'payment_gateway_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_read on %I for select to authenticated using ((select is_admin()))', t);
  end loop;
end $$;
create policy admin_write on payment_methods for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy members_read on payment_methods for select to authenticated using (is_active);
create policy own_items on invoice_items for select to authenticated using (
  exists (select 1 from invoices i where i.id = invoice_id and i.status <> 'draft' and is_my_student(i.student_id)));
create policy own_adjustments on invoice_adjustments for select to authenticated using (is_my_invoice(invoice_id));
create policy own_payout_items on teacher_payout_items for select to authenticated using ((select is_teacher()) and
  exists (select 1 from teacher_payouts t where t.id = payout_id and t.teacher_id = (select auth.uid()) and t.status <> 'draft'));
create policy own_payout_payments on teacher_payout_payments for select to authenticated using ((select is_teacher()) and
  exists (select 1 from teacher_payouts t where t.id = payout_id and t.teacher_id = (select auth.uid())));
drop policy if exists own_payouts on teacher_payouts;
create policy own_payouts on teacher_payouts for select to authenticated
  using (teacher_id = (select auth.uid()) and (select is_teacher()) and status in ('approved', 'partially_paid', 'paid'));

drop trigger if exists invoice_adjustments_no_delete on invoice_adjustments;
create trigger invoice_adjustments_no_delete before delete on invoice_adjustments for each row execute function forbid_delete();
drop trigger if exists teacher_payout_payments_no_delete on teacher_payout_payments;
create trigger teacher_payout_payments_no_delete before delete on teacher_payout_payments for each row execute function forbid_delete();

do $$ declare t text; begin
  foreach t in array array['payment_methods', 'invoice_items', 'invoice_adjustments', 'teacher_payout_items',
                           'teacher_payout_payments', 'payment_links', 'payment_gateway_events'] loop
    perform enable_audit(t);
  end loop;
end $$;

revoke execute on function invoice_items_guard(), invoice_items_totals(), invoices_guard(), payments_guard(),
  refresh_invoice_status(uuid), assign_receipt(uuid), issue_invoice_internal(uuid), write_invoice_items(uuid, jsonb),
  collect_extra_billing(date), refresh_payout(uuid), check_payment_method(text)
  from public, anon, authenticated;
revoke execute on function apply_gateway_payment(text, text, text, text, numeric, text, timestamptz, jsonb, boolean)
  from public, anon, authenticated;

commit;
