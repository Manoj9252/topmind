// Unit tests for the runtime-neutral Edge Function modules.
// Run with: npm run test:functions   (Node 22.6+ runs TypeScript directly)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hmacSha256Hex, safeEqual } from './crypto.ts'
import {
  billplzCreateBill, parseBillplz, parseBillplzBill, parseStripe, parseStripeCheckout, parseToyyibpayBill, parseToyyibpayTransactions,
  stripeCreateCheckout, toyyibpayCreateBill, verifyBillplz, verifyStripe, type CheckoutInput,
} from './gateways.ts'
import { metaChallenge, parseGenericSocial, parseInstagramWebhook, verifyMetaSignature } from './social.ts'
import { escapeHtml, renderEmailHtml, sendEmail, sendWhatsApp, whatsappPayload, type OutboxMessage } from './messaging.ts'

test('HMAC-SHA256 matches the published test vector', async () => {
  assert.equal(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
})

test('constant-time comparison', () => {
  assert.ok(safeEqual('abc', 'abc'))
  assert.ok(!safeEqual('abc', 'abd'))
  assert.ok(!safeEqual('abc', 'abcd'))
})

test('Billplz X-Signature: valid, tampered and missing key', async () => {
  const key = 'S-test-signature-key'
  const params: Record<string, string> = { id: 'bill123', paid: 'true', paid_amount: '15000', paid_at: '2026-11-02 10:00:00 +0800', state: 'paid' }
  const source = Object.keys(params).map((k) => k + params[k]).sort().join('|')
  params['x_signature'] = await hmacSha256Hex(key, source)
  assert.ok(await verifyBillplz(params, key))
  assert.ok(!(await verifyBillplz({ ...params, paid_amount: '1' }, key)), 'changed amount must fail')
  assert.ok(!(await verifyBillplz(params, '')), 'no key configured must fail')
  const ev = parseBillplz(params)!
  assert.equal(ev.amount, 150)
  assert.equal(ev.externalId, 'bill123')
  assert.ok(ev.paid)
})

test('Stripe signature: valid, tampered, expired', async () => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', amount_total: 25000, payment_intent: 'pi_1', payment_status: 'paid', client_reference_id: 'link_1' } } })
  const t = 1_800_000_000
  const header = `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`
  assert.ok(await verifyStripe(body, header, secret, 300, t + 10))
  assert.ok(!(await verifyStripe(body.replace('25000', '1'), header, secret, 300, t + 10)), 'tampered body must fail')
  assert.ok(!(await verifyStripe(body, header, secret, 300, t + 1000)), 'old signature must fail')
  const ev = parseStripe(JSON.parse(body))!
  assert.equal(ev.amount, 250)
  assert.equal(ev.externalId, 'link_1')
})

test('ToyyibPay: only a paid transaction from the API counts', () => {
  assert.equal(parseToyyibpayTransactions('abc', [{ billpaymentStatus: '3' }]), null)
  const ev = parseToyyibpayTransactions('abc', [{ billpaymentStatus: '1', billpaymentAmount: '120.00', billpaymentInvoiceNo: 'TP1' }])!
  assert.equal(ev.amount, 120)
  assert.equal(ev.transactionId, 'TP1')
})

test('Meta webhook verification and signature', async () => {
  const params = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '42' })
  assert.equal(metaChallenge(params, 'tok'), '42')
  assert.equal(metaChallenge(params, 'other'), null)
  assert.equal(metaChallenge(params, ''), null, 'an empty verify token never matches')
  const body = '{"object":"instagram"}'
  assert.ok(await verifyMetaSignature(body, `sha256=${await hmacSha256Hex('appsecret', body)}`, 'appsecret'))
  assert.ok(!(await verifyMetaSignature(body, 'sha256=00', 'appsecret')))
})

test('Instagram messages are parsed, echoes skipped', () => {
  const msgs = parseInstagramWebhook({
    object: 'instagram',
    entry: [{ messaging: [
      { sender: { id: 'u1' }, timestamp: 1700000000000, message: { mid: 'm1', text: 'Do you teach Tamil?' } },
      { sender: { id: 'me' }, message: { mid: 'm2', text: 'Yes!', is_echo: true } },
      { sender: { id: 'u2' }, message: { mid: 'm3' } },
    ] }],
  }, 'me')
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].text, 'Do you teach Tamil?')
  assert.equal(parseGenericSocial({ message_id: 'x', sender_id: 'y', text: 'hi', platform: 'tiktok' })[0].platform, 'tiktok')
})

const message: OutboxMessage = {
  id: 'msg-1', channel: 'email', template_key: 'invoice_issued', recipient: 'a@test.my', recipient_name: 'Aisha',
  subject: 'Invoice <INV-1>', body: 'Hi Aisha,\n\nPay at https://topmind.my/login\n\n<script>alert(1)</script>',
  variables: { name: 'Aisha', invoice_no: 'INV-1', amount: 'RM 150.00', due_date: 'Mon 09 Nov 2026' },
}

test('email HTML escapes content and links URLs', () => {
  const html = renderEmailHtml(message.subject!, message.body, 'Top Mind Enterprise')
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('<a href="https://topmind.my/login"'))
  assert.equal(escapeHtml('"&\''), '&quot;&amp;&#39;')
})

