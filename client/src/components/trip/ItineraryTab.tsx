import { useState, useEffect, useRef } from 'react'
import {
  Plus, Sparkles, CheckCircle, Circle, Trash2, MapPin, X, Loader, Clock, Ticket,
  ExternalLink, Lightbulb, ArrowDown, AlertTriangle, Plane, Train, Bus, Car, Ship,
  Navigation, ArrowLeftRight, RefreshCw, ThumbsUp, ThumbsDown,
  Users, Vote, Trophy, Lock,
} from 'lucide-react'
import PlacePicker, { type PickedPlace } from '../PlacePicker'
import { generateItinerary, generateFromSelectedPlaces, suggestDayAdditions, addNewPlacesToExistingPlan } from '../../services/aiService'
import type { AIPlaceChange, AIStop, AIDay, SelectedPlaceInput } from '../../services/aiService'
import type { Trip, TripDetail, PlaceItem, PlaceCategory, TripArrival } from '../../types'
import type { TripProposal, ProposeInput } from '../../hooks/useTripData'

import type { TravelMode } from '../../types'

type IconComp = React.ComponentType<{ className?: string }>
const TRAVEL_MODE_CONFIG: Record<TravelMode, { icon: IconComp; label: string; color: string }> = {
  flight:  { icon: Plane,       label: 'Flight',   color: 'text-sky-400' },
  train:   { icon: Train,       label: 'Train',    color: 'text-emerald-400' },
  bus:     { icon: Bus,         label: 'Bus',      color: 'text-amber-400' },
  drive:   { icon: Car,         label: 'Drive',    color: 'text-indigo-400' },
  ferry:   { icon: Ship,        label: 'Ferry',    color: 'text-cyan-400' },
  transit: { icon: Navigation,  label: 'Transit',  color: 'text-purple-400' },
}

const CATEGORY_CONFIG: Record<PlaceCategory, { label: string; emoji: string; color: string }> = {
  attraction: { label: 'Attraction', emoji: '🏛️', color: 'bg-indigo-500/10 text-indigo-400' },
  restaurant:  { label: 'Restaurant', emoji: '🍽️', color: 'bg-amber-500/10 text-amber-400' },
  hotel:       { label: 'Hotel',      emoji: '🏨', color: 'bg-purple-500/10 text-purple-400' },
  activity:    { label: 'Activity',   emoji: '🎯', color: 'bg-emerald-500/10 text-emerald-400' },
  other:       { label: 'Other',      emoji: '📍', color: 'bg-gray-500/10 text-gray-400' },
}

const PLACE_CATEGORY_BG: Record<PlaceCategory, string> = {
  attraction: 'from-indigo-900/60 to-indigo-800/30',
  restaurant:  'from-amber-900/60 to-amber-800/30',
  hotel:       'from-cyan-900/60 to-cyan-800/30',
  activity:    'from-emerald-900/60 to-emerald-800/30',
  other:       'from-gray-800/60 to-gray-700/30',
}

