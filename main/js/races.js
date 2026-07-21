/* Races page — every cup/championship round in date order.
   Next upcoming appears first and past races are omitted (unless the
   "include past" box is ticked). Filters: race type, cup/group, series, cost. */

(async () => {
  const [tracks, series, events] = await Promise.all([
    RaceDates.getTracks(),
    RaceDates.getSeries(),
    RaceDates.getEvents(),
  ]);

  const listEl = document.getElementById("race-list");
  const typeSelect = document.getElementById("filter-racetype");
  const groupSelect = document.getElementById("filter-group");
  const seriesSelect = document.getElementById("filter-series");
  const costSelect = document.getElementById("filter-cost");
  const pastCheckbox = document.getElementById("filter-past");
  const countEl = document.getElementById("race-count");

  const tracksById = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const seriesById = Object.fromEntries(series.map((s) => [s.id, s]));

  /* Populate filters from the data. */
  const usedTypes = [...new Set(series.map((s) => s.raceType))];
  typeSelect.innerHTML =
    '<option value="">All race types</option>' +
    usedTypes.map((id) => {
      const label = RaceDates.RACE_TYPES[id] ? RaceDates.RACE_TYPES[id].label : id;
      return `<option value="${id}">${label}</option>`;
    }).join("");

  const groups = [...new Set(series.map((s) => s.group))].sort();
  groupSelect.innerHTML =
    '<option value="">All cups / groups</option>' +
    groups.map((g) => `<option value="${g}">${g}</option>`).join("");

  seriesSelect.innerHTML =
    '<option value="">All series</option>' +
    series.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  const COST_BANDS = [
    { value: "", label: "Any cost" },
    { value: "25", label: "Up to £25" },
    { value: "35", label: "Up to £35" },
    { value: "50", label: "Up to £50" },
  ];
  costSelect.innerHTML = COST_BANDS.map((b) => `<option value="${b.value}">${b.label}</option>`).join("");

  /* Venue-calendar events carry their own raceType; series events inherit
     their series' one. */
  const eventRaceType = (e, s) => e.raceType || (s ? s.raceType : "");

  function itemHTML(e) {
    const s = seriesById[e.seriesId];
    const t = tracksById[e.trackId];
    const past = !RaceDates.isUpcoming(e);
    const rt = eventRaceType(e, s);
    return `
      <li class="race-item" data-racetype="${rt}"${past ? ' style="opacity:0.55"' : ""}>
        <div class="race-main">
          <div class="race-name">${e.name}${past ? " (past)" : ""}</div>
          <div class="race-meta">
            ${RaceDates.formatDateRange(e.startDate, e.endDate)}
            · <a href="track.html?id=${e.trackId}">${t ? t.name : e.trackId}</a>
            ${s ? `· ${s.group}` : ""}
          </div>
        </div>
        ${rt ? RaceDates.raceTypeBadge(rt) : ""}
        <div class="race-price">${RaceDates.formatPrice(e.price)}</div>
        <div class="race-actions">
          <a class="btn btn-outline" href="track.html?id=${e.trackId}">Track</a>
          <a class="btn" href="${e.ticketUrl}" target="_blank" rel="noopener">Tickets</a>
        </div>
      </li>`;
  }

  function render() {
    const type = typeSelect.value;
    const group = groupSelect.value;
    const seriesId = seriesSelect.value;
    const maxCost = costSelect.value ? Number(costSelect.value) : null;
    const includePast = pastCheckbox.checked;

    const visible = events
      .filter((e) => {
        const s = seriesById[e.seriesId];
        if (!includePast && !RaceDates.isUpcoming(e)) return false;
        if (type && eventRaceType(e, s) !== type) return false;
        if (group && (!s || s.group !== group)) return false;
        if (seriesId && e.seriesId !== seriesId) return false;
        if (maxCost != null && (!e.price || e.price.adult > maxCost)) return false;
        return true;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    countEl.textContent = `${visible.length} race${visible.length === 1 ? "" : "s"}`;
    listEl.innerHTML = visible.length
      ? visible.map(itemHTML).join("")
      : '<li class="empty-note">No races match those filters.</li>';
  }

  [typeSelect, groupSelect, seriesSelect, costSelect].forEach((el) => el.addEventListener("change", render));
  pastCheckbox.addEventListener("change", render);

  /* Support pre-filtered links, e.g. races.html?series=btcc or ?group=GT
     (used by the map page's popups). */
  const params = new URLSearchParams(location.search);
  if (params.get("series") && seriesById[params.get("series")]) seriesSelect.value = params.get("series");
  if (params.get("group") && groups.includes(params.get("group"))) groupSelect.value = params.get("group");
  if (params.get("type")) typeSelect.value = params.get("type");

  render();
})();
