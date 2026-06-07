import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { StdbProvider } from './contexts/StdbContext'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import TripRoom from './pages/TripRoom'
import JoinTrip from './pages/JoinTrip'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function Public({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function Spinner() {
  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <StdbProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"     element={<Public><Login /></Public>} />
            <Route path="/signup"    element={<Public><SignUp /></Public>} />
            <Route path="/dashboard"  element={<Protected><Dashboard /></Protected>} />
            <Route path="/trip/:id"   element={<Protected><TripRoom /></Protected>} />
            <Route path="/join/:id"   element={<JoinTrip />} />
            <Route path="/"           element={<Navigate to="/dashboard" replace />} />
            <Route path="*"           element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </StdbProvider>
  )
}
