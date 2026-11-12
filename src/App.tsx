import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { SettingsProvider } from './lib/settings'
import { PortalLayout } from './components/PortalLayout'
import { Loading } from './components/ui'
import PublicLayout from './pages/public/Layout'
import Home from './pages/public/Home'

const lazyNamed = <T extends Record<string, any>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

// Public site
const About = lazyNamed(() => import('./pages/public/Info'), 'About')
const Approach = lazyNamed(() => import('./pages/public/Info'), 'Approach')
const OneToOne = lazyNamed(() => import('./pages/public/Info'), 'OneToOne')
const Privacy = lazyNamed(() => import('./pages/public/Info'), 'Privacy')
const Terms = lazyNamed(() => import('./pages/public/Info'), 'Terms')
const Classes = lazyNamed(() => import('./pages/public/Catalogue'), 'Classes')
const PublicFreeClasses = lazy(() => import('./pages/public/FreeClasses'))
const SpeakingCompetition = lazy(() => import('./pages/public/SpeakingCompetition'))
const LanguagesIndex = lazyNamed(() => import('./pages/public/Catalogue'), 'LanguagesIndex')
const LanguagePage = lazyNamed(() => import('./pages/public/Catalogue'), 'LanguagePage')
const ProgrammePage = lazyNamed(() => import('./pages/public/Catalogue'), 'ProgrammePage')
const Contact = lazy(() => import('./pages/public/Contact'))
const Register = lazy(() => import('./pages/public/Register'))
const Assessment = lazy(() => import('./pages/public/Assessment'))
const Track = lazy(() => import('./pages/public/Track'))
const Login = lazyNamed(() => import('./pages/public/Auth'), 'Login')
const Signup = lazyNamed(() => import('./pages/public/Auth'), 'Signup')
const Forgot = lazyNamed(() => import('./pages/public/Auth'), 'Forgot')
const Reset = lazyNamed(() => import('./pages/public/Auth'), 'Reset')

