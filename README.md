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

Phase 1 (scaffold) is done: the [tldraw multiplayer starter kit](https://tldraw.dev/starter-kits/multiplayer),
adapted to this project's naming and structure. It's a plain multiplayer tldraw canvas with no
tournament data yet. See [Plan](#plan) for what comes next.

## Development

```bash
npm install
npm run dev        # vite + the worker (via @cloudflare/vite-plugin) on http://localhost:5173
npm run typecheck
npm run build
npm run deploy     # build + wrangler deploy (needs a Cloudflare account)
npm run cf-typegen # regenerate worker-configuration.d.ts after editing wrangler.toml
```

Open `/` to be redirected to a diagram at `/d/<diagramId>`. Open the same URL in a second tab to
see multiplayer sync.

No tldraw license key is needed on localhost. Production builds need `VITE_TLDRAW_LICENSE_KEY`
(see `.env.example`); a free [hobby license](https://tldraw.dev/get-a-license/hobby) is fine and
shows a "made with tldraw" watermark. Without a key, the editor stops rendering in production.

### Layout

```
shared/   code used by both client and worker: the tldraw schema, URL helpers
worker/   Cloudflare Worker: routing, the DiagramRoom durable object, R2 asset uploads
client/   React + tldraw SPA, served by the same worker
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
- **Keys:** `btp:round:<id>`, `btp:adv:<id>`, `btp:pool:<id>`.
  - Card titles come from the round name prefix that Blame the Pads preserves
    (`"WR1:M1: Alice vs. Bob"` → `WR1:M1`).
  - Entrants come from `player_rounds`.
  - Empty slots are labelled from incoming edges (e.g. "Loser of WF").
- **No agreed schema contract.** Validate rows with zod, keep the one select string in a single
  file, and run a scheduled CI check against a known tourney so drift is caught quickly.
  Optionally, ask Blame the Pads for a stable view or RPC.

### Layout and editing

- **Starting layouts are an explicit admin action, never automatic.**
  - "Generate layout" builds cards and bound arrows from the graph on the client.
  - New rounds appearing mid-event show an "N rounds not placed" banner with a Place button.
  - Cards use fixed shape ids (`createShapeId('btp:round:123')`), so concurrent clicks by two
    editors can't duplicate cards, and the server never builds tldraw records itself.
- **Layout heuristics:**
  1. Read-only copies of Blame the Pads' bracket template JSON, used as presets with coordinates
     and matched to rounds by name prefix.
  2. Fallback: column = longest path from first matches, lanes by pool name (`/loser/i`, `/grand/i`).
  3. It only needs to be a decent starting point; admins rearrange from there.
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
2. **Read path.** `btp` adapter, `BracketGraph`, alarm polling, custom-message delivery, and a
   debug view of the raw graph. Check this first: whether a custom message sent right after
   `handleSocketConnect` arrives before the sync handshake completes. If not, new clients fetch
   the initial graph over HTTP and receive only updates by message.
3. **Card shape and Generate layout.** Custom card shape in the shared schema, placeholders,
   template presets, "unplaced rounds" banner.
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
