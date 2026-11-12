import { useEffect, useState } from 'react'
import {
  CalendarDays, Clock, Eye, EyeOff, ImagePlus, MapPin, Pencil, Plus, Sparkles, Trash2, Upload, User, Users, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { q, useAction, useLoad } from '../../lib/api'
import { fmtClock, fmtDateTime } from '../../lib/format'
import {
  Alert, Badge, Button, Card, ConfirmModal, Label, Loaded, Modal, PageHeader, Select, Stat, inputCls,
} from '../../components/ui'

interface FreeClass {
  id: string
  title: string
  description: string | null
  instructor: string
  language: string
  target_audience: string | null
  mode: 'In-Person' | 'Online' | 'Hybrid'
  location: string | null
  starts_at: string
  ends_at: string
  image_url: string | null
  capacity: number | null
  active: boolean
  created_at: string
  updated_at: string
}

const LANGUAGES: [string, string][] = [
  ['English', 'English'],
  ['Tamil', 'Tamil'],
  ['Malay', 'Malay'],
  ['General', 'General'],
]

const MODES: [string, string][] = [
  ['In-Person', 'In-Person'],
  ['Online', 'Online'],
  ['Hybrid', 'Hybrid'],
]

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toLocalInput(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function defaultRange() {
  const start = new Date()
  start.setDate(start.getDate() + 3)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start.getTime() + 90 * 60 * 1000)
  return { start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) }
}

function classStatus(fc: FreeClass, nowMs: number): { text: string; tone: string } {
  const startMs = new Date(fc.starts_at).getTime()
  const endMs = new Date(fc.ends_at).getTime()
  if (!fc.active) return { text: 'Inactive (Hidden)', tone: 'amber' }
  if (nowMs > endMs) return { text: 'Ended (Auto-hidden)', tone: 'slate' }
  if (nowMs >= startMs) return { text: 'Live Now', tone: 'pink' }
  return { text: 'Upcoming (Active)', tone: 'emerald' }
}

