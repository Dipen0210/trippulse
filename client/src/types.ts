export interface User {
  name: string
}

export interface TripMember {
  memberId?: number
  name: string
  color: string
  isOnline?: boolean
  identity?: string
  isOwner?: boolean
}

export interface Trip {
  id: string
  owner?: string
  name: string
  destination: string
  country: string
  photo: string
  origin: string
  originLat?: number
  originLng?: number
  startDate: string
  endDate: string
  members: TripMember[]
  status: 'planning' | 'active' | 'completed'
  itemCount: number
  liveCount: number
  createdAt: string
}

export interface PlaceResult {
  id: string
  name: string
  displayName: string
  country: string
  lat: number
  lng: number
  photo: string
  type: string
}

// ── Trip Room types ──────────────────────────────────────────

export type PlaceCategory = 'attraction' | 'restaurant' | 'hotel' | 'activity' | 'other'

// A single hop between two consecutive stops (how to get from this place to the next)
export interface TransportHop {
  mode: string        // e.g. "Walk", "Subway E/M", "Taxi", "Ferry"
  distance: string    // e.g. "0.6 mi"
  duration: string    // e.g. "15 min"
  detail?: string     // e.g. "up 5th Ave, fastest than subway"
}

export interface PlaceItem {
  id: string
  name: string
  address: string
  photo: string
  lat?: number
  lng?: number
  category: PlaceCategory
  addedBy: string
  day: number
  notes: string
  visited: boolean
  // ── AI-generated planning details (optional) ──
  time?: string             // suggested arrival time, e.g. "9:00 AM"
  duration?: string         // how long to spend, e.g. "45-60 min"
  tip?: string              // why-visit / insider tip
  isFree?: boolean          // true if entirely free to enter
  cost?: string             // admission cost string, e.g. "$30", "Pay-what-you-wish"
  rating?: number           // Google / TripAdvisor rating out of 5, e.g. 4.7
  reviewCount?: string      // review count string, e.g. "7,629" or "12K"
  bookingNote?: string      // e.g. "Book first entry slot online ($40)"
  bookingUrl?: string       // direct booking link
  transportToNext?: TransportHop
}

// ── Getting-there travel options (AI-generated, origin → destination) ──────────

export type TravelMode = 'flight' | 'train' | 'bus' | 'drive' | 'ferry' | 'transit'

export interface TravelOption {
  mode: TravelMode
  duration: string      // e.g. "1h 24min"
  detail: string        // e.g. "NJ Transit NEC from New Brunswick → Penn Station"
  cost?: string         // e.g. "$20–35"
  bookingUrl?: string
  recommended?: boolean
}

export interface TripArrival {
  from: string
  to: string
  distanceKm?: number
  options: TravelOption[]
}

export type TransportMode = 'flight' | 'train' | 'bus' | 'car' | 'ferry'

export interface TransportLeg {
  id: string
  from: string
  to: string
  mode: TransportMode
  date: string
  estimatedCost: number
  currency: string
  booked: boolean
}

export type ExpenseCategory = 'accommodation' | 'food' | 'transport' | 'activity' | 'shopping' | 'other'

export interface Expense {
  id: string
  title: string
  amount: number
  currency: string
  paidBy: string
  splitBetween: string[]
  category: ExpenseCategory
  date: string
}

export type DiscoverCategory = 'monuments' | 'food' | 'shopping' | 'nature' | 'entertainment' | 'hotels'

export interface DiscoveredPlace {
  id: string
  name: string
  discoverCategory: DiscoverCategory
  placeCategory: PlaceCategory
  lat: number
  lng: number
  address: string
  photo: string
  wikipediaUrl?: string   // Wikipedia article or search URL for this place
}

export interface TripDetail {
  tripId: string
  places: PlaceItem[]
  transport: TransportLeg[]
  expenses: Expense[]
  budget: number
  currency: string
  aiTips?: string[]          // trip-wide AI tips: getting around, book-ahead warnings, where to stay
  dayTitles?: Record<number, { title: string; summary: string; warning?: string }>
  arrival?: TripArrival      // how to get from origin to destination
  preferences: {
    transportModes: TransportMode[]
    budgetLevel: 'budget' | 'mid-range' | 'luxury'
    pace: 'relaxed' | 'moderate' | 'packed'
    interests: string[]
  }
}
