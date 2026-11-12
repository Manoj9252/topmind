import { useState } from 'react'
import { Copy } from 'lucide-react'
import { supabase, supabaseUrl } from '../../lib/supabase'
import { callFunction, q, useAction, useLoad } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { label } from '../../lib/format'
import ResourcePage from '../../components/ResourcePage'
import { Alert, Badge, Button, Card, Label, Loaded, Loading, Modal, PageHeader, Section, Select, Table, Tabs, Td, inputCls } from '../../components/ui'

type Tab = 'business' | 'finance' | 'academic' | 'booking' | 'communication' | 'templates' | 'replies' | 'integrations' | 'privacy'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('business')
  return (
    <div>
      <PageHeader title="Settings" subtitle="Changes apply straight away and are recorded in the audit log." />
      <Tabs value={tab} onChange={setTab} tabs={[['business', 'Business'], ['finance', 'Finance'], ['academic', 'Academic'], ['booking', 'One-to-one'],
        ['communication', 'Communication'], ['templates', 'Message templates'], ['replies', 'Enquiry replies'], ['integrations', 'Integrations'], ['privacy', 'Privacy']]} />
      {['business', 'academic', 'booking', 'privacy'].includes(tab) && <SettingsGroup categories={tab === 'business' ? ['business', 'system'] : [tab]} />}
      {tab === 'finance' && (
        <div className="space-y-6">
          <SettingsGroup categories={['finance', 'automation']} />
          <Card>
            <ResourcePage embedded table="payment_methods" title="Payment methods" order="sort_order" ascending canDelete={false}
              cols={[{ key: 'name', label: 'Method' }, { key: 'code', label: 'Code' }, { key: 'requires_reference', label: 'Needs reference' }, { key: 'is_active', label: 'Active' }]}
              fields={[{ key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code', required: true, hint: 'Lowercase letters, numbers and underscores, e.g. touch_n_go' },
                { key: 'instructions', label: 'Instructions for students', type: 'textarea' }, { key: 'requires_reference', label: 'A transaction reference is required', type: 'checkbox' },
                { key: 'is_active', label: 'Active', type: 'checkbox' }, { key: 'sort_order', label: 'Order', type: 'number', step: '1', defaultValue: 10 }]} />
          </Card>
        </div>
      )}
      {tab === 'communication' && <SettingsGroup categories={['communication', 'enquiries']} />}
      {tab === 'templates' && <Templates />}
      {tab === 'replies' && (
        <ResourcePage embedded table="response_templates" title="Suggested enquiry replies" order="sort_order" ascending
          cols={[{ key: 'title', label: 'Question' }, { key: 'keywords', label: 'Keywords', render: (r) => (r.keywords ?? []).join(', ') }, { key: 'is_active', label: 'Active' }]}
          fields={[{ key: 'title', label: 'Question it answers', required: true }, { key: 'key', label: 'Key', required: true, hint: 'Short unique name, e.g. fees' },
            { key: 'body', label: 'Reply', type: 'textarea', required: true, hint: 'Live values: {{languages}} {{programmes}} {{fees}} {{schedules}} {{register_url}} {{online_info}} {{one_to_one_info}} {{language_answer}} {{contact_phone}}' },
            { key: 'is_active', label: 'Active', type: 'checkbox' }, { key: 'sort_order', label: 'Order', type: 'number', step: '1' }]} />
      )}
      {tab === 'integrations' && <Integrations />}
    </div>
  )
}

