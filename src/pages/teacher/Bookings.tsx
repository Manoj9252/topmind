import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useCurrency } from '../../lib/settings'
import { DAYS, fmtDate, fmtDateTime, fmtTime, money } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, Label, Loaded, Loading, PageHeader, Section, Select, Table, Tabs, Td, inputCls } from '../../components/ui'
import { CompleteModal, MoveModal } from '../admin/Bookings'

type Tab = 'requests' | 'upcoming' | 'past' | 'availability'

// One-to-one lessons for the signed-in teacher: decide requests, complete
// lessons, and keep weekly availability and booking rules up to date.
export default function TeacherBookings() {
  const { session } = useAuth()
  const me = session!.user.id
  const sym = useCurrency()
  const [tab, setTab] = useState<Tab>('requests')
  const [modal, setModal] = useState<any>(null)
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('bookings')
    .select('id, starts_at, ends_at, duration_minutes, status, mode, objective, notes, price, cancel_reason, decision_reason, teacher_id, students(full_name, student_code), languages(name)')
    .eq('teacher_id', me).not('starts_at', 'is', null).order('starts_at').limit(300)), [])
  const now = new Date().toISOString()
  const rows = useMemo(() => (list.data ?? []).filter((b) =>
    tab === 'requests' ? b.status === 'requested' && b.starts_at > now
      : tab === 'upcoming' ? b.status === 'approved' && b.ends_at > now
        : b.ends_at <= now || !['requested', 'approved'].includes(b.status)), [list.data, tab, now])
  const requests = (list.data ?? []).filter((b) => b.status === 'requested' && b.starts_at > now).length

  return (
    <div>
      <PageHeader title="One-to-one bookings" subtitle="Student requests, confirmed lessons and the times you are open for bookings." />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[['requests', `Requests${requests ? ` (${requests})` : ''}`], ['upcoming', 'Upcoming'], ['past', 'Past'], ['availability', 'Availability and rules']]} /></div>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      {tab === 'availability' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Booking rules"><BookingSettingsForm teacherId={me} /></Section>
          <Section title="Weekly availability"><AvailabilityEditor teacherId={me} /></Section>
        </div>
      ) : (
        <Loaded state={{ ...list, data: list.data && (tab === 'past' ? [...rows].reverse() : rows) }} empty={tab === 'requests' ? 'No requests waiting for you.' : 'Nothing here.'}>
          {(shown) => (
            <Table head={['When', 'Student', 'Details', 'Status', '']}>
              {shown.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.starts_at, { tz: false })}<div className="text-xs text-slate-400">{b.duration_minutes} min · {b.mode}</div></Td>
                  <Td><b className="text-brand-navy">{b.students?.full_name}</b><div className="text-xs text-slate-400">{b.students?.student_code}</div></Td>
                  <Td className="max-w-sm text-sm">{b.languages?.name && <span className="font-medium">{b.languages.name}. </span>}{b.objective}
                    {b.notes && <div className="text-xs text-slate-500">{b.notes}</div>}
                    {Number(b.price) > 0 && <div className="text-xs text-slate-400">{money(b.price, sym)}</div>}</Td>
                  <Td><Badge v={b.status} />{(b.cancel_reason || b.decision_reason) && <div className="text-xs text-slate-400">{b.cancel_reason ?? b.decision_reason}</div>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {b.status === 'requested' && b.starts_at > now && <>
                        <Button size="sm" variant="success" busy={act.busy} onClick={() => act.run(async () => { await rpc('decide_booking', { p_booking: b.id, p_approve: true }); list.reload() }, 'Booking confirmed. The student has been told.')}>Accept</Button>
                        <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'reject', b })}>Decline</Button></>}
                      {['requested', 'approved'].includes(b.status) && b.starts_at > now && <>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'move', b })}>Move</Button>
                        <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'cancel', b })}>Cancel</Button></>}
                      {b.status === 'approved' && b.starts_at <= now && <Button size="sm" onClick={() => setModal({ kind: 'complete', b })}>Complete</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      )}
      {modal?.kind === 'reject' && <ConfirmModal title="Decline request" reason="Reason (sent to the student)" danger confirmText="Decline" message={`${modal.b.students?.full_name}, ${fmtDateTime(modal.b.starts_at)}`}
        onClose={() => setModal(null)} onConfirm={async (r) => { await rpc('decide_booking', { p_booking: modal.b.id, p_approve: false, p_reason: r }); list.reload() }} />}
      {modal?.kind === 'cancel' && <ConfirmModal title="Cancel booking" reason="Reason (sent to the student)" danger confirmText="Cancel booking" message="The student is told and the time opens up again."
        onClose={() => setModal(null)} onConfirm={async (r) => { await rpc('cancel_booking', { p_booking: modal.b.id, p_reason: r }); list.reload() }} />}
      {modal?.kind === 'move' && <MoveModal b={modal.b} admin={false} onClose={() => setModal(null)} onDone={list.reload} />}
      {modal?.kind === 'complete' && <CompleteModal b={modal.b} onClose={() => setModal(null)} onDone={list.reload} />}
    </div>
  )
}

