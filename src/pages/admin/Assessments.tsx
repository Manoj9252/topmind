import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, rpc, useAction, useLoad } from '../../lib/api'
import { fmtDateTime, label } from '../../lib/format'
import { cx } from '../../lib/util'
import { Alert, Badge, Button, Card, ConfirmModal, Empty, Label, Loaded, Loading, Modal, PageHeader, Section, Select, Table, Td, inputCls } from '../../components/ui'

const SECTIONS = ['vocabulary', 'grammar', 'reading', 'sentence_construction', 'listening', 'writing', 'speaking']

export default function Assessments() {
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const list = useLoad(() => q<any[]>(supabase.from('assessments')
    .select('id, title, is_active, time_limit_minutes, skills, courses(name), languages(name), assessment_questions(id), placement_bands(id)').order('created_at', { ascending: false })), [])
  const attempts = useLoad(() => q<any[]>(supabase.from('assessment_attempts')
    .select('id, status, percent, submitted_at, manual_max, manual_points, assessment_id, assessments(title), levels(name), students(full_name), registrations!assessment_attempts_registration_id_fkey(student_name)')
    .in('status', ['submitted', 'reviewed']).order('submitted_at', { ascending: false }).limit(50)), [])
  const [review, setReview] = useState<any>(null)

  return (
    <div>
      <PageHeader title="Placement tests" subtitle="Quizzes that suggest a level and class. They cover what you configure; speaking is confirmed by the teacher.">
        <Button onClick={() => setEditing({})}><Plus size={16} />New test</Button>
      </PageHeader>
      <Loaded state={list} empty="No placement tests yet. Create one for each programme (or one per language).">
        {(rows) => (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((a) => (
              <Card key={a.id} className={cx('cursor-pointer transition', selected === a.id && 'ring-2 ring-brand-pink')}>
                <button className="w-full text-left" onClick={() => setSelected(selected === a.id ? null : a.id)}>
                  <div className="flex items-center justify-between gap-2"><b className="text-brand-navy">{a.title}</b>{a.is_active ? <Badge v="active" /> : <Badge v="inactive" />}</div>
                  <p className="mt-1 text-sm text-slate-500">{a.courses?.name ?? `${a.languages?.name} (all programmes)`} · {a.assessment_questions.length} questions · {a.placement_bands.length} level bands{a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : ''}</p>
                  <p className="text-xs text-slate-400">Covers: {(a.skills ?? []).map(label).join(', ')}</p>
                </button>
              </Card>
            ))}
          </div>
        )}
      </Loaded>
      {selected && <Builder key={selected} id={selected} onEdit={(a) => setEditing(a)} onChanged={list.reload} />}

      <Section title="Recent results" className="mt-8">
        <Loaded state={attempts} empty="No completed tests yet.">
          {(rows) => (
            <Table head={['Submitted', 'Person', 'Test', 'Score', 'Suggested level', 'Writing', '']}>
              {rows.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(t.submitted_at, { tz: false })}</Td>
                  <Td>{t.students?.full_name ?? t.registrations?.student_name ?? '—'}</Td><Td className="text-xs">{t.assessments?.title}</Td>
                  <Td><b>{t.percent ?? '—'}%</b></Td><Td>{t.levels?.name ?? '—'}</Td>
                  <Td className="text-xs">{t.manual_max ? (t.manual_points != null ? `${t.manual_points}/${t.manual_max}` : <Badge v="pending" text="To mark" />) : '—'}</Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => setReview(t)}>{t.status === 'reviewed' ? 'View' : 'Review'}</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </Loaded>
      </Section>
      {editing && <TestForm a={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload() }} />}
      {review && <ReviewModal attempt={review} onClose={() => setReview(null)} onDone={() => { setReview(null); attempts.reload() }} />}
    </div>
  )
}

