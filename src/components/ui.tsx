import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from 'react'
import { X, Inbox, Loader2, Search } from 'lucide-react'
import { label as labelOf } from '../lib/format'
import { cx } from '../lib/util'

export const inputCls =
  'w-full rounded-xl border border-brand-cream-dark bg-white px-3.5 py-2.5 text-sm text-brand-navy outline-none transition focus:border-brand-navy focus:ring-4 focus:ring-brand-pink/20 disabled:bg-slate-50 disabled:text-slate-400'

const V: Record<string, string> = {
  primary: 'bg-brand-navy text-white shadow-md shadow-brand-navy/20 hover:bg-brand-navy-light active:scale-[0.99]',
  secondary: 'bg-brand-pink text-white shadow-md shadow-brand-pink/25 hover:bg-brand-pink-hover active:scale-[0.99]',
  ghost: 'bg-white border border-brand-cream-dark text-brand-navy hover:bg-brand-cream/80 active:scale-[0.99]',
  cream: 'bg-brand-cream text-brand-navy border border-brand-cream-dark hover:bg-white active:scale-[0.99]',
  danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
  success: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  link: 'text-brand-pink hover:underline !px-0 !py-0',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof V; busy?: boolean; size?: 'sm' | 'md' }
export function Button({ variant = 'primary', className = '', busy, size = 'md', children, disabled, type = 'button', ...p }: ButtonProps) {
  return (
    <button {...p} type={type} disabled={disabled || busy}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm', V[variant] ?? V.primary, className)}>
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={cx('rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand-cream-dark/60', className)}>{children}</div>
)

export const Section = ({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) => (
  <Card className={className}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold text-brand-navy">{title}</h2>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </Card>
)

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10',
  rose: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/10',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10',
  sky: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/10',
  slate: 'bg-slate-100 text-slate-600',
  navy: 'bg-brand-navy/10 text-brand-navy ring-1 ring-brand-navy/20',
  pink: 'bg-brand-pink/15 text-brand-pink ring-1 ring-brand-pink/20',
}
const STATUS_TONE: Record<string, string> = {
  paid: 'emerald', active: 'emerald', approved: 'emerald', present: 'emerald', completed: 'emerald', confirmed: 'emerald',
  converted: 'emerald', sent: 'emerald', succeeded: 'emerald', published: 'emerald', met: 'emerald', responded: 'emerald',
  unpaid: 'sky', issued: 'sky', scheduled: 'sky', requested: 'amber', queued: 'sky', sending: 'sky', in_progress: 'sky', new: 'pink',
  partial: 'amber', partially_paid: 'amber', pending: 'amber', late: 'amber', waitlisted: 'amber', info_requested: 'amber',
  draft: 'slate', suspended: 'amber', follow_up: 'amber', running: 'sky',
  overdue: 'rose', rejected: 'rose', absent: 'rose', cancelled: 'rose', failed: 'rose', void: 'rose', no_show: 'rose', spam: 'rose',
  withdrawn: 'slate', dropped: 'slate', transferred: 'slate', archived: 'slate', inactive: 'slate', closed: 'slate', skipped: 'slate',
  refunded: 'slate', excused: 'sky', not_applicable: 'slate', expired: 'slate', deactivated: 'slate',
  group: 'navy', one_to_one: 'pink', special: 'navy', trial: 'pink', online: 'sky', physical: 'navy', hybrid: 'navy',
  per_workshop: 'pink', workshop: 'pink', registered: 'sky', shortlisted: 'amber', finalist: 'pink', winner: 'emerald',
  Registered: 'sky', Shortlisted: 'amber', Finalist: 'pink', Winner: 'emerald',
}

export const Badge = ({ v, text, tone }: { v?: string | null; text?: ReactNode; tone?: string }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone ?? STATUS_TONE[v ?? ''] ?? 'slate'])}>
    {text ?? labelOf(v)}
  </span>
)

