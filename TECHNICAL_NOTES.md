# Technical notes

Last updated 2 November 2026. Covers architecture, database design, integrations, configuration and testing.

## Stack and layout

The original stack is kept:

- Frontend: Vite 5, React 18, TypeScript (strict), Tailwind CSS 3, React Router 6, lucide-react, and `@supabase/supabase-js` v2.
- Backend: Supabase only, meaning PostgreSQL, Auth, Storage and Deno Edge Functions.
- Added since the audit: `jspdf` for PDFs (loaded only when needed), and `pg` plus `@types/node` for the local test tools.

```
src/
  App.tsx                 routes (lazy-loaded pages)
  auth/AuthContext.tsx    real Supabase session, profile, role and account status
  components/             ui.tsx (UI kit), PortalLayout (navigation and role guard), ResourcePage (simple CRUD),
                          Calendar (week view), AttendanceSheet
  lib/                    api.ts (q, rpc, useLoad, useAction, callFunction), format.ts (Malaysia time, RM),
                          settings.tsx (public settings), catalog.ts, pdf.ts, storage.ts, csv.ts
  pages/public|admin|teacher|student|shared/
supabase/
  migrations/0001–0010    schema; apply in order
  functions/              admin-users, create-payment-link, dispatch-messages, payment-webhook, social-webhook, _shared helpers
  tests/                  Supabase stand-in, helpers, fixtures, 17 SQL test files
  seed.sql                optional sample catalogue (programmes, levels, rooms; no students); safe to re-run
docs/                     DEPLOYMENT.md, INTEGRATIONS.md
scripts/                  db-test.mjs (SQL suite), check-queries.mjs (frontend-to-schema check)
```

## Database design

### Migrations

| File | Contents |
| --- | --- |
| `0001_schema.sql`, `0002_features.sql` | The original schema. Kept unchanged so existing databases upgrade in place. |
| `0003_foundation.sql` | Settings, account status, role helpers, audit log, languages, centres, teacher profiles, student fields and consent, class schedules and clash checks, enrolment workflow. Resets every access policy. |
| `0004_academic.sql` | Lessons, attendance and its history, rate limits, registrations, recommendations, assessments and placements, materials and storage policies. |
| `0005_finance.sql` | Payment methods, invoices, line items, adjustments, payments, receipts, documents, the payment-evidence bucket, teacher rates, salary statements, gateway tables. |
| `0006_engagement.sql` | Formatting helpers, notifications, templates, outbox, announcements, event dispatch, enquiries, social intake, one-to-one booking. |
| `0007_operations.sql` | Checklist, automation jobs, reports, dashboards, catalogue, calendar, student self-service. |
| `0008_portal.sql` | `my_bookings()`; makes the attendance edit window and warning level public settings. |
| `0009_privacy.sql` | PDPA: `privacy_requests`, `export_my_data()`, `request_account_deletion()`, `cancel_privacy_request()`, `resolve_privacy_request()`, `anonymise_student()`, plus a narrow redaction mode on the audit log. |
| `0010_online_payments.sql` | Public setting `finance.online_payments_enabled`, off by default, which shows "Pay online" on student invoices. |

Every migration is additive and runs inside a transaction. Columns are added with `if not exists`. Old data is converted, never dropped: weekly slots move to `class_schedules`, invoices get numbers and line items, payouts become statements.

### Rules the whole schema follows

- **Access**
  - Row-level security is on for every table.
  - Policies call SECURITY DEFINER helpers so that policies never recurse. The helpers are `is_admin`, `is_teacher`, `is_staff`, `my_student_ids`, `is_my_student`, `teaches_class`, `teaches_student`, `in_class`, `is_my_invoice` and others.
  - `current_role_()` returns null unless the profile's status is `active`, so a suspended account loses access in the database.
- **Writes that matter go through functions.** Enrolments, lessons, attendance, invoices, payments, salaries and bookings are changed only by RPCs that check permission and business rules. Their tables have no client write policies.
- **No silent deletes**
  - `forbid_delete()` triggers protect invoices, payments, teacher payouts, expenses and invoice adjustments.
  - Students and classes with history cannot be deleted; they are archived instead.
  - A deliberate bypass exists: `set local topmind.allow_delete = 'on'` inside a trusted SQL session.
- **Audit**
  - `enable_audit(table)` attaches `audit_row()`, which appends who, what, when, and the old and new values to `audit_logs`.
  - `audit_logs` is append-only. The only exception is erasure: inside `anonymise_student()`, the setting `topmind.audit_redact` lets personal fields be removed from old entries. Who did what, and when, cannot change. Signed-in users have no update rights on the table at all.
