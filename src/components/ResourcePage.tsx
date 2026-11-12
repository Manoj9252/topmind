import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Plus, Download, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { q, useLoad, errorText } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { get } from '../lib/util'
import { Alert, Badge, Button, ConfirmModal, Empty, Label, Loading, Modal, PageHeader, SearchBox, Table, Td, inputCls } from './ui'

export type Field = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'time' | 'datetime' | 'select' | 'multiselect' | 'textarea' | 'checkbox' | 'email' | 'url'
  options?: (string | [string, string])[]
  from?: { table: string; label: string; filter?: [string, string]; order?: string }
  required?: boolean
  hint?: string
  step?: string
  defaultValue?: unknown
}
export type Col = { key: string; label: string; render?: (r: any) => ReactNode }

type P = {
  table: string; title: string; subtitle?: ReactNode; select?: string; cols: Col[]; fields: Field[]
  canAdd?: boolean; canEdit?: boolean | ((r: any) => boolean); canDelete?: boolean | ((r: any) => boolean)
  filter?: [string, unknown]; defaults?: Record<string, unknown>; order?: string; ascending?: boolean
  actions?: (r: any, reload: () => void) => ReactNode; csv?: boolean; embedded?: boolean; toolbar?: ReactNode
  onSaved?: () => void
}

const toLocal = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

