// Instagram (Meta) and generic social webhook helpers.
import { hmacSha256Hex, safeEqual } from './crypto.ts'

export type SocialMessage = {
  platform: 'instagram' | 'tiktok' | 'facebook'
  messageId: string
  senderId: string
  username: string | null
  name: string | null
  text: string
  sentAt: string
}

// Meta signs the raw request body: X-Hub-Signature-256: sha256=<hex HMAC with the app secret>.
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=') || !appSecret) return false
  return safeEqual(header.slice(7), await hmacSha256Hex(appSecret, rawBody))
}

// Meta's one-time subscription check (GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...).
export function metaChallenge(params: URLSearchParams, verifyToken: string): string | null {
  return params.get('hub.mode') === 'subscribe' && verifyToken && params.get('hub.verify_token') === verifyToken
    ? params.get('hub.challenge')
    : null
}

// Instagram Messaging webhook: entry[].messaging[] with sender.id and message.{mid,text}.
// Echoes of our own replies and non-text events are skipped.
export function parseInstagramWebhook(body: any, ownAccountId?: string): SocialMessage[] {
  if (body?.object !== 'instagram' && body?.object !== 'page') return []
  const out: SocialMessage[] = []
  for (const entry of body.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      if (!m.message?.mid || !m.message?.text || m.message?.is_echo) continue
      if (ownAccountId && m.sender?.id === ownAccountId) continue
      out.push({
        platform: body.object === 'page' ? 'facebook' : 'instagram',
        messageId: m.message.mid,
        senderId: String(m.sender?.id ?? ''),
        username: null,
        name: null,
        text: String(m.message.text).slice(0, 4000),
        sentAt: new Date(Number(m.timestamp ?? Date.now())).toISOString(),
      })
    }
  }
  return out
}

// TikTok (and any forwarding tool such as Zapier or Make) posts JSON
// { platform, message_id, sender_id, username, name, text } signed with a shared
// secret: X-Topmind-Signature: sha256=<hex HMAC of the raw body>.
export async function verifySharedSecret(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  return verifyMetaSignature(rawBody, header, secret)
}

export function parseGenericSocial(body: any): SocialMessage[] {
  const items = Array.isArray(body) ? body : [body]
  return items
    .filter((m) => m?.message_id && m?.sender_id && m?.text)
    .map((m) => ({
      platform: (['instagram', 'tiktok', 'facebook'].includes(m.platform) ? m.platform : 'tiktok') as SocialMessage['platform'],
      messageId: String(m.message_id),
      senderId: String(m.sender_id),
      username: m.username ?? null,
      name: m.name ?? null,
      text: String(m.text).slice(0, 4000),
      sentAt: m.sent_at ?? new Date().toISOString(),
    }))
}