- **Trusted context:** `is_trusted_context()` is true for the service role and for sessions with no JWT, such as the SQL editor and cron. Gateway and social intake functions accept calls only from trusted contexts.
- **Time and money**
  - Business dates are computed in `biz_tz()`, which defaults to Asia/Kuala_Lumpur, using `biz_today()` and `month_start()`.
  - Instants are stored as `timestamptz`, and the screens show them in the viewer's time zone with a label.
  - Currency comes from settings (MYR, symbol RM).
- **Numbering:** student codes look like TMS-00001 and teacher codes like TMT-0001. Invoices are numbered INV-YYYY-000001 and receipts RC-YYYY-000001; both prefixes are settings. Receipt numbers are assigned only when a payment is confirmed.
- **Settings:** `app_settings` holds key, JSON value, category and an `is_public` flag. `public_settings()` serves the public subset to the website and portals. Helpers: `setting`, `setting_text`, `setting_num`, `setting_bool`.

### Events, messages and automation

- **Events:** `emit_event(event, ref_type, ref_id, data)` turns business events into messages. Examples: `registration.received`, `invoice.issued`, `payment.confirmed`, `booking.requested`, `attendance.saved`.
- **Messages**
  - Rows go into `message_outbox` with a unique `dedupe_key`, rendered from `message_templates` (`{{variable}}` placeholders).
  - Channels are email, WhatsApp and in-app.
  - WhatsApp is used only if the student consented and the channel is turned on. Otherwise the message falls back to email.
- **Sending:** the `dispatch-messages` Edge Function works through the queue:
  1. It claims messages with `claim_messages` (`FOR UPDATE SKIP LOCKED`).
  2. It sends each one through Resend or the WhatsApp Cloud API.
  3. It reports back with `complete_message`, which retries with backoff. A permanent failure falls back to email.
- **Automation**
  - `run_due_automations()` runs hourly through pg_cron (job `topmind-automations`, created by `0007` when pg_cron exists).
  - Jobs: generate lessons, monthly invoices, payment reminders, booking reminders, attendance monitor, salary statements, checklist and cleanup.
  - Each job runs at most once per Malaysia-time period, retries up to 3 times, and records `automation_runs`.

### Storage

| Bucket | Access | Path rule |
| --- | --- | --- |
| `materials` (private, 50 MB, MIME allowlist) | Teachers of the class upload. Readers are checked by `can_read_material_file`. | `class/<class_id>/...` |
| `payment-evidence` (private, 10 MB, images and PDF) | The student uploads to their own folder. Admins read. | `<student_id>/<invoice_id>/<timestamp>-<file>` |

Files are opened only through signed URLs that expire after 120 seconds (`openPrivateFile`), never through public URLs.

## Frontend architecture

- **Data access:** `lib/api.ts` wraps supabase-js:
  - `q()` unwraps `{data, error}`;
  - `rpc()` calls a database function;
  - `useLoad()` loads data, ignoring stale responses;
  - `useAction()` tracks busy, error and success state;
  - `friendly()` turns database errors into plain messages.
- **Roles:** `PortalLayout` picks the navigation for each role (spec 25.1–25.3) and blocks other roles. This guard is only for user experience; the database enforces every rule again.
- **Settings:** business details, currency and public rules come from `public_settings()` through `SettingsProvider`, with safe defaults. Contact details are never hard-coded on pages.
- **Documents:** invoices, receipts and reports are drawn as text with jsPDF (`lib/pdf.ts`), with no HTML injection. Data comes from `invoice_document()` and `receipt_document()`, which check access.
- **Uploads:** `uploadWithProgress()` calls the Storage API with the user's own token, checking type and size in the browser first; the bucket checks again.
- **Cross-role names:** students cannot read staff profiles. Teacher names reach students through SECURITY DEFINER functions: `my_classes`, `lesson_calendar`, `student_dashboard`, `booking_teachers` and `my_bookings`.

## Edge Functions

