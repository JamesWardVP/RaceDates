# RaceDates — Project Rules

A website for UK motorsport tracks and race calendars. Full spec and live plan: `logs/current-plan.md`.

## Session workflow (always follow)
1. **At session start:** read `logs/current-plan.md` — it contains the active plan and the exact state of any in-progress work.
2. **When work completes:** remove it from `logs/current-plan.md` and log it in `logs/version-history.md` with a version bump.
3. **Before pausing or when session token usage gets high (~80%):** stop work and write the current in-progress state into `logs/current-plan.md` in enough detail that a fresh session can continue without any other context.

## Versioning
Format `release.major-update.minor-update`:
- **release** — a finished complete build copied into `Releases/`.
- **major-update** — a significant feature/page completed.
- **minor-update** — small changes and fixes.

## Folders
- `main/` — development area. All work happens here.
- `Releases/` — finished, complete builds only, ready for upload. Never develop here.
- `logs/` — version history + current plan/checkpoint.

## Architecture (decided 2026-07-20)
Static site (plain HTML/CSS/JS, no build step) reading JSON files from `main/data/`. Data is kept fresh by a scheduled refresh script (GitHub Actions) that regenerates the JSON and redeploys — target hosting is GitHub Pages/Netlify. The admin page writes to the data repo.
