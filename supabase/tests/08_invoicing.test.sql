-- Invoicing: drafts, totals, numbering, immutability, adjustments, void, monthly runs without duplicates.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ declare inv invoices; begin
  inv := create_invoice('d0000000-0000-0000-0000-000000000002',
    '[{"kind":"registration","description":"Registration fee","unit_price":50},
      {"kind":"package","description":"10-lesson pack","quantity":1,"unit_price":400},
      {"kind":"discount","description":"Welcome discount","unit_price":40}]'::jsonb, biz_today() + 7, null, 'First invoice', false, 'Starter package');
  perform set_config('test.inv', inv.id::text, true);
  perform tests.eq(inv.status, 'draft', 'new invoices start as drafts');
  perform tests.eq(inv.amount, 410.00::numeric, 'the total is the lines minus the discount');
  perform tests.eq(inv.discount_total, 40.00::numeric, 'the discount total is tracked separately');
  perform tests.ok(inv.invoice_no is null, 'drafts have no invoice number yet');
end $$;
select tests.throws($$select create_invoice('d0000000-0000-0000-0000-000000000002', '[{"description":"Bad","unit_price":"abc"}]')$$, 'valid price',
  'invoice lines need a valid price');
select tests.throws($$select create_invoice('d0000000-0000-0000-0000-000000000002', '[{"kind":"discount","description":"Too much","unit_price":999},{"description":"Fee","unit_price":10}]')$$,
  'cannot exceed', 'discounts cannot exceed the subtotal');

select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.eq(tests.visible('invoices'), 0::bigint, 'students do not see draft invoices');
select tests.throws($$select invoice_document(current_setting('test.inv')::uuid)$$, 'not found', 'students cannot open a draft invoice');

select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ declare inv invoices; begin
  inv := issue_invoice(current_setting('test.inv')::uuid);
  perform tests.ok(inv.invoice_no ~ '^INV-\d{4}-\d{6}$', 'issuing assigns an invoice number');
  perform tests.eq(inv.status, 'unpaid', 'an issued invoice is unpaid');
  perform tests.eq(inv.bill_to ->> 'name', 'Ben Lim', 'billing details are captured when the invoice is issued');
  perform tests.ok(inv.payment_instructions is not null, 'payment instructions are printed on the invoice');
  perform tests.throws(format('select issue_invoice(%L)', inv.id), 'already been issued', 'an invoice cannot be issued twice');
  perform tests.throws(format('select update_draft_invoice(%L, ''[{"description":"x","unit_price":1}]'')', inv.id), 'Only draft', 'issued invoices cannot be edited');
  perform tests.throws(format('select discard_draft_invoice(%L)', inv.id), 'Only draft', 'issued invoices cannot be discarded');
end $$;
select tests.owner();
select tests.throws($$update invoices set amount = 1 where id = current_setting('test.inv')::uuid$$, 'cannot be changed', 'even the database owner cannot quietly change an issued total');
select tests.throws($$delete from invoices where id = current_setting('test.inv')::uuid$$, 'cannot be deleted', 'issued invoices cannot be deleted');
select tests.throws($$insert into invoice_items (invoice_id, description, unit_price) values (current_setting('test.inv')::uuid, 'Extra', 10)$$,
  'cannot be edited', 'lines cannot be added to an issued invoice');
select tests.ok(exists (select 1 from message_outbox where template_key = 'invoice_issued' and recipient = 'ben@test.my'), 'the invoice email is queued when issued');
select tests.ok((select body from message_outbox where template_key = 'invoice_issued' and recipient = 'ben@test.my' limit 1) like '%RM 410.00%',
  'the invoice email shows the total in ringgit');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select add_invoice_adjustment(current_setting('test.inv')::uuid, 10, '')$$, 'check constraint|reason', 'an adjustment needs a reason');
select tests.lives($$select add_invoice_adjustment(current_setting('test.inv')::uuid, 10, 'Goodwill credit')$$, 'a credit note can be added');
select tests.eq(invoice_balance(current_setting('test.inv')::uuid), 400.00::numeric, 'the credit note reduces the balance');
select tests.throws($$select add_invoice_adjustment(current_setting('test.inv')::uuid, 1000, 'Too big')$$, 'negative', 'a credit cannot exceed the invoice');
select tests.throws($$select void_invoice(current_setting('test.inv')::uuid, '')$$, 'reason', 'voiding needs a reason');
select record_payment(current_setting('test.inv')::uuid, 100, 'cash');
select tests.throws($$select void_invoice(current_setting('test.inv')::uuid, 'Mistake')$$, 'Refund them', 'invoices with payments cannot be voided');

