// Frontend-only mock database and RPC simulator for Client Preview / Demo Mode.
// Runs 100% in the browser using in-memory + localStorage persistence so all
// public pages and the Admin, Teacher, and Student portals work without Supabase.
import { useEffect, useState } from 'react'

const demoBase = () => {
  const iconHref = typeof document !== 'undefined' ? document.querySelector('link[rel="icon"]')?.getAttribute('href') : null
  const fromIcon = iconHref && iconHref.endsWith('logo.jpeg') ? iconHref.slice(0, -'logo.jpeg'.length) : null
  const raw = (globalThis as any).__TOPMIND_BASE__ || fromIcon || '/'
  return String(raw).replace(/\/+$/, '')
}
const demoAppPath = (path = '') => {
  const clean = path.replace(/^\/+/, '')
  return clean ? `${demoBase()}/${clean}` : `${demoBase() || ''}/`
}
const appOriginUrl = (path = '') => {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  return `${origin}${demoAppPath(path)}`
}
const demoLogoUrl = () => demoAppPath('logo.jpeg')

export type DemoRole = 'admin' | 'teacher' | 'student'

export interface DemoProfile {
  id: string
  full_name: string
  email: string
  phone: string
  role: DemoRole
  status: 'active'
  suspended_reason: string | null
}

export interface DemoAuthPayload {
  session: {
    access_token: string
    token_type: string
    user: {
      id: string
      email: string
      user_metadata: { full_name: string }
    }
  }
  profile: DemoProfile
  role: DemoRole
}

export interface DemoAccountSpec {
  role: DemoRole
  portalTitle: string
  label: string
  id: string
  email: string
  password: string
  name: string
  phone: string
  description: string
}

export const DEMO_SESSION_KEY = 'topmind_demo_session'
export const DEMO_DB_KEY = 'topmind_demo_db_v3'
export const DEMO_PASSWORD = 'TopMind2026!'

export type AwardCategory =
  | 'Most Improved Speaker'
  | 'Perfect Attendance'
  | 'Vocabulary Champion'
  | 'Confidence Booster'

export interface StudentSpotlight {
  id: string
  student_id: string | null
  student_name: string
  avatar_url?: string | null
  language_level: string
  category: AwardCategory
  quote: string
  teacher_name: string
  month_label: string
  featured_on_website: boolean
  created_at: string
}

export interface TeacherWorkshop {
  id: string
  teacher_id: string
  title: string
  date: string
  duration_minutes: number
  attendees: number
  amount: number
  period: string
  status: string
  notes?: string | null
}

export type CompetitionCategory =
  | 'Junior Stars'
  | 'Youth Orators'
  | 'Adult Communicators'

export type CompetitionLanguage = 'English' | 'Tamil' | 'Bahasa Melayu'

export type CompetitionStatus = 'Registered' | 'Shortlisted' | 'Finalist' | 'Winner'

export interface CompetitionRegistration {
  id: string
  tracking_code: string
  full_name: string
  age: number
  category: CompetitionCategory
  language: CompetitionLanguage
  speech_topic: string
  audition_mode: 'Video Submission' | 'In-Person Audition'
  video_url: string | null
  phone: string
  email: string
  status: CompetitionStatus
  notes: string | null
  created_at: string
}

export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccountSpec> = {
  admin: {
    role: 'admin',
    portalTitle: 'Admin Portal',
    label: 'Admin',
    id: 'demo-admin-id',
    email: 'admin@topmind.my',
    password: DEMO_PASSWORD,
    name: 'Top Mind Administrator',
    phone: '+60 10-522 1300',
    description: 'Full centre overview, billing, classes & free workshops',
  },
  teacher: {
    role: 'teacher',
    portalTitle: 'Teacher Portal',
    label: 'Teacher',
    id: 'demo-teacher-id',
    email: 'teacher@topmind.my',
    password: DEMO_PASSWORD,
    name: 'Ms. Priya Shanmugam',
    phone: '+60 12-418 7721',
    description: 'Daily lessons, student rosters, attendance & salary',
  },
  student: {
    role: 'student',
    portalTitle: 'Student Portal',
    label: 'Student',
    id: 'demo-student-id',
    email: 'student@topmind.my',
    password: DEMO_PASSWORD,
    name: 'Aisha Binti Rahman',
    phone: '+60 11-2890 4412',
    description: 'Class schedule, materials, invoices, receipts & 1-to-1 bookings',
  },
}

export function buildDemoAuth(role: DemoRole): DemoAuthPayload {
  const acc = DEMO_ACCOUNTS[role]
  return {
    session: {
      access_token: `demo-token-${role}`,
      token_type: 'bearer',
      user: {
        id: acc.id,
        email: acc.email,
        user_metadata: { full_name: acc.name },
      },
    },
    profile: {
      id: acc.id,
      full_name: acc.name,
      email: acc.email,
      phone: acc.phone,
      role,
      status: 'active',
      suspended_reason: null,
    },
    role,
  }
}

export function readDemoSession(): DemoAuthPayload | null {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.role && DEMO_ACCOUNTS[parsed.role as DemoRole] && parsed?.session?.user?.id && parsed?.profile) {
      return parsed as DemoAuthPayload
    }
    return null
  } catch {
    return null
  }
}

export function writeDemoSession(payload: DemoAuthPayload) {
  try {
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage quota errors in private browsing.
  }
}

export function clearDemoSession() {
  try {
    localStorage.removeItem(DEMO_SESSION_KEY)
  } catch {
    // Ignore
  }
}

export function matchDemoCredentials(email: string, password: string): DemoRole | null {
  const cleanEmail = email.trim().toLowerCase()
  const roles: DemoRole[] = ['admin', 'teacher', 'student']
  const db = loadDb()
  const saved = (db.demo_teacher_credentials ?? []).find((r: any) => r.email === cleanEmail && r.password === password)
  if (saved) return 'teacher'
  for (const r of roles) {
    if (DEMO_ACCOUNTS[r].email.toLowerCase() === cleanEmail && DEMO_ACCOUNTS[r].password === password) {
      return r
    }
  }
  return null
}

export function isDemoActive(): boolean {
  return !!readDemoSession()
}

