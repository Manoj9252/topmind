# Top Mind Enterprise: class management system

Website and management system for Top Mind Enterprise, a language school. It has a public website with online registration and placement assessment, plus three portals:

- **Admin:** students, teachers, classes, attendance, billing, salaries, enquiries, reports and automation.
- **Teacher:** classes, attendance, schedule, one-to-one bookings, materials and salary.
- **Student:** classes, timetable, attendance, materials, invoices and payments, receipts and booking.

Built with React 18, TypeScript and Tailwind on the frontend, and Supabase (Postgres, Auth, Storage, Edge Functions) as the backend. All business rules and permissions are enforced in the database.

## Quick start (development)

```bash
npm install
cp .env.example .env     # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only)
npm run dev
```

The database must have every migration in `supabase/migrations` applied, in order. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full setup: database, authentication, first admin, Edge Functions, scheduled jobs and hosting.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run typecheck` | Typecheck the frontend |
| `npm run typecheck:functions` | Typecheck the Edge Functions |
| `npm run test:functions` | Unit tests for the Edge Function helpers |
| `npm run test:db` | Database test suite (needs a local PostgreSQL; see below) |
| `npm run check:queries` | Check every frontend query and RPC call against the schema |
| `npm test` | All of the above except the build |

`test:db` and `check:queries` create throwaway databases on the server named by `TEST_DATABASE_URL` (default `postgres://postgres@localhost:54329/postgres`). Point them at a local PostgreSQL 15 or later server, never at a real Supabase project.

## Documentation

- [SYSTEM_AUDIT.md](SYSTEM_AUDIT.md): status of every requirement area, and test evidence.
- [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md): what has been built, phase by phase, and what is left.
- [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md): architecture, database rules, Edge Functions, configuration and testing.
- [NEXT_STEPS.md](NEXT_STEPS.md): the next tasks and the live verification checklist.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): going live.
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): email, WhatsApp, Instagram, TikTok and payment gateways.

## Security rules for contributors

- Only the Supabase **anon** key goes in `VITE_` variables. The service-role key and every provider secret belong in Edge Function secrets.
- Change permissions only in new migrations. Hiding something in the frontend is not a security control.
- Financial records cannot be deleted through the app. Corrections are made with voids, credit notes and refunds.
