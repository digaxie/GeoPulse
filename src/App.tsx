import { AppErrorBoundary } from '@/app/AppErrorBoundary'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AppRouter } from '@/routes/AppRouter'

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
