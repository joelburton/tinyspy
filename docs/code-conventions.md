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
| `common` | Shared user-data tables and helpers used by every game: profiles, clubs, club_members, club_active_game, messages. **Must not reference any game schema.** |
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

### Realtime channel names

Pattern: `<topic>:<id>:<unique>`, e.g.:

- `game:<game_id>:<uuid>` — tinyspy game subscription
- `psychicnum:<game_id>:<uuid>` — psychic-num game subscription
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
| The game's main play surface | `BoardScreen` | per-game |
| End-of-game result banner | `GameOverBanner` | per-game; same role, different content |
| Reused chat surface | `ClubChatPanel` | shared (`common/components/`) |
| Auth gate | `LoginScreen` | shared |

A game's main screen is `BoardScreen.tsx` whether it has a literal grid (tinyspy) or just a text input (psychic-num). The role is "the place where the game happens"; the shape of the game is secondary to the name.

### Import-direction rules

Enforced by ESLint's `no-restricted-imports` (see [`eslint.config.js`](../eslint.config.js)):

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/games.ts` is the **one** allowed exception — it imports every game's manifest by definition.

If you find yourself wanting to import a component from another game, that's a signal to promote it to `common/`. If a `common/` piece wants to import from a game, the abstraction is wrong — generalize the common piece (often: take a `db` handle or a render prop) so it doesn't need to know the game.

`GAMETYPES` in `eslint.config.js` is the single source of truth for the rule. When a new game lands, add it there too.

### CSS Modules + theme

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
| `ClubGameEntry`, `ClubListEntry` | FE-built normalizations for list rendering. No `Row` suffix. "Entry" describes their role. |
| `Props`, `CluePanelProps`, `LinkProps`, `GameRootProps` | React component prop types. |
| `GameManifest` | A TS-native interface that game folders implement. |

If you see a type whose fields are snake_case but whose *name* doesn't end in `Row`, ask whether the name is misleading. (`ClubGameRow` was an example of this and got renamed to `ClubGameEntry`.)

#### Other casing rules

| kind | convention | examples |
|---|---|---|
| Function names, function parameters, local variables | camelCase | `enterGame`, `gameId`, `resolvedIds` |
| React component names | PascalCase | `ClubPage`, `BoardScreen` |
| Module-level constants | SCREAMING_SNAKE_CASE | `GAMETYPES`, `STATUS_LABEL` |
| File names — components | PascalCase | `BoardScreen.tsx` |
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
- Restart the local stack (`supabase stop && supabase start`) — PostgREST's schema cache picks up new schemas at boot, not on the fly.
