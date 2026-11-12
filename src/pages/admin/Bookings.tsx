import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { addDays, fmtDateTime, money, todayMY } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, Label, Loaded, Modal, PageHeader, Select, Table, Td, inputCls } from '../../components/ui'

export default function Bookings() {
  const sym = useCurrency()
  const [status, setStatus] = useState('upcoming')
  const [teacher, setTeacher] = useState('')
  const [modal, setModal] = useState<any>(null)
  const act = useAction()
  const teachers = useLoad(() => q<any[]>(supabase.from('profiles').select('id, full_name').eq('role', 'teacher').eq('status', 'active').order('full_name')), [])
  const list = useLoad(() => q<any[]>(supabase.from('bookings')
    .select('id, starts_at, ends_at, duration_minutes, status, mode, objective, price, cancel_reason, decision_reason, teacher_id, students(id, full_name, student_code), profiles!bookings_teacher_id_fkey(full_name), languages(name)')
    .not('starts_at', 'is', null).order('starts_at', { ascending: false }).limit(300)), [])
  const now = new Date().toISOString()
  const shown = useMemo(() => (list.data ?? []).filter((b) => (!teacher || b.teacher_id === teacher)
    && (status === 'upcoming' ? ['requested', 'approved'].includes(b.status) && b.ends_at > now
      : status === 'past' ? ['approved'].includes(b.status) && b.ends_at <= now : !status || b.status === status)), [list.data, teacher, status, now])

  return (
    <div>
      <PageHeader title="One-to-one bookings" subtitle="Requests, confirmations, changes and completed lessons.">
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All"
          options={[['upcoming', 'Upcoming'], ['past', 'Past, not completed'], 'requested', 'approved', 'completed', 'no_show', 'cancelled', 'rejected']} />
        <Select className="!w-auto" value={teacher} onChange={setTeacher} placeholder="All teachers" options={(teachers.data ?? []).map((t) => [t.id, t.full_name])} />
      </PageHeader>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No bookings here.">
        {(rows) => (
          <Table head={['When', 'Student', 'Teacher', 'Language', 'Price', 'Status', '']}>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(b.starts_at, { tz: false })}<div className="text-xs text-slate-400">{b.duration_minutes} min · {b.mode}</div></Td>
                <Td><Link to={`/admin/students/${b.students?.id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{b.students?.full_name}</Link>
                  {b.objective && <div className="max-w-xs text-xs text-slate-500">{b.objective}</div>}</Td>
                <Td><Link to={`/admin/teachers/${b.teacher_id}`} className="hover:text-brand-pink">{b.profiles?.full_name}</Link></Td>
                <Td>{b.languages?.name ?? '—'}</Td><Td>{money(b.price, sym)}</Td>
                <Td><Badge v={b.status} />{(b.cancel_reason || b.decision_reason) && <div className="text-xs text-slate-400">{b.cancel_reason ?? b.decision_reason}</div>}</Td>
                <Td className="whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1">
                    {b.status === 'requested' && <>
                      <Button size="sm" variant="success" onClick={() => act.run(async () => { await rpc('decide_booking', { p_booking: b.id, p_approve: true }); list.reload() }, 'Booking confirmed.')}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'reject', b })}>Decline</Button></>}
                    {['requested', 'approved'].includes(b.status) && b.ends_at > now && <>
                      <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'move', b })}>Move</Button>
                      <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'reassign', b })}>Reassign</Button>
                      <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'cancel', b })}>Cancel</Button></>}
                    {b.status === 'approved' && b.starts_at <= now && <Button size="sm" onClick={() => setModal({ kind: 'complete', b })}>Complete</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {modal?.kind === 'reject' && <ConfirmModal title="Decline request" reason="Reason (sent to the student)" danger confirmText="Decline" message={`${modal.b.students?.full_name}, ${fmtDateTime(modal.b.starts_at)}`}
        onClose={() => setModal(null)} onConfirm={async (r) => { await rpc('decide_booking', { p_booking: modal.b.id, p_approve: false, p_reason: r }); list.reload() }} />}
      {modal?.kind === 'cancel' && <ConfirmModal title="Cancel booking" reason="Reason (sent to the student)" danger confirmText="Cancel booking" message="The time becomes available again."
        onClose={() => setModal(null)} onConfirm={async (r) => { await rpc('cancel_booking', { p_booking: modal.b.id, p_reason: r }); list.reload() }} />}
      {modal?.kind === 'move' && <MoveModal b={modal.b} teachers={teachers.data ?? []} onClose={() => setModal(null)} onDone={list.reload} />}
      {modal?.kind === 'reassign' && <ReassignModal b={modal.b} teachers={teachers.data ?? []} onClose={() => setModal(null)} onDone={list.reload} />}
      {modal?.kind === 'complete' && <CompleteModal b={modal.b} onClose={() => setModal(null)} onDone={list.reload} />}
    </div>
  )
}

export function MoveModal({ b, teachers, onClose, onDone, admin = true }: { b: any; teachers?: any[]; onClose: () => void; onDone: () => void; admin?: boolean }) {
  const [teacher, setTeacher] = useState(b.teacher_id)
  const [day, setDay] = useState(addDays(todayMY(), 1))
  const [slot, setSlot] = useState('')
  const slots = useLoad(() => rpc<any[]>('available_booking_slots', { p_teacher: teacher, p_from: day, p_to: addDays(day, 6), p_duration: b.duration_minutes, p_language: null, p_exclude_booking: b.id }), [teacher, day])
  const act = useAction()
  return (
    <Modal title="Move booking" onClose={onClose}>
      <div className="space-y-3">
        {admin && teachers && <Label t="Teacher"><Select value={teacher} onChange={setTeacher} options={teachers.map((t) => [t.id, t.full_name])} /></Label>}
        <Label t="Week starting"><input type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} /></Label>
        <Label t="New time"><Select value={slot} onChange={setSlot} placeholder={slots.loading ? 'Loading…' : slots.data?.length ? 'Choose a time' : 'No open times this week'}
          options={(slots.data ?? []).map((s) => [s.starts_at, fmtDateTime(s.starts_at)])} /></Label>
        <Alert msg={act.error || slots.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!slot} onClick={() => act.run(async () => {
            await rpc('reschedule_booking', { p_booking: b.id, p_starts_at: slot, p_teacher: admin ? teacher : null }); onDone(); onClose()
          })}>Move</Button></div>
      </div>
    </Modal>
  )
}

function ReassignModal({ b, teachers, onClose, onDone }: { b: any; teachers: any[]; onClose: () => void; onDone: () => void }) {
  const [teacher, setTeacher] = useState('')
  const [reason, setReason] = useState('')
  const act = useAction()
  return (
    <Modal title="Give this booking to another teacher" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{fmtDateTime(b.starts_at)}. The new teacher must be free at this time.</p>
        <Label t="Teacher"><Select value={teacher} onChange={setTeacher} placeholder="Choose" options={teachers.filter((t) => t.id !== b.teacher_id).map((t) => [t.id, t.full_name])} /></Label>
        <Label t="Note"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!teacher} onClick={() => act.run(async () => { await rpc('reassign_booking', { p_booking: b.id, p_teacher: teacher, p_reason: reason || null }); onDone(); onClose() })}>Reassign</Button></div>
      </div>
    </Modal>
  )
}

export function CompleteModal({ b, onClose, onDone }: { b: any; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('present')
  const [notes, setNotes] = useState('')
  const act = useAction()
  return (
    <Modal title="Complete one-to-one lesson" onClose={onClose}>
      <div className="space-y-3">
        <Label t="Attendance"><Select value={status} onChange={setStatus} options={['present', 'late', 'absent', 'excused']} /></Label>
        <Label t="Lesson notes"><textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you covered, homework, progress" /></Label>
        <p className="text-xs text-slate-500">Completed lessons count towards the teacher's pay and, if priced, are billed in the next monthly invoice run. Absent marks it as a no-show.</p>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => { await rpc('complete_booking', { p_booking: b.id, p_attendance: status, p_notes: notes || null }); onDone(); onClose() })}>Save</Button></div>
      </div>
    </Modal>
  )
}
