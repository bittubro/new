const CATEGORIES = [
  "Wars and Battles", "Empires and Civilizations", "Inventions and Technology", "Famous People",
  "Political Events", "Discoveries and Exploration", "Science and Space", "Cultural Movements",
  "Economic Events", "Revolutions", "Ancient History", "Medieval History", "Modern History",
  "Cold War", "World Wars", "Mythology and Legends", "Assassinations", "Disasters",
  "Archaeological Discoveries", "Historical Mysteries"
];

const BASE_EVENTS = [
  ["Construction of the Great Pyramid", "Monumental engineering feat of Egypt's Old Kingdom.", -2560, "Ancient History", ["Egypt", "Architecture"], "Africa", 10, 7, true, false],
  ["Assassination of Julius Caesar", "Political murder that reshaped Roman governance.", -44, "Assassinations", ["Rome", "Republic"], "Europe", 10, 9, true, false],
  ["Fall of Western Roman Empire", "Traditional marker of transition to medieval Europe.", 476, "Empires and Civilizations", ["Rome", "Collapse"], "Europe", 10, 8, true, false],
  ["Battle of Hastings", "Norman conquest altered English language and power structures.", 1066, "Wars and Battles", ["England", "Normans"], "Europe", 9, 8, false, false],
  ["Mongol expansion peak", "Largest contiguous land empire reaches maximum extent.", 1279, "Empires and Civilizations", ["Mongol", "Eurasia"], "Asia", 9, 7, true, false],
  ["Printing press adoption", "Mass information replication accelerated social change.", 1450, "Inventions and Technology", ["Gutenberg", "Media"], "Europe", 10, 8, true, false],
  ["Columbus reaches Caribbean", "Beginning of sustained transatlantic exchange.", 1492, "Discoveries and Exploration", ["Exploration", "Colonial"], "Americas", 9, 9, true, false],
  ["French Revolution begins", "Popular uprising topples monarchy and inspires global revolutions.", 1789, "Revolutions", ["France", "Republic"], "Europe", 10, 9, true, false],
  ["First steam locomotive era", "Rail transport transforms industry and cities.", 1814, "Inventions and Technology", ["Industrial Revolution", "Transport"], "Europe", 9, 8, false, false],
  ["Darwin publishes Origin of Species", "Foundational text in evolutionary biology.", 1859, "Science and Space", ["Biology", "Evolution"], "Europe", 8, 7, false, false],
  ["Start of World War I", "Global conflict ignites with cascading alliances.", 1914, "World Wars", ["WWI", "Europe"], "Europe", 10, 10, true, false],
  ["Moon Landing", "Apollo 11 marks first human step on the Moon.", 1969, "Science and Space", ["NASA", "Space Race"], "Global", 10, 10, true, false],
  ["Fall of the Berlin Wall", "Symbolic end of Cold War divisions in Europe.", 1989, "Cold War", ["Germany", "Soviet Bloc"], "Europe", 10, 9, true, false],
  ["Discovery of Gobekli Tepe", "Ancient ritual site challenges timelines of civilization.", 1995, "Archaeological Discoveries", ["Neolithic", "Turkey"], "Middle East", 8, 6, false, true],
  ["Antikythera mechanism decoding breakthroughs", "Ancient analog computer reveals early astronomical modeling.", 2005, "Historical Mysteries", ["Greece", "Technology"], "Europe", 7, 6, false, true]
];

const TAG_POOL = ["Empire", "Religion", "Trade", "Conflict", "Innovation", "Diplomacy", "Naval", "Medicine", "Migration", "Culture"];
const REGION_POOL = ["Europe", "Asia", "Africa", "Americas", "Middle East", "Global"];

class EventStore {
  constructor() {
    this.segmentSize = 25;
    this.cache = new Map();
    this.baseEvents = BASE_EVENTS.map((entry, i) => this.normalize(entry, `seed-${i}`));
  }