// How long the group has to vote on an AI recommendation before it auto-resolves.
const VOTE_WINDOW_MS = 5 * 60 * 1000

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function getDayLabel(trip: Trip, day: number): string {
  if (!trip.startDate) return `Day ${day}`
  const d = new Date(trip.startDate)
  d.setDate(d.getDate() + day - 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  trip: Trip
  totalDays: number
  detail: TripDetail
  userName: string
  isOwner: boolean
  autoMode?: 'ai' | 'manual' | null
  onAutoModeConsumed?: () => void
  proposals: TripProposal[]
  myIdentity: string | null
  onProposePlace: (p: ProposeInput) => Promise<void>
  onVotePlace: (proposalId: number, vote: boolean) => Promise<void>
  onRemoveVote: (proposalId: number) => Promise<void>
  onRemoveProposal: (proposalId: number) => Promise<void>
  onClearProposals: () => Promise<void>
  onAddPlace: (p: Omit<PlaceItem, 'id'>) => void
  onReplacePlaces: (places: Omit<PlaceItem, 'id'>[], extras?: { aiTips?: string[]; dayTitles?: TripDetail['dayTitles']; arrival?: TripArrival }) => void
  onRemovePlace: (id: string) => void
  onToggleVisited: (id: string) => void
}

export default function ItineraryTab({
  trip, totalDays, detail, userName, isOwner,
  autoMode, onAutoModeConsumed,
  proposals, myIdentity,
  onProposePlace, onVotePlace, onRemoveVote, onRemoveProposal, onClearProposals,
  onAddPlace, onReplacePlaces, onRemovePlace, onToggleVisited,
}: Props) {
  const [selectedView, setSelectedView] = useState<'main' | number>('main')
  const selectedDay = typeof selectedView === 'number' ? selectedView : 1

  // AI itinerary generation state
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [showTips, setShowTips] = useState(true)
  const [placeChanges, setPlaceChanges] = useState<AIPlaceChange[]>([])
  const [showChanges, setShowChanges] = useState(true)

  // Per-day AI gap-fill recommendations (posted to the group as neutral votes)
  const [suggestingDay, setSuggestingDay] = useState<number | null>(null)
  const [suggestError, setSuggestError] = useState('')

  // Ticking clock — drives the per-recommendation countdown + deadline resolution.
  const [now, setNow] = useState(() => Date.now())

  // True once the user picks the pure-AI path — hides the group-vote UI
  const [aiModeSelected, setAiModeSelected] = useState(false)

  const hasPlan = detail.places.length > 0
  const dayPlaces = detail.places.filter(p => p.day === selectedDay)
  const totalPlaces = detail.places.length
  const visitedCount = detail.places.filter(p => p.visited).length

  // ── Group proposals / voting helpers ──────────────────────────────────────
  const proposedNames = new Set(proposals.map(p => p.name.toLowerCase().trim()))
  const isProposed = (name: string) => proposedNames.has(name.toLowerCase().trim())

  const memberFor = (id: string) => trip.members.find(m => m.identity === id)
  const memberLabel = (id: string) => memberFor(id)?.name ?? id.slice(0, 8)
  const memberColor = (id: string) => memberFor(id)?.color ?? '#6b7280'

  // Common pool = day 0 proposals (no day assigned). Before a plan exists,
  // every proposal is a candidate regardless of day.
  const groupPicks = hasPlan ? proposals.filter(p => p.day === 0) : proposals
  const dayProposals = (day: number) => proposals.filter(p => p.day === day && day > 0)

  const winningCount = proposals.filter(p => p.status === 'winning').length
  const tieCount = proposals.filter(p => p.status === 'tie').length

  // Add a searched place to the common pool: proposes it (the proposer is
  // auto-upvoted on the server, so adding == upvoting).
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const addAndPropose = (place: PickedPlace) => {
    if (isProposed(place.name)) return
    onProposePlace({
      name: place.name,
      address: place.address,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
      day: 0,
      source: 'search',
    }).catch(() => {})
    setJustAdded(place.name)
    setTimeout(() => setJustAdded(curr => (curr === place.name ? null : curr)), 2500)
  }

  // ── AI generation ──────────────────────────────────────────────────────────
  const aiItineraryToPlaces = (days: { day: number; title: string; summary: string; warning?: string; stops: AIStop[] }[]) => {
    const places: Omit<PlaceItem, 'id'>[] = []
    const dayTitles: NonNullable<TripDetail['dayTitles']> = {}
    days.forEach(d => {
      dayTitles[d.day] = { title: d.title, summary: d.summary, warning: d.warning }
      d.stops.forEach(s => {
        places.push({
          name: s.name,
          address: s.address || trip.destination,
          photo: '',
          lat: s.lat,
          lng: s.lng,
          category: s.category,
          addedBy: 'AI',
          day: d.day,
          notes: '',
          visited: false,
          time: s.time,
          duration: s.duration,
          tip: s.tip,
          isFree: s.isFree,
          cost: s.cost,
          rating: s.rating,
          reviewCount: s.reviewCount,
          bookingNote: s.bookingNote,
          bookingUrl: s.bookingUrl,
          transportToNext: s.transportToNext,
        })
      })
    })
    return { places, dayTitles }
  }

  const runGenerate = async () => {
    setAiModeSelected(true)
    setConfirmReplace(false)
    setGenerating(true)
    setAiError('')
    try {
      const itinerary = await generateItinerary({
        destination: trip.destination,
        country: trip.country,
        origin: trip.origin,
        originLat: trip.originLat,
        originLng: trip.originLng,
        totalDays,
        startDate: trip.startDate,
        pace: detail.preferences.pace,
        budgetLevel: detail.preferences.budgetLevel,
        interests: detail.preferences.interests,
        transportModes: detail.preferences.transportModes,
      })
      const { places, dayTitles } = aiItineraryToPlaces(itinerary.days)
      onReplacePlaces(places, { aiTips: itinerary.tips, dayTitles, arrival: itinerary.arrival })
      setSelectedView(1)
      setShowTips(true)
      // Both generation paths converge to the same post-plan state: clear any
      // leftover pre-plan group picks so the downstream flow is identical.
      onClearProposals().catch(() => {})
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to generate itinerary.')
    } finally {
      setGenerating(false)
    }
  }

  const runGenerateFromPlaces = async () => {
    setGenerating(true)
    setAiError('')
    setConfirmReplace(false)
    setPlaceChanges([])
    try {
      const winners: SelectedPlaceInput[] = proposals
        .filter(p => p.status === 'winning')
        .map(p => ({ name: p.name, category: p.category, address: p.address, lat: p.lat, lng: p.lng }))

      let itinerary

      if (hasPlan && winners.length > 0) {
        // Build AIDay[] from the current plan so the AI gets the full existing structure.
        const existingDays: AIDay[] = Array.from({ length: totalDays }, (_, i) => {
          const day = i + 1
          const meta = detail.dayTitles?.[day]
          const stops = detail.places
            .filter(p => p.day === day)
            .map(p => ({
              name: p.name,
              category: p.category,
              address: p.address,
              lat: p.lat,
              lng: p.lng,
              time: p.time ?? '',
              duration: p.duration ?? '',
              tip: p.tip ?? '',
              isFree: p.isFree ?? false,
              cost: p.cost,
              rating: p.rating,
              reviewCount: p.reviewCount,
              bookingNote: p.bookingNote,
              bookingUrl: p.bookingUrl,
              transportToNext: p.transportToNext,
            }))
          return {
            day,
            title: meta?.title ?? `Day ${day}`,
            summary: meta?.summary ?? '',
            warning: meta?.warning,
            stops,
          }
        })

        itinerary = await addNewPlacesToExistingPlan({
          destination: trip.destination,
          country: trip.country,
          totalDays,
          startDate: trip.startDate,
          pace: detail.preferences.pace,
          budgetLevel: detail.preferences.budgetLevel,
          interests: detail.preferences.interests,
          transportModes: detail.preferences.transportModes,
          existingDays,
          newPlaces: winners,
        })
      } else {
        // No existing plan yet — build from group votes from scratch.
        const seen = new Set<string>()
        const dedupe = (s: SelectedPlaceInput) => {
          const k = s.name.toLowerCase().trim()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }
        const selectedPlaces: SelectedPlaceInput[] = proposals
          .filter(p => p.status === 'winning')
          .map(p => ({ name: p.name, category: p.category, address: p.address, lat: p.lat, lng: p.lng }))
          .filter(dedupe)
        const candidatePlaces: SelectedPlaceInput[] = proposals
          .filter(p => p.status === 'tie')
          .map(p => ({ name: p.name, category: p.category, address: p.address, lat: p.lat, lng: p.lng }))
          .filter(dedupe)

        itinerary = await generateFromSelectedPlaces({
          destination: trip.destination,
          country: trip.country,
          origin: trip.origin,
          originLat: trip.originLat,
          originLng: trip.originLng,
          totalDays,
          startDate: trip.startDate,
          pace: detail.preferences.pace,
          budgetLevel: detail.preferences.budgetLevel,
          interests: detail.preferences.interests,
          transportModes: detail.preferences.transportModes,
          selectedPlaces,
          candidatePlaces,
        })
      }

      const { places, dayTitles } = aiItineraryToPlaces(itinerary.days)
      onReplacePlaces(places, { aiTips: itinerary.tips, dayTitles, arrival: itinerary.arrival })
      if (itinerary.changes && itinerary.changes.length > 0) {
        setPlaceChanges(itinerary.changes)
        setShowChanges(true)
      }
      setSelectedView(1)
      setShowTips(true)
      onClearProposals().catch(() => {})
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to generate itinerary.')
    } finally {
      setGenerating(false)
    }
  }

  // Owner-only: generate the final plan from the group's winning picks.
  const onGenerate = () => {
    if (!isOwner) return
    if (hasPlan) { setConfirmReplace(true); return }
    if (winningCount > 0 || tieCount > 0) runGenerateFromPlaces()
    else runGenerate()
  }

  const generateLabel = generating
    ? 'Planning…'
    : hasPlan
      ? 'Regenerate plan'
      : (winningCount > 0 || tieCount > 0)
        ? `Generate plan · ${winningCount} pick${winningCount !== 1 ? 's' : ''}`
        : 'AI plan my trip'

  // ── Handle plan mode passed from the create flow ──────────────────────────
  const autoHandled = useRef(false)
  useEffect(() => {
    if (!autoMode || autoHandled.current) return
    autoHandled.current = true
    if (autoMode === 'ai') {
      if (detail.places.length === 0 && isOwner) runGenerate()
    } else if (autoMode === 'manual') {
      // search is always visible in the main panel
    }
    onAutoModeConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode])

  const dayMeta = detail.dayTitles?.[selectedDay]

  // ── Per-day AI gap-fill recommendations ───────────────────────────────────
  const loadDaySuggestions = async () => {
    setSuggestingDay(selectedDay)
    setSuggestError('')
    try {
      const list = await suggestDayAdditions({
        destination: trip.destination,
        country: trip.country,
        day: selectedDay,
        dayTitle: dayMeta?.title,
        existingPlaces: dayPlaces.map(p => ({ name: p.name, category: p.category })),
        interests: detail.preferences.interests,
        budgetLevel: detail.preferences.budgetLevel,
        count: 4,
      })
      const planNames = new Set(detail.places.map(p => p.name.toLowerCase().trim()))
      const toPropose = list.filter(
        s => s.name && !planNames.has(s.name.toLowerCase().trim()) && !isProposed(s.name),
      )
      await Promise.all(
        toPropose.map(s =>
          onProposePlace({
            name: s.name,
            address: s.address || trip.destination,
            category: s.category,
            lat: s.lat,
            lng: s.lng,
            day: selectedDay,
            tip: s.tip,
            isFree: s.isFree,
            cost: s.cost,
            rating: s.rating,
            reviewCount: s.reviewCount,
            source: 'ai',
            autoVote: false,
          }).catch(() => {}),
        ),
      )
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : 'Failed to load suggestions.')
    } finally {
      setSuggestingDay(null)
    }
  }

  // Tick every second while there are day-scoped recommendations being voted on,
  // so the countdown updates and the deadline resolution fires on time.
  const hasPendingTimers = proposals.some(p => p.day > 0)
  useEffect(() => {
    if (!hasPendingTimers) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasPendingTimers])

  // Auto-resolve day-scoped recommendations. The organizer's client is the single
  // authority that writes the result so votes never double-apply:
  //   • during the 5-min window: a clear majority Yes → added; majority No → removed.
  //   • when the window expires: whoever leads wins (Yes added, otherwise removed);
  //     a tie drops the place.
  const memberCount = Math.max(1, trip.members.length)
  const committingRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!isOwner) return
    proposals.forEach(p => {
      if (p.day <= 0) return
      if (committingRef.current.has(p.id)) return
      const yes = p.yesVoters.length
      const no = p.noVoters.length
      const majorityYes = yes > no && yes * 2 > memberCount
      const majorityNo = no > yes && no * 2 > memberCount
      const expired = now >= p.createdAt + VOTE_WINDOW_MS

      let decision: 'add' | 'remove' | null = null
      if (majorityYes) decision = 'add'
      else if (majorityNo) decision = 'remove'
      else if (expired) decision = yes > no ? 'add' : 'remove'
      if (!decision) return

      committingRef.current.add(p.id)
      if (decision === 'add') {
        onAddPlace({
          name: p.name,
          address: p.address || trip.destination,
          photo: '',
          lat: p.lat,
          lng: p.lng,
          category: p.category,
          addedBy: 'Group vote',
          day: p.day,
          notes: '',
          visited: false,
          tip: p.tip,
          isFree: p.isFree,
          cost: p.cost,
          rating: p.rating,
          reviewCount: p.reviewCount,
        })
      }
      onRemoveProposal(p.id).catch(() => committingRef.current.delete(p.id))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, isOwner, memberCount, now])

  const arrival = detail.arrival
  const mapsUrl = arrival
    ? `https://www.google.com/maps/dir/${encodeURIComponent(arrival.from)}/${encodeURIComponent(arrival.to)}/`
    : null

  const statusBadge = (status: TripProposal['status']) =>
    status === 'winning'
      ? { label: 'Winning', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: Trophy }
      : status === 'rejected'
        ? { label: 'Rejected', cls: 'bg-red-500/15 text-red-300 border-red-500/30', Icon: ThumbsDown }
        : { label: 'Tie', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: ArrowLeftRight }

  // ── Reusable proposal (vote) card ──────────────────────────────────────────
  const renderProposalCard = (p: TripProposal, deadline?: number) => {
    const cfg = CATEGORY_CONFIG[p.category]
    const sb = statusBadge(p.status)
    const StatusIcon = sb.Icon
    const canRemove = p.proposedBy === myIdentity || isOwner
    const remaining = deadline != null ? deadline - now : null
    return (
      <div key={p.id} className="p-3 rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex-shrink-0 bg-gradient-to-br ${PLACE_CATEGORY_BG[p.category]} flex items-center justify-center text-lg`}>
            {cfg.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-white">{p.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.emoji} {cfg.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${sb.cls}`}>
                <StatusIcon className="w-2.5 h-2.5" /> {sb.label}
              </span>
              {remaining != null && (
                remaining > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/[0.12] bg-white/[0.04] text-gray-300 inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-2.5 h-2.5" /> {fmtCountdown(remaining)}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 inline-flex items-center gap-1">
                    <Loader className="w-2.5 h-2.5 animate-spin" /> Deciding…
                  </span>
                )
              )}
            </div>
            {p.address && <p className="text-[11px] text-gray-500 truncate mt-0.5">{p.address}</p>}
            {p.rating != null && (
              <span className="text-[11px] text-amber-300 font-medium">★ {p.rating.toFixed(1)}{p.reviewCount ? <span className="text-gray-600"> ({p.reviewCount})</span> : null}</span>
            )}
          </div>
          {canRemove && (
            <button
              onClick={() => onRemoveProposal(p.id).catch(() => {})}
              title="Remove from the poll"
              className="text-gray-600 hover:text-red-400 cursor-pointer transition-colors flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Vote controls */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => (p.myVote === true ? onRemoveVote(p.id) : onVotePlace(p.id, true)).catch(() => {})}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              p.myVote === true
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.08] hover:text-emerald-300 hover:border-emerald-500/30'
            }`}
          >
            <ThumbsUp className="w-3 h-3" /> Yes · {p.yesVoters.length}
          </button>
          <button
            onClick={() => (p.myVote === false ? onRemoveVote(p.id) : onVotePlace(p.id, false)).catch(() => {})}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              p.myVote === false
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.08] hover:text-red-300 hover:border-red-500/30'
            }`}
          >
            <ThumbsDown className="w-3 h-3" /> No · {p.noVoters.length}
          </button>
        </div>

        {/* Who voted what */}
        {(p.yesVoters.length > 0 || p.noVoters.length > 0) && (
          <div className="flex flex-col gap-1.5 mt-2.5">
            {p.yesVoters.length > 0 && (
              <div className="flex items-center gap-2">
                <ThumbsUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {p.yesVoters.map(id => (
                    <span key={id} className="flex items-center gap-1 text-[10px] text-gray-300 bg-white/[0.04] rounded-full pr-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: memberColor(id) }}>
                        {memberLabel(id)[0]?.toUpperCase()}
                      </span>
                      {id === myIdentity ? 'You' : memberLabel(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.noVoters.length > 0 && (
              <div className="flex items-center gap-2">
                <ThumbsDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {p.noVoters.map(id => (
                    <span key={id} className="flex items-center gap-1 text-[10px] text-gray-300 bg-white/[0.04] rounded-full pr-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: memberColor(id) }}>
                        {memberLabel(id)[0]?.toUpperCase()}
                      </span>
                      {id === myIdentity ? 'You' : memberLabel(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
    {/* ── Getting There card ── */}
    {arrival && arrival.options.length > 0 && (
      <div className="p-4 glass rounded-2xl border border-white/[0.07]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Getting There</span>
            <span className="text-xs text-gray-500">
              {arrival.from} → {arrival.to}
              {arrival.distanceKm ? ` · ~${Math.round(arrival.distanceKm).toLocaleString()} km` : ''}
            </span>
          </div>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Google Maps
            </a>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {arrival.options.map((opt, i) => {
            const cfg = TRAVEL_MODE_CONFIG[opt.mode]
            const Icon = cfg.icon
            return (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  opt.recommended
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'bg-white/[0.02] border-white/[0.06]'
                }`}
              >
                <div className={`p-1.5 rounded-lg bg-white/[0.05] flex-shrink-0 ${cfg.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs font-medium text-white">{opt.duration}</span>
                    {opt.recommended && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                        Best
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{opt.detail}</p>
                  {opt.cost && (
                    <p className="text-[10px] text-amber-300/80 mt-0.5">{opt.cost}</p>
                  )}
                  {opt.bookingUrl && (
                    <a
                      href={opt.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Book tickets
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )}


    {/* Status banners */}
    {confirmReplace && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
        <p className="text-sm text-amber-300">
          This will rebuild your itinerary ({detail.places.length} place{detail.places.length !== 1 ? 's' : ''}{winningCount > 0 ? ` + ${winningCount} new winning pick${winningCount !== 1 ? 's' : ''}` : ''}) into a fresh AI-optimized plan.
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={runGenerateFromPlaces} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer transition-all">
            Rebuild &amp; generate
          </button>
          <button onClick={() => setConfirmReplace(false)} className="px-3 py-1.5 glass border border-white/[0.08] text-gray-400 hover:text-white rounded-lg text-xs cursor-pointer transition-all">
            Cancel
          </button>
        </div>
      </div>
    )}

    {generating && (
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-sm">
        <Loader className="w-4 h-4 animate-spin flex-shrink-0" />
        Designing an optimized {totalDays}-day plan for {trip.destination} — clustering nearby places &amp; routing transport…
      </div>
    )}

    {aiError && !generating && (
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-300 text-sm">
        <span>{aiError}</span>
        <button onClick={() => setAiError('')} className="text-red-400 hover:text-red-200 cursor-pointer flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    )}

    {detail.aiTips && detail.aiTips.length > 0 && showTips && (
      <div className="p-4 glass rounded-2xl border border-indigo-500/20">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            Trip tips — book ahead &amp; getting around
          </span>
          <button onClick={() => setShowTips(false)} className="text-gray-500 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-1.5">
          {detail.aiTips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0">▹</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {placeChanges.length > 0 && showChanges && (
      <div className="p-4 glass rounded-2xl border border-amber-500/25">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-amber-400" />
            AI moved {placeChanges.length} place{placeChanges.length !== 1 ? 's' : ''} to different days
          </span>
          <button onClick={() => setShowChanges(false)} className="text-gray-500 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {placeChanges.map((change, i) => (
            <li key={i} className="flex items-start gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                <span className="px-2 py-0.5 rounded-md bg-gray-700/60 text-gray-400 font-medium tabular-nums">Day {change.originalDay}</span>
                <ArrowLeftRight className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 font-medium tabular-nums">Day {change.newDay}</span>
              </div>
              <div className="min-w-0">
                <span className="font-medium text-white">{change.placeName}</span>
                {change.reason && <p className="text-gray-500 mt-0.5 leading-snug">{change.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className="flex gap-6">
      {/* Sidebar — always visible */}
      <div className="flex-shrink-0 flex flex-col gap-2">
        {/* MAIN button */}
        <button
          onClick={() => setSelectedView('main')}
          className={`w-[72px] rounded-xl flex flex-col items-center justify-center py-2.5 cursor-pointer transition-all border ${
            selectedView === 'main'
              ? 'bg-indigo-500 border-indigo-400 text-white'
              : 'glass border-white/[0.07] text-gray-400 hover:text-white hover:border-white/20'
          }`}
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1 uppercase tracking-wide opacity-80">Add</span>
          {groupPicks.length > 0 && (
            <span className={`text-[10px] mt-1 px-1.5 py-0.5 rounded-full ${selectedView === 'main' ? 'bg-white/20' : 'bg-indigo-500/20 text-indigo-400'}`}>
              {groupPicks.length}
            </span>
          )}
        </button>

        {/* Day buttons */}
        {hasPlan && Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
          const dayPlacesAll = detail.places.filter(p => p.day === day)
          const count = dayPlacesAll.length
          const active = selectedView === day
          const dateLabel = getDayLabel(trip, day)
          return (
            <div key={day} className="relative group">
              <button
                onClick={() => setSelectedView(day)}
                className={`w-[72px] rounded-xl flex flex-col items-center justify-center py-2.5 cursor-pointer transition-all border ${
                  active
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'glass border-white/[0.07] text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Day</span>
                <span className="text-2xl font-bold leading-none mt-0.5">{day}</span>
                {count > 0 && (
                  <span className={`text-[10px] mt-1 px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    {count}
                  </span>
                )}
              </button>
              <div className="absolute left-full top-0 ml-2 w-52 bg-[#0f0f1a] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 p-3 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="text-xs font-semibold text-white mb-0.5">{dateLabel}</div>
                <div className="text-[10px] text-indigo-400 mb-2">Day {day} · {count} stop{count !== 1 ? 's' : ''}</div>
                {dayPlacesAll.length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic">No places added yet</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayPlacesAll.map((p, idx) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-600 w-3 flex-shrink-0">{idx + 1}.</span>
                        <span className={`text-[11px] truncate ${p.visited ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{p.name}</span>
                        {p.visited && <span className="text-[9px] text-emerald-500 flex-shrink-0">✓</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">

        {/* ════════ MAIN VIEW: search + vote + generate ════════ */}
        {selectedView === 'main' && (
          <div className="space-y-4">
            {/* Header */}
            <div>
              {hasPlan ? (
                <>
                  <h2 className="text-lg font-semibold text-white">{trip.destination}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{totalPlaces} stops · {visitedCount} visited</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white">Plan {trip.destination} together</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Search and add places, vote together, then generate an AI-optimized day-by-day plan.
                  </p>
                </>
              )}
            </div>

            {/* Search */}
            <div className="relative z-20">
              <p className="text-[11px] text-gray-500 mb-2">
                Search any place — the AI will fit it into the best day when the plan is (re)generated.
              </p>
              <PlacePicker
                onSelect={addAndPropose}
                placeholder={`Search a place or address in ${trip.destination}…`}
              />
              {justAdded && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Added "{justAdded}" to the group vote.
                </div>
              )}
            </div>

            {/* Group picks / voting */}
            <div className="p-4 glass rounded-2xl border border-amber-500/25">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Vote className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Group picks</span>
                  {groupPicks.length > 0 && (
                    <span className="text-[11px] text-gray-500">
                      {winningCount} winning · {tieCount} tie · {groupPicks.length} total
                    </span>
                  )}
                </div>
                {groupPicks.length > 0 && (
                  <button onClick={() => onClearProposals().catch(() => {})} className="text-[11px] text-gray-500 hover:text-red-400 cursor-pointer transition-colors">
                    Clear all
                  </button>
                )}
              </div>

              {groupPicks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Users className="w-9 h-9 text-gray-700 mb-3" />
                  <p className="text-gray-400 font-medium">No places added yet</p>
                  <p className="text-gray-600 text-sm mt-1 max-w-sm">
                    Search above to add places. Everyone on the trip can vote yes or no.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {groupPicks.map(p => renderProposalCard(p))}
                </div>
              )}
            </div>

            {/* Action button */}
            {isOwner ? (
              hasPlan ? (
                <button
                  onClick={runGenerateFromPlaces}
                  disabled={generating || (winningCount === 0 && groupPicks.length === 0)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                >
                  {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating
                    ? 'Updating plan…'
                    : winningCount > 0
                      ? `Add ${winningCount} place${winningCount !== 1 ? 's' : ''} to existing plan`
                      : 'Add to existing plan'}
                </button>
              ) : (
                <button
                  onClick={onGenerate}
                  disabled={generating || (winningCount === 0 && tieCount === 0)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                >
                  {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating
                    ? 'Generating…'
                    : `Generate plan — ${winningCount} winner${winningCount !== 1 ? 's' : ''}${tieCount > 0 ? ` + ${tieCount} for AI to decide` : ''}`}
                </button>
              )
            ) : (
              <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-gray-500 text-xs">
                <Lock className="w-3.5 h-3.5" />
                {hasPlan ? 'Only the organizer can update the plan.' : 'Keep voting — only the organizer can generate the final plan.'}
              </div>
            )}
          </div>
        )}

        {/* ════════ DAY VIEW: itinerary ════════ */}
        {typeof selectedView === 'number' && (
          <>
            {/* Day title */}
            <div className="mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-white">
                  {dayMeta?.title ?? getDayLabel(trip, selectedDay)}
                </h2>
                {dayMeta && (
                  <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    {getDayLabel(trip, selectedDay)}
                  </span>
                )}
              </div>
              {dayMeta?.summary && (
                <p className="text-xs text-gray-400 mt-1 max-w-xl">{dayMeta.summary}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">
                {dayPlaces.length} stops · {totalPlaces} total · {visitedCount} visited
              </p>
            </div>

            {/* Per-day warning */}
            {dayMeta?.warning && (
              <div className="mb-4 flex items-start gap-2.5 px-4 py-3 bg-amber-500/[0.08] border border-amber-500/25 rounded-xl">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80 leading-relaxed">{dayMeta.warning}</p>
              </div>
            )}

        {/* ════════ POST-PLAN: day itinerary ════════ */}
        {hasPlan && (
          <>
            {dayPlaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 glass rounded-2xl border border-dashed border-white/[0.08] text-center">
                <MapPin className="w-10 h-10 text-gray-700 mb-3" />
                <p className="text-gray-400 font-medium">Nothing planned for Day {selectedDay}</p>
                <p className="text-gray-600 text-sm mt-1">Search for a place in the panel above to add it.</p>
              </div>
            ) : (
              <div className="space-y-0">
                {dayPlaces.map((place, idx) => {
                  const cfg = CATEGORY_CONFIG[place.category]
                  const hop = place.transportToNext
                  const isLast = idx === dayPlaces.length - 1
                  return (
                    <div key={place.id}>
                      <div className={`flex gap-3 p-3.5 glass rounded-2xl border border-white/[0.05] transition-all ${place.visited ? 'opacity-50' : 'hover:border-white/10'}`}>
                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-14 pt-0.5">
                          <span className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center text-xs text-gray-500 font-medium">
                            {idx + 1}
                          </span>
                          {place.time && (
                            <span className="text-[10px] text-indigo-300 font-medium text-center leading-tight flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {place.time}
                            </span>
                          )}
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex-shrink-0 bg-gradient-to-br ${PLACE_CATEGORY_BG[place.category]} flex items-center justify-center text-xl`}>
                          {CATEGORY_CONFIG[place.category].emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`font-medium text-sm ${place.visited ? 'text-gray-500 line-through' : 'text-white'}`}>{place.name}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.emoji} {cfg.label}</span>
                            {place.isFree && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Free</span>
                            )}
                            {!place.isFree && place.cost && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">{place.cost}</span>
                            )}
                            {place.duration && <span className="text-[10px] text-gray-500">· {place.duration}</span>}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{place.address}</p>
                          {place.rating && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-amber-400 text-[11px]">★</span>
                              <span className="text-[11px] text-amber-300 font-medium">{place.rating.toFixed(1)}</span>
                              {place.reviewCount && <span className="text-[10px] text-gray-600">({place.reviewCount})</span>}
                            </div>
                          )}
                          {place.tip && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{place.tip}</p>}
                          {(place.bookingNote || place.bookingUrl) && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {place.bookingNote && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                  <Ticket className="w-2.5 h-2.5" />
                                  {place.bookingNote}
                                </span>
                              )}
                              {place.bookingUrl && (
                                <a href={place.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2 py-0.5 rounded-full cursor-pointer transition-all">
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  Book now
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
                          <button onClick={() => onToggleVisited(place.id)} title={place.visited ? 'Mark unvisited' : 'Mark visited'} className="cursor-pointer transition-colors">
                            {place.visited
                              ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                              : <Circle className="w-5 h-5 text-gray-600 hover:text-emerald-400" />
                            }
                          </button>
                          <button onClick={() => onRemovePlace(place.id)} className="text-gray-600 hover:text-red-400 cursor-pointer transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {!isLast && (
                        hop ? (
                          <div className="flex items-center gap-2 pl-7 py-1.5 text-[11px] text-gray-400">
                            <ArrowDown className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                            <span className="font-medium text-indigo-300">{hop.mode}</span>
                            {hop.distance && <><span className="text-gray-600">·</span><span>{hop.distance}</span></>}
                            {hop.duration && <><span className="text-gray-600">·</span><span>{hop.duration}</span></>}
                            {hop.detail && <span className="text-gray-500 truncate hidden sm:inline">— {hop.detail}</span>}
                          </div>
                        ) : (
                          <div className="flex items-center pl-7 py-1">
                            <ArrowDown className="w-3 h-3 text-gray-700" />
                          </div>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {dayPlaces.length > 0 && (
              <div className="mt-3 flex gap-4 text-xs text-gray-600">
                <span>{dayPlaces.filter(p => p.visited).length}/{dayPlaces.length} visited</span>
                <span>·</span>
                <span>
                  {Object.entries(CATEGORY_CONFIG)
                    .map(([cat, cfg]) => {
                      const n = dayPlaces.filter(p => p.category === cat).length
                      return n > 0 ? `${n} ${cfg.label.toLowerCase()}` : null
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            )}

            {/* ── Recommended for this day — vote yes/no (auto add/remove) ── */}
            <div className="mt-6 p-4 glass rounded-2xl border border-amber-500/25">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Recommended for Day {selectedDay}</span>
                  <span className="text-[11px] text-gray-500">vote yes/no — winners join the plan &amp; map, losers drop off</span>
                </div>
                <button
                  onClick={loadDaySuggestions}
                  disabled={suggestingDay === selectedDay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 disabled:opacity-60 disabled:cursor-wait"
                >
                  {suggestingDay === selectedDay
                    ? <><Loader className="w-3 h-3 animate-spin" /> Finding…</>
                    : dayProposals(selectedDay).length > 0
                      ? <><RefreshCw className="w-3 h-3" /> More suggestions</>
                      : <><Sparkles className="w-3 h-3" /> Suggest places</>
                  }
                </button>
              </div>

              {suggestError && suggestingDay !== selectedDay && (
                <div className="mt-3 flex items-start justify-between gap-3 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-xl text-red-300 text-xs">
                  <span>{suggestError}</span>
                  <button onClick={() => setSuggestError('')} className="text-red-400 hover:text-red-200 cursor-pointer flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" />
                {memberCount > 1
                  ? 'Each pick has a 5-min vote. A clear majority decides instantly; when time runs out whoever leads wins (a tie drops it).'
                  : 'Your vote decides: Yes adds it to the plan, No drops it. Undecided picks resolve when the 5-min timer ends.'}
              </p>

              {suggestingDay === selectedDay && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.05] p-3 animate-pulse">
                      <div className="h-3 bg-white/[0.05] rounded w-2/3 mb-2" />
                      <div className="h-2.5 bg-white/[0.03] rounded w-1/2 mb-3" />
                      <div className="h-2.5 bg-white/[0.03] rounded w-full" />
                    </div>
                  ))}
                </div>
              )}

              {dayProposals(selectedDay).length > 0 ? (
                <div className="space-y-2.5 mt-3">
                  {dayProposals(selectedDay).map(p => renderProposalCard(p, p.createdAt + VOTE_WINDOW_MS))}
                </div>
              ) : suggestingDay !== selectedDay && (
                <p className="text-xs text-gray-500 mt-3">
                  {dayPlaces.length === 0
                    ? `Tap "Suggest places" — the AI proposes top-rated things to do and eat for Day ${selectedDay} and the group votes them in or out.`
                    : `Tap "Suggest places" for more highly-rated activities and restaurants to round out Day ${selectedDay}.`}
                </p>
              )}
            </div>
          </>
        )}
          </>
        )}
      </div>
    </div>


</div>
  )
}
