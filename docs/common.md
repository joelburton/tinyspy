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

## Solo and multiplayer play — both live in clubs

The architecture treats solo and multi-player uniformly: **every game has a club, and "solo" just means a club with one member.** There is no separate solo-game code path, no nullable-`club_id` sentinel, no `solo_games` table — solo is a club-size case of the same flow.

Concretely:

- Every game's `games` table has `club_id NOT NULL`. The FK is to `common.clubs`; there is no "solo" alternative.
- Each user gets a **solo club** (handle `=<username>`) auto-created at first sign-in by the `handle_new_user` trigger. The solo club is the venue for that user's solo play — when a future gametype plays naturally as 1-player (a single-player boggle puzzle, a daily crossword), the user enters their solo club and starts it there. Same shell, same routing, same `create_game` RPC.
- Game-internal logic (score reports, replay history, board generation) is the same regardless of club size.
- A gametype's supported player-count range is declared on its manifest (`numberOfPlayers: [min, max | null]`). The shell decides whether to surface "Start X" in a given club by checking the range against the club's member count. Tinyspy `[2, 2]` never appears in a solo club; psychic-num and wordknit (both `[1, null]`) appear in both solo and multi-member clubs; a future game with `[3, 5]` would only appear in clubs sized 3-5. ClubPage hides the button entirely when there's no `clubs_gametypes` row, and disables it with a tooltip when the row exists but the count is out of range — see `playerCountFits` / `playerCountLabel` in `src/common/lib/games.ts`.
- Mode-specific UX, where it exists (a game that asks "cooperative or competitive?" only when multi-player), lives inside that game's setup form — same `setup jsonb` pattern as the existing setup options. The form's body is free to render different fields based on the mode choice; the shell doesn't notice.

The "every game has a club" invariant earns its keep on the **stats** axis: per-club aggregates (history, win-rate, recent activity) join cleanly on `club_id` without a solo-records sidecar. Your solo club's stats *are* your solo stats by virtue of you being its only member. The orthogonality lives in the data shape, not in a forked solo-vs-club code path.

Tinyspy's `club_id NOT NULL` and 2-member requirement aren't an exception to this rule — they're just where its `[2, 2]` player-count range lands. Same shape as any other gametype.

## Schema: `common.*`

### Tables

| table | purpose |
|---|---|
| `profiles` | One row per auth user. Holds `username` (unique). Materialized by the `handle_new_user` trigger on first sign-in; persists across sign-out. Cascades from `auth.users`. |
| `clubs` | A fixed-membership room formed by one creator. `handle` (unique, URL-safe) drives `/c/<handle>` routes. Solo clubs use the reserved handle `=<username>` so user-typed names can't collide. |
| `clubs_members` | M2M between clubs and profiles. Membership is fixed at creation in v1 — no add/remove RPCs. The relational shape exists because (a) it's the right model and (b) future member-listing UI wants it. |
| `gametypes` | The registered-gametype list (`(gametype text PK)`). Authoritative SQL-side mirror of `src/games.ts`. Each gametype's baseline migration registers itself with an `INSERT ... ON CONFLICT DO NOTHING`. Used by `handle_new_user` / `create_club` to populate `clubs_gametypes` for newly-created clubs. Permissive SELECT — gametype identifiers aren't sensitive. |
| `games` | The universal game-record header. One row per game-playing across all gametypes. Holds `club_id`, `gametype`, `title`, `is_active`, `status_summary` jsonb, `started_at`, `ended_at`. Per-gametype detail (board, secret, current turn) lives on `<gametype>.games`, which shares an id with this row via FK. The `title` is a short human-readable label built by each gametype's `create_game` at insert time (see [Title formulas](#title-formulas)) — the FE renders it as `"<gametypeName>: <title>"` in club game lists. |
| `game_players` | M2M between games and profiles, recording who played each game. Frozen at game-create time — distinct from `clubs_members`, which is current membership of the club. The `result jsonb` column carries each player's outcome (won/lost flag, score, etc.), populated by `common.end_game` at terminal transition. |
| `clubs_gametypes` | M2M between clubs and gametypes. Row existence answers "is this club allowed to play this gametype?" — the FE filter for which Start buttons to surface in a club. v1 populates this with every registered gametype at club-creation time (in both `handle_new_user` for solo clubs and `create_club` for regular clubs); per-club opt-out is deferred behind a future club-settings UI. |
| `messages` | Per-club chat. Single persistent thread per club, spans games and gametypes within the club's lifetime. The 1–1000 character constraint matches what game-scoped chat used to have, before chat moved to common. |

