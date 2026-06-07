import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Loader2, X } from 'lucide-react'
import { useGoogleMapsLoader } from '../lib/googleMaps'
import type { PlaceCategory } from '../types'

export interface PickedPlace {
  name: string
  address: string
  lat: number
  lng: number
  category: PlaceCategory
}

interface PlacePickerProps {
  onSelect: (place: PickedPlace) => void
  placeholder?: string
  autoFocus?: boolean
  /** Bias predictions toward this point (e.g. the trip's city). */
  bias?: { lat: number; lng: number }
  className?: string
}

function categoryFromTypes(types: string[] = []): PlaceCategory {
  const t = new Set(types)
  const has = (...xs: string[]) => xs.some(x => t.has(x))
  if (has('restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'food')) return 'restaurant'
  if (has('lodging')) return 'hotel'
  if (has('tourist_attraction', 'museum', 'art_gallery', 'park', 'zoo', 'aquarium',
          'place_of_worship', 'church', 'hindu_temple', 'mosque', 'synagogue', 'natural_feature')) return 'attraction'
  if (has('amusement_park', 'movie_theater', 'night_club', 'stadium', 'shopping_mall',
          'store', 'spa', 'gym', 'casino', 'bowling_alley')) return 'activity'
  return 'other'
}

interface Prediction {
  placeId: string
  main: string
  secondary: string
}

export default function PlacePicker({ onSelect, placeholder = 'Search a place or address...', autoFocus, bias, className = '' }: PlacePickerProps) {
  const { isLoaded } = useGoogleMapsLoader()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSvcRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesSvcRef = useRef<google.maps.places.PlacesService | null>(null)
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    if (isLoaded && window.google) {
      autoSvcRef.current = new window.google.maps.places.AutocompleteService()
      placesSvcRef.current = new window.google.maps.places.PlacesService(document.createElement('div'))
      tokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }
  }, [isLoaded])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback((input: string) => {
    if (!autoSvcRef.current || input.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    const req: google.maps.places.AutocompletionRequest = {
      input,
      sessionToken: tokenRef.current ?? undefined,
    }
    if (bias) {
      req.location = new window.google.maps.LatLng(bias.lat, bias.lng)
      req.radius = 40000
    }
    autoSvcRef.current.getPlacePredictions(req, (predictions, status) => {
      setLoading(false)
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
        setResults([])
        setOpen(true)
        return
      }
      setResults(predictions.slice(0, 6).map(p => ({
        placeId: p.place_id,
        main: p.structured_formatting.main_text,
        secondary: p.structured_formatting.secondary_text || '',
      })))
      setOpen(true)
    })
  }, [bias])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => search(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, search])

  const choose = (p: Prediction) => {
    if (!placesSvcRef.current) return
    placesSvcRef.current.getDetails(
      {
        placeId: p.placeId,
        fields: ['name', 'formatted_address', 'geometry', 'types'],
        sessionToken: tokenRef.current ?? undefined,
      },
      (detail, status) => {
        // Refresh the session token after a details fetch (Google billing best practice).
        tokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        if (status === window.google.maps.places.PlacesServiceStatus.OK && detail?.geometry?.location) {
          const loc = detail.geometry.location.toJSON()
          onSelect({
            name: detail.name || p.main,
            address: detail.formatted_address || [p.main, p.secondary].filter(Boolean).join(', '),
            lat: loc.lat,
            lng: loc.lng,
            category: categoryFromTypes(detail.types ?? []),
          })
        } else {
          onSelect({ name: p.main, address: p.secondary, lat: 0, lng: 0, category: 'other' })
        }
        setQuery('')
        setResults([])
        setOpen(false)
      },
    )
  }

  const clear = () => { setQuery(''); setResults([]); setOpen(false) }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        {loading
          ? <Loader2 className="absolute left-3.5 w-4 h-4 text-gray-400 animate-spin pointer-events-none" />
          : <Search className="absolute left-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
        }
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={!isLoaded ? 'Loading…' : placeholder}
          disabled={!isLoaded}
          autoFocus={autoFocus}
          className="w-full pl-10 pr-9 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 focus:bg-white/[0.06] transition-all text-sm disabled:opacity-50"
        />
        {query && (
          <button onClick={clear} className="absolute right-3 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-white/[0.08] bg-[#0f0f1a]/97 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-scale-in">
          {results.length > 0 ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {results.map(p => (
                <button
                  key={p.placeId}
                  onClick={() => choose(p)}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-white/[0.05]"
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-100 truncate">{p.main}</div>
                    {p.secondary && <div className="text-xs text-gray-500 truncate">{p.secondary}</div>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500">No matches — try a different name or address.</div>
          )}
        </div>
      )}
    </div>
  )
}
