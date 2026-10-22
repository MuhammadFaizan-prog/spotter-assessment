# Design — Spotter Weather Routing

## Direction: "night dispatch"
A dense, dark product tool for a driver or dispatcher comparing three routes before a run. The map is the hero; chrome is quiet so the only saturated colour on screen is **risk**. Primary actions are high-contrast white instead of a brand hue, so no accent colour can be mistaken for a risk level.

## References (researched on Dribbble / Behance / Swipefile)
| # | Reference | What we borrowed |
|---|---|---|
| 1 | **TMS Dashboard – Route Planner Page**, Pickolab Studio (Dribbble) — https://dribbble.com/shots/27110085-TMS-Dashboard-Route-Planner-Page | Left column of contextual cards with truck/load info up front, map-centric right side with ETA on the route. Became our 412 px trip panel + route comparison cards next to a full-bleed map. |
| 2 | **Logistat – Managing a Fleet of Trucks**, Vladislav Nikiforov (Dribbble) — https://dribbble.com/shots/23805188-Logistat-Managing-a-Fleet-of-Trucks | Dark map with routes as the primary surface and compact per-vehicle metric blocks. Became the 4-up stat row (No Travel / Severe / High / Avg risk) and the mono numerals. |
| 3 | **Windy — Weather Map** (Swipefile breakdown) — https://swipefile.design/ref/windy-map/ | Almost no chrome over the data field; the timeline and legend float over the map as one bottom strip. Became the floating slider dock (play, time, layer toggle) and the floating risk legend. |
| + | **Logistics Fleet Management Dashboard – TRUCK VISION** (Behance) — https://www.behance.net/gallery/231737513/Logistics-Fleet-Management-Dashboard-TRUCK-VISION | Route planner insight cards (distance, ETA). Informed the route card header: letter tile, name, rank badge, duration right-aligned. |

What we deliberately did **not** borrow: decorative KPI tiles, gradients, glassy blobs and fake charts common to these shots. Every block on screen maps to a requirement in the brief.

## Tokens (`frontend/src/styles/tokens.css`)
**Surfaces** `--ink-0 #07090D` map letterbox · `--ink-1 #0B0F14` app · `--ink-2 #11161D` panel · `--ink-3 #171E27` card · `--ink-4 #1E2732` hover · hairlines `#222C38` / `#2E3A48`.
**Text** `#E7ECF2` primary · `#A9B4C2` secondary · `#75818F` tertiary. **Focus** `#8ECBFF` 2 px ring.

**Risk scale (Okabe–Ito, colour-blind safe)**
| Level | Colour | Extra cue |
|---|---|---|
| Low | `#56B4E9` sky blue | small dot |
| Moderate | `#F0E442` yellow | |
| High | `#E69F00` orange | |
| Severe | `#D55E00` vermillion | larger marker, diamond on timeline |
| No Travel | `#CC79A7` reddish purple | diagonal hatch in bars/legend, larger marker |

The Okabe–Ito set stays distinguishable under protanopia, deuteranopia and tritanopia, and lightness falls monotonically from Moderate to Severe. Colour is never the only signal: chips carry the label text, severe+ markers are bigger, No Travel is hatched.

**Type** IBM Plex Sans (UI) + IBM Plex Mono with tabular numerals for every number (miles, mph, times) so columns align while scanning. Scale 11/12/13/14/16/20 px; uppercase 11 px labels with 0.08em tracking.
**Spacing** 4 px base: 4, 8, 12, 16, 20, 24, 32. **Radius** 6 / 10 / 14 / pill. **Elevation** one floating shadow for map overlays; cards use hairline + inset highlight.
**Motion** 120 ms (hover/press), 220 ms (switch), map ease 600–900 ms; all UI motion collapses to 0 under `prefers-reduced-motion`.

## Layout
- **Desktop**: 412 px panel (form → recommendation → route cards → checkpoint timeline) | full-bleed map with floating legend (top-left) and slider dock (bottom).
- **≤1100 px**: panel 360 px, dock controls wrap.
- **≤900 px (mobile)**: map first (62 vh, sticky), panel scrolls underneath; legend starts collapsed; every other tick label hidden.

## Map encoding
- Selected route: risk-coloured segments (each checkpoint owns its stretch of road) on a white casing.
- Other routes: dashed grey, lighter on hover, click to select.
- Checkpoints: circles in risk colour; dimmed for non-selected routes; click for a popup (ETA, wind/gust, rain, snow, temp, which factor drove the level, load rule).
- Heatmap: corridor grid, same colour ramp as the risk scale; layer switch Risk / Wind / Rain-Snow.
- Truck dots: each route's position at the slider hour.

## States
Empty (how scoring works), loading (step list + skeleton cards + map progress bar), error (inline alert with Retry for upstream failures; field errors for validation), place search loading/empty/error, map-tile failure banner.
