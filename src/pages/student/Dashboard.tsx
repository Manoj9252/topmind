import { Link } from 'react-router-dom'
import { CalendarDays, CheckSquare, GraduationCap, Star, Trophy, Video, Wallet } from 'lucide-react'
import { rpc, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useCurrency } from '../../lib/settings'
import { useStudentSpotlights } from '../../lib/mockData'
import { fmtDateTime, money } from '../../lib/format'
import { Alert, Badge, Button, Loading, PageHeader, Section, Stat } from '../../components/ui'
import VocabularyWidget from '../../components/VocabularyWidget'
import { NotLinked } from './NotLinked'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const sym = useCurrency()
  const d = useLoad(() => rpc<any>('student_dashboard'), [])
  const spotlights = useStudentSpotlights()

  if (d.loading && !d.data) return <Loading />
  if (d.error) return <Alert msg={d.error} />
  const x = d.data
  const hello = `Hello, ${profile?.full_name?.split(' ')[0] ?? 'there'}`
  if (!x.linked) return <div className="space-y-4"><PageHeader title={hello} /><NotLinked /></div>
  const next = x.next_lessons[0]
  const active = x.classes.filter((c: any) => c.status === 'active')

  const studentName = String(profile?.full_name ?? x.student?.name ?? '').trim().toLowerCase()
  const award = spotlights.find(
    (s) => (s.student_id && s.student_id === x.student.id) || s.student_name.trim().toLowerCase() === studentName,
  )

  return (
    <div className="space-y-6">
      <PageHeader title={hello} subtitle={`Student code ${x.student.code}`} />

      {award && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-navy via-[#132c74] to-brand-pink p-5 text-white shadow-lg sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-amber-300 ring-1 ring-white/25">
                <Trophy size={24} />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-cream">
                  <Star size={12} className="fill-amber-300 text-amber-300" />
                  Student Spotlight · {award.month_label}
                </div>
                <h2 className="mt-1.5 text-lg font-extrabold sm:text-xl">
                  Congratulations! You earned “{award.category}”
                </h2>
                <p className="mt-1 max-w-2xl text-sm italic text-white/90">“{award.quote}”</p>
                <p className="mt-1.5 text-xs font-medium text-brand-cream/90">
                  {award.language_level} · Recognised by {award.teacher_name}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {x.overdue > 0 && <Alert tone="warn" msg={<span>You have {x.overdue} overdue invoice(s). <Link to="/student/invoices" className="underline">View and pay</Link>.</span>} />}
      {x.pending_payments > 0 && <Alert tone="info" msg={`${x.pending_payments} payment(s) you sent are waiting for the academy to confirm them.`} />}

      <VocabularyWidget variant="portal" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Next lesson" value={next ? fmtDateTime(next.starts_at) : 'None booked'} hint={next?.class} icon={<CalendarDays size={20} />} />
        <Stat label="Attendance" value={x.attendance.percent == null ? '—' : `${x.attendance.percent}%`} hint={`${x.attendance.present + x.attendance.late} attended, ${x.attendance.absent} missed`} icon={<CheckSquare size={20} />} tone="emerald" />
        <Stat label="Balance due" value={money(x.balance, sym)} icon={<Wallet size={20} />} tone={x.overdue ? 'pink' : 'amber'} />
        <Stat label="Level" value={x.level?.level ?? 'Not assessed yet'} hint={x.level?.programme} icon={<GraduationCap size={20} />} tone="pink" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Coming up" actions={<Link to="/student/schedule" className="text-sm font-semibold text-brand-pink">Full timetable</Link>}>
          {!x.next_lessons.length ? <p className="text-sm text-slate-500">No lessons in the next two weeks.</p> : (
            <ul className="space-y-2">{x.next_lessons.map((l: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-cream/50 p-3">
                <div><b className="text-brand-navy">{l.class}</b><div className="text-sm text-slate-500">{fmtDateTime(l.starts_at)} · {l.mode}</div></div>
                {l.meeting_link && <a href={l.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-pink"><Video size={14} />Join</a>}
              </li>
            ))}</ul>
          )}
        </Section>
        <Section title="My classes" actions={<Link to="/student/classes" className="text-sm font-semibold text-brand-pink">Details</Link>}>
          {!active.length ? <p className="text-sm text-slate-500">You are not in a class yet. <Link to="/classes" className="text-brand-pink underline">Browse classes</Link></p> : (
            <ul className="divide-y text-sm">{active.map((c: any) => (
              <li key={c.enrolment_id} className="py-2"><b className="text-brand-navy">{c.class.name}</b><div className="text-slate-500">{c.class.schedule}{c.teacher?.name ? ` · ${c.teacher.name}` : ''}</div></li>
            ))}</ul>
          )}
          {x.classes.some((c: any) => c.status === 'waitlisted') && <p className="mt-2 text-xs text-slate-500">You are on a waiting list. We will tell you when a place opens.</p>}
        </Section>
      </div>
      <Section title="One-to-one lessons" actions={<Link to="/student/book"><Button size="sm">Book a lesson</Button></Link>}>
        {!x.bookings.length ? <p className="text-sm text-slate-500">No upcoming one-to-one lessons.</p> : (
          <ul className="divide-y text-sm">{x.bookings.map((b: any) => (
            <li key={b.id} className="flex justify-between gap-2 py-2"><span>{fmtDateTime(b.starts_at)} with <b>{b.teacher}</b></span><Badge v={b.status} text={b.status === 'requested' ? 'Waiting for teacher' : undefined} /></li>
          ))}</ul>
        )}
      </Section>
    </div>
  )
}
