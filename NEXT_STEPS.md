# Next steps

Last updated 2 November 2026, after the online payment checkout phase. Read this first when you continue.

## State at handover

- `npm test` passes end to end:
  - frontend and function typechecks;
  - 13 function unit tests;
  - 564 database checks in 17 files, migrations 0001–0010;
  - the query check: 161 table queries, 107 RPC calls and 9 Edge Function calls, no problems.
- `npm run build` passes.
- Every requirement area is built (SYSTEM_AUDIT.md):
  - 28 are implemented;
  - 6 need only configuration or content;
  - 3 need third-party accounts: WhatsApp, Meta and Instagram, and a payment gateway.
- No code is half-written.
- The local test database is a PostgreSQL 16 cluster on port 54329, created in the session scratch folder. In a new session, start any PostgreSQL 15 or later server and set `TEST_DATABASE_URL` before running `npm test`.

## Do next, in this order

1. **Live verification.** This is the most valuable next step, and it needs a Supabase project, or Docker for `supabase start`.
   1. Apply migrations 0001–0010 and deploy the five Edge Functions (docs/DEPLOYMENT.md).
   2. Work through the checklist below in a browser, for each role.
   3. Fix whatever it finds, and add an SQL test for any database cause.
3. **Email provider.** The Claude Doc audit (https://claude.ai/artifact/Md8a57XFH9HouxizCMmcWK) has an open comment asking whether Resend is right. If the academy uses another provider, change `sendEmail` in `supabase/functions/_shared/messaging.ts`.
2. **Once the academy picks a payment gateway:** set the secrets (docs/INTEGRATIONS.md), make one sandbox payment, check that the receipt appears, then turn on **Online payments**.

## Needs the academy, not code

- Write assessment questions and placement bands in Admin → Assessments. None are seeded.
- In Settings, fill in bank details, business address and registration number, and the admin alert email.
- Get a legal review of the privacy notice and terms (PDPA 2010), and agree a written retention schedule with the accountant.
- Choose a payment gateway, if online card or FPX payment is wanted, and open a merchant account. The checkout code is ready. Bank transfer or DuitNow with slip upload works already.
- Provide the WhatsApp Business account and approved templates, and the Meta app for Instagram.

## Live verification checklist

Each step should also be checked for refusal: for example, a student must not open another student's invoice by changing the URL.

1. **Visitor:** browse the languages and programmes. Register, complete the assessment, and track with the code. Send a contact enquiry.
2. **Admin:**
   - review and approve the registration, which creates the student and an enrolment;
   - invite a teacher; create a class with two weekly times;
   - generate lessons; issue an invoice and download its PDF;
   - run the monthly billing twice and confirm no duplicates;
   - check the dashboard and reports, and export CSV and PDF.
3. **Teacher:**
   - accept the invitation and set a password;
   - see only their own classes and students; take attendance;
   - set weekly hours and booking rules; accept a booking request;
   - see an approved salary statement;
   - download their data.
4. **Student:**
   - sign up with the registration email and confirm that it links to the student record;
   - see classes and the timetable; open materials;
   - pay an invoice with a slip upload;
   - book, move and cancel a one-to-one lesson (the cancellation window applies);
   - update their profile; download their data; ask for deletion.
5. **Admin again:**
   - confirm the payment and check the receipt PDF;
   - suspend the student and confirm their next request is refused;
   - handle the deletion request: withdraw, archive, then Erase personal data;
   - check the audit log.
6. **Messages:** with Resend configured, confirm the outbox drains and failures retry. Without it, confirm messages wait in the outbox and the notification centre shows them.

## Known follow-ups (lower priority)

- An admin-only staff notes table, if private notes are needed (see TECHNICAL_NOTES.md).
- Guardian logins that manage several students.
- Remove the duplicate logo copies in `assets/logo/` and `src/assets/` if nothing references them.