// ---------------------------------------------------------------------------
// Date helpers so demo schedules, dashboards & free classes always stay fresh
// ---------------------------------------------------------------------------
function dayIso(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function atOffset(offsetDays: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function monthStr(offsetMonths = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offsetMonths)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function makeUuid(prefix = 'demo'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// Initial Seed Database
// ---------------------------------------------------------------------------
function createSeedDb(): Record<string, any[]> {
  const langEnId = 'lang-en'
  const langEnBegId = 'lang-en-beg'
  const langTaId = 'lang-ta'
  const langMsId = 'lang-ms'

  const crsEnBegId = 'crs-en-beg'
  const crsEnWorkId = 'crs-en-work'
  const crsTaConvId = 'crs-ta-conv'
  const crsMsCommId = 'crs-ms-comm'

  const lvlA1Id = 'lvl-a1'
  const lvlA2Id = 'lvl-a2'
  const lvlTa1Id = 'lvl-ta1'
  const lvlMs1Id = 'lvl-ms1'

  const room1Id = 'room-1'
  const room2Id = 'room-2'

  const cls1Id = 'cls-en-beg-daily'
  const cls2Id = 'cls-ta-conv'
  const cls3Id = 'cls-ms-comm'

  const stu1Id = 'stu-aisha'
  const stu2Id = 'stu-daniel'
  const stu3Id = 'stu-kavitha'
  const stu4Id = 'stu-farah'

  const teacher1Id = 'demo-teacher-id'
  const teacher2Id = 'teacher-2-id'

  const ses1Id = 'ses-today-1'
  const ses2Id = 'ses-today-2'
  const ses3Id = 'ses-past-1'
  const ses4Id = 'ses-next-1'

  const inv1Id = 'inv-aisha-paid'
  const inv2Id = 'inv-aisha-pending'
  const inv3Id = 'inv-daniel-paid'

  const thisMonth = monthStr(0)
  const lastMonth = monthStr(-1)

  return {
    app_settings: [
      { key: 'business.name', category: 'business', label: 'Business name', description: 'Shown on the public website, invoices and receipts.', is_public: true, value: 'Top Mind Enterprise' },
      { key: 'business.tagline', category: 'business', label: 'Tagline', description: 'Hero subtitle on the home page.', is_public: true, value: 'Language learning without fear of mistakes' },
      { key: 'business.email', category: 'business', label: 'Contact email', description: 'Public support and enquiry email.', is_public: true, value: 'etopmind@gmail.com' },
      { key: 'business.phone', category: 'business', label: 'Contact phone', description: 'Displayed in the site footer and WhatsApp links.', is_public: true, value: '+60 10-522 1300' },
      { key: 'business.whatsapp', category: 'business', label: 'WhatsApp number', description: 'Used for click-to-chat inquiry links.', is_public: true, value: '60105221300' },
      { key: 'business.address', category: 'business', label: 'Centre address', description: 'Mont Kiara physical centre location.', is_public: true, value: 'No. 18-2, Jalan Solaris, Mont Kiara, 50480 Kuala Lumpur' },
      { key: 'business.instagram_url', category: 'business', label: 'Instagram URL', description: null, is_public: true, value: 'https://www.instagram.com/topmind_enterprise/' },
      { key: 'business.tiktok_url', category: 'business', label: 'TikTok URL', description: null, is_public: true, value: 'https://www.tiktok.com/@topmind_enterprise' },
      { key: 'business.logo_url', category: 'business', label: 'Logo URL', description: null, is_public: true, value: demoLogoUrl() },
      {
        key: 'business.mission',
        category: 'business',
        label: 'Mission statement',
        description: null,
        is_public: true,
        value:
          'To make language learning accessible, enjoyable and meaningful by providing a safe and supportive environment where learners can build strong foundations, express themselves confidently and learn without fear of making mistakes.',
      },
      {
        key: 'business.vision',
        category: 'business',
        label: 'Vision statement',
        description: null,
        is_public: true,
        value:
          'To become a trusted global language-learning brand that empowers people to communicate confidently through accessible online education and welcoming physical learning centres, with the long-term ambition of expanding internationally through language centres and franchises.',
      },
      { key: 'finance.currency_symbol', category: 'finance', label: 'Currency symbol', description: 'Shown beside all fees, invoices and payouts.', is_public: true, value: 'RM' },
      { key: 'finance.bank_details', category: 'finance', label: 'Bank transfer details', description: 'Shown on student invoices.', is_public: false, value: 'Maybank · Top Mind Enterprise · 5142 7180 9932' },
      { key: 'finance.payment_instructions', category: 'finance', label: 'Payment instructions', description: 'Displayed on checkout and slip upload.', is_public: false, value: 'Transfer via DuitNow or Online Banking and upload your payment slip.' },
      { key: 'finance.allow_payment_evidence', category: 'finance', label: 'Allow slip uploads', description: null, is_public: false, value: true },
      { key: 'finance.online_payments_enabled', category: 'finance', label: 'Online payments enabled', description: null, is_public: false, value: false },
      { key: 'booking.cancellation_window_hours', category: 'booking', label: 'Cancellation window (hours)', description: 'Students can move or cancel 1-to-1 bookings up to this many hours before.', is_public: true, value: 24 },
      { key: 'academic.attendance_edit_days', category: 'academic', label: 'Teacher attendance edit window (days)', description: null, is_public: false, value: 7 },
      { key: 'academic.attendance_warning_percent', category: 'academic', label: 'Low attendance warning (%)', description: null, is_public: false, value: 75 },
      { key: 'communication.auto_receipts', category: 'communication', label: 'Send receipts automatically', description: null, is_public: false, value: true },
      { key: 'enquiries.auto_suggest', category: 'enquiries', label: 'Suggest replies automatically', description: null, is_public: false, value: true },
      { key: 'privacy.policy_updated', category: 'privacy', label: 'Privacy notice updated', description: null, is_public: true, value: '2026-11-02' },
    ],

    languages: [
      {
        id: langEnId,
        name: 'English',
        slug: 'english',
        description: 'Practical spoken & workplace English built around real-life conversations.',
        is_active: true,
        sort_order: 1,
      },
      {
        id: langEnBegId,
        name: 'English for Beginners',
        slug: 'english-for-beginners',
        description: 'Step-by-step foundational English for adult starters seeking confidence from day one.',
        is_active: true,
        sort_order: 2,
      },
      {
        id: langTaId,
        name: 'Tamil',
        slug: 'tamil',
        description: 'Warm, structured spoken & reading classes for daily conversation and heritage.',
        is_active: true,
        sort_order: 3,
      },
      {
        id: langMsId,
        name: 'Bahasa Melayu',
        slug: 'bahasa-melayu',
        description: 'Everyday and workplace Bahasa Melayu for Malaysian residents and professionals.',
        is_active: true,
        sort_order: 4,
      },
    ],

    courses: [
      {
        id: crsEnBegId,
        language_id: langEnBegId,
        name: 'English Beginners Foundation',
        slug: 'english-beginners-foundation',
        summary: 'Speak simple sentences clearly and comfortably in 8 weeks.',
        description: 'Supportive small-group sessions focusing on pronunciation, everyday vocabulary, and fear-free speaking.',
        audience: 'adults',
        active: true,
      },
      {
        id: crsEnWorkId,
        language_id: langEnId,
        name: 'Workplace English Fluency',
        slug: 'workplace-english-fluency',
        summary: 'Lead meetings, write clear emails, and speak smoothly at work.',
        description: 'Designed for working professionals improving workplace communication and presentations.',
        audience: 'adults',
        active: true,
      },
      {
        id: crsTaConvId,
        language_id: langTaId,
        name: 'Conversational Tamil',
        slug: 'conversational-tamil',
        summary: 'Natural everyday Tamil for family, friends, and social conversation.',
        description: 'Focuses on listening comprehension, natural phrasing, and guided dialogues.',
        audience: 'all',
        active: true,
      },
      {
        id: crsMsCommId,
        language_id: langMsId,
        name: 'Practical Bahasa Melayu',
        slug: 'practical-bahasa-melayu',
        summary: 'Everyday Bahasa Melayu for daily errands, colleagues, and official settings.',
        description: 'Practical speaking drills paired with essential Malaysian cultural context.',
        audience: 'all',
        active: true,
      },
    ],

    levels: [
      { id: lvlA1Id, course_id: crsEnBegId, name: 'Beginner (A1)', rank: 1, monthly_fee: 150, description: 'Zero to basic conversations' },
      { id: lvlA2Id, course_id: crsEnWorkId, name: 'Elementary (A2)', rank: 2, monthly_fee: 180, description: 'Everyday fluency builder' },
      { id: lvlTa1Id, course_id: crsTaConvId, name: 'Conversational Level 1', rank: 1, monthly_fee: 150, description: 'Spoken fundamentals' },
      { id: lvlMs1Id, course_id: crsMsCommId, name: 'Foundation Level 1', rank: 1, monthly_fee: 150, description: 'Essential everyday Bahasa' },
    ],

    centres: [
      { id: 'ctr-mk', name: 'Mont Kiara Learning Centre', address: 'No. 18-2, Jalan Solaris, Mont Kiara, 50480 Kuala Lumpur', timezone: 'Asia/Kuala_Lumpur', is_active: true },
      { id: 'ctr-online', name: 'Online Virtual Academy', address: 'Live interactive Zoom classrooms', timezone: 'Asia/Kuala_Lumpur', is_active: true },
    ],

    classrooms: [
      { id: room1Id, name: 'Studio A (Mont Kiara)', centre_id: 'ctr-mk', capacity: 14, is_active: true },
      { id: room2Id, name: 'Virtual Zoom Room 1', centre_id: 'ctr-online', capacity: 25, is_active: true },
    ],

    profiles: [
      {
        id: 'demo-admin-id',
        full_name: 'Top Mind Administrator',
        email: 'admin@topmind.my',
        phone: '+60 10-522 1300',
        role: 'admin',
        status: 'active',
        suspended_reason: null,
        created_at: dayIso(-180) + 'T08:00:00Z',
      },
      {
        id: teacher1Id,
        full_name: 'Ms. Priya Shanmugam',
        email: 'teacher@topmind.my',
        phone: '+60 12-418 7721',
        role: 'teacher',
        status: 'active',
        suspended_reason: null,
        created_at: dayIso(-150) + 'T08:00:00Z',
      },
      {
        id: teacher2Id,
        full_name: 'Mr. Hafizuddin Ismail',
        email: 'hafiz@topmind.my',
        phone: '+60 13-902 1144',
        role: 'teacher',
        status: 'active',
        suspended_reason: null,
        created_at: dayIso(-120) + 'T08:00:00Z',
      },
      {
        id: 'demo-student-id',
        full_name: 'Aisha Binti Rahman',
        race_ethnicity: 'Malay',
        email: 'student@topmind.my',
        phone: '+60 11-2890 4412',
        role: 'student',
        status: 'active',
        suspended_reason: null,
        created_at: dayIso(-60) + 'T08:00:00Z',
      },
    ],

    teacher_profiles: [
      {
        profile_id: teacher1Id,
        teacher_code: 'TCH-001',
        employment_status: 'active',
        employment_type: 'full_time',
        employment_start: dayIso(-150),
        qualifications: 'TESOL Certified, BA English & Tamil Communication',
        bio: 'Warm, patient mentor with 7+ years helping shy beginners speak English and Tamil comfortably.',
        address: 'Mont Kiara, Kuala Lumpur',
        notes: 'Lead instructor for English Beginners & Conversational Tamil.',
      },
      {
        profile_id: teacher2Id,
        teacher_code: 'TCH-002',
        employment_status: 'active',
        employment_type: 'part_time',
        employment_start: dayIso(-120),
        qualifications: 'M.Ed Language Education (UM)',
        bio: 'Specialist in workplace Bahasa Melayu and practical public speaking.',
        address: 'Petaling Jaya, Selangor',
        notes: 'Evening and weekend Bahasa Melayu classes.',
      },
    ],

    teacher_languages: [
      { id: 'tl-1', teacher_id: teacher1Id, language_id: langEnId },
      { id: 'tl-2', teacher_id: teacher1Id, language_id: langEnBegId },
      { id: 'tl-3', teacher_id: teacher1Id, language_id: langTaId },
      { id: 'tl-4', teacher_id: teacher2Id, language_id: langMsId },
    ],

    teacher_booking_settings: [
      {
        teacher_id: teacher1Id,
        accepts_bookings: true,
        min_notice_hours: 24,
        max_advance_days: 30,
        slot_interval_minutes: 30,
        buffer_minutes: 0,
        price_per_hour: 90,
        durations: [45, 60, 90],
        mode: 'either',
        requires_approval: true,
        bio: 'Friendly 1-to-1 coaching tailored to interview prep, daily English, or spoken Tamil.',
      },
    ],

    teacher_availability: [
      { id: 'ta-1', teacher_id: teacher1Id, weekday: 2, start_time: '14:00:00', end_time: '17:00:00', mode: 'either' },
      { id: 'ta-2', teacher_id: teacher1Id, weekday: 4, start_time: '14:00:00', end_time: '17:00:00', mode: 'online' },
      { id: 'ta-3', teacher_id: teacher1Id, weekday: 6, start_time: '10:00:00', end_time: '13:00:00', mode: 'either' },
    ],

    teacher_time_off: [],

    classes: [
      {
        id: cls1Id,
        name: 'English Beginners Daily',
        course_id: crsEnBegId,
        level_id: lvlA1Id,
        teacher_id: teacher1Id,
        classroom_id: room2Id,
        kind: 'group',
        mode: 'hybrid',
        status: 'active',
        capacity: 12,
        fee: 150,
        billing_frequency: 'monthly',
        meeting_link: 'https://meet.topmind.my/eng-beg-daily',
        location_note: 'Studio A or Live Zoom',
        start_date: dayIso(-45),
        end_date: null,
        created_at: dayIso(-50) + 'T09:00:00Z',
      },
      {
        id: cls2Id,
        name: 'Conversational Tamil',
        course_id: crsTaConvId,
        level_id: lvlTa1Id,
        teacher_id: teacher1Id,
        classroom_id: room2Id,
        kind: 'group',
        mode: 'online',
        status: 'active',
        capacity: 10,
        fee: 150,
        billing_frequency: 'monthly',
        meeting_link: 'https://meet.topmind.my/tamil-conv',
        location_note: 'Interactive Online Class',
        start_date: dayIso(-30),
        end_date: null,
        created_at: dayIso(-35) + 'T09:00:00Z',
      },
      {
        id: cls3Id,
        name: 'Practical Bahasa Melayu Evening',
        course_id: crsMsCommId,
        level_id: lvlMs1Id,
        teacher_id: teacher2Id,
        classroom_id: room1Id,
        kind: 'group',
        mode: 'physical',
        status: 'active',
        capacity: 10,
        fee: 150,
        billing_frequency: 'monthly',
        meeting_link: null,
        location_note: 'Mont Kiara Centre · Studio A',
        start_date: dayIso(-20),
        end_date: null,
        created_at: dayIso(-25) + 'T09:00:00Z',
      },
    ],

    class_schedules: [
      { id: 'cs-1', class_id: cls1Id, weekday: 1, start_time: '19:30:00', end_time: '21:00:00' },
      { id: 'cs-2', class_id: cls1Id, weekday: 3, start_time: '19:30:00', end_time: '21:00:00' },
      { id: 'cs-3', class_id: cls2Id, weekday: 2, start_time: '20:00:00', end_time: '21:30:00' },
      { id: 'cs-4', class_id: cls3Id, weekday: 4, start_time: '20:00:00', end_time: '21:30:00' },
    ],

    students: [
      {
        id: stu1Id,
        student_code: 'ST-2026-001',
        profile_id: 'demo-student-id',
        full_name: 'Aisha Binti Rahman',
        race_ethnicity: 'Malay',
        email: 'student@topmind.my',
        phone: '+60 11-2890 4412',
        date_of_birth: '1998-06-15',
        preferred_contact: 'whatsapp',
        status: 'active',
        preferred_language_id: langEnBegId,
        learning_objectives: 'Speak English smoothly with international clients at work',
        guardian_name: 'Rahman Ismail',
        guardian_phone: '+60 12-331 9910',
        emergency_name: 'Rahman Ismail',
        emergency_phone: '+60 12-331 9910',
        consent_privacy_at: dayIso(-45) + 'T10:00:00Z',
        consent_whatsapp: true,
        consent_marketing: false,
        timezone: 'Asia/Kuala_Lumpur',
        source: 'website',
        created_at: dayIso(-45) + 'T10:00:00Z',
      },
      {
        id: stu2Id,
        student_code: 'ST-2026-002',
        profile_id: null,
        full_name: 'Daniel Tan Wei Ming',
        race_ethnicity: 'Chinese',
        email: 'daniel.tan@example.my',
        phone: '+60 16-772 8831',
        date_of_birth: '1995-03-22',
        preferred_contact: 'whatsapp',
        status: 'active',
        preferred_language_id: langEnBegId,
        learning_objectives: 'Build confidence speaking English during daily team standups',
        guardian_name: 'Michelle Tan',
        guardian_phone: '+60 16-772 0019',
        emergency_name: 'Michelle Tan',
        emergency_phone: '+60 16-772 0019',
        consent_privacy_at: dayIso(-40) + 'T10:00:00Z',
        consent_whatsapp: true,
        consent_marketing: true,
        timezone: 'Asia/Kuala_Lumpur',
        source: 'instagram',
        created_at: dayIso(-40) + 'T10:00:00Z',
      },
      {
        id: stu3Id,
        student_code: 'ST-2026-003',
        profile_id: null,
        full_name: 'Kavitha A/P Subramaniam',
        race_ethnicity: 'Indian',
        email: 'kavitha.s@example.my',
        phone: '+60 19-403 2219',
        date_of_birth: '1994-11-08',
        preferred_contact: 'email',
        status: 'active',
        preferred_language_id: langTaId,
        learning_objectives: 'Hold full conversations in Tamil with extended family',
        guardian_name: 'Suresh Subramaniam',
        guardian_phone: '+60 19-403 1110',
        emergency_name: 'Suresh Subramaniam',
        emergency_phone: '+60 19-403 1110',
        consent_privacy_at: dayIso(-32) + 'T10:00:00Z',
        consent_whatsapp: false,
        consent_marketing: false,
        timezone: 'Asia/Kuala_Lumpur',
        source: 'referral',
        created_at: dayIso(-32) + 'T10:00:00Z',
      },
      {
        id: stu4Id,
        student_code: 'ST-2026-004',
        profile_id: null,
        full_name: 'Farah Nadia Aziz',
        email: 'farah.aziz@example.my',
        phone: '+60 17-612 5530',
        date_of_birth: '1999-02-19',
        preferred_contact: 'whatsapp',
        status: 'active',
        preferred_language_id: langTaId,
        learning_objectives: 'Conversational Tamil for community volunteering',
        guardian_name: 'Aziz Kamarudin',
        guardian_phone: '+60 17-612 1002',
        emergency_name: 'Aziz Kamarudin',
        emergency_phone: '+60 17-612 1002',
        consent_privacy_at: dayIso(-28) + 'T10:00:00Z',
        consent_whatsapp: true,
        consent_marketing: false,
        timezone: 'Asia/Kuala_Lumpur',
        source: 'website',
        created_at: dayIso(-28) + 'T10:00:00Z',
      },
    ],

    enrolments: [
      { id: 'enr-1', student_id: stu1Id, class_id: cls1Id, status: 'active', start_date: dayIso(-45), end_date: null, fee_override: null, discount_percent: 0, reason: null, notes: null, created_at: dayIso(-45) + 'T10:00:00Z' },
      { id: 'enr-2', student_id: stu1Id, class_id: cls2Id, status: 'active', start_date: dayIso(-30), end_date: null, fee_override: null, discount_percent: 0, reason: null, notes: null, created_at: dayIso(-30) + 'T10:00:00Z' },
      { id: 'enr-3', student_id: stu2Id, class_id: cls1Id, status: 'active', start_date: dayIso(-40), end_date: null, fee_override: null, discount_percent: 0, reason: null, notes: null, created_at: dayIso(-40) + 'T10:00:00Z' },
      { id: 'enr-4', student_id: stu3Id, class_id: cls2Id, status: 'active', start_date: dayIso(-30), end_date: null, fee_override: null, discount_percent: 0, reason: null, notes: null, created_at: dayIso(-30) + 'T10:00:00Z' },
      { id: 'enr-5', student_id: stu4Id, class_id: cls2Id, status: 'active', start_date: dayIso(-28), end_date: null, fee_override: null, discount_percent: 0, reason: null, notes: null, created_at: dayIso(-28) + 'T10:00:00Z' },
    ],

    sessions: [
      {
        id: ses1Id,
        class_id: cls1Id,
        teacher_id: teacher1Id,
        booking_id: null,
        session_date: dayIso(0),
        start_time: '19:30:00',
        end_time: '21:00:00',
        starts_at: atOffset(0, 19, 30),
        ends_at: atOffset(0, 21, 0),
        status: 'scheduled',
        topic: 'Introducing Yourself & Daily Routines',
        notes: 'Focus on spoken fluency and warm-up dialogues.',
        cancel_reason: null,
      },
      {
        id: ses2Id,
        class_id: cls2Id,
        teacher_id: teacher1Id,
        booking_id: null,
        session_date: dayIso(0),
        start_time: '20:00:00',
        end_time: '21:30:00',
        starts_at: atOffset(0, 20, 0),
        ends_at: atOffset(0, 21, 30),
        status: 'scheduled',
        topic: 'Polite Greetings & Shopping Phrases',
        notes: 'Interactive roleplay breakout pairs.',
        cancel_reason: null,
      },
      {
        id: ses3Id,
        class_id: cls1Id,
        teacher_id: teacher1Id,
        booking_id: null,
        session_date: dayIso(-2),
        start_time: '19:30:00',
        end_time: '21:00:00',
        starts_at: atOffset(-2, 19, 30),
        ends_at: atOffset(-2, 21, 0),
        status: 'completed',
        topic: 'Ordering Food & Asking Questions Politely',
        notes: 'Great class energy!',
        cancel_reason: null,
      },
      {
        id: ses4Id,
        class_id: cls1Id,
        teacher_id: teacher1Id,
        booking_id: null,
        session_date: dayIso(3),
        start_time: '19:30:00',
        end_time: '21:00:00',
        starts_at: atOffset(3, 19, 30),
        ends_at: atOffset(3, 21, 0),
        status: 'scheduled',
        topic: 'Describing Work & Hobbies',
        notes: '',
        cancel_reason: null,
      },
    ],

    attendance: [
      { id: 'att-1', session_id: ses3Id, student_id: stu1Id, status: 'present', remarks: 'Active participation', recorded_at: atOffset(-2, 21, 5) },
      { id: 'att-2', session_id: ses3Id, student_id: stu2Id, status: 'present', remarks: null, recorded_at: atOffset(-2, 21, 5) },
      { id: 'att-3', session_id: ses1Id, student_id: stu1Id, status: 'present', remarks: '', recorded_at: atOffset(0, 19, 35) },
    ],

    attendance_history: [],
    progress_notes: [
      { id: 'prog-1', student_id: 'stu-aisha', skill: 'Speaking', score: 68, lesson_date: dayIso(-14), notes: 'Can introduce herself and describe her work.', created_at: atOffset(-14, 20) },
      { id: 'prog-2', student_id: 'stu-aisha', skill: 'Speaking', score: 79, lesson_date: dayIso(-2), notes: 'Greater confidence with open-ended questions.', created_at: atOffset(-2, 20) },
    ],

    invoices: [
      {
        id: inv1Id,
        invoice_no: 'INV-2026-0101',
        student_id: stu1Id,
        description: `Monthly Tuition · English Beginners Daily (${lastMonth})`,
        period: `${lastMonth}-01`,
        period_start: `${lastMonth}-01`,
        period_end: `${lastMonth}-28`,
        subtotal: 150,
        discount_total: 0,
        adjustment_total: 0,
        amount: 150,
        status: 'paid',
        due_date: dayIso(-15),
        issued_at: dayIso(-28) + 'T09:00:00Z',
        payment_instructions: 'Paid in full via DuitNow QR.',
        void_reason: null,
        created_at: dayIso(-28) + 'T09:00:00Z',
      },
      {
        id: inv2Id,
        invoice_no: 'INV-2026-0118',
        student_id: stu1Id,
        description: `Monthly Tuition · English Beginners Daily (${thisMonth})`,
        period: `${thisMonth}-01`,
        period_start: `${thisMonth}-01`,
        period_end: `${thisMonth}-30`,
        subtotal: 150,
        discount_total: 0,
        adjustment_total: 0,
        amount: 150,
        status: 'unpaid',
        due_date: dayIso(7),
        issued_at: dayIso(-3) + 'T09:00:00Z',
        payment_instructions: 'Please transfer RM 150 to Maybank 5142 7180 9932 with reference INV-2026-0118.',
        void_reason: null,
        created_at: dayIso(-3) + 'T09:00:00Z',
      },
      {
        id: inv3Id,
        invoice_no: 'INV-2026-0102',
        student_id: stu2Id,
        description: `Monthly Tuition · English Beginners Daily (${thisMonth})`,
        period: `${thisMonth}-01`,
        period_start: `${thisMonth}-01`,
        period_end: `${thisMonth}-30`,
        subtotal: 150,
        discount_total: 0,
        adjustment_total: 0,
        amount: 150,
        status: 'paid',
        due_date: dayIso(5),
        issued_at: dayIso(-5) + 'T09:00:00Z',
        payment_instructions: null,
        void_reason: null,
        created_at: dayIso(-5) + 'T09:00:00Z',
      },
    ],

    invoice_items: [
      { id: 'ii-1', invoice_id: inv1Id, kind: 'tuition', description: 'English Beginners Daily (Monthly)', quantity: 1, unit_price: 150, amount: 150, sort_order: 1, created_at: dayIso(-28) + 'T09:00:00Z' },
      { id: 'ii-2', invoice_id: inv2Id, kind: 'tuition', description: 'English Beginners Daily (Monthly)', quantity: 1, unit_price: 150, amount: 150, sort_order: 1, created_at: dayIso(-3) + 'T09:00:00Z' },
      { id: 'ii-3', invoice_id: inv3Id, kind: 'tuition', description: 'English Beginners Daily (Monthly)', quantity: 1, unit_price: 150, amount: 150, sort_order: 1, created_at: dayIso(-5) + 'T09:00:00Z' },
    ],

    invoice_adjustments: [],

    invoice_overview: [
      {
        id: inv2Id,
        invoice_no: 'INV-2026-0118',
        student_id: stu1Id,
        student_name: 'Aisha Binti Rahman',
        student_code: 'ST-2026-001',
        description: `Monthly Tuition · English Beginners Daily (${thisMonth})`,
        period: `${thisMonth}-01`,
        period_start: `${thisMonth}-01`,
        period_end: `${thisMonth}-30`,
        status: 'unpaid',
        display_status: 'unpaid',
        amount_due: 150,
        amount_paid: 0,
        balance: 150,
        pending_count: 1,
        due_date: dayIso(7),
        issued_at: dayIso(-3) + 'T09:00:00Z',
        created_at: dayIso(-3) + 'T09:00:00Z',
      },
      {
        id: inv1Id,
        invoice_no: 'INV-2026-0101',
        student_id: stu1Id,
        student_name: 'Aisha Binti Rahman',
        student_code: 'ST-2026-001',
        description: `Monthly Tuition · English Beginners Daily (${lastMonth})`,
        period: `${lastMonth}-01`,
        period_start: `${lastMonth}-01`,
        period_end: `${lastMonth}-28`,
        status: 'paid',
        display_status: 'paid',
        amount_due: 150,
        amount_paid: 150,
        balance: 0,
        pending_count: 0,
        due_date: dayIso(-15),
        issued_at: dayIso(-28) + 'T09:00:00Z',
        created_at: dayIso(-28) + 'T09:00:00Z',
      },
      {
        id: inv3Id,
        invoice_no: 'INV-2026-0102',
        student_id: stu2Id,
        student_name: 'Daniel Tan Wei Ming',
        student_code: 'ST-2026-002',
        description: `Monthly Tuition · English Beginners Daily (${thisMonth})`,
        period: `${thisMonth}-01`,
        period_start: `${thisMonth}-01`,
        period_end: `${thisMonth}-30`,
        status: 'paid',
        display_status: 'paid',
        amount_due: 150,
        amount_paid: 150,
        balance: 0,
        pending_count: 0,
        due_date: dayIso(5),
        issued_at: dayIso(-5) + 'T09:00:00Z',
        created_at: dayIso(-5) + 'T09:00:00Z',
      },
    ],

    payments: [
      {
        id: 'pay-1',
        student_id: stu1Id,
        invoice_id: inv1Id,
        amount: 150,
        method: 'duitnow',
        reference: 'DNQ-2026-8841',
        paid_on: dayIso(-20),
        status: 'confirmed',
        receipt_no: 'RCP-2026-0084',
        receipt_issued_at: dayIso(-20) + 'T11:30:00Z',
        remarks: 'Paid cleanly via DuitNow QR',
        evidence_path: null,
        gateway: null,
        rejected_reason: null,
        refund_reason: null,
        created_at: dayIso(-20) + 'T11:20:00Z',
      },
      {
        id: 'pay-2',
        student_id: stu1Id,
        invoice_id: inv2Id,
        amount: 150,
        method: 'bank_transfer',
        reference: 'MBB-994201',
        paid_on: dayIso(-1),
        status: 'pending',
        receipt_no: null,
        receipt_issued_at: null,
        remarks: 'Online transfer slip uploaded for verification',
        evidence_path: null,
        gateway: null,
        rejected_reason: null,
        refund_reason: null,
        created_at: dayIso(-1) + 'T15:10:00Z',
      },
      {
        id: 'pay-3',
        student_id: stu2Id,
        invoice_id: inv3Id,
        amount: 150,
        method: 'online_gateway',
        reference: 'STR-2026-4410',
        paid_on: dayIso(-4),
        status: 'confirmed',
        receipt_no: 'RCP-2026-0091',
        receipt_issued_at: dayIso(-4) + 'T14:00:00Z',
        remarks: null,
        evidence_path: null,
        gateway: 'Stripe',
        rejected_reason: null,
        refund_reason: null,
        created_at: dayIso(-4) + 'T13:58:00Z',
      },
    ],

    payment_methods: [
      { code: 'bank_transfer', name: 'Bank Transfer (Maybank)', instructions: 'Transfer to Maybank 5142 7180 9932 (Top Mind Enterprise).', requires_reference: true, is_active: true, sort_order: 1 },
      { code: 'duitnow', name: 'DuitNow QR / Instant Transfer', instructions: 'Scan our centre DuitNow QR and enter reference.', requires_reference: true, is_active: true, sort_order: 2 },
      { code: 'cash', name: 'Cash at Centre', instructions: 'Pay directly at Mont Kiara reception.', requires_reference: false, is_active: true, sort_order: 3 },
      { code: 'online_gateway', name: 'Card / FPX Online', instructions: 'Instant online payment link.', requires_reference: false, is_active: true, sort_order: 4 },
    ],

    teacher_rates: [
      { id: 'tr-1', teacher_id: teacher1Id, basis: 'per_lesson', rate: 80, applies_to: 'group', effective_from: '2026-01-01', effective_to: null, notes: 'Group classes (90-min session)' },
      { id: 'tr-2', teacher_id: teacher1Id, basis: 'hourly', rate: 120, applies_to: 'one_to_one', effective_from: '2026-01-01', effective_to: null, notes: '1-to-1 private coaching rate' },
      { id: 'tr-3', teacher_id: teacher1Id, basis: 'per_workshop', rate: 150, applies_to: 'all', effective_from: '2026-01-01', effective_to: null, notes: 'Flat honorarium per workshop or trial class (90-min session)' },
      { id: 'tr-4', teacher_id: teacher2Id, basis: 'monthly', rate: 1200, applies_to: 'all', effective_from: '2026-01-01', effective_to: null, notes: 'Fixed monthly retainer' },
    ],

    teacher_workshops: [
      {
        id: 'tw-1',
        teacher_id: teacher1Id,
        title: 'Storytelling Trial Workshop',
        date: `${lastMonth}-18`,
        duration_minutes: 90,
        attendees: 14,
        amount: 150,
        period: `${lastMonth}-01`,
        status: 'completed',
        notes: 'Saturday morning community workshop',
      },
      {
        id: 'tw-2',
        teacher_id: teacher1Id,
        title: 'Storytelling Trial Workshop',
        date: dayIso(-3),
        duration_minutes: 90,
        attendees: 16,
        amount: 150,
        period: `${thisMonth}-01`,
        status: 'completed',
        notes: 'Interactive public trial workshop (90-min session)',
      },
      {
        id: 'tw-3',
        teacher_id: teacher1Id,
        title: 'Workplace English Kickstart Masterclass',
        date: dayIso(-1),
        duration_minutes: 90,
        attendees: 12,
        amount: 150,
        period: `${thisMonth}-01`,
        status: 'completed',
        notes: 'One-off evening masterclass',
      },
    ],

    teacher_payouts: [
      {
        id: 'sal-1',
        teacher_id: teacher1Id,
        period: `${lastMonth}-01`,
        status: 'paid',
        lessons_completed: 24,
        hours: 36,
        students_count: 18,
        base_amount: 1630,
        additions: 140,
        deductions: 0,
        amount: 1770,
        amount_paid: 1770,
        approved_at: dayIso(-23) + 'T09:00:00Z',
        breakdown: {
          missing_attendance: 0,
          regular_amount: 1480,
          workshop_amount: 150,
          lines: [
            { rate_id: 'tr-1', basis: 'per_lesson', applies_to: 'group', rate: 80, quantity: 14, amount: 1120 },
            { rate_id: 'tr-2', basis: 'hourly', applies_to: 'one_to_one', rate: 120, quantity: 3, amount: 360 },
            { rate_id: 'tr-3', basis: 'per_workshop', applies_to: 'all', rate: 150, quantity: 1, amount: 150, title: 'Storytelling Trial Workshop', date: `${lastMonth}-18` },
          ],
          workshops: [
            { id: 'tw-1', title: 'Storytelling Trial Workshop', date: `${lastMonth}-18`, duration_minutes: 90, attendees: 14, amount: 150 },
          ],
        },
        created_at: dayIso(-25) + 'T10:00:00Z',
      },
      {
        id: 'sal-2',
        teacher_id: teacher2Id,
        period: `${lastMonth}-01`,
        status: 'approved',
        lessons_completed: 16,
        hours: 24,
        students_count: 10,
        base_amount: 1200,
        additions: 0,
        deductions: 0,
        amount: 1200,
        amount_paid: 0,
        approved_at: dayIso(-23) + 'T09:30:00Z',
        breakdown: {
          missing_attendance: 0,
          regular_amount: 1200,
          workshop_amount: 0,
          lines: [
            { rate_id: 'tr-4', basis: 'monthly', applies_to: 'all', rate: 1200, quantity: 1, amount: 1200 },
          ],
          workshops: [],
        },
        created_at: dayIso(-25) + 'T10:00:00Z',
      },
    ],

    teacher_payout_items: [
      { id: 'spi-1', payout_id: 'sal-1', kind: 'addition', description: 'Curriculum & Prop Preparation Allowance', amount: 140, created_at: dayIso(-24) + 'T10:00:00Z' },
    ],

    teacher_payout_payments: [
      { id: 'spp-1', payout_id: 'sal-1', amount: 1770, paid_on: dayIso(-22), method: 'bank_transfer', reference: 'SAL-2026-004' },
    ],

    free_classes: [
      {
        id: 'fc-1',
        title: 'Spoken English Confidence Workshop',
        description: 'Overcome hesitation and practice everyday English conversations with Ms. Priya in a relaxed small-group setting.',
        instructor: 'Ms. Priya Shanmugam',
        language: 'English',
        target_audience: 'Adults & Working Professionals',
        mode: 'Hybrid',
        location: 'Mont Kiara Centre & Live Zoom',
        starts_at: atOffset(4, 10, 30),
        ends_at: atOffset(4, 12, 0),
        image_url: null,
        capacity: 20,
        active: true,
        created_at: dayIso(-5) + 'T09:00:00Z',
        updated_at: dayIso(-5) + 'T09:00:00Z',
      },
      {
        id: 'fc-2',
        title: 'Conversational Tamil Taster Session',
        description: 'Learn essential greetings, family phrases, and natural pronunciation — beginner friendly with zero prior experience needed.',
        instructor: 'Ms. Priya Shanmugam',
        language: 'Tamil',
        target_audience: 'Complete Beginners',
        mode: 'Online',
        location: 'Live Interactive Zoom',
        starts_at: atOffset(7, 20, 0),
        ends_at: atOffset(7, 21, 15),
        image_url: null,
        capacity: 25,
        active: true,
        created_at: dayIso(-3) + 'T09:00:00Z',
        updated_at: dayIso(-3) + 'T09:00:00Z',
      },
      {
        id: 'fc-3',
        title: 'Everyday Bahasa Melayu Quickstart',
        description: 'Build immediate confidence ordering food, speaking with neighbours, and handling daily errands in Malaysia.',
        instructor: 'Mr. Hafizuddin Ismail',
        language: 'Malay',
        target_audience: 'Expats & Everyday Learners',
        mode: 'In-Person',
        location: 'Studio A, Mont Kiara',
        starts_at: atOffset(10, 14, 30),
        ends_at: atOffset(10, 16, 0),
        image_url: null,
        capacity: 15,
        active: true,
        created_at: dayIso(-2) + 'T09:00:00Z',
        updated_at: dayIso(-2) + 'T09:00:00Z',
      },
    ],

    registrations: [
      {
        id: 'reg-1',
        tracking_code: 'TM2026A1B2',
        student_name: 'Nurin Aliah Zulkifli',
        guardian_name: null,
        email: 'nurin.aliah@example.my',
        phone: '+60 12-665 4312',
        preferred_contact: 'whatsapp',
        date_of_birth: '1997-04-12',
        language_id: langEnBegId,
        course_id: crsEnBegId,
        class_id: cls1Id,
        recommended_class_id: cls1Id,
        recommendation_reason: 'Placement assessment: 100%, suggested level Beginner (A1)',
        assessment_attempt_id: 'att-reg-1',
        level_self: 'Beginner',
        objectives: 'Speak fluently at my new workplace',
        format: 'group',
        preferred_days: [1, 3],
        preferred_times: ['evening'],
        timezone: 'Asia/Kuala_Lumpur',
        mode: 'hybrid',
        additional_info: 'Prefer evening sessions after 7pm',
        status: 'pending',
        source: 'website',
        created_at: dayIso(-1) + 'T11:20:00Z',
      },
      {
        id: 'reg-2',
        tracking_code: 'FREE-92C4A1',
        student_name: 'Jason Lim',
        guardian_name: null,
        email: 'jason.lim@example.my',
        phone: '+60 16-309 8872',
        preferred_contact: 'whatsapp',
        language_id: langEnId,
        course_id: null,
        format: 'group',
        mode: 'either',
        additional_info: 'Free class reservation: Spoken English Confidence Workshop',
        status: 'approved',
        source: 'free_class',
        created_at: dayIso(-2) + 'T16:45:00Z',
      },
    ],

    enquiries: [
      {
        id: 'enq-1',
        name: 'Mei Ling Chong',
        email: 'meiling.c@example.my',
        phone: '+60 12-883 1200',
        message: 'Hi, do you offer evening Beginner English classes for working adults?',
        source: 'website',
        status: 'new',
        created_at: dayIso(-1) + 'T14:20:00Z',
      },
      {
        id: 'enq-2',
        name: 'Arvind Kumar',
        email: 'arvind.k@example.my',
        phone: '+60 11-5520 3319',
        message: 'Interested in private 1-to-1 Conversational Tamil on Saturday mornings.',
        source: 'whatsapp',
        status: 'follow_up',
        created_at: dayIso(-3) + 'T09:15:00Z',
      },
    ],

    enquiry_messages: [
      {
        id: 'em-1',
        enquiry_id: 'enq-2',
        direction: 'outbound',
        channel: 'whatsapp',
        body: 'Hi Arvind! Saturday morning slots with Ms. Priya are available from 10 AM.',
        created_at: dayIso(-2) + 'T10:00:00Z',
      },
    ],

    bookings: [
      {
        id: 'bk-1',
        student_id: stu1Id,
        teacher_id: teacher1Id,
        language_id: langEnId,
        starts_at: atOffset(2, 15, 0),
        ends_at: atOffset(2, 16, 0),
        duration_minutes: 60,
        mode: 'online',
        objective: 'Job interview & presentation coaching',
        notes: 'Would love feedback on answering behavioural questions.',
        price: 90,
        status: 'approved',
        cancel_reason: null,
        decision_reason: null,
        reason: null,
        created_at: dayIso(-2) + 'T10:00:00Z',
      },
      {
        id: 'bk-2',
        student_id: stu2Id,
        teacher_id: teacher1Id,
        language_id: langEnBegId,
        starts_at: atOffset(3, 14, 0),
        ends_at: atOffset(3, 15, 0),
        duration_minutes: 60,
        mode: 'physical',
        objective: 'Pronunciation & small talk drills',
        notes: '',
        price: 90,
        status: 'requested',
        cancel_reason: null,
        decision_reason: null,
        reason: null,
        created_at: dayIso(-1) + 'T09:30:00Z',
      },
    ],

    materials: [
      {
        id: 'mat-1',
        title: 'Unit 1 · Everyday Small Talk & Introductions (PDF)',
        description: 'Printable worksheet and dialogue script for English Beginners Daily.',
        class_id: cls1Id,
        course_id: crsEnBegId,
        language_id: langEnBegId,
        kind: 'worksheet',
        topic: 'Introductions & Small Talk',
        lesson_label: 'Week 1 · Lesson 1',
        audience: 'students',
        is_published: true,
        deleted_at: null,
        storage_path: 'unit-1-introductions.pdf',
        file_name: 'unit-1-introductions.pdf',
        mime_type: 'application/pdf',
        size_bytes: 284120,
        uploaded_by: teacher1Id,
        created_at: dayIso(-14) + 'T08:00:00Z',
      },
      {
        id: 'mat-2',
        title: 'Tamil Everyday Phrases Audio & Vocabulary Pack',
        description: 'Essential greetings, numbers, and polite responses.',
        class_id: cls2Id,
        course_id: crsTaConvId,
        language_id: langTaId,
        kind: 'document',
        topic: 'Greetings & Polite Phrases',
        lesson_label: 'Module 1',
        audience: 'students',
        is_published: true,
        deleted_at: null,
        storage_path: 'tamil-everyday-pack.pdf',
        file_name: 'tamil-everyday-pack.pdf',
        mime_type: 'application/pdf',
        size_bytes: 192400,
        uploaded_by: teacher1Id,
        created_at: dayIso(-10) + 'T08:00:00Z',
      },
    ],

    announcements: [
      {
        id: 'ann-1',
        title: 'New Free Workshops Open for Registration',
        body: 'Share our upcoming Spoken English and Conversational Tamil free workshops with friends on /free-classes!',
        audience: 'all',
        class_id: null,
        active: true,
        published_at: dayIso(-3) + 'T08:00:00Z',
        created_at: dayIso(-3) + 'T08:00:00Z',
      },
    ],

    checklists: [
      { id: 'chk-1', month: `${thisMonth}-01`, category: 'attendance', title: 'Record attendance for all completed lessons', due_date: dayIso(3), status: 'in_progress', auto_key: 'attendance_recorded', auto_detail: 'Today’s lessons awaiting attendance save', assignee: teacher1Id, completed_at: null, notes: null },
      { id: 'chk-2', month: `${thisMonth}-01`, category: 'invoicing', title: 'Issue monthly tuition invoices', due_date: dayIso(5), status: 'completed', auto_key: 'invoices_issued', auto_detail: 'All active student invoices issued', assignee: 'demo-admin-id', completed_at: dayIso(-2) + 'T10:00:00Z', notes: null },
      { id: 'chk-3', month: `${thisMonth}-01`, category: 'payments', title: 'Review pending bank transfer slips', due_date: dayIso(2), status: 'pending', auto_key: null, auto_detail: null, assignee: 'demo-admin-id', completed_at: null, notes: null },
    ],

    notifications: [
      { id: 'not-1', user_id: 'demo-admin-id', title: 'New free class reservation', body: 'Jason Lim reserved a spot for Spoken English Confidence Workshop.', read: false, link: '/admin/registrations', created_at: dayIso(-1) + 'T16:45:00Z' },
      { id: 'not-2', user_id: teacher1Id, title: 'Upcoming 1-to-1 coaching', body: 'Approved 60-min session with Aisha Binti Rahman in 2 days.', read: false, link: '/teacher/bookings', created_at: dayIso(-1) + 'T10:00:00Z' },
      { id: 'not-3', user_id: 'demo-student-id', title: 'Invoice INV-2026-0118 ready', body: 'Monthly tuition invoice for RM 150.00 is ready for review.', read: false, link: '/student/invoices', created_at: dayIso(-3) + 'T09:05:00Z' },
    ],

    expenses: [
      { id: 'exp-1', description: 'Studio A Whiteboard & Stationery Supplies', category: 'supplies', amount: 280, spent_on: dayIso(-12), created_at: dayIso(-12) + 'T12:00:00Z' },
      { id: 'exp-2', description: 'Centre Rent & Utilities', category: 'rent', amount: 1170, spent_on: dayIso(-10), created_at: dayIso(-10) + 'T12:00:00Z' },
    ],

    assessments: [
      { id: 'ass-1', title: 'English Placement Quick Quiz', description: 'Quick grammar, vocabulary and sentence check to help place you cleanly.', instructions: 'Choose the best answer for each question. There is no pass or fail.', language_id: langEnId, course_id: crsEnBegId, is_active: true, time_limit_minutes: 20, skills: ['grammar', 'vocabulary', 'sentence_construction'], created_at: dayIso(-40) + 'T08:00:00Z' },
    ],
    assessment_attempts: [
      {
        id: 'att-reg-1',
        assessment_id: 'ass-1',
        registration_id: 'reg-1',
        student_id: null,
        token: 'demo-assessment-token',
        status: 'submitted',
        auto_points: 20,
        auto_max: 20,
        manual_max: 5,
        manual_points: null,
        percent: 100,
        level_id: lvlA1Id,
        recommended_class_id: cls1Id,
        started_at: dayIso(-1) + 'T11:25:00Z',
        submitted_at: dayIso(-1) + 'T11:32:00Z',
        expires_at: dayIso(30) + 'T23:59:59Z',
        created_at: dayIso(-1) + 'T11:20:00Z',
      },
    ],
    assessment_questions: [
      { id: 'aq-1', assessment_id: 'ass-1', sort_order: 1, kind: 'mcq', section: 'grammar', prompt: 'She ___ to class every Tuesday.', options: ['go', 'goes', 'going', 'gone'], correct_option: 1, points: 10 },
      { id: 'aq-2', assessment_id: 'ass-1', sort_order: 2, kind: 'mcq', section: 'vocabulary', prompt: 'Which word best completes: "We had a ___ conversation over coffee."?', options: ['friendly', 'loudly', 'quickly', 'nearly'], correct_option: 0, points: 10 },
      { id: 'aq-3', assessment_id: 'ass-1', sort_order: 3, kind: 'short_text', section: 'sentence_construction', prompt: 'Introduce yourself and share one goal for learning English (1–2 sentences).', options: null, correct_option: null, accepted_answers: null, points: 5 },
    ],
    assessment_answers: [
      { id: 'aa-1', attempt_id: 'att-reg-1', question_id: 'aq-1', selected_option: 1, text_answer: null, is_correct: true, points_awarded: 10 },
      { id: 'aa-2', attempt_id: 'att-reg-1', question_id: 'aq-2', selected_option: 0, text_answer: null, is_correct: true, points_awarded: 10 },
      { id: 'aa-3', attempt_id: 'att-reg-1', question_id: 'aq-3', selected_option: null, text_answer: 'Hi, I am Nurin and I want to speak English confidently at my new workplace.', is_correct: null, points_awarded: null },
    ],
    placement_bands: [
      { id: 'pb-1', assessment_id: 'ass-1', level_id: lvlA1Id, min_percent: 0 },
      { id: 'pb-2', assessment_id: 'ass-1', level_id: lvlA2Id, min_percent: 60 },
    ],
    placements: [
      { id: 'pl-1', student_id: stu1Id, course_id: crsEnBegId, level_id: lvlA1Id, class_id: cls1Id, source: 'assessment', reason: 'Initial intake level placement', created_at: dayIso(-45) + 'T10:00:00Z' },
    ],
    message_outbox: [
      {
        id: 'mo-1',
        student_id: stu1Id,
        channel: 'email',
        template_key: 'payment_confirmed',
        recipient: 'student@topmind.my',
        recipient_name: 'Aisha Binti Rahman',
        subject: 'Official Receipt RCP-2026-0084',
        body: 'Thank you for your payment of RM 150.00.',
        status: 'sent',
        attempts: 1,
        last_error: null,
        related_type: 'payment',
        related_id: 'pay-1',
        sent_at: dayIso(-20) + 'T11:32:00Z',
        next_attempt_at: null,
        created_at: dayIso(-20) + 'T11:32:00Z',
      },
      {
        id: 'mo-2',
        student_id: stu1Id,
        channel: 'whatsapp',
        template_key: 'payment_confirmed',
        recipient: '601128904412',
        recipient_name: 'Aisha Binti Rahman',
        subject: null,
        body: 'Hi Aisha, payment RM 150.00 confirmed (Receipt RCP-2026-0084).',
        status: 'sent',
        attempts: 1,
        last_error: null,
        related_type: 'payment',
        related_id: 'pay-1',
        sent_at: dayIso(-20) + 'T11:32:00Z',
        next_attempt_at: null,
        created_at: dayIso(-20) + 'T11:32:00Z',
      },
      {
        id: 'mo-3',
        student_id: stu2Id,
        channel: 'email',
        template_key: 'payment_reminder',
        recipient: 'daniel.tan@example.my',
        recipient_name: 'Daniel Tan Wei Ming',
        subject: 'Friendly Reminder · Monthly Class Update',
        body: 'Hi Daniel, your upcoming English Beginners Daily class starts this week.',
        status: 'queued',
        attempts: 0,
        last_error: null,
        related_type: 'student',
        related_id: stu2Id,
        sent_at: null,
        next_attempt_at: dayIso(0) + 'T18:00:00Z',
        created_at: dayIso(0) + 'T09:00:00Z',
      },
    ],
    message_templates: [
      { id: 'mt-1', key: 'registration_received', channel: 'email', subject: 'Welcome to Top Mind!', body: 'Hi {{name}}, your tracking code is {{tracking_code}}.', is_active: true, wa_template_name: null, wa_language: 'en', wa_params: null },
      { id: 'mt-2', key: 'payment_confirmed', channel: 'email', subject: 'Official Receipt {{receipt_no}}', body: 'Thank you for your payment of {{amount}}.', is_active: true, wa_template_name: null, wa_language: 'en', wa_params: null },
      { id: 'mt-3', key: 'payment_confirmed', channel: 'whatsapp', subject: null, body: 'Hi {{name}}, we confirmed your payment of {{amount}}. Receipt: {{receipt_no}}.', is_active: true, wa_template_name: 'payment_receipt', wa_language: 'en', wa_params: ['name', 'amount', 'receipt_no'] },
    ],
    response_templates: [
      { id: 'rt-1', key: 'fees', title: 'Course fees & payment options', body: 'Group classes start from RM 150/month. One-to-one coaching is RM 90/hour. Register at {{register_url}}.', keywords: ['fee', 'price', 'cost', 'how much'], is_active: true, sort_order: 1 },
      { id: 'rt-2', key: 'schedules', title: 'Evening & weekend schedules', body: 'We run flexible weekday evening (7:30 PM – 9:30 PM) and Saturday sessions online & in Mont Kiara.', keywords: ['time', 'schedule', 'evening', 'weekend'], is_active: true, sort_order: 2 },
    ],
    audit_logs: [
      {
        id: 'aud-1',
        actor_id: 'demo-admin-id',
        actor_role: 'admin',
        action: 'insert',
        table_name: 'free_classes',
        record_id: 'fc-1',
        changed_fields: ['title', 'starts_at', 'active'],
        old_data: null,
        new_data: { title: 'Spoken English Confidence Workshop', active: true },
        occurred_at: dayIso(-5) + 'T09:00:00Z',
        created_at: dayIso(-5) + 'T09:00:00Z',
      },
    ],
    automation_jobs: [
      { id: 'aj-class-reminders', key: 'class_reminders', name: 'Class Schedule Reminders', description: 'Simulate reminders to students for lessons in the next 48 hours.', is_enabled: true, frequency: 'daily', run_at_hour: 18, run_on_day: null, last_status: null, last_run_at: null },
      {
        id: 'aj-1',
        key: 'payment_reminders',
        name: 'Payment Reminders',
        description: 'Queues friendly due-date reminders for unpaid invoices.',
        is_enabled: true,
        frequency: 'daily',
        run_at_hour: 9,
        run_on_day: null,
        last_status: 'succeeded',
        last_run_at: dayIso(-1) + 'T09:00:00Z',
      },
      {
        id: 'aj-2',
        key: 'monthly_invoices',
        name: 'Monthly Tuition Billing',
        description: 'Generates monthly invoices for active student enrolments.',
        is_enabled: true,
        frequency: 'monthly',
        run_at_hour: 8,
        run_on_day: 1,
        last_status: 'succeeded',
        last_run_at: dayIso(-5) + 'T08:00:00Z',
      },
    ],
    automation_runs: [
      { id: 'ar-1', job_key: 'payment_reminders', trigger: 'scheduled', status: 'succeeded', result: { queued: 2 }, error: null, started_at: dayIso(-1) + 'T09:00:00Z' },
    ],
    privacy_requests: [],

    student_spotlights: [
      {
        id: 'spot-1',
        student_id: stu1Id,
        student_name: 'Aisha Binti Rahman',
        avatar_url: null,
        language_level: 'English for Beginners · Level 2',
        category: 'Most Improved Speaker',
        quote: 'Aisha went from hesitant to leading group discussions in 3 months!',
        teacher_name: 'Ms. Priya Shanmugam',
        month_label: 'November 2026',
        featured_on_website: true,
        created_at: dayIso(-5) + 'T09:00:00Z',
      },
      {
        id: 'spot-2',
        student_id: stu2Id,
        student_name: 'Daniel Tan',
        avatar_url: null,
        language_level: 'Practical Bahasa Melayu · Conversational',
        category: 'Vocabulary Champion',
        quote: 'Daniel mastered over 180 everyday business expressions and delivered his mock client pitch cleanly.',
        teacher_name: 'Mr. Hafizuddin Ismail',
        month_label: 'November 2026',
        featured_on_website: true,
        created_at: dayIso(-6) + 'T09:00:00Z',
      },
      {
        id: 'spot-3',
        student_id: stu3Id,
        student_name: 'Kavitha Subramaniam',
        avatar_url: null,
        language_level: 'English for Beginners · Level 1',
        category: 'Confidence Booster',
        quote: 'Kavitha encourages every classmate during breakout dialogues and never misses a speaking turn.',
        teacher_name: 'Ms. Priya Shanmugam',
        month_label: 'October 2026',
        featured_on_website: true,
        created_at: dayIso(-20) + 'T09:00:00Z',
      },
      {
        id: 'spot-4',
        student_id: stu4Id,
        student_name: 'Farah Nadia Zulkifli',
        avatar_url: null,
        language_level: 'Conversational Tamil · Level 1',
        category: 'Perfect Attendance',
        quote: '100% session attendance this term with thoughtful pronunciation practice every week.',
        teacher_name: 'Ms. Priya Shanmugam',
        month_label: 'October 2026',
        featured_on_website: true,
        created_at: dayIso(-22) + 'T09:00:00Z',
      },
    ],

    speaking_competitions: [
      {
        id: 'spk-1',
        tracking_code: 'SPK-260101',
        full_name: 'Aisha Binti Rahman',
        age: 26,
        category: 'Adult Communicators',
        language: 'English',
        speech_topic: 'Finding Your Voice After Years of Silence',
        audition_mode: 'Video Submission',
        video_url: 'https://youtu.be/topmind-audition-aisha',
        phone: '+60 11-2890 4412',
        email: 'student@topmind.my',
        status: 'Finalist',
        notes: 'Strong pacing and warm audience connection.',
        created_at: dayIso(-10) + 'T11:20:00Z',
      },
      {
        id: 'spk-2',
        tracking_code: 'SPK-260102',
        full_name: 'Arvind Kumar Nair',
        age: 15,
        category: 'Youth Orators',
        language: 'Tamil',
        speech_topic: 'வளரும் தலைமுறையின் தாய்மொழிப் பெருமை (Pride in Our Mother Tongue)',
        audition_mode: 'Video Submission',
        video_url: 'https://drive.google.com/file/d/arvind-tamil-oratory',
        phone: '+60 12-664 3319',
        email: 'arvind.nair@example.my',
        status: 'Winner',
        notes: '2026 Early Qualifier · Impromptu round standout.',
        created_at: dayIso(-14) + 'T14:15:00Z',
      },
      {
        id: 'spk-3',
        tracking_code: 'SPK-260103',
        full_name: 'Chloe Wong Mei Ling',
        age: 10,
        category: 'Junior Stars',
        language: 'English',
        speech_topic: 'My Grandfather’s Durian Orchard',
        audition_mode: 'In-Person Audition',
        video_url: null,
        phone: '+60 16-312 8890',
        email: 'parent.wong@example.my',
        status: 'Shortlisted',
        notes: 'Scheduled for Saturday Studio A audition slot.',
        created_at: dayIso(-4) + 'T16:05:00Z',
      },
      {
        id: 'spk-4',
        tracking_code: 'SPK-260104',
        full_name: 'Muhammad Danial Hakim',
        age: 29,
        category: 'Adult Communicators',
        language: 'Bahasa Melayu',
        speech_topic: 'Komunikasi Berempati di Tempat Kerja Moden',
        audition_mode: 'Video Submission',
        video_url: 'https://youtu.be/danial-bm-speech',
        phone: '+60 19-445 7710',
        email: 'danial.hakim@example.my',
        status: 'Registered',
        notes: null,
        created_at: dayIso(-1) + 'T09:40:00Z',
      },
    ],
  }
}

let memDb: Record<string, any[]> | null = null

function loadDb(): Record<string, any[]> {
  if (memDb) return memDb
  const seed = createSeedDb()
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const db: Record<string, any[]> = { ...seed, ...parsed }
        if (!(parsed.centres ?? []).length) db.centres = seed.centres
        db.classrooms = (db.classrooms ?? []).map((r: any, idx: number) => ({
          ...r,
          centre_id: r.centre_id ?? (idx === 0 ? 'ctr-mk' : 'ctr-online'),
        }))
        db.assessment_questions = (db.assessment_questions ?? []).map((q: any) =>
          q.id === 'aq-1' && typeof q.correct_option !== 'number'
            ? { ...q, section: q.section ?? q.skill ?? 'grammar', correct_option: 1 }
            : { ...q, section: q.section ?? q.skill ?? 'grammar' },
        )
        if (!(parsed.automation_jobs ?? []).some((j: any) => j.key === 'class_reminders')) {
          db.automation_jobs = [seed.automation_jobs.find((j) => j.key === 'class_reminders'), ...(parsed.automation_jobs ?? [])]
        }
        db.app_settings = (db.app_settings ?? []).map((s: any) =>
          s.key === 'business.logo_url' && /\/logo\.jpeg$/.test(String(s.value ?? '')) ? { ...s, value: demoLogoUrl() } : s,
        )
        memDb = db
        return db
      }
    }
  } catch {
    // Ignore storage read failure and fall back to fresh seed.
  }
  memDb = seed
  saveDb(memDb)
  return memDb
}

