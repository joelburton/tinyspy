# Code conventions

How we write code in this repo. The cross-cutting rules that aren't tied to any one gametype. Read this before writing or reviewing code in `src/` or `supabase/`.

For terminology and the architectural backdrop see [`naming.md`](naming.md). For feature-specific conventions see [`tinyspy.md`](games/tinyspy.md), [`psychicnum.md`](games/psychicnum.md), [`common.md`](common.md), and [`testing.md`](testing.md).

## Code clarity & docstrings

The explanation bar in this codebase is higher than the average TypeScript project — see [`../CLAUDE.md → Educational priority`](../CLAUDE.md#educational-priority--clarity-over-brevity) for the prior. What that looks like in practice:

- **Docstrings on every exported function, component, hook, and RPC.** Explain what it does, why it exists, and any non-obvious constraints. The tinyspy RPCs in [`supabase/migrations/20260615000001_tinyspy.sql`](../supabase/migrations/20260615000001_tinyspy.sql) and components like [`src/tinyspy/components/CluePanel.tsx`](../src/tinyspy/components/CluePanel.tsx) are the model — generous prose, examples, references to related pieces.
- **Code comments where the WHY isn't obvious.** Design decisions, subtle invariants, non-obvious trade-offs ("we refetch on SUBSCRIBED because broadcasts can be missed during reconnect"), workarounds for specific platform behavior.
- **Names describe role, not implementation.** `isClueGiver` not `playerA`. See [`naming.md`](naming.md) for the terminology lexicon.
- **Prefer one clear path over a clever one.** A few extra lines of straightforward code beat a tight expression that requires the reader to pause.
- **Extract a small helper over a deeply-nested ternary.** A single `a ? b : c` is fine; two-or-more-deep nests almost always read better as a small function with `if` branches — each case lands on its own line, picks up a name (or at least a local variable), and survives a future tweak without re-balancing the whole expression. See [`psychicnum/manifest.ts → labelFor`](../src/psychicnum/manifest.ts) for the model: a 3-deep ternary refactored into a 6-line helper. The only reason to keep the ternary inline is a measured hot path where allocating the helper actually shows up in a profile — and there are no such hot paths in this codebase today.
- **`useEffect`, `useCallback`, and `useMemo` get header comments. `useEffect` callbacks also get a named function expression when non-trivial; `useCallback` / `useMemo` results assigned to a `const` skip the inner name (the const already carries it).** See [the hook-callback rule](#naming-and-commenting-hook-callbacks) below.

### What doesn't belong

- Comments that restate what well-named code already says (`// increment counter` above `counter++`).
- References to the current task, PR, or contributor (`// added for issue #42`, `// per joel's review`) — these belong in commit messages and rot in the code.
- Stale TODOs. If a TODO doesn't have a clear trigger for resolution, delete it instead.

## Database

### Schemas

Multi-schema layout:

| schema | what lives there |
|---|---|
| `public` | Postgres-managed stuff: `gen_random_uuid`, extension functions, anything we didn't put there. **We do not add tables here.** |
| `common` | Shared user-data tables and helpers used by every game: profiles, clubs, clubs_members, games, messages. **Must not reference any game schema.** |
| `tinyspy`, `psychicnum`, `<game>` | One schema per gametype; that game owns its tables, RPCs, and policies inside it. |

**Search path:** `extra_search_path = common, public, extensions`. Game schemas are deliberately *not* in the search path — every game reference is fully qualified (`tinyspy.games`, `psychicnum.games`) in SQL, and goes through `supabase.schema('<game>')` in the FE.

The payoff: each game gets a clean namespace. TinySpy and a hypothetical Boggle can each have a `words` table named just `words`. The fact that you had to say which game it was tells you which one you're touching.

### Tables and columns

- Tables describe their role within their schema. **No game prefix.** `tinyspy.words`, not `tinyspy.tinyspy_words`.
- `snake_case` for tables and columns.
- Plural for tables (`games`, `words`, `messages`).
- FKs use `<thing>_id`: `game_id`, `user_id`, `club_handle`. Self-referential or ambiguous ones get a role prefix: `next_game_id`.

### RPC functions

- Live in the schema they operate on. TinySpy RPCs are `tinyspy.create_game`, called via `db.rpc('create_game')` where `db = supabase.schema('tinyspy')`.
- Cross-game / shared RPCs live in `common`. A `common` RPC may not reference any game schema; if it would need to, it belongs in the game.
- Naming describes the verb: `create_game`, `submit_guess`, `send_message`. No `tinyspy_` prefix — the schema carries that.
- All callable RPCs are `security definer` with an explicit `set search_path = <game>, common, public, extensions`. The pinned search path neutralizes search-path hijacking; without it, a malicious unqualified table-reference inside the function could resolve against an attacker-controlled schema.

### RLS helpers

The membership check that all per-game RPCs use is `common.require_game_player(target_game)` — it reads `common.game_players` (the cross-game roster the common layer maintains) and either returns the caller's `user_id` or raises. The game-specific RPCs then derive seat / role from per-game state once authorization has passed; e.g., `tinyspy.submit_guess` reads the games row and pattern-matches `caller_id` against `user_a_id` / `user_b_id` to set `caller_seat`.

For SELECT-policy gating, games use `common.is_club_member(club_handle)` — the per-game game-id check would require querying the per-gametype games table from inside common, which is exactly the cross-coupling the removability rule forbids. Club-membership is a coarser predicate (any club member can read any of the club's games) but adequate under the friends-only trust model.

Helpers are marked `STABLE` so Postgres can cache the result within a single SELECT. RLS policies invoke the helper once per row; without `STABLE` that becomes the dominant cost on any non-trivial query.

### SECURITY DEFINER helper + security_invoker view

When you need to expose a column the calling role can't see directly, gated on row state (e.g., "reveal the answer once the game ends"), reach for this two-layer shape:

1. Keep the column-level grant on the base table — the role can't SELECT the column. (Storage-layer lock.)
2. Write a `SECURITY DEFINER` helper that reads the column and returns it conditionally based on row state. Running as `postgres`, it bypasses the column grant.
3. Define a view `with (security_invoker = true)` that calls the helper for the gated column. The `security_invoker` flag means RLS on the base table still gates row visibility *as the caller* — so unauthorized rows stay hidden.
4. Point the FE at the view, not the base table.

Canonical example: `psychicnum.games_state` + `psychicnum._target_for(uuid)` — see [`psychicnum.md` → The hidden-target mechanic](games/psychicnum.md#the-hidden-target-mechanic).

### Migration filenames

Pattern: `<timestamp>_<schema>[_<topic>].sql`. The schema-prefix-in-filename gives per-schema grouping without nested directories.

While we're still building (no real deploys yet), each schema is **squashed to a single final-state file** — one per concern — because that's far easier to read than a pile of incremental deltas:

```
20260615000000_common.sql
20260615000001_tinyspy.sql
20260615000002_psychicnum.sql
20260615000003_wordknit.sql
20260617000000_freebee.sql
20260623000000_monkeygram.sql
```

These get re-squashed in place as a schema evolves (alpha — `db reset` re-runs everything from scratch, so there's no migration history to preserve). Once we deploy for real, new changes become append-only topic deltas instead:

```
# future, post-deploy:
20260720000000_tinyspy_add_difficulty.sql
20260721000000_common_add_friends.sql
```

Cross-schema FKs (game → common) need `common.*` to exist first, which timestamp ordering handles naturally.

### Per-game player counts

Each gametype's supported player-count range is declared in **two places**:

- The TypeScript manifest's `numberOfPlayers: [min, max]` field (consumed by the shell to decide whether a "Start X" button is enabled/disabled/hidden for a given club). Both ends required; `null` upper bounds aren't allowed — every game gets a hard cap so the FE rendering, realtime channel load, and chat surface stay bounded.
- The `create_game` RPC's member-count check (the hard server-side gate that rejects mismatched calls). The three open-N games (wordknit, PsychicNum, freebee) share `common.require_player_count_max(player_user_ids, max)`; tinyspy keeps its inline exactly-2 check.

These two declarations **must agree** by convention. There's no automated sync — adding a lookup table or a code-gen step is overbuild for the scale this project operates at (rare new-game events, both files edited in the same PR). What we do instead:

- **Cross-reference comments on both sides.** The manifest's `numberOfPlayers` comment names the migration that holds the matching check; the migration's check has a comment pointing back at the manifest field. Whoever edits one is told where the other lives.
- **Boundary-test the DB side.** Each game's `create_game_test.sql` includes a boundary test (one happy-path call within the range + one rejection just outside). The test pins the SQL-side check; drift between the two sides becomes a visible mismatch.
- **Accept that FE drift surfaces as a server error.** If somehow the manifest says `[1, 8]` and the DB says `[1, 6]`, a 7-member club's Start button is shown enabled, the RPC rejects with its actual message, the user sees the error inline. Loud, not silent.

The model: the two declarations are equally authoritative for their respective layers (TS narrows types; SQL enforces state). The convention is "edit both together; the comments help you remember the partner."

### Sibling gametypes (coop/compete variants)

A family of gametypes that share a schema, folder, and docs, but differ in interaction axis or rules — today this means coop vs compete, but the pattern accommodates other axes (a "super-tough boggle" variant with a different player range). See [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern) for the full design. Coding conventions when implementing one:

**Manifest exports.** Each sibling is its own `GameManifest` export from the same `src/<baseGametype>/manifest.ts`. Use factory helpers when the start/labelFor/etc. fields are near-identical:

```ts
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (clubHandle, setup, playerUserIds) => {
    return await db.rpc('create_game', { target_club: clubHandle, setup, player_user_ids: playerUserIds, mode })
  }
}

export const psychicnumCoopGame: GameManifest = {
  gametype: 'psychicnum_coop',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'coop',
  ...
  startGameInClub: startGameInClubFactory('coop'),
}

export const psychicnumCompeteGame: GameManifest = {
  gametype: 'psychicnum_compete',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'compete',
  ...
  startGameInClub: startGameInClubFactory('compete'),
}
```

**Schema-side.** One `<baseGametype>.games.mode` column (CHECK `in ('coop', 'compete')`) denormalized from the gametype string at create-time. The RLS-policy branch reads this column rather than joining to `common.games.gametype` — it's a hot path called on every visibility check.

**RPC shape.** One `<baseGametype>.create_game(target_club, setup, players, mode)` RPC routes both variants. The RPC composes the effective gametype string (`'<baseGametype>_' || mode`) and writes it to `common.games.gametype`. Per-mode validation (e.g., compete's "≥2 players" floor) lives inside this RPC after the mode-value check.

**Mid-game RPCs (submit_*).** Branch on the mode column read off the game row. Keep both code paths visible in one function rather than splitting per-mode wrappers — it's easier to read "in coop, decrement everyone; in compete, decrement only the caller" in one place than to chase two functions.

**Tests.** Cover both modes in the same test files. The setup is cheap; the assertions are mode-specific. Coverage is incomplete without both paths exercised. See `supabase/tests/psychicnum/gameplay_test.sql` for the canonical shape.

**Don't introduce a setup.mode field.** Mode is locked at the gametype level. Adding `setup.mode` would create a second source of truth and reopen the "which Start button am I clicking?" question.

### Realtime channel names

Pattern: `<topic>:<id>:<unique>`, e.g.:

- `game:<game_id>` — the shared cross-cutting channel opened by `useCommonGame`. Stable name (no UUID suffix) because presence + manual-pause broadcasts must merge across every connected client. StrictMode handled by the hook's own `removeChannel` cleanup. Every gametype's `useCommonGame` opens this.
- `<gametype>:<game_id>:<uuid>` — the per-tab postgres-changes channel each per-game `useGame` opens. UUID suffix sidesteps supabase-js's StrictMode-cache bite; postgres-changes don't need to merge across clients so per-tab rooms are fine.
- `wordknit:<game_id>` — wordknit's stable channel for shared-selection Broadcast events (select / deselect / clear). Stable for the same reason as `game:<game_id>` — broadcast events need to merge across clients.
- `club-active:<club_handle>:<uuid>` — club active-game pointer
- `club-chat:<club_handle>:<uuid>` — club chat messages

The per-effect-run UUID suffix is mandatory: `supabase-js` caches channels by name, and React StrictMode runs effects twice on mount. Without a unique suffix, the second `.on()` chain would target an already-subscribed cached channel and throw. See [`useGame.ts`](../src/tinyspy/hooks/useGame.ts) for the canonical example.

### Realtime data hooks — two patterns

Two shapes recur across the per-game data hooks, and the choice between them is driven by **whether the hook needs Realtime Broadcast**, not by hook-size or game complexity. Pick by mechanism; don't mix them.

#### Pattern A — refetch-only via `useRealtimeRefetch`

For hooks that subscribe to postgres-changes and refetch on any event. The recurring shape — initial load → postgres-changes subscription → SUBSCRIBED-driven refetch on reconnect → cleanup — is factored into [`useRealtimeRefetch`](../src/common/hooks/useRealtimeRefetch.ts). Canonical calls:

```ts
useRealtimeRefetch({
  tables: { schema: '<gametype>', table: 'games', filter: `id=eq.${gameId}` },
  channelPrefix: '<gametype>',
  id: gameId,
  load: async ({ mounted }) => {
    const { data } = await db.from('games').select(...).eq('id', gameId).maybeSingle()
    if (!mounted()) return
    setSomething(data)
    setLoading(false)
  },
})
```

The `tables` field accepts one subscription or an array — psychicnum's useGame subscribes to `games` AND `guesses` with the same `load()`; tinyspy splits across three hooks (`useGame`, `useBoard`, `useClues`) each with its own factory call. Either shape is fine; the deciding question is whether the PlayArea component splits the data the same way.

The channel name is UUID-suffixed (`<prefix>:<id>:<uuid>`) — every peer's tab gets its own room. That's safe because there's no peer-coordination state on this channel.

Tested at [`useRealtimeRefetch.test.ts`](../src/common/hooks/useRealtimeRefetch.test.ts) — initial load, SUBSCRIBED refetch, event refetch, multi-table fan-in, `id`-change channel rebuild, cleanup mounted-guard, ref-trick (caller-fresh-load-each-render doesn't thrash the channel).

#### Pattern B — broadcast-coupled, hand-rolled, single stable-name channel

For hooks that need to **send and receive Broadcast events between peers** (selection sharing, manual-pause, suspend-cascade, future scratchpad-takeover-lock, etc.). Broadcast peers only see each other when they share a channel name, so the channel name has to be stable across peers (no UUID suffix). Once that channel is open, postgres-changes ride along on it — opening a second UUID-suffixed channel just for postgres-changes would split one coherent hook into two coordinating effects with no functional gain.

Canonical examples:
- [`common/useCommonGame`](../src/common/hooks/useCommonGame.ts) — stable `game:${gameId}` channel carrying presence, manual-pause Broadcast, suspend Broadcast, AND postgres-changes on `common.games`.
- [`wordknit/useGame`](../src/wordknit/hooks/useGame.ts) — stable `wordknit:${gameId}` channel carrying the shared-selection Broadcast (`select` / `deselect` / `clear`) AND postgres-changes on `wordknit.{games, guesses}`.
- [`common/useClubPresence`](../src/common/hooks/useClubPresence.ts) — stable `club:${handle}` channel carrying **only Presence** (no broadcast, no postgres-changes): every connected member of the club orbit announces whether they're on the club page or viewing a game. It's the leanest Pattern B instance — still Pattern B because presence rosters are keyed per-channel-name, so the name must be stable across peers (rule 2 below). Drives the member-strip dots and the abandoned-current-view heal; see [`docs/states.md`](states.md).

The shape is:

```ts
useEffect(function joinRoom() {
  let mounted = true
  async function load() { /* fetch + setState; guard on mounted */ }
  load()

  const ch = supabase.channel(`<prefix>:${id}`)  // stable name, no UUID
  ch.on('postgres_changes', { event: '*', schema, table, filter }, load)
  ch.on('broadcast', { event: 'select' }, ({ payload }) => applySelect(payload))
  ch.on('broadcast', { event: 'clear' }, () => applyClear())
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      load()
      // (presence track / mount-time RPC, if any)
    }
  })

  return () => {
    mounted = false
    supabase.removeChannel(ch)
  }
}, [id])
```

Reconnect semantics for the broadcast side fall out naturally: broadcasts during a disconnect are lost, but the project's pause-on-disconnect pattern (see [`docs/wordknit.md → Pause`](games/wordknit.md#pause-presence-driven--manual)) freezes the game while anyone's missing — no broadcast traffic happens while disconnected, so nothing's missed. Postgres-changes on the same channel still get the SUBSCRIBED-refetch recovery via the `.subscribe()` callback.

#### Choosing between A and B

Decision rule when porting a new game:

1. **Does this hook send or receive Broadcast events?** If yes → Pattern B. If no → Pattern A.
2. **Does this hook track Presence?** If yes → Pattern B (presence rosters are per-channel-name, same constraint as broadcast).

Mixing — Pattern B for broadcast + a separate Pattern A call for postgres-changes — adds a second channel per peer with no functional gain and breaks the "one hook, one channel" mental model. Don't.

#### Append-on-event exception

[`useClubChat`](../src/common/hooks/useClubChat.ts) is hand-rolled in a third shape: postgres-changes on `common.messages`, but the INSERT handler **appends the new row to local state** instead of refetching. That's a meaningful optimization for chat-heavy moments where refetching on every message would be wasteful. It's the only consumer of this shape; new game hooks shouldn't copy it unless they have the same volume profile.

## Frontend

### Folder layout

Feature-first. Each game is a self-contained folder; shared pieces live in `common/`. See [`common.md`](common.md) for the directory tree.

### Component names

Roles, not implementations:

| role | name | shared or per-game? |
|---|---|---|
| The route-level shell every game mounts inside (header / pause / chat) | `GamePage` | shared (`common/components/`) |
| The gametype-specific play surface, mounted inside `<GamePage>` at the route level via the manifest's lazy `PlayArea` field | `PlayArea` | per-game |
| The gametype-specific setup form mounted inside the common `SetupGameDialog` | `SetupForm` | per-game |
| End-of-game modal | `GameOverModal` | shared (`common/components/`); per-game callers pass an `outcome` + per-status `verdict` |
| Reused chat surface | `ClubChatPanel` | shared, mounted once by `GamePage` |
| Auth gate | `LoginScreen` | shared |

A game's main screen is `PlayArea.tsx` whether it has a literal grid (tinyspy) or just a text input (PsychicNum). The role is "the place where the gametype-specific play happens"; cross-cutting chrome (title, timer, Pause, Back-to-club, pause overlay, chat) belongs to `<GamePage>`, not to the per-game PlayArea.

**File name matches component name; folder context disambiguates same-named components across games.** `src/wordknit/components/PlayArea.tsx` exports `PlayArea`; `src/tinyspy/components/PlayArea.tsx` also exports `PlayArea`. Same rule for `SetupForm.tsx` — the folder tells you which game's PlayArea or SetupForm you're looking at, the file/export name stays role-named. No `WordKnitPlayArea` / `TinySpySetupForm` prefixes anywhere.

### Shared vs game-specific

Two-rule heuristic for deciding where a piece of UI / logic lives:

1. **If two games have a very similar requirement, extract it into `common/`.** Default lean: **extract early.** Even when only two games use it and only one of them is non-trivial, name the shared shape now. Three reasons:
   - The named seam is a forcing function for future design work. A reader (or Joel himself) is more likely to invest in making `ClubGameCard` look nicer than in making "the section of ClubPage that renders games."
   - It amortizes the "what is this thing called" cognitive load before the component grows fancier.
   - By the time three call sites exist, the abstraction is usually compromised because the second call site informed the shape without anyone noticing. Earlier extraction means the shape is set when the cases are still simple.

   This **overrides** the standard "defer extraction until complexity justifies it" agent default. Don't propose "let's wait until X grows." The principle also applies to React component splits driven by state locality, not just cross-game duplication — if state lives in one section of a render, splitting that section out is a clarity win even in a single-use component.

   Counter-cases where extraction IS premature:
   - Two call sites that just *happen* to look alike but evolve independently (they share a heading but the surrounding logic diverges next sprint). Extract on shape-with-shared-intent, not coincidence.
   - Truly one-shot UI that won't recur (a debug panel, an admin-only screen).

2. **If two games need similar-but-meaningfully-different implementations, name them similarly.** Use the same role-noun (`PlayArea`, `SetupForm`, `GuessHistory`, `Help`) across games even when the bodies diverge. A reader scanning the tree should see the common idea by sight; folder context disambiguates which game's implementation they're in. Resist gametype-prefixing names (`TinySpyPlayArea`, `WordKnitSetupForm`) — the folder already says which game.

The reason both rules matter: this codebase is shaped to host ~7 games, most of them ports of games that exist in other stacks. The faster a reader can pattern-match "ah, this is the wordknit version of the same thing tinyspy does," the cheaper porting work becomes. Both extracting-when-similar AND naming-similarly-when-different serve that goal — the first by reducing duplication, the second by making the parallels legible when duplication is the right call.

#### Per-game `useGame` shape — pick the right template

When porting a new game, the per-game `useGame` hook's shape depends on whether the game has fixed seats:

- **Fixed-seat games** (tinyspy is the example: two players, identified by columns `user_a_id` / `user_b_id`): the hook **fetches its own roster**. The seat ⇄ user_id mapping is intrinsic to the per-game row, so the roster has to be loaded alongside the game data — no upstream component can pre-compute it. The hook also fetches profiles (cross-schema) to embed usernames; the canonical example is `src/tinyspy/hooks/useGame.ts`.
- **N-player open games** (psychicnum, wordknit are the examples: any number of players, no per-seat identity): the hook **reads the roster from `GamePageCtx`** (the `players` field provided by `<GamePage>` via `useCommonGame`). No need to re-fetch — the common-side hook has already loaded `common.game_players` + profiles. The per-game hook stays focused on its game-specific tables.

The decision rule is mechanical: "does this game's per-row state name specific seats?" If yes, fixed-seat template; if no, open template. Don't mix — an N-player game that fetches its own roster duplicates work `useCommonGame` already did; a fixed-seat game that reads from `GamePageCtx` would have to wait for the upstream load before its own data makes sense.

Concrete examples in the tree today:
- Shared: `<GamePage>`, `<PauseBoundary>`, `<ClubChatPanel>`, `<TimerField>`, `<ClubGameCard>`, `<StartGameButtons>`, `<SuspendConfirmDialog>`, `useCommonGame`, `useGameTimer`.
- Same name, per-game body: `PlayArea` (every game), `SetupForm` (every game), `Help` (every game), `useGame` (every game), `GuessHistory` (wordknit + PsychicNum).
- Extracted-to-common after recurrence: `GameOverModal`, `ChatBubble`, `PlayersStrip`, `StatusSlot`, `Menu`, `PauseButton`, `GameLogo`, `PupgamesLogo` — each used by multiple call sites with the per-game variability flowing through props.

### Import-direction rules

Enforced by ESLint's `no-restricted-imports` (see [`eslint.config.js`](../eslint.config.js)):

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/games.ts` is the **one** allowed exception — it imports every game's manifest by definition.

If you find yourself wanting to import a component from another game, that's a signal to promote it to `common/`. If a `common/` piece wants to import from a game, the abstraction is wrong — generalize the common piece (often: take a `db` handle or a render prop) so it doesn't need to know the game.

`GAMETYPES` in `eslint.config.js` is the single source of truth for the rule. When a new game lands, add it there too.

### CSS Modules + theme

This section covers the *file mechanics* only. For the design philosophy — desktop-first, the two-vocabularies rule for global vs per-game tokens, what's deferred — see [`ui.md`](ui.md).

**CSS Modules**, one `*.module.css` per component, co-located with the `.tsx`:

```
src/common/components/ClubChatPanel.tsx
src/common/components/ClubChatPanel.module.css
```

**Design tokens at `:root`** in [`src/common/theme.css`](../src/common/theme.css) — colors, spacing scale, font stack, radii. Every `*.module.css` references them via `var(--token-name)`. Each game's `theme.css` (optional) overrides tokens for that gametype's palette.

`cls()` (in [`src/common/lib/cls.ts`](../src/common/lib/cls.ts)) is a tiny hand-rolled `clsx` equivalent for combining conditional class names. ~10 lines; no dependency.

**What we don't use:**

- Plain global `.css` files for components — fine for the global theme file, but anything component-specific should be a `.module.css`.
- CSS-in-JS (styled-components, emotion) — adds a dependency and a runtime cost for a problem CSS Modules already solve.
- Tailwind — large stylistic change from where the code is now; not worth the migration cost.

### TypeScript naming conventions

Two conventions intersect: TypeScript leans camelCase, SQL leans snake_case. We honor both, with a rule that makes the boundary visible.

#### Field casing

> **snake_case** for type fields that mirror a Postgres row's shape. **camelCase** for fields on TS-native shapes (component props, FE-built normalizations, manifest types, anything we designed in TS).

The "how to tell" test: if the field names would match what `supabase gen types` emits for that table, the type is DB-shaped and uses snake_case. Otherwise it's a TS abstraction and uses camelCase.

```ts
// DB-shape — fields match the Postgres row exactly
type PlayerRow = {
  user_id: string         // snake (matches DB)
  seat: 'A' | 'B'
  username: string
}

// FE-built normalization — TS-named fields
type ClubGameEntry = {
  gameType: string        // camel (TS-named)
  gameId: string
  startedAt: string
  isTerminal: boolean
}

// Component props — TS-native concept
type Props = {
  clubId: string          // camel — name we chose
  members: PlayerRow[]    // camel prop name; PlayerRow keeps its snake fields
}
```

Both forms appear in any given file, but for principled reasons: snake means "this came from the DB unmodified"; camel means "this is a TS shape we designed."

The alternative — camelCase everywhere, translate at the hook layer — buys consistency at the cost of ~5 lines of column-renaming boilerplate per hook AND loses the visual signal that distinguishes raw rows from FE shapes.

#### Type name suffix

> A type whose fields are a direct alias of (or trivial subset of) a Postgres row's shape ends in **`Row`**. TS-native shapes use whatever name describes their role best.

| name | what it is |
|---|---|
| `WordRow`, `GameRow`, `ClueRow`, `ClubRow`, `ClubMessage` | Aliases of generated `Database[…]['Row']` types. The `Row` suffix matches what Supabase itself emits. |
| `PlayerRow`, `MemberRow` | Hand-rolled DB-shape types — not aliases of generated types but they mirror a row shape. |
| `ClubListEntry`, `ListedGame` | FE-built normalizations for list rendering. No `Row` suffix. "Entry" / "Listed" describes their role. |
| `CommonGameListRow` | A camelCase-fielded narrow projection of `common.games` used as the input to `manifest.labelFor`. The `Row` suffix is honest: the fields name DB columns even though TS sees them as a structural shape. |
| `Props`, `CluePanelProps`, `LinkProps`, `GamePageCtx` | React component prop types (`GamePageCtx` is what `<GamePage>`'s render-prop child receives — `{ session, gameId, players, playState, isTerminal, timer, setup, goToClub, feedback, menu }`). |
| `GameManifest` | A TS-native interface that game folders implement. |

If you see a type whose fields are snake_case but whose *name* doesn't end in `Row`, ask whether the name is misleading — a non-`Row` name on a DB-shaped type invites readers to forget they're touching schema-bound data.

#### Member vs Player — one type, context-driven variable names

The codebase has a single canonical identity shape — `Member` in [`src/common/lib/games.ts`](../src/common/lib/games.ts) — and each per-game folder exposes a `Player` alias on top of it. Same shape, sometimes enriched (tinyspy adds `seat`); the naming carries the *context*, not the type-level distinction.

> **Rule:** `Member` is the type for identity. Per game, declare `Player` (alias or extension). At the call site, the **variable name** reflects whether you're in club context (`members: Member[]`) or game context (`players: Player[]`).

Why both names exist for what's often the same shape:

- A reader scanning `ClubPage.tsx` sees `members: Member[]` and reads "people in this club" — the chat sender lookup, the member-list rendering, the setup-form's "who picks first?" picker. Club-wide.
- A reader scanning `wordknit/components/GuessHistory.tsx` sees `players: Player[]` and reads "people playing this game." The shape is the same as `Member[]` but the variable signals "this is a strict subset — only the friends who joined this game's `game_players` row."

The per-game `Player` alias earns its keep even when it's a pure re-export:

```ts
// wordknit/hooks/useGame.ts (and psychicnum/hooks/useGame.ts)
import type { Member } from '../../common/lib/games'
export type Player = Member

// tinyspy/hooks/useGame.ts
import type { Member } from '../../common/lib/games'
export type Player = Member & { seat: 'A' | 'B' }
```

Why every game declares one — even the pure-alias case:

1. **Cross-game pattern parallel.** A reader scanning per-game folders sees the same `Player` symbol everywhere. They don't have to remember "tinyspy uses Player but wordknit uses Member" — every game's vocabulary is the same.
2. **Future-proofing.** When wordknit grows per-player game state (a "tile-rate-of-correct" stat, a "you're it" turn marker), the type is already named. No cascade rename from `Member` → `Player` across call sites.
3. **Semantic signal at the import.** `import type { Player } from '../hooks/useGame'` in a wordknit subcomponent says "this is wordknit's notion of a player" — even if the body is just `= Member`.

Where to use which:

| Context | Type | Variable name | Examples |
|---|---|---|---|
| Club listing, chat, setup forms | `Member` | `members` | `ClubPage` roster, `ChatBody.members`, `SetupBodyProps.members`, `FloatingChat.members` |
| Inside a game | game's `Player` | `players` | `useCommonGame().players`, `GamePageCtx.players`, `<PlayArea>` ctx, `<GuessHistory players={...} />`, `computePause(presentUserIds, players)` |

The one variable to be aware of: **`useCommonGame` returns `players: Member[]`** — the type is `Member` (it's the identity layer, not a per-game shape), but the field is named `players` because every consumer is in game context. Per-game components re-type as their own `Player[]` if they need the enrichment (tinyspy's seat); otherwise the rename happens at the variable-name level only.

See [`naming.md → player`](naming.md#player) for the conceptual side.

#### Peer — the perspective-relative third tier

`member` and `player` are absolute (you're in the club / in the game or you aren't). **`peer`** is the perspective-relative counterpart: another player in this game, from the viewer's POV. Use it for binaries like `isMine` / `isPeer` and phrasings like "a peer disconnected," "peer-colored frame," "broadcast reaches all peers."

When the code wants to discriminate "is this me or someone else in this game?", reach for `peer` rather than generic `other` — `isPeer` reads as "another participant" without further context; `isOther` reads as "other what?" The vocabulary tier:

| word | scope | perspective | type-level? |
|---|---|---|---|
| `member` | a person in a club | absolute | yes — `Member` |
| `player` | a person in a game | absolute | yes — per-game `Player` |
| `peer` | another player in this game, from my POV | viewer-relative | no — a usage convention, not a type |

`peer` doesn't get its own TypeScript symbol. It's how you *talk about* a Player[] when the viewer is the implicit subject. The relationship lives in variable names (`isPeer`, `peers`, `peerCount`) and prose (docstrings, CSS comments), not in a `type Peer = …`. See [`naming.md → peer`](naming.md#peer) for what does and doesn't qualify as a peer concept.

#### Other casing rules

| kind | convention | examples |
|---|---|---|
| Function names, function parameters, local variables | camelCase | `enterGame`, `gameId`, `resolvedIds` |
| React component names | PascalCase | `ClubPage`, `PlayArea` |
| Module-level constants | SCREAMING_SNAKE_CASE | `GAMETYPES`, `STATUS_LABEL` |
| File names — components | PascalCase | `PlayArea.tsx`, `GamePage.tsx` |
| File names — hooks, lib, db handles | camelCase | `useGame.ts`, `cls.ts`, `db.ts` |
| File names — docs | kebab-case | `code-conventions.md`, `cheatsheet.md` |

### Avoid `SELECT *`

> Every `.from('foo').select(...)` should pass an explicit column list. Don't reach for `.select('*')`.

The reasoning, in order of weight:

1. **Fail-closed on new columns.** When a new column lands on a table, we want the build to break at every consumer that hadn't decided what to do with it — not for the column to silently flow through to the FE. Explicit lists give that: the next `npm run types:gen` widens the table's `Row` type but our selects, narrowed via `Pick<Row, …>`, stay scoped to what the consumer actually needs.
2. **Security defense-in-depth.** A future sensitive column added without a column-level grant would leak through `select('*')`. With explicit lists, the leak requires a deliberate edit. The DB-level grant is the lock; the explicit list is "I'm not even reaching for the doorknob."
3. **Reader clarity.** The select call documents which fields the consumer cares about. You don't have to grep through the codebase to know whether a removable field is actually load-bearing.

The pattern we use:

```ts
// Narrower than Database[...]['Row']. Adding a new column to
// common.clubs requires explicitly listing it here AND in the
// select() below.
type ClubRow = Pick<
  Database['common']['Tables']['clubs']['Row'],
  'id' | 'handle' | 'name'
>

const { data } = await commonDb
  .from('clubs')
  .select('id, handle, name')
  .eq('handle', handle)
  .maybeSingle()
```

The narrow type + matching select string is the lock. The type alias and the column-list string have to drift together; TS catches mismatches at build time.

#### Exceptions

A `select('*')` is OK if (a) the consumer truly uses every column AND (b) the table is unlikely to grow sensitive columns. In practice that's a rare combination — when in doubt, list them.

#### Concrete avoided-leak example

If we'd let `select('*')` ride on `common.messages` and later added an `ip_address` column for moderation, every `useClubChat` consumer would have started shipping IPs to every signed-in member of the club. The explicit `select('id, user_id, content')` pattern means that doesn't happen until someone adds `ip_address` to the list intentionally.

### Naming and commenting hook callbacks

Two related rules, both motivated by the same problem: inline arrow callbacks in `useEffect` / `useCallback` / `useMemo` have no name, so a reader has to puzzle through the body + dep array to understand what each one does and what triggers it.

#### Header comments

Every non-trivial effect gets a brief header comment **above** the `useEffect(…)` call (not inside the callback body), so the comment is in scope of the deps array. The comment leads with intent and explains the dep choice when it's non-obvious. Examples:

```ts
// Subscribe to auth state for the component's lifetime. Empty deps
// = the subscription lives across every re-render and is torn down
// only on unmount.
useEffect(() => { ... }, [])

// Load the caller's username. Dep is the user id (not the full
// session object), so background token refreshes — which return a
// new Session reference with the same user — don't trigger a refetch.
useEffect(() => { ... }, [session.user.id])
```

The deps array is often the subtlest part of an effect — `[id]` vs `[session]` vs `[]` are very different rules — so when the choice isn't obvious, the comment should say *why* this dep, not just *what* the effect does.

The same applies to `useCallback` and `useMemo` when their bodies are non-trivial.

#### Named function expressions for non-trivial callbacks

The core question this rule is answering: **is there already a name on the callback?** A `const sendSuspend = useCallback(() => {…})` already carries the name `sendSuspend` — readers see it on the scan, docstrings can reference it, future-you's "I remember this one, skip" anchor lands on it. A `useEffect(() => {…})` has no such anchor; it's just "the third effect in the file."

So the rule splits by where the name already lives:

**`useEffect` — name it, when non-trivial.**

```ts
// Join this game's shared Realtime room: load the row + roster,
// attach the postgres-changes / broadcast / presence handlers,
// subscribe, and assert current-view on connect.
useEffect(function joinGameRoom() {
  // ... 40 lines of channel setup ...
}, [gameId, session.user.id])
```

The named function expression is the only place a useEffect callback gets a name. Without it, stack traces, React DevTools' Hooks panel, prose cross-references, and the file-scan all see `<anonymous>` / "the third effect." With it, all four pick up the name.

**`useCallback` / `useMemo` assigned to a `const` — skip the inner name.**

```ts
// Yes
const sendManualPause = useCallback(() => { … }, [deps])

// No — redundant
const sendManualPause = useCallback(function sendManualPause() { … }, [deps])
```

The const name labels it for the scan, for prose ("the `sendManualPause` callback"), and — in practice — for stack traces (V8 doesn't propagate the const name through the `useCallback(…)` call expression onto the inner arrow's `.name`, but source-position info in modern stack traces and React DevTools' own labelling close most of the gap). Writing the name twice adds noise without a matching read-time win.

The one exception: if the *callback's* most natural name genuinely differs from the *const's* most natural name — e.g. `const doFooOnInitialLoad = useCallback(function doFoo(){…}, [initialLoad])` where the outer name carries the *when* and the inner carries the *what* — name the inner. Rare in practice; don't reach for it without a real difference.

**`useCallback` / `useMemo` NOT assigned to a const** — passed inline as a JSX prop, returned directly, etc. — goes back to the useEffect rule: name it when non-trivial. Same reasoning: no surrounding const to carry the name.

**Why naming helps even when a header comment exists.** A good name is *scannable* — you remember it from last time and can decide "engage or skip" in a single glance. A header comment requires re-reading to pick up the same signal. Comments explain; names label. The two pull different weight in the read.

**Why naming helps even when no header comment exists.** Picking a 2–3 word name is a tiny version of the "if you can't name it, you don't understand it" rule — it catches the "this effect is doing three things, I should split it" case before the body is written.

**When NOT to bother:** short, drop-dead-obvious bodies. One-liners, document-title setters, trivial derived values. If the body fits in a glance and the deps tell you everything, naming adds noise. Rule of thumb: *"if it deserves a header comment, it deserves a name."* Short obvious bodies need neither.

This sits next to a pattern already in the codebase: the inner helper `async function load() { … }` inside the subscription effects in `useCommonGame` and the per-game `useGame` hooks. We already pick named function expressions over `const load = async () => {…}` for inner helpers because the name reads as a label. The convention now extends to the top-level useEffect callback by the same logic.

**Scope of this rule:** `useEffect`, `useCallback`, `useMemo` (and their custom-hook analogues, if any appear). Not `.then(…)` chains, `setTimeout`, event-handler JSX props (`onClick={() => …}`), or `.map`/`.filter`/`.reduce` callbacks — those tend to be short and the call site already labels them by context. The rule is deliberately narrow; if it earns its keep here, we can revisit widening it later.

## Edge Functions

Edge Functions live in a **flat namespace** at the Supabase project level — they don't get schemas. So they're the one place we use a game-prefixed name:

| pattern | example |
|---|---|
| `<game>-<feature>` | `tinyspy-suggest-clue`, future `boggle-validate-board` |
| `common-<feature>` | future `common-send-invite-email` (cross-game) |

This matches the directory: `supabase/functions/tinyspy-suggest-clue/index.ts`.

## Known gotchas

### Cross-schema embeds (PostgREST)

PostgREST's schema cache only discovers FK relationships **within a single schema** (the parent's schema). Cross-schema FKs like `tinyspy.games.user_a_id → common.profiles.user_id` exist in Postgres and `[api].schemas` exposes both ends — but the embed syntax still fails:

```ts
// This DOES NOT work cross-schema, even though the FK exists:
supabase.schema('tinyspy').from('games')
  .select('id, user_a_id, profiles(username)')
// → PGRST200 "Could not find a relationship between 'games'
//             and 'profiles' in the schema cache"

// The !fkname hint syntax doesn't rescue it either — same error.
```

**Workaround:** fetch the two sides in separate queries and merge in JS. For small result sets (≤ 2 players, a few-dozen members) the extra round trip is fine. [`src/tinyspy/hooks/useGame.ts`](../src/tinyspy/hooks/useGame.ts) is the canonical example — read the inline comment there for the diagnostic story.

If a query genuinely needs server-side joining of cross-schema data (e.g. a complex roster + scores + history view), prefer a `security definer` RPC that does the join in SQL and returns a single payload, rather than fighting the embed layer.

This limitation has implications for table design: cross-game features that want PostgREST embeds need their referenced tables in the same schema as the queries. It's another argument for the "shared UI, per-game data" pattern — keep tables co-located with the queries that join them.

### Cross-schema TypeScript types

`supabase gen types` produces a `Database` type with a top-level key per exposed schema. `supabase.schema('tinyspy').from('words')` is fully typed against `Database['tinyspy']['Tables']['words']`. Same for RPCs.

If you add a new schema, also:

- Add it to `[api].schemas` in `supabase/config.toml`.
- Re-run `npm run types:gen` so the FE picks it up.
- **Restart the local stack: `supabase stop && supabase start`.** Note that `npm run db:reset` is NOT enough — it replays migrations and restarts containers, but doesn't re-read `config.toml`. PostgREST will keep its prior exposed-schemas list and reject calls to the new schema with PGRST106 ("Invalid schema: foo"). The full stop/start is required to make the new `[api].schemas` value take effect.
