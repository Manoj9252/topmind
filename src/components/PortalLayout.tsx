import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, Banknote, Bell, BookOpen, CalendarCheck, CalendarDays, CheckSquare, ClipboardCheck, ClipboardList, Clock, CreditCard,
  FileText, FolderOpen, GraduationCap, Languages, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquare, Receipt, ScrollText, Settings,
  ShieldCheck, Sparkles, User, UserCog, Users, Wallet, X, Zap, PiggyBank,
} from 'lucide-react'
import { useAuth, Role } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'
import { Button, Loading } from './ui'
import { cx, LOGO_URL } from '../lib/util'

type Item = [string, string, any]
type Group = [string, Item[]]

const NAV: Record<Role, Group[]> = {
  admin: [
    ['Overview', [['', 'Dashboard', LayoutDashboard], ['checklist', 'Monthly checklist', ListChecks], ['reports', 'Reports', BarChart3], ['progress', 'Student progress', GraduationCap]]],
    ['People', [['students', 'Students', GraduationCap], ['registrations', 'Registrations', ClipboardList], ['enquiries', 'Enquiries', MessageSquare],
      ['teachers', 'Teachers', Users], ['accounts', 'Accounts & access', UserCog]]],
    ['Teaching', [['classes', 'Classes', CalendarDays], ['free-classes', 'Free Classes', Sparkles], ['languages', 'Languages & programmes', Languages], ['assessments', 'Placement tests', ClipboardCheck],
      ['attendance', 'Attendance & lessons', CheckSquare], ['bookings', 'One-to-one bookings', CalendarCheck], ['materials', 'Lesson materials', FolderOpen]]],
    ['Money', [['invoices', 'Invoices', FileText], ['payments', 'Payments', Wallet], ['receipts', 'Receipts', Receipt],
      ['salaries', 'Teacher salaries', Banknote], ['expenses', 'Expenses', PiggyBank]]],
    ['System', [['notifications', 'Notifications', Bell], ['automations', 'Automations', Zap], ['settings', 'Settings', Settings], ['audit', 'Audit log', ScrollText]]],
  ],
  teacher: [
    ['', [['', 'Dashboard', LayoutDashboard], ['classes', 'My classes', CalendarDays], ['students', 'My students', GraduationCap],
      ['attendance', 'Attendance', CheckSquare], ['schedule', 'My schedule', Clock], ['bookings', 'One-to-one', CalendarCheck],
      ['materials', 'Lesson materials', FolderOpen], ['progress', 'Learning progress', GraduationCap], ['salary', 'My salary', Banknote], ['notifications', 'Notifications', Bell], ['profile', 'Profile', User]]],
  ],
  student: [
    ['', [['', 'Dashboard', LayoutDashboard], ['profile', 'My profile', User], ['classes', 'My classes', BookOpen], ['schedule', 'My schedule', Clock],
      ['attendance', 'Attendance', CheckSquare], ['materials', 'Learning materials', FolderOpen], ['progress', 'My progress', GraduationCap], ['invoices', 'My invoices', FileText],
      ['payments', 'My payments', CreditCard], ['receipts', 'My receipts', Receipt], ['book', 'Book one-to-one', CalendarCheck],
      ['notifications', 'Notifications', Bell]]],
  ],
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-brand-cream/40 p-4">{children}</div>
}

export function PortalLayout({ role }: { role: Role }) {
  const { session, profile, role: myRole, loading, signOut, loginAsDemo } = useAuth()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!session || myRole !== role) return
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('read', false)
      .then(({ count }) => setUnread(count ?? 0))
  }, [session, myRole, role, location.pathname])

  if (loading) return <Shell><Loading /></Shell>
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!profile || profile.status !== 'active') {
    return (
      <Shell>
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-brand-cream-dark">
          <ShieldCheck className="mx-auto text-brand-pink" size={40} />
          <h1 className="mt-3 text-xl font-bold text-brand-navy">
            {!profile ? 'Your account is being set up' : profile.status === 'suspended' ? 'Your account is suspended' : 'Your account is not active'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {profile?.suspended_reason ?? 'Please contact us if you think this is a mistake.'} You can reach us at {settings.get('business.email')} or {settings.get('business.phone')}.
          </p>
          <Button className="mt-5" variant="ghost" onClick={() => signOut()}><LogOut size={16} />Sign out</Button>
        </div>
      </Shell>
    )
  }
  if (myRole !== role) return <Navigate to={`/${myRole}`} replace />

  const portalName = role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher portal' : 'Student portal'
  return (
    <div className="min-h-screen bg-brand-cream/30 md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">Skip to content</a>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-brand-navy px-4 py-3 text-white shadow-md md:hidden">
        <Link to={`/${role}`} className="flex items-center gap-2">
          <img src={LOGO_URL} alt="" className="h-8 w-8 rounded-lg object-cover" />
          <b className="tracking-tight">Top Mind</b><span className="text-xs text-brand-pink">{portalName}</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="rounded-lg p-1 hover:bg-white/10" aria-label={open ? 'Close menu' : 'Open menu'}>
          {open ? <X /> : <Menu />}
        </button>
      </div>

      <aside className={cx(open ? 'block' : 'hidden',
        'fixed inset-x-0 top-14 z-20 max-h-[calc(100vh-3.5rem)] overflow-auto bg-brand-navy p-4 text-white shadow-xl md:sticky md:top-0 md:block md:h-screen md:max-h-none md:w-64 md:shrink-0')}>
        <div className="mb-5 hidden items-center gap-3 border-b border-white/10 pb-4 md:flex">
          <img src={LOGO_URL} alt="" className="h-10 w-10 rounded-xl object-cover ring-2 ring-white/20" />
          <div>
            <b className="block text-sm font-bold leading-tight">Top Mind</b>
            <span className="text-xs font-medium text-brand-pink">{portalName}</span>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/15 bg-white/5 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90">
              <Sparkles size={12} className="text-brand-pink" />
              Role Switcher
            </span>
            <span className="rounded-full bg-brand-pink/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-pink">
              Demo Preview
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
            {(['admin', 'teacher', 'student'] as Role[]).map((r) => {
              const active = role === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    loginAsDemo(r)
                    navigate(`/${r}`)
                  }}
                  className={cx(
                    'rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition',
                    active ? 'bg-brand-pink text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>

        <nav className="space-y-4" aria-label="Portal">
          {NAV[role].map(([group, items]) => (
            <div key={group || 'main'}>
              {group && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{group}</div>}
              <div className="space-y-0.5">
                {items.map(([to, text, Icon]) => (
                  <NavLink key={to} end={to === ''} to={`/${role}${to ? `/${to}` : ''}`}
                    className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                      isActive ? 'border-l-4 border-brand-pink bg-white/15 pl-2 font-semibold text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white')}>
                    <Icon size={17} className="shrink-0 text-brand-pink/90" />
                    <span className="flex-1">{text}</span>
                    {to === 'notifications' && unread > 0 && <span className="rounded-full bg-brand-pink px-1.5 text-[11px] font-bold">{unread}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
          <div className="rounded-xl bg-white/5 p-2.5 text-xs">
            <span className="block truncate font-semibold">{profile.full_name || profile.email}</span>
            <span className="block truncate text-[11px] text-slate-400">{profile.email}</span>
          </div>
          <button onClick={() => signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-100">
            <LogOut size={17} />Sign out
          </button>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