| Function | Who calls it | Auth | Secrets |
| --- | --- | --- | --- |
| `admin-users` | Admin screens (`callFunction`) | Supabase JWT, and the caller must be an admin | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` |
| `create-payment-link` | Student invoice page (`callFunction`) | Supabase JWT. The invoice is read with the caller's token through `invoice_document()`, so access is checked by the database | `PAYMENT_GATEWAY`, plus `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_BASE_URL`, or `TOYYIBPAY_SECRET_KEY`, `TOYYIBPAY_CATEGORY_CODE`, `TOYYIBPAY_BASE_URL`, or `STRIPE_SECRET_KEY`; `SITE_URL` |
| `dispatch-messages` | pg_cron every minute, or an admin | `Authorization: Bearer <DISPATCH_SECRET>`, or an admin JWT | `DISPATCH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `SITE_URL` |
| `payment-webhook?provider=billplz\|stripe\|toyyibpay` | Payment provider | Provider signature: `BILLPLZ_X_SIGNATURE_KEY`, `STRIPE_WEBHOOK_SECRET`, or a ToyyibPay server-side status check with `TOYYIBPAY_SECRET_KEY` | plus `TOYYIBPAY_BASE_URL` |
| `social-webhook` | Meta (Instagram), forwarders, admin replies | Meta `x-hub-signature-256` with `META_APP_SECRET`; GET challenge with `META_VERIFY_TOKEN`; `?source=generic` uses an HMAC in `x-topmind-signature` with `SOCIAL_WEBHOOK_SECRET` | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `META_API_VERSION` |

`supabase/config.toml` turns off the platform JWT check for the three webhook and dispatcher functions, because they verify their own signatures.

## Configuration

- **Frontend `.env`:** only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never put the service-role key or any other secret in a `VITE_` variable.
- **Edge Function secrets:** set with `supabase secrets set ...`. The list is in the table above.
- **Database settings:** edit in Admin → Settings. These must be filled before going live:
  - `business.address`, `business.registration_no`;
  - `finance.bank_details`;
  - `communication.admin_alert_email`;
  - `communication.whatsapp_enabled`, once WhatsApp is approved.
- **Supabase platform:**
  - Auth: email confirmation on, site URL, and redirect URLs including `<site>/reset`. Custom SMTP is recommended.
  - Extensions: pg_cron, pg_net and Vault for the dispatcher schedule.
- **First admin:** after the first sign-up, run `update profiles set role = 'admin' where email = '<owner email>';` in the SQL editor. Invite everyone else from the admin screens.

## Testing

| Command | What it does |
| --- | --- |
| `npm run test:db` | Recreates database `topmind_test`, applies the Supabase stand-in, every migration and the fixtures, then runs each `supabase/tests/*.test.sql` in its own transaction, rolled back afterwards. Uses `TEST_DATABASE_URL` (default `postgres://postgres@localhost:54329/postgres`). Add a filter argument to run one file, for example `npm run test:db 11`. |
| `npm run check:queries` | Builds database `topmind_check` and statically checks every literal Supabase call in `src/`, as listed below. |
| `npm run test:functions` | Node test runner over the Edge Function helpers: signatures, payload parsing, message building. |
| `npm test` | Typechecks, function tests, the database suite and the query check. |

What `check:queries` covers:

- tables and columns exist;
- embedded relationships are resolvable and unambiguous;
- filter and order columns exist;
- insert, update and upsert keys exist and are not generated columns;
- RPC names, argument names and execute privilege, for the anon role on public pages and the authenticated role elsewhere;
- storage buckets and Edge Function names.

The local test server is a PostgreSQL 16 cluster created in the session scratch folder. Any PostgreSQL 15 or later works if you set `TEST_DATABASE_URL`. Never point either script at a real Supabase project, because both drop and recreate their databases.

## Known limitations and decisions

- **Internal notes are not secret from their subject.** `students.notes` is readable by the student, and by their teachers. `teacher_profiles.notes` is readable by that teacher. Row-level security works per row, not per column. If private staff notes are needed, add an admin-only table.
- **One student record per login.** A login linked to several student records, such as a parent with two children, works for viewing. But slip uploads and self-service updates use the first linked record (`my_student_id()`). Supporting guardians properly needs a student picker.
- **Gateway checkout has never run against a real provider.** Bill creation for Billplz, ToyyibPay and Stripe is built, and its request building and response parsing are unit-tested. It has not been run against the providers, because there is no merchant account yet. Do one sandbox payment before turning on "Online payments".
- **TikTok:** there is no official direct-message API for this use. Enquiries arrive by manual entry or by a forwarder posting to `social-webhook?source=generic`.
- **Erasure keeps the sign-in identity.** `anonymise_student()` deactivates the profile and removes its name and phone, but the email stays in Supabase Auth, so that address cannot be reused by mistake. To remove the login completely, delete the user in Supabase → Authentication → Users after erasing. Invoices, receipts and payments keep the details they were issued with; check how long they must be kept with the academy's accountant, usually seven years in Malaysia.
- **Speaking skills** are not assessed automatically. Placement results say so, and staff can review and override.
- **Main bundle size:** 467 kB, or 133 kB gzipped. Pages are lazy-loaded, and jsPDF loads only when a PDF is made.
