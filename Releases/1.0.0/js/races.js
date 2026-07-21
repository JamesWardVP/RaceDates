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

  let view = "calendar";
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

  /* Is `today` within [startDate, endDate] inclusive? (Plain string compare
     is safe here — both sides are "YYYY-MM-DD" so lexical order = date order.) */
  function isHappeningToday(e) {
    const key = RaceDates.toDateKey(new Date());
    return e.startDate <= key && key <= (e.endDate || e.startDate);
  }

  function itemHTML(e) {
    const s = seriesById[e.seriesId];
    const t = tracksById[e.trackId];
    const past = !RaceDates.isUpcoming(e);
    const rt = eventRaceType(e, s);
    const todayNow = isHappeningToday(e);
    return `
      <li class="race-item" data-racetype="${rt}"${past ? ' style="opacity:0.55"' : ""}>
        <div class="race-main">
          <div class="race-name">
            ${todayNow ? '<span class="today-badge" title="Happening today">● Today</span>' : ""}
            ${e.name}${past ? " (past)" : ""}
          </div>
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
        const key = RaceDates.toDateKey(d);
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
    const todayKey = RaceDates.toDateKey(new Date());

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, otherMonth: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, otherMonth: false, key: RaceDates.toDateKey(new Date(calYear, calMonth, d)) });
    }
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const d = cells.length - (startOffset + daysInMonth) + 1;
      cells.push({ day: d, otherMonth: true, key: null });
    }

    const MS_DAY = 86400000;

    function chipHTML(e, cellKey) {
      const s = seriesById[e.seriesId];
      const t = tracksById[e.trackId];
      const rt = eventRaceType(e, s);
      const startD = RaceDates.parseISO(e.startDate);
      const endD = RaceDates.parseISO(e.endDate || e.startDate);
      const totalDays = Math.round((endD - startD) / MS_DAY) + 1;
      const dayIndex = Math.round((RaceDates.parseISO(cellKey) - startD) / MS_DAY) + 1;
      const dayTag = totalDays > 1 ? ` (Day ${dayIndex} of ${totalDays})` : "";
      const trackName = t ? t.name : e.trackId;
      const dateRange = RaceDates.formatDateRange(e.startDate, e.endDate);
      const price = RaceDates.formatPrice(e.price);
      const href = `track.html?id=${e.trackId}`;
      return `
        <div class="cal-event">
          <a class="cal-chip" data-racetype="${rt}" href="${href}">
            <span class="cal-chip-title">${e.name}${dayTag}</span>
            <span class="cal-chip-venue">${trackName}</span>
          </a>
          <div class="cal-tooltip" role="tooltip">
            <div class="cal-tooltip-title">${e.name}${dayTag}</div>
            <div class="cal-tooltip-row">${dateRange}</div>
            <div class="cal-tooltip-row">${trackName}</div>
            ${s ? `<div class="cal-tooltip-row">${s.group}</div>` : ""}
            <div class="cal-tooltip-row">${price}</div>
            <a class="cal-tooltip-more" href="${href}">More info →</a>
          </div>
        </div>`;
    }

    calGrid.innerHTML = cells.map((c) => {
      if (c.otherMonth) return `<div class="cal-cell cal-cell-outside"><span class="cal-daynum">${c.day}</span></div>`;
      const dayEvents = (byDate[c.key] || []).sort((a, b) => a.startDate.localeCompare(b.startDate));
      const isToday = c.key === todayKey;
      const chips = dayEvents.slice(0, 3).map((e) => chipHTML(e, c.key)).join("");
      const more = dayEvents.length > 3 ? `<span class="cal-more">+${dayEvents.length - 3} more</span>` : "";
      return `
        <div class="cal-cell${isToday ? " cal-cell-today" : ""}">
          <span class="cal-daynum">${c.day}</span>
          <div class="cal-chips">${chips}${more}</div>
        </div>`;
    }).join("");
  }

  /* Tooltip interaction: desktop reveals it on hover via CSS (see
     style.css) and a normal click on the chip navigates straight through.
     Touch devices have no hover, so the first tap opens the tooltip instead
     of navigating; a second tap on the (now-open) chip, or its "More info"
     link, navigates normally. Tapping elsewhere closes any open tooltip. */
  const isTouchDevice = () => !window.matchMedia("(hover: hover)").matches;

  calGrid.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".cal-chip");
    if (!chip || !isTouchDevice()) return;
    const wrap = chip.closest(".cal-event");
    if (!wrap.classList.contains("tt-open")) {
      ev.preventDefault();
      calGrid.querySelectorAll(".cal-event.tt-open").forEach((el) => el.classList.remove("tt-open"));
      wrap.classList.add("tt-open");
    }
  });

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".cal-event")) {
      calGrid.querySelectorAll(".cal-event.tt-open").forEach((el) => el.classList.remove("tt-open"));
    }
  });

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

  setView("calendar");
})();
