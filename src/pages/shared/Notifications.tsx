import { useNavigate } from 'react-router-dom'
import { CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { fmtDateTime } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Button, Card, Loaded, PageHeader } from '../../components/ui'

// The signed-in user's own in-app notifications.
export default function Notifications() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const act = useAction()
  const list = useLoad(() => q<any[]>(supabase.from('notifications').select('*').eq('user_id', session!.user.id)
    .order('created_at', { ascending: false }).limit(200)), [])
  const unread = (list.data ?? []).filter((n) => !n.read).length

  const open = async (n: any) => {
    if (!n.read) await rpc('mark_notifications_read', { p_ids: [n.id] })
    if (n.link) navigate(n.link)
    else list.reload()
  }

  return (
    <div>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : 'You are all caught up.'}>
        <Button variant="ghost" disabled={!unread} busy={act.busy}
          onClick={() => act.run(async () => { await rpc('mark_notifications_read', { p_ids: null }); list.reload() })}>
          <CheckCheck size={16} />Mark all as read
        </Button>
      </PageHeader>
      <Alert msg={act.error} />
      <Loaded state={list} empty="No notifications yet.">
        {(rows) => (
          <div className="space-y-2">
            {rows.map((n) => (
              <Card key={n.id} className={cx('!p-4 transition', !n.read && 'border-l-4 border-brand-pink')}>
                <button className="w-full text-left" onClick={() => open(n)}>
                  <div className="flex items-start justify-between gap-3">
                    <b className={cx('text-brand-navy', n.read && 'font-medium')}>{n.title}</b>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(n.created_at, { tz: false })}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-slate-500">{n.body}</p>}
                </button>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </div>
  )
}
