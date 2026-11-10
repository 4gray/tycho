---
version: 1
slug: "design-prototype-index-html"
primary_target: "design/prototype/index.html"
related_targets: []
---

Scope: Tycho desktop app shell (Overview, Sessions rack, Session detail, Tools, Search, Sources, Tray). Mode: Operate.
Audience/job: one developer running several coding harnesses; glance spend, replay a session, find a past chat, compare harnesses.

## Direction contract
THESIS: Every agent session is a flight progress strip in a rack. Refuses the KPI-card-grid dashboard.
OWN-WORLD: Dim slate controller bay (#1b1f24 range) holding light buff paper strips; harness = strip holder colour (Claude amber, OpenCode cobalt, Cursor green, unknown grey). Condensed tabular sans for strip fields, mono only for tool inputs. Strips have hard 1px rules dividing fixed fields; no radius beyond 2px, no shadows except a lifted active strip.
STORY: User sees what is airborne now, what it cost today, and drills from any strip into its full tape.
FIRST VIEWPORT: Top bar: today/7d/30d API-equivalent cost as a readout. Left: rack "LIVE" (active strips) then "TODAY". Right: cost-over-time stacked by harness. Primary action: click a strip.
FORM: Flight progress strip rack, rank 1 of grounded list (pick card, user-chosen). seed: d30db39a78c2485615d81355b6f3a4a1-pick
SIGNATURE: strip expands in place into a Gantt tool-call tape; provenance stamp R/C/E printed in a fixed cell on every cost.
