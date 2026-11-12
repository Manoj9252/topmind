import { FormEvent, useState } from 'react'
import { Instagram, Mail, MessageCircle, Phone } from 'lucide-react'
import { rpc, useAction } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { Alert, Button, Card, Label, Select, inputCls } from '../../components/ui'
import { TikTokIcon, useContact } from './Layout'

export default function Contact() {
  const c = useContact()
  const catalog = useCatalog()
  const act = useAction()
  const blank = { name: '', email: '', phone: '', language_id: '', message: '', website: '' }
  const [f, setF] = useState(blank)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    act.run(async () => { await rpc('submit_enquiry', { p: { ...f, source: 'website' } }); setF(blank) },
      'Thank you! We have received your message and emailed you a quick answer. Our team will follow up personally.')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-brand-navy sm:text-4xl">Contact us</h1>
        <p className="mt-2 text-slate-600">Questions about classes, fees or schedules? We are happy to help.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-4 border-t-4 border-brand-pink text-sm">
            <a href={c.tel} className="flex items-start gap-3"><Phone size={18} className="mt-0.5 text-brand-pink" /><span><b className="block text-brand-navy">Phone and WhatsApp</b>{c.phone}</span></a>
            <a href={`mailto:${c.email}`} className="flex items-start gap-3"><Mail size={18} className="mt-0.5 text-brand-pink" /><span><b className="block text-brand-navy">Email</b><span className="break-all">{c.email}</span></span></a>
            <a href={c.whatsapp} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500"><MessageCircle size={18} />Message us on WhatsApp</a>
          </Card>
          <Card className="space-y-2 text-sm">
            <b className="text-brand-navy">Follow us</b>
            <a href={c.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-brand-cream/60 px-4 py-2.5 hover:bg-brand-cream"><Instagram size={18} className="text-brand-pink" />Instagram</a>
            <a href={c.tiktok} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-brand-cream/60 px-4 py-2.5 hover:bg-brand-cream"><TikTokIcon className="h-4 w-4 text-brand-pink" />TikTok</a>
          </Card>
        </div>
        <Card className="p-6 lg:col-span-3">
          <h2 className="mb-1 text-xl font-bold text-brand-navy">Send us a message</h2>
          <p className="mb-5 text-sm text-slate-500">We reply by email, usually within one working day.</p>
          <form onSubmit={submit} className="space-y-4">
            <Label t="Your name *"><input className={inputCls} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label t="Email *"><input type="email" className={inputCls} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Label>
              <Label t="Phone / WhatsApp"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Label>
            </div>
            <Label t="Language you are interested in">
              <Select value={f.language_id} onChange={(v) => setF({ ...f, language_id: v })} placeholder="Not sure yet"
                options={(catalog.data?.languages ?? []).map((l) => [l.id, l.name + (l.is_active ? '' : ' (coming soon)')])} />
            </Label>
            <Label t="Your message *"><textarea rows={4} className={inputCls} required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })}
              placeholder="For example: Do you have evening English classes for beginners?" /></Label>
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
            <Alert msg={act.error} /><Alert msg={act.ok} ok />
            <Button type="submit" busy={act.busy} className="w-full py-3">Send message</Button>
            <p className="text-xs text-slate-400">By sending this form you agree that we may contact you about your enquiry, as described in our privacy policy.</p>
          </form>
        </Card>
      </div>
    </div>
  )
}
