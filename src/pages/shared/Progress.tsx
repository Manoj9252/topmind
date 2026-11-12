import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { q, useAction, useLoad } from '../../lib/api'
import { Alert, Badge, Button, Card, Label, Loaded, PageHeader, SearchBox, Select, inputCls } from '../../components/ui'

/** Browser-local learning observations, shared between demo portals in this browser. */
export default function Progress() {
  const { role, session } = useAuth()
  const canEdit = role === 'admin' || role === 'teacher'
  const [search, setSearch] = useState('')
  const [studentId, setStudentId] = useState('')
  const [score, setScore] = useState('')
  const [skill, setSkill] = useState('Speaking')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const act = useAction()
  const data = useLoad(async () => ({
    students: await q<any[]>(supabase.from('students').select('id,full_name,student_code,profile_id').order('full_name')),
    observations: await q<any[]>(supabase.from('progress_notes').select('*').order('created_at', { ascending: false })),
    attendance: await q<any[]>(supabase.from('attendance').select('student_id,status')),
  }), [])
  const students = useMemo(() => (data.data?.students ?? []).filter((s) => !search || `${s.full_name} ${s.student_code}`.toLowerCase().includes(search.toLowerCase())), [data.data, search])
  const visibleStudents = role === 'student' ? students.filter((s) => s.profile_id === (session?.user.id ?? 'demo-student-id')) : students
  const notesBy = (id: string) => (data.data?.observations ?? []).filter((n) => n.student_id === id)
  const attend = (id: string) => {
    const items = (data.data?.attendance ?? []).filter((a) => a.student_id === id)
    return items.length ? `${Math.round(100 * items.filter((x) => ['present', 'late'].includes(x.status)).length / items.length)}%` : 'No lessons recorded'
  }
  return <div className="space-y-5">
    <PageHeader title={role === 'student' ? 'My learning progress' : 'Student learning progress'} subtitle="Speaking, vocabulary, confidence and attendance over time. All changes are kept in demo browser storage." />
    <div className="space-y-2"><Alert msg={act.error} /><Alert ok msg={act.ok} /></div>
    {canEdit && <Card className="space-y-3">
      <h3 className="font-semibold">Record an achievement or lesson observation</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Label t="Student *"><Select value={studentId} onChange={setStudentId} placeholder="Choose a student" options={(data.data?.students ?? []).map((s) => [s.id, s.full_name])} /></Label>
        <Label t="Skill"><Select value={skill} onChange={setSkill} options={['Speaking','Vocabulary','Grammar','Reading','Listening','Confidence']} /></Label>
        <Label t="Score / 100 *"><input type="number" className={inputCls} min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100" /></Label>
        <Label t="Lesson date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Label>
      </div>
      <Label t="Progress notes"><textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain what improved and the next goal" /></Label>
      <Button busy={act.busy} onClick={() => act.run(async () => {
        if (!studentId) throw new Error('Please choose a student.')
        if (score.trim() === '' || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100) throw new Error('Enter a score between 0 and 100.')
        if (!date) throw new Error('Choose a lesson date.')
        await q(supabase.from('progress_notes').insert({ student_id: studentId, skill, score: Number(score), notes: notes.trim(), lesson_date: date, created_at: new Date().toISOString() }))
        setNotes(''); setScore(''); data.reload()
      }, 'Progress recorded and available in the student demo portal.')}>Save progress</Button>
    </Card>}
    {role !== 'student' && <SearchBox value={search} onChange={setSearch} placeholder="Search student or ID" />}
    <Loaded state={{...data, data: data.data ? visibleStudents : null}} empty="No students found.">
      {(rows) => <div className="grid gap-4 lg:grid-cols-2">{rows.map((s) => {
        const observations = notesBy(s.id)
        const recent = observations[0]
        const previous = observations.find((n) => n.skill === recent?.skill && n.id !== recent?.id)
        return <Card key={s.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-brand-navy">{s.full_name}</h3><p className="text-xs text-slate-500">{s.student_code}</p></div><Badge v="active" text={`Attendance ${attend(s.id)}`} /></div>
          {recent ? <><div className="flex items-center justify-between gap-2"><span className="text-sm">Latest: <b>{recent.skill}</b></span><span className="text-lg font-bold text-brand-pink">{recent.score}/100</span></div>
            <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-pink" style={{ width: `${Math.min(100, Math.max(0, Number(recent.score)))}%` }} /></div>
            <p className="text-xs text-slate-500">{previous ? `${Number(recent.score) - Number(previous.score) >= 0 ? '+' : ''}${Number(recent.score) - Number(previous.score)} points since previous ${recent.skill} check` : 'First recorded score'}</p>
            <ul className="max-h-52 space-y-2 overflow-y-auto">{observations.slice(0, 7).map((n) => <li key={n.id} className="rounded-lg bg-slate-50 p-2 text-xs"><b>{n.lesson_date} · {n.skill}: {n.score}/100</b>{n.notes && <p className="mt-1 text-slate-600">{n.notes}</p>}</li>)}</ul>
          </> : <p className="text-sm text-slate-500">No performance scores have been recorded yet. Teachers can add the first lesson observation.</p>}
        </Card>
      })}</div>}
    </Loaded>
  </div>
}
