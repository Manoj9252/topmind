-- Enquiries: website form, suggested replies from live data, conversion, social message intake.
select tests.anon();
select tests.throws($$select submit_enquiry('{"name":"A","email":"a@test.my","message":"hello there"}')$$, 'your name', 'an enquiry needs a name');
select tests.throws($$select submit_enquiry('{"name":"Amir","email":"nope","message":"hello there"}')$$, 'valid email', 'an enquiry needs a valid email');
select tests.eq(submit_enquiry('{"name":"Amir Hassan","email":"amir@test.my","phone":"0123456789","message":"How much are the fees for Tamil?"}') ->> 'status',
  'received', 'a website enquiry is accepted');
select tests.eq(submit_enquiry('{"name":"Bot","email":"bot@test.my","message":"buy now","website":"x"}') ->> 'status', 'received', 'bots get a quiet success');
select tests.throws($$insert into enquiries (name, email, message) values ('X', 'x@test.my', 'hi')$$, 'row-level security|permission',
  'browsers cannot bypass the enquiry checks');

select tests.owner();
select tests.eq((select count(*) from enquiries where email = 'bot@test.my'), 0::bigint, 'bot enquiries are not stored');
select tests.eq((select category from enquiries where email = 'amir@test.my'), 'fees', 'the enquiry is classified by topic');
select tests.ok(exists (select 1 from enquiry_messages m join enquiries e on e.id = m.enquiry_id where e.email = 'amir@test.my' and m.direction = 'inbound'),
  'the message is kept in the conversation');
select tests.ok(exists (select 1 from notifications where type = 'admin_new_enquiry'), 'administrators are alerted to new enquiries');
select tests.ok((select body from message_outbox where template_key = 'enquiry_auto_reply' and recipient = 'amir@test.my') like '%RM 40.00%',
  'the automatic answer quotes the current fee from the database');

select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.ok((suggest_enquiry_reply(null, 'Do you offer Hindi classes?') ->> 'reply') like '%Hindi classes are coming soon%',
  'replies say honestly when a language is not offered yet');
select tests.ok((suggest_enquiry_reply(null, 'Do you have Tamil?') ->> 'reply') like '%Yes, we teach Tamil%', 'replies confirm languages that are offered');
select tests.ok((suggest_enquiry_reply(null, 'what are the class schedules?') ->> 'reply') like '%English Beginners Daily%', 'schedule replies list current classes');
select tests.eq(suggest_enquiry_reply(null, 'How do I book a one-to-one lesson?') ->> 'category', 'one_to_one', 'one-to-one questions are recognised');
select tests.ok((suggest_enquiry_reply(null, 'Are classes online?') ->> 'reply') like '%online%', 'online questions are answered from the class modes');
select tests.ok((suggest_enquiry_reply((select id from enquiries where email = 'amir@test.my')) ->> 'reply') like 'Hi Amir%', 'replies greet the person by name');

select tests.lives($$select log_enquiry_message((select id from enquiries where email = 'amir@test.my'), 'outbound', 'Tamil is RM40 per lesson.', 'email')$$,
  'a reply can be logged against the enquiry');
select tests.eq((select status from enquiries where email = 'amir@test.my'), 'responded', 'logging a reply marks the enquiry responded');
do $$ declare r registrations; begin
  r := convert_enquiry((select id from enquiries where email = 'amir@test.my'), null, 'e0000000-0000-0000-0000-000000000002');
  perform tests.eq(r.status, 'pending', 'an enquiry converts into a pending registration');
  perform tests.eq(r.source, 'website', 'the registration keeps the enquiry''s source');
  perform tests.eq((select status from enquiries where email = 'amir@test.my'), 'converted', 'the enquiry is marked converted');
  perform tests.throws(format('select convert_enquiry(%L)', (select id from enquiries where email = 'amir@test.my')), 'already been converted',
    'an enquiry cannot be converted twice');
end $$;

-- Instagram / TikTok messages arrive through the webhook function only
select tests.throws($$select ingest_social_message('instagram', 'm1', 'u1', 'amy.k', 'Amy', 'Hi, do you teach Malay?')$$, 'permission denied|webhook',
  'browsers cannot inject social messages');
select tests.service();
select tests.ok(ingest_social_message('instagram', 'm1', 'u1', 'amy.k', 'Amy', 'Hi, do you teach Malay?') is not null, 'an Instagram message creates an enquiry');
select tests.ok(ingest_social_message('instagram', 'm2', 'u1', 'amy.k', 'Amy', 'And the fees?') is not null, 'a follow-up joins the same conversation');
select tests.ok(ingest_social_message('instagram', 'm2', 'u1', 'amy.k', 'Amy', 'And the fees?') is null, 'a duplicate delivery is ignored');
select tests.owner();
select tests.eq((select count(*) from enquiries where source = 'instagram'), 1::bigint, 'one enquiry per conversation');
select tests.eq((select count(*) from enquiry_messages m join enquiries e on e.id = m.enquiry_id where e.source = 'instagram'), 2::bigint,
  'both messages are kept in order');
