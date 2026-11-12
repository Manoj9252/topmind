// Receives payment notifications from an online gateway once one is chosen.
//   POST /payment-webhook?provider=billplz | stripe | toyyibpay
// The event is verified (signature, or for ToyyibPay a direct API check) before
// apply_gateway_payment records it. Repeated deliveries are ignored, and a
// browser redirect alone never confirms a payment.
import { env, json, serviceClient } from '../_shared/supabase.ts'
import {
  type GatewayEvent, parseBillplz, parseStripe, parseToyyibpayCallback, parseToyyibpayTransactions, verifyBillplz, verifyStripe,
} from '../_shared/gateways.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const provider = new URL(req.url).searchParams.get('provider')
  const raw = await req.text()
  let event: GatewayEvent | null = null
  let valid = false
  let payload: unknown = null

  if (provider === 'billplz') {
    const key = env('BILLPLZ_X_SIGNATURE_KEY')
    if (!key) return json({ error: 'Billplz is not configured' }, 503)
    const params = Object.fromEntries(new URLSearchParams(raw))
    payload = params
    valid = await verifyBillplz(params, key)
    event = parseBillplz(params)
  } else if (provider === 'stripe') {
    const secret = env('STRIPE_WEBHOOK_SECRET')
    if (!secret) return json({ error: 'Stripe is not configured' }, 503)
    valid = await verifyStripe(raw, req.headers.get('stripe-signature'), secret)
    payload = JSON.parse(raw || '{}')
    event = parseStripe(payload)
  } else if (provider === 'toyyibpay') {
    const secretKey = env('TOYYIBPAY_SECRET_KEY')
    if (!secretKey) return json({ error: 'ToyyibPay is not configured' }, 503)
    const params = Object.fromEntries(new URLSearchParams(raw))
    payload = params
    const callback = parseToyyibpayCallback(params)
    if (callback) {
      const base = env('TOYYIBPAY_BASE_URL') || 'https://toyyibpay.com'
      const res = await fetch(`${base}/index.php/api/getBillTransactions`, {
        method: 'POST',
        body: new URLSearchParams({ billCode: callback.billCode, billpaymentStatus: '1' }),
      })
      const rows = await res.json().catch(() => [])
      event = parseToyyibpayTransactions(callback.billCode, Array.isArray(rows) ? rows : [])
      valid = event !== null // confirmed by ToyyibPay itself, not by the callback
    }
  } else {
    return json({ error: 'Unknown provider' }, 400)
  }

  if (!event || !event.paid) return json({ status: 'ignored' })
  const { data, error } = await serviceClient().rpc('apply_gateway_payment', {
    p_provider: event.provider, p_event_id: event.eventId, p_event_type: event.eventType, p_external_id: event.externalId,
    p_amount: event.amount, p_txn_id: event.transactionId, p_paid_at: event.paidAt, p_payload: payload, p_signature_valid: valid,
  })
  if (error) return json({ error: error.message }, 500)
  return json(data, valid ? 200 : 401)
})
