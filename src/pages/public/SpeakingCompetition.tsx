import { FormEvent, useState } from 'react'
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Copy,
  Globe,
  Mic,
  MessageCircle,
  Sparkles,
  Trophy,
  Users,
  Video,
} from 'lucide-react'
import {
  CompetitionCategory,
  CompetitionLanguage,
  CompetitionRegistration,
  createCompetitionRegistration,
} from '../../lib/mockData'
import { Alert, Badge, Button, Card, Label, Modal, Select, inputCls } from '../../components/ui'

const WHATSAPP_INQUIRY_URL =
  "https://wa.me/60105221300?text=Hi%20Top%20Mind,%20I'd%20like%20to%20enquire%20about%20the%20Speaking%20Competition!"

const CATEGORIES: {
  name: CompetitionCategory
  ages: string
  focus: string
  description: string
  format: string
}[] = [
  {
    name: 'Junior Stars',
    ages: 'Ages 7–12',
    focus: 'Storytelling & Show & Tell',
    description: 'Build stage poise early through imaginative stories, expressive voice, and memorable props.',
    format: '3–4 minutes prepared story · props encouraged',
  },
  {
    name: 'Youth Orators',
    ages: 'Ages 13–17',
    focus: 'Prepared & Impromptu Speeches',
    description: 'Craft clear arguments and think on your feet with a supportive impromptu round.',
    format: '4–5 mins prepared + 90s impromptu Q&A',
  },
  {
    name: 'Adult Communicators',
    ages: 'Ages 18+',
    focus: 'Persuasive & Professional Speaking',
    description: 'Refine vocal presence, persuasive storytelling, and workplace executive communication.',
    format: '5–6 mins keynote pitch or personal narrative',
  },
]

const LANGUAGES: { name: CompetitionLanguage; native: string; note: string }[] = [
  { name: 'English', native: 'English', note: 'General fluency & expressive clarity' },
  { name: 'Tamil', native: 'தமிழ் (Tamil)', note: 'Oratory articulation & cultural storytelling' },
  { name: 'Bahasa Melayu', native: 'Bahasa Melayu', note: 'Gaya penyampaian fasih & meyakinkan' },
]

const STAGES = [
  {
    step: 'Stage 01',
    title: 'Auditions',
    dates: 'Open Now · Rolling Review',
    detail: 'Submit a 2–3 minute audition video (YouTube or Google Drive) or attend a friendly Studio A live audition slot in Mont Kiara.',
  },
  {
    step: 'Stage 02',
    title: 'Semi-Finals',
    dates: 'December 2026',
    detail: 'Shortlisted speakers present live to Top Mind coaches and guest educators with constructive feedback for every contestant.',
  },
  {
    step: 'Stage 03',
    title: 'Grand Finale',
    dates: 'January 2027 Gala',
    detail: 'Category finalists take the main spotlight stage before families, mentors, and judges for championship honours.',
  },
]

const PRIZES = [
  { place: 'Champion', badge: '1st Place · Each Category', reward: 'RM 600 Cash Voucher + Grand Trophy + Certificate of Excellence', tone: 'pink' },
  { place: '1st Runner-Up', badge: '2nd Place · Each Category', reward: 'RM 350 Class Tuition Voucher + Silver Trophy + Official Certificate', tone: 'navy' },
  { place: '2nd Runner-Up', badge: '3rd Place · Each Category', reward: 'RM 200 Class Tuition Voucher + Bronze Trophy + Official Certificate', tone: 'emerald' },
  { place: 'Special Mention', badge: 'Audience & Language Distinction', reward: 'RM 100 Book Voucher + Best Language Expression Certificate', tone: 'amber' },
]

