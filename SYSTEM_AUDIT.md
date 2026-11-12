# System audit: Top Mind Enterprise class management system

This is the re-audit of 2 November 2026, and it replaces the previous version of this file. No code was changed during this audit.

## Scope and method

- **Requirements audited:** the Master System Requirements Specification as received, Parts 1–28. The specification was cut off at the 50,000-character limit inside Part 28, after the third acceptance item. Anything after that point could not be audited.
- **Code examined:**
  - migrations `0001`–`0010`;
  - the five Edge Functions;
  - every page and component in `src/`;
  - the test suites.
- **Checks run for this audit:** see [Verification evidence](#verification-evidence).

### Status rules

The statuses are the seven defined in Part 1.3 of the specification, applied strictly.

| Status | Used when |
| --- | --- |
| FULLY IMPLEMENTED | The requirement is a server or data rule, or a property of the architecture, with no screen involved. Either automated tests prove it, or the code confirms it. |
| NEEDS VERIFICATION | All the code exists: database, server and screens. The server side passes its tests, and the screens pass the typecheck and the schema check. But nobody has run them in a browser against a live Supabase project. Part 1.3 forbids marking anything fully implemented without testing it, so every screen-based feature stops at this status. |
| PARTIALLY IMPLEMENTED | Part of what the requirement asks for is missing. The missing part is named. |
| NOT IMPLEMENTED | Nothing exists. |
| BROKEN | It exists but does not work. This audit found nothing broken. |
| NEEDS CONFIGURATION | The code exists, but it needs business settings, credentials or platform setup. |
| NEEDS INTEGRATION | The code exists, but it needs an external account or API approval. |

## Summary

The detailed tables below have 113 requirement rows:

| Status | Rows |
| --- | --- |
| FULLY IMPLEMENTED | 28 |
| NEEDS VERIFICATION | 51 |
| PARTIALLY IMPLEMENTED | 19 |
| NOT IMPLEMENTED | 1 |
| BROKEN | 0 |
| NEEDS CONFIGURATION | 10 |
| NEEDS INTEGRATION | 4 |

What this means:

- **Nothing is broken.** Every automated check passes.
- **Most of the system is built but unverified.** All server-side rules that can be tested locally pass. The screens have never been run against a live system, so most rows are NEEDS VERIFICATION.
- **One requirement is missing entirely:** class schedule reminders (Part 18.2).
- **Nineteen requirements are only partly met.** Each gap is listed in [Gaps found](#gaps-found).
- **This audit is stricter than the previous version of this file.** It found two things the previous version overstated:
  - Gateway payment application was described as protected against duplicates and verified. It has no automated test.
  - Several smaller gaps were missing: per-student billing dates, the language on invoices, filtering registrations by class, reassessment from a screen, and class schedule reminders.

## Master audit table (Part 1.3)

| Requirement | Current status | Existing implementation | Missing functionality | Required action |
| --- | --- | --- | --- | --- |
| Student management | PARTIALLY IMPLEMENTED | Student codes, full profile with consent and emergency contact, enrolment history, search, filters, CSV export, invoices, payments, receipts, attendance, archive, Erase personal data | No lesson-progress view: only level history and attendance | Add a progress view, then run the browser walkthrough |
| Class management | NEEDS VERIFICATION | Classes with several weekly times, dates, status, archive, types, mode, meeting link, time zone, capacity, fees and billing frequency. Clash checks are tested. | Money figures appear on the dashboard and in reports, not on the class page | Browser walkthrough |
| Attendance | NEEDS VERIFICATION | Checked server function, five statuses, "Mark everyone present", edit window, change history, summaries, absence alerts (tested) | — | Browser walkthrough, including on a phone |
| Invoices | PARTIALLY IMPLEMENTED | Numbering, line items, drafts, issue, void, adjustments, repeat-safe monthly run, PDF, queued email (tested) | The language is not printed on invoices. Everyone shares one billing day. | Add the language to the invoice, and per-enrolment billing days if needed. Configure email. |
| Receipts | NEEDS CONFIGURATION | Number assigned once on confirmation, PDF download, resend, delivery status (tested) | Email delivery needs a provider. The PDF is not stored or attached. | Configure email |
| Teacher management | NEEDS VERIFICATION | Profiles, languages, qualifications, employment, rates, availability, time off, invitations | — | Browser walkthrough |
| Student portal | PARTIALLY IMPLEMENTED | 11 pages: dashboard, profile, classes, timetable, attendance, materials, invoices with slip upload, payments, receipts, booking, notifications | Learning progress is thin. Reassessment can't be started. Bookings need a named teacher. | Fill the gaps, then run the browser walkthrough |
| Teacher portal | NEEDS VERIFICATION | 10 pages: dashboard, classes, students, attendance, schedule, bookings, materials, salary, notifications, profile | — | Browser walkthrough |
| Admin dashboard | PARTIALLY IMPLEMENTED | All 16 key metrics, financial panel with collected and invoiced kept apart, class performance (tested) | No income by student | Add the breakdown |
| Automated enquiries | NEEDS INTEGRATION | Inbox, automatic category, suggested replies from live data, conversion, Instagram webhook, signed forwarder, manual entry (tested) | Meta app and review. TikTok has no official message API. | Configure Meta |

## Requirement-by-requirement audit

### Part 2: Business and brand

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 2.1 | Languages and classes configured in the dashboard; adding a language needs no code | NEEDS VERIFICATION | `languages` table and the Languages & programmes page. English, Tamil and Malay are active; Chinese and Hindi exist but are inactive. English for Beginners is a programme. Public pages read `public_catalog()`. | — |
| 2.4 | Age groups and programmes without a rebuild | NEEDS VERIFICATION | Programmes have an audience (adults, teens, children, all) and formats | — |
| 2.5 | Support for group classes | NEEDS VERIFICATION | Lessons with topics. Materials can be quizzes, worksheets or slides. | Quizzes are uploaded files; there is no in-app quiz tool |
| 2.5 | Support for one-to-one classes, with progress tracking | PARTIALLY IMPLEMENTED | Bookings record an objective. Teachers record attendance and lesson notes. | No progress view across lessons. Students cannot see lesson notes. |
| 2.5 | Teacher training material | PARTIALLY IMPLEMENTED | Materials can be teachers-only | The upload screen requires a class, so academy-wide training documents have nowhere to go. The database already allows programme- or language-level materials. |
| 2.6 | Brand values; nothing intimidating or overly formal | NEEDS VERIFICATION | Plain, encouraging wording on the site and in messages | Tone and visual review |
| 2.7 | Official colours and logo, never stretched | NEEDS VERIFICATION | Colours in `tailwind.config.js`. The logo uses `object-cover`, which crops to fit rather than stretching. | Visual check |

### Part 3: Roles and access

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 3.1 | Administrator capabilities (22 listed) | NEEDS VERIFICATION | There is a screen for every listed capability. They are grouped under People, Teaching, Money and System, plus the dashboard, checklist and reports. | — |
| 3.1 | Delete student records, subject to retention safeguards | NEEDS VERIFICATION | Archive, plus Erase personal data, which anonymises the record and keeps financial records. The database refuses to delete a student who has history. | A record created by mistake can only be archived or erased, never removed outright |
| 3.1 | Manage access permissions | PARTIALLY IMPLEMENTED | Roles are assigned and changed in Accounts & access, and accounts can be suspended | No per-user or custom permission sets. Each role's rights are fixed in database policies. |
| 3.2 | Teacher capabilities (15 listed) | NEEDS VERIFICATION | Teacher portal: classes, students and contact details, schedule, attendance within the edit window, uploads, salary statements, payments, outstanding pay, announcements | — |
| 3.2 | Teacher restrictions enforced on the backend | FULLY IMPLEMENTED | Tests 01 and 16. Teachers cannot see other teachers' salaries, business finances or unrelated students. They cannot confirm payments or read private settings. | — |
| 3.3 | Student capabilities (15 listed) | PARTIALLY IMPLEMENTED | Student portal covers registration, profile, classes, schedule, teacher information, attendance, invoices, payment status, balance, receipts, materials, bookings with cancel and move, and notifications | "View learning progress" shows only the latest level, attendance and lesson topics |
| 3.3 | Students never see another student's records | FULLY IMPLEMENTED | Tests 01, 07, 09 and 16 | — |
| 3.4 | Login, logout, password reset, suspension, sessions, password hashing | NEEDS VERIFICATION | Supabase Auth provides hashing and sessions. The database enforces suspension (test 01). Users can sign out everywhere and change their password. | The sign-in, sign-up and reset screens have never run against Supabase |
| 3.4 | Email verification and account activation | NEEDS CONFIGURATION | A login links to its student record only after the email is confirmed. Staff accounts start from an invitation. | Turn on "Confirm email" and SMTP in Supabase Auth |
| 3.4 | Administrator creates teacher and student accounts | NEEDS CONFIGURATION | Invitations from Teachers, Accounts or a student's page, through `admin-users` | Deploy `admin-users`; it has never run |
| 3.4 | Account creation through the public website | NEEDS VERIFICATION | Sign-up page. The approval email explains how to sign in. | — |

### Part 4: Public website and registration

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 4.1 | 15 public pages | NEEDS VERIFICATION | All present. Language and programme pages are generated from the catalogue (`/languages/:slug`, `/programmes/:slug`). The English, English for Beginners, Tamil and Malay pages appear once those programmes exist; Other Languages is the languages index. | — |
| 4.2 | Homepage content (13 items) | NEEDS VERIFICATION | Branding, introduction, mission and vision, languages, classes, group and one-to-one options, approach, "Why learn with Top Mind", registration call to action, contact details, Instagram and TikTok | — |
| 4.3 | Registration form fields (15) | NEEDS VERIFICATION | All 15, plus privacy, marketing and WhatsApp consent | — |
| 4.3 | Workflow steps 1–10 and 12 | NEEDS VERIFICATION | Server-side validation, hidden spam field, rate limits, class recommendation, record creation, admin alert, approval (test 02) | — |
| 4.3 | Step 11 (acknowledgement) and step 13 (login access and class information) | NEEDS CONFIGURATION | The tracking code is shown on screen. Acknowledgement and approval emails are queued. | Email provider (Part 18) |
| 4.3 | No automatic confirmation when a class is full or needs approval | FULLY IMPLEMENTED | Registrations wait for approval, and a full class puts the student on the waiting list (tests 02, 05) | — |
| 4.4 | Registration management | PARTIALLY IMPLEMENTED | View all; filter by status, language, programme and dates; approve; reject with reason; request information; assign class; waiting list; convert into student records | No filter by class |
| 4.4 | No duplicate registrations or student accounts | FULLY IMPLEMENTED | The same person and programme cannot have two open registrations, and there is one student record per email (test 02) | — |

### Part 5: Placement

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 5.1 | Configurable assessments per language and programme | NEEDS CONFIGURATION | The admin builds questions in seven sections: vocabulary, grammar, reading, sentence construction, listening (audio link), writing (marked by staff) and speaking. Each question has points, and each assessment has bands. | No questions are included. The academy must write them. |
| 5.2 | Automatic placement, steps 1–9 | NEEDS VERIFICATION | Score, band, then suitable classes with free places and matching times. The recommendation is shown to the student and reviewed by staff (test 03). | — |
| 5.2 | Configurable level labels | FULLY IMPLEMENTED | Levels and bands are data, not code | — |
| 5.3 | Override, change level, move group, record reasons, history, class proficiency distribution | NEEDS VERIFICATION | `place_student`, transfers, placement history, proficiency report (tests 03, 05) | — |
| 5.3 | Reassess students | PARTIALLY IMPLEMENTED | `start_my_assessment()` exists and is tested (test 03) | No screen calls it. Students cannot start a reassessment, and staff can only record a placement marked "Reassessment". |
| 5 | Never claim a quiz assessed speaking | FULLY IMPLEMENTED | Results say speaking was not assessed unless a speaking section ran (test 03) | — |

### Part 6: Classes

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 6.1 | Class fields (20) and class types (6) | NEEDS VERIFICATION | All fields. Types are group, one-to-one, special and trial; mode is online, physical or hybrid. | — |
| 6.2 | Class functions (13) | NEEDS VERIFICATION | All 13, in brief: create, edit, archive and activate classes; assign teachers; enrol, withdraw and transfer students; capacity; weekly times that generate lessons; calendars; class performance. Finances come from the dashboard and class-filtered reports. | The class page itself shows no money figures |
| 6.2 | Teacher and room clash checks | FULLY IMPLEMENTED | Test 04 | — |
| 6.3 | No hardcoded languages; new languages need no schema change or deployment | FULLY IMPLEMENTED | Confirmed in code: language names exist only as data | — |

### Part 7: Students

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 7.1 | Student profile fields (19) | NEEDS VERIFICATION | All present. Class and teacher come from enrolments, payment status from balances. Emergency contact and consent dates are stored. | — |
| 7.2 | Student management functions (15) | PARTIALLY IMPLEMENTED | Add, website registration, edit, search, filter, CSV export, history, enrolments, invoices, payments, receipts, attendance, suspend or reactivate, archive | "View lesson progress" shows level history and attendance only |
| 7.3 | Enrolment variants, with history kept | NEEDS VERIFICATION | Multiple classes and programmes, transfer, suspension, withdrawal, re-enrolment, waiting list (test 05) | — |

### Part 8: Attendance

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 8.1 | Teachers record attendance; five statuses; record fields | NEEDS VERIFICATION | `save_attendance` (test 06). Each record holds student, lesson (class, teacher, date, time), status, remarks, and who recorded it and when. | Phone use not checked |
| 8.2 | Attendance functions (10) | NEEDS VERIFICATION | Individual marks and "Mark everyone present", edits within the window, day view, week calendar, monthly reports, student history, class summaries, teacher filter, CSV and PDF export | — |
| 8.3 | Totals, percentage, thresholds and repeated-absence alerts | FULLY IMPLEMENTED | `attendance_summary()`, and alerts at the configured threshold (test 06) | — |
| 8.4 | Restrictions and change history | FULLY IMPLEMENTED | Tests 06 and 16 | — |

### Part 9: Invoicing

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 9.1 | Invoice details (18 items) | PARTIALLY IMPLEMENTED | Number, student name, ID and contact, class (in line items), period, dates, fees, extra charges, discounts, totals, paid, outstanding, payment instructions, business details | The language is not printed |
| 9.1 | RM by default, currency configurable | FULLY IMPLEMENTED | Currency setting, and a currency on every invoice | — |
| 9.2 | Monthly automation, steps 1–7, 10 and 11 | NEEDS VERIFICATION | Repeat-safe monthly run in Malaysia time; numbering; PDF built on download; delivery status in the outbox; shown in the portal (test 08) | — |
| 9.2 | Step 8: invoice email | NEEDS CONFIGURATION | Queued, with the invoice details and a portal link | Email provider. The PDF is not attached. |
| 9.2 | Step 9: WhatsApp notice | NEEDS INTEGRATION | Queued when WhatsApp is on and the student has consented | WhatsApp Business account |
| 9.2 | No duplicates when retried | FULLY IMPLEMENTED | A billing key per line item (tests 08, 14) | — |
| 9.3 | Invoice management (12) | NEEDS VERIFICATION | Manual invoices, monthly run, edit drafts, issue, void with reason, discounts, adjustments, partial payments, overdue, resend, download, history | — |
| 9.3 | Issued invoices never silently changed | FULLY IMPLEMENTED | Issued invoices are locked. Changes go through credit notes, debit notes or write-offs (test 08). | — |
| 9.4 | Invoice statuses | FULLY IMPLEMENTED | Draft, unpaid (shown as "Issued · unpaid"), partially paid, paid and void; overdue is computed from the due date | "Issued" and "Unpaid" are one status |
| 9.5 | Billing arrangements | PARTIALLY IMPLEMENTED | Monthly and per-lesson classes, completed one-to-one lessons, fee overrides and discounts per enrolment, manual lines for packages and trials | One billing day for everyone (`finance.billing_day`), although the specification says not to assume a shared billing date |

### Part 10: Payments

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 10.1 | Manual payment record fields | PARTIALLY IMPLEMENTED | Student, invoice, amount, date, method, reference, remarks, confirmed by | An administrator recording a payment cannot attach evidence; only student-submitted slips carry it |
| 10.1 | Configurable payment methods | NEEDS VERIFICATION | Bank transfer, DuitNow, cash and other, editable in Settings | — |
| 10.2 | Payment statuses | FULLY IMPLEMENTED | Pending, confirmed, rejected and refunded; "partly paid" lives on the invoice (test 09) | — |
| 10.3 | Workflow; a screenshot never confirms; only an admin or a verified gateway confirms | FULLY IMPLEMENTED | Slips create pending payments. Only `confirm_payment` (admin) or the signed webhook can confirm (test 09). | Sending the receipt needs email (Part 18) |
| 10.4 | Payment reports | PARTIALLY IMPLEMENTED | Total received, monthly income, outstanding, overdue, partial, by class, by language, history, date filters, CSV | By student and by method appear only as columns, with no breakdown |

### Part 11: Receipts

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 11.1 | Receipt details (12) | NEEDS VERIFICATION | All present in `receipt_document()` | — |
| 11.2 | Number, PDF, storage, links, portal download | NEEDS VERIFICATION | The number is assigned once, on confirmation (test 09). The PDF is drawn on download from stored data. | The PDF itself is not stored as a file |
| 11.2 | Email and WhatsApp delivery | NEEDS CONFIGURATION | Queued with the receipt number and a portal link | Email provider and WhatsApp account. The PDF is not attached. |
| 11.3 | Receipt management; no duplicate receipts | NEEDS VERIFICATION | View, search, download, resend, delivery status, links to payments and invoices; one receipt per payment (test 09) | — |

### Part 12: Teachers

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 12.1 | Teacher record fields (16) | NEEDS VERIFICATION | Code (TMT-0001), contact details, address, employment, languages, qualifications, classes, rates, availability, schedule, notes | — |
| 12.2 | Teacher functions (10) | NEEDS VERIFICATION | Add by invitation, edit, languages, class assignment, availability, schedules, salary history, activate or deactivate. Hours appear on salary statements. | Hours are not shown on the teacher page |
| 12.3 | Scheduling and conflict checks | NEEDS VERIFICATION | Weekly and one-off lessons, changes, substitutes, cancellations, rescheduling, clash checks (test 04) | — |

### Part 13: Teacher salaries

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 13.1–13.2 | Pay structures; calculation from verified lessons | FULLY IMPLEMENTED | Monthly, hourly, per lesson, per student and custom. Only completed lessons count, plus approved additions and deductions (test 10). | — |
| 13.3–13.4 | Salary records and workflow | NEEDS VERIFICATION | Statement fields, admin approval, payments with references, outstanding pay, teacher view (test 10) | — |

### Part 14: One-to-one booking

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 14.1 | Teacher availability settings | NEEDS VERIFICATION | Weekly hours with date ranges, time off for unavailable dates and holidays, minimum notice, booking horizon, durations, buffer, format. Admins can edit these on the teacher page. | Breaks are entered as gaps between hours |
| 14.2 | Student booking flow (10 steps) | PARTIALLY IMPLEMENTED | Language, teacher, dates, times, length, objective, request, confirmation, reminder job | No "any available teacher" option, although the database supports it. The reminder job runs in tests, but its messages are not checked. |
| 14.3 | Booking rules | FULLY IMPLEMENTED | Double booking, availability, time zones, cancellation window, rescheduling, approval, tracking of completed and cancelled sessions, links to attendance, invoices and teacher pay (test 11) | — |
| 14.4 | Administrator booking management | NEEDS VERIFICATION | View all, teacher calendars, approve or reject, reassign, reschedule, cancel, history | — |

### Part 15: Lesson materials

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 15.1 | Upload types | NEEDS VERIFICATION | Lesson plans, slides, PDF, worksheets, Word, images, audio, video, quizzes, resources | — |
| 15.2 | Organisation | NEEDS VERIFICATION | By class (and through it programme, language and level), uploader, lesson label, topic and date | Every upload must pick a class |
| 15.3 | Access control | FULLY IMPLEMENTED | Test 07 | — |
| 15.4 | Material management | PARTIALLY IMPLEMENTED | Opens through a two-minute private link (browser preview for PDFs and images), download, 50 MB limit, file-type allowlist, progress bar, error messages, private storage | Storage management: removed files are never purged from storage, and there is no usage view |

### Part 16: Monthly checklist

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 16.1–16.2 | Categories A–H and item fields | NEEDS VERIFICATION | 37 template tasks; pending, in progress, completed and not applicable; assignee, due date, completion date, notes, evidence, last updated by | — |
| 16.3 | Automatic updates; no ticking without the underlying work | FULLY IMPLEMENTED | Test 14 | — |

### Part 17: Dashboard and reports

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 17.1 | 16 key metrics | NEEDS VERIFICATION | All computed by `admin_dashboard()` (test 15) | — |
| 17.2 | Financial dashboard | PARTIALLY IMPLEMENTED | Monthly income, income by class and by language, outstanding fees, overdue, partial, salary expenses, net balance. Collected and invoiced amounts are kept apart. | No income by student |
| 17.3 | Class performance | NEEDS VERIFICATION | Students, capacity, free places, attendance, monthly revenue, teacher, status | — |
| 17.4 | 13 reports with filters, PDF and CSV | NEEDS VERIFICATION | 14 report types, filterable by date, month, language, class and teacher (test 15) | — |

### Part 18: Notifications

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 18.1 | Email for the 13 listed events | NEEDS CONFIGURATION | A template exists for each event | Email provider and dispatcher schedule. Nothing has ever been sent. |
| 18.2 | WhatsApp through the official API | NEEDS INTEGRATION | Cloud API sender with 10 templates | WhatsApp Business account and approved templates |
| 18.2 | Class schedule reminder | NOT IMPLEMENTED | — | No lesson-reminder template or job exists for any channel. Only one-to-one bookings get reminders. |
| 18.2 | Consent, delivery status, failures, resend, no repeats, email fallback | FULLY IMPLEMENTED | Test 12 | — |
| 18.3 | Notification centre and portal notifications | NEEDS VERIFICATION | Type, recipient, dates, status, related record, error and retries; in-app notifications with read state | — |

### Part 19: Instagram and TikTok enquiries

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 19.1 | Enquiry inbox fields | NEEDS VERIFICATION | Name, platform, username, message, date, interested language and programme, status, assignee, follow-up date | Interest is recorded as a programme, not a class |
| 19.2 | Workflow steps 3–9 | NEEDS VERIFICATION | Record, platform, automatic category, suggested reply, send, conversion to a registration (test 13) | — |
| 19.2 | Step 2: messages arrive through an integration | NEEDS INTEGRATION | Instagram webhook with signature checks, and a signed endpoint for forwarders | Meta app and review. TikTok has no official message API. |
| 19.3 | Replies to the 9 common questions, using live data | NEEDS VERIFICATION | 8 saved replies. Tamil and Malay questions are answered by the languages reply, using live data (test 13). | — |
| 19.4 | Fallbacks, and no false claims | FULLY IMPLEMENTED | Contact form, tracked registration links, manual entry, modular webhooks. Settings shows each integration as needing setup. | — |

### Part 20: Online payment gateway

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 20 | Online payment links and online invoice payment | NEEDS INTEGRATION | `create-payment-link` for Billplz, ToyyibPay and Stripe, and a "Pay online" button behind a setting (unit tests) | A merchant account and secrets. Never run against a provider. |
| 20 | Signature checks, duplicate events, references, automatic invoice update and receipt | NEEDS VERIFICATION | Signature checks are unit-tested. `apply_gateway_payment()` records the payment and issues the receipt. | `apply_gateway_payment()` has no automated test |
| 20 | Refund tracking, failed payments, reconciliation | PARTIALLY IMPLEMENTED | Manual refunds (test 09). Gateway events are stored with their status. | Gateway refunds are not processed, and no screen lists gateway events for reconciliation |
| 20 | No card storage; no confirmation from a redirect; manual payments continue | FULLY IMPLEMENTED | Card details never reach the system. The return page only shows a note. | — |

### Part 21: Automation engine

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 21.1 | Required automations | PARTIALLY IMPLEMENTED | Registration, invoicing, payment, missing attendance, absence alerts, salary statements, booking confirmation, reminders and cancellations, checklist updates and overdue alerts | Monthly attendance summaries are not generated automatically; they exist only as an on-demand report |
| 21.2 | Reliability: manual runs, retries, error log, duplicate prevention, history, failure alerts, Malaysia time | FULLY IMPLEMENTED | Test 14 | — |
| 21.2 | Scheduled execution | NEEDS CONFIGURATION | An hourly pg_cron job is created when pg_cron is available | Turn on pg_cron, pg_net and Vault, and schedule the dispatcher |
| 21.2 | Configurable billing dates, reminder intervals and schedules | NEEDS VERIFICATION | Settings and the Automations page | — |

### Part 22: Database

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 22.1 | Core entities (37) | PARTIALLY IMPLEMENTED | 36 of 37 have a table or an equivalent: receipts are stored on payments, and social conversations as enquiry messages | No permissions entity; rights come from three fixed roles |
| 22.2 | Data integrity | FULLY IMPLEMENTED | Keys, constraints, indexes, transactional functions, soft deletion, history, financial records that cannot be deleted (tests 08, 09) | — |
| 22.3 | Scalability | FULLY IMPLEMENTED | Centres and rooms; a currency on each invoice; time zones on classes, students and teachers | — |

### Part 23: Security and privacy

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 23 | Security controls (14 of the 15 listed) | FULLY IMPLEMENTED | Confirmed by tests 01, 07, 16 and 17, and in the code. Details below the table. | Backups: next row |
| 23 | Backup procedures | NEEDS CONFIGURATION | docs/DEPLOYMENT.md says to back up before running migrations | Choose a Supabase plan with backups or point-in-time recovery, and write a restore procedure |
| 23 | PDPA: privacy policy | NEEDS CONFIGURATION | Draft privacy notice and terms | Legal review |
| 23 | PDPA: consent, access controls, correction, deactivation, export, deletion | NEEDS VERIFICATION | Tests 16 and 17 cover the server side | — |
| 23 | PDPA: data retention settings | PARTIALLY IMPLEMENTED | Settings for financial records (7 years) and inactive students (3 years) | Nothing enforces them; erasure is manual |
| 23 | No unnecessary personal data | FULLY IMPLEMENTED | Date of birth is optional, and no identity numbers are collected | — |

The 14 security controls are:

- Supabase Auth.
- Row-level security on every table.
- Checked server functions for every write that matters.
- Input validation.
- Only parameterised queries: no SQL is built from user input.
- No raw HTML rendering.
- Bearer-token authentication: no cookie sessions, so CSRF does not apply.
- Private storage.
- Short-lived file links.
- Rate limits.
- An audit log.
- Error messages that don't expose internals.

### Part 24: Settings

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 24 | Business, financial, teacher, communication, social media and automation settings | NEEDS VERIFICATION | Detailed below the table | Email, WhatsApp and social media credentials are Supabase secrets, not entered on the page. The Integrations tab still calls online payments "Future… Not chosen yet". |
| 24 | Academic: class categories | PARTIALLY IMPLEMENTED | Fixed class types: group, one-to-one, special, trial | New categories cannot be added in Settings |

The settings page has nine tabs: business, finance, academic, one-to-one, communication, message templates, enquiry replies, integrations and privacy. Pay rates and booking rules are set per teacher, and job schedules on the Automations page.

### Part 25: UI and UX

| Ref | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 25.1–25.3 | Navigation for the three portals | NEEDS VERIFICATION | Every item in the specification is in `PortalLayout.tsx`. Extras: Accounts & access, Placement tests, Expenses, Automations, Audit log, and a One-to-one page for teachers. | — |
| 25.4 | Dashboard design | NEEDS VERIFICATION | Cards, tables, simple charts, search, filters, status badges, calendars | — |
| 25.5 | Desktops, tablets and phones | NEEDS VERIFICATION | Responsive layouts | Never checked on a device |

## Gaps found

Nothing was fixed during this audit, as instructed.

| # | Gap | Spec | Severity |
| --- | --- | --- | --- |
| 1 | No class schedule reminders: no lesson-reminder template or job for any channel | 18.2 | Medium |
| 2 | One billing day for every student; no per-student or per-enrolment billing date | 9.5 | Medium |
| 3 | Learning progress is thin: no progress view across lessons, and students cannot see lesson notes | 2.5, 3.3, 7.2 | Medium |
| 4 | Reassessment cannot be started from any screen; `start_my_assessment()` is never called | 5.3 | Medium |
| 5 | `apply_gateway_payment()` has no automated test, although it records money and issues receipts | 20 | Medium |
| 6 | The language is not printed on invoices | 9.1 | Low |
| 7 | Registrations cannot be filtered by class | 4.4 | Low |
| 8 | One-to-one booking has no "any available teacher" choice | 14.2 | Low |
| 9 | Admin-recorded payments cannot carry evidence | 10.1 | Low |
| 10 | No payment or income breakdown by student or by method | 10.4, 17.2 | Low |
| 11 | Monthly attendance summaries are not generated automatically | 21.1 | Low |
| 12 | Removed material files are never purged from storage, and there is no storage usage view | 15.4 | Low |
| 13 | Gateway refunds are not processed, and there is no screen for gateway events or reconciliation | 20 | Low until a gateway is live |
| 14 | Retention settings are stored but not enforced | 23 | Low |
| 15 | Class categories are fixed in code | 24 | Low |
| 16 | No custom or per-user permission sets | 3.1, 22.1 | Low (fixed roles by design) |
| 17 | Material uploads require a class, so academy-wide teacher-training documents have nowhere to go | 2.5, 15.2 | Low |
| 18 | Payment and booking reminder jobs are tested only for running, not for the messages they send | 26.7 | Low |
| 19 | Invoice and receipt emails link to the portal instead of attaching the PDF, and receipt PDFs are not stored as files | 9.2, 11.2 | Low |
| 20 | Settings → Integrations still describes online payments as "Future… Not chosen yet" | 24 | Cosmetic |
| 21 | The logo is stored three times (`public/`, `src/assets/`, `assets/logo/`) | — | Cosmetic |

## Verification evidence

Run fresh for this audit on 2 November 2026.

| Check | Command | Result |
| --- | --- | --- |
| Frontend typecheck (strict) | `npm run typecheck` | Pass |
| Edge Function typecheck | `npm run typecheck:functions` | Pass |
| Edge Function helper unit tests | `npm run test:functions` | 13 of 13 pass |
| Database suite: PostgreSQL 16 with a Supabase stand-in, migrations 0001–0010, 17 files | `npm run test:db` | 564 checks pass |
| Frontend calls compared with the real schema | `npm run check:queries` | 161 table queries, 107 RPC calls, 8 storage calls and 9 Edge Function calls; no problems |
| Production build, written to a scratch folder so `dist/` is untouched | `vite build` | Pass |

Not verified:

- No screen has been run in a browser against a live Supabase project.
- No Edge Function has run on Deno or against a real provider.
- The Supabase stand-in may differ in small ways from the real platform.

## Testing coverage against Part 26

| Spec test | Covered by automated tests | Not yet covered |
| --- | --- | --- |
| 26.1 Authentication | Role restrictions, unauthorised access and suspended accounts (test 01) | Real logins for each role, wrong passwords, password-reset emails |
| 26.2 Student workflow | Registration, profile update, assessment, recommendation, approval, enrolment, schedule data (tests 02, 03, 05, 15, 16) | Class information by email; all screens |
| 26.3 Attendance | Teacher scope, saving, admin and student views, summaries (tests 06, 15, 16) | Screens, including on a phone |
| 26.4 Invoices and payments | Generation, manual recording, confirmation, balance update, receipt, partial payments, outstanding balances (tests 08, 09) | Opening the PDF, email delivery, student download |
| 26.5 Teacher salary | Calculation from completed lessons, verification, payment, outstanding pay, teacher view (test 10) | Screens |
| 26.6 Booking | Available and unavailable slots, double booking, cancellation, rescheduling, teacher conflicts, notifications queued, completed records (test 11) | Screens |
| 26.7 Automation | Monthly invoices, duplicate prevention, receipts, failed-message retries, checklist updates (tests 08, 12, 14) | Email and WhatsApp delivery; reminder message content |
| 26.8 Security | Student isolation, teacher scope, salary privacy, no payment confirmation by students, no financial edits by teachers, material access (tests 01, 07, 09, 10, 16) | API checks through the real Supabase endpoints |

## Part 27: implementation phases

- **Phases 1–5:** every listed item exists in code. Their statuses are in the tables above.
- **Phase 6:**
  - Additional languages, teachers, programmes and multiple locations are supported.
  - The future payment gateway is built but needs integration.
  - Advanced reports exist.
  - Performance optimisation is limited to database indexes; there has been no load testing.
  - The security audit consists of the security tests and this audit; no independent penetration test has been done.

## Part 28: final acceptance criteria

Only three criteria arrived before the specification was cut off:

| Criterion | Status |
| --- | --- |
| Administrator can manage the entire business from one system | NEEDS VERIFICATION. Every module is in the admin portal. |
| Administrator can add new languages | NEEDS VERIFICATION. The Languages & programmes page writes to the `languages` table. |
| "Administrator can create ne…" | The text stops here. This item and everything after it could not be audited. |
