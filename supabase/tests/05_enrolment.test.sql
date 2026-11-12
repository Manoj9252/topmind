-- Enrolment: capacity, waiting list, transfers with history, withdrawal and re-enrolment.
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$insert into enrolments (student_id, class_id, status) values ('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'active')$$,
  'Class is full', 'class capacity is enforced in the database');
select tests.eq((enrol_student('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001')).status, 'waitlisted',
  'a full class puts new students on the waiting list');
select tests.throws($$select enrol_student('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001')$$, 'already enrolled',
  'a student cannot be enrolled twice in the same class');
select tests.throws($$select enrol_student('d0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', null, false)$$, 'already enrolled|full',
  'without the waiting-list option a full class refuses the enrolment');

insert into classes (id, name, capacity, fee, start_date, status) values
  ('10000000-0000-0000-0000-000000000008', 'English Evening', 5, 160, biz_today(), 'active');
do $$ declare e enrolments; v_old uuid := (select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000002'
                                           and class_id = '10000000-0000-0000-0000-000000000001'); begin
  perform tests.throws(format($t$select transfer_enrolment(%L, '10000000-0000-0000-0000-000000000008', '')$t$, v_old), 'reason', 'a transfer needs a reason');
  e := transfer_enrolment(v_old, '10000000-0000-0000-0000-000000000008', 'Prefers evenings');
  perform tests.eq(e.status, 'active', 'the student is active in the new class');
  perform tests.eq(e.transferred_from, v_old, 'the new enrolment links to the old one');
  perform tests.eq((select status from enrolments where id = v_old), 'transferred', 'the old enrolment is kept as history, not overwritten');
  perform tests.eq((select end_date from enrolments where id = v_old), biz_today(), 'the old enrolment ends on the transfer date');
end $$;

-- The transfer freed a place: promote the waiting-list student.
select tests.eq((change_enrolment_status((select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000003'
  and class_id = '10000000-0000-0000-0000-000000000001'), 'active')).status, 'active', 'a waiting-list student can be promoted when a place opens');
select tests.owner();
select tests.ok(exists (select 1 from message_outbox where template_key = 'class_assigned' and recipient = 'chen@test.my'), 'the promoted student is told about the class');
select tests.login('a0000000-0000-0000-0000-000000000001');

select tests.throws(format($$select change_enrolment_status(%L, 'withdrawn')$$, (select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000001'
  and class_id = '10000000-0000-0000-0000-000000000001')), 'reason', 'a withdrawal needs a reason');
select tests.lives(format($$select change_enrolment_status(%L, 'suspended', 'Travelling for a month')$$, (select id from enrolments
  where student_id = 'd0000000-0000-0000-0000-000000000001' and class_id = '10000000-0000-0000-0000-000000000001')), 'an enrolment can be paused');
select tests.lives(format($$select change_enrolment_status(%L, 'active')$$, (select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000001'
  and class_id = '10000000-0000-0000-0000-000000000001' and status = 'suspended')), 'a paused enrolment can resume when there is space');
select tests.lives(format($$select change_enrolment_status(%L, 'withdrawn', 'Moving abroad')$$, (select id from enrolments
  where student_id = 'd0000000-0000-0000-0000-000000000001' and class_id = '10000000-0000-0000-0000-000000000001' and status = 'active')),
  'a student can be withdrawn');
select tests.eq((enrol_student('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')).status, 'active',
  'a withdrawn student can re-enrol');
select tests.eq((select count(*) from enrolments where student_id = 'd0000000-0000-0000-0000-000000000001'
  and class_id = '10000000-0000-0000-0000-000000000001'), 2::bigint, 're-enrolment keeps the earlier enrolment as history');
select tests.throws(format($$select change_enrolment_status(%L, 'active')$$, (select id from enrolments where student_id = 'd0000000-0000-0000-0000-000000000001'
  and status = 'withdrawn')), 'has ended', 'an ended enrolment cannot be reopened');

select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('enrolments'), 2::bigint, 'the student sees her current and past enrolments');
select tests.eq(jsonb_array_length(my_classes()), 2, 'my_classes lists current and past classes');
select tests.ok((my_classes() -> 0 -> 'class' ->> 'meeting_link') = 'https://meet.example/eng', 'active students get the meeting link');
select tests.ok((select bool_and((x -> 'class' ->> 'meeting_link') is null) from jsonb_array_elements(my_classes()) x where x ->> 'status' <> 'active'),
  'ended enrolments do not show the meeting link');
