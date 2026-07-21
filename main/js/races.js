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
  const pastLabel = document.getElementById("filter-past-label");
  const countEl = document.getElementById("race-count");

  const viewListBtn = document.getElementById("view-list");
  const viewCalBtn = document.getElementById("view-calendar");
  const calendarView = document.getElementById("calendar-view");
  const calGrid = document.getElementById("cal-grid");
  const calLabel = document.getElementById("cal-label");
  const calPrev = document.getElementById("cal-prev");
  const calNext = document.getElementById("cal-next");

  let view = "list";
  const today = new Date();
  let calYear = today.getFullYear();
  let calMonth = today.getMonth(); // 0-indexed

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

  /* Filters shared by both views. In calendar mode "include past" is ignored
     (a month grid always shows every day; past ones just render dimmed). */
  function filteredEvents({ ignorePast } = {}) {
    const type = typeSelect.value;
    const group = groupSelect.value;
    const seriesId = seriesSelect.value;
    const maxCost = costSelect.value ? Number(costSelect.value) : null;
    const includePast = ignorePast || pastCheckbox.checked;

    return events
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
  }

  function renderList() {
    const visible = filteredEvents();
    countEl.textContent = `${visible.length} race${visible.length === 1 ? "" : "s"}`;
    listEl.innerHTML = visible.length
      ? visible.map(itemHTML).join("")
      : '<li class="empty-note">No races match those filters.</li>';
  }

  /* ---------- calendar view ---------- */

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function renderCalendar() {
    const visible = filteredEvents({ ignorePast: true });
    const byDate = {};
    const monthIds = new Set();
    const monthStart = new Date(calYear, calMonth, 1);
    const monthEnd = new Date(calYear, calMonth + 1, 0);
    visible.forEach((e) => {
      const start = RaceDates.parseISO(e.startDate);
      const end = RaceDates.parseISO(e.endDate || e.startDate);
      if (end < monthStart || start > monthEnd) return; // doesn't touch this month
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        (byDate[key] = byDate[key] || []).push(e);
      }
      monthIds.add(e.id);
    });

    calLabel.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
    countEl.textContent = `${monthIds.size} race${monthIds.size === 1 ? "" : "s"} in ${MONTH_NAMES[calMonth]}`;

    const first = new Date(calYear, calMonth, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
    const todayKey = new Date().toISOString().slice(0, 10);

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, otherMonth: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(calYear, calMonth, d).toISOString().slice(0, 10);
      cells.push({ day: d, otherMonth: false, key });
    }
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const d = cells.length - (startOffset + daysInMonth) + 1;
      cells.push({ day: d, otherMonth: true, key: null });
    }

    calGrid.innerHTML = cells.map((c) => {
      if (c.otherMonth) return `<div class="cal-cell cal-cell-outside"><span class="cal-daynum">${c.day}</span></div>`;
      const dayEvents = (byDate[c.key] || []).sort((a, b) => a.startDate.localeCompare(b.startDate));
      const isToday = c.key === todayKey;
      const chips = dayEvents.slice(0, 3).map((e) => {
        const s = seriesById[e.seriesId];
        const rt = eventRaceType(e, s);
        return `<a class="cal-chip" data-racetype="${rt}" href="track.html?id=${e.trackId}" title="${e.name} — ${RaceDates.formatDateRange(e.startDate, e.endDate)}">${e.name}</a>`;
      }).join("");
      const more = dayEvents.length > 3 ? `<span class="cal-more">+${dayEvents.length - 3} more</span>` : "";
      return `
        <div class="cal-cell${isToday ? " cal-cell-today" : ""}">
          <span class="cal-daynum">${c.day}</span>
          <div class="cal-chips">${chips}${more}</div>
        </div>`;
    }).join("");
  }

  function render() {
    if (view === "list") renderList(); else renderCalendar();
  }

  function setView(next) {
    view = next;
    const listActive = view === "list";
    viewListBtn.classList.toggle("active", listActive);
    viewCalBtn.classList.toggle("active", !listActive);
    viewListBtn.setAttribute("aria-selected", listActive);
    viewCalBtn.setAttribute("aria-selected", !listActive);
    listEl.hidden = !listActive;
    calendarView.hidden = listActive;
    pastLabel.style.display = listActive ? "flex" : "none";
    render();
  }

  viewListBtn.addEventListener("click", () => setView("list"));
  viewCalBtn.addEventListener("click", () => setView("calendar"));

  calPrev.addEventListener("click", () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

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
