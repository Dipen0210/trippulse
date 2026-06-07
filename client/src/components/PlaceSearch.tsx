import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Loader2, X } from 'lucide-react'
import { useGoogleMapsLoader } from '../lib/googleMaps'
import type { PlaceResult } from '../types'

interface PlaceSearchProps {
  onSelect: (place: PlaceResult) => void
  placeholder?: string
  className?: string
}

function buildPhotoUrl(name: string): string {
  const query = encodeURIComponent(`${name} city travel landmark`)
  return `https://source.unsplash.com/featured/800x450?${query}`
}

export default function PlaceSearch({ onSelect, placeholder = 'Search destinations...', className = '' }: PlaceSearchProps) {
  const { isLoaded } = useGoogleMapsLoader()

  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PlaceResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [focused, setFocused]   = useState<PlaceResult | null>(null)

  const containerRef   = useRef<HTMLDivElement>(null)
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const geocoderRef    = useRef<google.maps.Geocoder | null>(null)

  // Initialise Google services once the API script is ready
  useEffect(() => {
    if (isLoaded && window.google) {
      autocompleteRef.current = new window.google.maps.places.AutocompleteService()
      geocoderRef.current     = new window.google.maps.Geocoder()
    }
  }, [isLoaded])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const searchCities = useCallback((input: string) => {
    if (!autocompleteRef.current || input.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    setLoading(true)
    autocompleteRef.current.getPlacePredictions(
      { input, types: ['(cities)'], language: 'en' },
      (predictions, status) => {
        setLoading(false)
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
          setResults([])
          return
        }

        const mapped: PlaceResult[] = predictions.slice(0, 6).map(p => ({
          id: p.place_id,
          name: p.structured_formatting.main_text,
          displayName: p.description,
          country: p.structured_formatting.secondary_text || '',
          lat: 0,
          lng: 0,
          photo: buildPhotoUrl(p.structured_formatting.main_text),
          type: 'city',
        }))

        setResults(mapped)
        setOpen(true)
        if (mapped.length > 0) setFocused(mapped[0])
      }
    )
  }, [])

  // Debounce typing
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => searchCities(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, searchCities])

  const handleSelect = (place: PlaceResult) => {
    // Geocode the place_id to get accurate lat/lng + country
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ placeId: place.id }, (geoResults, status) => {
        if (status === 'OK' && geoResults?.[0]) {
          const loc = geoResults[0].geometry.location.toJSON()
          const countryComp = geoResults[0].address_components.find(c =>
            c.types.includes('country')
          )
          onSelect({
            ...place,
            lat: loc.lat,
            lng: loc.lng,
            country: countryComp?.long_name ?? place.country,
          })
        } else {
          onSelect(place)
        }
      })
    } else {
      onSelect(place)
    }
    setQuery('')
    setResults([])
    setOpen(false)
    setFocused(null)
  }

  const clear = () => { setQuery(''); setResults([]); setOpen(false) }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        {loading
          ? <Loader2 className="absolute left-4 w-4 h-4 text-gray-400 animate-spin pointer-events-none" />
          : <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
        }
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={!isLoaded ? 'Loading...' : placeholder}
          disabled={!isLoaded}
          className="w-full pl-11 pr-10 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 focus:bg-white/[0.06] transition-all text-sm disabled:opacity-50"
        />
        {query && (
          <button onClick={clear} className="absolute right-3 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-white/[0.08] bg-[#0f0f1a]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-scale-in">
          <div className="flex h-72">
            {/* List */}
            <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-white/[0.06]">
              {results.map(place => (
                <button
                  key={place.id}
                  onMouseEnter={() => setFocused(place)}
                  onClick={() => handleSelect(place)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                    focused?.id === place.id ? 'bg-indigo-500/10' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${focused?.id === place.id ? 'text-indigo-400' : 'text-gray-500'}`} />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${focused?.id === place.id ? 'text-indigo-300' : 'text-gray-200'}`}>
                      {place.name}
                    </div>
                    {place.country && (
                      <div className="text-xs text-gray-500 truncate">{place.country}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Photo preview */}
            {focused && (
              <div className="flex-1 relative overflow-hidden">
                <img
                  key={focused.id}
                  src={focused.photo}
                  alt={focused.name}
                  className="w-full h-full object-cover animate-fade-in"
                  onError={e => { (e.target as HTMLImageElement).src = 'https://source.unsplash.com/featured/600x400?travel' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="text-white font-semibold">{focused.name}</div>
                  {focused.country && (
                    <div className="text-gray-300 text-sm">{focused.country}</div>
                  )}
                  <button
                    onClick={() => handleSelect(focused)}
                    className="mt-2 px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors cursor-pointer"
                  >
                    Select destination →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
