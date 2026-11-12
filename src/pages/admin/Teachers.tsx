import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, KeyRound, Link2, Mail, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { addTeacherWorkshop, removeTeacherWorkshop, useTeacherWorkshops, isDemoActive } from '../../lib/mockData'
import { DAYS, fmtDate, fmtTime, label, money, todayMY } from '../../lib/format'
import { appOriginUrl } from '../../lib/util'
import ResourcePage from '../../components/ResourcePage'
import { LessonCalendar } from '../../components/Calendar'
import { AvailabilityEditor, BookingSettingsForm } from '../teacher/Bookings'
import { Alert, Badge, Button, Card, KeyValue, Label, Loaded, Loading, Modal, PageHeader, SearchBox, Section, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

export function Teachers() {
  const [search, setSearch] = useState('')
  const [accountStatus, setAccountStatus] = useState('')
  const [employment, setEmployment] = useState('')
  const [inviting, setInviting] = useState(false)
  const [credTeacher, setCredTeacher] = useState<any | null>(null)
  const list = useLoad(() => q<any[]>(supabase.from('profiles')
    .select('id, full_name, email, phone, status, teacher_profiles(teacher_code, employment_status, employment_type), teacher_languages(languages(name)), classes(id, status)')
    .eq('role', 'teacher').order('full_name')), [])
  const filtered = useMemo(() => (list.data ?? []).filter((t) => (!accountStatus || t.status === accountStatus) && (!employment || t.teacher_profiles?.employment_status === employment) && (!search || `${t.full_name} ${t.email} ${t.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, search, accountStatus, employment])
  return (
    <div>
      <PageHeader title="Teachers" subtitle="Profiles, languages, schedules, pay arrangements and availability.">
        <Button onClick={() => setInviting(true)}><Mail size={16} />Invite a teacher</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2"><SearchBox value={search} onChange={setSearch} placeholder="Search teacher, email or phone" /><Select className="!w-auto" value={accountStatus} onChange={setAccountStatus} placeholder="All account statuses" options={['active','suspended']} /><Select className="!w-auto" value={employment} onChange={setEmployment} placeholder="All employment statuses" options={['active','inactive','on_leave']} /></div>
      <Loaded state={{...list, data: list.data ? filtered : null}} empty="No teachers match your filters. Invite one, or change an existing account's role under Accounts.">
        {(rows) => (
          <Table head={['ID', 'Teacher', 'Languages', 'Active classes', 'Employment', 'Account', '']}>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-brand-cream/30">
                <Td className="text-xs text-slate-500">{t.teacher_profiles?.teacher_code}</Td>
                <Td><Link to={`/admin/teachers/${t.id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{t.full_name ?? t.email}</Link><div className="text-xs text-slate-500">{t.email} {t.phone && `· ${t.phone}`}</div></Td>
                <Td className="text-xs">{t.teacher_languages.map((x: any) => x.languages?.name).join(', ') || '—'}</Td>
                <Td>{t.classes.filter((c: any) => c.status === 'active').length}</Td>
                <Td><Badge v={t.teacher_profiles?.employment_status ?? 'active'} /> <span className="text-xs text-slate-500">{label(t.teacher_profiles?.employment_type)}</span></Td>
                <Td><Badge v={t.status} /></Td>
                <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setCredTeacher(t)}><KeyRound size={14} />Credentials</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {inviting && <InviteModal role="teacher" onClose={() => setInviting(false)} onDone={() => { setInviting(false); list.reload() }} />}
      {credTeacher && <CredentialsModal teacher={credTeacher} onClose={() => setCredTeacher(null)} />}
    </div>
  )
}

export function InviteModal({ role, onClose, onDone }: { role: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ email: '', full_name: '', role })
  const act = useAction()
  return (
    <Modal title="Invite someone" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">In demo mode, this creates a local teacher profile without sending email. After adding the teacher, use Credentials to set a demo password. In live mode, invitations are emailed.</p>
        <Label t="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Label>
        <Label t="Email *"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Label>
        <Label t="Role"><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={['teacher', 'admin', 'student']} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.email || f.full_name.trim().length < 2} onClick={() => act.run(async () => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) throw new Error('Enter a valid teacher email address.'); if (f.full_name.trim().length < 2) throw new Error('Enter a full name.'); await callFunction('admin-users', { action: 'invite', ...f, email: f.email.trim().toLowerCase(), full_name: f.full_name.trim() }); onDone() })}>{isDemoActive() ? 'Create demo account' : 'Send invitation'}</Button></div>
      </div>
    </Modal>
  )
}

