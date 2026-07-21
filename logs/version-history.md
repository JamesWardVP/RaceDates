# RaceDates — Version History

Version format: `release.major-update.minor-update`
- **release** — increments for a finished, complete build placed in the `Releases/` folder.
- **major-update** — increments when a significant feature or page is completed.
- **minor-update** — increments for small changes, fixes, and tweaks.

Newest entries at the top. When work listed in `current-plan.md` is completed, it is removed from there and recorded here.

---

## 1.0.0 — 2026-07-21
- **Phase 6 — Polish & first release. RaceDates v1.0.0.**
  - **Favicon added**: a small checkered-flag SVG (`main/favicon.svg`, brand colours) linked from every page — the site previously had no tab icon.
  - **Custom 404 page** (`main/404.html`) — GitHub Pages serves this automatically for any unmatched URL under the site, styled consistently with the rest of the site instead of a bare default error page.
  - **Mobile calendar fix**: the new month-grid calendar (v0.9.2) measured only ~41px per day cell on a 375px phone screen — event chips would have been unreadable. Rather than shrink the UI further, the calendar (header + grid together, so they scroll in sync) now scrolls horizontally on narrow screens, keeping cells at a legible ~82px. Verified: no page-level horizontal scroll, the internal scroll container has its own, and the weekday header stays pixel-aligned with the day grid at any scroll position.
  - **Full mobile pass at 375px** across all 6 pages (landing, map, tracks, track detail incl. event modal, races incl. both calendar and list views, admin incl. logged-in tabs) — no horizontal overflow anywhere, grids/forms collapse to single columns correctly, map renders and pins, modal fits on screen. No console errors on any page.
  - Cache-busting bumped to `?v=1.0.0` on every page.
  - **First versioned snapshot copied to `Releases/1.0.0/`** — the deployable site (everything under `main/`) as of this release, per the project's standing rule that `Releases/` holds finished, complete builds. The live site itself continues to deploy straight from `main/` via GitHub Actions; this snapshot is an archival copy, not a second deployment target.
  - Roadmap: all six phases now complete (Foundation, Data, Core pages, Map, Admin, Polish). The site is live, self-updating daily, and has an admin tool for adding new tracks/events. Ongoing work from here is incremental: more calendar-source adapters, more "Other" cross-country events as they're identified, and any further UX requests.

