import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, CalendarCheck, ClipboardCheck, GraduationCap, HeartHandshake, MessageCircle, ShieldCheck, Sparkles, Target, Users, User } from 'lucide-react'
import { useSettings } from '../../lib/settings'
import { fmtDate } from '../../lib/format'
import { Card } from '../../components/ui'
import AchievementShowcase from '../../components/AchievementShowcase'
import { useContact } from './Layout'

const Page = ({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode }) => (
  <div className="mx-auto max-w-4xl px-4 py-14">
    {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-pink">{eyebrow}</p>}
    <h1 className="mt-1 text-3xl font-extrabold text-brand-navy sm:text-4xl">{title}</h1>
    {intro && <p className="mt-3 text-lg leading-relaxed text-slate-600">{intro}</p>}
    <div className="mt-8 space-y-6">{children}</div>
  </div>
)

const Point = ({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) => (
  <Card className="flex gap-4">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-cream text-brand-pink"><Icon size={20} /></div>
    <div><h2 className="font-bold text-brand-navy">{title}</h2><div className="mt-1 text-sm leading-relaxed text-slate-600">{children}</div></div>
  </Card>
)

export function About() {
  const s = useSettings()
  return (
    <Page eyebrow="About us" title={`About ${s.get('business.name')}`}
      intro="We started with online English classes for adults who wanted to speak with more confidence. Today we are growing into a multilingual learning hub, one welcoming class at a time.">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-t-4 border-brand-pink"><h2 className="font-bold text-brand-navy">Our mission</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{s.get('business.mission')}</p></Card>
        <Card className="border-t-4 border-brand-navy"><h2 className="font-bold text-brand-navy">Our vision</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{s.get('business.vision')}</p></Card>
      </div>
      <Point icon={Users} title="Who we teach">
        Right now our classes are for adults: people improving their English, strengthening their foundations, or preparing to use a language at work or in study.
        Classes for children and teenagers, and more languages, are part of our plans.
      </Point>
      <Point icon={HeartHandshake} title="What we value">
        Inclusivity, respect and empathy, creativity and interaction, continuous growth, and teaching that starts from the learner.
        Our classes should never feel intimidating, judgmental or overly formal.
      </Point>
      <div className="pt-4">
        <AchievementShowcase compact limit={4} />
      </div>
      <Link to="/approach" className="inline-flex items-center gap-1 font-semibold text-brand-pink hover:underline">How we teach <ArrowRight size={16} /></Link>
    </Page>
  )
}

export function Approach() {
  return (
    <Page eyebrow="Teaching approach" title="How we teach" intro="Structure gives you a clear path; a supportive class gives you the confidence to speak. We bring both together.">
      <Point icon={Users} title="Group classes">
        Structured lessons with interactive activities, quizzes and supportive practice. Every teacher follows the same Top Mind methodology, so the quality of your class does not depend on luck.
      </Point>
      <Point icon={User} title="One-to-one classes">
        Personalised lessons around your own learning objectives. Your teacher adapts activities to how you learn and keeps a record of your progress.
      </Point>
      <Point icon={ShieldCheck} title="A safe place to make mistakes">
        Mistakes are how languages are learned. Our classrooms are safe, non-judgmental, welcoming and encouraging, online and in person.
      </Point>
      <Point icon={ClipboardCheck} title="Placed at the right level">
        When you register you can take a short placement quiz covering vocabulary, grammar and reading. It does not assess speaking, so your teacher confirms your level in your first lessons, and we move you if another group suits you better.
      </Point>
      <Point icon={GraduationCap} title="Trained teachers">
        Our teachers are trained in our teaching methodology, brand values and expectations, so every student gets the same warm, consistent experience.
      </Point>
      <Point icon={Target} title="Progress you can see">
        Attendance, materials and your level history are in your student portal, so you can see how far you have come.
      </Point>
    </Page>
  )
}

export function OneToOne() {
  const s = useSettings()
  const c = useContact()
  const windowHours = s.num('booking.cancellation_window_hours') || 24
  return (
    <Page eyebrow="One-to-one lessons" title="Lessons built around you"
      intro="One-to-one lessons are for anyone who wants focused practice: preparing for an interview, a presentation, a move abroad, or simply learning at their own pace.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Point icon={Target} title="Your goals, your plan">Tell us what you want to achieve. Your teacher plans each lesson around it and tracks your progress.</Point>
        <Point icon={CalendarCheck} title="Book times that suit you">See your teacher's open times in the student portal and request the slot you want.</Point>
        <Point icon={Sparkles} title="Any of our languages">Choose a teacher for the language you are learning. Lengths and prices are shown when you book.</Point>
        <Point icon={BookOpenCheck} title="Reminders and records">You get a confirmation and a reminder before each lesson, and your attendance is kept in your portal.</Point>
      </div>
      <Card>
        <h2 className="font-bold text-brand-navy">How booking works</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li><Link to="/register" className="font-semibold text-brand-pink">Register</Link> and choose one-to-one as your format.</li>
          <li>Sign in to the student portal and open <b>Book one-to-one</b>.</li>
          <li>Pick a language, a teacher (or any available teacher), a length and a time.</li>
          <li>Your teacher confirms the request and you receive a confirmation.</li>
          <li>Need to change? Cancel or move a confirmed lesson up to {windowHours} hours before it starts. Inside that window, please contact us.</li>
        </ol>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Link to="/register" className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-pink-hover">Register</Link>
        <Link to="/login?next=/student/book" className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-light">Already a student? Book now</Link>
        <a href={c.whatsappUrl("Hi Top Mind, I'm interested in private 1-to-1 lessons")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"><MessageCircle size={16} />Ask us first</a>
      </div>
    </Page>
  )
}

const H = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-lg font-bold text-brand-navy">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mt-2 text-sm leading-relaxed text-slate-600">{children}</p>

export function Privacy() {
  const s = useSettings()
  const c = useContact()
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold text-brand-navy">Privacy policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {fmtDate(s.get('privacy.policy_updated'))}</p>
      <P>{c.name} ("we") respects your privacy and handles personal data in line with Malaysia's Personal Data Protection Act 2010 (PDPA). This notice explains what we collect, why, and the choices you have.</P>
      <H>What we collect</H>
      <P>When you register or enquire: your name, email, phone number, preferred contact method, the language and class you are interested in, your learning goals and availability, and (only when needed) your date of birth and a parent or guardian's name.
        As a student: your enrolments, placement results, attendance, invoices, payments and any payment slips you upload. As a teacher: employment, schedule and payment details. We do not collect or store card numbers.</P>
      <H>Why we use it</H>
      <P>To place you in the right class, run your lessons, send class and schedule updates, issue invoices and receipts, keep accurate records, and answer your questions. We only send marketing if you agreed to it, and only send WhatsApp messages if you opted in.</P>
      <H>Who can see it</H>
      <P>Our administrators, and your teachers for the classes they teach. Service providers that help us run the academy (secure database and hosting, email delivery, the WhatsApp Business Platform and, in future, a payment gateway) process data on our behalf. These providers may store data outside Malaysia. We never sell your personal data.</P>
      <H>How we protect it</H>
      <P>Access is limited by role and checked on our servers, files are private, connections are encrypted, and important changes are logged.</P>
      <H>How long we keep it</H>
      <P>Financial records (invoices, payments, receipts) are kept for as long as Malaysian tax and accounting rules require. Other records are kept while you study with us and for a limited time afterwards, then deleted or anonymised on request where the law allows.</P>
      <H>Your choices and rights</H>
      <P>You can ask to see the personal data we hold about you, correct it, or withdraw consent for marketing or WhatsApp messages at any time. Many details can be updated in your student portal. For anything else, contact us at <a href={`mailto:${c.email}`} className="text-brand-pink">{c.email}</a> or {c.phone}; we respond to access requests within 21 days.</P>
      <H>Children</H>
      <P>Learners under 18 register with a parent or guardian's knowledge and details.</P>
    </div>
  )
}

export function Terms() {
  const s = useSettings()
  const c = useContact()
  const windowHours = s.num('booking.cancellation_window_hours') || 24
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold text-brand-navy">Terms and conditions</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {fmtDate(s.get('privacy.policy_updated'))}</p>
      <H>Registration and placement</H>
      <P>Registering does not guarantee a place. We confirm your class after reviewing your registration and, where used, your placement quiz. If a class is full we will offer the waiting list or another class.</P>
      <H>Fees and payment</H>
      <P>Fees are shown on our website and on each invoice. Invoices are payable by the due date shown, by the methods listed on the invoice. A payment is confirmed once we have received it; uploading a payment slip does not by itself confirm payment. You receive a receipt for every confirmed payment.</P>
      <H>Missed lessons and changes</H>
      <P>Please let us know if you cannot attend. We may occasionally need to move or cancel a lesson; we will tell you as early as we can and arrange a replacement where possible.</P>
      <H>One-to-one lessons</H>
      <P>Confirmed one-to-one lessons can be cancelled or moved in the student portal up to {windowHours} hours before they start. Later changes must be arranged with us, and the lesson may be charged.</P>
      <H>Respect and safety</H>
      <P>Our classes are a safe, respectful space. We may remove anyone who harasses or discriminates against others. Online class links are for enrolled students only and must not be shared.</P>
      <H>Learning materials</H>
      <P>Materials we share are for your personal learning only and may not be copied or redistributed.</P>
      <H>Contact</H>
      <P>Questions about these terms: <a href={`mailto:${c.email}`} className="text-brand-pink">{c.email}</a> or {c.phone}.</P>
    </div>
  )
}
