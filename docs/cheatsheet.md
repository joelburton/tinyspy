# Cheatsheet

Quick reference for reading the code and driving the project. See [`../README.md`](../README.md) for narrative and [`naming.md`](naming.md) for the project-wide conventions; this file is the one-screen lookup.

## `npm run …`

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | type-check (`tsc -b`) + production bundle into `dist/` |
| `npm run lint` | ESLint on `src/` (includes the cross-feature import-direction rules) |
| `npm test` | run **all** tests — FE first, then DB |
| `npm run test:fe` | Vitest only; add `-- --watch` for the dev loop |
| `npm run test:db` | pgTAP only (needs Docker + the local Supabase stack) |
| `npm run db:reset` | wipe the local DB and replay every migration + seed |
| `npm run db:diff` | show what the local schema has that migrations don't |
| `npm run db:lint` | Supabase's schema linter — warnings + errors |
| `npm run types:gen` | regenerate `src/types/db.ts` from the live local schema |
| `npm run deploy` | full prod push: `supabase db push` → `supabase functions deploy` (all functions) → `vite build` → `netlify deploy -p -d dist` |

`types:gen` and `db:lint` set `SUPABASE_ACCESS_TOKEN=local` as a workaround for a CLI 2.x quirk; you don't need to set it yourself when running those scripts.

## `supabase …`

```
supabase start                                  # boot the local Docker stack
supabase stop                                   # tear it down (data persists)
supabase status                                 # ports, URLs, anon/publishable keys
supabase status -o env                          # same but env-format for scripts
```

### Migrations & schema

```
supabase migration new <name>                   # create a timestamped empty .sql file
supabase migration list --linked                # which migrations are applied on prod
supabase db reset                               # local: drop, replay migrations + seed
supabase db diff                                # show drift between local and migrations
supabase db push                                # apply pending migrations to the linked project
supabase db push --dry-run                      # preview what would be applied (recommended first!)
supabase db lint --local --level warning        # static schema checks
supabase db dump --local --schema common        # dump one schema as SQL
```

### Codegen, testing, linking

```
supabase gen types typescript --local           # → stdout; piped into src/types/db.ts
supabase test db --local supabase/tests         # pgTAP suite (recurses into subfolders)
supabase test db --local supabase/tests/tinyspy/create_game_test.sql   # one file
supabase link --project-ref <ref>               # tie this checkout to a hosted project
supabase login                                  # one-time browser-based auth
```

### Edge Functions

```
supabase functions serve <name>                 # local hot-reload runtime
supabase functions deploy <name>                # ship to the linked project
supabase functions list                         # what's deployed on prod
supabase secrets set KEY=value                  # set a secret in prod runtime env
supabase secrets list                           # see what secrets are set (names only)
```

Local-only secrets live in `supabase/functions/.env` (gitignored). Production secrets are set via `supabase secrets set` — they live in Supabase's encrypted vault and are injected into the function's `Deno.env` at runtime.

### Inspecting the running local stack

```
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Studio:  http://localhost:54323
# Mailpit: http://localhost:54324   (magic-link emails in dev)
```

After `\connect`, useful starter queries:

```
\dn                                           # list schemas (common, tinyspy, public, ...)
\dt common.*  \dt tinyspy.*                   # tables in each schema
\df common.*  \df tinyspy.*                   # functions in each schema
```

## Schemas overview

Multi-game architecture (see [`naming.md`](naming.md) for the full convention):

| schema | contents |
|---|---|
| `common` | profiles, clubs, the cross-game social layer (clubs, club_members, club_active_game, messages) |
| `tinyspy` | one game's tables + RPCs (games, game_players, words, clues, word_pool) |
| `public` | reserved for Postgres-managed bits (`gen_random_uuid`, extensions). We do not add tables here. |

Future games (boggle, crosswords, …) each get their own schema following the same pattern.

## Tables

Schema source: [`supabase/migrations/`](../supabase/migrations/) — read in timestamp order.

### `common.*`

| table | purpose |
|---|---|
| `profiles` | one row per auth user. Holds `username` (unique, defaulted to email local-part by the `handle_new_user` trigger). Cascades from `auth.users`. |
| `clubs` | fixed-membership room formed by one creator. `handle` (unique, URL-safe) drives `/c/<handle>` routes; solo clubs use `=<username>` so user-typed names can't collide. |
| `club_members` | m2m of `(club_id, user_id)`. Membership is fixed at club creation in v1 (no add/remove). |
| `club_active_game` | pk on `club_id` alone — at most one row per club. Tracks which game (gametype + game_id) the club is currently playing. Absence of a row = nothing active. New-game start auto-upserts (replaces the previous active, which becomes "paused"). |
| `messages` | club-keyed chat. RLS-scoped to club members; writes go through `common.send_message`. |

