# Development Plan — honest status
**Nothing here has been compiled, type-checked or run** (build sandbox had no network). Run the README steps and fix any errors first; expect a few typing/SQL fixes.

## Written (UNVERIFIED)
- DB: `0001_schema.sql` + `0002_features.sql` (capacity trigger, storage bucket + policies, notification triggers, public class schedules), `seed.sql`
- UI kit (`components/ui.tsx`), generic CRUD `ResourcePage` (search, CSV, add/edit/delete, friendly conflict errors), responsive sidebar layout
- Public: Home, About, Courses (fees+schedules from DB), Contact (enquiries), Register (+tracking code), Track, Login, Signup, Password reset
- Admin: Dashboard, Registrations, Enquiries, Students, Users & roles, Courses, Levels, Classrooms, Classes, Enrolments (move students between groups), Bookings (approve/reject/reschedule/cancel), Invoices (manual + monthly generation + payments via `record_payment`), Payments + printable receipts, Expenses, Teacher rates, Compensation + payouts, Checklist (pending/overdue/done), Reports (9 types, date filter, CSV), Notifications
- Teacher: Classes + student lists, Attendance (P/A/L/E, no duplicates), Availability + bookings, Materials upload, Earnings
- Student: Courses/schedule, Attendance, Materials, Invoices/receipts, Book lesson, Notifications

## Known gaps / next
- Link a student login to a `students` row (Admin → Students → “Portal login account”). Teachers: set role in Users & roles.
- Rejected/cancelled bookings keep their slot row (student can't re-request same slot).
- Per-student one-to-one lesson pricing/invoicing not automated.
- Email/WhatsApp (needs provider credentials), Instagram/TikTok: NOT connected; `enquiries.source` is ready.
- Online payment gateway: not integrated (`payments.reference` ready).
- No automated tests yet; no mark-as-read for notifications; reports lack charts.
