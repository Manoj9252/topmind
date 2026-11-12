-- One-to-one bookings: availability, double-booking prevention, approval, cancellation window,
-- rescheduling, completion, billing and teacher pay.
-- Arjun is available 08:00-12:00 and 14:00-18:00 every day, teaches Tamil 14:00-15:00, needs 24 hours' notice.
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.ok(exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60)
  where starts_at = tests.myt(3, '09:00')), 'an open hour three days ahead is offered');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60)
  where starts_at = tests.myt(3, '14:00')), 'hours when the teacher has a group class are not offered');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60)
  where starts_at = tests.myt(3, '12:00')), 'hours outside working time are not offered');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today(), biz_today(), 60)
  where starts_at < now() + interval '24 hours'), 'times inside the minimum notice period are not offered');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 90)),
  'durations the teacher does not offer return no times');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60,
  (select id from languages where slug = 'malay'))), 'teachers who do not teach the language are not offered');
select tests.eq(jsonb_array_length(booking_teachers()), 1, 'only teachers who accept bookings are listed');

do $$ declare b bookings; begin
  b := request_booking('b0000000-0000-0000-0000-000000000002', tests.myt(3, '09:00'), 60, (select id from languages where slug = 'tamil'),
                       'Ordering food in Tamil');
  perform tests.eq(b.status, 'requested', 'the booking request waits for the teacher''s approval');
  perform tests.eq(b.price, 80.00::numeric, 'the price comes from the teacher''s hourly rate');
  perform set_config('test.b1', b.id::text, true);
end $$;
select tests.throws($$insert into bookings (student_id, teacher_id, starts_at, ends_at, status) values ('d0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002', now() + interval '5 days', now() + interval '5 days 1 hour', 'approved')$$, 'row-level security',
  'students cannot create or approve bookings directly');

select tests.login('c0000000-0000-0000-0000-000000000002');
select tests.throws($$select request_booking('b0000000-0000-0000-0000-000000000002', tests.myt(3, '09:00'), 60)$$, 'no longer available',
  'a second student cannot book the same time (double booking prevented)');
select tests.ok(not exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60)
  where starts_at = tests.myt(3, '09:00')), 'a requested time disappears from the available list');
select tests.owner();
select tests.throws($$insert into bookings (student_id, teacher_id, starts_at, ends_at, status, duration_minutes) values ('d0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002', tests.myt(3, '09:30'), tests.myt(3, '10:30'), 'requested', 60)$$, 'exclusion|conflicting',
  'the database itself refuses overlapping bookings for a teacher');
select tests.ok(exists (select 1 from notifications where user_id = 'b0000000-0000-0000-0000-000000000002' and type = 'booking_request'), 'the teacher is notified of the request');

-- Teacher approves
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.throws($$select decide_booking(current_setting('test.b1')::uuid, true)$$, 'your own', 'another teacher cannot approve the booking');
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.eq((decide_booking(current_setting('test.b1')::uuid, true)).status, 'approved', 'the teacher approves the request');
select tests.ok(exists (select 1 from sessions where booking_id = current_setting('test.b1')::uuid and status = 'scheduled'), 'an approved booking becomes a lesson');
select tests.ok(tests.visible('students', 'id = ''d0000000-0000-0000-0000-000000000001''') = 1, 'the teacher can see the student who booked');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.ok(tests.visible('sessions', 'booking_id is not null') = 1, 'the student sees the booked lesson in her schedule');
select tests.owner();
select tests.ok(exists (select 1 from message_outbox where template_key = 'booking_confirmed' and recipient = 'aisha@test.my'), 'the student gets a confirmation');

