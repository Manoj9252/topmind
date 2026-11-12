import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FileDown, Plus, Repeat, Send, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import { invoicePdf } from '../../lib/pdf'
import { addDays, fmtDate, label, money, monthLabel, monthMY, todayMY } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, Label, Loaded, Loading, Modal, PageHeader, SearchBox, Select, Table, Td, inputCls } from '../../components/ui'

const KINDS = ['tuition', 'lesson', 'package', 'trial', 'registration', 'charge', 'discount']

export default function Invoices() {
  const [params] = useSearchParams()
  const sym = useCurrency()
  const [status, setStatus] = useState('')
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState<any>(params.get('student') ? { student_id: params.get('student') } : null)
  const [running, setRunning] = useState(false)
  const list = useLoad(() => q<any[]>(supabase.from('invoice_overview').select('*').order('created_at', { ascending: false }).limit(1000)), [])
  const shown = useMemo(() => (list.data ?? []).filter((i) => (!status || i.display_status === status)
    && (!month || (i.period ?? '').startsWith(month))
    && (!search || `${i.invoice_no ?? ''} ${i.student_name ?? ''} ${i.student_code ?? ''} ${i.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, month, search])
  const totals = shown.filter((i) => !['draft', 'void'].includes(i.status)).reduce((t, i) => ({ due: t.due + Number(i.amount_due), paid: t.paid + Number(i.amount_paid), bal: t.bal + Number(i.balance) }), { due: 0, paid: 0, bal: 0 })

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Issued invoices cannot be edited: add an adjustment, or void and re-issue.">
        <SearchBox value={search} onChange={setSearch} placeholder="Invoice, student or description" />
        <Button variant="ghost" onClick={() => setRunning(true)}><Repeat size={16} />Monthly run</Button>
        <Button variant="ghost" disabled={!shown.length} onClick={() => downloadCsv(shown.map((i) => ({
          invoice: i.invoice_no, issued: i.issued_at?.slice(0, 10), student_id: i.student_code, student: i.student_name, description: i.description,
          total: i.amount_due, paid: i.amount_paid, balance: i.balance, status: i.display_status, due: i.due_date,
        })), 'invoices')}><Download size={16} />CSV</Button>
        <Button onClick={() => setCreating({})}><Plus size={16} />New invoice</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses" options={['draft', 'unpaid', 'partial', 'overdue', 'paid', 'void']} />
        <input type="month" className={inputCls + ' !w-auto'} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Billing month" />
      </div>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No invoices match.">
        {(rows) => (
          <Table head={['Invoice', 'Student', 'Description', 'Due', 'Total', 'Paid', 'Balance', 'Status']}
            footer={<tr><Td>Totals (excluding drafts and void)</Td><Td /><Td /><Td /><Td>{money(totals.due, sym)}</Td><Td>{money(totals.paid, sym)}</Td><Td>{money(totals.bal, sym)}</Td><Td /></tr>}>
            {rows.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-brand-cream/30" onClick={() => setOpen(i.id)}>
                <Td className="whitespace-nowrap font-semibold text-brand-navy">{i.invoice_no ?? 'Draft'}</Td>
                <Td>{i.student_name}<div className="text-xs text-slate-400">{i.student_code}</div></Td>
                <Td className="text-xs">{i.description}</Td><Td className="whitespace-nowrap">{fmtDate(i.due_date)}</Td>
                <Td>{money(i.amount_due, sym)}</Td><Td>{money(i.amount_paid, sym)}</Td><Td><b>{money(i.balance, sym)}</b></Td>
                <Td><Badge v={i.display_status} />{i.pending_count > 0 && <div className="text-xs text-amber-600">{i.pending_count} slip(s) to check</div>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {open && <InvoiceModal id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
      {creating && <InvoiceForm initial={creating} onClose={() => setCreating(null)} onDone={(id) => { setCreating(null); list.reload(); setOpen(id) }} />}
      {running && <MonthlyRun onClose={() => setRunning(false)} onDone={list.reload} />}
    </div>
  )
}

type Line = { kind: string; description: string; quantity: string; unit_price: string }

function InvoiceForm({ initial, onClose, onDone }: { initial: any; onClose: () => void; onDone: (id: string) => void }) {
  const sym = useCurrency()
  const students = useLoad(() => q<any[]>(supabase.from('students').select('id, full_name, student_code').neq('status', 'archived').order('full_name')), [])
  const [student, setStudent] = useState(initial.student_id ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [due, setDue] = useState(initial.due_date ?? addDays(todayMY(), 7))
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [lines, setLines] = useState<Line[]>(initial.items?.map((x: any) => ({ kind: x.kind, description: x.description, quantity: String(x.quantity), unit_price: String(Math.abs(x.unit_price)) }))
    ?? [{ kind: 'tuition', description: '', quantity: '1', unit_price: '' }])
  const act = useAction()
  const total = lines.reduce((t, l) => t + (l.kind === 'discount' ? -1 : 1) * Number(l.quantity || 0) * Number(l.unit_price || 0), 0)
  const save = (issue: boolean) => act.run(async () => {
    const items = lines.map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) }))
    const inv = initial.id
      ? await rpc<any>('update_draft_invoice', { p_invoice: initial.id, p_items: items, p_due_date: due, p_notes: notes || null, p_description: description || null })
      : await rpc<any>('create_invoice', { p_student: student, p_items: items, p_due_date: due, p_period: null, p_notes: notes || null, p_issue: false, p_description: description || null })
    if (issue) await rpc('issue_invoice', { p_invoice: inv.id })
    onDone(inv.id)
  })
  return (
    <Modal title={initial.id ? 'Edit draft invoice' : 'New invoice'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label t="Student *" className="sm:col-span-2"><Select value={student} onChange={setStudent} disabled={!!initial.id} placeholder="Choose a student"
          options={(students.data ?? []).map((s) => [s.id, `${s.full_name} (${s.student_code})`])} /></Label>
        <Label t="Due date"><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></Label>
        <Label t="Title" className="sm:col-span-3"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 10-lesson one-to-one package" /></Label>
      </div>
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-end gap-2">
            <Label t={i === 0 ? 'Type' : ''} className="col-span-3"><Select value={l.kind} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, kind: v } : x)))} options={KINDS} /></Label>
            <Label t={i === 0 ? 'Description' : ''} className="col-span-5"><input className={inputCls} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></Label>
            <Label t={i === 0 ? 'Qty' : ''} className="col-span-1"><input type="number" min={0.5} step={0.5} className={inputCls} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /></Label>
            <Label t={i === 0 ? (l.kind === 'discount' ? 'Discount' : 'Price') : ''} className="col-span-2"><input type="number" min={0} step="0.01" className={inputCls} value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} /></Label>
            <Button className="col-span-1 mb-0.5" size="sm" variant="danger" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={14} /></Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { kind: 'charge', description: '', quantity: '1', unit_price: '' }])}><Plus size={14} />Add line</Button>
          <b className="text-brand-navy">Total {money(total, sym)}</b>
        </div>
      </div>
      <Label t="Notes (printed on the invoice)" className="mt-3"><textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Label>
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="ghost" busy={act.busy} disabled={!student} onClick={() => save(false)}>Save draft</Button>
          <Button busy={act.busy} disabled={!student} onClick={() => save(true)}><Send size={14} />Issue and send</Button></div></div>
    </Modal>
  )
}

function InvoiceModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const sym = useCurrency()
  const doc = useLoad(() => rpc<any>('invoice_document', { p_invoice: id }), [id])
  const methods = useLoad(() => q<any[]>(supabase.from('payment_methods').select('code, name, requires_reference').eq('is_active', true).order('sort_order')), [])
  const [modal, setModal] = useState<string | null>(null)
  const [pay, setPay] = useState({ amount: '', method: 'bank_transfer', ref: '', date: todayMY(), remarks: '' })
  const [adj, setAdj] = useState({ kind: 'credit_note', amount: '', reason: '' })
  const [due, setDue] = useState('')
  const act = useAction()
  const reload = () => { doc.reload(); onChanged() }
  if (doc.loading && !doc.data) return <Modal title="Invoice" onClose={onClose}><Loading /></Modal>
  if (doc.error) return <Modal title="Invoice" onClose={onClose}><Alert msg={doc.error} /></Modal>
  const d = doc.data
  const inv = d.invoice
  const open = ['unpaid', 'partial'].includes(inv.status)

  return (
    <Modal title={`${inv.invoice_no ?? 'Draft invoice'} · ${d.bill_to?.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Badge v={d.is_overdue ? 'overdue' : inv.status} /><span className="text-sm text-slate-500">{inv.description} · due {fmtDate(inv.due_date)}{inv.last_sent_at ? ` · last sent ${fmtDate(inv.last_sent_at)}` : ''}</span></div>
        <Table head={['Description', 'Qty', 'Price', 'Amount']}>
          {d.items.map((it: any, i: number) => <tr key={i}><Td>{it.description} <span className="text-xs text-slate-400">{label(it.kind)}</span></Td><Td>{Number(it.quantity)}</Td><Td>{money(it.unit_price, sym)}</Td><Td>{money(it.amount, sym)}</Td></tr>)}
        </Table>
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal, sym)}</span></div>
          {Number(inv.discount_total) > 0 && <div className="flex justify-between"><span>Discounts</span><span>− {money(inv.discount_total, sym)}</span></div>}
          {d.adjustments.map((a: any, i: number) => <div key={i} className="flex justify-between text-slate-500"><span>{label(a.kind)}: {a.reason}</span><span>{money(a.amount, sym)}</span></div>)}
          <div className="flex justify-between font-bold"><span>Total</span><span>{money(d.amount_due, sym)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{money(d.amount_paid, sym)}</span></div>
          <div className="flex justify-between font-bold text-brand-pink"><span>Balance</span><span>{money(d.balance, sym)}</span></div>
        </div>
        {d.payments.length > 0 && <p className="text-xs text-slate-500">Payments: {d.payments.map((p: any) => `${fmtDate(p.paid_on)} ${money(p.amount, sym)} (${p.receipt_no})`).join(' · ')}</p>}
        {inv.status === 'void' && <Alert tone="info" msg={`Void: ${inv.void_reason}`} />}
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => invoicePdf(d)}><FileDown size={16} />PDF</Button>
          {inv.status === 'draft' && <>
            <Button variant="danger" onClick={() => setModal('discard')}>Discard draft</Button>
            <Button variant="ghost" onClick={() => setModal('edit')}>Edit</Button>
            <Button busy={act.busy} onClick={() => act.run(async () => { await rpc('issue_invoice', { p_invoice: id }); reload() }, 'Issued and queued for sending.')}><Send size={14} />Issue and send</Button></>}
          {inv.status !== 'draft' && inv.status !== 'void' && <Button variant="ghost" busy={act.busy} onClick={() => act.run(async () => { await rpc('resend_document', { p_type: 'invoice', p_id: id }); reload() }, 'Invoice re-sent.')}><Send size={14} />Resend</Button>}
          {open && <>
            <Button variant="ghost" onClick={() => setModal('due')}>Change due date</Button>
            <Button variant="ghost" onClick={() => setModal('adjust')}>Adjustment</Button>
            <Button variant="success" onClick={() => { setPay({ ...pay, amount: String(d.balance) }); setModal('pay') }}>Record payment</Button></>}
          {inv.status === 'paid' && <Button variant="ghost" onClick={() => setModal('adjust')}>Adjustment</Button>}
          {inv.status !== 'draft' && inv.status !== 'void' && <Button variant="danger" onClick={() => setModal('void')}>Void</Button>}
        </div>
      </div>
      {modal === 'pay' && (
        <Modal title="Record a payment" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Label t="Amount"><input type="number" step="0.01" className={inputCls} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Label>
              <Label t="Paid on"><input type="date" className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Label>
              <Label t="Method"><Select value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={(methods.data ?? []).map((m) => [m.code, m.name])} /></Label>
              <Label t="Transaction reference"><input className={inputCls} value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} /></Label>
            </div>
            <Label t="Remarks"><input className={inputCls} value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} /></Label>
            <p className="text-xs text-slate-500">The payment is confirmed immediately and a receipt is generated and sent.</p>
            <Alert msg={act.error} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button busy={act.busy} onClick={() => act.run(async () => {
                await rpc('record_payment', { p_invoice: id, p_amount: Number(pay.amount), p_method: pay.method, p_ref: pay.ref || null, p_paid_on: pay.date, p_remarks: pay.remarks || null })
                setModal(null); reload()
              }, 'Payment recorded and receipt generated.')}>Confirm payment</Button></div>
          </div>
        </Modal>
      )}
      {modal === 'adjust' && (
        <Modal title="Add an adjustment" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Label t="Type"><Select value={adj.kind} onChange={(v) => setAdj({ ...adj, kind: v })} options={[['credit_note', 'Credit note (reduce)'], ['debit_note', 'Debit note (increase)'], ['write_off', 'Write-off (reduce)']]} /></Label>
            <Label t="Amount"><input type="number" step="0.01" min={0} className={inputCls} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Label>
            <Label t="Reason *"><input className={inputCls} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Label>
            <Alert msg={act.error} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button busy={act.busy} disabled={!adj.amount || !adj.reason.trim()} onClick={() => act.run(async () => {
                await rpc('add_invoice_adjustment', { p_invoice: id, p_amount: Number(adj.amount), p_reason: adj.reason, p_kind: adj.kind }); setModal(null); reload()
              })}>Save</Button></div>
          </div>
        </Modal>
      )}
      {modal === 'due' && (
        <Modal title="Change due date" onClose={() => setModal(null)}>
          <input type="date" className={inputCls} value={due || inv.due_date} onChange={(e) => setDue(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button busy={act.busy} onClick={() => act.run(async () => { await rpc('set_invoice_due_date', { p_invoice: id, p_due_date: due || inv.due_date }); setModal(null); reload() })}>Save</Button></div>
        </Modal>
      )}
      {modal === 'void' && <ConfirmModal title="Void this invoice?" reason="Reason (kept on record and sent to the student)" danger confirmText="Void invoice"
        message="Voided invoices stay on record and no longer need paying. Refund any confirmed payments first." onClose={() => setModal(null)}
        onConfirm={async (r) => { await rpc('void_invoice', { p_invoice: id, p_reason: r }); reload() }} />}
      {modal === 'discard' && <ConfirmModal title="Discard this draft?" danger confirmText="Discard" message="The draft was never issued, so it is deleted." onClose={() => setModal(null)}
        onConfirm={async () => { await rpc('discard_draft_invoice', { p_invoice: id }); onChanged(); onClose() }} />}
      {modal === 'edit' && <InvoiceForm initial={{ ...inv, items: d.items }} onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />}
    </Modal>
  )
}

function MonthlyRun({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [month, setMonth] = useState(monthMY())
  const [issue, setIssue] = useState(true)
  const [result, setResult] = useState<any>(null)
  const act = useAction()
  return (
    <Modal title="Monthly invoice run" onClose={onClose}>
      <div className="space-y-3 text-sm text-slate-600">
        <p>Creates one invoice per student for {monthLabel(month)}: monthly tuition for active enrolments (with each student's own fee and discount), lessons attended last month in per-lesson classes, and completed one-to-one lessons.</p>
        <p>Safe to run more than once: anything already billed is skipped. It also runs automatically on the billing day.</p>
        <Label t="Month"><input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} /></Label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-pink" checked={issue} onChange={(e) => setIssue(e.target.checked)} />Issue and send immediately (otherwise create drafts to check first)</label>
        <Alert msg={act.error} />
        {result && <Alert ok msg={`${result.invoices_created} invoice(s) with ${result.lines_created} line(s) created${result.issued ? ' and issued' : ' as drafts'}.`} />}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => { setResult(await rpc('generate_monthly_invoices', { p_period: `${month}-01`, p_issue: issue })); onDone() })}>Run</Button></div>
      </div>
    </Modal>
  )
}
