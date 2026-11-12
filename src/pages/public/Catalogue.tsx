import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, ClipboardCheck, MapPin, MessageCircle, Monitor, Users } from 'lucide-react'
import { CatalogClass, feeText, Language, Programme, useCatalog } from '../../lib/catalog'
import { useCurrency } from '../../lib/settings'
import { fmtDate } from '../../lib/format'
import { Alert, Badge, Card, Empty, Loading } from '../../components/ui'
import { useContact } from './Layout'

function ClassRow({ c }: { c: CatalogClass }) {
  const sym = useCurrency()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-cream-dark/70 bg-white p-3 text-sm">
      <div>
        <b className="text-brand-navy">{c.name}</b>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{c.schedule}</span>
          <span className="inline-flex items-center gap-1">{c.mode === 'online' ? <Monitor size={13} /> : <MapPin size={13} />}{c.mode === 'online' ? 'Online' : c.mode === 'hybrid' ? 'Online or in person' : 'In person'}</span>
          {c.level && <span>{c.level}</span>}
          {c.start_date && <span>Starts {fmtDate(c.start_date)}</span>}
          {c.teacher && <span>Teacher: {c.teacher}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-brand-pink">{feeText(c.fee, c.billing_frequency, sym)}</div>
        {c.spaces_left > 0 ? <Badge v="active" text={`${c.spaces_left} place${c.spaces_left === 1 ? '' : 's'} left`} /> : <Badge v="waitlisted" text="Full: join the waiting list" />}
      </div>
    </div>
  )
}