-- Cancellation window (set to 1000 hours so the booking falls inside it)
update app_settings set value = '1000' where key = 'booking.cancellation_window_hours';
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.throws($$select cancel_booking(current_setting('test.b1')::uuid)$$, 'hours before', 'students cannot cancel inside the cancellation window');
select tests.throws($$select reschedule_booking(current_setting('test.b1')::uuid, tests.myt(4, '09:00'))$$, 'hours before', 'students cannot move a booking inside the window');
select tests.owner();
update app_settings set value = '24' where key = 'booking.cancellation_window_hours';
select tests.login('c0000000-0000-0000-0000-000000000001');
do $$ declare nb bookings; begin
  nb := reschedule_booking(current_setting('test.b1')::uuid, tests.myt(4, '09:00'));
  perform tests.eq(nb.status, 'requested', 'a student''s move goes back to the teacher for approval');
  perform tests.eq(nb.rescheduled_from, current_setting('test.b1')::uuid, 'the new booking links to the original');
  perform tests.eq((select status from bookings where id = current_setting('test.b1')::uuid), 'cancelled', 'the original booking is released');
  perform tests.eq((select status from sessions where booking_id = current_setting('test.b1')::uuid), 'cancelled', 'the original lesson is cancelled');
  perform tests.eq((cancel_booking(nb.id)).status, 'cancelled', 'a student can cancel outside the window');
end $$;
select tests.ok(exists (select 1 from available_booking_slots('b0000000-0000-0000-0000-000000000002', biz_today() + 3, biz_today() + 3, 60)
  where starts_at = tests.myt(3, '09:00')), 'a cancelled time becomes bookable again (the 0001 bug)');
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.throws(format($$select cancel_booking(%L)$$, (select id from bookings where status = 'cancelled' limit 1)), 'already', 'a cancelled booking cannot be cancelled again');

-- Completing a past lesson
select tests.owner();
insert into bookings (id, student_id, teacher_id, starts_at, ends_at, duration_minutes, status, price, language_id) values
  ('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
   tests.myt(-1, '09:00'), tests.myt(-1, '10:00'), 60, 'approved', 80, (select id from languages where slug = 'tamil'));
insert into sessions (booking_id, starts_at, ends_at, teacher_id, session_date, status) values
  ('40000000-0000-0000-0000-000000000001', tests.myt(-1, '09:00'), tests.myt(-1, '10:00'), 'b0000000-0000-0000-0000-000000000002', biz_today() - 1, 'scheduled');
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.throws($$select complete_booking('40000000-0000-0000-0000-000000000001', 'maybe')$$, 'present, late', 'completion needs a valid attendance mark');
select tests.eq((complete_booking('40000000-0000-0000-0000-000000000001', 'present', 'Great progress')).status, 'completed', 'the teacher completes the lesson');
select tests.eq((select a.status from attendance a join sessions s on s.id = a.session_id where s.booking_id = '40000000-0000-0000-0000-000000000001'), 'present',
  'completing a booking records attendance');
select tests.eq((calculate_teacher_pay('b0000000-0000-0000-0000-000000000002', biz_today() - 1) -> 'lines' -> 1 ->> 'quantity')::numeric, 1.00,
  'the completed one-to-one lesson counts towards the teacher''s one-to-one pay');

select tests.login('a0000000-0000-0000-0000-000000000001');
select generate_monthly_invoices((month_start(biz_today()) + interval '1 month')::date, false);
select tests.ok(exists (select 1 from invoice_items where booking_id = '40000000-0000-0000-0000-000000000001' and kind = 'booking' and unit_price = 80),
  'the completed one-to-one lesson is billed in the next monthly run');
select tests.eq((select count(*) from invoice_items where booking_id = '40000000-0000-0000-0000-000000000001'), 1::bigint, 'a lesson is never billed twice');

-- Administrator reassigns an upcoming booking to another teacher
select tests.login('c0000000-0000-0000-0000-000000000002');
select set_config('test.b2', (request_booking('b0000000-0000-0000-0000-000000000002', tests.myt(5, '10:00'), 60)).id::text, true);
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select reassign_booking(current_setting('test.b2')::uuid, 'b0000000-0000-0000-0000-000000000001')$$, 'Schedule conflict',
  'a booking cannot be given to a teacher who is teaching then');
select tests.owner();
update bookings set starts_at = tests.myt(5, '16:00'), ends_at = tests.myt(5, '17:00') where id = current_setting('test.b2')::uuid;
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq((reassign_booking(current_setting('test.b2')::uuid, 'b0000000-0000-0000-0000-000000000001', 'Arjun on leave')).teacher_id,
  'b0000000-0000-0000-0000-000000000001'::uuid, 'the administrator can reassign a booking to a free teacher');
