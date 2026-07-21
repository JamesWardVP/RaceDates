# RaceDates — Data Schema

All site pages read from these JSON files. In the finished system they are
regenerated automatically by the scheduled data-refresh pipeline (Phase 2);
the current contents are a hand-seeded starting set and **facts are
approximate until the pipeline verifies them** (`"verified": false`).

## tracks.json — array of venue objects
| Field | Type | Notes |
|---|---|---|
| `id` | string | kebab-case unique id, used in URLs (`track.html?id=...`) |
| `name` | string | display name |
| `venueType` | string | `circuit`, `drag-strip`, `hill-climb`, `rallycross-circuit`, `kart-circuit` |
| `raceTypes` | string[] | race-type ids hosted: `circuit`, `moto`, `rally`, `rallycross`, `hillclimb`, `drag`, `oval`, `karting` |
| `location` | object | `{ town, county, country, lat, lng }` — lat/lng drive the map pins |
| `opened` | number | year the venue opened |
| `capacity` | number\|null | approximate spectator capacity |
| `lengthMiles` | number\|null | lap/run length in miles |
| `website` | string | official site (ticket links point here) |
| `image` | string\|null | cover image URL (Phase 2: pulled from Wikimedia Commons) |
| `summary` | string | short description for cards & detail page |
| `verified` | bool | false until confirmed by the data pipeline |

## series.json — array of race series / cup objects
| Field | Type | Notes |
|---|---|---|
| `id` | string | kebab-case unique id |
| `name` | string | display name (e.g. "British GT Championship") |
| `raceType` | string | one race-type id (drives the series' colour) |
| `group` | string | cup/group filter value (e.g. "GT", "Touring", "Superbike") |
| `website` | string | official series site |
| `summary` | string | short description |

## events.json — array of calendar entries
| Field | Type | Notes |
|---|---|---|
| `id` | string | unique id |
| `name` | string | event display name |
| `trackId` | string | -> tracks.json id |
| `seriesId` | string | -> series.json id |
| `startDate` / `endDate` | string | ISO `YYYY-MM-DD` |
| `gates` | object\|null | `{ open: "HH:MM", close: "HH:MM" }` |
| `price` | object\|null | `{ adult, currency }` — day-ticket guide price |
| `ticketUrl` | string | where tickets are bought (track/series site) |
| `sample` | bool | true = placeholder data for development only |
