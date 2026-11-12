import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { q, rpc, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useSettings } from '../../lib/settings'
import { addDays, fmtClock, fmtDay, todayMY } from '../../lib/format'
import { cx } from '../../lib/util'
import { AttendanceSheet } from '../../components/AttendanceSheet'
import { Alert, Badge, Card, Empty, Loading, PageHeader } from '../../components/ui'

// Teachers mark attendance for their own lessons from the day of the lesson
// until the edit window closes (set by the administrator).
export default function TeacherAttendance() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('lesson'))
  const editDays = useSettings().num('academic.attendance_edit_days') || 7
  const lessons = useLoad(() => q<any[]>(supabase.from('sessions')
    .select('id, session_date, starts_at, ends_at, status, class_id, booking_id, classes(name)')
    .eq('teacher_id', session!.user.id).neq('status', 'cancelled')
    .gte('session_date', addDays(todayMY(), -editDays)).lte('session_date', todayMY())
    .order('starts_at', { ascending: false })), [])
  const missing = useLoad(() => rpc<any[]>('lessons_missing_attendance', { p_teacher: session!.user.id }), [])
  const older = (missing.data ?? []).filter((m) => m.session_date < addDays(todayMY(), -editDays))

  return (
    <div>
      <PageHeader title="Attendance" subtitle={`You can record and correct attendance for lessons up to ${editDays} days old.`} />
      {older.length > 0 && <div className="mb-4"><Alert tone="warn" msg={`${older.length} older lesson(s) have no attendance and are past the edit window. Please tell the administrator.`} /></div>}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2">
          {lessons.loading && !lessons.data ? <Loading /> : !lessons.data?.length ? <Empty text="No lessons in the last few days." /> : lessons.data.map((l) => (
            <button key={l.id} onClick={() => setSelected(l.id)}
              className={cx('flex w-full items-center justify-between gap-2 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition', selected === l.id ? 'ring-2 ring-brand-pink' : 'ring-brand-cream-dark/60 hover:ring-brand-pink/40')}>
              <div><b className="text-brand-navy">{l.classes?.name ?? 'One-to-one lesson'}</b><div className="text-xs text-slate-500">{fmtDay(l.session_date)} · {fmtClock(l.starts_at)}</div></div>
              {l.status === 'completed' ? <Badge v="completed" text="Done" /> : <Badge v="pending" text="To do" />}
            </button>
          ))}
        </div>
        <div className="lg:col-span-3">
          {selected ? <Card><AttendanceSheet key={selected} sessionId={selected} onSaved={() => { lessons.reload(); missing.reload() }} /></Card>
            : <Card><Empty text="Choose a lesson to take attendance." /></Card>}
        </div>
      </div>
    </div>
  )
}
