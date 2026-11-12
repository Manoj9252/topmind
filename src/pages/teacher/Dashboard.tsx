import { Link } from 'react-router-dom'
import { Banknote, CalendarDays, CheckSquare, GraduationCap, Video } from 'lucide-react'
import { rpc, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useCurrency } from '../../lib/settings'
import { fmtClock, fmtDateTime, money } from '../../lib/format'
import { Alert, Badge, Button, Card, Loading, PageHeader, Section, Stat } from '../../components/ui'

export default function TeacherDashboard() {
  const { profile } = useAuth()
  const sym = useCurrency()
  const d = useLoad(() => rpc<any>('teacher_dashboard'), [])
  if (d.loading && !d.data) return <Loading />
  if (d.error) return <Alert msg={d.error} />
  const x = d.data
  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${profile?.full_name?.split(' ')[0] ?? 'there'}`} subtitle="Here is your teaching day." />
      {x.missing_attendance > 0 && (
        <Alert tone="warn" msg={<span>{x.missing_attendance} past lesson(s) still need attendance. <Link to="/teacher/attendance" className="underline">Record it now</Link>.</span>} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="My classes" value={x.classes} icon={<CalendarDays size={20} />} />
        <Stat label="My students" value={x.students} icon={<GraduationCap size={20} />} tone="pink" />
        <Stat label="Lessons this week" value={x.week} icon={<CheckSquare size={20} />} tone="emerald" />
        <Stat label="Earned so far this month" value={money(x.earnings?.base_amount, sym)} hint={`${x.earnings?.lessons ?? 0} completed lessons`} icon={<Banknote size={20} />} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Today's lessons" actions={<Link to="/teacher/schedule" className="text-sm font-semibold text-brand-pink">Full schedule</Link>}>
          {!x.today.length ? <p className="text-sm text-slate-500">No lessons today.</p> : (
            <ul className="space-y-2">{x.today.map((l: any) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-cream/50 p-3">
                <div><b className="text-brand-navy">{l.class}</b><div className="text-sm text-slate-500">{fmtClock(l.starts_at)}–{fmtClock(l.ends_at)}</div></div>
                <div className="flex items-center gap-2">
                  {l.meeting_link && <a href={l.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-pink"><Video size={14} />Join</a>}
                  {l.attendance_taken ? <Badge v="completed" text="Attendance done" /> : <Link to={`/teacher/attendance?lesson=${l.id}`}><Button size="sm">Take attendance</Button></Link>}
                </div>
              </li>
            ))}</ul>
          )}
        </Section>
        <Section title="Upcoming one-to-one" actions={<Link to="/teacher/bookings" className="text-sm font-semibold text-brand-pink">Bookings</Link>}>
          {!x.bookings.length ? <p className="text-sm text-slate-500">No upcoming bookings.</p> : (
            <ul className="divide-y text-sm">{x.bookings.map((b: any) => (
              <li key={b.id} className="flex justify-between gap-2 py-2"><span><b>{b.student}</b> · {fmtDateTime(b.starts_at, { tz: false })}</span><Badge v={b.status} /></li>
            ))}</ul>
          )}
        </Section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Pay">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Estimated this month (completed lessons)</span><b>{money(x.earnings?.base_amount, sym)}</b></li>
            <li className="flex justify-between"><span>Approved but not yet paid</span><b>{money(x.salary_outstanding, sym)}</b></li>
          </ul>
          <Link to="/teacher/salary" className="mt-3 inline-block text-sm font-semibold text-brand-pink">My salary statements</Link>
        </Section>
        <Section title="Announcements">
          {!x.announcements.length ? <p className="text-sm text-slate-500">No announcements.</p> : x.announcements.map((a: any, i: number) => (
            <Card key={i} className="mb-2 !p-3"><b className="text-brand-navy">{a.title}</b><p className="whitespace-pre-line text-sm text-slate-600">{a.body}</p></Card>
          ))}
        </Section>
      </div>
    </div>
  )
}
