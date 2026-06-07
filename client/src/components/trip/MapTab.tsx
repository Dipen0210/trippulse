import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, DirectionsRenderer } from '@react-google-maps/api'
import { Navigation, Locate, ChevronLeft, ChevronRight, MapPin, CheckCircle2, Radio, StopCircle } from 'lucide-react'
import { useGoogleMapsLoader, DARK_MAP_STYLES } from '../../lib/googleMaps'
import type { Trip, TripDetail, PlaceItem, TripMember } from '../../types'
import type { StdbLiveLocation } from '../../contexts/StdbContext'

interface Props {
  trip: Trip
  totalDays: number
  detail: TripDetail
  onToggleVisited: (placeId: string) => void
  liveLocations: StdbLiveLocation[]
  myIdentity: string | null
  onUpdateLiveLocation: (tripId: number, lat: number, lng: number, isActive: boolean) => Promise<void>
}

const MAP_OPTIONS: google.maps.MapOptions = {
  styles: DARK_MAP_STYLES,
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 },
  clickableIcons: false,
  backgroundColor: '#080810',
}

const CATEGORY_COLORS: Record<string, string> = {
  attraction: '#6366f1',
  restaurant: '#f59e0b',
  hotel:      '#22c55e',
  activity:   '#ec4899',
  other:      '#06b6d4',
}

function makePinSvg(index: number, color: string, visited: boolean): string {
  const fill = visited ? '#22c55e' : color
  const label = visited ? '✓' : String(index + 1)
  const fontSize = visited ? 10 : 11
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 11 16 24 16 24s16-13 16-24C32 7.16 24.84 0 16 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <text x="16" y="21" text-anchor="middle" fill="white"
            font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700">${label}</text>
    </svg>
  `)}`
}

function selfDotSvg(): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.25"/>
      <circle cx="12" cy="12" r="6" fill="#3b82f6" stroke="white" stroke-width="2"/>
    </svg>
  `)}`
}

function friendDotSvg(color: string, initial: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="${color}" opacity="0.2"/>
      <circle cx="17" cy="17" r="11" fill="${color}" stroke="white" stroke-width="2.5"/>
      <text x="17" y="21" text-anchor="middle" fill="white"
            font-family="system-ui,sans-serif" font-size="11" font-weight="700">${initial}</text>
    </svg>
  `)}`
}

