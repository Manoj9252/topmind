import { useMemo, useState } from 'react'
import { Download, FileDown, Printer, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useCurrency } from '../../lib/settings'
import { downloadCsv } from '../../lib/csv'
import { printReceipt, receiptPdf } from '../../lib/pdf'
import { fmtDate, label, money } from '../../lib/format'
import { Alert, Badge, Button, Loaded, PageHeader, SearchBox, Table, Td, inputCls } from '../../components/ui'

export default function Receipts() {
  const sym = useCurrency()
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const act = useAction()
  const list = useLoad(async () => {
    const rows = await q<any[]>(supabase.from('payments').select('id, receipt_no, receipt_issued_at, paid_on, amount, method, reference, status, students(full_name, student_code), invoices(invoice_no, description)')
      .not('receipt_no', 'is', null).order('receipt_issued_at', { ascending: false }).limit(1000))
    const ids = rows.map((r) => r.id)
    const msgs = ids.length ? await q<any[]>(supabase.from('message_outbox').select('related_id, channel, status, created_at').eq('related_type', 'payment').eq('template_key', 'payment_confirmed').in('related_id', ids)) : []
    const latest = (id: string, ch: string) => msgs.filter((m) => m.related_id === id && m.channel === ch).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.status
    return rows.map((r) => ({ ...r, email: latest(r.id, 'email'), whatsapp: latest(r.id, 'whatsapp') }))
  }, [])
  const shown = useMemo(() => (list.data ?? []).filter((r) => (!from || r.paid_on >= from) && (!to || r.paid_on <= to)
    && (!search || `${r.receipt_no} ${r.students?.full_name} ${r.invoices?.invoice_no}`.toLowerCase().includes(search.toLowerCase()))), [list.data, search, from, to])

  return (
    <div>
      <PageHeader title="Receipts" subtitle="One receipt per confirmed payment, generated automatically.">
        <SearchBox value={search} onChange={setSearch} placeholder="Receipt, student or invoice" />
        <input type="date" className={inputCls + ' !w-auto'} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input type="date" className={inputCls + ' !w-auto'} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <Button variant="ghost" disabled={!shown.length} onClick={() => downloadCsv(shown.map((r) => ({
          receipt: r.receipt_no, issued: r.receipt_issued_at?.slice(0, 10), paid_on: r.paid_on, student: r.students?.full_name, invoice: r.invoices?.invoice_no,
          amount: r.amount, method: r.method, status: r.status, email: r.email ?? '', whatsapp: r.whatsapp ?? '',
        })), 'receipts')}><Download size={16} />CSV</Button>
      </PageHeader>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No receipts yet.">
        {(rows) => (
          <Table head={['Receipt', 'Paid on', 'Student', 'Invoice', 'Amount', 'Method', 'Email', 'WhatsApp', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap font-semibold text-brand-navy">{r.receipt_no}{r.status === 'refunded' && <Badge v="refunded" />}</Td>
                <Td>{fmtDate(r.paid_on)}</Td><Td>{r.students?.full_name}</Td><Td className="text-xs">{r.invoices?.invoice_no}</Td>
                <Td>{money(r.amount, sym)}</Td><Td>{label(r.method)}</Td>
                <Td>{r.email ? <Badge v={r.email} /> : '—'}</Td><Td>{r.whatsapp ? <Badge v={r.whatsapp} /> : '—'}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => act.run(async () => receiptPdf(await rpc('receipt_document', { p_payment: r.id })))}><FileDown size={14} />PDF</Button>
                  <Button size="sm" variant="ghost" title="Print receipt" onClick={() => { try { printReceipt({ ...r, currency: sym }) } catch (e: any) { act.setError(e.message ?? String(e)) } }}><Printer size={14} />Print</Button>
                  <Button size="sm" variant="ghost" onClick={() => act.run(async () => { await rpc('resend_document', { p_type: 'receipt', p_id: r.id }); list.reload() }, 'Receipt re-sent.')}><Send size={14} />Resend</Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
    </div>
  )
}
