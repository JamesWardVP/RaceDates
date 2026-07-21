# RaceDates — Current Plan & Session Checkpoint

> **Purpose of this file:** This is the live plan and the checkpoint for pausing work.
> - Whatever is actively being worked on is described under **"Work currently underway"** with enough detail that a brand-new session can pick it up and continue without any other context.
> - When something here is completed, it is removed from this file and logged in `version-history.md`.
> - When the session token limit approaches a set percentage, work stops and the exact state of in-progress work is written here before ending.

---

## Work currently underway

**Status: James's follow-up batch of 2026-07-21 (live calendar bug, load-time fix, cross-country events, better "other"-venue photos) is COMPLETE — logged as v0.9.0, verified in browser, ready to commit+push. Phase 6 (polish & first release) is next — nothing blocking it now.**

Remaining loose ends, for a future session:
- ~~Calendar toggle~~ ✅ actually fixed in v0.9.1 — it was a genuine CSS bug (`.race-list[hidden]` needed explicit `display:none` to beat the class's own `display:flex`), not a caching issue as first assumed in v0.9.0. Lesson: when a user reports a UI bug and it can't be reproduced, don't stop at a plausible-sounding theory (caching) — check computed styles / DOM state directly before concluding.
- BriSCA F1's *own* fixtures page (briscaf1.com/fixtures) redirects to a stale 2020 archive — currently sourced from cayzerracing.co.uk's fixture table instead, which is fine but worth rechecking occasionally in case the official site fixes its URL.
- Straightliners' own domain (straightliners-events.co.uk) still has broken TLS from every client tested (PS, curl, WebFetch, in-app browser navigation); the mirror straightliners.events works and is what the adapter uses — no action needed unless that mirror also breaks.
- Isle of Man TT / Manx GP (Snaefell Mountain Course) and Tandragee 100 road-racing calendars — not yet investigated.
- **More "Other" cross-country events**: only Race the Waves added so far (James's named example). If he names more, add them the same way — a track with venueType `other` if there's no fixed permanent surface, an event on the `venue` series with a per-event `raceType` matching what actually happens there. Don't invent entries without a real source.
- 7 tracks still have no photo at all (Commons search found nothing suitable) — could try Google Maps Places photos as James suggested, but that needs an API key (cost/setup — ask James before adding).

Phase 6 checklist (when started):
- Cross-page click-through test on the live site; mobile/responsive pass (nav wrap, filter bar, admin forms at 375px).
- Decide whether `Releases/` gets a copy of `main/` per release or a zip; do the v1.0.0 copy + version-history entry.
- Loose ends worth sweeping: BRX adapter (rallycrossbrx.com), Santa Pod "Ultimate Street Car" parse gap, favicon, per-event page scraping for gates/prices, maybe a 404 page for Pages.

**Event-coverage adapter backlog** (each source = a small adapter in `tools/refresh-events.ps1`; series pattern = `Get-BtccEvents`, venue-calendar pattern = `Get-LyddenEvents` + `Merge-VenueEvents` with per-event `raceType`):
- ~~Lydden Hill venue calendar~~ ✅ v0.7.0 (15 events).
- ~~Goodwood (MM/FoS/Revival)~~ ✅ v0.7.0 (3 events).
- ~~5 Nations BRX~~ — rallycrossbrx.com pages carry no dates in HTML; covered by Lydden venue feed + hand-entered Pembrey/finale rounds. Revisit only if their site changes.
- ~~Oliver's Mount~~ ✅ v0.8.0 (6 events, oliversmount.com/events2).
- ~~Lochgelly Raceway~~ ✅ v0.8.0 (19 events, hardieracepromotions.co.uk fixtures).
- ~~BriSCA F1 Stock Cars~~ ✅ v0.8.0 (42 events, 7 new venues added — via cayzerracing.co.uk since briscaf1.com/fixtures redirects to a stale 2020 archive).
- ~~Straightliners (mobile host)~~ ✅ v0.8.0 (12 events, 9 new venues added — straightliners-events.co.uk has broken TLS on every client tested; the working mirror straightliners.events was used instead).
- **Castle Combe** — calendar paths return 403 to non-browser clients; try other UAs/paths, or their ticket-shop domain.
- **Pembrey** — /events is JS-rendered; look for a data endpoint in its page source or an alternative feed.
- **Anglesey, Mallory Park, Kirkistown, Knockhill non-BSB** — own-site calendars, structure unknown (Mallory site timing out on 2026-07-20).
- **Remaining stock-car/banger ovals** (Mendips, Odsal, Swaffham, Eddie Wright, Hednesford — Hednesford has a track already but no adapter feeding it) — check whether BriSCA's calendar covers these too, or find their own promoter sites.
- **Motocross (Foxhill, Cwmythig Hill)** — series calendars (British Motocross Championship?) — research needed; note site has no motocross race type yet (would need a new `--rt-*` colour + registry entry, same pattern as `other` added in v0.8.0).
- **Snaefell Mountain Course (Isle of Man TT/Manx GP) / Tandragee 100** — road-racing calendars — research needed.

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
