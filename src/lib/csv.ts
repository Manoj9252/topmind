// CSV export. The byte-order mark makes Excel open UTF-8 (e.g. Tamil names) correctly.
export function downloadCsv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s }, new Set<string>()))
  const esc = (v: unknown) => {
    const text = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
