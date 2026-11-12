import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ExternalLink, Mic, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import {
  CompetitionRegistration,
  CompetitionStatus,
  updateCompetitionRegistrationStatus,
  useCompetitionRegistrations,
} from '../../lib/mockData'
import { DAYS_SHORT, fmtDate, fmtDateTime, label, money, todayMY } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, Empty, KeyValue, Label, Loaded, Modal, PageHeader, SearchBox, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

const OPEN = ['pending', 'info_requested', 'waitlisted', 'approved']
const COMPETITION_STATUSES: CompetitionStatus[] = ['Registered', 'Shortlisted', 'Finalist', 'Winner']

export default function Registrations() {
  const [section, setSection] = useState<'classes' | 'competition'>('classes')
  const [status, setStatus] = useState('open')
  const [language, setLanguage] = useState('')
  const [course, setCourse] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<any>(null)
  const [compStatus, setCompStatus] = useState('')
  const [compCategory, setCompCategory] = useState('')
  const [compSearch, setCompSearch] = useState('')
  const [openComp, setOpenComp] = useState<CompetitionRegistration | null>(null)
  const competitions = useCompetitionRegistrations()

  const lookups = useLoad(async () => ({
    languages: await q<any[]>(supabase.from('languages').select('id, name').order('sort_order')),
    courses: await q<any[]>(supabase.from('courses').select('id, name, language_id').order('name')),
  }), [])
  const list = useLoad(() => q<any[]>(supabase.from('registrations')
    .select('*, languages(name), courses(name), classes!registrations_class_id_fkey(name), recommended:classes!registrations_recommended_class_id_fkey(name), assessment_attempts!registrations_assessment_attempt_id_fkey(status, percent, levels(name), manual_max, manual_points)')
    .order('created_at', { ascending: false })), [])

  const shown = useMemo(() => (list.data ?? []).filter((r) =>
    (status === 'open' ? OPEN.includes(r.status) : !status || r.status === status)
    && (!language || r.language_id === language) && (!course || r.course_id === course)
    && (!from || r.created_at.slice(0, 10) >= from) && (!to || r.created_at.slice(0, 10) <= to)
    && (!search || `${r.student_name} ${r.email} ${r.phone ?? ''} ${r.tracking_code}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, language, course, from, to, search])

  const shownCompetitions = useMemo(() => competitions.filter((c) =>
    (!compStatus || c.status === compStatus)
    && (!compCategory || c.category === compCategory)
    && (!compSearch || `${c.full_name} ${c.tracking_code} ${c.speech_topic} ${c.language} ${c.email} ${c.phone}`.toLowerCase().includes(compSearch.toLowerCase()))),
    [competitions, compStatus, compCategory, compSearch])

  return (
    <div>
      <PageHeader
        title="Registrations"
        subtitle={section === 'classes' ? 'Review class applications, place students and send portal invitations.' : 'Manage Public Speaking Cup 2026 entrants, audition links and finalist progression.'}
      >
        {section === 'classes' ? (
          <>
            <SearchBox value={search} onChange={setSearch} />
            <Button variant="ghost" disabled={!shown.length} onClick={() => downloadCsv(shown.map((r) => ({
              submitted: r.created_at.slice(0, 10), tracking: r.tracking_code, name: r.student_name, email: r.email, phone: r.phone, language: r.languages?.name,
              programme: r.courses?.name, format: r.format, mode: r.mode, source: r.source, status: r.status,
            })), 'registrations')}><Download size={16} />CSV</Button>
          </>
        ) : (
          <>
            <SearchBox value={compSearch} onChange={setCompSearch} placeholder="Name, SPK code or topic" />
            <Button variant="ghost" disabled={!shownCompetitions.length} onClick={() => downloadCsv(shownCompetitions.map((c) => ({
              submitted: c.created_at.slice(0, 10),
              tracking_code: c.tracking_code,
              full_name: c.full_name,
              age: c.age,
              category: c.category,
              language: c.language,
              speech_topic: c.speech_topic,
              audition_mode: c.audition_mode,
              video_url: c.video_url ?? '',
              phone: c.phone,
              email: c.email,
              status: c.status,
            })), 'speaking-competition-registrations')}><Download size={16} />CSV</Button>
          </>
        )}
      </PageHeader>

      <Tabs
        value={section}
        onChange={setSection}
        tabs={[
          ['classes', `Class Registrations (${(list.data ?? []).length})`],
          ['competition', <span key="comp" className="inline-flex items-center gap-1.5"><Mic size={14} className="text-brand-pink" />Speaking Competition ({competitions.length})</span>],
        ]}
      />

      {section === 'classes' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses"
              options={[['open', 'Needs action'], 'pending', 'info_requested', 'waitlisted', 'approved', 'converted', 'rejected']} />
            <Select className="!w-auto" value={language} onChange={(v) => { setLanguage(v); setCourse('') }} placeholder="All languages" options={(lookups.data?.languages ?? []).map((l) => [l.id, l.name])} />
            <Select className="!w-auto" value={course} onChange={setCourse} placeholder="All programmes"
              options={(lookups.data?.courses ?? []).filter((c) => !language || c.language_id === language).map((c) => [c.id, c.name])} />
            <input type="date" className={inputCls + ' !w-auto'} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input type="date" className={inputCls + ' !w-auto'} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          <Loaded state={{ ...list, data: list.data && shown }} empty="No registrations match.">
            {(rows) => (
              <Table head={['Submitted', 'Applicant', 'Wants', 'Placement quiz', 'Suggested class', 'Source', 'Status']}>
                {rows.map((r) => {
                  const a = r.assessment_attempts
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => setOpen(r)}>
                      <Td className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</Td>
                      <Td><b className="text-brand-navy">{r.student_name}</b><div className="text-xs text-slate-500">{r.email}</div></Td>
                      <Td className="text-xs">{[r.languages?.name, r.courses?.name].filter(Boolean).join(' · ') || '—'}<div className="text-slate-400">{label(r.format)} · {label(r.mode)}</div></Td>
                      <Td className="text-xs">{a?.status === 'submitted' || a?.status === 'reviewed' ? <><b>{a.percent ?? '—'}%</b> {a.levels?.name}</> : a ? <Badge v={a.status} /> : '—'}</Td>
                      <Td className="text-xs">{r.recommended?.name ?? r.classes?.name ?? '—'}</Td>
                      <Td><Badge v={r.source} tone="navy" /></Td>
                      <Td><Badge v={r.status} /></Td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </Loaded>
          {open && <Review reg={open} onClose={() => setOpen(null)} onDone={() => { list.reload(); setOpen(null) }} />}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select
              className="!w-auto"
              value={compStatus}
              onChange={setCompStatus}
              placeholder="All statuses"
              options={COMPETITION_STATUSES.map((s) => [s, s])}
            />
            <Select
              className="!w-auto"
              value={compCategory}
              onChange={setCompCategory}
              placeholder="All categories"
              options={[
                ['Junior Stars', 'Junior Stars (7–12)'],
                ['Youth Orators', 'Youth Orators (13–17)'],
                ['Adult Communicators', 'Adult Communicators (18+)'],
              ]}
            />
          </div>

          {!shownCompetitions.length ? (
            <Empty text="No Speaking Competition applicants match your filters." />
          ) : (
            <Table head={['Code / Date', 'Applicant', 'Category & Language', 'Speech Topic', 'Audition Video', 'Status']}>
              {shownCompetitions.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => setOpenComp(c)}>
                  <Td className="whitespace-nowrap text-xs">
                    <div className="font-mono font-bold text-brand-navy">{c.tracking_code}</div>
                    <div className="text-slate-400">{fmtDate(c.created_at)}</div>
                  </Td>
                  <Td>
                    <b className="text-brand-navy">{c.full_name}</b> <span className="text-xs text-slate-400">({c.age} yrs)</span>
                    <div className="text-xs text-slate-500">{c.phone} · {c.email}</div>
                  </Td>
                  <Td className="text-xs">
                    <div className="font-semibold text-brand-navy">{c.category}</div>
                    <Badge tone="navy" text={c.language} />
                  </Td>
                  <Td className="max-w-xs text-sm text-brand-navy">{c.speech_topic}</Td>
                  <Td className="text-xs">
                    {c.video_url ? (
                      <a
                        href={c.video_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-semibold text-brand-pink hover:underline"
                      >
                        Watch clip <ExternalLink size={12} />
                      </a>
                    ) : (
                      <Badge tone="slate" text={c.audition_mode} />
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Badge v={c.status} />
                      <select
                        aria-label={`Status for ${c.full_name}`}
                        className="rounded-lg border border-brand-cream-dark bg-white px-2 py-1 text-xs font-medium text-brand-navy outline-none focus:border-brand-pink"
                        value={c.status}
                        onChange={(e) => updateCompetitionRegistrationStatus(c.id, e.target.value as CompetitionStatus)}
                      >
                        {COMPETITION_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          {openComp && (
            <CompetitionModal
              entry={competitions.find((x) => x.id === openComp.id) ?? openComp}
              onClose={() => setOpenComp(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

function CompetitionModal({ entry, onClose }: { entry: CompetitionRegistration; onClose: () => void }) {
  const [status, setStatus] = useState<CompetitionStatus>(entry.status)
  const [notes, setNotes] = useState(entry.notes ?? '')

  const save = () => {
    updateCompetitionRegistrationStatus(entry.id, status, notes.trim() || null)
    onClose()
  }

  return (
    <Modal title={`${entry.full_name} · ${entry.tracking_code}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge v={entry.status} />
          <Badge tone="navy" text={entry.category} />
          <Badge tone="pink" text={entry.language} />
          <span className="text-xs text-slate-500">Submitted {fmtDateTime(entry.created_at, { tz: false })}</span>
        </div>

        <KeyValue rows={[
          ['Participant', `${entry.full_name} (${entry.age} years old)`],
          ['Contact', `${entry.phone} · ${entry.email}`],
          ['Speech Topic', entry.speech_topic],
          ['Audition Format', entry.audition_mode],
          [
            'Audition Video Link',
            entry.video_url ? (
              <a href={entry.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-pink hover:underline">
                {entry.video_url} <ExternalLink size={12} />
              </a>
            ) : 'In-Person Audition at Mont Kiara Studio A',
          ],
        ]} />

        <div className="grid gap-3 rounded-2xl border border-brand-cream-dark bg-brand-cream/40 p-4 sm:grid-cols-2">
          <Label t="Competition Stage Status">
            <Select
              value={status}
              onChange={(v) => setStatus(v as CompetitionStatus)}
              options={COMPETITION_STATUSES.map((s) => [s, s])}
            />
          </Label>
          <Label t="Judge / Coordinator Notes" className="sm:col-span-2">
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Audition feedback or stage scheduling notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}><Trophy size={15} />Save status</Button>
        </div>
      </div>
    </Modal>
  )
}

function Review({ reg, onClose, onDone }: { reg: any; onClose: () => void; onDone: () => void }) {
  const sym = useCurrency()
  const act = useAction()
  const [confirm, setConfirm] = useState<'reject' | 'info' | null>(null)
  const [f, setF] = useState({ class_id: reg.recommended_class_id ?? reg.class_id ?? '', level_id: reg.assessment_attempts?.levels ? '' : '', start: todayMY(), note: reg.admin_notes ?? '', invite: true })
  const recs = useLoad(async () => reg.course_id
    ? rpc<any[]>('recommend_classes', { p_course: reg.course_id, p_level: null, p_days: reg.preferred_days, p_times: reg.preferred_times, p_mode: reg.mode, p_limit: 6 })
    : q<any[]>(supabase.from('classes').select('id, name').eq('status', 'active').order('name')).then((rows) => rows.map((c) => ({ class_id: c.id, class_name: c.name }))), [reg.id])
  const levels = useLoad(() => reg.course_id ? q<any[]>(supabase.from('levels').select('id, name').eq('course_id', reg.course_id).order('rank')) : Promise.resolve([]), [reg.id])
  const isOpen = OPEN.includes(reg.status)
  const a = reg.assessment_attempts

  const approve = (withClass: boolean) => act.run(async () => {
    const r = await rpc<any>('approve_registration', {
      p_registration: reg.id, p_class: withClass ? f.class_id || null : null, p_level: f.level_id || null, p_start: f.start, p_note: f.note || null,
    })
    if (f.invite) {
      try { await callFunction('admin-users', { action: 'invite', email: reg.email, role: 'student', full_name: reg.student_name, student_id: r.student_id }) }
      catch (e: any) { if (!/already exists/i.test(e.message)) throw new Error(`Approved, but the invitation failed: ${e.message}`) }
    }
    onDone()
  })

  return (
    <Modal title={reg.student_name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge v={reg.status} /><span className="text-xs text-slate-500">Tracking {reg.tracking_code} · submitted {fmtDateTime(reg.created_at, { tz: false })} · via {label(reg.source)}</span></div>
        <KeyValue rows={[
          ['Email', reg.email], ['Phone', reg.phone], ['Contact by', label(reg.preferred_contact)], ['Date of birth', fmtDate(reg.date_of_birth)],
          ['Guardian', reg.guardian_name], ['Language / programme', [reg.languages?.name, reg.courses?.name].filter(Boolean).join(' · ')],
          ['Preferred class', reg.classes?.name], ['Format / mode', `${label(reg.format)} · ${label(reg.mode)}`], ['Self-assessed level', label(reg.level_self)],
          ['Days', (reg.preferred_days ?? []).map((d: number) => DAYS_SHORT[d]).join(', ') || '—'], ['Times', (reg.preferred_times ?? []).map(label).join(', ') || '—'],
          ['Time zone', reg.timezone], ['Objectives', reg.objectives], ['More information', reg.additional_info],
          ['Consent', [reg.consent_privacy && 'Privacy', reg.consent_whatsapp && 'WhatsApp', reg.consent_marketing && 'Marketing'].filter(Boolean).join(', ') || 'None recorded'],
          ['Decision', reg.decision_reason ?? reg.info_request],
        ]} />
        {a && (
          <div className="rounded-2xl bg-brand-cream/50 p-4 text-sm">
            <b className="text-brand-navy">Placement quiz</b>: {a.status === 'submitted' || a.status === 'reviewed'
              ? <>{a.percent ?? '—'}% · suggested level <b>{a.levels?.name ?? '—'}</b>{a.manual_max && a.manual_points == null ? ' · writing not yet marked' : ''}</>
              : `not completed (${label(a.status)})`}
            <span className="block text-xs text-slate-500">The quiz does not assess speaking. Mark writing and adjust the level under Placement tests.</span>
          </div>
        )}
        {isOpen && (
          <div className="rounded-2xl border border-brand-cream-dark p-4">
            <b className="text-brand-navy">Place and approve</b>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Label t="Class"><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="Choose a class"
                options={(recs.data ?? []).map((c: any) => [c.class_id, `${c.class_name}${c.schedule ? ` · ${c.schedule}` : ''}${c.spaces_left != null ? ` · ${c.spaces_left > 0 ? `${c.spaces_left} places` : 'full'}` : ''}${c.fee ? ` · ${money(c.fee, sym)}` : ''}`])} /></Label>
              <Label t="Level"><Select value={f.level_id} onChange={(v) => setF({ ...f, level_id: v })} placeholder="Use the class level" options={(levels.data ?? []).map((l) => [l.id, l.name])} /></Label>
              <Label t="Start date"><input type="date" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Label>
              <Label t="Note (placement reason)"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.invite} onChange={(e) => setF({ ...f, invite: e.target.checked })} />Send a student portal invitation by email</label>
            <p className="mt-1 text-xs text-slate-500">If the class is full the student goes on its waiting list. An existing student with this email is reused, never duplicated.</p>
            <Alert msg={act.error} />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm('info')}>Request information</Button>
              <Button variant="danger" onClick={() => setConfirm('reject')}>Reject</Button>
              <Button variant="ghost" busy={act.busy} disabled={!f.class_id}
                onClick={() => act.run(async () => { await rpc('waitlist_registration', { p_registration: reg.id, p_class: f.class_id, p_note: f.note || null }); onDone() })}>Waiting list</Button>
              <Button variant="ghost" busy={act.busy} onClick={() => approve(false)}>Approve, place later</Button>
              <Button busy={act.busy} disabled={!f.class_id} onClick={() => approve(true)}>Approve and place</Button>
            </div>
          </div>
        )}
        {reg.student_id && <Link to={`/admin/students/${reg.student_id}`} className="inline-block text-sm font-semibold text-brand-pink">Open student record</Link>}
      </div>
      {confirm === 'reject' && <ConfirmModal title="Reject registration" reason="Reason (sent to the applicant)" danger confirmText="Reject"
        message="The applicant is emailed a polite message with your reason." onClose={() => setConfirm(null)}
        onConfirm={async (reason) => { await rpc('reject_registration', { p_registration: reg.id, p_reason: reason }); onDone() }} />}
      {confirm === 'info' && <ConfirmModal title="Request more information" reason="What do you need to know?" confirmText="Send request"
        message="The applicant is emailed your question." onClose={() => setConfirm(null)}
        onConfirm={async (msg) => { await rpc('request_registration_info', { p_registration: reg.id, p_message: msg }); onDone() }} />}
    </Modal>
  )
}
