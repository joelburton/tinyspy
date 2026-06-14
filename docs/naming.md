# Naming & layout conventions

How we name things across the monorepo. The repo holds multiple collaborative games sharing one Supabase project; these rules keep the games independent of each other and the shared pieces obvious.

See [`cheatsheet.md`](cheatsheet.md) for command/file lookups and [`../README.md`](../README.md) for the narrative.

## The big idea

> A name describes a **role**, not an **implementation**. If two games each have a thing that plays role X, both are called X, and the game qualifier lives in the folder structure — never in the name.

Game-name prefixes (`BoggleScoreReport`, `tinyspy_words`) are the smell. The folder/schema already carries that information; repeating it in the name is noise.

## The design constraint that drives all of this

**Any game must be removable in three actions:**

1. Delete `src/<game>/` and `supabase/migrations/*_<game>_*.sql`.
2. Delete the game's one line from `src/games.ts`.
3. Run a "drop schema" migration (or, on a fresh fork, just never apply the game's migrations).

If removing a game requires editing anything in `common/`, the shell, another game, or a global stylesheet, **the boundary has leaked**. This is our load-bearing check that the structure is honest: shared code stays game-agnostic, and game code stays self-contained. It's also the reason a fork can ship `tinyspy + scrabble` without `boggle` without architectural surgery.

Every rule below exists to preserve this property.

## Database schemas

| schema | what lives there |
|---|---|
| `public` | Postgres-managed stuff: `gen_random_uuid`, extension functions, anything we didn't put there. We do not add tables here. |
| `common` | Shared user-data tables and helpers used by every game: `profiles`, `friends`, `invite_codes`. Once clubs land, also: `clubs`, `club_members`, `messages` (chat keyed off `club_id`). **Must not reference any game schema.** |
| `tinyspy` | Tinyspy-specific tables, RPCs, RLS policies. |
| `boggle` | (future) Boggle-specific everything. |
| `<game>` | One schema per game; that game owns its tables, RPCs, and policies inside it. |

**Search path:** `extra_search_path = common, public, extensions`. Game schemas are deliberately *not* in the search path — every game reference is fully qualified (`tinyspy.games`, `boggle.boards`) in SQL, and goes through `supabase.schema('<game>')` in the FE.

The payoff: each game gets a clean namespace. Tinyspy and Boggle can each have a `words` table named just `words`. The fact that you had to say which game it was tells you which one you're touching.

## Table & column names

- Tables describe their role within their schema. No game prefix. `tinyspy.words`, not `tinyspy.tinyspy_words`.
- `snake_case` for tables and columns. Plural for tables (`games`, `words`, `messages`).
- FKs use `<thing>_id`: `game_id`, `user_id`. Self-referential or ambiguous ones get a role prefix: `next_game_id`.

## RPC functions

- Live in the schema they operate on. Tinyspy RPCs are `tinyspy.create_game`, called via `db.rpc('create_game')` where `db = supabase.schema('tinyspy')`.
- Cross-game / shared RPCs live in `common`. A `common` RPC may not reference any game schema; if it would need to, it belongs in the game.
- Naming describes the verb: `create_game`, `submit_guess`, `send_message`. No `tinyspy_` prefix — the schema carries that.
- All RPCs are `security definer` with an explicit `set search_path = <game>, common, public, extensions` to neutralize search-path hijacking.

## RLS helpers

Each game owns its own membership helper (`tinyspy.is_player_in_game`, `boggle.is_player_in_game`) because the predicate has to query that game's membership table, which only lives in that game's schema. A `common.is_player_in_game` would have to know about every game — which is exactly the kind of coupling the removability rule forbids.

Common RLS helpers only operate on common tables (e.g. `common.is_friend(other_user_id)` checking `common.friends`).

## Edge Functions

Edge Functions live in a **flat namespace** at the Supabase project level — they don't get schemas. So they're the one place we use a game-prefixed name:

| pattern | example |
|---|---|
| `<game>-<feature>` | `tinyspy-suggest-clue`, `boggle-validate-board` |
| `common-<feature>` | `common-send-invite-email` (cross-game) |

This matches the directory: `supabase/functions/tinyspy-suggest-clue/index.ts`.

## Frontend directory layout

Feature-first. Each game is a self-contained folder; shared pieces live in `common`. The shell discovers games via a one-file registry — see [Games registry](#games-registry) below.

```
src/
  common/
    components/      ChatMessage, FriendList, AuthGate — shared across games
    hooks/           useSession, useChat, useProfile
    lib/             supabase client, design tokens, generic utilities
    db.ts            export const db = supabase.schema('common')
    theme.css        :root { --color-fg, --space-md, ... }
  tinyspy/
    components/      Board, CluePanel, KeyCard
    hooks/           useGame, useBoard, useClues
    lib/             tinyspy-specific helpers (e.g. phase logic)
    db.ts            export const db = supabase.schema('tinyspy')
    theme.css        (optional) overrides for tinyspy palette
    manifest.ts      the game's manifest — name, schema, root component
  boggle/
    ...
  games.ts           the only file that knows which games exist
  App.tsx            top-level shell; consumes `games.ts`, never names a game directly
```

## Games registry

The shell never imports a specific game — it iterates a registry. This is what makes removability mechanical.

```ts
// src/tinyspy/manifest.ts
import { TinyspyRoot } from './components/Root'
import type { GameManifest } from '../common/types'

export const tinyspyGame: GameManifest = {
  gametype: 'tinyspy',
  schema: 'tinyspy',
  name: 'Tinyspy',
  blurb: 'Cooperative codenames for two.',
  Root: TinyspyRoot,
}

// src/games.ts — the ONE place that lists games
import { tinyspyGame } from './tinyspy/manifest'
import { boggleGame } from './boggle/manifest'
export const games = [tinyspyGame, boggleGame]

// src/App.tsx — game-agnostic
import { games } from './games'
// renders a picker; mounts games.find(g => g.gametype === active).Root
```

To remove a game: drop its line from `src/games.ts`, delete the folder. The shell, common code, and every other game are untouched.

## Component names

Roles, not implementations:

| role | name | shared or per-game? |
|---|---|---|
| Display one chat line | `ChatMessage` | shared (`common/components/`) |
| The game's main play surface | `Board` | per-game (`tinyspy/components/Board.tsx`, `boggle/components/Board.tsx`) |
| End-of-game result screen | `ScoreReport` | per-game; same role, very different content |
| Pre-game player gathering | `Lobby` | per-game (rules differ); maybe common if it converges |

**Import direction rules** (enforced by ESLint `no-restricted-imports`):

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/games.ts` is the ONE allowed exception — it imports every game's manifest by definition.

If you find yourself wanting to import a component from another game, that's a signal to promote it to `common/`. If a `common/` piece wants to import from a game, the abstraction is wrong — generalize the common piece (often: take a `db` handle or a render prop) so it doesn't need to know the game.

## CSS

**CSS Modules**, one file per component, co-located:

```
src/common/components/ChatMessage.tsx
src/common/components/ChatMessage.module.css
```

```tsx
import clsx from 'clsx'
import styles from './ChatMessage.module.css'

export function ChatMessage({ isMine, ... }) {
  return <div className={clsx(styles.message, isMine && styles.mine)}>...</div>
}
```

```css
/* ChatMessage.module.css */
.message {
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.mine {
  background: var(--color-accent-soft);
  align-self: flex-end;
}
```

Why CSS Modules:

- Vite supports them natively, no config.
- Class names are scoped at build time — collisions are structurally impossible.
- No runtime cost (vs. CSS-in-JS).
- Plays nicely with a single global stylesheet for design tokens.

**Design tokens go in a global stylesheet.** One `src/common/theme.css` defines CSS custom properties at `:root` — colors, spacing scale, font stack, radii, shadow tokens. Every `*.module.css` references them via `var(--token-name)`. A game can override them by importing its own `<game>/theme.css` after `common/theme.css`.

**What we don't use:**

- Plain global `.css` files for components — fine for the global theme file, but anything component-specific should be a `.module.css`.
- CSS-in-JS (styled-components, emotion) — adds a dependency and a runtime cost for a problem CSS Modules already solve.
- Tailwind — fine in the abstract, but a large stylistic change from where the code is now.

## Cross-schema embeds (PostgREST gotcha)

PostgREST's schema cache only discovers FK relationships **within a single schema** (the parent's schema). Cross-schema FKs like `tinyspy.game_players.user_id → common.profiles.user_id` exist in Postgres and `[api].schemas` exposes both ends — but the embed syntax still fails:

```ts
// This DOES NOT work cross-schema, even though the FK exists:
supabase.schema('tinyspy').from('game_players')
  .select('user_id, seat, profiles(username)')
// → PGRST200 "Could not find a relationship between 'game_players'
//             and 'profiles' in the schema cache"

// The !fkname hint syntax doesn't rescue it either — same error.
```

**Workaround:** fetch the two sides in separate queries and merge in JS. For small result sets (the lobby's ≤ 2 players, etc.) the extra round trip is fine. `src/tinyspy/hooks/useGame.ts` is the canonical example — read the inline comment there for the diagnostic story.

If a query genuinely needs server-side joining of cross-schema data (e.g. a complex roster + scores + history view), prefer a `security definer` RPC that does the join in SQL and returns a single payload, rather than fighting the embed layer.

This limitation has implications for table design: cross-game features that want PostgREST embeds need their referenced tables in the same schema as the queries (e.g. don't move `common.profiles` to `common` and then expect tinyspy queries to embed it). It's another argument for the "shared UI, per-game data" pattern in [Cross-game features](#chat-per-game-now-common-keyed-off-clubs-later) — keep tables co-located with the queries that join them, lean on `common` for things genuinely accessed alone.

## TypeScript types from the DB

`supabase gen types` produces a `Database` type with a top-level key per exposed schema. `supabase.schema('tinyspy').from('words')` is fully typed against `Database['tinyspy']['Tables']['words']`. Same for RPCs.

If you add a new schema, also:

- Add it to `[api].schemas` in `supabase/config.toml`.
- Re-run `npm run types:gen` so the FE picks it up.

## TypeScript naming conventions

Two conventions intersect here: TypeScript leans camelCase, SQL leans snake_case. We honor both, with a rule that makes the boundary visible.

### Field casing

> **snake_case** for type fields that mirror a Postgres row's shape. **camelCase** for fields on TS-native shapes (component props, FE-built normalizations, manifest types, anything we designed in TS).

The "how to tell" test: if the field names would match what `supabase gen types` emits for that table, the type is DB-shaped and uses snake_case. Otherwise it's a TS abstraction and uses camelCase.

Examples:

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

### Why this over "translate to camelCase at the boundary"

The other realistic option is "camelCase everywhere; map at the hook layer." We don't, because:

- The generated `Database['<schema>']['Tables']['<name>']['Row']` types are snake_case. Translating would mean either wrapping every one of them or duplicating the row shape in our own types.
- Each hook would gain ~5 lines of column-renaming boilerplate.
- We'd lose the visual signal — when you see `user_id` you know it's the raw DB shape; when you see `gameId` you know it's a TS abstraction.

The hybrid rule keeps that signal load-bearing.

### Type name suffix

> A type whose fields are a direct alias of (or trivial subset of) a Postgres row's shape ends in **`Row`**. TS-native shapes use whatever name describes their role best.

This parallels the generated `Database[schema][Tables][name]['Row']` naming. The suffix is a quick visual confirmation of the convention — `PlayerRow` says "DB-shape, expect snake_case fields" without you having to look.

Examples:

| name | what it is |
|---|---|
| `WordRow`, `GameRow`, `ClueRow`, `ClubRow`, `ClubMessage` | Aliases of generated `Database[...]['Row']` types. The `Row` suffix matches what Supabase itself emits. |
| `PlayerRow`, `MemberRow`, `PsychicnumGameRow` | Hand-rolled DB-shape types — they're not aliases of generated types but they mirror a row shape. |
| `ClubGameEntry`, `ClubListEntry` | FE-built normalizations for list rendering — composed in TS, not direct DB rows. No `Row` suffix. "Entry" describes their role. |
| `Props`, `CluePanelProps`, `LinkProps`, `GameRootProps` | React component prop types. |
| `GameManifest` | A TS-native interface that game folders implement. |
| `PhaseInputs`, `PhaseDerived` | Pure-function input/output. |

If you see a type whose fields are snake_case but whose *name* doesn't end in `Row`, ask whether the name is misleading. (`ClubGameRow` failed this check — its fields are camelCase, but the name suggested otherwise. Renamed to `ClubGameEntry`.)

### Other casing rules

| kind | convention | examples |
|---|---|---|
| Function names, function parameters, local variables | camelCase | `enterGame`, `gameId`, `resolvedIds` |
| React component names | PascalCase | `ClubPage`, `BoardScreen` |
| Module-level constants | SCREAMING_SNAKE_CASE | `GAMETYPES`, `STATUS_LABEL` |
| File names — components | PascalCase | `BoardScreen.tsx` |
| File names — hooks, lib, db handles | camelCase | `useGame.ts`, `cls.ts`, `db.ts` |
| File names — docs | kebab-case | `duet-rules.md` (historical), `cheatsheet.md` |

## Migrations

One migration file per logical change, prefixed with a UTC timestamp. Filename describes the change in present tense: `20260613120000_add_boggle_schema.sql`.

For a new game, the conventional shape is:

- `..._add_<game>_schema.sql` — `create schema <game>;` and the `[api].schemas` reminder in a comment.
- `..._<game>_<feature>.sql` — tables, RPCs, RLS for that feature.

Cross-schema FKs (game → common) need `common.*` to exist first, which timestamp ordering handles naturally.

## pgTAP test layout

Tests live under `supabase/tests/<schema>/`:

```
supabase/tests/
  common/
    chat_test.sql          (common.send_message + RLS)
    clubs_test.sql         (create_club, slugify, solo-club auto-creation)
  tinyspy/
    clue_context_test.sql
    create_game_test.sql   (the tutorial file — see below)
    game_loop_test.sql
    play_again_test.sql
    rls_test.sql
    sudden_death_test.sql
    win_test.sql
  boggle/                  (future)
```

`supabase test db --local supabase/tests` recurses into subdirectories automatically, so the `test:db` npm script doesn't need updating when new game folders appear.

Naming convention inside a folder: `<feature>_test.sql`, no game prefix (the folder already carries that information). Same role-not-implementation rule as the FE components — a game-specific `clue_context_test.sql` doesn't repeat the schema name.

Each test file follows the pgTAP shape from `create_game_test.sql` (the tutorial file for tinyspy tests; `clubs_test.sql` plays the same role for common tests): `begin / set search_path = <schema>, common, public, extensions / plan(N) / ...assertions... / finish() / rollback`. The transaction wrapping means tests don't have to clean up after themselves.

## Realtime channel names

Pattern: `<schema>:<table>:<id>` or `<schema>:<id>` for game-scoped channels.

Examples:

- `tinyspy:games:<game_id>` — anyone watching one tinyspy game's row
- `tinyspy:chat:<game_id>` — chat messages for one tinyspy game

Per-effect-run unique suffixes (for React StrictMode safety) still apply — see [`src/hooks/useGame.ts`](../src/hooks/useGame.ts) for the canonical pattern.

## Clubs: the common social layer

A **club** is a persistent group of people who play games together — "moth+joel club", "joel+leah+paul club". Clubs span games: a club might play tinyspy on Monday and boggle on Friday, and the same friendship/conversation persists across both. Clubs are a purely common concept; no game schema references them in the reverse direction.

The data lives in `common`:

- `common.clubs` — id, name, created_at
- `common.club_members` — `(club_id, user_id, role)`
- `common.messages` — `(club_id, user_id, content, created_at)` — chat keyed by club, not by any game

Games **reference** clubs, not the reverse:

- `tinyspy.games.club_id → common.clubs.id` — the match is being played by this club
- `boggle.games.club_id → common.clubs.id` — same idea

This direction matters for removability: dropping `tinyspy` cascades through `tinyspy.*` (including the FK column), but `common.clubs` and `common.messages` are untouched. The chat history survives the game's removal — which matches reality, because the conversation outlived any one match anyway.

## Chat: per-game now, common-keyed-off-clubs later

Eventually chat is keyed off `club_id` and lives entirely in `common` (UI + table + RPC). Until clubs ship, chat lives **in each game's schema** because game-membership is the only thing we can authorize against:

- `tinyspy.messages`, `tinyspy.send_message` — for the current refactor.
- The chat UI is still shared (`common/components/ChatMessage.tsx`, `common/components/ChatPanel.tsx`) and the hook still takes a `db` handle — only the table location is per-game during the interim.

This trades a future drop-and-recreate for structural cleanliness now. The alternative — `common.messages` FK'd to `tinyspy.games` — would force common to call `tinyspy.is_player_in_game(...)` from its RLS policy, breaking the "common doesn't reference game schemas" rule and silently breaking removability (drop tinyspy → policy lost → messages unreadable).

When clubs land, the chat migration is a drop-and-recreate, not a backfill: `drop table tinyspy.messages; drop function tinyspy.send_message;` and create `common.messages` + `common.send_message` keyed off `club_id`. We don't preserve existing chat data — the production wipe between now and the multi-game launch makes preservation a non-goal.

Other cross-game features that will follow the eventual common+clubs pattern:

- **Friends** — `common.friends` (or absorbed into 1:1 clubs later)
- **Profiles** — `common.profiles` (already there)
- **Presence** — `common.presence` keyed off user, or off club for "who's around to play"
- **Invites to play** — `common.invites` referencing a `club_id` + an opaque `game_id` string, dispatched by the FE to the right game's join flow

## Drop-a-game recipe

For maintainers removing a game from a deployed instance:

1. `delete from supabase/functions/<game>-*` directories.
2. Delete `src/<game>/` and the game's line in `src/games.ts`.
3. Delete `supabase/migrations/*_<game>_*.sql` files (if you also want them gone from the migration history; safe only if not yet applied to any environment you care about).
4. Write a final migration: `drop schema <game> cascade;` — this removes tables, RPCs, policies, and the chat table all at once. Cascade is safe because nothing in `common` or other game schemas may reference it (the import rules guarantee this).
5. Remove the schema from `[api].schemas` in `supabase/config.toml`.
6. `npm run types:gen` to refresh the generated FE types.

Step 4's `drop schema ... cascade` being safe is the payoff of the structural discipline — there's no "but wait, common.friends references tinyspy.profiles" to worry about, because that's exactly what the rules forbid.

For forkers starting fresh and wanting to skip a game entirely: do steps 1–3 only; steps 4–5 don't apply because the schema was never created.

## Open questions

Things we haven't decided yet — revisit as they come up:

- **Auth/profile screens.** Currently in `src/components/`; will move to `src/common/components/` during the refactor.
- **Generating the ESLint config from `src/games.ts`.** A tiny script could keep the `no-restricted-imports` patterns in sync with the games list automatically. Worth it once we have ≥3 games.
- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC — but the *shape* of that RPC is TBD until we have two games to compare.
- **Friends vs. 1:1 clubs.** Once clubs exist, a 2-person club may make `common.friends` redundant. Or friends stays as a lightweight "would play with" graph and clubs are the persistent rooms that form from it. Decide when clubs ship.
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, this section gets revisited.
