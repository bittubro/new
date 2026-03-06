const CATEGORIES = [
  "Wars and Battles", "Empires and Civilizations", "Inventions and Technology", "Famous People",
  "Political Events", "Discoveries and Exploration", "Science and Space", "Cultural Movements",
  "Economic Events", "Revolutions", "Ancient History", "Medieval History", "Modern History",
  "Cold War", "World Wars", "Mythology and Legends", "Assassinations", "Disasters",
  "Archaeological Discoveries", "Historical Mysteries"
];

const FALLBACK_EVENTS = [
  ["French Revolution begins", "Popular uprising topples monarchy and inspires global revolutions.", 1789, "Revolutions", ["France", "Republic"], "Europe", 10, 9, true, false],
  ["Start of World War I", "Global conflict ignites with cascading alliances.", 1914, "World Wars", ["WWI", "Europe"], "Europe", 10, 10, true, false],
  ["Moon Landing", "Apollo 11 marks first human step on the Moon.", 1969, "Science and Space", ["NASA", "Space Race"], "Global", 10, 10, true, false],
  ["Fall of the Berlin Wall", "Symbolic end of Cold War divisions in Europe.", 1989, "Cold War", ["Germany", "Soviet Bloc"], "Europe", 10, 9, true, false]
];

const TAG_POOL = ["Empire", "Religion", "Trade", "Conflict", "Innovation", "Diplomacy", "Naval", "Medicine", "Migration", "Culture"];
const REGION_POOL = ["Europe", "Asia", "Africa", "Americas", "Middle East", "Global"];
const WIKI_USER_AGENT = "HistoryGPT-Bot/1.0 (history exploration tool)";

class RequestQueue {
  constructor({ delayMs = 1000, retries = 2 } = {}) {
    this.delayMs = delayMs;
    this.retries = retries;
    this.queue = Promise.resolve();
    this.cache = new Map(JSON.parse(localStorage.getItem("historygpt_api_cache") || "[]"));
  }

  persistCache() {
    const limited = [...this.cache.entries()].slice(-800);
    localStorage.setItem("historygpt_api_cache", JSON.stringify(limited));
  }

  clearCache() {
    this.cache.clear();
    this.persistCache();
  }

  async schedule(key, requestFn) {
    if (this.cache.has(key)) return this.cache.get(key);

    const work = async () => {
      let lastError;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const data = await requestFn();
          this.cache.set(key, data);
          this.persistCache();
          return data;
        } catch (error) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        }
      }
      throw lastError;
    };

    const resultPromise = this.queue.then(async () => {
      const result = await work();
      await new Promise((r) => setTimeout(r, this.delayMs));
      return result;
    });

    this.queue = resultPromise.catch(() => undefined);
    return resultPromise;
  }
}

class WikimediaAPI {
  constructor(queue) {
    this.queue = queue;
  }

  async fetchJson(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Accept": "application/json",
        "Api-User-Agent": WIKI_USER_AGENT,
        ...options.headers
      }
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async fetchTimelineEvents(limit = 180) {
    const sparql = `SELECT ?event ?eventLabel ?date ?countryLabel WHERE {
      ?event wdt:P31 wd:Q1190554;
             wdt:P585 ?date.
      OPTIONAL { ?event wdt:P17 ?country. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY DESC(?date)
    LIMIT ${limit}`;

    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    return this.queue.schedule(url, () => this.fetchJson(url));
  }

  async getEntityDetails(qid) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions|claims|sitelinks&languages=en&format=json&origin=*`;
    return this.queue.schedule(url, () => this.fetchJson(url));
  }

  async getWikipediaPage(title) {
    const safeTitle = encodeURIComponent(title.replace(/\s+/g, "_"));
    const url = `https://api.wikimedia.org/core/v1/wikipedia/en/page/${safeTitle}`;
    return this.queue.schedule(url, () => this.fetchJson(url));
  }

  async getCommonsImage(fileName) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
    return this.queue.schedule(url, () => this.fetchJson(url));
  }
}

class EventDatabase {
  constructor() {
    this.segmentSize = 25;
    this.syntheticCache = new Map();
    this.events = new Map();
    this.loadPersisted();
    if (!this.events.size) this.seedFallback();
  }

