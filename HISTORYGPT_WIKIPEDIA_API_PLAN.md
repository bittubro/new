# HistoryGPT — Wikipedia-Only Data Loading Plan

This plan replaces synthetic or mixed-source loading with a **Wikipedia API-only architecture** so every timeline dot and detail card is sourced from official Wikipedia endpoints.

## 1) Core Objective

Build a high-performance timeline explorer where:
- every event dot is loaded from Wikipedia APIs,
- every event detail panel is Wikipedia-backed,
- every search jump is driven by Wikipedia search/page APIs,
- all ingestion, refresh, and caching logic is API-first.

## 2) Approved API Endpoints (Wikipedia Official)

1. **On This Day Events**
   - `GET https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/{month}/{day}`
   - Purpose: primary historical event stream (year + text + article page metadata).

2. **Page Search**
   - `GET https://api.wikimedia.org/core/v1/wikipedia/en/search/page?q={query}&limit={n}`
   - Purpose: user search jump and topic discovery.

3. **Page Details**
   - `GET https://api.wikimedia.org/core/v1/wikipedia/en/page/{title}`
   - Purpose: enrich selected events with summaries, URLs, and media.

## 3) Normalized Event Schema

All API records normalize into one shape before rendering:

- `id`
- `title`
- `summary`
- `year`
- `dateLabel`
- `category`
- `periodCategory`
- `tags[]`
- `region`
- `location`
- `image`
- `source`
- `relatedEvents[]`

## 4) Data Loading Flow

1. UI requests event load.
2. Loader computes day batch around an anchor day (`today ± N days`).
3. For each day, call On This Day endpoint.
4. Normalize each returned event.
5. Store normalized events in local persistence cache.
6. Render timeline nodes immediately.
7. On event click, fetch/refresh page details (if needed).
8. Update right panel with Wikipedia-backed context + source link.

## 5) Request Queue, Caching, and Reliability

- Use serialized queue for API calls.
- Add delay between requests to avoid bursts.
- Cache successful responses in `localStorage`.
- Keep bounded cache size (drop oldest entries).
- Support cache invalidation (`Clear API Cache`).
- Surface failures in UI status panel; keep timeline responsive.

## 6) Timeline Rendering Strategy (Performance)

- Canvas-based drawing for large node counts.
- Cluster points by screen-space buckets when zoomed out.
- Expand clusters progressively while zooming in.
- Preload additional day batches after pan/zoom to reduce gaps.
- Keep render loop independent from network latency.

## 7) Search Strategy

- Search input uses Wikipedia page search endpoint.
- First relevant result becomes timeline jump anchor.
- Parse year hints from title/description/excerpt.
- Center timeline on inferred year and trigger nearby event preload.

## 8) Category Strategy (Wikipedia-Derived)

Because On This Day returns free-text event descriptions:
- map events to categories using deterministic keyword classification,
- store both topical and period categories,
- allow user filtering across both.

## 9) Incremental Loading Roadmap

Phase A (implemented):
- On This Day ingestion + timeline rendering + search jump + cache.

Phase B:
- Automatic background preloading for neighboring day windows during pan.
- Year-density-aware load radius (wider for sparse eras, tighter for dense eras).

Phase C:
- Event detail enrichment on demand (page summary/image refresh).
- Related-event graph from co-occurring On This Day records and shared categories.

Phase D:
- Scheduled refresh policy (stale-while-revalidate cache strategy).
- Export/import of normalized cached timeline snapshots.

## 10) Compliance Rules for Wikipedia-Only Mode

- No synthetic events.
- No non-Wikipedia primary dataset dependencies for timeline dots.
- No local fallback records except cached Wikipedia results.
- All user-visible sources must resolve to Wikipedia article/API data.
