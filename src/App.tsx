import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { PostEditorPage } from '@/pages/PostEditorPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { BrandPage } from '@/pages/BrandPage'
import { SourcesPage } from '@/pages/SourcesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { RunsPage } from '@/pages/RunsPage'

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-[var(--muted)]">Loading session…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Protected />}>
              <Route element={<AppLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="posts/:id" element={<PostEditorPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="brand" element={<BrandPage />} />
                <Route path="sources" element={<SourcesPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="runs" element={<RunsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
