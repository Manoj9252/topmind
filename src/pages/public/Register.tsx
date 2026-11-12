import { FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { rpc, useAction } from '../../lib/api'
import { feeText, useCatalog } from '../../lib/catalog'
import { useCurrency } from '../../lib/settings'
import { DAYS_SHORT, fmtDate, viewerTz } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Button, Card, Label, Select, inputCls } from '../../components/ui'

const SOURCES = ['instagram', 'tiktok', 'whatsapp', 'facebook', 'referral']
const STEPS = ['What to learn', 'About you', 'When you are free', 'Confirm']

const isMinor = (dob: string) => {
  if (!dob) return false
  const d = new Date(`${dob}T00:00:00`)
  const eighteen = new Date(d.getFullYear() + 18, d.getMonth(), d.getDate())
  return eighteen > new Date()
}

export default function Register() {
  const [params] = useSearchParams()
  const catalog = useCatalog()
  const sym = useCurrency()
  const act = useAction()
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [f, setF] = useState({
    language_id: params.get('language') ?? '', course_id: params.get('programme') ?? '', class_id: params.get('class') ?? '',
    format: 'group', mode: 'online', student_name: '', email: '', phone: '', preferred_contact: 'email', date_of_birth: '', guardian_name: '',
    timezone: viewerTz, level_self: '', objectives: '', preferred_days: [] as number[], preferred_times: [] as string[], additional_info: '',
    consent_privacy: false, consent_marketing: false, consent_whatsapp: false, website: '',
  })
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  const languages = (catalog.data?.languages ?? []).filter((l) => l.is_active)
  const language = languages.find((l) => l.id === f.language_id)
  const programme = language?.programmes.find((p) => p.id === f.course_id)
  const source = useMemo(() => {
    const s = (params.get('src') ?? params.get('utm_source') ?? '').toLowerCase()
    return SOURCES.includes(s) ? s : 'website'
  }, [params])
  const utm = useMemo(() => Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith('utm_') || k === 'src')), [params])

  const stepError = () => {
    if (step === 0 && !f.language_id) return 'Please choose a language.'
    if (step === 1) {
      if (f.student_name.trim().length < 2) return 'Please enter your full name.'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'Please enter a valid email address.'
      if (f.preferred_contact !== 'email' && !f.phone.trim()) return 'Please add a phone number so we can contact you that way.'
      if (isMinor(f.date_of_birth) && !f.guardian_name.trim()) return 'Learners under 18 need a parent or guardian name.'
    }
    if (step === 3 && !f.consent_privacy) return 'Please agree to the privacy policy to continue.'
    return ''
  }
  const next = () => { const e = stepError(); if (e) act.setError(e); else { act.setError(''); setStep(step + 1) } }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = stepError()
    if (problem) return act.setError(problem)
    act.run(async () => {
      const r = await rpc('submit_registration', { p: { ...f, email: f.email.trim(), course_id: f.course_id || null, class_id: f.class_id || null, source, utm } })
      setResult(r)
      window.scrollTo(0, 0)
    })
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={56} />
          <h1 className="mt-4 text-2xl font-bold text-brand-navy">{result.status === 'duplicate' ? 'You are already registered' : 'Registration received!'}</h1>
          {result.status === 'duplicate' ? <p className="mt-2 text-slate-600">{result.message}</p> : (
            <>
              <p className="mt-2 text-slate-600">We have emailed you a confirmation. Keep your tracking code to check your status:</p>
              <p className="mx-auto my-4 max-w-xs rounded-2xl border-2 border-brand-pink/30 bg-brand-cream py-3 text-2xl font-bold tracking-widest text-brand-navy">{result.tracking_code}</p>
            </>
          )}
        </Card>
        {result.assessment && (
          <Card className="mt-6 border-l-4 border-brand-pink">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-1 shrink-0 text-brand-pink" />
              <div>
                <b className="text-brand-navy">Next: a short placement quiz (optional)</b>
                <p className="mt-1 text-sm text-slate-600">"{result.assessment.title}" takes about 10–20 minutes and helps us suggest the right class. There is no pass or fail.</p>
                <Link to={`/assessment/${result.assessment.token}`} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white">Start the quiz <ArrowRight size={14} /></Link>
              </div>
            </div>
          </Card>
        )}
        {result.recommendations?.length > 0 && (
          <Card className="mt-6">
            <b className="text-brand-navy">Classes that may suit you</b>
            <ul className="mt-3 space-y-2 text-sm">
              {result.recommendations.map((r: any) => (
                <li key={r.class_id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-brand-cream/50 p-3">
                  <span><b>{r.class_name}</b>{r.level_name ? ` · ${r.level_name}` : ''}<br /><span className="text-slate-500">{r.schedule}</span></span>
                  <span className="text-right text-slate-600">{feeText(r.fee, r.billing_frequency, sym)}<br />{r.spaces_left > 0 ? `${r.spaces_left} places left` : 'Waiting list'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">These are suggestions. We will confirm your class with you.</p>
          </Card>
        )}
        <p className="mt-6 text-center text-sm"><Link to={`/track?code=${result.tracking_code ?? ''}`} className="font-semibold text-brand-pink hover:underline">Track my registration</Link></p>
      </div>
    )
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-center text-3xl font-extrabold text-brand-navy">Register</h1>
      <p className="mt-2 text-center text-slate-500">It takes about three minutes. We will confirm your place by email.</p>
      <ol className="mx-auto mt-6 flex max-w-lg justify-between gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('flex flex-1 flex-col items-center gap-1 text-center', i <= step ? 'text-brand-navy' : 'text-slate-400')}>
            <span className={cx('grid h-7 w-7 place-items-center rounded-full font-bold', i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-pink text-white' : 'bg-slate-200')}>{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      <Card className="mt-6 p-6 sm:p-8">
        <form onSubmit={submit} className="space-y-4">
          {step === 0 && (
            <>
              <Label t="Language *">
                <Select value={f.language_id} onChange={(v) => set({ language_id: v, course_id: '', class_id: '' })} placeholder="Choose a language" options={languages.map((l) => [l.id, l.name])} />
              </Label>
              {language && (
                <Label t="Programme" hint={language.programmes.length ? undefined : 'No programmes are open yet. Register your interest and we will contact you.'}>
                  <Select value={f.course_id} onChange={(v) => set({ course_id: v, class_id: '' })} placeholder="Not sure, please advise me" options={language.programmes.map((p) => [p.id, p.name])} />
                </Label>
              )}
              {programme && programme.classes.length > 0 && (
                <Label t="Preferred class">
                  <Select value={f.class_id} onChange={(v) => set({ class_id: v })} placeholder="Any suitable class"
                    options={programme.classes.map((c) => [c.id, `${c.name} · ${c.schedule}${c.spaces_left > 0 ? '' : ' (full)'}`])} />
                </Label>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Label t="How would you like to learn?"><Select value={f.format} onChange={(v) => set({ format: v })} options={[['group', 'Small group'], ['one_to_one', 'One-to-one'], ['either', 'Either']]} /></Label>
                <Label t="Where?"><Select value={f.mode} onChange={(v) => set({ mode: v })} options={[['online', 'Online'], ['physical', 'In person'], ['either', 'Either']]} /></Label>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <Label t="Full name *"><input className={inputCls} value={f.student_name} onChange={(e) => set({ student_name: e.target.value })} autoComplete="name" /></Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label t="Email *"><input type="email" className={inputCls} value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /></Label>
                <Label t="Phone / WhatsApp"><input className={inputCls} value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="e.g. 012-345 6789" /></Label>
              </div>
              <Label t="Best way to contact you"><Select value={f.preferred_contact} onChange={(v) => set({ preferred_contact: v })} options={[['email', 'Email'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone call']]} /></Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label t="Date of birth" hint="Only needed for learners under 18."><input type="date" className={inputCls} value={f.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} /></Label>
                {isMinor(f.date_of_birth) && <Label t="Parent or guardian name *"><input className={inputCls} value={f.guardian_name} onChange={(e) => set({ guardian_name: e.target.value })} /></Label>}
              </div>
              <Label t="Your current level">
                <Select value={f.level_self} onChange={(v) => set({ level_self: v })} placeholder="Choose one"
                  options={[['new', 'Complete beginner'], ['basic', 'I know some basics'], ['some', 'I can have simple conversations'], ['confident', 'I am fairly confident'], ['advanced', 'Advanced']]} />
              </Label>
              <Label t="What would you like to achieve?"><textarea rows={3} className={inputCls} value={f.objectives} onChange={(e) => set({ objectives: e.target.value })} placeholder="For example: speak confidently in meetings" /></Label>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Days that suit you</span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <button type="button" key={d} onClick={() => set({ preferred_days: toggle(f.preferred_days, d) })}
                      className={cx('rounded-xl px-3 py-2 text-sm font-medium', f.preferred_days.includes(d) ? 'bg-brand-navy text-white' : 'bg-brand-cream text-brand-navy')}>{DAYS_SHORT[d]}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Times that suit you</span>
                <div className="flex flex-wrap gap-2">
                  {[['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['weekend', 'Weekends']].map(([v, l]) => (
                    <button type="button" key={v} onClick={() => set({ preferred_times: toggle(f.preferred_times, v) })}
                      className={cx('rounded-xl px-3 py-2 text-sm font-medium', f.preferred_times.includes(v) ? 'bg-brand-navy text-white' : 'bg-brand-cream text-brand-navy')}>{l}</button>
                  ))}
                </div>
              </div>
              <Label t="Your time zone" hint="Class times are in Malaysia time; we use this to suggest times that work for you.">
                <input className={inputCls} value={f.timezone} onChange={(e) => set({ timezone: e.target.value })} />
              </Label>
              <Label t="Anything else we should know?"><textarea rows={3} className={inputCls} value={f.additional_info} onChange={(e) => set({ additional_info: e.target.value })} /></Label>
            </>
          )}
          {step === 3 && (
            <>
              <div className="rounded-xl bg-brand-cream/50 p-4 text-sm text-slate-600">
                <b className="text-brand-navy">{f.student_name}</b> · {f.email}<br />
                {language?.name}{programme ? ` · ${programme.name}` : ''} · {f.format === 'one_to_one' ? 'One-to-one' : f.format === 'group' ? 'Group' : 'Group or one-to-one'} · {f.mode}
                {f.date_of_birth && <><br />Date of birth: {fmtDate(f.date_of_birth)}</>}
              </div>
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-pink" checked={f.consent_privacy} onChange={(e) => set({ consent_privacy: e.target.checked })} />
                <span>I agree that {'Top Mind Enterprise'} may use my details to process this registration, as described in the <Link to="/privacy" target="_blank" className="font-semibold text-brand-pink">privacy policy</Link>. *</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-pink" checked={f.consent_whatsapp} onChange={(e) => set({ consent_whatsapp: e.target.checked })} />
                <span>Send me class updates, invoices and reminders on WhatsApp.</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-pink" checked={f.consent_marketing} onChange={(e) => set({ consent_marketing: e.target.checked })} />
                <span>Tell me about new classes and offers (optional).</span>
              </label>
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={(e) => set({ website: e.target.value })} />
            </>
          )}
          <Alert msg={act.error} />
          <div className="flex justify-between gap-3 pt-2">
            {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Back</Button> : <span />}
            {step < STEPS.length - 1 ? <Button onClick={next}>Next <ArrowRight size={16} /></Button>
              : <Button type="submit" variant="secondary" busy={act.busy}>Submit registration</Button>}
          </div>
        </form>
      </Card>
      {catalog.error && <div className="mt-4"><Alert msg={catalog.error} /></div>}
    </div>
  )
}
