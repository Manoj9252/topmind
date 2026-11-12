import { useMemo, useState } from 'react'
import { rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency, useSettings } from '../../lib/settings'
import { addDays, fmtDateTime, fmtDay, fmtClock, label, money, todayMY } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Badge, Button, Card, ConfirmModal, Empty, Label, Loaded, Loading, PageHeader, Section, Select, Table, Td, inputCls } from '../../components/ui'
import { MoveModal } from '../admin/Bookings'

// Students choose a teacher, language and length, pick an open time and send a
// request. The database checks availability again and prevents double booking.
export default function StudentBook() {
  const sym = useCurrency()
  const windowHours = useSettings().num('booking.cancellation_window_hours') || 24
  const teachers = useLoad(() => rpc<any[]>('booking_teachers'), [])
  const mine = useLoad(() => rpc<any[]>('my_bookings'), [])
  const [language, setLanguage] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [duration, setDuration] = useState(60)
  const [week, setWeek] = useState(todayMY())
  const [slot, setSlot] = useState<any>(null)
  const [form, setForm] = useState({ objective: '', mode: 'online', notes: '' })
  const [modal, setModal] = useState<any>(null)
  const act = useAction()

  const languages = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teachers.data ?? []) for (const l of t.languages) m.set(l.id, l.name)
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [teachers.data])
  const choices = (teachers.data ?? []).filter((t) => !language || t.languages.some((l: any) => l.id === language))
  const teacher = choices.find((t) => t.id === teacherId)
  const durations: number[] = teacher?.durations ?? [60]
  const slots = useLoad(() => teacher ? rpc<any[]>('available_booking_slots', { p_teacher: teacher.id, p_from: week, p_to: addDays(week, 6), p_duration: duration, p_language: language || null })
    : Promise.resolve([]), [teacher?.id, week, duration, language])
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const s of slots.data ?? []) {
      const day = new Date(s.starts_at).toLocaleDateString('en-CA')
      m.set(day, [...(m.get(day) ?? []), s])
    }
    return Array.from(m.entries())
  }, [slots.data])
  const price = teacher ? Number(teacher.price_per_hour) * duration / 60 : 0

  const findAvailable = () => act.run(async () => {
    if (!choices.length) throw new Error('No teacher currently offers the selected language.')
    const ranked = await Promise.all(choices.map(async (t) => ({ teacher: t, slots: await rpc<any[]>('available_booking_slots', { p_teacher: t.id, p_from: week, p_to: addDays(week, 6), p_duration: t.durations.includes(duration) ? duration : t.durations[0], p_language: language || null }) })))
    const first = ranked.filter((x) => x.slots.length).sort((a, b) => new Date(a.slots[0].starts_at).getTime() - new Date(b.slots[0].starts_at).getTime())[0]
    if (!first) throw new Error('No available teacher this week. Choose another week.')
    pick(first.teacher.id)
    if (first.teacher.durations.includes(duration)) setSlot(first.slots[0])
    act.setOk(`Matched with ${first.teacher.name}. Review the lesson time and send your request.`)
  })
  const pick = (id: string) => { setTeacherId(id); setSlot(null); const t = choices.find((x) => x.id === id); if (t && !t.durations.includes(duration)) setDuration(t.durations[0]) }

  return (
    <div className="space-y-6">
      <PageHeader title="Book a one-to-one lesson" subtitle="Private lessons at a time that suits you, online or at the centre." />
      <div className="space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Section title="1. Choose a teacher">
        {teachers.loading && !teachers.data ? <Loading /> : teachers.error ? <Alert msg={teachers.error} /> : !teachers.data?.length ? <Empty text="No teachers are taking one-to-one bookings at the moment. Please check again later or contact us." /> : (
          <div className="space-y-3">
            <Label t="Language" className="max-w-xs"><Select value={language} onChange={(v) => { setLanguage(v); setTeacherId(''); setSlot(null) }} placeholder="Any language" options={languages} /></Label>
            <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" busy={act.busy} onClick={findAvailable}>Find my earliest available teacher</Button><span className="text-xs text-slate-500">Matches by language, duration and available slot.</span></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {choices.map((t) => (
                <button key={t.id} onClick={() => pick(t.id)} className={cx('rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition', teacherId === t.id ? 'ring-2 ring-brand-pink' : 'ring-brand-cream-dark/60 hover:ring-brand-pink/40')}>
                  <b className="text-brand-navy">{t.name}</b>
                  <div className="text-xs text-slate-500">{t.languages.map((l: any) => l.name).join(', ')} · {label(t.mode)}</div>
                  {t.bio && <p className="mt-1 line-clamp-3 text-sm text-slate-600">{t.bio}</p>}
                  <div className="mt-2 text-xs text-slate-500">{Number(t.price_per_hour) > 0 ? `${money(t.price_per_hour, sym)} per hour` : 'Price confirmed by the academy'}{t.requires_approval ? ' · teacher confirms each request' : ' · confirmed instantly'}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>
      {teacher && (
        <Section title="2. Pick a time">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Label t="Lesson length"><Select value={String(duration)} onChange={(v) => { setDuration(Number(v)); setSlot(null) }} options={durations.map((d) => [String(d), `${d} minutes`])} /></Label>
            <Label t="Week starting"><input type="date" min={todayMY()} className={inputCls} value={week} onChange={(e) => { setWeek(e.target.value || todayMY()); setSlot(null) }} /></Label>
            <Button variant="ghost" onClick={() => { setWeek(addDays(week, 7)); setSlot(null) }}>Next week</Button>
          </div>
          {slots.loading ? <Loading /> : slots.error ? <Alert msg={slots.error} /> : !byDay.length ? <Empty text="No open times this week. Try the next week." /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byDay.map(([day, list]) => (
                <Card key={day} className="!p-3">
                  <b className="text-sm text-brand-navy">{fmtDay(day)}</b>
                  <div className="mt-2 flex flex-wrap gap-1">{list.map((s) => (
                    <button key={s.starts_at} onClick={() => setSlot(s)} className={cx('rounded-lg px-2 py-1 text-xs font-semibold ring-1', slot?.starts_at === s.starts_at ? 'bg-brand-pink text-white ring-brand-pink' : 'ring-slate-200 hover:ring-brand-pink')}>{fmtClock(s.starts_at)}</button>
                  ))}</div>
                </Card>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">Times are shown in your device's time zone.</p>
        </Section>
      )}
      {teacher && slot && (
        <Section title="3. Send your request">
          <div className="space-y-3">
            <p className="text-sm"><b>{fmtDateTime(slot.starts_at)}</b> with <b>{teacher.name}</b>, {duration} minutes{price > 0 ? `, ${money(price, sym)}` : ''}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label t="What would you like to work on?"><input className={inputCls} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="For example: job interview practice" /></Label>
              {teacher.mode === 'either' && <Label t="Format"><Select value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} options={[['online', 'Online'], ['physical', 'At the centre']]} /></Label>}
            </div>
            <Label t="Anything else the teacher should know? (optional)"><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Label>
            {price > 0 && <p className="text-xs text-slate-500">Completed lessons are added to your next monthly invoice.</p>}
            <p className="text-xs text-slate-500">You can cancel or move a confirmed lesson up to {windowHours} hours before it starts.</p>
            <div className="flex justify-end"><Button busy={act.busy} onClick={() => act.run(async () => {
              if (form.objective.trim().length < 3) throw new Error('Please tell the teacher what you would like to work on.')
              const b = await rpc<any>('request_booking', { p_teacher: teacher.id, p_starts_at: slot.starts_at, p_duration: duration, p_language: language || null,
                p_objective: form.objective.trim(), p_mode: teacher.mode === 'either' ? form.mode : teacher.mode, p_notes: form.notes || null })
              setSlot(null); setForm({ objective: '', mode: 'online', notes: '' }); slots.reload(); mine.reload()
              return b
            }, teacher.requires_approval ? 'Request sent. We will let you know when the teacher confirms.' : 'Your lesson is booked.')}>{teacher.requires_approval ? 'Send request' : 'Book now'}</Button></div>
          </div>
        </Section>
      )}
      <Section title="My one-to-one lessons">
        <Loaded state={mine} empty="You have not booked any one-to-one lessons yet.">
          {(rows) => (
            <Table head={['When', 'Teacher', 'Details', 'Status', '']}>
              {rows.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.starts_at)}<div className="text-xs text-slate-400">{b.duration_minutes} min · {label(b.mode)}</div></Td>
                  <Td>{b.teacher}</Td>
                  <Td className="max-w-xs text-sm">{b.language && <span className="font-medium">{b.language}. </span>}{b.objective}{Number(b.price) > 0 && <div className="text-xs text-slate-400">{money(b.price, sym)}</div>}</Td>
                  <Td><Badge v={b.status} text={b.status === 'requested' ? 'Waiting for teacher' : undefined} />{b.reason && <div className="text-xs text-slate-400">{b.reason}</div>}</Td>
                  <Td className="whitespace-nowrap text-right">{b.can_change && <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'move', b })}>Move</Button>
                    <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'cancel', b })}>Cancel</Button></div>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      </Section>
      {modal?.kind === 'cancel' && <ConfirmModal title="Cancel this lesson?" danger confirmText="Cancel lesson" reason="Reason (optional)" reasonOptional message={`${fmtDateTime(modal.b.starts_at)} with ${modal.b.teacher}`}
        onClose={() => setModal(null)} onConfirm={async (r) => { await rpc('cancel_booking', { p_booking: modal.b.id, p_reason: r || null }); mine.reload(); slots.reload() }} />}
      {modal?.kind === 'move' && <MoveModal b={modal.b} admin={false} onClose={() => setModal(null)} onDone={() => { mine.reload(); slots.reload() }} />}
    </div>
  )
}
