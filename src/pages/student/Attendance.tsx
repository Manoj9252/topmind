import { supabase } from '../../lib/supabase'
import { q, rpc, useLoad } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { fmtDay, fmtTime } from '../../lib/format'
import { Badge, Card, Loaded, PageHeader, Section, Table, Td } from '../../components/ui'

export default function StudentAttendance() {
  const warn = useSettings().num('academic.attendance_warning_percent') || 75
  const summary = useLoad(() => rpc<any[]>('attendance_summary', {}), [])
  const records = useLoad(async () => {
    const rows = await q<any[]>(supabase.from('attendance').select('id, status, remarks, sessions(session_date, start_time, topic, booking_id, classes(name))').limit(500))
    return rows.filter((r) => r.status !== 'pending').sort((a, b) => String(b.sessions?.session_date).localeCompare(String(a.sessions?.session_date)))
  }, [])
  return (
    <div className="space-y-6">
      <PageHeader title="My attendance" subtitle="Your attendance record for every class." />
      <Loaded state={summary} empty="No attendance has been recorded for you yet.">
        {(rows) => (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <Card key={s.class_id}>
                <div className="flex items-start justify-between gap-2"><b className="text-brand-navy">{s.class_name}</b>
                  {s.attendance_percent != null && <Badge v={Number(s.attendance_percent) < warn ? 'overdue' : 'active'} text={`${s.attendance_percent}%`} />}</div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  <div><b className="block text-lg text-emerald-700">{s.present}</b>Present</div>
                  <div><b className="block text-lg text-amber-600">{s.late}</b>Late</div>
                  <div><b className="block text-lg text-rose-600">{s.absent}</b>Absent</div>
                  <div><b className="block text-lg text-slate-500">{s.excused}</b>Excused</div>
                </div>
                {s.attendance_percent != null && Number(s.attendance_percent) < warn && <p className="mt-2 text-xs text-rose-600">Your attendance is below {warn}%. Talk to your teacher if you need help catching up.</p>}
              </Card>
            ))}
          </div>
        )}
      </Loaded>
      <Section title="Lesson by lesson">
        <Loaded state={records} empty="No lessons recorded yet.">
          {(rows) => (
            <Table head={['Date', 'Class', 'Topic', 'Attendance']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDay(r.sessions?.session_date)} <span className="text-xs text-slate-400">{fmtTime(r.sessions?.start_time)}</span></Td>
                  <Td>{r.sessions?.classes?.name ?? 'One-to-one lesson'}</Td>
                  <Td className="text-sm text-slate-600">{r.sessions?.topic ?? '—'}</Td>
                  <Td><Badge v={r.status} />{r.remarks && <div className="text-xs text-slate-400">{r.remarks}</div>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      </Section>
    </div>
  )
}
