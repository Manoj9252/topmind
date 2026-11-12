import { useMemo, useState } from 'react'
import { Download, Eye, FileDown, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import { printReceipt, receiptPdf } from '../../lib/pdf'
import { openPrivateFile } from '../../lib/storage'
import { fmtDate, fmtDateTime, label, money } from '../../lib/format'
import { Alert, Badge, Button, Card, ConfirmModal, Loaded, PageHeader, SearchBox, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

// Only an administrator (or a verified gateway event) can confirm a payment.
// A student's uploaded slip stays "pending verification" until checked here.
export default function Payments() {
  const sym = useCurrency()
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<any>(null)
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('payments')
    .select('id, amount, method, reference, paid_on, status, receipt_no, remarks, evidence_path, created_at, rejected_reason, refund_reason, gateway, students(full_name, student_code), invoices(id, invoice_no, description)')
    .order('created_at', { ascending: false }).limit(1000)), [])
  const pending = (list.data ?? []).filter((p) => p.status === 'pending')
  const shown = useMemo(() => (list.data ?? []).filter((p) => (!status || p.status === status) && (!method || p.method === method)
    && (!from || p.paid_on >= from) && (!to || p.paid_on <= to)
    && (!search || `${p.students?.full_name} ${p.reference ?? ''} ${p.receipt_no ?? ''} ${p.invoices?.invoice_no ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, method, from, to, search])
  const collected = shown.filter((p) => p.status === 'confirmed').reduce((n, p) => n + Number(p.amount), 0)

  return (
    <div>
      <PageHeader title="Payments" subtitle="Confirm payment slips, and see every payment received.">
        <SearchBox value={search} onChange={setSearch} placeholder="Student, reference or receipt" />
      </PageHeader>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `To confirm (${pending.length})`], ['all', 'All payments']]} />
      {tab === 'pending' && (
        <Loaded state={{ ...list, data: list.data && pending }} empty="No payments waiting for confirmation.">
          {(rows) => (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div><b className="text-brand-navy">{p.students?.full_name}</b><p className="text-xs text-slate-500">{p.invoices?.invoice_no} · {p.invoices?.description}</p></div>
                    <b className="text-lg text-brand-pink">{money(p.amount, sym)}</b>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{label(p.method)} · reference <b>{p.reference ?? '—'}</b> · paid {fmtDate(p.paid_on)}</p>
                  {p.remarks && <p className="text-sm text-slate-500">"{p.remarks}"</p>}
                  <p className="text-xs text-slate-400">Submitted {fmtDateTime(p.created_at, { tz: false })}</p>
                  <p className="mt-2 text-xs text-slate-500">Check that the money has reached the bank account before confirming.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.evidence_path && <Button size="sm" variant="ghost" onClick={() => act.run(() => openPrivateFile('payment-evidence', p.evidence_path))}><Eye size={14} />View slip</Button>}
                    <Button size="sm" variant="success" busy={act.busy} onClick={() => act.run(async () => { await rpc('confirm_payment', { p_payment: p.id }); list.reload() }, 'Payment confirmed. A demo receipt is available; no email was sent.')}>Confirm</Button>
                    <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'reject', p })}>Reject</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Loaded>
      )}
      {tab === 'all' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses" options={['pending', 'confirmed', 'rejected', 'refunded']} />
            <Select className="!w-auto" value={method} onChange={setMethod} placeholder="All methods" options={Array.from(new Set((list.data ?? []).map((p) => p.method)))} />
            <input type="date" className={inputCls + ' !w-auto'} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input type="date" className={inputCls + ' !w-auto'} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            <Button variant="ghost" disabled={!shown.length} onClick={() => downloadCsv(shown.map((p) => ({
              paid_on: p.paid_on, receipt: p.receipt_no, student: p.students?.full_name, student_id: p.students?.student_code, invoice: p.invoices?.invoice_no,
              method: p.method, reference: p.reference, amount: p.amount, status: p.status,
            })), 'payments')}><Download size={16} />CSV</Button>
            <span className="text-sm text-slate-500">Confirmed in view: <b>{money(collected, sym)}</b></span>
          </div>
          <Loaded state={{ ...list, data: list.data && shown }} empty="No payments match.">
            {(rows) => (
              <Table head={['Paid on', 'Student', 'Invoice', 'Method', 'Reference', 'Amount', 'Receipt', 'Status', '']}>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap">{fmtDate(p.paid_on)}</Td><Td>{p.students?.full_name}</Td><Td className="text-xs">{p.invoices?.invoice_no}</Td>
                    <Td>{label(p.method)}{p.gateway && <div className="text-xs text-slate-400">via {p.gateway}</div>}</Td><Td className="text-xs">{p.reference ?? '—'}</Td>
                    <Td>{money(p.amount, sym)}</Td><Td className="text-xs">{p.receipt_no ?? '—'}</Td>
                    <Td><Badge v={p.status} />{(p.rejected_reason || p.refund_reason) && <div className="text-xs text-slate-400">{p.rejected_reason ?? p.refund_reason}</div>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {p.receipt_no && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => act.run(async () => receiptPdf(await rpc('receipt_document', { p_payment: p.id })))}><FileDown size={14} />PDF</Button>
                          <Button size="sm" variant="ghost" title="Print receipt" onClick={() => { try { printReceipt({ ...p, currency: sym }) } catch (e: any) { act.setError(e.message ?? String(e)) } }}><Printer size={14} />Print</Button>
                        </>
                      )}
                      {p.status === 'confirmed' && <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'refund', p })}>Refund</Button>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Loaded>
        </>
      )}
      {modal?.kind === 'reject' && <ConfirmModal title="Reject this payment?" reason="Reason (sent to the student)" danger confirmText="Reject"
        message={`${modal.p.students?.full_name} · ${money(modal.p.amount, sym)} · ${modal.p.reference ?? ''}`} onClose={() => setModal(null)}
        onConfirm={async (r) => { await rpc('reject_payment', { p_payment: modal.p.id, p_reason: r }); list.reload() }} />}
      {modal?.kind === 'refund' && <ConfirmModal title="Record a refund?" reason="Reason" danger confirmText="Record refund"
        message="Record the refund here after returning the money. The invoice balance reopens and the receipt is marked refunded." onClose={() => setModal(null)}
        onConfirm={async (r) => { await rpc('refund_payment', { p_payment: modal.p.id, p_reason: r }); list.reload() }} />}
    </div>
  )
}
