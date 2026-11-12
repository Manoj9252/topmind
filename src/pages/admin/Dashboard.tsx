import { Link } from 'react-router-dom'
import { AlertTriangle, Banknote, CalendarDays, CheckSquare, ClipboardList, FileText, GraduationCap, Users, Wallet } from 'lucide-react'
import { rpc, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { fmtDateTime, money, monthLabel, monthMY } from '../../lib/format'
import { Alert, Badge, Bars, Card, Loading, PageHeader, PairedColumns, Section, Stat, Table, Td } from '../../components/ui'

export default function Dashboard() {
  const d = useLoad(() => rpc<any>('admin_dashboard'), [])
  const sym = useCurrency()
  const m = (n: unknown) => money(n, sym)
  if (d.loading && !d.data) return <Loading />
  if (d.error) return <Alert msg={d.error} />
  const x = d.data
  const net = Number(x.collected_month) - Number(x.salaries_paid_month) - Number(x.expenses_month)

  const attention: [boolean, string, string, string][] = [
    [x.registrations_pending > 0, `${x.registrations_pending} registration(s) waiting for review`, '/admin/registrations', 'pending'],
    [x.payments_pending > 0, `${x.payments_pending} payment slip(s) to confirm`, '/admin/payments', 'pending'],
    [x.overdue_count > 0, `${x.overdue_count} overdue invoice(s), ${m(x.overdue_total)}`, '/admin/invoices', 'overdue'],
    [x.missing_attendance > 0, `${x.missing_attendance} past lesson(s) without attendance`, '/admin/attendance', 'pending'],
    [x.bookings_requested > 0, `${x.bookings_requested} one-to-one request(s)`, '/admin/bookings', 'requested'],
    [x.enquiries_open > 0, `${x.enquiries_open} open enquiry(ies)`, '/admin/enquiries', 'new'],
    [x.checklist_overdue > 0, `${x.checklist_overdue} overdue checklist task(s)`, '/admin/checklist', 'overdue'],
    [x.messages_failed > 0, `${x.messages_failed} message(s) failed to send`, '/admin/notifications', 'failed'],
  ]
  const todo = attention.filter((a) => a[0])

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`${monthLabel(monthMY())} at a glance`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={x.students_active} hint={`${x.students_total} on record`} icon={<GraduationCap size={20} />} />
        <Stat label="New registrations" value={x.registrations_new} hint={`${x.registrations_pending} pending review`} icon={<ClipboardList size={20} />} tone="pink" />
        <Stat label="Active classes" value={x.classes_active} hint={`${x.classes_total} in total`} icon={<CalendarDays size={20} />} tone="emerald" />
        <Stat label="Active teachers" value={x.teachers_active} hint={`${x.teachers_total} in total`} icon={<Users size={20} />} tone="amber" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Collected this month" value={m(x.collected_month)} hint="Confirmed payments received" icon={<Wallet size={20} />} tone="emerald" />
        <Stat label="Invoiced this month" value={m(x.invoiced_month)} hint="Issued invoices, paid or not" icon={<FileText size={20} />} />
        <Stat label="Outstanding fees" value={m(x.outstanding_total)} hint={`${m(x.overdue_total)} overdue · ${x.partial_count} part-paid`} icon={<AlertTriangle size={20} />} tone="rose" />
        <Stat label="Teacher salaries" value={m(x.salaries_month)} hint={`Last month · ${m(x.salaries_outstanding)} unpaid`} icon={<Banknote size={20} />} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Needs attention" className="lg:col-span-1">
          {!todo.length ? <p className="text-sm text-slate-500">Nothing urgent. Nice work!</p> : (
            <ul className="space-y-2">
              {todo.map(([, text, to, tone]) => (
                <li key={to + text}><Link to={to} className="flex items-center justify-between gap-2 rounded-xl bg-brand-cream/50 px-3 py-2 text-sm hover:bg-brand-cream">
                  <span>{text}</span><Badge v={tone} text="Open" /></Link></li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-brand-cream/50 p-3"><div className="text-xs text-slate-500">Attendance this month</div><b className="text-lg text-brand-navy">{x.attendance_percent ?? '—'}{x.attendance_percent != null && '%'}</b></div>
            <div className="rounded-xl bg-brand-cream/50 p-3"><div className="text-xs text-slate-500">Checklist tasks open</div><b className="text-lg text-brand-navy">{x.checklist_pending}</b></div>
          </div>
        </Section>
        <Section title="Invoiced vs collected (6 months)" className="lg:col-span-2">
          <PairedColumns a="Invoiced" b="Collected" format={m}
            data={(x.trend ?? []).map((t: any) => ({ label: t.month, a: Number(t.invoiced), b: Number(t.collected) }))} />
          <p className="mt-3 text-xs text-slate-500">
            Net operating balance this month: <b className={net < 0 ? 'text-rose-600' : 'text-emerald-700'}>{m(net)}</b> = collected {m(x.collected_month)} − salaries paid {m(x.salaries_paid_month)} − expenses {m(x.expenses_month)}. Accurate only when all expenses are recorded.
          </p>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Collected this month by class">
          <Bars format={m} data={(x.income_by_class ?? []).map((r: any) => ({ label: r.label, value: Number(r.amount) }))} />
        </Section>
        <Section title="Collected this month by language">
          <Bars format={m} data={(x.income_by_language ?? []).map((r: any) => ({ label: r.label, value: Number(r.amount) }))} />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Upcoming lessons (7 days)" actions={<Link to="/admin/attendance" className="text-sm font-semibold text-brand-pink">Calendar</Link>}>
          {!x.upcoming_lessons.length ? <p className="text-sm text-slate-500">No lessons scheduled.</p> : (
            <ul className="divide-y text-sm">{x.upcoming_lessons.map((l: any) => (
              <li key={l.id} className="flex justify-between gap-2 py-2"><span><b>{l.class}</b><span className="text-slate-500"> · {l.teacher ?? 'No teacher'}</span></span><span className="text-slate-500">{fmtDateTime(l.starts_at, { tz: false })}</span></li>
            ))}</ul>
          )}
        </Section>
        <Section title="Upcoming one-to-one bookings" actions={<Link to="/admin/bookings" className="text-sm font-semibold text-brand-pink">Bookings</Link>}>
          {!x.upcoming_bookings.length ? <p className="text-sm text-slate-500">No bookings in the next 7 days.</p> : (
            <ul className="divide-y text-sm">{x.upcoming_bookings.map((b: any) => (
              <li key={b.id} className="flex justify-between gap-2 py-2"><span><b>{b.student}</b><span className="text-slate-500"> with {b.teacher}</span></span><span className="flex items-center gap-2 text-slate-500">{fmtDateTime(b.starts_at, { tz: false })}<Badge v={b.status} /></span></li>
            ))}</ul>
          )}
        </Section>
      </div>

      <Card className="!p-0">
        <div className="flex items-center justify-between p-5 pb-3"><h2 className="font-bold text-brand-navy">Class performance</h2><CheckSquare size={18} className="text-brand-pink" /></div>
        <Table head={['Class', 'Teacher', 'Students', 'Spaces', 'Attendance', 'Collected (month)', 'Status']}>
          {x.class_performance.map((c: any) => (
            <tr key={c.id}>
              <Td><Link to={`/admin/classes/${c.id}`} className="font-semibold text-brand-navy hover:text-brand-pink">{c.name}</Link></Td>
              <Td>{c.teacher ?? '—'}</Td><Td>{c.enrolled}/{c.capacity}</Td><Td>{c.spaces}</Td>
              <Td>{c.attendance_percent != null ? `${c.attendance_percent}%` : '—'}</Td><Td>{m(c.collected_month)}</Td><Td><Badge v={c.status} /></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
