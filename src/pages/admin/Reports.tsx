import { useMemo, useState } from 'react'
import { Download, FileDown, Play } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { downloadCsv } from '../../lib/csv'
import { reportPdf } from '../../lib/pdf'
import { label } from '../../lib/format'
import { Alert, Button, Card, Empty, Label, Loading, PageHeader, Select, Table, Td, inputCls } from '../../components/ui'

const REPORTS: [string, string, string][] = [
  ['summary', 'Monthly business summary', 'Registrations, students, lessons, invoiced vs collected, salaries, expenses and net operating balance per month.'],
  ['registrations', 'Student registrations', 'Every registration with language, programme, source and status.'],
  ['enrolments', 'Student enrolments', 'Enrolments active during the period, with history.'],
  ['classes', 'Classes', 'Capacity, students, attendance, invoiced and collected per class.'],
  ['attendance', 'Attendance', 'Per student and class: lessons, present, late, absent, excused and percentage.'],
  ['invoices', 'Monthly invoices', 'Invoices issued, totals, paid and balances.'],
  ['payments', 'Payment collection', 'Confirmed payments by date, method, class and language.'],
  ['outstanding', 'Outstanding fees', 'Unpaid and part-paid invoices with days overdue.'],
  ['receipts', 'Receipts', 'Receipts issued and their email and WhatsApp delivery.'],
  ['salaries', 'Teacher salaries', 'Salary statements: lessons, hours, totals, paid and outstanding.'],
  ['salary_payments', 'Teacher payments', 'Salary payments made in the period.'],
  ['bookings', 'One-to-one bookings', 'Bookings by teacher, student and status.'],
  ['materials', 'Learning materials', 'Materials uploaded by class, type and teacher.'],
  ['progress', 'Student learning progress', 'Assessment scores, improvement notes, and attendance alongside student goals.'],
  ['proficiency', 'Class level mix', 'Students in each class by their latest placement level.'],
]

export default function Reports() {
  const [key, setKey] = useState('summary')
  const [f, setF] = useState({ month: '', from: '', to: '', language_id: '', course_id: '', class_id: '', teacher_id: '', status: '' })
  const [rows, setRows] = useState<any[] | null>(null)
  const act = useAction()
  const lookups = useLoad(async () => ({
    languages: await q<any[]>(supabase.from('languages').select('id, name').order('sort_order')),
    courses: await q<any[]>(supabase.from('courses').select('id, name').order('name')),
    classes: await q<any[]>(supabase.from('classes').select('id, name').order('name')),
    teachers: await q<any[]>(supabase.from('profiles').select('id, full_name').eq('role', 'teacher').order('full_name')),
  }), [])
  const report = REPORTS.find((r) => r[0] === key)!
  const run = () => act.run(async () => setRows(await rpc<any[]>('run_report', { p_key: key, p_filters: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })))
  const cols = useMemo(() => (rows?.[0] ? Object.keys(rows[0]) : []), [rows])
  const filterText = Object.entries(f).filter(([, v]) => v).map(([k, v]) => {
    const name = [...(lookups.data?.languages ?? []), ...(lookups.data?.courses ?? []), ...(lookups.data?.classes ?? [])].find((x) => x.id === v)?.name
      ?? lookups.data?.teachers.find((x) => x.id === v)?.full_name
    return `${label(k)}: ${name ?? v}`
  }).join(' · ') || 'All records'

  return (
    <div>
      <PageHeader title="Reports" subtitle="Filter, then export to CSV or PDF. Running a report also ticks the matching checklist task." />
      <Card className="mb-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Label t="Report" className="md:col-span-1"><Select value={key} onChange={(v) => { setKey(v); setRows(null) }} options={REPORTS.map(([k, n]) => [k, n])} /></Label>
          <p className="self-end text-sm text-slate-500 md:col-span-2">{report[2]}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Label t="Month"><input type="month" className={inputCls} value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Label>
          <Label t="From"><input type="date" className={inputCls} value={f.from} disabled={!!f.month} onChange={(e) => setF({ ...f, from: e.target.value })} /></Label>
          <Label t="To"><input type="date" className={inputCls} value={f.to} disabled={!!f.month} onChange={(e) => setF({ ...f, to: e.target.value })} /></Label>
          <Label t="Language"><Select value={f.language_id} onChange={(v) => setF({ ...f, language_id: v })} placeholder="All" options={(lookups.data?.languages ?? []).map((x) => [x.id, x.name])} /></Label>
          <Label t="Programme"><Select value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} placeholder="All" options={(lookups.data?.courses ?? []).map((x) => [x.id, x.name])} /></Label>
          <Label t="Class"><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="All" options={(lookups.data?.classes ?? []).map((x) => [x.id, x.name])} /></Label>
          <Label t="Teacher"><Select value={f.teacher_id} onChange={(v) => setF({ ...f, teacher_id: v })} placeholder="All" options={(lookups.data?.teachers ?? []).map((x) => [x.id, x.full_name])} /></Label>
          <Label t="Status"><input className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="e.g. paid" /></Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button busy={act.busy} onClick={run}><Play size={16} />Run report</Button>
          <Button variant="ghost" disabled={!rows?.length} onClick={() => downloadCsv(rows!, key)}><Download size={16} />CSV</Button>
          <Button variant="ghost" disabled={!rows?.length} onClick={() => reportPdf(report[1], filterText, rows!)}><FileDown size={16} />PDF</Button>
          <Button variant="ghost" onClick={() => { setF({ month: '', from: '', to: '', language_id: '', course_id: '', class_id: '', teacher_id: '', status: '' }); setRows(null) }}>Clear filters</Button>
        </div>
      </Card>
      <Alert msg={act.error} />
      {act.busy && !rows ? <Loading /> : rows === null ? <Empty text="Choose a report and press Run." /> : !rows.length ? <Empty text="No records for these filters." /> : (
        <>
          <p className="mb-2 text-sm text-slate-500">{rows.length} row(s) · {filterText}</p>
          <Table head={cols.map(label)}>
            {rows.map((r, i) => <tr key={i}>{cols.map((c) => <Td key={c} className="whitespace-nowrap text-xs">{r[c] == null ? '—' : typeof r[c] === 'boolean' ? (r[c] ? 'Yes' : 'No') : String(r[c])}</Td>)}</tr>)}
          </Table>
        </>
      )}
    </div>
  )
}