function SettingsGroup({ categories }: { categories: string[] }) {
  const settings = useSettings()
  const rows = useLoad(() => q<any[]>(supabase.from('app_settings').select('*').in('category', categories).order('key')), [categories.join()])
  const [values, setValues] = useState<Record<string, any>>({})
  const act = useAction()
  const changed = Object.keys(values)
  const save = () => act.run(async () => {
    for (const key of changed) await q(supabase.from('app_settings').update({ value: values[key] }).eq('key', key))
    setValues({}); rows.reload(); settings.reload()
  }, 'Saved.')
  return (
    <Loaded state={rows} empty="No settings in this group.">
      {(list) => (
        <Card className="space-y-4">
          {list.map((s) => {
            const v = s.key in values ? values[s.key] : s.value
            const set = (x: any) => setValues({ ...values, [s.key]: x })
            return (
              <div key={s.key} className="grid gap-2 border-b border-brand-cream-dark/50 pb-4 last:border-0 md:grid-cols-3">
                <div><b className="text-sm text-brand-navy">{s.label ?? label(s.key.split('.').pop())}</b>{s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                  {s.is_public && <p className="text-[11px] text-slate-400">Shown publicly</p>}</div>
                <div className="md:col-span-2">
                  {typeof v === 'boolean' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-pink" checked={v} onChange={(e) => set(e.target.checked)} />{v ? 'On' : 'Off'}</label>
                    : typeof v === 'number' ? <input type="number" className={inputCls + ' md:w-48'} value={v} onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))} />
                    : String(v).length > 60 || /instructions|mission|vision|details|address/.test(s.key)
                      ? <textarea rows={3} className={inputCls} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
                      : <input className={inputCls} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />}
                </div>
              </div>
            )
          })}
          <Alert msg={act.error} /><Alert ok msg={act.ok} />
          <div className="flex justify-end gap-2">
            {changed.length > 0 && <Button variant="ghost" onClick={() => setValues({})}>Undo changes</Button>}
            <Button busy={act.busy} disabled={!changed.length} onClick={save}>Save {changed.length > 0 && `(${changed.length})`}</Button>
          </div>
        </Card>
      )}
    </Loaded>
  )
}

function Templates() {
  const [channel, setChannel] = useState('email')
  const [edit, setEdit] = useState<any>(null)
  const list = useLoad(() => q<any[]>(supabase.from('message_templates').select('*').eq('channel', channel).order('key')), [channel])
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="!w-auto" value={channel} onChange={setChannel} options={[['email', 'Email'], ['whatsapp', 'WhatsApp'], ['in_app', 'In-app']]} />
        <span className="text-xs text-slate-500">Use {'{{name}}'}-style placeholders shown in each template. WhatsApp business-initiated messages must match a template approved by Meta.</span>
      </div>
      <Loaded state={list} empty="No templates.">
        {(rows) => (
          <Table head={['Message', 'Subject / text', 'Active', '']}>
            {rows.map((t) => (
              <tr key={t.key}><Td><b className="text-brand-navy">{label(t.key)}</b>{t.wa_template_name && <div className="text-xs text-slate-400">Meta template: {t.wa_template_name}</div>}</Td>
                <Td className="max-w-md text-xs">{t.subject ?? t.body.slice(0, 120)}</Td><Td>{t.is_active ? <Badge v="active" text="On" /> : <Badge v="inactive" text="Off" />}</Td>
                <Td><Button size="sm" variant="ghost" onClick={() => setEdit(t)}>Edit</Button></Td></tr>
            ))}
          </Table>
        )}
      </Loaded>
      {edit && <TemplateModal t={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); list.reload() }} />}
    </div>
  )
}