### The is_active flag on common.games

`common.games.is_active` carries the **one active game per club, across all gametypes** invariant. Two things to keep in mind:

1. **A partial unique index on `(club_id) where is_active = true`** is what enforces the invariant. The index only contains the active rows; multiple `is_active=false` rows per club are fine (the index doesn't index them). A second `is_active=true` row for the same club would raise `unique_violation` — which would be a `common.create_game` bug, since that RPC explicitly flips the prior active row off before inserting the new one.

2. **Starting a new game auto-suspends whatever was previously active.** `common.create_game` does `UPDATE common.games SET is_active = false WHERE club_id = X AND is_active = true` before inserting the new row with `is_active = true`. The previously-active game's `is_active` flips to false; its `<gametype>.games.status` stays as it was (non-terminal). "Suspended" is the club-level state derived from `is_active = false AND ended_at IS NULL`.

The auto-suspend behavior is felt on the FE side via realtime: when `common.games` changes for this club, every member's UI subscribes and navigates them into the new active game (if the new row has `is_active = true`). See [`ClubPage`](#frontend) for the auto-nav handler.

(An earlier iteration had a separate `club_active_game` pointer table. That table's three roles — mark which game is active, enforce one-active-per-club, drive realtime auto-nav — all collapsed onto `common.games.is_active` once `common.games` itself existed.)

### Title formulas

`common.games.title` is `not null` and `length(trim(title)) > 0`-checked. Each gametype's `create_game` builds the value at insert time and passes it as the `title` argument to `common.create_game`. Choosing a formula is a per-gametype call — there's no universal-good answer ("just list the players" fails inside a single club where every game has the same 2-3 players). Current formulas:

| gametype | formula | rationale |
|---|---|---|
| wordknit | `"#<source_id> <nyt_date> (<TILE1>/<TILE2>)"` where TILE1/TILE2 are the first 2 alphabetical tiles | Each puzzle's NYT number + date is the canonical identity; the 2 tiles ground it in something memorable ("oh, the one with BUCKS and HAIL"). Built at create_game time from the chosen `wordknit.puzzles` row. |
| psychic-num | the target number as text (`"7"`) | Toy game, target is meant to be revealed in the title — the column-level grant hiding `psychicnum.games.target` from authenticated SELECT stays as the educational example of the column-grant pattern, but in practice the title leaks it anyway. |
| tinyspy | `"<seatA-username>-v-<seatB-username>: <4 picked words>"` | Two-player invariant means seats are stable; the words anchor recognizing one game vs. another in a club's history. |

The "no gametype in the title" rule: titles never embed `"Wordknit"` / `"Tinyspy"` etc. because the FE always prefixes the gametype name from the manifest. Doubled prefixes (`"Wordknit: Wordknit puzzle..."`) would look silly.

### Three-state game lifecycle

Game instances within a club have three derived states. None of them are columns by themselves; they're functions of `(is_active, ended_at)`:

| club-level state | derivation |
|---|---|
| **active** | `is_active = true` (implies `ended_at IS NULL`) |
| **suspended** | `is_active = false AND ended_at IS NULL` |
| **completed** | `ended_at IS NOT NULL` |

The active → completed transition happens inside `common.end_game`, which sets `ended_at = now()`, populates `status_summary`, and flips `is_active = false`. The active → suspended transition happens inside `common.create_game` for the prior active row when a new game is started (overwriting the active slot via the partial unique index).

### Solo clubs

Every user gets a solo club on first sign-in, materialized by the `handle_new_user` trigger. The solo club's `handle` is `=<username>` — the `=` prefix lives in a slug-space user-typed names can't reach, because `slugify_club_name` strips `=` along with other non-alphanumerics.

Solo clubs are intended as the anchor for solo-game-mode play (boggle, crosswords) and per-user stats. The FE hides them from the regular clubs list — they're visible to their owner but not surfaced as a navigation target. Most game logic doesn't distinguish solo clubs from regular ones; the `club_id` is just non-null in both cases.

Wordknit and psychic-num both have `numberOfPlayers: [1, null]`, so both appear as Play-solo buttons on the HomePage's solo-games section (keyed on the user's solo club). Tinyspy stays multi-member-only by virtue of its `[2, 2]` range. The HomePage's filtering logic is the same as ClubPage's: intersect the manifest range with the solo club's `clubs_gametypes` rows and show what fits.

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
| `common.handle_new_user()` | Trigger on `auth.users` insert. Materializes a `profiles` row + a solo club + `clubs_gametypes` rows for every gametype in `common.gametypes`. A username collision (unique constraint) aborts sign-in entirely. |
| `common.is_club_member(target_club uuid) → boolean` | Security-definer RLS helper. Used by every `common.*` table's SELECT policy. Marked `stable` so Postgres can cache it within a SELECT — the RLS layer calls it once per row otherwise. |
| `common.slugify_club_name(name text) → text` | Lowercase → non-alnum to `-` → trim → cap at 40 chars. Strips `=` along the way, which is what keeps user-typed names from producing solo-club handles. |

### Game-RPC helpers (called by per-game RPCs)

These exist so per-game `create_game` / `submit_*` RPCs stay focused on game-specific mechanics and don't independently re-implement the cross-cutting gates. All three are security-definer and revoked from public (no grant to `authenticated`) — they're callable only from within other security-definer RPCs in the same database, where SECURITY DEFINER chains let the call succeed without an explicit grant to the session user. They're still visible in the generated `Database` types because PostgREST inspects the catalog, but FE invocation gets `permission denied`.

| function | role |
|---|---|
| `common.require_club_member(target_club uuid) → uuid` | Combined auth + membership gate. Raises `42501 'must be authenticated'` if `auth.uid()` is null, or `42501 'not a member of this club'` if the caller isn't in `clubs_members`. Returns the caller's `user_id` — most RPCs need it for downstream inserts. Use at the top of every `create_game` and in mid-game RPCs (after the row lookup for the case where the club_id comes off the game row, e.g. `submit_guess`). |
| `common.validate_timer(timer_obj jsonb) → void` | Canonical timer-shape validation. Argument is the timer *subobject* (typically `setup->'timer'`), not the full setup blob, so the helper doesn't assume a specific nesting. Raises `P0001` with `setup.timer.*`-prefixed messages: `is required` (null), `kind is required` (missing kind), `kind must be none, countup, or countdown (got X)`, `seconds is required for countdown`, `seconds must be 1..3600 (got X)`. Use in every gametype's `create_game` that exposes a timer setup option. |
| `common.create_game(target_club uuid, gametype text, player_user_ids uuid[], title text) → uuid` | The common (header) half of starting a new game. Auth + caller club-membership check, validates every uid in `player_user_ids` is in `clubs_members`, clears the prior active game for this club (UPDATE is_active=false), inserts the new `common.games` row with `is_active = true` and the passed `title`, inserts one `common.game_players` row per uid. Returns the new game id. Each gametype's `<gametype>.create_game` builds its title per the formulas above, calls this, then inserts its detail row using the returned id. |
| `common.require_game_player(target_game uuid) → uuid` | Auth + game-player gate. Raises `42501 'must be authenticated'` if `auth.uid()` is null, or `42501 'not playing this game'` if the caller isn't in `common.game_players` for the target game. Returns the caller's `user_id`. Use in mid-game RPCs (submit_guess, submit_clue, etc.) where the question is "is this caller actually playing this game" — finer than just club-membership. |
| `common.end_game(target_game uuid, status_summary jsonb, player_results jsonb) → void` | The terminal-transition counterpart. Sets `ended_at = now()`, `status_summary` on `common.games`, flips `is_active = false`, and writes each player's `result` jsonb from `player_results` (keyed by user_id). Use at the moment a gametype's RPC decides the game is over (4 mistakes in wordknit, assassin in tinyspy, etc.). |

Canonical pattern for a new gametype's `create_game`:

```sql
create function <gametype>.create_game(target_club uuid, setup jsonb)
returns table(id uuid)
language plpgsql security definer
set search_path = <gametype>, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
begin
  caller_id := common.require_club_member(target_club);

  -- gametype-specific setup validation (e.g. setup.foo + setup.bar)
  perform common.validate_timer(setup->'timer');  -- when this gametype has a timer

  -- gametype-specific board generation + game-row insert
  insert into <gametype>.games (...) values (...) returning id into new_id;

  -- (set_club_active_game is gone — common.create_game above already
  -- inserted the row with is_active=true.)

  return query select new_id;
end;
$$;
```

Tests for the helpers live in [`supabase/tests/common/helpers_test.sql`](../supabase/tests/common/helpers_test.sql).

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
- `clubs_members` — roster changes (deferred to v2, but free)
- `games` — new games (INSERT with is_active=true) and end_game (UPDATE flipping is_active to false) drive the "every member follows the active game" auto-nav. Also: `status_summary` writes update the club's games list.
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
      HomePage.tsx         Landing — your clubs list + create-club link + Play-solo buttons
      CreateClubPage.tsx   The club-creation form
      ClubPage.tsx         A specific club's room — roster, games sections, chat, "Start X" buttons
      ClubChatPanel.tsx    Reused chat panel; mounted once by GamePage (not by each game's PlayArea)
      ClubGameCard.tsx     One card for an active / suspended / completed game entry on ClubPage.
                           Per-state CSS treatments live in ClubGameCard.module.css.
      StartGameButtons.tsx Shared between ClubPage and HomePage. Takes filtered `games`,
                           `memberCount`, `getLabel`, `starting`, `onStart`.
      GamePage.tsx         The route-level shell mounted by App.tsx for /g/<gametype>/<id>.
                           Renders the header (title from common.games.title, timer, Pause,
                           Back-to-club), wraps children in PauseBoundary, mounts
                           ClubChatPanel. Children are a render-prop receiving a
                           GamePageCtx ({ session, gameId, members, timer }) — the
                           gametype's PlayArea is mounted as that child. Fires per-gametype
                           submitTimeout via manifest dispatch on countdown expiry.
      TimerField.tsx       The shared None / Up / Down radio + MM:SS input used by wordknit and
                           psychic-num setup forms. Tokens in TimerField.module.css.
      LoginScreen.tsx      Magic-link sign-in
      SetupGameDialog.tsx  Modal wrapper around per-game setup forms (one per gametype)
      PauseBoundary.tsx    Wraps a game's play area; conditionally renders children OR
                           PauseOverlay based on the paused flag (children UNMOUNT on
                           pause — no visibility-hidden). Mounted by GamePage. See the
                           "should this survive a pause?" rule below.
      PauseOverlay.tsx     The dim-overlay UI when a game is paused. Adapts copy to
                           presence-pause / manual-pause / both. Includes the Resume
                           button for the manual-pause case.
    hooks/
      useSession.ts        Auth session subscription
      useClubChat.ts       Subscribes to a club's chat log
      useGameTimer.ts      Browser-side countdown / count-up timer hook. Anchors at
                           a server-stamped startedAt, ticks locally via
                           useSyncExternalStore, observes a paused flag. See
                           docs/wordknit.md → "Timer" for the design rationale.
      useCommonGame.ts     The cross-cutting per-game hook every gametype uses. Owns the
                           common.games row, common.game_players + profile usernames
                           (`members`), presence + manual-pause broadcasts (`paused`,
                           `missing`, `manuallyPausedBy`, `sendManualPause`,
                           `sendManualUnpause`), and the timer (via useGameTimer against
                           common.games.setup.timer). Opens a stable channel named
                           `game:${gameId}`. `paused` short-circuits to false once
                           common.games.ended_at is non-null — terminal games never
                           render the pause overlay even if a stale-tab peer is still
                           broadcasting. Per-game useGame hooks no longer own any of
                           this — they subscribe to their own per-tab UUID-suffixed
                           channel for postgres-changes only.
    lib/
      supabase.ts          The supabase client (browser SDK)
      router.ts            Hand-rolled router — usePath() hook + navigate() function (~40 lines)
      Link.tsx             Path-based link component; cmd-click passes through to the browser
      games.ts             GameManifest type, TimerMode type, playerCountFits /
                           playerCountLabel helpers
      pause.ts             computePause helper — pure derivation of
                           { paused, missing } from presentUserIds + members
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
| `/g/<gametype>/<gameId>` | `<GamePage>` with the manifest's `PlayArea` (lazy-loaded chunk) as its render-prop child |
| anything else | `HomePage` (forgiving fallback, not a 404) |

The `/g/<gametype>/<gameId>` shape is what makes multi-game routing work: App.tsx mounts `<GamePage>` directly with the manifest's lazy `PlayArea` as its render-prop child, keyed by `gameId` so navigation between games remounts cleanly (fresh state, no leaked subscriptions).

`<GamePage>` is the route-level shell — it owns the cross-cutting chrome (header / timer / Pause / Back-to-club, `<PauseBoundary>`, `<ClubChatPanel>`) and calls `useCommonGame` for the cross-cutting state. The per-game `PlayArea` receives `{ session, gameId, members, timer }` (the `GamePageCtx` type exported from `src/common/lib/games.ts`) as props through the render prop. The per-game `useGame` is now just the postgres-changes subscription for that gametype's own tables.

**"Should this survive a pause?" is the rule that decides where state lives.** Because `PauseBoundary` unmounts its children on pause, anything inside the per-game `PlayArea` (component state, `useGame`-local state, form input) resets every time the game pauses. That's deliberate UX — clean slate on resume. State that *must* survive a pause goes either in the DB or in `useCommonGame` above the boundary (members, presence, the timer's pause-accumulator). State that's specifically transient (wordknit's shared-tile selections, an in-flight submit form) lives in PlayArea and clears naturally on unmount.

