# TripPulse

**[Live Demo →](https://trippulse.vercel.app)** &nbsp;|&nbsp; Built for the [SpacetimeDB](https://spacetimedb.com) Hackathon

> 🏆 **Selected as a Top 10 Team** in the SpacetimeDB Hackathon — out of 71 teams and 125+ participants, and presented a live demo to the judges.

**[Watch Demo Video →](https://www.loom.com/share/e7b891daa2a5492ab4c41b0e3899ac2f)**

TripPulse is a real-time collaborative trip planner powered by **SpacetimeDB** — a serverless database that combines your database, server logic, and real-time sync into a single Rust module. No separate backend, no WebSocket glue code, no REST API boilerplate. SpacetimeDB handles all of it.

Plan trips together with friends — vote on places, generate AI-optimized day-by-day itineraries, and track your journey live, all synced in real time across everyone in the trip.

## Features

- **Real-time collaboration** — SpacetimeDB keeps all trip members in sync instantly; every vote, place add, and itinerary update is reflected live for everyone
- **AI itinerary generation** — GPT-4o with live web search generates a complete day-by-day plan, including timings, transport between stops, costs, ratings, and insider tips
- **Group voting system** — Search and propose places; every member votes Yes/No; the organizer generates the plan from winning picks or lets AI decide on ties
- **Backup alternatives** — The AI generates 1–2 fallback places for every stop at plan-creation time; if a venue is closed, the trip owner starts a group vote to swap in the backup
- **Add to existing plan** — After a plan exists, vote on new places and the AI integrates them into the existing itinerary at the optimal day and time
- **Day-by-day sidebar** — Navigate days with a sidebar; each day shows its stops, timings, transport legs, and backup alternatives
- **Interactive map** — Google Maps integration with itinerary pins, clusters, and place search
- **Discover panel** — Finds nearby restaurants, attractions, and hotels via OpenStreetMap Overpass API
- **Presence & live location** — See who's viewing each day; share live GPS during the trip
- **Notifications** — Bell panel shows pending place votes from other members

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | SpacetimeDB v1.0 (Rust module) |
| AI | OpenAI Responses API (`gpt-4o` + `web_search_preview`) |
| Maps | Google Maps JS API + Places Autocomplete |
| Places | OpenStreetMap Overpass + Nominatim |

## Project Structure

```
tripPlan/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/   # UI components (ItineraryTab, MapTab, NotificationPanel, etc.)
│   │   ├── contexts/     # StdbContext — SpacetimeDB data + polling
│   │   ├── hooks/        # useAuth, useTrips, useTripData
│   │   ├── lib/          # stdb.ts (SpacetimeDB HTTP client), googleMaps.ts
│   │   ├── pages/        # Login, SignUp, Dashboard, TripRoom, JoinTrip
│   │   └── services/     # aiService.ts, placesService.ts
│   └── .env.example      # Required environment variables
└── server/          # SpacetimeDB Rust module
    └── src/lib.rs   # 11 tables, 22 reducers
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) + Cargo
- [SpacetimeDB CLI](https://spacetimedb.com/install)

### 1. Clone and install

```bash
git clone https://github.com/Dipen0210/trippulse.git
cd trippulse
cd client && npm install
```

### 2. Configure environment variables

```bash
cp client/.env.example client/.env
```

Edit `client/.env` and fill in your keys:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_AI_API_KEY=your_openai_api_key
VITE_STDB_HOST=http://localhost:3000
VITE_STDB_MODULE=trippulse
```

### 3. Start SpacetimeDB and deploy the server module

```bash
# Start local SpacetimeDB server
spacetime start

# In a new terminal, publish the Rust module
cd server
spacetime publish --server local trippulse
```

### 4. Run the frontend

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Why SpacetimeDB?

Traditional real-time apps require stitching together a database, an application server, and a WebSocket layer. SpacetimeDB collapses all three into a single Rust module:

- **Reducers** replace REST endpoints — write plain Rust functions, SpacetimeDB exposes them as transactional RPC calls
- **Tables** are defined in Rust with `#[table]` and are instantly queryable via SQL over HTTP
- **Real-time sync** is built-in — clients poll table changes without extra infrastructure
- **Identity** is first-class — every client gets a cryptographic identity on first connection

TripPulse uses SpacetimeDB's HTTP REST API directly from React:
- `POST /v1/identity` — create or restore a user identity
- `POST /v1/database/{module}/call/{reducer}` — call any reducer
- `POST /v1/database/{module}/sql` — run SQL queries against live tables

## SpacetimeDB Schema

The backend module defines **11 tables** and **22 reducers**:

**Tables:**
| Table | Purpose |
|---|---|
| `user_profile` | User accounts (username, email, avatar color) |
| `trip` | Trip metadata (destination, dates, origin) |
| `trip_member` | Trip membership and roles |
| `trip_invite` | Shareable invite codes |
| `itinerary_item` | Per-day stops with times, transport, tips, ratings |
| `trip_day_meta` | AI-generated day titles, summaries, warnings |
| `trip_ai_content` | AI tips, arrival options, user preferences |
| `presence` | Which day each member is currently viewing |
| `live_location` | Real-time GPS position during active trips |
| `place_proposal` | Proposed places pending group vote |
| `place_vote` | Individual Yes/No votes on proposals |

**Key reducers:** `register`, `create_trip`, `update_trip`, `delete_trip`, `join_trip`, `join_trip_open`, `remove_member`, `add_itinerary_item`, `remove_itinerary_item`, `toggle_visited`, `delete_trip_items`, `upsert_day_meta`, `update_ai_content`, `update_presence`, `update_live_location`, `propose_place`, `vote_place`, `remove_vote`, `remove_proposal`, `clear_trip_proposals`

## How the AI Flow Works

1. **Group vote phase** — Members search for places and vote; the ADD panel shows live vote counts
2. **Generate plan** — The organizer clicks Generate; GPT-4o receives all winning places + trip preferences and builds a geographically clustered day-by-day itinerary with transport legs, meal stops, costs, and ratings
3. **Backup alternatives** — The AI also generates 1–2 fallback places per stop (same time slot, nearby, second-priority); these are stored as proposals and shown in each day's "Backup alternatives" panel
4. **Add to existing plan** — After a plan is live, members can vote on new places; the AI receives the full current plan and integrates the new places at the optimal day and time without disrupting existing stops
5. **Swap a backup in** — If a main venue is closed, the trip owner taps "Start group vote" on a backup; everyone votes and the owner confirms to add it

## API Keys Needed

| Key | Where to get it |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) — enable Maps JS API + Places API |
| `VITE_AI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) |
