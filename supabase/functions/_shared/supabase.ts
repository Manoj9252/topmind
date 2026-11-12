// Deno-only helpers for the Edge Functions: clients, CORS and caller checks.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const env = (name: string) => Deno.env.get(name) ?? ''

export const corsHeaders = {
  'Access-Control-Allow-Origin': env('SITE_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Service-role client: bypasses row-level security. Never sent to browsers.
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

// Returns the signed-in caller's profile when they are an active administrator.
export async function requireAdmin(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  if (!data.user) return null
  const { data: profile } = await admin.from('profiles').select('id, role, status').eq('id', data.user.id).maybeSingle()
  return profile?.role === 'admin' && profile.status === 'active' ? profile : null
}
