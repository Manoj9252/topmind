import { Link } from 'react-router-dom'
import { MapPin, Video } from 'lucide-react'
import { rpc, useLoad } from '../../lib/api'
import { fmtDate, label } from '../../lib/format'
import { Badge, Button, Card, Loaded, PageHeader } from '../../components/ui'

export default function StudentClasses() {
  const list = useLoad(() => rpc<any[]>('my_classes'), [])
  return (
    <div>
      <PageHeader title="My classes" subtitle="Your current classes, waiting lists and past enrolments." />
      <Loaded state={list} empty="You are not enrolled in a class yet.">
        {(rows) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((e) => (
              <Card key={e.enrolment_id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <b className="text-lg text-brand-navy">{e.class.name}</b>
                    <p className="text-sm text-slate-500">{[e.class.language, e.class.programme, e.class.level].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Badge v={e.status} />
                </div>
                <p className="mt-2 text-sm text-slate-700">{e.class.schedule || 'Times to be confirmed'}{e.class.timezone && e.class.timezone !== 'Asia/Kuala_Lumpur' ? ` (${e.class.timezone})` : ' (Malaysia time)'}</p>
                <p className="text-sm text-slate-500">{label(e.class.type)} · {label(e.class.mode)}{e.teacher?.name ? ` · Teacher: ${e.teacher.name}` : ''}</p>
                <p className="text-xs text-slate-400">From {fmtDate(e.start_date)}{e.end_date ? ` to ${fmtDate(e.end_date)}` : ''}</p>
                {e.class.location && e.class.mode !== 'online' && <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600"><MapPin size={14} />{e.class.location}</p>}
                {e.teacher?.bio && <p className="mt-2 text-xs text-slate-500">{e.teacher.bio}</p>}
                {e.status === 'waitlisted' && <p className="mt-2 text-sm text-amber-700">You are on the waiting list. We will contact you when a place opens.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.class.meeting_link && <a href={e.class.meeting_link} target="_blank" rel="noreferrer"><Button size="sm"><Video size={14} />Join online lesson</Button></a>}
                  {e.status === 'active' && <Link to="/student/materials"><Button size="sm" variant="ghost">Materials</Button></Link>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </div>
  )
}
