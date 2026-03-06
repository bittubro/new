const CATEGORIES = [
  "Wars and Battles", "Empires and Civilizations", "Inventions and Technology", "Famous People",
  "Political Events", "Discoveries and Exploration", "Science and Space", "Cultural Movements",
  "Economic Events", "Revolutions", "Ancient History", "Medieval History", "Modern History",
  "Cold War", "World Wars", "Mythology and Legends", "Assassinations", "Disasters",
  "Archaeological Discoveries", "Historical Mysteries"
];

const WIKI_API_ROOT = "https://api.wikimedia.org";
const WIKI_USER_AGENT = "HistoryGPT-Bot/1.0 (Wikipedia API timeline explorer)";

class ApiQueue {
  constructor(delayMs = 220) {
    this.delayMs = delayMs;
    this.chain = Promise.resolve();
    this.cache = new Map(JSON.parse(localStorage.getItem("historygpt_wikipedia_cache") || "[]"));
  }

  persistCache() {
    localStorage.setItem("historygpt_wikipedia_cache", JSON.stringify([...this.cache.entries()].slice(-1000)));
  }

  clearCache() {
    this.cache.clear();
    this.persistCache();
  }

  request(key, fetcher) {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));

    const task = this.chain.then(async () => {
      const data = await fetcher();
      this.cache.set(key, data);
      this.persistCache();
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return data;
    });

    this.chain = task.catch(() => undefined);
    return task;
  }
}

class WikipediaApi {
  constructor(queue) {
    this.queue = queue;
  }

