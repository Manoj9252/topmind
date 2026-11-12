# Deployment guide

How to put the Top Mind Enterprise system live on Supabase and a static web host. Follow the steps in order. The integration guide, [INTEGRATIONS.md](INTEGRATIONS.md), covers email, WhatsApp, social media and payment gateways.

## 1. What you need

- A Supabase project. Any plan works; pg_cron, pg_net and Vault are available on all of them.
- Node.js 20 or later and npm, to build the website.
- The Supabase CLI (`npm i -g supabase`, or `npx supabase …`), to deploy the Edge Functions.
- A static web host with single-page-app routing, such as Netlify, Vercel or Cloudflare Pages.

## 2. Database

Apply the migrations in `supabase/migrations` in file-name order, `0001` through `0010`. Use one of these two methods:

- **SQL editor.** Open each file, paste it in, and run it. Each file is one transaction, so if one fails, nothing from it is kept. Fix the problem, then run it again.
- **CLI:**

  ```bash
  supabase link --project-ref <project-ref>
  supabase db push
  ```

The migrations upgrade a database that already ran the original `0001` and `0002` without losing data. Back up first anyway (Dashboard → Database → Backups).

**Optional:** run `supabase/seed.sql` for a sample catalogue (programmes, levels, one centre and rooms) with placeholder fees. It creates no students, and you can safely run it more than once.

## 3. Authentication

In Dashboard → Authentication:

1. **URL configuration:**
   - Site URL: `https://<your-site>`.
   - Redirect URLs: add `https://<your-site>/reset`. Password-reset and invitation links land there.
2. **Email confirmation:** turn on "Confirm email".
   - A student login is linked to the student record only after the email is confirmed, and only when the email matches the one on the registration.
3. **SMTP:** set up custom SMTP so sign-up, invitation and reset emails come from your own domain. Supabase's built-in sender is rate-limited and meant only for testing. You can use Resend's SMTP details (see INTEGRATIONS.md).
4. **First administrator:**
   1. Open the site and sign up with the owner's email.
   2. Confirm the email.
   3. Run this in the SQL editor:

      ```sql
      update profiles set role = 'admin' where email = 'etopmind@gmail.com';
      ```

   4. Invite everyone else from inside the app: Admin → Teachers → Invite, or Admin → Accounts. Public sign-ups are always students.

## 4. Settings to fill in before going live

Go to Admin → Settings:

| Setting | Why |
| --- | --- |
| Business address and registration number | Printed on invoices and receipts |
| Bank account details | Shown on invoices and on the student payment page |
| Payment instructions | Shown on every invoice |
| Admin alert email | Receives new registrations, payment slips and failure alerts |
| Attendance rules, booking cancellation window, billing day, invoice due days | Business rules; the defaults are sensible |

Also:

- Check the payment methods (bank transfer, DuitNow, cash, other) in the same Settings page.
- In Admin → Assessments, write at least one placement assessment per language, with its placement bands. None are included.

## 5. Edge Functions

```bash
supabase functions deploy admin-users
supabase functions deploy create-payment-link
supabase functions deploy dispatch-messages
supabase functions deploy payment-webhook
supabase functions deploy social-webhook
```

Then set the secrets:

1. Copy `supabase/functions/.env.example` to `supabase/functions/.env`. That file is git-ignored.
2. Fill in the values you have.
3. Run `supabase secrets set --env-file supabase/functions/.env`.

Hosted functions get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically, so you don't set those. At minimum, set:

- `SITE_URL`, needed for invitation links and CORS;
- `DISPATCH_SECRET`, a long random string, for example from `openssl rand -hex 32`.

`supabase/config.toml` already turns off JWT verification for `dispatch-messages`, `payment-webhook` and `social-webhook`, which check their own secrets and signatures.

## 6. Scheduled jobs

Enable the extensions in Dashboard → Database → Extensions: **pg_cron**, **pg_net** and **Vault** (`supabase_vault`).

**Automations (hourly).** Migration `0007` creates the job `topmind-automations` if pg_cron was already enabled. Check with:

```sql
select jobname, schedule from cron.job;
```

If the job is missing, enable pg_cron and run:

```sql
select cron.schedule('topmind-automations', '5 * * * *', 'select public.run_due_automations()');
```

**Message dispatcher (every minute).** This sends queued emails and WhatsApp messages:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/dispatch-messages', 'dispatch_url');
select vault.create_secret('<the same DISPATCH_SECRET>', 'dispatch_secret');

select cron.schedule('topmind-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_secret')),
    body := '{}'::jsonb)
$$);
```

Until the dispatcher runs, messages wait safely in the outbox (Admin → Notification centre). They are sent when it starts.

## 7. Website

1. Create `.env` from `.env.example` with the project URL and the **anon** key, found in Dashboard → Project Settings → API. Never use the service-role key here.
2. Build:

   ```bash
   npm ci
   npm run build
   ```

3. Upload `dist/`, or connect the repository to the host with build command `npm run build` and output directory `dist`. Set the same two `VITE_` variables in the host's settings.
4. Single-page-app routing: every path must serve `index.html`.
   - Netlify: add a file `public/_redirects` containing `/* /index.html 200`.
   - Vercel: add a rewrite of `/(.*)` to `/index.html`.
   - Cloudflare Pages: serves `index.html` for unknown paths automatically.

## 8. Go-live checklist

- [ ] All ten migrations applied; `select count(*) from audit_logs;` runs without error.
- [ ] Email confirmation is on, the redirect URLs are set, and SMTP works (send yourself a password reset).
- [ ] The owner account is an admin, and test teacher and student accounts work.
- [ ] Settings are filled: bank details, address, registration number, alert email.
- [ ] At least one assessment per language exists.
- [ ] Edge Functions are deployed with secrets. Admin → Notification centre shows the email channel as configured.
- [ ] `cron.job` lists `topmind-automations` and `topmind-dispatch`.
- [ ] The privacy notice and terms have been reviewed for PDPA compliance.
- [ ] The walkthrough in NEXT_STEPS.md ("Live verification checklist") has been run for each role.

## 9. Later updates

Add new migrations as new numbered files, `0009_…` and so on. Never edit an applied migration. Always take a backup before applying. Financial records can't be deleted through the app; this is deliberate.
