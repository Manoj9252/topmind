import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Copy, GraduationCap, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { supabase, configured } from '../../lib/supabase'
import { Role, useAuth } from '../../auth/AuthContext'
import { useAction } from '../../lib/api'
import { DEMO_ACCOUNTS } from '../../lib/mockData'
import { Alert, Button, Label, inputCls } from '../../components/ui'
import { appOriginUrl, cx, LOGO_URL } from '../../lib/util'

function Shell({ title, children, subtitle, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-navy via-[#122b75] to-brand-navy p-4 py-10">
      <div className={cx('w-full rounded-3xl bg-white p-6 shadow-2xl sm:p-8', wide ? 'max-w-4xl' : 'max-w-md')}>
        <div className="mb-4 text-center">
          <Link to="/"><img src={LOGO_URL} alt="Top Mind Enterprise home" className="mx-auto h-14 w-14 rounded-2xl object-cover shadow-md ring-2 ring-brand-pink/30" /></Link>
        </div>
        <h1 className="text-center text-2xl font-bold text-brand-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {!configured && (
          <div className="mt-5">
            <Alert tone="info" msg="Client Preview Mode is active — sign in with 1 click above or enter any demo account credentials." />
          </div>
        )}
        <Link to="/" className="mt-6 block text-center text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-brand-pink">← Back to the website</Link>
      </div>
    </div>
  )
}

// Only same-site paths are followed after sign-in.
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null)

const DEMO_CARDS: { role: Role; icon: any; accent: string }[] = [
  { role: 'admin', icon: ShieldCheck, accent: 'border-t-brand-navy' },
  { role: 'teacher', icon: Users, accent: 'border-t-brand-pink' },
  { role: 'student', icon: GraduationCap, accent: 'border-t-emerald-600' },
]