export default function MapTab({
  trip, totalDays, detail, onToggleVisited,
  liveLocations, myIdentity, onUpdateLiveLocation,
}: Props) {
  const { isLoaded } = useGoogleMapsLoader()
  const numericTripId = parseInt(trip.id)

  const [activeDay, setActiveDay]           = useState(1)
  const [directions, setDirections]         = useState<google.maps.DirectionsResult | null>(null)
  const [center, setCenter]                 = useState<google.maps.LatLngLiteral>({ lat: 20, lng: 0 })
  const [livePos, setLivePos]               = useState<google.maps.LatLngLiteral | null>(null)
  const [liveTracking, setLiveTracking]     = useState(false)
  const [tripStarted, setTripStarted]       = useState(false)
  const [geocodedPlaces, setGeocodedPlaces] = useState<(PlaceItem & { lat: number; lng: number })[]>([])
  const [geocoding, setGeocoding]           = useState(false)

  const mapRef              = useRef<google.maps.Map | null>(null)
  const markersRef          = useRef<google.maps.Marker[]>([])
  const selfMarkerRef       = useRef<google.maps.Marker | null>(null)
  const friendMarkersRef    = useRef<Map<string, google.maps.Marker>>(new Map())
  const watchIdRef          = useRef<number | null>(null)
  const pushIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const livePosRef          = useRef<google.maps.LatLngLiteral | null>(null)
  const geocoderRef         = useRef<google.maps.Geocoder | null>(null)
  const dirServiceRef       = useRef<google.maps.DirectionsService | null>(null)

  // Keep livePosRef in sync for the push interval
  useEffect(() => { livePosRef.current = livePos }, [livePos])

  const dayPlaces = detail.places.filter(p => p.day === activeDay)

  // Friends currently live on this trip (excluding self)
  const activeFriends = liveLocations.filter(
    l => l.trip_id === numericTripId && l.is_active && l.identity !== myIdentity
  )
  const myLiveRow = liveLocations.find(l => l.trip_id === numericTripId && l.identity === myIdentity)

  // Restore tripStarted from server state on mount
  useEffect(() => {
    if (myLiveRow?.is_active) setTripStarted(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Init geocoder + directions service
  useEffect(() => {
    if (!isLoaded) return
    geocoderRef.current   = new window.google.maps.Geocoder()
    dirServiceRef.current = new window.google.maps.DirectionsService()
  }, [isLoaded])

  // Centre map on destination
  useEffect(() => {
    if (!isLoaded || !geocoderRef.current) return
    geocoderRef.current.geocode({ address: `${trip.destination}, ${trip.country}` }, (res, status) => {
      if (status === 'OK' && res?.[0]) setCenter(res[0].geometry.location.toJSON())
    })
  }, [isLoaded, trip.destination, trip.country])

  // Geocode places that lack coordinates
  useEffect(() => {
    if (!isLoaded || !geocoderRef.current || dayPlaces.length === 0) {
      setGeocodedPlaces([])
      setDirections(null)
      return
    }
    setGeocoding(true)
    const resolveAll = async () => {
      const resolved = await Promise.all(
        dayPlaces.map(p =>
          new Promise<PlaceItem & { lat: number; lng: number }>(resolve => {
            if (p.lat && p.lng) { resolve(p as PlaceItem & { lat: number; lng: number }); return }
            geocoderRef.current!.geocode(
              { address: `${p.name}, ${trip.destination}` },
              (res, status) => {
                if (status === 'OK' && res?.[0]) {
                  const loc = res[0].geometry.location.toJSON()
                  resolve({ ...p, lat: loc.lat, lng: loc.lng })
                } else {
                  resolve({ ...p, lat: center.lat, lng: center.lng })
                }
              }
            )
          })
        )
      )
      setGeocodedPlaces(resolved)
      setGeocoding(false)
    }
    resolveAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, activeDay, detail.places, trip.destination, center.lat, center.lng])

  // Directions route
  useEffect(() => {
    setDirections(null)
    if (!dirServiceRef.current || geocodedPlaces.length < 2) return
    const waypoints = geocodedPlaces.slice(1, -1).map(p => ({
      location: { lat: p.lat, lng: p.lng } as google.maps.LatLngLiteral,
      stopover: true,
    }))
    dirServiceRef.current.route(
      {
        origin:      { lat: geocodedPlaces[0].lat,    lng: geocodedPlaces[0].lng },
        destination: { lat: geocodedPlaces.at(-1)!.lat, lng: geocodedPlaces.at(-1)!.lng },
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => { if (status === 'OK') setDirections(result) }
    )
  }, [geocodedPlaces])

  // Place numbered markers
  useEffect(() => {
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    if (!mapRef.current || geocodedPlaces.length === 0) return
    geocodedPlaces.forEach((place, i) => {
      const marker = new window.google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: mapRef.current!,
        icon: {
          url: makePinSvg(i, CATEGORY_COLORS[place.category] ?? '#6366f1', place.visited),
          scaledSize: new window.google.maps.Size(32, 40),
          anchor:     new window.google.maps.Point(16, 40),
        },
        title: place.name,
        zIndex: 10 + i,
      })
      markersRef.current.push(marker)
    })
  }, [geocodedPlaces])

  // Self location marker
  useEffect(() => {
    if (!mapRef.current || !livePos) return
    if (!selfMarkerRef.current) {
      selfMarkerRef.current = new window.google.maps.Marker({
        position: livePos,
        map: mapRef.current,
        icon: {
          url: selfDotSvg(),
          scaledSize: new window.google.maps.Size(24, 24),
          anchor:     new window.google.maps.Point(12, 12),
        },
        title: 'You',
        zIndex: 999,
      })
    } else {
      selfMarkerRef.current.setPosition(livePos)
    }
  }, [livePos])

  // Friend location markers — update when liveLocations or map changes
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return

    // Remove markers for friends who are no longer active
    friendMarkersRef.current.forEach((marker, identity) => {
      const stillActive = activeFriends.some(f => f.identity === identity)
      if (!stillActive) {
        marker.setMap(null)
        friendMarkersRef.current.delete(identity)
      }
    })

    // Add or update markers for active friends
    activeFriends.forEach(friend => {
      const member: TripMember | undefined = trip.members.find(m => m.identity === friend.identity)
      const color = member?.color ?? '#6b7280'
      const initial = (member?.name ?? '?')[0].toUpperCase()
      const pos = { lat: friend.lat, lng: friend.lng }

      const existing = friendMarkersRef.current.get(friend.identity)
      if (existing) {
        existing.setPosition(pos)
      } else {
        const marker = new window.google.maps.Marker({
          position: pos,
          map: mapRef.current!,
          icon: {
            url: friendDotSvg(color, initial),
            scaledSize: new window.google.maps.Size(34, 34),
            anchor:     new window.google.maps.Point(17, 17),
          },
          title: member?.name ?? 'Friend',
          zIndex: 998,
        })
        friendMarkersRef.current.set(friend.identity, marker)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLocations, isLoaded])

  // ── Start / Stop trip ──────────────────────────────────────────────────────

  const startTrip = useCallback(() => {
    if (!navigator.geolocation) return
    setTripStarted(true)
    setLiveTracking(true)

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLivePos(loc)
        livePosRef.current = loc
        mapRef.current?.panTo(loc)
      },
      () => { setTripStarted(false); setLiveTracking(false) },
      { enableHighAccuracy: true }
    )

    // Push to SpacetimeDB every 15 seconds
    pushIntervalRef.current = setInterval(() => {
      if (livePosRef.current) {
        onUpdateLiveLocation(numericTripId, livePosRef.current.lat, livePosRef.current.lng, true).catch(() => {})
      }
    }, 15000)
  }, [numericTripId, onUpdateLiveLocation])

  const stopTrip = useCallback(() => {
    setTripStarted(false)
    setLiveTracking(false)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (pushIntervalRef.current !== null) {
      clearInterval(pushIntervalRef.current)
      pushIntervalRef.current = null
    }
    selfMarkerRef.current?.setMap(null)
    selfMarkerRef.current = null
    setLivePos(null)
    livePosRef.current = null
    onUpdateLiveLocation(numericTripId, 0, 0, false).catch(() => {})
  }, [numericTripId, onUpdateLiveLocation])

  // ── Legacy "Locate me" (local only, no sharing) ────────────────────────────
  const toggleLive = useCallback(() => {
    if (tripStarted) return // managed by start/stop trip
    if (liveTracking) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      selfMarkerRef.current?.setMap(null)
      selfMarkerRef.current = null
      setLivePos(null)
      setLiveTracking(false)
    } else {
      if (!navigator.geolocation) return
      setLiveTracking(true)
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setLivePos(loc)
          mapRef.current?.panTo(loc)
        },
        () => setLiveTracking(false),
        { enableHighAccuracy: true }
      )
    }
  }, [liveTracking, tripStarted])

  // Cleanup on unmount
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (pushIntervalRef.current !== null) clearInterval(pushIntervalRef.current)
    markersRef.current.forEach(m => m.setMap(null))
    selfMarkerRef.current?.setMap(null)
    friendMarkersRef.current.forEach(m => m.setMap(null))
  }, [])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[520px] glass rounded-2xl border border-white/[0.06]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading map…</p>
        </div>
      </div>
    )
  }

  const totalLive = activeFriends.length + (tripStarted ? 1 : 0)

  return (
    <div className="space-y-4">

      {/* ── Start trip banner ── */}
      <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border transition-all ${
        tripStarted
          ? 'bg-emerald-500/8 border-emerald-500/25'
          : 'bg-white/[0.02] border-white/[0.07]'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          {tripStarted ? (
            <>
              <div className="relative flex-shrink-0">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Live — sharing your location</p>
                <p className="text-[11px] text-gray-500">
                  {activeFriends.length === 0
                    ? 'Waiting for friends to join…'
                    : `${activeFriends.length} friend${activeFriends.length !== 1 ? 's' : ''} live with you`}
                </p>
              </div>
              {/* Friend avatars */}
              {activeFriends.length > 0 && (
                <div className="flex -space-x-1.5 ml-1">
                  {activeFriends.slice(0, 5).map(f => {
                    const m = trip.members.find(mb => mb.identity === f.identity)
                    return (
                      <div
                        key={f.identity}
                        title={m?.name}
                        className="w-6 h-6 rounded-full border-2 border-[#080810] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                        style={{ background: m?.color ?? '#6b7280' }}
                      >
                        {(m?.name ?? '?')[0].toUpperCase()}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-200">Start trip to share live locations</p>
                <p className="text-[11px] text-gray-600">
                  {activeFriends.length > 0
                    ? `${activeFriends.length} friend${activeFriends.length !== 1 ? 's' : ''} already live — join them!`
                    : 'Your friends will see your dot on the map in real time.'}
                </p>
              </div>
              {/* Friends already live */}
              {activeFriends.length > 0 && (
                <div className="flex -space-x-1.5 ml-1">
                  {activeFriends.slice(0, 5).map(f => {
                    const m = trip.members.find(mb => mb.identity === f.identity)
                    return (
                      <div
                        key={f.identity}
                        title={`${m?.name ?? 'Friend'} is live`}
                        className="w-6 h-6 rounded-full border-2 border-[#080810] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ring-1 ring-emerald-400"
                        style={{ background: m?.color ?? '#6b7280' }}
                      >
                        {(m?.name ?? '?')[0].toUpperCase()}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {tripStarted ? (
          <button
            onClick={stopTrip}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all border bg-red-500/10 hover:bg-red-500/20 border-red-500/25 text-red-300 flex-shrink-0"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Stop trip
          </button>
        ) : (
          <button
            onClick={startTrip}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all border bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300 flex-shrink-0"
          >
            <Radio className="w-3.5 h-3.5" />
            Start trip
          </button>
        )}
      </div>

      {/* Day selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveDay(d => Math.max(1, d - 1))}
          disabled={activeDay === 1}
          className="p-2 glass rounded-xl border border-white/[0.06] text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 overflow-x-auto flex-1 scrollbar-hide">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
            const count = detail.places.filter(p => p.day === day).length
            return (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                  activeDay === day
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'glass border-white/[0.06] text-gray-400 hover:text-white'
                }`}
              >
                <span className="font-semibold">Day {day}</span>
                <span className={`text-[10px] mt-0.5 ${activeDay === day ? 'text-indigo-200' : 'text-gray-600'}`}>
                  {count} stop{count !== 1 ? 's' : ''}
                </span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setActiveDay(d => Math.min(totalDays, d + 1))}
          disabled={activeDay === totalDays}
          className="p-2 glass rounded-xl border border-white/[0.06] text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Locate me (local, no sharing) */}
        <button
          onClick={toggleLive}
          disabled={tripStarted}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all flex-shrink-0 ${
            liveTracking && !tripStarted
              ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
              : 'glass border-white/[0.06] text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-default'
          }`}
        >
          <Locate className="w-3.5 h-3.5" />
          {liveTracking && !tripStarted ? 'Live' : 'Locate me'}
        </button>
      </div>

      {/* Map + sidebar */}
      <div className="flex gap-4 h-[520px]">
        {/* Stop list sidebar */}
        <div className="w-64 flex-shrink-0 glass rounded-2xl border border-white/[0.06] overflow-y-auto">
          <div className="p-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-white">Day {activeDay} stops</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {geocodedPlaces.length} place{geocodedPlaces.length !== 1 ? 's' : ''}
              {geocoding && ' · Locating…'}
            </p>
          </div>

          {geocodedPlaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
              <MapPin className="w-8 h-8 text-gray-700" />
              <p className="text-xs text-gray-500">No stops for Day {activeDay}.<br />Add places in Itinerary tab.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {geocodedPlaces.map((place, i) => (
                <div
                  key={place.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer group ${
                    place.visited ? 'opacity-60' : 'hover:bg-white/[0.04]'
                  }`}
                  onClick={() => {
                    mapRef.current?.panTo({ lat: place.lat, lng: place.lng })
                    mapRef.current?.setZoom(16)
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: place.visited ? '#22c55e' : (CATEGORY_COLORS[place.category] ?? '#6366f1') }}
                  >
                    {place.visited ? '✓' : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${place.visited ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {place.name}
                    </p>
                    <p className="text-[10px] text-gray-600 truncate capitalize">{place.category}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onToggleVisited(place.id) }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer ${
                      place.visited ? 'text-emerald-400' : 'text-gray-600 hover:text-emerald-400'
                    }`}
                    title={place.visited ? 'Mark unvisited' : "I'm here!"}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Google Map */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-white/[0.06]">
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center}
            zoom={12}
            options={MAP_OPTIONS}
            onLoad={map => { mapRef.current = map }}
            onUnmount={() => { mapRef.current = null }}
          >
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor:   '#6366f1',
                    strokeWeight:  4,
                    strokeOpacity: 0.8,
                  },
                }}
              />
            )}
          </GoogleMap>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        <p className="text-[11px] text-gray-600 font-medium uppercase tracking-wider">Legend</p>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[11px] text-gray-500 capitalize">{cat}</span>
          </div>
        ))}
        {liveTracking && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-[11px] text-gray-500">You</span>
          </div>
        )}
        {totalLive > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-gray-500">{totalLive} live</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Navigation className="w-3 h-3 text-indigo-400" />
          <span className="text-[11px] text-gray-500">Route: driving</span>
        </div>
      </div>
    </div>
  )
}
