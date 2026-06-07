import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  createElement,
} from 'react'
import { getOrCreateIdentity, callReducer, querySQL, clearLegacyLocalStorage } from '../lib/stdb'

// ── TypeScript interfaces matching Rust structs ────────────────────────────

export interface StdbUserProfile {
  identity: string
  username: string
  email: string
  avatar_color: string
  created_at: number
}

export interface StdbTrip {
  id: number
  owner: string
  name: string
  destination: string
  country: string
  photo: string
  origin: string
  origin_lat: number
  origin_lng: number
  start_date: string
  end_date: string
  created_at: number
}

export interface StdbTripMember {
  id: number
  trip_id: number
  identity: string
  role: string
  joined_at: number
}

export interface StdbInvite {
  code: string
  trip_id: number
  created_by: string
  role: string
  created_at: number
}

export interface StdbItineraryItem {
  id: number
  trip_id: number
  day: number
  position: number
  place_name: string
  address: string
  category: string
  lat: number
  lng: number
  visited: boolean
  notes: string
  suggested_time: string
  duration_str: string
  tip: string
  is_free: boolean
  cost: string
  rating: number
  review_count: string
  booking_note: string
  booking_url: string
  transport_mode: string
  transport_distance: string
  transport_duration: string
  transport_detail: string
  added_by: string
  added_at: number
}

export interface StdbDayMeta {
  id: number
  trip_id: number
  day: number
  title: string
  summary: string
  warning: string
}

export interface StdbAiContent {
  trip_id: number
  tips_json: string
  arrival_json: string
  preferences_json: string
  updated_at: number
}

export interface StdbPresence {
  identity: string
  trip_id: number
  current_day: number
  last_seen: number
}

export interface StdbLiveLocation {
  identity: string
  trip_id: number
  lat: number
  lng: number
  is_active: boolean
  updated_at: number
}

export interface StdbProposal {
  id: number
  trip_id: number
  day: number
  place_name: string
  address: string
  category: string
  lat: number
  lng: number
  tip: string
  is_free: boolean
  cost: string
  rating: number
  review_count: string
  source: string
  proposed_by: string
  created_at: number
}

export interface StdbPlaceVote {
  id: number
  proposal_id: number
  trip_id: number
  identity: string
  vote: boolean
  voted_at: number
}

export interface ProposePlaceParams {
  trip_id: number
  day: number
  place_name: string
  address: string
  category: string
  lat: number
  lng: number
  tip: string
  is_free: boolean
  cost: string
  rating: number
  review_count: string
  source: string
  auto_vote: boolean
}

export interface AddItemParams {
  trip_id: number
  day: number
  position: number
  place_name: string
  address: string
  category: string
  lat: number
  lng: number
  notes: string
  suggested_time: string
  duration_str: string
  tip: string
  is_free: boolean
  cost: string
  rating: number
  review_count: string
  booking_note: string
  booking_url: string
  transport_mode: string
  transport_distance: string
  transport_duration: string
  transport_detail: string
}

// ── Context value type ────────────────────────────────────────────────────────

interface StdbContextValue {
  identity: string | null
  token: string | null
  isConnected: boolean
  isLoading: boolean

  // Table data
  trips: StdbTrip[]
  tripMembers: StdbTripMember[]
  itineraryItems: StdbItineraryItem[]
  dayMetas: StdbDayMeta[]
  aiContents: Record<number, StdbAiContent>
  presence: StdbPresence[]
  invites: StdbInvite[]
  proposals: StdbProposal[]
  placeVotes: StdbPlaceVote[]
  userProfiles: StdbUserProfile[]

  // Reducer wrappers
  register: (username: string, email: string, avatarColor: string) => Promise<void>
  createTrip: (name: string, destination: string, country: string, photo: string, origin: string, originLat: number, originLng: number, startDate: string, endDate: string) => Promise<number>
  updateTrip: (tripId: number, name: string, photo: string, startDate: string, endDate: string, origin: string, originLat: number, originLng: number) => Promise<void>
  deleteTrip: (tripId: number) => Promise<void>
  createInvite: (tripId: number, code: string, role: string) => Promise<void>
  joinTrip: (code: string) => Promise<void>
  joinTripById: (tripId: number) => Promise<void>
  removeMember: (memberId: number) => Promise<void>
  proposePlace: (params: ProposePlaceParams) => Promise<void>
  votePlace: (proposalId: number, vote: boolean) => Promise<void>
  removeVote: (proposalId: number) => Promise<void>
  removeProposal: (proposalId: number) => Promise<void>
  clearTripProposals: (tripId: number) => Promise<void>
  addItineraryItem: (params: AddItemParams) => Promise<void>
  updateItemNotes: (itemId: number, notes: string) => Promise<void>
  removeItineraryItem: (itemId: number) => Promise<void>
  toggleVisited: (itemId: number) => Promise<void>
  deleteTripItems: (tripId: number) => Promise<void>
  deleteTripDayMetas: (tripId: number) => Promise<void>
  upsertDayMeta: (tripId: number, day: number, title: string, summary: string, warning: string) => Promise<void>
  updateAiContent: (tripId: number, tipsJson: string, arrivalJson: string, preferencesJson: string) => Promise<void>
  updatePresence: (tripId: number, currentDay: number) => Promise<void>
  liveLocations: StdbLiveLocation[]
  updateLiveLocation: (tripId: number, lat: number, lng: number, isActive: boolean) => Promise<void>
  refreshAll: () => Promise<void>
}

