import type { PlaceCategory, DiscoverCategory, DiscoveredPlace } from '../types'

interface CategoryCfg {
  placeCategory: PlaceCategory
  tags: string[]
  photoKeyword: string
}

const CATEGORY_CFG: Record<DiscoverCategory, CategoryCfg> = {
  monuments:     { placeCategory: 'attraction', tags: ['tourism=attraction', 'amenity=museum', 'historic=monument', 'historic=castle', 'historic=church', 'tourism=viewpoint', 'tourism=gallery', 'historic=memorial'], photoKeyword: 'landmark,monument,architecture' },
  food:          { placeCategory: 'restaurant', tags: ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food', 'amenity=food_court', 'amenity=bar'], photoKeyword: 'restaurant,food,dining' },
  shopping:      { placeCategory: 'activity',   tags: ['shop=mall', 'amenity=marketplace', 'shop=department_store', 'shop=supermarket', 'shop=clothes', 'shop=market', 'amenity=market'], photoKeyword: 'shopping,market,bazaar' },
  nature:        { placeCategory: 'activity',   tags: ['leisure=park', 'natural=beach', 'leisure=garden', 'natural=waterfall', 'tourism=zoo', 'leisure=nature_reserve', 'natural=wood'], photoKeyword: 'park,nature,garden' },
  entertainment: { placeCategory: 'activity',   tags: ['amenity=theatre', 'amenity=cinema', 'leisure=amusement_park', 'tourism=theme_park', 'amenity=nightclub', 'leisure=stadium', 'amenity=arts_centre'], photoKeyword: 'entertainment,theatre,culture' },
  hotels:        { placeCategory: 'hotel',       tags: ['tourism=hotel', 'tourism=hostel', 'tourism=guest_house'], photoKeyword: 'hotel,accommodation,luxury' },
}

const bboxCache  = new Map<string, [number, number, number, number]>()
const placesCache = new Map<string, DiscoveredPlace[]>()

async function getCityBbox(city: string): Promise<[number, number, number, number] | null> {
  const key = city.toLowerCase()
  if (bboxCache.has(key)) return bboxCache.get(key)!

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=5`,
    { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'TripPulse/1.0' } }
  )
  const data = await res.json()
  if (!data?.length) return null

  // Prefer city/town/village over state or country so "New York" → NYC not NY State
  type NomResult = { boundingbox: string[]; type: string; class: string }
  const CITY_TYPES = new Set(['city', 'town', 'village', 'municipality'])
  const best: NomResult =
    (data as NomResult[]).find(r => CITY_TYPES.has(r.type)) ?? data[0]

  if (!best?.boundingbox) return null

  const [s, n, w, e] = best.boundingbox.map(Number)

  const maxDeg = 0.8
  const lat = (s + n) / 2
  const lng = (w + e) / 2
  const clamped: [number, number, number, number] = (n - s > maxDeg || e - w > maxDeg)
    ? [lat - maxDeg / 2, lng - maxDeg / 2, lat + maxDeg / 2, lng + maxDeg / 2]
    : [s, w, n, e]

  bboxCache.set(key, clamped)
  return clamped
}

// Build a Wikipedia URL from an OSM wikipedia tag (e.g. "en:Central_Park")
// or fall back to a Wikipedia search URL for the place name + city.
function buildWikipediaUrl(wikiTag: string | undefined, name: string, city: string): string {
  if (wikiTag) {
    const colon = wikiTag.indexOf(':')
    if (colon !== -1) {
      const lang    = wikiTag.slice(0, colon) || 'en'
      const article = wikiTag.slice(colon + 1).replace(/ /g, '_')
      return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article)}`
    }
  }
  // Fallback: Wikipedia search for "Place Name City"
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(`${name} ${city}`)}`
}

async function fetchCategoryPlaces(
  bbox: [number, number, number, number],
  category: DiscoverCategory,
  cityName: string
): Promise<DiscoveredPlace[]> {
  const [s, w, n, e] = bbox
  const bboxStr = `(${s},${w},${n},${e})`
  const cfg = CATEGORY_CFG[category]

  // Fetch nodes AND ways so we get more results (large attractions are often ways/relations)
  const nodeLines = cfg.tags.flatMap(tag => {
    const [k, v] = tag.split('=')
    return [
      `  node["${k}"="${v}"]["name"]${bboxStr};`,
      `  way["${k}"="${v}"]["name"]${bboxStr};`,
    ]
  }).join('\n')

  const query = `[out:json][timeout:25];\n(\n${nodeLines}\n);\nout center 50;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const data = await res.json()

  type OsmElement = {
    type: string
    id: number
    lat?: number
    lon?: number
    center?: { lat: number; lon: number }
    tags: Record<string, string>
  }

  const seen = new Set<string>()

  return (data.elements as OsmElement[])
    .filter(el => {
      if (!el.tags?.name) return false
      const name = el.tags.name.toLowerCase()
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .slice(0, 20)
    .map(el => {
      const name   = el.tags.name
      const lat    = el.lat ?? el.center?.lat ?? 0
      const lng    = el.lon ?? el.center?.lon ?? 0
      const street = el.tags['addr:street'] ?? ''
      const addr   = [street, el.tags['addr:city'] || cityName].filter(Boolean).join(', ')
      const wikiUrl = buildWikipediaUrl(el.tags.wikipedia, name, cityName)

      return {
        id: `${el.type}_${el.id}`,
        name,
        discoverCategory: category,
        placeCategory: cfg.placeCategory,
        lat,
        lng,
        address: addr || cityName,
        photo: '',
        wikipediaUrl: wikiUrl,
      }
    })
}

export async function fetchDiscoverPlaces(city: string): Promise<DiscoveredPlace[]> {
  const key = city.toLowerCase()
  if (placesCache.has(key)) return placesCache.get(key)!

  const bbox = await getCityBbox(city)
  if (!bbox) return []

  const categories: DiscoverCategory[] = ['monuments', 'food', 'nature', 'entertainment', 'shopping', 'hotels']

  const results = await Promise.allSettled(
    categories.map(cat => fetchCategoryPlaces(bbox, cat, city))
  )

  const all = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  placesCache.set(key, all)
  return all
}

// Map a Nominatim result's class/type to one of our discover categories.
function classifyResult(cls: string, type: string): DiscoverCategory {
  const t = `${cls}=${type}`
  if (['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food', 'amenity=food_court', 'amenity=bar', 'amenity=pub'].includes(t)) return 'food'
  if (cls === 'shop' || ['amenity=marketplace', 'amenity=market'].includes(t)) return 'shopping'
  if (cls === 'tourism' && ['hotel', 'hostel', 'guest_house', 'motel', 'apartment'].includes(type)) return 'hotels'
  if (cls === 'leisure' || cls === 'natural' || ['tourism=zoo'].includes(t)) return 'nature'
  if (['amenity=theatre', 'amenity=cinema', 'amenity=nightclub', 'tourism=theme_park', 'leisure=amusement_park', 'leisure=stadium', 'amenity=arts_centre'].includes(t)) return 'entertainment'
  return 'monuments'
}

/**
 * Live free-text search for a place by name (e.g. a specific restaurant or shop),
 * biased to the trip's city. Unlike `fetchDiscoverPlaces`, this hits Nominatim
 * directly with the user's query so arbitrary named places resolve.
 */
export async function searchPlaceByName(query: string, city: string): Promise<DiscoveredPlace[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const bbox = await getCityBbox(city)

  const params = new URLSearchParams({
    q: `${q}, ${city}`,
    format: 'json',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    limit: '12',
  })
  if (bbox) {
    const [s, w, n, e] = bbox
    // Nominatim viewbox order is left,top,right,bottom => w,n,e,s
    params.set('viewbox', `${w},${n},${e},${s}`)
    params.set('bounded', '1')
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'TripPulse/1.0' } }
  )
  if (!res.ok) return []
  const data = await res.json()

  type NomItem = {
    osm_type?: string
    osm_id?: number
    class?: string
    type?: string
    lat: string
    lon: string
    display_name: string
    name?: string
    namedetails?: { name?: string }
    extratags?: { wikipedia?: string }
  }

  const seen = new Set<string>()
  return (data as NomItem[])
    .map(r => {
      const name = r.namedetails?.name || r.name || r.display_name.split(',')[0].trim()
      const category = classifyResult(r.class || '', r.type || '')
      return {
        id: `nom_${r.osm_type ?? 'x'}_${r.osm_id ?? Math.random().toString(36).slice(2)}`,
        name,
        discoverCategory: category,
        placeCategory: CATEGORY_CFG[category].placeCategory,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        address: r.display_name,
        photo: '',
        wikipediaUrl: buildWikipediaUrl(r.extratags?.wikipedia, name, city),
      } as DiscoveredPlace
    })
    .filter(p => {
      const key = p.name.toLowerCase()
      if (!p.name || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export const DISCOVER_CATEGORY_UI: Record<DiscoverCategory, { label: string; emoji: string; active: string; inactive: string }> = {
  monuments:     { label: 'Monuments',     emoji: '🏛️', active: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/40',     inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
  food:          { label: 'Food',          emoji: '🍽️', active: 'bg-amber-500/15 text-amber-400 border-amber-500/40',        inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
  shopping:      { label: 'Shopping',      emoji: '🛍️', active: 'bg-pink-500/15 text-pink-400 border-pink-500/40',           inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
  nature:        { label: 'Nature',        emoji: '🌿', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',  inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
  entertainment: { label: 'Entertainment', emoji: '🎭', active: 'bg-purple-500/15 text-purple-400 border-purple-500/40',     inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
  hotels:        { label: 'Hotels',        emoji: '🏨', active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',           inactive: 'text-gray-500 bg-white/[0.03] border-white/[0.08]' },
}
