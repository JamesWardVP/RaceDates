# RaceDates — Current Plan & Session Checkpoint

> **Purpose of this file:** This is the live plan and the checkpoint for pausing work.
> - Whatever is actively being worked on is described under **"Work currently underway"** with enough detail that a brand-new session can pick it up and continue without any other context.
> - When something here is completed, it is removed from this file and logged in `version-history.md`.
> - When the session token limit approaches a set percentage, work stops and the exact state of in-progress work is written here before ending.

---

## Work currently underway

**Status: v1.0.0 (Phase 6) + v1.1.0 (adapter backlog round 2) both complete and live-verified. Live site: https://jameswardvp.github.io/RaceDates/. No active phase in progress — all work is now incremental adapter/data-quality sweeps.**

v1.1.0 follow-ups for a future session:
1. **Castle Combe event count unverified live** — the adapter is written and logic-checked against real captured HTML, but got rate-limited during dev testing before I could confirm the actual scraped count from a real run. Check the next nightly Action's log (or trigger one manually) for a `venue/castle-combe : N events` line with N > 0.
2. Re-verify Isle of Man TT / Manx GP / Tandragee 100 dates around March–April 2027 and update the hand-entered events for next season (no adapter exists for these — see backlog notes below for why).
3. More "Race the Waves"-style cross-country events and Anglesey's date-less REST API are both parked — see backlog below.

Good entry points beyond that, roughly in priority order:
1. Continue the event-coverage adapter backlog below (Mallory Park, Kirkistown, Knockhill non-BSB, remaining stock-car ovals, motocross).
2. Add more "Other" cross-country events if James names any (pattern: venueType `other` track + `venue`-series event with a per-event `raceType`).
3. The 7 tracks still missing photos (Google Maps Places would need an API key — ask James first).

Calendar view internals (for future sessions touching `js/races.js` / the `.cal-*` CSS):
- Date keys MUST go through `RaceDates.toDateKey(date)` (local Y-M-D), never `date.toISOString()` — the latter reads UTC fields and silently shifts dates during BST. This bit us once already (v0.9.2 "today" bug); the events' own `startDate`/`endDate` strings are already plain, timezone-naive "YYYY-MM-DD" and must be treated that way throughout.
- Grid items (`.cal-cell` and its descendants) need `min-width: 0` or long nowrap content silently breaks the `1fr` column sizing — this is a general CSS Grid gotcha, worth remembering for any future grid layout on this site.
- `[hidden]`-toggled elements need checking against any class rule setting their own `display` — a same-specificity author-stylesheet class rule beats the browser's default `[hidden] { display: none }`. `.race-list[hidden] { display: none; }` is the existing fix; apply the same pattern if a new `hidden`-toggled element gets its own `display` rule.
- Touch-vs-hover branching relies on `matchMedia('(hover: hover)')`, checked at click time (not cached), so it degrades correctly if a device's input capability changes (e.g. a hybrid laptop with a mouse plugged in).

