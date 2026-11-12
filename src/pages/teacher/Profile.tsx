import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { q, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { fmtDate, label } from '../../lib/format'
import { Alert, Button, KeyValue, Label, Loading, PageHeader, Section, inputCls } from '../../components/ui'
import { PrivacyPanel } from '../../components/PrivacyPanel'

export default function TeacherProfile() {
  const { session, profile, refreshProfile } = useAuth()
  const me = session!.user.id
  const tp = useLoad(() => q<any>(supabase.from('teacher_profiles').select('teacher_code, employment_start, employment_status, employment_type, qualifications, bio, address').eq('profile_id', me).maybeSingle()), [])
  const langs = useLoad(() => q<any[]>(supabase.from('teacher_languages').select('languages(name)').eq('teacher_id', me)), [])
  const [f, setF] = useState({ full_name: '', phone: '', bio: '', qualifications: '', address: '' })
  useEffect(() => {
    setF({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', bio: tp.data?.bio ?? '', qualifications: tp.data?.qualifications ?? '', address: tp.data?.address ?? '' })
  }, [profile, tp.data])
  const act = useAction()
  if (tp.loading && !tp.data) return <Loading />
  return (
    <div className="space-y-6">
      <PageHeader title="My profile" subtitle="Your details as students and the academy see them." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Details" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Label>
            <Label t="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Label>
            <Label t="About me" hint="Shown to students when they book a one-to-one lesson." className="sm:col-span-2"><textarea rows={4} className={inputCls} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Label>
            <Label t="Qualifications" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.qualifications} onChange={(e) => setF({ ...f, qualifications: e.target.value })} /></Label>
            <Label t="Address (private)" className="sm:col-span-2"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Label>
          </div>
          <Alert msg={act.error} /><Alert ok msg={act.ok} />
          <div className="mt-3 flex justify-end"><Button busy={act.busy} onClick={() => act.run(async () => {
            if (f.full_name.trim().length < 2) throw new Error('Please enter your full name.')
            if (f.phone && !/^\+?[0-9 ()-]{6,20}$/.test(f.phone.trim())) throw new Error('Please enter a valid phone number.')
            await q(supabase.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null }).eq('id', me))
            await q(supabase.from('teacher_profiles').update({ bio: f.bio || null, qualifications: f.qualifications || null, address: f.address || null }).eq('profile_id', me))
            await refreshProfile(); tp.reload()
          }, 'Profile saved.')}>Save</Button></div>
        </Section>
        <div className="space-y-6">
          <Section title="Employment">
            <KeyValue rows={[
              ['Teacher code', tp.data?.teacher_code ?? '—'], ['Email', profile?.email ?? session?.user.email ?? '—'],
              ['Status', label(tp.data?.employment_status)], ['Type', label(tp.data?.employment_type)], ['Started', fmtDate(tp.data?.employment_start)],
              ['Languages', (langs.data ?? []).map((l) => l.languages?.name).filter(Boolean).join(', ') || '—'],
            ]} />
            <p className="mt-2 text-xs text-slate-400">Ask the administrator to change your email, employment details or languages.</p>
          </Section>
          <AccountSecurity />
          <PrivacyPanel />
        </div>
      </div>
    </div>
  )
}

// Password change and signing out of other devices; shared with the student profile.
export function AccountSecurity() {
  const { signOut } = useAuth()
  const [pw, setPw] = useState({ a: '', b: '' })
  const act = useAction()
  return (
    <Section title="Sign-in and security">
      <div className="space-y-3">
        <Label t="New password"><input type="password" autoComplete="new-password" className={inputCls} value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Label>
        <Label t="Repeat new password"><input type="password" autoComplete="new-password" className={inputCls} value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Label>
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => signOut(true)}>Sign out on all devices</Button>
          <Button busy={act.busy} disabled={!pw.a} onClick={() => act.run(async () => {
            if (pw.a.length < 8) throw new Error('Use at least 8 characters.')
            if (pw.a !== pw.b) throw new Error('The two passwords do not match.')
            const { error } = await supabase.auth.updateUser({ password: pw.a })
            if (error) throw error
            setPw({ a: '', b: '' })
          }, 'Password changed.')}>Change password</Button>
        </div>
      </div>
    </Section>
  )
}
