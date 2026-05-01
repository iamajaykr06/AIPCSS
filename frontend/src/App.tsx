/**
 * Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
import { SectionsPage } from '@/pages/SectionsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TeachersPage } from '@/pages/TeachersPage'
import { CoursesPage } from '@/pages/CoursesPage'
import { RoomsPage } from '@/pages/RoomsPage'
import { TimetablePage } from '@/pages/TimetablePage'
import { WorkloadPage } from '@/pages/WorkloadPage'

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
                  <Route path="/sections" element={<SectionsPage />} />
                  <Route path="/teachers" element={<TeachersPage />} />
                  <Route path="/courses" element={<CoursesPage />} />
                  <Route path="/rooms" element={<RoomsPage />} />
                  <Route path="/timetable" element={<TimetablePage />} />
                  <Route path="/workload" element={<WorkloadPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
