import { useEffect, useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { q, rpc, useAction, useLoad } from '../lib/api'
import { fmtClock, fmtDate, fmtDateTime, label } from '../lib/format'
import { cx } from '../lib/util'
import { Alert, Badge, Button, Label, Loading, inputCls } from './ui'

const STATES = ['present', 'late', 'absent', 'excused'] as const
const COLOR: Record<string, string> = {
  present: 'bg-emerald-600 text-white', late: 'bg-amber-500 text-white', absent: 'bg-rose-600 text-white', excused: 'bg-sky-600 text-white',
}

// Register for one lesson. Saving goes through save_attendance, which checks
// the teacher, the class list, the date and the edit window in the database.
export function AttendanceSheet({ sessionId, onSaved, showHistory }: { sessionId: string; onSaved?: () => void; showHistory?: boolean }) {
  const data = useLoad(async () => {
    const [lesson, roster, existing] = await Promise.all([
      q<any>(supabase.from('sessions').select('id, session_date, starts_at, ends_at, status, topic, notes, cancel_reason, classes(name)').eq('id', sessionId).single()),
      rpc<any[]>('lesson_roster', { p_session: sessionId }),
      q<any[]>(supabase.from('attendance').select('student_id, status, remarks, recorded_at').eq('session_id', sessionId)),
    ])
    const history = showHistory
      ? await q<any[]>(supabase.from('attendance_history').select('*').eq('session_id', sessionId).order('changed_at', { ascending: false }))
      : []
    return { lesson, roster, existing, history }
  }, [sessionId])
  const [marks, setMarks] = useState<Record<string, { status: string; remarks: string }>>({})
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const act = useAction()

  useEffect(() => {
    if (!data.data) return
    setMarks(Object.fromEntries(data.data.existing.map((a) => [a.student_id, { status: a.status, remarks: a.remarks ?? '' }])))
    setTopic(data.data.lesson.topic ?? '')
    setNotes(data.data.lesson.notes ?? '')
  }, [data.data])

  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { lesson, roster, history } = data.data!
  const save = (complete: boolean) => act.run(async () => {
    const records = roster.filter((s) => marks[s.student_id]).map((s) => ({ student_id: s.student_id, ...marks[s.student_id] }))
    await rpc('save_attendance', { p_session: sessionId, p_records: records, p_complete: complete, p_topic: topic || null, p_notes: notes || null })
    data.reload()
    onSaved?.()
  }, complete ? 'Attendance saved and the lesson marked complete.' : 'Draft saved.')
  const allMarked = roster.length > 0 && roster.every((s) => marks[s.student_id] && marks[s.student_id].status !== 'pending')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b className="text-brand-navy">{lesson.classes?.name ?? 'One-to-one lesson'}</b>
          <p className="text-sm text-slate-500">{fmtDate(lesson.session_date)} · {fmtClock(lesson.starts_at)}–{fmtClock(lesson.ends_at)}</p>
        </div>
        <Badge v={lesson.status} />
      </div>
      {lesson.status === 'cancelled' ? <Alert tone="info" msg={`This lesson was cancelled: ${lesson.cancel_reason ?? ''}`} /> : (
        <>
          {!roster.length ? <Alert tone="info" msg="No students are enrolled in this lesson." /> : (
            <>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setMarks(Object.fromEntries(roster.map((s) => [s.student_id, { status: 'present', remarks: marks[s.student_id]?.remarks ?? '' }])))}>
                  <CheckCheck size={14} />Mark everyone present
                </Button>
              </div>
              <div className="space-y-2">
                {roster.map((s) => (
                  <div key={s.student_id} className="rounded-2xl border border-brand-cream-dark/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><b className="text-brand-navy">{s.full_name}</b> <span className="text-xs text-slate-400">{s.student_code}</span></div>
                      <div className="flex flex-wrap gap-1" role="group" aria-label={`Attendance for ${s.full_name}`}>
                        {STATES.map((st) => (
                          <button key={st} type="button" aria-pressed={marks[s.student_id]?.status === st}
                            onClick={() => setMarks({ ...marks, [s.student_id]: { status: st, remarks: marks[s.student_id]?.remarks ?? '' } })}
                            className={cx('rounded-lg px-3 py-2 text-xs font-semibold capitalize', marks[s.student_id]?.status === st ? COLOR[st] : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{st}</button>
                        ))}
                      </div>
                    </div>
                    <input className={cx(inputCls, 'mt-2 !py-1.5')} placeholder="Remarks (optional)" value={marks[s.student_id]?.remarks ?? ''}
                      onChange={(e) => setMarks({ ...marks, [s.student_id]: { status: marks[s.student_id]?.status ?? 'pending', remarks: e.target.value } })} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Lesson topic"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Ordering food" /></Label>
            <Label t="Lesson notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Homework, progress…" /></Label>
          </div>
          <Alert msg={act.error} /><Alert ok msg={act.ok} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" busy={act.busy} onClick={() => save(false)}>Save draft</Button>
            <Button busy={act.busy} disabled={!allMarked} onClick={() => save(true)} title={allMarked ? '' : 'Mark every student first'}>Save and complete lesson</Button>
          </div>
        </>
      )}
      {showHistory && history.length > 0 && (
        <div className="border-t pt-3">
          <b className="text-sm text-brand-navy">Change history</b>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {history.map((h) => (
              <li key={h.id}>{fmtDateTime(h.changed_at, { tz: false })}: {roster.find((r) => r.student_id === h.student_id)?.full_name ?? 'Student'} {label(h.old_status)} → {label(h.new_status)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