// Shared portal pages
const Materials = lazy(() => import('./pages/shared/Materials'))
const Notifications = lazy(() => import('./pages/shared/Notifications'))

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const Students = lazyNamed(() => import('./pages/admin/Students'), 'Students')
const StudentDetail = lazyNamed(() => import('./pages/admin/Students'), 'StudentDetail')
const Registrations = lazy(() => import('./pages/admin/Registrations'))
const Enquiries = lazy(() => import('./pages/admin/Enquiries'))
const Teachers = lazyNamed(() => import('./pages/admin/Teachers'), 'Teachers')
const TeacherDetail = lazyNamed(() => import('./pages/admin/Teachers'), 'TeacherDetail')
const Accounts = lazy(() => import('./pages/admin/Accounts'))
const AdminClasses = lazyNamed(() => import('./pages/admin/Classes'), 'Classes')
const AdminFreeClasses = lazy(() => import('./pages/admin/FreeClasses'))
const ClassDetail = lazyNamed(() => import('./pages/admin/Classes'), 'ClassDetail')
const Catalog = lazy(() => import('./pages/admin/Catalog'))
const Assessments = lazy(() => import('./pages/admin/Assessments'))
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'))
const AdminBookings = lazy(() => import('./pages/admin/Bookings'))
const Invoices = lazy(() => import('./pages/admin/Invoices'))
const Payments = lazy(() => import('./pages/admin/Payments'))
const Receipts = lazy(() => import('./pages/admin/Receipts'))
const Salaries = lazy(() => import('./pages/admin/Salaries'))
const Expenses = lazy(() => import('./pages/admin/Expenses'))
const NotificationCentre = lazy(() => import('./pages/admin/NotificationCentre'))
const Automations = lazy(() => import('./pages/admin/Automations'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const Checklist = lazy(() => import('./pages/admin/Checklist'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const Progress = lazy(() => import('./pages/shared/Progress'))

// Teacher
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'))
const TeacherClasses = lazy(() => import('./pages/teacher/Classes'))
const TeacherStudents = lazy(() => import('./pages/teacher/Students'))
const TeacherAttendance = lazy(() => import('./pages/teacher/Attendance'))
const TeacherSchedule = lazy(() => import('./pages/teacher/Schedule'))
const TeacherBookings = lazy(() => import('./pages/teacher/Bookings'))
const TeacherSalary = lazy(() => import('./pages/teacher/Salary'))
const TeacherProfile = lazy(() => import('./pages/teacher/Profile'))

// Student
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'))
const StudentProfile = lazy(() => import('./pages/student/Profile'))
const StudentClasses = lazy(() => import('./pages/student/Classes'))
const StudentSchedule = lazy(() => import('./pages/student/Schedule'))
const StudentAttendance = lazy(() => import('./pages/student/Attendance'))
const StudentInvoices = lazy(() => import('./pages/student/Invoices'))
const StudentPayments = lazy(() => import('./pages/student/Payments'))
const StudentReceipts = lazy(() => import('./pages/student/Receipts'))
const StudentBook = lazy(() => import('./pages/student/Book'))

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/classes" element={<Classes />} />
                <Route path="/free-classes" element={<PublicFreeClasses />} />
                <Route path="/speaking-competition" element={<SpeakingCompetition />} />
                <Route path="/languages" element={<LanguagesIndex />} />
                <Route path="/languages/:slug" element={<LanguagePage />} />
                <Route path="/programmes/:slug" element={<ProgrammePage />} />
                <Route path="/one-to-one" element={<OneToOne />} />
                <Route path="/approach" element={<Approach />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/register" element={<Register />} />
                <Route path="/assessment/:token" element={<Assessment />} />
                <Route path="/track" element={<Track />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/courses" element={<Navigate to="/classes" replace />} />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot" element={<Forgot />} />
              <Route path="/reset" element={<Reset />} />

              <Route path="/admin" element={<PortalLayout role="admin" />}>
                <Route index element={<AdminDashboard />} />
                <Route path="students" element={<Students />} />
                <Route path="students/:id" element={<StudentDetail />} />
                <Route path="registrations" element={<Registrations />} />
                <Route path="enquiries" element={<Enquiries />} />
                <Route path="teachers" element={<Teachers />} />
                <Route path="teachers/:id" element={<TeacherDetail />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="classes" element={<AdminClasses />} />
                <Route path="classes/:id" element={<ClassDetail />} />
                <Route path="free-classes" element={<AdminFreeClasses />} />
                <Route path="languages" element={<Catalog />} />
                <Route path="assessments" element={<Assessments />} />
                <Route path="attendance" element={<AdminAttendance />} />
                <Route path="bookings" element={<AdminBookings />} />
                <Route path="materials" element={<Materials />} />
                <Route path="progress" element={<Progress />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="payments" element={<Payments />} />
                <Route path="receipts" element={<Receipts />} />
                <Route path="salaries" element={<Salaries />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="notifications" element={<NotificationCentre />} />
                <Route path="automations" element={<Automations />} />
                <Route path="settings" element={<Settings />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="checklist" element={<Checklist />} />
                <Route path="reports" element={<Reports />} />
              </Route>

              <Route path="/teacher" element={<PortalLayout role="teacher" />}>
                <Route index element={<TeacherDashboard />} />
                <Route path="classes" element={<TeacherClasses />} />
                <Route path="students" element={<TeacherStudents />} />
                <Route path="attendance" element={<TeacherAttendance />} />
                <Route path="schedule" element={<TeacherSchedule />} />
                <Route path="bookings" element={<TeacherBookings />} />
                <Route path="materials" element={<Materials />} />
                <Route path="progress" element={<Progress />} />
                <Route path="salary" element={<TeacherSalary />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<TeacherProfile />} />
              </Route>

              <Route path="/student" element={<PortalLayout role="student" />}>
                <Route index element={<StudentDashboard />} />
                <Route path="profile" element={<StudentProfile />} />
                <Route path="classes" element={<StudentClasses />} />
                <Route path="schedule" element={<StudentSchedule />} />
                <Route path="attendance" element={<StudentAttendance />} />
                <Route path="materials" element={<Materials />} />
                <Route path="progress" element={<Progress />} />
                <Route path="invoices" element={<StudentInvoices />} />
                <Route path="payments" element={<StudentPayments />} />
                <Route path="receipts" element={<StudentReceipts />} />
                <Route path="book" element={<StudentBook />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  )
}