  loadPersisted() {
    const persisted = JSON.parse(localStorage.getItem("historygpt_events") || "[]");
    persisted.forEach((event) => this.events.set(event.id, event));
  }

  save() {
    localStorage.setItem("historygpt_events", JSON.stringify([...this.events.values()]));
  }

  seedFallback() {
    FALLBACK_EVENTS.forEach((entry, i) => {
      const [title, description, year, category, tags, region, importance, popularity, turningPoint, unusual] = entry;
      this.events.set(`seed-${i}`, {
        id: `seed-${i}`,
        title,
        description,
        date: `${year}`,
        year,
        category,
        tags,
        region,
        location: region,
        wikipedia_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
        image_url: "",
        source: "seed",
        importance,
        popularity,
        turningPoint,
        unusual,
        relatedIds: []
      });
    });
    this.save();
  }

  upsert(event) {
    this.events.set(event.id, event);
  }

  flush() {
    this.save();
  }

  hash(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  ensureSyntheticSegment(segmentIndex) {
    if (this.syntheticCache.has(segmentIndex)) return;
    const startYear = segmentIndex * this.segmentSize;
    const generatedCount = 140;
    const events = [];

    for (let i = 0; i < generatedCount; i++) {
      const id = `synthetic-${segmentIndex}-${i}`;
      const hashed = this.hash(id);
      const year = startYear + (hashed % this.segmentSize);
      const category = CATEGORIES[hashed % CATEGORIES.length];
      const region = REGION_POOL[(hashed >> 3) % REGION_POOL.length];
      const tags = [TAG_POOL[hashed % TAG_POOL.length], TAG_POOL[(hashed >> 4) % TAG_POOL.length]].filter((v, idx, arr) => arr.indexOf(v) === idx);
      const importance = (hashed % 10) + 1;
      const popularity = ((hashed >> 8) % 10) + 1;

      events.push({
        id,
        title: `${category.split(" ")[0]} timeline node #${(hashed % 8000) + 1000}`,
        description: "Generated timeline placeholder while live Wikimedia ingestion continues in the background.",
        date: `${year}`,
        year,
        category,
        tags,
        region,
        location: region,
        wikipedia_url: "https://www.wikidata.org/",
        image_url: "",
        source: "synthetic",
        importance,
        popularity,
        turningPoint: importance >= 9,
        unusual: (hashed % 23) === 0,
        relatedIds: []
      });
    }

    this.syntheticCache.set(segmentIndex, events);
  }

  getEvents(minYear, maxYear) {
    const minSeg = Math.floor(minYear / this.segmentSize) - 1;
    const maxSeg = Math.floor(maxYear / this.segmentSize) + 1;
    const persistedEvents = [...this.events.values()].filter((event) => event.year >= minYear && event.year <= maxYear);

    const synthetic = [];
    for (let seg = minSeg; seg <= maxSeg; seg++) {
      this.ensureSyntheticSegment(seg);
      synthetic.push(...this.syntheticCache.get(seg));
    }

    const merged = [...persistedEvents, ...synthetic].filter((event) => event.year >= minYear && event.year <= maxYear);
    return merged;
  }
}

function inferCategory(text) {
  const t = text.toLowerCase();
  if (t.includes("war") || t.includes("battle")) return "Wars and Battles";
  if (t.includes("revolution")) return "Revolutions";
  if (t.includes("empire") || t.includes("dynasty")) return "Empires and Civilizations";
  if (t.includes("assassin")) return "Assassinations";
  if (t.includes("discovery") || t.includes("expedition")) return "Discoveries and Exploration";
  if (t.includes("science") || t.includes("space") || t.includes("apollo")) return "Science and Space";
  if (t.includes("world war") || t.includes("wwi") || t.includes("wwii")) return "World Wars";
  if (t.includes("cold war")) return "Cold War";
  return "Modern History";
}

function yearFromDate(value) {
  if (!value) return null;
  const match = String(value).match(/-?\d{1,6}/);
  return match ? Number(match[0]) : null;
}

const appState = {
  selectedCategory: "all",
  searchTerm: "",
  minImportance: 1,
  minPopularity: 1,
  region: "all",
  period: "all",
  selectedEvent: null,
  centerYear: 1900,
  yearsPerPixel: 2.5
};

const db = new EventDatabase();
const queue = new RequestQueue({ delayMs: 1000, retries: 2 });
const api = new WikimediaAPI(queue);

const canvas = document.getElementById("timelineCanvas");
const ctx = canvas.getContext("2d");
const details = document.getElementById("eventDetails");
const viewLabel = document.getElementById("viewLabel");
const pipelineStatus = document.getElementById("pipelineStatus");
const ingestBtn = document.getElementById("ingestBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const hitTargets = [];

function dateLabel(event) {
  return event.year < 0 ? `${Math.abs(event.year)} BCE` : `${event.year} CE`;
}

function setPipelineStatus(message) {
  pipelineStatus.textContent = message;
}

async function ingestWikimediaEvents() {
  ingestBtn.disabled = true;
  try {
    setPipelineStatus("Running pipeline: SPARQL extraction → normalization → enrichment...");
    const result = await api.fetchTimelineEvents(120);
    const bindings = result?.results?.bindings || [];

    let imported = 0;
    for (let i = 0; i < bindings.length; i++) {
      const row = bindings[i];
      const eventUrl = row.event?.value || "";
      const qid = eventUrl.split("/").pop();
      if (!qid) continue;

      setPipelineStatus(`Importing ${i + 1}/${bindings.length}: ${row.eventLabel?.value || qid}`);

      const detailsRes = await api.getEntityDetails(qid);
      const entity = detailsRes?.entities?.[qid];
      if (!entity) continue;

      const label = entity.labels?.en?.value || row.eventLabel?.value || qid;
      const description = entity.descriptions?.en?.value || "Historical event imported from Wikimedia datasets.";
      const claims = entity.claims || {};
      const pointInTime = claims.P585?.[0]?.mainsnak?.datavalue?.value?.time;
      const inception = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time;
      const dateRaw = pointInTime || inception || row.date?.value;
      const year = yearFromDate(dateRaw);
      if (year === null || Number.isNaN(year)) continue;

      const wikipediaTitle = entity.sitelinks?.enwiki?.title || label;
      let summary = description;
      let wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaTitle.replace(/\s+/g, "_"))}`;
      let imageUrl = "";

      try {
        const wikiData = await api.getWikipediaPage(wikipediaTitle);
        summary = wikiData?.excerpt || summary;
        wikiUrl = wikiData?.content_urls?.desktop?.page || wikiUrl;
        imageUrl = wikiData?.thumbnail?.url || "";
      } catch (_) {
        // fall back to Wikidata description and URL
      }

      if (!imageUrl) {
        const imageClaim = claims.P18?.[0]?.mainsnak?.datavalue?.value;
        if (imageClaim) {
          try {
            const commons = await api.getCommonsImage(`File:${imageClaim}`);
            const pages = commons?.query?.pages || {};
            const page = Object.values(pages)[0];
            imageUrl = page?.imageinfo?.[0]?.url || "";
          } catch (_) {
            // image remains optional
          }
        }
      }

      const category = inferCategory(`${label} ${description}`);
      const region = row.countryLabel?.value && REGION_POOL.includes(row.countryLabel.value) ? row.countryLabel.value : "Global";

      db.upsert({
        id: `wd-${qid}`,
        title: label,
        description: summary,
        date: dateRaw,
        year,
        category,
        tags: [category.split(" ")[0], "Wikidata"],
        region,
        location: row.countryLabel?.value || "",
        wikipedia_url: wikiUrl,
        image_url: imageUrl,
        source: "wikidata+wiki",
        importance: Math.min(10, 4 + Math.floor(Math.random() * 7)),
        popularity: Math.min(10, 4 + Math.floor(Math.random() * 7)),
        turningPoint: /(war|revolution|independence|collapse|treaty)/i.test(`${label} ${summary}`),
        unusual: /(mystery|unknown|unsolved|legend)/i.test(`${label} ${summary}`),
        relatedIds: []
      });

      imported += 1;
    }

    db.flush();
    setPipelineStatus(`Import complete. Added/updated ${imported} Wikimedia events. Cached responses prevent duplicate API calls.`);
    render();
  } catch (error) {
    setPipelineStatus(`Import failed: ${error.message}`);
  } finally {
    ingestBtn.disabled = false;
  }
}

function buildCategories() {
  const wrap = document.getElementById("categoryList");
  ["All", ...CATEGORIES].forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = cat;
    btn.dataset.value = cat === "All" ? "all" : cat;
    if (cat === "All") btn.classList.add("active");
    btn.addEventListener("click", () => {
      document.querySelectorAll(".category-btn").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      appState.selectedCategory = btn.dataset.value;
      render();
    });
    wrap.appendChild(btn);
  });
}

function periodPass(year) {
  if (appState.period === "ancient") return year >= -3000 && year < 500;
  if (appState.period === "medieval") return year >= 500 && year < 1500;
  if (appState.period === "modern") return year >= 1500;
  return true;
}

function currentRange() {
  const halfSpan = (canvas.width / 2) * appState.yearsPerPixel;
  return [appState.centerYear - halfSpan, appState.centerYear + halfSpan];
}

function collectVisibleEvents() {
  const [minYear, maxYear] = currentRange();
  const needle = appState.searchTerm.trim().toLowerCase();

  return db.getEvents(minYear, maxYear).filter((e) => {
    if (appState.selectedCategory !== "all" && e.category !== appState.selectedCategory) return false;
    if (e.importance < appState.minImportance || e.popularity < appState.minPopularity) return false;
    if (appState.region !== "all" && e.region !== appState.region) return false;
    if (!periodPass(e.year)) return false;
    if (!needle) return true;
    const hay = `${e.title} ${e.description} ${(e.tags || []).join(" ")} ${e.category}`.toLowerCase();
    return hay.includes(needle);
  });
}

function clusterEvents(events) {
  const bucketWidth = Math.max(18, Math.floor(95 / Math.max(0.35, 1 / appState.yearsPerPixel)));
  const buckets = new Map();

  events.forEach((event) => {
    const x = (event.year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    if (x < -60 || x > canvas.width + 60) return;
    const key = Math.floor(x / bucketWidth);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ x, event });
  });

  const units = [];
  buckets.forEach((items) => {
    if (items.length <= 3 || appState.yearsPerPixel < 0.3) {
      items.forEach((it, index) => units.push({ type: "event", x: it.x, y: canvas.height / 2 + ((index % 5) - 2) * 13, event: it.event }));
      return;
    }

    const avgX = items.reduce((sum, item) => sum + item.x, 0) / items.length;
    units.push({ type: "cluster", x: avgX, y: canvas.height / 2, size: items.length, events: items.map((i) => i.event) });
  });

  return units;
}

function drawAxis() {
  const y = canvas.height / 2;
  ctx.strokeStyle = "rgba(151,181,255,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();

  const majorStep = appState.yearsPerPixel > 7 ? 500 : appState.yearsPerPixel > 2 ? 100 : appState.yearsPerPixel > 0.7 ? 20 : 5;
  const [minYear, maxYear] = currentRange();
  const start = Math.floor(minYear / majorStep) * majorStep;

  ctx.fillStyle = "rgba(219,230,255,.75)";
  ctx.font = "12px system-ui";

  for (let year = start; year <= maxYear; year += majorStep) {
    const x = (year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    ctx.strokeStyle = "rgba(151,181,255,.18)";
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
    ctx.fillText(year < 0 ? `${Math.abs(year)} BCE` : `${year}`, x + 4, y + 30);
  }
}

function renderDetails(event) {
  if (!event) {
    details.innerHTML = `<p>Select an event dot to unlock context, related stories, and creator angles.</p>`;
    return;
  }

  const related = db.getEvents(event.year - 120, event.year + 120)
    .filter((e) => e.id !== event.id && (e.category === event.category || (e.tags || []).some((tag) => (event.tags || []).includes(tag))))
    .slice(0, 6);

  const angles = [
    `How ${event.title} changed the next century.`,
    `Cause and effect chain behind ${event.title}.`,
    `Underrated facts from ${dateLabel(event)} audiences rarely hear.`
  ];

  details.innerHTML = `
    <h3 class="event-title">${event.title}</h3>
    <div class="meta">${dateLabel(event)} • ${event.category} • ${event.region || "Global"}</div>
    <p>${event.description}</p>
    <div class="block"><strong>Timeline context:</strong> ${event.turningPoint ? "A key turning point with broad downstream effects." : "A connected chapter that adds depth to larger narratives."}</div>
    <div class="block"><strong>Tags:</strong><br>${(event.tags || []).map((tag) => `<span class="badge">${tag}</span>`).join("")}</div>
    <div class="block"><strong>Suggested video angles:</strong><ul>${angles.map((a) => `<li>${a}</li>`).join("")}</ul></div>
    <div class="block"><strong>Connected stories:</strong><ul>${related.map((r) => `<li>${dateLabel(r)} — ${r.title}</li>`).join("")}</ul></div>
    <div class="block"><strong>Interesting fact:</strong> ${event.unusual ? "This event is marked as unusual/lesser-known: perfect for novelty-led videos." : "This event has broad recognition, ideal for explainers and comparative formats."}</div>
    <div class="block"><strong>Source:</strong> ${event.source}</div>
    <div class="block"><a href="${event.wikipedia_url}" target="_blank" rel="noopener">Original source link</a></div>
  `;
}

function render() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, rect.width, rect.height);
  drawAxis();

  const visibleEvents = collectVisibleEvents();
  const units = clusterEvents(visibleEvents);
  hitTargets.length = 0;

  units.forEach((item) => {
    if (item.type === "cluster") {
      const r = Math.min(20, 8 + Math.log2(item.size));
      ctx.fillStyle = "rgba(80,209,178,.9)";
      ctx.beginPath();
      ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#001b15";
      ctx.font = "bold 11px system-ui";
      ctx.fillText(String(item.size), item.x - 7, item.y + 4);
      hitTargets.push({ x: item.x, y: item.y, r, type: "cluster", events: item.events });
      return;
    }

    const color = item.event.turningPoint ? "#ffb86b" : item.event.unusual ? "#ff6b8a" : "#76a7ff";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(item.x, item.y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    hitTargets.push({ x: item.x, y: item.y, r: 7, type: "event", event: item.event });
  });

  const [minYear, maxYear] = currentRange();
  viewLabel.textContent = `Viewing ${Math.round(minYear)} to ${Math.round(maxYear)} • ${visibleEvents.length.toLocaleString()} visible events`;

  if (appState.selectedEvent) renderDetails(appState.selectedEvent);

  const buffer = (maxYear - minYear) * 0.7;
  db.getEvents(minYear - buffer, maxYear + buffer);
}

function attachInteractions() {
  let dragging = false;
  let lastX = 0;

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    appState.centerYear -= dx * appState.yearsPerPixel;
    render();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.85;
    appState.yearsPerPixel = Math.min(45, Math.max(0.04, appState.yearsPerPixel * factor));
    render();
  }, { passive: false });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = hitTargets.find((t) => Math.hypot(t.x - x, t.y - y) <= t.r);
    if (!hit) return;

    if (hit.type === "cluster") {
      appState.centerYear = hit.events[Math.floor(hit.events.length / 2)].year;
      appState.yearsPerPixel = Math.max(0.08, appState.yearsPerPixel * 0.65);
      render();
      return;
    }

    appState.selectedEvent = hit.event;
    renderDetails(hit.event);
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    appState.searchTerm = e.target.value;
    if (appState.searchTerm.trim()) {
      const pool = db.getEvents(-3000, 2026).filter((event) => {
        const text = `${event.title} ${event.description} ${(event.tags || []).join(" ")}`.toLowerCase();
        return text.includes(appState.searchTerm.trim().toLowerCase());
      });
      const first = pool[0];
      if (first) {
        appState.centerYear = first.year;
        appState.selectedEvent = first;
        renderDetails(first);
      }
    }
    render();
  });

  document.getElementById("importanceRange").addEventListener("input", (e) => {
    appState.minImportance = Number(e.target.value);
    render();
  });

  document.getElementById("popularityRange").addEventListener("input", (e) => {
    appState.minPopularity = Number(e.target.value);
    render();
  });

  document.getElementById("regionSelect").addEventListener("change", (e) => {
    appState.region = e.target.value;
    render();
  });

  document.getElementById("periodSelect").addEventListener("change", (e) => {
    appState.period = e.target.value;
    render();
  });

  ingestBtn.addEventListener("click", ingestWikimediaEvents);
  clearCacheBtn.addEventListener("click", () => {
    queue.clearCache();
    setPipelineStatus("API cache cleared.");
  });

  window.addEventListener("resize", render);
}

buildCategories();
attachInteractions();
render();
setPipelineStatus("Pipeline ready. Click import to collect events via Wikidata SPARQL, enrich with Wikipedia summaries, and attach Commons images.");
