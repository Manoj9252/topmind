import { useMemo, useRef, useState } from 'react'
import { Download, Eye, EyeOff, RotateCcw, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, useAction, useLoad } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { bytes, fmtDate, label } from '../../lib/format'
import { checkFile, MATERIAL_MAX_BYTES, MATERIAL_TYPES, openPrivateFile, safeName, uploadWithProgress } from '../../lib/storage'
import { Alert, Badge, Button, Card, ConfirmModal, Empty, Label, Loading, PageHeader, SearchBox, Select, inputCls } from '../../components/ui'

const KINDS = ['teacher_training', 'lesson_plan', 'slides', 'worksheet', 'document', 'image', 'audio', 'video', 'quiz', 'homework', 'resource']

// One library for all three portals. What each person sees and may change is
// decided by row-level security on materials and on the private storage bucket.
export default function Materials() {
  const { role, session } = useAuth()
  const canUpload = role === 'admin' || role === 'teacher'
  const [classFilter, setClassFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [confirm, setConfirm] = useState<any>(null)
  const act = useAction()

  const classes = useLoad(() => q<any[]>(supabase.from('classes').select('id, name, course_id').neq('status', 'archived').order('name')), [])
  const items = useLoad(() => q<any[]>(supabase.from('materials')
    .select('id, title, description, kind, topic, lesson_label, audience, is_published, deleted_at, storage_path, file_name, mime_type, size_bytes, created_at, uploaded_by, class_id, classes(name), courses(name), languages(name), profiles(full_name)')
    .order('created_at', { ascending: false })), [])

  const shown = useMemo(() => (items.data ?? []).filter((m) =>
    (showRemoved ? true : !m.deleted_at) && (role !== 'student' || (m.audience !== 'teachers' && m.is_published)) && (!classFilter || m.class_id === classFilter) && (!kindFilter || m.kind === kindFilter)
    && (!search || `${m.title} ${m.topic ?? ''} ${m.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [items.data, classFilter, kindFilter, search, showRemoved])

  const mine = (m: any) => role === 'admin' || m.uploaded_by === session?.user.id
  const update = (m: any, patch: Record<string, unknown>, msg: string) =>
    act.run(async () => { await q(supabase.from('materials').update(patch).eq('id', m.id)); items.reload() }, msg)

  return (
    <div>
      <PageHeader title={role === 'student' ? 'My learning materials' : 'Lesson materials'}
        subtitle={role === 'student' ? 'Slides, worksheets and resources shared by your teachers.' : 'Files are private: only people allowed to see a material can open it.'}>
        <SearchBox value={search} onChange={setSearch} />
      </PageHeader>
      {canUpload && <UploadCard classes={classes.data ?? []} isAdmin={role === 'admin'} onDone={items.reload} />}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="!w-auto" value={classFilter} onChange={setClassFilter} placeholder="All classes" options={(classes.data ?? []).map((c) => [c.id, c.name])} />
        <Select className="!w-auto" value={kindFilter} onChange={setKindFilter} placeholder="All types" options={KINDS} />
        {role === 'admin' && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="accent-brand-pink" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />Show removed</label>}
      </div>
      <div className="mb-3 space-y-2"><Alert msg={act.error || items.error} /><Alert msg={act.ok} ok /></div>
      {items.loading && !items.data ? <Loading /> : !shown.length ? <Empty text={role === 'student' ? 'Your teachers have not shared any materials yet.' : 'No materials yet.'} /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((m) => (
            <Card key={m.id} className={m.deleted_at ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-brand-navy">{m.title}</b>
                    <Badge v={m.kind} tone="navy" />
                    {m.audience === 'teachers' && <Badge text="Teachers only" tone="amber" />}
                    {!m.is_published && <Badge v="draft" text="Unpublished" />}
                    {m.deleted_at && <Badge v="cancelled" text="Removed" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {[m.classes?.name ?? m.courses?.name, m.languages?.name, m.lesson_label, m.topic].filter(Boolean).join(' · ')}
                  </p>
                  {m.description && <p className="mt-1 text-sm text-slate-600">{m.description}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {fmtDate(m.created_at)}{m.profiles?.full_name ? ` · ${m.profiles.full_name}` : ''}{m.size_bytes ? ` · ${bytes(m.size_bytes)}` : ''}
                    {m.mime_type ? ` · ${MATERIAL_TYPES[m.mime_type] ?? m.mime_type}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => act.run(() => openPrivateFile('materials', m.storage_path))}><Eye size={14} />Open</Button>
                <Button size="sm" variant="ghost" onClick={() => act.run(() => openPrivateFile('materials', m.storage_path, m.file_name ?? m.title))}><Download size={14} />Download</Button>
                {canUpload && mine(m) && !m.deleted_at && (
                  <Button size="sm" variant="ghost" onClick={() => update(m, { is_published: !m.is_published }, m.is_published ? 'Unpublished' : 'Published')}>
                    {m.is_published ? <><EyeOff size={14} />Unpublish</> : <><Eye size={14} />Publish</>}
                  </Button>
                )}
                {canUpload && mine(m) && !m.deleted_at && (
                  <Button size="sm" variant="danger" onClick={() => setConfirm({ m, kind: 'remove' })}><Trash2 size={14} />Remove</Button>
                )}
                {role === 'admin' && m.deleted_at && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => update(m, { deleted_at: null }, 'Restored')}><RotateCcw size={14} />Restore</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirm({ m, kind: 'purge' })}><Trash2 size={14} />Delete permanently</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmModal danger title={confirm.kind === 'remove' ? 'Remove this material?' : 'Delete permanently?'}
          message={confirm.kind === 'remove'
            ? 'Students will no longer see it. The file is kept so an administrator can restore it.'
            : 'The file and its record are deleted for good. This cannot be undone.'}
          confirmText={confirm.kind === 'remove' ? 'Remove' : 'Delete'} onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm.kind === 'remove') {
              await q(supabase.from('materials').update({ deleted_at: new Date().toISOString() }).eq('id', confirm.m.id))
            } else {
              await supabase.storage.from('materials').remove([confirm.m.storage_path])
              await q(supabase.from('materials').delete().eq('id', confirm.m.id))
            }
            items.reload()
          }} />
      )}
    </div>
  )
}

