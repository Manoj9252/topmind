-- Payments: manual recording, evidence uploads, confirmation, rejection, refunds, receipts, protection.
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv', (create_invoice('d0000000-0000-0000-0000-000000000001', '[{"kind":"tuition","description":"Tuition","unit_price":300}]',
  biz_today() + 7, null, null, true)).id::text, true);
select tests.throws($$select record_payment(current_setting('test.inv')::uuid, 500, 'cash')$$, 'Overpayment', 'overpayments are refused');
select tests.throws($$select record_payment(current_setting('test.inv')::uuid, 50, 'bank_transfer')$$, 'transaction reference', 'bank transfers need a reference');
select tests.throws($$select record_payment(current_setting('test.inv')::uuid, 50, 'cheque')$$, 'active payment method', 'inactive payment methods cannot be used');
do $$ declare p payments; begin
  p := record_payment(current_setting('test.inv')::uuid, 100, 'cash', null, null, 'Paid at the centre');
  perform tests.eq(p.status, 'confirmed', 'a payment recorded by the administrator is confirmed');
  perform tests.ok(p.receipt_no ~ '^RC-\d{4}-\d{6}$', 'a receipt number is generated automatically');
  perform tests.eq((select status from invoices where id = current_setting('test.inv')::uuid), 'partial', 'a part-payment marks the invoice partly paid');
  perform set_config('test.p1', p.id::text, true);
end $$;

-- Student pays the rest by DuitNow and uploads the slip
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.lives($$insert into storage.objects (bucket_id, name, owner) values ('payment-evidence', 'd0000000-0000-0000-0000-000000000001/slip.jpg', 'c0000000-0000-0000-0000-000000000001')$$,
  'a student can upload a payment slip to her own folder');
select tests.throws($$insert into storage.objects (bucket_id, name, owner) values ('payment-evidence', 'd0000000-0000-0000-0000-000000000002/slip.jpg', 'c0000000-0000-0000-0000-000000000001')$$,
  'row-level security', 'a student cannot upload into another student''s folder');
select tests.throws($$select submit_payment(current_setting('test.inv')::uuid, 200, 'duitnow', '', null, 'd0000000-0000-0000-0000-000000000001/slip.jpg')$$,
  'transaction reference', 'DuitNow payments need the transaction reference');
do $$ declare p payments; begin
  p := submit_payment(current_setting('test.inv')::uuid, 200, 'duitnow', 'DN-778899', null, 'd0000000-0000-0000-0000-000000000001/slip.jpg', 'Paid by DuitNow');
  perform tests.eq(p.status, 'pending', 'an uploaded slip waits for confirmation');
  perform tests.ok(p.receipt_no is null, 'no receipt is issued for an unconfirmed payment');
  perform set_config('test.p2', p.id::text, true);
end $$;
select tests.eq((select status from invoices where id = current_setting('test.inv')::uuid), 'partial', 'a slip alone does not mark the invoice paid');
select tests.throws($$select confirm_payment(current_setting('test.p2')::uuid)$$, 'administrator', 'a student cannot confirm her own payment');
select tests.throws($$select submit_payment(current_setting('test.inv')::uuid, 10, 'duitnow', 'DN-778899')$$, 'duplicate', 'the same transaction reference cannot be submitted twice');
select tests.throws($$update payments set status = 'confirmed' where id = current_setting('test.p2')::uuid$$, 'row-level|0 rows|Payments are changed', 'a student cannot edit payments')
  where exists (select 1 from payments where id = current_setting('test.p2')::uuid and status = 'confirmed');
update payments set status = 'confirmed' where id = current_setting('test.p2')::uuid;
select tests.eq((select status from payments where id = current_setting('test.p2')::uuid), 'pending', 'direct updates by a student change nothing');

select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.throws($$select submit_payment(current_setting('test.inv')::uuid, 10, 'cash')$$, 'own invoices', 'a student cannot pay into someone else''s invoice');
select tests.eq(tests.visible('payments'), 0::bigint, 'a student cannot see other students'' payments');

select tests.owner();
select tests.ok(exists (select 1 from notifications n join profiles p on p.id = n.user_id where p.role = 'admin' and n.type = 'admin_payment_submitted'),
  'administrators are alerted to the uploaded slip');

