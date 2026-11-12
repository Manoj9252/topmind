# Integrations guide

The system works without any third-party service:

- In-app notifications and the message outbox work.
- Enquiries can be entered by hand.
- Payments by bank transfer or DuitNow are confirmed against an uploaded slip.

Each integration below adds one channel. Every integration uses only official APIs, and none counts as working until its credentials are set and a test message has gone through. Secrets go in `supabase/functions/.env` (see `.env.example` next to it) and are loaded with `supabase secrets set`. Never put them in the website's `.env`.

## Email (Resend)

Used for registration acknowledgements, invoices, receipts, reminders, booking updates and admin alerts.

1. Create a Resend account and add your domain. Add the DNS records Resend shows (SPF and DKIM) and wait for "Verified". You cannot send from a Gmail address; use your own domain, for example `hello@topmind.my`.
2. Create an API key with "Sending access".
3. Set these secrets:
   - `RESEND_API_KEY`;
   - `EMAIL_FROM`, for example `Top Mind Enterprise <hello@topmind.my>`;
   - optionally `EMAIL_REPLY_TO=etopmind@gmail.com`.
4. Deploy `dispatch-messages` and schedule it (DEPLOYMENT.md, step 6).
5. Test: in Admin → Notification centre, check that the email channel is configured. Then resend an invoice to yourself and watch its status change from queued to sent.

Failed messages are retried with increasing delays. Permanent failures show in the notification centre, where you can retry or resend them. The same Resend account can also provide SMTP for Supabase Auth emails: host `smtp.resend.com`, port 465, user `resend`, password = an API key.

## WhatsApp (WhatsApp Business Platform, Cloud API)

Used only for students who ticked WhatsApp consent, and only for the templates below. If a WhatsApp message fails, the same message goes by email instead.

1. In Meta Business Suite:
   1. Set up the WhatsApp Business Platform.
   2. Add and verify the business phone number.
   3. Note the **Phone number ID**.
2. Create a **system user** with a permanent access token that has `whatsapp_business_messaging`.
3. Create these message templates (category: Utility, language: English), with the parameters in exactly this order:

| Template name | Parameters, in order |
| --- | --- |
| `topmind_registration_received` | name, programme, tracking_code |
| `topmind_registration_approved` | name |
| `topmind_class_assigned` | name, class_name, schedule, start_date |
| `topmind_lesson_cancelled` | name, class_name, lesson_date, reason |
| `topmind_invoice_issued` | name, invoice_no, amount, due_date |
| `topmind_payment_reminder` | name, invoice_no, balance, due_date |
| `topmind_payment_overdue` | name, invoice_no, balance, due_date |
| `topmind_payment_confirmed` | name, amount, receipt_no |
| `topmind_booking_confirmed` | name, teacher_name, when |
| `topmind_booking_reminder` | name, teacher_name, when |

   Template names and parameters are stored in the `message_templates` table (`wa_template_name`, `wa_params`). If Meta approves different names, change them there.

4. Set these secrets:
   - `WHATSAPP_TOKEN`;
   - `WHATSAPP_PHONE_NUMBER_ID`;
   - optionally `WHATSAPP_API_VERSION` (default `v21.0`).
5. Turn on **Send WhatsApp messages** (`communication.whatsapp_enabled`) in Admin → Settings.

Phone numbers are normalised to the Malaysian international format (`012…` becomes `6012…`). The website's chat link, `wa.me`, is separate and needs no setup.

## Instagram direct messages (Meta)

New Instagram messages become enquiries in Admin → Enquiries, where staff can reply.

1. Make the Instagram account a **professional (business) account**.
2. Create a Meta app and add the Instagram messaging product.
3. Request the messaging permissions (for example `instagram_business_manage_messages`) and complete **App Review**. Until the review passes, only app testers' messages arrive.
4. Configure the webhook:
   - Callback URL: `https://<project-ref>.supabase.co/functions/v1/social-webhook`.
   - Verify token: any long random string; set the same value as `META_VERIFY_TOKEN`.
   - Subscribe to `messages`.
