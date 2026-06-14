# Common

Everything in the codebase that isn't a specific game. The cross-cutting layer that every game sits on: profiles, clubs, chat, routing, the game registry, theme tokens, the shell. Read this before touching anything that's used by more than one gametype.

For per-gametype reference docs, see [`tinyspy.md`](tinyspy.md), [`psychicnum.md`](psychicnum.md). Testing conventions live in [`testing.md`](testing.md).

## What "common" means here

Common is **the layer beneath the games, never beside them**. The structural rule the codebase enforces, both by convention and by ESLint, is:

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/games.ts` is the one exception — it imports every game's manifest by definition.

The payoff is the **removability invariant**: any game must be removable in three actions (delete its folder, delete its line from `src/games.ts`, drop its schema). If common ever depended on a specific game, removing that game would break common — which would mean it wasn't really common. Every rule in this doc supports this invariant.

This applies on the database side too: the `common` schema must not reference any game schema. Game schemas reference common (`tinyspy.games.club_id → common.clubs.id`), never the reverse.

## Solo and multiplayer modes — keep them orthogonal

The architecture supports two modes of play: **solo** (a single user playing alone) and **multiplayer** (a club's members playing together). The directive for any new gametype: **the same code and tables should handle both modes wherever possible** — avoid forked code paths or duplicated tables for "solo version" vs "club version."

Concretely:

- A game's `games` table should accommodate both with a nullable `club_id` (null = solo, non-null = club-played) rather than separate `solo_games` / `club_games` tables.
- Score reports, replay history, board generation, and any other game-internal logic should be the same code regardless of mode.
- Mode-specific behavior lives at the **edges**: RLS (who can see the game), the entry flow (who can join), the post-game screen (invite-club-to-rematch vs. play-again-alone).

Tinyspy is the structural exception that proves the rule — its `club_id` is `not null` because Codenames Duet is intrinsically a 2-player game. Psychic Num's `club_id` is also `not null` today, but only because no solo-mode UI has been wired up yet (the RPCs would work fine with any club size). A future Boggle's `club_id` should be nullable from day one because Boggle plays naturally in both modes.

Solo clubs (handle `=<username>`) exist as the anchor for solo play — even "solo" play in this codebase technically happens *inside* a club, just one with a single member. That's what lets per-user stats and history tables join cleanly on `club_id` without a separate "solo records" table.

## Schema: `common.*`

### Tables

| table | purpose |
|---|---|
| `profiles` | One row per auth user. Holds `username` (unique). Materialized by the `handle_new_user` trigger on first sign-in; persists across sign-out. Cascades from `auth.users`. |
| `clubs` | A fixed-membership room formed by one creator. `handle` (unique, URL-safe) drives `/c/<handle>` routes. Solo clubs use the reserved handle `=<username>` so user-typed names can't collide. |
| `club_members` | M2M between clubs and profiles. Membership is fixed at creation in v1 — no add/remove RPCs. The relational shape exists because (a) it's the right model and (b) future member-listing UI wants it. |
| `club_active_game` | Pointer table. PK on `club_id` alone (not on `(club_id, gametype, game_id)`) is what enforces the **one active game per club, across all gametypes** rule. Presence of a row → club has an active game; absence → nothing is active. |
| `messages` | Per-club chat. Single persistent thread per club, spans games and gametypes within the club's lifetime. The 1–1000 character constraint matches what game-scoped chat used to have, before chat moved to common. |

### The club_active_game pointer

This table is the most architecturally interesting piece of `common`. Two things to keep in mind:

1. **`(game_id, gametype)` is a soft FK.** The real FK can't be declared because the target schema varies per row — `tinyspy.games(id)` for tinyspy rows, `psychicnum.games(id)` for psychic-num rows, etc. Cleanup of orphan rows when a gametype is dropped is part of the drop-a-game recipe, not enforced by referential integrity.

2. **The `pk(club_id)` is load-bearing.** With it, starting a new game upserts the row, which auto-pauses whatever was previously active — by simply overwriting the pointer. The previously-active game's internal status (`tinyspy.games.status`) is untouched; "paused" is a club-level concept derived from "this game exists but isn't pointed at by `club_active_game`."

The auto-pause behavior is felt on the FE side via realtime: when `common.club_active_game` changes, every club member's UI subscribes and navigates them to the new active game's URL. See [`ClubPage`](#frontend) for the auto-nav handler.

### Three-state game lifecycle

Game instances within a club have three derived states. None of them are columns; they're functions of `(game.status, presence-of-club_active_game-row)`:

| club-level state | derivation |
|---|---|
| **active** | game is non-terminal AND `club_active_game` points at it |
| **paused** | game is non-terminal AND no `club_active_game` row points at it |
| **completed** | game's status is terminal (won, lost, solved — depends on the gametype) |

Each gametype's termination trigger (e.g. `tinyspy.clear_active_on_termination`, `psychicnum.clear_active_on_termination`) deletes the matching `club_active_game` row when a game flips to a terminal status. This is what makes a completed game stop being "active" automatically.

### Solo clubs

Every user gets a solo club on first sign-in, materialized by the `handle_new_user` trigger. The solo club's `handle` is `=<username>` — the `=` prefix lives in a slug-space user-typed names can't reach, because `slugify_club_name` strips `=` along with other non-alphanumerics.

Solo clubs are intended as the anchor for solo-game-mode play (boggle, crosswords) and per-user stats. The FE hides them from the regular clubs list — they're visible to their owner but not surfaced as a navigation target. Most game logic doesn't distinguish solo clubs from regular ones; the `club_id` is just non-null in both cases.

In v1, solo clubs are **mostly latent infrastructure**. Tinyspy requires exactly 2 club members and psychic-num requires no specific count, so neither has a meaningful solo-play surface yet. When a future game wants real solo-mode play, the solo-club already exists for it to attach to.

## RPCs

All RPCs in `common` are `security definer` and granted only to the `authenticated` role.

### `common.create_club(club_name text, member_usernames text[]) → table(id uuid, handle text)`

Atomically creates a club plus all member rows. Reject reasons:

| condition | SQLSTATE |
|---|---|
| not authenticated | `42501` |
| name slugifies to an empty handle (`"!!!"` etc.) | `P0001` |
| one or more usernames don't exist | `P0002` |
| resulting membership < 2 | `P0001` |
| handle collision with an existing club | `23505` (`unique_violation`) |

The caller is auto-added if not in `member_usernames` — a UI that lets the creator type only their friends doesn't have to remember to also include themselves.

### `common.send_message(target_club uuid, content text)`

Posts to a club's chat. Reject reasons: not authenticated, not a member, empty/whitespace-only, over 1000 chars.

Writes go through this RPC only; the table itself has no insert grant on `authenticated`.

### Helpers (not callable from the client)

| function | role |
|---|---|
| `common.handle_new_user()` | Trigger on `auth.users` insert. Materializes a `profiles` row + a solo club. A username collision (unique constraint) aborts sign-in entirely. |
| `common.is_club_member(target_club uuid) → boolean` | Security-definer RLS helper. Used by every `common.*` table's SELECT policy. Marked `stable` so Postgres can cache it within a SELECT — the RLS layer calls it once per row otherwise. |
| `common.slugify_club_name(name text) → text` | Lowercase → non-alnum to `-` → trim → cap at 40 chars. Strips `=` along the way, which is what keeps user-typed names from producing solo-club handles. |

## Row-level security

Every `common.*` table has RLS enabled with a single SELECT policy gated by `is_club_member`. Profiles is the only exception:

```sql
-- profiles_select_authenticated: any signed-in user can see any profile
using (true)
```

Profile visibility has to be permissive for club-creation lookup — when you type "leah" into the new-club form, the FE has to resolve `leah → user_id` *before* you share a club with her. The right hardening axis, if it ever matters, is column-restriction via a view (`common.profiles_public`) that exposes only the safe columns. Tightening to "rows for users I share a club with" would break the lookup.

See the comment block above the policy in [`supabase/migrations/20260612000000_common_baseline.sql`](../supabase/migrations/20260612000000_common_baseline.sql) for the longer reasoning.

There are no INSERT / UPDATE / DELETE policies anywhere in `common`. All writes go through the security-definer RPCs above.

### Realtime publication

Four club tables are in `supabase_realtime`:

- `clubs` — new club, rename
- `club_members` — roster changes (deferred to v2, but free)
- `club_active_game` — the "every member follows the active game" auto-nav rule lives on this one
- `messages` — chat

Profiles is deliberately NOT in the publication — usernames don't change during a session and the realtime traffic isn't worth it.

## Frontend

### Folder layout

```
src/
  App.tsx              Top-level shell. Auth gate + URL routing for /c/..., /g/<gametype>/<id>, /.
  main.tsx             Mounts <App>; imports common/theme.css globally.
  games.ts             THE registry — the only file allowed to import every game's manifest.
  types/db.ts          Generated by `npm run types:gen`. The single source of truth for the schema as TypeScript.

  common/
    components/
      HomePage.tsx         Landing — your clubs list + create-club link
      CreateClubPage.tsx   The club-creation form
      ClubPage.tsx         A specific club's room — roster, games sections, chat, "Start X" buttons
      ClubChatPanel.tsx    Reused chat panel; every game's BoardScreen mounts this
      LoginScreen.tsx      Magic-link sign-in
    hooks/
      useSession.ts        Auth session subscription
      useClubChat.ts       Subscribes to a club's chat log
    lib/
      supabase.ts          The supabase client (browser SDK)
      router.ts            Hand-rolled router — usePath() hook + navigate() function (~40 lines)
      Link.tsx             Path-based link component; cmd-click passes through to the browser
      games.ts             The GameManifest type
      cls.ts               Tiny class-name combiner (hand-rolled `clsx` equivalent)
    db.ts                  export const db = supabase.schema('common')
    theme.css              Global design tokens at :root + utility classes (.card, .muted, etc.)