export function TeacherDetail() {
  const { id } = useParams()
  const sym = useCurrency()
  const [tab, setTab] = useState<'profile' | 'schedule' | 'pay' | 'bookings'>('profile')
  const [editing, setEditing] = useState(false)
  const [creds, setCreds] = useState(false)
  const data = useLoad(async () => ({
    p: await q<any>(supabase.from('profiles').select('id, full_name, email, phone, status, teacher_profiles(*), teacher_languages(language_id)').eq('id', id).single()),
    languages: await q<any[]>(supabase.from('languages').select('id, name, is_active').order('sort_order')),
    classes: await q<any[]>(supabase.from('classes').select('id, name, status, class_schedules(weekday, start_time, end_time)').eq('teacher_id', id).order('name')),
    payouts: await q<any[]>(supabase.from('teacher_payouts').select('id, period, status, amount, amount_paid').eq('teacher_id', id).order('period', { ascending: false })),
  }), [id])
  const act = useAction()
  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { p, languages, classes, payouts } = data.data!
  const tp = p.teacher_profiles ?? {}
  const myLangs = new Set(p.teacher_languages.map((x: any) => x.language_id))
  const toggleLang = (lid: string) => act.run(async () => {
    if (myLangs.has(lid)) await q(supabase.from('teacher_languages').delete().eq('teacher_id', id).eq('language_id', lid))
    else await q(supabase.from('teacher_languages').insert({ teacher_id: id, language_id: lid }))
    data.reload()
  })

  return (
    <div>
      <Link to="/admin/teachers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-pink"><ArrowLeft size={14} />All teachers</Link>
      <PageHeader title={p.full_name ?? p.email} subtitle={<span className="flex items-center gap-2">{tp.teacher_code} <Badge v={tp.employment_status} /> <Badge v={p.status} /></span>}>
        <Button variant="ghost" onClick={() => setCreds(true)}><KeyRound size={16} />Credentials</Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>Edit profile</Button>
      </PageHeader>
      <Alert msg={act.error} />
      <Tabs value={tab} onChange={setTab} tabs={[['profile', 'Profile'], ['schedule', 'Schedule'], ['pay', 'Pay'], ['bookings', 'One-to-one']]} />

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Details" className="lg:col-span-2">
            <KeyValue rows={[['Email', p.email], ['Phone', p.phone], ['Employment start', fmtDate(tp.employment_start)], ['Employment type', label(tp.employment_type)],
              ['Address', tp.address], ['Qualifications', tp.qualifications], ['Bio (shown to students)', tp.bio], ['Notes', tp.notes]]} />
          </Section>
          <Section title="Languages taught">
            <div className="space-y-2">
              {languages.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={myLangs.has(l.id)} onChange={() => toggleLang(l.id)} />{l.name}{!l.is_active && <span className="text-xs text-slate-400">(inactive)</span>}</label>
              ))}
            </div>
          </Section>
          <Section title="Assigned classes" className="lg:col-span-3">
            {!classes.length ? <p className="text-sm text-slate-500">No classes assigned. Assign the teacher on a class page.</p> : (
              <ul className="divide-y text-sm">{classes.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link to={`/admin/classes/${c.id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{c.name}</Link>
                  <span className="text-slate-500">{c.class_schedules.map((s: any) => `${DAYS[s.weekday].slice(0, 3)} ${fmtTime(s.start_time)}`).join(', ')} <Badge v={c.status} /></span>
                </li>
              ))}</ul>
            )}
          </Section>
        </div>
      )}
      {tab === 'schedule' && <LessonCalendar teacherId={id} showTeacher={false} />}
      {tab === 'pay' && <TeacherPayTab teacherId={id!} payouts={payouts} sym={sym} />}
      {tab === 'bookings' && (
        <div className="space-y-6">
          <BookingSettingsForm teacherId={id!} />
          <AvailabilityEditor teacherId={id!} />
        </div>
      )}
      {editing && <EditTeacher p={p} onClose={() => setEditing(false)} onDone={() => { setEditing(false); data.reload() }} />}
      {creds && <CredentialsModal teacher={p} onClose={() => setCreds(false)} />}
    </div>
  )
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr, (x) => chars[x % chars.length]).join('')
}

function CredentialsModal({ teacher, onClose }: { teacher: any; onClose: () => void }) {
  const loginUrl = typeof window !== 'undefined' ? appOriginUrl('login') : '/login'
  const [password, setPassword] = useState('')
  const [savedPassword, setSavedPassword] = useState('')
  const [oneTimeLink, setOneTimeLink] = useState('')
  const [copied, setCopied] = useState(false)
  const act = useAction()

  const teacherName = teacher.full_name || teacher.email || 'Teacher'
  const messageLines = [
    `Hi ${teacherName},`,
    '',
    'Here are your Top Mind Teacher Portal access details:',
    `• Portal Login URL: ${loginUrl}`,
    `• Registered Email: ${teacher.email}`,
    ...(savedPassword ? [`• Temporary Password: ${savedPassword}`] : []),
    ...(oneTimeLink ? [`• One-Time Login Link: ${oneTimeLink}`] : []),
    '',
    savedPassword
      ? 'Please sign in with your email and temporary password, then update your password if you wish.'
      : 'Please open the login link above (or sign in at /login) to access your Teacher Portal.',
  ]
  const formattedMessage = messageLines.join('\n')

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(formattedMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      act.setError('Could not access clipboard automatically. Please copy the message below manually.')
    }
  }

  return (
    <Modal title={`Teacher Portal Credentials · ${teacherName}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-2xl border border-brand-cream-dark bg-brand-cream/40 p-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Portal Login URL</div>
            <div className="mt-1 break-all font-mono text-sm font-semibold text-brand-navy">{loginUrl}</div>
            <div className="text-xs text-slate-400">Path: /login</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registered Email</div>
            <div className="mt-1 break-all font-mono text-sm font-semibold text-brand-navy">{teacher.email}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-2xl border border-brand-cream-dark p-4">
            <div className="text-sm font-bold text-brand-navy">Set / Reset Temporary Password</div>
            <p className="text-xs text-slate-500">Set a password of at least 8 characters that works immediately at /login.</p>
            <div className="flex gap-2">
              <input
                type="text"
                className={inputCls}
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                title="Generate strong password"
                onClick={() => setPassword(generateTempPassword())}
              >
                <RefreshCw size={14} />
              </Button>
            </div>
            <Button
              size="sm"
              className="w-full"
              busy={act.busy}
              disabled={password.trim().length < 8}
              onClick={() =>
                act.run(async () => {
                  const pw = password.trim()
                  await callFunction('admin-users', { action: 'set_password', user_id: teacher.id, password: pw })
                  setSavedPassword(pw)
                }, 'Temporary password set and included below.')
              }
            >
              <KeyRound size={14} />
              Set temporary password
            </Button>
          </div>

          <div className="flex flex-col justify-between space-y-2 rounded-2xl border border-brand-cream-dark p-4">
            <div>
              <div className="text-sm font-bold text-brand-navy">One-Time Login Link or Reset Email</div>
              <p className="mt-1 text-xs text-slate-500">In demo mode, links and emails are simulated. Set a temporary password to test teacher login on this browser.</p>
            </div>
            <div className="space-y-2">
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                busy={act.busy}
                onClick={() =>
                  act.run(async () => {
                    const res = await callFunction<{ link: string }>('admin-users', { action: 'generate_link', user_id: teacher.id })
                    setOneTimeLink(res.link)
                  }, 'One-time login link generated.')
                }
              >
                <Link2 size={14} />
                Generate one-time login link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                busy={act.busy}
                onClick={() =>
                  act.run(
                    () => callFunction('admin-users', { action: 'password_reset', user_id: teacher.id }),
                    `Reset / invitation email sent to ${teacher.email}.`,
                  )
                }
              >
                <Mail size={14} />
                Send reset email instead
              </Button>
            </div>
          </div>
        </div>

        <Alert msg={act.error || act.ok} ok={!!act.ok} />

        <div>
          <Label t="WhatsApp / SMS Message Preview">
            <textarea rows={7} readOnly className={inputCls + ' font-mono text-xs'} value={formattedMessage} />
          </Label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-brand-cream-dark/60 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
          <Button type="button" onClick={copyMessage}>
            {copied ? <><Check size={15} />Copied!</> : <><Copy size={15} />Copy Credentials</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EditTeacher({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const tp = p.teacher_profiles ?? {}
  const [f, setF] = useState({
    full_name: p.full_name ?? '', phone: p.phone ?? '', employment_start: tp.employment_start ?? '', employment_status: tp.employment_status ?? 'active',
    employment_type: tp.employment_type ?? '', qualifications: tp.qualifications ?? '', bio: tp.bio ?? '', address: tp.address ?? '', notes: tp.notes ?? '',
  })
  const act = useAction()
  return (
    <Modal title="Edit teacher" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Label>
        <Label t="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Label>
        <Label t="Employment start"><input type="date" className={inputCls} value={f.employment_start} onChange={(e) => setF({ ...f, employment_start: e.target.value })} /></Label>
        <Label t="Employment status"><Select value={f.employment_status} onChange={(v) => setF({ ...f, employment_status: v })} options={['active', 'on_leave', 'inactive']} /></Label>
        <Label t="Employment type"><Select value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} placeholder="—" options={['full_time', 'part_time', 'contract', 'freelance']} /></Label>
        <Label t="Address"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Label>
        <Label t="Qualifications" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.qualifications} onChange={(e) => setF({ ...f, qualifications: e.target.value })} /></Label>
        <Label t="Bio (shown to students)" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Label>
        <Label t="Internal notes" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Label>
      </div>
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => {
            const { full_name, phone, ...rest } = f
            await q(supabase.from('profiles').update({ full_name, phone: phone || null }).eq('id', p.id))
            await q(supabase.from('teacher_profiles').update(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))).eq('profile_id', p.id))
            onDone()
          })}>Save</Button></div></div>
    </Modal>
  )
}