// A small append-only demo audit trail: records are stored in the same browser
// as the client-preview data and are never sent to an external service.
function appendDemoAudit(db: Record<string, any[]>, table: string, action: string, before: any, after: any) {
  if (table === 'audit_logs') return
  const oldData = before ? { ...before } : null
  const newData = after ? { ...after } : null
  const fields = Array.from(new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]))
    .filter((key) => JSON.stringify(oldData?.[key]) !== JSON.stringify(newData?.[key]))
  if (!fields.length) return
  const session = readDemoSession()
  const event = { id: makeUuid('audit'), actor_id: session?.profile.id ?? null,
    actor_role: session?.role ?? 'system', action, table_name: table,
    record_id: after?.id ?? before?.id ?? '', changed_fields: fields,
    old_data: oldData, new_data: newData,
    occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }
  db.audit_logs = [event, ...(db.audit_logs ?? [])].slice(0, 1000)
}

function saveDb(db: Record<string, any[]>) {
  memDb = db
  try {
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db))
  } catch {
    // Ignore quota errors (e.g., very large Base64 image upload).
  }
  try {
    window.dispatchEvent(new CustomEvent('topmind-demo-update'))
  } catch {
    // Ignore when running outside browser DOM.
  }
}

// ---------------------------------------------------------------------------
// Select Parser & Simple Relation Hydration
// ---------------------------------------------------------------------------
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function hydrateRelation(row: any, baseTable: string, relTarget: string, innerSel: string, db: Record<string, any[]>): any {
  const [rawTarget, rawHint] = relTarget.split('!')
  const target = rawTarget.trim()
  const hint = rawHint?.trim()
  const manyChildren: Record<string, Record<string, { table: string; fk: string }>> = {
    classes: {
      class_schedules: { table: 'class_schedules', fk: 'class_id' },
      enrolments: { table: 'enrolments', fk: 'class_id' },
      sessions: { table: 'sessions', fk: 'class_id' },
    },
    students: {
      enrolments: { table: 'enrolments', fk: 'student_id' },
    },
    profiles: {
      teacher_languages: { table: 'teacher_languages', fk: 'teacher_id' },
      classes: { table: 'classes', fk: 'teacher_id' },
    },
    courses: {
      levels: { table: 'levels', fk: 'course_id' },
      classes: { table: 'classes', fk: 'course_id' },
    },
    languages: {
      courses: { table: 'courses', fk: 'language_id' },
    },
    assessments: {
      assessment_questions: { table: 'assessment_questions', fk: 'assessment_id' },
      placement_bands: { table: 'placement_bands', fk: 'assessment_id' },
    },
    enquiries: {
      enquiry_messages: { table: 'enquiry_messages', fk: 'enquiry_id' },
    },
  }

  const childSpec = manyChildren[baseTable]?.[target]
  if (childSpec) {
    const kids = (db[childSpec.table] ?? []).filter((x) => x[childSpec.fk] === row.id)
    return kids.map((k) => projectRow(k, childSpec.table, innerSel, db))
  }

  if (baseTable === 'profiles' && target === 'teacher_profiles') {
    const tp = (db.teacher_profiles ?? []).find((x) => x.profile_id === row.id)
    return tp ? projectRow(tp, 'teacher_profiles', innerSel, db) : null
  }

  const parentLookup: Record<string, Record<string, { table: string; fk: string }>> = {
    classes: {
      courses: { table: 'courses', fk: 'course_id' },
      levels: { table: 'levels', fk: 'level_id' },
      profiles: { table: 'profiles', fk: 'teacher_id' },
      classrooms: { table: 'classrooms', fk: 'classroom_id' },
    },
    courses: {
      languages: { table: 'languages', fk: 'language_id' },
    },
    classrooms: {
      centres: { table: 'centres', fk: 'centre_id' },
    },
    levels: {
      courses: { table: 'courses', fk: 'course_id' },
    },
    students: {
      languages: { table: 'languages', fk: 'preferred_language_id' },
    },
    enrolments: {
      students: { table: 'students', fk: 'student_id' },
      classes: { table: 'classes', fk: 'class_id' },
    },
    placements: {
      courses: { table: 'courses', fk: 'course_id' },
      levels: { table: 'levels', fk: 'level_id' },
      classes: { table: 'classes', fk: 'class_id' },
    },
    payments: {
      students: { table: 'students', fk: 'student_id' },
      invoices: { table: 'invoices', fk: 'invoice_id' },
    },
    invoices: {
      students: { table: 'students', fk: 'student_id' },
    },
    sessions: {
      classes: { table: 'classes', fk: 'class_id' },
      profiles: { table: 'profiles', fk: 'teacher_id' },
      bookings: { table: 'bookings', fk: 'booking_id' },
    },
    attendance: {
      sessions: { table: 'sessions', fk: 'session_id' },
      students: { table: 'students', fk: 'student_id' },
    },
    materials: {
      classes: { table: 'classes', fk: 'class_id' },
      courses: { table: 'courses', fk: 'course_id' },
      languages: { table: 'languages', fk: 'language_id' },
      profiles: { table: 'profiles', fk: 'uploaded_by' },
    },
    announcements: {
      classes: { table: 'classes', fk: 'class_id' },
    },
    teacher_languages: {
      languages: { table: 'languages', fk: 'language_id' },
    },
    teacher_payouts: {
      profiles: { table: 'profiles', fk: 'teacher_id' },
    },
    bookings: {
      students: { table: 'students', fk: 'student_id' },
      profiles: { table: 'profiles', fk: 'teacher_id' },
      languages: { table: 'languages', fk: 'language_id' },
    },
    checklists: {
      profiles: { table: 'profiles', fk: 'assignee' },
    },
    registrations: {
      languages: { table: 'languages', fk: 'language_id' },
      courses: { table: 'courses', fk: 'course_id' },
      classes: { table: 'classes', fk: 'class_id' },
      assessment_attempts: { table: 'assessment_attempts', fk: 'assessment_attempt_id' },
    },
    enquiries: {
      profiles: { table: 'profiles', fk: 'assigned_to' },
      languages: { table: 'languages', fk: 'language_id' },
      courses: { table: 'courses', fk: 'course_id' },
    },
    assessments: {
      courses: { table: 'courses', fk: 'course_id' },
      languages: { table: 'languages', fk: 'language_id' },
    },
    assessment_attempts: {
      assessments: { table: 'assessments', fk: 'assessment_id' },
      levels: { table: 'levels', fk: 'level_id' },
      students: { table: 'students', fk: 'student_id' },
      registrations: { table: 'registrations', fk: 'registration_id' },
    },
    assessment_answers: {
      assessment_questions: { table: 'assessment_questions', fk: 'question_id' },
    },
    placement_bands: {
      levels: { table: 'levels', fk: 'level_id' },
    },
    privacy_requests: {
      profiles: { table: 'profiles', fk: 'profile_id' },
      students: { table: 'students', fk: 'student_id' },
    },
    automation_runs: {
      automation_jobs: { table: 'automation_jobs', fk: 'job_key', pk: 'key' } as any,
    },
  }

  const hintFkMap: Record<string, { table: string; fk: string; pk?: string }> = {
    registrations_class_id_fkey: { table: 'classes', fk: 'class_id' },
    registrations_recommended_class_id_fkey: { table: 'classes', fk: 'recommended_class_id' },
    registrations_assessment_attempt_id_fkey: { table: 'assessment_attempts', fk: 'assessment_attempt_id' },
    checklists_assignee_fkey: { table: 'profiles', fk: 'assignee' },
    bookings_teacher_id_fkey: { table: 'profiles', fk: 'teacher_id' },
    teacher_payouts_teacher_id_fkey: { table: 'profiles', fk: 'teacher_id' },
    privacy_requests_profile_id_fkey: { table: 'profiles', fk: 'profile_id' },
    assessment_attempts_registration_id_fkey: { table: 'registrations', fk: 'registration_id' },
  }

  const pSpec: any = (hint && hintFkMap[hint]) || parentLookup[baseTable]?.[target]
  if (pSpec) {
    const matchKey = pSpec.pk ?? 'id'
    const parent = (db[pSpec.table] ?? []).find((x) => x[matchKey] === row[pSpec.fk])
    return parent ? projectRow(parent, pSpec.table, innerSel, db) : null
  }

  if (row[target] !== undefined) return row[target]
  return null
}

function resolveFilterValue(row: any, baseTable: string, col: string, db: Record<string, any[]>): unknown {
  const direct = getPath(row, col)
  if (direct !== undefined || !col.includes('.')) return direct
  const [rel, ...rest] = col.split('.')
  const hydrated = hydrateRelation(row, baseTable, rel, '*', db)
  return rest.reduce((acc: any, k) => (acc == null ? undefined : acc[k]), hydrated)
}

