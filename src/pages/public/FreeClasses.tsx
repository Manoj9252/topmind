import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CalendarDays, CheckCircle2, Clock, Copy, Check, MapPin, MessageCircle, Sparkles, User, Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { fmtClock, fmtDate, fmtDateTime } from '../../lib/format'
import { Alert, Badge, Button, Card, Label, Loading, Modal, inputCls } from '../../components/ui'
import { useContact } from './Layout'

interface PublicFreeClass {
  id: string
  title: string
  description: string | null
  instructor: string
  language: string
  target_audience: string | null
  mode: 'In-Person' | 'Online' | 'Hybrid'
  location: string | null
  starts_at: string
  ends_at: string
  image_url: string | null
  capacity: number | null
}

function sameDay(aIso: string, bIso: string) {
  const a = new Date(aIso)
  const b = new Date(bIso)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function PublicFreeClasses() {
  const c = useContact()
  const [selected, setSelected] = useState<PublicFreeClass | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const list = useLoad(
    () =>
      q<PublicFreeClass[]>(
        supabase
          .from('free_classes')
          .select('id, title, description, instructor, language, target_audience, mode, location, starts_at, ends_at, image_url, capacity')
          .eq('active', true)
          .order('starts_at', { ascending: true }),
      ),
    [],
  )

  // Purge sessions that expire while the visitor stays on the page.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const upcoming = (list.data ?? []).filter((fc) => new Date(fc.ends_at).getTime() > nowMs)

  const whatsAppHref = (fc: PublicFreeClass) => {
    const formattedDate = fmtDateTime(fc.starts_at)
    const msg = `Hi Top Mind Enterprise, I would like to reserve a free seat for the "${fc.title}" on ${formattedDate}!`
    return `${c.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  const generalWhatsAppHref = () => {
    const msg = 'Hi Top Mind Enterprise, I would like to ask about upcoming free classes and trial workshops!'
    return `${c.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy via-brand-navy to-brand-navy-light text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-cream ring-1 ring-white/20">
              <Sparkles size={14} className="text-brand-pink" />
              100% Free · No Commitment Required
            </span>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Free Trial Classes &amp; Open Workshops
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
              Meet our teachers, experience how our lessons feel in person or live online, and find the right class before enrolling.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        {list.loading && !list.data && <Loading text="Loading upcoming free classes…" />}
        {list.error && <Alert msg={list.error} />}

        {!list.loading && !list.error && upcoming.length === 0 && (
          <Card className="mx-auto max-w-2xl border-t-4 border-brand-pink p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-pink/10 text-brand-pink">
              <Sparkles size={26} />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-brand-navy">No free classes scheduled right now</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              We run free workshops throughout the year. Message us on WhatsApp to hear about our next open session, or explore our regular language programmes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={generalWhatsAppHref()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                <MessageCircle size={16} />
                Enquire via WhatsApp
              </a>
              <Link
                to="/classes"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-light"
              >
                Browse regular courses
                <ArrowRight size={16} />
              </Link>
            </div>
          </Card>
        )}

        {upcoming.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((fc) => {
              const live = nowMs >= new Date(fc.starts_at).getTime()
              return (
                <Card key={fc.id} className="flex flex-col overflow-hidden !p-0 transition hover:shadow-md">
                  {fc.image_url ? (
                    <div className="h-48 w-full bg-brand-cream">
                      <img src={fc.image_url} alt={fc.title} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-36 flex-col justify-between bg-gradient-to-br from-brand-navy to-brand-pink/80 p-5 text-white">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                        <Sparkles size={12} />
                        Free Workshop
                      </span>
                      <div className="text-xs font-medium text-white/80">{fc.mode}</div>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge text={fc.language} tone="navy" />
                      <Badge text={fc.mode} tone="sky" />
                      {live && <Badge text="Live Now" tone="pink" />}
                    </div>

                    {fc.target_audience && (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand-pink">
                        {fc.target_audience}
                      </p>
                    )}
                    <h2 className="mt-1.5 text-xl font-bold text-brand-navy">{fc.title}</h2>
                    {fc.description && (
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{fc.description}</p>
                    )}

                    <dl className="mt-5 space-y-2 border-t border-brand-cream-dark/60 pt-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2.5">
                        <CalendarDays size={16} className="shrink-0 text-brand-pink" />
                        <span className="font-medium text-brand-navy">
                          {fmtDate(fc.starts_at)}
                          {!sameDay(fc.starts_at, fc.ends_at) ? ` – ${fmtDate(fc.ends_at)}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Clock size={16} className="shrink-0 text-brand-pink" />
                        <span>
                          {fmtClock(fc.starts_at)} – {fmtClock(fc.ends_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <User size={16} className="shrink-0 text-slate-400" />
                        <span>Instructor: {fc.instructor}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <MapPin size={16} className="shrink-0 text-slate-400" />
                        <span>{fc.location || fc.mode}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Users size={16} className="shrink-0 text-slate-400" />
                        <span>{fc.capacity ? `Limited to ${fc.capacity} seats` : 'Open capacity'}</span>
                      </div>
                    </dl>

                    <div className="mt-6 flex flex-col gap-2.5">
                      <Button className="w-full" onClick={() => setSelected(fc)}>
                        Reserve Free Spot
                        <ArrowRight size={16} />
                      </Button>
                      <a
                        href={whatsAppHref(fc)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <MessageCircle size={16} />
                        Reserve via WhatsApp
                      </a>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {selected && (
        <ReserveSpotModal
          fc={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function ReserveSpotModal({ fc, onClose }: { fc: PublicFreeClass; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [trackingCode, setTrackingCode] = useState('')
  const [copied, setCopied] = useState(false)
  const act = useAction()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    act.run(async () => {
      if (!name.trim()) throw new Error('Please enter your full name.')
      if (!email.trim()) throw new Error('Please enter your email address.')
      const res = await rpc<{ tracking_code: string }>('reserve_free_class', {
        p_free_class: fc.id,
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone.trim() || null,
      })
      setTrackingCode(res.tracking_code)
    })
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard might be restricted in some browsers; code remains visible to copy manually.
    }
  }

  if (trackingCode) {
    return (
      <Modal title="Spot reserved!" onClose={onClose}>
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={30} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-brand-navy">You&apos;re in for {fc.title}</h4>
            <p className="mt-1 text-sm text-slate-600">
              {fmtDateTime(fc.starts_at)} · {fc.location || fc.mode}
            </p>
          </div>

          <div className="rounded-2xl border border-brand-cream-dark bg-brand-cream/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Tracking Code</div>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-brand-navy">{trackingCode}</span>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy ring-1 ring-brand-cream-dark hover:bg-brand-cream"
              >
                {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Keep this code handy — we&apos;ve also emailed your confirmation details.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link
              to={`/track?code=${encodeURIComponent(trackingCode)}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-cream px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-cream-dark"
            >
              View registration status
            </Link>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Reserve Free Spot" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl bg-brand-cream/60 p-3.5 text-sm">
          <div className="font-bold text-brand-navy">{fc.title}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            {fmtDateTime(fc.starts_at)} · Instructor: {fc.instructor}
          </div>
        </div>

        <Label t="Full Name">
          <input
            className={inputCls}
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Label>

        <Label t="Email Address">
          <input
            type="email"
            className={inputCls}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Label>

        <Label t="WhatsApp / Phone Number" hint="Optional — helpful for session reminders & venue details">
          <input
            type="tel"
            className={inputCls}
            placeholder="+60 12-345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Label>

        <Alert msg={act.error} />

        <div className="flex justify-end gap-2 border-t border-brand-cream-dark/60 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={act.busy}>
            Confirm Free Spot
          </Button>
        </div>
      </form>
    </Modal>
  )
}