function TeacherPayTab({ teacherId, payouts, sym }: { teacherId: string; payouts: any[]; sym: string }) {
  const workshops = useTeacherWorkshops(teacherId)
  const [addingWorkshop, setAddingWorkshop] = useState(false)
  const [wf, setWf] = useState({ title: '', date: todayMY(), duration_minutes: '90', attendees: '12', amount: '150', notes: '' })

  const submitWorkshop = () => {
    if (!wf.title.trim() || !wf.amount) return
    addTeacherWorkshop({
      teacher_id: teacherId,
      title: wf.title,
      date: wf.date || todayMY(),
      duration_minutes: Number(wf.duration_minutes || 90),
      attendees: Number(wf.attendees || 0),
      amount: Number(wf.amount),
      notes: wf.notes,
    })
    setWf({ title: '', date: todayMY(), duration_minutes: '90', attendees: '12', amount: '150', notes: '' })
    setAddingWorkshop(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <ResourcePage embedded table="teacher_rates" title="Pay arrangements" filter={['teacher_id', teacherId]} defaults={{ teacher_id: teacherId }} order="effective_from"
          cols={[{ key: 'basis', label: 'Basis', render: (r) => <Badge v={r.basis} /> }, { key: 'rate', label: 'Rate', render: (r) => money(r.rate, sym) },
            { key: 'applies_to', label: 'Applies to', render: (r) => label(r.applies_to) }, { key: 'effective_from', label: 'From' }, { key: 'effective_to', label: 'To' }, { key: 'notes', label: 'Notes' }]}
          fields={[
            { key: 'basis', label: 'Basis', type: 'select', required: true, options: [['hourly', 'Per teaching hour (RM)'], ['monthly', 'Fixed monthly salary (RM)'], ['per_workshop', 'Per workshop / masterclass (flat RM)'], ['per_student', 'Per student taught in the month'], ['per_lesson', 'Per completed lesson'], ['custom', 'Custom (add amounts manually)']] },
            { key: 'rate', label: 'Rate (RM)', type: 'number', required: true },
            { key: 'applies_to', label: 'Applies to', type: 'select', options: [['all', 'All sessions'], ['group', 'Group lessons'], ['one_to_one', 'One-to-one lessons']], defaultValue: 'all' },
            { key: 'effective_from', label: 'Effective from', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
            { key: 'effective_to', label: 'Effective until', type: 'date', hint: 'Leave empty if ongoing.' },
            { key: 'notes', label: 'Notes', type: 'textarea', hint: 'For workshops, note session length (e.g., Flat RM 150 per 90-min session).' }]} />
      </Card>

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles size={17} className="text-brand-pink" />
            Workshops &amp; masterclasses conducted
          </span>
        }
        actions={
          <Button size="sm" variant="cream" onClick={() => setAddingWorkshop(true)}>
            <Plus size={14} />Record workshop honorarium
          </Button>
        }
      >
        {!workshops.length ? (
          <p className="text-sm text-slate-500">No one-off workshops or trial classes logged for this teacher yet.</p>
        ) : (
          <Table head={['Workshop Title', 'Date', 'Duration', 'Attendees', 'Honorarium', '']}>
            {workshops.map((w) => (
              <tr key={w.id}>
                <Td><b className="text-brand-navy">{w.title}</b>{w.notes && <div className="text-xs text-slate-400">{w.notes}</div>}</Td>
                <Td>{fmtDate(w.date)}</Td>
                <Td>{w.duration_minutes} mins</Td>
                <Td>{w.attendees}</Td>
                <Td><b className="text-brand-pink">{money(w.amount, sym)}</b></Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => removeTeacherWorkshop(w.id)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove workshop entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Salary statements" actions={<Link to="/admin/salaries" className="text-sm font-semibold text-brand-pink">Salaries</Link>}>
        {!payouts.length ? <p className="text-sm text-slate-500">No statements yet.</p> : (
          <Table head={['Month', 'Status', 'Total', 'Paid', 'Outstanding']}>
            {payouts.map((x) => <tr key={x.id}><Td>{x.period?.slice(0, 7)}</Td><Td><Badge v={x.status} /></Td><Td>{money(x.amount, sym)}</Td><Td>{money(x.amount_paid, sym)}</Td><Td>{money(Number(x.amount) - Number(x.amount_paid), sym)}</Td></tr>)}
          </Table>
        )}
      </Section>

      {addingWorkshop && (
        <Modal title="Record workshop / trial class honorarium" onClose={() => setAddingWorkshop(false)}>
          <div className="space-y-3">
            <Label t="Workshop Title *">
              <input className={inputCls} placeholder="e.g., Storytelling Trial Workshop" value={wf.title} onChange={(e) => setWf({ ...wf, title: e.target.value })} />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label t="Session Date *">
                <input type="date" className={inputCls} value={wf.date} onChange={(e) => setWf({ ...wf, date: e.target.value })} />
              </Label>
              <Label t="Flat Honorarium (RM) *">
                <input type="number" min={0} step="0.01" className={inputCls} value={wf.amount} onChange={(e) => setWf({ ...wf, amount: e.target.value })} />
              </Label>
              <Label t="Duration (minutes)">
                <input type="number" min={15} className={inputCls} value={wf.duration_minutes} onChange={(e) => setWf({ ...wf, duration_minutes: e.target.value })} />
              </Label>
              <Label t="Attendees">
                <input type="number" min={0} className={inputCls} value={wf.attendees} onChange={(e) => setWf({ ...wf, attendees: e.target.value })} />
              </Label>
            </div>
            <Label t="Notes">
              <input className={inputCls} placeholder="e.g., 90-min Saturday free trial workshop" value={wf.notes} onChange={(e) => setWf({ ...wf, notes: e.target.value })} />
            </Label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAddingWorkshop(false)}>Cancel</Button>
              <Button disabled={!wf.title.trim() || !wf.amount} onClick={submitWorkshop}>Save workshop payout</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
