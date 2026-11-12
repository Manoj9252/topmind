// Account management that needs the service role: invitations with a chosen
// role, suspension (also blocks sign-in) and password reset emails.
// Only active administrators can call it.
import { corsHeaders, env, json, requireAdmin, serviceClient } from '../_shared/supabase.ts'

const ROLES = ['admin', 'teacher', 'student']
const FOREVER = '876000h' // about 100 years

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = serviceClient()
  const caller = await requireAdmin(req, db)
  if (!caller) return json({ error: 'Only an administrator can manage accounts' }, 403)
  const body = await req.json().catch(() => ({}))
  const redirectTo = `${env('SITE_URL')}/reset`

  switch (body.action) {
    case 'invite': {
      const email = String(body.email ?? '').trim().toLowerCase()
      const role = String(body.role ?? 'student')
      const fullName = String(body.full_name ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400)
      if (!ROLES.includes(role)) return json({ error: 'Unknown role' }, 400)
      const { data: existing } = await db.from('profiles').select('id').ilike('email', email).maybeSingle()
      if (existing) return json({ error: 'An account with this email already exists', id: existing.id }, 409)
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo })
      if (error || !data.user) return json({ error: error?.message ?? 'Could not send the invitation' }, 400)
      const id = data.user.id
      await db.auth.admin.updateUserById(id, { app_metadata: { invited_role: role } })
      await db.from('profiles').update({ role, full_name: fullName || null }).eq('id', id)
      if (role === 'student' && body.student_id) {
        await db.from('students').update({ profile_id: id }).eq('id', body.student_id).is('profile_id', null)
      }
      return json({ id, invited: true })
    }

    case 'resend_invite':
    case 'password_reset': {
      const { data: profile } = await db.from('profiles').select('email').eq('id', body.user_id).maybeSingle()
      if (!profile?.email) return json({ error: 'Account not found' }, 404)
      const { data: user } = await db.auth.admin.getUserById(body.user_id)
      const confirmed = !!user.user?.email_confirmed_at
      const { error } = !confirmed
        ? await db.auth.admin.inviteUserByEmail(profile.email, { redirectTo })
        : await db.auth.resetPasswordForEmail(profile.email, { redirectTo })
      return error ? json({ error: error.message }, 400) : json({ sent: true })
    }

    case 'set_password': {
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'Temporary password must be at least 8 characters' }, 400)
      const { data: profile } = await db.from('profiles').select('id').eq('id', body.user_id).maybeSingle()
      if (!profile) return json({ error: 'Account not found' }, 404)
      const { error } = await db.auth.admin.updateUserById(body.user_id, { password, email_confirm: true })
      return error ? json({ error: error.message }, 400) : json({ updated: true })
    }

    case 'generate_link': {
      const { data: profile } = await db.from('profiles').select('email').eq('id', body.user_id).maybeSingle()
      if (!profile?.email) return json({ error: 'Account not found' }, 404)
      const { data, error } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email: profile.email,
        options: { redirectTo: `${env('SITE_URL')}/teacher` },
      })
      if (error || !data.properties?.action_link) {
        return json({ error: error?.message ?? 'Could not generate a one-time login link' }, 400)
      }
      return json({ link: data.properties.action_link })
    }

    case 'suspend':
    case 'deactivate':
    case 'reactivate': {
      if (body.user_id === caller.id) return json({ error: 'You cannot change your own account status' }, 400)
      const status = body.action === 'reactivate' ? 'active' : body.action === 'suspend' ? 'suspended' : 'deactivated'
      const { error } = await db.from('profiles')
        .update({ status, suspended_reason: status === 'active' ? null : String(body.reason ?? '') || null })
        .eq('id', body.user_id)
      if (error) return json({ error: error.message }, 400)
      await db.auth.admin.updateUserById(body.user_id, { ban_duration: status === 'active' ? 'none' : FOREVER })
      return json({ status })
    }

    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
