import type { PlaceCategory, TransportHop, TripArrival, TravelOption, TravelMode } from '../types'

export interface AIPlaceChange {
  placeName: string
  originalDay: number
  newDay: number
  reason: string
}

// Uses the OpenAI Responses API with web_search_preview so the model can look up
// real Google ratings, current reviews, and existing travel guides before planning.
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MODEL = 'gpt-4o'

export interface AIStop {
  name: string
  category: PlaceCategory
  address: string
  lat?: number
  lng?: number
  time: string
  duration: string
  tip: string
  isFree?: boolean
  cost?: string
  rating?: number       // Google / TripAdvisor rating out of 5
  reviewCount?: string  // e.g. "12,400" or "4.2K"
  bookingNote?: string
  bookingUrl?: string
  transportToNext?: TransportHop
}

export interface AIDay {
  day: number
  title: string
  summary: string
  warning?: string
  stops: AIStop[]
}

export interface AIItinerary {
  days: AIDay[]
  tips: string[]
  arrival?: TripArrival
  changes?: AIPlaceChange[]
}

export interface SelectedPlaceInput {
  name: string
  category: PlaceCategory
  address: string
  lat?: number
  lng?: number
  /** Preferred day, if the user set one. 0 / undefined = no preference, AI decides. */
  userDay?: number
}

export interface GenerateFromPlacesParams {
  destination: string
  country: string
  origin?: string
  originLat?: number
  originLng?: number
  totalDays: number
  startDate?: string
  pace: 'relaxed' | 'moderate' | 'packed'
  budgetLevel: 'budget' | 'mid-range' | 'luxury'
  interests: string[]
  transportModes: string[]
  selectedPlaces: SelectedPlaceInput[]
  /** Tie-voted places: the group was split, AI decides whether each is worth including. */
  candidatePlaces?: SelectedPlaceInput[]
}

export interface GenerateParams {
  destination: string
  country: string
  origin?: string
  originLat?: number
  originLng?: number
  totalDays: number
  startDate?: string
  pace: 'relaxed' | 'moderate' | 'packed'
  budgetLevel: 'budget' | 'mid-range' | 'luxury'
  interests: string[]
  transportModes: string[]
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const VALID_CATEGORIES: PlaceCategory[] = ['attraction', 'restaurant', 'hotel', 'activity', 'other']

function coerceCategory(value: unknown): PlaceCategory {
  return VALID_CATEGORIES.includes(value as PlaceCategory) ? (value as PlaceCategory) : 'other'
}

// Collect the model's text from a Responses-API payload. Concatenates every
// output_text chunk across all message items (and falls back to the
// convenience `output_text` field) so partial/split responses still parse.
function extractOutputText(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>
  if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text

  const outputItems: unknown[] = Array.isArray(d.output) ? d.output : []
  const parts: string[] = []
  for (const item of outputItems) {
    const it = (item ?? {}) as Record<string, unknown>
    if (it.type !== 'message') continue
    const content = Array.isArray(it.content) ? it.content : []
    for (const c of content) {
      const cc = (c ?? {}) as Record<string, unknown>
      if ((cc.type === 'output_text' || cc.type === 'text') && typeof cc.text === 'string') {
        parts.push(cc.text)
      }
    }
  }
  return parts.join('').trim()
}

// Scan forward from startIdx to find the closing bracket that balances the
// opening bracket at startIdx, correctly skipping over JSON string contents.
function findJsonEnd(text: string, startIdx: number): number {
  const open = text[startIdx]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (inString) { if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue }
    if (ch === '"') { inString = true; continue }
    if (ch === open) depth++
    else if (ch === close) { if (--depth === 0) return i }
  }
  return -1
}

// Parse JSON that may be wrapped in markdown fences or surrounded by prose.
function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim()

  // Try 1: direct parse (model followed "return only JSON" instruction)
  try { return JSON.parse(trimmed) } catch { /* fall through */ }

  // Try 2: strip a single markdown code fence
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
  }

  // Try 3: find the first complete { } or [ ] block, skipping string contents
  for (const open of ['{', '['] as const) {
    const start = trimmed.indexOf(open)
    if (start === -1) continue
    const end = findJsonEnd(trimmed, start)
    if (end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { /* fall through */ }
    }
  }

  throw new Error('AI returned malformed JSON. Try again.')
}