const DURATIONS = [30, 45, 60, 90, 120]

// Used by teachers for themselves and by administrators on the teacher page.
export function BookingSettingsForm({ teacherId }: { teacherId: string }) {
  const sym = useCurrency()
  const blank = { accepts_bookings: false, min_notice_hours: 24, max_advance_days: 30, durations: [60], slot_interval_minutes: 30, buffer_minutes: 0, mode: 'online', requires_approval: true, price_per_hour: '' as string | number }
  const [f, setF] = useState(blank)
  const s = useLoad(() => q<any>(supabase.from('teacher_booking_settings').select('*').eq('teacher_id', teacherId).maybeSingle()), [teacherId])
  useEffect(() => { if (s.data) setF({ ...blank, ...s.data, price_per_hour: s.data.price_per_hour ?? '' }) }, [s.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = useAction()
  const set = (k: keyof typeof blank, v: unknown) => setF({ ...f, [k]: v })
  if (s.loading && !s.data && !s.error) return <Loading />
  const save = () => act.run(async () => {
    if (!f.durations.length) throw new Error('Choose at least one lesson length.')
    await q(supabase.from('teacher_booking_settings').upsert({
      teacher_id: teacherId, accepts_bookings: f.accepts_bookings, min_notice_hours: Number(f.min_notice_hours), max_advance_days: Number(f.max_advance_days),
      durations: [...f.durations].sort((a, b) => a - b), slot_interval_minutes: Number(f.slot_interval_minutes), buffer_minutes: Number(f.buffer_minutes),
      mode: f.mode, requires_approval: f.requires_approval, price_per_hour: f.price_per_hour === '' ? null : Number(f.price_per_hour), updated_at: new Date().toISOString(),
    }))
    s.reload()
  }, 'Booking rules saved.')
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-brand-navy"><input type="checkbox" checked={f.accepts_bookings} onChange={(e) => set('accepts_bookings', e.target.checked)} />Open for one-to-one bookings</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Minimum notice (hours)"><input type="number" min={0} max={720} className={inputCls} value={f.min_notice_hours} onChange={(e) => set('min_notice_hours', e.target.value)} /></Label>
        <Label t="Book up to (days ahead)"><input type="number" min={1} max={120} className={inputCls} value={f.max_advance_days} onChange={(e) => set('max_advance_days', e.target.value)} /></Label>
        <Label t="Start times every"><Select value={String(f.slot_interval_minutes)} onChange={(v) => set('slot_interval_minutes', Number(v))} options={[15, 20, 30, 45, 60].map((n) => [String(n), `${n} minutes`])} /></Label>
        <Label t="Break between lessons (minutes)"><input type="number" min={0} max={120} className={inputCls} value={f.buffer_minutes} onChange={(e) => set('buffer_minutes', e.target.value)} /></Label>
        <Label t="Lesson format"><Select value={f.mode} onChange={(v) => set('mode', v)} options={[['online', 'Online'], ['physical', 'In person'], ['either', 'Online or in person']]} /></Label>
        <Label t={`Price per hour (${sym})`} hint="Leave empty to use the academy default."><input type="number" min={0} step="0.01" className={inputCls} value={f.price_per_hour} onChange={(e) => set('price_per_hour', e.target.value)} /></Label>
      </div>
      <Label t="Lesson lengths students can book">
        <div className="flex flex-wrap gap-3 pt-1">{DURATIONS.map((d) => (
          <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.durations.includes(d)}
            onChange={(e) => set('durations', e.target.checked ? [...f.durations, d] : f.durations.filter((x) => x !== d))} />{d} min</label>
        ))}</div>
      </Label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requires_approval} onChange={(e) => set('requires_approval', e.target.checked)} />Requests need my approval (otherwise they are confirmed straight away)</label>
      <Alert msg={act.error || s.error} /><Alert ok msg={act.ok} />
      <div className="flex justify-end"><Button busy={act.busy} onClick={save}>Save rules</Button></div>
    </div>
  )
}

