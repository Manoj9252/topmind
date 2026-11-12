TOP MIND ENTERPRISE — CLIENT DEMO (REVISION 2)

SETUP (WINDOWS)
1. Extract the ZIP. Open the SINGLE TopMind-Client-Demo folder containing package.json.
2. Install Node.js LTS if not installed.
3. Double-click START_DEMO.bat or run npm install then npm run dev.
4. Open the Local browser URL (normally http://localhost:5173).
5. Sign in using demo-role buttons on the login page.

NO SUPABASE, DATABASE SERVER, PAYMENT GATEWAY, OR REAL EMAIL SENDING REQUIRED.
Payments and receipts are manual/simulated accounting entries, NOT real transactions.
Browser localStorage holds most business data; IndexedDB stores uploaded file bytes.
Change roles within the SAME browser to see shared changes. Different devices DO NOT sync.
Do not put real customer details, personal identifiers or payment credentials in this demo.

WHAT IS NEW IN THIS REVISION
- Live-in-demo audit entries for record changes, including payment and payroll changes.
- Search and filters for teachers and audit log (existing pages have many other filters).
- Reminder simulator: upcoming class notifications and outstanding invoice reminders.
- Monthly tuition billing simulator, with per-student billing day (days 1–28).
- Booking availability filtering and no-overlap checks; find first available teacher.
- Learning-progress portal views: record observations and view progress history.
- Invoice creation/editing/issuing, due changes, adjustments, payment and receipt records.
- Salary approval/payment/adjustment demo bookkeeping and generated pay statements.
- Attendance, payment, progress and salary CSV reporting; invoice/receipt PDF previews.
- Academy-wide teacher-training materials, file uploads via browser storage.
- Additional teacher account and student form validation.
- Small-screen layout improvements.

TESTING
npm run typecheck
npm run typecheck:functions
npm run test:demo
node --experimental-strip-types --test supabase/functions/_shared/shared.test.ts

WHAT REMAINS SIMULATED / NOT VERIFIED
- No real email, WhatsApp, bank collection, cross-device sync or live scheduled tasks.
- Clicking Run now simulates automation. It does NOT run unattended.
- PDFs and Excel-friendly CSV reports are available; native XLSX export is not implemented.
- Full end-to-end browser testing on a Windows laptop has not been completed here.
- Production build in this environment cannot run because the imported dependency
  bundle lacked the Linux native Rollup optional module. Windows npm install can
  fetch the appropriate Windows binaries.
- Existing demo data may use previous schema; if anything behaves strangely,
  clear the site's storage ONLY after exporting or deciding to discard old demo data.

Do not treat this browser demo as a secure production class management system.
