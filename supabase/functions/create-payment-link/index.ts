// Creates an online payment page for an invoice, once a gateway is configured.
//   POST { invoice_id }   (signed-in student, or an administrator)
// The invoice is read with the caller's own token, so the database decides
// whether they may pay it. Only the gateway's signed webhook (payment-webhook)
// confirms the payment; returning from the payment page never does.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, env, json, serviceClient } from '../_shared/supabase.ts'
import {
  billplzCreateBill, type CheckoutInput, type CheckoutRequest, type CheckoutResult, parseBillplzBill, parseStripeCheckout,
  parseToyyibpayBill, stripeCreateCheckout, toyyibpayCreateBill,
} from '../_shared/gateways.ts'

const NOT_AVAILABLE = 'Online payment is not available yet. Please pay by bank transfer or DuitNow and upload your slip.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const provider = env('PAYMENT_GATEWAY')
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return json({ error: 'Please sign in' }, 401)
  const { invoice_id } = await req.json().catch(() => ({ invoice_id: null }))
  if (!invoice_id) return json({ error: 'Missing invoice' }, 400)

  let request: CheckoutRequest
  let parse: (body: any) => CheckoutResult
  const build = (input: CheckoutInput): boolean => {
    if (provider === 'billplz' && env('BILLPLZ_API_KEY') && env('BILLPLZ_COLLECTION_ID')) {
      request = billplzCreateBill({ apiKey: env('BILLPLZ_API_KEY'), collectionId: env('BILLPLZ_COLLECTION_ID'), baseUrl: env('BILLPLZ_BASE_URL') }, input)
      parse = parseBillplzBill
    } else if (provider === 'toyyibpay' && env('TOYYIBPAY_SECRET_KEY') && env('TOYYIBPAY_CATEGORY_CODE')) {
      request = toyyibpayCreateBill({ secretKey: env('TOYYIBPAY_SECRET_KEY'), categoryCode: env('TOYYIBPAY_CATEGORY_CODE'), baseUrl: env('TOYYIBPAY_BASE_URL') }, input)
      parse = (body) => parseToyyibpayBill(body, env('TOYYIBPAY_BASE_URL'))
    } else if (provider === 'stripe' && env('STRIPE_SECRET_KEY')) {
      request = stripeCreateCheckout({ secretKey: env('STRIPE_SECRET_KEY') }, input)
      parse = (body) => parseStripeCheckout(body, input.linkId)
    } else return false
    return true
  }

  // invoice_document() refuses invoices the caller may not see.
  const asCaller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data: doc, error } = await asCaller.rpc('invoice_document', { p_invoice: invoice_id })
  if (error || !doc) return json({ error: 'Invoice not found' }, 404)
  const inv = doc.invoice
  const balance = Number(doc.balance)
  if (!['unpaid', 'partial'].includes(inv.status) || !(balance > 0)) return json({ error: 'This invoice has nothing left to pay' }, 400)

  const db = serviceClient()
  const { data: open } = await db.from('payment_links').select('url, expires_at')
    .eq('invoice_id', invoice_id).eq('provider', provider).eq('status', 'open').eq('amount', balance)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (open?.url && (!open.expires_at || new Date(open.expires_at).getTime() > Date.now() + 10 * 60_000)) return json({ url: open.url })

  const input: CheckoutInput = {
    linkId: crypto.randomUUID(), invoiceNo: inv.invoice_no, description: inv.description || 'Tuition fees', amount: balance,
    currency: inv.currency || 'MYR', name: doc.bill_to?.name || 'Student', email: doc.bill_to?.email || null, phone: doc.bill_to?.phone || null,
    callbackUrl: `${env('SUPABASE_URL')}/functions/v1/payment-webhook?provider=${provider}`,
    returnUrl: `${env('SITE_URL')}/student/invoices?payment=returned`,
  }
  if (!build(input)) return json({ error: NOT_AVAILABLE }, 503)

  let result: CheckoutResult
  try {
    const res = await fetch(request!.url, request!.init)
    const body = await res.json().catch(() => null)
    if (!res.ok && !body) throw new Error(`HTTP ${res.status}`)
    result = parse!(body)
  } catch (e) {
    console.error('create-payment-link', provider, e)
    return json({ error: 'The payment page could not be opened. Please try again later or pay by bank transfer.' }, 502)
  }
  const { error: saveError } = await db.from('payment_links').insert({
    id: input.linkId, invoice_id, provider, external_id: result.externalId, url: result.url, amount: balance, expires_at: result.expiresAt,
  })
  if (saveError) return json({ error: saveError.message }, 500)
  return json({ url: result.url })
})
