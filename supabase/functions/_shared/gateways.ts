// Payment gateway signature checks and payload parsing. Provider-neutral:
// each parser returns a GatewayEvent or null when the event is not a payment.
// Malaysian options evaluated: Billplz and ToyyibPay; Stripe is supported where available.
import { hmacSha256Hex, safeEqual } from './crypto.ts'

export type GatewayEvent = {
  provider: 'billplz' | 'toyyibpay' | 'stripe'
  eventId: string
  eventType: string
  externalId: string // the bill / payment link id we created
  amount: number // in ringgit
  transactionId: string
  paidAt: string | null
  paid: boolean
}

// Billplz X-Signature: sort "key" + "value" pairs (excluding x_signature) by
// key, join with "|", HMAC-SHA256 with the X Signature Key, lowercase hex.
export async function verifyBillplz(params: Record<string, string>, xSignatureKey: string): Promise<boolean> {
  const given = params['x_signature']
  if (!given || !xSignatureKey) return false
  const source = Object.keys(params)
    .filter((k) => k !== 'x_signature')
    .map((k) => k + params[k])
    .sort()
    .join('|')
  return safeEqual(await hmacSha256Hex(xSignatureKey, source), given.toLowerCase())
}

export function parseBillplz(params: Record<string, string>): GatewayEvent | null {
  if (!params['id']) return null
  return {
    provider: 'billplz',
    eventId: `${params['id']}:${params['paid_at'] ?? params['state'] ?? ''}`,
    eventType: params['paid'] === 'true' ? 'bill.paid' : `bill.${params['state'] ?? 'updated'}`,
    externalId: params['id'],
    amount: Number(params['paid_amount'] ?? params['amount'] ?? 0) / 100,
    transactionId: params['transaction_id'] ?? params['id'],
    paidAt: params['paid_at'] ?? null,
    paid: params['paid'] === 'true',
  }
}