export function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { role, loading, loginAsDemo, loginWithDemoCredentials } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [copiedRole, setCopiedRole] = useState<Role | null>(null)
  const act = useAction()

  useEffect(() => {
    if (!loading && role) navigate(safeNext(params.get('next')) ?? `/${role}`, { replace: true })
  }, [role, loading, navigate, params])

  const handleOneClick = (targetRole: Role) => {
    loginAsDemo(targetRole)
    navigate(`/${targetRole}`, { replace: true })
  }

  const copyCreds = async (targetRole: Role) => {
    const acc = DEMO_ACCOUNTS[targetRole]
    try {
      await navigator.clipboard.writeText(`Portal: ${acc.portalTitle}\nEmail: ${acc.email}\nPassword: ${acc.password}`)
      setCopiedRole(targetRole)
      setTimeout(() => setCopiedRole(null), 2000)
    } catch {
      // Fallback: pre-fill the form so the user can inspect or submit easily.
      setEmail(acc.email)
      setPassword(acc.password)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    act.run(async () => {
      const matched = loginWithDemoCredentials(email, password)
      if (matched) {
        navigate(safeNext(params.get('next')) ?? `/${matched}`, { replace: true })
        return
      }
      if (!configured) {
        throw new Error('That email and password do not match any demo account. Use 1-Click Sign In above.')
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        throw new Error(
          /invalid login/i.test(error.message)
            ? 'That email and password do not match.'
            : /not confirmed/i.test(error.message)
              ? 'Please confirm your email first (check your inbox).'
              : error.message,
        )
      }
    })
  }

  return (
    <Shell title="Sign in" subtitle="Students, teachers and staff" wide>
      <div className="mb-7 rounded-2xl border border-brand-cream-dark bg-brand-cream/50 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-pink/15 text-brand-pink">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-brand-navy">Client Preview: 1-Click Sign In</h2>
              <p className="text-xs text-slate-500">Jump directly into any portal — no backend or password setup needed.</p>
            </div>
          </div>
          <span className="rounded-full bg-brand-navy px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
            Instant Demo
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {DEMO_CARDS.map(({ role: r, icon: Icon, accent }) => {
            const acc = DEMO_ACCOUNTS[r]
            const isCopied = copiedRole === r
            return (
              <div key={r} className={cx('flex flex-col justify-between rounded-2xl border border-brand-cream-dark border-t-4 bg-white p-4 shadow-sm', accent)}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={17} className="shrink-0 text-brand-navy" />
                      <span className="text-sm font-bold text-brand-navy">{acc.portalTitle}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyCreds(r)}
                      title={`Copy ${acc.label} credentials`}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-cream/70 px-2 py-1 text-[11px] font-semibold text-brand-navy transition hover:bg-brand-cream-dark"
                    >
                      {isCopied ? <><Check size={12} className="text-emerald-600" />Copied!</> : <><Copy size={12} />Copy</>}
                    </button>
                  </div>

                  <p className="mt-1.5 text-sm font-semibold text-brand-pink">{acc.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{acc.description}</p>

                  <div className="mt-3 space-y-1 rounded-xl bg-brand-cream/40 px-2.5 py-2 font-mono text-[11px] text-slate-700">
                    <div className="truncate"><span className="font-sans font-semibold text-slate-500">Email:</span> {acc.email}</div>
                    <div><span className="font-sans font-semibold text-slate-500">Pass:</span> {acc.password}</div>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="mt-4 w-full justify-center py-2"
                  onClick={() => handleOneClick(r)}
                >
                  Sign In as {acc.label} ➔
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-md border-t border-brand-cream-dark/70 pt-6">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Or sign in with email &amp; password</p>
        <form onSubmit={submit} className="space-y-4">
          <Label t="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Label>
          <Label t="Password"><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Label>
          <Alert msg={act.error} />
          <Button type="submit" className="w-full py-2.5" busy={act.busy}>Sign in</Button>
          <div className="flex justify-between text-xs">
            <Link to="/forgot" className="text-slate-500 hover:text-brand-pink">Forgot password?</Link>
            <Link to="/signup" className="font-medium text-brand-navy hover:text-brand-pink">Create a student account</Link>
          </div>
        </form>
      </div>
    </Shell>
  )
}

export function Signup() {
  const [f, setF] = useState({ name: '', email: '', password: '', consent: false })
  const act = useAction()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.consent) return act.setError('Please agree to the privacy policy.')
    act.run(async () => {
      if (!configured) return
      const { error } = await supabase.auth.signUp({
        email: f.email.trim(), password: f.password,
        options: { data: { full_name: f.name.trim() }, emailRedirectTo: appOriginUrl('login') },
      })
      if (error) throw error
    }, configured ? 'Account created. Please check your email and click the confirmation link, then sign in.' : 'Preview notice: use Student 1-Click Sign In on the login page to explore the Student Portal.')
  }
  return (
    <Shell title="Create a student account" subtitle="Use the same email you registered with, so we can link your classes.">
      {act.ok ? <Alert ok msg={act.ok} /> : (
        <form onSubmit={submit} className="space-y-4">
          <Label t="Full name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" /></Label>
          <Label t="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" /></Label>
          <Label t="Password" hint="At least 8 characters."><input className={inputCls} type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="new-password" /></Label>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" className="mt-1 accent-brand-pink" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            <span>I agree to the <Link to="/privacy" target="_blank" className="text-brand-pink">privacy policy</Link> and <Link to="/terms" target="_blank" className="text-brand-pink">terms</Link>.</span>
          </label>
          <Alert msg={act.error} />
          <Button type="submit" className="w-full" busy={act.busy}>Create account</Button>
          <p className="text-center text-xs text-slate-500">Not registered for a class yet? <Link to="/register" className="font-semibold text-brand-pink">Register first</Link>.</p>
        </form>
      )}
    </Shell>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const act = useAction()
  return (
    <Shell title="Reset your password" subtitle="We will email you a link to choose a new password.">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        act.run(async () => {
          if (!configured) return
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appOriginUrl('reset') })
          if (error) throw error
        }, 'If an account exists for that email, a reset link is on its way.')
      }}>
        <Label t="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Label>
        <Alert msg={act.error} /><Alert ok msg={act.ok} />
        <Button type="submit" className="w-full" busy={act.busy}>Send reset link</Button>
        <Link to="/login" className="block text-center text-sm text-brand-navy hover:text-brand-pink">Back to sign in</Link>
      </form>
    </Shell>
  )
}

// Reached from a password-reset or invitation email (Supabase signs the user in).
export function Reset() {
  const { session, loading } = useAuth()
  const [p, setP] = useState('')
  const [p2, setP2] = useState('')
  const act = useAction()
  const navigate = useNavigate()
  return (
    <Shell title="Choose a new password">
      {!loading && !session ? (
        <Alert msg={<>This link has expired or was already used. <Link to="/forgot" className="underline">Request a new one</Link>.</>} />
      ) : act.ok ? (
        <div className="space-y-4"><Alert ok msg={act.ok} /><Button className="w-full" onClick={() => navigate('/login')}>Continue</Button></div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault()
          if (p !== p2) return act.setError('The passwords do not match.')
          act.run(async () => {
            if (!configured) return
            const { error } = await supabase.auth.updateUser({ password: p })
            if (error) throw error
          }, 'Your password has been saved.')
        }}>
          <Label t="New password" hint="At least 8 characters."><input className={inputCls} type="password" minLength={8} value={p} onChange={(e) => setP(e.target.value)} required autoComplete="new-password" /></Label>
          <Label t="Repeat new password"><input className={inputCls} type="password" minLength={8} value={p2} onChange={(e) => setP2(e.target.value)} required autoComplete="new-password" /></Label>
          <Alert msg={act.error} />
          <Button type="submit" className="w-full" busy={act.busy}>Save password</Button>
        </form>
      )}
    </Shell>
  )
}