function sameDay(aIso: string, bIso: string) {
  const a = new Date(aIso)
  const b = new Date(bIso)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function AdminFreeClasses() {
  const [modal, setModal] = useState<'new' | FreeClass | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FreeClass | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const act = useAction()

  const list = useLoad(
    () =>
      q<FreeClass[]>(
        supabase
          .from('free_classes')
          .select('id, title, description, instructor, language, target_audience, mode, location, starts_at, ends_at, image_url, capacity, active, created_at, updated_at')
          .order('starts_at', { ascending: false }),
      ),
    [],
  )

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const rows = list.data ?? []
  const activeWebsite = rows.filter((fc) => fc.active && new Date(fc.ends_at).getTime() > nowMs).length
  const endedCount = rows.filter((fc) => new Date(fc.ends_at).getTime() <= nowMs).length

  const toggleActive = (fc: FreeClass) =>
    act.run(
      async () => {
        const { error } = await supabase.from('free_classes').update({ active: !fc.active }).eq('id', fc.id)
        if (error) throw error
        list.reload()
      },
      fc.active ? 'Free class hidden from website.' : 'Free class is now active on website.',
    )

  return (
    <div>
      <PageHeader title="Free Classes & Workshops" subtitle="Schedule trial workshops displayed on the public portal and automatically hidden once ended.">
        <Button onClick={() => setModal('new')}>
          <Plus size={16} />
          New free class
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active on Website" value={activeWebsite} tone="emerald" icon={<Sparkles size={20} />} hint="Upcoming & live now" />
        <Stat label="Ended / Auto-hidden" value={endedCount} tone="amber" icon={<Clock size={20} />} hint="Past end time" />
        <Stat label="Total Scheduled" value={rows.length} tone="navy" icon={<CalendarDays size={20} />} hint="All records" />
      </div>

      <Alert msg={act.error || act.ok} ok={!!act.ok} />
      {(act.error || act.ok) && <div className="mb-4" />}

      <Loaded state={list} empty="No free classes scheduled yet. Click 'New free class' to publish your first open workshop.">
        {(items) => (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((fc) => {
              const status = classStatus(fc, nowMs)
              return (
                <Card key={fc.id} className="flex flex-col overflow-hidden !p-0">
                  {fc.image_url ? (
                    <div className="relative h-44 w-full bg-brand-cream">
                      <img src={fc.image_url} alt={fc.title} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="grid h-28 place-items-center bg-gradient-to-br from-brand-navy via-brand-navy-light to-brand-pink/80 text-white/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                        <Sparkles size={16} />
                        <span>Free Workshop</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge text={status.text} tone={status.tone} />
                      <Badge text={fc.language} tone="navy" />
                      <Badge text={fc.mode} tone="sky" />
                    </div>

                    <h3 className="mt-3 text-lg font-bold text-brand-navy">{fc.title}</h3>
                    {fc.target_audience && (
                      <p className="mt-0.5 text-xs font-semibold text-brand-pink">For: {fc.target_audience}</p>
                    )}
                    {fc.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{fc.description}</p>
                    )}

                    <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <User size={14} className="shrink-0 text-slate-400" />
                        <span>{fc.instructor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="shrink-0 text-slate-400" />
                        <span>
                          {fmtDateTime(fc.starts_at)} – {sameDay(fc.starts_at, fc.ends_at) ? fmtClock(fc.ends_at) : fmtDateTime(fc.ends_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="shrink-0 text-slate-400" />
                        <span>{fc.location || fc.mode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={14} className="shrink-0 text-slate-400" />
                        <span>{fc.capacity ? `Max ${fc.capacity} seats` : 'Unlimited capacity'}</span>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-cream-dark/60 bg-brand-cream/30 px-4 py-3">
                    <Button size="sm" variant="ghost" busy={act.busy} onClick={() => toggleActive(fc)}>
                      {fc.active ? <><EyeOff size={14} />Hide</> : <><Eye size={14} />Unhide</>}
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setModal(fc)}>
                        <Pencil size={14} />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => setConfirmDelete(fc)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </Loaded>

      {modal && (
        <FreeClassModal
          editing={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            list.reload()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete free class"
          message={
            <>
              Remove <strong>{confirmDelete.title}</strong>? Existing reservations stored under Registrations will be kept, but the workshop card will be permanently deleted.
            </>
          }
          confirmText="Delete"
          danger
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('free_classes').delete().eq('id', confirmDelete.id)
            if (error) throw error
            list.reload()
          }}
        />
      )}
    </div>
  )
}

function FreeClassModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: FreeClass | null
  onClose: () => void
  onSaved: () => void
}) {
  const initial = editing
    ? {
        title: editing.title,
        instructor: editing.instructor,
        language: editing.language,
        startsAt: toLocalInput(editing.starts_at),
        endsAt: toLocalInput(editing.ends_at),
        mode: editing.mode,
        location: editing.location ?? '',
        targetAudience: editing.target_audience ?? '',
        capacity: editing.capacity ? String(editing.capacity) : '',
        description: editing.description ?? '',
        imageUrl: editing.image_url ?? '',
        active: editing.active,
      }
    : (() => {
        const range = defaultRange()
        return {
          title: '',
          instructor: '',
          language: 'English',
          startsAt: range.start,
          endsAt: range.end,
          mode: 'In-Person' as FreeClass['mode'],
          location: 'Top Mind Learning Centre',
          targetAudience: '',
          capacity: '20',
          description: '',
          imageUrl: '',
          active: true,
        }
      })()

  const [title, setTitle] = useState(initial.title)
  const [instructor, setInstructor] = useState(initial.instructor)
  const [language, setLanguage] = useState(initial.language)
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [endsAt, setEndsAt] = useState(initial.endsAt)
  const [mode, setMode] = useState<FreeClass['mode']>(initial.mode)
  const [location, setLocation] = useState(initial.location)
  const [targetAudience, setTargetAudience] = useState(initial.targetAudience)
  const [capacity, setCapacity] = useState(initial.capacity)
  const [description, setDescription] = useState(initial.description)
  const [imageUrl, setImageUrl] = useState(initial.imageUrl)
  const [active, setActive] = useState(initial.active)
  const [fileError, setFileError] = useState('')
  const act = useAction()

  const onFilePick = (file?: File) => {
    setFileError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFileError('Please choose an image file (PNG, JPG, WebP).')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setFileError('Image is larger than 4 MB. Please use a smaller poster or enter an Image URL.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result)
    }
    reader.onerror = () => setFileError('Could not read the selected image file.')
    reader.readAsDataURL(file)
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    act.run(async () => {
      if (!title.trim()) throw new Error('Title is required.')
      if (!instructor.trim()) throw new Error('Instructor name is required.')
      const startDate = new Date(startsAt)
      const endDate = new Date(endsAt)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error('Please choose valid start and end dates and times.')
      }
      if (endDate <= startDate) {
        throw new Error('End date & time must be after the start date & time.')
      }
      const capNum = capacity.trim() ? Number(capacity) : null
      if (capNum !== null && (!Number.isInteger(capNum) || capNum <= 0)) {
        throw new Error('Maximum capacity must be a positive whole number or left blank.')
      }

      const payload = {
        title: title.trim(),
        instructor: instructor.trim(),
        language,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        mode,
        location: location.trim() || null,
        target_audience: targetAudience.trim() || null,
        capacity: capNum,
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        active,
      }

      const { error } = editing
        ? await supabase.from('free_classes').update(payload).eq('id', editing.id)
        : await supabase.from('free_classes').insert(payload)
      if (error) throw error
      onSaved()
    })
  }

  return (
    <Modal title={editing ? 'Edit free class' : 'Create free class'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label t="Title" className="sm:col-span-2">
            <input
              className={inputCls}
              placeholder="e.g. Spoken English Confidence Workshop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Label>

          <Label t="Instructor">
            <input
              className={inputCls}
              placeholder="Instructor full name"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              required
            />
          </Label>

          <Label t="Language">
            <Select value={language} onChange={setLanguage} options={LANGUAGES} />
          </Label>

          <Label t="Start Date & Time">
            <input
              type="datetime-local"
              className={inputCls}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </Label>

          <Label t="End Date & Time">
            <input
              type="datetime-local"
              className={inputCls}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </Label>

          <Label t="Delivery Mode">
            <Select value={mode} onChange={(v) => setMode(v as FreeClass['mode'])} options={MODES} />
          </Label>

          <Label t="Location / Venue">
            <input
              className={inputCls}
              placeholder="Centre address or Zoom link info"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Label>

          <Label t="Target Audience">
            <input
              className={inputCls}
              placeholder="e.g. Working adults & teens"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </Label>

          <Label t="Maximum Capacity" hint="Leave blank for unlimited seats">
            <input
              type="number"
              min={1}
              className={inputCls}
              placeholder="e.g. 20"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Label>
        </div>

        <Label t="Description">
          <textarea
            rows={3}
            className={inputCls}
            placeholder="What participants will learn, what to bring, or session highlights..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Label>

        <div className="rounded-2xl border border-brand-cream-dark bg-brand-cream/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <ImagePlus size={14} />
              Poster / Photo Attachment
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-sm ring-1 ring-brand-cream-dark hover:bg-brand-cream">
              <Upload size={14} />
              Upload image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onFilePick(e.target.files?.[0])}
              />
            </label>
          </div>

          <input
            className={inputCls}
            placeholder="Or paste an Image URL (https://...)"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />

          {fileError && <Alert msg={fileError} />}

          {imageUrl && (
            <div className="relative overflow-hidden rounded-xl border bg-white">
              <img src={imageUrl} alt="Poster preview" className="h-40 w-full object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-brand-navy/80 px-2 py-1 text-xs font-medium text-white hover:bg-brand-navy"
              >
                <X size={12} />
                Remove
              </button>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (visible on public Free Classes page while before end time)</span>
        </label>

        <Alert msg={act.error} />

        <div className="flex justify-end gap-2 border-t border-brand-cream-dark/60 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={act.busy}>
            {editing ? 'Save changes' : 'Create free class'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