function projectRow(row: any, table: string, selectStr: string, db: Record<string, any[]>): any {
  const s = (selectStr || '*').trim()
  if (!s || s === '*') return { ...row }
  const out: Record<string, any> = {}
  const tokens = splitTopLevel(s)
  for (const rawTok of tokens) {
    let tok = rawTok.trim()
    let alias: string | null = null
    const colonIdx = tok.indexOf(':')
    const parenIdx = tok.indexOf('(')
    if (colonIdx > 0 && (parenIdx < 0 || colonIdx < parenIdx)) {
      alias = tok.slice(0, colonIdx).trim()
      tok = tok.slice(colonIdx + 1).trim()
    }
    const open = tok.indexOf('(')
    if (open >= 0 && tok.endsWith(')')) {
      const targetRaw = tok.slice(0, open).trim()
      const inner = tok.slice(open + 1, -1)
      const baseKey = targetRaw.split('!')[0].trim()
      out[alias ?? baseKey] = hydrateRelation(row, table, targetRaw, inner, db)
    } else if (tok === '*') {
      Object.assign(out, row)
    } else {
      const key = tok.replace(/::.*$/, '').trim()
      out[alias ?? key] = row[key] ?? null
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Mock PostgREST-like Query Builder
// ---------------------------------------------------------------------------
type FilterFn = (row: any, db: Record<string, any[]>) => boolean

export class MockQueryBuilder {
  private table: string
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private selectCols = '*'
  private selectOpts: { count?: string; head?: boolean } = {}
  private payload: any = null
  private filters: FilterFn[] = []
  private orders: { col: string; ascending: boolean }[] = []
  private limitVal: number | null = null
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'

  constructor(table: string) {
    this.table = table
  }

  select(columns = '*', opts: { count?: string; head?: boolean } = {}) {
    if (this.op === 'select') this.selectCols = columns
    else this.selectCols = columns
    this.selectOpts = opts
    return this
  }

  insert(values: any) {
    this.op = 'insert'
    this.payload = values
    return this
  }

  update(values: any) {
    this.op = 'update'
    this.payload = values
    return this
  }

  upsert(values: any) {
    this.op = 'upsert'
    this.payload = values
    return this
  }

  delete() {
    this.op = 'delete'
    return this
  }

  eq(col: string, val: unknown) {
    this.filters.push((r, db) => String(resolveFilterValue(r, this.table, col, db)) === String(val))
    return this
  }

  neq(col: string, val: unknown) {
    this.filters.push((r, db) => resolveFilterValue(r, this.table, col, db) !== val)
    return this
  }

  gt(col: string, val: any) {
    this.filters.push((r, db) => {
      const v = resolveFilterValue(r, this.table, col, db)
      return v != null && String(v) > String(val)
    })
    return this
  }

  gte(col: string, val: any) {
    this.filters.push((r, db) => {
      const v = resolveFilterValue(r, this.table, col, db)
      return v != null && String(v) >= String(val)
    })
    return this
  }

  lt(col: string, val: any) {
    this.filters.push((r, db) => {
      const v = resolveFilterValue(r, this.table, col, db)
      return v != null && String(v) < String(val)
    })
    return this
  }

  lte(col: string, val: any) {
    this.filters.push((r, db) => {
      const v = resolveFilterValue(r, this.table, col, db)
      return v != null && String(v) <= String(val)
    })
    return this
  }

  in(col: string, vals: unknown[]) {
    this.filters.push((r, db) => vals.includes(resolveFilterValue(r, this.table, col, db)))
    return this
  }

  is(col: string, val: unknown) {
    this.filters.push((r, db) => {
      const v = resolveFilterValue(r, this.table, col, db)
      return val === null ? v == null : v === val
    })
    return this
  }

  ilike(col: string, pattern: string) {
    const needle = pattern.replace(/%/g, '').toLowerCase()
    this.filters.push((r, db) => String(resolveFilterValue(r, this.table, col, db) ?? '').toLowerCase().includes(needle))
    return this
  }

  like(col: string, pattern: string) {
    const needle = pattern.replace(/%/g, '')
    this.filters.push((r, db) => String(resolveFilterValue(r, this.table, col, db) ?? '').includes(needle))
    return this
  }

  not(col: string, op: string, val: unknown) {
    if (op === 'is' && val === null) {
      this.filters.push((r, db) => resolveFilterValue(r, this.table, col, db) != null)
    } else if (op === 'in' && Array.isArray(val)) {
      this.filters.push((r, db) => !val.includes(resolveFilterValue(r, this.table, col, db)))
    } else if (op === 'eq') {
      this.filters.push((r, db) => resolveFilterValue(r, this.table, col, db) !== val)
    }
    return this
  }

  or() {
    return this
  }

  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, ascending: opts.ascending !== false })
    return this
  }

  limit(n: number) {
    this.limitVal = n
    return this
  }

  single() {
    this.mode = 'single'
    return this
  }

  maybeSingle() {
    this.mode = 'maybeSingle'
    return this
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): { data: any; error: any; count?: number } {
    const db = loadDb()
    const rows = db[this.table] ?? []
    const session = readDemoSession()

    if (this.op === 'insert') {
      const tableDefaults = (p: Record<string, any>): Record<string, any> => {
        if (this.table === 'students') {
          return {
            status: p.status ?? 'active',
            student_code: p.student_code ?? `ST-2026-${String((rows?.length ?? 0) + 101).padStart(3, '0')}`,
          }
        }
        if (this.table === 'enquiries') return { status: p.status ?? 'new' }
        if (this.table === 'registrations') {
          return {
            status: p.status ?? 'pending',
            tracking_code: p.tracking_code ?? `TM${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          }
        }
        if (this.table === 'checklists') return { status: p.status ?? 'pending', done: p.status === 'completed' }
        if (this.table === 'assessments') return { is_active: p.is_active ?? true, skills: p.skills ?? ['grammar', 'vocabulary', 'reading'] }
        if (this.table === 'announcements') return { published_at: p.published_at ?? null, active: p.active ?? true }
        return {}
      }
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => ({
        id: p.id ?? makeUuid(this.table),
        created_at: p.created_at ?? new Date().toISOString(),
        updated_at: p.updated_at ?? new Date().toISOString(),
        ...tableDefaults(p),
        ...p,
      }))
      db[this.table] = [...items, ...rows]
      items.forEach((r) => appendDemoAudit(db, this.table, 'insert', null, r))
      saveDb(db)
      const projected = items.map((r) => projectRow(r, this.table, this.selectCols, db))
      return { data: this.mode === 'single' ? projected[0] : projected, error: null }
    }

    if (this.op === 'update') {
      const updated: any[] = []
      db[this.table] = rows.map((r) => {
        if (this.filters.every((f) => f(r, db))) {
          const next = { ...r, ...this.payload, updated_at: new Date().toISOString() }
          updated.push(next)
          appendDemoAudit(db, this.table, 'update', r, next)
          return next
        }
        return r
      })
      if (this.table === 'profiles' && session) {
        const mine = updated.find((u) => u.id === session.profile.id)
        if (mine) {
          writeDemoSession({
            ...session,
            profile: { ...session.profile, full_name: mine.full_name ?? session.profile.full_name, phone: mine.phone ?? session.profile.phone },
          })
        }
      }
      saveDb(db)
      const projected = updated.map((r) => projectRow(r, this.table, this.selectCols, db))
      return { data: this.mode === 'single' ? projected[0] ?? null : projected, error: null }
    }

    if (this.op === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload]
      const out: any[] = []
      const nextRows = [...rows]
      for (const p of items) {
        const idx = nextRows.findIndex(
          (x) =>
            (p.id && x.id === p.id) ||
            (p.key && x.key === p.key) ||
            (this.table === 'teacher_booking_settings' && p.teacher_id && x.teacher_id === p.teacher_id) ||
            (this.table === 'teacher_profiles' && p.profile_id && x.profile_id === p.profile_id),
        )
        if (idx >= 0) {
          const previous = { ...nextRows[idx] }
          nextRows[idx] = { ...nextRows[idx], ...p }
          appendDemoAudit(db, this.table, 'update', previous, nextRows[idx])
          out.push(nextRows[idx])
        } else {
          const fresh = { id: p.id ?? makeUuid(this.table), ...p }
          nextRows.unshift(fresh)
          appendDemoAudit(db, this.table, 'insert', null, fresh)
          out.push(fresh)
        }
      }
      db[this.table] = nextRows
      saveDb(db)
      return { data: this.mode === 'single' ? out[0] : out, error: null }
    }

    if (this.op === 'delete') {
      const removed = rows.filter((r) => this.filters.every((f) => f(r, db)))
      db[this.table] = rows.filter((r) => !this.filters.every((f) => f(r, db)))
      removed.forEach((r) => appendDemoAudit(db, this.table, 'delete', r, null))
      saveDb(db)
      return { data: [], error: null }
    }

    // Select — apply polite demo role scoping where pages expect "my" records
    let result = [...rows]
    if (session?.role === 'student') {
      if (this.table === 'invoice_overview' || this.table === 'payments' || this.table === 'students') {
        result = result.filter((r) => (r.student_id ? r.student_id === 'stu-aisha' : r.id === 'stu-aisha'))
      }
      if (this.table === 'attendance') {
        result = result.filter((r) => r.student_id === 'stu-aisha')
      }
    } else if (session?.role === 'teacher') {
      if (this.table === 'classes') {
        result = result.filter((r) => r.teacher_id === session.profile.id)
      }
    }

    for (const f of this.filters) {
      result = result.filter((r) => f(r, db))
    }

    const totalCount = result.length
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const { col, ascending } = this.orders[i]
      result.sort((a, b) => {
        const av = String(getPath(a, col) ?? '')
        const bv = String(getPath(b, col) ?? '')
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }

    if (this.limitVal != null) result = result.slice(0, this.limitVal)
    if (this.selectOpts.head) {
      return { data: null, error: null, count: totalCount }
    }

    const projected = result.map((r) => projectRow(r, this.table, this.selectCols, db))
    if (this.mode === 'single') {
      return projected[0]
        ? { data: projected[0], error: null }
        : { data: null, error: { message: 'Record not found' } }
    }
    if (this.mode === 'maybeSingle') {
      return { data: projected[0] ?? null, error: null }
    }
    return { data: projected, error: null, count: totalCount }
  }
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

// ---------------------------------------------------------------------------
// Shared Teacher Compensation Helper (Regular + Workshop Payouts)
// ---------------------------------------------------------------------------
function computeTeacherPayData(db: Record<string, any[]>, teacherId: string, rawMonth?: string) {
  const ym = String(rawMonth ?? dayIso(0)).slice(0, 7)
  const monthStart = `${ym}-01`
  const monthEnd = `${ym}-31`
  const rates = (db.teacher_rates ?? []).filter(
    (r) =>
      r.teacher_id === teacherId &&
      (!r.effective_from || r.effective_from <= monthEnd) &&
      (!r.effective_to || r.effective_to >= monthStart),
  )
  const workshops = (db.teacher_workshops ?? [])
    .filter((w) => w.teacher_id === teacherId && (w.period === monthStart || String(w.date ?? '').startsWith(ym)))
    .map((w) => ({
      id: w.id,
      title: w.title,
      date: w.date,
      duration_minutes: Number(w.duration_minutes ?? 90),
      attendees: Number(w.attendees ?? 0),
      amount: Number(w.amount ?? 0),
      notes: w.notes ?? null,
    }))

  const completed = (db.sessions ?? []).filter((x) => x.teacher_id === teacherId && x.status === 'completed' && String(x.session_date ?? '').startsWith(ym))
  const hoursFor = (sessions: any[]) => sessions.reduce((sum: number, x: any) => {
    const [sh, sm] = String(x.start_time ?? '00:00').split(':').map(Number)
    const [eh, em] = String(x.end_time ?? '00:00').split(':').map(Number)
    return sum + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
  }, 0)
  const countStudents = (sessions: any[]) => new Set(sessions.flatMap((x: any) =>
    (db.enrolments ?? []).filter((e) => e.class_id === x.class_id && e.status === 'active').map((e) => e.student_id),
  )).size
  const qtyFor = (r: any) => {
    const relevant = completed.filter((x: any) => r.applies_to !== 'one_to_one' || !!x.booking_id)
      .filter((x: any) => r.applies_to !== 'group' || !x.booking_id)
    switch (r.basis) {
      case 'per_lesson': return relevant.length
      case 'hourly': return hoursFor(relevant)
      case 'per_student': return countStudents(relevant)
      case 'monthly': return 1
      case 'per_workshop': return workshops.length
      default: return 0
    }
  }

  const lines: any[] = []
  let regularAmount = 0
  let workshopAmount = workshops.reduce((sum, w) => sum + Number(w.amount ?? 0), 0)
  let sawWorkshopRate = false

  for (const r of rates) {
    const rate = Number(r.rate ?? 0)
    if (r.basis === 'per_workshop') {
      sawWorkshopRate = true
      const qty = workshops.length
      const amount = workshops.length ? workshopAmount : 0
      lines.push({
        rate_id: r.id,
        basis: 'per_workshop',
        applies_to: r.applies_to ?? 'all',
        rate,
        quantity: qty,
        amount,
      })
      continue
    }
    const quantity = qtyFor(r)
    const amount = Math.round(rate * quantity * 100) / 100
    regularAmount += amount
    lines.push({
      rate_id: r.id,
      basis: r.basis,
      applies_to: r.applies_to ?? 'all',
      rate,
      quantity,
      amount,
    })
  }

  if (!sawWorkshopRate && workshops.length > 0) {
    lines.push({
      rate_id: 'tr-workshop-adhoc',
      basis: 'per_workshop',
      applies_to: 'all',
      rate: Math.round((workshopAmount / workshops.length) * 100) / 100,
      quantity: workshops.length,
      amount: workshopAmount,
    })
  }

  return {
    teacher_id: teacherId,
    month: monthStart,
    lessons: completed.length,
    hours: hoursFor(completed),
    students: countStudents(completed),
    regular_amount: regularAmount,
    workshop_amount: workshopAmount,
    base_amount: regularAmount + workshopAmount,
    lines,
    workshops,
    missing_attendance: 0,
  }
}

function formatClassSchedule(db: Record<string, any[]>, classId: string): string {
  const scheds = (db.class_schedules ?? []).filter((s) => s.class_id === classId)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return scheds.map((s) => `${days[s.weekday] ?? 'Day'} ${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`).join(', ') || 'Flexible schedule'
}

function buildClassRecommendations(db: Record<string, any[]>, courseId?: string | null, levelId?: string | null, limit = 6) {
  const matching = (db.classes ?? [])
    .filter((c) => c.status === 'active' && (!courseId || c.course_id === courseId))
    .sort((a, b) => (levelId && b.level_id === levelId ? 1 : 0) - (levelId && a.level_id === levelId ? 1 : 0))
  const pool = matching.length ? matching : (db.classes ?? []).filter((c) => c.status === 'active')
  return pool.slice(0, limit).map((c) => {
    const enrolled = (db.enrolments ?? []).filter((e) => e.class_id === c.id && e.status === 'active').length
    const lv = (db.levels ?? []).find((x) => x.id === c.level_id)
    return {
      class_id: c.id,
      class_name: c.name,
      level_name: lv?.name ?? null,
      mode: c.mode,
      schedule: formatClassSchedule(db, c.id),
      fee: Number(c.fee ?? 150),
      billing_frequency: c.billing_frequency ?? 'monthly',
      spaces_left: Math.max(0, Number(c.capacity ?? 12) - enrolled),
    }
  })
}

function buildAssessmentResult(db: Record<string, any[]>, attempt: any) {
  const ass = (db.assessments ?? []).find((a) => a.id === attempt.assessment_id)
  const lv = attempt.level_id ? (db.levels ?? []).find((l) => l.id === attempt.level_id) : null
  const cls = attempt.recommended_class_id ? (db.classes ?? []).find((c) => c.id === attempt.recommended_class_id) : null
  const skills: string[] = ass?.skills ?? ['grammar', 'vocabulary']
  return {
    status: attempt.status,
    percent: attempt.percent ?? null,
    auto_points: attempt.auto_points ?? 0,
    auto_max: attempt.auto_max ?? 0,
    writing_pending: Number(attempt.manual_max ?? 0) > 0 && attempt.manual_points == null,
    level: lv ? { id: lv.id, name: lv.name } : null,
    recommended_class: cls ? { id: cls.id, name: cls.name, schedule: formatClassSchedule(db, cls.id) } : null,
    skills,
    note: `This result covers the ${skills.join(', ')} questions you answered.${!skills.includes('speaking') ? ' Speaking is not assessed by this quiz; your teacher will confirm your level in your first lesson.' : ''} The academy will review your placement before confirming your class.`,
  }
}

// ---------------------------------------------------------------------------
// Mock RPC Implementations
// ---------------------------------------------------------------------------
export function executeMockRpc(fn: string, args: Record<string, any> = {}): { data: any; error: { message: string } | null } {
  const db = loadDb()

  switch (fn) {
    case 'public_settings': {
      const obj: Record<string, unknown> = {}
      for (const s of db.app_settings ?? []) obj[s.key] = s.value
      return { data: obj, error: null }
    }

    case 'public_catalog': {
      const langs = (db.languages ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        description: l.description,
        is_active: l.is_active,
        programmes: (db.courses ?? [])
          .filter((c) => c.language_id === l.id && c.active !== false)
          .map((c) => {
            const cLevels = (db.levels ?? []).filter((lv) => lv.course_id === c.id)
            const cClasses = (db.classes ?? [])
              .filter((cl) => cl.course_id === c.id && cl.status === 'active')
              .map((cl) => {
                const scheds = (db.class_schedules ?? []).filter((s) => s.class_id === cl.id)
                const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                const schedText =
                  scheds.map((s) => `${DAYS[s.weekday] ?? 'Day'} ${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`).join(', ') ||
                  'Flexible schedule'
                const enrolled = (db.enrolments ?? []).filter((e) => e.class_id === cl.id && e.status === 'active').length
                const t = (db.profiles ?? []).find((p) => p.id === cl.teacher_id)
                const lv = (db.levels ?? []).find((x) => x.id === cl.level_id)
                return {
                  id: cl.id,
                  name: cl.name,
                  type: cl.kind,
                  mode: cl.mode,
                  level: lv?.name ?? null,
                  schedule: schedText,
                  start_date: cl.start_date,
                  fee: Number(cl.fee ?? 150),
                  billing_frequency: cl.billing_frequency ?? 'monthly',
                  timezone: 'Asia/Kuala_Lumpur',
                  spaces_left: Math.max(0, Number(cl.capacity ?? 12) - enrolled),
                  teacher: t?.full_name ?? null,
                }
              })
            return {
              id: c.id,
              name: c.name,
              slug: c.slug,
              summary: c.summary,
              description: c.description,
              audience: c.audience ?? 'adults',
              formats: ['group', 'one_to_one'],
              levels: cLevels.map((lv) => ({
                id: lv.id,
                name: lv.name,
                monthly_fee: Number(lv.monthly_fee ?? 150),
                description: lv.description ?? null,
              })),
              classes: cClasses,
              has_assessment: l.slug === 'english',
            }
          }),
      }))
      return { data: { languages: langs, one_to_one: true }, error: null }
    }

    case 'track_registration': {
      const code = String(args.code ?? '').trim().toUpperCase()
      const found = (db.registrations ?? []).find((r) => String(r.tracking_code ?? '').toUpperCase() === code)
      if (found) {
        const course = (db.courses ?? []).find((c) => c.id === found.course_id)
        const openAttempt = (db.assessment_attempts ?? []).find(
          (a) => (a.id === found.assessment_attempt_id || a.registration_id === found.id) && ['not_started', 'in_progress'].includes(a.status),
        )
        return {
          data: [
            {
              student_name: found.student_name,
              status: found.status,
              programme: course?.name ?? (found.source === 'free_class' ? 'Free Trial Workshop' : 'English Beginners Foundation'),
              submitted_on: String(found.created_at ?? dayIso(0)).slice(0, 10),
              next_step:
                found.status === 'approved' || found.status === 'converted'
                  ? 'Approved. Your seat is confirmed and we will share class joining instructions shortly.'
                  : found.status === 'rejected'
                  ? `Not accepted${found.decision_reason ? `: ${found.decision_reason}` : '.'}`
                  : 'We are reviewing your registration and will contact you soon.',
              assessment_token: openAttempt?.token ?? null,
            },
          ],
          error: null,
        }
      }
      if (code.length >= 6) {
        return {
          data: [
            {
              student_name: 'Aisha Binti Rahman',
              status: 'approved',
              programme: 'English Beginners Foundation',
              submitted_on: dayIso(-2),
              next_step: 'Approved. We will confirm your class placement shortly.',
              assessment_token: null,
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    }

    case 'reserve_free_class': {
      const name = String(args.p_name ?? '').trim()
      const email = String(args.p_email ?? '').trim().toLowerCase()
      if (name.length < 2) return { data: null, error: { message: 'Please enter your full name' } }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { data: null, error: { message: 'Please enter a valid email address' } }
      const fc = (db.free_classes ?? []).find((x) => x.id === args.p_free_class)
      const code = `FREE-${Math.random().toString(16).slice(2, 8).toUpperCase()}`
      const row = {
        id: makeUuid('reg'),
        tracking_code: code,
        student_name: name,
        guardian_name: null,
        email,
        phone: args.p_phone || null,
        preferred_contact: args.p_phone ? 'whatsapp' : 'email',
        language_id: 'lang-en',
        course_id: null,
        format: 'group',
        mode: 'either',
        additional_info: `Free class reservation: ${fc?.title ?? 'Free Workshop'}`,
        status: 'approved',
        source: 'free_class',
        created_at: new Date().toISOString(),
      }
      db.registrations = [row, ...(db.registrations ?? [])]
      saveDb(db)
      return { data: { status: 'approved', tracking_code: code }, error: null }
    }

    case 'submit_registration': {
      const p = args.p ?? {}
      const code = `TM${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      const regId = makeUuid('reg')
      const courseId = p.course_id || null
      const languageId = p.language_id || (courseId ? (db.courses ?? []).find((c) => c.id === courseId)?.language_id : null) || 'lang-en-beg'
      const matchedAssessment = (db.assessments ?? []).find(
        (a) =>
          a.is_active &&
          (db.assessment_questions ?? []).some((q) => q.assessment_id === a.id) &&
          ((courseId && a.course_id === courseId) || (!a.course_id && a.language_id === languageId)),
      )
      let attemptId: string | null = null
      let assessmentInfo: { title: string; token: string; time_limit_minutes: number | null } | null = null
      if (matchedAssessment) {
        const token = `ass_${Math.random().toString(36).slice(2, 12)}`
        attemptId = makeUuid('attm')
        db.assessment_attempts = [
          {
            id: attemptId,
            assessment_id: matchedAssessment.id,
            registration_id: regId,
            student_id: null,
            token,
            status: 'not_started',
            auto_points: 0,
            auto_max: 0,
            manual_max: null,
            manual_points: null,
            percent: null,
            level_id: null,
            recommended_class_id: null,
            started_at: null,
            submitted_at: null,
            expires_at: dayIso(14) + 'T23:59:59Z',
            created_at: new Date().toISOString(),
          },
          ...(db.assessment_attempts ?? []),
        ]
        assessmentInfo = {
          title: matchedAssessment.title,
          token,
          time_limit_minutes: matchedAssessment.time_limit_minutes ?? 20,
        }
      }
      const recs = buildClassRecommendations(db, courseId, null, 3)
      const regRow = {
        id: regId,
        tracking_code: code,
        student_name: p.student_name ?? 'New Applicant',
        guardian_name: p.guardian_name ?? null,
        email: p.email ?? 'applicant@example.my',
        phone: p.phone ?? null,
        preferred_contact: p.preferred_contact ?? 'email',
        date_of_birth: p.date_of_birth ?? null,
        language_id: languageId,
        course_id: courseId,
        class_id: p.class_id || null,
        recommended_class_id: recs[0]?.class_id ?? null,
        assessment_attempt_id: attemptId,
        level_self: p.level_self ?? null,
        objectives: p.objectives ?? null,
        preferred_days: p.preferred_days ?? null,
        preferred_times: p.preferred_times ?? null,
        timezone: p.timezone ?? 'Asia/Kuala_Lumpur',
        additional_info: p.additional_info ?? null,
        consent_privacy: p.consent_privacy ?? true,
        consent_whatsapp: p.consent_whatsapp ?? false,
        consent_marketing: p.consent_marketing ?? false,
        format: p.format ?? 'group',
        mode: p.mode ?? 'online',
        status: 'pending',
        source: p.source ?? 'website',
        created_at: new Date().toISOString(),
      }
      db.registrations = [regRow, ...(db.registrations ?? [])]
      saveDb(db)
      return { data: { status: 'pending', tracking_code: code, recommendations: recs, assessment: assessmentInfo }, error: null }
    }

    case 'submit_enquiry': {
      const p = args.p ?? args
      db.enquiries = [
        {
          id: makeUuid('enq'),
          name: p.name ?? 'Website Visitor',
          email: p.email ?? null,
          phone: p.phone ?? null,
          message: p.message ?? '',
          source: p.source ?? 'website',
          status: 'new',
          created_at: new Date().toISOString(),
        },
        ...(db.enquiries ?? []),
      ]
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'admin_dashboard': {
      const months = [-5, -4, -3, -2, -1, 0].map((m, idx) => ({
        month: monthStr(m),
        invoiced: 6200 + idx * 650,
        collected: 5800 + idx * 530,
      }))
      const classPerf = (db.classes ?? [])
        .filter((c) => ['active', 'draft'].includes(c.status))
        .map((c, idx) => {
          const t = (db.profiles ?? []).find((p) => p.id === c.teacher_id)
          const enrolled = (db.enrolments ?? []).filter((e) => e.class_id === c.id && e.status === 'active').length
          const cap = Number(c.capacity ?? 12)
          return {
            id: c.id,
            name: c.name,
            teacher: t?.full_name ?? null,
            status: c.status,
            capacity: cap,
            enrolled,
            spaces: Math.max(cap - enrolled, 0),
            attendance_percent: [96, 94, 91][idx % 3],
            collected_month: [3450, 1500, 1100][idx % 3],
          }
        })
      return {
        data: {
          students_active: 38,
          students_total: 44,
          teachers_active: 5,
          teachers_total: 5,
          classes_active: 12,
          classes_total: 14,
          registrations_new: 7,
          registrations_pending: (db.registrations ?? []).filter((r) => ['pending', 'info_requested'].includes(r.status)).length || 3,
          collected_month: 8450,
          invoiced_month: 9650,
          outstanding_total: 1200,
          overdue_total: 450,
          overdue_count: 3,
          partial_count: 2,
          payments_pending: (db.payments ?? []).filter((p) => p.status === 'pending').length,
          salaries_month: 3200,
          salaries_paid_month: 2600,
          salaries_outstanding: 600,
          expenses_month: 1450,
          attendance_percent: 94,
          missing_attendance: 0,
          bookings_requested: (db.bookings ?? []).filter((b) => b.status === 'requested').length,
          enquiries_open: (db.enquiries ?? []).filter((e) => ['new', 'in_progress', 'follow_up'].includes(e.status)).length,
          checklist_overdue: 0,
          checklist_pending: (db.checklists ?? []).filter((c) => ['pending', 'in_progress'].includes(c.status)).length,
          messages_failed: 0,
          trend: months,
          income_by_class: [
            { label: 'English Beginners Daily', amount: 3450 },
            { label: 'Workplace English Fluency', amount: 2400 },
            { label: 'Conversational Tamil', amount: 1500 },
            { label: 'Practical Bahasa Melayu', amount: 1100 },
          ],
          income_by_language: [
            { label: 'English for Beginners', amount: 3450 },
            { label: 'English', amount: 2400 },
            { label: 'Tamil', amount: 1500 },
            { label: 'Bahasa Melayu', amount: 1100 },
          ],
          upcoming_lessons: [
            { id: 'ses-today-1', class: 'English Beginners Daily', teacher: 'Ms. Priya Shanmugam', starts_at: atOffset(0, 19, 30), status: 'scheduled' },
            { id: 'ses-today-2', class: 'Conversational Tamil', teacher: 'Ms. Priya Shanmugam', starts_at: atOffset(0, 20, 0), status: 'scheduled' },
            { id: 'ses-next-1', class: 'Practical Bahasa Melayu Evening', teacher: 'Mr. Hafizuddin Ismail', starts_at: atOffset(1, 20, 0), status: 'scheduled' },
          ],
          upcoming_bookings: (db.bookings ?? [])
            .filter((b) => ['requested', 'approved'].includes(b.status))
            .map((b) => {
              const st = (db.students ?? []).find((s) => s.id === b.student_id)
              const t = (db.profiles ?? []).find((p) => p.id === b.teacher_id)
              return { id: b.id, student: st?.full_name ?? 'Student', teacher: t?.full_name ?? 'Ms. Priya Shanmugam', starts_at: b.starts_at, status: b.status }
            }),
          class_performance: classPerf,
        },
        error: null,
      }
    }

    case 'teacher_dashboard': {
      const session = readDemoSession()
      const teacherId = session?.role === 'teacher' ? session.profile.id : 'demo-teacher-id'
      const earnings = computeTeacherPayData(db, teacherId, dayIso(0))
      const teacherClasses = (db.classes ?? []).filter((c) => c.teacher_id === teacherId && c.status === 'active')
      const teacherClassIds = new Set(teacherClasses.map((c) => c.id))
      const enrolledStudents = new Set(
        (db.enrolments ?? []).filter((e) => e.status === 'active' && teacherClassIds.has(e.class_id)).map((e) => e.student_id),
      )
      const todayStr = dayIso(0)
      const todaySessions = (db.sessions ?? [])
        .filter((s) => s.teacher_id === teacherId && s.session_date === todayStr)
        .map((s) => {
          const cls = (db.classes ?? []).find((c) => c.id === s.class_id)
          return {
            id: s.id,
            class: cls?.name ?? 'Class lesson',
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            status: s.status,
            meeting_link: cls?.meeting_link ?? null,
            attendance_taken: (db.attendance ?? []).some((a) => a.session_id === s.id),
          }
        })
      return {
        data: {
          classes: teacherClasses.length,
          students: enrolledStudents.size,
          week: (db.sessions ?? []).filter((s) => s.teacher_id === teacherId && s.session_date >= todayStr && s.session_date <= dayIso(7) && s.status !== 'cancelled').length,
          missing_attendance: (db.sessions ?? []).filter((s) => s.teacher_id === teacherId && s.status === 'scheduled' && String(s.ends_at ?? s.session_date) < new Date().toISOString()).length,
          earnings,
          salary_outstanding: (db.teacher_payouts ?? [])
            .filter((p) => p.teacher_id === teacherId && ['approved', 'partially_paid'].includes(p.status))
            .reduce((sum, p) => sum + Math.max(0, Number(p.amount) - Number(p.amount_paid)), 0),
          today: todaySessions,
          bookings: (db.bookings ?? [])
            .filter((b) => b.teacher_id === teacherId && ['requested', 'approved'].includes(b.status))
            .map((b) => {
              const st = (db.students ?? []).find((s) => s.id === b.student_id)
              return { id: b.id, student: st?.full_name ?? 'Student', starts_at: b.starts_at, status: b.status }
            }),
          announcements: (db.announcements ?? [])
            .filter((a) => a.published_at && ['all', 'everyone', 'teachers'].includes(a.audience))
            .map((a) => ({ title: a.title, body: a.body, published_at: a.published_at ?? a.created_at })),
          unread: (db.notifications ?? []).filter((n) => n.user_id === teacherId && !n.read).length,
        },
        error: null,
      }
    }

    case 'calculate_teacher_pay': {
      const teacherId = String(args.p_teacher ?? 'demo-teacher-id')
      return {
        data: computeTeacherPayData(db, teacherId, args.p_month),
        error: null,
      }
    }

    case 'student_dashboard': {
      const stu = (db.students ?? []).find((s) => s.id === 'stu-aisha')
      const openInvoices = (db.invoice_overview ?? []).filter((i) => i.student_id === 'stu-aisha' && ['unpaid', 'partial'].includes(i.status))
      const balance = openInvoices.reduce((n, i) => n + Number(i.balance ?? 0), 0)
      return {
        data: {
          linked: true,
          student: { id: 'stu-aisha', code: stu?.student_code ?? 'ST-2026-001', name: stu?.full_name ?? 'Aisha Binti Rahman', status: stu?.status ?? 'active' },
          overdue: 0,
          pending_payments: (db.payments ?? []).filter((p) => p.student_id === 'stu-aisha' && p.status === 'pending').length,
          balance,
          level: { level: 'Beginner (A1)', programme: 'English Beginners Foundation', date: dayIso(-45) },
          attendance: { percent: 96, present: 23, late: 1, absent: 1, excused: 0 },
          next_lessons: [
            { class: 'English Beginners Daily', starts_at: atOffset(0, 19, 30), status: 'scheduled', mode: 'hybrid', meeting_link: 'https://meet.topmind.my/eng-beg-daily' },
            { class: 'Conversational Tamil', starts_at: atOffset(2, 20, 0), status: 'scheduled', mode: 'online', meeting_link: 'https://meet.topmind.my/tamil-conv' },
          ],
          classes: [
            {
              enrolment_id: 'enr-1',
              status: 'active',
              class: { name: 'English Beginners Daily', schedule: 'Mon, Wed 7:30 PM – 9:00 PM' },
              teacher: { name: 'Ms. Priya Shanmugam' },
            },
            {
              enrolment_id: 'enr-2',
              status: 'active',
              class: { name: 'Conversational Tamil', schedule: 'Tue 8:00 PM – 9:30 PM' },
              teacher: { name: 'Ms. Priya Shanmugam' },
            },
          ],
          bookings: (db.bookings ?? [])
            .filter((b) => b.student_id === 'stu-aisha' && ['requested', 'approved'].includes(b.status))
            .map((b) => {
              const t = (db.profiles ?? []).find((p) => p.id === b.teacher_id)
              return { id: b.id, teacher: t?.full_name ?? 'Ms. Priya Shanmugam', starts_at: b.starts_at, status: b.status }
            }),
          unread: (db.notifications ?? []).filter((n) => n.user_id === 'demo-student-id' && !n.read).length,
        },
        error: null,
      }
    }

    case 'my_classes': {
      return {
        data: [
          {
            enrolment_id: 'enr-1',
            status: 'active',
            start_date: dayIso(-45),
            end_date: null,
            class: {
              id: 'cls-en-beg-daily',
              name: 'English Beginners Daily',
              language: 'English for Beginners',
              programme: 'English Beginners Foundation',
              level: 'Beginner (A1)',
              schedule: 'Mon & Wed · 7:30 PM – 9:00 PM',
              timezone: 'Asia/Kuala_Lumpur',
              type: 'group',
              mode: 'hybrid',
              location: 'Mont Kiara Centre · Studio A',
              meeting_link: 'https://meet.topmind.my/eng-beg-daily',
            },
            teacher: {
              name: 'Ms. Priya Shanmugam',
              bio: 'Friendly, encouraging mentor helping adult learners gain confidence.',
            },
          },
          {
            enrolment_id: 'enr-2',
            status: 'active',
            start_date: dayIso(-30),
            end_date: null,
            class: {
              id: 'cls-ta-conv',
              name: 'Conversational Tamil',
              language: 'Tamil',
              programme: 'Conversational Tamil',
              level: 'Conversational Level 1',
              schedule: 'Tue · 8:00 PM – 9:30 PM',
              timezone: 'Asia/Kuala_Lumpur',
              type: 'group',
              mode: 'online',
              location: 'Online Zoom',
              meeting_link: 'https://meet.topmind.my/tamil-conv',
            },
            teacher: {
              name: 'Ms. Priya Shanmugam',
              bio: 'Interactive dialogues focused on real-world Tamil conversation.',
            },
          },
        ],
        error: null,
      }
    }

    case 'my_students': {
      const session = readDemoSession()
      const teacherId = session?.role === 'teacher' ? session.profile.id : 'demo-teacher-id'
      const myClassIds = new Set((db.classes ?? []).filter((c) => c.teacher_id === teacherId).map((c) => c.id))
      const rows = (db.enrolments ?? [])
        .filter((e) => myClassIds.has(e.class_id) && ['active', 'suspended', 'waitlisted'].includes(e.status))
        .map((e) => {
          const st = (db.students ?? []).find((s) => s.id === e.student_id)
          const cls = (db.classes ?? []).find((c) => c.id === e.class_id)
          const lv = cls?.level_id ? (db.levels ?? []).find((l) => l.id === cls.level_id) : null
          if (!st || st.status === 'archived') return null
          const stuAtt = (db.attendance ?? []).filter((a) => a.student_id === st.id)
          const pct = stuAtt.length
            ? Math.round((stuAtt.filter((a) => ['present', 'late'].includes(a.status)).length / stuAtt.length) * 100)
            : 95
          return {
            student_id: st.id,
            class_id: e.class_id,
            class: cls?.name ?? 'Class',
            name: st.full_name,
            code: st.student_code,
            email: st.email,
            phone: st.phone,
            preferred_contact: st.preferred_contact ?? 'email',
            enrolment_status: e.status,
            attendance_percent: pct,
            level: lv?.name ?? null,
            objectives: st.learning_objectives ?? null,
            emergency_name: st.guardian_name ?? null,
            emergency_phone: st.guardian_phone ?? null,
          }
        })
        .filter(Boolean)
      return { data: rows, error: null }
    }

    case 'lesson_roster': {
      const ses = (db.sessions ?? []).find((s) => s.id === args.p_session)
      const clsId = ses?.class_id ?? 'cls-en-beg-daily'
      const enrolled = (db.enrolments ?? []).filter((e) => e.class_id === clsId && e.status === 'active')
      const students = enrolled.map((e) => (db.students ?? []).find((st) => st.id === e.student_id)).filter(Boolean)
      return {
        data: students.map((st) => ({
          student_id: st.id,
          full_name: st.full_name,
          student_code: st.student_code,
          enrolment_status: 'active',
        })),
        error: null,
      }
    }

    case 'save_attendance': {
      const sesId = args.p_session
      const records: any[] = Array.isArray(args.p_records) ? args.p_records : []
      db.attendance = [
        ...(db.attendance ?? []).filter((a) => a.session_id !== sesId),
        ...records.map((r) => ({
          id: makeUuid('att'),
          session_id: sesId,
          student_id: r.student_id,
          status: r.status,
          remarks: r.remarks ?? null,
          recorded_at: new Date().toISOString(),
        })),
      ]
      db.sessions = (db.sessions ?? []).map((s) =>
        s.id === sesId
          ? {
              ...s,
              status: args.p_complete ? 'completed' : s.status,
              topic: args.p_topic ?? s.topic,
              notes: args.p_notes ?? s.notes,
            }
          : s,
      )
      saveDb(db)
      return { data: { saved: records.length, completed: !!args.p_complete }, error: null }
    }

    case 'attendance_summary': {
      const session = readDemoSession()
      const baseRows = [
        {
          student_id: 'stu-aisha',
          student_name: 'Aisha Binti Rahman',
          student_code: 'ST-2026-001',
          class_id: 'cls-en-beg-daily',
          class_name: 'English Beginners Daily',
          scheduled: 12,
          present: 11,
          late: 1,
          absent: 0,
          excused: 0,
          unmarked: 0,
          attendance_percent: 100,
        },
        {
          student_id: 'stu-aisha',
          student_name: 'Aisha Binti Rahman',
          student_code: 'ST-2026-001',
          class_id: 'cls-ta-conv',
          class_name: 'Conversational Tamil',
          scheduled: 8,
          present: 7,
          late: 0,
          absent: 1,
          excused: 0,
          unmarked: 0,
          attendance_percent: 87.5,
        },
        {
          student_id: 'stu-daniel',
          student_name: 'Daniel Tan Wei Ming',
          student_code: 'ST-2026-002',
          class_id: 'cls-en-beg-daily',
          class_name: 'English Beginners Daily',
          scheduled: 12,
          present: 11,
          late: 0,
          absent: 1,
          excused: 0,
          unmarked: 0,
          attendance_percent: 91.7,
        },
        {
          student_id: 'stu-kavitha',
          student_name: 'Kavitha A/P Subramaniam',
          student_code: 'ST-2026-003',
          class_id: 'cls-ta-conv',
          class_name: 'Conversational Tamil',
          scheduled: 8,
          present: 8,
          late: 0,
          absent: 0,
          excused: 0,
          unmarked: 0,
          attendance_percent: 100,
        },
      ]
      const targetStudent = args.p_student ?? (session?.role === 'student' ? 'stu-aisha' : null)
      const filtered = baseRows.filter(
        (r) => (!targetStudent || r.student_id === targetStudent) && (!args.p_class || r.class_id === args.p_class),
      )
      return { data: filtered, error: null }
    }

    case 'lessons_missing_attendance': {
      const nowIso = new Date().toISOString()
      const rows = (db.sessions ?? [])
        .filter((s) => s.status === 'scheduled' && String(s.ends_at ?? s.session_date) < nowIso && (!args.p_teacher || s.teacher_id === args.p_teacher))
        .map((s) => {
          const cls = (db.classes ?? []).find((c) => c.id === s.class_id)
          const t = (db.profiles ?? []).find((p) => p.id === s.teacher_id)
          return {
            session_id: s.id,
            class_id: s.class_id,
            class_name: cls?.name ?? 'One-to-one lesson',
            session_date: s.session_date,
            start_time: s.start_time,
            teacher_id: s.teacher_id,
            teacher_name: t?.full_name ?? null,
          }
        })
      return { data: rows, error: null }
    }

    case 'lesson_calendar': {
      const session = readDemoSession()
      const rows = (db.sessions ?? [])
        .filter((s) => {
          if (args.p_from && s.session_date < args.p_from) return false
          if (args.p_to && s.session_date > args.p_to) return false
          if (args.p_teacher && s.teacher_id !== args.p_teacher) return false
          if (args.p_class && s.class_id !== args.p_class) return false
          if (session?.role === 'teacher' && !args.p_teacher && s.teacher_id !== session.profile.id) return false
          if (session?.role === 'student') {
            const clsIds = (db.enrolments ?? []).filter((e) => e.student_id === 'stu-aisha' && e.status === 'active').map((e) => e.class_id)
            if (s.class_id && !clsIds.includes(s.class_id)) return false
          }
          return true
        })
        .map((s) => {
          const cls = (db.classes ?? []).find((c) => c.id === s.class_id)
          const t = (db.profiles ?? []).find((p) => p.id === s.teacher_id)
          const hasAtt = (db.attendance ?? []).some((a) => a.session_id === s.id)
          return {
            id: s.id,
            date: s.session_date,
            start_time: s.start_time,
            end_time: s.end_time,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            status: s.status,
            topic: s.topic ?? null,
            cancel_reason: s.cancel_reason ?? null,
            class_id: s.class_id ?? null,
            booking_id: s.booking_id ?? null,
            class: cls?.name ?? 'One-to-one lesson',
            mode: cls?.mode ?? 'online',
            teacher_id: s.teacher_id ?? null,
            teacher: t?.full_name ?? 'Ms. Priya Shanmugam',
            is_substitute: Boolean(cls?.teacher_id && s.teacher_id && cls.teacher_id !== s.teacher_id),
            meeting_link: cls?.meeting_link ?? null,
            attendance_taken: hasAtt,
          }
        })
      return { data: rows, error: null }
    }

    case 'cancel_lesson': {
      db.sessions = (db.sessions ?? []).map((s) =>
        s.id === args.p_session ? { ...s, status: 'cancelled', cancel_reason: args.p_reason ?? null } : s,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'reschedule_lesson': {
      const dateStr = args.p_date ?? dayIso(0)
      const st = String(args.p_start ?? '19:30').slice(0, 5)
      const en = String(args.p_end ?? '21:00').slice(0, 5)
      db.sessions = (db.sessions ?? []).map((s) =>
        s.id === args.p_session
          ? {
              ...s,
              session_date: dateStr,
              start_time: `${st}:00`,
              end_time: `${en}:00`,
              starts_at: `${dateStr}T${st}:00+08:00`,
              ends_at: `${dateStr}T${en}:00+08:00`,
              notes: args.p_reason ?? s.notes,
            }
          : s,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'assign_substitute': {
      db.sessions = (db.sessions ?? []).map((s) =>
        s.id === args.p_session ? { ...s, teacher_id: args.p_teacher, notes: args.p_reason ?? s.notes } : s,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'add_lesson': {
      const dateStr = args.p_date ?? dayIso(1)
      const st = String(args.p_start ?? '19:30').slice(0, 5)
      const en = String(args.p_end ?? '21:00').slice(0, 5)
      const cls = (db.classes ?? []).find((c) => c.id === args.p_class)
      const created = {
        id: makeUuid('ses'),
        class_id: args.p_class,
        teacher_id: args.p_teacher ?? cls?.teacher_id ?? 'demo-teacher-id',
        booking_id: null,
        session_date: dateStr,
        start_time: `${st}:00`,
        end_time: `${en}:00`,
        starts_at: `${dateStr}T${st}:00+08:00`,
        ends_at: `${dateStr}T${en}:00+08:00`,
        status: 'scheduled',
        topic: args.p_topic ?? '',
        notes: '',
        cancel_reason: null,
      }
      db.sessions = [...(db.sessions ?? []), created]
      saveDb(db)
      return { data: created.id, error: null }
    }

    case 'generate_lessons': {
      const fromStr = String(args.p_from ?? dayIso(0))
      const toStr = String(args.p_to ?? dayIso(56))
      const startD = new Date(`${fromStr}T00:00:00`)
      const endD = new Date(`${toStr}T00:00:00`)
      if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime()) || endD < startD) {
        return { data: null, error: { message: 'The end date is before the start date.' } }
      }
      if ((endD.getTime() - startD.getTime()) / 86400000 > 400) {
        return { data: null, error: { message: 'Generate at most about a year of lessons at a time.' } }
      }
      const targetClasses = (db.classes ?? []).filter((c) => c.status === 'active' && (!args.p_class || c.id === args.p_class))
      let created = 0
      const sessions = [...(db.sessions ?? [])]
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const dow = d.getDay()
        for (const cls of targetClasses) {
          if (cls.start_date && dStr < cls.start_date) continue
          if (cls.end_date && dStr > cls.end_date) continue
          const scheds = (db.class_schedules ?? []).filter((s) => s.class_id === cls.id && Number(s.weekday) === dow)
          for (const sched of scheds) {
            const st = String(sched.start_time).slice(0, 5)
            const en = String(sched.end_time).slice(0, 5)
            const exists = sessions.some((s) => s.class_id === cls.id && s.session_date === dStr && String(s.start_time).slice(0, 5) === st)
            if (exists) continue
            sessions.push({
              id: makeUuid('ses'),
              class_id: cls.id,
              teacher_id: cls.teacher_id ?? 'demo-teacher-id',
              booking_id: null,
              schedule_id: sched.id,
              session_date: dStr,
              start_time: `${st}:00`,
              end_time: `${en}:00`,
              starts_at: `${dStr}T${st}:00+08:00`,
              ends_at: `${dStr}T${en}:00+08:00`,
              status: 'scheduled',
              topic: '',
              notes: '',
              cancel_reason: null,
            })
            created++
          }
        }
      }
      if (created > 0) {
        db.sessions = sessions
        saveDb(db)
      }
      return { data: created, error: null }
    }

    case 'my_bookings': {
      return {
        data: (db.bookings ?? [])
          .filter((b) => b.student_id === 'stu-aisha')
          .map((b) => {
            const t = (db.profiles ?? []).find((p) => p.id === b.teacher_id)
            const l = (db.languages ?? []).find((x) => x.id === b.language_id)
            return {
              id: b.id,
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              duration_minutes: b.duration_minutes,
              mode: b.mode,
              teacher: t?.full_name ?? 'Ms. Priya Shanmugam',
              language: l?.name ?? 'English',
              objective: b.objective,
              price: b.price,
              status: b.status,
              reason: b.cancel_reason ?? b.decision_reason ?? b.reason,
              can_change: ['requested', 'approved'].includes(b.status),
            }
          }),
        error: null,
      }
    }

    case 'decide_booking': {
      db.bookings = (db.bookings ?? []).map((b) =>
        b.id === args.p_booking
          ? { ...b, status: args.p_approve ? 'approved' : 'rejected', decision_reason: args.p_approve ? null : (args.p_reason ?? null) }
          : b,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'cancel_booking': {
      db.bookings = (db.bookings ?? []).map((b) =>
        b.id === args.p_booking ? { ...b, status: 'cancelled', cancel_reason: args.p_reason ?? null } : b,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'reschedule_booking': {
      const startIso = args.p_starts_at ?? atOffset(2, 15, 0)
      const endMs = new Date(startIso).getTime() + 60 * 60 * 1000
      db.bookings = (db.bookings ?? []).map((b) =>
        b.id === args.p_booking
          ? {
              ...b,
              starts_at: startIso,
              ends_at: new Date(endMs).toISOString(),
              teacher_id: args.p_teacher || b.teacher_id,
            }
          : b,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'reassign_booking': {
      db.bookings = (db.bookings ?? []).map((b) =>
        b.id === args.p_booking ? { ...b, teacher_id: args.p_teacher, notes: args.p_reason ?? b.notes } : b,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'complete_booking': {
      db.bookings = (db.bookings ?? []).map((b) =>
        b.id === args.p_booking ? { ...b, status: args.p_attendance === 'absent' ? 'no_show' : 'completed', notes: args.p_notes ?? b.notes } : b,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'booking_teachers': {
      return {
        data: [
          {
            id: 'demo-teacher-id',
            name: 'Ms. Priya Shanmugam',
            bio: 'Friendly, encouraging coach for English confidence, job interviews, and spoken Tamil.',
            price_per_hour: 90,
            durations: [45, 60, 90],
            mode: 'either',
            requires_approval: true,
            languages: [
              { id: 'lang-en', name: 'English' },
              { id: 'lang-en-beg', name: 'English for Beginners' },
              { id: 'lang-ta', name: 'Tamil' },
            ],
          },
        ],
        error: null,
      }
    }

    case 'available_booking_slots': {
      const from = String(args.p_from ?? dayIso(0))
      const to = String(args.p_to ?? dayIso(7))
      const teacher = String(args.p_teacher ?? '')
      const duration = Math.max(30, Math.min(180, Number(args.p_duration ?? 60)))
      const result: { starts_at: string; ends_at: string }[] = []
      let cursor = new Date(`${from}T00:00:00+08:00`).getTime()
      const last = new Date(`${to}T23:59:59+08:00`).getTime()
      for (; cursor <= last && result.length < 120; cursor += 86400000) {
        for (const hour of [10, 14, 16, 19]) {
          const date = new Date(cursor + hour * 3600000)
          const start = date.toISOString()
          const end = new Date(date.getTime() + duration * 60000).toISOString()
          if (date.getTime() <= Date.now()) continue
          const conflict = (db.bookings ?? []).some((b) => b.teacher_id === teacher && b.id !== args.p_exclude_booking && !['cancelled', 'rejected'].includes(b.status) && new Date(b.starts_at).getTime() < new Date(end).getTime() && new Date(b.ends_at).getTime() > date.getTime())
          if (!conflict) result.push({ starts_at: start, ends_at: end })
        }
      }
      return { data: result, error: null }
    }

    case 'request_booking': {
      const startIso = args.p_starts_at ?? atOffset(2, 14, 0)
      const dur = Number(args.p_duration ?? 60)
      if (!args.p_teacher || !args.p_starts_at || !String(args.p_objective ?? '').trim()) return { data: null, error: { message: 'Please choose a teacher, available time and lesson objective.' } }
      const requestedEnd = new Date(new Date(startIso).getTime() + dur * 60000).toISOString()
      if ((db.bookings ?? []).some((b) => b.teacher_id === args.p_teacher && !['cancelled','rejected'].includes(b.status) && new Date(b.starts_at).getTime() < new Date(requestedEnd).getTime() && new Date(b.ends_at).getTime() > new Date(startIso).getTime())) return { data: null, error: { message: 'The selected time is no longer available. Choose another slot.' } }
      const b = {
        id: makeUuid('bk'),
        student_id: 'stu-aisha',
        teacher_id: args.p_teacher ?? 'demo-teacher-id',
        language_id: args.p_language ?? 'lang-en',
        starts_at: startIso,
        ends_at: new Date(new Date(startIso).getTime() + dur * 60 * 1000).toISOString(),
        duration_minutes: dur,
        mode: args.p_mode ?? 'online',
        objective: args.p_objective ?? 'Conversation practice',
        notes: args.p_notes ?? '',
        price: 90 * (dur / 60),
        status: 'requested',
        cancel_reason: null,
        decision_reason: null,
        reason: null,
        created_at: new Date().toISOString(),
      }
      db.bookings = [b, ...(db.bookings ?? [])]
      saveDb(db)
      return { data: b, error: null }
    }

    case 'create_invoice':
    case 'update_draft_invoice': {
      const editing = fn === 'update_draft_invoice'
      const existing = editing ? (db.invoices ?? []).find((i) => i.id === args.p_invoice) : null
      const studentId = existing?.student_id ?? args.p_student
      const student = (db.students ?? []).find((x) => x.id === studentId)
      const lines = (args.p_items ?? []) as any[]
      if (!student) return { data: null, error: { message: 'Please choose a student.' } }
      if (!lines.length || lines.some((l) => !l.description?.trim() || !(Number(l.quantity) > 0) || !(Number(l.unit_price) >= 0))) return { data: null, error: { message: 'Every invoice line needs a description, positive quantity and valid price.' } }
      if (!args.p_due_date) return { data: null, error: { message: 'Choose an invoice due date.' } }
      if (editing && existing?.status !== 'draft') return { data: null, error: { message: 'Only draft invoices can be edited.' } }
      const id = existing?.id ?? makeUuid('inv')
      const gross = lines.reduce((t, l) => t + (l.kind === 'discount' ? 0 : Number(l.quantity) * Number(l.unit_price)), 0)
      const discountTotal = lines.reduce((t, l) => t + (l.kind === 'discount' ? Number(l.quantity) * Number(l.unit_price) : 0), 0)
      const subtotal = gross - discountTotal
      if (!(subtotal >= 0)) return { data: null, error: { message: 'Invoice total cannot be negative.' } }
      const period = String(args.p_period ?? existing?.period ?? `${monthStr()}-01`)
      const status = existing?.status ?? (args.p_issue ? 'unpaid' : 'draft')
      const issuedAt = existing?.issued_at ?? (args.p_issue ? new Date().toISOString() : null)
      const inv = { ...(existing ?? {}), id, student_id: studentId, invoice_no: existing?.invoice_no ?? `DEMO-${new Date().getFullYear()}-${String((db.invoices ?? []).length + 101).padStart(5, '0')}`, status, description: args.p_description ?? existing?.description ?? 'Class fees', notes: args.p_notes ?? '', amount: subtotal, subtotal: gross, discount_total: discountTotal, total: subtotal, due_date: args.p_due_date, period, period_start: period, period_end: period.slice(0, 7) + '-28', issued_at: issuedAt, created_at: existing?.created_at ?? new Date().toISOString() }
      db.invoices = [inv, ...(db.invoices ?? []).filter((i) => i.id !== id)]
      db.invoice_items = [...lines.map((l, i) => ({ id: makeUuid('ii'), invoice_id: id, kind: l.kind, description: String(l.description).trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price), amount: Number(l.quantity) * Number(l.unit_price) * (l.kind === 'discount' ? -1 : 1), sort_order: i + 1 })), ...(db.invoice_items ?? []).filter((i) => i.invoice_id !== id)]
      const oldOverview = (db.invoice_overview ?? []).find((i) => i.id === id)
      const overview = { ...(oldOverview ?? {}), id, invoice_no: inv.invoice_no, student_id: studentId, student_name: student.full_name, student_code: student.student_code, description: inv.description, period, period_start: inv.period_start, period_end: inv.period_end, status: inv.status, display_status: inv.status === 'draft' ? 'draft' : 'unpaid', amount_due: subtotal, amount_paid: oldOverview?.amount_paid ?? 0, balance: Math.max(0, subtotal - Number(oldOverview?.amount_paid ?? 0)), pending_count: 0, due_date: inv.due_date, issued_at: inv.issued_at, created_at: inv.created_at }
      db.invoice_overview = [overview, ...(db.invoice_overview ?? []).filter((i) => i.id !== id)]
      appendDemoAudit(db, 'invoices', editing ? 'update' : 'insert', existing ?? null, inv)
      saveDb(db)
      return { data: inv, error: null }
    }

    case 'issue_invoice':
    case 'resend_document':
    case 'set_invoice_due_date':
    case 'void_invoice':
    case 'discard_draft_invoice': {
      const id = args.p_invoice ?? args.p_id
      const original = (db.invoices ?? []).find((i) => i.id === id)
      if (!original) return { data: null, error: { message: 'Invoice not found.' } }
      if (fn === 'discard_draft_invoice') {
        if (original.status !== 'draft') return { data: null, error: { message: 'Only drafts can be discarded.' } }
        db.invoices = (db.invoices ?? []).filter((i) => i.id !== id)
        db.invoice_overview = (db.invoice_overview ?? []).filter((i) => i.id !== id)
        db.invoice_items = (db.invoice_items ?? []).filter((i) => i.invoice_id !== id)
        appendDemoAudit(db, 'invoices', 'delete', original, null)
        saveDb(db)
        return { data: { ok: true }, error: null }
      }
      const updated = { ...original }
      if (fn === 'issue_invoice') { updated.status = 'unpaid'; updated.issued_at = new Date().toISOString() }
      if (fn === 'void_invoice') { updated.status = 'void'; updated.void_reason = args.p_reason ?? 'Voided by admin' }
      if (fn === 'set_invoice_due_date') {
        if (!args.p_due_date) return { data: null, error: { message: 'Please choose a due date.' } }
        updated.due_date = args.p_due_date
      }
      if (fn === 'resend_document') updated.last_sent_at = new Date().toISOString()
      db.invoices = (db.invoices ?? []).map((i) => i.id === id ? updated : i)
      db.invoice_overview = (db.invoice_overview ?? []).map((i) => i.id === id ? { ...i, status: updated.status, display_status: updated.status, due_date: updated.due_date, issued_at: updated.issued_at, last_sent_at: updated.last_sent_at } : i)
      appendDemoAudit(db, 'invoices', 'update', original, updated)
      saveDb(db)
      return { data: { ok: true, simulated: true }, error: null }
    }

    case 'add_invoice_adjustment': {
      const old = (db.invoice_overview ?? []).find((x) => x.id === args.p_invoice)
      if (!old) return { data: null, error: { message: 'Invoice not found.' } }
      const amount = Number(args.p_amount)
      if (!(amount > 0) || !String(args.p_reason ?? '').trim()) return { data: null, error: { message: 'Enter a positive amount and adjustment reason.' } }
      const signed = args.p_kind === 'debit_note' ? amount : -amount
      const next = { ...old, amount_due: Math.max(0, Number(old.amount_due) + signed), balance: Math.max(0, Number(old.balance) + signed) }
      db.invoice_overview = (db.invoice_overview ?? []).map((x) => x.id === old.id ? next : x)
      db.invoice_adjustments = [{ id: makeUuid('adj'), invoice_id: old.id, kind: args.p_kind, reason: args.p_reason, amount: signed, created_at: new Date().toISOString() }, ...(db.invoice_adjustments ?? [])]
      appendDemoAudit(db, 'invoice_overview', 'update', old, next)
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'record_payment': {
      const invoice = (db.invoice_overview ?? []).find((i) => i.id === args.p_invoice)
      if (!invoice || invoice.status === 'void') return { data: null, error: { message: 'Choose an active invoice to record a payment.' } }
      const amount = Number(args.p_amount)
      if (!(amount > 0) || amount > Number(invoice.balance) + 0.001) return { data: null, error: { message: `Payment must be between RM 0.01 and RM ${Number(invoice.balance).toFixed(2)}.` } }
      const payment = { id: makeUuid('pay'), student_id: invoice.student_id, invoice_id: invoice.id, amount, method: args.p_method ?? 'bank_transfer', reference: args.p_ref ?? null, paid_on: args.p_paid_on ?? dayIso(0), remarks: args.p_remarks ?? null, status: 'confirmed', receipt_no: `RCP-DEMO-${(db.payments ?? []).length + 101}`, receipt_issued_at: new Date().toISOString(), created_at: new Date().toISOString() }
      db.payments = [payment, ...(db.payments ?? [])]
      const next = { ...invoice, amount_paid: Number(invoice.amount_paid ?? 0) + amount, balance: Math.max(0, Number(invoice.balance) - amount), status: Number(invoice.balance) <= amount ? 'paid' : 'partial', display_status: Number(invoice.balance) <= amount ? 'paid' : 'partial' }
      db.invoice_overview = (db.invoice_overview ?? []).map((i) => i.id === invoice.id ? next : i)
      db.invoices = (db.invoices ?? []).map((i) => i.id === invoice.id ? { ...i, status: next.status, amount_paid: next.amount_paid } : i)
      appendDemoAudit(db, 'payments', 'insert', null, payment)
      appendDemoAudit(db, 'invoice_overview', 'update', invoice, next)
      saveDb(db)
      return { data: { payment_id: payment.id, receipt_no: payment.receipt_no }, error: null }
    }

    case 'generate_monthly_invoices': {
      const period = String(args.p_period ?? `${monthStr()}-01`).slice(0, 7)
      const existing = new Set((db.invoices ?? []).filter((i) => String(i.period).startsWith(period)).map((i) => i.student_id))
      let created = 0
      for (const enrol of db.enrolments ?? []) {
        if (enrol.status !== 'active' || existing.has(enrol.student_id)) continue
        const student = (db.students ?? []).find((x) => x.id === enrol.student_id)
        const cls = (db.classes ?? []).find((x) => x.id === enrol.class_id)
        const amount = Number(enrol.fee_override ?? cls?.fee ?? 0) * (1 - Number(enrol.discount_percent ?? 0) / 100)
        if (!student || !cls || amount <= 0) continue
        const id = makeUuid('inv')
        const dueDay = Math.min(28, Math.max(1, Number(student.billing_day ?? 7)))
        const due = `${period}-${String(dueDay).padStart(2, '0')}`
        const invoice = { id, invoice_no: `DEMO-${period.replace('-', '')}-${String((db.invoices ?? []).length + 101).padStart(4, '0')}`, student_id: student.id, period: `${period}-01`, period_start: `${period}-01`, period_end: `${period}-28`, description: `Monthly tuition · ${cls.name}`, amount, subtotal: amount, total: amount, discount_total: 0, status: args.p_issue ? 'unpaid' : 'draft', due_date: due, issued_at: args.p_issue ? new Date().toISOString() : null, created_at: new Date().toISOString() }
        db.invoices = [invoice, ...(db.invoices ?? [])]
        db.invoice_overview = [{ ...invoice, student_name: student.full_name, student_code: student.student_code, amount_due: amount, amount_paid: 0, balance: amount, pending_count: 0, display_status: invoice.status }, ...(db.invoice_overview ?? [])]
        db.invoice_items = [{ id: makeUuid('item'), invoice_id: id, description: `${cls.name} (monthly)`, kind: 'tuition', quantity: 1, unit_price: amount, amount, sort_order: 1 }, ...(db.invoice_items ?? [])]
        appendDemoAudit(db, 'invoices', 'insert', null, invoice)
        existing.add(student.id)
        created++
      }
      saveDb(db)
      return { data: { invoices_created: created, lines_created: created, issued: Boolean(args.p_issue), simulated: true }, error: null }
    }

    case 'record_salary_payment': {
      const payout = (db.teacher_payouts ?? []).find((p) => p.id === args.p_payout)
      if (!payout || !['approved','partially_paid'].includes(payout.status)) return { data: null, error: { message: 'Approve the salary statement before recording payment.' } }
      const amount = Number(args.p_amount)
      const outstanding = Number(payout.amount) - Number(payout.amount_paid)
      if (!(amount > 0) || amount > outstanding + 0.001) return { data: null, error: { message: `Enter an amount between RM 0.01 and RM ${outstanding.toFixed(2)}.` } }
      const record = { id: makeUuid('salary-payment'), payout_id: payout.id, paid_on: args.p_paid_on ?? dayIso(0), amount, method: args.p_method ?? 'bank_transfer', reference: args.p_reference ?? null, notes: args.p_notes ?? null, created_at: new Date().toISOString() }
      const next = { ...payout, amount_paid: Number(payout.amount_paid) + amount, status: outstanding <= amount ? 'paid' : 'partially_paid' }
      db.teacher_payout_payments = [record, ...(db.teacher_payout_payments ?? [])]
      db.teacher_payouts = (db.teacher_payouts ?? []).map((p) => p.id === payout.id ? next : p)
      appendDemoAudit(db, 'teacher_payout_payments', 'insert', null, record)
      appendDemoAudit(db, 'teacher_payouts', 'update', payout, next)
      saveDb(db)
      return { data: record, error: null }
    }

    case 'add_salary_item':
    case 'remove_salary_item': {
      if (fn === 'add_salary_item' && (!(Number(args.p_amount) > 0) || !String(args.p_description ?? '').trim())) return { data: null, error: { message: 'Enter a valid amount and description.' } }
      const item = fn === 'add_salary_item' ? { id: makeUuid('salary-item'), payout_id: args.p_payout, kind: args.p_kind, description: args.p_description, amount: Number(args.p_amount), created_at: new Date().toISOString() } : (db.teacher_payout_items ?? []).find((i) => i.id === args.p_item)
      if (!item) return { data: null, error: { message: 'Salary adjustment not found.' } }
      const payout = (db.teacher_payouts ?? []).find((p) => p.id === item.payout_id)
      if (!payout || payout.status !== 'draft') return { data: null, error: { message: 'Only draft salary statements can be adjusted.' } }
      if (fn === 'add_salary_item') db.teacher_payout_items = [item, ...(db.teacher_payout_items ?? [])]
      else db.teacher_payout_items = (db.teacher_payout_items ?? []).filter((i) => i.id !== item.id)
      const signed = Number(item.amount) * (item.kind === 'deduction' ? -1 : 1) * (fn === 'remove_salary_item' ? -1 : 1)
      const next = { ...payout, amount: Number(payout.amount) + signed,
        additions: Number(payout.additions ?? 0) + (item.kind === 'addition' ? signed : 0),
        deductions: Number(payout.deductions ?? 0) + (item.kind === 'deduction' ? -signed : 0) }
      db.teacher_payouts = (db.teacher_payouts ?? []).map((p) => p.id === payout.id ? next : p)
      appendDemoAudit(db, 'teacher_payouts', 'update', payout, next)
      appendDemoAudit(db, 'teacher_payout_items', fn === 'add_salary_item' ? 'insert' : 'delete', fn === 'remove_salary_item' ? item : null, fn === 'add_salary_item' ? item : null)
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'invoice_document': {
      const inv = (db.invoices ?? []).find((i) => i.id === args.p_invoice) ?? (db.invoices ?? [])[0]
      const stu = (db.students ?? []).find((s) => s.id === inv.student_id)
      const items = (db.invoice_items ?? []).filter((it) => it.invoice_id === inv.id)
      const adjs = (db.invoice_adjustments ?? []).filter((a) => a.invoice_id === inv.id)
      const pays = (db.payments ?? [])
        .filter((p) => p.invoice_id === inv.id && p.status === 'confirmed')
        .map((p) => ({ receipt_no: p.receipt_no, paid_on: p.paid_on, method: p.method, amount: p.amount }))
      const paidSum = pays.reduce((sum, p) => sum + Number(p.amount), 0)
      const adjSum = adjs.reduce((sum, a) => sum + Number(a.amount ?? 0), 0)
      const overview = (db.invoice_overview ?? []).find((o) => o.id === inv.id)
      const amountDue = overview ? Number(overview.amount_due) : Math.max(0, Number(inv.amount ?? 150) + adjSum)
      const balance = Math.max(0, amountDue - paidSum)
      const isOverdue = ['unpaid', 'partial'].includes(inv.status) && Boolean(inv.due_date) && inv.due_date < dayIso(0) && balance > 0
      return {
        data: {
          invoice: inv,
          bill_to: {
            name: stu?.full_name ?? 'Aisha Binti Rahman',
            student_code: stu?.student_code ?? 'ST-2026-001',
            email: stu?.email ?? 'student@topmind.my',
            phone: stu?.phone ?? '+60 11-2890 4412',
          },
          items: items.length ? items : [{ kind: 'tuition', description: inv.description, quantity: 1, unit_price: inv.amount, amount: inv.amount }],
          adjustments: adjs,
          payments: pays,
          amount_due: amountDue,
          amount_paid: paidSum,
          balance,
          is_overdue: isOverdue,
          business: {
            name: 'Top Mind Enterprise',
            email: 'etopmind@gmail.com',
            phone: '+60 10-522 1300',
            address: 'No. 18-2, Jalan Solaris, Mont Kiara, 50480 Kuala Lumpur',
          },
        },
        error: null,
      }
    }

    case 'receipt_document': {
      const pay = (db.payments ?? []).find((p) => p.id === args.p_payment) ?? (db.payments ?? [])[0]
      const stu = (db.students ?? []).find((s) => s.id === pay?.student_id)
      const inv = (db.invoices ?? []).find((i) => i.id === pay?.invoice_id)
      return {
        data: {
          payment: pay,
          student: {
            full_name: stu?.full_name ?? 'Aisha Binti Rahman',
            student_code: stu?.student_code ?? 'ST-2026-001',
            email: stu?.email ?? 'student@topmind.my',
          },
          invoice: {
            invoice_no: inv?.invoice_no ?? 'INV-2026-0101',
            description: inv?.description ?? 'Monthly Tuition',
          },
          business: {
            name: 'Top Mind Enterprise',
            email: 'etopmind@gmail.com',
            phone: '+60 10-522 1300',
            address: 'No. 18-2, Jalan Solaris, Mont Kiara, 50480 Kuala Lumpur',
          },
        },
        error: null,
      }
    }

    case 'submit_payment': {
      if (!(Number(args.p_amount) > 0) || !Number.isFinite(Number(args.p_amount))) return { data: null, error: { message: 'Payment amount must be greater than zero.' } }
      if (!args.p_invoice) return { data: null, error: { message: 'Choose an invoice before recording payment.' } }
      const newPay = {
        id: makeUuid('pay'),
        student_id: 'stu-aisha',
        invoice_id: args.p_invoice,
        amount: args.p_amount ?? 150,
        method: args.p_method ?? 'bank_transfer',
        reference: args.p_ref ?? `REF-${Math.floor(1000 + Math.random() * 9000)}`,
        paid_on: args.p_paid_on ?? dayIso(0),
        status: 'pending',
        receipt_no: null,
        receipt_issued_at: null,
        remarks: args.p_remarks ?? null,
        evidence_path: args.p_evidence_path ?? null,
        created_at: new Date().toISOString(),
      }
      db.payments = [newPay, ...(db.payments ?? [])]
      db.invoice_overview = (db.invoice_overview ?? []).map((inv) =>
        inv.id === args.p_invoice ? { ...inv, pending_count: Number(inv.pending_count ?? 0) + 1 } : inv,
      )
      appendDemoAudit(db, 'payments', 'insert', null, newPay)
      saveDb(db)
      return { data: newPay, error: null }
    }

    case 'confirm_payment':
    case 'reject_payment':
    case 'refund_payment': {
      const original = (db.payments ?? []).find((p) => p.id === args.p_payment)
      if (!original) return { data: null, error: { message: 'Payment not found. Refresh your list.' } }
      if (fn === 'confirm_payment' && original.status === 'confirmed') return { data: { receipt_no: original.receipt_no }, error: null }
      if (fn === 'confirm_payment' && ['rejected', 'refunded'].includes(original.status)) return { data: null, error: { message: 'Rejected or refunded payments cannot be confirmed again.' } }
      const newStatus = fn === 'confirm_payment' ? 'confirmed' : fn === 'reject_payment' ? 'rejected' : 'refunded'
      const receiptNo = original.receipt_no ?? `RCP-${new Date().getFullYear()}-${String((db.payments ?? []).filter((p) => p.receipt_no).length + 101).padStart(5, '0')}`
      const updated = { ...original, status: newStatus,
        ...(newStatus === 'confirmed' ? { receipt_no: receiptNo, receipt_issued_at: new Date().toISOString() } : {}),
        ...(newStatus === 'rejected' ? { rejected_reason: args.p_reason ?? 'Not verified' } : {}),
        ...(newStatus === 'refunded' ? { refund_reason: args.p_reason ?? 'Refunded' } : {}),
      }
      db.payments = (db.payments ?? []).map((p) => p.id === original.id ? updated : p)
      appendDemoAudit(db, 'payments', 'update', original, updated)
      const invId = original.invoice_id
      const invoice = (db.invoice_overview ?? []).find((i) => i.id === invId)
      if (invoice) {
        const paid = (db.payments ?? []).filter((p) => p.invoice_id === invId && p.status === 'confirmed').reduce((a, p) => a + Number(p.amount), 0)
        const pending = (db.payments ?? []).filter((p) => p.invoice_id === invId && p.status === 'pending').length
        const balance = Math.max(0, Number(invoice.amount_due) - paid)
        const status = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
        const next = { ...invoice, amount_paid: paid, balance, pending_count: pending, display_status: status, status }
        db.invoice_overview = (db.invoice_overview ?? []).map((i) => i.id === invId ? next : i)
        db.invoices = (db.invoices ?? []).map((i) => i.id === invId ? { ...i, status, amount_paid: paid } : i)
        appendDemoAudit(db, 'invoice_overview', 'update', invoice, next)
      }
      if (newStatus === 'confirmed') {
        const student = (db.students ?? []).find((x) => x.id === original.student_id)
        if (student?.profile_id) db.notifications = [{ id: makeUuid('notif'), user_id: student.profile_id, title: `Payment confirmed: ${receiptNo}`, body: `RM ${Number(original.amount).toFixed(2)} recorded. Your receipt is ready in the portal.`, link: '/student/receipts', read: false, created_at: new Date().toISOString() }, ...(db.notifications ?? [])]
      }
      saveDb(db)
      return { data: { receipt_no: newStatus === 'confirmed' ? receiptNo : null, ok: true }, error: null }
    }

    case 'update_my_student_profile': {
      const p = args.p ?? {}
      db.students = (db.students ?? []).map((s) =>
        s.id === 'stu-aisha'
          ? {
              ...s,
              full_name: p.full_name ?? s.full_name,
              phone: p.phone ?? s.phone,
              preferred_contact: p.preferred_contact ?? s.preferred_contact,
              timezone: p.timezone ?? s.timezone,
              learning_objectives: p.learning_objectives ?? s.learning_objectives,
              guardian_name: p.guardian_name ?? s.guardian_name,
              guardian_phone: p.guardian_phone ?? s.guardian_phone,
              date_of_birth: p.date_of_birth || s.date_of_birth,
              consent_marketing: p.consent_marketing ?? s.consent_marketing,
              consent_whatsapp: p.consent_whatsapp ?? s.consent_whatsapp,
            }
          : s,
      )
      const session = readDemoSession()
      if (session?.role === 'student') {
        writeDemoSession({
          ...session,
          profile: { ...session.profile, full_name: p.full_name ?? session.profile.full_name, phone: p.phone ?? session.profile.phone },
        })
      }
      saveDb(db)
      return { data: db.students.find((s) => s.id === 'stu-aisha'), error: null }
    }

    case 'generate_salary_statements': {
      const period = String(args.p_month ?? `${monthStr(-1)}-01`).slice(0, 7) + '-01'
      const teachers = (db.profiles ?? []).filter((p) => p.role === 'teacher' && p.status === 'active')
      let created = 0
      let recalculated = 0
      let alreadyApproved = 0
      const payouts = [...(db.teacher_payouts ?? [])]
      for (const t of teachers) {
        const calc = computeTeacherPayData(db, t.id, period)
        const existingIdx = payouts.findIndex((p) => p.teacher_id === t.id && p.period === period && p.status !== 'void')
        if (existingIdx < 0) {
          payouts.unshift({
            id: makeUuid('sal'),
            teacher_id: t.id,
            period,
            status: 'draft',
            lessons_completed: calc.lessons,
            hours: calc.hours,
            students_count: calc.students,
            base_amount: calc.base_amount,
            additions: 0,
            deductions: 0,
            amount: calc.base_amount,
            amount_paid: 0,
            approved_at: null,
            breakdown: calc,
            created_at: new Date().toISOString(),
          })
          created++
        } else if (payouts[existingIdx].status === 'draft') {
          const cur = payouts[existingIdx]
          payouts[existingIdx] = {
            ...cur,
            lessons_completed: calc.lessons,
            hours: calc.hours,
            students_count: calc.students,
            base_amount: calc.base_amount,
            amount: calc.base_amount + Number(cur.additions ?? 0) - Number(cur.deductions ?? 0),
            breakdown: calc,
          }
          recalculated++
        } else {
          alreadyApproved++
        }
      }
      for (const next of payouts) { const before = (db.teacher_payouts ?? []).find((p) => p.id === next.id); appendDemoAudit(db, 'teacher_payouts', before ? 'update' : 'insert', before ?? null, next) }
      db.teacher_payouts = payouts
      saveDb(db)
      return { data: { created, recalculated, already_approved: alreadyApproved }, error: null }
    }

    case 'approve_salary_statement': {
      const previous = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      db.teacher_payouts = (db.teacher_payouts ?? []).map((t) => (t.id === args.p_payout ? { ...t, status: 'approved', approved_at: new Date().toISOString() } : t))
      const next = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      if (previous && next) appendDemoAudit(db, 'teacher_payouts', 'update', previous, next)
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'reopen_salary_statement': {
      const previous = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      db.teacher_payouts = (db.teacher_payouts ?? []).map((t) => (t.id === args.p_payout ? { ...t, status: 'draft' } : t))
      const next = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      if (previous && next) appendDemoAudit(db, 'teacher_payouts', 'update', previous, next)
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'void_salary_statement': {
      const previous = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      db.teacher_payouts = (db.teacher_payouts ?? []).map((t) => (t.id === args.p_payout ? { ...t, status: 'void' } : t))
      const next = (db.teacher_payouts ?? []).find((t) => t.id === args.p_payout)
      if (previous && next) appendDemoAudit(db, 'teacher_payouts', 'update', previous, next)
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'mark_notifications_read': {
      const ids: string[] | null = args.p_ids ?? null
      db.notifications = (db.notifications ?? []).map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n))
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'approve_registration': {
      const reg = (db.registrations ?? []).find((r) => r.id === args.p_registration)
      if (!reg) return { data: null, error: { message: 'Registration not found.' } }
      let student = (db.students ?? []).find(
        (s) => (reg.student_id && s.id === reg.student_id) || (reg.email && s.email?.toLowerCase() === String(reg.email).toLowerCase()),
      )
      if (!student) {
        student = {
          id: makeUuid('stu'),
          student_code: `ST-${new Date().getFullYear()}-${String((db.students ?? []).length + 101).padStart(3, '0')}`,
          full_name: reg.student_name,
          email: reg.email,
          phone: reg.phone ?? null,
          preferred_contact: reg.preferred_contact ?? 'email',
          date_of_birth: reg.date_of_birth ?? null,
          guardian_name: reg.guardian_name ?? null,
          preferred_language_id: reg.language_id ?? null,
          learning_objectives: reg.objectives ?? null,
          status: 'active',
          source: 'registration',
          profile_id: null,
          timezone: reg.timezone ?? 'Asia/Kuala_Lumpur',
          created_at: new Date().toISOString(),
        }
        db.students = [student, ...(db.students ?? [])]
        appendDemoAudit(db, 'students', 'insert', null, student)
      }
      const nextStatus = args.p_class ? 'converted' : 'approved'
      if (args.p_class) {
        const cls = (db.classes ?? []).find((c) => c.id === args.p_class)
        const existingEnr = (db.enrolments ?? []).find((e) => e.student_id === student.id && e.class_id === args.p_class && ['active', 'waitlisted', 'pending'].includes(e.status))
        if (!existingEnr) {
          const activeCount = (db.enrolments ?? []).filter((e) => e.class_id === args.p_class && e.status === 'active').length
          const enrStatus = cls && activeCount >= Number(cls.capacity ?? 12) ? 'waitlisted' : 'active'
          const enr = {
            id: makeUuid('enr'),
            student_id: student.id,
            class_id: args.p_class,
            status: enrStatus,
            start_date: args.p_start || dayIso(0),
            end_date: null,
            fee_override: null,
            discount_percent: 0,
            reason: args.p_note ?? null,
            notes: null,
            created_at: new Date().toISOString(),
          }
          db.enrolments = [enr, ...(db.enrolments ?? [])]
          appendDemoAudit(db, 'enrolments', 'insert', null, enr)
        }
        const levelId = args.p_level || cls?.level_id || null
        if (levelId) {
          const place = {
            id: makeUuid('pl'),
            student_id: student.id,
            course_id: reg.course_id ?? cls?.course_id ?? null,
            level_id: levelId,
            class_id: args.p_class,
            source: 'registration',
            reason: args.p_note || 'Approved from registration',
            created_at: new Date().toISOString(),
          }
          db.placements = [place, ...(db.placements ?? [])]
        }
      }
      db.registrations = (db.registrations ?? []).map((r) =>
        r.id === args.p_registration
          ? {
              ...r,
              status: nextStatus,
              student_id: student.id,
              class_id: args.p_class ?? r.class_id,
              admin_notes: args.p_note ?? r.admin_notes ?? null,
            }
          : r,
      )
      appendDemoAudit(db, 'registrations', 'update', reg, db.registrations.find((r) => r.id === args.p_registration))
      saveDb(db)
      return { data: { student_id: student.id, status: nextStatus, student_name: student.full_name }, error: null }
    }

    case 'waitlist_registration': {
      db.registrations = (db.registrations ?? []).map((r) =>
        r.id === args.p_registration ? { ...r, status: 'waitlisted', class_id: args.p_class ?? r.class_id, admin_notes: args.p_note ?? r.admin_notes ?? null } : r,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'reject_registration': {
      db.registrations = (db.registrations ?? []).map((r) =>
        r.id === args.p_registration ? { ...r, status: 'rejected', decision_reason: args.p_reason ?? null } : r,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'request_registration_info': {
      db.registrations = (db.registrations ?? []).map((r) =>
        r.id === args.p_registration ? { ...r, status: 'info_requested', info_request: args.p_message ?? null } : r,
      )
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'recommend_classes': {
      return {
        data: buildClassRecommendations(db, args.p_course, args.p_level, args.p_limit ?? 6),
        error: null,
      }
    }

    case 'suggest_enquiry_reply': {
      return {
        data: {
          category: 'classes',
          reply: 'Hi there! Thanks for reaching out to Top Mind Enterprise. We offer beginner-friendly group and 1-to-1 classes online and at our Mont Kiara centre. Let us know your preferred time and we will match a class for you!',
        },
        error: null,
      }
    }

    case 'log_enquiry_message': {
      const nowIso = new Date().toISOString()
      db.enquiry_messages = [
        ...(db.enquiry_messages ?? []),
        {
          id: makeUuid('em'),
          enquiry_id: args.p_enquiry,
          direction: args.p_direction ?? 'outbound',
          channel: args.p_channel ?? 'whatsapp',
          body: args.p_body ?? '',
          created_at: nowIso,
        },
      ]
      if (args.p_direction === 'outbound') {
        db.enquiries = (db.enquiries ?? []).map((e) =>
          e.id === args.p_enquiry ? { ...e, status: 'responded', last_contacted_at: nowIso } : e,
        )
      }
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    case 'run_automation': {
      const key = String(args.p_job ?? 'class_reminders')
      const job = (db.automation_jobs ?? []).find((j) => j.key === key)
      if (!job) return { data: null, error: { message: 'That automation does not exist.' } }
      if (!job.is_enabled) return { data: null, error: { message: 'Enable this automation before running it.' } }
      const nowIso = new Date().toISOString()
      let processed = 0
      const today = nowIso.slice(0, 10)
      const notify = (user: string, title: string, body: string, link: string, unique: string) => {
        if ((db.notifications ?? []).some((n) => n.demo_unique_key === unique)) return
        db.notifications = [{ id: makeUuid('notification'), user_id: user, title, body, link, read: false, demo_unique_key: unique, created_at: nowIso }, ...(db.notifications ?? [])]
        processed++
      }
      if (key === 'class_reminders') {
        const end = Date.now() + 48 * 3600000
        for (const ses of db.sessions ?? []) {
          const at = new Date(ses.starts_at).getTime()
          if (ses.status !== 'scheduled' || at < Date.now() || at > end) continue
          for (const enrol of (db.enrolments ?? []).filter((e) => e.class_id === ses.class_id && e.status === 'active')) {
            const student = (db.students ?? []).find((x) => x.id === enrol.student_id)
            if (!student?.profile_id) continue
            const cls = (db.classes ?? []).find((x) => x.id === ses.class_id)
            notify(student.profile_id, 'Upcoming class reminder', `${cls?.name ?? 'Your class'}: ${new Date(ses.starts_at).toLocaleString('en-MY')}`, '/student/schedule', `class:${ses.id}:${student.id}`)
          }
        }
      } else if (key === 'payment_reminders') {
        for (const inv of db.invoice_overview ?? []) {
          if (Number(inv.balance) <= 0 || inv.status === 'void') continue
          const student = (db.students ?? []).find((x) => x.id === inv.student_id)
          if (student?.profile_id) notify(student.profile_id, 'Payment reminder', `Invoice ${inv.invoice_no} has RM ${Number(inv.balance).toFixed(2)} outstanding.`, '/student/invoices', `payment:${inv.id}:${today}`)
        }
      } else if (key === 'monthly_invoices') {
        // Monthly invoices are generated via their dedicated billing RPC, then
        // the admin reviews them. No external payment or email occurs in demo.
        const existing = new Set((db.invoices ?? []).filter((i) => String(i.period).startsWith(monthStr())).map((i) => i.student_id))
        const currentMonth = monthStr()
        for (const enrol of db.enrolments ?? []) {
          if (enrol.status !== 'active' || existing.has(enrol.student_id)) continue
          const student = (db.students ?? []).find((x) => x.id === enrol.student_id)
          const cls = (db.classes ?? []).find((x) => x.id === enrol.class_id)
          const amount = Number(cls?.fee ?? 0)
          if (!student || !cls || amount <= 0) continue
          const id = makeUuid('invoice')
          const dueDay = Math.min(28, Math.max(1, Number(student.billing_day ?? 7)))
          const due = `${currentMonth}-${String(dueDay).padStart(2, '0')}`
          const invoice = { id, invoice_no: `DEMO-${currentMonth.replace('-', '')}-${String((db.invoices ?? []).length + 1).padStart(4, '0')}`, student_id: student.id, period: `${currentMonth}-01`, period_start: `${currentMonth}-01`, period_end: `${currentMonth}-28`, description: `Monthly tuition · ${cls.name}`, amount, status: 'issued', due_date: due, issued_at: nowIso, created_at: nowIso }
          db.invoices = [invoice, ...(db.invoices ?? [])]
          db.invoice_overview = [{ ...invoice, student_name: student.full_name, student_code: student.student_code, amount_due: amount, amount_paid: 0, balance: amount, pending_count: 0, display_status: 'unpaid' }, ...(db.invoice_overview ?? [])]
          db.invoice_items = [{ id: makeUuid('item'), invoice_id: id, description: `${cls.name} (monthly)`, kind: 'tuition', quantity: 1, unit_price: amount, amount, sort_order: 1 }, ...(db.invoice_items ?? [])]
          existing.add(student.id)
          processed++
        }
      }
      db.automation_jobs = (db.automation_jobs ?? []).map((j) => j.key === key ? { ...j, last_run_at: nowIso, last_status: 'succeeded' } : j)
      db.automation_runs = [{ id: makeUuid('ar'), job_key: key, trigger: args.p_trigger ?? 'manual', status: 'succeeded', result: { processed, simulated: true }, error: null, started_at: nowIso }, ...(db.automation_runs ?? [])]
      appendDemoAudit(db, 'automation_runs', 'insert', null, db.automation_runs[0])
      saveDb(db)
      return { data: { processed, simulated: true }, error: null }
    }

    case 'run_report': {
      const key = String(args.p_key ?? 'summary')
      const f = (args.p_filters ?? {}) as Record<string, any>
      if (key === 'classes') {
        const rows = (db.classes ?? [])
          .filter((c) => !f.class_id || c.id === f.class_id)
          .map((c, idx) => {
            const co = (db.courses ?? []).find((x) => x.id === c.course_id)
            const l = (db.languages ?? []).find((x) => x.id === co?.language_id)
            const lv = (db.levels ?? []).find((x) => x.id === c.level_id)
            const t = (db.profiles ?? []).find((x) => x.id === c.teacher_id)
            const enrolled = (db.enrolments ?? []).filter((e) => e.class_id === c.id && e.status === 'active').length
            const cap = Number(c.capacity ?? 12)
            return {
              class: c.name,
              language: l?.name ?? null,
              programme: co?.name ?? null,
              level: lv?.name ?? null,
              teacher: t?.full_name ?? null,
              status: c.status,
              mode: c.mode,
              type: c.kind,
              capacity: cap,
              enrolled,
              spaces: Math.max(cap - enrolled, 0),
              attendance_percent: [96, 94, 91][idx % 3],
              invoiced: [3600, 1650, 1200][idx % 3],
              collected: [3450, 1500, 1100][idx % 3],
            }
          })
        return { data: rows, error: null }
      }
      if (key === 'progress') {
        const rows = (db.progress_notes ?? []).filter((n) => !f.from || n.lesson_date >= f.from).filter((n) => !f.to || n.lesson_date <= f.to).map((n) => {
          const student = (db.students ?? []).find((x) => x.id === n.student_id)
          return { date: n.lesson_date, student: student?.full_name ?? 'Unknown', student_code: student?.student_code ?? '', skill: n.skill, score: n.score, notes: n.notes }
        })
        return { data: rows, error: null }
      }
      if (key === 'attendance') {
        const grouped = new Map<string, { present: number; late: number; absent: number; excused: number; lessons: number }>()
        for (const r of db.attendance ?? []) {
          const value = grouped.get(r.student_id) ?? { present: 0, late: 0, absent: 0, excused: 0, lessons: 0 }
          value.lessons++
          if (r.status in value) (value as any)[r.status]++
          grouped.set(r.student_id, value)
        }
        return { data: Array.from(grouped.entries()).map(([id, counts]) => {
          const student = (db.students ?? []).find((x) => x.id === id)
          return { student: student?.full_name ?? id, student_code: student?.student_code ?? '', ...counts, attendance_percent: Math.round(100 * (counts.present + counts.late) / (counts.lessons || 1)) }
        }), error: null }
      }
      if (key === 'payments' || key === 'receipts') {
        return { data: (db.payments ?? []).filter((p) => key === 'payments' || p.receipt_no).filter((p) => !f.from || p.paid_on >= f.from).filter((p) => !f.to || p.paid_on <= f.to).map((p) => {
          const student = (db.students ?? []).find((x) => x.id === p.student_id)
          return { student: student?.full_name ?? '', paid_on: p.paid_on, method: p.method, amount: p.amount, status: p.status, reference: p.reference, receipt_no: p.receipt_no ?? '' }
        }), error: null }
      }
      if (key === 'proficiency') {
        return {
          data: [
            { class: 'English Beginners Daily', level: 'Beginner (A1)', level_rank: 1, students: 2 },
            { class: 'Conversational Tamil', level: 'Conversational Level 1', level_rank: 1, students: 2 },
          ],
          error: null,
        }
      }
      if (key === 'registrations') {
        return {
          data: (db.registrations ?? []).map((r) => ({
            date: String(r.created_at ?? dayIso(0)).slice(0, 10),
            tracking: r.tracking_code,
            name: r.student_name,
            email: r.email,
            phone: r.phone,
            format: r.format,
            mode: r.mode,
            source: r.source,
            status: r.status,
          })),
          error: null,
        }
      }
      if (key === 'salaries') {
        return {
          data: (db.teacher_payouts ?? []).map((t) => {
            const p = (db.profiles ?? []).find((x) => x.id === t.teacher_id)
            return {
              teacher: p?.full_name ?? 'Teacher',
              month: String(t.period).slice(0, 7),
              status: t.status,
              lessons: t.lessons_completed,
              hours: t.hours,
              base_amount: t.base_amount,
              total: t.amount,
              paid: t.amount_paid,
              outstanding: Number(t.amount) - Number(t.amount_paid),
            }
          }),
          error: null,
        }
      }
      if (key === 'invoices' || key === 'outstanding') {
        return {
          data: (db.invoice_overview ?? []).map((i) => ({
            invoice_no: i.invoice_no,
            student_code: i.student_code,
            student: i.student_name,
            amount_due: i.amount_due,
            amount_paid: i.amount_paid,
            balance: i.balance,
            status: i.display_status,
            due_date: i.due_date,
          })),
          error: null,
        }
      }
      return {
        data: [
          {
            month: monthStr(-2),
            new_registrations: 5,
            new_enrolments: 4,
            active_students: 31,
            lessons_delivered: 42,
            attendance_percent: 93,
            invoiced: 8100,
            collected: 7450,
            refunded: 0,
            salaries_paid: 2500,
            expenses: 1380,
            net_operating_balance: 3570,
          },
          {
            month: monthStr(-1),
            new_registrations: 6,
            new_enrolments: 5,
            active_students: 35,
            lessons_delivered: 46,
            attendance_percent: 94,
            invoiced: 9000,
            collected: 8120,
            refunded: 0,
            salaries_paid: 2600,
            expenses: 1410,
            net_operating_balance: 4110,
          },
          {
            month: monthStr(0),
            new_registrations: 7,
            new_enrolments: 6,
            active_students: 38,
            lessons_delivered: 48,
            attendance_percent: 94,
            invoiced: 9650,
            collected: 8450,
            refunded: 0,
            salaries_paid: 2600,
            expenses: 1450,
            net_operating_balance: 4400,
          },
        ],
        error: null,
      }
    }

    case 'get_assessment': {
      const token = String(args.p_token ?? '').trim()
      const attempt = (db.assessment_attempts ?? []).find((a) => a.token === token)
      if (!attempt || (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now())) {
        return { data: null, error: { message: 'This assessment link is invalid or has expired.' } }
      }
      const ass = (db.assessments ?? []).find((a) => a.id === attempt.assessment_id)
      if (!ass) return { data: null, error: { message: 'Assessment not found.' } }
      if (['submitted', 'reviewed'].includes(attempt.status)) {
        return { data: { status: attempt.status, title: ass.title, result: buildAssessmentResult(db, attempt) }, error: null }
      }
      let current = attempt
      if (attempt.status === 'not_started') {
        current = { ...attempt, status: 'in_progress', started_at: new Date().toISOString() }
        db.assessment_attempts = (db.assessment_attempts ?? []).map((a) => (a.id === current.id ? current : a))
        saveDb(db)
      }
      const questions = (db.assessment_questions ?? [])
        .filter((q) => q.assessment_id === ass.id)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((q) => ({
          id: q.id,
          section: q.section ?? 'grammar',
          kind: q.kind,
          prompt: q.prompt,
          passage: q.passage ?? null,
          media_url: q.media_url ?? null,
          options: q.options ?? null,
        }))
      return {
        data: {
          status: current.status,
          title: ass.title,
          description: ass.description ?? null,
          instructions: ass.instructions ?? null,
          skills: ass.skills ?? ['grammar', 'vocabulary'],
          time_limit_minutes: ass.time_limit_minutes ?? null,
          started_at: current.started_at,
          questions,
        },
        error: null,
      }
    }

    case 'submit_assessment': {
      const token = String(args.p_token ?? '').trim()
      const attempt = (db.assessment_attempts ?? []).find((a) => a.token === token)
      if (!attempt || (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now())) {
        return { data: null, error: { message: 'This assessment link is invalid or has expired.' } }
      }
      if (['submitted', 'reviewed'].includes(attempt.status)) {
        return { data: buildAssessmentResult(db, attempt), error: null }
      }
      const answersInput: any[] = Array.isArray(args.p_answers) ? args.p_answers : []
      const questions = (db.assessment_questions ?? []).filter((q) => q.assessment_id === attempt.assessment_id)
      const ass = (db.assessments ?? []).find((a) => a.id === attempt.assessment_id)
      let autoPoints = 0
      let autoMax = 0
      let manualMax = 0
      const savedAnswers: any[] = []

      for (const q of questions) {
        const ans = answersInput.find((x) => x.question_id === q.id) ?? {}
        const pts = Number(q.points ?? 1)
        if (q.kind === 'mcq') {
          autoMax += pts
          const sel = ans.option != null && /^\d+$/.test(String(ans.option)) ? Number(ans.option) : null
          const ok = sel !== null && sel === Number(q.correct_option)
          if (ok) autoPoints += pts
          savedAnswers.push({
            id: makeUuid('aa'),
            attempt_id: attempt.id,
            question_id: q.id,
            selected_option: sel,
            text_answer: null,
            is_correct: ok,
            points_awarded: ok ? pts : 0,
          })
        } else if (q.kind === 'short_text' && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 0) {
          autoMax += pts
          const txt = String(ans.text ?? '').trim().slice(0, 500)
          const ok = q.accepted_answers.some((acc: string) => String(acc).trim().toLowerCase() === txt.toLowerCase())
          if (ok) autoPoints += pts
          savedAnswers.push({
            id: makeUuid('aa'),
            attempt_id: attempt.id,
            question_id: q.id,
            selected_option: null,
            text_answer: txt,
            is_correct: ok,
            points_awarded: ok ? pts : 0,
          })
        } else {
          manualMax += pts
          savedAnswers.push({
            id: makeUuid('aa'),
            attempt_id: attempt.id,
            question_id: q.id,
            selected_option: null,
            text_answer: ans.text ? String(ans.text).slice(0, 5000) : '',
            is_correct: null,
            points_awarded: null,
          })
        }
      }

      db.assessment_answers = [
        ...savedAnswers,
        ...(db.assessment_answers ?? []).filter((a) => a.attempt_id !== attempt.id),
      ]
      const pct = autoMax > 0 ? Math.round((autoPoints * 10000) / autoMax) / 100 : null
      const matchingBand = (db.placement_bands ?? [])
        .filter((b) => b.assessment_id === attempt.assessment_id && Number(b.min_percent) <= (pct ?? 0))
        .sort((a, b) => Number(b.min_percent) - Number(a.min_percent))[0]
      const levelId = matchingBand?.level_id ?? null
      const reg = (db.registrations ?? []).find((r) => r.id === attempt.registration_id)
      const courseId = ass?.course_id ?? reg?.course_id ?? null
      const recs = buildClassRecommendations(db, courseId, levelId, 5)
      const recClassId = recs.find((r) => r.spaces_left > 0)?.class_id ?? recs[0]?.class_id ?? null

      const updatedAttempt = {
        ...attempt,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        started_at: attempt.started_at ?? new Date().toISOString(),
        auto_points: autoPoints,
        auto_max: autoMax,
        percent: pct,
        manual_max: manualMax > 0 ? manualMax : null,
        level_id: levelId,
        recommended_class_id: recClassId,
      }
      db.assessment_attempts = (db.assessment_attempts ?? []).map((a) => (a.id === attempt.id ? updatedAttempt : a))
      if (reg) {
        const lvName = levelId ? (db.levels ?? []).find((l) => l.id === levelId)?.name : null
        db.registrations = (db.registrations ?? []).map((r) =>
          r.id === reg.id
            ? {
                ...r,
                assessment_attempt_id: attempt.id,
                recommended_class_id: recClassId ?? r.recommended_class_id ?? null,
                recommendation_reason: `Placement assessment: ${pct != null ? `${pct}%` : 'writing only'}${lvName ? `, suggested level ${lvName}` : ''}`,
              }
            : r,
        )
      }
      saveDb(db)
      return { data: buildAssessmentResult(db, updatedAttempt), error: null }
    }

    case 'review_assessment': {
      const attempt = (db.assessment_attempts ?? []).find((a) => a.id === args.p_attempt)
      if (!attempt || !['submitted', 'reviewed'].includes(attempt.status)) {
        return { data: null, error: { message: 'Only submitted assessments can be reviewed.' } }
      }
      if (args.p_manual_points != null) {
        const pts = Number(args.p_manual_points)
        const max = Number(attempt.manual_max ?? 0)
        if (pts < 0 || pts > max) return { data: null, error: { message: `Writing points must be between 0 and ${max}.` } }
      }
      const next = {
        ...attempt,
        status: 'reviewed',
        manual_points: args.p_manual_points != null ? Number(args.p_manual_points) : attempt.manual_points,
        level_id: args.p_level || attempt.level_id,
        reviewed_by: readDemoSession()?.profile.id ?? 'demo-admin-id',
        reviewed_at: new Date().toISOString(),
        review_notes: args.p_notes ?? null,
      }
      db.assessment_attempts = (db.assessment_attempts ?? []).map((a) => (a.id === attempt.id ? next : a))
      saveDb(db)
      return { data: next, error: null }
    }

    case 'enrol_student': {
      const cls = (db.classes ?? []).find((c) => c.id === args.p_class)
      if (!cls) return { data: null, error: { message: 'Class not found.' } }
      if (!['active', 'draft'].includes(cls.status)) return { data: null, error: { message: `This class is ${cls.status}, so students cannot be enrolled.` } }
      const stu = (db.students ?? []).find((s) => s.id === args.p_student && s.status !== 'archived')
      if (!stu) return { data: null, error: { message: 'Student not found or archived.' } }
      const dup = (db.enrolments ?? []).find(
        (e) => e.student_id === args.p_student && e.class_id === args.p_class && ['pending', 'waitlisted', 'active', 'suspended'].includes(e.status),
      )
      if (dup) return { data: null, error: { message: `This student is already enrolled in this class (status: ${dup.status}).` } }
      const activeCount = (db.enrolments ?? []).filter((e) => e.class_id === args.p_class && e.status === 'active').length
      const cap = Number(cls.capacity ?? 12)
      let status = 'active'
      if (activeCount >= cap) {
        if (!args.p_waitlist_if_full) return { data: null, error: { message: `Class is full (capacity ${cap}).` } }
        status = 'waitlisted'
      }
      const row = {
        id: makeUuid('enr'),
        student_id: args.p_student,
        class_id: args.p_class,
        status,
        start_date: args.p_start || (cls.start_date && cls.start_date > dayIso(0) ? cls.start_date : dayIso(0)),
        end_date: null,
        fee_override: null,
        discount_percent: 0,
        reason: null,
        notes: args.p_notes ?? null,
        created_at: new Date().toISOString(),
      }
      db.enrolments = [row, ...(db.enrolments ?? [])]
      appendDemoAudit(db, 'enrolments', 'insert', null, row)
      saveDb(db)
      return { data: row, error: null }
    }

    case 'change_enrolment_status': {
      const enr = (db.enrolments ?? []).find((e) => e.id === args.p_enrolment)
      if (!enr) return { data: null, error: { message: 'Enrolment not found.' } }
      const nextStatus = String(args.p_status ?? '')
      if (!['active', 'suspended', 'completed', 'withdrawn', 'waitlisted', 'pending'].includes(nextStatus)) {
        return { data: null, error: { message: `Unsupported status ${nextStatus}.` } }
      }
      if (['completed', 'transferred', 'withdrawn', 'dropped'].includes(enr.status) && nextStatus !== enr.status) {
        return { data: null, error: { message: `This enrolment has ended (${enr.status}). Enrol the student again instead.` } }
      }
      if (nextStatus === 'withdrawn' && !String(args.p_reason ?? '').trim()) {
        return { data: null, error: { message: 'Please record a reason for the withdrawal.' } }
      }
      const next = {
        ...enr,
        status: nextStatus,
        reason: args.p_reason ?? enr.reason ?? null,
        end_date: ['completed', 'withdrawn'].includes(nextStatus) ? (args.p_end_date ?? dayIso(0)) : enr.end_date,
      }
      db.enrolments = (db.enrolments ?? []).map((e) => (e.id === enr.id ? next : e))
      appendDemoAudit(db, 'enrolments', 'update', enr, next)
      saveDb(db)
      return { data: next, error: null }
    }

    case 'transfer_enrolment': {
      if (!String(args.p_reason ?? '').trim()) return { data: null, error: { message: 'Please record a reason for the transfer.' } }
      const oldE = (db.enrolments ?? []).find((e) => e.id === args.p_enrolment)
      if (!oldE) return { data: null, error: { message: 'Enrolment not found.' } }
      if (!['active', 'suspended', 'waitlisted', 'pending'].includes(oldE.status)) {
        return { data: null, error: { message: 'Only current enrolments can be transferred.' } }
      }
      if (oldE.class_id === args.p_new_class) return { data: null, error: { message: 'The student is already in that class.' } }
      const dateStr = args.p_date ?? dayIso(0)
      const closedOld = { ...oldE, status: 'transferred', end_date: dateStr, reason: args.p_reason }
      const fresh = {
        id: makeUuid('enr'),
        student_id: oldE.student_id,
        class_id: args.p_new_class,
        status: 'active',
        start_date: dateStr,
        end_date: null,
        transferred_from: oldE.id,
        fee_override: oldE.fee_override ?? null,
        discount_percent: oldE.discount_percent ?? 0,
        reason: args.p_reason,
        notes: null,
        created_at: new Date().toISOString(),
      }
      db.enrolments = [fresh, ...(db.enrolments ?? []).map((e) => (e.id === oldE.id ? closedOld : e))]
      appendDemoAudit(db, 'enrolments', 'update', oldE, closedOld)
      appendDemoAudit(db, 'enrolments', 'insert', null, fresh)
      saveDb(db)
      return { data: fresh, error: null }
    }

    case 'place_student': {
      if (!String(args.p_reason ?? '').trim()) return { data: null, error: { message: 'Please record the reason for this placement.' } }
      const cls = args.p_class ? (db.classes ?? []).find((c) => c.id === args.p_class) : null
      const place = {
        id: makeUuid('pl'),
        student_id: args.p_student,
        course_id: args.p_course ?? cls?.course_id ?? null,
        level_id: args.p_level,
        class_id: args.p_class ?? null,
        source: args.p_source ?? 'admin',
        reason: args.p_reason,
        decided_by: readDemoSession()?.profile.id ?? 'demo-admin-id',
        created_at: new Date().toISOString(),
      }
      db.placements = [place, ...(db.placements ?? [])]
      appendDemoAudit(db, 'placements', 'insert', null, place)
      saveDb(db)
      return { data: place, error: null }
    }

    case 'convert_enquiry': {
      const enq = (db.enquiries ?? []).find((e) => e.id === args.p_enquiry)
      if (!enq) return { data: null, error: { message: 'Enquiry not found.' } }
      if (enq.registration_id) return { data: null, error: { message: 'This enquiry has already been converted.' } }
      const email = String(args.p_email || enq.email || '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { data: null, error: { message: "Add the enquirer's email address to create a registration." } }
      }
      const courseId = args.p_course || enq.interested_course_id || null
      const course = courseId ? (db.courses ?? []).find((c) => c.id === courseId) : null
      const reg = {
        id: makeUuid('reg'),
        tracking_code: `TM${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        student_name: enq.name,
        email,
        phone: enq.phone ?? null,
        preferred_contact: enq.phone ? 'whatsapp' : 'email',
        course_id: courseId,
        language_id: enq.interested_language_id ?? course?.language_id ?? 'lang-en',
        status: 'pending',
        source: ['website', 'instagram', 'tiktok', 'whatsapp', 'facebook', 'referral', 'walk_in'].includes(enq.source) ? enq.source : 'other',
        enquiry_id: enq.id,
        consent_privacy: false,
        admin_notes: 'Created from enquiry. Confirm privacy consent with the student.',
        created_at: new Date().toISOString(),
      }
      db.registrations = [reg, ...(db.registrations ?? [])]
      db.enquiries = (db.enquiries ?? []).map((e) =>
        e.id === enq.id ? { ...e, status: 'converted', registration_id: reg.id, email: e.email || email } : e,
      )
      appendDemoAudit(db, 'registrations', 'insert', null, reg)
      saveDb(db)
      return { data: reg, error: null }
    }

    case 'anonymise_student': {
      if (!String(args.p_reason ?? '').trim()) return { data: null, error: { message: 'Please record the reason, for example the request date.' } }
      const stu = (db.students ?? []).find((s) => s.id === args.p_student)
      if (!stu) return { data: null, error: { message: 'Student not found.' } }
      if (String(stu.full_name ?? '').startsWith('Anonymised student')) {
        return { data: null, error: { message: 'This student is already anonymised.' } }
      }
      if ((db.enrolments ?? []).some((e) => e.student_id === stu.id && ['pending', 'waitlisted', 'active', 'suspended'].includes(e.status))) {
        return { data: null, error: { message: "End or withdraw this student's current enrolments first." } }
      }
      if ((db.bookings ?? []).some((b) => b.student_id === stu.id && ['requested', 'approved'].includes(b.status) && new Date(b.ends_at).getTime() > Date.now())) {
        return { data: null, error: { message: "Cancel this student's upcoming one-to-one lessons first." } }
      }
      const oldEmail = stu.email?.toLowerCase()
      const oldProfile = stu.profile_id
      const updatedStu = {
        ...stu,
        full_name: `Anonymised student ${stu.student_code}`,
        email: null,
        phone: null,
        date_of_birth: null,
        guardian_name: null,
        guardian_phone: null,
        learning_objectives: null,
        notes: null,
        profile_id: null,
        consent_marketing: false,
        consent_whatsapp: false,
        preferred_contact: 'email',
        status: 'archived',
        archived_at: stu.archived_at ?? new Date().toISOString(),
      }
      db.students = (db.students ?? []).map((s) => (s.id === stu.id ? updatedStu : s))
      db.registrations = (db.registrations ?? []).map((r) =>
        r.student_id === stu.id || (oldEmail && r.email?.toLowerCase() === oldEmail)
          ? { ...r, student_name: 'Anonymised', guardian_name: null, email: `removed+${r.id}@invalid`, phone: null, date_of_birth: null, objectives: null, additional_info: null, admin_notes: null }
          : r,
      )
      if (oldProfile) {
        db.profiles = (db.profiles ?? []).map((p) =>
          p.id === oldProfile && p.role === 'student' ? { ...p, full_name: 'Anonymised user', phone: null, status: 'deactivated', suspended_reason: 'Personal data erased on request' } : p,
        )
        db.notifications = (db.notifications ?? []).filter((n) => n.user_id !== oldProfile)
      }
      appendDemoAudit(db, 'students', 'update', stu, updatedStu)
      saveDb(db)
      return { data: updatedStu, error: null }
    }

    case 'export_my_data': {
      const session = readDemoSession()
      if (!session) return { data: null, error: { message: 'Please sign in to download your data.' } }
      const uid = session.profile.id
      const myStudents = (db.students ?? []).filter((s) => s.profile_id === uid)
      const stuIds = new Set(myStudents.map((s) => s.id))
      const bundle: Record<string, any> = {
        generated_at: new Date().toISOString(),
        about: 'A copy of the personal data Top Mind Enterprise holds about you. Financial records are kept for as long as the law requires.',
        account: (db.profiles ?? []).find((p) => p.id === uid) ?? session.profile,
        student_records: myStudents,
        enrolments: (db.enrolments ?? []).filter((e) => stuIds.has(e.student_id)),
        attendance: (db.attendance ?? []).filter((a) => stuIds.has(a.student_id)),
        bookings: (db.bookings ?? []).filter((b) => stuIds.has(b.student_id) || b.teacher_id === uid),
        invoices: (db.invoices ?? []).filter((i) => stuIds.has(i.student_id) && i.status !== 'draft'),
        payments: (db.payments ?? []).filter((p) => stuIds.has(p.student_id)),
        notifications: (db.notifications ?? []).filter((n) => n.user_id === uid),
        privacy_requests: (db.privacy_requests ?? []).filter((r) => r.profile_id === uid),
      }
      db.privacy_requests = [
        {
          id: makeUuid('priv'),
          kind: 'export',
          status: 'completed',
          profile_id: uid,
          student_id: myStudents[0]?.id ?? null,
          details: null,
          response: null,
          handled_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        ...(db.privacy_requests ?? []),
      ]
      saveDb(db)
      return { data: bundle, error: null }
    }

    case 'request_account_deletion': {
      const session = readDemoSession()
      if (!session) return { data: null, error: { message: 'Please sign in first.' } }
      const uid = session.profile.id
      if ((db.privacy_requests ?? []).some((r) => r.profile_id === uid && r.kind === 'deletion' && r.status === 'pending')) {
        return { data: null, error: { message: 'You already have a deletion request waiting for the academy.' } }
      }
      const stu = (db.students ?? []).find((s) => s.profile_id === uid)
      const reqRow = {
        id: makeUuid('priv'),
        kind: 'deletion',
        status: 'pending',
        profile_id: uid,
        student_id: stu?.id ?? null,
        details: args.p_reason ? String(args.p_reason).trim().slice(0, 2000) : null,
        response: null,
        handled_at: null,
        created_at: new Date().toISOString(),
      }
      db.privacy_requests = [reqRow, ...(db.privacy_requests ?? [])]
      db.notifications = [
        {
          id: makeUuid('notif'),
          user_id: 'demo-admin-id',
          title: 'Account deletion request',
          body: `${session.profile.full_name} requested personal data erasure.`,
          link: '/admin/accounts',
          read: false,
          created_at: new Date().toISOString(),
        },
        ...(db.notifications ?? []),
      ]
      saveDb(db)
      return { data: reqRow, error: null }
    }

    case 'cancel_privacy_request': {
      const session = readDemoSession()
      const uid = session?.profile.id
      const existing = (db.privacy_requests ?? []).find((r) => r.id === args.p_request && (!uid || r.profile_id === uid) && r.status === 'pending')
      if (!existing) return { data: null, error: { message: 'There is no open request to cancel.' } }
      const next = { ...existing, status: 'cancelled', handled_at: new Date().toISOString() }
      db.privacy_requests = (db.privacy_requests ?? []).map((r) => (r.id === existing.id ? next : r))
      saveDb(db)
      return { data: next, error: null }
    }

    case 'resolve_privacy_request': {
      if (!['completed', 'rejected'].includes(String(args.p_status))) return { data: null, error: { message: 'Choose completed or rejected.' } }
      if (args.p_status === 'rejected' && !String(args.p_response ?? '').trim()) {
        return { data: null, error: { message: 'Please explain why the request is refused.' } }
      }
      const existing = (db.privacy_requests ?? []).find((r) => r.id === args.p_request && r.status === 'pending')
      if (!existing) return { data: null, error: { message: 'This request is not open.' } }
      const next = {
        ...existing,
        status: args.p_status,
        response: args.p_response ? String(args.p_response).trim() : null,
        handled_by: readDemoSession()?.profile.id ?? 'demo-admin-id',
        handled_at: new Date().toISOString(),
      }
      db.privacy_requests = (db.privacy_requests ?? []).map((r) => (r.id === existing.id ? next : r))
      if (next.profile_id) {
        db.notifications = [
          {
            id: makeUuid('notif'),
            user_id: next.profile_id,
            title: 'Your personal data request',
            body: next.status === 'completed' ? 'Your request has been completed.' : `Your request was not completed: ${next.response}`,
            link: null,
            read: false,
            created_at: new Date().toISOString(),
          },
          ...(db.notifications ?? []),
        ]
      }
      saveDb(db)
      return { data: next, error: null }
    }

    case 'generate_monthly_checklist': {
      const month = `${String(args.p_month ?? `${monthStr()}-01`).slice(0, 7)}-01`
      const ym = month.slice(0, 7)
      const templates = [
        { category: 'students', title: 'Review pending registrations and enquiry leads', auto_key: 'registrations_reviewed', day: '05' },
        { category: 'attendance', title: 'Record attendance for all completed lessons', auto_key: 'attendance_recorded', day: '28' },
        { category: 'invoicing', title: 'Issue monthly tuition invoices', auto_key: 'invoices_issued', day: '03' },
        { category: 'payments', title: 'Review pending bank transfer slips', auto_key: 'payments_reviewed', day: '15' },
        { category: 'receipts', title: 'Confirm receipt issuance for all paid invoices', auto_key: 'receipts_generated', day: '25' },
        { category: 'teachers', title: 'Approve teacher salary statements', auto_key: 'salary_statements_approved', day: '04' },
        { category: 'materials', title: 'Ensure class slides and worksheets are published', auto_key: null, day: '10' },
        { category: 'reports', title: 'Review monthly operating summary report', auto_key: null, day: '28' },
      ]
      const existing = (db.checklists ?? []).filter((c) => c.month === month)
      let added = 0
      const created: any[] = []
      for (const tpl of templates) {
        const duplicate = existing.some((c) => (tpl.auto_key && c.auto_key === tpl.auto_key) || c.title === tpl.title)
        if (duplicate) continue
        created.push({
          id: makeUuid('chk'),
          month,
          category: tpl.category,
          title: tpl.title,
          due_date: `${ym}-${tpl.day}`,
          status: 'pending',
          auto_key: tpl.auto_key,
          auto_detail: null,
          assignee: 'demo-admin-id',
          completed_at: null,
          notes: null,
        })
        added++
      }
      if (added > 0) {
        db.checklists = [...(db.checklists ?? []), ...created]
        saveDb(db)
      }
      return { data: added, error: null }
    }

    case 'refresh_checklist': {
      const month = `${String(args.p_month ?? `${monthStr()}-01`).slice(0, 7)}-01`
      const ym = month.slice(0, 7)
      let updated = 0
      db.checklists = (db.checklists ?? []).map((item) => {
        if (item.month !== month || !item.auto_key) return item
        let nextStatus = item.status
        let detail = item.auto_detail
        switch (item.auto_key) {
          case 'registrations_reviewed': {
            const open = (db.registrations ?? []).filter((r) => ['pending', 'info_requested'].includes(r.status)).length
            nextStatus = open === 0 ? 'completed' : 'pending'
            detail = `${open} registration(s) waiting for review`
            break
          }
          case 'attendance_recorded':
          case 'attendance_complete': {
            const monthSessions = (db.sessions ?? []).filter((s) => String(s.session_date).startsWith(ym) && s.status !== 'cancelled')
            const unmarked = monthSessions.filter((s) => s.status === 'scheduled' && String(s.ends_at ?? s.session_date) < new Date().toISOString()).length
            if (!monthSessions.length) {
              nextStatus = 'not_applicable'
              detail = 'No lessons scheduled'
            } else {
              nextStatus = unmarked === 0 ? 'completed' : 'in_progress'
              detail = `${unmarked} of ${monthSessions.length} lessons need attendance`
            }
            break
          }
          case 'invoices_issued':
          case 'invoices_generated': {
            const count = (db.invoices ?? []).filter((i) => String(i.period).startsWith(ym) && i.status !== 'void').length
            nextStatus = count > 0 ? 'completed' : 'pending'
            detail = `${count} invoice(s) generated for this month`
            break
          }
          case 'payments_reviewed': {
            const pend = (db.payments ?? []).filter((p) => p.status === 'pending').length
            nextStatus = pend === 0 ? 'completed' : 'pending'
            detail = `${pend} payment(s) waiting for confirmation`
            break
          }
          case 'receipts_generated': {
            const confirmed = (db.payments ?? []).filter((p) => ['confirmed', 'refunded'].includes(p.status)).length
            const withRcp = (db.payments ?? []).filter((p) => ['confirmed', 'refunded'].includes(p.status) && p.receipt_no).length
            nextStatus = confirmed === 0 ? 'not_applicable' : withRcp === confirmed ? 'completed' : 'in_progress'
            detail = `${withRcp} of ${confirmed} payments have receipts`
            break
          }
          case 'salary_statements_approved': {
            const payouts = (db.teacher_payouts ?? []).filter((p) => p.period === month && p.status !== 'void')
            const drafts = payouts.filter((p) => p.status === 'draft').length
            nextStatus = payouts.length > 0 && drafts === 0 ? 'completed' : 'pending'
            detail = payouts.length ? `${drafts} of ${payouts.length} statements in draft` : 'No statements prepared yet'
            break
          }
          default:
            break
        }
        updated++
        return {
          ...item,
          status: nextStatus,
          auto_detail: detail,
          completed_at: nextStatus === 'completed' ? (item.completed_at ?? new Date().toISOString()) : null,
        }
      })
      saveDb(db)
      return { data: updated, error: null }
    }

    case 'publish_announcement': {
      const ann = (db.announcements ?? []).find((a) => a.id === args.p_id)
      if (!ann || ann.published_at) return { data: null, error: { message: 'Announcement not found or already published.' } }
      const nowIso = new Date().toISOString()
      const recipients = (db.profiles ?? []).filter((p) => {
        if (p.status !== 'active') return false
        if (ann.audience === 'everyone' || ann.audience === 'all') return true
        if (ann.audience === 'teachers') return ['teacher', 'admin'].includes(p.role)
        if (ann.audience === 'students') return p.role === 'student'
        if (ann.audience === 'class' && ann.class_id) {
          const cls = (db.classes ?? []).find((c) => c.id === ann.class_id)
          if (cls?.teacher_id === p.id) return true
          return (db.students ?? []).some(
            (s) => s.profile_id === p.id && (db.enrolments ?? []).some((e) => e.student_id === s.id && e.class_id === ann.class_id && e.status === 'active'),
          )
        }
        return false
      })
      db.announcements = (db.announcements ?? []).map((a) => (a.id === ann.id ? { ...a, published_at: nowIso } : a))
      for (const rec of recipients) {
        db.notifications = [
          {
            id: makeUuid('notif'),
            user_id: rec.id,
            title: ann.title,
            body: ann.body,
            link: null,
            read: false,
            created_at: nowIso,
          },
          ...(db.notifications ?? []),
        ]
        if (ann.send_email && rec.email) {
          db.message_outbox = [
            {
              id: makeUuid('mo'),
              channel: 'email',
              template_key: 'announcement',
              recipient: rec.email,
              recipient_name: rec.full_name,
              subject: ann.title,
              body: ann.body,
              status: 'queued',
              attempts: 0,
              last_error: null,
              related_type: 'announcement',
              related_id: ann.id,
              sent_at: null,
              created_at: nowIso,
            },
            ...(db.message_outbox ?? []),
          ]
        }
      }
      saveDb(db)
      return { data: recipients.length, error: null }
    }

    case 'retry_message': {
      const m = (db.message_outbox ?? []).find((x) => x.id === args.p_id && ['failed', 'skipped', 'cancelled'].includes(x.status))
      if (!m) return { data: null, error: { message: 'Only failed, skipped or cancelled messages can be retried.' } }
      const next = { ...m, status: 'queued', attempts: 0, last_error: null, next_attempt_at: new Date().toISOString() }
      db.message_outbox = (db.message_outbox ?? []).map((x) => (x.id === m.id ? next : x))
      saveDb(db)
      return { data: next, error: null }
    }

    case 'resend_message': {
      const m = (db.message_outbox ?? []).find((x) => x.id === args.p_id)
      if (!m) return { data: null, error: { message: 'Message not found.' } }
      const copy = {
        ...m,
        id: makeUuid('mo'),
        status: 'queued',
        attempts: 0,
        last_error: null,
        sent_at: null,
        created_at: new Date().toISOString(),
      }
      db.message_outbox = [copy, ...(db.message_outbox ?? [])]
      saveDb(db)
      return { data: copy.id, error: null }
    }

    case 'cancel_message': {
      const m = (db.message_outbox ?? []).find((x) => x.id === args.p_id && ['queued', 'failed'].includes(x.status))
      if (!m) return { data: null, error: { message: 'Only queued or failed messages can be cancelled.' } }
      db.message_outbox = (db.message_outbox ?? []).map((x) => (x.id === m.id ? { ...x, status: 'cancelled' } : x))
      saveDb(db)
      return { data: { ok: true }, error: null }
    }

    default:
      return { data: { ok: true }, error: null }
  }
}

export function executeMockFunction(name: string, body: Record<string, any> = {}): { data: any; error: { message: string } | null } {
  const db = loadDb()
  if (name === 'admin-users') {
    if (body.action === 'generate_link') {
      return { data: { link: appOriginUrl(`login?demo=teacher&uid=${body.user_id}`) }, error: null }
    }
    if (body.action === 'set_password') {
      const user = (db.profiles ?? []).find((p) => p.id === body.user_id)
      if (!user || user.role !== 'teacher') return { data: null, error: { message: 'Teacher account not found.' } }
      if (String(body.password ?? '').length < 8) return { data: null, error: { message: 'Password must be at least 8 characters.' } }
      db.demo_teacher_credentials = [...(db.demo_teacher_credentials ?? []).filter((r) => r.email !== user.email), { email: user.email, password: String(body.password) }]
      saveDb(db)
      return { data: { updated: true }, error: null }
    }
    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const fresh = {
        id: makeUuid('usr'),
        full_name: body.full_name ?? email,
        email,
        phone: null,
        role: body.role ?? 'teacher',
        status: 'active',
        suspended_reason: null,
        created_at: new Date().toISOString(),
      }
      if (!email || !email.includes('@')) return { data: null, error: { message: 'Enter a valid email address.' } }
      if ((db.profiles ?? []).some((p) => p.email?.toLowerCase() === email)) return { data: null, error: { message: 'This email already has a demo account.' } }
      db.profiles = [fresh, ...(db.profiles ?? [])]
      if (fresh.role === 'teacher') db.teacher_profiles = [{ profile_id: fresh.id, teacher_code: `T-DEMO-${String((db.teacher_profiles ?? []).length + 1).padStart(3, '0')}`, employment_status: 'active', employment_type: 'part_time' }, ...(db.teacher_profiles ?? [])]
      if (fresh.role === 'student' && body.student_id) {
        db.students = (db.students ?? []).map((s) => (s.id === body.student_id && !s.profile_id ? { ...s, profile_id: fresh.id } : s))
      }
      saveDb(db)
      return { data: { id: fresh.id, invited: true }, error: null }
    }
    if (['suspend', 'deactivate', 'reactivate'].includes(String(body.action))) {
      const status = body.action === 'reactivate' ? 'active' : body.action === 'suspend' ? 'suspended' : 'deactivated'
      db.profiles = (db.profiles ?? []).map((p) => (p.id === body.user_id ? { ...p, status } : p))
      saveDb(db)
      return { data: { status }, error: null }
    }
    return { data: { simulated: true }, error: null }
  }

  if (name === 'dispatch-messages') {
    if (body.mode === 'status') {
      return { data: { email: true, whatsapp: true, scheduled: true }, error: null }
    }
    const nowIso = new Date().toISOString()
    let sentCount = 0
    db.message_outbox = (db.message_outbox ?? []).map((m) => {
      if (m.status === 'queued') {
        sentCount++
        return { ...m, status: 'sent', sent_at: nowIso, attempts: Number(m.attempts ?? 0) + 1, next_attempt_at: null }
      }
      return m
    })
    saveDb(db)
    return { data: { sent: sentCount, failed: 0, demo: true }, error: null }
  }

  if (name.startsWith('social-webhook')) {
    if (name.includes('action=reply') && body.enquiry_id) {
      const nowIso = new Date().toISOString()
      db.enquiry_messages = [
        ...(db.enquiry_messages ?? []),
        {
          id: makeUuid('em'),
          enquiry_id: body.enquiry_id,
          direction: 'outbound',
          channel: 'instagram',
          body: String(body.text ?? ''),
          status: 'sent',
          created_at: nowIso,
        },
      ]
      db.enquiries = (db.enquiries ?? []).map((e) =>
        e.id === body.enquiry_id ? { ...e, status: 'responded', last_contacted_at: nowIso } : e,
      )
      saveDb(db)
      return { data: { sent: true }, error: null }
    }
    return { data: { ok: true }, error: null }
  }

  if (name === 'create-payment-link') {
    return { data: { url: appOriginUrl('student/invoices?payment=returned') }, error: null }
  }

  return { data: { ok: true }, error: null }
}

// ---------------------------------------------------------------------------
// Reactive Local Preview Stores (Workshops, Spotlights & Speaking Competition)
// ---------------------------------------------------------------------------
function useDemoCollection<T>(key: string): T[] {
  const [rows, setRows] = useState<T[]>(() => [...((loadDb()[key] as T[]) ?? [])])
  useEffect(() => {
    const refresh = () => setRows([...((loadDb()[key] as T[]) ?? [])])
    window.addEventListener('topmind-demo-update', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('topmind-demo-update', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [key])
  return rows
}

export function getTeacherWorkshops(teacherId?: string): TeacherWorkshop[] {
  const all = ((loadDb().teacher_workshops as TeacherWorkshop[]) ?? [])
  return teacherId ? all.filter((w) => w.teacher_id === teacherId) : all
}

export function useTeacherWorkshops(teacherId?: string): TeacherWorkshop[] {
  const all = useDemoCollection<TeacherWorkshop>('teacher_workshops')
  return teacherId ? all.filter((w) => w.teacher_id === teacherId) : all
}

export function addTeacherWorkshop(input: {
  teacher_id: string
  title: string
  date: string
  duration_minutes?: number
  attendees?: number
  amount: number
  notes?: string
}): TeacherWorkshop {
  const db = loadDb()
  const period = `${String(input.date).slice(0, 7)}-01`
  const row: TeacherWorkshop = {
    id: makeUuid('tw'),
    teacher_id: input.teacher_id,
    title: input.title.trim(),
    date: input.date,
    duration_minutes: Number(input.duration_minutes ?? 90),
    attendees: Number(input.attendees ?? 0),
    amount: Number(input.amount),
    period,
    status: 'completed',
    notes: input.notes?.trim() || null,
  }
  db.teacher_workshops = [row, ...(db.teacher_workshops ?? [])]
  saveDb(db)
  return row
}

export function removeTeacherWorkshop(id: string) {
  const db = loadDb()
  db.teacher_workshops = (db.teacher_workshops ?? []).filter((w) => w.id !== id)
  saveDb(db)
}

export function getStudentSpotlights(): StudentSpotlight[] {
  return ((loadDb().student_spotlights as StudentSpotlight[]) ?? [])
}

export function useStudentSpotlights(): StudentSpotlight[] {
  return useDemoCollection<StudentSpotlight>('student_spotlights')
}

export function nominateStudentSpotlight(input: {
  student_id?: string | null
  student_name: string
  language_level: string
  category: AwardCategory
  quote: string
  teacher_name?: string
  month_label: string
  featured_on_website: boolean
}): StudentSpotlight {
  const db = loadDb()
  const row: StudentSpotlight = {
    id: makeUuid('spot'),
    student_id: input.student_id ?? null,
    student_name: input.student_name.trim(),
    avatar_url: null,
    language_level: input.language_level.trim(),
    category: input.category,
    quote: input.quote.trim(),
    teacher_name: (input.teacher_name ?? 'Ms. Priya Shanmugam').trim() || 'Top Mind Faculty',
    month_label: input.month_label.trim() || 'November 2026',
    featured_on_website: input.featured_on_website,
    created_at: new Date().toISOString(),
  }
  db.student_spotlights = [row, ...(db.student_spotlights ?? [])]
  saveDb(db)
  return row
}

export function toggleSpotlightFeatured(id: string) {
  const db = loadDb()
  db.student_spotlights = (db.student_spotlights ?? []).map((s) =>
    s.id === id ? { ...s, featured_on_website: !s.featured_on_website } : s,
  )
  saveDb(db)
}

export function removeStudentSpotlight(id: string) {
  const db = loadDb()
  db.student_spotlights = (db.student_spotlights ?? []).filter((s) => s.id !== id)
  saveDb(db)
}

export function getCompetitionRegistrations(): CompetitionRegistration[] {
  return ((loadDb().speaking_competitions as CompetitionRegistration[]) ?? [])
}

export function useCompetitionRegistrations(): CompetitionRegistration[] {
  return useDemoCollection<CompetitionRegistration>('speaking_competitions')
}

export function createCompetitionRegistration(input: {
  full_name: string
  age: number
  category: CompetitionCategory
  language: CompetitionLanguage
  speech_topic: string
  audition_mode: 'Video Submission' | 'In-Person Audition'
  video_url?: string
  phone: string
  email: string
}): CompetitionRegistration {
  const db = loadDb()
  const code = `SPK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const row: CompetitionRegistration = {
    id: makeUuid('spk'),
    tracking_code: code,
    full_name: input.full_name.trim(),
    age: Number(input.age),
    category: input.category,
    language: input.language,
    speech_topic: input.speech_topic.trim(),
    audition_mode: input.audition_mode,
    video_url: input.video_url?.trim() || null,
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    status: 'Registered',
    notes: null,
    created_at: new Date().toISOString(),
  }
  db.speaking_competitions = [row, ...(db.speaking_competitions ?? [])]
  saveDb(db)
  return row
}

export function updateCompetitionRegistrationStatus(
  id: string,
  status: CompetitionStatus,
  notes?: string | null,
) {
  const db = loadDb()
  db.speaking_competitions = (db.speaking_competitions ?? []).map((r) =>
    r.id === id ? { ...r, status, notes: notes !== undefined ? notes : r.notes } : r,
  )
  saveDb(db)
}
