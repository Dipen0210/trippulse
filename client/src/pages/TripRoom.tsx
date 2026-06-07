import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Calendar, Users, Map,
  Trash2, UserPlus, X, Copy, Check, Link2, Navigation, Crown, UserMinus, Loader2, Bell,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ItineraryTab from '../components/trip/ItineraryTab'
import MapTab from '../components/trip/MapTab'
import NotificationPanel, { notificationCount } from '../components/trip/NotificationPanel'
import { useAuth } from '../hooks/useAuth'
import { useTrips } from '../hooks/useTrips'
import { useTripData } from '../hooks/useTripData'
import { useStdb } from '../contexts/StdbContext'

type Tab = 'itinerary' | 'map'

function getTripDays(start: string, end: string): number {
  if (!start || !end) return 3
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.ceil(ms / 86400000) + 1)
}

function fmt(date: string) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TABS = [
  { key: 'itinerary' as Tab, label: 'Itinerary', Icon: Map },
  { key: 'map'       as Tab, label: 'Map',        Icon: MapPin },
]

export default function TripRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, signOut } = useAuth()
  const { identity, removeMember, liveLocations, updateLiveLocation } = useStdb()
  const { trips, deleteTrip } = useTrips(user!.name)
  const trip = trips.find(t => t.id === id)
  const isOwner = !!trip && !!identity && trip.owner === identity

  const [activeTab, setActiveTab] = useState<Tab>('itinerary')

  // Plan mode passed from the create flow (?mode=ai|manual). Consumed once.
  const rawMode = searchParams.get('mode')
  const [autoMode, setAutoMode] = useState<'ai' | 'manual' | null>(
    rawMode === 'ai' || rawMode === 'manual' ? rawMode : null,
  )
  useEffect(() => {
    if (rawMode) {
      // Strip the query param so a refresh doesn't re-trigger generation.
      searchParams.delete('mode')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Members panel
  const [showMembers, setShowMembers] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null)

  const memberNames = trip?.members.map(m => m.name) ?? []
  const { detail, ...actions } = useTripData(id!, memberNames)

  if (!trip) return <Navigate to="/dashboard" replace />

  const totalDays = getTripDays(trip.startDate, trip.endDate)

  const handleDelete = () => {
    deleteTrip(trip.id)
    navigate('/dashboard', { replace: true })
  }

  const handleRemoveMember = async (memberId: number) => {
    setRemovingId(memberId)
    try {
      await removeMember(memberId)
    } finally {
      setRemovingId(null)
      setConfirmRemoveId(null)
    }
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join/${trip.id}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-[#080810]">
      <Navbar user={user!} onLogout={signOut} />

      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        {/* ── Hero header ── */}
        <div className="relative rounded-2xl overflow-hidden mb-6 border border-white/[0.07] min-h-[180px]">
          <div className="absolute inset-0">
            <img
              src={trip.photo}
              alt={trip.destination}
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = `https://source.unsplash.com/featured/1200x400?${encodeURIComponent(trip.destination)},travel` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080810] via-[#080810]/85 to-[#080810]/50" />
          </div>

          <div className="relative z-10 p-6 md:p-8">
            {/* Top row: back + action buttons */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to trips
              </button>

              <div className="flex items-center gap-2">
                {/* Members / Invite */}
                <button
                  onClick={() => { setShowMembers(v => !v); setShowNotifications(false); setConfirmDelete(false) }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                    showMembers
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-white/[0.06] border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.1]'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Friends
                </button>

                {/* Notification bell */}
                <div className="relative">
                  <button
                    onClick={() => { setShowNotifications(v => !v); setShowMembers(false); setConfirmDelete(false) }}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                      showNotifications
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-white/[0.06] border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.1]'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    {notificationCount(actions.proposals, identity) > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {notificationCount(actions.proposals, identity)}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <NotificationPanel
                      proposals={actions.proposals}
                      myIdentity={identity}
                      trip={trip}
                      onVotePlace={actions.votePlace}
                      onRemoveVote={actions.removeVote}
                      onClose={() => setShowNotifications(false)}
                    />
                  )}
                </div>

                {/* Delete — owner only */}
                {isOwner && (confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-red-400 mr-1">Delete this trip?</span>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-medium cursor-pointer transition-all"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 glass border border-white/[0.08] text-gray-400 hover:text-white rounded-xl text-xs cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setConfirmDelete(true); setShowMembers(false) }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.06] hover:bg-red-500/15 border border-white/[0.08] hover:border-red-500/30 text-gray-400 hover:text-red-400 rounded-xl text-xs cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete trip
                  </button>
                ))}
              </div>
            </div>

            {/* Members panel */}
            {showMembers && (
              <div className="mb-5 p-4 bg-[#0f0f1a]/90 backdrop-blur-sm rounded-2xl border border-white/[0.08] max-w-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    Who's going · {trip.members.length}
                  </span>
                  <button onClick={() => setShowMembers(false)} className="text-gray-500 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Member list */}
                <div className="space-y-2 mb-4">
                  {trip.members.map((m, i) => {
                    const isYou = identity ? m.identity === identity : m.name === user!.name
                    const canRemove = isOwner && !m.isOwner && !isYou && m.memberId != null
                    return (
                      <div key={m.identity ?? i} className="flex items-center gap-2.5 group">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: m.color }}
                        >
                          {m.name[0].toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-200">{m.name}</span>
                        {m.isOwner && (
                          <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Crown className="w-2.5 h-2.5" /> Organizer
                          </span>
                        )}
                        {isYou && (
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">you</span>
                        )}

                        {canRemove && (
                          <div className="ml-auto">
                            {confirmRemoveId === m.memberId ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleRemoveMember(m.memberId!)}
                                  disabled={removingId === m.memberId}
                                  className="px-2 py-0.5 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-[10px] font-medium cursor-pointer transition-all inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                  {removingId === m.memberId
                                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    : 'Remove'}
                                </button>
                                <button
                                  onClick={() => setConfirmRemoveId(null)}
                                  className="px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 text-[10px] cursor-pointer transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(m.memberId!)}
                                title="Remove from trip"
                                className="ml-auto opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!isOwner && (
                  <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                    You have full editing access to this plan. Only the organizer can delete the trip.
                  </p>
                )}

                {/* Invite link */}
                <div className="border-t border-white/[0.06] pt-3">
                  <p className="text-[11px] text-gray-400 mb-1 font-medium flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-indigo-400" />
                    Invite link
                  </p>
                  <p className="text-[10px] text-gray-600 mb-2">Anyone with this link can join with full access</p>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-[11px] text-gray-500 truncate">
                      {window.location.origin}/join/{trip.id}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                        copied
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400'
                      }`}
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom: trip info + members */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3 ${
                  trip.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : trip.status === 'planning' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                  : 'bg-gray-500/15 text-gray-400 border border-gray-500/20'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                </div>

                <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{trip.name}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    {trip.origin ? (
                      <>{trip.origin} <span className="text-gray-600 mx-0.5">→</span> {trip.destination}, {trip.country}</>
                    ) : (
                      <>{trip.destination}, {trip.country}</>
                    )}
                  </span>
                  {trip.startDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {fmt(trip.startDate)} – {fmt(trip.endDate)} · {totalDays} day{totalDays !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Members avatars */}
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {trip.members.slice(0, 6).map((m, i) => (
                    <div
                      key={i}
                      title={m.name}
                      className="w-8 h-8 rounded-full border-2 border-[#080810] flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: m.color }}
                    >
                      {m.name[0].toUpperCase()}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowMembers(v => !v)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  {trip.members.length}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 p-1 glass rounded-xl mb-6 w-fit">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === key ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content — always mounted so state survives tab switches ── */}
        <div className={activeTab !== 'itinerary' ? 'hidden' : ''}>
          <ItineraryTab
            trip={trip}
            totalDays={totalDays}
            detail={detail}
            userName={user!.name}
            isOwner={isOwner}
            autoMode={autoMode}
            onAutoModeConsumed={() => setAutoMode(null)}
            proposals={actions.proposals}
            myIdentity={actions.myIdentity}
            onProposePlace={actions.proposePlace}
            onVotePlace={actions.votePlace}
            onRemoveVote={actions.removeVote}
            onRemoveProposal={actions.removeProposal}
            onClearProposals={actions.clearProposals}
            onAddPlace={actions.addPlace}
            onReplacePlaces={actions.replacePlaces}
            onRemovePlace={actions.removePlace}
            onToggleVisited={actions.toggleVisited}
          />
        </div>

        <div className={activeTab !== 'map' ? 'hidden' : ''}>
          <MapTab
            trip={trip}
            totalDays={totalDays}
            detail={detail}
            onToggleVisited={actions.toggleVisited}
            liveLocations={liveLocations.filter(l => l.trip_id === parseInt(trip.id))}
            myIdentity={identity}
            onUpdateLiveLocation={updateLiveLocation}
          />
        </div>
      </main>
    </div>
  )
}