function TestForm({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const lookups = useLoad(async () => ({
    courses: await q<any[]>(supabase.from('courses').select('id, name, language_id').order('name')),
    languages: await q<any[]>(supabase.from('languages').select('id, name').order('sort_order')),
  }), [])
  const [f, setF] = useState({
    title: a.title ?? '', course_id: a.course_id ?? '', language_id: a.language_id ?? '', description: a.description ?? '', instructions: a.instructions ?? '',
    time_limit_minutes: a.time_limit_minutes ?? 20, is_active: a.is_active ?? true, skills: (a.skills ?? ['vocabulary', 'grammar', 'reading']) as string[],
  })
  const act = useAction()
  return (
    <Modal title={a.id ? 'Edit test' : 'New placement test'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Title *" className="sm:col-span-2"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Label>
        <Label t="Programme" hint="Leave empty to use this test for every programme of the language."><Select value={f.course_id} onChange={(v) => setF({ ...f, course_id: v, language_id: lookups.data?.courses.find((c) => c.id === v)?.language_id ?? f.language_id })} placeholder="All programmes" options={(lookups.data?.courses ?? []).map((c) => [c.id, c.name])} /></Label>
        <Label t="Language"><Select value={f.language_id} onChange={(v) => setF({ ...f, language_id: v })} placeholder="—" options={(lookups.data?.languages ?? []).map((l) => [l.id, l.name])} /></Label>
        <Label t="Time limit (minutes)"><input type="number" min={0} className={inputCls} value={f.time_limit_minutes} onChange={(e) => setF({ ...f, time_limit_minutes: e.target.value as any })} /></Label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Active (offered to applicants)</label>
        <Label t="Description" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Label>
        <Label t="Instructions for the learner" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Label>
      </div>
      <div className="mt-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Skills covered (shown honestly in the result)</span>
        <div className="mt-2 flex flex-wrap gap-3">{SECTIONS.map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand-pink" checked={f.skills.includes(s)}
            onChange={(e) => setF({ ...f, skills: e.target.checked ? [...f.skills, s] : f.skills.filter((x) => x !== s) })} />{label(s)}</label>
        ))}</div>
      </div>
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.title.trim() || (!f.course_id && !f.language_id)} onClick={() => act.run(async () => {
            const payload = { ...f, course_id: f.course_id || null, language_id: f.language_id || null, time_limit_minutes: Number(f.time_limit_minutes) || null }
            if (a.id) await q(supabase.from('assessments').update(payload).eq('id', a.id)); else await q(supabase.from('assessments').insert(payload))
            onDone()
          })}>Save</Button></div></div>
    </Modal>
  )
}