Why hand-rolled instead of react-router: the app has five routes, flat structure, no need for loaders or nested layouts. react-router adds 30–50 KB and a learning curve for what we'd write in ~40 lines.

### The game registry

The shell never imports a specific game. It iterates a registry:

```ts
// src/games.ts — the ONE file that lists games
import { tinyspyGame } from './tinyspy/manifest'
import { psychicnumGame } from './psychicnum/manifest'
import { wordknitGame } from './wordknit/manifest'

export const games: GameManifest[] = [tinyspyGame, psychicnumGame, wordknitGame]
```

Each gametype's manifest implements [`GameManifest`](../src/common/lib/games.ts):

| field | role |
|---|---|
| `gametype` | URL-safe identifier; matches the Postgres schema name by convention. The `<gametype>` segment in `/g/<gametype>/<id>` looks this up. |
| `schema` | Postgres schema where the game's tables and RPCs live. Same as `gametype` today, but kept as a separate field in case they ever diverge. |
| `name`, `blurb` | Human-readable. Used in pickers and titles. |
| `numberOfPlayers` | `[min, max \| null]` — the supported player-count range. ClubPage uses this to decide between hidden / disabled / enabled for each game's Start button. `null` upper bound means "no maximum." |
| `PlayArea` | Lazy-loaded React component, `ComponentType<GamePageCtx>`. App.tsx mounts `<GamePage>` for `/g/<gametype>/<id>` URLs and renders this as the render-prop child. (Replaces the old `Root` field; per-game `Root.tsx` files are gone — per-game `theme.css` imports moved into `PlayArea.tsx`.) |
| `setupForm` | `{ Component, defaults } \| null` — the per-game setup-form *definition*: the lazy-loaded body component + the initial setup value. `null` for games whose start needs no choices; the dialog is then bypassed entirely. (The *output* of the form lands on `<gametype>.games.setup`; same root word, different role — see [docs/naming.md](naming.md).) |
| `timerMode` | Optional `TimerMode` declaration: `{ kind: 'none' \| 'countup' } \| { kind: 'countdown', seconds: number }`. Consumed by `useGameTimer` (via `useCommonGame`) — for **fixed per-gametype** timers (e.g., a hypothetical Boggle with a 3-minute round). Today no game uses this field; wordknit and psychic-num both put the timer on per-game setup instead (stored on `common.games.setup.timer`, picked in the setup dialog via the shared `<TimerField>` component in `src/common/components/`). The field is preserved for the per-gametype-constant case. |
| `submitTimeout(gameId)` | Async. Called by `<GamePage>` on countdown expiry. Each gametype dispatches to its own per-game `submit_timeout` RPC (psychicnum and wordknit do; tinyspy currently no-ops because it has no setup-side timer). Returns `{ error? }`. |
| `startGameInClub(clubId, setup)` | Async. Called by the SetupGameDialog (or directly by ClubPage when `setupForm: null`). Receives the dialog's collected setup payload. Returns `{id}` on success or `{error}` on failure. |
| `fetchClubGames(clubId)` | Async. Returns the gametype's games for a club, for the club page's active/suspended/completed list. |

