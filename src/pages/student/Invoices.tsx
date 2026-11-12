import { useState } from 'react'
import { CreditCard, FileDown, Printer, Upload } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency, useSettings } from '../../lib/settings'
import { fmtDate, label, money, todayMY } from '../../lib/format'
import { invoicePdf, printReceipt } from '../../lib/pdf'
import { checkFile, EVIDENCE_MAX_BYTES, EVIDENCE_TYPES, safeName, uploadWithProgress } from '../../lib/storage'
import { Alert, Badge, Button, Label, Loaded, Loading, Modal, PageHeader, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

// Students see issued invoices only (drafts stay with the academy). A payment
// sent from here is recorded as pending until an administrator confirms it.
export default function StudentInvoices() {
  const sym = useCurrency()
  const [tab, setTab] = useState<'open' | 'all'>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [params] = useSearchParams()
  const list = useLoad(() => q<any[]>(supabase.from('invoice_overview')
    .select('id, invoice_no, student_id, description, period_start, period_end, status, display_status, amount_due, amount_paid, balance, pending_count, due_date, issued_at')
    .order('issued_at', { ascending: false })), [])
  const shown = (list.data ?? []).filter((i) => tab === 'all' || ['unpaid', 'partial'].includes(i.status))
  return (
    <div>
      <PageHeader title="My invoices" subtitle="Fees for your classes and lessons. Download a PDF or send us your payment details." />
      {params.get('payment') === 'returned' && <div className="mb-4"><Alert tone="info" msg="Thank you. If you completed the online payment, the payment provider will confirm it with us shortly and your receipt will appear under Receipts. Refresh this page in a minute." /></div>}
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[['open', 'To pay'], ['all', 'All invoices']]} /></div>
      <Loaded state={{ ...list, data: list.data && shown }} empty={tab === 'open' ? 'Nothing to pay right now.' : 'No invoices yet.'}>
        {(rows) => (
          <Table head={['Invoice', 'For', 'Due', 'Total', 'Balance', 'Status', '']}>
            {rows.map((i) => (
              <tr key={i.id}>
                <Td className="whitespace-nowrap font-semibold text-brand-navy">{i.invoice_no}<div className="text-xs font-normal text-slate-400">{fmtDate(i.issued_at)}</div></Td>
                <Td className="text-sm">{i.description}{i.period_start && <div className="text-xs text-slate-400">{fmtDate(i.period_start)} – {fmtDate(i.period_end)}</div>}</Td>
                <Td className="whitespace-nowrap">{fmtDate(i.due_date)}</Td>
                <Td>{money(i.amount_due, sym)}</Td>
                <Td className="font-semibold">{money(i.balance, sym)}</Td>
                <Td><Badge v={i.display_status} />{i.pending_count > 0 && <div className="text-xs text-amber-700">Payment being checked</div>}</Td>
                <Td className="text-right"><Button size="sm" variant={['unpaid', 'partial'].includes(i.status) ? 'primary' : 'ghost'} onClick={() => setOpen(i.id)}>{['unpaid', 'partial'].includes(i.status) ? 'View and pay' : 'View'}</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {open && <InvoiceModal id={open} onClose={() => setOpen(null)} onPaid={list.reload} />}
    </div>
  )
}

function InvoiceModal({ id, onClose, onPaid }: { id: string; onClose: () => void; onPaid: () => void }) {
  const sym = useCurrency()
  const doc = useLoad(() => rpc<any>('invoice_document', { p_invoice: id }), [id])
  const [paying, setPaying] = useState(false)
  const online = useSettings().raw['finance.online_payments_enabled'] === true
  const act = useAction()
  const d = doc.data
  const inv = d?.invoice
  const payable = inv && ['unpaid', 'partial'].includes(inv.status) && Number(d.balance) > 0
  return (
    <Modal title={inv ? `Invoice ${inv.invoice_no}` : 'Invoice'} onClose={onClose} wide>
      {doc.loading && !d ? <Loading /> : doc.error ? <Alert msg={doc.error} /> : paying ? (
        <PayForm invoice={inv} balance={Number(d.balance)} onCancel={() => setPaying(false)} onDone={() => { onPaid(); doc.reload(); setPaying(false) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <div><div className="text-slate-500">Issued {fmtDate(inv.issued_at)} · Due {fmtDate(inv.due_date)}</div><div>{inv.description}</div></div>
            <Badge v={d.is_overdue ? 'overdue' : inv.status} />
          </div>
          <Table head={['Description', 'Qty', 'Price', 'Amount']}>
            {d.items.map((it: any, i: number) => <tr key={i}><Td>{it.description}</Td><Td>{Number(it.quantity)}</Td><Td>{money(it.unit_price, sym)}</Td><Td>{money(it.amount, sym)}</Td></tr>)}
          </Table>
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal, sym)}</span></div>
            {Number(inv.discount_total) > 0 && <div className="flex justify-between"><span>Discounts</span><span>− {money(inv.discount_total, sym)}</span></div>}
            {d.adjustments.map((a: any, i: number) => <div key={i} className="flex justify-between text-slate-500"><span>{label(a.kind)}: {a.reason}</span><span>{money(a.amount, sym)}</span></div>)}
            <div className="flex justify-between font-bold"><span>Total</span><span>{money(d.amount_due, sym)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>{money(d.amount_paid, sym)}</span></div>
            <div className="flex justify-between font-bold text-brand-pink"><span>Balance</span><span>{money(d.balance, sym)}</span></div>
          </div>
          {d.payments.length > 0 && (
            <div className="space-y-1.5 rounded-xl bg-brand-cream/40 p-3 text-xs text-slate-600">
              <div className="font-semibold text-brand-navy">Payments received</div>
              {d.payments.map((p: any) => (
                <div key={p.receipt_no} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{fmtDate(p.paid_on)} · {money(p.amount, sym)} · receipt <b>{p.receipt_no}</b></span>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Print receipt"
                    onClick={() => {
                      try {
                        printReceipt({
                          receipt_no: p.receipt_no,
                          paid_on: p.paid_on,
                          amount: p.amount,
                          method: p.method,
                          reference: inv.invoice_no,
                          student_name: d.bill_to?.name,
                          invoice_no: inv.invoice_no,
                          description: inv.description,
                          business_name: d.business?.name,
                          currency: sym,
                        })
                      } catch (e: any) {
                        act.setError(e.message ?? String(e))
                      }
                    }}
                  >
                    <Printer size={14} />Print
                  </Button>
                </div>
              ))}
            </div>
          )}
          {inv.status === 'void' && <Alert tone="info" msg={`This invoice was cancelled: ${inv.void_reason}`} />}
          {payable && <PaymentInstructions text={inv.payment_instructions} reference={inv.invoice_no} />}
          <Alert msg={act.error} />
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button variant="ghost" busy={act.busy} onClick={() => act.run(() => invoicePdf(d))}><FileDown size={16} />Download PDF</Button>
            {d.payments.length > 0 && (
              <Button
                variant="ghost"
                title="Print latest receipt"
                onClick={() => {
                  const p = d.payments[d.payments.length - 1]
                  try {
                    printReceipt({
                      receipt_no: p.receipt_no,
                      paid_on: p.paid_on,
                      amount: p.amount,
                      method: p.method,
                      reference: inv.invoice_no,
                      student_name: d.bill_to?.name,
                      invoice_no: inv.invoice_no,
                      description: inv.description,
                      business_name: d.business?.name,
                      currency: sym,
                    })
                  } catch (e: any) {
                    act.setError(e.message ?? String(e))
                  }
                }}
              >
                <Printer size={16} />Print receipt
              </Button>
            )}
            {payable && online && <Button variant="secondary" busy={act.busy} onClick={() => act.run(async () => {
              const { url } = await callFunction<{ url: string }>('create-payment-link', { invoice_id: inv.id })
              window.location.assign(url)
            })}><CreditCard size={16} />Pay online</Button>}
            {payable && <Button onClick={() => setPaying(true)}><Upload size={16} />I have paid</Button>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function PaymentInstructions({ text, reference }: { text?: string | null; reference: string }) {
  const s = useSettings()
  const bank = s.get('finance.bank_details')
  return (
    <div className="rounded-xl bg-brand-cream/60 p-3 text-sm">
      <b className="text-brand-navy">How to pay</b>
      <p className="mt-1 whitespace-pre-line text-slate-700">{text || s.get('finance.payment_instructions')}</p>
      {bank && <p className="mt-1 whitespace-pre-line font-medium text-slate-800">{bank}</p>}
      <p className="mt-1 text-slate-600">Use <b>{reference}</b> as the payment reference.</p>
    </div>
  )
}

function PayForm({ invoice, balance, onCancel, onDone }: { invoice: any; balance: number; onCancel: () => void; onDone: () => void }) {
  const s = useSettings()
  const allowed = s.raw['finance.allow_payment_evidence'] !== false
  const methods = useLoad(() => q<any[]>(supabase.from('payment_methods').select('code, name, instructions, requires_reference').eq('is_active', true).order('sort_order')), [])
  const options = (methods.data ?? []).filter((m) => !['cash', 'online_gateway'].includes(m.code))
  const [f, setF] = useState({ amount: String(balance), method: 'bank_transfer', reference: '', paid_on: todayMY(), remarks: '' })
  const [file, setFile] = useState<File | null>(null)
  const [pct, setPct] = useState(0)
  const act = useAction()
  const method = options.find((m) => m.code === f.method)
  if (!allowed) return <div className="space-y-3"><Alert tone="info" msg="We are not accepting payment slips online at the moment. Please contact the academy to confirm your payment." /><Button variant="ghost" onClick={onCancel}>Back</Button></div>
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Tell us about the payment you made for <b>{invoice.invoice_no}</b>. We will check it against our bank records and send your receipt once it is confirmed.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Amount paid"><input type="number" min={0.01} max={balance} step="0.01" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Label>
        <Label t="Date paid"><input type="date" max={todayMY()} className={inputCls} value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Label>
        <Label t="How you paid"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={options.map((m) => [m.code, m.name])} /></Label>
        <Label t={method?.requires_reference ? 'Transaction reference' : 'Reference (optional)'}><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="From your bank or DuitNow receipt" /></Label>
      </div>
      {method?.instructions && <p className="text-xs text-slate-500">{method.instructions}</p>}
      <Label t="Payment slip or screenshot" hint="JPG, PNG, WebP or PDF up to 10 MB. Only you and the academy can see it.">
        <input type="file" accept={EVIDENCE_TYPES.join(',')} className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Label>
      <Label t="Message (optional)"><textarea rows={2} className={inputCls} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Label>
      {act.busy && pct > 0 && pct < 100 && <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-brand-pink" style={{ width: `${pct}%` }} /></div>}
      <Alert msg={act.error} /><Alert ok msg={act.ok} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Back</Button>
        <Button busy={act.busy} onClick={() => act.run(async () => {
          const amount = Number(f.amount)
          if (!(amount > 0)) throw new Error('Enter the amount you paid.')
          if (amount > balance) throw new Error('The amount is more than the balance of this invoice.')
          if (method?.requires_reference && !f.reference.trim()) throw new Error('Please enter the transaction reference.')
          let path: string | null = null
          if (file) {
            const problem = checkFile(file, EVIDENCE_TYPES, EVIDENCE_MAX_BYTES)
            if (problem) throw new Error(problem)
            path = `${invoice.student_id}/${invoice.id}/${Date.now()}-${safeName(file.name)}`
            await uploadWithProgress('payment-evidence', path, file, setPct)
          }
          await rpc('submit_payment', { p_invoice: invoice.id, p_amount: amount, p_method: f.method, p_ref: f.reference || null, p_paid_on: f.paid_on,
            p_evidence_path: path, p_remarks: f.remarks || null })
          onDone()
        }, 'Thank you. Your payment is waiting for confirmation.')}>Send to the academy</Button>
      </div>
    </div>
  )
}
