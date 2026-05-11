import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ApiTestPage from '@/pages/ApiTestPage'
import ModelTestPage from '@/pages/ModelTestPage'
import OcrPage from '@/pages/OcrPage'
import KeysPage from '@/pages/admin/KeysPage'
import UsersPage from '@/pages/admin/UsersPage'
import UsagePage from '@/pages/admin/UsagePage'
import DocsPage from '@/pages/DocsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    }
  }
})

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user, _hydrated } = useAuthStore()
  if (!_hydrated) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (adminOnly && !user?.is_admin) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { isAuthenticated, _hydrated } = useAuthStore()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={!_hydrated ? null : isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/tools/test" element={<ProtectedRoute><ApiTestPage /></ProtectedRoute>} />
          <Route path="/tools/models" element={<ProtectedRoute><ModelTestPage /></ProtectedRoute>} />
          <Route path="/tools/ocr" element={<ProtectedRoute><OcrPage /></ProtectedRoute>} />
          <Route path="/admin/keys" element={<ProtectedRoute adminOnly><KeysPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
          <Route path="/admin/usage" element={<ProtectedRoute adminOnly><UsagePage /></ProtectedRoute>} />
          <Route path="/docs" element={<ProtectedRoute><DocsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
