import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Plus, Trash2, Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { feeText } from '../../lib/catalog'
import { addDays, DAYS, fmtDate, fmtTime, money, todayMY } from '../../lib/format'
import { LessonCalendar } from '../../components/Calendar'
import { LessonModal } from './Attendance'
import {
  Alert, Badge, Button, ConfirmModal, KeyValue, Label, Loaded, Loading, Modal, PageHeader, SearchBox, Section, Select, Table, Tabs, Td, inputCls,
} from '../../components/ui'

export function Classes() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const sym = useCurrency()
  const list = useLoad(() => q<any[]>(supabase.from('classes')
    .select('id, name, kind, mode, status, capacity, fee, billing_frequency, start_date, end_date, courses(name, languages(name)), levels(name), profiles(full_name), class_schedules(weekday, start_time, end_time), enrolments(status)')
    .order('name')), [])
  const shown = useMemo(() => (list.data ?? []).filter((c) => (!status || c.status === status)
    && (!search || `${c.name} ${c.courses?.name ?? ''} ${c.profiles?.full_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, search])

  return (
    <div>
      <PageHeader title="Classes" subtitle="Teacher and room clashes are blocked automatically.">
        <SearchBox value={search} onChange={setSearch} />
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses" options={['draft', 'active', 'inactive', 'completed', 'archived']} />
        <Button onClick={() => setCreating(true)}><Plus size={16} />New class</Button>
      </PageHeader>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No classes yet.">
        {(rows) => (
          <Table head={['Class', 'Programme', 'Teacher', 'Schedule', 'Students', 'Fee', 'Status']}>
            {rows.map((c) => {
              const active = c.enrolments.filter((e: any) => e.status === 'active').length
              const waiting = c.enrolments.filter((e: any) => e.status === 'waitlisted').length
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => navigate(`/admin/classes/${c.id}`)}>
                  <Td><b className="text-brand-navy">{c.name}</b><div className="flex gap-1 pt-1"><Badge v={c.kind} /><Badge v={c.mode} /></div></Td>
                  <Td className="text-xs">{c.courses?.languages?.name}<br />{c.courses?.name} {c.levels?.name && `· ${c.levels.name}`}</Td>
                  <Td className="text-xs">{c.profiles?.full_name ?? <span className="text-rose-600">No teacher</span>}</Td>
                  <Td className="text-xs">{c.class_schedules.map((s: any) => `${DAYS[s.weekday].slice(0, 3)} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`).join(', ') || '—'}</Td>
                  <Td>{active}/{c.capacity}{waiting > 0 && <div className="text-xs text-amber-600">{waiting} waiting</div>}</Td>
                  <Td className="text-xs">{feeText(c.fee, c.billing_frequency, sym)}</Td>
                  <Td><Badge v={c.status} /></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Loaded>
      {creating && <ClassForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/admin/classes/${id}`)} />}
    </div>
  )
}

type Slot = { weekday: number; start_time: string; end_time: string }

