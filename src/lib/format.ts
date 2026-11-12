// Display helpers. Business dates and money follow Malaysia (MYR, Asia/Kuala_Lumpur).
export const BUSINESS_TZ = 'Asia/Kuala_Lumpur'
export const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone

export const money = (n: unknown, symbol = 'RM') =>
  `${symbol} ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// 'YYYY-MM-DD' is a calendar date, not an instant: parse it as local midnight.
const asDate = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d))

export const fmtDate = (d?: string | Date | null) =>
  d ? asDate(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDay = (d?: string | Date | null) =>
  d ? asDate(d).toLocaleDateString('en-MY', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'

export const fmtTime = (t?: string | null) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
}

// Instants are shown in the viewer's own time zone, with a label when it is not Malaysia time.
export const fmtDateTime = (ts?: string | null, opts: { tz?: boolean } = { tz: true }) => {
  if (!ts) return '—'
  const d = new Date(ts)
  const text = d.toLocaleString('en-MY', { weekday: 'short', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
  return opts.tz && viewerTz !== BUSINESS_TZ ? `${text} (${viewerTz})` : text
}

export const fmtClock = (ts?: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }) : ''

export const todayMY = () => new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(new Date())
export const monthMY = () => todayMY().slice(0, 7)
export const addDays = (iso: string, n: number) => {
  const d = asDate(iso)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
export const monthLabel = (ym: string) => asDate(`${ym}-01`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const LABELS: Record<string, string> = {
  unpaid: 'Issued · unpaid', partial: 'Partly paid', one_to_one: 'One-to-one', info_requested: 'Info requested',
  in_progress: 'In progress', not_applicable: 'Not applicable', no_show: 'No-show', partially_paid: 'Partly paid',
  not_started: 'Not started', per_lesson: 'Per lesson', one_off: 'One-off', bank_transfer: 'Bank transfer',
  follow_up: 'Follow up', lesson_plan: 'Lesson plan', walk_in: 'Walk-in', full_time: 'Full-time', part_time: 'Part-time',
  on_leave: 'On leave', per_student: 'Per student', per_workshop: 'Per workshop', workshop: 'Workshops & trial classes',
  credit_note: 'Credit note', debit_note: 'Debit note', write_off: 'Write-off',
  sentence_construction: 'Sentence construction', short_text: 'Short answer', mcq: 'Multiple choice',
}
export const label = (v?: string | null) => (v ? LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : '—')

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

export const bytes = (n?: number | null) =>
  !n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
