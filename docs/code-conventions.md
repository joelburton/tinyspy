# Code conventions

How we write code in this repo. The cross-cutting rules that aren't tied to any one gametype. Read this before writing or reviewing code in `src/` or `supabase/`.

For terminology and the architectural backdrop see [`naming.md`](naming.md). For feature-specific conventions see [`codenamesduet.md`](games/codenamesduet.md), [`psychicnum.md`](games/psychicnum.md), [`common.md`](common.md), and [`testing.md`](testing.md).

## Code clarity & docstrings

The explanation bar in this codebase is higher than the average TypeScript project — see [`../CLAUDE.md → Educational priority`](../CLAUDE.md#educational-priority--clarity-over-brevity) for the prior. What that looks like in practice:

- **Docstrings on every exported function, component, hook, and RPC.** Explain what it does, why it exists, and any non-obvious constraints. The codenamesduet RPCs in [`supabase/sql/codenamesduet.sql`](../supabase/sql/codenamesduet.sql) and components like [`src/codenamesduet/components/CluePanel.tsx`](../src/codenamesduet/components/CluePanel.tsx) are the model — generous prose, examples, references to related pieces.
- **Code comments where the WHY isn't obvious.** Design decisions, subtle invariants, non-obvious trade-offs ("we refetch on SUBSCRIBED because broadcasts can be missed during reconnect"), workarounds for specific platform behavior.
- **The `/**` marker belongs to docstrings alone; a note inside a structure or a body takes `//`.** A docstring documents a file, a type, a structure or a function — it answers *should I read this, and how do I call it* — and the editor lights it up so that question can be answered by scanning. A note about one field, one statement, or why the body is written the way it is answers a different question, and taking the docstring marker for it destroys the signal: everything on screen looks like something you must read first. `//` is preferred; `/* */` is fine. This is also how a docstring stays short — when a paragraph explains why the implementation is what it is, it belongs on the line it defends, inside the function, not in the docstring a caller reads. [`dbLog.ts`](../src/common/lib/supabase/dbLog.ts) is the model: `logSlow`'s "omitted beats empty" and `logDb`'s "built ONCE and shared" sit in the bodies, and `TransportFacts.detail`'s note is `//` like every other field's.
- **Names describe role, not implementation.** `isClueGiver` not `playerA`. See [`naming.md`](naming.md) for the terminology lexicon.
- **Prefer one clear path over a clever one.** A few extra lines of straightforward code beat a tight expression that requires the reader to pause.
- **Extract a small helper over a deeply-nested ternary.** A single `a ? b : c` is fine; two-or-more-deep nests almost always read better as a small function with `if` branches — each case lands on its own line, picks up a name (or at least a local variable), and survives a future tweak without re-balancing the whole expression. See [`psychicnum/manifest.ts → labelFor`](../src/psychicnum/manifest.ts) for the model: a 3-deep ternary refactored into a 6-line helper. The only reason to keep the ternary inline is a measured hot path where allocating the helper actually shows up in a profile — and there are no such hot paths in this codebase today.
- **A comment about a SHARED concept shrinks to a reminder and a pointer.** Where a comment explains what an envelope, an outcome or a severity *is*, one line and the name of the doc beats a paragraph — the doc is the one copy, and prose in five files drifts from it silently. Where a comment explains what *this code* does, it stays, and the bar above is unchanged. The tell is whether editing the doc would make the comment wrong.

  ```ts
  /* three paragraphs on what `field` means */  →  field: string | null  // which input; '_' = not one field
  ```
- **A lookup table's name says what it maps, and what the values ARE.** `DB_LOG_KIND_TO_CONSOLE_LOG_METHOD`, not `KIND_METHOD`; `SEVERITY_TO_DB_LOG_KIND`, not `NOT_OK_KIND`. The house form is `FOO_TO_BAR`, spelled out: `_TO_METHOD` only parses for a reader who already knows the values are `console`'s own method names, which is the thing worth saying.
- **No single-letter helpers**, even for a formatter used twice on the next line. `fieldValue` and `quotedText` each carry a docstring saying what "empty" means for them — which is the only interesting thing about either, and exactly what `v` and `q` hid.
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
| `codenamesduet`, `psychicnum`, `<game>` | One schema per gametype; that game owns its tables, RPCs, and policies inside it. |

**Search path:** `extra_search_path = common, public, extensions`. Game schemas are deliberately *not* in the search path — every game reference is fully qualified (`codenamesduet.games`, `psychicnum.games`) in SQL, and goes through `supabase.schema('<game>')` in the FE.

The payoff: each game gets a clean namespace. codenamesduet and a hypothetical Boggle can each have a `words` table named just `words`. The fact that you had to say which game it was tells you which one you're touching.

### Tables and columns

- Tables describe their role within their schema. **No game prefix.** `codenamesduet.words`, not `codenamesduet.codenamesduet_words`.
- `snake_case` for tables and columns.
- Plural for tables (`games`, `words`, `messages`).
- FKs use `<thing>_id`: `game_id`, `user_id`, `club_handle`. Self-referential or ambiguous ones get a role prefix: `next_game_id`.

### RPC functions

- Live in the schema they operate on. codenamesduet RPCs are `codenamesduet.create_game`, called via `db.rpc('create_game')` where `db = supabase.schema('codenamesduet')`.
- Cross-game / shared RPCs live in `common`. A `common` RPC may not reference any game schema; if it would need to, it belongs in the game.
- Naming describes the verb: `create_game`, `submit_guess`, `send_message`. No `codenamesduet_` prefix — the schema carries that.
- All callable RPCs are `security definer` with an explicit `set search_path = <game>, common, public, extensions`. The pinned search path neutralizes search-path hijacking; without it, a malicious unqualified table-reference inside the function could resolve against an attacker-controlled schema.

### RLS helpers

The membership check that all per-game RPCs use is `common.require_game_player(target_game)` — it reads `common.game_players` (the cross-game roster the common layer maintains) and either returns the caller's `user_id` or raises. The game-specific RPCs then derive seat / role from per-game state once authorization has passed; e.g., `codenamesduet.submit_guess` reads the games row and pattern-matches `caller_id` against `user_a_id` / `user_b_id` to set `caller_seat`.

For SELECT-policy gating, games use `common.is_club_member(club_handle)` — the per-game game-id check would require querying the per-gametype games table from inside common, which is exactly the cross-coupling the removability rule forbids. Club-membership is a coarser predicate (any club member can read any of the club's games) but adequate under the friends-only trust model.

Helpers are marked `STABLE` so Postgres can cache the result within a single SELECT. RLS policies invoke the helper once per row; without `STABLE` that becomes the dominant cost on any non-trivial query.

### SECURITY DEFINER helper + security_invoker view

When you need to expose a column the calling role can't see directly, gated on row state (e.g., "reveal the answer once the game ends"), reach for this two-layer shape:

1. Keep the column-level grant on the base table — the role can't SELECT the column. (Storage-layer lock.)
2. Write a `SECURITY DEFINER` helper that reads the column and returns it conditionally based on row state. Running as `postgres`, it bypasses the column grant.
3. Define a view `with (security_invoker = true)` that calls the helper for the gated column. The `security_invoker` flag means RLS on the base table still gates row visibility *as the caller* — so unauthorized rows stay hidden.
4. Point the FE at the view, not the base table.

Canonical example: `psychicnum.games_state` + `psychicnum._secrets_for(uuid)` — see [`psychicnum.md` → The hidden-secrets mechanic](games/psychicnum.md#the-hidden-secrets-mechanic).

### Every function gets an explicit revoke

Postgres grants EXECUTE **to PUBLIC by default** on every new function, so a helper is world-callable unless its file says otherwise (functions and their grants live together in `supabase/sql/<game>.sql` — [supabase.md → Schema vs code](supabase.md#schema-vs-code)). The default is backwards for us, so the pair goes right after each definition:

```sql
revoke execute on function <schema>.<fn>(<types>) from public;
grant  execute on function <schema>.<fn>(<types>) to authenticated;  -- ONLY if the caller runs it
```

The **grant** is for functions the *caller* executes: player-facing RPCs, plus the few helpers reached through an RLS policy or a `security_invoker` view. A policy runs as the invoker, so `common.is_club_member` genuinely needs it — revoke it without granting and every club-scoped SELECT fails. Everything else is called from inside a `security definer` function, which runs as the owner and needs **no grant at all**; a `_`-prefixed helper with a grant should be able to name the view or policy that forces it.

Pinned by `tests/common/function_grants_test.sql`, which fails if any function in an app schema is executable by PUBLIC. That guard exists because forgetting the revoke *silently widens* the surface — 27 helpers had drifted this way before the 2026-08-02 sweep, `scrabble._finish` (which unconditionally terminates a game) among them. Not a live exposure under RLS + friends-only, but defense in depth is cheap when the check is one query.

### Migration filenames

Pattern: `<timestamp>_<schema>[_<topic>].sql`. The schema-prefix-in-filename gives per-schema grouping without nested directories.

While we're still building (no real deploys yet), each schema is **squashed to a single final-state file** — one per concern — because that's far easier to read than a pile of incremental deltas:

```
20260615000000_common.sql
20260615000001_codenamesduet.sql
20260615000002_psychicnum.sql
20260615000003_connections.sql
20260617000000_spellingbee.sql
20260623000000_bananagrams.sql
20260624000000_waffle.sql
20260625000000_wordle.sql
20260626000000_stackdown.sql
20260627000000_scrabble.sql
20260628000000_boggle.sql
20260706000000_crosswords.sql
```

These are **frozen** — one baseline per game plus `common`, never edited again. A shape change appends a new topic delta instead, because `supabase db push` skips any migration prod has already recorded (CLAUDE.md → "Production software"). The switch was made around 2026-08-13:

```
# how shape changes land now:
20260720000000_codenamesduet_add_difficulty.sql
20260721000000_common_add_friends.sql
```

Cross-schema FKs (game → common) need `common.*` to exist first, which timestamp ordering handles naturally.

### Per-game player counts

Each gametype's supported player-count range is declared in **two places**:

- The TypeScript manifest's `numberOfPlayers: [min, max]` field (consumed by the shell to decide whether a "Start X" button is enabled/disabled/hidden for a given club). Both ends required; `null` upper bounds aren't allowed — every game gets a hard cap so the FE rendering, realtime channel load, and chat surface stay bounded.
- The `create_game` RPC's member-count check (the hard server-side gate that rejects mismatched calls). Every open-N game shares `common.require_player_count_max(player_user_ids, max)` — that's all of them except codenamesduet, which is fixed at exactly 2 and keeps its inline check.

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

### Reserved coop-turn setup keys

Two setup keys are a **common convention** any coop game can adopt to opt into turn-by-turn play (see [`common.md` → Turn-order](common.md#turn-order--opt-in-turn-by-turn-for-coop-games) for the mechanism):

- `setup.coop_style: 'turns' | 'free-for-all'` — the pacing choice (default `'free-for-all'`). It **DOES round-trip** as a `default_setup` — "we like taking turns" is a reusable club preference.
- `setup.first_turn_user_id: string (uuid)` — who goes first. It is **stripped from `default_setup`** server-side in each game's `create_game` (`setup - 'first_turn_user_id'`), exactly like codenamesduet strips `first_clue_giver_user_id`: a specific person isn't a reusable club preference — the club default should remember the *style*, not who happened to go first last time.

This is the general rule for what makes it into the saved default: **style/mode preferences round-trip; specific-person picks don't.** The per-game `create_game` controls what's passed as the `saved_default` argument to `common.create_game`, so it does the strip. The shared `SetupCoopStyleSection` writes both keys; only `coop_style` survives into `common.clubs_gametypes.default_setup`.

### Realtime channel names

Pattern: `<topic>:<id>:<unique>`, e.g.:

- `game:<game_id>` — the shared cross-cutting channel opened by `useCommonGame`. Stable name (no UUID suffix) because presence + manual-pause broadcasts must merge across every connected client. StrictMode handled by the hook's own `removeChannel` cleanup. Every gametype's `useCommonGame` opens this.
- `<gametype>:<game_id>:<uuid>` — the per-tab postgres-changes channel each per-game `useGame` opens. UUID suffix sidesteps supabase-js's StrictMode-cache bite; postgres-changes don't need to merge across clients so per-tab rooms are fine.
- `connections:<game_id>` — connections's stable channel for shared-selection Broadcast events (select / deselect / clear). Stable for the same reason as `game:<game_id>` — broadcast events need to merge across clients.
- `club-active:<club_handle>:<uuid>` — club active-game pointer
- `club-chat:<club_handle>:<uuid>` — club chat messages

The per-effect-run UUID suffix is mandatory: `supabase-js` caches channels by name, and React StrictMode runs effects twice on mount. Without a unique suffix, the second `.on()` chain would target an already-subscribed cached channel and throw. See [`useGame.ts`](../src/codenamesduet/hooks/useGame.ts) for the canonical example.

### Realtime data hooks — two patterns

Two shapes recur across the per-game data hooks, and the choice between them is driven by **whether the hook needs Realtime Broadcast**, not by hook-size or game complexity. Pick by mechanism; don't mix them.

#### Pattern A — refetch-only via `useRealtimeRefetch`

For hooks that subscribe to postgres-changes and refetch on any event. The recurring shape — initial load → postgres-changes subscription → SUBSCRIBED-driven refetch on reconnect → attach-confirmation refetch (the deaf-window closer, [`postgresAttached.ts`](../src/common/lib/supabase/postgresAttached.ts) / [realtime-lost-events.md](realtime-lost-events.md)) → cleanup — is factored into [`useRealtimeRefetch`](../src/common/hooks/realtime/useRealtimeRefetch.ts). Canonical calls:

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

The `tables` field accepts one subscription or an array — psychicnum's useGame subscribes to `games` AND `guesses` with the same `load()`; codenamesduet splits across three hooks (`useGame`, `useBoard`, `useClues`) each with its own factory call. Either shape is fine; the deciding question is whether the PlayArea component splits the data the same way.

The channel name is UUID-suffixed (`<prefix>:<id>:<uuid>`) — every peer's tab gets its own room. That's safe because there's no peer-coordination state on this channel.

Tested at [`useRealtimeRefetch.test.ts`](../src/common/hooks/realtime/useRealtimeRefetch.test.ts) — initial load, SUBSCRIBED refetch, attach-confirmation refetch (+ its not-ok filter), event refetch, multi-table fan-in, `id`-change channel rebuild, cleanup mounted-guard, ref-trick (caller-fresh-load-each-render doesn't thrash the channel).

#### Pattern B — broadcast-coupled, hand-rolled, single stable-name channel

For hooks that need to **send and receive Broadcast events between peers** (selection sharing, manual-pause, suspend-cascade, future scratchpad-takeover-lock, etc.). Broadcast peers only see each other when they share a channel name, so the channel name has to be stable across peers (no UUID suffix). Once that channel is open, postgres-changes ride along on it — opening a second UUID-suffixed channel just for postgres-changes would split one coherent hook into two coordinating effects with no functional gain.

Canonical examples:
- [`common/useCommonGame`](../src/common/hooks/game/useCommonGame.ts) — stable `game:${gameId}` channel carrying presence, manual-pause Broadcast, suspend Broadcast, AND postgres-changes on `common.games`.
- [`connections/useGame`](../src/connections/hooks/useGame.ts) — stable `connections:${gameId}` channel carrying the shared-selection Broadcast (`select` / `deselect` / `clear`) AND postgres-changes on `connections.{games, guesses}`.
- [`common/useClubPresence`](../src/common/hooks/realtime/useClubPresence.ts) — stable `club:${handle}` channel carrying **only Presence** (no broadcast, no postgres-changes): every connected member of the club orbit announces whether they're on the club page or viewing a game. It's the leanest Pattern B instance — still Pattern B because presence rosters are keyed per-channel-name, so the name must be stable across peers (rule 2 below). Drives the member-strip dots and the abandoned-current-view heal; see [`docs/states.md`](states.md).

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

Reconnect semantics for the broadcast side fall out naturally: broadcasts during a disconnect are lost, but the project's pause-on-disconnect pattern (see [`docs/connections.md → Pause`](games/connections.md#pause-presence-driven--manual)) freezes the game while anyone's missing — no broadcast traffic happens while disconnected, so nothing's missed. Postgres-changes on the same channel still get the SUBSCRIBED-refetch recovery via the `.subscribe()` callback.

#### Choosing between A and B

Decision rule when porting a new game:

1. **Does this hook send or receive Broadcast events?** If yes → Pattern B. If no → Pattern A.
2. **Does this hook track Presence?** If yes → Pattern B (presence rosters are per-channel-name, same constraint as broadcast).

Mixing — Pattern B for broadcast + a separate Pattern A call for postgres-changes — adds a second channel per peer with no functional gain and breaks the "one hook, one channel" mental model. Don't.

#### Append-on-event exception — and the merge rule it requires

[`useClubChat`](../src/common/hooks/chat/useClubChat.ts) is hand-rolled in a third shape: postgres-changes on `common.messages`, but the INSERT handler **appends the new row to local state** instead of refetching. That's a meaningful optimization for chat-heavy moments where refetching on every message would be wasteful. It's the only consumer of this shape; new game hooks shouldn't copy it unless they have the same volume profile.

**If you append on INSERT, the SUBSCRIBED refetch MUST merge — never `setX(data)`.** A wholesale replace races with the append: a row that arrives via INSERT *after* the refetch's query snapshot but before it resolves gets clobbered, and nothing re-adds it. (This shipped — two messages in quick succession left the unread badge stuck at "1," and the chat e2e failed ~90% under repeat-each stress.) The refetch instead **unions** the snapshot with any rows appended since (they're newest by construction — the table is append-only, so a row absent from a fresh full snapshot was inserted *after* it), and the INSERT append **dedupes by id** against a row a concurrent refetch already picked up. Regression-tested in [`useClubChat.test.ts`](../src/common/hooks/chat/useClubChat.test.ts) ("does not drop a live-appended message when a stale refetch lacks it").

The rule in one line: **append-on-INSERT ⇒ merge-on-refetch** (dedupe by id, keep appended-since rows); **refetch-everything ⇒ replace is fine** (Pattern A has no separate append to clobber, so its `load` can `setX(data)` freely). The two other places that build state incrementally already follow the merge/prune form and so are safe: [`useGameInvitations`](../src/common/hooks/game/useGameInvitations.ts) (its `load()` adds only deduped-new invites, never replaces) and [`stackdown/useGame`](../src/stackdown/hooks/useGame.ts)'s optimistic `pendingRemoved` (the refetch *prunes* confirmed ids out of `prev` via `filter`, never replaces).

## Frontend

### Folder layout

Feature-first. Each game is a self-contained folder; shared pieces live in `common/`. See [`common.md`](common.md) for the directory tree.

### Component names

Roles, not implementations:

| role | name | shared or per-game? |
|---|---|---|
| The route-level shell every game mounts inside (header / pause / chat) | `GamePage` | shared (`common/components/`) |
| The gametype-specific play surface, mounted inside `<GamePage>` at the route level via the manifest's lazy `PlayArea` field | `PlayArea` | per-game |
| The gametype-specific setup form mounted inside the common `SetupGameModal` | `SetupForm` | per-game |
| End-of-game info-column row | `TerminalActionRow` | shared (`common/components/game/terminal/`); per-game callers pass the `TerminalCopy` their `buildOver()` returns + any extra terminal actions as children |
| Reused chat surface | `Chat` | shared, mounted once by `GamePage` |
| Auth gate | `LoginScreen` | shared |

A game's main screen is `PlayArea.tsx` whether it has a literal grid (codenamesduet) or just a text input (psychicnum). The role is "the place where the gametype-specific play happens"; cross-cutting chrome (title, timer, Pause, Back-to-club, pause overlay, chat) belongs to `<GamePage>`, not to the per-game PlayArea.

**File name matches component name; folder context disambiguates same-named components across games.** `src/connections/components/PlayArea.tsx` exports `PlayArea`; `src/codenamesduet/components/PlayArea.tsx` also exports `PlayArea`. Same rule for `SetupForm.tsx` — the folder tells you which game's PlayArea or SetupForm you're looking at, the file/export name stays role-named. No `ConnectionsPlayArea` / `CodenamesduetSetupForm` prefixes anywhere.

### A module styles its own elements

CSS Modules is a **build-time** rename, not a browser feature: `.row` in a
`*.module.css` ships as `._row_1f3ab_18`, and `styles.row` is that string. The
scoping is just uniqueness of names — nothing enforces it.

`:global()` opts out of the rename, and the build strips it entirely, so
`:global(.item-row) { … }` written inside `ClubPage.module.css` ships as plain
`.item-row` and restyles the homepage too. Where the rule sits gives it no scope
at all.

The rule is about the selector's **subject** — its rightmost compound, which is
what actually gets styled:

```css
:global(.item-row)            { … }   /* ✗ styles every item-row in the app */
.gamesList :global(.item-row) { … }   /* ✓ scoped by a local ancestor      */
:global(.dragging) .row       { … }   /* ✓ subject is local                */
```

A guard in [`cssTokens.test.ts`](../src/guards/cssTokens.test.ts) fails on the
first form.

**Prefer a local class on the element even where the scoped form is legal.** An
override that sits on the element it affects is visible next to everything else
about that element, and having to write it is useful friction — it makes you ask
whether the shared pattern wants a variant instead. The scoped form's one real
advantage is specificity: `.gamesList :global(.item-row)` is (0,2,0) and beats a
pattern's (0,1,0) on weight, where a bare local class ties at (0,1,0) and wins
only because module CSS loads after `patterns/`.

**A class name says what the thing IS, not what slot it sits in.** `.body` is
the worst offender: body of *what*? — and everyone's default reading is the
page's `<body>`. Ten classes are called `.body` today. Nine of them agree on a
real concept (a panel's content area, as opposed to its header) and want a name
that says so; ClubPage's was the two-column region and is now `.columns`, which
names the thing rather than the slot. The same test catches `.wrapper`,
`.content` and `.card` when they're doing a specific job.

**A component's own module may use short names; a CONSUMER's may not.** Inside
`FilterSelect.module.css` the file *is* the subject, so `.label`, `.option`,
`.dot` and `.popover` all read as "of the filter select". In a 200-line page
module about lists, columns, tabs and filters, `.label` reads as "label of…
something" and you have to go find out. So a class a consumer passes INTO a
shared component names the component: `.filterSelectLabel`, not `.label`.

A name that already carries its own subject is fine unqualified — `.closedSelect`
says what it is from either side, which is why the same name is used in
`FilterSelect.module.css` and in the club page's module: two locals on one
element, and the match is what says so.

Measured 2026-08-21: `<Dot>` is the common case — ten consumer modules style it
as a bare `.dot`, while others already qualify (`greetingDot`, `playerDot`,
`rosterDot`, `actorDot`, `itemDot`, `bonusDot`). Same for `<ShuffleButton>`
(`.rackShuffle`, `.floatingRotate` — good) and `<MoveRow>` (`.moveRow`).

**Don't give a local class a global's bare name.** `styles.button` beside
`'button'` on the same element are two unrelated classes that look like one; a
modifier should say what it modifies (`.saveButton`, not `.button`).

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

2. **If two games need similar-but-meaningfully-different implementations, name them similarly.** Use the same role-noun (`PlayArea`, `SetupForm`, `GameTurnLog`, `Help`) across games even when the bodies diverge. A reader scanning the tree should see the common idea by sight; folder context disambiguates which game's implementation they're in. Resist gametype-prefixing names (`CodenamesduetPlayArea`, `ConnectionsSetupForm`) — the folder already says which game.

The reason both rules matter: this codebase is shaped to host a roster of games (the original ~7–8 target has since been exceeded — sixteen are live), most of them ports of games that exist in other stacks. The faster a reader can pattern-match "ah, this is the connections version of the same thing codenamesduet does," the cheaper porting work becomes. Both extracting-when-similar AND naming-similarly-when-different serve that goal — the first by reducing duplication, the second by making the parallels legible when duplication is the right call.

#### Per-game `useGame` shape — pick the right template

When porting a new game, the per-game `useGame` hook's shape depends on whether the game has fixed seats:

- **Fixed-seat games** (codenamesduet is the example: two players, identified by columns `user_a_id` / `user_b_id`): the hook **fetches its own roster**. The seat ⇄ user_id mapping is intrinsic to the per-game row, so the roster has to be loaded alongside the game data — no upstream component can pre-compute it. The hook also fetches profiles (cross-schema) to embed usernames; the canonical example is `src/codenamesduet/hooks/useGame.ts`.
- **N-player open games** (psychicnum, connections are the examples: any number of players, no per-seat identity): the hook **reads the roster from `GamePageCtx`** (the `players` field provided by `<GamePage>` via `useCommonGame`). No need to re-fetch — the common-side hook has already loaded `common.game_players` + profiles. The per-game hook stays focused on its game-specific tables.

The decision rule is mechanical: "does this game's per-row state name specific seats?" If yes, fixed-seat template; if no, open template. Don't mix — an N-player game that fetches its own roster duplicates work `useCommonGame` already did; a fixed-seat game that reads from `GamePageCtx` would have to wait for the upstream load before its own data makes sense.

Concrete examples in the tree today:
- Shared: `<GamePage>`, `<PauseBoundary>`, `<Chat>`, `<SetupTimerSection>`, `<ClubGameCard>`, `<StartGameButtons>`, `<SuspendConfirmationBlockingModal>`, `useCommonGame`, `useGameTimer`, `useHistoryViewer`.
- Same name, per-game body: `PlayArea` (every game), `BoardCol` / `InfoCol` (every standard two-column game — see the decomposition note below), `SetupForm` (every game), `Help` (every game), `useGame` (every game), `GameTurnLog` (all eight turn-log games; its "whose turns?" header dropdown is the shared [`useTurnLogPlayerPicker`](../src/common/hooks/game/useTurnLogPlayerPicker.tsx) — **every** turn-log game carries it, on one vocabulary, and it brings the filter, the `#N`-handle gate and the honest RLS-hidden empty line with it; see [playarea.md → Whose turns?](playarea.md#whose-turns--the-shared-player-picker) — the turn-log component was unified on this name, retiring stackdown's `FoundWords` and scrabble's `PlayLog`), `lib/history` (the six games with a turn-history viewer — scrabble is the exception, its replay is `boardUpToSeq` in `lib/play.ts`).
- Extracted-to-common after recurrence: `TerminalActionRow`, `ChatButton`, `PageHeaderPlayersStrip`, `PageHeaderStatusSlot`, `Menu`, `PauseButton`, `GameLogo`, `PuzpuzpuzLogo` — each used by multiple call sites with the per-game variability flowing through props.

#### PlayArea decomposition — `BoardCol` / `InfoCol`

A `PlayArea` grew too big to hold in your head (most were 450–900 lines), so every
standard two-column game now splits it into three layers with one consistent recipe:
a **`BoardCol`** (the live input engine — drag / cursor / keyboard / word-building —
plus the below-board feedback slot; it renders the game's `Board`), an **`InfoCol`**
(the info-column readouts + turn log / word list, near-zero internal state), and a
thin **`PlayArea`** that owns the game data (`useGame`), the RPCs, and cross-column
coordination (e.g. the turn-history `viewingId`). The load-bearing contract:
**`BoardCol` owns *editing*; `PlayArea` hands it the *board to show*** (live *or* a
historical snapshot) + a `readOnly` flag — which is what makes the turn-history
viewer a drop-in. **bananagrams is the exception** (its input engine spans both
columns, so it uses an engine-hook + two views instead — `usePlayerBoard` /
`BoardArena` / `HandCard`). The full recipe, the prop conventions (one shared
vocabulary across games), and the per-game deviations live in
[docs/playarea.md](playarea.md).

### Import-direction rules

Enforced by ESLint's `no-restricted-imports` (see [`eslint.config.js`](../eslint.config.js)):

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/gametypes.ts` is the **one** allowed exception — it imports every game's manifest by definition.

If you find yourself wanting to import a component from another game, that's a signal to promote it to `common/`. If a `common/` piece wants to import from a game, the abstraction is wrong — generalize the common piece (often: take a `db` handle or a render prop) so it doesn't need to know the game.

`GAMETYPES` in `eslint.config.js` is the list the rule works from, and it's **derived** — a regex over `src/gametypes.ts`'s manifest imports, cross-checked against the `src/<name>/manifest.ts` folders on disk. A new game needs no lint edit; a folder registered in neither place throws at config-load time (`npm run lint` fails with the mismatch). It's derived because a hand-maintained copy drifted twice, and drift here is silent: a game missing from the forbidden list produces no error, it just stops being guarded.

### Stable-name Realtime channels

A channel whose name IS the room — every peer must join the identical topic for
presence and broadcast to work — can't take the `channelDedupSuffix()` that the
per-client data channels use. Open and close it through
[`channelTeardown.ts`](../src/common/lib/supabase/channelTeardown.ts):

```ts
const pending = channelLeaving(room)   // null on the fast path
if (pending) void pending.then(join)   // join() must guard on a `canceled` flag
else join()
// …and in the cleanup: releaseChannel(ch), never supabase.removeChannel(ch)
```

The reason is in that module's docstring: realtime-js drops a channel from its
name cache only in the channel's own `_onClose`, so for the whole leave
round-trip `supabase.channel(sameName)` returns the dying instance — and the
server can reject a re-join that races the leave, which is why evicting the
cache wouldn't be enough on its own. Because the join can now happen *after*
the effect body returns, hold the channel in a **ref** for the cleanup to read
(state alone is too late) and bail out of `join()` if the effect was already
torn down. The registry is per channel NAME, so unrelated rooms never block
each other. Suffixed channels can't collide and keep using `removeChannel`.

### Guarding a non-idempotent action

An action whose second call does real, unwanted work needs an in-flight guard,
and the guard belongs on the **handler**, not the button. New game is the worked
example: it has three triggers (the terminal `NewGameButton`, the game-menu item,
and the global `+` shortcut), and `common.create_game` shelves the club's current
game on every call — so two calls really do make two games, the first orphaned in
the club list, with a second invitation toast to every peer. A `disabled` prop
would have covered one trigger of three.

Use [`useSingleFlight`](../src/common/hooks/ui/useSingleFlight.ts): it returns the
guarded handler plus a `pending` flag for the button's `disabled`, gates on a ref
(readable synchronously by the very next event, unlike state) and reports through
state, and clears in a `finally` so a failure stays retryable.

Don't reach for it when a state flag already gates the action — End and Concede
stop themselves once `isTerminal` / `myConceded` flips — or for idempotent calls
every client fires (`submit_timeout`). `useStandardGameActions.restart` holds its
own equivalent ref inline, since it's already inside a shared hook.

Related: `GamePage`'s global shortcut listener drops `e.repeat`, so *holding* a
key can't machine-gun a one-shot command.

### CSS Modules + theme

This section covers the *file mechanics* only. For the design philosophy — desktop-first, the two-vocabularies rule for global vs per-game tokens, what's deferred — see [`ui.md`](ui.md).

**CSS Modules**, one `*.module.css` per component, co-located with the `.tsx`:

```
src/common/components/chat/ChatBody.tsx
src/common/components/chat/ChatBody.module.css
```

**Design tokens at `:root`**, split by what they are: colors live in [`src/common/themes/daylight.css`](../src/common/themes/daylight.css) (the theme) and [`src/common/fixed.css`](../src/common/fixed.css) (member + wordle, exempt from theming); everything that isn't a color — radii, sizes, spacing, durations, the depth family — lives in [`src/common/base.css`](../src/common/base.css). Every `*.module.css` references them via `var(--token-name)`. Each game's `theme.css` (optional) declares that gametype's brand tokens.

`cls()` (in [`src/common/lib/util/cls.ts`](../src/common/lib/util/cls.ts)) is a tiny hand-rolled `clsx` equivalent for combining conditional class names. ~10 lines; no dependency.

**What we don't use:**

- Plain global `.css` files for components — fine for the global theme file, but anything component-specific should be a `.module.css`.
- CSS-in-JS (styled-components, emotion) — adds a dependency and a runtime cost for a problem CSS Modules already solve.
- Tailwind — large stylistic change from where the code is now; not worth the migration cost.
- **`composes:`** — zero uses in the repo. Classes are combined at the call site with `cls()` instead, so the composition is visible where the element is written rather than hidden in a stylesheet.

#### The CSS checklist

Six rules that are otherwise only discoverable by reading the code:

1. **No `var()` fallbacks.** Write `var(--token)`, never `var(--token, #ccc)`. We own the whole custom-property namespace, so a missing token is always a bug — and a fallback can only ever *mask* that bug while drifting out of sync with the real value. [`src/guards/cssTokens.test.ts`](../src/guards/cssTokens.test.ts) is the safety net, and it guards **both directions**: every `var()` reference resolves to a definition, and every definition has a reader. A token that's a deliberate vocabulary slot with no caller yet goes in that test's `VOCABULARY_COMPLETENESS` list — which is where the "keep the grid complete" policy is enforced rather than argued. (The `var(--client-width, 100vw)` idiom in `common/` is a different thing: an opt-in *parameter* default, not a color fallback.)
2. **Desktop-first: `@media (--mobile)` blocks override the base rule**, never the reverse. See [`ui.md`](ui.md#audience-and-platform-desktop-first) — a `min-width` media query means a rule got written backwards.
3. **A component that renders on two surfaces keeps the roomier one as its base rule.** The compressed variant is an override scoped to the surface — e.g. `[data-mobile-status] .stats { … }`, keyed off the attribute `<MobileStatusBar>` already stamps. No media query needed (the bar doesn't exist on desktop) and no `compact` prop to thread through call sites. Writing it the other way round leaks the phone's budget onto a desktop that has room to spare; see [`mobile.md`](mobile.md).
4. **State classes win by re-setting tokens, not by out-cascading.** A state (`.achieved`, `.dropOk`) should set `--tile-slot-fill-color` and let the base rule consume it, rather than restating `background` at higher specificity.
5. **Click-to-define words are pointer-only** — no `tabIndex`, no `role="button"`, no focus style. The reasoning is in [`utilities.css`](../src/common/utilities.css)'s `.definable` block. A word that genuinely needs keyboard reach gets a real `<button>`.
6. **`_variant` suffixes** name the classes behind a `` styles[`base_${key}`] `` lookup: `.outcome_won`, `.day_lost`, `.barInner_good`, `.viewedTile_oneAway`, `.guessWord_G`. Base name, underscore, the key's value. The underscore is what marks a class as *dynamically* selected — grep it to find every class that isn't referenced literally anywhere.

#### The z- layers

**The layers are named, and they live in [`base.css`](../src/common/base.css) → "THE Z- LAYERS".** Read a token; never write a page-level number. This is a stacking *order*, not a scale — its failure mode is a visible bug (a menu behind a scrim), which is why the layers carry names and not `--z-index-1…5`: nothing about "3" says whether it beats chat.

**`--z-<layer>`, not `--z-index-<layer>`**: the token IS the layer, and that is the point of the split. `--radius-md` feeds `border-radius` and `--shadow-panel` feeds `box-shadow` — a token named for the property that consumes it was the odd one out. It also lets a layer that needs no z-index sit in the list without claiming a mechanism it doesn't use, which is exactly what `z-pause-gate` is.

| token | value | what |
|---|---|---|
| `--z-page` | 0 | the page itself. Nothing here is ever deliberately drawn over anything else |
| `--z-board` | 1000 (–1099) | the play surface and the pieces on it, including pieces stacked on other pieces. **Not read yet** — a board's own stacking is still local 0–5, and this token gaining a reader is the signal that boards became sealed |
| `--z-board-question` | 1100 | a box over ONE square, taking or showing something for it: crosswords' rebus entry. **Not read yet** |
| `--z-ghost` | 1200 | a piece in transit, following the pointer. **Not read yet** |
| `--z-infocol` | 1300 | the readouts beside the board — and a layer on desktop too, where nothing overlaps: sitting beside rather than over is a fact about the viewport, not about the kind of thing it is |
| `--z-companion` | 2000 | something you keep NEARBY while you play: the scratchpad, a setter's note, a clue explainer |
| `--z-dialog` | 2100 | a question that can wait. No dim, movable, opens where you left it |
| `--z-modal-normal` | 2200 | a question worth thinking or talking about. Dims to focus you; chat stays reachable, which is not a leak — a normal modal never claimed the world stopped |
| `--z-help` | 2300 | **Help states otherwise.** It is a companion by every test, but it is summoned FROM things — including the setup modal — and the rules must never open behind the form you pressed "?" in |
| *`z-pause-gate`* | *3000* | a LAYER WITH NO Z-INDEX, so it is a comment rather than a token. `PauseBoundary` unmounts the play surface rather than covering it |
| `--z-chat` | 3100 | **Chat states otherwise.** Classed a companion, but the conversation must stay reachable over every dim below it — and chat is the one panel that can OPEN ITSELF (a `!` message force-opens it), so it must never materialize underneath something |
| `--z-menu` | 3200 | the header menu. There is exactly one, rendered only by `<PageHeaderMenu>`, which is why it is a rung and not a satellite |
| `--z-toast` | 4000 | an announcement you must see wherever you are and whatever you are doing |
| `--z-modal-blocking` | 5000 | the world stops. Answer it now; nothing underneath is live |
| `--z-modal-fault` | 5100 | as blocking, but strictly above it — an error must be readable mid-question |
| `--z-tooltip` | 9000 | the very top, safely: you cannot hover or click what a modal has made inert. The definition popover is here too — a tooltip with different styling |

**The ordering rule, which is the sentence to keep: shorter-lived or more important sits higher.** The numbers encode relationships — a thousand is a different world, a hundred is a layer within one, ten would be a tweak of a layer (nothing uses one yet; the step exists so that when something does, it says so).

**A floating panel does not read these directly — its FAMILY does.** `<FloatingPanel family="dialog">` resolves `var(--z-dialog)` from the family name, so there is no list of tiers in TypeScript to drift from this one. The two components that state otherwise are the two above, each with the reason written in its own file.

**What is NOT a rung.** Things that attach to a layer instead of occupying one, which is what keeps the list short:

- **a scrim** sits one BELOW its owner (`FloatingPanel` paints it at `calc(… - 1)`);
- **a `<FilterSelect>` dropdown** sits just ABOVE its host, `z-index: calc(var(--z-host, var(--z-page)) + 1)`. A host that isn't the page sets `--z-host` on itself, and exactly one does today: `.infoCol`, as a **custom property only** — giving it a `z-index` or a `position` would make it a stacking context or a containing block and move where a dropdown anchors;
- **a tooltip** goes to the absolute top and needs no host at all.

**What is NOT on the ladder** is layering inside a component's own stacking context — a ring over a tile, a floating shuffle on its board, the keyboard cursor. Those compete only with their siblings and stay small local numbers. The app has a clean gap: everything local is ≤ 10, everything page-level is ≥ 1000.

**The rule is guarded**, by `guards/vocabularies.test.ts`, and in two halves:

- **In CSS, across all of `src/` — boards included.** This is the one vocabulary where tuned surfaces are *not* exempt: a board's radius is a game's decision, but a board's rank against chat is a whole-app decision that merely happens to be written in a game's file. Values 0–10 stay legal as local layering; anything above must read a token.
- **In TypeScript.** `<FloatingPanel>`'s `zIndex` prop is typed `string` and takes `var(--z-chat)`, so the order has one home rather than a CSS list and a TS list free to disagree. A numeric literal fails the guard. A *computed* z-index is still fine — stackdown stacks its tile pile with `zIndex: t.z`, which is per-tile data, not a tier.

**Three values are deliberately still literals**, each with an area that owns it (see [app-audit.md](../plans/app-audit.md) § Carried forward): the two drag ghosts, which disagree at 1000 (bananagrams) and 100 (scrabble); and scrabble's `ScrabbleBlankPickerBlockingModal` overlay at 50, a full-screen `position: fixed` modal parked *below* the panel tier, so an open chat or menu paints over it. Naming them would bless arrangements nobody has decided on. They sit on the guard's pending list until then.

#### Duplication and drift that are deliberate

Repetition is not automatically a finding. The 2026-07-13 CSS audit examined each of
these and decided **not** to change it; they're recorded so the next sweep recognizes
them instead of re-filing them.

**Duplication that shouldn't be shared:**

- **`.loading` / `.empty` shapes.** Loading is an explicitly exempted moment — see the
  CSS checklist above.
- **The dashed empty-slot idiom.** Three games, three different jobs; the visual rhyme
  is coincidence.
- **The bespoke light modals.** Each is small and local; a shared one would need every
  caller's variations as props.
- **The small-caps micro-label.** Real repetition, but it folds into the font-size-token
  question ([`ui.md`](ui.md) → the standardize-when-it's-noise list) rather than standing
  alone as its own extraction.

**Per-game differences that look like drift but aren't:**

- **The square-board `--side` math** — "NOT identical enough to share," per the scaffold
  comment that says so at the site.
- **No shared `--info-col-width` default** — each game declares its own on purpose.
- **The two-reds distinction** and the **per-game vocabulary palettes** — see
  [`ui.md`](ui.md)'s two-vocabularies rule: names and colors track each game's own
  concepts.
- **bananagrams' and crosswords' layout exceptions** — documented v3 exceptions, not
  oversights ([`mobile.md`](mobile.md) and each game's doc).
- **The `.boardCol` debug tint** — intentional; the rule in `PlayArea.module.css` says
  "do NOT remove" at the site.

One deliberate non-fold lives with its game rather than here, because it's a fork-pair
question: `Letters.module.css` / `Wheel.module.css` in
[`wordwheel.md → Deferred`](games/wordwheel.md#deferred).

### TypeScript naming conventions

Two conventions intersect: TypeScript leans camelCase, SQL leans snake_case. We honor both, with a rule that makes the boundary visible.

#### Field casing

> **snake_case** for type fields that mirror a Postgres row's shape. **camelCase** for fields on TS-native shapes (component props, FE-built normalizations, manifest types, anything we designed in TS).

The "how to tell" test: if the field names would match what `supabase gen types` emits for that table, the type is DB-shaped and uses snake_case. Otherwise it's a TS abstraction and uses camelCase.

**Keys inside a jsonb blob are DB-shaped too** — `setup`, `status`, `result`, `meta`. They read the same in SQL as in TS (`setup->>'coop_style'`, `s.coop_style`), they persist in rows, and `gen types` can't type them, so nothing catches drift: **snake_case, always.** This is the rule that got broken — `coopStyle` / `firstTurnUserId` / `firstClueGiverUserId` lived in `setup` as camelCase until 2026-08-01, and because setup keys also round-trip into `clubs_gametypes.default_setup` they'd have been the most expensive thing on the roster to rename after the baselines froze. Where a camelCase React prop feeds a snake_case setup key, spell the mapping out at the seam rather than reaching for object shorthand:

```tsx
// The prop is TS-native (camelCase); the setup key is DB-shaped (snake_case).
coopStyle={s.coop_style ?? 'free-for-all'}
onChange={({ coopStyle, firstTurnUserId }) =>
  onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
}
```

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

The codebase has a single canonical identity shape — `Member` in [`src/common/lib/gameManifest.ts`](../src/common/lib/gameManifest.ts) — and each per-game folder exposes a `Player` alias on top of it. Same shape, sometimes enriched (codenamesduet adds `seat`); the naming carries the *context*, not the type-level distinction.

> **Rule:** `Member` is the type for identity. Per game, declare `Player` (alias or extension). At the call site, the **variable name** reflects whether you're in club context (`members: Member[]`) or game context (`players: Player[]`).

Why both names exist for what's often the same shape:

- A reader scanning `ClubPage.tsx` sees `members: Member[]` and reads "people in this club" — the chat sender lookup, the member-list rendering, the setup-form's "who picks first?" picker. Club-wide.
- A reader scanning `connections/components/GameTurnLog.tsx` sees `players: Player[]` and reads "people playing this game." The shape is the same as `Member[]` but the variable signals "this is a strict subset — only the friends who joined this game's `game_players` row."

The per-game `Player` alias earns its keep even when it's a pure re-export:

```ts
// connections/hooks/useGame.ts (and psychicnum/hooks/useGame.ts)
import type { Member } from '../../common/lib/games'
export type Player = Member

// codenamesduet/hooks/useGame.ts
import type { Member } from '../../common/lib/games'
export type Player = Member & { seat: 'A' | 'B' }
```

Why every game declares one — even the pure-alias case:

1. **Cross-game pattern parallel.** A reader scanning per-game folders sees the same `Player` symbol everywhere. They don't have to remember "codenamesduet uses Player but connections uses Member" — every game's vocabulary is the same.
2. **Future-proofing.** When connections grows per-player game state (a "tile-rate-of-correct" stat, a "you're it" turn marker), the type is already named. No cascade rename from `Member` → `Player` across call sites.
3. **Semantic signal at the import.** `import type { Player } from '../hooks/useGame'` in a connections subcomponent says "this is connections's notion of a player" — even if the body is just `= Member`.

Where to use which:

| Context | Type | Variable name | Examples |
|---|---|---|---|
| Club listing, chat, setup forms | `Member` | `members` | `ClubPage` roster, `ChatBody.members`, `SetupBodyProps.members`, `Chat.members` |
| Inside a game | game's `Player` | `players` | `useCommonGame().players`, `GamePageCtx.players`, `<PlayArea>` ctx, `<GameTurnLog players={...} />`, `computePause(presentUserIds, players)` |

The one variable to be aware of: **`useCommonGame` returns `players: Member[]`** — the type is `Member` (it's the identity layer, not a per-game shape), but the field is named `players` because every consumer is in game context. Per-game components re-type as their own `Player[]` if they need the enrichment (codenamesduet's seat); otherwise the rename happens at the variable-name level only.

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

### Feedback naming

**"Feedback"** here means specifically **a message shown in the global feedback area (the GamePage-header pill) or the local feedback area (the below-board pill)** — nothing else. Lighting up a board cell, underlining a new word in the WordList, or an OpponentStrip readout are all "feedback" in plain English, but they are **not** feedback in this codebase's sense (they're the ambient display layer). Only the two pill channels count.

**Never pass a server's `error.message` to a feedback sink.** Read the
envelope: `res.message` is a sentence someone wrote for a player, at the raise,
on purpose — and `getNotOkFeedback(res)` turns it into the tone and text a pill
wants ([envelopes.md](envelopes.md)). An `error.message` is the other thing:
whatever the transport happened to produce, which is what put `TypeError: Load
failed` in front of players. [`noRawServerMessage.test.ts`](../src/guards/noRawServerMessage.test.ts)
is the guard.

A sink that takes a **string** loses the fault styling, since a string can't
carry the flag: prefer `(msg: GenericFeedbackMsg) => void`. `showError` in
`useStandardGameActions` is the remaining string sink, and it's why a fault
arriving through End / Concede / Restart still wears a pill.

**This is enforced, because being careful wasn't enough.**
[`noRawServerMessage.test.ts`](../src/guards/noRawServerMessage.test.ts) fails on any
`error.message` read that isn't a log, isn't feeding `failureText` /
`failureMessage`, and isn't in its short justified allowlist. It exists because
five games shipped briefly showing `no-guesses-left|` as a red pill: their SQL
had been converted to keys while their own call sites still handed the raw
string straight to a pill, which defeats the copy table, the fault styling and
the `[db]` log at once — and nothing failed. Writing the guard immediately found
**nine more sites** a hand-grep had missed, all spelled `error?.message`.

Two hard rules for anything that *sets, holds, renders, or types* one of those pill messages:

1. **Every feedback identifier is qualified by channel — `Global`, `Local`, or `Generic`. Nothing is named bare `feedback`.** `Global` = the header pill (peer / opponent news). `Local` = the below-board pill (the player's own move / own state). `Generic` = machinery genuinely shared by both channels (the renderer, the message type/tone, the shared state primitive). If a name resists all three labels, that's a signal it's mis-scoped — find a clearer one. The bare word is banned even when it reads heavier (`GenericFeedbackMsg`, `GENERIC_FEEDBACK_DISMISS_MS`): the weight is the tell that you're touching shared machinery.

   The rule covers the feedback MACHINERY, not every type it happens to hold. A pill's `tone` is an [`Outcome`](outcomes.md) — a vocabulary a board, a tile, a turn-log row and a server result reach for too — so naming it for the feedback channel would have claimed it for one consumer out of five.

2. **The noun is always `feedback`; never `result`, `action`, `flash`, or similar.** In particular, avoid `flash` — whether a message is timed / sticky / closeable is a per-message property (the `dismiss` field), not something a name should assert.

Same role → same name across games (a peer-narration hook is `useGlobalFeedback` everywhere, not `usePeerFeedback` in one game and `announcePeerGuess` in another).

| role | name | channel |
|---|---|---|
| shared pill renderer | `GenericFeedbackPill` | Generic |
| shared message type / API | `GenericFeedbackMsg` / `GenericFeedbackApi` | Generic |
| the tone a message carries | `Outcome` — a shared vocabulary, not feedback machinery ([outcomes.md](outcomes.md)) | — |
| the global sink on `GamePageCtx` | `globalFeedback` (`.show` / `.clear`) | Global |
| per-game hook computing peer messages → global area | `useGlobalFeedback` | Global |
| hook holding the own-move below-board message | `useLocalFeedback` | Local |
| set / clear the local pill | `showLocalFeedback` / `clearLocalFeedback` | Local |
| the local pill's CSS wrapper | `.localFeedback` (shared; centers the pill, reserves its own height) | Local |

Peer feedback goes to the **global** area; own-move feedback goes to the **local** area. Because that split is 1:1, `Global` and `Local` are effectively synonyms for "peer" and "own" — naming by channel loses no information and keeps the invariant visible.

### Below-board structure

Every game's `.boardCol` reads the same skeleton below the board, so a reader can map any game onto it. The class names are universal; the CSS behind each is per-game (like the board grid itself).

```
.boardCol
  <board>
  .belowBoard              ← the region: everything below the board. ALWAYS present.
    .moveArea              ← the below-board move controls (keyboard / EntryBox+buttons /
                              rack / mistakes+buttons). ALWAYS present — EMPTY (with a short
                              comment) where the move is made on the board itself (bananagrams,
                              waffle). A game has zero or one.
    .localFeedback         ← the own-move pill wrapper (shared). Present only when a pill shows;
                              reserves its own min-height so the board never reflows.
```

**The swap.** In many games the move controls and the feedback pill occupy the **same** spot — the pill replaces the controls (connections, the `EntryRow` games, codenamesduet, and scrabble's *commit buttons only*). There, a `.moveAreaOrLocalFeedback` box holds the reserved height and swaps `.moveArea` ↔ `.localFeedback`:

```
.belowBoard
  .moveAreaOrLocalFeedback   ← reserved-height swap box (shared; min-height via
                               --swap-box-min-height, default 2.75rem)
    .moveArea  |  .localFeedback
```

Games where the two are **separate and both always shown** (wordle: keyboard + feedback; stackdown: WordEntry + feedback) don't use the swap box — `.moveArea` and `.localFeedback` sit side by side, each reserving its own height.

Two rules learned the hard way:
- **`.moveArea` names the *controls*, not the swap box.** Don't rename a controls-holding element to a feedback name — the controls and the feedback are separate concepts even when they share a spot (scrabble's commit buttons keep their own `.commitButtons` right-justify; the *area* is `.moveAreaOrLocalFeedback`).
- **Never rename to lose a bare `feedback`.** `.localFeedback` / `.moveAreaOrLocalFeedback` carry the channel; there's no unqualified `feedback` class.

This is a **naming + structure** convention, not a layout change — added wrappers use `display: contents` (they generate no box) and reserved heights move to the equivalently-sized renamed element, so the rendered pixels are identical.

### Grid coordinates

The games that let you place tiles onto a coordinate-addressed grid with a keyboard cursor — **bananagrams** and **scrabble** — share one vocabulary:

> **`x` = horizontal (column), `y` = vertical (row); `'h'` / `'v'` for the cursor's axis; flat index `idx(x, y) => y * width + x` (x first, matching scrabble's `cellIndex`).**

Not `row`/`col`, not `'H'`/`'V'`, not a y-first index. The point is read-time parallelism: these two games' cursor + placement code is meant to be compared side by side (one's interaction is a near-port of the other's), so a stray `row`/`col` in one against `x`/`y` in the other is pure friction. With the names aligned, the *real* divergence stands out — the tile-identity model — and the genuinely-shared mechanics lift cleanly into [`common/lib/game/gridCursor.ts`](../src/common/lib/game/gridCursor.ts) (`moveCursor` / `stepBack`) and [`common/hooks/ui/useDragGesture.ts`](../src/common/hooks/ui/useDragGesture.ts).

**Scope — this only binds the coordinate-pair-with-cursor games.** Most grids deliberately *don't* address cells by an `(x, y)` pair, and that's correct — they have no cursor to drift:

| game | how a cell is addressed |
|---|---|
| bananagrams, scrabble | `(x, y)` pair + keyboard cursor → **this convention** |
| stackdown | tile `id`; tile *positions* are `x` / `y` / `z` (z = stack layer) — already x/y |
| codenamesduet, waffle | flat index (`position` / `pos`, 0..N) — no pair, no cursor |
| connections | the tile string itself |

So: a new game with a coordinate-pair grid + cursor uses this vocabulary and reaches for the shared helpers. A game that addresses cells by flat index or identity (the more common case) has no pair to name — don't invent one.

The one surviving `row`/`col` is intentional: waffle's `coord(pos)` in [`waffle/lib/waffle.ts`](../src/waffle/lib/waffle.ts) builds a *spreadsheet label* like `"C3"`, where column-letter + row-number is the natural vocabulary. That's a display string, not playfield addressing — leave it.

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

The const name labels it for the scan, for prose ("the `sendManualPause` callback"), and — in practice — for stack traces (V8 doesn't propagate the const name through the `useCallback(…)` call expression onto the inner arrow's `.name`, but source-position info in modern stack traces and React DevTools' own labeling close most of the gap). Writing the name twice adds noise without a matching read-time win.

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
| `<game>-<feature>` | `codenamesduet-suggest-clue`, future `boggle-validate-board` |
| `common-<feature>` | future `common-send-invite-email` (cross-game) |

This matches the directory: `supabase/functions/codenamesduet-suggest-clue/index.ts`.

## Known gotchas

### Cross-schema embeds (PostgREST)

PostgREST's schema cache only discovers FK relationships **within a single schema** (the parent's schema). Cross-schema FKs like `codenamesduet.games.user_a_id → common.profiles.user_id` exist in Postgres and `[api].schemas` exposes both ends — but the embed syntax still fails:

```ts
// This DOES NOT work cross-schema, even though the FK exists:
supabase.schema('codenamesduet').from('games')
  .select('id, user_a_id, profiles(username)')
// → PGRST200 "Could not find a relationship between 'games'
//             and 'profiles' in the schema cache"

// The !fkname hint syntax doesn't rescue it either — same error.
```

**Workaround:** fetch the two sides in separate queries and merge in JS. For small result sets (≤ 2 players, a few-dozen members) the extra round trip is fine. [`src/codenamesduet/hooks/useGame.ts`](../src/codenamesduet/hooks/useGame.ts) is the canonical example — read the inline comment there for the diagnostic story.

If a query genuinely needs server-side joining of cross-schema data (e.g. a complex roster + scores + history view), prefer a `security definer` RPC that does the join in SQL and returns a single payload, rather than fighting the embed layer.

This limitation has implications for table design: cross-game features that want PostgREST embeds need their referenced tables in the same schema as the queries. It's another argument for the "shared UI, per-game data" pattern — keep tables co-located with the queries that join them.

### Cross-schema TypeScript types

`supabase gen types` produces a `Database` type with a top-level key per exposed schema. `supabase.schema('codenamesduet').from('words')` is fully typed against `Database['codenamesduet']['Tables']['words']`. Same for RPCs.

If you add a new schema, also:

- Add it to `[api].schemas` in `supabase/config.toml`.
- Re-run `npm run types:gen` so the FE picks it up.
- **Restart the local stack: `supabase stop && supabase start`.** Note that `gmake db-reset ENV=local` is NOT enough — it replays migrations and restarts containers, but doesn't re-read `config.toml`. PostgREST will keep its prior exposed-schemas list and reject calls to the new schema with PGRST106 ("Invalid schema: foo"). The full stop/start is required to make the new `[api].schemas` value take effect.
