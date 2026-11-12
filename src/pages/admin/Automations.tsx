import { Play } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { fmtDateTime, label } from '../../lib/format'
import { Alert, Badge, Button, Card, Loaded, PageHeader, Section, Table, Td } from '../../components/ui'

const when = (j: any) => j.frequency === 'hourly' ? 'Every hour'
  : j.frequency === 'daily' ? `Daily from ${String(j.run_at_hour).padStart(2, '0')}:00`
  : `Monthly on day ${j.run_on_day ?? 1} from ${String(j.run_at_hour).padStart(2, '0')}:00`

// Scheduled jobs run hourly from pg_cron in Malaysia time; each runs at most
// once per period and failures are retried up to three times.
export default function Automations() {
  const act = useAction()
  const jobs = useLoad(() => q<any[]>(supabase.from('automation_jobs').select('*').order('name')), [])
  const runs = useLoad(() => q<any[]>(supabase.from('automation_runs').select('*, automation_jobs(name)').order('started_at', { ascending: false }).limit(50)), [])
  const reload = () => { jobs.reload(); runs.reload() }
  return (
    <div className="space-y-6">
      <PageHeader title="Automations" subtitle="Times are Malaysia time. Jobs are safe to run again: nothing is duplicated." />
      <div className="space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Loaded state={jobs} empty="No automations configured.">
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((j) => (
              <Card key={j.key}>
                <div className="flex items-start justify-between gap-2">
                  <div><b className="text-brand-navy">{j.name}</b><p className="text-sm text-slate-500">{j.description}</p></div>
                  <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-pink" checked={j.is_enabled}
                    onChange={(e) => act.run(async () => { await q(supabase.from('automation_jobs').update({ is_enabled: e.target.checked }).eq('key', j.key)); jobs.reload() })} />On</label>
                </div>
                <p className="mt-2 text-xs text-slate-500">{when(j)} · last run {j.last_run_at ? fmtDateTime(j.last_run_at, { tz: false }) : 'never'} {j.last_status && <Badge v={j.last_status} />}</p>
                <Button size="sm" variant="ghost" className="mt-3" busy={act.busy} onClick={() => act.run(async () => {
                  const r = await rpc<any>('run_automation', { p_job: j.key, p_trigger: 'manual', p_period: null })
                  reload()
                  if (r.error) throw new Error(r.error)
                  act.setOk(`${j.name}: ${Object.entries(r).filter(([k]) => k !== 'run_id').map(([k, v]) => `${label(k)} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}`)
                })}><Play size={14} />Run now</Button>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
      <Section title="Recent runs">
        <Loaded state={runs} empty="No runs yet.">
          {(rows) => (
            <Table head={['Started', 'Job', 'Trigger', 'Status', 'Result']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.started_at, { tz: false })}</Td><Td>{r.automation_jobs?.name ?? r.job_key}</Td>
                  <Td><Badge v={r.trigger} tone="navy" /></Td><Td><Badge v={r.status} /></Td>
                  <Td className="max-w-md text-xs">{r.error ? <span className="text-rose-600">{r.error}</span> : r.result ? Object.entries(r.result).map(([k, v]) => `${label(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : ''}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      </Section>
      <p className="text-xs text-slate-500">Emails and WhatsApp messages are sent by the dispatch-messages function every few minutes once it is scheduled (see docs/DEPLOYMENT.md). Until then use "Send queued messages now" in the Notification centre.</p>
    </div>
  )
}
