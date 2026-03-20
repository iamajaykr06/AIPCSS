import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ToastProvider } from '@/context/ToastContext'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute, PublicRoute } from '@/components/layout/ProtectedRoute'

// Pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DepartmentsPage } from '@/pages/DepartmentsPage'
import { ProgramsPage } from '@/pages/ProgramsPage'
import { BatchesPage } from '@/pages/BatchesPage'
import { TeachersPage } from '@/pages/TeachersPage'
import { CoursesPage } from '@/pages/CoursesPage'
import { RoomsPage } from '@/pages/RoomsPage'
import { WorkloadsPage } from '@/pages/WorkloadsPage'
import { TimetablePage } from '@/pages/TimetablePage'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/departments" element={<DepartmentsPage />} />
                  <Route path="/programs" element={<ProgramsPage />} />
                  <Route path="/batches" element={<BatchesPage />} />
                  <Route path="/teachers" element={<TeachersPage />} />
                  <Route path="/courses" element={<CoursesPage />} />
                  <Route path="/rooms" element={<RoomsPage />} />
                  <Route path="/workloads" element={<WorkloadsPage />} />
                  <Route path="/timetable" element={<TimetablePage />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastContainer />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