```

### URL routing

Path-based; no hash. The hand-rolled router in [`router.ts`](../src/common/lib/router.ts) is ~40 lines: a `usePath()` hook that subscribes to `popstate`, a `navigate(to, replace?)` function that calls `pushState`/`replaceState` and dispatches a synthetic `popstate`, and a `<Link>` component that intercepts left-click and falls through for cmd/ctrl-click.

Routes the shell knows about:

| URL | what mounts |
|---|---|
| `/` | `HomePage` — clubs list + create-club link |
| `/c/new` | `CreateClubPage` |
| `/c/<handle>` | `ClubPage` |
| `/g/<gametype>/<gameId>` | The matching manifest's `Root` (lazy-loaded chunk) |
| anything else | `HomePage` (forgiving fallback, not a 404) |

The `/g/<gametype>/<gameId>` shape is what makes multi-game routing work: App.tsx looks up the manifest by gametype, then mounts its lazy `Root` with `gameId` as a prop, keyed by `gameId` so navigation between games remounts the Root (fresh state, no leaked subscriptions).

Why hand-rolled instead of react-router: the app has five routes, flat structure, no need for loaders or nested layouts. react-router adds 30–50 KB and a learning curve for what we'd write in ~40 lines.

### The game registry

The shell never imports a specific game. It iterates a registry:

```ts
// src/games.ts — the ONE file that lists games
import { tinyspyGame } from './tinyspy/manifest'
import { psychicnumGame } from './psychicnum/manifest'