// A searchable table with add / edit / delete for simple configuration tables.
// Row-level security in the database decides what each user may actually change.
export default function ResourcePage({
  table, title, subtitle, select = '*', cols, fields, canAdd = true, canEdit = true, canDelete = true, filter, defaults,
  order = 'created_at', ascending = false, actions, csv = true, embedded, toolbar, onSaved,
}: P) {
  const rows = useLoad(async () => {
    let query: any = supabase.from(table).select(select)
    if (filter) query = query.eq(filter[0], filter[1])
    return (await q<any[]>(query.order(order, { ascending }))) ?? []
  }, [table, select, filter?.[0], filter?.[1], order, ascending])
  const [opts, setOpts] = useState<Record<string, [string, string][]>>({})
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<Record<string, any> | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<any>(null)

  useEffect(() => {
    fields.forEach(async (f) => {
      if (!f.from) return
      let query: any = supabase.from(f.from.table).select('*')
      if (f.from.filter) query = query.eq(f.from.filter[0], f.from.filter[1])
      if (f.from.order) query = query.order(f.from.order)
      const { data } = await query
      setOpts((o) => ({
        ...o,
        [f.key]: (data ?? []).map((r: any) => [r.id, f.from!.label.split('|').map((k) => r[k]).filter(Boolean).join(' · ') || String(r.id).slice(0, 8)]),
      }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (rows.data ?? []).filter((r) => !needle || JSON.stringify(r).toLowerCase().includes(needle))
  }, [rows.data, search])

  const allowed = (rule: boolean | ((r: any) => boolean), r: any) => (typeof rule === 'function' ? rule(r) : rule)

  const startAdd = () => {
    setErr('')
    setForm(Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'checkbox' ? true : f.type === 'multiselect' ? [] : '')])))
  }
  const startEdit = (r: any) => {
    setErr('')
    const f: Record<string, any> = { id: r.id }
    fields.forEach((x) => { f[x.key] = x.type === 'datetime' && r[x.key] ? toLocal(r[x.key]) : r[x.key] ?? (x.type === 'checkbox' ? false : '') })
    setForm(f)
  }

  const save = async () => {
    if (!form) return
    const missing = fields.find((f) => f.required && (form[f.key] === '' || form[f.key] == null))
    if (missing) return setErr(`${missing.label} is required`)
    setBusy(true); setErr('')
    const payload: Record<string, unknown> = form.id ? {} : { ...defaults }
    fields.forEach((f) => {
      let v = form[f.key]
      if (f.type === 'multiselect') { payload[f.key] = Array.isArray(v) ? v : []; return }
      if (v === '' || v === undefined) v = null
      if (v !== null && f.type === 'number') v = Number(v)
      if (v !== null && f.type === 'datetime') v = new Date(v).toISOString()
      payload[f.key] = v
    })
    try {
      await q(form.id ? supabase.from(table).update(payload).eq('id', form.id) : supabase.from(table).insert(payload))
      setForm(null)
      rows.reload()
      onSaved?.()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const cell = (c: Col, r: any) => {
    if (c.render) return c.render(r)
    const v = get(r, c.key)
    if (['status', 'kind', 'mode'].includes(c.key)) return v ? <Badge v={v} /> : '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    return v ?? '—'
  }

  const content = (
    <>
      <Alert msg={!form ? err || rows.error : ''} />
      {rows.loading && !rows.data ? <Loading /> : !shown.length ? <Empty text={search ? 'No matches' : 'Nothing here yet.'} /> : (
        <Table head={[...cols.map((c) => c.label), '']}>
          {shown.map((r) => (
            <tr key={r.id ?? JSON.stringify(r)} className="hover:bg-brand-cream/30">
              {cols.map((c) => <Td key={c.key}>{cell(c, r)}</Td>)}
              <Td className="whitespace-nowrap text-right">
                <div className="flex justify-end gap-1">
                  {actions?.(r, rows.reload)}
                  {allowed(canEdit, r) && <Button variant="ghost" size="sm" onClick={() => startEdit(r)} aria-label="Edit"><Pencil size={14} /></Button>}
                  {allowed(canDelete, r) && <Button variant="danger" size="sm" onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 size={14} /></Button>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {form && (
        <Modal title={`${form.id ? 'Edit' : 'Add'} ${title.replace(/s$/, '').toLowerCase()}`} onClose={() => setForm(null)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
            {fields.map((f) => (
              <Label key={f.key} t={f.label + (f.required ? ' *' : '')} hint={f.hint}>
                {f.type === 'select' ? (
                  <select className={inputCls} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">— select —</option>
                    {(f.from ? opts[f.key] ?? [] : (f.options ?? []).map((o) => (Array.isArray(o) ? o : [o, o] as [string, string])))
                      .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : f.type === 'multiselect' ? (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(f.options ?? []).map((o) => {
                      const [v, l] = Array.isArray(o) ? o : [o, o]
                      const list: string[] = Array.isArray(form[f.key]) ? form[f.key] : []
                      return (
                        <label key={v} className="flex items-center gap-1.5 text-sm text-slate-700">
                          <input type="checkbox" className="accent-brand-pink" checked={list.includes(v)}
                            onChange={(e) => setForm({ ...form, [f.key]: e.target.checked ? [...list, v] : list.filter((x) => x !== v) })} />{l}
                        </label>
                      )
                    })}
                  </div>
                ) : f.type === 'textarea' ? (
                  <textarea rows={3} className={inputCls} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : f.type === 'checkbox' ? (
                  <input type="checkbox" className="h-5 w-5 accent-brand-pink" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                ) : (
                  <input className={inputCls} type={f.type === 'datetime' ? 'datetime-local' : f.type ?? 'text'}
                    step={f.step ?? (f.type === 'number' ? '0.01' : undefined)} value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </Label>
            ))}
            <Alert msg={err} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" busy={busy}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <ConfirmModal title="Delete this record?" danger confirmText="Delete"
          message="This cannot be undone. Records with history (enrolments, payments, lessons) are protected and should be archived instead."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await q(supabase.from(table).delete().eq('id', deleting.id)); rows.reload() }} />
      )}
    </>
  )

  const buttons = (
    <>
      <SearchBox value={search} onChange={setSearch} />
      {toolbar}
      {csv && <Button variant="ghost" disabled={!shown.length}
        onClick={() => downloadCsv(shown.map((r) => Object.fromEntries(cols.map((c) => [c.label, get(r, c.key)]))), table)}><Download size={16} />CSV</Button>}
      {canAdd && <Button onClick={startAdd}><Plus size={16} />Add</Button>}
    </>
  )

  if (embedded) {
    return <div><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-brand-navy">{title}</h2><div className="flex flex-wrap gap-2">{buttons}</div></div>{content}</div>
  }
  return <div><PageHeader title={title} subtitle={subtitle}>{buttons}</PageHeader>{content}</div>
}
