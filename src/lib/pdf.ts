// Invoice, receipt and report PDFs, drawn from the documents the database
// returns (invoice_document / receipt_document). jsPDF loads only when needed.
import { fmtDate, label, money } from './format'
import { LOGO_URL } from './util'

const NAVY: [number, number, number] = [11, 31, 92]
const PINK: [number, number, number] = [232, 77, 138]
const GREY: [number, number, number] = [110, 110, 120]

async function newDoc() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format: 'a4' })
}

async function logoData(): Promise<string | null> {
  try {
    const blob = await (await fetch(LOGO_URL)).blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function header(doc: any, title: string, number: string, business: any) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, 210, 34, 'F')
  const logo = await logoData()
  if (logo) doc.addImage(logo, 'JPEG', 14, 6, 22, 22)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(15).text(business?.name ?? 'Top Mind Enterprise', logo ? 40 : 14, 15)
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  const contact = [business?.email, business?.phone, business?.address, business?.registration_no && `Reg. ${business.registration_no}`]
    .filter(Boolean).join('  ·  ')
  doc.text(contact, logo ? 40 : 14, 22, { maxWidth: 110 })
  doc.setFont('helvetica', 'bold').setFontSize(16).text(title, 196, 15, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(10).text(number ?? '', 196, 22, { align: 'right' })
  doc.setTextColor(...NAVY)
}

function table(doc: any, y: number, head: string[], rows: string[][], widths: number[]) {
  const x0 = 14
  doc.setFillColor(248, 243, 238)
  doc.rect(x0, y - 5, 182, 8, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  let x = x0 + 2
  head.forEach((h, i) => { doc.text(h, i === head.length - 1 ? x0 + 180 : x, y, i === head.length - 1 ? { align: 'right' } : {}); x += widths[i] })
  doc.setFont('helvetica', 'normal')
  y += 8
  for (const r of rows) {
    x = x0 + 2
    const lines = doc.splitTextToSize(r[0], widths[0] - 4)
    r.forEach((c, i) => {
      if (i === 0) doc.text(lines, x, y)
      else doc.text(c, i === r.length - 1 ? x0 + 180 : x, y, i === r.length - 1 ? { align: 'right' } : {})
      x += widths[i]
    })
    y += 5 * lines.length + 2
    doc.setDrawColor(238, 231, 222).line(x0, y - 4, x0 + 182, y - 4)
  }
  return y
}

function totalsRow(doc: any, y: number, text: string, value: string, bold = false) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5)
  doc.text(text, 150, y, { align: 'right' })
  doc.text(value, 194, y, { align: 'right' })
  return y + (bold ? 7 : 5.5)
}

export async function invoicePdf(d: any) {
  const doc = await newDoc()
  const inv = d.invoice
  const sym = d.business?.currency_symbol ?? 'RM'
  await header(doc, 'INVOICE', inv.invoice_no ?? 'DRAFT', d.business)
  doc.setFontSize(9).setFont('helvetica', 'bold').text('Bill to', 14, 46)
  doc.setFont('helvetica', 'normal')
  doc.text([d.bill_to?.name ?? '', d.bill_to?.student_code ? `Student ID: ${d.bill_to.student_code}` : '', d.bill_to?.email ?? '', d.bill_to?.phone ?? '']
    .filter(Boolean), 14, 51)
  const meta: [string, string][] = [
    ['Invoice date', fmtDate(inv.issued_at ?? inv.created_at)], ['Due date', fmtDate(inv.due_date)],
    ['Billing period', inv.period_start ? `${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}` : '—'], ['Status', d.is_overdue ? 'Overdue' : label(inv.status)],
  ]
  meta.forEach(([k, v], i) => { doc.setFont('helvetica', 'bold').text(k, 120, 46 + i * 5.5); doc.setFont('helvetica', 'normal').text(v, 196, 46 + i * 5.5, { align: 'right' }) })
  let y = table(doc, 76, ['Description', 'Qty', 'Unit price', 'Amount'],
    d.items.map((it: any) => [it.description, String(Number(it.quantity)), money(it.unit_price, sym), money(it.amount, sym)]), [110, 18, 30, 24])
  y += 2
  y = totalsRow(doc, y, 'Subtotal', money(inv.subtotal, sym))
  if (Number(inv.discount_total) > 0) y = totalsRow(doc, y, 'Discounts', `- ${money(inv.discount_total, sym)}`)
  for (const a of d.adjustments ?? []) y = totalsRow(doc, y, `${label(a.kind)}: ${a.reason}`.slice(0, 60), money(a.amount, sym))
  y = totalsRow(doc, y, 'Total', money(d.amount_due, sym), true)
  y = totalsRow(doc, y, 'Paid', money(d.amount_paid, sym))
  doc.setTextColor(...PINK)
  y = totalsRow(doc, y, 'Balance due', money(d.balance, sym), true)
  doc.setTextColor(...NAVY)
  if (inv.payment_instructions) {
    y += 4
    doc.setFont('helvetica', 'bold').setFontSize(9.5).text('How to pay', 14, y)
    doc.setFont('helvetica', 'normal').setFontSize(9).text(doc.splitTextToSize(inv.payment_instructions, 182), 14, y + 5)
  }
  footer(doc, 'Thank you for learning with us.')
  doc.save(`${inv.invoice_no ?? 'invoice'}.pdf`)
}

