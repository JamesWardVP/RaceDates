/* Tracks page — grid of all venues with search + filters
   (location, races hosted, track type). */

(async () => {
  const [tracks] = await Promise.all([RaceDates.getTracks()]);

  const grid = document.getElementById("track-grid");
  const searchInput = document.getElementById("track-search");
  const countrySelect = document.getElementById("filter-country");
  const venueSelect = document.getElementById("filter-venue");
  const chipsWrap = document.getElementById("filter-racetypes");
  const countEl = document.getElementById("track-count");

  const VENUE_LABELS = {
    "circuit": "Circuit",
    "drag-strip": "Drag Strip",
    "hill-climb": "Hill Climb",
    "rallycross-circuit": "Rallycross Circuit",
    "kart-circuit": "Kart Circuit",
  };

  const VENUE_ICONS = {
    "circuit": "🏁",
    "drag-strip": "🚦",
    "hill-climb": "⛰️",
    "rallycross-circuit": "💨",
    "kart-circuit": "🏎️",
  };

  /* Populate the location + venue-type dropdowns from the data itself. */
  const countries = [...new Set(tracks.map((t) => t.location.country))].sort();
  countrySelect.innerHTML =
    '<option value="">All locations</option>' +
    countries.map((c) => `<option value="${c}">${c}</option>`).join("");

  const venueTypes = [...new Set(tracks.map((t) => t.venueType))];
  venueSelect.innerHTML =
    '<option value="">All track types</option>' +
    venueTypes.map((v) => `<option value="${v}">${VENUE_LABELS[v] || v}</option>`).join("");

  /* Race-type chips: multi-select toggles. */
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

  function cardHTML(t) {
    const primaryType = t.raceTypes[0];
    const badges = t.raceTypes.map(RaceDates.raceTypeBadge).join("");
    const cover = t.image
      ? `<div class="track-cover has-image" data-racetype="${primaryType}" style="background-image:url('${t.image}')"></div>`
      : `<div class="track-cover" data-racetype="${primaryType}">${VENUE_ICONS[t.venueType] || "🏁"}</div>`;
    return `
      <a class="card track-card" href="track.html?id=${t.id}">
        ${cover}
        <div class="track-card-body">
          <span class="venue-type-tag">${VENUE_LABELS[t.venueType] || t.venueType}</span>
          <h3>${t.name}</h3>
          <span class="track-card-loc">${[t.location.town, t.location.county].filter(Boolean).join(", ")} — ${t.location.country}</span>
          <div class="track-card-badges">${badges}</div>
        </div>
      </a>`;
  }

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const country = countrySelect.value;
    const venue = venueSelect.value;

    const visible = tracks.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.location.town.toLowerCase().includes(q) && !t.location.county.toLowerCase().includes(q)) return false;
      if (country && t.location.country !== country) return false;
      if (venue && t.venueType !== venue) return false;
      if (selectedTypes.size && ![...selectedTypes].every((id) => t.raceTypes.includes(id))) return false;
      return true;
    });

    countEl.textContent = `${visible.length} of ${tracks.length} tracks`;
    grid.innerHTML = visible.length
      ? visible.map(cardHTML).join("")
      : '<div class="empty-note">No tracks match those filters.</div>';
  }

  searchInput.addEventListener("input", render);
  countrySelect.addEventListener("change", render);
  venueSelect.addEventListener("change", render);

  render();
})();