export const Alert = ({ msg, ok, tone }: { msg?: ReactNode; ok?: boolean; tone?: 'info' | 'warn' }) =>
  msg ? (
    <div role={ok ? 'status' : 'alert'} className={cx('rounded-xl border px-4 py-3 text-sm font-medium',
      ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : tone === 'info' ? 'border-sky-200 bg-sky-50 text-sky-800'
        : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-rose-200 bg-rose-50 text-rose-800')}>
      {msg}
    </div>
  ) : null

export const PageHeader = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-brand-cream-dark/60 pb-4">
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
)

export const Stat = ({ label, value, icon, tone = 'navy', hint }: { label: string; value: ReactNode; icon?: ReactNode; tone?: string; hint?: ReactNode }) => {
  const T: Record<string, string> = {
    navy: 'from-brand-navy to-brand-navy-light text-white',
    pink: 'from-brand-pink to-[#f06ea0] text-white',
    cream: 'from-brand-cream to-brand-cream-dark text-brand-navy',
    emerald: 'from-emerald-600 to-teal-600 text-white',
    amber: 'from-amber-500 to-orange-500 text-white',
    rose: 'from-rose-500 to-brand-pink text-white',
  }
  return (
    <Card className="flex items-center gap-4 !p-4">
      {icon && <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br shadow-sm', T[tone] ?? T.navy)}>{icon}</div>}
      <div className="min-w-0">
        <div className="truncate text-xl font-bold text-brand-navy">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
      </div>
    </Card>
  )
}

export const Empty = ({ text = 'Nothing here yet.', children }: { text?: string; children?: ReactNode }) => (
  <div className="grid place-items-center gap-2 py-12 text-center text-slate-400">
    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-cream text-brand-navy/50"><Inbox size={22} /></div>
    <span className="text-sm font-medium">{text}</span>
    {children}
  </div>
)

export const Loading = ({ text = 'Loading…' }: { text?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />{text}</div>
)

// Standard wrapper for a loaded section: spinner, error, or content.
export function Loaded<T>({ state, children, empty }: { state: { data: T | null; error: string; loading: boolean }; children: (d: T) => ReactNode; empty?: string }) {
  if (state.loading && state.data == null) return <Loading />
  if (state.error) return <Alert msg={state.error} />
  if (state.data == null || (Array.isArray(state.data) && state.data.length === 0)) return <Empty text={empty} />
  return <>{children(state.data)}</>
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-brand-navy/60 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx('max-h-[92vh] w-full overflow-auto rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-black/5 sm:p-6', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-brand-cream-dark/60 pb-3">
          <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 transition hover:bg-brand-cream hover:text-brand-navy"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Asks for confirmation, optionally with a required reason.
export function ConfirmModal({ title, message, confirmText = 'Confirm', reason, reasonOptional, onConfirm, onClose, danger }: {
  title: string; message: ReactNode; confirmText?: string; reason?: string; reasonOptional?: boolean; danger?: boolean
  onConfirm: (reason: string) => Promise<unknown> | void; onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-600">
        <div>{message}</div>
        {reason !== undefined && (
          <Label t={reason || 'Reason'}><textarea rows={3} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Label>
        )}
        <Alert msg={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'secondary' : 'primary'} busy={busy} disabled={reason !== undefined && !reasonOptional && !text.trim()}
            onClick={async () => {
              setBusy(true); setErr('')
              try { await onConfirm(text.trim()); onClose() } catch (e: any) { setErr(e.message ?? String(e)) } finally { setBusy(false) }
            }}>{confirmText}</Button>
        </div>
      </div>
    </Modal>
  )
}

export const Label = ({ t, children, hint, className = '' }: { t: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) => (
  <label className={cx('block', className)}>
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">{t}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
)

export function Select({ value, onChange, options, placeholder, className = '', disabled }: {
  value: string; onChange: (v: string) => void; options: (string | [string, string])[]; placeholder?: string; className?: string; disabled?: boolean
}) {
  return (
    <select className={cx(inputCls, className)} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, labelOf(o)]; return <option key={v} value={v}>{l}</option> })}
    </select>
  )
}

export const SearchBox = ({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="relative">
    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
    <input className={cx(inputCls, 'pl-9 sm:w-64')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
  </div>
)

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, ReactNode][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-brand-cream/70 p-1 ring-1 ring-brand-cream-dark/60" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cx('whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition',
            value === k ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500 hover:text-brand-navy')}>{l}</button>
      ))}
    </div>
  )
}

export const Table = ({ head, children, footer }: { head: ReactNode[]; children: ReactNode; footer?: ReactNode }) => (
  <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-brand-cream-dark/60">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-brand-cream-dark bg-brand-cream text-xs uppercase tracking-wider text-brand-navy">
        <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-brand-cream-dark/40">{children}</tbody>
      {footer && <tfoot className="border-t border-brand-cream-dark bg-brand-cream/40 font-semibold">{footer}</tfoot>}
    </table>
  </div>
)
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-3 align-top', className)}>{children}</td>

export const KeyValue = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
    {rows.map(([k, v], i) => (
      <div key={i}><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k}</dt><dd className="mt-0.5 text-brand-navy">{v ?? '—'}</dd></div>
    ))}
  </dl>
)

export const Avatar = ({ name }: { name?: string | null }) => (
  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-pink/15 text-xs font-bold text-brand-pink">
    {(name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
  </span>
)

// A simple horizontal bar chart (no chart library needed).
export function Bars({ data, format = (n) => String(n) }: { data: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (!data.length) return <Empty text="No data for this period" />
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-medium text-brand-navy">{d.label}</span><span className="text-slate-500">{format(d.value)}</span></div>
          <div className="h-2.5 rounded-full bg-brand-cream"><div className="h-2.5 rounded-full bg-brand-pink" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

// Two series side by side per period, e.g. invoiced vs collected.
export function PairedColumns({ data, a, b, format }: { data: { label: string; a: number; b: number }[]; a: string; b: string; format: (n: number) => string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  return (
    <div>
      <div className="flex h-44 items-end gap-3">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <div title={`${a}: ${format(d.a)}`} className="w-1/3 rounded-t bg-brand-navy/80" style={{ height: `${(d.a / max) * 100}%` }} />
              <div title={`${b}: ${format(d.b)}`} className="w-1/3 rounded-t bg-brand-pink" style={{ height: `${(d.b / max) * 100}%` }} />
            </div>
            <span className="text-[11px] text-slate-500">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-navy/80" />{a}</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-pink" />{b}</span>
      </div>
    </div>
  )
}
