import { Plane, LogOut, Bell } from 'lucide-react'
import type { AuthUser } from '../hooks/useAuth'

interface NavbarProps {
  user: AuthUser
  onLogout: () => void
}

export default function Navbar({ user, onLogout }: NavbarProps) {
  const initials = user.name.slice(0, 2).toUpperCase()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/[0.06] bg-[#080810]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Plane className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">TripPulse</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Live</span>
          </div>

          {/* Notifications */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-xl glass glass-hover transition-all cursor-pointer">
            <Bell className="w-4 h-4 text-gray-400" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
          </button>

          {/* User avatar + name */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {initials}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-200">{user.name}</span>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-9 h-9 flex items-center justify-center rounded-xl glass glass-hover transition-all cursor-pointer text-gray-400 hover:text-white"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  )
}
