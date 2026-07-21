/* Map page — interactive Leaflet map of every UK venue.
   Two modes:
     - Tracks: all venues, searchable by name/place, filterable by race type.
     - Races: venues hosting matching races — filter/search by series, race
       type or event name; popups list the races there with links.
   Pin colours come from the --rt-* CSS variables so they always match the
   site-wide race-type colour system. */

(async () => {
  const [tracks, series, events] = await Promise.all([
    RaceDates.getTracks(),
    RaceDates.getSeries(),
    RaceDates.getEvents(),
  ]);

  const seriesById = Object.fromEntries(series.map((s) => [s.id, s]));

  /* Resolve race-type colours from the stylesheet. */
  const rootStyle = getComputedStyle(document.documentElement);
  const rtColor = (typeId) => rootStyle.getPropertyValue(`--rt-${typeId}`).trim() || "#9aa1ab";

  /* ---------- map setup ---------- */

  const map = L.map("map", { scrollWheelZoom: true }).setView([54.6, -3.4], 6);

  /* Base map and place-name labels come as separate CARTO layers so the
     labels can sit in their own pane and be brightened independently —
     the default dark tiles render names too dim to read. */
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
  }).addTo(map);

  const labelsPane = map.createPane("labels");
  labelsPane.style.zIndex = 450;          // above tiles, below markers/popups
  labelsPane.style.pointerEvents = "none";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
    pane: "labels",
    maxZoom: 18,
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);

  function addMarker(track, popupHTML) {
    const marker = L.circleMarker([track.location.lat, track.location.lng], {
      radius: 9,
      fillColor: rtColor(track.raceTypes[0]),
      fillOpacity: 0.95,
      color: "#0f1115",
      weight: 2,
    });
    marker.bindTooltip(track.name);
    marker.bindPopup(popupHTML, { minWidth: 200 });
    markerLayer.addLayer(marker);
  }

  /* ---------- mode & filter state ---------- */

  let mode = "tracks";

  const modeTracksBtn = document.getElementById("mode-tracks");
  const modeRacesBtn = document.getElementById("mode-races");
  const trackControls = document.getElementById("track-controls");
  const raceControls = document.getElementById("race-controls");
  const countEl = document.getElementById("map-count");

  const searchInput = document.getElementById("map-search");
  const chipsWrap = document.getElementById("map-racetypes");

  const raceSearchInput = document.getElementById("map-race-search");
  const raceTypeSelect = document.getElementById("map-race-type");
  const seriesSelect = document.getElementById("map-series");

  /* Track-mode race-type chips */
  const usedTypes = [...new Set(tracks.flatMap((t) => t.raceTypes))];
  chipsWrap.innerHTML = usedTypes
    .map((id) => {
      const label = RaceDates.RACE_TYPES[id] ? RaceDates.RACE_TYPES[id].label : id;
      return `<span class="rt-badge rt-chip" data-racetype="${id}" role="button" tabindex="0" aria-pressed="false">${label}</span>`;
    })
    .join("");

  const selectedTypes = new Set();
  chipsWrap.querySelectorAll(".rt-chip").forEach((chip) => {
    const toggle = () => {
      const id = chip.dataset.racetype;
      if (selectedTypes.has(id)) selectedTypes.delete(id);
      else selectedTypes.add(id);
      chip.classList.toggle("selected", selectedTypes.has(id));
      chip.setAttribute("aria-pressed", selectedTypes.has(id));
      render();
    };
    chip.addEventListener("click", toggle);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });

  /* Race-mode selects */
  const usedRaceTypes = [...new Set(series.map((s) => s.raceType))];
  raceTypeSelect.innerHTML =
    '<option value="">All race types</option>' +
    usedRaceTypes.map((id) => {
      const label = RaceDates.RACE_TYPES[id] ? RaceDates.RACE_TYPES[id].label : id;
      return `<option value="${id}">${label}</option>`;
    }).join("");

  seriesSelect.innerHTML =
    '<option value="">All series</option>' +
    series.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  /* ---------- rendering ---------- */

  function trackPopup(t) {
    const badges = t.raceTypes.map(RaceDates.raceTypeBadge).join(" ");
    return `
      <a href="track.html?id=${t.id}">${t.name}</a>
      <span class="popup-loc">${[t.location.town, t.location.county].filter(Boolean).join(", ")} — ${t.location.country}</span>
      ${badges}`;
  }

  function racePopup(t, trackEvents) {
    const items = trackEvents
      .map((e) => {
        const s = seriesById[e.seriesId];
        return `<li>
          <a href="races.html${s ? `?series=${s.id}` : ""}">${e.name}</a>
          <span class="ev-date">${RaceDates.formatDateRange(e.startDate, e.endDate)}</span>
        </li>`;
      })
      .join("");
    return `
      <a href="track.html?id=${t.id}">${t.name}</a>
      <span class="popup-loc">${[t.location.town, t.location.county].filter(Boolean).join(", ")} — ${t.location.country}</span>
      <ul class="popup-events">${items}</ul>`;
  }

  function renderTracksMode() {
    const q = searchInput.value.trim().toLowerCase();
    const visible = tracks.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.location.town.toLowerCase().includes(q) && !t.location.county.toLowerCase().includes(q)) return false;
      if (selectedTypes.size && ![...selectedTypes].every((id) => t.raceTypes.includes(id))) return false;
      return true;
    });
    visible.forEach((t) => addMarker(t, trackPopup(t)));
    countEl.textContent = `${visible.length} track${visible.length === 1 ? "" : "s"}`;
  }

  function renderRacesMode() {
    const q = raceSearchInput.value.trim().toLowerCase();
    const type = raceTypeSelect.value;
    const seriesId = seriesSelect.value;

    const matching = events.filter((e) => {
      const s = seriesById[e.seriesId];
      if (!RaceDates.isUpcoming(e)) return false;
      if (type && (e.raceType || (s ? s.raceType : "")) !== type) return false;
      if (seriesId && e.seriesId !== seriesId) return false;
      if (q) {
        const hay = `${e.name} ${s ? s.name + " " + s.group : ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const byTrack = {};
    matching.forEach((e) => (byTrack[e.trackId] = byTrack[e.trackId] || []).push(e));

    let shown = 0;
    Object.entries(byTrack).forEach(([trackId, evs]) => {
      const t = tracks.find((x) => x.id === trackId);
      if (!t) return;
      evs.sort((a, b) => a.startDate.localeCompare(b.startDate));
      addMarker(t, racePopup(t, evs));
      shown++;
    });
    countEl.textContent = `${matching.length} race${matching.length === 1 ? "" : "s"} at ${shown} track${shown === 1 ? "" : "s"}`;
  }

  function render() {
    markerLayer.clearLayers();
    if (mode === "tracks") renderTracksMode();
    else renderRacesMode();
  }

  /* ---------- mode switching ---------- */

  function setMode(next) {
    mode = next;
    const tracksActive = mode === "tracks";
    modeTracksBtn.classList.toggle("active", tracksActive);
    modeRacesBtn.classList.toggle("active", !tracksActive);
    modeTracksBtn.setAttribute("aria-selected", tracksActive);
    modeRacesBtn.setAttribute("aria-selected", !tracksActive);
    trackControls.style.display = tracksActive ? "contents" : "none";
    raceControls.style.display = tracksActive ? "none" : "contents";
    render();
  }

  modeTracksBtn.addEventListener("click", () => setMode("tracks"));
  modeRacesBtn.addEventListener("click", () => setMode("races"));

  searchInput.addEventListener("input", render);
  raceSearchInput.addEventListener("input", render);
  raceTypeSelect.addEventListener("change", render);
  seriesSelect.addEventListener("change", render);

  render();
})();
