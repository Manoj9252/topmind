import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Award, Download, Eye, EyeOff, Mail, Plus, Trash2, Trophy, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import {
  AwardCategory,
  nominateStudentSpotlight,
  removeStudentSpotlight,
  toggleSpotlightFeatured,
  useStudentSpotlights,
} from '../../lib/mockData'
import { fmtDate, fmtDateTime, label, money, todayMY } from '../../lib/format'
import {
  Alert, Badge, Button, Card, ConfirmModal, Empty, KeyValue, Label, Loaded, Loading, Modal, PageHeader, SearchBox, Section, Select, Table, Tabs, Td, inputCls,
} from '../../components/ui'

const STUDENT_FIELDS = 'id, student_code, full_name, email, phone, billing_day, race_ethnicity, status, created_at, profile_id, date_of_birth, preferred_language_id, learning_objectives, notes, timezone, preferred_contact, guardian_name, guardian_phone, consent_privacy_at, consent_marketing, consent_whatsapp, source, archived_at'

export function Students() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [raceFilter, setRaceFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [nominating, setNominating] = useState(false)
  const spotlights = useStudentSpotlights()
  const list = useLoad(() => q<any[]>(supabase.from('students')
    .select('id, student_code, full_name, email, phone, race_ethnicity, status, created_at, profile_id, enrolments(status, classes(name))')
    .order('created_at', { ascending: false })), [])
  const shown = useMemo(() => (list.data ?? []).filter((s) => (!status || s.status === status) && (!raceFilter || s.race_ethnicity === raceFilter)
    && (!search || `${s.full_name} ${s.email ?? ''} ${s.phone ?? ''} ${s.student_code}`.toLowerCase().includes(search.toLowerCase()))), [list.data, search, status, raceFilter])

  return (
    <div className="space-y-6">
      <PageHeader title="Students" subtitle={`${shown.length} shown`}>
        <SearchBox value={search} onChange={setSearch} placeholder="Name, email, phone or ID" />
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses" options={['active', 'inactive', 'suspended', 'archived']} />
        <Select className="!w-auto" value={raceFilter} onChange={setRaceFilter} placeholder="All ethnicities" options={Array.from(new Set((list.data ?? []).map((s) => s.race_ethnicity).filter(Boolean))).sort()} />
        <Button variant="ghost" disabled={!shown.length} onClick={() => downloadCsv(shown.map((s) => ({
          student_id: s.student_code, name: s.full_name, ethnicity: s.race_ethnicity ?? '', email: s.email, phone: s.phone, status: s.status, registered: s.created_at?.slice(0, 10),
          classes: s.enrolments.filter((e: any) => e.status === 'active').map((e: any) => e.classes?.name).join('; '),
        })), 'students')}><Download size={16} />CSV</Button>
        <Button variant="cream" onClick={() => setNominating(true)}><Award size={16} className="text-brand-pink" />Nominate Student of the Month</Button>
        <Button onClick={() => setAdding(true)}><Plus size={16} />Add student</Button>
      </PageHeader>
      <Loaded state={{ ...list, data: list.data && shown }} empty={search ? 'No students match your search.' : 'No students yet.'}>
        {(rows) => (
          <Table head={['ID', 'Name', 'Contact', 'Current classes', 'Portal', 'Status']}>
            {rows.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => navigate(`/admin/students/${s.id}`)}>
                <Td className="whitespace-nowrap text-xs text-slate-500">{s.student_code}</Td>
                <Td><b className="text-brand-navy">{s.full_name}</b></Td>
                <Td className="text-xs">{s.email}<br />{s.phone}</Td>
                <Td className="text-xs">{s.enrolments.filter((e: any) => ['active', 'waitlisted', 'suspended'].includes(e.status)).map((e: any) => (
                  <div key={e.classes?.name}>{e.classes?.name} {e.status !== 'active' && <Badge v={e.status} />}</div>)) }</Td>
                <Td>{s.profile_id ? <Badge v="active" text="Linked" /> : <Badge v="draft" text="No login" />}</Td>
                <Td><Badge v={s.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <Trophy size={17} className="text-brand-pink" />
            Student of the Month &amp; Hall of Fame ({spotlights.length})
          </span>
        }
        actions={
          <Button size="sm" variant="secondary" onClick={() => setNominating(true)}>
            <Award size={14} />Nominate Student of the Month
          </Button>
        }
      >
        {!spotlights.length ? (
          <Empty text="No student spotlights nominated yet." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {spotlights.map((spot) => (
              <div key={spot.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-brand-cream-dark bg-brand-cream/30 p-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b className="text-brand-navy">{spot.student_name}</b>
                      <div className="text-xs text-slate-500">{spot.language_level} · {spot.month_label}</div>
                    </div>
                    <Badge tone="pink" text={spot.category} />
                  </div>
                  <p className="mt-2 text-sm italic text-slate-700">“{spot.quote}”</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-cream-dark/60 pt-2 text-xs">
                  <span className="text-slate-500">By {spot.teacher_name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSpotlightFeatured(spot.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-semibold text-brand-navy ring-1 ring-brand-cream-dark hover:bg-brand-cream"
                    >
                      {spot.featured_on_website ? <><Eye size={13} className="text-emerald-600" />Public Website</> : <><EyeOff size={13} className="text-slate-400" />Internal Only</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStudentSpotlight(spot.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Delete nomination"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {adding && <StudentForm onClose={() => setAdding(false)} onSaved={(id) => navigate(`/admin/students/${id}`)} />}
      {nominating && <NominateStudentModal students={list.data ?? []} onClose={() => setNominating(false)} />}
    </div>
  )
}

function StudentForm({ student, onClose, onSaved }: { student?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const languages = useLoad(() => q<any[]>(supabase.from('languages').select('id, name').order('sort_order')), [])
  const [f, setF] = useState({
    full_name: student?.full_name ?? '', email: student?.email ?? '', phone: student?.phone ?? '', billing_day: student?.billing_day ?? 7, race_ethnicity: student?.race_ethnicity ?? '', date_of_birth: student?.date_of_birth ?? '',
    preferred_language_id: student?.preferred_language_id ?? '', learning_objectives: student?.learning_objectives ?? '',
    guardian_name: student?.guardian_name ?? '', guardian_phone: student?.guardian_phone ?? '', notes: student?.notes ?? '',
    preferred_contact: student?.preferred_contact ?? 'email', timezone: student?.timezone ?? 'Asia/Kuala_Lumpur',
    consent_whatsapp: student?.consent_whatsapp ?? false, consent_marketing: student?.consent_marketing ?? false,
    consent_privacy: !!student?.consent_privacy_at,
  })
  const act = useAction()
  const save = () => act.run(async () => {
    if (f.full_name.trim().length < 2) throw new Error('Enter the student\'s full name')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) throw new Error('Enter a valid email address.')
    if (!Number.isInteger(Number(f.billing_day)) || Number(f.billing_day) < 1 || Number(f.billing_day) > 28) throw new Error('Billing day must be between 1 and 28.')
    const { consent_privacy, ...rest } = f
    const payload: Record<string, unknown> = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    payload.email = f.email.trim().toLowerCase() || null
    payload.consent_privacy_at = consent_privacy ? (student?.consent_privacy_at ?? new Date().toISOString()) : null
    if (student) {
      await q(supabase.from('students').update(payload).eq('id', student.id))
      onSaved(student.id)
    } else {
      const row = await q<any>(supabase.from('students').insert({ ...payload, source: 'admin' }).select('id').single())
      onSaved(row.id)
    }
    onClose()
  })
  return (
    <Modal title={student ? 'Edit student' : 'Add student'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Full name *"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Label>
        <Label t="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Label>
        <Label t="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Label>
        <Label t="Monthly billing day (1–28)"><input type="number" min="1" max="28" className={inputCls} value={f.billing_day} onChange={(e) => setF({ ...f, billing_day: Number(e.target.value) })} /></Label>
        <Label t="Race / ethnicity (optional, self-reported)"><Select value={f.race_ethnicity} onChange={(v) => setF({ ...f, race_ethnicity: v })} placeholder="Prefer not to say" options={['Malay', 'Chinese', 'Indian', 'Indigenous / Bumiputera', 'Other', 'Prefer not to say']} /></Label>
        <Label t="Preferred contact"><Select value={f.preferred_contact} onChange={(v) => setF({ ...f, preferred_contact: v })} options={['email', 'whatsapp', 'phone']} /></Label>
        <Label t="Date of birth"><input type="date" className={inputCls} value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Label>
        <Label t="Preferred language"><Select value={f.preferred_language_id} onChange={(v) => setF({ ...f, preferred_language_id: v })} placeholder="—" options={(languages.data ?? []).map((l) => [l.id, l.name])} /></Label>
        <Label t="Emergency contact / guardian"><input className={inputCls} value={f.guardian_name} onChange={(e) => setF({ ...f, guardian_name: e.target.value })} /></Label>
        <Label t="Emergency contact phone"><input className={inputCls} value={f.guardian_phone} onChange={(e) => setF({ ...f, guardian_phone: e.target.value })} /></Label>
        <Label t="Time zone"><input className={inputCls} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Label>
        <Label t="Learning objectives" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.learning_objectives} onChange={(e) => setF({ ...f, learning_objectives: e.target.value })} /></Label>
        <Label t="Internal notes" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Label>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-pink" checked={f.consent_privacy} onChange={(e) => setF({ ...f, consent_privacy: e.target.checked })} />The student has agreed to the privacy policy</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-pink" checked={f.consent_whatsapp} onChange={(e) => setF({ ...f, consent_whatsapp: e.target.checked })} />Agreed to WhatsApp messages</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-pink" checked={f.consent_marketing} onChange={(e) => setF({ ...f, consent_marketing: e.target.checked })} />Agreed to marketing messages</label>
      </div>
      <div className="mt-4 space-y-3"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={act.busy} onClick={save}>Save</Button></div></div>
    </Modal>
  )
}

export function StudentDetail() {
  const { id } = useParams()
  const sym = useCurrency()
  const [tab, setTab] = useState<'overview' | 'classes' | 'placement' | 'attendance' | 'billing' | 'messages'>('overview')
  const [modal, setModal] = useState<any>(null)
  const act = useAction()
  const data = useLoad(async () => {
    const [student, enrolments, placements, invoices, payments, bookings, messages] = await Promise.all([
      q<any>(supabase.from('students').select(STUDENT_FIELDS + ', languages(name)').eq('id', id).single()),
      q<any[]>(supabase.from('enrolments').select('*, classes(id, name, fee, billing_frequency)').eq('student_id', id).order('created_at', { ascending: false })),
      q<any[]>(supabase.from('placements').select('*, courses(name), levels(name), classes(name)').eq('student_id', id).order('created_at', { ascending: false })),
      q<any[]>(supabase.from('invoice_overview').select('*').eq('student_id', id).order('created_at', { ascending: false })),
      q<any[]>(supabase.from('payments').select('id, amount, method, status, paid_on, receipt_no, reference, invoices(invoice_no)').eq('student_id', id).order('created_at', { ascending: false })),
      q<any[]>(supabase.from('bookings').select('id, starts_at, status, duration_minutes, profiles!bookings_teacher_id_fkey(full_name)').eq('student_id', id).order('starts_at', { ascending: false }).limit(20)),
      q<any[]>(supabase.from('message_outbox').select('id, created_at, channel, template_key, subject, status').eq('student_id', id).order('created_at', { ascending: false }).limit(30)),
    ])
    return { student, enrolments, placements, invoices, payments, bookings, messages }
  }, [id])
  const attendance = useLoad(() => rpc<any[]>('attendance_summary', { p_student: id }), [id])

  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { student: s, enrolments, placements, invoices, payments, bookings, messages } = data.data!
  const balance = invoices.filter((i) => ['unpaid', 'partial'].includes(i.status)).reduce((n, i) => n + Number(i.balance), 0)

  const invite = () => act.run(async () => {
    await callFunction('admin-users', { action: 'invite', email: s.email, role: 'student', full_name: s.full_name, student_id: s.id })
    data.reload()
  }, `Student invitation recorded in this demo (no email sent to ${s.email}).`)

  return (
    <div>
      <Link to="/admin/students" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-pink"><ArrowLeft size={14} />All students</Link>
      <PageHeader title={s.full_name} subtitle={<span className="flex flex-wrap items-center gap-2">{s.student_code} <Badge v={s.status} />{s.profile_id ? <Badge v="active" text="Portal linked" /> : <Badge v="draft" text="No portal login" />}</span>}>
        {!s.profile_id && s.email && <Button variant="ghost" busy={act.busy} onClick={invite}><Mail size={16} />Invite to portal</Button>}
        <Button variant="ghost" onClick={() => setModal({ kind: 'edit' })}>Edit</Button>
        {s.status !== 'archived'
          ? <Button variant="danger" onClick={() => setModal({ kind: 'archive' })}>Archive</Button>
          : <Button variant="success" onClick={() => act.run(async () => { await q(supabase.from('students').update({ status: 'active', archived_at: null }).eq('id', s.id)); data.reload() })}>Reactivate</Button>}
        {s.status === 'archived' && !s.full_name.startsWith('Anonymised student') && <Button variant="danger" onClick={() => setModal({ kind: 'anonymise' })}>Erase personal data</Button>}
      </PageHeader>
      <div className="mb-4 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Overview'], ['classes', `Classes (${enrolments.filter((e) => e.status === 'active').length})`],
        ['placement', 'Level & placement'], ['attendance', 'Attendance'], ['billing', `Billing${balance ? ` · ${money(balance, sym)} due` : ''}`], ['messages', 'Messages']]} />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Profile" className="lg:col-span-2">
            <KeyValue rows={[['Email', s.email], ['Phone', s.phone], ['Race / ethnicity (optional)', s.race_ethnicity], ['Preferred contact', label(s.preferred_contact)], ['Monthly billing day', s.billing_day ?? 7], ['Date of birth', fmtDate(s.date_of_birth)],
              ['Preferred language', s.languages?.name], ['Time zone', s.timezone], ['Emergency contact', [s.guardian_name, s.guardian_phone].filter(Boolean).join(' · ') || '—'],
              ['Registered', fmtDate(s.created_at)], ['Source', label(s.source)], ['Learning objectives', s.learning_objectives], ['Notes', s.notes]]} />
          </Section>
          <Section title="Consent">
            <ul className="space-y-2 text-sm">
              <li>Privacy policy: {s.consent_privacy_at ? <Badge v="active" text={`Agreed ${fmtDate(s.consent_privacy_at)}`} /> : <Badge v="pending" text="Not recorded" />}</li>
              <li>WhatsApp messages: {s.consent_whatsapp ? <Badge v="active" text="Yes" /> : <Badge v="draft" text="No" />}</li>
              <li>Marketing: {s.consent_marketing ? <Badge v="active" text="Yes" /> : <Badge v="draft" text="No" />}</li>
            </ul>
          </Section>
        </div>
      )}

      {tab === 'classes' && (
        <Section title="Enrolments (history is kept)" actions={<Button size="sm" onClick={() => setModal({ kind: 'enrol' })}><UserPlus size={14} />Enrol in a class</Button>}>
          {!enrolments.length ? <Empty text="Not enrolled in any class yet." /> : (
            <Table head={['Class', 'Status', 'From', 'To', 'Fee', 'Notes', '']}>
              {enrolments.map((e) => (
                <tr key={e.id}>
                  <Td><Link to={`/admin/classes/${e.class_id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{e.classes?.name}</Link></Td>
                  <Td><Badge v={e.status} /></Td><Td>{fmtDate(e.start_date)}</Td><Td>{fmtDate(e.end_date)}</Td>
                  <Td className="text-xs">{e.fee_override != null ? `${money(e.fee_override, sym)} (custom)` : money(e.classes?.fee, sym)}{Number(e.discount_percent) > 0 && ` · ${e.discount_percent}% off`}</Td>
                  <Td className="text-xs text-slate-500">{e.reason ?? e.notes}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {['active', 'suspended', 'waitlisted', 'pending'].includes(e.status) && (
                      <Select className="!w-36 !py-1.5 text-xs" value="" placeholder="Change…" onChange={(v) => setModal({ kind: v, enrolment: e })}
                        options={[...(e.status !== 'active' ? [['active', e.status === 'waitlisted' ? 'Give a place' : 'Resume']] : []) as [string, string][],
                          ['transfer', 'Transfer'], ...(e.status === 'active' ? [['suspended', 'Pause']] : []) as [string, string][],
                          ['completed', 'Mark completed'], ['withdrawn', 'Withdraw'], ['fees', 'Fee / discount']]} />
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {tab === 'placement' && (
        <Section title="Level history" actions={<Button size="sm" onClick={() => setModal({ kind: 'place' })}>Record placement</Button>}>
          {!placements.length ? <Empty text="No placement recorded yet." /> : (
            <Table head={['Date', 'Programme', 'Level', 'Class', 'How', 'Reason']}>
              {placements.map((p) => (
                <tr key={p.id}><Td>{fmtDate(p.created_at)}</Td><Td>{p.courses?.name}</Td><Td><b>{p.levels?.name ?? '—'}</b></Td><Td>{p.classes?.name ?? '—'}</Td><Td><Badge v={p.source} tone="navy" /></Td><Td className="text-xs">{p.reason}</Td></tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {tab === 'attendance' && (
        <Loaded state={attendance} empty="No lessons yet.">
          {(rows) => (
            <Table head={['Class', 'Lessons so far', 'Present', 'Late', 'Absent', 'Excused', 'Not marked', 'Attendance']}>
              {rows.map((r) => (
                <tr key={r.class_id}><Td>{r.class_name}</Td><Td>{r.scheduled}</Td><Td>{r.present}</Td><Td>{r.late}</Td><Td>{r.absent}</Td><Td>{r.excused}</Td><Td>{r.unmarked}</Td>
                  <Td>{r.attendance_percent != null ? <b>{r.attendance_percent}%</b> : '—'}</Td></tr>
              ))}
            </Table>
          )}
        </Loaded>
      )}

      {tab === 'billing' && (
        <div className="space-y-6">
          <Section title="Invoices" actions={<Link to={`/admin/invoices?student=${s.id}`} className="text-sm font-semibold text-brand-pink">New invoice</Link>}>
            {!invoices.length ? <Empty text="No invoices." /> : (
              <Table head={['Invoice', 'Description', 'Due', 'Total', 'Paid', 'Balance', 'Status']}>
                {invoices.map((i) => (
                  <tr key={i.id}><Td>{i.invoice_no ?? 'Draft'}</Td><Td>{i.description}</Td><Td>{fmtDate(i.due_date)}</Td><Td>{money(i.amount_due, sym)}</Td>
                    <Td>{money(i.amount_paid, sym)}</Td><Td><b>{money(i.balance, sym)}</b></Td><Td><Badge v={i.display_status} /></Td></tr>
                ))}
              </Table>
            )}
          </Section>
          <Section title="Payments and receipts">
            {!payments.length ? <Empty text="No payments." /> : (
              <Table head={['Date', 'Invoice', 'Method', 'Reference', 'Amount', 'Receipt', 'Status']}>
                {payments.map((p) => (
                  <tr key={p.id}><Td>{fmtDate(p.paid_on)}</Td><Td>{p.invoices?.invoice_no}</Td><Td>{label(p.method)}</Td><Td>{p.reference ?? '—'}</Td>
                    <Td>{money(p.amount, sym)}</Td><Td>{p.receipt_no ?? '—'}</Td><Td><Badge v={p.status} /></Td></tr>
                ))}
              </Table>
            )}
          </Section>
          <Section title="One-to-one bookings">
            {!bookings.length ? <Empty text="No bookings." /> : (
              <ul className="divide-y text-sm">{bookings.map((b) => (
                <li key={b.id} className="flex justify-between py-2"><span>{fmtDateTime(b.starts_at, { tz: false })} · {b.profiles?.full_name} · {b.duration_minutes} min</span><Badge v={b.status} /></li>
              ))}</ul>
            )}
          </Section>
        </div>
      )}

      {tab === 'messages' && (
        <Card className="!p-0">
          {!messages.length ? <Empty text="No messages sent yet." /> : (
            <Table head={['When', 'Channel', 'Message', 'Status']}>
              {messages.map((m) => <tr key={m.id}><Td className="whitespace-nowrap">{fmtDateTime(m.created_at, { tz: false })}</Td><Td>{label(m.channel)}</Td><Td>{m.subject ?? label(m.template_key)}</Td><Td><Badge v={m.status} /></Td></tr>)}
            </Table>
          )}
        </Card>
      )}

      {modal?.kind === 'edit' && <StudentForm student={s} onClose={() => setModal(null)} onSaved={() => data.reload()} />}
      {modal?.kind === 'archive' && (
        <ConfirmModal title="Archive this student?" reason="Reason (kept in the audit log)" danger confirmText="Archive"
          message="Archived students keep all their history but disappear from active lists. You can reactivate them later."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await q(supabase.from('students').update({ status: 'archived', notes: [s.notes, `Archived: ${reason}`].filter(Boolean).join('\n') }).eq('id', s.id)); data.reload() }} />
      )}
      {modal?.kind === 'anonymise' && (
        <ConfirmModal title="Erase this student's personal data?" reason="Reason to record, for example the date of their request" danger confirmText="Erase personal data"
          message="Name, contact details, date of birth, goals and notes are removed from the student record, registrations, enquiries, messages and old audit entries, and the portal login is closed. Invoices, receipts and payments keep the details they were issued with, as the law requires. This cannot be undone."
          onClose={() => setModal(null)}
          onConfirm={async (reason) => { await rpc('anonymise_student', { p_student: s.id, p_reason: reason }); data.reload() }} />
      )}
      {modal?.kind === 'enrol' && <EnrolModal studentId={s.id} onClose={() => setModal(null)} onDone={data.reload} />}
      {modal?.kind === 'transfer' && <TransferModal enrolment={modal.enrolment} onClose={() => setModal(null)} onDone={data.reload} />}
      {modal?.kind === 'fees' && <FeeModal enrolment={modal.enrolment} onClose={() => setModal(null)} onDone={data.reload} />}
      {modal?.kind === 'place' && <PlaceModal studentId={s.id} onClose={() => setModal(null)} onDone={data.reload} />}
      {['active', 'suspended', 'completed', 'withdrawn'].includes(modal?.kind) && (
        <ConfirmModal title={`${label(modal.kind === 'active' ? 'activate' : modal.kind)} enrolment`}
          message={modal.kind === 'active' ? 'The class capacity is checked before the student is given a place.' : `Class: ${modal.enrolment.classes?.name}`}
          reason={modal.kind === 'active' ? undefined : 'Reason'} onClose={() => setModal(null)}
          onConfirm={async (reason) => { await rpc('change_enrolment_status', { p_enrolment: modal.enrolment.id, p_status: modal.kind, p_reason: reason || null }); data.reload() }} />
      )}
    </div>
  )
}

function useOpenClasses() {
  return useLoad(() => q<any[]>(supabase.from('classes').select('id, name, capacity, status, enrolments(status)').in('status', ['active', 'draft']).order('name')), [])
}

function EnrolModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const classes = useOpenClasses()
  const [f, setF] = useState({ class_id: '', start: todayMY(), notes: '', waitlist: true })
  const act = useAction()
  return (
    <Modal title="Enrol in a class" onClose={onClose}>
      <div className="space-y-3">
        <Label t="Class"><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="Choose a class"
          options={(classes.data ?? []).map((c) => { const n = c.enrolments.filter((e: any) => e.status === 'active').length; return [c.id, `${c.name} (${n}/${c.capacity})`] })} /></Label>
        <Label t="Start date"><input type="date" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Label>
        <Label t="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.waitlist} onChange={(e) => setF({ ...f, waitlist: e.target.checked })} />Add to the waiting list if the class is full</label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.class_id} onClick={() => act.run(async () => {
            await rpc('enrol_student', { p_student: studentId, p_class: f.class_id, p_start: f.start, p_waitlist_if_full: f.waitlist, p_notes: f.notes || null })
            onDone(); onClose()
          })}>Enrol</Button></div>
      </div>
    </Modal>
  )
}

function TransferModal({ enrolment, onClose, onDone }: { enrolment: any; onClose: () => void; onDone: () => void }) {
  const classes = useOpenClasses()
  const [f, setF] = useState({ class_id: '', reason: '', date: todayMY() })
  const act = useAction()
  return (
    <Modal title={`Transfer from ${enrolment.classes?.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Label t="New class"><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="Choose a class"
          options={(classes.data ?? []).filter((c) => c.id !== enrolment.class_id).map((c) => [c.id, `${c.name} (${c.enrolments.filter((e: any) => e.status === 'active').length}/${c.capacity})`])} /></Label>
        <Label t="Transfer date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Label>
        <Label t="Reason *"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Ready for the next level" /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.class_id || !f.reason.trim()} onClick={() => act.run(async () => {
            await rpc('transfer_enrolment', { p_enrolment: enrolment.id, p_new_class: f.class_id, p_reason: f.reason, p_date: f.date })
            onDone(); onClose()
          })}>Transfer</Button></div>
      </div>
    </Modal>
  )
}

function FeeModal({ enrolment, onClose, onDone }: { enrolment: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fee: enrolment.fee_override ?? '', discount: enrolment.discount_percent ?? 0, notes: enrolment.notes ?? '' })
  const act = useAction()
  return (
    <Modal title="Student-specific fee" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Leave the fee empty to use the class fee. Changes apply to future invoices only.</p>
        <Label t="Custom fee"><input type="number" step="0.01" min="0" className={inputCls} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Label>
        <Label t="Discount (%)"><input type="number" step="0.5" min="0" max="100" className={inputCls} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value as any })} /></Label>
        <Label t="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => {
            await q(supabase.from('enrolments').update({ fee_override: f.fee === '' ? null : Number(f.fee), discount_percent: Number(f.discount) || 0, notes: f.notes || null }).eq('id', enrolment.id))
            onDone(); onClose()
          })}>Save</Button></div>
      </div>
    </Modal>
  )
}

function PlaceModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const levels = useLoad(() => q<any[]>(supabase.from('levels').select('id, name, rank, course_id, courses(name)').order('rank')), [])
  const [f, setF] = useState({ level_id: '', reason: '', source: 'admin' })
  const act = useAction()
  const level = levels.data?.find((l) => l.id === f.level_id)
  return (
    <Modal title="Record a placement" onClose={onClose}>
      <div className="space-y-3">
        <Label t="Level"><Select value={f.level_id} onChange={(v) => setF({ ...f, level_id: v })} placeholder="Choose a level"
          options={(levels.data ?? []).map((l) => [l.id, `${l.courses?.name} · ${l.name}`])} /></Label>
        <Label t="Type"><Select value={f.source} onChange={(v) => setF({ ...f, source: v })} options={[['admin', 'Administrator decision'], ['reassessment', 'Reassessment'], ['transfer', 'Class transfer']]} /></Label>
        <Label t="Reason *"><textarea rows={2} className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Teacher assessed speaking in week 2" /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!level || !f.reason.trim()} onClick={() => act.run(async () => {
            await rpc('place_student', { p_student: studentId, p_course: level.course_id, p_level: level.id, p_class: null, p_reason: f.reason, p_source: f.source })
            onDone(); onClose()
          })}>Save</Button></div>
      </div>
    </Modal>
  )
}

const AWARD_CATEGORIES: AwardCategory[] = [
  'Most Improved Speaker',
  'Perfect Attendance',
  'Vocabulary Champion',
  'Confidence Booster',
]

function NominateStudentModal({ students, onClose }: { students: any[]; onClose: () => void }) {
  const first = students[0]
  const [f, setF] = useState({
    student_id: first?.id ?? '',
    student_name: first?.full_name ?? '',
    language_level: first?.enrolments?.[0]?.classes?.name ?? 'English for Beginners · Level 2',
    category: 'Most Improved Speaker' as AwardCategory,
    quote: '',
    teacher_name: 'Ms. Priya Shanmugam',
    month_label: 'November 2026',
    featured_on_website: true,
  })
  const [err, setErr] = useState('')

  const handleSelectStudent = (sid: string) => {
    const match = students.find((s) => s.id === sid)
    setF((prev) => ({
      ...prev,
      student_id: sid,
      student_name: match?.full_name ?? prev.student_name,
      language_level: match?.enrolments?.find((e: any) => e.status === 'active')?.classes?.name ?? prev.language_level,
    }))
  }

  const save = () => {
    if (!f.student_name.trim()) return setErr('Select or enter a student name.')
    if (!f.quote.trim()) return setErr('Enter a short teacher recommendation quote.')
    nominateStudentSpotlight({
      student_id: f.student_id || null,
      student_name: f.student_name,
      language_level: f.language_level || 'English for Beginners',
      category: f.category,
      quote: f.quote,
      teacher_name: f.teacher_name,
      month_label: f.month_label,
      featured_on_website: f.featured_on_website,
    })
    onClose()
  }

  return (
    <Modal title="Nominate Student of the Month" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label t="Select Student *">
            <Select
              value={f.student_id}
              onChange={handleSelectStudent}
              placeholder="Choose a student"
              options={students.map((s) => [s.id, `${s.full_name} (${s.student_code})`])}
            />
          </Label>
          <Label t="Award Category Badge *">
            <Select
              value={f.category}
              onChange={(v) => setF({ ...f, category: v as AwardCategory })}
              options={AWARD_CATEGORIES}
            />
          </Label>
          <Label t="Enrolled Language & Level">
            <input
              className={inputCls}
              placeholder="e.g., English for Beginners · Level 2"
              value={f.language_level}
              onChange={(e) => setF({ ...f, language_level: e.target.value })}
            />
          </Label>
          <Label t="Month & Year">
            <input
              className={inputCls}
              placeholder="November 2026"
              value={f.month_label}
              onChange={(e) => setF({ ...f, month_label: e.target.value })}
            />
          </Label>
          <Label t="Recommending Teacher" className="sm:col-span-2">
            <input
              className={inputCls}
              value={f.teacher_name}
              onChange={(e) => setF({ ...f, teacher_name: e.target.value })}
            />
          </Label>
          <Label t="Teacher Recommendation Quote *" className="sm:col-span-2">
            <textarea
              rows={3}
              className={inputCls}
              placeholder="e.g., Aisha went from hesitant to leading group discussions in 3 months!"
              value={f.quote}
              onChange={(e) => setF({ ...f, quote: e.target.value })}
            />
          </Label>
        </div>

        <label className="flex items-center gap-2.5 rounded-xl bg-brand-cream/50 p-3 text-sm font-medium text-brand-navy">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-pink"
            checked={f.featured_on_website}
            onChange={(e) => setF({ ...f, featured_on_website: e.target.checked })}
          />
          Feature this student on the public website (Homepage &amp; About Hall of Fame)
        </label>

        <Alert msg={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}><Trophy size={15} />Publish nomination</Button>
        </div>
      </div>
    </Modal>
  )
}