function UploadCard({ classes, isAdmin, onDone }: { classes: any[]; isAdmin: boolean; onDone: () => void }) {
  const { session } = useAuth()
  const blank = { class_id: '', title: '', kind: 'slides', description: '', topic: '', lesson_label: '', audience: 'students', is_published: true }
  const [f, setF] = useState(blank)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const upload = async () => {
    setErr(''); setOk('')
    if ((!f.class_id && f.kind !== 'teacher_training') || !f.title.trim() || !file) return setErr('Choose a class (unless academy-wide training), a title and a file.')
    const problem = checkFile(file, Object.keys(MATERIAL_TYPES), MATERIAL_MAX_BYTES)
    if (problem) return setErr(problem)
    const path = `${f.kind === 'teacher_training' ? 'academy-training' : `class/${f.class_id}`}/${crypto.randomUUID()}-${safeName(file.name)}`
    setProgress(0)
    try {
      await uploadWithProgress('materials', path, file, setProgress)
      const { error } = await supabase.from('materials').insert({
        ...f, class_id: f.kind === 'teacher_training' ? null : (f.class_id || null), title: f.title.trim(), audience: ['lesson_plan','teacher_training'].includes(f.kind) ? 'teachers' : f.audience,
        storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: session!.user.id,
      })
      if (error) {
        await supabase.storage.from('materials').remove([path])
        throw new Error(error.message)
      }
      setOk(`"${f.title}" uploaded.`)
      setF({ ...blank, class_id: f.class_id, kind: f.kind })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onDone()
    } catch (e: any) {
      setErr(/row-level security|permission/i.test(e.message) ? 'You can only upload to classes you teach.' : e.message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-3 font-bold text-brand-navy">Upload a material</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Label t={f.kind === 'teacher_training' ? 'Class (optional)' : 'Class *'}><Select value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} placeholder="Choose a class" options={classes.map((c) => [c.id, c.name])} /></Label>
        <Label t="Title *"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Week 3 slides" /></Label>
        <Label t="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KINDS} /></Label>
        <Label t="Lesson"><input className={inputCls} value={f.lesson_label} onChange={(e) => setF({ ...f, lesson_label: e.target.value })} placeholder="e.g. Lesson 5" /></Label>
        <Label t="Topic"><input className={inputCls} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Past tense" /></Label>
        <Label t="Who can see it" hint={['lesson_plan','teacher_training'].includes(f.kind) ? 'Academy training and lesson plans are teachers only.' : undefined}>
          <Select value={['lesson_plan','teacher_training'].includes(f.kind) ? 'teachers' : f.audience} disabled={['lesson_plan','teacher_training'].includes(f.kind)} onChange={(v) => setF({ ...f, audience: v })}
            options={[['students', 'Students in the class'], ['teachers', 'Teachers only']]} />
        </Label>
        <Label t="Description" className="md:col-span-2"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Label>
        <Label t="File *" hint={`PDF, Word, PowerPoint, Excel, images, audio or video. Up to ${MATERIAL_MAX_BYTES / 1024 / 1024} MB.`}>
          <input ref={fileRef} type="file" className="block w-full text-sm" accept={Object.keys(MATERIAL_TYPES).join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="accent-brand-pink" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} />Publish now</label>
        <Button onClick={upload} busy={progress !== null}><Upload size={16} />{progress !== null ? `Uploading ${progress}%` : 'Upload'}</Button>
        {progress !== null && <div className="h-2 w-40 rounded-full bg-brand-cream"><div className="h-2 rounded-full bg-brand-pink transition-all" style={{ width: `${progress}%` }} /></div>}
        {isAdmin && <span className="text-xs text-slate-400">Administrators can upload to any class.</span>}
      </div>
      <div className="mt-3 space-y-2"><Alert msg={err} /><Alert msg={ok} ok /></div>
    </Card>
  )
}
