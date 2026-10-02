<picture>
  <source srcset="client/brand/lockup-horizontal-dark.svg" media="(prefers-color-scheme: dark)">
  <img src="client/brand/lockup-horizontal-light.svg" alt="DDR Tools Brackets" width="320">
</picture>

# tldraw-brackets

Live, hand-customizable tournament bracket diagrams built on [tldraw](https://tldraw.dev).

Tournament admins lay out and style a bracket on a multiplayer tldraw canvas. Player names, results
and round status fill in automatically as the tournament progresses, without ever disturbing the
layout or styling admins have applied.

This is a **read-only visualization tool**. It reads tournament data from an external backend and
persists only its own diagram data. Nothing here ever writes back to a tournament backend.

Two backends are supported: [Blame the Pads](https://github.com/AlanCooper509/piu-tourney-maker)
(formerly PIU Tourney Maker), identified throughout this codebase as `btp`, and
[start.gg](https://start.gg), identified as `startgg`.

## Status

All six phases are done:

- **Phase 1:** the [tldraw multiplayer starter kit](https://tldraw.dev/starter-kits/multiplayer),
  adapted to this project's naming and structure.
- **Phase 2:** each diagram can be pointed at a Blame the Pads tourney (or a bundled fixture). The
  `DiagramRoom` polls it while anyone is connected and pushes a normalized `BracketGraph` to every
  session. The "Show data" panel displays that graph for debugging.
- **Phase 3:** "Generate layout" draws the bracket as hand-drawn match cards joined by arc
  arrows. Cards show live entrants, results and "Winner of …" placeholders, and keep whatever
  position and styling admins give them as the tournament progresses.
- **Phase 4:** each diagram has its own palette of eight extra named colors, edited from the
  header's "Palette" button. They appear in tldraw's style panel for every shape, sync to all
  editors, and undo like any other edit. Individual players can be given a color too, from a
  "Players" section in the style panel when a match card is selected; it applies wherever that
  player appears.
- **Phase 5:** diagrams are created from the home page and come with a secret edit link. Anyone
  with the plain link can watch; only edit-link holders can change anything. An OBS link shows a
  chosen frame of the diagram, transparent and without any UI or other people's cursors.
- **Phase 6:** diagrams are saved as versions in R2, automatically and on demand, and can be
  restored or downloaded from the header's "Versions" button. Card shape changes go through
  migrations, checked against a diagram saved by an older build. CI checks formatting, types,
  tests and the build on every push, and the `btp` adapter against the live database every day.
  Cards can also have their own text color, and each diagram picks (or hides) its "live" and "up
  next" badge colors.

After phase 6, a `startgg` adapter was added: see [its section](#the-startgg-adapter-read-only).

The `btp` adapter has been checked against every started tourney in Blame the Pads' real database
(36 at the time). See [Plan](#plan) for what comes next.

## Development

```bash
npm install
npm run dev        # vite + the worker (via @cloudflare/vite-plugin) on http://localhost:5173
npm run typecheck
npm test           # unit tests (vitest), offline
npm run check:btp  # the btp adapter against Blame the Pads' live database (needs the two
                   # BTP_SUPABASE_* variables in the environment)
npm run check:startgg # the start.gg token's expiry, and the startgg adapter against the live
                   # API (needs STARTGG_TOKEN in the environment)
npm run format     # prettier
npm run build
npm run deploy     # build + wrangler deploy (needs a Cloudflare account)
npm run cf-typegen # regenerate worker-configuration.d.ts after editing wrangler.toml
```

Open `/` and click "New diagram". This browser remembers the diagram's edit token; use the
header's "Edit link" to edit from elsewhere, and "View link" for a read-only view. Open a link in
a second browser profile to see multiplayer sync.

To give a diagram tournament data, type into the source box in its header:

- a Blame the Pads tourney id or URL. This needs `BTP_SUPABASE_URL` and `BTP_SUPABASE_ANON_KEY`
  in `.dev.vars` (copy `.dev.vars.example`). Both are the public values Blame the Pads' own
  frontend uses.
- a start.gg event link, or a link to one phase or pool from the event's Brackets page
  (`…/event/<event>/brackets/<phaseId>/<poolId>`). This needs `STARTGG_TOKEN` in `.dev.vars`.
  Events with more than 16 pools must be narrowed to a phase or pool.
- `fixture:de4-midway`, `fixture:de4-late` or `fixture:startgg-de4`: bundled snapshots of a
  4-player double elimination bracket (`worker/sources/fixtures/`), which need no network access.

Then click "Show data" to see the live graph.

The same thing over HTTP:

```bash
curl -X POST localhost:5173/api/diagrams        # {"diagramId": "...", "editToken": "..."}
curl -X PUT localhost:5173/api/diagrams/<diagramId>/source \
  -H "authorization: Bearer <editToken>" -d '{"kind":"btp","tourneyId":123}'
curl localhost:5173/api/diagrams/<diagramId>/source   # current source, graph and any error
```

For an OBS browser source, draw a frame around what should be on stream, name it, select it, and
use the header's "OBS link" (`/d/<diagramId>/obs?frame=<name>`). Without a frame, the OBS view
fits the whole diagram.

No tldraw license key is needed on localhost. Production builds need `VITE_TLDRAW_LICENSE_KEY`
(see `.env.example`); a free [hobby license](https://tldraw.dev/get-a-license/hobby) is fine and
shows a "made with tldraw" watermark. Without a key, the editor stops rendering in production.

### Layout

```
shared/          code used by both client and worker: the tldraw schema, BracketGraph,
                 diagram sources, the live-data message, URL helpers
worker/          Cloudflare Worker: routing, the DiagramRoom durable object, R2 asset uploads
worker/sources/  source adapters (read-only), e.g. btp/, plus fixtures for dev and tests
client/          React + tldraw SPA, served by the same worker
client/live/     live-data store, source picker and debug panel
client/bracket/  match card shape, layout, Generate layout, player colors
client/palette/  diagram palette and status badge colors
client/versions/ the Versions popover
scripts/         the scheduled source checks, and start.gg token rotation
client/pages/    Home, Diagram (view/edit), ObsView
```

### CI

`.github/workflows/ci.yml` runs on every push and pull request. `btp-schema.yml` runs
`npm run check:btp` daily (and on demand from the Actions tab); it needs the repository secrets
`BTP_SUPABASE_URL` and `BTP_SUPABASE_ANON_KEY`, the same values the worker uses.
`startgg-check.yml` runs `npm run check:startgg` daily; it needs the `STARTGG_TOKEN` secret and
is skipped without it.

### Rotating the start.gg token

start.gg API tokens expire a year after they're made, and there's no API to make a new one.
`worker/sources/startgg/token.ts` records the current token's expiry, and the daily
`startgg-check.yml` starts failing 30 days before it, so GitHub emails a reminder. Then:

1. Make a new token at <https://start.gg/admin/profile/developer>.
2. Run `scripts/rotate-startgg-token.sh [YYYY-MM-DD]` with its expiry date (default: a year from
   today). It puts the token in the worker (`wrangler secret put`), the GitHub secret and
   `.dev.vars`, and updates `token.ts`.
3. Commit `token.ts`.

Client and worker are always deployed together as one Worker, so their tldraw versions always
match, which tldraw sync requires.

## Plan

### Architecture

```
                 ┌──────────────── one Cloudflare Worker deploy ────────────────┐
 Browser ──────► │ static SPA (React + tldraw)                                  │
 (editor/viewer/ │ POST /api/diagrams   → claims a new DiagramRoom, returns token│
  OBS overlay)   │ /api/uploads/*       → R2: logos, backgrounds                │
       ▲   WS    │ /api/diagrams/:id/connect ─► DiagramRoom (Durable Object)    │
       └─────────┤     ├─ TLSocketRoom + SQLite storage  (the diagram)          │
                 │     ├─ source adapter (btp) ──read──► Blame the Pads Supabase │
                 │     ├─ source adapter (startgg) ─read─► start.gg GraphQL API  │
                 │     └─ pushes BracketGraph to clients as custom messages     │
                 └──────────────────────────────────────────────────────────────┘
```

- **One `DiagramRoom` durable object per diagram** hosts the tldraw sync room (`TLSocketRoom`,
  persisted to the object's built-in SQLite). It's also the only component that reads tournament
  data. Browsers never talk to a tournament backend, data is fetched once per diagram rather than
  once per viewer, and sources that need secrets (start.gg) keep them server-side.
- **The diagram document only changes when a person edits it.** Live tournament data is pushed
  separately as tldraw sync custom messages (`room.sendCustomMessage` →
  `useSync({ onCustomMessageReceived })`). Cards render live data by key at draw time, so snapshots
  never contain stale names and undo history only holds human edits.

### Source-agnostic graph model

Every source adapter produces the same normalized graph. Layout and styling are keyed by these
stable string keys.

```ts
interface BracketGraph {
  phases:  { key: string; name: string; order: number }[]
  matches: { key: string; phaseKey: string; title: string; status: MatchStatus
             capacity: number                       // card height comes from expected group size
             entrants: { name: string; seed?: number; placement?: number; imageUrl?: string }[] }[]
  edges:   { key: string; from: string; to: string; rankStart: number; rankEnd?: number; label?: string }[]
}
```

### The `btp` adapter (Blame the Pads, read-only)

- Uses Blame the Pads' public Supabase URL and anon key (Worker secrets). Signed-out spectators can
  already read every table we need: `rounds`, `round_pools`, `round_advancements`, `player_rounds`,
  `player_tourneys`.
- Fetches a whole tourney in **one PostgREST request** using embedded selects. `round_advancements`
  has two foreign keys into `rounds`, so the embed must name one: `round_advancements!round_id(*)`.
- Maps the result to `BracketGraph`, hashes it, and pushes to connected sessions only on change.
- **Updates:** v1 polls from a durable object alarm every ~3–5s while any session is connected,
  and stops when the last one leaves. start.gg can only be polled anyway, so this keeps one model
  for every source. Supabase Realtime is a later latency optimization; all the needed tables are
  already in its publication.
- **Keys:** `btp:round:<id>`, `btp:adv:<id>`, `btp:pool:<id>`, `btp:player:<player_tourney_id>`.
  - Card titles come from the round name prefix that Blame the Pads preserves
    (`"WR1:M1: Alice vs. Bob"` → `WR1:M1`).
  - Entrants come from `player_rounds`.
  - Empty slots are labelled from incoming edges (e.g. "Loser of WF").
- **Results:** Blame the Pads doesn't store a round's results; it computes them from scores. So
  each entrant's result is recovered from where the player turned up next:
  - `advancedVia` is the advancement whose destination holds the player's next `player_rounds`
    row. If that next row isn't in one of the round's destinations, an admin moved the player by
    hand and there's no result.
  - `placement` is set only when that advancement pins down the rank (e.g. "Winner 1–1", or
    "Loser 2+" in a 1v1). Data that contradicts itself, such as both Grand Finals players going
    to a bracket reset, gets no placement. Cards then show the advancement's rank range
    instead (e.g. "3rd–6th").
  - `sort_order` is not trusted on its own. Before Blame the Pads' 2026-09-15 advancement rework
    it was the position within the advancing or non-advancing group, since then it's the absolute
    rank, and hand-placed players have none.
  - Eliminated players and the final round get no result. Computing those from scores is future
    work.
- **No agreed schema contract.** Validate rows with zod, keep the one select string in a single
  file, and run a scheduled CI check against a known tourney so drift is caught quickly.
  Optionally, ask Blame the Pads for a stable view or RPC.

### Layout and editing

- **Match cards** (`bracket-match` shape, `shared/matchCardShape.ts` + `client/bracket/`):
  - Props are just `matchKey`, size, and tldraw's own style props (color, fill, dash, size, font),
    so the built-in style panel and hand-drawn rendering work as for any tldraw shape.
  - Entrants, results and status are looked up from live data by `matchKey` at render time
    (`shared/matchCardModel.ts`). Empty slots name where their player will come from, e.g.
    "Loser of WR1:M1".
  - Changing a card's size style scales the card with its text.
  - A card whose match disappears from the source is dimmed and marked "Not in source".
- **Starting layouts are an explicit admin action, never automatic.**
  - "Generate layout" builds cards and arc arrows bound to them, as one undoable step.
  - Matches that appear in the source later show a "N matches aren't on the diagram yet" banner.
    "Place them" adds just those, lined up with wherever admins have moved the rest.
  - Card and arrow ids derive from graph keys (`createShapeId('btp:round:123')`), so concurrent
    clicks by two editors can't duplicate anything, and the server never builds tldraw records.
  - Arrows are only added alongside new cards, so ones an admin deleted stay deleted.
  - Moves between the main and losers/redemption lanes are dashed, with arrowheads. In double
    elimination, drops into the losers bracket get no arrow at all (the losers card's
    placeholder already says where its players come from); in waterfalls and gauntlets, where
    moving between lanes is the point, they're drawn.
  - Each phase (Blame the Pads pool, e.g. a waterfall division) gets a text label above its
    cards, unless it's a single match with the same name.
- **Layout** (`client/bracket/layout.ts`), which only needs to be a decent first draft:
  - When every match has a phase, phases are laid out in the order of the advancements between
    them, each getting as many columns as its longest same-lane chain. A waterfall division's
    winners and redemption groups therefore share a column, joined by a short vertical drop.
  - Otherwise (older tourneys have no pools), column = longest path from the bracket's first
    matches, or phase order if there are no advancements.
  - Lanes by name: losers (`LR…`, "Loser", "Redemption") below the main bracket; grand finals
    and reset to the right of both.
  - Within a lane, each match is centered on its feeders, giving elimination brackets their
    usual shape.
  - Cards for groups of more than two are wider, and each column is as wide as its widest card.
  - Checked against real double elimination, single elimination and waterfall tourneys. Copying
    Blame the Pads' template coordinates as presets turned out to be unnecessary.
- **Styling:** tldraw's hand-drawn look by default, with tldraw's normal style panel for cards,
  arrows and everything else.
- **Diagram palette** (`shared/palette.ts`, `client/palette/`): eight extra colors per diagram.
  - The slot names (`palette-1` … `palette-8`) are fixed, because tldraw validates shape colors
    against a list of names on both the client and the worker.
  - What each slot is called and looks like lives in the document record's meta, so it syncs,
    persists and undoes with the diagram.
  - Each client turns the palette into tldraw theme colors (fills, frames, notes and highlights
    for light and dark mode, mixed from the one chosen color) with `editor.updateTheme`, and gives
    the style panel the slots' names through translation overrides.
- **Player colors** (`shared/playerColors.ts`, `client/bracket/PlayerColorsSection.tsx`): a color
  name (built-in or palette) per entrant key, in the document meta beside the palette. Selecting
  a match card adds a "Players" section to tldraw's style panel, reusing its color picker. The
  color applies to that player's name on every card, so they can be followed through the bracket.
- **Card text color** (`MatchCardTextColorStyle`): a style of its own, so it applies to every
  selected card at once from a "Card text" section of the style panel. It defaults to "same as
  card".
- **Status badge colors** (`shared/statusColors.ts`): the colors of the "live" and "up next"
  badges, or hidden, per diagram, in the document meta. Edited in the palette popover.
- **Images:** uploads go to R2 via `TLAssetStore` (already wired up from the starter kit).

### Access (v1: no accounts)

- **Creating:** `POST /api/diagrams` picks a random id and edit token, and the new diagram's
  `DiagramRoom` stores only the token's SHA-256 hash. The token is revealed once, in that
  response. A diagram that was never created this way is "not found".
  - The plan had a D1 registry here. Access checks only ever concern one diagram, so its own
    durable object storage is enough. D1 can be added if a cross-diagram index is ever needed.
- **Public view link:** `/d/:id`. Read-only, enforced by the server (`isReadonly` sessions).
  Viewers send no presence, so editors don't see their cursors.
- **Secret edit link:** `/d/:id/edit#<token>`. The token sits in the URL fragment so it never
  reaches the server in a URL. The page remembers it in localStorage, then drops it from the
  address bar (so it isn't left on screen or on stream). Plain `/d/:id` links then open as an
  editor in that browser.
- **Connecting as an editor:** browsers can't set headers on WebSockets, so the client first
  trades its token (in an `Authorization` header) for a single-use ticket valid for 60 seconds
  (`POST /api/diagrams/:id/tickets`), and connects with that. A fresh ticket is fetched on every
  reconnect. A rejected token falls back to read-only and is forgotten.
- **Other editor-only endpoints:** changing the source, uploading images, and link previews (the
  unfurler fetches arbitrary URLs, so it isn't open to everyone). Uploaded files are public.
- **OBS overlay:** `/d/:id/obs?frame=<name>`. Read-only, no UI, transparent background, camera
  locked to the named frame (following it if it moves). Frames are hidden, as are editors'
  cursors, selections, brushes and scribbles.
- **This browser's diagrams:** the home page lists diagrams opened here, from localStorage.

### Durability

- **Live state:** durable object SQLite (handled by `TLSocketRoom`).
- **Versions** (`worker/versions.ts`): snapshots of the tldraw document in R2, under
  `versions/<durable object id>/`, never public.
  - Saved automatically every 10 minutes while the diagram changes, and when the last person
    leaves. The newest 50 automatic versions are kept.
  - Editors can save labeled versions, which are kept forever, download any version or the
    current diagram as JSON, and restore a version. A restore first saves the current state as a
    "before restore" version, then replaces the room's document; connected clients reload it.
  - Live tournament data isn't part of the document, so it isn't in versions either. The
    palette, player colors and status colors are.
- **Migrations:** every change to the card's props needs a props migration in
  `shared/matchCardShape.ts`. `shared/migrations.test.ts` loads diagrams exported by older builds
  (`shared/fixtures/`) through the current schema and validates every record, so a prop change
  without a migration fails the tests.

### Phases

1. ✅ **Scaffold.** Starter kit, `DiagramRoom` durable object, shared schema module, license key
   wiring, `/d/:diagramId` routes.
2. ✅ **Read path.** `btp` adapter, `BracketGraph`, alarm polling, custom-message delivery, and a
   debug view of the raw graph. A new session is sent live data once the room has processed its
   sync `connect` message (via `onAfterReceiveMessage`), so no separate HTTP fetch is needed.
   Checked against Blame the Pads' real Supabase.
3. ✅ **Card shape and Generate layout.** Custom card shape in the shared schema, placeholders,
   "unplaced matches" banner.
4. ✅ **Diagram palette.** Named custom colors per diagram, usable by every shape. Arrows already
   take tldraw's own styles, so edges needed nothing extra.
5. ✅ **Access and output.** Edit links, read-only viewer, OBS route.
6. ✅ **Hardening.** R2 versions and restore, schema migrations, schema-drift CI check against
   Blame the Pads. Plus card text color and status badge colors.

### The `startgg` adapter (start.gg, read-only)

- Reads start.gg's GraphQL API (`worker/sources/startgg/`) with a personal API token
  (`STARTGG_TOKEN`, a Worker secret). See [Rotating the start.gg token](#rotating-the-startgg-token).
- **Source:** an event slug, optionally narrowed to a phase and a pool (phase group), parsed from
  any start.gg event or bracket link. Each pool becomes a phase in the graph, named for its phase
  ("Top 8"), or for the phase and pool when the phase has several ("Pools: Pool A1").
- **Requests:** one for the event's phases and pools (reused for 5 minutes), then one per 50 sets
  per pool. start.gg allows each token 80 requests a minute across every diagram, and 1000 objects
  per request. So start.gg sources are read at most every 15 seconds, and less often when a read
  needs more requests (each diagram aims for at most 20 a minute). A source covering more than 16
  pools is refused with a request to narrow it down. The DiagramRoom's alarm still ticks every 5
  seconds (it also saves versions), but only reads the source when the adapter says it may.
- **Keys:** `startgg:group:<phaseGroupId>`, `startgg:set:<phaseGroupId>:<identifier>`,
  `startgg:slot:<phaseGroupId>:<identifier>:<slotIndex>`, `startgg:entrant:<entrantId>`.
  - Sets are keyed by their letter identifier, not their id: an unstarted bracket's sets have
    temporary `preview_…` ids that change when it starts.
  - Card titles shorten the round name and add the identifier, like Blame the Pads' template ids:
    `WR1:A`, `LSF:AJ`, `Grand Final`. The layout recognizes lanes from these.
- **Edges** come from each slot's prereq: a slot filled by placement 1 or 2 of another set is a
  "Winner" or "Loser" edge from it.
- **Results:** a completed two-entrant set's winner is 1st and the other entrant 2nd. An entrant
  has left by an edge once they appear in the set it leads to, like the `btp` adapter.
- **Byes:** start.gg leaves out sets with a bye, but keeps the losers-bracket sets they feed. A
  slot that is a bye, or is empty and waiting on a missing or unplayable set, is left off its
  card; a set with no other slots is left out, repeatedly. Losers sets fed by one bye therefore
  appear as one-slot cards.
- **Not yet:** progressions between phases (pools into top 8) aren't drawn as edges, since
  entrants arrive by seed rather than by set. Round robin and swiss pools show their sets and
  results, without edges.
- The daily check reads the final phase of a finished event (Genesis 9 Melee Singles) through the
  adapter, to catch API changes.

### Future sources

- **Google Sheets:** public CSV export plus a documented sheet convention (Matches / Entrants /
  Advancements tabs) and good validation errors.

## License

Scaffolded from tldraw's MIT-licensed multiplayer starter kit; see [LICENSE.md](./LICENSE.md).
Production use of the tldraw SDK itself requires a [tldraw license key](https://tldraw.dev/sdk-features/license-key).
