import { useMemo, useState } from 'react'
import { Plus, RefreshCw, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { fmtDate, label, monthLabel, monthMY, todayMY } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Badge, Button, Card, Empty, Label, Loading, Modal, PageHeader, Select, inputCls } from '../../components/ui'

const CATEGORIES = ['students', 'attendance', 'invoicing', 'payments', 'receipts', 'teachers', 'materials', 'reports']

// The monthly operations checklist. Tasks marked "automatic" complete themselves
// from the real records and cannot be ticked off by hand while work is outstanding.
export default function Checklist() {
  const [month, setMonth] = useState(monthMY())
  const [adding, setAdding] = useState(false)
  const act = useAction()
  const staff = useLoad(() => q<any[]>(supabase.from('profiles').select('id, full_name').in('role', ['admin', 'teacher']).eq('status', 'active').order('full_name')), [])
  const items = useLoad(() => q<any[]>(supabase.from('checklists').select('*, assignee_profile:profiles!checklists_assignee_fkey(full_name)')
    .eq('month', `${month}-01`).order('due_date')), [month])
  const grouped = useMemo(() => CATEGORIES.map((c) => [c, (items.data ?? []).filter((i) => (i.category ?? 'students') === c)] as [string, any[]])
    .concat([['other', (items.data ?? []).filter((i) => !CATEGORIES.includes(i.category))]]).filter(([, l]) => l.length), [items.data])
  const done = (items.data ?? []).filter((i) => ['completed', 'not_applicable'].includes(i.status)).length
  const total = items.data?.length ?? 0
  const update = (id: string, patch: Record<string, unknown>) => act.run(async () => { await q(supabase.from('checklists').update(patch).eq('id', id)); items.reload() })

  return (
    <div>
      <PageHeader title="Monthly checklist" subtitle={`${monthLabel(month)}: ${done} of ${total} done`}>
        <input type="month" className={inputCls + ' !w-auto'} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
        <Button variant="ghost" busy={act.busy} onClick={() => act.run(async () => { await rpc('generate_monthly_checklist', { p_month: `${month}-01` }); await rpc('refresh_checklist', { p_month: `${month}-01` }); items.reload() })}>
          <RefreshCw size={16} />{total ? 'Re-check automatic tasks' : 'Create this month\'s checklist'}</Button>
        <Button onClick={() => setAdding(true)}><Plus size={16} />Add task</Button>
      </PageHeader>
      <div className="mb-4 h-2.5 rounded-full bg-brand-cream"><div className="h-2.5 rounded-full bg-brand-pink transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      <Alert msg={act.error} />
      {items.loading && !items.data ? <Loading /> : !total ? <Empty text="No checklist for this month yet." /> : (
        <div className="space-y-6">
          {grouped.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-brand-navy">{label(cat)}</h2>
              <div className="space-y-2">
                {list.map((i) => {
                  const overdue = i.due_date && i.due_date < todayMY() && ['pending', 'in_progress'].includes(i.status)
                  return (
                    <Card key={i.id} className={cx('!p-3', overdue && 'ring-rose-300')}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="text-brand-navy">{i.title}</b>
                            {i.auto_key && <Badge tone="navy" text={<span className="inline-flex items-center gap-1"><Zap size={11} />Automatic</span>} />}
                            {overdue && <Badge v="overdue" />}
                          </div>
                          {i.auto_detail && <p className="text-xs text-slate-500">{i.auto_detail}</p>}
                          <p className="text-xs text-slate-400">Due {fmtDate(i.due_date)}{i.completed_at ? ` · done ${fmtDate(i.completed_at)}` : ''}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select className="!w-40 !py-1.5 text-xs" value={i.assignee ?? ''} placeholder="Unassigned" onChange={(v) => update(i.id, { assignee: v || null })}
                            options={(staff.data ?? []).map((s) => [s.id, s.full_name])} />
                          <Select className="!w-40 !py-1.5 text-xs" value={i.status} onChange={(v) => update(i.id, { status: v })} options={['pending', 'in_progress', 'completed', 'not_applicable']} />
                        </div>
                      </div>
                      <input className={inputCls + ' mt-2 !py-1.5 text-xs'} placeholder="Notes or link to supporting records" defaultValue={i.notes ?? ''}
                        onBlur={(e) => e.target.value !== (i.notes ?? '') && update(i.id, { notes: e.target.value || null })} />
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {adding && <AddTask month={month} onClose={() => setAdding(false)} onDone={() => { setAdding(false); items.reload() }} />}
    </div>
  )
}

function AddTask({ month, onClose, onDone }: { month: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: '', category: 'students', due_date: `${month}-28` })
  const act = useAction()
  return (
    <Modal title="Add a task" onClose={onClose}>
      <div className="space-y-3">
        <Label t="Task *"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Label>
        <Label t="Category"><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATEGORIES} /></Label>
        <Label t="Due date"><input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.title.trim()} onClick={() => act.run(async () => { await q(supabase.from('checklists').insert({ ...f, month: `${month}-01` })); onDone() })}>Add</Button></div>
      </div>
    </Modal>
  )
}
