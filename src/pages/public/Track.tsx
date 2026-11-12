import { FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { rpc, useAction } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import { Alert, Badge, Button, Card, inputCls } from '../../components/ui'
import { useContact } from './Layout'

export default function Track() {
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [res, setRes] = useState<any>(undefined)
  const act = useAction()
  const c = useContact()

  const check = (value: string) => act.run(async () => {
    const rows = await rpc<any[]>('track_registration', { code: value.trim() })
    setRes(rows?.[0] ?? null)
  })
  useEffect(() => { if (params.get('code')) check(params.get('code')!) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-center text-3xl font-extrabold text-brand-navy">Track your registration</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Enter the 10-character code from your confirmation email.</p>
      <Card className="mt-6 p-6">
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (code.trim()) check(code) }} className="flex gap-2">
          <input className={inputCls + ' uppercase'} placeholder="e.g. 7F3A9C21B0" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Tracking code" />
          <Button type="submit" busy={act.busy}>Check</Button>
        </form>
        <div className="mt-4"><Alert msg={act.error} /></div>
        {res === null && <div className="mt-4"><Alert msg="We could not find a registration with that code. Please check it and try again." /></div>}
        {res && (
          <div className="mt-6 space-y-2 border-t pt-4 text-sm">
            <div className="flex items-center justify-between"><b className="text-lg text-brand-navy">{res.student_name}</b><Badge v={res.status} /></div>
            {res.programme && <p className="text-slate-600">Programme: {res.programme}</p>}
            <p className="text-slate-600">Submitted {fmtDate(res.submitted_on)}</p>
            <p className="rounded-xl bg-brand-cream/60 p-3 text-slate-700">{res.next_step}</p>
            {res.assessment_token && <Link to={`/assessment/${res.assessment_token}`} className="inline-block font-semibold text-brand-pink hover:underline">Take your placement quiz</Link>}
            <p className="text-xs text-slate-400">Questions? Call or WhatsApp {c.phone}.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