### `tinyspy.*`

| table | purpose |
|---|---|
| `games` | one row per match. `club_id` (not null) ties to `common.clubs`. Tracks `status`, `turn_number`, `turns_remaining`, `current_clue_giver`, `next_game_id` (set by `play_again`). |
| `game_players` | the 2 seated players per game. Holds each player's `key_card` jsonb (25-element view of `'G' \| 'N' \| 'A'`). FK to `common.profiles`. |
| `word_pool` | the static Duet word list (390 rows, seeded by migration). Read only by security-definer RPCs; clients cannot SELECT. |
| `words` | 25 rows per game — the board. `revealed_as` is null until a guess reveals the cell. |
| `clues` | one row per turn, enforced by `unique (game_id, turn_number)`. Holds the clue word + count + which seat gave it. |

## Postgres functions

All callable RPCs are `security definer` and granted only to the `authenticated` role.

### Helpers (not callable from the client)

| function | purpose |
|---|---|
| `common.handle_new_user()` | Trigger on `auth.users` insert. Materializes a `profiles` row + a single-member solo club (handle `=<username>`). A username collision fails sign-in entirely (accepted under the alpha-software prior — see CLAUDE.md). |
| `common.is_club_member(target_club uuid) → boolean` | Security-definer RLS helper. Used by every `common.*` table's SELECT policy. |
| `common.slugify_club_name(name text) → text` | Lowercase + non-alnum → `-` + trim + cap at 40 chars. Strips `=` along the way, which is what keeps user-typed names from producing solo-club handles. |
| `tinyspy.is_player_in_game(target_game uuid) → boolean` | Security-definer RLS helper for tinyspy game-scoped tables. |
| `tinyspy._end_turn(target_game uuid)` | Shared by `submit_guess` (on neutral) and `pass_turn`. Decrements `turns_remaining`, increments `turn_number`, swaps `current_clue_giver`, flips to `sudden_death` at zero. |
| `tinyspy.clear_active_on_termination()` | Trigger on `tinyspy.games`. When status flips from non-terminal to terminal, deletes the matching `common.club_active_game` row. |

### Common RPCs

| function | what it does | reject reasons |
|---|---|---|
| `common.create_club(club_name text, member_usernames text[]) → table(id uuid, handle text)` | Atomically creates club + all member rows. Slugifies name → handle. Caller is auto-added if not in the list. | not authenticated · empty/non-alphanumeric name · unknown username (P0002) · < 2 members · handle collision (23505) |
| `common.send_message(target_club uuid, content text)` | Posts to a club's chat. | not authenticated · not a member · empty/whitespace · over 1000 chars |

### Tinyspy RPCs

| function | what it does | reject reasons |
|---|---|---|
| `tinyspy.create_game(target_club uuid) → table(id uuid)` | Verifies caller is in a 2-member club, seats both, picks 25 words, generates the Duet key-card distribution, sets status='active', upserts `common.club_active_game` (auto-pausing any prior active game). | not authenticated · non-member · club != 2 members |
| `tinyspy.submit_clue(target_game uuid, word text, clue_count int)` | Inserts a clue for the current turn. | not authenticated · not your turn · clue already submitted this turn · status ≠ active |
| `tinyspy.submit_guess(target_game uuid, target_position int) → text` | Reveals a cell using the *clue-giver's* key view. Green = continue; neutral = `_end_turn`; assassin = `lost_assassin`. In `sudden_death`, any non-green = `lost_clock`. Returns the revealed label. The status-flip-to-terminal fires the `clear_active_on_termination` trigger. | not a player · cell already revealed · clue-giver can't guess · waiting for clue · position out of range |
| `tinyspy.pass_turn(target_game uuid)` | Voluntary turn-end during the guess phase. | clue-giver can't pass · no clue this turn · status ≠ active |
| `tinyspy.play_again(prev_game uuid) → table(id uuid)` | From a finished game, creates a successor in the same club with fresh words + key card, both players pre-seated. Idempotent via `next_game_id` — second caller gets the same id back. Upserts `club_active_game` to the new game. | previous game not ended · not a player in the previous game |
| `tinyspy.get_clue_context(target_game uuid) → jsonb` | Read-only. Returns the caller's unrevealed greens/neutrals/assassin + previous clue history, for the `tinyspy-suggest-clue` Edge Function to feed to Claude. | not authenticated · not a player · not the current clue-giver · status ≠ active/sudden_death |