function Builder({ id, onEdit, onChanged }: { id: string; onEdit: (a: any) => void; onChanged: () => void }) {
  const data = useLoad(async () => {
    const a = await q<any>(supabase.from('assessments').select('*').eq('id', id).single())
    return {
      a,
      questions: await q<any[]>(supabase.from('assessment_questions').select('*').eq('assessment_id', id).order('sort_order')),
      bands: await q<any[]>(supabase.from('placement_bands').select('*, levels(name)').eq('assessment_id', id).order('min_percent')),
      levels: a.course_id ? await q<any[]>(supabase.from('levels').select('id, name').eq('course_id', a.course_id).order('rank')) : await q<any[]>(supabase.from('levels').select('id, name, courses!inner(language_id)').eq('courses.language_id', a.language_id).order('rank')),
    }
  }, [id])
  const [question, setQuestion] = useState<any>(null)
  const [band, setBand] = useState({ level_id: '', min_percent: '' })
  const [del, setDel] = useState<any>(null)
  const act = useAction()
  if (data.loading && !data.data) return <Loading />
  if (data.error) return <Alert msg={data.error} />
  const { a, questions, bands, levels } = data.data!
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <Section title={`Questions in "${a.title}"`} className="lg:col-span-2" actions={<>
        <Button size="sm" variant="ghost" onClick={() => onEdit(a)}>Test settings</Button>
        <Button size="sm" onClick={() => setQuestion({ assessment_id: id, section: 'grammar', kind: 'mcq', options: ['', '', ''], correct_option: 0, points: 1, sort_order: questions.length + 1 })}><Plus size={14} />Add question</Button></>}>
        {!questions.length ? <Empty text="No questions yet." /> : (
          <ol className="space-y-2">
            {questions.map((x, i) => (
              <li key={x.id} className="flex items-start justify-between gap-2 rounded-xl border border-brand-cream-dark/70 p-3 text-sm">
                <button className="text-left" onClick={() => setQuestion({ ...x, options: x.options ?? [] })}>
                  <b>{i + 1}. {x.prompt}</b>
                  <div className="text-xs text-slate-500">{label(x.section)} · {label(x.kind)} · {x.points} pt{x.kind === 'mcq' && ` · answer: ${x.options?.[x.correct_option]}`}</div>
                </button>
                <Button size="sm" variant="danger" onClick={() => setDel(x)} aria-label="Delete question"><Trash2 size={14} /></Button>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title="Score to level">
        <p className="mb-3 text-xs text-slate-500">A learner gets the highest level whose minimum score they reach. Scores use the automatically marked questions.</p>
        <ul className="mb-3 space-y-1 text-sm">{bands.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-xl bg-brand-cream/50 px-3 py-1.5"><span>{b.min_percent}%+ → <b>{b.levels?.name}</b></span>
            <button className="text-slate-400 hover:text-rose-600" onClick={() => act.run(async () => { await q(supabase.from('placement_bands').delete().eq('id', b.id)); data.reload() })} aria-label="Remove"><Trash2 size={14} /></button></li>
        ))}</ul>
        <div className="flex gap-2">
          <Select value={band.level_id} onChange={(v) => setBand({ ...band, level_id: v })} placeholder="Level" options={levels.map((l) => [l.id, l.name])} />
          <input type="number" min={0} max={100} className={inputCls + ' !w-20'} placeholder="%" value={band.min_percent} onChange={(e) => setBand({ ...band, min_percent: e.target.value })} />
          <Button size="sm" disabled={!band.level_id || band.min_percent === ''} onClick={() => act.run(async () => {
            await q(supabase.from('placement_bands').insert({ assessment_id: id, level_id: band.level_id, min_percent: Number(band.min_percent) })); setBand({ level_id: '', min_percent: '' }); data.reload()
          })}>Add</Button>
        </div>
        <Alert msg={act.error} />
      </Section>
      {question && <QuestionForm q0={question} onClose={() => setQuestion(null)} onDone={() => { setQuestion(null); data.reload(); onChanged() }} />}
      {del && <ConfirmModal title="Delete this question?" danger confirmText="Delete" message="Past answers to it are removed from results." onClose={() => setDel(null)}
        onConfirm={async () => { await q(supabase.from('assessment_questions').delete().eq('id', del.id)); data.reload(); onChanged() }} />}
    </div>
  )
}

function QuestionForm({ q0, onClose, onDone }: { q0: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ ...q0, accepted: (q0.accepted_answers ?? []).join('\n') })
  const act = useAction()
  const options: string[] = f.options ?? []
  return (
    <Modal title={q0.id ? 'Edit question' : 'Add question'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label t="Section"><Select value={f.section} onChange={(v) => setF({ ...f, section: v })} options={SECTIONS} /></Label>
        <Label t="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[['mcq', 'Multiple choice'], ['short_text', 'Short answer'], ['writing', 'Writing (marked by a teacher)']]} /></Label>
        <Label t="Points"><input type="number" min={0.5} step={0.5} className={inputCls} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></Label>
        <Label t="Question *" className="sm:col-span-3"><textarea rows={2} className={inputCls} value={f.prompt ?? ''} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></Label>
        <Label t="Reading passage (optional)" className="sm:col-span-3"><textarea rows={3} className={inputCls} value={f.passage ?? ''} onChange={(e) => setF({ ...f, passage: e.target.value })} /></Label>
        <Label t="Audio or image link (optional)" className="sm:col-span-2"><input className={inputCls} value={f.media_url ?? ''} onChange={(e) => setF({ ...f, media_url: e.target.value })} placeholder="https://" /></Label>
        <Label t="Order"><input type="number" className={inputCls} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Label>
      </div>
      {f.kind === 'mcq' && (
        <div className="mt-3 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Options (tick the correct one)</span>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" className="accent-brand-pink" checked={f.correct_option === i} onChange={() => setF({ ...f, correct_option: i })} aria-label={`Option ${i + 1} is correct`} />
              <input className={inputCls} value={o} onChange={(e) => setF({ ...f, options: options.map((x, j) => (j === i ? e.target.value : x)) })} />
              <Button size="sm" variant="danger" disabled={options.length <= 2} onClick={() => setF({ ...f, options: options.filter((_, j) => j !== i), correct_option: 0 })} aria-label="Remove option"><Trash2 size={14} /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setF({ ...f, options: [...options, ''] })}><Plus size={14} />Add option</Button>
        </div>
      )}
      {f.kind === 'short_text' && (
        <Label t="Accepted answers (one per line, not case-sensitive)" className="mt-3" hint="Leave empty to have a teacher mark it instead.">
          <textarea rows={3} className={inputCls} value={f.accepted} onChange={(e) => setF({ ...f, accepted: e.target.value })} />
        </Label>
      )}
      <div className="mt-4 space-y-2"><Alert msg={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={act.busy} disabled={!f.prompt?.trim() || (f.kind === 'mcq' && options.some((o) => !o.trim()))} onClick={() => act.run(async () => {
            const payload = {
              assessment_id: f.assessment_id, section: f.section, kind: f.kind, prompt: f.prompt.trim(), passage: f.passage || null, media_url: f.media_url || null,
              points: Number(f.points) || 1, sort_order: Number(f.sort_order) || 0,
              options: f.kind === 'mcq' ? options.map((o) => o.trim()) : null, correct_option: f.kind === 'mcq' ? f.correct_option : null,
              accepted_answers: f.kind === 'short_text' && f.accepted.trim() ? f.accepted.split('\n').map((x: string) => x.trim()).filter(Boolean) : null,
            }
            if (f.id) await q(supabase.from('assessment_questions').update(payload).eq('id', f.id)); else await q(supabase.from('assessment_questions').insert(payload))
            onDone()
          })}>Save</Button></div></div>
    </Modal>
  )
}

function ReviewModal({ attempt, onClose, onDone }: { attempt: any; onClose: () => void; onDone: () => void }) {
  const data = useLoad(async () => ({
    answers: await q<any[]>(supabase.from('assessment_answers').select('*, assessment_questions(prompt, kind, options, correct_option, points, sort_order)').eq('attempt_id', attempt.id)),
    levels: await q<any[]>(supabase.from('placement_bands').select('level_id, levels(name)').eq('assessment_id', attempt.assessment_id)),
  }), [attempt.id])
  const [points, setPoints] = useState(attempt.manual_points ?? '')
  const [level, setLevel] = useState('')
  const [notes, setNotes] = useState('')
  const act = useAction()
  return (
    <Modal title={`Review: ${attempt.students?.full_name ?? attempt.registrations?.student_name ?? 'Applicant'}`} onClose={onClose} wide>
      {data.loading ? <Loading /> : (
        <div className="space-y-3">
          <p className="text-sm">Score {attempt.percent ?? '—'}% · suggested level <b>{attempt.levels?.name ?? '—'}</b></p>
          <ol className="max-h-80 space-y-2 overflow-auto text-sm">
            {(data.data?.answers ?? []).sort((x, y) => x.assessment_questions.sort_order - y.assessment_questions.sort_order).map((ans) => {
              const qu = ans.assessment_questions
              return (
                <li key={ans.question_id} className="rounded-xl border p-2">
                  <b>{qu.prompt}</b>
                  {qu.kind === 'mcq' ? <p className={ans.is_correct ? 'text-emerald-700' : 'text-rose-700'}>{qu.options?.[ans.selected_option] ?? '(no answer)'} {ans.is_correct ? '✓' : `✗ (correct: ${qu.options?.[qu.correct_option]})`}</p>
                    : <p className="whitespace-pre-line text-slate-700">{ans.text_answer || '(no answer)'}</p>}
                </li>
              )
            })}
          </ol>
          {attempt.manual_max > 0 && <Label t={`Writing points (out of ${attempt.manual_max})`}><input type="number" min={0} max={attempt.manual_max} step={0.5} className={inputCls} value={points} onChange={(e) => setPoints(e.target.value)} /></Label>}
          <Label t="Confirmed level"><Select value={level} onChange={setLevel} placeholder="Keep the suggested level" options={(data.data?.levels ?? []).map((l) => [l.level_id, l.levels?.name])} /></Label>
          <Label t="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Label>
          <Alert msg={act.error} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button>
            <Button busy={act.busy} onClick={() => act.run(async () => {
              await rpc('review_assessment', { p_attempt: attempt.id, p_manual_points: points === '' ? null : Number(points), p_level: level || null, p_notes: notes || null }); onDone()
            })}>Save review</Button></div>
        </div>
      )}
    </Modal>
  )
}
