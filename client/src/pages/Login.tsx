import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plane, Zap, Users, Globe, ArrowRight, Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const FEATURES = [
  { icon: Zap,   label: 'Instant sync',      desc: 'Every change reflects in milliseconds for everyone' },
  { icon: Users, label: 'Real-time presence', desc: "See who's planning what, right now"                 },
  { icon: Globe, label: 'Group voting',        desc: 'Decide together, update for all simultaneously'    },
]

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    const result = await signIn(email, password)
    if (result.error) { setError(result.error); setLoading(false) }
    else navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#080810] flex overflow-hidden">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-center flex-1 px-16 relative">
        <div className="absolute top-24 left-16 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-24 right-0  w-96 h-96 bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">TripPulse</span>
          </div>

          <h1 className="text-5xl font-extrabold text-white leading-tight mb-5 tracking-tight">
            Plan trips together,
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              in real&nbsp;time.
            </span>
          </h1>

          <p className="text-gray-400 text-lg mb-12 leading-relaxed">
            Your whole group plans, votes, and navigates together —
            every change syncs instantly across all devices.
          </p>

          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="w-10 h-10 glass rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-16 right-16 flex items-center gap-3">
          <div className="flex -space-x-2">
            {['#6366f1','#ec4899','#f59e0b','#22c55e'].map(c => (
              <div key={c} className="w-7 h-7 rounded-full border-2 border-[#080810]" style={{ background: c }} />
            ))}
          </div>
          <span className="text-xs text-gray-500">Powered by SpacetimeDB — real-time shared state</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-8 lg:px-16 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/5 via-transparent to-purple-900/5 pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">TripPulse</span>
          </div>

          <div className="glass rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-gray-400 text-sm mb-7">Sign in to continue planning your trips</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/[0.06] transition-all text-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/[0.06] transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!email || !password || loading}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20 mt-2"
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </form>

            <p className="text-center text-gray-500 text-sm mt-6">
              Don't have an account?{' '}
              <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