// Stripe-Signature: "t=<unix>,v1=<hex>"; signed payload is "<t>.<raw body>".
export async function verifyStripe(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = Number(parts['t'])
  if (!t || Math.abs(nowSeconds - t) > toleranceSeconds) return false
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`)
  return header.split(',').some((p) => p.startsWith('v1=') && safeEqual(p.slice(3), expected))
}

export function parseStripe(event: any): GatewayEvent | null {
  if (event?.type !== 'checkout.session.completed' && event?.type !== 'payment_intent.succeeded') return null
  const obj = event.data?.object ?? {}
  const linkId = obj.metadata?.payment_link_id ?? obj.client_reference_id ?? obj.id
  return {
    provider: 'stripe',
    eventId: event.id,
    eventType: event.type,
    externalId: linkId,
    amount: Number(obj.amount_total ?? obj.amount_received ?? 0) / 100,
    transactionId: obj.payment_intent ?? obj.id,
    paidAt: event.created ? new Date(event.created * 1000).toISOString() : null,
    paid: obj.payment_status ? obj.payment_status === 'paid' : true,
  }
}

// ToyyibPay callbacks are not signed. The callback is only a hint: the payment
// is confirmed by asking ToyyibPay directly (getBillTransactions).
export function parseToyyibpayCallback(params: Record<string, string>): { billCode: string } | null {
  return params['billcode'] ? { billCode: params['billcode'] } : null
}

export function parseToyyibpayTransactions(billCode: string, rows: any[]): GatewayEvent | null {
  const paid = (rows ?? []).find((r) => String(r.billpaymentStatus) === '1')
  if (!paid) return null
  return {
    provider: 'toyyibpay',
    eventId: `${billCode}:${paid.billpaymentInvoiceNo ?? paid.billpaymentDate}`,
    eventType: 'bill.paid',
    externalId: billCode,
    amount: Number(paid.billpaymentAmount ?? 0),
    transactionId: String(paid.billpaymentInvoiceNo ?? billCode),
    paidAt: paid.billpaymentDate ?? null,
    paid: true,
  }
}

// ---------------------------------------------------------------------------
// Creating a bill or checkout page. Each builder returns the HTTP request to
// send; each parser turns the provider's reply into the payment_links row data.
// The student is then sent to `url`; only the webhook confirms the payment.
// ---------------------------------------------------------------------------
export type CheckoutInput = {
  linkId: string // our payment_links id
  invoiceNo: string
  description: string
  amount: number // ringgit
  currency: string
  name: string
  email: string | null
  phone: string | null
  callbackUrl: string // payment-webhook?provider=...
  returnUrl: string // back to the student's invoice page
}
export type CheckoutRequest = { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }
export type CheckoutResult = { externalId: string; url: string; expiresAt: string | null }

export const toCents = (amount: number) => Math.round(amount * 100)
const form = (fields: Record<string, string | null | undefined>) =>
  new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '') as [string, string][]).toString()

// Billplz v3: POST /api/v3/bills with HTTP Basic auth (API secret key as the user name).
export function billplzCreateBill(cfg: { apiKey: string; collectionId: string; baseUrl?: string }, i: CheckoutInput): CheckoutRequest {
  return {
    url: `${cfg.baseUrl || 'https://www.billplz.com'}/api/v3/bills`,
    init: {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${cfg.apiKey}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        collection_id: cfg.collectionId, name: i.name.slice(0, 255), email: i.email, mobile: i.phone,
        amount: String(toCents(i.amount)), description: `${i.invoiceNo} ${i.description}`.slice(0, 200),
        callback_url: i.callbackUrl, redirect_url: i.returnUrl, reference_1_label: 'Invoice', reference_1: i.invoiceNo,
      }),
    },
  }
}
export function parseBillplzBill(res: any): CheckoutResult {
  if (!res?.id || !res?.url) throw new Error(res?.error?.message?.toString() ?? 'Billplz did not create the bill')
  return { externalId: String(res.id), url: String(res.url), expiresAt: null }
}

// ToyyibPay: POST /index.php/api/createBill. Bill name (30) and description (100)
// accept only letters, numbers, spaces and underscores.
const toyyibText = (s: string, max: number) => s.replace(/[^A-Za-z0-9 _]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
export function toyyibpayCreateBill(cfg: { secretKey: string; categoryCode: string; baseUrl?: string }, i: CheckoutInput): CheckoutRequest {
  const payorInfo = Boolean(i.email && i.phone)
  return {
    url: `${cfg.baseUrl || 'https://toyyibpay.com'}/index.php/api/createBill`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        userSecretKey: cfg.secretKey, categoryCode: cfg.categoryCode,
        billName: toyyibText(`Invoice ${i.invoiceNo}`, 30), billDescription: toyyibText(i.description || `Invoice ${i.invoiceNo}`, 100),
        billPriceSetting: '1', billPayorInfo: payorInfo ? '1' : '0', billAmount: String(toCents(i.amount)),
        billReturnUrl: i.returnUrl, billCallbackUrl: i.callbackUrl, billExternalReferenceNo: i.linkId,
        billTo: payorInfo ? i.name.slice(0, 100) : null, billEmail: payorInfo ? i.email : null, billPhone: payorInfo ? i.phone : null,
        billPaymentChannel: '2',
      }),
    },
  }
}
export function parseToyyibpayBill(res: any, baseUrl?: string): CheckoutResult {
  const code = Array.isArray(res) ? res[0]?.BillCode : undefined
  if (!code) throw new Error(typeof res?.msg === 'string' ? res.msg : 'ToyyibPay did not create the bill')
  return { externalId: String(code), url: `${baseUrl || 'https://toyyibpay.com'}/${code}`, expiresAt: null }
}

// Stripe Checkout: POST /v1/checkout/sessions. Our link id travels in
// client_reference_id and metadata, which is what the webhook matches on.
export function stripeCreateCheckout(cfg: { secretKey: string }, i: CheckoutInput): CheckoutRequest {
  return {
    url: 'https://api.stripe.com/v1/checkout/sessions',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        mode: 'payment', success_url: i.returnUrl, cancel_url: i.returnUrl, client_reference_id: i.linkId, customer_email: i.email,
        'metadata[payment_link_id]': i.linkId, 'metadata[invoice_no]': i.invoiceNo,
        'payment_intent_data[metadata][payment_link_id]': i.linkId,
        'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': i.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(toCents(i.amount)),
        'line_items[0][price_data][product_data][name]': `${i.invoiceNo} ${i.description}`.slice(0, 250),
      }),
    },
  }
}
export function parseStripeCheckout(res: any, linkId: string): CheckoutResult {
  if (!res?.id || !res?.url) throw new Error(res?.error?.message ?? 'Stripe did not create the checkout session')
  return { externalId: linkId, url: String(res.url), expiresAt: res.expires_at ? new Date(res.expires_at * 1000).toISOString() : null }
}
