-- 0008: helpers for the teacher and student portals.
begin;

-- Values the portals show to teachers. The database still enforces them.
update app_settings set is_public = true
where key in ('academic.attendance_edit_days', 'academic.attendance_warning_percent');

-- A student's own one-to-one bookings with the teacher's name. Students cannot
-- read staff profiles directly, so the name comes through this function.
create or replace function public.my_bookings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'duration_minutes', b.duration_minutes, 'status', b.status,
    'mode', b.mode, 'objective', b.objective, 'notes', b.notes, 'price', b.price, 'teacher_id', b.teacher_id,
    'teacher', p.full_name, 'language', l.name, 'reason', coalesce(b.cancel_reason, b.decision_reason),
    'can_change', b.starts_at > now() and (b.status = 'requested' or (b.status = 'approved'
      and b.starts_at >= now() + make_interval(hours => setting_num('booking.cancellation_window_hours', 24)::int))))
    order by b.starts_at desc), '[]'::jsonb)
  from bookings b
  left join profiles p on p.id = b.teacher_id
  left join languages l on l.id = b.language_id
  where b.student_id in (select my_student_ids()) and b.starts_at is not null
$$;
revoke execute on function my_bookings() from public, anon;
grant execute on function my_bookings() to authenticated;

commit;
