-- Placement assessment: hidden answers, scoring, level bands, class recommendation, honest limits.
select tests.owner();
insert into assessments (id, title, course_id, skills, time_limit_minutes) values
  ('a5000000-0000-0000-0000-000000000001', 'English placement', 'e0000000-0000-0000-0000-000000000001', '{vocabulary,grammar,reading}', 20);
insert into assessment_questions (id, assessment_id, section, kind, prompt, options, correct_option, sort_order) values
  ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'grammar', 'mcq', 'She ___ to work every day.', '["go","goes","going"]', 1, 1),
  ('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'vocabulary', 'mcq', 'The opposite of "hot" is', '["cold","warm","big"]', 0, 2),
  ('a6000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'reading', 'mcq', 'Where is Ali?', '["home","school"]', 0, 3),
  ('a6000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000001', 'grammar', 'mcq', 'I have ___ apple.', '["a","an"]', 1, 4);
insert into assessment_questions (id, assessment_id, section, kind, prompt, sort_order) values
  ('a6000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000001', 'writing', 'writing', 'Introduce yourself in three sentences.', 5);
insert into placement_bands (assessment_id, level_id, min_percent) values
  ('a5000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 0),
  ('a5000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 70);
insert into classes (id, name, level_id, capacity, fee, start_date, status) values
  ('10000000-0000-0000-0000-000000000009', 'English Intermediate', 'f0000000-0000-0000-0000-000000000002', 5, 180, biz_today(), 'active');
insert into class_schedules (class_id, weekday, start_time, end_time) values ('10000000-0000-0000-0000-000000000009', 6, '09:00', '10:00');

select tests.throws($$insert into assessment_questions (assessment_id, prompt, options, correct_option) values ('a5000000-0000-0000-0000-000000000001', 'Bad', '["a"]', 3)$$,
  'check constraint', 'a multiple-choice answer must point at one of its options');

select tests.anon();
do $$ declare r jsonb; v_token text; q jsonb; v_answers jsonb; begin
  r := submit_registration('{"student_name":"Quiz Taker","email":"quiz@test.my","consent_privacy":true,"course_id":"e0000000-0000-0000-0000-000000000001"}');
  v_token := r -> 'assessment' ->> 'token';
  perform tests.ok(v_token is not null, 'registration offers the programme''s placement assessment');
  q := get_assessment(v_token);
  perform tests.eq(jsonb_array_length(q -> 'questions'), 5, 'all questions are served');
  perform tests.ok(position('correct_option' in q::text) = 0 and position('accepted_answers' in q::text) = 0,
    'correct answers are never sent to the applicant');
  perform tests.eq(q ->> 'status', 'in_progress', 'opening the link starts the attempt');

  perform tests.owner();
  select jsonb_agg(jsonb_build_object('question_id', id, 'option', case when sort_order = 4 then 0 else correct_option end))
    into v_answers from assessment_questions where assessment_id = 'a5000000-0000-0000-0000-000000000001' and kind = 'mcq';
  perform tests.anon();
  r := submit_assessment(v_token, v_answers || jsonb_build_array(jsonb_build_object('question_id', 'a6000000-0000-0000-0000-000000000005',
                                                                                     'text', 'My name is Quiz. I work in a bank. I like tea.')));
  perform tests.eq((r ->> 'percent')::numeric, 75.00, 'the score is calculated from the multiple-choice answers (3 of 4)');
  perform tests.eq(r -> 'level' ->> 'name', 'Intermediate', 'the score maps to the configured level band');
  perform tests.eq(r -> 'recommended_class' ->> 'name', 'English Intermediate', 'an available class at that level is recommended');
  perform tests.ok((r ->> 'writing_pending')::boolean, 'writing answers wait for a teacher to mark');
  perform tests.ok(r ->> 'note' like '%Speaking is not assessed%', 'the result says plainly that speaking was not assessed');
  perform tests.eq((submit_assessment(v_token, '[]') ->> 'percent')::numeric, 75.00, 'submitting again does not change the result');
end $$;

select tests.owner();
select tests.eq((select recommended_class_id from registrations where email = 'quiz@test.my'), '10000000-0000-0000-0000-000000000009'::uuid,
  'the registration records the recommended class');
select tests.ok(exists (select 1 from notifications where type = 'admin_assessment_submitted'), 'administrators are told the assessment was completed');
select tests.eq((select is_correct from assessment_answers where question_id = 'a6000000-0000-0000-0000-000000000005'), null::boolean,
  'writing is left for manual marking, never auto-scored');

-- Expired link
insert into assessment_attempts (assessment_id, token, expires_at) values ('a5000000-0000-0000-0000-000000000001', 'expiredtoken', now() - interval '1 day');
select tests.anon();
select tests.throws($$select get_assessment('expiredtoken')$$, 'invalid or has expired', 'expired assessment links are refused');
select tests.throws($$select get_assessment('no-such-token')$$, 'invalid or has expired', 'unknown assessment links are refused');

-- Staff review and admin override
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select review_assessment((select id from assessment_attempts where registration_id = (select id from registrations where email = 'quiz@test.my')),
  5, null)$$, 'between 0 and 1', 'writing marks cannot exceed the question''s points');
select tests.lives($$select review_assessment((select id from assessment_attempts where registration_id = (select id from registrations where email = 'quiz@test.my')),
  1, 'f0000000-0000-0000-0000-000000000002', 'Good writing')$$, 'staff can mark the writing and confirm the level');
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.throws($$select review_assessment('00000000-0000-0000-0000-000000000000', 1, null)$$, 'staff', 'students cannot review assessments');
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.throws($$select place_student('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, '')$$,
  'reason', 'an override needs a recorded reason');
select tests.lives($$select place_student('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, 'Strong speaking in class')$$,
  'the administrator can override a placement');
select tests.eq((select count(*) from placements where student_id = 'd0000000-0000-0000-0000-000000000001'), 1::bigint, 'placement history is kept');

-- A signed-in student can take a reassessment
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.ok(length(start_my_assessment('a5000000-0000-0000-0000-000000000001')) > 20, 'a student can start a reassessment');
select tests.eq(start_my_assessment('a5000000-0000-0000-0000-000000000001'),
  (select token from assessment_attempts where student_id = 'd0000000-0000-0000-0000-000000000001' and status = 'not_started' limit 1),
  'starting again resumes the same attempt');
