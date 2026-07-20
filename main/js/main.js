/* ==========================================================================
   RaceDates — shared site behaviour
   Injects the header/footer on every page and provides data-loading helpers
   used by the map, tracks and races pages.
   ========================================================================== */

const RaceDates = (() => {
  /* Race-type registry: single source of truth for labels & colours.
     Colour values live in css/style.css as --rt-* variables. */
  const RACE_TYPES = {
    circuit:    { label: "Circuit (Car)" },
    moto:       { label: "Motorbike" },
    rally:      { label: "Rally" },
    rallycross: { label: "Rallycross" },
    hillclimb:  { label: "Hill Climb" },
    drag:       { label: "Drag Racing" },
    oval:       { label: "Oval / Stock" },
    karting:    { label: "Karting" },
  };

  const NAV_LINKS = [
    { href: "index.html",  label: "Home" },
    { href: "map.html",    label: "Map" },
    { href: "tracks.html", label: "Tracks" },
    { href: "races.html",  label: "Races" },
  ];

  /* ---------- data loading ---------- */

  const cache = {};

  async function loadData(name) {
    if (cache[name]) return cache[name];
    const res = await fetch(`data/${name}.json`);
    if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
    cache[name] = await res.json();
    return cache[name];
  }

  const getTracks = () => loadData("tracks");
  const getSeries = () => loadData("series");
  const getEvents = () => loadData("events");

  /* ---------- shared UI ---------- */

  function currentPage() {
    const path = location.pathname.split("/").pop();
    return path === "" ? "index.html" : path;
  }

  function renderHeader() {
    const header = document.createElement("header");
    header.className = "site-header";
    const links = NAV_LINKS.map((l) => {
      const active = currentPage() === l.href ? ' class="active"' : "";
      return `<a href="${l.href}"${active}>${l.label}</a>`;
    }).join("");
    header.innerHTML = `
      <div class="container">
        <a class="brand" href="index.html"><span class="flag"></span>Race<em>Dates</em></a>
        <nav class="site-nav">${links}</nav>
      </div>`;
    document.body.prepend(header);
  }

  function renderFooter() {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="container">
        <span>RaceDates — UK motorsport tracks &amp; race calendars</span>
        <a href="admin.html">Admin</a>
      </div>`;
    document.body.append(footer);
  }

  /* Badge for a race type, coloured via [data-racetype] CSS rules. */
  function raceTypeBadge(typeId) {
    const label = RACE_TYPES[typeId] ? RACE_TYPES[typeId].label : typeId;
    return `<span class="rt-badge" data-racetype="${typeId}">${label}</span>`;
  }

  /* ---------- date & price helpers ---------- */

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /* "2026-08-01".."2026-08-02" -> "1–2 Aug 2026"; spanning months -> "31 Aug – 1 Sep 2026" */
  function formatDateRange(startISO, endISO) {
    const s = parseISO(startISO);
    const e = parseISO(endISO || startISO);
    if (s.getTime() === e.getTime()) {
      return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    }
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }

  function formatPrice(price) {
    if (!price || price.adult == null) return "TBC";
    return `£${price.adult}`;
  }

  /* An event counts as upcoming until its last day has passed. */
  function isUpcoming(event) {
    const end = parseISO(event.endDate || event.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end.getTime() >= today.getTime();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderHeader();
    renderFooter();
  });

  return { RACE_TYPES, getTracks, getSeries, getEvents, raceTypeBadge, parseISO, formatDateRange, formatPrice, isUpcoming };
})();
