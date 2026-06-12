# Cheatsheet

Quick reference for reading the code and driving the project. See [`../README.md`](../README.md) for narrative; this file is the one-screen lookup.

## `npm run …`

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | type-check (`tsc -b`) + production bundle into `dist/` |
| `npm run lint` | ESLint on `src/` |
| `npm test` | run **all** tests — FE first, then DB |
| `npm run test:fe` | Vitest only; add `-- --watch` for the dev loop |
| `npm run test:db` | pgTAP only (needs Docker + the local Supabase stack) |
| `npm run db:reset` | wipe the local DB and replay every migration + seed |
| `npm run db:diff` | show what the local schema has that migrations don't |
| `npm run db:lint` | Supabase's schema linter — warnings + errors |
| `npm run types:gen` | regenerate `src/types/db.ts` from the live local schema |
| `npm run deploy` | full prod push: `supabase db push` → `vite build` → `netlify deploy -p -d dist` |

`types:gen` and `db:lint` set `SUPABASE_ACCESS_TOKEN=local` as a workaround for a CLI 2.x quirk; you don't need to set it yourself when running those scripts.

## `supabase …`

```
supabase start                                  # boot the local Docker stack
supabase stop                                   # tear it down (data persists)
supabase status                                 # ports, URLs, anon/publishable keys
supabase status -o env                          # same but JSON-flat for scripts
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
supabase db dump --local --schema public        # dump the local schema as SQL
```

### Codegen, testing, linking

```
supabase gen types typescript --local           # → stdout; piped into src/types/db.ts
supabase test db --local supabase/tests         # pgTAP suite
supabase test db --local supabase/tests/foo.sql # one file
supabase link --project-ref <ref>               # tie this checkout to a hosted project
supabase login                                  # one-time browser-based auth
```

### Inspecting the running local stack

```
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Studio:  http://localhost:54323
# Mailpit: http://localhost:54324   (magic-link emails in dev)
```

## Tables

All in the `public` schema. Schema source: [`supabase/migrations/20260612000000_baseline.sql`](../supabase/migrations/20260612000000_baseline.sql).

| table | purpose |
|---|---|
| `profiles` | one row per auth user. Holds `display_name` (defaulted to email username by the `handle_new_user` trigger). Cascades from `auth.users`. |
| `games` | one row per match. Tracks `status`, `turn_number`, `turns_remaining`, `current_clue_giver`, `join_code`, and `next_game_id` (set by `play_again`). |
| `game_players` | the (≤ 2) seated players per game. Holds each player's `key_card` jsonb (25-element view of `'G' \| 'N' \| 'A'`). FK to `profiles` so PostgREST auto-embeds display names. |
| `word_pool` | the static Duet word list (390 rows). Read only by security-definer RPCs; clients cannot SELECT. |
| `words` | 25 rows per game — the board. `revealed_as` is null until a guess reveals the cell. |
| `clues` | one row per turn, enforced by `unique (game_id, turn_number)`. Holds the clue word + count + which seat gave it. |

## Postgres functions

All callable RPCs are `security definer` (run with `postgres` privileges) and granted only to the `authenticated` role.

### Helpers (not callable from the client)

| function | purpose |
|---|---|
| `handle_new_user()` | trigger on `auth.users` insert. Materializes a `profiles` row, defaulting `display_name` to the part of the email before `@`. |
| `is_player_in_game(target_game uuid) → boolean` | security-definer RLS helper. Avoids infinite recursion when `game_players` policies need to ask "is the caller in this game?" |
| `generate_join_code() → text` | 6-char code from an unambiguous alphabet (no `O`/`0`/`I`/`1`/`l`); retries until unique. Revoked from public. |
| `_end_turn(target_game uuid)` | shared by `submit_guess` (on neutral) and `pass_turn`. Decrements `turns_remaining`, increments `turn_number`, swaps `current_clue_giver`, and flips to `sudden_death` at zero. |

### RPCs

| function | what it does | reject reasons |
|---|---|---|
| `create_game() → table(id, join_code)` | New game with random join code; caller becomes seat A. | not authenticated |
| `join_game(code text) → uuid` | Caller takes seat B if open; idempotent for existing players (returns the game id back). | not authenticated · game not found · game full · game already started |
| `start_game(target_game uuid)` | Picks 25 random words, generates the Duet key-card distribution via Fisher-Yates, populates both `key_card` jsonbs, inserts `words` rows, flips status to `active`. | not a player · not in lobby · need 2 players · word_pool < 25 rows |
| `submit_clue(target_game uuid, word text, clue_count int)` | Inserts a clue for the current turn. | not authenticated · not your turn · clue already submitted this turn · status ≠ active |
| `submit_guess(target_game uuid, target_position int) → text` | Reveals a cell using the *clue-giver's* key view. Green = continue; neutral = `_end_turn`; assassin = `lost_assassin`. In `sudden_death`, any non-green = `lost_clock`. Returns the revealed label. | not a player · cell already revealed · clue-giver can't guess · waiting for clue · position out of range |
| `pass_turn(target_game uuid)` | Voluntary turn-end during the guess phase. | clue-giver can't pass · no clue this turn · status ≠ active |
| `play_again(prev_game uuid) → table(id, join_code)` | From a finished game, creates a successor with both players pre-seated. Idempotent — second caller gets the same id+code via `games.next_game_id`. | previous game not ended · not a player in the previous game |

## Key files for code reading

| reading goal | start here |
|---|---|
| "what does the server-side do" | [`supabase/migrations/20260612000000_baseline.sql`](../supabase/migrations/20260612000000_baseline.sql) |
| "the rulebook in code form" | [`docs/duet-rules.md`](duet-rules.md) |
| "what's the top-level state machine" | [`src/App.tsx`](../src/App.tsx) |
| "how does the board work" | [`src/components/BoardScreen.tsx`](../src/components/BoardScreen.tsx) + [`src/lib/phase.ts`](../src/lib/phase.ts) |
| "how does Realtime stay in sync" | [`src/hooks/useGame.ts`](../src/hooks/useGame.ts) (others follow the same pattern) |
| "what corners did we cut" | [`../CODE_REVIEW.md`](../CODE_REVIEW.md) |
| "how do the tests work" | [`supabase/tests/lobby_test.sql`](../supabase/tests/lobby_test.sql) (pgTAP tutorial) and [`src/hooks/useSession.test.ts`](../src/hooks/useSession.test.ts) (Vitest + supabase mock) |
