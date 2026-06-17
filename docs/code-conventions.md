# Code conventions

How we write code in this repo. The cross-cutting rules that aren't tied to any one gametype. Read this before writing or reviewing code in `src/` or `supabase/`.

For terminology and the architectural backdrop see [`naming.md`](naming.md). For feature-specific conventions see [`tinyspy.md`](tinyspy.md), [`psychicnum.md`](psychicnum.md), [`common.md`](common.md), and [`testing.md`](testing.md).

## Code clarity & docstrings

The explanation bar in this codebase is higher than the average TypeScript project — see [`../CLAUDE.md → Educational priority`](../CLAUDE.md#educational-priority--clarity-over-brevity) for the prior. What that looks like in practice:

- **Docstrings on every exported function, component, hook, and RPC.** Explain what it does, why it exists, and any non-obvious constraints. The tinyspy RPCs in [`supabase/migrations/20260612000001_tinyspy_baseline.sql`](../supabase/migrations/20260612000001_tinyspy_baseline.sql) and components like [`src/tinyspy/components/CluePanel.tsx`](../src/tinyspy/components/CluePanel.tsx) are the model — generous prose, examples, references to related pieces.
- **Code comments where the WHY isn't obvious.** Design decisions, subtle invariants, non-obvious trade-offs ("we refetch on SUBSCRIBED because broadcasts can be missed during reconnect"), workarounds for specific platform behavior.
- **Names describe role, not implementation.** `isClueGiver` not `playerA`. See [`naming.md`](naming.md) for the terminology lexicon.
- **Prefer one clear path over a clever one.** A few extra lines of straightforward code beat a tight expression that requires the reader to pause.
- **Extract a small helper over a deeply-nested ternary.** A single `a ? b : c` is fine; two-or-more-deep nests almost always read better as a small function with `if` branches — each case lands on its own line, picks up a name (or at least a local variable), and survives a future tweak without re-balancing the whole expression. See [`psychicnum/manifest.ts → labelFor`](../src/psychicnum/manifest.ts) for the model: a 3-deep ternary refactored into a 6-line helper. The only reason to keep the ternary inline is a measured hot path where allocating the helper actually shows up in a profile — and there are no such hot paths in this codebase today.
- **`useEffect` gets a header comment.** Inline arrow effects have no name — see [the useEffect comments rule](#useeffect-comments) below.

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

The payoff: each game gets a clean namespace. Tinyspy and a hypothetical Boggle can each have a `words` table named just `words`. The fact that you had to say which game it was tells you which one you're touching.

### Tables and columns

- Tables describe their role within their schema. **No game prefix.** `tinyspy.words`, not `tinyspy.tinyspy_words`.
- `snake_case` for tables and columns.
- Plural for tables (`games`, `words`, `messages`).
- FKs use `<thing>_id`: `game_id`, `user_id`, `club_id`. Self-referential or ambiguous ones get a role prefix: `next_game_id`.

### RPC functions

- Live in the schema they operate on. Tinyspy RPCs are `tinyspy.create_game`, called via `db.rpc('create_game')` where `db = supabase.schema('tinyspy')`.
- Cross-game / shared RPCs live in `common`. A `common` RPC may not reference any game schema; if it would need to, it belongs in the game.
- Naming describes the verb: `create_game`, `submit_guess`, `send_message`. No `tinyspy_` prefix — the schema carries that.
- All callable RPCs are `security definer` with an explicit `set search_path = <game>, common, public, extensions`. The pinned search path neutralizes search-path hijacking; without it, a malicious unqualified table-reference inside the function could resolve against an attacker-controlled schema.

### RLS helpers

Each game owns its own membership helper (`tinyspy.is_player_in_game`, `psychicnum` uses `common.is_club_member` directly because it has no seat structure). The reason a *common* `is_player_in_game` doesn't exist: the predicate would have to query that game's membership table, which only lives in that game's schema — exactly the cross-coupling the removability rule forbids.

Helpers are marked `STABLE` so Postgres can cache the result within a single SELECT. RLS policies invoke the helper once per row; without `STABLE` that becomes the dominant cost on any non-trivial query.

### SECURITY DEFINER helper + security_invoker view

When you need to expose a column the calling role can't see directly, gated on row state (e.g., "reveal the answer once the game ends"), reach for this two-layer shape:

1. Keep the column-level grant on the base table — the role can't SELECT the column. (Storage-layer lock.)
2. Write a `SECURITY DEFINER` helper that reads the column and returns it conditionally based on row state. Running as `postgres`, it bypasses the column grant.
3. Define a view `with (security_invoker = true)` that calls the helper for the gated column. The `security_invoker` flag means RLS on the base table still gates row visibility *as the caller* — so unauthorized rows stay hidden.
4. Point the FE at the view, not the base table.

Canonical example: `psychicnum.games_state` + `psychicnum._target_for(uuid)` — see [`psychicnum.md` → The hidden-target mechanic](psychicnum.md#the-hidden-target-mechanic).

### Migration filenames

Pattern: `<timestamp>_<schema>_<topic>.sql`. The schema-prefix-in-filename gives per-schema grouping without nested directories.

Examples:

```
20260612000000_common_baseline.sql
20260612000001_tinyspy_baseline.sql
20260612000002_psychicnum_baseline.sql

# future:
20260620000000_tinyspy_add_difficulty.sql
20260621000000_common_add_friends.sql
```

Cross-schema FKs (game → common) need `common.*` to exist first, which timestamp ordering handles naturally.

### Per-game player counts

Each gametype's supported player-count range is declared in **two places**:

- The TypeScript manifest's `numberOfPlayers: [min, max | null]` field (consumed by the shell to decide whether a "Start X" button is enabled/disabled/hidden for a given club).
- The `create_game` RPC's member-count check (the hard server-side gate that rejects mismatched calls).

These two declarations **must agree** by convention. There's no automated sync — adding a lookup table or a code-gen step is overbuild for the scale this project operates at (rare new-game events, both files edited in the same PR). What we do instead:

- **Cross-reference comments on both sides.** The manifest's `numberOfPlayers` comment names the migration that holds the matching check; the migration's check has a comment pointing back at the manifest field. Whoever edits one is told where the other lives.
- **Boundary-test the DB side.** Each game's `create_game_test.sql` includes a boundary test (one happy-path call within the range + one rejection just outside). The test pins the SQL-side check; drift between the two sides becomes a visible mismatch.
- **Accept that FE drift surfaces as a server error.** If somehow the manifest says `[1, 8]` and the DB says `[1, 6]`, a 7-member club's Start button is shown enabled, the RPC rejects with its actual message, the user sees the error inline. Loud, not silent.

The model: the two declarations are equally authoritative for their respective layers (TS narrows types; SQL enforces state). The convention is "edit both together; the comments help you remember the partner."

### Realtime channel names

Pattern: `<topic>:<id>:<unique>`, e.g.:

- `game:<game_id>` — the shared cross-cutting channel opened by `useCommonGame`. Stable name (no UUID suffix) because presence + manual-pause broadcasts must merge across every connected client. StrictMode handled by the hook's own `removeChannel` cleanup. Every gametype's `useCommonGame` opens this.
- `<gametype>:<game_id>:<uuid>` — the per-tab postgres-changes channel each per-game `useGame` opens. UUID suffix sidesteps supabase-js's StrictMode-cache bite; postgres-changes don't need to merge across clients so per-tab rooms are fine.
- `wordknit:<game_id>` — wordknit's stable channel for shared-selection Broadcast events (select / deselect / clear). Stable for the same reason as `game:<game_id>` — broadcast events need to merge across clients.
- `club-active:<club_id>:<uuid>` — club active-game pointer
- `club-chat:<club_id>:<uuid>` — club chat messages

The per-effect-run UUID suffix is mandatory: `supabase-js` caches channels by name, and React StrictMode runs effects twice on mount. Without a unique suffix, the second `.on()` chain would target an already-subscribed cached channel and throw. See [`useGame.ts`](../src/tinyspy/hooks/useGame.ts) for the canonical example.

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
| End-of-game result banner | `GameOverBanner` (tinyspy) / `ResultBanner` (psychic-num) | per-game; same role, different content |
| Reused chat surface | `ClubChatPanel` | shared, mounted once by `GamePage` |
| Auth gate | `LoginScreen` | shared |

A game's main screen is `PlayArea.tsx` whether it has a literal grid (tinyspy) or just a text input (psychic-num). The role is "the place where the gametype-specific play happens"; cross-cutting chrome (title, timer, Pause, Back-to-club, pause overlay, chat) belongs to `<GamePage>`, not to the per-game PlayArea.

**File name matches component name; folder context disambiguates same-named components across games.** `src/wordknit/components/PlayArea.tsx` exports `PlayArea`; `src/tinyspy/components/PlayArea.tsx` also exports `PlayArea`. Same rule for `SetupForm.tsx` — the folder tells you which game's PlayArea or SetupForm you're looking at, the file/export name stays role-named. No `WordknitPlayArea` / `TinyspySetupForm` prefixes anywhere.

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

2. **If two games need similar-but-meaningfully-different implementations, name them similarly.** Use the same role-noun (`PlayArea`, `SetupForm`, `ResultBanner`) across games even when the bodies diverge. A reader scanning the tree should see the common idea by sight; folder context disambiguates which game's implementation they're in. Resist gametype-prefixing names (`TinyspyPlayArea`, `WordknitSetupForm`) — the folder already says which game.

The reason both rules matter: this codebase is shaped to host ~7 games, most of them ports of games that exist in other stacks. The faster a reader can pattern-match "ah, this is the wordknit version of the same thing tinyspy does," the cheaper porting work becomes. Both extracting-when-similar AND naming-similarly-when-different serve that goal — the first by reducing duplication, the second by making the parallels legible when duplication is the right call.

#### Per-game `useGame` shape — pick the right template

When porting a new game, the per-game `useGame` hook's shape depends on whether the game has fixed seats:

- **Fixed-seat games** (tinyspy is the example: two players, identified by columns `user_a_id` / `user_b_id`): the hook **fetches its own roster**. The seat ⇄ user_id mapping is intrinsic to the per-game row, so the roster has to be loaded alongside the game data — no upstream component can pre-compute it. The hook also fetches profiles (cross-schema) to embed usernames; the canonical example is `src/tinyspy/hooks/useGame.ts`.
- **N-player open games** (psychicnum, wordknit are the examples: any number of players, no per-seat identity): the hook **reads the roster from `GamePageCtx`** (the `players` field provided by `<GamePage>` via `useCommonGame`). No need to re-fetch — the common-side hook has already loaded `common.game_players` + profiles. The per-game hook stays focused on its game-specific tables.

The decision rule is mechanical: "does this game's per-row state name specific seats?" If yes, fixed-seat template; if no, open template. Don't mix — an N-player game that fetches its own roster duplicates work `useCommonGame` already did; a fixed-seat game that reads from `GamePageCtx` would have to wait for the upstream load before its own data makes sense.

Concrete examples in the tree today:
- Shared: `<GamePage>`, `<PauseBoundary>`, `<ClubChatPanel>`, `<TimerField>`, `<ClubGameCard>`, `<StartGameButtons>`, `<SuspendConfirmDialog>`, `useCommonGame`, `useGameTimer`.
- Same name, per-game body: `PlayArea` (every game), `SetupForm` (every game), `useGame` (every game).
- Different name, divergent role: tinyspy's `GameOverBanner` vs psychic-num's `ResultBanner` — flagged in [`ui.md` → Consistency across games](ui.md#consistency-across-games) as a candidate for a future common `GameResultBanner` when a third game would benefit.

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
| `Props`, `CluePanelProps`, `LinkProps`, `GamePageCtx` | React component prop types (`GamePageCtx` is what `<GamePage>`'s render-prop child receives — `{ session, gameId, players, playState, isTerminal, timer }`). |
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

### `useEffect` comments

Inline arrow effects have no name; without a header comment a reader has to puzzle through the body + dep array to understand what each effect does and what triggers it to re-run.

Every effect gets a brief header comment **above** the `useEffect(…)` call (not inside the arrow body), so the comment is in scope of the deps array. The comment leads with intent and explains the dep choice when it's non-obvious. Examples:

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

## Edge Functions

Edge Functions live in a **flat namespace** at the Supabase project level — they don't get schemas. So they're the one place we use a game-prefixed name:

| pattern | example |
|---|---|
| `<game>-<feature>` | `tinyspy-suggest-clue`, future `boggle-validate-board` |
| `common-<feature>` | future `common-send-invite-email` (cross-game) |

This matches the directory: `supabase/functions/tinyspy-suggest-clue/index.ts`.

## Known gotchas

### Cross-schema embeds (PostgREST)

PostgREST's schema cache only discovers FK relationships **within a single schema** (the parent's schema). Cross-schema FKs like `tinyspy.game_players.user_id → common.profiles.user_id` exist in Postgres and `[api].schemas` exposes both ends — but the embed syntax still fails:

```ts
// This DOES NOT work cross-schema, even though the FK exists:
supabase.schema('tinyspy').from('game_players')
  .select('user_id, seat, profiles(username)')
// → PGRST200 "Could not find a relationship between 'game_players'
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