export const games: GameManifest[] = [tinyspyGame, psychicnumGame]
```

Each gametype's manifest implements [`GameManifest`](../src/common/lib/games.ts):

| field | role |
|---|---|
| `gametype` | URL-safe identifier; matches the Postgres schema name by convention. The `<gametype>` segment in `/g/<gametype>/<id>` looks this up. |
| `schema` | Postgres schema where the game's tables and RPCs live. Same as `gametype` today, but kept as a separate field in case they ever diverge. |
| `name`, `blurb` | Human-readable. Used in pickers and titles. |
| `Root` | Lazy-loaded React component. The shell mounts this for `/g/<gametype>/<id>` URLs. |
| `startGameInClub(clubId)` | Async. Called by the "Start X" button on `ClubPage`. Returns `{id}` on success or `{error}` on failure. |
| `fetchClubGames(clubId)` | Async. Returns the gametype's games for a club, for the club page's active/paused/completed list. |

Adding a game is one line in `src/games.ts` plus the new folder. Removing a game is one line removed plus `rm -rf` the folder plus dropping the schema. Nothing else in the codebase names a specific game.

ESLint enforces the import-direction rules; see [`eslint.config.js`](../eslint.config.js) for the `no-restricted-imports` configuration. `GAMETYPES` in that file is the source of truth for which folders count as games.

### ClubPage's auto-nav

The most interesting piece of common-side game state is in [`ClubPage.tsx`](../src/common/components/ClubPage.tsx)'s realtime subscription on `common.club_active_game`. When the row changes (a member started a game, switched the active one, or ended a game), every member subscribed to the club is automatically navigated to the new active game's URL.

This is the FE-side enforcement of the club invariant **"all members play together"**. When the club's active game changes, every member's UI follows.

DELETE events (game completion, future explicit pause) do NOT navigate anyone — players already in the game stay on the game-over screen; players on the club page see the game move from Active to Completed in the list. The `if (window.location.pathname !== target)` guard prevents the member who initiated the change (and was already navigated by `startGameInClub`) from getting a duplicate history entry when their own INSERT echoes back over realtime.

## Theme & styling

Conventions live in [`code-conventions.md`](code-conventions.md); the short version:

- **CSS Modules**, one `*.module.css` per component, co-located with the `.tsx`.
- **Design tokens at `:root`** in [`src/common/theme.css`](../src/common/theme.css) — colors, spacing, font stack, radii. All other CSS references these via `var(--token-name)`.
- **Per-game themes are optional.** Each game may have its own `theme.css` that overrides tokens for that gametype's palette. Tinyspy has one (greens, reds, neutrals). Psychic-num doesn't (deliberately styling-free).
- **Utility classes** in `common/theme.css` for the things every screen needs: `.card`, `.muted`, `.error`, `.actions`, `.link-button`. No CSS framework.

`cls()` (in [`src/common/lib/cls.ts`](../src/common/lib/cls.ts)) is a tiny hand-rolled `clsx` equivalent for combining conditional class names. ~10 lines; no dependency.

## Auth & magic links

Auth is email-based magic links via `supabase.auth.signInWithOtp`. Custom SMTP (Resend) for the actual delivery, because Supabase's free-tier mail is rate-limited.

On first sign-in, the `auth.users` row triggers `handle_new_user`, which materializes a `profiles` row + a solo club. The username is derived from the email's local-part (`bob@foo.com → "bob"`). Username collision aborts the sign-in entirely — accepted under the alpha-software prior; a picker UI is deferred until the auth-method question is settled.

[`useSession`](../src/common/hooks/useSession.ts) subscribes to `supabase.auth.onAuthStateChange` and returns `{session, loading}`. It's a thin wrapper; the canonical example of the project's "thin hook that owns one subscription" pattern.

## Common testing

See [`testing.md`](testing.md) for the full theory. Common-layer specifics:

- **`supabase/tests/common/clubs_test.sql`** — exercises slugify, `create_club`'s reject paths, solo-club auto-creation, and the RLS hide-from-non-member check. Touches everything in this layer.
- **`supabase/tests/common/chat_test.sql`** — exercises `send_message` and the messages RLS, standalone (no game). Validates that the chat plumbing works regardless of which game is being played.

There are no FE tests covering routing as a whole (no E2E in this project), but the router's own contract is unit-tested in [`src/common/lib/router.test.ts`](../src/common/lib/router.test.ts) — `usePath` reacts to `navigate()` and to native back/forward; `navigate(to)` pushes; `navigate(to, true)` replaces.

## Deferred / open

See also [`deferred.md`](deferred.md) for the aggregated cross-feature register.

- **`common.club_game_kinds` m2m.** Per-club opt-in of which games are enabled. Not built. Every club can play every registered game in v1; the m2m table lands when "this club only plays crosswords" becomes a real request.
- **`common.club_games` denormalized index.** Trigger-maintained roll-up across game schemas, for the cross-game aggregate queries (sort + paginate across all games, "most recent activity"). Not built; the registry-dispatch `fetchClubGames` is fine at current scale.
- **Friends / presence.** The "you already know your friends" framing currently makes them unnecessary; revisit if and when the audience grows.
- **Per-club stats.** Solo clubs are the planned anchor for per-user stats. Schema not built; no UI surface yet.