export async function receiptPdf(d: any) {
  const doc = await newDoc()
  const sym = d.business?.currency_symbol ?? 'RM'
  await header(doc, 'RECEIPT', d.receipt_no, d.business)
  const rows: [string, string][] = [
    ['Received from', `${d.student?.name ?? ''}${d.student?.student_code ? ` (${d.student.student_code})` : ''}`],
    ['Receipt date', fmtDate(d.issued_at)], ['Payment date', fmtDate(d.paid_on)], ['Payment method', d.method ?? ''],
    ['Transaction reference', d.reference ?? '—'], ['Invoice', d.invoice_no ?? ''], ['For', [d.invoice_description, d.classes].filter(Boolean).join(' · ')],
    ['Billing period', d.period_start ? `${fmtDate(d.period_start)} – ${fmtDate(d.period_end)}` : '—'],
  ]
  let y = 48
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold').setFontSize(9.5).text(k, 14, y)
    doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(v || '—', 120), 70, y)
    y += 7
  }
  doc.setFillColor(248, 243, 238).rect(14, y, 182, 20, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).text('Amount received', 20, y + 12)
  doc.setFontSize(16).setTextColor(...PINK).text(money(d.amount, sym), 190, y + 13, { align: 'right' })
  doc.setTextColor(...NAVY).setFontSize(9.5).setFont('helvetica', 'normal')
  doc.text(`Remaining balance on the invoice: ${money(d.balance_after, sym)}`, 14, y + 30)
  if (d.status === 'refunded') {
    doc.setTextColor(...PINK).setFont('helvetica', 'bold').text(`REFUNDED on ${fmtDate(d.refunded_at)}`, 14, y + 37)
    doc.setTextColor(...NAVY)
  }
  footer(doc, 'This receipt was generated electronically and is valid without a signature.')
  doc.save(`${d.receipt_no}.pdf`)
}

// Any report table as a PDF (landscape when wide).
export async function reportPdf(title: string, subtitle: string, rows: Record<string, unknown>[]) {
  const { jsPDF } = await import('jspdf')
  const cols = rows.length ? Object.keys(rows[0]) : []
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: cols.length > 6 ? 'landscape' : 'portrait' })
  const width = doc.internal.pageSize.getWidth()
  doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(14).text(title, 14, 16)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GREY).text(subtitle, 14, 22)
  doc.setTextColor(...NAVY)
  const colW = (width - 28) / Math.max(cols.length, 1)
  let y = 32
  const drawHead = () => {
    doc.setFillColor(248, 243, 238).rect(14, y - 5, width - 28, 7, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(7.5)
    cols.forEach((c, i) => doc.text(label(c).slice(0, 22), 15 + i * colW, y))
    doc.setFont('helvetica', 'normal')
    y += 6
  }
  drawHead()
  for (const r of rows) {
    if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 18; drawHead() }
    cols.forEach((c, i) => doc.text(String(r[c] ?? '').slice(0, Math.floor(colW / 1.6)), 15 + i * colW, y))
    y += 5
  }
  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}