Adding a game is one line in `src/games.ts` plus the new folder. Removing a game is one line removed plus `rm -rf` the folder plus dropping the schema. Nothing else in the codebase names a specific game.

ESLint enforces the import-direction rules; see [`eslint.config.js`](../eslint.config.js) for the `no-restricted-imports` configuration. `GAMETYPES` in that file is the source of truth for which folders count as games.

### ClubPage's auto-nav

The most interesting piece of common-side game state is in [`ClubPage.tsx`](../src/common/components/ClubPage.tsx)'s realtime subscription on `common.games` filtered by club_id. When a row INSERTs or UPDATEs with `is_active = true` (a member started a game or switched the active one), every member subscribed to the club is automatically navigated to the new active game's URL.

This is the FE-side enforcement of the club invariant **"all members play together"**. When the club's active game changes, every member's UI follows.

DELETE events (game completion, future explicit suspend) do NOT navigate anyone — players already in the game stay on the game-over screen; players on the club page see the game move from Active to Completed in the list. The `if (window.location.pathname !== target)` guard prevents the member who initiated the change (and was already navigated by `startGameInClub`) from getting a duplicate history entry when their own INSERT echoes back over realtime.

## Theme & styling

Conventions live in [`code-conventions.md`](code-conventions.md); the short version:

