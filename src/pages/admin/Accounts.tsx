import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callFunction, q, rpc, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { fmtDate } from '../../lib/format'
import { Alert, Badge, Button, ConfirmModal, Loaded, PageHeader, SearchBox, Section, Select, Table, Td } from '../../components/ui'
import { InviteModal } from './Teachers'

// Who can sign in, with which role. Suspending blocks sign-in (through the
// admin-users function) and removes every permission in the database.
export default function Accounts() {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [inviting, setInviting] = useState(false)
  const [confirm, setConfirm] = useState<any>(null)
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('profiles').select('id, full_name, email, phone, role, status, suspended_reason, created_at').order('created_at', { ascending: false })), [])
  const shown = useMemo(() => (list.data ?? []).filter((p) => (!role || p.role === role)
    && (!search || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [list.data, search, role])

  const setStatus = async (p: any, action: 'suspend' | 'reactivate' | 'deactivate', reason?: string) => {
    try {
      await callFunction('admin-users', { action, user_id: p.id, reason })
    } catch (e: any) {
      // Without the function (not deployed yet) the database still enforces the status.
      if (!/Failed to send|not found|FunctionsFetchError|Failed to fetch/i.test(e.message)) throw e
      await q(supabase.from('profiles').update({ status: action === 'reactivate' ? 'active' : action === 'suspend' ? 'suspended' : 'deactivated', suspended_reason: reason ?? null }).eq('id', p.id))
    }
    list.reload()
  }

  return (
    <div>
      <PageHeader title="Accounts and access" subtitle="Roles are set here, never by the person signing up.">
        <SearchBox value={search} onChange={setSearch} />
        <Select className="!w-auto" value={role} onChange={setRole} placeholder="All roles" options={['admin', 'teacher', 'student']} />
        <Button onClick={() => setInviting(true)}><UserPlus size={16} />Invite</Button>
      </PageHeader>
      <div className="mb-3 space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
      <Loaded state={{ ...list, data: list.data && shown }} empty="No accounts.">
        {(rows) => (
          <Table head={['Name', 'Email', 'Role', 'Status', 'Since', '']}>
            {rows.map((p) => {
              const self = p.id === session?.user.id
              return (
                <tr key={p.id}>
                  <Td><b className="text-brand-navy">{p.full_name ?? '—'}</b>{self && <span className="ml-1 text-xs text-slate-400">(you)</span>}</Td>
                  <Td className="text-xs">{p.email}</Td>
                  <Td>{self ? <Badge v={p.role} tone="navy" /> : (
                    <Select className="!w-32 !py-1.5 text-xs" value={p.role} options={['student', 'teacher', 'admin']}
                      onChange={(v) => setConfirm({ kind: 'role', p, role: v })} />)}</Td>
                  <Td><Badge v={p.status} />{p.suspended_reason && <div className="text-xs text-slate-400">{p.suspended_reason}</div>}</Td>
                  <Td className="text-xs">{fmtDate(p.created_at)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {!self && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => act.run(() => callFunction('admin-users', { action: 'password_reset', user_id: p.id }), `Password email sent to ${p.email}.`)}>
                          <Mail size={14} />Reset password</Button>
                        {p.status === 'active'
                          ? <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'suspend', p })}>Suspend</Button>
                          : <Button size="sm" variant="success" onClick={() => act.run(() => setStatus(p, 'reactivate'), 'Account reactivated.')}>Reactivate</Button>}
                      </div>
                    )}
                  </Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Loaded>
      <PrivacyRequests />
      {inviting && <InviteModal role="student" onClose={() => setInviting(false)} onDone={() => { setInviting(false); list.reload() }} />}
      {confirm?.kind === 'suspend' && (
        <ConfirmModal title={`Suspend ${confirm.p.full_name ?? confirm.p.email}?`} reason="Reason (shown to them)" danger confirmText="Suspend"
          message="They will not be able to sign in or see any records until you reactivate the account. Their history is kept."
          onClose={() => setConfirm(null)} onConfirm={(reason) => setStatus(confirm.p, 'suspend', reason)} />
      )}
      {confirm?.kind === 'role' && (
        <ConfirmModal title="Change role?" confirmText="Change role"
          message={`${confirm.p.full_name ?? confirm.p.email} will become ${confirm.role === 'admin' ? 'an administrator with full access' : `a ${confirm.role}`}.`}
          onClose={() => setConfirm(null)}
          onConfirm={async () => { await q(supabase.from('profiles').update({ role: confirm.role }).eq('id', confirm.p.id)); list.reload() }} />
      )}
    </div>
  )
}

// Deletion requests (PDPA). Reply within 21 days. Anonymising keeps invoices,
// receipts and payments, which must be retained by law.
function PrivacyRequests() {
  const [modal, setModal] = useState<any>(null)
  const list = useLoad(() => q<any[]>(supabase.from('privacy_requests')
    .select('id, status, details, response, created_at, handled_at, student_id, profiles!privacy_requests_profile_id_fkey(full_name, email), students(full_name, student_code, status)')
    .eq('kind', 'deletion').order('created_at', { ascending: false }).limit(50)), [])
  return (
    <Section title="Personal data deletion requests" className="mt-8">
      <p className="mb-3 text-sm text-slate-500">Reply within 21 days. To delete a student's data, withdraw their current enrolments and cancel upcoming lessons, then use Erase personal data. Invoices, receipts and payments are kept, as the law requires.</p>
      <Loaded state={list} empty="No deletion requests.">
        {(rows) => (
          <Table head={['Requested', 'Person', 'Reason', 'Status', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{fmtDate(r.created_at)}</Td>
                <Td><b className="text-brand-navy">{r.profiles?.full_name ?? r.students?.full_name ?? '—'}</b><div className="text-xs text-slate-400">{r.profiles?.email}</div>
                  {r.student_id && <Link to={`/admin/students/${r.student_id}`} className="text-xs text-brand-pink">{r.students?.student_code}</Link>}</Td>
                <Td className="max-w-xs text-sm">{r.details ?? '—'}{r.response && <div className="text-xs text-slate-400">Reply: {r.response}</div>}</Td>
                <Td><Badge v={r.status} /></Td>
                <Td className="whitespace-nowrap text-right">{r.status === 'pending' && (
                  <div className="flex justify-end gap-1">
                    {r.student_id && <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'erase', r })}>Erase personal data</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'done', r })}>Mark done</Button>
                    <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'refuse', r })}>Refuse</Button>
                  </div>)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {modal?.kind === 'erase' && <ConfirmModal title="Erase personal data?" danger confirmText="Erase personal data" reason="Reason to record" 
        message="The student's name, contact details and notes are removed from every record except invoices, receipts and payments, and their login is closed. This cannot be undone."
        onClose={() => setModal(null)} onConfirm={async (reason) => { await rpc('anonymise_student', { p_student: modal.r.student_id, p_reason: reason }); list.reload() }} />}
      {modal?.kind === 'done' && <ConfirmModal title="Mark the request as done?" confirmText="Mark done" reason="Reply to the person (optional)" reasonOptional
        message="Use this when the request was handled another way, for example a login with no student record."
        onClose={() => setModal(null)} onConfirm={async (reason) => { await rpc('resolve_privacy_request', { p_request: modal.r.id, p_status: 'completed', p_response: reason || null }); list.reload() }} />}
      {modal?.kind === 'refuse' && <ConfirmModal title="Refuse the request?" danger confirmText="Refuse" reason="Reason (sent to the person)"
        message="For example, records the academy must keep while fees are unpaid."
        onClose={() => setModal(null)} onConfirm={async (reason) => { await rpc('resolve_privacy_request', { p_request: modal.r.id, p_status: 'rejected', p_response: reason }); list.reload() }} />}
    </Section>
  )
}