## 0.9.2 — 2026-07-21
- **Calendar polish batch — every item from James's follow-up report, all verified in-browser (not just visually):**
  - **Uneven box widths + misaligned day headings — real root cause found and fixed.** CSS Grid items default to `min-width: auto`, which lets their intrinsic content (long nowrap event titles) grow a column past its `1fr` share, throwing every column's width off and breaking alignment with `.cal-weekdays` above (which has no long content, so stayed uniform). Added `min-width: 0` down the chain (`.cal-cell`, `.cal-chips`, `.cal-event`, chip text lines). Verified: all 35 day cells now measure identically (159px), and day-header-to-column horizontal offset is 0px.
  - **Two-line event chips**: title on the first line, venue name on the second — keeps the box width fixed regardless of how long the event name is (title truncates with an ellipsis rather than stretching the cell). Verified live.
  - **Multi-day "(Day X of Y)" tag** — appended to the title on every day of a multi-day event's span, computed per-cell from the event's actual start/end dates. Verified: "British Superbikes — Snetterton (Day 1 of 3)" shows correctly on the first of its three days.
  - **Hover tooltip (desktop) / tap-to-preview (mobile)**: hovering a chip on a real pointer device (verified with an actual OS-level hover, not a synthetic event — those don't trigger `:hover`) shows a small themed card: full title, date range, venue, series group, price, and a "More info →" link; the chip itself still navigates on click as before. On touch devices (no `hover` capability), the first tap opens the same tooltip and blocks navigation instead — verified by forcing `matchMedia('(hover: hover)')` to false: first tap prevented + opened, second tap on the same chip unprevented (navigates normally).
  - **Calendar is now the default view** on page load, with the toggle order flipped to Calendar / List to match.
  - **"Today" showing the wrong date — real bug found, not a display quirk.** The calendar built every date key (including "today") via `Date#toISOString()`, which reads **UTC** fields — during British Summer Time (UTC+1) this silently shifts local dates, which is exactly why the 21st was showing as the 22nd. Added a shared `RaceDates.toDateKey()` helper that reads the Date object's *local* fields instead, and used it everywhere a calendar-date string is built (today marker, day cells, and the per-event date-to-cell matching, which had the same latent bug). Verified: today correctly highlights the 21st, matching `new Date()` in the browser.
  - **"Happening today" indicator on the list view** — a small red "● Today" pill next to any event whose date range includes today (not just events starting today). Verified: correctly flagged today's one live event ("Car, Bikes and Coffee" at Lydden Hill) and no others.
- Cache-busting bumped to `?v=0.9.2`.

## 0.9.1 — 2026-07-21
- **Calendar toggle — the REAL bug found and fixed** (James's report was correct; v0.9.0's cache-busting theory was wrong). The list view's CSS (`.race-list { display: flex; ... }`) was silently overriding the browser's default `[hidden] { display: none }` rule — an author-origin class selector beats a same-specificity user-agent rule in the cascade, so JS setting `race-list.hidden = true` never actually hid it. The calendar was rendering underneath the still-visible list the whole time. Fix: added `.race-list[hidden] { display: none; }` to reassert it. Verified both directions with computed styles: list→calendar now genuinely hides the list (`display: none`) and shows the 35-cell month grid; calendar→list reverses correctly. Audited the rest of the site for the same class-vs-[hidden] conflict — no other instance found.
- Cache-busting version bumped to `?v=0.9.1` on every page so this fix reaches everyone immediately regardless of prior caching.

## 0.9.0 — 2026-07-21
- **Calendar toggle "not working" on live site — root cause suspected + fixed defensively.** Couldn't reproduce (live JS/CSS confirmed to be the current v0.8.0 build and the toggle worked when tested), but the likely cause is a browser holding a cached races.js/style.css from before the deploy — asset filenames never changed, so nothing forced a refetch. **Fix:** every local `<script>`/`<link>` across all 6 pages now carries `?v=0.9.0`; bumping that query string on future releases forces browsers to fetch the new file instead of serving a stale cached copy. If James still sees an old version, a hard refresh (Ctrl+Shift+R) clears it immediately.
- **Page load time — root cause found and fixed.** The tracks grid (57+ photos) rendered every cover as a CSS `background-image`, which browsers fetch immediately regardless of scroll position — measured 44 concurrent Wikimedia requests fighting over ~6 connections-per-host on live. Covers now render as real `<img loading="lazy">` elements, so only on/near-screen photos load up front (verified: 20 of 57 loaded immediately vs. all 57 before) and the rest stream in as the page is scrolled.
- **New "Other" venue type + first cross-country event: Race the Waves.** Added `bridlington-south-beach` (venueType `other` — a tidal beach, not a permanent surface) and its 2026 event (11–13 Sept, beach drag racing, `raceType: drag` per James's instruction) via the existing `venue`-series mechanism. Demonstrates the pattern for other non-fixed-venue "festival" motorsport events; more can be added the same way once identified (didn't fabricate additional ones without a source).
- **Photo pipeline: fixed a real accuracy bug + extended for the new venue types.** `Test-PhotoTitle` previously accepted any Commons photo containing just ONE shared word from the venue name — this had matched "Northampton Power Station" to Northampton International Raceway and a river photo to Mildenhall Stadium. Now requires 2+ distinguishing words from the full venue name (not just the town). Also added proper Commons search terms for the new venue types (`speed-venue` → "airfield", `other` → "beach") instead of defaulting to "circuit". Re-ran the pipeline: 11 more real photos found (Elvington, Buxton, Skegness, Bridlington, etc.), the two wrong photos removed with nothing incorrect left in their place, 57 of 64 tracks now have verified photos.
- Verified in browser throughout: lazy-loading confirmed via `loading="lazy"` + partial-load count, calendar toggle works locally end-to-end, Bridlington South Beach shows the Drag Racing badge and Race the Waves event, 64/64 tracks pinned on the map, no console errors.

## 0.8.0 — 2026-07-20
- **James's requested batch, all four items:**
  1. **Track page map alignment fixed:** the title/location moved out of the two-column grid onto its own row above it, so the photo and map columns both start level (verified: photo top and map top both 193px). Files: `js/track.js`, `css/style.css`.
  2. **Road racing + stock car adapters — 4 new sources, event coverage jumped from 63 → 142 events (25 → 38 tracks with events, of 63 total):**
     - **Oliver's Mount** (oliversmount.com/events2): 6 events for the 2026 season including the 80th Anniversary Gold Cup.
     - **Lochgelly Raceway** (hardieracepromotions.co.uk fixtures): 19 stock-car meetings with gate/first-race times parsed from the page.
     - **BriSCA F1 Stock Cars** (cayzerracing.co.uk fixture table — the official briscaf1.com fixtures page redirects to a stale 2020 archive): 42 events across the full 2026 season including the World Final at Northampton. New series `brisca-f1`. Added 7 new stock-car oval venues the fixture list needed: Buxton, Foxhall (Ipswich), Mildenhall, Northampton International, Scunthorpe, Skegness, Nutts Corner.
     - **Venue matching fixed:** apostrophes now strip correctly ("King's Lynn" matches "Kings Lynn"), and unmatched names now also try the track's *town* (fixture lists sometimes give "Ipswich" rather than "Foxhall Stadium").
  3. **"Mobile event host" model + Straightliners adapter:** a promoter that runs events at many venues, not tied to one track. New series `straightliners` (group "Mobile Events"); each event still carries a location-appropriate `raceType` — `drag` at drag strips (Melbourne, Dakota), the new **`other` race type** (grey, added to the registry + `--rt-other`) everywhere else (Elvington, Campbeltown, etc.). **9 new venues added** so Straightliners' events have a home on tracks/map: Elvington Airfield, Dakota Raceway, Pendine Sands, Dishforth, Campbeltown/Machrihanish, Jurby, Llanbedr, Solway, Ramsey Sprint — new venue type `speed-venue`. 12 events scraped, verified live at Melbourne Raceway (drag) and the brand-new Elvington Airfield page (other). Straightliners' own site (straightliners-events.co.uk) has broken TLS unreachable by any client tested; the working mirror straightliners.events was found and used instead.
  4. **Races page List/Calendar toggle:** month-grid calendar (Mon–Sun, 7 columns) alongside the existing list, sharing the same type/group/series/cost filters. Days show up to 3 colour-coded event chips (spanning events appear on every day of their range) with a "+N more" overflow, link to the track page, and a tooltip with name + dates. ‹ Month YYYY › navigation, defaults to the current month, today's cell outlined in red. "Include past" hidden in calendar mode (a month view shows its own past days dimmed by design). Verified: July→18 races, August→33 races, chip colours resolve correctly per race type.
- Generalised the `venue`-series render path (races/track/map JS) to read a per-event `raceType` with series fallback — this is what let Straightliners' mixed-discipline events and the new venue calendars slot in without special-casing.

## 0.7.0 — 2026-07-20
- **Adapter backlog round 1 — venue-calendar mechanism + Lydden Hill & Goodwood adapters. Events: 45 → 63.**
  - **New generic "venue event" mechanism:** venue-calendar events use seriesId `venue` with a **per-event `raceType`** (schema addition) so each event carries its own colour — a bike track day shows cyan, a rallycross day yellow, at the same venue. Front end (races/track/map pages) now colours and filters by event raceType with series fallback. Venue events that land on the same date as a series round at the same track are skipped automatically (the richer series feed wins).
  - **Lydden Hill adapter** (lyddenhill.co.uk/events, WordPress `event-item` blocks): 15 events — rallysprints, rallycross experience days, bike/car track days, oval racing — each with inferred race type and per-event ticket links. Its BRX Superprix correctly skipped as already covered by the series entry.
  - **Goodwood adapter** (three known event pages, date regex): Members' Meeting, Revival 2026 (18–20 Sep) and Festival of Speed — whose page already advertises the 2027 dates, handled fine. FoS carries the hillclimb race type.
  - Fixed en route: a temporal-dead-zone bug (eventRaceType declared as const after first use) that silently blanked track pages.
  - **Not scrapable (recorded):** rallycrossbrx.com event pages carry no dates in HTML (BRX stays covered by the Lydden venue feed + hand-entered Pembrey/finale rounds); pembreycircuit.co.uk/events is JS-rendered; Castle Combe blocks non-browser clients (403) on calendar paths.
  - Verified in browser: races page 44 upcoming (venue group filter = 17; moto filter mixes BSB + Lydden bike days), Goodwood track page shows Revival upcoming / Members' Meeting past, modals carry correct colours, no console errors.

## 0.6.3 — 2026-07-20
- **Data cleanup after James's first big admin session** (he triaged all 43 discovered venues — 26 added, the rest flagged):
  - Removed 3 duplicate tracks (Shakespeare County Raceway, Swaffham Raceway Stadium, Tandragee 100 were each added twice) and deduped the review list.
  - Moved 2 entries out of tracks and into Review with reasons: Shakespeare County Raceway (venue closed in 2017, website dead — slipped past the defunct guard) and the Brooklands scheduled-monument Wikidata entity (a heritage record, not a venue). Both recoverable from the Review tab. Tracks: 52 → 47.
  - **Admin guards added so it can't recur:** Auto-add and the manual form both refuse venues whose Wikidata id is already on the site; flagging is idempotent.
- **Event coverage research (James's ask: auto-events for newly added tracks, e.g. Melbourne Raceway):**
  - Probed venue websites for machine-readable calendars (schema.org Event JSON-LD): effectively zero coverage across UK venue sites (Castle Combe has JSON-LD but only Place/Organization; Anglesey/Knockhill/Odsal none; Mallory/Shakespeare sites down; Straightliners — Melbourne Raceway's promoter — has broken TLS no client can negotiate). **A universal venue-events scraper is not feasible**; per-source adapters remain the mechanism.
  - Admin now sets expectations: after staging a track it explains events appear when a series feed covers the venue, pointing to Add Event for one-offs.
  - Adapter backlog for event coverage recorded in current-plan.

## 0.6.2 — 2026-07-20
- **Admin "Review" tab for possible dead tracks.** When Auto-add refuses a venue as likely closed/defunct, it now moves to a new Review tab (showing the reason — e.g. "Wikipedia describes it in the past tense" — and the flag date) and disappears from Discovered permanently:
  - Flags persist in a new committed data file, `main/data/review-tracks.json` (published via the existing Publish tab / download fallback), and the nightly pipeline excludes flagged venues when regenerating the discovered list — so they never resurface.
  - Review tab actions: **Add anyway** (opens the editable form pre-filled) and **Unflag** (returns the venue to Discovered).
  - Staging a track from either list automatically clears it from both.
  - Verified in browser: Battersea flag → Review (43→42 in Discovered) → Unflag → back to 43; no console errors.

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
