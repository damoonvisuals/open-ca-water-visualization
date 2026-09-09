# California Water Atlas

A standalone React app for exploring the surface drinking-water source watersheds in The Nature Conservancy’s October 2012 report, **Where Does California’s Water Come From?**

The app uses **React 19, Vite, react-map-gl, and MapLibre GL JS**. All application data is static JSON/GeoJSON. There is no backend, database, application API, Mapbox token, or paid service configuration.

## Run locally

Use Node **22.12+** (`nvm use` reads `.nvmrc`).

```sh
npm ci
npm run dev
```

The preparation step copies the source PDF into the static asset directory. Python is **not** needed to run or build the app.

```sh
npm run build
npm run preview
```

## Host online

Upload the contents of `dist/` to any static web host, or configure your host with:

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Node version: 22 or newer

Vite uses relative asset paths, so the output supports hosting under a subdirectory (including a GitHub Pages project path). Selection links use a hash, such as `#map=oakland`, and need no server route rewrites. Serve through HTTP(S), rather than opening `index.html` with `file://`.

The default **Simple** basemap uses bundled public-domain Natural Earth boundaries and makes no third-party requests. **Detailed** uses OpenFreeMap’s public tile service, which needs no account or API key. Failed detailed-map requests fall back to the bundled map. Neither mode can charge a Mapbox account. Static hosting itself is your choice; the repo does not provision infrastructure.

## What is included

- All **18 appendix maps**, PDF pages **14–31**: a statewide overview and 17 city/group maps.
- **30 searchable cities**, preserving the report’s two shared maps: 12 Metropolitan Water District cities and three Inland Empire cities. No extra city-specific watershed geometry is invented for these groups.
- Detailed protection/land-use polygons, pink water-provider service areas, red aqueduct centerlines, and preserved printed flow-arrow symbols. The original legend doubles as per-category visibility controls.
- Pan/zoom, clickable regions/routes, city markers, source-footprint comparison, region filtering, and shareable selection links.
- Local previews of every original map, links to the matching PDF page, methodology notes, and downloadable data.
- Mobile layout, keyboard-accessible city controls, native modal focus handling, and data-loading/error recovery.

## Data and interpretation

| File | Contents |
| --- | --- |
| `public/data/catalog.json` | 30 approximate city-center locations, 18 map records, city/group relationships, report citation, methodology and limitations |
| `public/data/watersheds.geojson` | Detailed WGS84 source footprints for framing and cross-map comparison |
| `public/data/maps/page-*.geojson` | Per-page protection/land-use/service-area MultiPolygons, aqueduct MultiLineStrings, and printed red-symbol polygons; fetched on selection and cached |
| `public/data/registration-quality.json` | Geographic control points and affine-fit residuals |
| `public/data/basemap.geojson` | Simplified Natural Earth administrative regions for the USA, Canada and Mexico |
| `public/appendix/page-*.webp` | Higher-resolution original appendix page previews with their legends |
| `public/appendix/tracing-*.webp` | Color-classification review images in original map coordinates |
| `docs/california_drinking-water-sources-2012.pdf` | Original source report; copied to `public/report.pdf` during development/build |

This is a **historical visualization of surface-water source areas**, including standby sources, not a current water-supply inventory. Pink polygons reconstruct the service areas drawn in the appendix. The app does not establish current utility boundaries, groundwater basins, supply percentages, water quality, or parcel-level geofences. The statewide source image covers a broader population than the 30 selected cities and is not a computed union of the city maps.

### Original report methodology

Klausmeyer and Fitzgerald reviewed California Department of Public Health DWSAP source assessments and utility/city reports, matched diversion names to GIS data, and traced upstream NHDPlus flowlines in **ArcGIS 10.0**. They selected associated subwatersheds and related water providers to cities using water-district service areas and the **2010 census** (PDF p. 11).

The original protection/land-use colors combine the **2010 Protected Areas Database of the U.S.** with **2006 National Land Cover Database** information. GAP 1–2 represent highest protection, GAP 3 some protection; “no known protection” may omit district lands and private conservation easements (pp. 12–13 and map legends).

