import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock, Heart, MapPin, MessageCircle, Sparkles, Sprout, Users, User, Smile, Target, Instagram } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, useLoad } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { useSettings } from '../../lib/settings'
import { fmtClock, fmtDate } from '../../lib/format'
import { Badge, Card } from '../../components/ui'
import VocabularyWidget from '../../components/VocabularyWidget'
import AchievementShowcase from '../../components/AchievementShowcase'
import { TikTokIcon, useContact } from './Layout'

const VALUES: [any, string, string][] = [
  [Heart, 'Inclusive', 'Everyone is welcome, whatever your background or starting point.'],
  [Smile, 'Respect and empathy', 'Patient teachers and classmates who are learning too.'],
  [Sparkles, 'Creative and interactive', 'Activities, games and real conversations, not just textbooks.'],
  [Sprout, 'Always growing', 'Small steps every week, and you can see your progress.'],
  [Target, 'Built around you', 'Your goals shape what we practise: work, study or everyday life.'],
]

export default function Home() {
  const catalog = useCatalog()
  const s = useSettings()
  const c = useContact()
  const freeClasses = useLoad(
    () =>
      q<any[]>(
        supabase
          .from('free_classes')
          .select('id, title, description, instructor, language, target_audience, mode, location, starts_at, ends_at, image_url')
          .eq('active', true)
          .gt('ends_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(3),
      ),
    [],
  )
  const upcomingFree = (freeClasses.data ?? []).filter((fc) => new Date(fc.ends_at).getTime() > Date.now())
  const languages = catalog.data?.languages ?? []
  const open = languages.filter((l) => l.is_active)
  const soon = languages.filter((l) => !l.is_active)
  const classCount = open.reduce((n, l) => n + l.programmes.reduce((m, p) => m + p.classes.length, 0), 0)

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy via-[#10296e] to-brand-navy px-4 py-20 text-center text-white sm:py-28">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-pink/15 blur-3xl" />
        <div className="relative mx-auto max-w-4xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-brand-cream ring-1 ring-white/15">
            <Sparkles size={14} className="text-brand-pink" />{s.get('business.tagline')}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl sm:leading-tight">
            Speak with confidence.<br /><span className="text-brand-pink">Learn without fear.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">
            {c.name} helps adults build strong language foundations in a friendly, supportive class, so you can communicate confidently at work, in study and in everyday life.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-brand-pink px-7 py-3.5 font-semibold text-white shadow-lg shadow-brand-pink/30 transition hover:bg-brand-pink-hover">
              Register now <ArrowRight size={18} />
            </Link>
            <Link to="/classes" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-7 py-3.5 font-semibold text-white transition hover:bg-white/15">
              See our classes
            </Link>
            <Link to="/free-classes" className="inline-flex items-center gap-2 rounded-xl border border-brand-pink/50 bg-brand-pink/15 px-7 py-3.5 font-semibold text-white transition hover:bg-brand-pink/25">
              <Sparkles size={18} className="text-brand-pink" />
              Free Classes
            </Link>
          </div>
        </div>
      </section>

      {upcomingFree.length > 0 && (
        <section className="border-b border-brand-cream-dark/70 bg-gradient-to-b from-brand-cream/70 to-white">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-pink">
                  <Sparkles size={12} />
                  100% Free · No Commitment Required
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-brand-navy sm:text-3xl">Upcoming Free Classes &amp; Workshops</h2>
              </div>
              <Link to="/free-classes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">
                View all free workshops <ArrowRight size={15} />
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {upcomingFree.map((fc) => (
                <Link key={fc.id} to="/free-classes" className="group block">
                  <Card className="flex h-full flex-col overflow-hidden !p-0 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                    {fc.image_url ? (
                      <img src={fc.image_url} alt={fc.title} className="h-40 w-full object-cover" />
                    ) : (
                      <div className="flex h-24 items-center justify-between bg-gradient-to-r from-brand-navy to-brand-pink/80 px-5 text-white">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                          <Sparkles size={14} /> Free Session
                        </span>
                        <span className="text-xs text-white/80">{fc.mode}</span>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge text={fc.language} tone="navy" />
                        <Badge text={fc.mode} tone="sky" />
                      </div>
                      <h3 className="mt-2.5 text-lg font-bold text-brand-navy group-hover:text-brand-pink">{fc.title}</h3>
                      {fc.target_audience && <p className="mt-0.5 text-xs font-medium text-brand-pink">{fc.target_audience}</p>}
                      <div className="mt-auto space-y-1.5 pt-4 text-xs text-slate-600">
                        <div className="flex items-center gap-2"><CalendarDays size={14} className="text-brand-pink" />{fmtDate(fc.starts_at)}</div>
                        <div className="flex items-center gap-2"><Clock size={14} className="text-brand-pink" />{fmtClock(fc.starts_at)} – {fmtClock(fc.ends_at)}</div>
                        <div className="flex items-center gap-2"><User size={14} className="text-slate-400" />{fc.instructor}</div>
                        <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{fc.location || fc.mode}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-t-4 border-brand-pink">
            <h2 className="text-lg font-bold text-brand-navy">Our mission</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{s.get('business.mission')}</p>
          </Card>
          <Card className="border-t-4 border-brand-navy">
            <h2 className="text-lg font-bold text-brand-navy">Our vision</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{s.get('business.vision')}</p>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="text-2xl font-extrabold text-brand-navy">Languages you can learn</h2>
        <p className="mt-1 text-slate-600">{classCount ? `${classCount} class${classCount === 1 ? '' : 'es'} open for registration right now.` : 'New classes open regularly. Register your interest and we will place you.'}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((l) => (
            <Link key={l.id} to={`/languages/${l.slug}`} className="group">
              <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <div className="flex items-center justify-between"><b className="text-lg text-brand-navy">{l.name}</b><ArrowRight size={18} className="text-brand-pink" /></div>
                <p className="mt-2 text-sm text-slate-600">{l.description}</p>
                <p className="mt-3 text-xs font-medium text-slate-400">{l.programmes.map((p) => p.name).join(' · ') || 'Programmes coming soon'}</p>
              </Card>
            </Link>
          ))}
          {catalog.loading && !languages.length && <p className="text-sm text-slate-400">Loading languages…</p>}
        </div>
        {soon.length > 0 && <p className="mt-4 text-sm text-slate-500">Coming soon: {soon.map((l) => l.name).join(', ')}. <Link to="/contact" className="font-semibold text-brand-pink hover:underline">Tell us you are interested</Link>.</p>}
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2">
          <Card className="bg-brand-cream/40">
            <Users className="text-brand-pink" />
            <h3 className="mt-3 text-lg font-bold text-brand-navy">Small group classes</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Structured lessons with interactive activities, quizzes and plenty of supportive practice. You learn with people at your level, so nobody is left behind.</p>
            <Link to="/classes" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">View classes and fees <ArrowRight size={14} /></Link>
          </Card>
          <Card className="bg-brand-cream/40">
            <User className="text-brand-pink" />
            <h3 className="mt-3 text-lg font-bold text-brand-navy">One-to-one lessons</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Personal lessons built around your own goals, at times that suit you, with progress you can track.</p>
            <Link to="/one-to-one" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">How one-to-one works <ArrowRight size={14} /></Link>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-pink">
              <Sparkles size={12} />
              Interactive Practice
            </span>
            <h2 className="mt-2 text-2xl font-extrabold text-brand-navy sm:text-3xl">Build Your Daily Vocabulary</h2>
            <p className="mt-1 text-sm text-slate-600">Switch between English, Tamil, and Bahasa Melayu and listen to authentic pronunciation.</p>
          </div>
          <Link to="/free-classes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">
            Join a live speaking session <ArrowRight size={15} />
          </Link>
        </div>
        <VocabularyWidget variant="public" />
      </section>

      <section className="border-y border-brand-cream-dark/60 bg-white/80 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <AchievementShowcase limit={4} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-extrabold text-brand-navy">Why learn with Top Mind</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {VALUES.map(([Icon, title, text]) => (
            <Card key={title} className="!p-4">
              <Icon className="text-brand-pink" size={22} />
              <b className="mt-2 block text-brand-navy">{title}</b>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-slate-600">
          Not sure where to start? Take a short placement quiz when you register and we will suggest the right class. <Link to="/approach" className="font-semibold text-brand-pink hover:underline">Read about our teaching approach</Link>.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-gradient-to-r from-brand-navy to-brand-navy-light p-8 text-white shadow-xl md:flex-row">
          <div>
            <h2 className="text-xl font-bold">Ready to start, or have a question?</h2>
            <p className="mt-1 text-sm text-slate-300">Register in a few minutes, message us on WhatsApp, or follow us for tips and class highlights.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/register" className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-semibold hover:bg-brand-pink-hover">Register</Link>
            <a href={c.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-500"><MessageCircle size={16} />WhatsApp</a>
            <a href={c.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25"><Instagram size={16} />Instagram</a>
            <a href={c.tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25"><TikTokIcon />TikTok</a>
          </div>
        </div>
      </section>
    </div>
  )
}
