import { useState } from 'react'
import { Calculator, Download, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import { fmtDate, label, money, monthLabel, monthMY, todayMY } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, KeyValue, Loaded, Loading, Modal, PageHeader, Select, Table, Td, inputCls } from '../../components/ui'

const prevMonth = () => { const d = new Date(`${monthMY()}-01T00:00:00`); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString('en-CA').slice(0, 7) }

// Statements are calculated from completed lessons only (attendance taken),
// checked and approved by an administrator, then paid in one or more payments.
export default function Salaries() {
  const sym = useCurrency()
  const [month, setMonth] = useState(prevMonth())
  const [open, setOpen] = useState<string | null>(null)
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('teacher_payouts')
    .select('id, teacher_id, period, status, lessons_completed, hours, students_count, base_amount, additions, deductions, amount, amount_paid, profiles!teacher_payouts_teacher_id_fkey(full_name)')
    .eq('period', `${month}-01`).neq('status', 'void').order('created_at')), [month])
  const total = (list.data ?? []).reduce((t, p) => ({ amount: t.amount + Number(p.amount), paid: t.paid + Number(p.amount_paid) }), { amount: 0, paid: 0 })

  return (
    <div>
      <PageHeader title="Teacher salaries" subtitle="Only lessons with attendance recorded count. Scheduled lessons never count on their own.">
        <input type="month" className={inputCls + ' !w-auto'} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Salary month" />
        <Button variant="ghost" disabled={!list.data?.length} onClick={() => downloadCsv((list.data ?? []).map((p) => ({
          teacher: p.profiles?.full_name, month, status: p.status, lessons: p.lessons_completed, hours: p.hours, students: p.students_count,
          base: p.base_amount, additions: p.additions, deductions: p.deductions, total: p.amount, paid: p.amount_paid, outstanding: Number(p.amount) - Number(p.amount_paid),
        })), `salaries-${month}`)}><Download size={16} />CSV</Button>
        <Button busy={act.busy} onClick={() => act.run(async () => {
          const r = await rpc<any>('generate_salary_statements', { p_month: `${month}-01` })
          list.reload()
          act.setOk(`${r.created} new, ${r.recalculated} recalculated, ${r.already_approved} already approved (left unchanged).`)
        })}><Calculator size={16} />Prepare statements</Button>
      </PageHeader>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Loaded state={list} empty={`No statements for ${monthLabel(month)} yet. Prepare them once the month's attendance is complete.`}>
        {(rows) => (
          <Table head={['Teacher', 'Lessons', 'Hours', 'Base', 'Add / deduct', 'Total', 'Paid', 'Outstanding', 'Status']}
            footer={<tr><Td>Total</Td><Td /><Td /><Td /><Td /><Td>{money(total.amount, sym)}</Td><Td>{money(total.paid, sym)}</Td><Td>{money(total.amount - total.paid, sym)}</Td><Td /></tr>}>
            {rows.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => setOpen(p.id)}>
                <Td><b className="text-brand-navy">{p.profiles?.full_name}</b></Td><Td>{p.lessons_completed}</Td><Td>{Number(p.hours)}</Td>
                <Td>{money(p.base_amount, sym)}</Td><Td className="text-xs">+{money(p.additions, sym)} / −{money(p.deductions, sym)}</Td>
                <Td><b>{money(p.amount, sym)}</b></Td><Td>{money(p.amount_paid, sym)}</Td><Td>{money(Number(p.amount) - Number(p.amount_paid), sym)}</Td><Td><Badge v={p.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {open && <Statement id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </div>
  )
}

function Statement({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const sym = useCurrency()
  const data = useLoad(async () => ({
    p: await q<any>(supabase.from('teacher_payouts').select('*, profiles!teacher_payouts_teacher_id_fkey(full_name)').eq('id', id).single()),
    items: await q<any[]>(supabase.from('teacher_payout_items').select('*').eq('payout_id', id).order('created_at')),
    payments: await q<any[]>(supabase.from('teacher_payout_payments').select('*').eq('payout_id', id).order('paid_on')),
  }), [id])
  const [item, setItem] = useState({ kind: 'addition', description: '', amount: '' })
  const [pay, setPay] = useState({ amount: '', date: todayMY(), method: 'bank_transfer', reference: '', notes: '' })
  const [voiding, setVoiding] = useState(false)
  const act = useAction()
  const reload = () => { data.reload(); onChanged() }
  if (data.loading && !data.data) return <Modal title="Salary statement" onClose={onClose}><Loading /></Modal>
  if (data.error) return <Modal title="Salary statement" onClose={onClose}><Alert msg={data.error} /></Modal>
  const { p, items, payments } = data.data!
  const outstanding = Number(p.amount) - Number(p.amount_paid)
  const lines: any[] = p.breakdown?.lines ?? []
  const regularLines = lines.filter((l) => l.basis !== 'per_workshop')
  const workshops: any[] = p.breakdown?.workshops ?? []
  const workshopTotal = workshops.reduce((sum, w) => sum + Number(w.amount ?? 0), 0)
  const regularTotal = regularLines.reduce((sum, l) => sum + Number(l.amount ?? 0), 0)

  return (
    <Modal title={`${p.profiles?.full_name} · ${monthLabel(p.period.slice(0, 7))}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-2"><Badge v={p.status} /><span className="text-sm text-slate-500">{p.lessons_completed} completed lessons · {Number(p.hours)} hours · {p.students_count} students</span></div>
        {p.breakdown?.missing_attendance > 0 && <Alert tone="warn" msg={`${p.breakdown.missing_attendance} lesson(s) this month still have no attendance, so they are not counted. Record them, then recalculate.`} />}
        <Table head={['Regular class arrangement', 'Rate', 'Quantity', 'Amount']}>
          {regularLines.length ? regularLines.map((l, i) => <tr key={i}><Td>{label(l.basis)} ({label(l.applies_to)})</Td><Td>{money(l.rate, sym)}</Td><Td>{l.quantity}</Td><Td>{money(l.amount, sym)}</Td></tr>)
            : <tr><Td>No regular pay arrangement covers this month.</Td><Td /><Td /><Td /></tr>}
        </Table>
        <div className="rounded-2xl border border-brand-cream-dark bg-brand-cream/40 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm text-brand-navy">Workshops &amp; masterclasses conducted</b>
            <Badge tone="pink" text={`Workshop total: ${money(workshopTotal, sym)}`} />
          </div>
          {workshops.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {workshops.map((w: any, idx: number) => (
                <li key={w.id ?? idx} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-brand-cream-dark/60">
                  <span className="font-medium text-brand-navy">
                    {w.title} · <span className="font-normal text-slate-500">{fmtDate(w.date)}</span> · <span className="font-semibold text-brand-pink">{money(w.amount, sym)}</span>
                  </span>
                  <span className="text-xs text-slate-400">{w.duration_minutes ? `${w.duration_minutes} mins` : 'Flat honorarium'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">No workshop or trial class payouts recorded for this month.</p>
          )}
        </div>
        <div>
          <b className="text-sm text-brand-navy">Additions and deductions</b>
          <ul className="mt-2 space-y-1 text-sm">{items.map((it) => (
            <li key={it.id} className="flex items-center justify-between rounded-xl bg-brand-cream/50 px-3 py-1.5">
              <span>{it.kind === 'addition' ? '+' : '−'} {it.description}</span>
              <span className="flex items-center gap-2">{money(it.amount, sym)}{p.status === 'draft' && <button onClick={() => act.run(async () => { await rpc('remove_salary_item', { p_item: it.id }); reload() })} className="text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={14} /></button>}</span>
            </li>))}</ul>
          {p.status === 'draft' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Select className="!w-36" value={item.kind} onChange={(v) => setItem({ ...item, kind: v })} options={['addition', 'deduction']} />
              <input className={inputCls + ' !w-56'} placeholder="Description" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
              <input type="number" min={0} step="0.01" className={inputCls + ' !w-28'} placeholder="Amount" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} />
              <Button size="sm" disabled={!item.description || !item.amount} onClick={() => act.run(async () => {
                await rpc('add_salary_item', { p_payout: id, p_kind: item.kind, p_description: item.description, p_amount: Number(item.amount) }); setItem({ kind: 'addition', description: '', amount: '' }); reload()
              })}>Add</Button>
            </div>
          )}
        </div>
        <KeyValue rows={[
          ['Regular class earnings', money(regularLines.length ? regularTotal : p.base_amount, sym)],
          ['Workshop payouts', money(workshopTotal, sym)],
          ['Base total', money(p.base_amount, sym)],
          ['Additions', money(p.additions, sym)],
          ['Deductions', money(p.deductions, sym)],
          ['Total payable', <b key="t">{money(p.amount, sym)}</b>],
          ['Paid', money(p.amount_paid, sym)],
          ['Outstanding', <b key="o" className="text-brand-pink">{money(outstanding, sym)}</b>],
        ]} />
        {payments.length > 0 && (
          <Table head={['Paid on', 'Amount', 'Method', 'Reference', 'Notes']}>
            {payments.map((x) => <tr key={x.id}><Td>{fmtDate(x.paid_on)}</Td><Td>{money(x.amount, sym)}</Td><Td>{label(x.method)}</Td><Td>{x.reference ?? '—'}</Td><Td className="text-xs">{x.notes}</Td></tr>)}
          </Table>
        )}
        {['approved', 'partially_paid'].includes(p.status) && outstanding > 0 && (
          <div className="rounded-2xl border border-brand-cream-dark p-3">
            <b className="text-sm text-brand-navy">Record a salary payment</b>
            <div className="mt-2 grid gap-2 sm:grid-cols-5">
              <input type="number" step="0.01" className={inputCls} placeholder={String(outstanding)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-label="Amount" />
              <input type="date" className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} aria-label="Paid on" />
              <Select value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={['bank_transfer', 'duitnow', 'cash', 'other']} />
              <input className={inputCls} placeholder="Reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              <Button busy={act.busy} onClick={() => act.run(async () => {
                await rpc('record_salary_payment', { p_payout: id, p_amount: Number(pay.amount || outstanding), p_paid_on: pay.date, p_method: pay.method, p_reference: pay.reference || null, p_notes: pay.notes || null })
                setPay({ ...pay, amount: '', reference: '' }); reload()
              }, 'Payment recorded. The teacher can see it in their portal.')}>Record</Button>
            </div>
          </div>
        )}
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {p.status === 'draft' && <Button variant="ghost" busy={act.busy} onClick={() => act.run(async () => { await rpc('generate_salary_statements', { p_month: p.period }); reload() }, 'Recalculated from the latest attendance.')}>Recalculate</Button>}
          {['draft', 'approved'].includes(p.status) && Number(p.amount_paid) === 0 && <Button variant="danger" onClick={() => setVoiding(true)}>Void</Button>}
          {p.status === 'approved' && Number(p.amount_paid) === 0 && <Button variant="ghost" onClick={() => act.run(async () => { await rpc('reopen_salary_statement', { p_payout: id }); reload() })}>Reopen for changes</Button>}
          {p.status === 'draft' && <Button busy={act.busy} onClick={() => act.run(async () => { await rpc('approve_salary_statement', { p_payout: id }); reload() }, 'Approved. The teacher can now see this statement.')}>Approve statement</Button>}
        </div>
      </div>
      {voiding && <ConfirmModal title="Void this statement?" reason="Reason" danger confirmText="Void" message="The statement is kept on record but no longer payable." onClose={() => setVoiding(false)}
        onConfirm={async (r) => { await rpc('void_salary_statement', { p_payout: id, p_reason: r }); onChanged(); onClose() }} />}
    </Modal>
  )
}
