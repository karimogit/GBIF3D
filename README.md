# GBIF 3D

**Interactive 3D globe visualization of GBIF biodiversity occurrence data.**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**Developer:** [Karim Osman](https://kar.im)

## About

Explore where species have been recorded on an interactive 3D globe. Data comes from GBIF: millions of observations from museums, surveys, and citizen science.

Pick a region or search for a place, import your own GBIF-style datasets, filter by species or year, and draw your own area. Each dot is an occurrence; colors show IUCN status. Use the **timeline** at the bottom to filter by year. Use **View** for 3D/2D/Columbus, base maps, and optional Photorealistic 3D (Google). Export current data as image, GeoJSON, CSV, or PDF.

Built with Next.js, Cesium (Resium), and the GBIF API.

## Features

- **3D interactive globe** — Pan, zoom, tilt, and rotate using CesiumJS
- **Region selection** — In the top bar: choose a predefined region (World, Europe, Sweden, etc.), search places by name (Nominatim), use “Current view” to follow the camera, or pick a saved favorite
- **Draw region** — Draw a rectangle on the globe (two clicks) to fetch occurrences for that area; save it as a favorite or clear it
- **Saved favorites** — Save current view bounds or a drawn region as a named favorite (stored in browser); quick access from the Region dropdown
- **Real-time GBIF data** — Occurrences fetched by selected region or current view bounds, plus filters
- **Filters** — Species/taxon search (autocomplete), taxonomic group, date range, IUCN Red List status; advanced: Basis of Record, Continent, Country (ISO 2-letter code), Dataset key, Institution code
- **Visualization** — Points on the globe, color-coded by IUCN threat level; points clamp to terrain when zoomed in
- **Tooltips** — Click any point for species name, date, location, photo(s), and link to the GBIF record
- **Terrain** — Cesium World Terrain (optional Ion token); elevation visible when zoomed; occurrence points clamp to the surface
- **Export** — Save current view as PNG image, visible occurrences as GeoJSON or CSV, or generate a PDF report with map snapshot and species summary
- **Accessibility** — Skip link, keyboard focus, color-blind friendly palette, aria-labels on controls
- **Performance** — Caching to reduce API load; configurable result limit (up to 100k in chunks of 1,000)

## Tech stack

- **Frontend:** Next.js 15 (App Router) + TypeScript
- **3D Globe:** CesiumJS with [Resium](https://resium.reearth.io/) for React
- **API:** GBIF v1 (`/occurrence/search`, `/species/suggest`)
- **UI:** Material-UI (MUI) for top bar and filters
- **Deployment:** Vercel-ready

All dependencies are open-source (MIT-compatible).

## Security

- **No secrets in code** — The app uses only the public GBIF API; no API keys are required. The optional Cesium Ion token is read from `NEXT_PUBLIC_CESIUM_ION_TOKEN` (e.g. in Vercel env) and never committed.
- **XSS mitigation** — Text from GBIF (species names, dates, locations) is escaped before being shown in the InfoBox.
- **Lightbox** — Only `https://` image URLs are accepted for the photo lightbox (no `javascript:` or `data:`).
- **API routes** — Occurrence image route validates the key; places search proxies to Nominatim with a proper User-Agent.
- **Dependencies** — Run `npm audit` and address high/critical findings before deployment.

For more detail, see [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md#security-whats-in-place-and-what-to-check).

## Caching and when data refreshes

Occurrence requests to the GBIF API are **cached in memory** (per geometry + filters + offset) to reduce rate-limit risk:

- **When it’s used:** The same search (same region, filters, and limit) returns cached results if the entry is still valid.
- **When it refreshes:**
  - **After 15 minutes:** Each cache entry expires after 15 minutes. The next request for that search then calls the API again.
  - **On page reload:** The cache is empty (in-memory only), so the first load after a refresh always hits the API.
- **Not persisted:** We don’t store the cache in `localStorage` or `sessionStorage` because occurrence responses can be large; keeping them in memory avoids storage limits and keeps the logic simple.

So revisiting the same region with the same filters within 15 minutes does not call the API again until the TTL has passed or you reload the page.

## How to Use (Operating Instructions)

### Step 1: Select a Region
- Click **Region** in the top bar to choose:
  - A predefined region (World, Europe, Sweden, etc.)
  - Search for a place by name (e.g., "Paris", "New York")
  - **Current view** — fetches occurrences for the area currently visible on the globe
- The camera will fly to the selected region and occurrences will load automatically

### Step 2: Filter Occurrences
Click **Filters** in the top bar to refine your search:
- **Species/Taxon** — Search by scientific or common name (e.g., "bee", "Apis", "house cat"); you can add multiple species
- **Taxonomic group** — Choose a broad category (Mammals, Birds, Plants, etc.)
- **Date range** — Enter start and end dates (YYYY-MM-DD format)
- **IUCN Red List** — Filter by threat status (Critically Endangered, Endangered, etc.)
- **Advanced** — Additional options:
  - **Basis of record** — e.g., Human observation, Preserved specimen
  - **Continent** — Filter by continent
  - **Country** — ISO 2-letter code (e.g., US, GB, DE)
  - **Dataset key** — Filter by specific GBIF dataset UUID
  - **Institution code** — e.g., USNM, NHM
- **Max results** — Set how many occurrences to fetch (100–100,000)

### Step 3: Explore Occurrences
- **View points** — Each occurrence appears as a colored dot on the globe (colors indicate IUCN status)
- **Click a point** — Opens an info box with species name, date, location, photos (if available), and a link to the full GBIF record
- **Timeline** — Use the timeline at the bottom to filter by year and month; click a year bar to see only occurrences from that year
- **Navigate** — Pan, zoom, and rotate the globe with your mouse or touch gestures

### Step 4: Draw a Custom Region (Optional)
- Click **Draw region** in the top bar
- Click two points on the globe to define a rectangle
- Occurrences will load for that area
- Save it as a favorite from the Region dropdown for quick access later

### Step 5: Export Data (Optional)
Click **Export** in the top bar to save:
- **Image** — Current view as PNG
- **GeoJSON** — Visible occurrences as GeoJSON
- **CSV** — Visible occurrences as CSV
- **PDF** — Report with map snapshot, species summary, and filter details

### Step 6: Change View Options
Click **View** in the top bar to:
- Switch between **3D Globe**, **2D Map**, or **Columbus View**
- Change base map (Bing Aerial, OpenStreetMap, OpenTopoMap, etc.)
- Enable **Photorealistic 3D** (requires Cesium Ion token)

---

## Quick start (For Developers)

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
git clone https://github.com/karimogit/GBIF3D.git
cd GBIF3D
npm install
```

The `postinstall` script symlinks Cesium assets to `public/cesium`. If you skip it, ensure `public/cesium` contains the Cesium build (e.g. from `node_modules/cesium/Build/Cesium`).

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the [How to Use](#how-to-use-operating-instructions) instructions above.

**If you see 404s for `/_next/static/...` or "MIME type ('text/plain')" errors:** You are not running the Next.js dev server. Stop whatever is on port 3000, then run `rm -rf .next` and `npm run dev`. Do not serve the project with a generic static server (e.g. `npx serve`).

### Build for production

```bash
npm run build
npm start
```

**Build note:** You may see a warning *"Mismatching @next/swc version, detected: 15.5.7 while Next.js is on 15.5.11"*. This is a known Next.js packaging quirk (15.5.11 ships with 15.5.7 SWC binaries) and can be ignored; the build completes successfully.

### Deploy on Vercel

1. Push the repo to GitHub.
2. In [Vercel](https://vercel.com), import the project and deploy.
3. Ensure build command is `npm run build` and output is Next.js.
4. **Optional — Cesium Ion:** For Cesium World Terrain and Ion imagery, set `NEXT_PUBLIC_CESIUM_ION_TOKEN` in your Vercel project Environment Variables to your [Cesium Ion](https://cesium.com/ion/) access token. The app sets `Cesium.Ion.defaultAccessToken` from this before any Ion requests.

## Example queries

- **Forest species in Sweden:** Select region “Sweden”, set taxonomic group to “Plants”, optionally search for e.g. *Pinus sylvestris*.
- **Birds in a region:** Select region “Europe” (or “Current view” and pan), set taxonomic group to “Birds”.
- **Threatened species:** Set IUCN Red List to “Endangered” or “Vulnerable”, select a region or use current view, and explore.

## API usage

The app uses:

- **Occurrence search:** `GET https://api.gbif.org/v1/occurrence/search` with `geometry` (WKT polygon from view bounds), `taxonKey`, `year`, `eventDate`, `iucnRedListCategory`, `basisOfRecord`, `continent`, `country`, `datasetKey`, `institutionCode`, `limit`, etc.
- **Species suggest:** `GET https://api.gbif.org/v1/species/suggest?q=...` for autocomplete.
- **Places (Nominatim):** `/api/places/search?q=...` — server proxy to OpenStreetMap Nominatim for place search; returns bounding boxes for the Region dropdown.
- **Occurrence images:** `/api/occurrence/[key]/image` — returns image URLs for an occurrence (from GBIF cache) for the InfoBox photo strip.

GBIF responses are cached in memory for 5 minutes. No API key required for normal use; Cesium Ion token is optional for World Terrain.

### Map tiles (OpenStreetMap)

The base map uses [OpenStreetMap](https://www.openstreetmap.org/) tiles (`https://tile.openstreetmap.org/`). Use of OSM tiles must comply with the [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/); avoid heavy automated requests and respect the usage guidelines.

## Project structure

```
├── app/
│   ├── layout.tsx         # Root layout, Cesium script + CSS, providers
│   ├── page.tsx           # Main page: GlobeViewer, MapTopBar, export handlers
│   ├── globals.css        # Global styles, accessibility
│   ├── providers.tsx      # MUI ThemeProvider
│   └── api/
│       ├── places/search/ # Nominatim proxy for place search
│       ├── species/suggest/ # GBIF species suggest proxy (CORS)
│       ├── species/search/ # GBIF species search proxy (CORS)
│       └── occurrence/[key]/image/ # Occurrence images (GBIF cache)
├── components/
│   ├── GlobeViewer.tsx    # Fetches occurrences by bounds/filters, renders GlobeScene
│   ├── GlobeViewerDynamic.tsx # Dynamic import (no SSR) for globe
│   ├── GlobeScene.tsx     # Resium Viewer, terrain, occurrence points, draw region, tooltips
│   ├── MapTopBar.tsx      # Top bar: Region/place search, Filters popover, Export, View, Saved, About
│   ├── SpeciesSearch.tsx  # GBIF species suggest autocomplete
│   ├── ErrorBoundary.tsx  # Error boundary around globe
│   └── Lightbox.tsx       # Photo lightbox from InfoBox
├── lib/
│   ├── gbif.ts            # GBIF API client (occurrence search, species suggest)
│   ├── geometry.ts        # Bounds ↔ WKT polygon (GBIF-compliant)
│   ├── regions.ts         # Predefined regions for Region dropdown
│   ├── cache.ts           # In-memory cache for API responses
│   ├── favorites.ts       # Saved regions (localStorage)
│   └── cesium-window-shim.cjs # Cesium from script tag → require('cesium')
├── types/
│   └── gbif.ts            # TypeScript types for GBIF responses
├── __tests__/
│   └── lib/               # Unit tests for gbif, geometry, cache, regions
├── next.config.js         # Cesium/Resium aliases, CESIUM_BASE_URL
├── package.json           # postinstall: symlink Cesium Build to public/cesium
└── README.md
```

## Testing

```bash
npm test
```

Tests include:

- **GBIF API:** Occurrence search with geometry, taxonKey; species suggest; error handling
- **Geometry:** WKT polygon from bounds (counter-clockwise, lon/lat), rectangle conversion

Sample data used in tests: geometry over Sweden, taxonKey for plants; real API calls (no mocks).

## Accessibility

- Skip link to main content
- Visible keyboard focus (green outline)
- Color-blind friendly point colors (not red-green only): black/orange/gold/blue/green/gray for IUCN categories

## License

MIT. See [LICENSE](LICENSE) for details.

## Acknowledgments

- **Developer:** [Karim Osman](https://kar.im)
- [GBIF](https://www.gbif.org/) for open biodiversity data and API
- [Cesium](https://cesium.com/) and [Resium](https://resium.reearth.io/) for the 3D globe