# tldraw-brackets

Live, hand-customizable tournament bracket diagrams built on [tldraw](https://tldraw.dev).

Tournament admins lay out and style a bracket on a multiplayer tldraw canvas. Player names, results
and round status fill in automatically as the tournament progresses, without ever disturbing the
layout or styling admins have applied.

This is a **read-only visualization tool**. It reads tournament data from an external backend and
persists only its own diagram data. Nothing here ever writes back to a tournament backend.

The first (and currently only) supported backend is [Blame the Pads](https://github.com/AlanCooper509/piu-tourney-maker)
(formerly PIU Tourney Maker), identified throughout this codebase as `btp`.

## Status

Phases 1–3 are done:

- **Phase 1:** the [tldraw multiplayer starter kit](https://tldraw.dev/starter-kits/multiplayer),
  adapted to this project's naming and structure.
- **Phase 2:** each diagram can be pointed at a Blame the Pads tourney (or a bundled fixture). The
  `DiagramRoom` polls it while anyone is connected and pushes a normalized `BracketGraph` to every
  session. The "Show data" panel displays that graph for debugging.
- **Phase 3:** "Generate layout" draws the bracket as hand-drawn match cards joined by elbow
  arrows. Cards show live entrants, results and "Winner of …" placeholders, and keep whatever
  position and styling admins give them as the tournament progresses.

The `btp` adapter has been checked against every started tourney in Blame the Pads' real database
(36 at the time). See [Plan](#plan) for what comes next.

## Development

```bash
npm install
npm run dev        # vite + the worker (via @cloudflare/vite-plugin) on http://localhost:5173
npm run typecheck
npm test           # unit tests (vitest)
npm run build
npm run deploy     # build + wrangler deploy (needs a Cloudflare account)
npm run cf-typegen # regenerate worker-configuration.d.ts after editing wrangler.toml
```

Open `/` to be redirected to a diagram at `/d/<diagramId>`. Open the same URL in a second tab to
see multiplayer sync.

To give a diagram tournament data, type into the source box in its header:

- a Blame the Pads tourney id or URL. This needs `BTP_SUPABASE_URL` and `BTP_SUPABASE_ANON_KEY`
  in `.dev.vars` (copy `.dev.vars.example`). Both are the public values Blame the Pads' own
  frontend uses.
- `fixture:de4-midway` or `fixture:de4-late`: bundled snapshots of a 4-player double elimination
  bracket (`worker/sources/fixtures/`), which need no network access.

Then click "Show data" to see the live graph.

The same thing over HTTP:

```bash
curl -X PUT localhost:5173/api/diagrams/<diagramId>/source -d '{"kind":"btp","tourneyId":123}'
curl localhost:5173/api/diagrams/<diagramId>/source   # current source, graph and any error
```

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
```

Client and worker are always deployed together as one Worker, so their tldraw versions always
match, which tldraw sync requires.

## Plan

### Architecture

```
                 ┌──────────────── one Cloudflare Worker deploy ────────────────┐
 Browser ──────► │ static SPA (React + tldraw)                                  │
 (editor/viewer/ │ /api/diagrams        → D1: diagram registry, edit-token hashes│
  OBS overlay)   │ /api/uploads/*       → R2: logos, backgrounds                │
       ▲   WS    │ /api/diagrams/:id/connect ─► DiagramRoom (Durable Object)    │
       └─────────┤     ├─ TLSocketRoom + SQLite storage  (the diagram)          │
                 │     ├─ source adapter (btp) ──read──► Blame the Pads Supabase │
                 │     └─ pushes BracketGraph to clients as custom messages     │
                 └──────────────────────────────────────────────────────────────┘
```

- **One `DiagramRoom` durable object per diagram** hosts the tldraw sync room (`TLSocketRoom`,
  persisted to the object's built-in SQLite). It's also the only component that reads tournament
  data. Browsers never talk to a tournament backend, data is fetched once per diagram rather than
  once per viewer, and future sources that need secrets (e.g. start.gg) keep them server-side.
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
    to a bracket reset, gets no placement.
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
  - "Generate layout" builds cards and elbow arrows bound to them, as one undoable step.
  - Matches that appear in the source later show a "N matches aren't on the diagram yet" banner.
    "Place them" adds just those, lined up with wherever admins have moved the rest.
  - Card and arrow ids derive from graph keys (`createShapeId('btp:round:123')`), so concurrent
    clicks by two editors can't duplicate anything, and the server never builds tldraw records.
  - Arrows are only added alongside new cards, so ones an admin deleted stay deleted.
  - Drops from the main bracket into the losers bracket get no arrow by default; the losers
    card's placeholder already says where its players come from.
- **Layout** (`client/bracket/layout.ts`), which only needs to be a decent first draft:
  - Column = longest path from the bracket's first matches (phase order if there are no
    advancements).
  - Lanes by name: losers (`LR…`, "Loser", "Redemption") below the main bracket; grand finals
    and reset to the right of both.
  - Within a lane, each match is centered on its feeders, giving elimination brackets their
    usual shape.
  - Checked against real double elimination, single elimination and waterfall tourneys. Copying
    Blame the Pads' template coordinates as presets turned out to be unnecessary.
- **Styling:** tldraw's hand-drawn look by default. A diagram-level theme record supplies default
  and per-status colors. Cards store only admin overrides (hex colors), set through a style panel
  extension with a color picker.
- **Images:** uploads go to R2 via `TLAssetStore` (already wired up from the starter kit).

### Access (v1: no accounts)

- **Public view link:** `/d/:id`.
- **Secret edit link:** `/d/:id/edit#<token>`. The token lives in the URL fragment so it never
  reaches logs. D1 stores only its hash. The worker checks it on websocket connect and sets
  `isReadonly` for everyone else.
- **Cursors:** labelled with a self-chosen display name.
- **OBS overlay:** `/d/:id/obs?frame=<shapeId>`. Read-only, no UI, camera locked to an
  admin-placed frame, transparent background.

### Durability

- **Live state:** durable object SQLite (handled by `TLSocketRoom`).
- **Backups:** periodic and on-demand "save version" snapshots to R2, for restore and JSON export.

### Phases

1. ✅ **Scaffold.** Starter kit, `DiagramRoom` durable object, shared schema module, license key
   wiring, `/d/:diagramId` routes.
2. ✅ **Read path.** `btp` adapter, `BracketGraph`, alarm polling, custom-message delivery, and a
   debug view of the raw graph. A new session is sent live data once the room has processed its
   sync `connect` message (via `onAfterReceiveMessage`), so no separate HTTP fetch is needed.
   Checked against Blame the Pads' real Supabase.
3. ✅ **Card shape and Generate layout.** Custom card shape in the shared schema, placeholders,
   "unplaced matches" banner.
4. **Editing polish.** Theme and hex colors, edge styles.
5. **Access and output.** D1 registry, edit links, read-only viewer, OBS route.
6. **Hardening.** R2 versions and restore, schema migrations, schema-drift CI check against
   Blame the Pads.

### Future sources

If more sources are added (start.gg, public Google Sheets), each is another adapter producing
`BracketGraph` inside the durable object.

- **start.gg:**
  - Set slots carry their prerequisite set and placement, which gives the edges directly.
  - Requires an API token (kept server-side) and polling.
  - Unstarted brackets may use temporary set ids, so layout keys should be phase group plus the
    set's letter identifier, not set id.
- **Google Sheets:** public CSV export plus a documented sheet convention (Matches / Entrants /
  Advancements tabs) and good validation errors.

## License

Scaffolded from tldraw's MIT-licensed multiplayer starter kit; see [LICENSE.md](./LICENSE.md).
Production use of the tldraw SDK itself requires a [tldraw license key](https://tldraw.dev/sdk-features/license-key).
