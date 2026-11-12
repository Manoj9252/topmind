import { FileDown, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { fmtDate, label, money } from '../../lib/format'
import { printReceipt, receiptPdf } from '../../lib/pdf'
import { Alert, Badge, Button, Loaded, PageHeader, Table, Td } from '../../components/ui'

// Official receipts exist only for payments the academy has confirmed.
export default function StudentReceipts() {
  const sym = useCurrency()
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('payments')
    .select('id, receipt_no, receipt_issued_at, amount, method, reference, paid_on, status, students(full_name), invoices(invoice_no, description)')
    .not('receipt_no', 'is', null).order('receipt_issued_at', { ascending: false })), [])
  return (
    <div>
      <PageHeader title="My receipts" subtitle="Official receipts for confirmed payments." />
      <div className="mb-3"><Alert msg={act.error} /></div>
      <Loaded state={list} empty="No receipts yet. A receipt is issued when the academy confirms your payment.">
        {(rows) => (
          <Table head={['Receipt', 'Paid on', 'For', 'Amount', '', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap font-semibold text-brand-navy">{r.receipt_no}<div className="text-xs font-normal text-slate-400">Issued {fmtDate(r.receipt_issued_at)}</div></Td>
                <Td className="whitespace-nowrap">{fmtDate(r.paid_on)} <span className="text-xs text-slate-400">{label(r.method)}</span></Td>
                <Td className="text-sm">{r.invoices?.invoice_no}<div className="text-xs text-slate-400">{r.invoices?.description}</div></Td>
                <Td className="font-semibold">{money(r.amount, sym)}</Td>
                <Td>{r.status === 'refunded' && <Badge v="refunded" />}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" busy={act.busy} onClick={() => act.run(async () => receiptPdf(await rpc('receipt_document', { p_payment: r.id })))}><FileDown size={14} />PDF</Button>
                  <Button size="sm" variant="ghost" title="Print receipt" onClick={() => { try { printReceipt({ ...r, currency: sym }) } catch (e: any) { act.setError(e.message ?? String(e)) } }}><Printer size={14} />Print</Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
    </div>
  )
}
