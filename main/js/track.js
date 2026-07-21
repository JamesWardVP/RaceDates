/* Track detail page — loaded as track.html?id=<trackId>.
   Shows photos (placeholders until the Phase 2 pipeline supplies real ones),
   location + map box, key facts, races hosted, and the upcoming events
   calendar with a per-event modal. */

(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  const [tracks, series, events] = await Promise.all([
    RaceDates.getTracks(),
    RaceDates.getSeries(),
    RaceDates.getEvents(),
  ]);

  const root = document.getElementById("track-detail");
  const track = tracks.find((t) => t.id === id);

  if (!track) {
    root.innerHTML = `
      <div class="page-title"><h1>Track not found</h1>
      <p>No track with that id. <a href="tracks.html">Back to all tracks</a>.</p></div>`;
    return;
  }

  document.title = `${track.name} — RaceDates`;

  const seriesById = Object.fromEntries(series.map((s) => [s.id, s]));
  const primaryType = track.raceTypes[0];
  const { lat, lng } = track.location;

  /* Both the subtitle and the map open the location in a new maps window. */
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const bbox = `${lng - 0.02},${lat - 0.012},${lng + 0.02},${lat + 0.012}`;
  const osmEmbed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;

  const age = new Date().getFullYear() - track.opened;

  const allTrackEvents = events.filter((e) => e.trackId === track.id);
  const trackEvents = allTrackEvents
    .filter((e) => RaceDates.isUpcoming(e))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pastEvents = allTrackEvents
    .filter((e) => !RaceDates.isUpcoming(e))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 5);

  const hostedSeriesIds = [...new Set(events.filter((e) => e.trackId === track.id).map((e) => e.seriesId))];

  root.innerHTML = `
    <div class="track-hero">
      <div>
        <h1>${track.name}</h1>
        <a class="subtitle" href="${mapsUrl}" target="_blank" rel="noopener"
           title="Open in Maps">📍 ${[track.location.town, track.location.county, track.location.country].filter(Boolean).join(", ")}</a>
        <div class="photo-strip" data-racetype="${primaryType}">
          ${track.image
            ? `<a class="photo-main" href="${track.image}" target="_blank" rel="noopener"
                 style="background-image:url('${track.image}')" title="View full-size photo"
                 aria-label="Photo of ${track.name}"></a>`
            : `<div class="photo-placeholder" data-racetype="${primaryType}">📷</div>
               <div class="photo-placeholder" data-racetype="${primaryType}">📷</div>
               <div class="photo-placeholder" data-racetype="${primaryType}">📷</div>`}
        </div>
        <p>${track.summary}</p>
      </div>
      <div class="map-box">
        <iframe src="${osmEmbed}" title="Map showing ${track.name}" loading="lazy"></iframe>
        <a class="map-open-link" href="${mapsUrl}" target="_blank" rel="noopener">Open in Maps ↗</a>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-tile"><div class="label">Venue type</div><div class="value">${venueLabel(track.venueType)}</div></div>
      <div class="info-tile"><div class="label">Opened</div><div class="value">${track.opened} <small>(${age} yrs)</small></div></div>
      <div class="info-tile"><div class="label">Capacity</div><div class="value">${track.capacity ? track.capacity.toLocaleString("en-GB") : "TBC"}</div></div>
      <div class="info-tile"><div class="label">Length</div><div class="value">${track.lengthMiles ? track.lengthMiles + " mi" : "TBC"}</div></div>
      <div class="info-tile"><div class="label">Official site</div><div class="value"><a href="${track.website}" target="_blank" rel="noopener">Visit ↗</a></div></div>
    </div>

    <div class="detail-columns">
      <section class="detail-section">
        <h2>Races Hosted</h2>
        <div class="hosted-badges">${track.raceTypes.map(RaceDates.raceTypeBadge).join("")}</div>
        <ul class="hosted-series">
          ${hostedSeriesIds.map((sid) => {
            const s = seriesById[sid];
            return s ? `<li data-racetype="${s.raceType}">${s.name}</li>` : "";
          }).join("") || '<li>No series data yet.</li>'}
        </ul>
      </section>
      <section class="detail-section">
        <h2>Upcoming Events</h2>
        <ul class="event-list">
          ${trackEvents.map(eventRowHTML).join("") ||
            `<li class="empty-note">${allTrackEvents.length
              ? "No more events this season."
              : "No events on the calendar for this track yet — more race series feeds are added over time."}</li>`}
        </ul>
        ${pastEvents.length ? `
          <h2 style="margin-top:1.5rem">Earlier This Season</h2>
          <ul class="event-list past-events">
            ${pastEvents.map(eventRowHTML).join("")}
          </ul>` : ""}
      </section>
    </div>`;

  function venueLabel(v) {
    return { "circuit": "Circuit", "drag-strip": "Drag Strip", "hill-climb": "Hill Climb", "rallycross-circuit": "Rallycross Circuit", "kart-circuit": "Kart Circuit" }[v] || v;
  }

  /* Venue-calendar events carry their own raceType; series events inherit
     their series' one. (Function declaration so it hoists — it's called
     during the initial page render above.) */
  function eventRaceType(e, s) { return e.raceType || (s ? s.raceType : ""); }

  function eventRowHTML(e) {
    const s = seriesById[e.seriesId];
    const d = RaceDates.parseISO(e.startDate);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `
      <li>
        <button class="event-row" data-event-id="${e.id}" data-racetype="${eventRaceType(e, s)}">
          <span class="event-date"><span class="day">${d.getDate()}</span><span class="month">${months[d.getMonth()]}</span></span>
          <span>
            <span class="event-name">${e.name}</span>
            <span class="event-series">${s ? s.name : ""} · ${RaceDates.formatDateRange(e.startDate, e.endDate)}</span>
          </span>
        </button>
      </li>`;
  }

  /* ---------- event modal ---------- */

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".event-row");
    if (!btn) return;
    const e = allTrackEvents.find((x) => x.id === btn.dataset.eventId);
    if (e) openModal(e);
  });

  function openModal(e) {
    const s = seriesById[e.seriesId];
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const rt = eventRaceType(e, s);
    backdrop.innerHTML = `
      <div class="modal" data-racetype="${rt}" role="dialog" aria-modal="true" aria-label="${e.name}">
        <button class="modal-close" aria-label="Close">✕</button>
        <h3>${e.name}</h3>
        ${rt ? RaceDates.raceTypeBadge(rt) : ""}
        <div class="modal-details">
          <div class="row"><span class="k">Dates</span><span class="v">${RaceDates.formatDateRange(e.startDate, e.endDate)}</span></div>
          <div class="row"><span class="k">Gates open</span><span class="v">${e.gates ? e.gates.open : "TBC"}</span></div>
          <div class="row"><span class="k">Gates close</span><span class="v">${e.gates ? e.gates.close : "TBC"}</span></div>
          <div class="row"><span class="k">Entry (adult day)</span><span class="v">${RaceDates.formatPrice(e.price)}</span></div>
          ${s ? `<div class="row"><span class="k">Series</span><span class="v">${s.name}</span></div>` : ""}
        </div>
        <a class="btn" href="${e.ticketUrl}" target="_blank" rel="noopener">Tickets at the track's site ↗</a>
      </div>`;

    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(kev) { if (kev.key === "Escape") close(); }

    backdrop.addEventListener("click", (cev) => {
      if (cev.target === backdrop || cev.target.closest(".modal-close")) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    backdrop.querySelector(".modal-close").focus();
  }
})();