- **CSS Modules**, one `*.module.css` per component, co-located with the `.tsx`.
- **Design tokens at `:root`** in [`src/common/theme.css`](../src/common/theme.css) — colors, spacing, font stack, radii. All other CSS references these via `var(--token-name)`.
- **Per-game themes are optional.** Each game may have its own `theme.css` that overrides tokens for that gametype's palette. Tinyspy has one (greens, reds, neutrals). Psychic-num doesn't (deliberately styling-free).
- **Utility classes** in `common/theme.css` for the things every screen needs: `.card`, `.muted`, `.error`, `.actions`, `.link-button`. No CSS framework.

`cls()` (in [`src/common/lib/cls.ts`](../src/common/lib/cls.ts)) is a tiny hand-rolled `clsx` equivalent for combining conditional class names. ~10 lines; no dependency.

## Auth & magic links

Auth is email-based magic links via `supabase.auth.signInWithOtp`. Custom SMTP (Resend) for the actual delivery, because Supabase's free-tier mail is rate-limited.

The sign-in email contains **both** a clickable magic link AND a 6-digit code. Two verification paths land at the same session:

- Click the link — Supabase's redirect URL exchanges it for a session and lands back at `window.location.origin`.
- Enter the 6-digit code in the LoginScreen's "I have a code" form — calls `verifyOtp({type: 'email'})` to exchange the code on the current device.

