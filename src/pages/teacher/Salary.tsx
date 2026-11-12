import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useCurrency } from '../../lib/settings'
import { fmtDate, label, monthLabel, money, todayMY } from '../../lib/format'
import { Alert, Badge, Card, Empty, KeyValue, Loaded, Loading, PageHeader, Section, Table, Td } from '../../components/ui'

// Teachers see their own statements once the administrator has approved them,
// plus a running estimate for the current month from completed lessons and workshops.
export default function TeacherSalary() {
  const { session } = useAuth()
  const me = session!.user.id
  const sym = useCurrency()
  const [open, setOpen] = useState<string | null>(null)
  const estimate = useLoad(() => rpc<any>('calculate_teacher_pay', { p_teacher: me, p_month: todayMY() }), [])
  const list = useLoad(() => q<any[]>(supabase.from('teacher_payouts')
    .select('id, period, status, lessons_completed, hours, students_count, base_amount, additions, deductions, amount, amount_paid, approved_at, notes, breakdown')
    .eq('teacher_id', me).order('period', { ascending: false })), [])
  const e = estimate.data
  const estRegularLines: any[] = (e?.lines ?? []).filter((l: any) => l.basis !== 'per_workshop')
  const estWorkshops: any[] = e?.workshops ?? []
  const estWorkshopTotal = e?.workshop_amount ?? estWorkshops.reduce((s: number, w: any) => s + Number(w.amount ?? 0), 0)
  const estRegularTotal = e?.regular_amount ?? (Number(e?.base_amount ?? 0) - estWorkshopTotal)

  return (
    <div className="space-y-6">
      <PageHeader title="My salary" subtitle="Approved statements, regular class earnings, workshop payouts and this month's estimate." />
      <Section title={`This month so far (${monthLabel(todayMY().slice(0, 7))})`}>
        {estimate.loading && !e ? <Loading /> : estimate.error ? <Alert msg={estimate.error} /> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="!p-3"><div className="text-xs text-slate-500">Completed lessons</div><b className="text-xl text-brand-navy">{e.lessons}</b><div className="text-xs text-slate-400">{e.hours} hrs · {e.students} students</div></Card>
              <Card className="!p-3"><div className="text-xs text-slate-500">Regular class earnings</div><b className="text-xl text-brand-navy">{money(estRegularTotal, sym)}</b></Card>
              <Card className="!p-3"><div className="text-xs text-slate-500">Workshop payouts</div><b className="text-xl text-brand-pink">{money(estWorkshopTotal, sym)}</b><div className="text-xs text-slate-400">{estWorkshops.length} session(s)</div></Card>
              <Card className="!p-3 border-brand-pink/30 bg-brand-cream/40"><div className="text-xs text-slate-500">Total estimated pay</div><b className="text-xl text-brand-navy">{money(e.base_amount, sym)}</b></Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-brand-cream-dark p-4">
                <h3 className="mb-2 text-sm font-bold text-brand-navy">Regular class earnings</h3>
                {!estRegularLines.length ? (
                  <p className="text-xs text-slate-500">No regular rate arrangement for this month.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {estRegularLines.map((l: any, i: number) => (
                      <li key={i} className="flex items-center justify-between py-1.5">
                        <span>{label(l.basis)} <span className="text-xs text-slate-400">({label(l.applies_to)} · {l.quantity} × {money(l.rate, sym)})</span></span>
                        <b className="text-brand-navy">{money(l.amount, sym)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-brand-pink/25 bg-brand-cream/35 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-navy">
                    <Sparkles size={15} className="text-brand-pink" />
                    Workshop &amp; masterclass payouts
                  </h3>
                  <Badge v="per_workshop" />
                </div>
                {!estWorkshops.length ? (
                  <p className="text-xs text-slate-500">No workshops or trial classes conducted this month yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {estWorkshops.map((w: any, idx: number) => (
                      <li key={w.id ?? idx} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-brand-cream-dark/60">
                        <div>
                          <b className="text-brand-navy">{w.title}</b>
                          <div className="text-xs text-slate-500">{fmtDate(w.date)}{w.duration_minutes ? ` · ${w.duration_minutes} mins` : ''}</div>
                        </div>
                        <b className="text-brand-pink">{money(w.amount, sym)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {e.missing_attendance > 0 && <Alert tone="warn" msg={`${e.missing_attendance} lesson(s) this month have no attendance yet. Lessons only count once attendance is recorded.`} />}
            {!e.lines.length && <Alert tone="info" msg="No pay rate is set up for you yet. Please ask the administrator." />}
            <p className="text-xs text-slate-400">This is an estimate. Your final statement separates regular class earnings and workshop honorariums and is confirmed by the administrator.</p>
          </div>
        )}
      </Section>

      <Section title="Statements">
        <Loaded state={list} empty="No approved statements yet.">
          {(rows) => (
            <Table head={['Month', 'Lessons', 'Total', 'Paid', 'Status']}>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-brand-cream/40" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  <Td><b className="text-brand-navy">{monthLabel(String(p.period).slice(0, 7))}</b></Td>
                  <Td>{p.lessons_completed} · {Number(p.hours)} h</Td>
                  <Td>{money(p.amount, sym)}</Td><Td>{money(p.amount_paid, sym)}</Td><Td><Badge v={p.status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      </Section>
      {open && list.data && <Statement p={list.data.find((x) => x.id === open)} sym={sym} />}
    </div>
  )
}

function Statement({ p, sym }: { p: any; sym: string }) {
  const items = useLoad(() => q<any[]>(supabase.from('teacher_payout_items').select('id, kind, description, amount').eq('payout_id', p.id).order('created_at')), [p.id])
  const payments = useLoad(() => q<any[]>(supabase.from('teacher_payout_payments').select('id, amount, paid_on, method, reference').eq('payout_id', p.id).order('paid_on')), [p.id])
  const lines: any[] = p.breakdown?.lines ?? []
  const regularLines = lines.filter((l) => l.basis !== 'per_workshop')
  const workshops: any[] = p.breakdown?.workshops ?? []
  const workshopSubtotal = p.breakdown?.workshop_amount ?? workshops.reduce((s, w) => s + Number(w.amount ?? 0), 0)
  const regularSubtotal = p.breakdown?.regular_amount ?? (Number(p.base_amount) - workshopSubtotal)

  return (
    <Section title={`Statement for ${monthLabel(String(p.period).slice(0, 7))}`}>
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-brand-cream-dark p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-brand-navy">Regular class earnings</h3>
              <span className="text-sm font-bold text-brand-navy">{money(regularSubtotal, sym)}</span>
            </div>
            {!regularLines.length ? (
              <p className="text-xs text-slate-500">Included in base pay ({money(regularSubtotal, sym)}).</p>
            ) : (
              <ul className="divide-y text-sm">
                {regularLines.map((l, i) => (
                  <li key={i} className="flex justify-between py-1.5">
                    <span>{label(l.basis)} <span className="text-xs text-slate-400">({label(l.applies_to)} · {l.quantity} × {money(l.rate, sym)})</span></span>
                    <span className="font-medium text-brand-navy">{money(l.amount, sym)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-brand-pink/25 bg-brand-cream/35 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-brand-navy">Workshop &amp; masterclass payouts</h3>
              <span className="text-sm font-bold text-brand-pink">{money(workshopSubtotal, sym)}</span>
            </div>
            {!workshops.length ? (
              <p className="text-xs text-slate-500">No workshops conducted in this statement period.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {workshops.map((w: any, idx: number) => (
                  <li key={w.id ?? idx} className="flex items-center justify-between rounded-xl bg-white px-3 py-1.5 ring-1 ring-brand-cream-dark/60">
                    <span>{w.title} · <span className="text-xs text-slate-500">{fmtDate(w.date)}</span></span>
                    <b className="text-brand-pink">{money(w.amount, sym)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <KeyValue rows={[
            ['Lessons completed', p.lessons_completed], ['Hours', Number(p.hours)], ['Students', p.students_count],
            ['Regular class earnings', money(regularSubtotal, sym)],
            ['Workshop payouts', money(workshopSubtotal, sym)],
            ['Additions', money(p.additions, sym)], ['Deductions', money(p.deductions, sym)],
            ['Total', <b key="t">{money(p.amount, sym)}</b>], ['Paid so far', money(p.amount_paid, sym)],
            ['Still to be paid', <b key="o" className="text-brand-pink">{money(Math.max(Number(p.amount) - Number(p.amount_paid), 0), sym)}</b>],
            ['Approved on', fmtDate(p.approved_at)],
          ]} />
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 font-semibold text-brand-navy">Additions and deductions</h3>
              <Loaded state={items} empty="None.">
                {(rows) => <ul className="divide-y text-sm">{rows.map((i) => <li key={i.id} className="flex justify-between py-1.5"><span>{i.description} <span className="text-xs text-slate-400">{label(i.kind)}</span></span><span>{i.kind === 'deduction' ? '− ' : ''}{money(i.amount, sym)}</span></li>)}</ul>}
              </Loaded>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-brand-navy">Payments received</h3>
              {payments.loading && !payments.data ? <Loading /> : !payments.data?.length ? <Empty text="No payments yet." /> : (
                <ul className="divide-y text-sm">{payments.data.map((x) => <li key={x.id} className="flex justify-between py-1.5"><span>{fmtDate(x.paid_on)} {x.method && <span className="text-xs text-slate-400">· {label(x.method)}</span>}{x.reference && <span className="text-xs text-slate-400"> · {x.reference}</span>}</span><span>{money(x.amount, sym)}</span></li>)}</ul>
              )}
            </div>
            {p.notes && <p className="text-sm text-slate-600">Note: {p.notes}</p>}
          </div>
        </div>
      </div>
    </Section>
  )
}