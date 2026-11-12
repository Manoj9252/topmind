import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock } from 'lucide-react'
import { rpc, useAction, useLoad } from '../../lib/api'
import { label } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Button, Card, Loading, inputCls } from '../../components/ui'

type Question = { id: string; section: string; kind: 'mcq' | 'short_text' | 'writing'; prompt: string; passage: string | null; media_url: string | null; options: string[] | null }

function Result({ r }: { r: any }) {
  return (
    <Card className="p-8">
      <CheckCircle2 className="text-emerald-500" size={44} />
      <h2 className="mt-3 text-2xl font-bold text-brand-navy">Thank you, your answers are in</h2>
      {r.percent != null && <p className="mt-2 text-lg text-slate-700">You answered <b>{Number(r.percent)}%</b> of the scored questions correctly.</p>}
      {r.level && <p className="mt-1 text-slate-700">Suggested level: <b>{r.level.name}</b></p>}
      {r.recommended_class && <p className="mt-1 text-slate-700">Suggested class: <b>{r.recommended_class.name}</b> ({r.recommended_class.schedule})</p>}
      {r.writing_pending && <p className="mt-3 text-sm text-slate-600">A teacher will read your written answer before confirming your level.</p>}
      <p className="mt-4 rounded-xl bg-brand-cream/60 p-3 text-sm text-slate-600">{r.note}</p>
      <p className="mt-4 text-sm"><Link to="/track" className="font-semibold text-brand-pink hover:underline">Track your registration</Link></p>
    </Card>
  )
}

export default function Assessment() {
  const { token } = useParams()
  const quiz = useLoad(() => rpc<any>('get_assessment', { p_token: token }), [token])
  const act = useAction()
  const [answers, setAnswers] = useState<Record<string, { option?: number; text?: string }>>({})
  const [result, setResult] = useState<any>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const q = quiz.data
  const deadline = q?.time_limit_minutes && q.started_at ? new Date(q.started_at).getTime() + q.time_limit_minutes * 60000 : null
  const remaining = deadline ? Math.max(0, Math.floor((deadline - now) / 1000)) : null
  const questions: Question[] = q?.questions ?? []
  const sections = useMemo(() => Array.from(new Set(questions.map((x) => x.section))), [questions])
  const answered = questions.filter((x) => answers[x.id]?.option != null || answers[x.id]?.text?.trim()).length

  const submit = () => act.run(async () => {
    const payload = questions.map((x) => ({ question_id: x.id, option: answers[x.id]?.option ?? null, text: answers[x.id]?.text ?? null }))
    setResult(await rpc('submit_assessment', { p_token: token, p_answers: payload }))
    window.scrollTo(0, 0)
  })
  useEffect(() => { if (remaining === 0 && !result && !act.busy && questions.length) submit() }, [remaining]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      {quiz.loading ? <Loading /> : quiz.error ? <Alert msg={quiz.error} /> : result || q?.result ? <Result r={result ?? q.result} /> : (
        <>
          <h1 className="text-3xl font-extrabold text-brand-navy">{q.title}</h1>
          {q.description && <p className="mt-2 text-slate-600">{q.description}</p>}
          <Card className="mt-6 bg-brand-cream/50 text-sm text-slate-600">
            {q.instructions ?? 'Answer as many questions as you can. It is fine to skip questions you do not know: this helps us place you correctly.'}
            <p className="mt-2">This quiz covers {(q.skills ?? []).map(label).join(', ').toLowerCase()}.{!(q.skills ?? []).includes('speaking') && ' It does not test speaking; your teacher will do that in class.'}</p>
          </Card>
          {remaining != null && (
            <div className={cx('sticky top-20 z-10 mt-4 flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold shadow-sm', remaining < 120 ? 'bg-rose-100 text-rose-700' : 'bg-white text-brand-navy')}>
              <Clock size={16} />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} left · {answered}/{questions.length} answered
            </div>
          )}
          {sections.map((s) => (
            <section key={s} className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-brand-navy">{label(s)}</h2>
              <div className="space-y-4">
                {questions.filter((x) => x.section === s).map((x, i) => (
                  <Card key={x.id}>
                    {x.passage && <p className="mb-3 whitespace-pre-line rounded-xl bg-brand-cream/50 p-3 text-sm text-slate-700">{x.passage}</p>}
                    {x.media_url && (/\.(mp3|m4a|wav|ogg)$/i.test(x.media_url) ? <audio controls src={x.media_url} className="mb-3 w-full" /> : <img src={x.media_url} alt="" className="mb-3 max-h-64 rounded-xl" />)}
                    <p className="font-medium text-brand-navy">{i + 1}. {x.prompt}</p>
                    {x.kind === 'mcq' ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(x.options ?? []).map((o, oi) => (
                          <label key={oi} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                            answers[x.id]?.option === oi ? 'border-brand-pink bg-brand-pink/5' : 'border-brand-cream-dark')}>
                            <input type="radio" name={x.id} className="accent-brand-pink" checked={answers[x.id]?.option === oi}
                              onChange={() => setAnswers({ ...answers, [x.id]: { option: oi } })} />{o}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea rows={x.kind === 'writing' ? 5 : 1} className={cx(inputCls, 'mt-3')} value={answers[x.id]?.text ?? ''}
                        onChange={(e) => setAnswers({ ...answers, [x.id]: { text: e.target.value } })} />
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
          <div className="mt-8 space-y-3">
            <Alert msg={act.error} />
            <Button variant="secondary" className="w-full py-3" busy={act.busy} onClick={submit}>Submit my answers</Button>
          </div>
        </>
      )}
    </div>
  )
}
