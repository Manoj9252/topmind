import { useMemo, useState } from 'react'
import { Copy, Link2, Plus, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { fmtDateTime, label } from '../../lib/format'
import { appOriginUrl, cx } from '../../lib/util'
import { Alert, Badge, Button, Card, Empty, Label, Loading, Modal, PageHeader, SearchBox, Select, inputCls } from '../../components/ui'

const STATUSES = ['new', 'in_progress', 'responded', 'follow_up', 'converted', 'closed', 'spam']
const SOURCES = ['website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'phone', 'walk_in', 'email', 'referral', 'other']

export default function Enquiries() {
  const [status, setStatus] = useState('open')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [links, setLinks] = useState(false)
  const list = useLoad(() => q<any[]>(supabase.from('enquiries')
    .select('id, name, email, phone, username, message, source, status, category, follow_up_date, created_at, assigned_to, profiles(full_name)')
    .order('created_at', { ascending: false }).limit(500)), [])
  const shown = useMemo(() => (list.data ?? []).filter((e) =>
    (status === 'open' ? ['new', 'in_progress', 'follow_up'].includes(e.status) : !status || e.status === status) && (!source || e.source === source)
    && (!search || `${e.name} ${e.email ?? ''} ${e.username ?? ''} ${e.message ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, source, search])

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Website, social media, phone and walk-in enquiries in one inbox.">
        <SearchBox value={search} onChange={setSearch} />
        <Button variant="ghost" onClick={() => setLinks(true)}><Link2 size={16} />Tracked links</Button>
        <Button onClick={() => setAdding(true)}><Plus size={16} />Add enquiry</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All" options={[['open', 'Open'], ...STATUSES.map((s) => [s, label(s)] as [string, string])]} />
        <Select className="!w-auto" value={source} onChange={setSource} placeholder="All sources" options={SOURCES} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2">
          {list.loading && !list.data ? <Loading /> : !shown.length ? <Empty text="No enquiries here." /> : shown.map((e) => (
            <button key={e.id} onClick={() => setSelected(e.id)}
              className={cx('w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition', selected === e.id ? 'ring-2 ring-brand-pink' : 'ring-brand-cream-dark/60 hover:ring-brand-pink/50')}>
              <div className="flex items-center justify-between gap-2"><b className="truncate text-brand-navy">{e.name}{e.username ? ` (@${e.username})` : ''}</b><Badge v={e.status} /></div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{e.message}</p>
              <p className="mt-1 text-xs text-slate-400">{label(e.source)} · {fmtDateTime(e.created_at, { tz: false })}{e.category ? ` · ${label(e.category)}` : ''}</p>
            </button>
          ))}
        </div>
        <div className="lg:col-span-3">
          {selected ? <Thread key={selected} id={selected} onChanged={list.reload} /> : <Card><Empty text="Choose an enquiry to read and reply." /></Card>}
        </div>
      </div>
      {adding && <AddEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); list.reload() }} />}
      {links && <TrackedLinks onClose={() => setLinks(false)} />}
    </div>
  )
}

function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const act = useAction()
  const data = useLoad(async () => ({
    e: await q<any>(supabase.from('enquiries').select('*, languages(name), courses(name)').eq('id', id).single()),
    messages: await q<any[]>(supabase.from('enquiry_messages').select('*').eq('enquiry_id', id).order('created_at')),
    admins: await q<any[]>(supabase.from('profiles').select('id, full_name').eq('role', 'admin').eq('status', 'active')),
    courses: await q<any[]>(supabase.from('courses').select('id, name').eq('active', true).order('name')),
  }), [id])
  const suggestion = useLoad(() => rpc<any>('suggest_enquiry_reply', { p_enquiry: id }), [id])
  const [reply, setReply] = useState<string | null>(null)
  const [convert, setConvert] = useState(false)
  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { e, messages, admins } = data.data!
  const text = reply ?? suggestion.data?.reply ?? ''
  const update = (patch: Record<string, unknown>) => act.run(async () => { await q(supabase.from('enquiries').update(patch).eq('id', id)); data.reload(); onChanged() })

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">{e.name}</h2>
          <p className="text-sm text-slate-500">{[e.email, e.phone, e.username && `@${e.username}`].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-slate-400">{label(e.source)}{e.languages?.name ? ` · interested in ${e.languages.name}` : ''}</p>
        </div>
        <Select className="!w-40" value={e.status} onChange={(v) => update({ status: v })} options={STATUSES} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label t="Assigned to"><Select value={e.assigned_to ?? ''} onChange={(v) => update({ assigned_to: v || null })} placeholder="Nobody" options={admins.map((a) => [a.id, a.full_name ?? 'Admin'])} /></Label>
        <Label t="Follow up on"><input type="date" className={inputCls} value={e.follow_up_date ?? ''} onChange={(ev) => update({ follow_up_date: ev.target.value || null, status: ev.target.value ? 'follow_up' : e.status })} /></Label>
        <Label t="Notes"><input className={inputCls} defaultValue={e.notes ?? ''} onBlur={(ev) => ev.target.value !== (e.notes ?? '') && update({ notes: ev.target.value })} /></Label>
      </div>
      <div className="max-h-72 space-y-2 overflow-auto rounded-2xl bg-brand-cream/40 p-3">
        {(messages.length ? messages : [{ id: 'm', direction: 'inbound', body: e.message, created_at: e.created_at }]).map((m: any) => (
          <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.direction === 'inbound' ? 'bg-white' : m.direction === 'note' ? 'bg-amber-50' : 'ml-auto bg-brand-navy text-white')}>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className={cx('mt-1 text-[11px]', m.direction === 'outbound' ? 'text-white/60' : 'text-slate-400')}>{fmtDateTime(m.created_at, { tz: false })}{m.status === 'failed' ? ' · failed' : ''}</p>
          </div>
        ))}
      </div>
      <div>
        <Label t={`Reply${suggestion.data?.matched ? ` (suggested: ${suggestion.data.title})` : ''}`} hint="Suggestions use today's classes, fees and schedules from the database. Edit before sending.">
          <textarea rows={7} className={inputCls} value={text} onChange={(ev) => setReply(ev.target.value)} />
        </Label>
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(text)}><Copy size={14} />Copy</Button>
          {e.source === 'instagram' && e.conversation_id && (
            <Button variant="ghost" busy={act.busy} onClick={() => act.run(async () => { await callFunction('social-webhook?action=reply', { enquiry_id: id, text }); data.reload(); onChanged() }, 'Sent on Instagram.')}>
              <Send size={14} />Send on Instagram
            </Button>
          )}
          <Button variant="ghost" busy={act.busy} disabled={!text.trim()} onClick={() => act.run(async () => { await rpc('log_enquiry_message', { p_enquiry: id, p_direction: 'note', p_body: text }); setReply(''); data.reload() }, 'Note saved.')}>Save as note</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => {
            await rpc('log_enquiry_message', { p_enquiry: id, p_direction: 'outbound', p_body: text, p_channel: e.source }); setReply(null); data.reload(); onChanged()
          }, 'Reply recorded.')}>Mark as replied</Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">"Mark as replied" records a reply you sent by email, WhatsApp, TikTok or phone. Instagram replies can be sent from here once Instagram messaging is connected.</p>
      </div>
      {!e.registration_id && e.status !== 'converted' && (
        <div className="border-t pt-3"><Button variant="secondary" onClick={() => setConvert(true)}>Convert to registration</Button></div>
      )}
      {convert && <ConvertModal enquiry={e} courses={data.data!.courses} onClose={() => setConvert(false)} onDone={() => { setConvert(false); data.reload(); onChanged() }} />}
    </Card>
  )
}

function ConvertModal({ enquiry, courses, onClose, onDone }: { enquiry: any; courses: any[]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(enquiry.email ?? '')
  const [course, setCourse] = useState(enquiry.interested_course_id ?? '')
  const act = useAction()
  return (
    <Modal title="Convert to registration" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This creates a pending registration you can review and approve as usual. Confirm the person's privacy consent before approving.</p>
        <Label t="Email *"><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Label>
        <Label t="Programme"><Select value={course} onChange={setCourse} placeholder="Not decided" options={courses.map((c) => [c.id, c.name])} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => { await rpc('convert_enquiry', { p_enquiry: enquiry.id, p_email: email, p_course: course || null }); onDone() })}>Create registration</Button></div>
      </div>
    </Modal>
  )
}

function AddEnquiry({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', username: '', source: 'instagram', message: '' })
  const act = useAction()
  return (
    <Modal title="Add an enquiry" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Record a message that arrived by Instagram, TikTok, WhatsApp, phone or in person.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label t="Source"><Select value={f.source} onChange={(v) => setF({ ...f, source: v })} options={SOURCES} /></Label>
          <Label t="Name *"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Label>
          <Label t="Social username"><input className={inputCls} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/^@/, '') })} /></Label>
          <Label t="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Label>
          <Label t="Email" className="sm:col-span-2"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Label>
        </div>
        <Label t="Message *"><textarea rows={3} className={inputCls} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.name.trim() || !f.message.trim()} onClick={() => act.run(async () => {
            const category = (await rpc<any>('suggest_enquiry_reply', { p_text: f.message })).category
            const row = await q<any>(supabase.from('enquiries').insert({ ...f, email: f.email || null, phone: f.phone || null, username: f.username || null, category }).select('id').single())
            await q(supabase.from('enquiry_messages').insert({ enquiry_id: row.id, direction: 'inbound', body: f.message, channel: f.source }))
            onDone()
          })}>Save</Button></div>
      </div>
    </Modal>
  )
}

function TrackedLinks({ onClose }: { onClose: () => void }) {
  const site = (useSettings().get('system.site_url') || appOriginUrl()).replace(/\/+$/, '')
  return (
    <Modal title="Tracked registration links" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">Put these in your Instagram and TikTok bios and posts. Registrations that come through them are labelled with the source in reports.</p>
      {['instagram', 'tiktok', 'whatsapp', 'facebook'].map((s) => {
        const url = `${site}/register?src=${s}`
        return (
          <div key={s} className="mb-2 flex items-center gap-2">
            <span className="w-24 text-sm font-semibold capitalize text-brand-navy">{s}</span>
            <input readOnly className={inputCls + ' text-xs'} value={url} />
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(url)} aria-label={`Copy ${s} link`}><Copy size={14} /></Button>
          </div>
        )
      })}
    </Modal>
  )
}
