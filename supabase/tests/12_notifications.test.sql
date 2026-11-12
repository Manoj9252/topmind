-- Notifications: duplicate protection, consent, WhatsApp with email fallback, the dispatcher, read state, announcements.
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv', (create_invoice('d0000000-0000-0000-0000-000000000002', '[{"description":"Tuition","unit_price":150}]', null, null, null, true)).id::text, true);
select tests.owner();
select emit_event('invoice.issued', 'invoice', current_setting('test.inv')::uuid);
select tests.eq((select count(*) from message_outbox where related_id = current_setting('test.inv')::uuid and template_key = 'invoice_issued'), 1::bigint,
  'an event repeated by a retry does not send the message twice');
select tests.eq((select count(*) from message_outbox where channel = 'whatsapp'), 0::bigint, 'nothing goes to WhatsApp while it is switched off');

-- WhatsApp on: only with consent and a phone number; email remains the fallback.
update app_settings set value = 'true' where key = 'communication.whatsapp_enabled';
update students set consent_whatsapp = true, preferred_contact = 'whatsapp' where id = 'd0000000-0000-0000-0000-000000000002';
select emit_event('invoice.resend', 'invoice', current_setting('test.inv')::uuid);
select tests.eq((select recipient from message_outbox where channel = 'whatsapp' limit 1), '60131112222', 'Malaysian numbers are converted to international format');
select tests.eq((select count(*) from message_outbox where template_key = 'invoice_issued' and channel = 'email'), 1::bigint,
  'a student who prefers WhatsApp is not also emailed');
select tests.login('a0000000-0000-0000-0000-000000000001');
select set_config('test.inv2', (create_invoice('d0000000-0000-0000-0000-000000000001', '[{"description":"Tuition","unit_price":150}]', null, null, null, true)).id::text, true);
select tests.owner();
select tests.eq((select count(*) from message_outbox where channel = 'whatsapp' and student_id = 'd0000000-0000-0000-0000-000000000001'), 0::bigint,
  'no WhatsApp without the student''s consent');

-- Dispatcher
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select * from claim_messages()$$, 'permission denied|dispatcher', 'only the dispatcher can claim messages');
select tests.service();
select tests.ok((select count(*) from claim_messages(50)) >= 2, 'the dispatcher claims queued messages');
select tests.eq((select count(*) from claim_messages(50)), 0::bigint, 'claimed messages are not handed out twice');
select complete_message(id, true, 'resend', 'msg-1') from message_outbox where channel = 'email' and status = 'sending';
select complete_message(id, false, 'whatsapp', null, 'Template not approved', false) from message_outbox where channel = 'whatsapp';
select tests.owner();
select tests.eq((select status from message_outbox where channel = 'whatsapp'), 'queued', 'a temporary failure is retried');
select tests.ok((select next_attempt_at from message_outbox where channel = 'whatsapp') > now(), 'retries back off');
select tests.service();
update message_outbox set status = 'sending' where channel = 'whatsapp';
select complete_message(id, false, 'whatsapp', null, 'Number not on WhatsApp', true) from message_outbox where channel = 'whatsapp';
select tests.owner();
select tests.eq((select status from message_outbox where channel = 'whatsapp'), 'failed', 'a permanent failure is marked failed');
select tests.ok(exists (select 1 from message_outbox where channel = 'email' and recipient = 'ben@test.my' and dedupe_key like '%fallback-email'),
  'a failed WhatsApp message falls back to email');
select tests.ok((select last_sent_at from invoices where id = current_setting('test.inv')::uuid) is not null, 'invoice delivery is recorded on the invoice');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((retry_message((select id from message_outbox where channel = 'whatsapp'))).status, 'queued', 'the administrator can retry a failed message');
select tests.lives($$select cancel_message((select id from message_outbox where channel = 'whatsapp'))$$, 'the administrator can cancel a queued message');

-- In-app notifications
select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.ok(tests.visible('notifications', 'not read') > 0, 'the student has unread notifications');
select tests.eq(tests.visible('message_outbox', 'student_id <> ''d0000000-0000-0000-0000-000000000002'''), 0::bigint, 'students only see their own messages');
select tests.ok(mark_notifications_read() > 0, 'a student can mark notifications as read');
select tests.eq(tests.visible('notifications', 'not read'), 0::bigint, 'all notifications are now read');
select tests.owner();
select tests.ok(exists (select 1 from notifications where user_id = 'c0000000-0000-0000-0000-000000000001' and not read), 'marking read affects only the student''s own notifications');

-- Announcements
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$insert into announcements (title, body, audience) values ('No class', 'x', 'class')$$, 'check constraint',
  'a class announcement must name the class');
insert into announcements (id, title, body, audience, send_email, class_id) values
  ('50000000-0000-0000-0000-000000000001', 'Staff meeting', 'Friday 3pm', 'teachers', true, null),
  ('50000000-0000-0000-0000-000000000002', 'Tamil class trip', 'Bring snacks', 'class', false, '10000000-0000-0000-0000-000000000002');
select tests.eq(publish_announcement('50000000-0000-0000-0000-000000000001'), 3, 'a staff announcement reaches teachers and administrators');
select tests.eq(publish_announcement('50000000-0000-0000-0000-000000000002'), 2, 'a class announcement reaches the class teacher and its students');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('announcements'), 0::bigint, 'students do not see staff or other-class announcements');
select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.eq(tests.visible('announcements'), 1::bigint, 'a student sees announcements for her class');
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('announcements'), 1::bigint, 'a teacher sees staff announcements');
select tests.owner();
select tests.ok(exists (select 1 from message_outbox where template_key = 'announcement' and recipient = 'priya@test.my'), 'staff announcements can be emailed');