-- Drafts can be discarded
do $$ declare inv invoices; begin
  inv := create_invoice('d0000000-0000-0000-0000-000000000001', '[{"description":"Book","unit_price":30}]');
  perform discard_draft_invoice(inv.id);
  perform tests.ok(not exists (select 1 from invoices where id = inv.id), 'a draft can be discarded');
end $$;

-- Monthly run
select tests.owner();
update enrolments set fee_override = 120, discount_percent = 10
where student_id = 'd0000000-0000-0000-0000-000000000001' and class_id = '10000000-0000-0000-0000-000000000001';
-- Per-lesson billing: Ben attended two Tamil lessons last month.
update classes set start_date = month_start(biz_today()) - interval '1 month' where id = '10000000-0000-0000-0000-000000000002';
update enrolments set start_date = month_start(biz_today()) - interval '1 month'
where student_id = 'd0000000-0000-0000-0000-000000000002' and class_id = '10000000-0000-0000-0000-000000000002';
select generate_lessons_internal('10000000-0000-0000-0000-000000000002', (month_start(biz_today()) - interval '1 month')::date, biz_today());
select tests.login('a0000000-0000-0000-0000-000000000001');
select save_attendance(id, '[{"student_id":"d0000000-0000-0000-0000-000000000002","status":"present"}]')
from sessions where class_id = '10000000-0000-0000-0000-000000000002'
  and session_date in ((month_start(biz_today()) - interval '1 month')::date + 1, (month_start(biz_today()) - interval '1 month')::date + 2);
select save_attendance(id, '[{"student_id":"d0000000-0000-0000-0000-000000000002","status":"absent"}]')
from sessions where class_id = '10000000-0000-0000-0000-000000000002' and session_date = (month_start(biz_today()) - interval '1 month')::date + 3;

do $$ declare r jsonb; v_aisha invoices; v_ben invoices; begin
  r := generate_monthly_invoices(biz_today(), true);
  perform tests.eq((r ->> 'invoices_created')::int, 2, 'the monthly run creates one invoice per billable student');
  select * into v_aisha from invoices where student_id = 'd0000000-0000-0000-0000-000000000001' and source = 'monthly_run';
  select * into v_ben from invoices where student_id = 'd0000000-0000-0000-0000-000000000002' and source = 'monthly_run';
  perform tests.eq(v_aisha.amount, 108.00::numeric, 'a student-specific fee and discount are applied (RM120 less 10%)');
  perform tests.eq(v_ben.amount, 230.00::numeric, 'monthly tuition plus attended per-lesson classes are billed together (150 + 2 x 40)');
  perform tests.eq(v_ben.status, 'unpaid', 'monthly invoices are issued automatically when that setting is on');
  perform tests.eq(((generate_monthly_invoices(biz_today(), true)) ->> 'invoices_created')::int, 0, 'running the month again creates no duplicates');
  perform void_invoice(v_ben.id, 'Wrong class');
  perform tests.eq(((generate_monthly_invoices(biz_today(), true)) ->> 'invoices_created')::int, 1, 'after voiding, the period can be billed again');
end $$;

select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('invoices'), 1::bigint, 'a student sees only her own issued invoices');
select tests.eq(tests.visible('invoice_items'), 2::bigint, 'a student sees the lines of her own invoices');
select tests.eq((select display_status from invoice_overview limit 1), 'unpaid', 'the invoice overview works for students');
select tests.ok((invoice_document((select id from invoices limit 1)) -> 'business' ->> 'name') is not null, 'the invoice document includes the business details');
select tests.throws($$select invoice_document(current_setting('test.inv')::uuid)$$, 'not found', 'a student cannot open someone else''s invoice');

select tests.owner();
update invoices set due_date = biz_today() - 3 where student_id = 'd0000000-0000-0000-0000-000000000001' and source = 'monthly_run';
select tests.eq((select display_status from invoice_overview where student_id = 'd0000000-0000-0000-0000-000000000001' and source = 'monthly_run'), 'overdue',
  'unpaid invoices past their due date show as overdue');
