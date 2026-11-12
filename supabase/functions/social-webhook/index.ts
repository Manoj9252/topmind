// Social media enquiries.
//   GET  ?hub.mode=subscribe...          Meta webhook verification (Instagram / Facebook)
//   POST (X-Hub-Signature-256)           Instagram Messaging events from Meta
//   POST ?source=generic (X-Topmind-Signature)  TikTok or any forwarding tool (Zapier, Make)
//   POST ?action=reply (admin sign-in)   send an Instagram reply to an enquiry
// Nothing is accepted without a valid signature, and nothing works until the
// matching secrets are set. See docs/INTEGRATIONS.md.
import { corsHeaders, env, json, requireAdmin, serviceClient } from '../_shared/supabase.ts'
import {
  metaChallenge, parseGenericSocial, parseInstagramWebhook, type SocialMessage, verifyMetaSignature, verifySharedSecret,
} from '../_shared/social.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method === 'GET') {
    const challenge = metaChallenge(url.searchParams, env('META_VERIFY_TOKEN'))
    return challenge ? new Response(challenge) : new Response('Forbidden', { status: 403 })
  }
  const db = serviceClient()

  if (url.searchParams.get('action') === 'reply') {
    if (!(await requireAdmin(req, db))) return json({ error: 'Only an administrator can reply' }, 403)
    const token = env('INSTAGRAM_ACCESS_TOKEN')
    const account = env('INSTAGRAM_ACCOUNT_ID')
    if (!token || !account) return json({ error: 'Instagram replies are not configured' }, 503)
    const { enquiry_id, text } = await req.json()
    const { data: enquiry } = await db.from('enquiries').select('id, source, conversation_id').eq('id', enquiry_id).maybeSingle()
    if (!enquiry || enquiry.source !== 'instagram' || !enquiry.conversation_id) return json({ error: 'Not an Instagram conversation' }, 400)
    const res = await fetch(`https://graph.facebook.com/${env('META_API_VERSION') || 'v21.0'}/${account}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: enquiry.conversation_id }, message: { text: String(text).slice(0, 1000) } }),
    })
    const data = await res.json().catch(() => ({}))
    await db.from('enquiry_messages').insert({
      enquiry_id, direction: 'outbound', body: text, channel: 'instagram', status: res.ok ? 'sent' : 'failed', external_id: data.message_id ?? null,
    })
    if (res.ok) await db.from('enquiries').update({ status: 'responded', last_contacted_at: new Date().toISOString() }).eq('id', enquiry_id)
    return res.ok ? json({ sent: true }) : json({ error: data.error?.message ?? 'Instagram rejected the reply' }, 502)
  }

  const raw = await req.text()
  let messages: SocialMessage[] = []
  if (url.searchParams.get('source') === 'generic') {
    const secret = env('SOCIAL_WEBHOOK_SECRET')
    if (!secret) return json({ error: 'Generic social webhook is not configured' }, 503)
    if (!(await verifySharedSecret(raw, req.headers.get('x-topmind-signature'), secret))) return json({ error: 'Bad signature' }, 401)
    messages = parseGenericSocial(JSON.parse(raw))
  } else {
    const secret = env('META_APP_SECRET')
    if (!secret) return json({ error: 'Meta webhook is not configured' }, 503)
    if (!(await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), secret))) return json({ error: 'Bad signature' }, 401)
    messages = parseInstagramWebhook(JSON.parse(raw), env('INSTAGRAM_ACCOUNT_ID') || undefined)
  }

  for (const m of messages) {
    await db.rpc('ingest_social_message', {
      p_platform: m.platform, p_message_id: m.messageId, p_sender_id: m.senderId, p_username: m.username, p_name: m.name,
      p_text: m.text, p_sent_at: m.sentAt,
    })
  }
  return json({ received: messages.length })
})
