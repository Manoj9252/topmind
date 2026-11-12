import { useMemo, useState } from 'react'
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { rpc, useLoad } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { label } from '../../lib/format'
import { Badge, Card, Loaded, PageHeader, SearchBox, Select } from '../../components/ui'

// Only students in the teacher's own classes (checked by the database).
export default function TeacherStudents() {
  const warn = useSettings().num('academic.attendance_warning_percent') || 75
  const [search, setSearch] = useState('')
  const [cls, setCls] = useState('')
  const list = useLoad(() => rpc<any[]>('my_students'), [])
  const classes = useMemo(() => Array.from(new Map((list.data ?? []).map((s) => [s.class_id, s.class])).entries()), [list.data])
  const shown = (list.data ?? []).filter((s) => (!cls || s.class_id === cls) && (!search || `${s.name} ${s.email ?? ''}`.toLowerCase().includes(search.toLowerCase())))
  return (
    <div>
      <PageHeader title="My students" subtitle="Contact details, goals and attendance for students in your classes.">
        <SearchBox value={search} onChange={setSearch} />
        <Select className="!w-auto" value={cls} onChange={setCls} placeholder="All classes" options={classes} />
      </PageHeader>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No students in your classes yet.">
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <Card key={`${s.student_id}-${s.class_id}`} className="!p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><b className="text-brand-navy">{s.name}</b><p className="text-xs text-slate-400">{s.code} · {s.class}</p></div>
                  {s.enrolment_status !== 'active' && <Badge v={s.enrolment_status} />}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 text-brand-navy hover:text-brand-pink"><Mail size={13} />Email</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-brand-navy hover:text-brand-pink"><Phone size={13} />{s.phone}</a>}
                  {s.phone && s.preferred_contact === 'whatsapp' && <a href={`https://wa.me/${s.phone.replace(/\D/g, '').replace(/^0/, '60')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700"><MessageCircle size={13} />WhatsApp</a>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span>Attendance: {s.attendance_percent == null ? '—' : <Badge v={s.attendance_percent < warn ? 'overdue' : 'active'} text={`${s.attendance_percent}%`} />}</span>
                  {s.level && <span>Level: <b>{s.level}</b></span>}
                </div>
                {s.objectives && <p className="mt-2 text-xs text-slate-600">Goal: {s.objectives}</p>}
                {s.emergency_name && <p className="mt-1 text-xs text-slate-400">Emergency contact: {s.emergency_name} {s.emergency_phone}</p>}
                <p className="mt-1 text-xs text-slate-400">Prefers {label(s.preferred_contact)}</p>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </div>
  )
}