test('WhatsApp template parameters follow the template order', () => {
  const p: any = whatsappPayload({ ...message, recipient: '60123456789' },
    { wa_template_name: 'topmind_invoice_issued', wa_language: 'en', wa_params: ['name', 'invoice_no', 'amount', 'due_date'] })
  assert.equal(p.type, 'template')
  assert.deepEqual(p.template.components[0].parameters.map((x: any) => x.text), ['Aisha', 'INV-1', 'RM 150.00', 'Mon 09 Nov 2026'])
  assert.equal((whatsappPayload(message, { wa_template_name: null, wa_language: 'en', wa_params: null }) as any).type, 'text')
})

test('provider errors are classified for retry', async () => {
  const fake = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })
  assert.deepEqual(await sendEmail({ apiKey: 'k', from: 'x@y' }, message, 'TM', fake(200, { id: 'e1' }) as any), { ok: true, providerId: 'e1' })
  assert.equal((await sendEmail({ apiKey: 'k', from: 'x@y' }, message, 'TM', fake(422, { message: 'bad' }) as any)).permanent, true)
  assert.equal((await sendEmail({ apiKey: 'k', from: 'x@y' }, message, 'TM', fake(503, {}) as any)).permanent, false)
  const wa = await sendWhatsApp({ token: 't', phoneNumberId: 'p' }, message, { wa_template_name: null, wa_language: 'en', wa_params: null },
    fake(400, { error: { code: 131026, message: 'Not a WhatsApp user' } }) as any)
  assert.equal(wa.permanent, true)
})

const checkout: CheckoutInput = {
  linkId: '11111111-2222-3333-4444-555555555555', invoiceNo: 'INV-2026-000123', description: 'English Beginners (Nov 2026)',
  amount: 150.5, currency: 'MYR', name: 'Aisha Rahman', email: 'aisha@test.my', phone: null,
  callbackUrl: 'https://ref.supabase.co/functions/v1/payment-webhook?provider=x', returnUrl: 'https://site.my/student/invoices?payment=returned',
}

test('Billplz bill request: amount in cents, Basic auth, empty fields left out', () => {
  const r = billplzCreateBill({ apiKey: 'sk-1', collectionId: 'col1' }, checkout)
  assert.equal(r.url, 'https://www.billplz.com/api/v3/bills')
  assert.equal(r.init.headers.Authorization, 'Basic ' + btoa('sk-1:'))
  const body = new URLSearchParams(r.init.body)
  assert.equal(body.get('amount'), '15050')
  assert.equal(body.get('collection_id'), 'col1')
  assert.equal(body.get('reference_1'), 'INV-2026-000123')
  assert.ok(!body.has('mobile'), 'no phone number means no mobile field')
  assert.deepEqual(parseBillplzBill({ id: 'abc', url: 'https://www.billplz.com/bills/abc' }), { externalId: 'abc', url: 'https://www.billplz.com/bills/abc', expiresAt: null })
  assert.throws(() => parseBillplzBill({ error: { message: 'Invalid collection' } }), /Invalid collection/)
})

test('ToyyibPay bill request: allowed characters only, payer details only when complete', () => {
  const r = toyyibpayCreateBill({ secretKey: 's', categoryCode: 'cat', baseUrl: 'https://dev.toyyibpay.com' }, checkout)
  const body = new URLSearchParams(r.init.body)
  assert.equal(r.url, 'https://dev.toyyibpay.com/index.php/api/createBill')
  assert.match(body.get('billName')!, /^[A-Za-z0-9 _]{1,30}$/)
  assert.match(body.get('billDescription')!, /^[A-Za-z0-9 _]{1,100}$/)
  assert.equal(body.get('billAmount'), '15050')
  assert.equal(body.get('billPayorInfo'), '0')
  assert.ok(!body.has('billEmail'))
  assert.equal(body.get('billExternalReferenceNo'), checkout.linkId)
  assert.deepEqual(parseToyyibpayBill([{ BillCode: 'gcbhict9' }], 'https://dev.toyyibpay.com'),
    { externalId: 'gcbhict9', url: 'https://dev.toyyibpay.com/gcbhict9', expiresAt: null })
  assert.throws(() => parseToyyibpayBill({ status: 'error', msg: 'Invalid secret key' }), /Invalid secret key/)
})

test('Stripe checkout carries our link id, and the webhook parser finds it again', () => {
  const r = stripeCreateCheckout({ secretKey: 'sk_test' }, checkout)
  const body = new URLSearchParams(r.init.body)
  assert.equal(body.get('line_items[0][price_data][currency]'), 'myr')
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '15050')
  assert.equal(body.get('client_reference_id'), checkout.linkId)
  assert.equal(body.get('payment_intent_data[metadata][payment_link_id]'), checkout.linkId)
  const created = parseStripeCheckout({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', expires_at: 1793600000 }, checkout.linkId)
  assert.equal(created.externalId, checkout.linkId)
  assert.equal(created.expiresAt, new Date(1793600000 * 1000).toISOString())
  const ev = parseStripe({ id: 'evt_1', type: 'checkout.session.completed', created: 1793500000,
    data: { object: { id: 'cs_test_1', client_reference_id: checkout.linkId, metadata: { payment_link_id: checkout.linkId }, amount_total: 15050, payment_intent: 'pi_1', payment_status: 'paid' } } })!
  assert.equal(ev.externalId, created.externalId)
  assert.equal(ev.amount, 150.5)
})