function ProgrammeCard({ p, language }: { p: Programme; language: Language }) {
  const sym = useCurrency()
  const contact = useContact()
  return (
    <Card className="border-t-4 border-brand-pink">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to={`/programmes/${p.slug}`} className="text-xl font-bold text-brand-navy hover:text-brand-pink">{p.name}</Link>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{language.name} · {p.audience === 'all' ? 'All ages' : p.audience}</p>
        </div>
        <div className="flex gap-1">{p.formats.map((f) => <Badge key={f} v={f} />)}</div>
      </div>
      {(p.summary || p.description) && <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.summary || p.description}</p>}
      {p.levels.length > 0 && (
        <div className="mt-4 rounded-xl bg-brand-cream/50 p-3">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-navy">Levels and standard fees</span>
          <ul className="space-y-1 text-sm">
            {p.levels.map((l) => (
              <li key={l.id} className="flex justify-between gap-3"><span>{l.name}</span><b className="text-brand-pink">{feeText(l.monthly_fee, 'monthly', sym)}</b></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {p.classes.length ? p.classes.map((c) => <ClassRow key={c.id} c={c} />)
          : <p className="text-sm text-slate-500">No class is open right now. Register and we will place you in the next one.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <Link to={`/register?language=${language.id}&programme=${p.id}`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light">Register for {p.name}</Link>
        <a
          href={contact.whatsappUrl(`Hi Top Mind, I'd like to ask about ${p.name}`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <MessageCircle size={15} />
          Ask on WhatsApp
        </a>
        {p.has_assessment && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><ClipboardCheck size={14} />Includes a short placement quiz</span>}
      </div>
    </Card>
  )
}

export function Classes() {
  const catalog = useCatalog()
  const langs = (catalog.data?.languages ?? []).filter((l) => l.is_active)
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-extrabold text-brand-navy">Our classes</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Every class is small, friendly and structured. Fees and timetables below are always up to date. Times are in Malaysia time.</p>
      <Alert msg={catalog.error} />
      {catalog.loading && !catalog.data ? <Loading /> : !langs.length ? <Empty text="Classes will appear here soon." /> : langs.map((l) => (
        <section key={l.id} className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-2xl font-bold text-brand-navy">{l.name}</h2>
            <Link to={`/languages/${l.slug}`} className="text-sm font-semibold text-brand-pink hover:underline">About {l.name} classes</Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {l.programmes.length ? l.programmes.map((p) => <ProgrammeCard key={p.id} p={p} language={l} />) : <p className="text-sm text-slate-500">Programmes are being prepared.</p>}
          </div>
        </section>
      ))}
      <Card className="mt-10 flex flex-col items-start gap-3 bg-brand-cream/50 sm:flex-row sm:items-center sm:justify-between">
        <div><b className="text-brand-navy">Prefer learning one-to-one?</b><p className="text-sm text-slate-600">Personal lessons around your own goals and timetable.</p></div>
        <Link to="/one-to-one" className="inline-flex items-center gap-1 rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white">One-to-one lessons <ArrowRight size={14} /></Link>
      </Card>
    </div>
  )
}

export function LanguagesIndex() {
  const catalog = useCatalog()
  const langs = catalog.data?.languages ?? []
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-3xl font-extrabold text-brand-navy">Languages</h1>
      <p className="mt-2 text-slate-600">We are growing into a multilingual learning hub. Here is everything we teach now, and what is coming next.</p>
      {catalog.loading && !catalog.data ? <Loading /> : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {langs.map((l) => (
            <Card key={l.id}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-lg text-brand-navy">{l.name}</b>
                {l.is_active ? <Badge v="active" text="Open" /> : <Badge v="pending" text="Coming soon" />}
              </div>
              <p className="mt-2 text-sm text-slate-600">{l.description}</p>
              {l.is_active
                ? <Link to={`/languages/${l.slug}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">See {l.name} classes <ArrowRight size={14} /></Link>
                : <Link to="/contact" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-pink hover:underline">Register your interest <ArrowRight size={14} /></Link>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export function LanguagePage() {
  const { slug } = useParams()
  const catalog = useCatalog()
  if (catalog.loading && !catalog.data) return <Loading />
  const l = catalog.data?.languages.find((x) => x.slug === slug)
  if (!l) return <div className="mx-auto max-w-3xl px-4 py-16"><Empty text="We could not find that language."><Link to="/languages" className="text-brand-pink">See all languages</Link></Empty></div>
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-pink">Learn {l.name}</p>
      <h1 className="mt-1 text-3xl font-extrabold text-brand-navy sm:text-4xl">{l.name} classes</h1>
      {l.description && <p className="mt-3 max-w-2xl text-lg text-slate-600">{l.description}</p>}
      {!l.is_active ? (
        <Card className="mt-8"><b className="text-brand-navy">{l.name} classes are coming soon.</b>
          <p className="mt-1 text-sm text-slate-600">Leave your details and we will tell you when the first class opens.</p>
          <Link to="/contact" className="mt-3 inline-block rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white">Register interest</Link></Card>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {l.programmes.length ? l.programmes.map((p) => <ProgrammeCard key={p.id} p={p} language={l} />)
            : <Card><p className="text-sm text-slate-600">Programmes for {l.name} are being prepared. <Link to={`/register?language=${l.id}`} className="font-semibold text-brand-pink">Register your interest</Link>.</p></Card>}
        </div>
      )}
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[[Users, 'Small, supportive groups', 'Learn with people at your level, with time to speak in every lesson.'],
          [Monitor, 'Online or in person', 'Join from home, or at our learning centre where available.'],
          [ClipboardCheck, 'Placed at the right level', 'A short quiz and a chat with your teacher help us place you well.']].map(([Icon, t, d]: any) => (
          <Card key={t} className="!p-4"><Icon className="text-brand-pink" size={20} /><b className="mt-2 block text-brand-navy">{t}</b><p className="mt-1 text-sm text-slate-600">{d}</p></Card>
        ))}
      </div>
    </div>
  )
}

export function ProgrammePage() {
  const { slug } = useParams()
  const catalog = useCatalog()
  if (catalog.loading && !catalog.data) return <Loading />
  const found = catalog.data?.languages.flatMap((l) => l.programmes.map((p) => ({ p, l }))).find((x) => x.p.slug === slug)
  if (!found) return <div className="mx-auto max-w-3xl px-4 py-16"><Empty text="We could not find that programme."><Link to="/classes" className="text-brand-pink">See all classes</Link></Empty></div>
  const { p, l } = found
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-pink">{l.name}</p>
      <h1 className="mt-1 text-3xl font-extrabold text-brand-navy sm:text-4xl">{p.name}</h1>
      {p.description && <p className="mt-3 whitespace-pre-line text-lg text-slate-600">{p.description}</p>}
      <div className="mt-8"><ProgrammeCard p={p} language={l} /></div>
    </div>
  )
}
