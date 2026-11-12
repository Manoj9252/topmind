# Top Mind Enterprise — Client Demo Revision 2

## Changes made

- Added real browser-demo audit records to generic insert, update, delete, and upsert paths and to several business RPCs (payment/receipt, invoice, salaries, automation).
- Added teacher search and status filters; added audit-log free-text filtering.
- Added simulated class and payment reminder job execution against demo records. Messages appear as in-app notifications for linked demo student accounts. Jobs require manually clicking Run; no background scheduler.
- Added monthly tuition billing run that skips already invoiced students, uses per-student billing day (1–28) and creates draft or issued demo invoices.
- Added student's individual billing-day editor on admin student profile.
- Improved one-to-one booking: available slots are computed by requested period/duration and exclude overlapping bookings; can find earliest available teacher from qualified options.
- Added all-portal student progress page, in-browser progress observations, learning history and attendance percentages. Added progress, attendance, payment and receipt report calculations from stored demo rows.
- Connected invoice actions and manual payment actions to browser demo records; confirmation updates invoice totals and receipts, avoiding duplicate receipts on repeated confirmation.
- Added teacher salary payment and adjustment updates with audit events.
- Enabled academy-wide teacher training materials; student portal excludes teacher-only/unpublished materials.
- Added validation for teacher invitations, students, invoice amounts, payment amounts, progress scores and booking overlaps; small-screen CSS enhancements.
- Preserved existing admin, teacher and student portal flows, demo role switcher, vocabulary, student awards, competitions, teacher workshops, PDF documents, CSV reports, local file storage.

## Verified in this environment

- Frontend TypeScript: passed.
- Backend-function TypeScript: passed.
- Existing backend helper tests: 13 passed.
- New demo smoke test: passed for local records, booking slots/conflicts, pending payment confirmation, receipt idempotency, reminders, invoice generation, invoice creation/issue/payment, progress reports, attendance reports, audit trail and payroll generation.

## Not fully verified

- Native Vite production build: blocked by missing Linux Rollup optional binary in imported Windows dependencies. Reinstall on Windows with `npm install`.
- Full multi-route browser click-through, responsive mobile device testing, and email/WhatsApp delivery: not performed.
- True scheduled reminders, real cross-device sync, online payment collection, native XLSX exports: not implemented in demo (Excel-readable CSV is supported).
- The audit is demo-local and does not establish production financial or security compliance. The demo is not suitable for real customer or financial records.