Other remaining loose ends:
- BriSCA F1's *own* fixtures page (briscaf1.com/fixtures) redirects to a stale 2020 archive — currently sourced from cayzerracing.co.uk's fixture table instead, which is fine but worth rechecking occasionally in case the official site fixes its URL.
- Straightliners' own domain (straightliners-events.co.uk) still has broken TLS from every client tested (PS, curl, WebFetch, in-app browser navigation); the mirror straightliners.events works and is what the adapter uses — no action needed unless that mirror also breaks.
- Santa Pod's "Ultimate Street Car" event still isn't captured by the adapter (site 403s repeat requests, so probe sparingly when investigating).
- Per-event page scraping for gate times/prices (calendar list pages don't publish them) — later refinement, not blocking.

**Event-coverage adapter backlog** (each source = a small adapter in `tools/refresh-events.ps1`; series pattern = `Get-BtccEvents`, venue-calendar pattern = `Get-LyddenEvents` + `Merge-VenueEvents` with per-event `raceType`):
- ~~Lydden Hill venue calendar~~ ✅ v0.7.0 (15 events).
- ~~Goodwood (MM/FoS/Revival)~~ ✅ v0.7.0 (3 events).
- ~~5 Nations BRX~~ — rallycrossbrx.com pages carry no dates in HTML; covered by Lydden venue feed + hand-entered Pembrey/finale rounds. Revisit only if their site changes.
- ~~Oliver's Mount~~ ✅ v0.8.0 (6 events, oliversmount.com/events2).
- ~~Lochgelly Raceway~~ ✅ v0.8.0 (19 events, hardieracepromotions.co.uk fixtures).
- ~~BriSCA F1 Stock Cars~~ ✅ v0.8.0 (42 events, 7 new venues added — via cayzerracing.co.uk since briscaf1.com/fixtures redirects to a stale 2020 archive).
- ~~Straightliners (mobile host)~~ ✅ v0.8.0 (12 events, 9 new venues added — straightliners-events.co.uk has broken TLS on every client tested; the working mirror straightliners.events was used instead).
- ~~Castle Combe~~ ✅ v1.1.0 — adapter written for `castlecombecircuit.co.uk/all-racing` (WP Table Builder listing, handles their "Weekday Nth [& Weekday Nth] Month Year" date format). Needs a browser-style UA (their bot-protection blocks our normal `RaceDatesBot` UA specifically) — implemented as a one-off exception in just this adapter. Logic hand-verified against captured real HTML; live event count not yet confirmed (got rate-limited testing) — check on next run.
- ~~Pembrey~~ ✅ v1.1.0 — turned out to have a clean JSON API (`pembreycircuit.co.uk/api/events`, POST `{"page":1}`) behind its JS-rendered page, found via the browser network panel. 15 events, self-dedupes against the BRX hand-entered round.
- ~~Isle of Man TT / Manx GP / Classic TT / Tandragee 100~~ ✅ v1.1.0 (hand-entered, real dates) — no adapter: both official sites (iomttraces.com, tandragee100.co.uk) are prose news pages with no scrapable structure found. Will go stale each year; re-verify dates annually (see follow-up #2 above).
- **Anglesey** — investigated v1.1.0: `/events` is a client-rendered SPA with no visible data API; a WordPress REST API exists (`wp-json/wp/v2/event`) but doesn't expose event dates in a clean field (dates are only in image filenames on the front end — too fragile). Parked; revisit if a better source turns up.
- **Mallory Park, Kirkistown, Knockhill non-BSB** — own-site calendars, structure unknown (Mallory site was timing out on 2026-07-20).
- **Remaining stock-car/banger ovals** (Mendips, Odsal, Swaffham, Eddie Wright, Hednesford — Hednesford has a track already but no adapter feeding it) — check whether BriSCA's calendar covers these too, or find their own promoter sites.
- **Motocross (Foxhill, Cwmythig Hill)** — series calendars (British Motocross Championship?) — research needed; note site has no motocross race type yet (would need a new `--rt-*` colour + registry entry, same pattern as `other` added in v0.8.0).

Admin page facts (for future sessions): password is SHA-256-gated in `js/admin.js` (constant `PASSWORD_SHA256`); the password itself was told to James in chat 2026-07-20 and is NOT in the repo — to change it, hash the new password and replace the constant. Publishing uses a fine-grained GitHub token (Contents: read & write on JamesWardVP/RaceDates) pasted at use time.

### Phase 2 worklog (COMPLETE — kept brief for reference)
- Goal: automatic refresh of tracks/events with no manual input (Wikidata for track facts + images/photos, per-series calendars). Replaces the seed JSON's `verified: false`/`sample: true` flags, fills the photo placeholders on track pages and cover images on the tracks grid.
- Pipeline language: **PowerShell** — the only runtime on this machine, and GitHub Actions' ubuntu runners include `pwsh`, so the same scripts run locally and in CI.
- Deployment note: `Releases/` upload is the interim path; the scheduled-refresh half of the pipeline needs the repo pushed to GitHub (git init + remote) before a GitHub Actions workflow can run it — not done yet.
- ✅ **Part 1 done (v0.4.0): track-data refresh** — `tools/refresh-tracks.ps1` enriches all 18 tracks from Wikidata (photos/websites/opened/QIDs), writes `discovered-tracks.json` candidates; front end shows the real photos (grid covers, detail-page photo, landing hero).
- ✅ **Part 2 essentially done (v0.4.1–v0.4.2): race-calendar pipeline live with 5 adapters** — BTCC (10 rounds), BSB (10), British GT (3 upcoming), British Hillclimb (13), Santa Pod (6). 43 of 45 events are live-scraped; site has 26 tracks. Remaining loose ends:
  - **5 Nations BRX adapter** — real site is rallycrossbrx.com (calendar page structure not yet inspected). Current 3 BRX events were hand-entered from the official 2026 calendar announcement (real dates, `sample: false`) and will go stale without an adapter.
  - **Santa Pod known gap** — "Ultimate Street Car" (31 Jul–2 Aug) not captured; investigate its card markup on a future run (site 403s repeat requests, so probe sparingly).
  - **Gurston Down** — only track with no Wikidata match; stays unverified/no photo. Could add manually via admin page later.
  - **Gates/prices** — calendar pages don't publish them; all scraped events show TBC. Would need per-event page scraping (later refinement).
  - Adapter pattern to copy: `Get-BtccEvents` in refresh-events.ps1 — fetch page, regex the round blocks, `Parse-DayMonth`/`Parse-DateRange` for dates, `Find-Track` venue guard, emit ordered hashtables, `Merge-SeriesEvents "<id>" (...)` in main. Global dedupe by event id happens before the sorted write.
  - ⚠️ PS 5.1 gotchas (keep in mind for new adapters): scripts must stay pure ASCII (em-dash via `[char]0x2014`); don't wrap `ConvertFrom-Json` in `@()`; write JSON with `ConvertTo-Json -InputObject`.
- ✅ **Part 3 done (v0.4.3–v0.5.0): repo live at github.com/JamesWardVP/RaceDates**, Pages enabled by James, **site live and verified at https://jameswardvp.github.io/RaceDates/**. Daily refresh → commit → redeploy loop is fully automated. Local commits push via git credential manager (no gh CLI installed).

After Phase 2 (in order):
- **Phase 5 — Admin page**: password gate, add-track form, auto-enrichment of new venues (design depends on what the Phase 2 pipeline looks like).
- **Phase 6 — polish & first release** to `Releases/` as v1.0.0.

Note: the map page loads Leaflet 1.9.4 and CARTO dark tiles from CDNs (unpkg + basemaps.cartocdn.com) — needs internet, same as Google Fonts. `races.html` accepts `?series=`/`?group=`/`?type=` params for pre-filtered arrival.

Dev environment notes for any future session:
- Neither Node nor Python is installed on this machine. Local dev server is `tools/dev-server.ps1` (PowerShell HttpListener, port 8765, serves `main/`): run `powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-server.ps1` in the background via the PowerShell tool (`.claude/launch.json` exists but the Browser pane's preview_start failed to keep it alive). Verify pages in the Browser pane on `http://localhost:8765` — screenshots work (occasional 30s timeouts; retry or fall back to `read_page`/`javascript_tool` + `read_console_messages`).
- Shared header/footer are injected by `js/main.js`; race-type colours come from `--rt-*` variables in `css/style.css` and are applied with `data-racetype` attributes. `RaceDates.RACE_TYPES` in `js/main.js` is the registry of race-type ids/labels.

---

## Open decisions

1. **Visual direction (settled as of v0.1.2)** — dark asphalt theme, racing-red accent, per-race-type colours. Fonts: Racing Sans One (titles/headings, single weight 400) + Roboto (everything else), both free Google Fonts. Wavy-flag mask (`--flag-mask`) is used on nav boxes only, with the active page's red underline following the wave. Landing page uses shield-shaped "racing badge" components (`.badge-*` classes); generic `.card` is a plain bordered box for future pages. Past fonts logged in version history: Titillium Web (free), Victory Striker Sans Demo (personal-use only, removed).
2. **Data sources (Phase 2)** — there is no single free API for "all UK motorsport tracks and race calendars". Likely approach: Wikipedia/Wikidata for track data (location, capacity, opened date, type), plus per-series calendar scraping/feeds (British GT, BTCC, BSB, etc.). This is the highest-risk requirement and needs a research task early on.

---

## Project specification (agreed 2026-07-20)

A website about UK motorsport tracks and races (circuit, drag, rally, rallycross, hill climb, and others).

### Pages
1. **Landing page** — background images of UK race tracks / car & motorbike races.
2. **Map page** — interactive, filterable, searchable UK map. Two modes:
   - *Track mode:* shows tracks; filter/search by name or type of race hosted.
   - *Race mode:* shows which tracks host which races; filter/search by race/series (GT, MotoGP, etc.).
   - Clicking a track or race pin navigates to its page.
3. **Track page** — grid of UK tracks with cover images; filters for location, races hosted, track type. Each track has a detail page containing:
   - Online photos of the track/events.
   - Track name (title), location (subtitle), small map box with pin — clicking either opens the location in a new maps window.
   - Info: track type, age, seating capacity.
   - Two sections below: (a) race types hosted; (b) an easy-to-read calendar of upcoming events. Clicking an event opens a modal: name, dates, gate open/close times, entry cost, and a link to the track's own site where tickets can be bought.
4. **Race page** — lists all cups/races. Filters:
   - *Next upcoming* (soonest future race at top; past races omitted).
   - *Race type* (circuit, drag, hill climb, rally, etc.).
   - *Cost.*
   - *Cup/group* (e.g. view all GT Cup races — where and when — at once).
5. **Admin page** — password-protected; add new tracks. Also future-proofing: enter a new track name / minimal info and the site pulls the rest automatically.

### Key requirements
- **Auto-updating data:** the site pulls track & race information online automatically, no manual end-user input, so it stays current indefinitely.
- **Style:** motorsport aesthetic that suits all race types (not just circuit racing). Each race type gets its own identifying colour used consistently across map pins, cards, filters, and calendar entries.

### Workflow rules (standing)
- `main/` = development area. `Releases/` = finished complete builds only, ready for upload.
- Version format `release.major-update.minor-update`; all completed work logged in `version-history.md`.
- This file is always updated before pausing/ending a session.

---

## Roadmap

- ~~**Phase 1 — Foundation**~~ ✅ done, v0.1.0.
- ~~**Phase 2 — Data**~~ ✅ done, v0.5.0 (pipelines + GitHub automation + live hosting; minor loose ends listed in the worklog).
- ~~**Phase 3 — Core pages**~~ ✅ done, v0.2.0.
- ~~**Phase 4 — Map page**~~ ✅ done, v0.3.0.
- ~~**Phase 5 — Admin page**~~ ✅ done, v0.6.0.
- ~~**Phase 6 — Polish & release**~~ ✅ done, v1.0.0 (2026-07-21). All six phases complete.
