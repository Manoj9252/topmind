import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import { addDays, fmtDate, todayMY } from '../../lib/format'
import { LessonCalendar } from '../../components/Calendar'
import { AttendanceSheet } from '../../components/AttendanceSheet'
import { Alert, Badge, Button, Card, Label, Loaded, Modal, PageHeader, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

// Lesson actions for administrators: attendance, cancel, move, substitute.
export function LessonModal({ sessionId, onClose, onChanged }: { sessionId: string; onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<'attendance' | 'cancel' | 'move' | 'cover'>('attendance')
  const lesson = useLoad(() => q<any>(supabase.from('sessions').select('id, status, session_date, start_time, end_time, teacher_id, class_id').eq('id', sessionId).single()), [sessionId])
  const teachers = useLoad(() => q<any[]>(supabase.from('profiles').select('id, full_name').eq('role', 'teacher').eq('status', 'active').order('full_name')), [])
  const [f, setF] = useState({ reason: '', date: '', start: '', end: '', teacher: '' })
  const act = useAction()
  const done = () => { lesson.reload(); onChanged?.() }
  const scheduled = lesson.data?.status === 'scheduled'

  return (
    <Modal title="Lesson" onClose={onClose} wide>
      {scheduled && <Tabs value={tab} onChange={setTab} tabs={[['attendance', 'Attendance'], ['cancel', 'Cancel'], ['move', 'Reschedule'], ['cover', 'Substitute']]} />}
      {tab === 'attendance' || !scheduled ? <AttendanceSheet sessionId={sessionId} showHistory onSaved={onChanged} /> : (
        <div className="space-y-3">
          {tab === 'move' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Label t="New date"><input type="date" className={inputCls} value={f.date || lesson.data.session_date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Label>
              <Label t="Start"><input type="time" className={inputCls} value={f.start || lesson.data.start_time?.slice(0, 5)} onChange={(e) => setF({ ...f, start: e.target.value })} /></Label>
              <Label t="End"><input type="time" className={inputCls} value={f.end || lesson.data.end_time?.slice(0, 5)} onChange={(e) => setF({ ...f, end: e.target.value })} /></Label>
            </div>
          )}
          {tab === 'cover' && (
            <Label t="Substitute teacher"><Select value={f.teacher} onChange={(v) => setF({ ...f, teacher: v })} placeholder="Choose a teacher"
              options={(teachers.data ?? []).filter((t) => t.id !== lesson.data.teacher_id).map((t) => [t.id, t.full_name])} /></Label>
          )}
          <Label t={tab === 'cover' ? 'Note (optional)' : 'Reason (sent to students) *'}>
            <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </Label>
          <p className="text-xs text-slate-500">{tab === 'cancel' ? 'Enrolled students and the teacher are notified.' : tab === 'move' ? 'The teacher\'s other lessons are checked for clashes; students are notified.' : 'The substitute must be free at that time; they are notified.'}</p>
          <Alert msg={act.error} /><Alert ok msg={act.ok} />
          <div className="flex justify-end">
            <Button busy={act.busy} disabled={(tab !== 'cover' && !f.reason.trim()) || (tab === 'cover' && !f.teacher)} onClick={() => act.run(async () => {
              if (tab === 'cancel') await rpc('cancel_lesson', { p_session: sessionId, p_reason: f.reason })
              if (tab === 'move') await rpc('reschedule_lesson', { p_session: sessionId, p_date: f.date || lesson.data.session_date, p_start: f.start || lesson.data.start_time, p_end: f.end || lesson.data.end_time, p_reason: f.reason })
              if (tab === 'cover') await rpc('assign_substitute', { p_session: sessionId, p_teacher: f.teacher, p_reason: f.reason || null })
              done()
              if (tab !== 'cover') onClose()
            }, 'Done.')}>{tab === 'cancel' ? 'Cancel lesson' : tab === 'move' ? 'Move lesson' : 'Assign substitute'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Attendance() {
  const [tab, setTab] = useState<'calendar' | 'missing' | 'summary' | 'generate'>('calendar')
  const [teacher, setTeacher] = useState('')
  const [cls, setCls] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [range, setRange] = useState({ from: addDays(todayMY(), -30), to: todayMY() })
  const [gen, setGen] = useState({ from: todayMY(), to: addDays(todayMY(), 56) })
  const warn = useSettings().num('academic.attendance_warning_percent') || 75
  const act = useAction()
  const lookups = useLoad(async () => ({
    teachers: await q<any[]>(supabase.from('profiles').select('id, full_name').eq('role', 'teacher').order('full_name')),
    classes: await q<any[]>(supabase.from('classes').select('id, name').neq('status', 'archived').order('name')),
  }), [])
  const missing = useLoad(() => rpc<any[]>('lessons_missing_attendance', { p_teacher: null }), [tab])
  const summary = useLoad(() => tab === 'summary' ? rpc<any[]>('attendance_summary', { p_from: range.from, p_to: range.to, p_class: cls || null, p_student: null }) : Promise.resolve([]), [tab, range.from, range.to, cls])
  const below = useMemo(() => (summary.data ?? []).filter((r) => r.attendance_percent != null && r.attendance_percent < warn).length, [summary.data, warn])

  return (
    <div>
      <PageHeader title="Attendance and lessons" subtitle="Every lesson, who attended, and what still needs recording." />
      <Tabs value={tab} onChange={setTab} tabs={[['calendar', 'Calendar'], ['missing', `Missing attendance${missing.data?.length ? ` (${missing.data.length})` : ''}`], ['summary', 'Summary'], ['generate', 'Create lessons']]} />
      {tab === 'calendar' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select className="!w-auto" value={teacher} onChange={setTeacher} placeholder="All teachers" options={(lookups.data?.teachers ?? []).map((t) => [t.id, t.full_name])} />
            <Select className="!w-auto" value={cls} onChange={setCls} placeholder="All classes" options={(lookups.data?.classes ?? []).map((c) => [c.id, c.name])} />
          </div>
          <LessonCalendar teacherId={teacher || undefined} classId={cls || undefined} onSelect={(l) => setOpen(l.id)} />
        </>
      )}
      {tab === 'missing' && (
        <Loaded state={missing} empty="All past lessons have attendance. Well done!">
          {(rows) => (
            <Table head={['Date', 'Time', 'Class', 'Teacher', '']}>
              {rows.map((r) => (
                <tr key={r.session_id}><Td>{fmtDate(r.session_date)}</Td><Td>{r.start_time?.slice(0, 5)}</Td><Td>{r.class_name}</Td><Td>{r.teacher_name ?? '—'}</Td>
                  <Td className="text-right"><Button size="sm" onClick={() => setOpen(r.session_id)}>Record</Button></Td></tr>
              ))}
            </Table>
          )}
        </Loaded>
      )}
      {tab === 'summary' && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Label t="From"><input type="date" className={inputCls} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Label>
            <Label t="To"><input type="date" className={inputCls} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Label>
            <Label t="Class"><Select value={cls} onChange={setCls} placeholder="All classes" options={(lookups.data?.classes ?? []).map((c) => [c.id, c.name])} /></Label>
            <Button variant="ghost" disabled={!summary.data?.length} onClick={() => downloadCsv(summary.data!.map(({ student_id, class_id, ...r }) => r), 'attendance-summary')}><Download size={16} />CSV</Button>
          </div>
          {below > 0 && <div className="mb-3"><Alert tone="warn" msg={`${below} student(s) are below the ${warn}% attendance target.`} /></div>}
          <Loaded state={summary} empty="No lessons in this period.">
            {(rows) => (
              <Table head={['Student', 'Class', 'Lessons', 'Present', 'Late', 'Absent', 'Excused', 'Not marked', 'Attendance']}>
                {rows.map((r) => (
                  <tr key={`${r.student_id}-${r.class_id}`}>
                    <Td><b>{r.student_name}</b> <span className="text-xs text-slate-400">{r.student_code}</span></Td><Td>{r.class_name}</Td><Td>{r.scheduled}</Td>
                    <Td>{r.present}</Td><Td>{r.late}</Td><Td>{r.absent}</Td><Td>{r.excused}</Td><Td>{r.unmarked}</Td>
                    <Td>{r.attendance_percent == null ? '—' : <Badge v={r.attendance_percent < warn ? 'overdue' : 'active'} text={`${r.attendance_percent}%`} />}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Loaded>
        </>
      )}
      {tab === 'generate' && (
        <Card className="max-w-xl space-y-3">
          <p className="text-sm text-slate-600">Lessons are created automatically from each active class's weekly schedule. Use this to create them further ahead or to fill in past dates.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="From"><input type="date" className={inputCls} value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} /></Label>
            <Label t="To"><input type="date" className={inputCls} value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} /></Label>
          </div>
          <Alert msg={act.error} /><Alert ok msg={act.ok} />
          <Button busy={act.busy} onClick={() => act.run(async () => {
            const n = await rpc<number>('generate_lessons', { p_from: gen.from, p_to: gen.to, p_class: null })
            act.setOk(`${n} new lesson(s) created. Existing and cancelled lessons were left as they were.`)
          })}>Create lessons</Button>
        </Card>
      )}
      {open && <LessonModal sessionId={open} onClose={() => setOpen(null)} onChanged={() => missing.reload()} />}
    </div>
  )
}
