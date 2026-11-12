import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useSettings } from '../../lib/settings'
import { fmtDate, label } from '../../lib/format'
import { Alert, Button, KeyValue, Label, Loading, PageHeader, Section, Select, inputCls } from '../../components/ui'
import { AccountSecurity } from '../teacher/Profile'
import { NotLinked } from './NotLinked'
import { PrivacyPanel } from '../../components/PrivacyPanel'

const TIMEZONES = ['Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Dubai', 'Australia/Sydney', 'Europe/London', 'America/New_York']

// Students keep their own contact details and preferences up to date. Email,
// status and placement changes go through the academy.
export default function StudentProfile() {
  const { session, refreshProfile } = useAuth()
  const s = useSettings()
  const me = useLoad(() => q<any[]>(supabase.from('students')
    .select('id, student_code, full_name, email, phone, date_of_birth, preferred_contact, timezone, learning_objectives, guardian_name, guardian_phone, consent_marketing, consent_whatsapp, consent_privacy_at, status, created_at')
    .eq('profile_id', session!.user.id).order('created_at').limit(1)), [])
  const st = me.data?.[0]
  const [f, setF] = useState<any>(null)
  useEffect(() => { if (st) setF({ ...st, phone: st.phone ?? '', date_of_birth: st.date_of_birth ?? '', learning_objectives: st.learning_objectives ?? '', guardian_name: st.guardian_name ?? '', guardian_phone: st.guardian_phone ?? '', timezone: st.timezone ?? 'Asia/Kuala_Lumpur' }) }, [st])
  const act = useAction()
  if (me.loading && !me.data) return <Loading />
  if (me.error) return <Alert msg={me.error} />
  if (!st || !f) return <div className="space-y-4"><PageHeader title="My profile" /><NotLinked /><AccountSecurity /><PrivacyPanel /></div>
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  return (
    <div className="space-y-6">
      <PageHeader title="My profile" subtitle="Keep your details up to date so your teachers and the academy can reach you." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="My details" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Label>
            <Label t="Phone"><input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+60 12-345 6789" /></Label>
            <Label t="Date of birth"><input type="date" className={inputCls} value={f.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></Label>
            <Label t="Best way to reach me"><Select value={f.preferred_contact ?? 'email'} onChange={(v) => set('preferred_contact', v)} options={[['email', 'Email'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone call']]} /></Label>
            <Label t="My time zone" hint="Lesson times are shown in your device's time zone."><Select value={f.timezone} onChange={(v) => set('timezone', v)} options={Array.from(new Set([f.timezone, ...TIMEZONES]))} /></Label>
            <Label t="Emergency contact or parent"><input className={inputCls} value={f.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} /></Label>
            <Label t="Their phone"><input className={inputCls} value={f.guardian_phone} onChange={(e) => set('guardian_phone', e.target.value)} /></Label>
            <Label t="What I want to achieve" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.learning_objectives} onChange={(e) => set('learning_objectives', e.target.value)} /></Label>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!f.consent_whatsapp} onChange={(e) => set('consent_whatsapp', e.target.checked)} />Send me class reminders and payment notices on WhatsApp.</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!f.consent_marketing} onChange={(e) => set('consent_marketing', e.target.checked)} />Tell me about new classes and offers. You can turn this off at any time.</label>
          </div>
          <div className="mt-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
          <div className="mt-3 flex justify-end"><Button busy={act.busy} onClick={() => act.run(async () => {
            await rpc('update_my_student_profile', { p: {
              full_name: f.full_name, phone: f.phone, date_of_birth: f.date_of_birth, preferred_contact: f.preferred_contact, timezone: f.timezone,
              learning_objectives: f.learning_objectives, guardian_name: f.guardian_name, guardian_phone: f.guardian_phone,
              consent_marketing: !!f.consent_marketing, consent_whatsapp: !!f.consent_whatsapp,
            } })
            await refreshProfile(); me.reload()
          }, 'Your details are saved.')}>Save</Button></div>
        </Section>
        <div className="space-y-6">
          <Section title="Account">
            <KeyValue rows={[['Student code', st.student_code], ['Email', st.email ?? session?.user.email], ['Status', label(st.status)],
              ['Student since', fmtDate(st.created_at)], ['Privacy notice accepted', st.consent_privacy_at ? fmtDate(st.consent_privacy_at) : 'Not recorded']]} />
            <p className="mt-2 text-xs text-slate-500">To change your email address, ask for a copy of your data or close your account, contact us at {s.get('business.email')}. See our <a href="/privacy" className="underline">privacy notice</a>.</p>
          </Section>
          <AccountSecurity />
          <PrivacyPanel />
        </div>
      </div>
    </div>
  )
}
