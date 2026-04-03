import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppShellFallback } from '@/components/layout/AppShellFallback'
import { useAuth } from '@/features/auth/useAuth'
import { routerBaseName } from '@/lib/paths'

const DashboardPage = lazy(async () => {
  const module = await import('@/routes/DashboardPage')
  return { default: module.DashboardPage }
})

const HubPage = lazy(async () => {
  const module = await import('@/routes/HubPage')
  return { default: module.HubPage }
})

const AdminPage = lazy(async () => {
  const module = await import('@/routes/AdminPage')
  return { default: module.AdminPage }
})

const LoginPage = lazy(async () => {
  const module = await import('@/routes/LoginPage')
  return { default: module.LoginPage }
})

const ScenarioPage = lazy(async () => {
  const module = await import('@/routes/ScenarioPage')
  return { default: module.ScenarioPage }
})

const PresenterPage = lazy(async () => {
  const module = await import('@/routes/PresenterPage')
  return { default: module.PresenterPage }
})

const ViewerPage = lazy(async () => {
  const module = await import('@/routes/ViewerPage')
  return { default: module.ViewerPage }
})

const TvPage = lazy(async () => {
  const module = await import('@/routes/TvPage')
  return { default: module.TvPage }
})

const NotFoundPage = lazy(async () => {
  const module = await import('@/routes/NotFoundPage')
  return { default: module.NotFoundPage }
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AppShellFallback />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <AppShellFallback />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (session.role !== 'admin') {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

export function AppRouter() {
  return (
    <BrowserRouter basename={routerBaseName}>
      <Suspense fallback={<AppShellFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <HubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/tv"
            element={
              <ProtectedRoute>
                <TvPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/scenarios"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scenario/:scenarioId"
            element={
              <ProtectedRoute>
                <ScenarioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/present/:scenarioId"
            element={
              <ProtectedRoute>
                <PresenterPage />
              </ProtectedRoute>
            }
          />
          <Route path="/view/:viewerSlug" element={<ViewerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
