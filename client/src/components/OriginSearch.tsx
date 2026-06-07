import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Loader2, X, Search } from 'lucide-react'
import { useGoogleMapsLoader } from '../lib/googleMaps'

export interface OriginPlace {
  name: string        // full display name, e.g. "New Brunswick, NJ, USA"
  shortName: string   // first part only, e.g. "New Brunswick"
  lat?: number
  lng?: number
}

interface Props {
  value: OriginPlace | null
  onChange: (place: OriginPlace | null) => void
  placeholder?: string
}

export default function OriginSearch({ value, onChange, placeholder = 'Your home city, e.g. New Brunswick, Mumbai...' }: Props) {
  const { isLoaded } = useGoogleMapsLoader()

  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<{ placeId: string; main: string; secondary: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  const containerRef    = useRef<HTMLDivElement>(null)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const geocoderRef     = useRef<google.maps.Geocoder | null>(null)

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
        // Save plain text if something was typed but no suggestion selected
        if (query.trim()) commitText(query.trim())
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const search = useCallback((input: string) => {
    if (!autocompleteRef.current || input.trim().length < 2) {
      setResults([]); setOpen(false); return
    }
    setLoading(true)
    autocompleteRef.current.getPlacePredictions(
      { input, types: ['geocode'], language: 'en' },
      (predictions, status) => {
        setLoading(false)
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
          setResults([]); return
        }
        setResults(
          predictions.slice(0, 6).map(p => ({
            placeId: p.place_id,
            main: p.structured_formatting.main_text,
            secondary: p.structured_formatting.secondary_text || '',
          }))
        )
        setOpen(true)
      }
    )
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => search(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, search])

  // Save plain text (no geocode) — used as fallback when user types and presses Enter / blurs
  const commitText = (text: string) => {
    if (!text) return
    const parts = text.split(',')
    onChange({ name: text, shortName: parts[0].trim() })
    setQuery('')
    setResults([])
    setOpen(false)
  }

  // Geocode a suggestion from the dropdown
  const handleSelect = (placeId: string, main: string, secondary: string) => {
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ placeId }, (res, status) => {
        if (status === 'OK' && res?.[0]) {
          const loc = res[0].geometry.location.toJSON()
          onChange({
            name: secondary ? `${main}, ${secondary}` : main,
            shortName: main,
            lat: loc.lat,
            lng: loc.lng,
          })
        } else {
          onChange({ name: secondary ? `${main}, ${secondary}` : main, shortName: main })
        }
      })
    } else {
      onChange({ name: secondary ? `${main}, ${secondary}` : main, shortName: main })
    }
    setQuery(''); setResults([]); setOpen(false)
  }

  // Show the selected chip
  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
        <MapPin className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
        <span className="flex-1 text-sm text-white truncate">{value.name}</span>
        <button
          onClick={() => onChange(null)}
          className="text-gray-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        {loading
          ? <Loader2 className="absolute left-3.5 w-3.5 h-3.5 text-gray-400 animate-spin pointer-events-none" />
          : <Search className="absolute left-3.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        }
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitText(query.trim()) }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/60 transition-all"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-white/[0.08] bg-[#0f0f1a]/98 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden z-50">
          {results.map(r => (
            <button
              key={r.placeId}
              onMouseDown={e => { e.preventDefault(); handleSelect(r.placeId, r.main, r.secondary) }}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-500/10 transition-colors cursor-pointer border-b border-white/[0.04] last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-gray-200 truncate">{r.main}</div>
                {r.secondary && <div className="text-[11px] text-gray-500 truncate">{r.secondary}</div>}
              </div>
            </button>
          ))}
          <button
            onMouseDown={e => { e.preventDefault(); commitText(query.trim()) }}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors cursor-pointer border-t border-white/[0.06]"
          >
            <Search className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
            <span className="text-[11px] text-gray-500">Use "<span className="text-gray-300">{query}</span>" as entered</span>
          </button>
        </div>
      )}
    </div>
  )
}
