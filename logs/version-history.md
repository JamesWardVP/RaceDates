# RaceDates — Version History

Version format: `release.major-update.minor-update`
- **release** — increments for a finished, complete build placed in the `Releases/` folder.
- **major-update** — increments when a significant feature or page is completed.
- **minor-update** — increments for small changes, fixes, and tweaks.

Newest entries at the top. When work listed in `current-plan.md` is completed, it is removed from there and recorded here.

---

## 0.6.1 — 2026-07-20
- **Discovered venues now add with ONE click and zero manual input.** Each entry in the admin Discovered tab has an **Auto-add** button that: pulls the full Wikidata record, finds a photo (P18 or Commons search), reverse-geocodes town/county/country, **infers venue type and race types** from the entity description + photo filename (e.g. Oliver's Mount correctly comes out as a motorbike circuit from its "Motorcycle racing" photo), writes the summary from the venue's own Wikipedia intro (with a generated fallback), and stages the finished track. "Review" still opens the editable form for manual control.
- **Defunct-venue guard:** venues with a Wikidata closure date (P576/P3999), "former/closed/defunct" wording, or a past-tense Wikipedia intro ("…**was** a street circuit") are refused by Auto-add and directed to Review — verified with Battersea Park and Brooklands (refused) vs Oliver's Mount (added).
- Location displays site-wide now skip empty town fields (no more ", County" leading commas).

## 0.6.0 — 2026-07-20
- **Photo & calendar fixes (James's report: Harewood showed no photo/events):**
  - Every track now has a photo. New pipeline fallback when Wikidata has no image: Wikimedia Commons **text search on venue name + discipline** (finds real venue photos), then a location search that requires the venue name in the filename — a missing photo is better than a wrong one (the naive nearest-photo approach had returned a garden fence for Harewood). Val des Terres is the one venue with no suitable Commons photo; it keeps the styled placeholder.
  - Wikidata coordinates now overwrite our seeded approximations (better pins and photo searches).
  - Track pages: when all of a track's events are in the past, the calendar now says so and shows up to 5 recent past events greyed out under "Earlier This Season" (Harewood's two 2026 rounds were simply already run). Tracks with no events at all get an honest "more race series feeds are added over time" note.
- **Phase 5 — Admin page complete** (`admin.html` + `js/admin.js`):
  - Password gate (SHA-256, session-scoped; password given to James in chat, not stored in the repo). Deterrent only on a static site — real protection is that publishing requires a GitHub token only James has.
  - **Add Track with one-name automation:** type a venue name → Wikidata search → picks up coordinates, photo (P18, Commons text-search fallback), website, opening year, capacity, Wikipedia link → OpenStreetMap reverse-geocodes town/county/country. All fields editable before staging. Verified live: "Three Sisters Circuit" auto-filled everything including "Ashton-in-Makerfield, Greater Manchester".
  - **Discovered venues tab:** the 43 pipeline-found Wikidata venues listed with photos; "Use" pre-fills the add form. Once committed, the nightly refresh automatically drops the venue from the discovered list.
  - **Add Event tab** for one-off events/series without scrapers (scraped series are flagged as overwritten nightly).
  - **Publish tab:** staged changes commit straight to GitHub via the API (fine-grained token pasted at use time, never stored) which auto-redeploys the site; or download the JSON files as a fallback.

## 0.5.0 — 2026-07-20
- **Phase 2 COMPLETE — site live and self-updating.** James enabled Pages (Source = GitHub Actions) and the deploy succeeded.
  - Live site: **https://jameswardvp.github.io/RaceDates/** — all pages and data files verified in the browser (hero photo loads, races page serves the 27 upcoming events from live data).
  - The full automation loop now runs without any human input: daily GitHub Action → Wikidata + series-site scrapes → data commit → automatic redeploy.

## 0.4.3 — 2026-07-20
- **Phase 2 (part 3) — Project on GitHub with automated refresh + deploy workflows:**
  - Repo initialised and pushed to https://github.com/JamesWardVP/RaceDates (branch `main`, full history starts at v0.4.2).
  - `.github/workflows/refresh-data.yml` — daily (05:17 UTC) + manual: runs both PowerShell refresh scripts on ubuntu (`pwsh`), commits `main/data/*.json` only when changed; a data commit automatically triggers redeployment.
  - `.github/workflows/deploy-pages.yml` — deploys the `main/` folder to GitHub Pages on every push.
  - Pipeline scripts switched to forward-slash paths so they run on both Windows (dev) and the Linux runners.
  - ⚠️ First Pages deploy failed at "Configure Pages": the workflow token cannot enable Pages on the repo. **James needs to set repo Settings → Pages → Source = "GitHub Actions" once**, then the next push/re-run deploys. Site URL will be https://jameswardvp.github.io/RaceDates/

## 0.4.2 — 2026-07-20
- **Phase 2 (part 2 continued) — four more calendar adapters + 8 new venues. The site now runs almost entirely on live scraped data (43 of 45 events).**
  - **BSB adapter** (britishsuperbike.com/calendar): all 10 UK 2026 rounds; Assen correctly skipped by the venue guard; Test days ignored; per-round "Book Tickets" links captured (absolute URLs only — past rounds swap the button for a relative Results link).
  - **British GT adapter** (britishgt.com/calendar): the 3 upcoming UK rounds (Snetterton, Donington, Brands). Past GT rounds use different markup and aren't captured — fine, the site hides past races anyway. Spa skipped by the venue guard; Media Day filtered out.
  - **British Hillclimb adapter** (britishhillclimb.co.uk/calendar — the seed data's hillclimbing.co.uk URL was wrong, fixed in series.json): Wix page, parsed by walking text nodes (UPPERCASE venue name followed by its date). All 13 2026 rounds captured, including both Prescott and Shelsley visits and the Channel Islands rounds.
  - **8 new hill-climb venues added** so the BHC calendar has homes: Harewood, Gurston Down, Doune, Loton Park, Wiscombe Park, Craigantlet, Bouley Bay (Jersey), Val des Terres (Guernsey). Seeded with name + approx coords only, then **7 of 8 auto-enriched by the Wikidata pipeline** (QIDs, websites, 3 photos) — the future-proofing flow working as designed. Gurston Down found no Wikidata match; kept as seeded, unverified. Site now has 26 tracks / 26 map pins.
  - **Santa Pod adapter** (santapod.co.uk/events): 6 real events (Bug Jam → National Finals) with per-event ticket links. The old sample-only "euro-drag" series was renamed/generalised to `santa-pod` ("Santa Pod Raceway Events") since the venue calendar covers more than the FIA series. Site 403s rapid repeat requests — adapter fetches once and keeps existing data on failure. Duplicate featured-card listings deduped by event id. Known gap: "Ultimate Street Car" (31 Jul–2 Aug) is still missed despite a month-spanning date fix — investigate on a future run.
  - **5 Nations BRX**: real site found (rallycrossbrx.com, not the seeded 5nationsbrx.com — fixed in series.json). No adapter yet; instead the sample was replaced with the three real upcoming UK rounds from the official 2026 calendar announcement (Lydden 2WD Superprix 25 Jul, Pembrey 26–27 Sep, Lydden Fireworks Finale 7–8 Nov). Adapter still todo.
  - Verified in browser: races page shows 27 upcoming events correctly ordered (Bug Jam and the Lydden Superprix this coming weekend), Hill Climb group filter works, 26 map pins, no console errors.

## 0.4.1 — 2026-07-20
- **Phase 2 (part 2, first adapter) — Race-calendar pipeline running** (`tools/refresh-events.ps1`):
  - Adapter framework: one small scraper per series; each adapter's results replace only that series' events in `events.json`, so series without adapters keep their existing (sample) entries and the data degrades gracefully if one site changes.
  - Venue guard: scraped circuit names are matched against `tracks.json` (normalised names, config suffixes like "Indy"/"GP"/"300" stripped) — events at venues we don't list (e.g. BSB's Assen round) are skipped automatically.
  - **BTCC adapter live: all 10 real 2026 rounds scraped from btcc.net** and correctly matched (incl. two Donington and two Brands Hatch visits on different configs). Races page verified showing the real calendar — next round BTCC Thruxton 25–26 Jul at the top, past rounds hidden. Gate times/prices aren't on the calendar page so show TBC; ticket links point at each track's own site.
  - Source research (recorded for the remaining adapters): BTCC, BSB and British GT calendar pages are all static HTML and scrapable — BSB round cards on britishsuperbike.com/calendar, British GT list/cards on britishgt.com/calendar.
  - Fixed en route: PS 5.1 misparses BOM-less UTF-8 scripts (em-dash now built from a char code; scripts stay pure ASCII) and PS 5.1's ConvertFrom-Json array double-wrap corrupting events.json (now loads without `@()` and writes with `-InputObject`).

## 0.4.0 — 2026-07-20
- **Phase 2 (part 1) — Automatic track-data pipeline complete** (`tools/refresh-tracks.ps1`, PowerShell so it runs both locally and on GitHub Actions' `pwsh`):
  - Queries Wikidata's SPARQL API for all UK motorsport venues (61 found), matching them to our tracks by normalised name + coordinate proximity (<5 km).
  - Name-search fallback (Wikidata `wbsearchentities` + per-entity data) for venues the class query misses — drag strips and hill climbs aren't "race track" on Wikidata. Coordinate-less entities are only accepted on a strong name match plus a motorsport description, so the Shelsley Walsh *village* can't be mistaken for the hill climb. Prefix-matching quirk handled by retrying with the normalised core name.
  - **Result: 18 of 18 tracks matched and enriched** — real Wikimedia Commons photos (17; Pembrey has none on Wikidata), official websites, opening years, Wikidata QIDs and Wikipedia links; all tracks now `verified: true`.
  - 43 unmatched Wikidata venues (including historic/defunct circuits) written to `main/data/discovered-tracks.json` as candidates for admin review — deliberately NOT auto-added.
  - **Front end now uses the real photos:** tracks-grid cover images, a full-width photo on track detail pages (links to full size), and the landing-page hero shows a random real track photo as its background (gradient fallback kept). All verified in the browser.

## 0.3.1 — 2026-07-20
- **Map readability fix:** place names on the map were too dim to read. The map now uses CARTO's separate base (`dark_nolabels`) and label (`dark_only_labels`) tile layers, with the labels in their own Leaflet pane given a strong brightness boost (`brightness(2.1)`) and the base tiles a slight lift (`brightness(1.15)`). Names are clearly legible; the dark theme is preserved.

## 0.3.0 — 2026-07-20
- **Phase 4 — Interactive map complete** (`map.html` + `js/map.js`):
  - Leaflet 1.9.4 + free CARTO dark tiles over OpenStreetMap (no API key), styled to match the site theme, UK-centred.
  - Pins are colour-coded circles using the site's `--rt-*` race-type colours (read from CSS at runtime, so they always match the rest of the site). Hover shows the track name; click opens a themed popup.
  - **Tracks mode:** every venue pinned; search by name/place; multi-select race-type chips. Popup: track name (links to its page), location, race-type badges.
  - **Races mode:** shows the tracks that upcoming races are at; filter by race type or series, search by race/series/event name. Popup lists each race at that venue with dates — race names link to a pre-filtered races page.
  - `races.html` now accepts `?series=`, `?group=`, `?type=` URL parameters to arrive pre-filtered (used by map popups).
  - Verified in browser: 18 pins, search/chips/mode toggle/series filter all working, popup links correct, no console errors.

## 0.2.0 — 2026-07-20
- **Phase 3 — Core pages complete** (all running on the seed data in `main/data/`):
  - **Tracks page** (`tracks.html` + `js/tracks.js`): grid of all 18 venues with colour-coded cover placeholders (per primary race type), plus filters — name/place search, location dropdown, track-type dropdown, and multi-select race-type chips. Dropdowns populate themselves from the data. Verified: search "silver"→1, Scotland→1, hill climbs→2, drag chip→1.
  - **Track detail page** (`track.html?id=…` + `js/track.js`): name title; location subtitle and embedded OpenStreetMap box with pin, both opening the spot in a new Google Maps window; photo placeholder strip (real photos arrive with the Phase 2 pipeline); info tiles (venue type, opened + age, capacity, length, official site); races-hosted badges + series list (derived from events data); upcoming-events calendar. Clicking an event opens a modal with name, dates, gate open/close times, entry cost and a ticket link to the track's own site — closes via ✕, backdrop or Escape. Unknown ids show a friendly not-found message.
  - **Races page** (`races.html` + `js/races.js`): every round in date order, soonest first, past races omitted with an opt-in "include past" checkbox. Filters: race type, cup/group (e.g. all GT races at once), individual series, and cost bands. Each row is colour-coded by race type with price, track link and ticket button.
  - Shared date/price/upcoming helpers added to `js/main.js`; filter bar, track card, detail layout, calendar, modal and race list styles added to `css/style.css`.
  - All pages and filters verified working in the browser with no console errors.

## 0.1.2 — 2026-07-20
- **Fonts switched to free Google Fonts (no licensing issues):** Racing Sans One for titles/headings/brand, Roboto for everything else. Victory Striker Sans Demo removed from the project (personal-use-only licence — v0.1.1 entry records where to get it if ever wanted); Titillium Web also retired but logged (v0.1.0/0.1.1 entries) as a possible future font.
- **Active nav underline fixed:** the red line under the currently selected page now follows the wavy flag edge (SVG stroke tracing the same curve as the mask, replacing the old straight inset shadow).
- **Landing page boxes redesigned as racing badges:** the wavy feature cards (which didn't fit the page style) are now three shield-shaped badges, each with a chequered strip across the top, a title, and a large central image — map 🗺️, chequered flag 🏁, calendar 📅 — with the description as a caption underneath. The wavy-flag mask is now used only on the nav bar; the generic `.card` style reverted to straight borders for future pages.

## 0.1.1 — 2026-07-20
- **Display font swapped to Victory Striker Sans Demo** (James's pick, from 1001fonts.com) — applied to headings, brand, nav and buttons via `--font-display`; file at `main/assets/fonts/VictoryStrikerSansDemo.otf`.
  - ⚠️ **Licence: the demo font is PERSONAL USE ONLY.** Commercial licence available at https://ahweproject.com/product/victory-striker/ — must be purchased before any commercial/public launch.
  - **Font logged for future use:** Titillium Web (Google Fonts, free/open) was the original site-wide font. It remains the body-text font and the fallback in both `--font` and `--font-display`, so switching back is a one-line change in `css/style.css`.
- **Wavy-flag shapes:** feature cards and nav-bar boxes now use a waving-flag silhouette (responsive SVG mask, `--flag-mask` in `css/style.css`) instead of straight rounded rectangles, tying the UI to the chequered-flag aesthetic. Card hover now uses a red underline accent + lift instead of a border.

## 0.1.0 — 2026-07-20
- **Phase 1 — Foundation complete** (architecture decided: static site + scheduled data refresh, target hosting GitHub Pages/Netlify):
  - Site skeleton in `main/`: landing page plus stub pages for Map, Tracks, Track detail, Races and Admin, all sharing an injected header/nav/footer (`js/main.js`).
  - Motorsport design system (`css/style.css`): dark asphalt theme, racing-red accent, Titillium Web font, and a per-race-type colour system (circuit red, motorbike cyan, rally orange, rallycross yellow, hill climb green, drag purple, oval blue, karting pink) applied via `data-racetype` attributes.
  - Data layer: schema documented in `data/schema.md`; seed data for 18 UK venues (`tracks.json`), 8 series (`series.json`) and 6 sample events (`events.json`). Seed facts flagged `verified: false` until the Phase 2 pipeline confirms them.
  - Dev tooling: dependency-free PowerShell static server (`tools/dev-server.ps1`, port 8765) since neither Node nor Python is installed; `.claude/launch.json` config; project rules in root `CLAUDE.md`.
  - Verified in browser: pages render, nav injection works, no console errors, JSON serves and parses.

## 0.0.1 — 2026-07-20
- Initial project scaffolding created:
  - `logs/` folder with `version-history.md` (this file) and `current-plan.md` (session checkpoint / active plan).
  - `Releases/` folder — finished, complete builds only, ready for upload.
  - `main/` folder — development area.
- Full project specification captured in `current-plan.md`.