## Edge Functions

| function | purpose |
|---|---|
| `tinyspy-suggest-clue` | Called from the "Need a clue?" button. Invokes `get_clue_context` as the user (RLS applies), prompts Claude Sonnet 4.6 via tool-use for `{clue, count, agents, reasoning}`, returns it. Requires `ANTHROPIC_API_KEY` in the function's runtime env. |

Naming convention: `<game>-<feature>` for game-specific functions (`tinyspy-…`, `boggle-…`), `common-<feature>` for cross-game ones. Sets the precedent for future games.

## URL routes

Path-based routing (no hash). All routes served by `index.html` via Netlify rewrite (`public/_redirects`).

| URL | what mounts |
|---|---|
| `/` | `HomePage` — clubs list + create-club link + log out |
| `/c/new` | `CreateClubPage` — name + member usernames form |
| `/c/<handle>` | `ClubPage` — members, games (active/paused/completed), chat, "Start X" per gametype |
| `/g/<gameId>` | The registered game's Root (lazy-loaded chunk). Today: `TinyspyRoot` → `BoardScreen` |

The hand-rolled router lives in [`src/common/lib/router.ts`](../src/common/lib/router.ts) (~40 lines, no react-router) + [`src/common/lib/Link.tsx`](../src/common/lib/Link.tsx).

## Key files for code reading

| reading goal | start here |
|---|---|
| "What does the server-side do" | [`supabase/migrations/`](../supabase/migrations/) read in timestamp order: baseline (the multi-schema shape), `_username` (display_name→username), `_clubs` (clubs + RLS + RPCs), `_tinyspy_to_clubs` (tinyspy's adoption of the club model). |
| "The Tinyspy rulebook in code form" | [`docs/duet-rules.md`](duet-rules.md) — canonical spec the RPCs implement against. |
| "Top-level routing" | [`src/App.tsx`](../src/App.tsx) — shell routes `/c/...`, `/g/...`, and `/` itself. |
| "How does the router work" | [`src/common/lib/router.ts`](../src/common/lib/router.ts) + [`src/common/lib/Link.tsx`](../src/common/lib/Link.tsx). |
| "How do clubs work (UI side)" | [`src/common/components/ClubPage.tsx`](../src/common/components/ClubPage.tsx) — roster, games sections (active/paused/completed via registry dispatch), chat, "Start X" buttons. |
| "How does the games registry work" | [`src/games.ts`](../src/games.ts) + [`src/common/lib/games.ts`](../src/common/lib/games.ts) (the `GameManifest` type) + [`src/tinyspy/manifest.ts`](../src/tinyspy/manifest.ts) (concrete implementation). |
| "How does the Tinyspy board work" | [`src/tinyspy/components/BoardScreen.tsx`](../src/tinyspy/components/BoardScreen.tsx) + [`src/tinyspy/lib/phase.ts`](../src/tinyspy/lib/phase.ts) (pure phase derivation, unit-tested). |
| "How does chat work" | [`src/common/hooks/useClubChat.ts`](../src/common/hooks/useClubChat.ts) (data) + [`src/common/components/ClubChatPanel.tsx`](../src/common/components/ClubChatPanel.tsx) (UI). |
| "How does Realtime stay in sync" | [`src/tinyspy/hooks/useGame.ts`](../src/tinyspy/hooks/useGame.ts) — canonical example of the patterns we use everywhere: per-effect-run unique channel names (StrictMode safety) and refetch-on-`SUBSCRIBED` (recovers from missed events on a reconnect). Other hooks follow the same shape. |
| "How does the AI clue suggestion work" | [`supabase/functions/tinyspy-suggest-clue/index.ts`](../supabase/functions/tinyspy-suggest-clue/index.ts) — Edge Function pattern: thin orchestrator around a security-definer RPC + Anthropic tool-use. |
| "What corners did we cut" | [`../CODE_REVIEW.md`](../CODE_REVIEW.md) (predates the clubs refactor; some items are obsolete). |
| "How do the tests work" | [`supabase/tests/tinyspy/create_game_test.sql`](../supabase/tests/tinyspy/create_game_test.sql) (the pgTAP tutorial file) and [`src/common/hooks/useSession.test.ts`](../src/common/hooks/useSession.test.ts) (Vitest + supabase mock). [`supabase/tests/common/clubs_test.sql`](../supabase/tests/common/clubs_test.sql) is the equivalent walkthrough for common-layer tests. |