function footer(doc: any, text: string) {
  doc.setFontSize(8).setTextColor(...GREY).text(text, 105, 285, { align: 'center' })
  doc.setTextColor(...NAVY)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Instant in-browser receipt popup styled for both 80mm thermal POS and A4 print.
export function printReceipt(receiptData: any) {
  const sym = receiptData?.currency ?? receiptData?.sym ?? 'RM'
  const receiptNo = receiptData?.receipt_no || receiptData?.receiptNo || '—'
  const paidOn = receiptData?.paid_on ? fmtDate(receiptData.paid_on) : '—'
  const amount = money(receiptData?.amount ?? 0, sym)
  const method = receiptData?.method ? label(receiptData.method) : '—'
  const reference = receiptData?.reference || '—'
  const studentName =
    receiptData?.student_name ||
    receiptData?.students?.full_name ||
    receiptData?.student?.full_name ||
    '—'
  const invoiceNo =
    receiptData?.invoice_no ||
    receiptData?.invoices?.invoice_no ||
    receiptData?.invoice?.invoice_no ||
    ''
  const description =
    receiptData?.description ||
    receiptData?.invoices?.description ||
    receiptData?.invoice?.description ||
    'Tuition / Course Fee Payment'
  const businessName = receiptData?.business_name || 'Top Mind Enterprise'

  const w = window.open('', '_blank')
  if (!w) {
    throw new Error('Pop-up blocked. Please allow pop-ups in your browser to print this receipt.')
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receiptNo)}</title>
  <style>
    @page { size: auto; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0b1f5c;
      background: #f8f3ee;
    }
    .receipt {
      width: 100%;
      max-width: 80mm;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2ddd6;
      border-radius: 10px;
      padding: 16px;
    }
    .brand { text-align: center; border-bottom: 2px dashed #e2ddd6; padding-bottom: 12px; margin-bottom: 12px; }
    .brand-name { font-size: 16px; font-weight: 800; letter-spacing: 0.02em; color: #0b1f5c; }
    .tag { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px; background: #e84d8a; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .rows { width: 100%; border-collapse: collapse; font-size: 12px; }
    .rows td { padding: 4px 0; vertical-align: top; }
    .rows td.k { color: #64748b; width: 40%; }
    .rows td.v { text-align: right; font-weight: 600; color: #0f172a; word-break: break-word; }
    .desc { margin: 12px 0; padding: 10px; background: #f8f3ee; border-radius: 8px; font-size: 12px; }
    .desc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .total { border-top: 2px dashed #e2ddd6; border-bottom: 2px dashed #e2ddd6; padding: 10px 0; margin: 12px 0; display: flex; justify-content: space-between; align-items: baseline; }
    .total-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0b1f5c; }
    .total-amount { font-size: 18px; font-weight: 800; color: #e84d8a; }
    .foot { text-align: center; font-size: 11px; color: #64748b; line-height: 1.4; }
    @media print {
      body { background: #fff; padding: 0; }
      .receipt { border: none; border-radius: 0; max-width: 100%; width: 76mm; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="brand">
      <div class="brand-name">${escapeHtml(businessName)}</div>
      <div class="tag">Official Receipt</div>
    </div>
    <table class="rows">
      <tr><td class="k">Receipt No</td><td class="v">${escapeHtml(receiptNo)}</td></tr>
      <tr><td class="k">Paid On</td><td class="v">${escapeHtml(paidOn)}</td></tr>
      <tr><td class="k">Student</td><td class="v">${escapeHtml(studentName)}</td></tr>
      ${invoiceNo ? `<tr><td class="k">Invoice</td><td class="v">${escapeHtml(invoiceNo)}</td></tr>` : ''}
      <tr><td class="k">Method</td><td class="v">${escapeHtml(method)}</td></tr>
      <tr><td class="k">Reference</td><td class="v">${escapeHtml(reference)}</td></tr>
    </table>
    <div class="desc">
      <div class="desc-label">Payment For</div>
      <div>${escapeHtml(description)}</div>
    </div>
    <div class="total">
      <span class="total-label">Amount Paid</span>
      <span class="total-amount">${escapeHtml(amount)}</span>
    </div>
    <div class="foot">
      Thank you for learning with ${escapeHtml(businessName)}.<br />
      Printed on ${escapeHtml(fmtDate(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`

  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}