  normalize(entry, id) {
    const [title, summary, year, category, tags, region, importance, popularity, turningPoint, unusual] = entry;
    return {
      id,
      title,
      summary,
      year,
      dateLabel: year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`,
      category,
      tags,
      location: region,
      region,
      importance,
      popularity,
      turningPoint,
      unusual,
      source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
      relatedIds: []
    };
  }

  hash(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  ensureSegment(segmentIndex) {
    if (this.cache.has(segmentIndex)) return;
    const startYear = segmentIndex * this.segmentSize;
    const keyBase = `seg-${segmentIndex}`;
    const generatedCount = 120;
    const events = [];

    for (let i = 0; i < generatedCount; i++) {
      const key = `${keyBase}-${i}`;
      const hashed = this.hash(key);
      const year = startYear + (hashed % this.segmentSize);
      const category = CATEGORIES[hashed % CATEGORIES.length];
      const region = REGION_POOL[(hashed >> 3) % REGION_POOL.length];
      const title = `${category.split(" ")[0]} turning point #${(hashed % 9000) + 1000}`;
      const summary = "Synthetic sample from normalized historical dataset for rapid topic discovery and timeline stress testing.";
      const tags = [TAG_POOL[hashed % TAG_POOL.length], TAG_POOL[(hashed >> 5) % TAG_POOL.length]].filter((v, idx, arr) => arr.indexOf(v) === idx);
      const importance = (hashed % 10) + 1;
      const popularity = ((hashed >> 8) % 10) + 1;

      events.push({
        id: key,
        title,
        summary,
        year,
        dateLabel: year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`,
        category,
        tags,
        location: region,
        region,
        importance,
        popularity,
        turningPoint: importance >= 9,
        unusual: (hashed % 23) === 0,
        source: "https://www.wikidata.org/",
        relatedIds: []
      });
    }

    this.cache.set(segmentIndex, events);
  }

  getEvents(minYear, maxYear) {
    const minSeg = Math.floor(minYear / this.segmentSize) - 1;
    const maxSeg = Math.floor(maxYear / this.segmentSize) + 1;
    const gathered = [...this.baseEvents.filter((e) => e.year >= minYear && e.year <= maxYear)];

    for (let seg = minSeg; seg <= maxSeg; seg++) {
      this.ensureSegment(seg);
      gathered.push(...this.cache.get(seg));
    }

    return gathered.filter((e) => e.year >= minYear && e.year <= maxYear);
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
  centerYear: 1200,
  yearsPerPixel: 2.2
};

const store = new EventStore();
const canvas = document.getElementById("timelineCanvas");
const ctx = canvas.getContext("2d");
const viewLabel = document.getElementById("viewLabel");
const details = document.getElementById("eventDetails");
const hitTargets = [];

function buildCategories() {
  const wrap = document.getElementById("categoryList");
  const all = ["All", ...CATEGORIES];
  all.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = cat;
    btn.dataset.value = cat.toLowerCase() === "all" ? "all" : cat;
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
  const halfSpan = canvas.width * appState.yearsPerPixel / 2;
  return [appState.centerYear - halfSpan, appState.centerYear + halfSpan];
}

function collectVisibleEvents() {
  const [minYear, maxYear] = currentRange();
  const events = store.getEvents(minYear, maxYear);
  const needle = appState.searchTerm.trim().toLowerCase();

  return events.filter((e) => {
    if (appState.selectedCategory !== "all" && e.category !== appState.selectedCategory) return false;
    if (e.importance < appState.minImportance || e.popularity < appState.minPopularity) return false;
    if (appState.region !== "all" && e.region !== appState.region) return false;
    if (!periodPass(e.year)) return false;
    if (!needle) return true;

    const hay = `${e.title} ${e.summary} ${e.tags.join(" ")} ${e.category}`.toLowerCase();
    return hay.includes(needle);
  });
}

function clusterEvents(events) {
  const bucketWidth = Math.max(18, Math.floor(90 / Math.max(0.3, 1 / appState.yearsPerPixel)));
  const buckets = new Map();

  for (const event of events) {
    const x = (event.year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    if (x < -60 || x > canvas.width + 60) continue;
    const bucket = Math.floor(x / bucketWidth);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push({ event, x });
  }

  const drawUnits = [];
  buckets.forEach((items) => {
    if (items.length <= 3 || appState.yearsPerPixel < 0.3) {
      items.forEach((i, idx) => {
        drawUnits.push({
          type: "event",
          event: i.event,
          x: i.x,
          y: canvas.height / 2 + ((idx % 5) - 2) * 14
        });
      });
    } else {
      const avgX = items.reduce((sum, i) => sum + i.x, 0) / items.length;
      drawUnits.push({
        type: "cluster",
        x: avgX,
        y: canvas.height / 2,
        size: items.length,
        events: items.map((i) => i.event)
      });
    }
  });

  return drawUnits;
}

function drawAxis() {
  const y = canvas.height / 2;
  ctx.strokeStyle = "rgba(151,181,255,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();

  const majorStep = appState.yearsPerPixel > 6 ? 500 : appState.yearsPerPixel > 2 ? 100 : appState.yearsPerPixel > 0.7 ? 20 : 5;
  const [minYear, maxYear] = currentRange();
  const start = Math.floor(minYear / majorStep) * majorStep;

  ctx.fillStyle = "rgba(219,230,255,.75)";
  ctx.font = "12px system-ui";
  for (let year = start; year <= maxYear; year += majorStep) {
    const x = (year - appState.centerYear) / appState.yearsPerPixel + canvas.width / 2;
    ctx.strokeStyle = "rgba(151,181,255,.18)";
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.fillText(year < 0 ? `${Math.abs(year)} BCE` : `${year}`, x + 4, y + 32);
  }
}

function renderDetails(event) {
  if (!event) {
    details.innerHTML = `<p>Select an event dot to unlock context, related stories, and creator angles.</p>`;
    return;
  }

  const related = store.getEvents(event.year - 80, event.year + 80)
    .filter((e) => e.id !== event.id && (e.category === event.category || e.tags.some((t) => event.tags.includes(t))))
    .slice(0, 6);

  const angles = [
    `"What if ${event.title} never happened?" counterfactual breakdown.`,
    `Cause-effect chain: what set up ${event.title} and what followed immediately.`,
    `Hidden details from ${event.dateLabel} most viewers miss.`
  ];

  details.innerHTML = `
    <h3 class="event-title">${event.title}</h3>
    <div class="meta">${event.dateLabel} • ${event.category} • ${event.region}</div>
    <p>${event.summary}</p>
    <div class="block"><strong>Timeline context:</strong> ${event.turningPoint ? "Major turning point with broad downstream consequences." : "Part of a wider historical current worth connecting to bigger arcs."}</div>
    <div class="block"><strong>Tags:</strong><br>${event.tags.map((tag) => `<span class="badge">${tag}</span>`).join("")}</div>
    <div class="block"><strong>Suggested video angles:</strong><ul>${angles.map((a) => `<li>${a}</li>`).join("")}</ul></div>
    <div class="block"><strong>Connected stories:</strong><ul>${related.map((r) => `<li>${r.dateLabel} — ${r.title}</li>`).join("")}</ul></div>
    <div class="block"><strong>Interesting fact:</strong> ${event.unusual ? "This event is flagged as lesser-known, perfect for novelty-driven videos." : "This event has high narrative leverage and pairs well with explainer formats."}</div>
    <div class="block"><a href="${event.source}" target="_blank" rel="noopener">Original source link</a></div>
  `;
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, rect.width, rect.height);
  drawAxis();

  const visibleEvents = collectVisibleEvents();
  const units = clusterEvents(visibleEvents);
  hitTargets.length = 0;

  for (const item of units) {
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
      const color = item.event.turningPoint ? "#ffb86b" : item.event.unusual ? "#ff6b8a" : "#76a7ff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 4.6, 0, Math.PI * 2);
      ctx.fill();
      hitTargets.push({ x: item.x, y: item.y, r: 7, type: "event", event: item.event });
    }
  }

  const [minYear, maxYear] = currentRange();
  viewLabel.textContent = `Viewing ${Math.round(minYear)} to ${Math.round(maxYear)} • ${visibleEvents.length.toLocaleString()} events loaded`;

  if (appState.selectedEvent) {
    renderDetails(appState.selectedEvent);
  }

  const buffer = (maxYear - minYear) * 0.7;
  store.getEvents(minYear - buffer, maxYear + buffer);
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
    const factor = e.deltaY > 0 ? 1.14 : 0.86;
    appState.yearsPerPixel = Math.min(40, Math.max(0.04, appState.yearsPerPixel * factor));
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
      appState.yearsPerPixel = Math.max(0.08, appState.yearsPerPixel * 0.6);
      render();
      return;
    }

    appState.selectedEvent = hit.event;
    renderDetails(hit.event);
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    appState.searchTerm = e.target.value;
    if (!appState.searchTerm.trim()) {
      render();
      return;
    }

    const [minYear, maxYear] = currentRange();
    const searchPool = store.getEvents(minYear - 5000, maxYear + 5000);
    const first = searchPool.find((event) => {
      const text = `${event.title} ${event.summary} ${event.tags.join(" ")}`.toLowerCase();
      return text.includes(appState.searchTerm.trim().toLowerCase());
    });

    if (first) {
      appState.centerYear = first.year;
      appState.selectedEvent = first;
      renderDetails(first);
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

  window.addEventListener("resize", render);
}

buildCategories();
attachInteractions();
render();