  async fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Api-User-Agent": WIKI_USER_AGENT
      }
    });
    if (!response.ok) throw new Error(`Wikipedia API failed (${response.status})`);
    return response.json();
  }

  onThisDayEvents(month, day) {
    const url = `${WIKI_API_ROOT}/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;
    return this.queue.request(url, () => this.fetchJson(url));
  }

  searchPages(query, limit = 8) {
    const url = `${WIKI_API_ROOT}/core/v1/wikipedia/en/search/page?q=${encodeURIComponent(query)}&limit=${limit}`;
    return this.queue.request(url, () => this.fetchJson(url));
  }

  getPage(title) {
    const safe = encodeURIComponent(title.replace(/\s+/g, "_"));
    const url = `${WIKI_API_ROOT}/core/v1/wikipedia/en/page/${safe}`;
    return this.queue.request(url, () => this.fetchJson(url));
  }
}

class WikipediaTimelineStore {
  constructor(api) {
    this.api = api;
    this.events = new Map();
    this.loadedDays = new Set(JSON.parse(localStorage.getItem("historygpt_loaded_days") || "[]"));
    this.restoreEvents();
  }

  restoreEvents() {
    const persisted = JSON.parse(localStorage.getItem("historygpt_wikipedia_events") || "[]");
    persisted.forEach((event) => this.events.set(event.id, event));
  }

  persist() {
    localStorage.setItem("historygpt_wikipedia_events", JSON.stringify([...this.events.values()].slice(-25000)));
    localStorage.setItem("historygpt_loaded_days", JSON.stringify([...this.loadedDays]));
  }

  normalizeCategory(text) {
    const t = text.toLowerCase();
    if (t.includes("war") || t.includes("battle") || t.includes("siege")) return "Wars and Battles";
    if (t.includes("empire") || t.includes("dynasty") || t.includes("kingdom")) return "Empires and Civilizations";
    if (t.includes("invent") || t.includes("machine") || t.includes("engineering") || t.includes("computer")) return "Inventions and Technology";
    if (t.includes("born") || t.includes("dies") || t.includes("assassin")) return "Famous People";
    if (t.includes("election") || t.includes("parliament") || t.includes("president") || t.includes("treaty")) return "Political Events";
    if (t.includes("discover") || t.includes("expedition") || t.includes("voyage")) return "Discoveries and Exploration";
    if (t.includes("science") || t.includes("space") || t.includes("nasa") || t.includes("physics")) return "Science and Space";
    if (t.includes("art") || t.includes("music") || t.includes("literature") || t.includes("film")) return "Cultural Movements";
    if (t.includes("market") || t.includes("bank") || t.includes("trade") || t.includes("econom")) return "Economic Events";
    if (t.includes("revolution") || t.includes("uprising")) return "Revolutions";
    if (t.includes("myth") || t.includes("legend")) return "Mythology and Legends";
    if (t.includes("mystery") || t.includes("unknown")) return "Historical Mysteries";
    if (t.includes("disaster") || t.includes("earthquake") || t.includes("flood") || t.includes("eruption")) return "Disasters";
    if (t.includes("cold war")) return "Cold War";
    if (t.includes("world war")) return "World Wars";
    return "Modern History";
  }

  inferPeriodCategory(year) {
    if (year < 500) return "Ancient History";
    if (year < 1500) return "Medieval History";
    return "Modern History";
  }

  async loadDay(month, day) {
    const key = `${month}-${day}`;
    if (this.loadedDays.has(key)) return;

    const data = await this.api.onThisDayEvents(month, day);
    const events = data?.events || [];

    events.forEach((event, idx) => {
      const text = event.text || "";
      const year = Number(event.year);
      if (!Number.isFinite(year)) return;

      const page = event.pages?.[0] || {};
      const title = page.normalizedtitle || page.title || text.slice(0, 90);
      const imageUrl = page.thumbnail?.source || "";
      const wikiUrl = page.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
      const category = this.normalizeCategory(text);
      const periodCategory = this.inferPeriodCategory(year);

      const normalized = {
        id: `wikipedia-${month}-${day}-${year}-${idx}`,
        title,
        summary: text,
        year,
        dateLabel: `${day}/${month}/${year}`,
        category,
        periodCategory,
        tags: [category.split(" ")[0], periodCategory.split(" ")[0], "Wikipedia"],
        region: "Global",
        location: "",
        image: imageUrl,
        source: wikiUrl,
        relatedEvents: []
      };

      this.events.set(normalized.id, normalized);
    });

    this.loadedDays.add(key);
    this.persist();
  }

  async loadDays(days) {
    for (const d of days) {
      await this.loadDay(d.month, d.day);
    }
  }

  allEvents() {
    return [...this.events.values()];
  }
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
  yearsPerPixel: 2.3,
  daySpan: 5
};

const queue = new ApiQueue(220);
const wikipediaApi = new WikipediaApi(queue);
const store = new WikipediaTimelineStore(wikipediaApi);

const canvas = document.getElementById("timelineCanvas");
const ctx = canvas.getContext("2d");
const viewLabel = document.getElementById("viewLabel");
const details = document.getElementById("eventDetails");
const pipelineStatus = document.getElementById("pipelineStatus");
const ingestBtn = document.getElementById("ingestBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const hitTargets = [];

function setStatus(message) {
  pipelineStatus.textContent = message;
}

function buildCategories() {
  const wrap = document.getElementById("categoryList");
  wrap.innerHTML = "";
  ["All", ...CATEGORIES].forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = cat;
    btn.dataset.value = cat === "All" ? "all" : cat;
    if (cat === "All") btn.classList.add("active");
    btn.addEventListener("click", () => {
      document.querySelectorAll(".category-btn").forEach((b) => b.classList.remove("active"));
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
  const half = (canvas.width / 2) * appState.yearsPerPixel;
  return [appState.centerYear - half, appState.centerYear + half];
}

function collectVisibleEvents() {
  const [minYear, maxYear] = currentRange();
  const needle = appState.searchTerm.trim().toLowerCase();

  return store.allEvents().filter((e) => {
    if (e.year < minYear || e.year > maxYear) return false;
    if (appState.selectedCategory !== "all" && e.category !== appState.selectedCategory && e.periodCategory !== appState.selectedCategory) return false;
    if (appState.region !== "all" && e.region !== appState.region) return false;
    if (!periodPass(e.year)) return false;
    if (!needle) return true;
    const hay = `${e.title} ${e.summary} ${e.tags.join(" ")} ${e.category}`.toLowerCase();
    return hay.includes(needle);
  });
}

function clusterEvents(events) {
  const bucketWidth = Math.max(20, Math.floor(95 / Math.max(0.35, 1 / appState.yearsPerPixel)));
  const buckets = new Map();

  events.forEach((event) => {
    const x = (event.year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    if (x < -40 || x > canvas.width + 40) return;
    const key = Math.floor(x / bucketWidth);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ x, event });
  });

  const units = [];
  buckets.forEach((items) => {
    if (items.length <= 4 || appState.yearsPerPixel < 0.3) {
      items.forEach((item, idx) => {
        units.push({ type: "event", event: item.event, x: item.x, y: canvas.height / 2 + ((idx % 6) - 3) * 12 });
      });
    } else {
      const avgX = items.reduce((acc, item) => acc + item.x, 0) / items.length;
      units.push({ type: "cluster", x: avgX, y: canvas.height / 2, size: items.length, events: items.map((i) => i.event) });
    }
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

  const step = appState.yearsPerPixel > 7 ? 500 : appState.yearsPerPixel > 2 ? 100 : appState.yearsPerPixel > 0.7 ? 20 : 5;
  const [minYear, maxYear] = currentRange();
  const start = Math.floor(minYear / step) * step;

  ctx.fillStyle = "rgba(219,230,255,.75)";
  ctx.font = "12px system-ui";
  for (let year = start; year <= maxYear; year += step) {
    const x = (year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    ctx.strokeStyle = "rgba(151,181,255,.18)";
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.fillText(year < 0 ? `${Math.abs(year)} BCE` : `${year}`, x + 4, y + 30);
  }
}

function renderDetails(event) {
  if (!event) {
    details.innerHTML = `<p>Select a Wikipedia-backed event dot to view timeline context, related stories, and creator ideas.</p>`;
    return;
  }

  const related = store
    .allEvents()
    .filter((e) => e.id !== event.id && Math.abs(e.year - event.year) <= 70)
    .slice(0, 6);

  details.innerHTML = `
    <h3 class="event-title">${event.title}</h3>
    <div class="meta">${event.year} • ${event.category}</div>
    <p>${event.summary}</p>
    <div class="block"><strong>Timeline context:</strong> ${event.periodCategory} / ${event.dateLabel}</div>
    <div class="block"><strong>Suggested video angles:</strong>
      <ul>
        <li>"What set this up?" cause-and-effect breakdown.</li>
        <li>Compare this event with another turning point in the same era.</li>
        <li>Hidden context viewers miss in quick summaries.</li>
      </ul>
    </div>
    <div class="block"><strong>Connected stories:</strong>
      <ul>${related.map((r) => `<li>${r.year} — ${r.title}</li>`).join("")}</ul>
    </div>
    <div class="block"><strong>Source:</strong> <a href="${event.source}" target="_blank" rel="noopener">Wikipedia article</a></div>
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
    } else {
      const color = /(war|battle|revolution)/i.test(item.event.summary) ? "#ffb86b" : "#76a7ff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 4.6, 0, Math.PI * 2);
      ctx.fill();
      hitTargets.push({ x: item.x, y: item.y, r: 7, type: "event", event: item.event });
    }
  });

  const [minYear, maxYear] = currentRange();
  viewLabel.textContent = `Viewing ${Math.round(minYear)} to ${Math.round(maxYear)} • ${visibleEvents.length.toLocaleString()} Wikipedia events loaded`;

  if (appState.selectedEvent) renderDetails(appState.selectedEvent);
}