export default function SpeakingCompetition() {
  const [modalOpen, setModalOpen] = useState(false)
  const [preCategory, setPreCategory] = useState<CompetitionCategory>('Adult Communicators')

  const openRegister = (cat?: CompetitionCategory) => {
    if (cat) setPreCategory(cat)
    setModalOpen(true)
  }

  return (
    <div>
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy via-[#132c75] to-brand-navy px-4 py-16 text-white sm:py-24">
        <div className="pointer-events-none absolute -top-20 right-1/4 h-80 w-80 rounded-full bg-brand-pink/20 blur-3xl" />
        <div className="relative mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-cream ring-1 ring-white/15">
            <Trophy size={14} className="text-brand-pink" />
            Quarterly Multilingual Speaking Cup · Open for Entries
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl sm:leading-tight">
            Top Mind Annual Youth &amp; Adult <span className="text-brand-pink">Public Speaking Cup 2026</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
            Step onto a welcoming stage, share a story or persuasive idea in English, Tamil, or Bahasa Melayu, and grow fearless confidence with mentor feedback.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3.5">
            <Button
              variant="secondary"
              className="!rounded-xl !px-7 !py-3.5 !text-base shadow-lg shadow-brand-pink/30"
              onClick={() => openRegister()}
            >
              <Mic size={18} />Register for Competition
            </Button>
            <a
              href={WHATSAPP_INQUIRY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 sm:text-base"
            >
              <MessageCircle size={18} />WhatsApp Inquiry
            </a>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs text-slate-300">
            <span className="rounded-full bg-white/10 px-3 py-1">3 Age Divisions</span>
            <span className="rounded-full bg-white/10 px-3 py-1">English · தமிழ் · Bahasa Melayu</span>
            <span className="rounded-full bg-white/10 px-3 py-1">Video or Mont Kiara Live Auditions</span>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-pink">Competition Divisions</p>
            <h2 className="mt-1 text-2xl font-extrabold text-brand-navy sm:text-3xl">Choose Your Category</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <span key={l.name} className="inline-flex items-center gap-1.5 rounded-full border border-brand-cream-dark bg-white px-3 py-1 text-xs font-semibold text-brand-navy">
                <Globe size={12} className="text-brand-pink" />{l.native}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <Card key={cat.name} className="flex flex-col border-t-4 border-brand-pink transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <Badge tone="navy" text={cat.ages} />
                <Users size={18} className="text-brand-pink" />
              </div>
              <h3 className="mt-3 text-xl font-extrabold text-brand-navy">{cat.name}</h3>
              <p className="mt-0.5 text-sm font-semibold text-brand-pink">{cat.focus}</p>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-600">{cat.description}</p>
              <div className="mt-4 rounded-xl bg-brand-cream/60 px-3 py-2 text-xs font-medium text-brand-navy">
                {cat.format}
              </div>
              <Button className="mt-4 w-full justify-center" variant="ghost" onClick={() => openRegister(cat.name)}>
                Enter {cat.name}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* Supported Languages & Timeline */}
      <section className="border-y border-brand-cream-dark/60 bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-pink">Speak In Your Strength</p>
            <h2 className="mt-1 text-2xl font-extrabold text-brand-navy">Supported Languages</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Contestants are judged fairly within their chosen language track so beginners and seasoned speakers alike can shine.
            </p>
            <div className="mt-5 space-y-3">
              {LANGUAGES.map((l) => (
                <Card key={l.name} className="!bg-brand-cream/40 !p-4">
                  <div className="flex items-center justify-between">
                    <b className="text-brand-navy">{l.native}</b>
                    <Badge tone="pink" text={l.name} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{l.note}</p>
                </Card>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-pink">Road to the Finale</p>
            <h2 className="mt-1 text-2xl font-extrabold text-brand-navy">Competition Timeline &amp; Stages</h2>
            <div className="mt-5 space-y-4">
              {STAGES.map((st, idx) => (
                <Card key={st.step} className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-navy font-bold text-white">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-brand-navy">{st.title}</h3>
                      <Badge tone="sky" text={<span className="inline-flex items-center gap-1"><CalendarDays size={11} />{st.dates}</span>} />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{st.detail}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Prizes & Rewards */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-pink">
            <Award size={13} />
            Prizes &amp; Rewards
          </span>
          <h2 className="mt-2 text-2xl font-extrabold text-brand-navy sm:text-3xl">Cash Vouchers, Trophies &amp; Official Recognition</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRIZES.map((p) => (
            <Card key={p.place} className="text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-cream text-brand-pink">
                <Trophy size={22} />
              </div>
              <Badge tone={p.tone} text={p.badge} />
              <h3 className="mt-2 text-lg font-extrabold text-brand-navy">{p.place}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.reward}</p>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-3xl bg-gradient-to-r from-brand-navy to-brand-navy-light p-8 text-white shadow-xl md:flex-row">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sparkles size={20} className="text-brand-pink" />
              Ready to share your voice at the 2026 Cup?
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Submit your entry online in under 2 minutes and receive your SPK tracking code right away.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => openRegister()}>Register for Competition</Button>
            <a
              href={WHATSAPP_INQUIRY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <MessageCircle size={16} />WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {modalOpen && (
        <CompetitionRegisterModal
          defaultCategory={preCategory}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

function CompetitionRegisterModal({
  defaultCategory,
  onClose,
}: {
  defaultCategory: CompetitionCategory
  onClose: () => void
}) {
  const [f, setF] = useState({
    full_name: '',
    age: defaultCategory === 'Junior Stars' ? '10' : defaultCategory === 'Youth Orators' ? '15' : '24',
    category: defaultCategory,
    language: 'English' as CompetitionLanguage,
    speech_topic: '',
    audition_mode: 'Video Submission' as 'Video Submission' | 'In-Person Audition',
    video_url: '',
    phone: '',
    email: '',
  })
  const [err, setErr] = useState('')
  const [created, setCreated] = useState<CompetitionRegistration | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCategoryChange = (val: string) => {
    const cat = val as CompetitionCategory
    setF((prev) => ({ ...prev, category: cat }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (f.full_name.trim().length < 2) return setErr('Please enter your full name.')
    if (!Number(f.age) || Number(f.age) < 5) return setErr('Please enter a valid participant age.')
    if (f.speech_topic.trim().length < 3) return setErr('Please enter your planned speech topic or title.')
    if (f.audition_mode === 'Video Submission' && !f.video_url.trim()) {
      return setErr('Please paste a YouTube or Google Drive audition video link, or select In-Person Audition.')
    }
    if (!f.phone.trim()) return setErr('Please enter a WhatsApp phone number.')
    if (!f.email.trim() || !f.email.includes('@')) return setErr('Please enter a valid email address.')

    const record = createCompetitionRegistration({
      full_name: f.full_name,
      age: Number(f.age),
      category: f.category,
      language: f.language,
      speech_topic: f.speech_topic,
      audition_mode: f.audition_mode,
      video_url: f.audition_mode === 'Video Submission' ? f.video_url : '',
      phone: f.phone,
      email: f.email,
    })
    setCreated(record)
  }

  const copyCode = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.tracking_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked in restricted browser contexts.
    }
  }

  return (
    <Modal title={created ? 'Competition Entry Confirmed!' : 'Register for Speaking Competition'} onClose={onClose} wide>
      {created ? (
        <div className="space-y-5 py-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={30} />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-brand-navy">Thank you, {created.full_name}!</h3>
            <p className="mt-1 text-sm text-slate-600">
              Your entry for <b>{created.category}</b> ({created.language}) has been saved.
            </p>
          </div>
          <div className="mx-auto max-w-sm rounded-2xl border border-brand-pink/30 bg-brand-cream/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Tracking Code</div>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="font-mono text-2xl font-extrabold tracking-wider text-brand-navy">{created.tracking_code}</span>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy ring-1 ring-brand-cream-dark hover:bg-brand-cream"
              >
                {copied ? 'Copied!' : <span className="inline-flex items-center gap-1"><Copy size={12} />Copy</span>}
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500">Speech Topic: “{created.speech_topic}”</div>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={`https://wa.me/60105221300?text=${encodeURIComponent(`Hi Top Mind, I just registered for the Speaking Competition! My tracking code is ${created.tracking_code} (${created.full_name}).`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <MessageCircle size={16} />Share Code on WhatsApp
            </a>
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Full Name *" className="sm:col-span-2">
              <input
                className={inputCls}
                placeholder="Participant or child’s full name"
                value={f.full_name}
                onChange={(e) => setF({ ...f, full_name: e.target.value })}
              />
            </Label>
            <Label t="Category *">
              <Select
                value={f.category}
                onChange={handleCategoryChange}
                options={[
                  ['Junior Stars', 'Junior Stars (Ages 7–12)'],
                  ['Youth Orators', 'Youth Orators (Ages 13–17)'],
                  ['Adult Communicators', 'Adult Communicators (Ages 18+)'],
                ]}
              />
            </Label>
            <Label t="Participant Age *">
              <input
                type="number"
                min={5}
                max={99}
                className={inputCls}
                value={f.age}
                onChange={(e) => setF({ ...f, age: e.target.value })}
              />
            </Label>
            <Label t="Language Track *">
              <Select
                value={f.language}
                onChange={(v) => setF({ ...f, language: v as CompetitionLanguage })}
                options={['English', 'Tamil', 'Bahasa Melayu']}
              />
            </Label>
            <Label t="Audition Preference *">
              <Select
                value={f.audition_mode}
                onChange={(v) => setF({ ...f, audition_mode: v as 'Video Submission' | 'In-Person Audition' })}
                options={['Video Submission', 'In-Person Audition']}
              />
            </Label>
            <Label t="Speech Topic / Title *" className="sm:col-span-2">
              <input
                className={inputCls}
                placeholder="e.g., How One Conversation Changed My Perspective"
                value={f.speech_topic}
                onChange={(e) => setF({ ...f, speech_topic: e.target.value })}
              />
            </Label>
            {f.audition_mode === 'Video Submission' && (
              <Label
                t={<span className="inline-flex items-center gap-1"><Video size={12} className="text-brand-pink" />Video Submission Link (YouTube / Google Drive) *</span>}
                className="sm:col-span-2"
                hint="Share an unlisted YouTube link or view-only Google Drive URL (2–3 mins speaking clip)."
              >
                <input
                  type="url"
                  className={inputCls}
                  placeholder="https://youtu.be/... or https://drive.google.com/..."
                  value={f.video_url}
                  onChange={(e) => setF({ ...f, video_url: e.target.value })}
                />
              </Label>
            )}
            <Label t="WhatsApp Phone *">
              <input
                className={inputCls}
                placeholder="+60 12-345 6789"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </Label>
            <Label t="Email Address *">
              <input
                type="email"
                className={inputCls}
                placeholder="you@example.com"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </Label>
          </div>
          <Alert msg={err} />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="secondary">Submit Entry &amp; Get Tracking Code</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