The code path is what makes cross-device sign-in work: open the email on your phone, type the code on your laptop. Either path emits `SIGNED_IN`, which `useSession` is subscribed to.

On first sign-in, the `auth.users` row triggers `handle_new_user`, which materializes a `profiles` row + a solo club. The username is derived from the email's local-part (`bob@foo.com → "bob"`). Username collision aborts the sign-in entirely — accepted under the alpha-software prior; a picker UI is deferred until the auth-method question is settled.

[`useSession`](../src/common/hooks/useSession.ts) subscribes to `supabase.auth.onAuthStateChange` and returns `{session, loading}`. It's a thin wrapper, with one non-thin hop: every restored session is checked against `common.profiles` to make sure the user's profile row still exists. The JWT in localStorage stays signature-valid even after the user is gone (a local `supabase db reset` during dev, or an admin-deleted user in prod), and PostgREST will happily let the stale JWT through until a write trips the user_id FK. The verify-and-sign-out catches it on restore.

## Common testing

See [`testing.md`](testing.md) for the full theory. Common-layer specifics:

- **`supabase/tests/common/clubs_test.sql`** — exercises slugify, `create_club`'s reject paths, solo-club auto-creation, and the RLS hide-from-non-member check. Touches everything in this layer.
- **`supabase/tests/common/chat_test.sql`** — exercises `send_message` and the messages RLS, standalone (no game). Validates that the chat plumbing works regardless of which game is being played.

There are no FE tests covering routing as a whole (no E2E in this project), but the router's own contract is unit-tested in [`src/common/lib/router.test.ts`](../src/common/lib/router.test.ts) — `usePath` reacts to `navigate()` and to native back/forward; `navigate(to)` pushes; `navigate(to, true)` replaces.

## Deferred / open

See also [`deferred.md`](deferred.md) for the aggregated cross-feature register.

- **`common.club_games` denormalized index.** Trigger-maintained roll-up across game schemas, for the cross-game aggregate queries (sort + paginate across all games, "most recent activity"). Not built; the registry-dispatch `fetchClubGames` is fine at current scale.
- **Friends / presence.** The "you already know your friends" framing currently makes them unnecessary; revisit if and when the audience grows.
- **Per-club stats.** Solo clubs are the planned anchor for per-user stats. Schema not built; no UI surface yet.
- **Club-level game-list editor.** Today every newly-created club is auto-populated with every registered gametype in `common.clubs_gametypes` (via `handle_new_user` / `create_club`). No UI lets a club opt out of a gametype, and new gametypes registered after a club's creation don't auto-add to existing clubs (DB-admin INSERT handles that under the alpha prior). See `deferred.md` for the rollout idea.
