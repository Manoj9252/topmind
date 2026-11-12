import { useState } from 'react'
import { fmtDateTime, label } from '../../lib/format'
import { LessonCalendar, type Lesson } from '../../components/Calendar'
import { Badge, Button, KeyValue, Modal, PageHeader } from '../../components/ui'

export default function StudentSchedule() {
  const [open, setOpen] = useState<Lesson | null>(null)
  return (
    <div>
      <PageHeader title="My timetable" subtitle="Group classes and one-to-one lessons, shown in your device's time zone." />
      <LessonCalendar onSelect={setOpen} />
      {open && (
        <Modal title={open.class} onClose={() => setOpen(null)}>
          <div className="space-y-3">
            <KeyValue rows={[['When', fmtDateTime(open.starts_at)], ['Teacher', open.teacher ?? '—'], ['Format', label(open.mode)],
              ['Status', <Badge key="s" v={open.status} />], ...(open.topic ? [['Topic', open.topic] as [string, string]] : []),
              ...(open.cancel_reason ? [['Reason', open.cancel_reason] as [string, string]] : [])]} />
            {open.meeting_link && open.status === 'scheduled' && <a href={open.meeting_link} target="_blank" rel="noreferrer"><Button className="w-full">Join online lesson</Button></a>}
          </div>
        </Modal>
      )}
    </div>
  )
}