const StdbContext = createContext<StdbContextValue | null>(null)

export function StdbProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)

  const [trips, setTrips] = useState<StdbTrip[]>([])
  const [tripMembers, setTripMembers] = useState<StdbTripMember[]>([])
  const [itineraryItems, setItineraryItems] = useState<StdbItineraryItem[]>([])
  const [dayMetas, setDayMetas] = useState<StdbDayMeta[]>([])
  const [aiContents, setAiContents] = useState<Record<number, StdbAiContent>>({})
  const [presence, setPresence] = useState<StdbPresence[]>([])
  const [liveLocations, setLiveLocations] = useState<StdbLiveLocation[]>([])
  const [invites, setInvites] = useState<StdbInvite[]>([])
  const [proposals, setProposals] = useState<StdbProposal[]>([])
  const [placeVotes, setPlaceVotes] = useState<StdbPlaceVote[]>([])
  const [userProfiles, setUserProfiles] = useState<StdbUserProfile[]>([])

  const tokenRef = useRef<string | null>(null)
  const identityRef = useRef<string | null>(null)

  // Keep refs in sync
  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { identityRef.current = identity }, [identity])

  const loadData = useCallback(async (tok: string, ident: string) => {
    try {
      // identity hex has no 0x prefix in JS; SQL requires 0x prefix literal
      console.info('[loadData] querying with ident:', ident.slice(0, 16) + '...')

      // SpacetimeDB SQL does not support the `IN (...)` operator, so we load
      // trips two ways and merge: trips the user owns + trips the user is a
      // member of. This guarantees an owner always sees their own trips.
      const [ownedTrips, memberRows] = await Promise.all([
        querySQL<StdbTrip>(tok, `SELECT * FROM trip WHERE owner = 0x${ident}`),
        querySQL<StdbTripMember>(tok, `SELECT * FROM trip_member WHERE identity = 0x${ident}`),
      ])
      console.info('[loadData] ownedTrips:', ownedTrips.length, 'memberRows:', memberRows.length)
      setTripMembers(memberRows)

      const tripIds = [...new Set([
        ...ownedTrips.map(t => t.id),
        ...memberRows.map(m => m.trip_id),
      ])]

      if (tripIds.length === 0) {
        setTrips([])
        setItineraryItems([])
        setDayMetas([])
        setAiContents({})
        setPresence([])
        setLiveLocations([])
        setInvites([])
        setProposals([])
        setPlaceVotes([])
        setUserProfiles([])
        return
      }

      // Build `col = a OR col = b ...` clauses since `IN` is unsupported.
      const orClause = (col: string) => tripIds.map(id => `${col} = ${id}`).join(' OR ')
      const byTripId = orClause('trip_id')
      const byId = orClause('id')

      const [tripRows, allMembers, itemRows, dayMetaRows, aiRows, presenceRows, liveLocRows, inviteRows, proposalRows, voteRows] =
        await Promise.all([
          querySQL<StdbTrip>(tok, `SELECT * FROM trip WHERE ${byId}`),
          querySQL<StdbTripMember>(tok, `SELECT * FROM trip_member WHERE ${byTripId}`),
          querySQL<StdbItineraryItem>(tok, `SELECT * FROM itinerary_item WHERE ${byTripId}`),
          querySQL<StdbDayMeta>(tok, `SELECT * FROM trip_day_meta WHERE ${byTripId}`),
          querySQL<StdbAiContent>(tok, `SELECT * FROM trip_ai_content WHERE ${byTripId}`),
          querySQL<StdbPresence>(tok, `SELECT * FROM presence WHERE ${byTripId}`),
          querySQL<StdbLiveLocation>(tok, `SELECT * FROM live_location WHERE ${byTripId}`),
          querySQL<StdbInvite>(tok, `SELECT * FROM trip_invite WHERE ${byTripId}`),
          querySQL<StdbProposal>(tok, `SELECT * FROM place_proposal WHERE ${byTripId}`),
          querySQL<StdbPlaceVote>(tok, `SELECT * FROM place_vote WHERE ${byTripId}`),
        ])

      setTrips(tripRows)
      setTripMembers(allMembers)
      setItineraryItems(itemRows)
      setDayMetas(dayMetaRows)
      setAiContents(Object.fromEntries(aiRows.map(r => [r.trip_id, r])))
      setPresence(presenceRows)
      setLiveLocations(liveLocRows)
      setInvites(inviteRows)
      setProposals(proposalRows)
      setPlaceVotes(voteRows)

      // Resolve member display names via user_profile (identity → username)
      const memberIdents = [...new Set(allMembers.map(m => m.identity))]
      if (memberIdents.length > 0) {
        const identClause = memberIdents.map(id => `identity = 0x${id}`).join(' OR ')
        try {
          const profileRows = await querySQL<StdbUserProfile>(tok, `SELECT * FROM user_profile WHERE ${identClause}`)
          setUserProfiles(profileRows)
        } catch {
          setUserProfiles([])
        }
      } else {
        setUserProfiles([])
      }
      console.info(`[StdbContext] loaded: ${tripRows.length} trips, ${itemRows.length} items`)
    } catch (err) {
      console.error('[StdbContext] loadData error', err)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    if (tokenRef.current && identityRef.current) {
      await loadData(tokenRef.current, identityRef.current)
    } else {
      console.warn('[StdbContext] refreshAll: not ready — token:', !!tokenRef.current, 'identity:', !!identityRef.current)
    }
  }, [loadData])

  // Init: clear legacy data, then get or create identity
  useEffect(() => {
    clearLegacyLocalStorage()
    let cancelled = false
    ;(async () => {
      try {
        const creds = await getOrCreateIdentity()
        if (cancelled) return
        console.info('[StdbContext] identity:', creds.identity.slice(0, 16) + '...')
        setIdentity(creds.identity)
        setToken(creds.token)
        tokenRef.current = creds.token
        identityRef.current = creds.identity
        setIsConnected(true)
        await loadData(creds.token, creds.identity)
      } catch (err) {
        console.error('[StdbContext] init error', err)
        setIsConnected(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loadData])

  // Poll every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      if (tokenRef.current && identityRef.current) {
        loadData(tokenRef.current, identityRef.current).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(id)
  }, [loadData])

  // ── Reducer wrappers ────────────────────────────────────────────────────────

  const call = useCallback(async (name: string, args: unknown[]) => {
    if (!tokenRef.current) throw new Error('Not connected to SpacetimeDB')
    await callReducer(tokenRef.current, name, args)
  }, [])

  const register = useCallback(async (username: string, email: string, avatarColor: string) => {
    await call('register', [username, email, avatarColor])
  }, [call])

  const createTrip = useCallback(async (
    name: string, destination: string, country: string, photo: string,
    origin: string, originLat: number, originLng: number,
    startDate: string, endDate: string,
  ): Promise<number> => {
    await call('create_trip', [name, destination, country, photo, origin, originLat, originLng, startDate, endDate])
    await refreshAll()
    // Return the newest trip id owned by this identity (auto_inc → max id is newest)
    const tok = tokenRef.current
    const ident = identityRef.current
    if (!tok || !ident) return 0
    try {
      const owned = await querySQL<StdbTrip>(tok, `SELECT * FROM trip WHERE owner = 0x${ident}`)
      return owned.reduce((max, t) => Math.max(max, t.id), 0)
    } catch {
      return 0
    }
  }, [call, refreshAll])

  const updateTrip = useCallback(async (
    tripId: number, name: string, photo: string,
    startDate: string, endDate: string, origin: string,
    originLat: number, originLng: number,
  ) => {
    await call('update_trip', [tripId, name, photo, startDate, endDate, origin, originLat, originLng])
    await refreshAll()
  }, [call, refreshAll])

  const deleteTrip = useCallback(async (tripId: number) => {
    await call('delete_trip', [tripId])
    await refreshAll()
  }, [call, refreshAll])

  const createInvite = useCallback(async (tripId: number, code: string, role: string) => {
    await call('create_invite', [tripId, code, role])
    await refreshAll()
  }, [call, refreshAll])

  const joinTrip = useCallback(async (code: string) => {
    await call('join_trip', [code])
    await refreshAll()
  }, [call, refreshAll])

  const joinTripById = useCallback(async (tripId: number) => {
    await call('join_trip_open', [tripId])
    await refreshAll()
  }, [call, refreshAll])

  const removeMember = useCallback(async (memberId: number) => {
    await call('remove_member', [memberId])
    await refreshAll()
  }, [call, refreshAll])

  const proposePlace = useCallback(async (p: ProposePlaceParams) => {
    await call('propose_place', [
      p.trip_id, p.day, p.place_name, p.address, p.category, p.lat, p.lng,
      p.tip, p.is_free, p.cost, p.rating, p.review_count, p.source, p.auto_vote,
    ])
    await refreshAll()
  }, [call, refreshAll])

  const votePlace = useCallback(async (proposalId: number, vote: boolean) => {
    await call('vote_place', [proposalId, vote])
    await refreshAll()
  }, [call, refreshAll])

  const removeVote = useCallback(async (proposalId: number) => {
    await call('remove_vote', [proposalId])
    await refreshAll()
  }, [call, refreshAll])

  const removeProposal = useCallback(async (proposalId: number) => {
    await call('remove_proposal', [proposalId])
    await refreshAll()
  }, [call, refreshAll])

  const clearTripProposals = useCallback(async (tripId: number) => {
    await call('clear_trip_proposals', [tripId])
    await refreshAll()
  }, [call, refreshAll])

  const addItineraryItem = useCallback(async (params: AddItemParams) => {
    await call('add_itinerary_item', [
      params.trip_id, params.day, params.position, params.place_name,
      params.address, params.category, params.lat, params.lng,
      params.notes, params.suggested_time, params.duration_str,
      params.tip, params.is_free, params.cost, params.rating,
      params.review_count, params.booking_note, params.booking_url,
      params.transport_mode, params.transport_distance,
      params.transport_duration, params.transport_detail,
    ])
    await refreshAll()
  }, [call, refreshAll])

  const updateItemNotes = useCallback(async (itemId: number, notes: string) => {
    await call('update_item_notes', [itemId, notes])
    await refreshAll()
  }, [call, refreshAll])

  const removeItineraryItem = useCallback(async (itemId: number) => {
    await call('remove_itinerary_item', [itemId])
    await refreshAll()
  }, [call, refreshAll])

  const toggleVisited = useCallback(async (itemId: number) => {
    await call('toggle_visited', [itemId])
    await refreshAll()
  }, [call, refreshAll])

  const deleteTripItems = useCallback(async (tripId: number) => {
    await call('delete_trip_items', [tripId])
    await refreshAll()
  }, [call, refreshAll])

  const deleteTripDayMetas = useCallback(async (tripId: number) => {
    await call('delete_trip_day_metas', [tripId])
    await refreshAll()
  }, [call, refreshAll])

  const upsertDayMeta = useCallback(async (
    tripId: number, day: number, title: string, summary: string, warning: string,
  ) => {
    await call('upsert_day_meta', [tripId, day, title, summary, warning])
    await refreshAll()
  }, [call, refreshAll])

  const updateAiContent = useCallback(async (
    tripId: number, tipsJson: string, arrivalJson: string, preferencesJson: string,
  ) => {
    await call('update_ai_content', [tripId, tipsJson, arrivalJson, preferencesJson])
    await refreshAll()
  }, [call, refreshAll])

  const updatePresence = useCallback(async (tripId: number, currentDay: number) => {
    await call('update_presence', [tripId, currentDay])
  }, [call])

  const updateLiveLocation = useCallback(async (
    tripId: number, lat: number, lng: number, isActive: boolean,
  ) => {
    await call('update_live_location', [tripId, lat, lng, isActive])
  }, [call])

  const value: StdbContextValue = {
    identity,
    token,
    isConnected,
    isLoading,
    trips,
    tripMembers,
    itineraryItems,
    dayMetas,
    aiContents,
    presence,
    invites,
    proposals,
    placeVotes,
    userProfiles,
    register,
    createTrip,
    updateTrip,
    deleteTrip,
    createInvite,
    joinTrip,
    joinTripById,
    removeMember,
    proposePlace,
    votePlace,
    removeVote,
    removeProposal,
    clearTripProposals,
    addItineraryItem,
    updateItemNotes,
    removeItineraryItem,
    toggleVisited,
    deleteTripItems,
    deleteTripDayMetas,
    upsertDayMeta,
    updateAiContent,
    updatePresence,
    liveLocations,
    updateLiveLocation,
    refreshAll,
  }

  return createElement(StdbContext.Provider, { value }, children)
}

export function useStdb(): StdbContextValue {
  const ctx = useContext(StdbContext)
  if (!ctx) throw new Error('useStdb must be used inside StdbProvider')
  return ctx
}
