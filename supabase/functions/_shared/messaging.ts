// Email and WhatsApp delivery. Message text is plain text written from the
// templates in the database; it is escaped before being placed in HTML.

export type OutboxMessage = {
  id: string
  channel: 'email' | 'whatsapp'
  template_key: string | null
  recipient: string
  recipient_name: string | null
  subject: string | null
  body: string
  variables: Record<string, unknown>
}

export type DeliveryResult = { ok: boolean; providerId?: string; error?: string; permanent?: boolean }

export type EmailConfig = { apiKey: string; from: string; replyTo?: string }
export type WhatsAppConfig = { token: string; phoneNumberId: string; apiVersion?: string }
export type WhatsAppTemplate = { wa_template_name: string | null; wa_language: string; wa_params: string[] | null }

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Turns plain text into a simple branded HTML email. URLs become links.
export function renderEmailHtml(subject: string, body: string, businessName: string): string {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#E84D8A">$1</a>'))
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p}</p>`)
    .join('')
  return `<!doctype html><html><body style="margin:0;background:#F8F3EE;font-family:Arial,Helvetica,sans-serif;color:#0B1F5C">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#0B1F5C;color:#fff;border-radius:14px 14px 0 0;padding:18px 22px;font-weight:bold;font-size:16px">${escapeHtml(businessName)}</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:22px;font-size:15px">
<h1 style="font-size:18px;margin:0 0 16px;color:#0B1F5C">${escapeHtml(subject)}</h1>${paragraphs}</div>
</div></body></html>`
}

// Errors the provider will never accept on retry.
const permanentStatus = (status: number) => status === 400 || status === 401 || status === 403 || status === 404 || status === 422

export async function sendEmail(cfg: EmailConfig, msg: OutboxMessage, businessName: string, fetcher = fetch): Promise<DeliveryResult> {
  const subject = msg.subject ?? businessName
  const res = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': msg.id },
    body: JSON.stringify({
      from: cfg.from,
      to: [msg.recipient],
      reply_to: cfg.replyTo ? [cfg.replyTo] : undefined,
      subject,
      text: msg.body,
      html: renderEmailHtml(subject, msg.body, businessName),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, providerId: data.id }
  return { ok: false, error: data.message ?? `Email provider returned ${res.status}`, permanent: permanentStatus(res.status) }
}

// WhatsApp Business Platform (Cloud API). Business-initiated messages must use
// an approved template; parameters are filled from the message variables in
// the order given by the template's wa_params.
export function whatsappPayload(msg: OutboxMessage, tpl: WhatsAppTemplate) {
  if (!tpl.wa_template_name) {
    return { messaging_product: 'whatsapp', to: msg.recipient, type: 'text', text: { body: msg.body.slice(0, 4096) } }
  }
  const params = (tpl.wa_params ?? []).map((name) => ({ type: 'text', text: String(msg.variables[name] ?? '').slice(0, 1000) || '-' }))
  return {
    messaging_product: 'whatsapp',
    to: msg.recipient,
    type: 'template',
    template: {
      name: tpl.wa_template_name,
      language: { code: tpl.wa_language || 'en' },
      components: params.length ? [{ type: 'body', parameters: params }] : [],
    },
  }
}

export async function sendWhatsApp(cfg: WhatsAppConfig, msg: OutboxMessage, tpl: WhatsAppTemplate, fetcher = fetch): Promise<DeliveryResult> {
  const res = await fetcher(`https://graph.facebook.com/${cfg.apiVersion ?? 'v21.0'}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(whatsappPayload(msg, tpl)),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, providerId: data.messages?.[0]?.id }
  const code = data.error?.code
  // 131026: recipient not on WhatsApp; 132001: template missing; 131047: outside the 24h window.
  const permanent = permanentStatus(res.status) || [131026, 132000, 132001, 131047, 131051].includes(code)
  return { ok: false, error: data.error?.message ?? `WhatsApp returned ${res.status}`, permanent }
}