select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ declare p payments; v_first text; begin
  p := confirm_payment(current_setting('test.p2')::uuid);
  perform tests.eq(p.status, 'confirmed', 'the administrator confirms the payment');
  perform tests.ok(p.receipt_no is not null, 'confirmation generates the receipt');
  v_first := (select receipt_no from payments where id = current_setting('test.p1')::uuid);
  perform tests.ok(p.receipt_no > v_first, 'receipt numbers run in sequence');
  perform tests.eq((select status from invoices where id = current_setting('test.inv')::uuid), 'paid', 'the invoice is marked paid');
  perform tests.throws(format('select confirm_payment(%L)', p.id), 'Only pending', 'a payment cannot be confirmed twice (no duplicate receipts)');
end $$;
select tests.eq((select count(distinct receipt_no) from payments where invoice_id = current_setting('test.inv')::uuid), 2::bigint, 'each payment has its own receipt');

-- Rejection
select tests.login('c0000000-0000-0000-0000-000000000001');
select set_config('test.inv2', (select id::text from invoices where status = 'paid' limit 1), true);
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv3', (create_invoice('d0000000-0000-0000-0000-000000000001', '[{"description":"Books","unit_price":40}]', null, null, null, true)).id::text, true);
select tests.login('c0000000-0000-0000-0000-000000000001');
select set_config('test.p3', (submit_payment(current_setting('test.inv3')::uuid, 40, 'bank_transfer', 'BT-1', null, null)).id::text, true);
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select reject_payment(current_setting('test.p3')::uuid, '')$$, 'why', 'a rejection must tell the student why');
select tests.eq((reject_payment(current_setting('test.p3')::uuid, 'Amount not received in our account')).status, 'rejected', 'the administrator can reject a slip');
select tests.lives($$select submit_payment(current_setting('test.inv3')::uuid, 40, 'bank_transfer', 'BT-1')$$, 'a rejected reference can be resubmitted');

-- Refund
do $$ declare p payments; begin
  p := refund_payment(current_setting('test.p2')::uuid, 'Overcharged');
  perform tests.eq(p.status, 'refunded', 'a confirmed payment can be refunded');
  perform tests.eq((select status from invoices where id = current_setting('test.inv')::uuid), 'partial', 'the refund reopens the invoice balance');
  perform tests.eq(invoice_balance(current_setting('test.inv')::uuid), 200.00::numeric, 'the balance is back to RM200');
end $$;

-- Financial records cannot be deleted
delete from payments where id = current_setting('test.p1')::uuid;
select tests.ok(exists (select 1 from payments where id = current_setting('test.p1')::uuid), 'administrators cannot delete payments');
select tests.owner();
select tests.throws($$delete from payments where id = current_setting('test.p1')::uuid$$, 'cannot be deleted', 'even the database owner cannot delete a payment by accident');
select tests.throws($$update payments set amount = 1 where id = current_setting('test.p1')::uuid$$, 'changed only through', 'a confirmed payment amount cannot be edited');

-- Receipts and messages
select tests.ok(exists (select 1 from message_outbox where template_key = 'payment_confirmed' and recipient = 'aisha@test.my'), 'the receipt email is queued');
select tests.ok(exists (select 1 from message_outbox where template_key = 'payment_rejected' and recipient = 'aisha@test.my'), 'the student is told about the rejection');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq((receipt_document(current_setting('test.p1')::uuid)) ->> 'receipt_no', (select receipt_no from payments where id = current_setting('test.p1')::uuid),
  'a student can download her own receipt');
select tests.ok((receipt_document(current_setting('test.p1')::uuid)) -> 'student' ->> 'student_code' like 'TMS-%', 'the receipt shows the student ID');
select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.throws($$select receipt_document(current_setting('test.p1')::uuid)$$, 'not found', 'a student cannot download someone else''s receipt');
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.lives($$select resend_document('receipt', current_setting('test.p1')::uuid)$$, 'the administrator can resend a receipt');
select tests.eq((select count(*) from message_outbox where related_id = current_setting('test.p1')::uuid and template_key = 'payment_confirmed' and channel = 'email'),
  2::bigint, 'a resend creates a new message rather than being blocked as a duplicate');
