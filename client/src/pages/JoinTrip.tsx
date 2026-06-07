import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, Calendar, Users, Plane, Check, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStdb, type StdbTrip, type StdbTripMember } from '../contexts/StdbContext'
import { getOrCreateIdentity, querySQL } from '../lib/stdb'

function fmt(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getTripDays(start: string, end: string): number {
  if (!start || !end) return 0
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.ceil(ms / 86400000) + 1)
}

export default function JoinTrip() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, loading, signIn, signUp } = useAuth()
  const { joinTripById } = useStdb()

  const numId = id ? parseInt(id, 10) : NaN

  const [trip, setTrip] = useState<StdbTrip | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(true)

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [pendingJoin, setPendingJoin] = useState(false)
  const [joining, setJoining] = useState(false)

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Load a public preview of the trip from SpacetimeDB
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isNaN(numId)) { setLoadingPreview(false); return }
      try {
        const creds = await getOrCreateIdentity()
        const [tripRows, memberRows] = await Promise.all([
          querySQL<StdbTrip>(creds.token, `SELECT * FROM trip WHERE id = ${numId}`),
          querySQL<StdbTripMember>(creds.token, `SELECT * FROM trip_member WHERE trip_id = ${numId}`),
        ])
        if (cancelled) return
        setTrip(tripRows[0] ?? null)
        setMemberCount(memberRows.length)
        setAlreadyMember(memberRows.some(m => m.identity === creds.identity))
      } catch {
        /* leave trip null → not found state */
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    })()
    return () => { cancelled = true }
  }, [numId])

  const doJoin = async () => {
    if (isNaN(numId)) return
    setJoining(true)
    try {
      await joinTripById(numId)
      navigate(`/trip/${numId}`, { replace: true })
    } catch {
      setJoining(false)
      setAuthError('Could not join this trip. Please try again.')
    }
  }

  // After auth completes, join automatically
  useEffect(() => {
    if (pendingJoin && user) {
      setPendingJoin(false)
      doJoin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoin, user])

  const handleSignIn = async () => {
    setAuthError('')
    setAuthLoading(true)
    const { error } = await signIn(email, password)
    setAuthLoading(false)
    if (error) { setAuthError(error); return }
    setPendingJoin(true)
  }

  const handleSignUp = async () => {
    setAuthError('')
    setAuthLoading(true)
    const { error } = await signUp(name, email, password)
    setAuthLoading(false)
    if (error) { setAuthError(error); return }
    setPendingJoin(true)
  }

  if (loading || loadingPreview) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  const days = trip ? getTripDays(trip.start_date, trip.end_date) : 0

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Plane className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-white">TripPulse</span>
      </div>

      <div className="w-full max-w-md">
        {/* Trip not found */}
        {!trip && (
          <div className="text-center p-8 glass rounded-2xl border border-white/[0.07]">
            <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Trip not found</h2>
            <p className="text-gray-500 text-sm mb-6">
              This invite link may be invalid or expired. Ask the trip organizer to share a new link.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Go to dashboard
            </Link>
          </div>
        )}

        {/* Trip found */}
        {trip && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-gray-400 text-sm">You've been invited to join</p>
            </div>

            {/* Trip preview card */}
            <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="relative h-36">
                <img src={trip.photo} alt={trip.destination} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <h2 className="text-xl font-bold text-white">{trip.name}</h2>
                  <div className="flex items-center gap-1.5 text-gray-300 text-sm mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {trip.origin ? `${trip.origin} → ` : ''}{trip.destination}, {trip.country}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 px-4 py-3 border-t border-white/[0.05]">
                {trip.start_date && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    {fmt(trip.start_date)}{days > 0 ? ` · ${days} days` : ''}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  {memberCount} member{memberCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Logged in → one-click join */}
            {user ? (
              <div className="glass rounded-2xl border border-white/[0.08] p-5 text-center">
                {alreadyMember ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-emerald-400 mb-3">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">You're already in this trip</span>
                    </div>
                    <button
                      onClick={() => navigate(`/trip/${numId}`, { replace: true })}
                      className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl transition-all text-sm cursor-pointer"
                    >
                      Open trip →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm mb-1">Joining as</p>
                    <p className="text-white font-semibold mb-4">{user.name}</p>
                    <button
                      onClick={doJoin}
                      disabled={joining}
                      className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all text-sm cursor-pointer shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                    >
                      {joining ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</> : 'Join trip'}
                    </button>
                    {authError && <p className="text-red-400 text-xs mt-3">{authError}</p>}
                  </>
                )}
              </div>
            ) : (
              /* Not logged in → inline auth */
              <div className="glass rounded-2xl border border-white/[0.08] p-5">
                <p className="text-white font-semibold text-center mb-4">
                  {authMode === 'signup' ? 'Create an account to join' : 'Sign in to join'}
                </p>

                <div className="flex p-1 glass rounded-xl mb-4">
                  <button
                    onClick={() => { setAuthMode('signup'); setAuthError('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${authMode === 'signup' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Create account
                  </button>
                  <button
                    onClick={() => { setAuthMode('signin'); setAuthError('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${authMode === 'signin' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Sign in
                  </button>
                </div>

                <div className="space-y-3">
                  {authMode === 'signup' && (
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                    />
                  )}
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (authMode === 'signup' ? handleSignUp() : handleSignIn())}
                    placeholder="Password"
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                  />

                  {authError && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {authError}
                    </p>
                  )}

                  <button
                    onClick={authMode === 'signup' ? handleSignUp : handleSignIn}
                    disabled={authLoading || !email || !password || (authMode === 'signup' && !name)}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-all text-sm cursor-pointer shadow-lg shadow-indigo-500/20"
                  >
                    {authLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {authMode === 'signup' ? 'Creating account...' : 'Signing in...'}
                      </span>
                    ) : (
                      authMode === 'signup' ? 'Create account & join trip' : 'Sign in & join trip'
                    )}
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-600">
              You'll get full editing access — just like Google Docs.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
