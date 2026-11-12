import { Eye, FileDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { fmtDate, label, money } from '../../lib/format'
import { receiptPdf } from '../../lib/pdf'
import { openPrivateFile } from '../../lib/storage'
import { Alert, Badge, Button, Loaded, PageHeader, Table, Td } from '../../components/ui'

const STATUS_TEXT: Record<string, string> = { pending: 'Being checked', confirmed: 'Confirmed', rejected: 'Not accepted', refunded: 'Refunded' }

export default function StudentPayments() {
  const sym = useCurrency()
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('payments')
    .select('id, amount, method, reference, paid_on, status, receipt_no, rejected_reason, refund_reason, evidence_path, created_at, invoices(invoice_no)')
    .order('created_at', { ascending: false })), [])
  return (
    <div>
      <PageHeader title="My payments" subtitle="Payments you have sent and their status. Receipts are issued once the academy confirms a payment." />
      <div className="mb-3"><Alert msg={act.error} /></div>
      <Loaded state={list} empty="No payments yet.">
        {(rows) => (
          <Table head={['Paid on', 'Invoice', 'Amount', 'Method', 'Status', '']}>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{fmtDate(p.paid_on)}</Td>
                <Td>{p.invoices?.invoice_no}</Td>
                <Td className="font-semibold">{money(p.amount, sym)}</Td>
                <Td>{label(p.method)}{p.reference && <div className="text-xs text-slate-400">{p.reference}</div>}</Td>
                <Td><Badge v={p.status} text={STATUS_TEXT[p.status]} />
                  {p.status === 'rejected' && p.rejected_reason && <div className="max-w-xs text-xs text-rose-600">{p.rejected_reason}</div>}
                  {p.status === 'refunded' && p.refund_reason && <div className="max-w-xs text-xs text-slate-500">{p.refund_reason}</div>}</Td>
                <Td className="whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1">
                    {p.evidence_path && <Button size="sm" variant="ghost" onClick={() => act.run(() => openPrivateFile('payment-evidence', p.evidence_path))}><Eye size={14} />Slip</Button>}
                    {p.receipt_no && <Button size="sm" variant="ghost" onClick={() => act.run(async () => receiptPdf(await rpc('receipt_document', { p_payment: p.id })))}><FileDown size={14} />Receipt</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
    </div>
  )
}
