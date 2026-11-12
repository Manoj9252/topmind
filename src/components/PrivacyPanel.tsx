import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { q, rpc, useAction, useLoad } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { fmtDate, label, todayMY } from '../lib/format'
import { Alert, Badge, Button, ConfirmModal, Section } from './ui'

// Personal data rights (PDPA): download a copy of your data, or ask the academy
// to delete it. Deletion is done by an administrator, because financial
// records must be kept.
export function PrivacyPanel() {
  const { session } = useAuth()
  const [asking, setAsking] = useState(false)
  const act = useAction()
  const requests = useLoad(() => q<any[]>(supabase.from('privacy_requests').select('id, kind, status, response, created_at, handled_at')
    .eq('profile_id', session!.user.id).eq('kind', 'deletion').order('created_at', { ascending: false }).limit(5)), [])
  const open = (requests.data ?? []).find((r) => r.status === 'pending')
  const download = () => act.run(async () => {
    const data = await rpc('export_my_data')
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `topmind-my-data-${todayMY()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, 'Your data has been downloaded.')
  return (
    <Section title="Your personal data">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">You can download a copy of the personal data we hold about you, or ask us to delete it. Invoices and receipts are kept for as long as the law requires.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" busy={act.busy} onClick={download}><Download size={14} />Download my data</Button>
          {!open && <Button variant="ghost" onClick={() => setAsking(true)}><Trash2 size={14} />Ask to delete my data</Button>}
        </div>
        {(requests.data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-cream/50 p-2">
            <span>Deletion request of {fmtDate(r.created_at)}{r.response && <span className="block text-xs text-slate-500">{r.response}</span>}</span>
            <span className="flex items-center gap-2"><Badge v={r.status} text={r.status === 'pending' ? 'Waiting for the academy' : label(r.status)} />
              {r.status === 'pending' && <Button size="sm" variant="link" onClick={() => act.run(async () => { await rpc('cancel_privacy_request', { p_request: r.id }); requests.reload() }, 'Request cancelled.')}>Cancel</Button>}</span>
          </div>
        ))}
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
      </div>
      {asking && <ConfirmModal title="Ask us to delete your data" danger confirmText="Send request" reason="Anything we should know? (optional)" reasonOptional
        message="We will remove your personal details and close your login once you have no current classes or unpaid invoices. We will reply within 21 days."
        onClose={() => setAsking(false)} onConfirm={async (r) => { await rpc('request_account_deletion', { p_reason: r || null }); requests.reload() }} />}
    </Section>
  )
}
