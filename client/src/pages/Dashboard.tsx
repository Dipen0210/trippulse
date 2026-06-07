import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Compass, Map, LayoutGrid, List, Sparkles, Link2, Loader2, X } from 'lucide-react'
import Navbar from '../components/Navbar'
import TripCard from '../components/TripCard'
import CreateTripModal from '../components/CreateTripModal'
import PlaceSearch from '../components/PlaceSearch'
import { useTrips } from '../hooks/useTrips'
import { useAuth } from '../hooks/useAuth'
import { useStdb } from '../contexts/StdbContext'
import type { PlaceResult } from '../types'

function getGreeting(name: string): string {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return `${greeting}, ${name} ✈️`
}

type Filter = 'all' | 'active' | 'planning' | 'completed'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { trips, createTrip } = useTrips(user!.name)
  const { identity, isConnected, isLoading, tripMembers, joinTripById } = useStdb()
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchedPlace, setSearchedPlace] = useState<PlaceResult | null>(null)

  // Join-by-invite-link
  const [showJoin, setShowJoin] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const handleJoin = async () => {
    const m = joinInput.trim().match(/(\d+)\s*$/)
    const tripId = m ? parseInt(m[1], 10) : NaN
    if (isNaN(tripId)) {
      setJoinError('Paste a valid invite link or trip ID.')
      return
    }
    setJoining(true)
    setJoinError('')
    try {
      await joinTripById(tripId)
      setJoining(false)
      setShowJoin(false)
      setJoinInput('')
      navigate(`/trip/${tripId}`)
    } catch (err) {
      setJoining(false)
      setJoinError(err instanceof Error ? err.message : 'Could not join this trip. Check the link.')
    }
  }

  const filtered = filter === 'all' ? trips : trips.filter(t => t.status === filter)

  const stats = {
    total:     trips.length,
    active:    trips.filter(t => t.status === 'active').length,
    places:    trips.reduce((a, t) => a + t.itemCount, 0),
    members:   [...new Set(trips.flatMap(t => t.members.map(m => m.name)))].length,
  }

  const handlePlaceSearchSelect = (place: PlaceResult) => {
    setSearchedPlace(place)
    setShowCreate(true)
  }

  return (
    <div className="min-h-screen bg-[#080810]">
      <Navbar user={user!} onLogout={signOut} />

      <main className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* ── STDB debug bar ── */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono flex items-center gap-3 text-gray-500">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-500' : isLoading ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span>{isConnected ? 'STDB connected' : isLoading ? 'Connecting…' : 'STDB disconnected'}</span>
          {identity && <span className="text-gray-600">id: {identity.slice(0, 12)}…</span>}
          <span className="text-gray-600">members in DB: {tripMembers.length}</span>
          <span className="text-gray-600">trips: {trips.length}</span>
        </div>

        {/* ── Hero ── */}
        <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-indigo-900/30 via-purple-900/20 to-transparent border border-white/[0.07] p-8 md:p-10">
          {/* Decoration blobs */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                {getGreeting(user!.name)}
              </h1>
              <p className="text-gray-400 text-sm">
                Ready for your next adventure? Your group is waiting.
              </p>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-5 mt-5">
                {[
                  { label: 'Trips', value: stats.total,   icon: Map },
                  { label: 'Active', value: stats.active,  icon: Compass },
                  { label: 'Places', value: stats.places,  icon: Sparkles },
                  { label: 'Members', value: stats.members, icon: null },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2">
                    {Icon && <Icon className="w-4 h-4 text-indigo-400" />}
                    <span className="text-xl font-bold text-white">{value}</span>
                    <span className="text-sm text-gray-500">{label}</span>
                    <div className="w-px h-4 bg-white/[0.08] last:hidden" />
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <button
                onClick={() => { setShowJoin(true); setJoinError('') }}
                className="flex items-center gap-2 px-4 py-3 glass border border-white/[0.1] text-gray-200 font-medium rounded-xl hover:border-indigo-500/40 hover:text-white transition-all cursor-pointer"
              >
                <Link2 className="w-4 h-4 text-indigo-400" />
                Join a trip
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New trip
              </button>
            </div>
          </div>
        </div>

        {/* ── Place search ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Explore destinations
          </p>
          <PlaceSearch
            onSelect={handlePlaceSearchSelect}
            placeholder="Search anywhere — Tokyo, Paris, Bali... (photos included)"
          />
        </div>

        {/* ── Searched place preview ── */}
        {searchedPlace && (
          <div className="mb-6 flex items-center gap-4 p-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 animate-fade-in">
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
              <img src={searchedPlace.photo} alt={searchedPlace.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white">{searchedPlace.name}</div>
              <div className="text-sm text-gray-400">{searchedPlace.country}</div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors cursor-pointer"
            >
              Plan a trip here →
            </button>
            <button onClick={() => setSearchedPlace(null)} className="text-gray-500 hover:text-white transition-colors text-lg leading-none cursor-pointer">
              ×
            </button>
          </div>
        )}

        {/* ── Trips section ── */}
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Your Trips</h2>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} trip{filtered.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter tabs */}
              <div className="flex items-center gap-1 p-1 glass rounded-xl">
                {(['all', 'active', 'planning', 'completed'] as Filter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                      filter === f ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex items-center gap-1 p-1 glass rounded-xl">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className={`grid gap-4 ${
            viewMode === 'grid'
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1'
          }`}>
            {/* New Trip card */}
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-indigo-500/50 transition-all duration-300 flex flex-col items-center justify-center gap-3 p-8 text-center group cursor-pointer hover:bg-indigo-500/5 min-h-[240px]"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 group-hover:bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center transition-all">
                <Plus className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                  Start new trip
                </div>
                <div className="text-xs text-gray-600 mt-1">Plan with your group in real time</div>
              </div>
            </button>

            {/* Trip cards */}
            {filtered.map(trip => (
              <div key={trip.id} className="animate-fade-in">
                <TripCard trip={trip} onClick={() => navigate(`/trip/${trip.id}`)} />
              </div>
            ))}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Compass className="w-12 h-12 text-gray-700 mb-4" />
              <p className="text-gray-400 font-medium">No trips yet</p>
              <p className="text-gray-600 text-sm mt-1">Create your first trip above</p>
            </div>
          )}
        </div>
      </main>

      {/* Join Trip Modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowJoin(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowJoin(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f1a] shadow-2xl shadow-black/60 animate-scale-in p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-semibold text-white">Join a trip</h2>
              </div>
              <button onClick={() => setShowJoin(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2 mb-4">
              Paste the invite link a friend shared with you. The whole trip plan imports into your dashboard with full editing access.
            </p>
            <input
              type="text"
              value={joinInput}
              onChange={e => setJoinInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="https://…/join/123  or  123"
              autoFocus
              className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/60 transition-all"
            />
            {joinError && (
              <div className="mt-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {joinError}
              </div>
            )}
            <button
              onClick={handleJoin}
              disabled={joining || !joinInput.trim()}
              className="mt-4 w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {joining ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</> : <>Go →</>}
            </button>
          </div>
        </div>
      )}

      {/* Create Trip Modal */}
      {showCreate && (
        <CreateTripModal
          onClose={() => { setShowCreate(false); setSearchedPlace(null) }}
          onCreate={async (name, dest, country, photo, startDate, endDate, mode) => {
            const newId = await createTrip(name, dest, country, photo, startDate, endDate)
            setSearchedPlace(null)
            if (newId) navigate(`/trip/${newId}?mode=${mode}`)
          }}
        />
      )}
    </div>
  )
}
