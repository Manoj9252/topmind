import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { q, useLoad } from '../../lib/api'
import { fmtDateTime, label } from '../../lib/format'
import { Badge, Button, Card, Loaded, PageHeader, Select, inputCls } from '../../components/ui'

const TABLES = ['students', 'enrolments', 'classes', 'class_schedules', 'sessions', 'attendance', 'registrations', 'invoices', 'invoice_items', 'invoice_adjustments',
  'payments', 'teacher_payouts', 'teacher_payout_payments', 'teacher_rates', 'profiles', 'materials', 'bookings', 'app_settings', 'message_templates', 'payment_methods', 'checklists']

// Who changed what, and when. Append-only: nobody can edit or delete entries.
export default function AuditLog() {
  const [search, setSearch] = useState('')
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')
  const [date, setDate] = useState('')
  const [limit, setLimit] = useState(100)
  const [open, setOpen] = useState<number | null>(null)
  const logs = useLoad(async () => {
    let query: any = supabase.from('audit_logs').select('*').order('occurred_at', { ascending: false }).limit(limit)
    if (table) query = query.eq('table_name', table)
    if (action) query = query.eq('action', action)
    if (date) query = query.gte('occurred_at', `${date}T00:00:00+08:00`).lt('occurred_at', `${date}T23:59:59+08:00`)
    const rows = await q<any[]>(query)
    const actors = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)))
    const people = actors.length ? await q<any[]>(supabase.from('profiles').select('id, full_name, email').in('id', actors)) : []
    return rows.map((r) => ({ ...r, actor: people.find((p) => p.id === r.actor_id) }))
  }, [table, action, date, limit])

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change to important records, with who made it. Entries cannot be edited or deleted." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search record ID or field" aria-label="Search audit history" />
        <Select className="!w-auto" value={table} onChange={setTable} placeholder="All records" options={TABLES} />
        <Select className="!w-auto" value={action} onChange={setAction} placeholder="All actions" options={['insert', 'update', 'delete']} />
        <input type="date" className={inputCls + ' !w-auto'} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </div>
      <Loaded state={{...logs, data: logs.data?.filter((r) => !search || `${r.record_id} ${r.table_name} ${r.changed_fields?.join(' ') ?? ''} ${r.actor?.full_name ?? ''}`.toLowerCase().includes(search.toLowerCase())) ?? null}} empty="No changes recorded for this filter.">
        {(rows) => (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id} className="!p-3">
                <button className="w-full text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><Badge v={r.action === 'delete' ? 'failed' : r.action === 'insert' ? 'active' : 'scheduled'} text={label(r.action)} /> <b className="text-brand-navy">{label(r.table_name)}</b>
                      {r.changed_fields && <span className="text-slate-500"> · {r.changed_fields.map(label).join(', ')}</span>}</span>
                    <span className="text-xs text-slate-500">{r.actor?.full_name ?? r.actor?.email ?? label(r.actor_role) ?? 'System'} · {fmtDateTime(r.occurred_at, { tz: false })}</span>
                  </div>
                </button>
                {open === r.id && (
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    {(r.changed_fields ?? Object.keys(r.new_data ?? r.old_data ?? {})).slice(0, 40).map((k: string) => (
                      <div key={k} className="rounded-lg bg-brand-cream/50 p-2"><b>{label(k)}</b>
                        <div className="text-slate-500">{r.old_data && `Before: ${JSON.stringify(r.old_data[k])}`}</div>
                        <div className="text-slate-700">{r.new_data && `After: ${JSON.stringify(r.new_data[k])}`}</div></div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
            {rows.length >= limit && <Button variant="ghost" onClick={() => setLimit(limit + 200)}>Load more</Button>}
          </div>
        )}
      </Loaded>
    </div>
  )
}