function TemplateModal({ t, onClose, onDone }: { t: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ subject: t.subject ?? '', body: t.body, is_active: t.is_active, wa_template_name: t.wa_template_name ?? '', wa_language: t.wa_language ?? 'en', wa_params: (t.wa_params ?? []).join(', ') })
  const placeholders = Array.from(new Set(`${t.subject ?? ''} ${t.body}`.match(/\{\{[a-z_0-9]+\}\}/g) ?? []))
  const act = useAction()
  return (
    <Modal title={`${label(t.key)} (${label(t.channel)})`} onClose={onClose} wide>
      <div className="space-y-3">
        {t.channel !== 'whatsapp' && <Label t={t.channel === 'in_app' ? 'Title' : 'Subject'}><input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Label>}
        <Label t="Message" hint={`Placeholders: ${placeholders.join(' ') || 'none'}`}><textarea rows={10} className={inputCls + ' font-mono text-xs'} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Label>
        {t.channel === 'whatsapp' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Label t="Approved template name"><input className={inputCls} value={f.wa_template_name} onChange={(e) => setF({ ...f, wa_template_name: e.target.value })} /></Label>
            <Label t="Language code"><input className={inputCls} value={f.wa_language} onChange={(e) => setF({ ...f, wa_language: e.target.value })} /></Label>
            <Label t="Parameters in order"><input className={inputCls} value={f.wa_params} onChange={(e) => setF({ ...f, wa_params: e.target.value })} /></Label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Send this message</label>
        <Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} onClick={() => act.run(async () => {
            await q(supabase.from('message_templates').update({
              subject: f.subject || null, body: f.body, is_active: f.is_active, wa_template_name: f.wa_template_name || null, wa_language: f.wa_language,
              wa_params: f.wa_params ? f.wa_params.split(',').map((x: string) => x.trim()).filter(Boolean) : null, updated_at: new Date().toISOString(),
            }).eq('key', t.key).eq('channel', t.channel))
            onDone()
          })}>Save</Button></div>
      </div>
    </Modal>
  )
}

function Integrations() {
  const status = useLoad(() => callFunction<any>('dispatch-messages', { mode: 'status' }).catch(() => null), [])
  const fn = (name: string) => `${supabaseUrl || 'https://YOUR-PROJECT.supabase.co'}/functions/v1/${name}`
  const rows: [string, string, React.ReactNode, string][] = [
    ['Email (Resend)', 'Invoices, receipts, confirmations and reminders', status.data ? (status.data.email ? <Badge v="active" text="Connected" /> : <Badge v="pending" text="Needs RESEND_API_KEY and EMAIL_FROM" />) : <Badge v="pending" text="Deploy dispatch-messages" />, ''],
    ['WhatsApp Business Platform', 'Optional messages to students who opted in', status.data?.whatsapp ? <Badge v="active" text="Connected" /> : <Badge v="pending" text="Needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID" />, ''],
    ['Scheduled sending', 'Sends queued messages every few minutes', status.data?.scheduled ? <Badge v="active" text="Secret set" /> : <Badge v="pending" text="Set DISPATCH_SECRET and schedule it" />, fn('dispatch-messages')],
    ['Instagram messages', 'New Instagram DMs appear in Enquiries', <Badge key="i" v="pending" text="Needs a Meta app (see docs)" />, fn('social-webhook')],
    ['TikTok / forwarding tools', 'Leads forwarded from TikTok, Zapier or Make', <Badge key="t" v="pending" text="Needs SOCIAL_WEBHOOK_SECRET" />, `${fn('social-webhook')}?source=generic`],
    ['Online payments', 'Future: Billplz, ToyyibPay or Stripe webhooks', <Badge key="p" v="pending" text="Not chosen yet" />, `${fn('payment-webhook')}?provider=billplz`],
  ]
  return (
    <div className="space-y-4">
      <Alert tone="info" msg="Secrets (API keys and tokens) are never stored in the app or the database. Set them as Supabase Edge Function secrets; see docs/INTEGRATIONS.md." />
      {status.loading ? <Loading /> : (
        <Table head={['Integration', 'What it does', 'Status', 'Webhook / endpoint']}>
          {rows.map(([n, d, s, url]) => (
            <tr key={n}><Td><b className="text-brand-navy">{n}</b></Td><Td className="text-xs">{d}</Td><Td>{s}</Td>
              <Td className="text-xs">{url && <span className="flex items-center gap-1"><code className="break-all">{url}</code><button onClick={() => navigator.clipboard.writeText(url)} aria-label="Copy"><Copy size={12} /></button></span>}</Td></tr>
          ))}
        </Table>
      )}
      <Section title="Tracked registration links"><p className="text-sm text-slate-600">Use <code>/register?src=instagram</code> or <code>?src=tiktok</code> in your bios. These are also listed under Enquiries → Tracked links.</p></Section>
    </div>
  )
}