Appendix B (p. 32) lists NHDPlus at 1:100,000, NHD at 1:24,000, HUC12 Watershed Boundary Dataset, the June 2011 California fish-passage database, and water-district datasets. Some map legends explicitly list “TNC inferred”; the app flags these pages without guessing which original boundaries were inferred.

### How these approximations were made

`scripts/extract_watersheds.py` renders each map at **2.5× PDF size** (up from 1.2×). It separates the three green categories using Lab color distances and classifies neutral agricultural/developed pixels inside source-water regions. Pink service areas, red aqueducts, and the blue Delta symbol (where present in the original legend) are separate classes.

The polygons retain **internal holes and small patches**, with a **0.4-pixel simplification tolerance** and a minimum area of **two rendered square pixels** (one for red/Delta symbols). The earlier approach filled holes, dropped patches under 20 square pixels at lower resolution, and collapsed all five land categories into one outline. The new extraction preserves the categories instead. The framing/comparison envelope uses a three-pixel closing, but thematic class polygons do not.

Text is removed from a temporary PDF copy before land-use classification, so labels are not misclassified as developed land. **The original red direction arrows are often font glyphs**, so red routes/symbols are extracted from the untouched original render. Glossy orange city markers are suppressed. Red centerlines are derived with Zhang–Suen thinning and graph tracing; disconnected strokes are not joined with invented straight routes. Polygon silhouettes preserve the arrow shapes exactly as visible in the source. **Coordinate order does not encode flow**, and no direction or operational flow rate is inferred for unmarked lines.

Manually identified city markers, lakes, and state corners in `scripts/registrations.json` fit a per-map affine transform into **EPSG:5070**, used as a working registration projection, not an assertion of the original map CRS. The output is transformed to **WGS84 (longitude, latitude)**. Pages with identical map extents share control points but have separately extracted footprints.

The layers are image-derived approximations, **not recovered TNC GIS data**. JPEG artifacts, hillshade, occlusion, and small map symbols can produce classification errors or missing fragments. Shared edges can differ across maps. The original protection and land-use categories are now interactive, but they describe **the 2012 artwork**, not verified current conditions.

Detailed data is split by appendix page (about 18 MB total, roughly 0.1–2.3 MB per page) and fetched only when selected, then cached for the session. There is no additional API. Each selected map has a direct GeoJSON download containing the regions, service areas, and aqueducts.

Fit residuals describe agreement with approximate landmarks, not positional accuracy. In particular, a three-point affine fit has zero residual by construction and provides no independent accuracy check. Use this atlas for regional exploration; compare it with the source image rather than treating a displayed boundary as exact.

To regenerate the watershed data and previews (optional, not part of the app build):

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/extract_watersheds.py
```

The script also produces `public/appendix/tracing-*.webp` for visual comparison with each original. Use `--pages 23 25` to regenerate selected pages; omit it to rebuild all 18. The pinned regeneration environment was tested with Python 3.14; older Python versions may need compatible package versions.

Natural Earth basemap source: [50m admin-1 states/provinces](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_1_states_provinces.geojson), filtered to USA/Canada/Mexico and simplified with 0.025-degree tolerance. [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/). Optional detailed tiles: [OpenFreeMap](https://openfreemap.org/), with OpenMapTiles and OpenStreetMap attribution displayed on the map.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests run against the **production build**, so run `npm run build` after changes. They cover every appendix page on desktop/mobile, thematic rendering, legend toggles (including rendered aqueduct visibility), grouped-city search, filtering, deep links, original images, PDF links, downloads, blocked external tiles, and recovery from both initial-data and per-page-layer failures. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to an existing Chromium binary.

## Attribution

Klausmeyer, K. and K. Fitzgerald. 2012. *Where does California’s water come from? Land conservation and the watersheds that supply California’s drinking water.* A Science for Conservation Technical Brief. An unpublished report of The Nature Conservancy. San Francisco, CA. 13 pages + Appendices. Version 1.1, October 2012.

Original maps were produced for The Nature Conservancy. The repository’s software license does not imply a separate license grant for the report or its artwork.