function ClassForm({ cls, onClose, onSaved }: { cls?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const lookups = useLoad(async () => ({
    courses: await q<any[]>(supabase.from('courses').select('id, name, languages(name)').order('name')),
    levels: await q<any[]>(supabase.from('levels').select('id, name, course_id, monthly_fee').order('rank')),
    teachers: await q<any[]>(supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').eq('status', 'active').order('full_name')),
    rooms: await q<any[]>(supabase.from('classrooms').select('id, name, capacity').eq('is_active', true).order('name')),
  }), [])
  const [f, setF] = useState({
    name: cls?.name ?? '', description: cls?.description ?? '', course_id: cls?.course_id ?? '', level_id: cls?.level_id ?? '', teacher_id: cls?.teacher_id ?? '',
    kind: cls?.kind ?? 'group', mode: cls?.mode ?? 'online', classroom_id: cls?.classroom_id ?? '', meeting_link: cls?.meeting_link ?? '', location_note: cls?.location_note ?? '',
    capacity: cls?.capacity ?? 10, fee: cls?.fee ?? 0, billing_frequency: cls?.billing_frequency ?? 'monthly', start_date: cls?.start_date ?? todayMY(), end_date: cls?.end_date ?? '',
    timezone: cls?.timezone ?? 'Asia/Kuala_Lumpur', lesson_minutes: cls?.lesson_minutes ?? '', status: cls?.status ?? 'active',
  })
  const [slots, setSlots] = useState<Slot[]>(cls ? [] : [{ weekday: 1, start_time: '19:00', end_time: '20:00' }])
  const act = useAction()
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  const save = () => act.run(async () => {
    if (!f.name.trim()) throw new Error('Give the class a name')
    const payload: Record<string, unknown> = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
    payload.capacity = Number(f.capacity)
    payload.fee = Number(f.fee)
    if (cls) {
      await q(supabase.from('classes').update(payload).eq('id', cls.id))
      onSaved(cls.id)
    } else {
      const row = await q<any>(supabase.from('classes').insert({ ...payload, status: 'draft' }).select('id').single())
      try {
        if (slots.length) await q(supabase.from('class_schedules').insert(slots.map((s) => ({ ...s, class_id: row.id }))))
        if (f.status !== 'draft') await q(supabase.from('classes').update({ status: f.status }).eq('id', row.id))
      } catch (e) {
        await supabase.from('classes').delete().eq('id', row.id)
        throw e
      }
      onSaved(row.id)
    }
    onClose()
  })
  const levels = (lookups.data?.levels ?? []).filter((l) => !f.course_id || l.course_id === f.course_id)

  return (
    <Modal title={cls ? 'Edit class' : 'New class'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Class name *" className="sm:col-span-2"><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. English Beginners – Mon & Wed evening" /></Label>
        <Label t="Programme"><Select value={f.course_id} onChange={(v) => set({ course_id: v, level_id: '' })} placeholder="Choose" options={(lookups.data?.courses ?? []).map((c) => [c.id, `${c.languages?.name ?? ''} · ${c.name}`])} /></Label>
        <Label t="Level"><Select value={f.level_id} onChange={(v) => {
          const lv = levels.find((l) => l.id === v)
          set({ level_id: v, fee: !cls && lv && !Number(f.fee) ? lv.monthly_fee : f.fee })
        }} placeholder="—" options={levels.map((l) => [l.id, l.name])} /></Label>
        <Label t="Teacher"><Select value={f.teacher_id} onChange={(v) => set({ teacher_id: v })} placeholder="Not assigned" options={(lookups.data?.teachers ?? []).map((t) => [t.id, t.full_name ?? t.email])} /></Label>
        <Label t="Class type"><Select value={f.kind} onChange={(v) => set({ kind: v })} options={[['group', 'Group'], ['one_to_one', 'One-to-one'], ['special', 'Special programme'], ['trial', 'Trial class']]} /></Label>
        <Label t="Where"><Select value={f.mode} onChange={(v) => set({ mode: v })} options={[['online', 'Online'], ['physical', 'In person'], ['hybrid', 'Hybrid']]} /></Label>
        {f.mode !== 'online' && <Label t="Room"><Select value={f.classroom_id} onChange={(v) => set({ classroom_id: v })} placeholder="—" options={(lookups.data?.rooms ?? []).map((r) => [r.id, `${r.name} (${r.capacity})`])} /></Label>}
        {f.mode !== 'physical' && <Label t="Meeting link" hint="Only enrolled students and the teacher see it."><input className={inputCls} value={f.meeting_link} onChange={(e) => set({ meeting_link: e.target.value })} placeholder="https://" /></Label>}
        {f.mode !== 'online' && <Label t="Location details"><input className={inputCls} value={f.location_note} onChange={(e) => set({ location_note: e.target.value })} /></Label>}
        <Label t="Capacity *"><input type="number" min={1} className={inputCls} value={f.capacity} onChange={(e) => set({ capacity: e.target.value as any })} /></Label>
        <Label t="Fee (RM)"><input type="number" min={0} step="0.01" className={inputCls} value={f.fee} onChange={(e) => set({ fee: e.target.value as any })} /></Label>
        <Label t="Billing"><Select value={f.billing_frequency} onChange={(v) => set({ billing_frequency: v })}
          options={[['monthly', 'Monthly tuition'], ['per_lesson', 'Per lesson attended'], ['package', 'Package (invoice manually)'], ['one_off', 'One-off (invoice manually)'], ['free', 'Free']]} /></Label>
        <Label t="Status"><Select value={f.status} onChange={(v) => set({ status: v })} options={['draft', 'active', 'inactive', 'completed', 'archived']} /></Label>
        <Label t="Start date"><input type="date" className={inputCls} value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Label>
        <Label t="End date"><input type="date" className={inputCls} value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} /></Label>
        <Label t="Time zone"><input className={inputCls} value={f.timezone} onChange={(e) => set({ timezone: e.target.value })} /></Label>
        <Label t="Description" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Label>
      </div>
      {!cls && (
        <div className="mt-4">
          <b className="text-sm text-brand-navy">Weekly schedule</b>
          <SlotEditor slots={slots} onChange={setSlots} />
        </div>
      )}
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={act.busy} onClick={save}>Save</Button></div></div>
    </Modal>
  )
}

function SlotEditor({ slots, onChange }: { slots: Slot[]; onChange: (s: Slot[]) => void }) {
  return (
    <div className="mt-2 space-y-2">
      {slots.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select className="!w-36" value={String(s.weekday)} onChange={(v) => onChange(slots.map((x, j) => (j === i ? { ...x, weekday: Number(v) } : x)))} options={DAYS.map((d, n) => [String(n), d])} />
          <input type="time" className={inputCls + ' !w-32'} value={s.start_time} onChange={(e) => onChange(slots.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} aria-label="Start" />
          <span className="text-slate-400">to</span>
          <input type="time" className={inputCls + ' !w-32'} value={s.end_time} onChange={(e) => onChange(slots.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} aria-label="End" />
          <Button size="sm" variant="danger" onClick={() => onChange(slots.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...slots, { weekday: 3, start_time: slots[slots.length - 1]?.start_time ?? '19:00', end_time: slots[slots.length - 1]?.end_time ?? '20:00' }])}><Plus size={14} />Add a day</Button>
    </div>
  )
}

export function ClassDetail() {
  const { id } = useParams()
  const sym = useCurrency()
  const [tab, setTab] = useState<'overview' | 'students' | 'lessons' | 'levels'>('overview')
  const [modal, setModal] = useState<any>(null)
  const act = useAction()
  const data = useLoad(async () => ({
    c: await q<any>(supabase.from('classes').select('*, courses(name, languages(name)), levels(name), profiles(full_name), classrooms(name)').eq('id', id).single()),
    schedules: await q<any[]>(supabase.from('class_schedules').select('*').eq('class_id', id).order('weekday')),
    enrolments: await q<any[]>(supabase.from('enrolments').select('*, students(id, full_name, student_code, email, phone)').eq('class_id', id).order('created_at', { ascending: false })),
  }), [id])
  const finance = useLoad(() => rpc<any[]>('run_report', { p_key: 'classes', p_filters: { class_id: id } }), [id])
  const levels = useLoad(() => rpc<any[]>('run_report', { p_key: 'proficiency', p_filters: { class_id: id } }), [id])

  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { c, schedules, enrolments } = data.data!
  const active = enrolments.filter((e) => e.status === 'active')
  const fin = finance.data?.[0]

  return (
    <div>
      <Link to="/admin/classes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-pink"><ArrowLeft size={14} />All classes</Link>
      <PageHeader title={c.name} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge v={c.status} /><Badge v={c.kind} /><Badge v={c.mode} />{c.courses?.languages?.name} · {c.courses?.name}</span>}>
        <Button variant="ghost" onClick={() => setModal({ kind: 'edit' })}>Edit</Button>
        {c.status === 'draft' && <Button onClick={() => act.run(async () => { await q(supabase.from('classes').update({ status: 'active' }).eq('id', c.id)); data.reload() }, 'Class is now active and its lessons were created.')}>Activate</Button>}
        {c.status === 'active' && <Button variant="ghost" onClick={() => act.run(async () => { await q(supabase.from('classes').update({ status: 'inactive' }).eq('id', c.id)); data.reload() })}>Deactivate</Button>}
        {c.status !== 'archived' && <Button variant="danger" onClick={() => setModal({ kind: 'archive' })}>Archive</Button>}
      </PageHeader>
      <div className="mb-4 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Overview'], ['students', `Students (${active.length}/${c.capacity})`], ['lessons', 'Lessons & attendance'], ['levels', 'Level mix']]} />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Details" className="lg:col-span-2">
            <KeyValue rows={[['Teacher', c.profiles?.full_name ?? 'Not assigned'], ['Level', c.levels?.name], ['Capacity', `${active.length} enrolled · ${Math.max(c.capacity - active.length, 0)} spaces`],
              ['Fee', feeText(c.fee, c.billing_frequency, sym)], ['Term', `${fmtDate(c.start_date)} – ${c.end_date ? fmtDate(c.end_date) : 'ongoing'}`], ['Time zone', c.timezone],
              ['Room', c.classrooms?.name], ['Location', c.location_note], ['Meeting link', c.meeting_link ? <a href={c.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-pink"><Video size={14} />Open</a> : '—'],
              ['Description', c.description]]} />
          </Section>
          <Section title="This class in numbers">
            {!fin ? <Loading /> : (
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>Attendance (all time)</span><b>{fin.attendance_percent != null ? `${fin.attendance_percent}%` : '—'}</b></li>
                <li className="flex justify-between"><span>Invoiced (all time)</span><b>{money(fin.invoiced, sym)}</b></li>
                <li className="flex justify-between"><span>Collected (all time)</span><b>{money(fin.collected, sym)}</b></li>
                <li className="flex justify-between"><span>Waiting list</span><b>{enrolments.filter((e) => e.status === 'waitlisted').length}</b></li>
              </ul>
            )}
          </Section>
          <Section title="Weekly schedule" className="lg:col-span-3" actions={<Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'slot' })}><Plus size={14} />Add a day</Button>}>
            {!schedules.length ? <p className="text-sm text-slate-500">No weekly times yet. Add one to create lessons automatically.</p> : (
              <div className="flex flex-wrap gap-2">
                {schedules.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-2 rounded-xl bg-brand-cream px-3 py-2 text-sm">
                    <b>{DAYS[s.weekday]}</b> {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                    <button onClick={() => setModal({ kind: 'delslot', s })} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={14} /></button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Changing the weekly times updates future lessons that have no attendance yet, and enrolled students are notified.</p>
          </Section>
        </div>
      )}

      {tab === 'students' && (
        <Section title="Enrolments" actions={<Link to="/admin/students" className="text-sm font-semibold text-brand-pink">Enrol from a student's page</Link>}>
          {!enrolments.length ? <p className="text-sm text-slate-500">No students yet.</p> : (
            <Table head={['Student', 'Contact', 'Status', 'From', 'To', '']}>
              {enrolments.map((e) => (
                <tr key={e.id}>
                  <Td><Link to={`/admin/students/${e.students?.id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{e.students?.full_name}</Link><div className="text-xs text-slate-400">{e.students?.student_code}</div></Td>
                  <Td className="text-xs">{e.students?.email}<br />{e.students?.phone}</Td>
                  <Td><Badge v={e.status} /></Td><Td>{fmtDate(e.start_date)}</Td><Td>{fmtDate(e.end_date)}</Td>
                  <Td>{e.status === 'waitlisted' && <Button size="sm" variant="success" onClick={() => act.run(async () => {
                    await rpc('change_enrolment_status', { p_enrolment: e.id, p_status: 'active' }); data.reload()
                  }, 'Place given.')}>Give a place</Button>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {tab === 'lessons' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setModal({ kind: 'extra' })}><CalendarPlus size={16} />Add a one-off lesson</Button>
            <Button variant="ghost" busy={act.busy} onClick={() => act.run(async () => {
              const n = await rpc<number>('generate_lessons', { p_from: todayMY(), p_to: addDays(todayMY(), 56), p_class: c.id }); data.reload()
              return n
            }, 'Upcoming lessons are up to date.')}>Create upcoming lessons</Button>
          </div>
          <LessonCalendar classId={c.id} onSelect={(l) => setModal({ kind: 'lesson', id: l.id })} />
        </div>
      )}

      {tab === 'levels' && (
        <Section title="Level mix of active students">
          <Loaded state={levels} empty="No placements recorded for these students yet.">
            {(rows) => <ul className="space-y-2 text-sm">{rows.map((r) => <li key={r.level} className="flex justify-between rounded-xl bg-brand-cream/50 px-3 py-2"><span>{r.level}</span><b>{r.students}</b></li>)}</ul>}
          </Loaded>
        </Section>
      )}

      {modal?.kind === 'edit' && <ClassForm cls={c} onClose={() => setModal(null)} onSaved={() => data.reload()} />}
      {modal?.kind === 'archive' && <ConfirmModal title="Archive this class?" danger confirmText="Archive"
        message="Future lessons are removed; past lessons, attendance and enrolments are kept. Archived classes take no new students."
        onClose={() => setModal(null)} onConfirm={async () => { await q(supabase.from('classes').update({ status: 'archived' }).eq('id', c.id)); data.reload() }} />}
      {modal?.kind === 'slot' && <SlotModal classId={c.id} onClose={() => setModal(null)} onDone={data.reload} />}
      {modal?.kind === 'delslot' && <ConfirmModal title="Remove this weekly time?" danger confirmText="Remove"
        message="Future lessons at this time without attendance are removed. Past lessons stay in the history."
        onClose={() => setModal(null)} onConfirm={async () => { await q(supabase.from('class_schedules').delete().eq('id', modal.s.id)); data.reload() }} />}
      {modal?.kind === 'extra' && <ExtraLessonModal classId={c.id} onClose={() => setModal(null)} onDone={data.reload} />}
      {modal?.kind === 'lesson' && <LessonModal sessionId={modal.id} onClose={() => setModal(null)} onChanged={data.reload} />}
    </div>
  )
}

function SlotModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: () => void }) {
  const [s, setS] = useState<Slot>({ weekday: 1, start_time: '19:00', end_time: '20:00' })
  const act = useAction()
  return (
    <Modal title="Add a weekly time" onClose={onClose}>
      <SlotEditor slots={[s]} onChange={(list) => list[0] && setS(list[0])} />
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => { await q(supabase.from('class_schedules').insert({ ...s, class_id: classId })); onDone(); onClose() })}>Add</Button></div></div>
    </Modal>
  )
}

function ExtraLessonModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ date: addDays(todayMY(), 1), start: '19:00', end: '20:00', topic: '' })
  const act = useAction()
  return (
    <Modal title="Add a one-off lesson" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label t="Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Label>
        <Label t="Start"><input type="time" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Label>
        <Label t="End"><input type="time" className={inputCls} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Label>
        <Label t="Topic" className="sm:col-span-3"><input className={inputCls} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></Label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Enrolled students are notified. The teacher's other lessons are checked for clashes.</p>
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => {
            await rpc('add_lesson', { p_class: classId, p_date: f.date, p_start: f.start, p_end: f.end, p_teacher: null, p_topic: f.topic || null }); onDone(); onClose()
          })}>Add lesson</Button></div></div>
    </Modal>
  )
}
