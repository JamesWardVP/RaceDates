# RaceDates — Current Plan & Session Checkpoint

> **Purpose of this file:** This is the live plan and the checkpoint for pausing work.
> - Whatever is actively being worked on is described under **"Work currently underway"** with enough detail that a brand-new session can pick it up and continue without any other context.
> - When something here is completed, it is removed from this file and logged in `version-history.md`.
> - When the session token limit approaches a set percentage, work stops and the exact state of in-progress work is written here before ending.

---

## Work currently underway

**Status: Phase 5 COMPLETE (v0.6.0) — admin page live with one-name track automation, discovered-venue review, event entry and direct GitHub publishing. Next: Phase 6 (polish & first release to `Releases/` as v1.0.0).**

Phase 6 checklist (when started):
- Cross-page click-through test on the live site; mobile/responsive pass (nav wrap, filter bar, admin forms at 375px).
- Decide whether `Releases/` gets a copy of `main/` per release or a zip; do the v1.0.0 copy + version-history entry.
- Loose ends worth sweeping: BRX adapter (rallycrossbrx.com), Santa Pod "Ultimate Street Car" parse gap, favicon, per-event page scraping for gates/prices, maybe a 404 page for Pages.

**Event-coverage adapter backlog** (v0.6.3 research: no universal source exists — UK venue sites have no schema.org Event JSON-LD; each source needs a small adapter in `tools/refresh-events.ps1`, pattern = `Get-BtccEvents`). 25 of 47 tracks currently have no events. Priority sources to investigate, by venue cluster:
- **Castle Combe** — own race calendar on castlecombecircuit.co.uk (site up, JSON-LD is Place-only; scrape the calendar page HTML).
- **Goodwood** — goodwood.com (Members' Meeting / Festival of Speed / Revival).
- **Anglesey, Mallory Park, Kirkistown, Knockhill non-BSB** — own-site calendars, structure unknown (Mallory site timing out on 2026-07-20).
- **Melbourne Raceway / Elvington drag** — promoter is Straightliners; straightliners-events.co.uk has broken TLS (handshake fails from PS *and* modern fetchers) — recheck occasionally or find their Facebook/alternative feed.
- **Stock-car/banger ovals** (Lochgelly, Mendips, Hednesford, Odsal, King's Lynn, Swaffham, Eddie Wright) — promoter sites: hardieracepromotions.co.uk (Lochgelly), trackstar-racing? (King's Lynn), startrax (Odsal?) — research needed.
- **Motocross (Foxhill, Cwmythig Hill)** — series calendars (British Motocross Championship?) — research needed; note site has no motocross race type yet (would need a new `--rt-*` colour + registry entry).
- **Snaefell Mountain Course / Oliver's Mount / Tandragee** — road-racing calendars (Isle of Man TT dates, Oliver's Mount events on olivers-mount site?) — research needed.

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
- **Phase 6 — Polish & release:** cross-page testing, responsive/mobile pass, first build copied to `Releases/` as v1.0.0.