5. Set these secrets:
   - `META_APP_SECRET`, used to check `X-Hub-Signature-256` on every delivery;
   - `INSTAGRAM_ACCESS_TOKEN`;
   - `INSTAGRAM_ACCOUNT_ID`;
   - optionally `META_API_VERSION`.

Replies typed in the enquiry screen go out through `social-webhook?action=reply`, which only admins can call. Meta allows free-form replies only within 24 hours of the customer's last message.

## TikTok

TikTok has no official API that delivers direct messages to a business system for this purpose. The system therefore does not claim to automate TikTok. Two options:

- **Manual entry.** Staff add the enquiry in Admin → Enquiries and choose source "TikTok". Suggested replies and conversion to a registration work the same way.
- **Forwarder.** Any compliant tool that already receives your TikTok leads can post them to `https://<project-ref>.supabase.co/functions/v1/social-webhook?source=generic`.
  - Body: JSON `{ "platform": "tiktok", "message_id": "...", "sender_id": "...", "username": "...", "name": "...", "text": "..." }`, or an array of those objects.
  - Signing: compute `HMAC-SHA256(raw body, SOCIAL_WEBHOOK_SECRET)` in hex and send it in the header `X-Topmind-Signature: sha256=<hex>`.
  - Duplicate message IDs are ignored.

## Online payment gateways

Bank transfer and DuitNow with a slip upload already work. An admin confirms each payment; a slip or a browser redirect never confirms one by itself.

**How it works.** The pieces below are built and unit-tested, but have never run against a real provider:

1. The student clicks **Pay online** on an invoice. The button appears only when **Online payments** is on in Admin → Settings.
2. The `create-payment-link` Edge Function reads the invoice with the student's own sign-in, so the database decides whether they may pay it. It then creates a bill or checkout session for the outstanding balance with the provider named in `PAYMENT_GATEWAY`. It records a `payment_links` row and sends the student to the provider's page. An open link for the same amount is reused.
3. The provider calls `payment-webhook?provider=…`. The webhook verifies the signature (Billplz, Stripe) or asks the provider for the bill status (ToyyibPay). Duplicate events are ignored. `apply_gateway_payment()` then records the confirmed payment and issues the receipt.
4. The student returns to their invoices page and sees a note that confirmation is on its way. Coming back from the payment page confirms nothing by itself.

**To switch it on:**

1. Open a merchant account with one provider.
2. Set `PAYMENT_GATEWAY` and that provider's secrets, from the table below, with `supabase secrets set`.
3. Deploy `create-payment-link` and `payment-webhook`.
4. Register the webhook URL with the provider.
5. Make one small test payment in the provider's sandbox, and check that the receipt appears.
6. Turn on **Online payments** in Settings.

| Provider | Webhook URL to register | Secrets |
| --- | --- | --- |
| Billplz | Set per bill automatically: `…/functions/v1/payment-webhook?provider=billplz` | `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`; `BILLPLZ_BASE_URL` (`https://www.billplz-sandbox.com` for sandbox) |
| ToyyibPay | Set per bill automatically: `…/functions/v1/payment-webhook?provider=toyyibpay` | `TOYYIBPAY_SECRET_KEY`, `TOYYIBPAY_CATEGORY_CODE`; `TOYYIBPAY_BASE_URL` (`https://dev.toyyibpay.com` for sandbox) |
| Stripe | Add in the Stripe dashboard: `…/functions/v1/payment-webhook?provider=stripe`, events `checkout.session.completed` and `payment_intent.succeeded` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. The link ID is sent as `client_reference_id` and `metadata.payment_link_id` automatically. |

Payments made online are recorded with the `online_gateway` method. You don't need to turn that method on: it only controls whether staff can pick it when recording a payment by hand.
