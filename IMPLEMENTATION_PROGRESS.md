# Implementation progress

Last updated 2 November 2026. For each requirement's status, see [SYSTEM_AUDIT.md](SYSTEM_AUDIT.md). For how the system is built, see [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md).

## At a glance

- **Code:** all modules from the specification are built, across database, server functions, public site and the three portals.
- **Tests:** `npm test` passes end to end:
  - frontend and function typechecks;
  - 13 function unit tests;
  - 564 database checks;
  - the frontend-to-schema query check.
- **Not yet done:**
  - deployment and integration guides;
  - a browser walkthrough against a live Supabase project;
  - configuration that needs the academy's accounts and credentials;
  - a sandbox test of the payment gateway once a provider is chosen.

## Phase log

| Phase | Scope | State | Evidence |
| --- | --- | --- | --- |
| 0. Audit | Audit the existing app and classify the 37 requirement areas | Done | Claude Doc and SYSTEM_AUDIT.md |
| 1. Foundation | Settings, account status, role guard, audit log, languages and programmes, centres and rooms, teacher profiles, student fields and consent, class schedules and clash checks, enrolment workflow, rewritten access policies | Done | `0003_foundation.sql`; tests 01, 05 |
| 2. Academic | Dated lessons, cancellations, rescheduling, substitutes, attendance with history and edit window, registration workflow, class recommendations, placement assessments, materials with private storage | Done | `0004_academic.sql`; tests 02, 03, 04, 06, 07 |
| 3. Finance | Payment methods, numbered invoices with line items and adjustments, repeat-safe monthly billing, payment submission and confirmation, refunds, receipts, invoice and receipt documents, teacher rates, salary statements and payments, gateway structure | Done | `0005_finance.sql`; tests 08, 09, 10 |
| 4. Engagement | Message templates and outbox (email, WhatsApp, in-app), event triggers, announcements, enquiry inbox and suggested replies, social message intake, one-to-one availability and booking | Done | `0006_engagement.sql`; tests 11, 12, 13 |
| 5. Operations | Monthly checklist with automatic checks, automation jobs and run history, 14 reports, admin, teacher and student dashboards, student self-service profile update | Done | `0007_operations.sql`; tests 14, 15, 16 |
| 6. Edge Functions | `admin-users`, `dispatch-messages`, `payment-webhook`, `social-webhook`, plus shared helpers | Done, not yet run on Deno | `npm run typecheck:functions`, `npm run test:functions` |
| 7a. Public site and auth | Pages driven by the catalogue, four-step registration, assessment, tracking, contact, privacy and terms, real login, sign-up and password reset | Done | typecheck, build, query check |
| 7b. Admin portal | 23 pages: dashboard, students, registrations, enquiries, teachers, accounts, classes, catalogue, assessments, attendance, bookings, invoices, payments, receipts, salaries, expenses, notification centre, automations, settings, audit log, checklist, reports, materials | Done | typecheck, build, query check |
| 7c. Teacher portal | Dashboard, classes, students, attendance, schedule, bookings (with availability, time off and booking rules), materials, salary, notifications, profile | Done (this session) | typecheck, build, query check, `16_portal.test.sql` |
| 7d. Student portal | Dashboard, profile, classes, timetable, attendance, materials, invoices with slip upload, payments, receipts, one-to-one booking, notifications | Done (this session) | typecheck, build, query check, `16_portal.test.sql` |
| 7e. Portal helpers | `0008_portal.sql`: `my_bookings()` gives students the teacher's name without opening staff profiles; two attendance settings made visible to the portals | Done (this session) | `16_portal.test.sql` |
| 7f. Personal data (PDPA) | `0009_privacy.sql`: privacy requests, `export_my_data()`, deletion requests with admin alerts, `anonymise_student()` with audit-log redaction. "Your personal data" panel on student and teacher profiles. Deletion-request queue on Admin → Accounts. "Erase personal data" on archived students | Done (this session) | `17_privacy.test.sql` (39 checks), typecheck, build, query check |
| 7g. Online payment checkout | `create-payment-link` Edge Function with Billplz, ToyyibPay and Stripe builders in `_shared/gateways.ts`; `0010_online_payments.sql` setting; "Pay online" button and return notice on student invoices | Done (this session), needs a merchant account to go live | 3 new function unit tests, including a round trip from checkout to webhook; typecheck; build; query check |
| 8. Verification tooling | SQL test runner with a Supabase stand-in, the frontend query checker (`scripts/check-queries.mjs`), function unit tests, and `npm test` running all of them | Done (query checker this session) | `npm test` |
| 9. Documentation and deployment | SYSTEM_AUDIT, IMPLEMENTATION_PROGRESS, TECHNICAL_NOTES, NEXT_STEPS; docs/DEPLOYMENT.md and docs/INTEGRATIONS.md; README; .env.example and supabase/functions/.env.example; .gitignore; sample seed rewritten for the new schema | Done (this session) | The seed was applied twice to a migrated database: 4 programmes, 8 levels, 1 centre, 2 rooms, all visible in the public catalogue |
| 10. Live verification | Browser walkthrough of every role on a Supabase project; Edge Functions deployed with secrets | Not started | Needs a Supabase project, or Docker for `supabase start` |

## Completed

- All 37 requirement areas are built (statuses in SYSTEM_AUDIT.md).
- All 18 defects from the baseline audit are fixed, except duplicate logo files (cosmetic).
- Upgrade path tested: a database that ran the original two migrations, with data, upgrades without losing anything.
- This session:
  - eight teacher pages and nine student pages;
  - migration `0008_portal.sql`, with 35 new database checks in `16_portal.test.sql`;
  - the query checker, which was itself tested by planting 10 deliberate mistakes, all reported;
  - fixes for two type errors and the TypeScript library setting (`DOM.Iterable`);
  - an optional-reason mode for the confirm dialog.

## Partially completed

- **PDPA paperwork.** All PDPA features are built: consent, self-correction, data export, deletion requests and erasure. Two non-code items remain: a legal review of the privacy and terms pages, and a written retention schedule.

## Pending

1. Live verification on a Supabase project (see the checklist in NEXT_STEPS.md).
2. Academy content and configuration:
   - assessment questions and bands;
   - bank details, address and registration number;
   - email domain;
   - WhatsApp templates;
   - Meta app;
   - choice of payment gateway.
3. Confirm the email provider. The Claude Doc audit is fully written and has one open comment asking whether Resend is right.
