import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { todayMY } from '../../lib/format'
import { LessonCalendar } from '../../components/Calendar'
import { AttendanceSheet } from '../../components/AttendanceSheet'
import { Modal, PageHeader } from '../../components/ui'

export default function TeacherSchedule() {
  const { session } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div>
      <PageHeader title="My schedule" subtitle="Group classes and one-to-one lessons. Tap a past or today's lesson to take attendance." />
      <LessonCalendar teacherId={session!.user.id} showTeacher={false} onSelect={(l) => { if (l.date <= todayMY() && l.status !== 'cancelled') setOpen(l.id) }} />
      {open && <Modal title="Attendance" onClose={() => setOpen(null)} wide><AttendanceSheet sessionId={open} /></Modal>}
    </div>
  )
}
