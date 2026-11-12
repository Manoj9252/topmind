import { useState } from 'react'
import { ChevronLeft, ChevronRight, Video } from 'lucide-react'
import { rpc, useLoad } from '../lib/api'
import { addDays, DAYS_SHORT, fmtClock, fmtDay, todayMY } from '../lib/format'
import { cx } from '../lib/util'
import { Alert, Badge, Button, Card, Loading } from './ui'

export type Lesson = {
  id: string; date: string; starts_at: string; ends_at: string; status: string; class: string; class_id: string | null; booking_id: string | null
  teacher: string | null; teacher_id: string | null; mode: string | null; meeting_link: string | null; topic: string | null
  cancel_reason: string | null; is_substitute: boolean; attendance_taken: boolean
}

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return addDays(iso, -((d.getDay() + 6) % 7))
}

// Week view of lessons (calendar on wide screens, list on phones).
export function LessonCalendar({ teacherId, classId, onSelect, showTeacher = true }: {
  teacherId?: string; classId?: string; onSelect?: (l: Lesson) => void; showTeacher?: boolean
}) {
  const [week, setWeek] = useState(mondayOf(todayMY()))
  const lessons = useLoad(() => rpc<Lesson[]>('lesson_calendar', {
    p_from: week, p_to: addDays(week, 6), p_teacher: teacherId ?? null, p_class: classId ?? null,
  }), [week, teacherId, classId])
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const today = todayMY()

  const item = (l: Lesson) => (
    <button key={l.id} onClick={() => onSelect?.(l)} disabled={!onSelect}
      className={cx('w-full rounded-xl border p-2 text-left text-xs transition',
        l.status === 'cancelled' ? 'border-rose-200 bg-rose-50/60 text-rose-700 line-through decoration-rose-300'
          : l.status === 'completed' ? 'border-emerald-200 bg-emerald-50/60' : 'border-brand-cream-dark bg-white hover:border-brand-pink',
        onSelect ? 'cursor-pointer' : 'cursor-default')}>
      <div className="font-semibold text-brand-navy">{fmtClock(l.starts_at)}–{fmtClock(l.ends_at)}</div>
      <div className="truncate">{l.class}</div>
      {showTeacher && l.teacher && <div className="truncate text-slate-500">{l.teacher}{l.is_substitute ? ' (substitute)' : ''}</div>}
      {l.meeting_link && l.status === 'scheduled' && (
        <a href={l.meeting_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-flex items-center gap-1 text-brand-pink hover:underline"><Video size={12} />Join</a>
      )}
    </button>
  )

  return (
    <Card className="!p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={16} /></Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(todayMY()))}>This week</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={16} /></Button>
        </div>
        <span className="text-sm font-semibold text-brand-navy">{fmtDay(week)} – {fmtDay(addDays(week, 6))}</span>
      </div>
      <Alert msg={lessons.error} />
      {lessons.loading && !lessons.data ? <Loading /> : (
        <>
          <div className="hidden grid-cols-7 gap-2 lg:grid">
            {days.map((d, i) => (
              <div key={d} className={cx('min-h-[8rem] rounded-2xl p-2', d === today ? 'bg-brand-pink/5 ring-1 ring-brand-pink/30' : 'bg-brand-cream/40')}>
                <div className="mb-2 text-xs font-bold text-brand-navy">{DAYS_SHORT[(i + 1) % 7]} <span className="font-normal text-slate-500">{d.slice(8)}</span></div>
                <div className="space-y-1.5">{(lessons.data ?? []).filter((l) => l.date === d).map(item)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3 lg:hidden">
            {days.map((d) => {
              const list = (lessons.data ?? []).filter((l) => l.date === d)
              return list.length ? (
                <div key={d}>
                  <div className="mb-1 text-xs font-bold text-brand-navy">{fmtDay(d)}{d === today && <Badge v="new" text="Today" />}</div>
                  <div className="space-y-1.5">{list.map(item)}</div>
                </div>
              ) : null
            })}
            {!(lessons.data ?? []).length && <p className="py-6 text-center text-sm text-slate-400">No lessons this week.</p>}
          </div>
        </>
      )}
    </Card>
  )
}
