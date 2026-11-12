import { useMemo, useState } from 'react'
import { Megaphone, RefreshCw, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { fmtDateTime, label } from '../../lib/format'
import { Alert, Badge, Button, Card, Label, Loaded, Modal, PageHeader, SearchBox, Select, Table, Tabs, Td, inputCls } from '../../components/ui'
import Notifications from '../shared/Notifications'

export default function NotificationCentre() {
  const [tab, setTab] = useState<'messages' | 'announcements' | 'mine'>('messages')
  return (
    <div>
      <PageHeader title="Notification centre" subtitle="Every email and WhatsApp message, its delivery status, and announcements." />
      <Tabs value={tab} onChange={setTab} tabs={[['messages', 'Messages'], ['announcements', 'Announcements'], ['mine', 'My notifications']]} />
      {tab === 'messages' && <Messages />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'mine' && <Notifications />}
    </div>
  )
}

function Messages() {
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<any>(null)
  const act = useAction()
  const status_ = useLoad(() => callFunction<any>('dispatch-messages', { mode: 'status' }).catch(() => null), [])
  const list = useLoad(() => q<any[]>(supabase.from('message_outbox')
    .select('id, created_at, channel, template_key, recipient, recipient_name, subject, body, status, attempts, last_error, related_type, sent_at, next_attempt_at')
    .order('created_at', { ascending: false }).limit(500)), [])
  const shown = useMemo(() => (list.data ?? []).filter((m) => (!status || m.status === status) && (!channel || m.channel === channel)
    && (!search || `${m.recipient} ${m.recipient_name ?? ''} ${m.subject ?? ''} ${m.template_key ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, status, channel, search])
  const counts = (s: string) => (list.data ?? []).filter((m) => m.status === s).length

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <b className="text-brand-navy">Delivery</b>{' '}
          {status_.loading ? 'checking…' : status_.data ? (
            <>Email {status_.data.email ? <Badge v="active" text="connected" /> : <Badge v="pending" text="not configured" />} · WhatsApp {status_.data.whatsapp ? <Badge v="active" text="connected" /> : <Badge v="pending" text="not configured" />} · automatic sending {status_.data.scheduled ? <Badge v="active" text="on" /> : <Badge v="pending" text="not scheduled" />}</>
          ) : <Badge v="pending" text="The dispatch-messages function is not deployed yet" />}
          <div className="mt-1 text-xs text-slate-500">{counts('queued')} queued · {counts('failed')} failed · {counts('skipped')} skipped (channel off) · {counts('sent')} sent</div>
        </div>
        <Button busy={act.busy} onClick={() => act.run(async () => {
          const r = await callFunction<any>('dispatch-messages', {}); list.reload()
          act.setOk(`${r.sent} sent, ${r.failed} failed${r.failed ? ' (they will be retried)' : ''}.`)
        })}><Send size={16} />Send queued messages now</Button>
      </Card>
      <div className="space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Recipient or subject" />
        <Select className="!w-auto" value={status} onChange={setStatus} placeholder="All statuses" options={['queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled']} />
        <Select className="!w-auto" value={channel} onChange={setChannel} placeholder="All channels" options={['email', 'whatsapp']} />
        <Button variant="ghost" onClick={list.reload}><RefreshCw size={16} />Refresh</Button>
      </div>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No messages yet.">
        {(rows) => (
          <Table head={['Created', 'Channel', 'To', 'Message', 'Status', '']}>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(m.created_at, { tz: false })}</Td><Td>{label(m.channel)}</Td>
                <Td className="text-xs">{m.recipient_name}<br /><span className="text-slate-400">{m.recipient}</span></Td>
                <Td className="max-w-xs text-xs"><button className="text-left hover:text-brand-pink" onClick={() => setView(m)}>{m.subject ?? label(m.template_key)}</button>
                  {m.related_type && <div className="text-slate-400">{label(m.related_type)}</div>}</Td>
                <Td><Badge v={m.status} />{m.attempts > 1 && <div className="text-xs text-slate-400">{m.attempts} attempts</div>}
                  {m.last_error && <div className="max-w-[14rem] text-xs text-rose-600">{m.last_error}</div>}</Td>
                <Td className="whitespace-nowrap text-right">
                  {['failed', 'skipped', 'cancelled'].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => act.run(async () => { await rpc('retry_message', { p_id: m.id }); list.reload() }, 'Queued again.')}>Retry</Button>}
                  {m.status === 'sent' && <Button size="sm" variant="ghost" onClick={() => act.run(async () => { await rpc('resend_message', { p_id: m.id }); list.reload() }, 'A copy was queued.')}>Resend</Button>}
                  {['queued', 'failed'].includes(m.status) && <Button size="sm" variant="danger" onClick={() => act.run(async () => { await rpc('cancel_message', { p_id: m.id }); list.reload() })}>Cancel</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {view && <Modal title={view.subject ?? label(view.template_key)} onClose={() => setView(null)}>
        <p className="mb-2 text-xs text-slate-500">To {view.recipient} by {view.channel}{view.sent_at ? ` · sent ${fmtDateTime(view.sent_at, { tz: false })}` : ''}</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-brand-cream/50 p-3 font-sans text-sm text-slate-700">{view.body}</pre>
      </Modal>}
    </div>
  )
}

function Announcements() {
  const [f, setF] = useState({ title: '', body: '', audience: 'everyone', class_id: '', send_email: false })
  const act = useAction()
  const classes = useLoad(() => q<any[]>(supabase.from('classes').select('id, name').eq('status', 'active').order('name')), [])
  const list = useLoad(() => q<any[]>(supabase.from('announcements').select('*, classes(name)').order('created_at', { ascending: false })), [])
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="space-y-3 lg:col-span-2">
        <h2 className="flex items-center gap-2 font-bold text-brand-navy"><Megaphone size={18} className="text-brand-pink" />New announcement</h2>
        <Label t="Title *"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Label>
        <Label t="Message *"><textarea rows={5} className={inputCls} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Label>
        <Label t="Who should see it"><Select value={f.audience} onChange={(v) => setF({ ...f, audience: v })}
          options={[['everyone', 'Everyone'], ['teachers', 'Teachers and staff'], ['students', 'All students'], ['class', 'One class']]} /></Label>
        {f.audience === 'class' && <Label t="Class"><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="Choose" options={(classes.data ?? []).map((c) => [c.id, c.name])} /></Label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.send_email} onChange={(e) => setF({ ...f, send_email: e.target.checked })} />Also send by email</label>
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <Button busy={act.busy} disabled={!f.title.trim() || !f.body.trim() || (f.audience === 'class' && !f.class_id)} onClick={() => act.run(async () => {
          const row = await q<any>(supabase.from('announcements').insert({ ...f, class_id: f.audience === 'class' ? f.class_id : null }).select('id').single())
          const n = await rpc<number>('publish_announcement', { p_id: row.id })
          setF({ title: '', body: '', audience: 'everyone', class_id: '', send_email: false }); list.reload()
          act.setOk(`Published to ${n} people.`)
        })}>Publish</Button>
      </Card>
      <div className="space-y-3 lg:col-span-3">
        <Loaded state={list} empty="No announcements yet.">
          {(rows) => <>{rows.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-2"><b className="text-brand-navy">{a.title}</b><Badge v={a.audience} tone="navy" text={a.audience === 'class' ? a.classes?.name : label(a.audience)} /></div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
              <p className="mt-1 text-xs text-slate-400">{a.published_at ? `Published ${fmtDateTime(a.published_at, { tz: false })}` : 'Not published'}{a.send_email ? ' · emailed' : ''}</p>
            </Card>
          ))}</>}
        </Loaded>
      </div>
    </div>
  )
}
