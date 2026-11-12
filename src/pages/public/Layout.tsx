import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Instagram, Mail, Menu, MessageCircle, Phone, X } from 'lucide-react'
import { useSettings } from '../../lib/settings'
import { useAuth } from '../../auth/AuthContext'
import { cx, LOGO_URL } from '../../lib/util'

export function TikTokIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.45c.298-.29.56-.615.78-.97V11.2a8.16 8.16 0 0 0 4.95 1.66V9.41a4.79 4.79 0 0 1-1-.03 4.87 4.87 0 0 1-2.92-1.74l-.08-.95z" />
    </svg>
  )
}

export function useContact() {
  const s = useSettings()
  const phone = s.get('business.phone')
  const whatsappNumber = s.get('business.whatsapp').replace(/\D/g, '') || '60105221300'
  return {
    name: s.get('business.name'),
    email: s.get('business.email'),
    phone,
    tel: `tel:${phone.replace(/[^\d+]/g, '')}`,
    whatsappNumber,
    whatsapp: `https://wa.me/${whatsappNumber}`,
    whatsappUrl: (text: string) => `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`,
    instagram: s.get('business.instagram_url'),
    tiktok: s.get('business.tiktok_url'),
    address: s.get('business.address'),
  }
}

const LINKS: [string, string][] = [
  ['/', 'Home'],
  ['/about', 'About'],
  ['/classes', 'Our classes'],
  ['/free-classes', 'Free Classes'],
  ['/speaking-competition', 'Speaking Cup'],
  ['/one-to-one', 'One-to-one'],
  ['/approach', 'Teaching approach'],
  ['/contact', 'Contact'],
]

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const c = useContact()
  const { role } = useAuth()
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [pathname])

  return (
    <div className="flex min-h-screen flex-col bg-brand-cream/30 text-slate-800">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">Skip to content</a>
      <div className="bg-brand-navy text-xs text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <a href={c.tel} className="flex items-center gap-1.5 hover:text-brand-pink"><Phone size={13} className="text-brand-pink" />{c.phone}</a>
            <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-brand-pink"><Mail size={13} className="text-brand-pink" />{c.email}</a>
          </div>
          <div className="flex items-center gap-3">
            <a href={c.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand-pink"><Instagram size={14} className="text-brand-pink" /><span className="hidden sm:inline">Instagram</span></a>
            <a href={c.tiktok} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand-pink"><TikTokIcon className="h-3.5 w-3.5 text-brand-pink" /><span className="hidden sm:inline">TikTok</span></a>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Top Mind Enterprise" className="h-10 w-10 rounded-xl object-cover ring-2 ring-brand-navy/10" />
            <div>
              <span className="block text-base font-bold leading-none tracking-tight text-brand-navy">Top Mind</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-brand-pink">Enterprise</span>
            </div>
          </Link>
          <nav aria-label="Main" className={cx(open ? 'flex' : 'hidden',
            'absolute inset-x-0 top-full flex-col gap-3 border-b bg-white p-5 text-sm shadow-xl lg:static lg:flex lg:flex-row lg:items-center lg:gap-4 lg:border-0 lg:p-0 lg:shadow-none')}>
            {LINKS.map(([to, text]) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => (isActive ? 'whitespace-nowrap font-semibold text-brand-pink' : 'whitespace-nowrap text-slate-600 transition hover:text-brand-navy')}>{text}</NavLink>
            ))}
            <div className="flex flex-col gap-2 pt-2 lg:ml-2 lg:flex-row lg:items-center lg:pt-0">
              {role ? (
                <Link to={`/${role}`} className="rounded-xl px-3.5 py-2 text-center font-semibold text-brand-navy hover:text-brand-pink">My portal</Link>
              ) : (
                <Link to="/login" className="rounded-xl px-3.5 py-2 text-center font-semibold text-brand-navy hover:text-brand-pink">Log in</Link>
              )}
              <Link to="/register" className="rounded-xl bg-brand-pink px-4 py-2 text-center font-semibold text-white shadow-md shadow-brand-pink/25 transition hover:bg-brand-pink-hover">Register</Link>
            </div>
          </nav>
          <button className="rounded-lg p-1 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="content" className="flex-1"><Outlet /></main>

      <footer className="mt-16 border-t-4 border-brand-pink bg-brand-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="" className="h-11 w-11 rounded-xl object-cover ring-2 ring-brand-pink" />
              <div><b className="block text-lg leading-tight">{c.name}</b><p className="text-xs text-brand-cream/80">Language learning hub</p></div>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-slate-300">
              Friendly, structured language classes for adults, online and in small groups or one-to-one. A safe place to practise, ask questions and make mistakes.
            </p>
            <div className="flex items-center gap-3">
              <a href={c.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-brand-pink"><Instagram size={18} /></a>
              <a href={c.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-brand-pink"><TikTokIcon /></a>
              <a href={c.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-emerald-500"><MessageCircle size={18} /></a>
            </div>
          </div>
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-pink">Learn with us</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li><Link to="/classes" className="hover:text-white">Our classes</Link></li>
              <li><Link to="/free-classes" className="hover:text-white">Free Classes</Link></li>
              <li><Link to="/speaking-competition" className="hover:text-white">Speaking Competition</Link></li>
              <li><Link to="/languages" className="hover:text-white">All languages</Link></li>
              <li><Link to="/one-to-one" className="hover:text-white">One-to-one lessons</Link></li>
              <li><Link to="/register" className="hover:text-white">Register</Link></li>
              <li><Link to="/track" className="hover:text-white">Track my registration</Link></li>
              <li><Link to="/login" className="hover:text-white">Student & teacher portal</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-pink">Get in touch</h2>
            <ul className="space-y-3 text-sm text-slate-300">
              <li><a href={c.tel} className="hover:text-white">{c.phone}</a><div className="text-xs text-slate-400">Call or WhatsApp</div></li>
              <li><a href={`mailto:${c.email}`} className="break-all hover:text-white">{c.email}</a></li>
              {c.address && <li>{c.address}</li>}
              <li><a href={c.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"><MessageCircle size={14} />Chat on WhatsApp</a></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} {c.name}. All rights reserved.</p>
          <p className="flex gap-4"><Link to="/privacy" className="hover:text-white">Privacy policy</Link><Link to="/terms" className="hover:text-white">Terms and conditions</Link></p>
        </div>
      </footer>
    </div>
  )
}
