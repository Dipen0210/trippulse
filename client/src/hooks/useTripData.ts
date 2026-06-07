import { useCallback, useMemo } from 'react'
import { useStdb, type AddItemParams, type ProposePlaceParams } from '../contexts/StdbContext'
import type { TripDetail, PlaceItem, PlaceCategory, TransportLeg, Expense, TripArrival } from '../types'

export type ProposalStatus = 'winning' | 'rejected' | 'tie'

export interface TripProposal {
  id: number
  day: number
  name: string
  address: string
  category: PlaceCategory
  lat?: number
  lng?: number
  tip?: string
  isFree: boolean
  cost?: string
  rating?: number
  reviewCount?: string
  source: string
  proposedBy: string
  createdAt: number
  yesVoters: string[]
  noVoters: string[]
  myVote: boolean | null
  status: ProposalStatus
}

export interface ProposeInput {
  name: string
  address: string
  category: PlaceCategory
  lat?: number
  lng?: number
  day: number
  tip?: string
  isFree?: boolean
  cost?: string
  rating?: number
  reviewCount?: string
  source: string
  /** Whether the proposer auto-upvotes. true = search-and-add, false = AI recommendation. */
  autoVote?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPlaceCategory(cat: string): PlaceCategory {
  const valid: PlaceCategory[] = ['attraction', 'restaurant', 'hotel', 'activity', 'other']
  return (valid.includes(cat as PlaceCategory) ? cat : 'other') as PlaceCategory
}

function defaultDetail(tripId: string): TripDetail {
  return {
    tripId,
    places: [],
    transport: [],
    expenses: [],
    budget: 0,
    currency: 'USD',
    preferences: {
      transportModes: ['flight'],
      budgetLevel: 'mid-range',
      pace: 'moderate',
      interests: [],
    },
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTripData(tripId: string, _memberNames: string[]) {
  const stdb = useStdb()
  const numericTripId = parseInt(tripId, 10)

  // Build TripDetail from StdbContext data
  const detail: TripDetail = useMemo(() => {
    if (isNaN(numericTripId)) return defaultDetail(tripId)

    const items = stdb.itineraryItems.filter(i => i.trip_id === numericTripId)
    const metas = stdb.dayMetas.filter(d => d.trip_id === numericTripId)
    const ai = stdb.aiContents[numericTripId]

    const places: PlaceItem[] = items.map(item => ({
      id: item.id.toString(),
      name: item.place_name,
      address: item.address,
      photo: '',
      lat: item.lat,
      lng: item.lng,
      category: toPlaceCategory(item.category),
      addedBy: item.added_by,
      day: item.day,
      notes: item.notes,
      visited: item.visited,
      time: item.suggested_time || undefined,
      duration: item.duration_str || undefined,
      tip: item.tip || undefined,
      isFree: item.is_free,
      cost: item.cost || undefined,
      rating: item.rating || undefined,
      reviewCount: item.review_count || undefined,
      bookingNote: item.booking_note || undefined,
      bookingUrl: item.booking_url || undefined,
      transportToNext: item.transport_mode ? {
        mode: item.transport_mode,
        distance: item.transport_distance,
        duration: item.transport_duration,
        detail: item.transport_detail || undefined,
      } : undefined,
    }))

    // Sort by day then position
    places.sort((a, b) => a.day !== b.day ? a.day - b.day : 0)

    const dayTitles: Record<number, { title: string; summary: string; warning?: string }> =
      Object.fromEntries(
        metas.map(m => [m.day, { title: m.title, summary: m.summary, warning: m.warning || undefined }]),
      )

    let aiTips: string[] | undefined
    let arrival: TripArrival | undefined
    let preferences = defaultDetail(tripId).preferences

    if (ai) {
      try { aiTips = JSON.parse(ai.tips_json) } catch { /* ignore */ }
      try { arrival = JSON.parse(ai.arrival_json) } catch { /* ignore */ }
      try {
        const p = JSON.parse(ai.preferences_json)
        if (p && typeof p === 'object') preferences = { ...preferences, ...p }
      } catch { /* ignore */ }
    }

    return {
      tripId,
      places,
      transport: [] as TransportLeg[],
      expenses: [] as Expense[],
      budget: 0,
      currency: 'USD',
      aiTips,
      dayTitles: Object.keys(dayTitles).length > 0 ? dayTitles : undefined,
      arrival,
      preferences,
    }
  }, [stdb.itineraryItems, stdb.dayMetas, stdb.aiContents, numericTripId, tripId])

  // Build the list of group proposals (with tallies + per-member votes)
  const myIdentity = stdb.identity
  const proposals: TripProposal[] = useMemo(() => {
    if (isNaN(numericTripId)) return []
    const rows = stdb.proposals.filter(p => p.trip_id === numericTripId)
    const votes = stdb.placeVotes.filter(v => v.trip_id === numericTripId)

    return rows
      .map(p => {
        const pVotes = votes.filter(v => v.proposal_id === p.id)
        const yesVoters = pVotes.filter(v => v.vote).map(v => v.identity)
        const noVoters = pVotes.filter(v => !v.vote).map(v => v.identity)
        const mine = pVotes.find(v => v.identity === myIdentity)
        const status: ProposalStatus =
          yesVoters.length > noVoters.length ? 'winning'
          : noVoters.length > yesVoters.length ? 'rejected'
          : 'tie'
        return {
          id: p.id,
          day: p.day,
          name: p.place_name,
          address: p.address,
          category: toPlaceCategory(p.category),
          lat: p.lat || undefined,
          lng: p.lng || undefined,
          tip: p.tip || undefined,
          isFree: p.is_free,
          cost: p.cost || undefined,
          rating: p.rating || undefined,
          reviewCount: p.review_count || undefined,
          source: p.source,
          proposedBy: p.proposed_by,
          createdAt: Number(p.created_at) / 1000,
          yesVoters,
          noVoters,
          myVote: mine ? mine.vote : null,
          status,
        }
      })
      .sort((a, b) => a.day - b.day || a.id - b.id)
  }, [stdb.proposals, stdb.placeVotes, numericTripId, myIdentity])

  // ── Action callbacks ────────────────────────────────────────────────────────

  const proposePlace = useCallback(async (p: ProposeInput) => {
    if (isNaN(numericTripId)) return
    const params: ProposePlaceParams = {
      trip_id: numericTripId,
      day: p.day,
      place_name: p.name,
      address: p.address,
      category: p.category,
      lat: p.lat ?? 0,
      lng: p.lng ?? 0,
      tip: p.tip ?? '',
      is_free: p.isFree ?? false,
      cost: p.cost ?? '',
      rating: p.rating ?? 0,
      review_count: p.reviewCount ?? '',
      source: p.source,
      auto_vote: p.autoVote ?? true,
    }
    await stdb.proposePlace(params)
  }, [stdb, numericTripId])

  const votePlace = useCallback(async (proposalId: number, vote: boolean) => {
    await stdb.votePlace(proposalId, vote)
  }, [stdb])

  const removeVote = useCallback(async (proposalId: number) => {
    await stdb.removeVote(proposalId)
  }, [stdb])

  const removeProposal = useCallback(async (proposalId: number) => {
    await stdb.removeProposal(proposalId)
  }, [stdb])

  const clearProposals = useCallback(async () => {
    if (isNaN(numericTripId)) return
    await stdb.clearTripProposals(numericTripId)
  }, [stdb, numericTripId])

  const addPlace = useCallback(async (p: Omit<PlaceItem, 'id'>) => {
    if (isNaN(numericTripId)) return
    const params: AddItemParams = {
      trip_id: numericTripId,
      day: p.day,
      position: 0,
      place_name: p.name,
      address: p.address,
      category: p.category,
      lat: p.lat ?? 0,
      lng: p.lng ?? 0,
      notes: p.notes,
      suggested_time: p.time ?? '',
      duration_str: p.duration ?? '',
      tip: p.tip ?? '',
      is_free: p.isFree ?? false,
      cost: p.cost ?? '',
      rating: p.rating ?? 0,
      review_count: p.reviewCount ?? '',
      booking_note: p.bookingNote ?? '',
      booking_url: p.bookingUrl ?? '',
      transport_mode: p.transportToNext?.mode ?? '',
      transport_distance: p.transportToNext?.distance ?? '',
      transport_duration: p.transportToNext?.duration ?? '',
      transport_detail: p.transportToNext?.detail ?? '',
    }
    await stdb.addItineraryItem(params)
  }, [stdb, numericTripId])

  const replacePlaces = useCallback(async (
    places: Omit<PlaceItem, 'id'>[],
    extras?: {
      aiTips?: string[]
      dayTitles?: TripDetail['dayTitles']
      arrival?: TripArrival
    },
  ) => {
    if (isNaN(numericTripId)) return

    // Delete existing items and day metas
    await stdb.deleteTripItems(numericTripId)
    await stdb.deleteTripDayMetas(numericTripId)

    // Add all new items sequentially
    for (let i = 0; i < places.length; i++) {
      const p = places[i]
      const params: AddItemParams = {
        trip_id: numericTripId,
        day: p.day,
        position: i,
        place_name: p.name,
        address: p.address,
        category: p.category,
        lat: p.lat ?? 0,
        lng: p.lng ?? 0,
        notes: p.notes,
        suggested_time: p.time ?? '',
        duration_str: p.duration ?? '',
        tip: p.tip ?? '',
        is_free: p.isFree ?? false,
        cost: p.cost ?? '',
        rating: p.rating ?? 0,
        review_count: p.reviewCount ?? '',
        booking_note: p.bookingNote ?? '',
        booking_url: p.bookingUrl ?? '',
        transport_mode: p.transportToNext?.mode ?? '',
        transport_distance: p.transportToNext?.distance ?? '',
        transport_duration: p.transportToNext?.duration ?? '',
        transport_detail: p.transportToNext?.detail ?? '',
      }
      await stdb.addItineraryItem(params)
    }

    // Upsert day metas
    if (extras?.dayTitles) {
      for (const [dayStr, meta] of Object.entries(extras.dayTitles)) {
        await stdb.upsertDayMeta(
          numericTripId,
          parseInt(dayStr, 10),
          meta.title,
          meta.summary,
          meta.warning ?? '',
        )
      }
    }

    // Update AI content
    if (extras?.aiTips !== undefined || extras?.arrival !== undefined) {
      const tipsJson = JSON.stringify(extras.aiTips ?? [])
      const arrivalJson = JSON.stringify(extras.arrival ?? null)
      const existingAi = stdb.aiContents[numericTripId]
      const prefsJson = existingAi?.preferences_json ?? JSON.stringify(detail.preferences)
      await stdb.updateAiContent(numericTripId, tipsJson, arrivalJson, prefsJson)
    }
  }, [stdb, numericTripId, detail.preferences])

  const removePlace = useCallback(async (id: string) => {
    const numId = parseInt(id, 10)
    if (!isNaN(numId)) await stdb.removeItineraryItem(numId)
  }, [stdb])

  const toggleVisited = useCallback(async (id: string) => {
    const numId = parseInt(id, 10)
    if (!isNaN(numId)) await stdb.toggleVisited(numId)
  }, [stdb])

  // Stubs kept for backwards-compat (transport / budget tabs removed)
  const addTransportLeg = useCallback((_leg: unknown) => {}, [])
  const removeTransportLeg = useCallback((_id: string) => {}, [])
  const addExpense = useCallback((_expense: unknown) => {}, [])
  const removeExpense = useCallback((_id: string) => {}, [])
  const setBudget = useCallback((_amount: number, _currency: string) => {}, [])
  const updatePreferences = useCallback((_prefs: Partial<TripDetail['preferences']>) => {}, [])

  const totalSpent = 0
  const perPersonExpenses: Record<string, { paid: number; owed: number; balance: number }> = {}

  return {
    detail,
    totalSpent,
    perPersonExpenses,
    proposals,
    myIdentity,
    proposePlace,
    votePlace,
    removeVote,
    removeProposal,
    clearProposals,
    addPlace,
    replacePlaces,
    removePlace,
    toggleVisited,
    addTransportLeg,
    removeTransportLeg,
    addExpense,
    removeExpense,
    setBudget,
    updatePreferences,
  }
}
