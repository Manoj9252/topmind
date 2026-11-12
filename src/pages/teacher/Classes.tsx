import { useState } from 'react'
import { Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { DAYS, fmtDate, fmtTime } from '../../lib/format'
import { Badge, Button, Card, Loaded, PageHeader } from '../../components/ui'

export default function TeacherClasses() {
  const { session } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const list = useLoad(() => q<any[]>(supabase.from('classes')
    .select('id, name, kind, mode, status, capacity, meeting_link, location_note, start_date, end_date, teacher_id, courses(name, languages(name)), levels(name), classrooms(name), class_schedules(weekday, start_time, end_time), enrolments(status, students(id, full_name, student_code))')
    .neq('status', 'archived').order('name')), [])
  return (
    <div>
      <PageHeader title="My classes" subtitle="Classes you teach, including any you are covering as a substitute." />
      <Loaded state={list} empty="You have no classes assigned yet.">
        {(rows) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((c) => {
              const active = c.enrolments.filter((e: any) => e.status === 'active')
              return (
                <Card key={c.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="text-lg text-brand-navy">{c.name}</b>
                      <p className="text-sm text-slate-500">{c.courses?.languages?.name} · {c.courses?.name}{c.levels?.name ? ` · ${c.levels.name}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1"><Badge v={c.status} /><Badge v={c.mode} />{c.teacher_id !== session?.user.id && <Badge v="pending" text="Covering" />}</div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{c.class_schedules.map((s: any) => `${DAYS[s.weekday]} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`).join(' · ') || 'No weekly times yet'}</p>
                  <p className="text-xs text-slate-400">{fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : 'ongoing'} · {active.length}/{c.capacity} students{c.classrooms?.name ? ` · ${c.classrooms.name}` : ''}{c.location_note ? ` · ${c.location_note}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.meeting_link && <a href={c.meeting_link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><Video size={14} />Meeting link</Button></a>}
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide' : 'Show'} students</Button>
                  </div>
                  {open === c.id && (
                    <ul className="mt-3 divide-y text-sm">
                      {c.enrolments.length ? c.enrolments.map((e: any) => (
                        <li key={e.students?.id} className="flex justify-between py-2"><span>{e.students?.full_name} <span className="text-xs text-slate-400">{e.students?.student_code}</span></span><Badge v={e.status} /></li>
                      )) : <li className="py-2 text-slate-400">No students yet</li>}
                    </ul>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </Loaded>
    </div>
  )
}
