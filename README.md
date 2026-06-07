# TripPulse

A real-time collaborative trip planner built with SpacetimeDB and React. Plan trips together with friends — add itinerary items, discover places on a map, and get AI-generated suggestions, all synced live across everyone in the trip.

## Features

- **Real-time collaboration** — SpacetimeDB keeps all trip members in sync instantly
- **AI itinerary generation** — GPT-4o with web search generates day-by-day itineraries based on your destination and dates
- **Interactive map** — Google Maps integration with place search and itinerary pins
- **Discover panel** — Finds nearby restaurants, attractions, and hotels via OpenStreetMap Overpass API
- **Trip management** — Create trips, invite members via link, manage itinerary items per day
- **Presence tracking** — See who's currently viewing the trip room

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | SpacetimeDB v1.0 (Rust module) |
| AI | OpenAI Responses API (`gpt-4o` + `web_search_preview`) |
| Maps | Google Maps JS API |
| Places | OpenStreetMap Overpass + Nominatim |

## Project Structure

```
tripPlan/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/   # UI components (Navbar, TripCard, modals, etc.)
│   │   ├── contexts/     # StdbContext — SpacetimeDB data + 5s polling
│   │   ├── hooks/        # useAuth, useTrips, useTripData
│   │   ├── lib/          # stdb.ts (SpacetimeDB HTTP client), googleMaps.ts
│   │   ├── pages/        # Login, SignUp, Dashboard, TripRoom, JoinTrip
│   │   └── services/     # aiService.ts, placesService.ts
│   └── .env.example      # Required environment variables
└── server/          # SpacetimeDB Rust module
    └── src/lib.rs   # 8 tables, 16 reducers
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

## SpacetimeDB Schema

The backend module defines 8 tables and 16 reducers:

**Tables:** `user_profile`, `trip`, `trip_member`, `trip_invite`, `itinerary_item`, `trip_day_meta`, `trip_ai_content`, `presence`

**Key reducers:** `register`, `create_trip`, `join_trip`, `add_itinerary_item`, `toggle_visited`, `update_ai_content`, `update_presence`

## API Keys Needed

| Key | Where to get it |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) — enable Maps JS API + Places API |
| `VITE_AI_API_KEY` | [OpenAI Platform](https://platform.openai.com/api-keys) |
