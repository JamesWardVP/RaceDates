/* Admin page — add tracks & events with maximum automation.
   - Track search auto-enriches from Wikidata (coords, photo, website, opened,
     capacity), Wikimedia Commons (photo fallback by location) and OpenStreetMap
     Nominatim (town/county/country from coordinates).
   - Changes are staged in the browser, then committed straight to the GitHub
     repo via the API (token pasted at use-time, never stored) — the commit
     triggers the automatic Pages redeploy. Download fallback included.
   - The password gate is a deterrent only: this is a static site, everything
     here is client-side. Real protection is that publishing needs a GitHub
     token only James has. */

(() => {
  const PASSWORD_SHA256 = "13a93cc2ee43245f6ff361c27b6794b897da1bc7f23e91f24fcb5ba702127d04";
  const REPO = "JamesWardVP/RaceDates";

  const VENUE_TYPES = {
    "circuit": "Circuit",
    "drag-strip": "Drag Strip",
    "hill-climb": "Hill Climb",
    "rallycross-circuit": "Rallycross Circuit",
    "kart-circuit": "Kart Circuit",
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- password gate ---------- */

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function tryUnlock() {
    const val = $("admin-password").value;
    if ((await sha256Hex(val)) === PASSWORD_SHA256) {
      sessionStorage.setItem("rd-admin", "1");
      showApp();
    } else {
      $("admin-lock-msg").textContent = "Wrong password.";
    }
  }

  /* ---------- state ---------- */

  let tracks = [], series = [], events = [], discovered = [];
  let dirtyTracks = false, dirtyEvents = false;
  const staged = [];

  async function showApp() {
    $("admin-lock").hidden = true;
    $("admin-app").hidden = false;
    [tracks, series, events] = await Promise.all([
      RaceDates.getTracks(), RaceDates.getSeries(), RaceDates.getEvents(),
    ]);
    try {
      discovered = await (await fetch("data/discovered-tracks.json")).json();
    } catch { discovered = []; }
    $("discovered-count").textContent = `(${discovered.length})`;
    renderTrackForm({});
    renderDiscovered();
    renderEventForm();
    renderStaged();
  }

  /* ---------- tabs ---------- */

  document.querySelectorAll(".admin-tabs .mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs .mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      ["add-track", "discovered", "add-event", "publish"].forEach((t) => {
        $(`tab-${t}`).hidden = t !== btn.dataset.tab;
      });
    });
  });

  /* ---------- Wikidata search & enrichment ---------- */

  async function wdSearch() {
    const q = $("wd-search").value.trim();
    if (!q) return;
    $("wd-results").innerHTML = '<p class="admin-hint">Searching Wikidata…</p>';
    try {
      const res = await (await fetch(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&origin=*&search=${encodeURIComponent(q)}`
      )).json();
      const hits = res.search || [];
      $("wd-results").innerHTML = `
        <ul class="admin-results">
          ${hits.map((h) => `
            <li>
              <button type="button" class="btn btn-outline" data-qid="${h.id}">Use</button>
              <strong>${h.label}</strong> <span class="admin-hint">${h.description || ""} (${h.id})</span>
            </li>`).join("")}
          <li><button type="button" class="btn btn-outline" data-qid="">No match — fill in manually</button></li>
        </ul>`;
      $("wd-results").querySelectorAll("button[data-qid]").forEach((b) => {
        b.addEventListener("click", () => b.dataset.qid ? useEntity(b.dataset.qid) : renderTrackForm({ name: q }));
      });
    } catch (err) {
      $("wd-results").innerHTML = `<p class="admin-hint">Search failed: ${err.message}</p>`;
    }
  }

  async function useEntity(qid, overrides = {}) {
    $("wd-results").innerHTML = '<p class="admin-hint">Fetching venue details…</p>';
    const data = await gatherEntityData(qid, overrides);
    $("wd-results").innerHTML = "";
    renderTrackForm(data);
  }

  /* Pull everything we can about a Wikidata entity: claims, Commons photo
     fallback, and reverse-geocoded town/county/country. */
  async function gatherEntityData(qid, overrides = {}) {
    const data = { wikidata: qid, ...overrides };
    try {
      const res = await (await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims%7Csitelinks%7Clabels%7Cdescriptions&ids=${qid}`
      )).json();
      const entity = res.entities[qid];
      const claims = entity.claims || {};
      const claim = (p) => claims[p] && claims[p][0].mainsnak.datavalue && claims[p][0].mainsnak.datavalue.value;

      data.name = data.name || (entity.labels.en && entity.labels.en.value) || "";
      data.description = (entity.descriptions && entity.descriptions.en && entity.descriptions.en.value) || "";
      // P576 = dissolved/abolished, P3999 = date of official closure
      data.defunct = !!(claims.P576 || claims.P3999);
      const coord = claim("P625");
      if (coord) { data.lat = coord.latitude; data.lng = coord.longitude; }
      const img = claim("P18");
      if (img && !data.image) {
        data.image = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(img) + "?width=900";
      }
      const site = claim("P856");
      if (site) data.website = site;
      const openedClaim = claim("P1619") || claim("P571");
      if (openedClaim && openedClaim.time) data.opened = parseInt(openedClaim.time.substring(1, 5), 10);
      const cap = claim("P1083");
      if (cap && cap.amount) data.capacity = parseInt(cap.amount.replace("+", ""), 10);
      if (entity.sitelinks && entity.sitelinks.enwiki) {
        data.wikipedia = "https://en.wikipedia.org/wiki/" + entity.sitelinks.enwiki.title.replace(/ /g, "_");
      }
    } catch { /* carry on with whatever we have */ }

    /* Photo fallback: nearest Commons photo taken at the venue */
    if (!data.image && data.lat != null) {
      try {
        const res = await (await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*&gsnamespace=6&gsradius=900&gslimit=25&gscoord=${data.lat}%7C${data.lng}`
        )).json();
        const hit = (res.query.geosearch || []).find((h) =>
          /\.(jpe?g|png|webp)$/i.test(h.title) && !/map|logo|diagram|plan|crest|sign/i.test(h.title));
        if (hit) {
          data.image = "https://commons.wikimedia.org/wiki/Special:FilePath/" +
            encodeURIComponent(hit.title.replace(/^File:/, "")) + "?width=900";
        }
      } catch { }
    }

    /* Reverse geocode town/county/country from the coordinates */
    if (data.lat != null && !(data.town && data.county && data.country)) {
      try {
        const res = await (await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${data.lat}&lon=${data.lng}`
        )).json();
        const a = res.address || {};
        data.town = data.town || a.town || a.village || a.city || a.suburb || a.municipality || a.borough || a.hamlet || "";
        data.county = data.county || a.county || a.state_district || a.state || "";
        const cc = (a.country_code || "").toUpperCase();
        data.country = data.country ||
          ({ GB: a.state || "England", JE: "Jersey", GG: "Guernsey", IM: "Isle of Man" }[cc]) || a.country || "";
      } catch { }
    }

    return data;
  }

  /* ---------- fully automatic add (discovered venues) ---------- */

  const inferVenueType = (text) => {
    if (/hill ?climb/i.test(text)) return "hill-climb";
    if (/drag/i.test(text)) return "drag-strip";
    if (/kart/i.test(text)) return "kart-circuit";
    if (/rallycross/i.test(text)) return "rallycross-circuit";
    return "circuit";
  };

  const inferRaceTypes = (venueType, text) => {
    switch (venueType) {
      case "hill-climb": return ["hillclimb"];
      case "drag-strip": return ["drag"];
      case "kart-circuit": return ["karting"];
      case "rallycross-circuit": return ["rallycross"];
    }
    const moto = /motorcycl|motorbike|superbike|road rac|tt course/i.test(text);
    const car = /\bcar\b|touring|grand prix|formula/i.test(text);
    if (moto && !car) return ["moto"];
    return moto ? ["circuit", "moto"] : ["circuit"];
  };

  async function autoAddDiscovered(dv, statusEl) {
    statusEl.textContent = "Gathering data…";
    const data = await gatherEntityData(dv.qid, {
      name: dv.name, lat: dv.lat, lng: dv.lng, opened: dv.opened,
      capacity: dv.capacity, image: dv.image, website: dv.website, wikipedia: dv.wikipedia,
    });

    /* Summary from the venue's own Wikipedia intro when it has one */
    let summary = "";
    if (data.wikipedia) {
      try {
        const title = data.wikipedia.split("/wiki/")[1];
        const res = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)).json();
        const extract = (res.extract || "").trim();
        if (extract) {
          summary = extract.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
          if (summary.length > 260) summary = summary.split(/(?<=\.)\s+/)[0];
        }
      } catch { }
    }

    /* The photo filename often names the discipline ("Motorcycle racing -
       Olivers Mount…"), so include it in the inference text. */
    const imageName = data.image ? decodeURIComponent(data.image.split("FilePath/")[1] || "") : "";
    const text = `${data.name} ${data.description || ""} ${summary} ${imageName}`;
    /* Defunct venues: closure claims, "former/closed" wording, or a Wikipedia
       intro written in the past tense ("…was a motor racing circuit"). */
    const pastTense = /\bwas\s+(a|an|the)\b/i.test(summary.split(".")[0] || "");
    if (data.defunct || pastTense || /former|closed|defunct|demolish|disused/i.test(`${data.description} ${summary}`)) {
      statusEl.textContent = "Looks like a former/closed venue — use Review to add it deliberately.";
      return false;
    }

    const venueType = inferVenueType(text);
    if (!summary) {
      summary = `${VENUE_TYPES[venueType]} in ${data.county || data.town || "the UK"}${data.opened ? `, first used in ${data.opened}` : ""}.`;
    }

    let id = slugify(data.name);
    while (tracks.some((t) => t.id === id)) id += "-2";

    tracks.push({
      id, name: data.name, venueType,
      raceTypes: inferRaceTypes(venueType, text),
      location: { town: data.town || "", county: data.county || "", country: data.country || "", lat: data.lat, lng: data.lng },
      opened: data.opened || null, capacity: data.capacity || null, lengthMiles: null,
      website: data.website || null, image: data.image || null, summary,
      verified: true, wikidata: data.wikidata,
      ...(data.wikipedia ? { wikipedia: data.wikipedia } : {}),
    });
    dirtyTracks = true;
    staged.push(`New track (auto): ${data.name}`);
    renderStaged();
    renderEventForm();
    statusEl.textContent = "Added ✓ — staged for publish.";
    return true;
  }

  /* ---------- track form ---------- */

  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  function renderTrackForm(d) {
    const f = $("track-form");
    const rtChecks = Object.entries(RaceDates.RACE_TYPES).map(([id, rt]) => `
      <label class="admin-check" data-racetype="${id}">
        <input type="checkbox" name="rt" value="${id}" ${d.raceTypes && d.raceTypes.includes(id) ? "checked" : ""}> ${rt.label}
      </label>`).join("");
    f.innerHTML = `
      <div class="admin-grid">
        <label>Name <input class="filter-input" name="name" value="${d.name || ""}" required></label>
        <label>Id (URL slug) <input class="filter-input" name="id" value="${d.id || slugify(d.name || "")}" required></label>
        <label>Venue type <select class="filter-select" name="venueType">
          ${Object.entries(VENUE_TYPES).map(([v, l]) => `<option value="${v}" ${d.venueType === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
        <label>Town <input class="filter-input" name="town" value="${d.town || ""}"></label>
        <label>County <input class="filter-input" name="county" value="${d.county || ""}"></label>
        <label>Country <input class="filter-input" name="country" value="${d.country || ""}"></label>
        <label>Latitude <input class="filter-input" name="lat" type="number" step="any" value="${d.lat != null ? d.lat : ""}" required></label>
        <label>Longitude <input class="filter-input" name="lng" type="number" step="any" value="${d.lng != null ? d.lng : ""}" required></label>
        <label>Opened (year) <input class="filter-input" name="opened" type="number" value="${d.opened || ""}"></label>
        <label>Capacity <input class="filter-input" name="capacity" type="number" value="${d.capacity || ""}"></label>
        <label>Length (miles) <input class="filter-input" name="lengthMiles" type="number" step="any" value="${d.lengthMiles || ""}"></label>
        <label>Website <input class="filter-input" name="website" value="${d.website || ""}"></label>
        <label class="admin-wide">Photo URL <input class="filter-input" name="image" value="${d.image || ""}"></label>
        <label class="admin-wide">Summary <input class="filter-input" name="summary" value="${d.summary || ""}"></label>
      </div>
      <div class="admin-checks"><span class="filter-label">Races hosted:</span>${rtChecks}</div>
      ${d.image ? `<img class="admin-photo-preview" src="${d.image}" alt="Venue photo preview">` : ""}
      <input type="hidden" name="wikidata" value="${d.wikidata || ""}">
      <input type="hidden" name="wikipedia" value="${d.wikipedia || ""}">
      <button class="btn" type="submit">Stage this track</button>
      <p class="admin-hint" id="track-form-msg"></p>`;

    f.querySelector('[name="name"]').addEventListener("input", (e) => {
      f.querySelector('[name="id"]').value = slugify(e.target.value);
    });
    f.onsubmit = (e) => { e.preventDefault(); stageTrack(f); };
  }

  function stageTrack(f) {
    const v = (n) => f.querySelector(`[name="${n}"]`).value.trim();
    const num = (n) => (v(n) === "" ? null : Number(v(n)));
    const msg = $("track-form-msg");
    const id = v("id");
    if (tracks.some((t) => t.id === id)) { msg.textContent = `A track with id "${id}" already exists.`; return; }
    const raceTypes = [...f.querySelectorAll('input[name="rt"]:checked')].map((c) => c.value);
    if (!raceTypes.length) { msg.textContent = "Tick at least one race type."; return; }

    tracks.push({
      id, name: v("name"), venueType: v("venueType"), raceTypes,
      location: { town: v("town"), county: v("county"), country: v("country"), lat: num("lat"), lng: num("lng") },
      opened: num("opened"), capacity: num("capacity"), lengthMiles: num("lengthMiles"),
      website: v("website") || null, image: v("image") || null, summary: v("summary"),
      verified: !!v("wikidata"),
      ...(v("wikidata") ? { wikidata: v("wikidata") } : {}),
      ...(v("wikipedia") ? { wikipedia: v("wikipedia") } : {}),
    });
    dirtyTracks = true;
    staged.push(`New track: ${v("name")}`);
    renderStaged();
    renderTrackForm({});
    renderEventForm();
    msg.textContent = "Staged. Publish when ready.";
  }

  /* ---------- discovered venues ---------- */

  function renderDiscovered() {
    $("discovered-list").innerHTML = discovered.length ? `
      <ul class="admin-results">
        ${discovered.map((dv, i) => `
          <li>
            <button type="button" class="btn" data-auto="${i}">Auto-add</button>
            <button type="button" class="btn btn-outline" data-i="${i}">Review</button>
            ${dv.image ? `<img class="admin-thumb" src="${dv.image}" alt="" loading="lazy">` : '<span class="admin-thumb admin-thumb-empty">—</span>'}
            <strong>${dv.name}</strong>
            <span class="admin-hint">${dv.opened ? "opened " + dv.opened + " · " : ""}${dv.qid}${dv.wikipedia ? " · has Wikipedia page" : ""}</span>
            <span class="admin-hint" data-status="${i}"></span>
          </li>`).join("")}
      </ul>` : '<p class="admin-hint">Nothing waiting for review.</p>';

    /* Auto-add: pulls everything (location details, photo, race types from the
       venue's description, summary from its Wikipedia intro) and stages it —
       no manual input. Review still opens the editable form. */
    $("discovered-list").querySelectorAll("button[data-auto]").forEach((b) => {
      b.addEventListener("click", async () => {
        const i = Number(b.dataset.auto);
        const statusEl = $("discovered-list").querySelector(`[data-status="${i}"]`);
        b.disabled = true;
        const ok = await autoAddDiscovered(discovered[i], statusEl);
        if (!ok) b.disabled = false;
      });
    });
    $("discovered-list").querySelectorAll("button[data-i]").forEach((b) => {
      b.addEventListener("click", () => {
        const dv = discovered[Number(b.dataset.i)];
        document.querySelector('[data-tab="add-track"]').click();
        useEntity(dv.qid, {
          name: dv.name, lat: dv.lat, lng: dv.lng, opened: dv.opened,
          capacity: dv.capacity, image: dv.image, website: dv.website, wikipedia: dv.wikipedia,
        });
      });
    });
  }

  /* ---------- event form ---------- */

  function renderEventForm() {
    const f = $("event-form");
    f.innerHTML = `
      <div class="admin-grid">
        <label>Track <select class="filter-select" name="trackId">
          ${tracks.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}
        </select></label>
        <label>Series <select class="filter-select" name="seriesId">
          ${series.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
        </select></label>
        <label class="admin-wide">Event name <input class="filter-input" name="name" required></label>
        <label>Start date <input class="filter-input" name="startDate" type="date" required></label>
        <label>End date <input class="filter-input" name="endDate" type="date"></label>
        <label>Gates open <input class="filter-input" name="gatesOpen" type="time"></label>
        <label>Gates close <input class="filter-input" name="gatesClose" type="time"></label>
        <label>Adult price (£) <input class="filter-input" name="price" type="number" step="0.01"></label>
        <label class="admin-wide">Ticket URL <input class="filter-input" name="ticketUrl"></label>
      </div>
      <button class="btn" type="submit">Stage this event</button>
      <p class="admin-hint" id="event-form-msg"></p>`;
    f.onsubmit = (e) => { e.preventDefault(); stageEvent(f); };
  }

  function stageEvent(f) {
    const v = (n) => f.querySelector(`[name="${n}"]`).value.trim();
    const track = tracks.find((t) => t.id === v("trackId"));
    const start = v("startDate");
    events.push({
      id: `manual-${v("trackId")}-${start}-${slugify(v("name")).slice(0, 30)}`,
      name: v("name"), trackId: v("trackId"), seriesId: v("seriesId"),
      startDate: start, endDate: v("endDate") || start,
      gates: v("gatesOpen") ? { open: v("gatesOpen"), close: v("gatesClose") || "18:00" } : null,
      price: v("price") ? { adult: Number(v("price")), currency: "GBP" } : null,
      ticketUrl: v("ticketUrl") || (track && track.website) || "",
      sample: false,
    });
    events.sort((a, b) => a.startDate.localeCompare(b.startDate));
    dirtyEvents = true;
    staged.push(`New event: ${v("name")} (${start})`);
    renderStaged();
    renderEventForm();
    $("event-form-msg").textContent = "Staged. Publish when ready.";
  }

  /* ---------- publish ---------- */

  function renderStaged() {
    $("staged-count").textContent = staged.length ? `(${staged.length})` : "";
    $("staged-list").innerHTML = staged.length
      ? `<ul class="admin-staged">${staged.map((s) => `<li>${s}</li>`).join("")}</ul>`
      : '<p class="admin-hint">Nothing staged yet.</p>';
    $("publish-controls").hidden = !staged.length;
  }

  const toB64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };

  async function commitFile(path, content, message, token) {
    const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    const current = await (await fetch(url, { headers })).json();
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: toB64(content), sha: current.sha }),
    });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.json()).message || ""}`);
  }

  async function commit() {
    const token = $("gh-token").value.trim();
    const msg = $("publish-msg");
    if (!token) { msg.textContent = "Paste a GitHub token first (or use Download)."; return; }
    msg.textContent = "Committing…";
    try {
      const message = `Admin: ${staged.join("; ").slice(0, 200)}`;
      if (dirtyTracks) await commitFile("main/data/tracks.json", JSON.stringify(tracks, null, 2), message, token);
      if (dirtyEvents) await commitFile("main/data/events.json", JSON.stringify(events, null, 2), message, token);
      dirtyTracks = dirtyEvents = false;
      staged.length = 0;
      renderStaged();
      msg.textContent = "Committed ✓ — the site redeploys automatically in about a minute.";
    } catch (err) {
      msg.textContent = `Commit failed: ${err.message}`;
    } finally {
      $("gh-token").value = "";
    }
  }

  function download() {
    const files = [];
    if (dirtyTracks) files.push(["tracks.json", JSON.stringify(tracks, null, 2)]);
    if (dirtyEvents) files.push(["events.json", JSON.stringify(events, null, 2)]);
    files.forEach(([name, content]) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("publish-msg").textContent = "Downloaded — replace the files in main/data/ and push.";
  }

  /* ---------- wire up ---------- */

  document.addEventListener("DOMContentLoaded", () => {
    $("admin-unlock").addEventListener("click", tryUnlock);
    $("admin-password").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    $("wd-search-btn").addEventListener("click", wdSearch);
    $("wd-search").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); wdSearch(); } });
    $("commit-btn").addEventListener("click", commit);
    $("download-btn").addEventListener("click", download);
    if (sessionStorage.getItem("rd-admin") === "1") showApp();
  });
})();
