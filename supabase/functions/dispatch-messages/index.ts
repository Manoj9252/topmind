// Sends queued emails and WhatsApp messages from message_outbox.
// Called every few minutes by pg_cron (Bearer DISPATCH_SECRET) and by the
// "Send now" button in the admin Notification centre (admin sign-in).
// POST {"mode":"status"} reports which channels are configured (no secrets).
import { corsHeaders, env, json, requireAdmin, serviceClient } from '../_shared/supabase.ts'
import { type DeliveryResult, type OutboxMessage, sendEmail, sendWhatsApp } from '../_shared/messaging.ts'
import { safeEqual } from '../_shared/crypto.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = serviceClient()
  const secret = env('DISPATCH_SECRET')
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const fromCron = secret !== '' && safeEqual(bearer, secret)
  if (!fromCron && !(await requireAdmin(req, db))) return json({ error: 'Not allowed' }, 401)

  const email = env('RESEND_API_KEY') && env('EMAIL_FROM')
    ? { apiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM'), replyTo: env('EMAIL_REPLY_TO') || undefined }
    : null
  const whatsapp = env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID')
    ? { token: env('WHATSAPP_TOKEN'), phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'), apiVersion: env('WHATSAPP_API_VERSION') || undefined }
    : null

  const body = await req.json().catch(() => ({}))
  if (body.mode === 'status') {
    return json({ email: !!email, whatsapp: !!whatsapp, scheduled: secret !== '', site_url: env('SITE_URL') || null })
  }

  const { data: nameRow } = await db.from('app_settings').select('value').eq('key', 'business.name').maybeSingle()
  const businessName = String(nameRow?.value ?? 'Top Mind Enterprise')
  const { data: templates } = await db.from('message_templates').select('key, wa_template_name, wa_language, wa_params').eq('channel', 'whatsapp')
  const { data: messages, error } = await db.rpc('claim_messages', { p_limit: Number(body.limit) || 25 })
  if (error) return json({ error: error.message }, 500)

  let sent = 0
  let failed = 0
  for (const m of (messages ?? []) as OutboxMessage[]) {
    let result: DeliveryResult
    try {
      if (m.channel === 'email') {
        result = email ? await sendEmail(email, m, businessName) : { ok: false, error: 'No email provider configured (RESEND_API_KEY, EMAIL_FROM)' }
      } else {
        const tpl = templates?.find((t) => t.key === m.template_key) ?? { wa_template_name: null, wa_language: 'en', wa_params: null }
        result = whatsapp ? await sendWhatsApp(whatsapp, m, tpl) : { ok: false, error: 'WhatsApp is not configured (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)' }
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    await db.rpc('complete_message', {
      p_id: m.id, p_ok: result.ok, p_provider: m.channel === 'email' ? 'resend' : 'whatsapp_cloud',
      p_provider_id: result.providerId ?? null, p_error: result.error ?? null, p_permanent: result.permanent ?? false,
    })
    if (result.ok) sent++
    else failed++
  }
  return json({ claimed: messages?.length ?? 0, sent, failed })
})