function getDayBatch(anchorDate, radius) {
  const list = [];
  const base = new Date(anchorDate.getTime());
  for (let i = -radius; i <= radius; i++) {
    const d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    list.push({ month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  }
  return list;
}

async function importWikipediaTimeline() {
  ingestBtn.disabled = true;
  try {
    setStatus("Loading timeline nodes from official Wikipedia On This Day API...");
    const days = getDayBatch(new Date(), appState.daySpan);
    await store.loadDays(days);

    const [minYear, maxYear] = currentRange();
    const visibleCount = store.allEvents().filter((e) => e.year >= minYear && e.year <= maxYear).length;
    setStatus(`Loaded ${store.allEvents().length.toLocaleString()} total events from Wikipedia API (${visibleCount.toLocaleString()} in current view).`);
    render();
  } catch (error) {
    setStatus(`Wikipedia API load failed: ${error.message}`);
  } finally {
    ingestBtn.disabled = false;
  }
}

async function jumpToSearch() {
  const query = appState.searchTerm.trim();
  if (!query) return render();

  try {
    const result = await wikipediaApi.searchPages(query, 5);
    const page = result?.pages?.[0];
    if (!page?.title) {
      setStatus("No Wikipedia search result found.");
      return render();
    }

    const pageData = await wikipediaApi.getPage(page.title);
    const probe = `${pageData?.title || ""} ${pageData?.description || ""} ${pageData?.excerpt || ""}`;
    const yearMatch = probe.match(/\b(\d{3,4})\b/);

    if (yearMatch) {
      appState.centerYear = Number(yearMatch[1]);
      setStatus(`Jumped timeline near year ${yearMatch[1]} based on Wikipedia search result: ${page.title}.`);
    } else {
      setStatus(`Opened search context for ${page.title}; no clear year found in metadata.`);
    }
  } catch (error) {
    setStatus(`Wikipedia search failed: ${error.message}`);
  }

  render();
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
    const factor = e.deltaY > 0 ? 1.16 : 0.86;
    appState.yearsPerPixel = Math.min(50, Math.max(0.04, appState.yearsPerPixel * factor));
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
      appState.yearsPerPixel = Math.max(0.08, appState.yearsPerPixel * 0.66);
      render();
      return;
    }

    appState.selectedEvent = hit.event;
    renderDetails(hit.event);
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    appState.searchTerm = e.target.value;
    render();
  });

  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") jumpToSearch();
  });

  document.getElementById("importanceRange").addEventListener("input", () => render());
  document.getElementById("popularityRange").addEventListener("input", () => render());

  document.getElementById("regionSelect").addEventListener("change", (e) => {
    appState.region = e.target.value;
    render();
  });

  document.getElementById("periodSelect").addEventListener("change", (e) => {
    appState.period = e.target.value;
    render();
  });

  ingestBtn.addEventListener("click", importWikipediaTimeline);
  clearCacheBtn.addEventListener("click", () => {
    queue.clearCache();
    setStatus("Wikipedia API cache cleared.");
  });

  window.addEventListener("resize", render);
}

buildCategories();
attachInteractions();
setStatus("Wikipedia-only mode active. Click import to load timeline events directly from the official Wikipedia API.");
importWikipediaTimeline();
render();