export function AvailabilityEditor({ teacherId }: { teacherId: string }) {
  const [row, setRow] = useState({ weekday: '1', start_time: '09:00', end_time: '12:00', effective_from: '', effective_to: '' })
  const [off, setOff] = useState({ starts: '', ends: '', reason: '' })
  const weekly = useLoad(() => q<any[]>(supabase.from('teacher_availability').select('*').eq('teacher_id', teacherId).order('weekday').order('start_time')), [teacherId])
  const timeOff = useLoad(() => q<any[]>(supabase.from('teacher_time_off').select('*').eq('teacher_id', teacherId).gte('ends_at', new Date().toISOString()).order('starts_at')), [teacherId])
  const act = useAction()
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Students can only book inside these hours. Your group classes, other bookings and time off are blocked out automatically.</p>
      <Loaded state={weekly} empty="No weekly hours yet.">
        {(rows) => (
          <ul className="divide-y text-sm">{rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span><b>{DAYS[a.weekday]}</b> {fmtTime(a.start_time)}–{fmtTime(a.end_time)}
                {(a.effective_from || a.effective_to) && <span className="text-xs text-slate-400"> · {a.effective_from ? `from ${fmtDate(a.effective_from)}` : ''} {a.effective_to ? `until ${fmtDate(a.effective_to)}` : ''}</span>}</span>
              <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => act.run(async () => { await q(supabase.from('teacher_availability').delete().eq('id', a.id)); weekly.reload() })}><Trash2 size={14} /></Button>
            </li>
          ))}</ul>
        )}
      </Loaded>
      <div className="grid gap-2 rounded-xl bg-brand-cream/50 p-3 sm:grid-cols-3">
        <Label t="Day"><Select value={row.weekday} onChange={(v) => setRow({ ...row, weekday: v })} options={DAYS.map((d, i) => [String(i), d])} /></Label>
        <Label t="From"><input type="time" className={inputCls} value={row.start_time} onChange={(e) => setRow({ ...row, start_time: e.target.value })} /></Label>
        <Label t="To"><input type="time" className={inputCls} value={row.end_time} onChange={(e) => setRow({ ...row, end_time: e.target.value })} /></Label>
        <Label t="Starting (optional)"><input type="date" className={inputCls} value={row.effective_from} onChange={(e) => setRow({ ...row, effective_from: e.target.value })} /></Label>
        <Label t="Until (optional)"><input type="date" className={inputCls} value={row.effective_to} onChange={(e) => setRow({ ...row, effective_to: e.target.value })} /></Label>
        <div className="flex items-end"><Button className="w-full" onClick={() => act.run(async () => {
          if (row.end_time <= row.start_time) throw new Error('The end time must be after the start time.')
          await q(supabase.from('teacher_availability').insert({ teacher_id: teacherId, weekday: Number(row.weekday), start_time: row.start_time, end_time: row.end_time,
            effective_from: row.effective_from || null, effective_to: row.effective_to || null }))
          weekly.reload()
        })}><Plus size={14} />Add hours</Button></div>
      </div>
      <div>
        <h3 className="mb-2 font-semibold text-brand-navy">Time off</h3>
        <Loaded state={timeOff} empty="No upcoming time off.">
          {(rows) => (
            <ul className="divide-y text-sm">{rows.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span>{fmtDateTime(o.starts_at, { tz: false })} – {fmtDateTime(o.ends_at, { tz: false })}{o.reason && <span className="text-xs text-slate-400"> · {o.reason}</span>}</span>
                <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => act.run(async () => { await q(supabase.from('teacher_time_off').delete().eq('id', o.id)); timeOff.reload() })}><Trash2 size={14} /></Button>
              </li>
            ))}</ul>
          )}
        </Loaded>
        <div className="mt-2 grid gap-2 rounded-xl bg-brand-cream/50 p-3 sm:grid-cols-3">
          <Label t="From"><input type="datetime-local" className={inputCls} value={off.starts} onChange={(e) => setOff({ ...off, starts: e.target.value })} /></Label>
          <Label t="Until"><input type="datetime-local" className={inputCls} value={off.ends} onChange={(e) => setOff({ ...off, ends: e.target.value })} /></Label>
          <Label t="Reason (optional)"><input className={inputCls} value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></Label>
        </div>
        <p className="mt-1 text-xs text-slate-400">Times are Malaysia time. Existing bookings are not cancelled automatically; move or cancel them from the Upcoming tab.</p>
        <div className="mt-2 flex justify-end"><Button variant="ghost" disabled={!off.starts || !off.ends} onClick={() => act.run(async () => {
          const starts = new Date(`${off.starts}:00+08:00`), ends = new Date(`${off.ends}:00+08:00`)
          if (!(ends > starts)) throw new Error('The end must be after the start.')
          await q(supabase.from('teacher_time_off').insert({ teacher_id: teacherId, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: off.reason || null }))
          setOff({ starts: '', ends: '', reason: '' }); timeOff.reload()
        })}><Plus size={14} />Add time off</Button></div>
      </div>
      <Alert msg={act.error} />
    </div>
  )
}
