-- Lesson materials: class ownership, publishing, audiences, soft delete and private file access.
select tests.login('b0000000-0000-0000-0000-000000000001');
select tests.lives($$insert into materials (id, class_id, uploaded_by, title, storage_path, kind, file_name, mime_type, size_bytes) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Week 1 slides',
   'class/10000000-0000-0000-0000-000000000001/w1.pdf', 'slides', 'w1.pdf', 'application/pdf', 1200)$$, 'a teacher can add materials to her class');
select tests.lives($$insert into materials (id, class_id, uploaded_by, title, storage_path, kind) values
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lesson plan',
   'class/10000000-0000-0000-0000-000000000001/plan.docx', 'lesson_plan')$$, 'a teacher can upload a lesson plan');
select tests.lives($$insert into materials (id, class_id, uploaded_by, title, storage_path, kind, is_published) values
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Draft worksheet',
   'class/10000000-0000-0000-0000-000000000001/ws.pdf', 'worksheet', false)$$, 'a teacher can keep a worksheet unpublished');
select tests.throws($$insert into materials (class_id, uploaded_by, title, storage_path) values
  ('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Sneaky', 'class/10000000-0000-0000-0000-000000000002/x.pdf')$$,
  'row-level security', 'a teacher cannot add materials to another teacher''s class');
select tests.throws($$insert into materials (class_id, uploaded_by, title, storage_path) values
  ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Impersonated', 'class/10000000-0000-0000-0000-000000000001/y.pdf')$$,
  'row-level security', 'a teacher cannot upload in someone else''s name');
select tests.eq((select audience from materials where id = '30000000-0000-0000-0000-000000000002'), 'teachers', 'lesson plans are for teachers only by default');
select tests.eq((select language_id from materials where id = '30000000-0000-0000-0000-000000000001'), (select id from languages where slug = 'english'),
  'materials are organised by language automatically');

-- Files in storage
select tests.lives($$insert into storage.objects (bucket_id, name, owner) values
  ('materials', 'class/10000000-0000-0000-0000-000000000001/w1.pdf', 'b0000000-0000-0000-0000-000000000001'),
  ('materials', 'class/10000000-0000-0000-0000-000000000001/plan.docx', 'b0000000-0000-0000-0000-000000000001'),
  ('materials', 'class/10000000-0000-0000-0000-000000000001/ws.pdf', 'b0000000-0000-0000-0000-000000000001')$$, 'a teacher can upload files to her class folder');
select tests.throws($$insert into storage.objects (bucket_id, name, owner) values ('materials', 'class/10000000-0000-0000-0000-000000000002/x.pdf', 'b0000000-0000-0000-0000-000000000001')$$,
  'row-level security', 'a teacher cannot upload into another class''s folder');
select tests.throws($$insert into storage.objects (bucket_id, name, owner) values ('materials', 'general/x.pdf', 'b0000000-0000-0000-0000-000000000001')$$,
  'row-level security', 'a teacher cannot upload outside class folders');

-- Students in the class
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('materials'), 1::bigint, 'an enrolled student sees only published student materials');
select tests.eq(tests.visible('storage.objects', 'bucket_id = ''materials'''), 1::bigint, 'an enrolled student can open only the files she is allowed to see');
select tests.throws($$insert into storage.objects (bucket_id, name, owner) values ('materials', 'class/10000000-0000-0000-0000-000000000001/hack.pdf', 'c0000000-0000-0000-0000-000000000001')$$,
  'row-level security', 'students cannot upload materials');
select tests.throws($$insert into materials (class_id, uploaded_by, title, storage_path) values ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'x', 'class/10000000-0000-0000-0000-000000000001/plan.docx')$$,
  'row-level security', 'students cannot attach records to existing files (the 0001 loophole)');

-- Someone with no enrolment
select tests.login('c0000000-0000-0000-0000-000000000003');
select tests.eq(tests.visible('materials'), 0::bigint, 'a student who is not in the class sees no materials');
select tests.eq(tests.visible('storage.objects', 'bucket_id = ''materials'''), 0::bigint, 'a student who is not in the class cannot open the files');

-- Other teacher
select tests.login('b0000000-0000-0000-0000-000000000002');
select tests.eq(tests.visible('materials'), 0::bigint, 'another teacher does not see the class''s materials');

-- Publishing and soft delete
select tests.login('b0000000-0000-0000-0000-000000000001');
update materials set is_published = true where id = '30000000-0000-0000-0000-000000000003';
select tests.throws($$update materials set storage_path = 'class/10000000-0000-0000-0000-000000000001/other.pdf' where id = '30000000-0000-0000-0000-000000000001'$$,
  'cannot be changed', 'the file behind a material cannot be swapped');
update materials set deleted_at = now() where id = '30000000-0000-0000-0000-000000000001';
select tests.login('c0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('materials'), 1::bigint, 'publishing and removing are reflected for students straight away');
select tests.eq((select title from materials limit 1), 'Draft worksheet', 'the student now sees the newly published worksheet only');

-- Administrator
select tests.login('a0000000-0000-0000-0000-000000000001');
select tests.eq(tests.visible('materials'), 3::bigint, 'the administrator sees every material, including removed ones');
select tests.lives($$update materials set is_published = false where id = '30000000-0000-0000-0000-000000000003'$$, 'the administrator can unpublish any material');