function buildPrompt(p: GenerateParams): string {
  const stopsPerDay = p.pace === 'relaxed' ? '4–5' : p.pace === 'packed' ? '6–7' : '5–6'
  const interests = p.interests.length
    ? p.interests.join(', ')
    : 'iconic landmarks, culture, great food'

  // Estimate distance to set AI expectations for travel modes
  let distanceNote = ''
  if (p.origin && p.originLat != null && p.originLng != null) {
    const distKm = haversineKm(p.originLat, p.originLng, 0, 0) // placeholder — AI uses origin name
    if (distKm < 50) distanceNote = 'The origin is very close (same metro area) — transit/drive/walk are viable.'
    else if (distKm < 400) distanceNote = 'The origin is a nearby city — train, bus, or drive are the main options. Flight is overkill.'
    else if (distKm < 2000) distanceNote = 'The origin is a domestic distance — flight or long train/bus are both viable.'
    else distanceNote = 'The origin is an international/long-haul distance — flight is the primary mode.'
  }

  return `You are the world's best travel planner. A traveler is visiting ${p.destination}, ${p.country} for ${p.totalDays} days.

STEP 1 — RESEARCH (use web search):
Before planning, search for:
1. "best restaurants in ${p.destination} with Google ratings" — find highly-rated local restaurants (4.3+ stars, 1000+ reviews)
2. "top attractions in ${p.destination} Google Maps reviews" — get real ratings and review counts
3. "best ${p.totalDays} day ${p.destination} itinerary ${new Date().getFullYear()}" — study 2–3 existing popular travel plans
4. "${p.destination} food scene must-try dishes local favorites" — find authentic local food stops${p.origin ? `
5. "how to get from ${p.origin} to ${p.destination}" — find real transport options with current prices and durations` : ''}

STEP 2 — PLAN:
Using what you found, build the optimized itinerary.

TRIP DETAILS:
- Destination: ${p.destination}, ${p.country}
${p.origin ? `- Coming from: ${p.origin}` : ''}
${p.startDate ? `- Start date: ${p.startDate}` : ''}
- Duration: ${p.totalDays} days
- Budget: ${p.budgetLevel}
- Pace: ${p.pace}
- Interests: ${interests}
- Transport (within city): ${p.transportModes.join(', ') || 'walking, public transit'}
${distanceNote ? `- Distance context: ${distanceNote}` : ''}

PLANNING RULES:
${p.origin ? `
**GETTING THERE (from ${p.origin} → ${p.destination}):**
Based on your web search, list ALL viable travel options. For each option include:
- "mode": one of flight | train | bus | drive | ferry | transit
- "duration": total travel time e.g. "1h 24min", "4h 30min"
- "detail": specific service name and route, e.g. "NJ Transit NEC from New Brunswick → New York Penn Station" or "Delta non-stop JFK → NRT"
- "cost": price range e.g. "$20–35", "$350–600"
- "bookingUrl": official booking site URL if available
- "recommended": true for the best option (fastest + most practical)
Only include modes that are genuinely viable (don't list "walk" for 500km trips, don't list "flight" if it's a 30-min drive).
` : ''}
**Day structure — MUST include ALL of these every day:**
- Morning: 1–2 major attractions (go early to beat crowds)
- Midday: 1 lunch stop (category: "restaurant") — a highly-rated local spot near the morning cluster
- Afternoon: 1–2 attractions or activities
- Evening: 1 dinner stop (category: "restaurant") — authentic local cuisine, mention what to order
Total: ${stopsPerDay} stops per day, including at least 2 meal stops (lunch + dinner)

**Geographic clustering:**
Each day must stay in a tight geographic cluster (10–15 min travel max between stops). Name the day after its neighborhood. Never send a traveler across town for lunch.

**Every stop MUST include all of these fields:**
- "name": exact official name
- "category": attraction | restaurant | hotel | activity | other
- "address": street address or neighborhood
- "lat" + "lng": real decimal coordinates
- "time": suggested arrival, e.g. "9:00 AM"
- "duration": how long to spend, e.g. "1–1.5 hrs" (for restaurants: "45–60 min")
- "tip": 2–3 sentences — WHY this place, what to order (restaurants), which section to see first (attractions), what to skip
- "isFree": true if entirely free to enter, false otherwise
- "cost": admission / average meal cost if not free, e.g. "$30", "$15–25 per person", "Pay-what-you-wish"
- "rating": Google Maps rating as a number, e.g. 4.7 (use real ratings from your search)
- "reviewCount": review count string, e.g. "7,629" or "12K" (use real counts from your search)
- "bookingNote": only for timed-entry or sell-out attractions — e.g. "Book timed entry online ($30)" — omit for walk-ins and restaurants
- "bookingUrl": official ticketing URL if bookingNote exists

**Transport between stops:**
For every stop EXCEPT the last of each day, add "transportToNext":
- "mode": exact line name — "Walk", "Subway A/C/E", "Subway 4/5/6", "Bus M15", "Taxi", "Ferry"
- "distance": e.g. "0.6 mi"
- "duration": e.g. "8 min"
- "detail": one clear direction sentence, e.g. "Walk 3 blocks north on 5th Ave" or "Take the 6 train uptown from 51 St → 86 St (3 stops)"

**Per-day warning:**
Each day gets a "warning" — one actionable sentence covering closures, pricing surprises, or timing must-knows. e.g. "The Met is closed Tuesdays — plan Day 2 on any other day." or "9/11 Museum requires timed entry — book ahead."

**Trip-wide tips (5–7 entries):**
- Book NOW (months in advance, sells out): what + how
- Book a few days before: what + how
- Day-of app trick (e.g. TKTS, last-minute deals)
- Transit pass: what to buy, where, cost
- Food tip: best neighborhood for food, when to go
- Stay tip: which neighborhood minimizes travel

OUTPUT — return ONLY valid JSON, no markdown fences, no commentary:
{
  "days": [
    {
      "day": 1,
      "title": "Neighborhood — Theme",
      "summary": "one-line day overview",
      "warning": "key closure/timing/pricing advisory",
      "stops": [
        {
          "name": "Place Name",
          "category": "attraction",
          "address": "123 Street, Neighborhood",
          "lat": 40.7580,
          "lng": -73.9855,
          "time": "9:00 AM",
          "duration": "1–1.5 hrs",
          "tip": "Insider advice, what to prioritize, crowd tips.",
          "isFree": false,
          "cost": "$30",
          "rating": 4.7,
          "reviewCount": "7,629",
          "bookingNote": "Book timed entry online ($30)",
          "bookingUrl": "https://example.com/tickets",
          "transportToNext": {
            "mode": "Subway 4/5/6",
            "distance": "1.2 mi",
            "duration": "8 min",
            "detail": "Take the downtown 4/5/6 from 86 St to 42 St–Grand Central (4 stops)"
          }
        },
        {
          "name": "Local Restaurant Name",
          "category": "restaurant",
          "address": "456 Ave, Neighborhood",
          "lat": 40.7600,
          "lng": -73.9800,
          "time": "12:30 PM",
          "duration": "45–60 min",
          "tip": "Order the [signature dish]. Busy on weekends — arrive right at open.",
          "isFree": false,
          "cost": "$18–28 per person",
          "rating": 4.5,
          "reviewCount": "3,200",
          "transportToNext": {
            "mode": "Walk",
            "distance": "0.4 mi",
            "duration": "8 min",
            "detail": "Head south on Broadway to reach the museum entrance"
          }
        }
      ]
    }
  ],
  "tips": [
    "Book now (sells out months ahead): ...",
    "Book 1–2 weeks before: ...",
    "Day-of app: ...",
    "Transit: ...",
    "Food: ...",
    "Stay: ..."
  ]${p.origin ? `,
  "arrival": {
    "from": "${p.origin}",
    "to": "${p.destination}",
    "distanceKm": 120,
    "options": [
      { "mode": "train", "duration": "1h 24min", "detail": "NJ Transit NEC: New Brunswick → Penn Station", "cost": "$20–35", "bookingUrl": "https://njtransit.com", "recommended": true },
      { "mode": "drive", "duration": "1h 10min", "detail": "Via I-95 N / NJ Turnpike to Lincoln Tunnel", "cost": "$15–20 (tolls + gas)" }
    ]
  }` : ''}
}`
}

export async function generateItinerary(params: GenerateParams): Promise<AIItinerary> {
  const apiKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('Missing OpenAI API key. Add VITE_AI_API_KEY to client/.env')
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 8192,
      tools: [{ type: 'web_search_preview' }],
      instructions:
        'You are an expert local travel planner. You research real Google ratings, top-reviewed restaurants, and existing popular itineraries before building day-by-day plans. You always respond with strict JSON only — no markdown, no extra text.',
      input: buildPrompt(params),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = extractOutputText(data)
  if (!content) throw new Error('Empty response from AI.')

  try {
    return normalize(parseJsonLoose(content), params.totalDays)
  } catch (e) {
    console.error('[AI] Raw content (first 1000):', content.slice(0, 1000))
    console.error('[AI] Raw content (last 500):', content.slice(-500))
    throw e
  }
}

function buildFromPlacesPrompt(p: GenerateFromPlacesParams): string {
  const stopsPerDay = p.pace === 'relaxed' ? '4–5' : p.pace === 'packed' ? '6–7' : '5–6'
  const interests = p.interests.length
    ? p.interests.join(', ')
    : 'iconic landmarks, culture, great food'

  const dayTag = (d?: number) => (d && d > 0 ? `[Day ${d}] ` : '')
  const anyDayPrefs = p.selectedPlaces.some(pl => pl.userDay && pl.userDay > 0)

  const placesList = p.selectedPlaces
    .map((pl, i) =>
      `  ${i + 1}. ${dayTag(pl.userDay)}${pl.name} (${pl.category}) — ${pl.address}${pl.lat != null ? ` (${pl.lat.toFixed(4)}, ${pl.lng?.toFixed(4)})` : ''}`
    )
    .join('\n')

  const candidates = p.candidatePlaces ?? []
  const candidatesList = candidates
    .map((pl, i) =>
      `  ${i + 1}. ${pl.name} (${pl.category}) — ${pl.address}${pl.lat != null ? ` (${pl.lat.toFixed(4)}, ${pl.lng?.toFixed(4)})` : ''}`
    )
    .join('\n')

  return `You are the world's best travel planner. The group has voted and chosen ${p.selectedPlaces.length} specific places they want to visit in ${p.destination}, ${p.country} over ${p.totalDays} days. Your job is to build a complete, optimized itinerary that includes EVERY one of those places.

STEP 1 — RESEARCH (use web search):
1. "best restaurants near [each selected place cluster] ${p.destination}" — find highly-rated local spots (4.3+ stars, 1000+ reviews) for lunch and dinner near each cluster
2. "${p.destination} neighborhoods map districts" — understand the geography so you can cluster nearby places on the same day
3. "opening hours admission tips for [the selected places] ${p.destination}" — get real current info${p.origin ? `
4. "how to get from ${p.origin} to ${p.destination}" — real transport options with prices` : ''}

STEP 2 — BUILD THE PLAN:

TRIP DETAILS:
- Destination: ${p.destination}, ${p.country}
${p.origin ? `- Coming from: ${p.origin}` : ''}
${p.startDate ? `- Start date: ${p.startDate}` : ''}
- Duration: ${p.totalDays} days
- Budget: ${p.budgetLevel}
- Pace: ${p.pace} (${stopsPerDay} stops/day)
- Interests: ${interests}
- Transport within city: ${p.transportModes.join(', ') || 'walking, public transit'}

MANDATORY PLACES — include ALL ${p.selectedPlaces.length} of these in the final plan, no exceptions:
${placesList}

${anyDayPrefs
  ? 'The number in [Day X] above is the preferred day for that place. Honor those day assignments whenever geographically sensible. You may reassign a place to a different day ONLY when doing so significantly improves geographic clustering (saves 30+ minutes of unnecessary cross-city travel). Never move a place for a trivial reason.'
  : 'The group did NOT assign days — that is YOUR job. Distribute these mandatory places across the ' + p.totalDays + ' days to form tight geographic clusters (group nearby places on the same day), balance the load evenly across days, and order each day sensibly from morning to evening. Decide the best day for each place yourself.'}
${candidates.length > 0 ? `
CANDIDATE PLACES — the group VOTED and was evenly split (tie) on these. YOU decide whether each is worth including:
${candidatesList}
For each candidate, use web research, its quality/ratings, how well it fits the day's geographic cluster, and the time available to judge whether it earns a spot. Include the ones that genuinely improve the trip; silently drop the ones that don't add enough value or don't fit the schedule. Do NOT list candidates in the "changes" array.
` : ''}
PLANNING RULES:
**Mandatory places:** Every place listed above must appear in the output exactly once, matched by name.

**Fill each day with meals:** Add 1 lunch stop + 1 dinner stop per day — a highly-rated local restaurant near that day's cluster. Do not count these as one of the mandatory places above, they are additions.

**Geographic clustering:**
Each day must stay in a tight geographic cluster (10–15 min max between stops). Name each day after its neighborhood. If the traveler's day assignments already form sensible clusters, keep them. Only move a place if it clearly belongs in a different day's cluster.

**Day reassignment rule:** ${anyDayPrefs
  ? `For every mandatory place you move to a different day than was specified, you MUST add an entry in the "changes" array:
- "placeName": exact name as listed above
- "originalDay": the day it was assigned to
- "newDay": the day you put it in
- "reason": one clear sentence explaining why — name the geographic reason (e.g. "Clustered with Day 3 because it's in the Shinjuku area, 4 min walk from your other Day 3 selections, vs. 40 min from Day 1's Asakusa cluster.")

If you keep every place on its originally assigned day, return "changes": [].`
  : 'No days were pre-assigned, so there is nothing to "move" — return "changes": [].'}

**Every stop MUST include all of these fields:**
- "name": exact official name (for mandatory places, match the name exactly as listed)
- "category": attraction | restaurant | hotel | activity | other
- "address": street address or neighborhood
- "lat" + "lng": real decimal coordinates
- "time": suggested arrival, e.g. "9:00 AM"
- "duration": how long to spend, e.g. "1–1.5 hrs"
- "tip": 2–3 sentences — WHY this place, what to order (restaurants), insider tips
- "isFree": true if entirely free to enter, false otherwise
- "cost": admission / meal cost if not free
- "rating": Google Maps rating as a number (use real ratings from your research)
- "reviewCount": review count string from real data
- "bookingNote": only for timed-entry / sell-out attractions
- "bookingUrl": official ticketing URL if bookingNote exists

**Transport between stops:**
For every stop except the last of each day, add "transportToNext":
- "mode": exact line/mode name — "Walk", "Subway A/C/E", "Bus M15", "Taxi"
- "distance": e.g. "0.6 mi"
- "duration": e.g. "8 min"
- "detail": one direction sentence

**Per-day warning:** Each day gets a "warning" — one actionable sentence about closures, pricing, or timing.

**Trip-wide tips (5–7 entries):** Book-ahead warnings, transit passes, food tips, stay tip.
${p.origin ? `
**Getting there:** Search real transport options from ${p.origin} → ${p.destination}, list all viable modes with duration, cost, booking URL.` : ''}

OUTPUT — return ONLY valid JSON, no markdown fences, no commentary:
{
  "days": [
    {
      "day": 1,
      "title": "Neighborhood — Theme",
      "summary": "one-line day overview",
      "warning": "key closure/timing advisory",
      "stops": [
        {
          "name": "Exact Place Name",
          "category": "attraction",
          "address": "123 Street, Neighborhood",
          "lat": 0.0000,
          "lng": 0.0000,
          "time": "9:00 AM",
          "duration": "1–1.5 hrs",
          "tip": "Insider advice here.",
          "isFree": false,
          "cost": "$30",
          "rating": 4.7,
          "reviewCount": "7,629",
          "bookingNote": "Book timed entry online",
          "bookingUrl": "https://example.com/tickets",
          "transportToNext": {
            "mode": "Walk",
            "distance": "0.4 mi",
            "duration": "8 min",
            "detail": "Head south on Main St"
          }
        }
      ]
    }
  ],
  "tips": ["Book now: ...", "Transit: ...", "Food: ..."],
  "changes": [
    {
      "placeName": "Place Name",
      "originalDay": 2,
      "newDay": 1,
      "reason": "Moved to Day 1 — it's in the Old Town cluster, a 5-min walk from your other Day 1 picks, vs. 40 min from Day 2's waterfront area."
    }
  ]${p.origin ? `,
  "arrival": {
    "from": "${p.origin}",
    "to": "${p.destination}",
    "distanceKm": 120,
    "options": [
      { "mode": "train", "duration": "1h 24min", "detail": "Service details", "cost": "$20–35", "bookingUrl": "https://example.com", "recommended": true }
    ]
  }` : ''}
}`
}

export async function generateFromSelectedPlaces(params: GenerateFromPlacesParams): Promise<AIItinerary> {
  const apiKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('Missing OpenAI API key. Add VITE_AI_API_KEY to client/.env')
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 8192,
      tools: [{ type: 'web_search_preview' }],
      instructions:
        'You are an expert local travel planner. You must include every place the traveler selected. You research real ratings, restaurants, and geography before optimizing day clusters. Respond with strict JSON only — no markdown, no extra text.',
      input: buildFromPlacesPrompt(params),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = extractOutputText(data)
  if (!content) throw new Error('Empty response from AI.')

  try {
    return normalizeWithChanges(parseJsonLoose(content), params.totalDays)
  } catch (e) {
    console.error('[AI] Raw content (first 1000):', content.slice(0, 1000))
    console.error('[AI] Raw content (last 500):', content.slice(-500))
    throw e
  }
}

// ── Per-day gap-filling recommendations ───────────────────────────────────────

export interface SuggestDayParams {
  destination: string
  country: string
  day: number
  dayTitle?: string
  existingPlaces: { name: string; category: PlaceCategory }[]
  interests: string[]
  budgetLevel: 'budget' | 'mid-range' | 'luxury'
  count?: number
}

function buildSuggestDayPrompt(p: SuggestDayParams): string {
  const count = p.count ?? 4
  const interests = p.interests.length ? p.interests.join(', ') : 'iconic landmarks, culture, great food'
  const existing = p.existingPlaces.length
    ? p.existingPlaces.map(e => `- ${e.name} (${e.category})`).join('\n')
    : '(nothing planned yet)'

  return `You are a top local guide for ${p.destination}, ${p.country}. The traveler is building Day ${p.day}${p.dayTitle ? ` ("${p.dayTitle}")` : ''} of their trip and wants extra recommendations to fill the gaps and make the day great.

ALREADY ON THIS DAY (do NOT repeat any of these):
${existing}

TASK — use web search to find REAL, currently-open, highly-rated spots (4.3+ stars where possible). Recommend ${count} additions for this day that:
- Complement what's already planned and stay geographically close to it (avoid sending them across town).
- Include at least ONE highly-rated local restaurant or cafe to eat at (category "restaurant").
- Include at least ONE famous activity or attraction worth doing (category "attraction" or "activity").
- Match the traveler's interests: ${interests}. Budget: ${p.budgetLevel}.
- Are NOT duplicates of the already-planned places above.

Each recommendation MUST include all of these fields:
- "name": exact official name
- "category": attraction | restaurant | hotel | activity | other
- "address": street address or neighborhood
- "lat" + "lng": real decimal coordinates
- "time": a sensible suggested time, e.g. "1:00 PM"
- "duration": how long to spend, e.g. "1–1.5 hrs"
- "tip": 1–2 sentences — why it's worth it / what to order / insider note
- "isFree": true if free to enter, else false
- "cost": admission or average meal cost if not free
- "rating": Google Maps rating number (real)
- "reviewCount": review count string (real)

OUTPUT — return ONLY valid JSON, no markdown fences, no commentary:
{
  "suggestions": [
    {
      "name": "Place Name",
      "category": "restaurant",
      "address": "123 Street, Neighborhood",
      "lat": 0.0000,
      "lng": 0.0000,
      "time": "1:00 PM",
      "duration": "45–60 min",
      "tip": "Order the signature dish; busy at lunch.",
      "isFree": false,
      "cost": "$15–25 per person",
      "rating": 4.6,
      "reviewCount": "3,200"
    }
  ]
}`
}

export async function suggestDayAdditions(p: SuggestDayParams): Promise<AIStop[]> {
  const apiKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('Missing OpenAI API key. Add VITE_AI_API_KEY to client/.env')
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 4096,
      tools: [{ type: 'web_search_preview' }],
      instructions:
        'You are an expert local travel guide. You research real Google ratings and currently-open places before recommending. You always respond with strict JSON only — no markdown, no extra text.',
      input: buildSuggestDayPrompt(p),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = extractOutputText(data)
  if (!content) throw new Error('Empty response from AI.')

  const parsed = parseJsonLoose(content)
  const obj = (parsed ?? {}) as Record<string, unknown>
  const rawList = Array.isArray(obj.suggestions)
    ? obj.suggestions
    : Array.isArray(parsed) ? (parsed as unknown[]) : []

  const existingNames = new Set(p.existingPlaces.map(e => e.name.toLowerCase().trim()))

  return rawList
    .map(s => {
      const stop = (s ?? {}) as Record<string, unknown>
      return {
        name: String(stop.name ?? '').trim(),
        category: coerceCategory(stop.category),
        address: String(stop.address ?? ''),
        lat: typeof stop.lat === 'number' ? stop.lat : undefined,
        lng: typeof stop.lng === 'number' ? stop.lng : undefined,
        time: String(stop.time ?? ''),
        duration: String(stop.duration ?? ''),
        tip: String(stop.tip ?? ''),
        isFree: stop.isFree === true,
        cost: stop.cost ? String(stop.cost) : undefined,
        rating: typeof stop.rating === 'number' ? stop.rating : undefined,
        reviewCount: stop.reviewCount ? String(stop.reviewCount) : undefined,
      } as AIStop
    })
    .filter(s => s.name && !existingNames.has(s.name.toLowerCase().trim()))
}

function normalizeWithChanges(raw: unknown, totalDays: number): AIItinerary {
  const base = normalize(raw, totalDays)

  const obj = (raw ?? {}) as Record<string, unknown>
  const rawChanges = Array.isArray(obj.changes) ? obj.changes : []
  const changes: AIPlaceChange[] = rawChanges
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map(c => ({
      placeName: String(c.placeName ?? ''),
      originalDay: typeof c.originalDay === 'number' ? c.originalDay : 0,
      newDay: typeof c.newDay === 'number' ? c.newDay : 0,
      reason: String(c.reason ?? ''),
    }))
    .filter(c => c.placeName && c.originalDay !== c.newDay)

  return { ...base, changes: changes.length > 0 ? changes : undefined }
}

function normalize(raw: unknown, totalDays: number): AIItinerary {
  const obj = (raw ?? {}) as Record<string, unknown>
  const rawDays = Array.isArray(obj.days) ? obj.days : []

  const days: AIDay[] = rawDays.slice(0, totalDays).map((d, i) => {
    const day = (d ?? {}) as Record<string, unknown>
    const rawStops = Array.isArray(day.stops) ? day.stops : []
    const stops: AIStop[] = rawStops.map(s => {
      const stop = (s ?? {}) as Record<string, unknown>
      const hop = stop.transportToNext as Record<string, unknown> | undefined
      const transportToNext: TransportHop | undefined = hop?.mode
        ? {
            mode: String(hop.mode),
            distance: String(hop.distance ?? ''),
            duration: String(hop.duration ?? ''),
            detail: hop.detail ? String(hop.detail) : undefined,
          }
        : undefined

      return {
        name: String(stop.name ?? 'Unnamed stop'),
        category: coerceCategory(stop.category),
        address: String(stop.address ?? ''),
        lat: typeof stop.lat === 'number' ? stop.lat : undefined,
        lng: typeof stop.lng === 'number' ? stop.lng : undefined,
        time: String(stop.time ?? ''),
        duration: String(stop.duration ?? ''),
        tip: String(stop.tip ?? ''),
        isFree: stop.isFree === true,
        cost: stop.cost ? String(stop.cost) : undefined,
        rating: typeof stop.rating === 'number' ? stop.rating : undefined,
        reviewCount: stop.reviewCount ? String(stop.reviewCount) : undefined,
        bookingNote: stop.bookingNote ? String(stop.bookingNote) : undefined,
        bookingUrl: stop.bookingUrl ? String(stop.bookingUrl) : undefined,
        transportToNext,
      }
    })

    return {
      day: typeof day.day === 'number' ? day.day : i + 1,
      title: String(day.title ?? `Day ${i + 1}`),
      summary: String(day.summary ?? ''),
      warning: day.warning ? String(day.warning) : undefined,
      stops,
    }
  })

  const tips = Array.isArray(obj.tips) ? obj.tips.map(t => String(t)).filter(Boolean) : []

  // Parse arrival / getting-there section
  let arrival: TripArrival | undefined
  const rawArrival = obj.arrival as Record<string, unknown> | undefined
  if (rawArrival?.from && Array.isArray(rawArrival.options)) {
    const VALID_MODES: TravelMode[] = ['flight', 'train', 'bus', 'drive', 'ferry', 'transit']
    const options: TravelOption[] = (rawArrival.options as Record<string, unknown>[])
      .filter(o => VALID_MODES.includes(o.mode as TravelMode))
      .map(o => ({
        mode: o.mode as TravelMode,
        duration: String(o.duration ?? ''),
        detail: String(o.detail ?? ''),
        cost: o.cost ? String(o.cost) : undefined,
        bookingUrl: o.bookingUrl ? String(o.bookingUrl) : undefined,
        recommended: o.recommended === true,
      }))
    if (options.length > 0) {
      arrival = {
        from: String(rawArrival.from),
        to: String(rawArrival.to ?? ''),
        distanceKm: typeof rawArrival.distanceKm === 'number' ? rawArrival.distanceKm : undefined,
        options,
      }
    }
  }

  if (days.length === 0) throw new Error('AI did not return any days. Try again.')

  return { days, tips, arrival }
}

// ── Add new places to an existing plan ────────────────────────────────────────

export interface AddToExistingPlanParams {
  destination: string
  country: string
  totalDays: number
  startDate?: string
  pace: 'relaxed' | 'moderate' | 'packed'
  budgetLevel: 'budget' | 'mid-range' | 'luxury'
  interests: string[]
  transportModes: string[]
  existingDays: AIDay[]
  newPlaces: SelectedPlaceInput[]
}

function buildAddToExistingPlanPrompt(p: AddToExistingPlanParams): string {
  const interests = p.interests.length ? p.interests.join(', ') : 'iconic landmarks, culture, great food'
  const transport = p.transportModes.join(', ') || 'walking, public transit'

  const existingPlanText = p.existingDays.map(d => {
    const stopsText = d.stops.map((s, idx) => {
      const parts = [
        `  ${idx + 1}. [${s.time ?? ''}] ${s.name} (${s.category})`,
        `     Address: ${s.address}`,
        s.lat != null ? `     Coords: (${s.lat.toFixed(4)}, ${s.lng?.toFixed(4)})` : '',
        `     Duration: ${s.duration ?? ''}`,
        s.tip ? `     Tip: ${s.tip}` : '',
        s.transportToNext ? `     → Next: ${s.transportToNext.mode} ${s.transportToNext.duration}` : '',
      ].filter(Boolean).join('\n')
      return parts
    }).join('\n\n')
    return `DAY ${d.day}: ${d.title}\n${d.summary ?? ''}\n${stopsText}`
  }).join('\n\n')

  const newPlacesText = p.newPlaces.map((pl, i) =>
    `  ${i + 1}. ${pl.name} (${pl.category}) — ${pl.address}${pl.lat != null ? ` (${pl.lat.toFixed(4)}, ${pl.lng?.toFixed(4)})` : ''}`
  ).join('\n')

  return `You are an expert travel planner. You have an existing ${p.totalDays}-day itinerary for ${p.destination} that the group already approved. The group has now voted to add new places. Your job is to integrate those new places into the existing plan in the most optimal way.

TRIP DETAILS:
- Destination: ${p.destination}
${p.startDate ? `- Start date: ${p.startDate}` : ''}
- Duration: ${p.totalDays} days
- Budget: ${p.budgetLevel}
- Pace: ${p.pace}
- Interests: ${interests}
- Transport: ${transport}

════════════════════════════════════
EXISTING APPROVED PLAN (keep all existing places, same order on their days):
════════════════════════════════════
${existingPlanText}

════════════════════════════════════
NEW PLACES TO INTEGRATE (${p.newPlaces.length} place${p.newPlaces.length !== 1 ? 's' : ''}):
════════════════════════════════════
${newPlacesText}

INTEGRATION RULES:
1. Keep every single existing stop in the final output — same day assignment, same relative order within the day. Do NOT remove, rename, or move any existing stop to a different day.
2. For each new place: find the day whose geographic cluster is the best match. Insert the new place at the most logical position in that day's schedule (between stops it is physically near, or as a morning/afternoon/evening addition).
3. Update "time" fields across the affected day to reflect the inserted stop — adjust subsequent stop times accordingly.
4. Add or update "transportToNext" for the stop before the new place and for the new place itself.
5. New places must have all required fields: name, category, address, lat, lng, time, duration, tip, isFree, cost, rating, reviewCount, transportToNext (unless last stop).
6. Use web search to find real current ratings and tips for each new place before writing its stop entry.
7. In the "changes" array, for EACH new place list which day you assigned it to and why (geographic proximity to existing stops on that day).
8. Keep all existing day titles, summaries, and warnings — update them only if the new additions genuinely change the day's theme or add a timing advisory.
9. Return ALL ${p.totalDays} days in the output, including days with no changes.

OUTPUT — return ONLY valid JSON, no markdown fences, no commentary:
{
  "days": [
    {
      "day": 1,
      "title": "Neighborhood — Theme",
      "summary": "one-line day overview",
      "warning": "key closure/timing advisory or null",
      "stops": [
        {
          "name": "Exact Place Name",
          "category": "attraction",
          "address": "123 Street, Neighborhood",
          "lat": 0.0000,
          "lng": 0.0000,
          "time": "9:00 AM",
          "duration": "1–1.5 hrs",
          "tip": "Insider advice here.",
          "isFree": false,
          "cost": "$30",
          "rating": 4.7,
          "reviewCount": "7,629",
          "bookingNote": "Book timed entry online",
          "bookingUrl": "https://example.com/tickets",
          "transportToNext": { "mode": "Walk", "distance": "0.4 mi", "duration": "8 min", "detail": "Head south on Main St" }
        }
      ]
    }
  ],
  "tips": ["Updated trip-wide tips if needed..."],
  "changes": [
    { "placeName": "New Place Name", "originalDay": 0, "newDay": 2, "reason": "Inserted into Day 2 — 5-min walk from the Midtown cluster, fits between Museum and Lunch stop." }
  ]
}`
}

export async function addNewPlacesToExistingPlan(params: AddToExistingPlanParams): Promise<AIItinerary> {
  const apiKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('Missing OpenAI API key. Add VITE_AI_API_KEY to client/.env')
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 8192,
      tools: [{ type: 'web_search_preview' }],
      instructions:
        'You are an expert local travel planner. Keep all existing stops exactly as-is and integrate the new places into the best geographic position. Respond with strict JSON only — no markdown, no extra text.',
      input: buildAddToExistingPlanPrompt(params),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = extractOutputText(data)
  if (!content) throw new Error('Empty response from AI.')

  try {
    return normalizeWithChanges(parseJsonLoose(content), params.totalDays)
  } catch (e) {
    console.error('[AI] Raw content (first 1000):', content.slice(0, 1000))
    console.error('[AI] Raw content (last 500):', content.slice(-500))
    throw e
  }
}
