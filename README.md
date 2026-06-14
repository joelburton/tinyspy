# Tinyspy + friends

A monorepo for online collaborative games among groups of friends. The shell, auth, clubs, and chat are common; each game lives in its own folder + Postgres schema + lazy chunk. Adding or removing a game is a folder-and-one-line operation; the architecture's removability is the structural integrity check (enforced by ESLint).

The first game in is **Tinyspy** — an online implementation of [Codenames Duet](https://czechgames.com/en/codenames-duet/), the cooperative variant where two players give clues to each other to find 15 agents before the timer runs out. Boggle, crosswords, and others slot in next.

Built as a learning exercise around Supabase (row-level security, Postgres RPCs, Realtime, Edge Functions) with all game logic enforced server-side. Frontend is React + Vite + TypeScript, no router library (a ~40-line hand-rolled router covers the flat route set).

## Audience

This is software for **groups of friends** playing together — not a public matchmaking platform. The social primitive is a **club**: a named, fixed-membership room you create with the friends you want to play with. Inside a club:

- The whole club plays every game together (synchronously).
- A persistent club chat threads across all games.
- One game is "active" at a time, across all gametypes; starting a new game auto-pauses the previously-active one (which stays resumable).
- No invitations, no public lobby, no random pairings. Friends-only by construction.

Solo games (boggle, crosswords) live in implicit "solo clubs" (single member, hidden from the clubs list); the data model unifies solo and group play behind one schema.

See [`CLAUDE.md`](CLAUDE.md) for the project-level priors (educational clarity, audience model, server-authoritative for cleanliness not anti-cheat, alpha-software-break-things-freely posture).

## Stack

- **Frontend:** Vite + React 19 + TypeScript. Hand-rolled path-based router (no react-router). Each game's `Root` is a lazy chunk so the main bundle stays small as games are added.
- **Backend:** Supabase — Postgres (with RLS), PostgREST, Realtime (WebSocket), Auth (magic links via Resend SMTP), Edge Functions (Deno).
- **Hosting:** Netlify (FE), Supabase (everything else).
- **AI features:** Anthropic Claude via Edge Functions (Tinyspy's clue suggester is the current example).

## Architecture in one diagram

```
src/
  App.tsx              ← shell: auth gate + URL routing (/, /c/..., /g/...)
  main.tsx, types/db.ts, index.css, test-setup.ts
  games.ts             ← THE registry — `export const games = [tinyspyGame, ...]`
                         (only file allowed to import every game)

  common/              ← cross-game UI, hooks, lib, DB handle
    components/        ← HomePage, ClubPage, CreateClubPage,
                         ClubChatPanel, LoginScreen
    hooks/             ← useSession, useClubChat
    lib/               ← supabase client, router, Link, games (the
                         GameManifest type), theme tokens (TBD)
    db.ts              ← supabase.schema('common')

  tinyspy/             ← one game
    components/        ← BoardScreen, CluePanel, GameLog,
                         GameOverBanner, HowToPlayModal
    hooks/             ← useGame, useBoard, useClues
    lib/               ← labels, phase
    db.ts              ← supabase.schema('tinyspy')
    Root.tsx           ← entry component (/g/<id> → BoardScreen)
    manifest.ts        ← GameManifest export {gametype, schema, name,
                         blurb, Root, startGameInClub, fetchClubGames}

supabase/
  config.toml          ← local Supabase config (exposed schemas live here)
  migrations/          ← timestamped SQL — the source of truth for schema
  seed.sql             ← stub; word list lives in a migration
  tests/
    common/            ← clubs + chat pgTAP
    tinyspy/           ← tinyspy pgTAP
  functions/
    tinyspy-suggest-clue/  ← Edge Function: "Need a clue?" → Anthropic

docs/
  duet-rules.md        ← canonical Tinyspy rulebook
  naming.md            ← project-wide conventions (schemas, tables, file
                         layout, component naming, CSS, terminology,
                         removability rules, etc.) — read first
  cheatsheet.md        ← one-screen lookup for commands, tables, RPCs, files

CLAUDE.md              ← project priors for AI/contributors
CODE_REVIEW.md         ← pre-refactor review notes (some items obsolete)
```

The structural integrity check: **removing a game should be three actions** — delete its folder, delete its line from `src/games.ts`, drop its Postgres schema in a migration. If any other code (common, shell, another game) reaches into that game's folder, the rule is broken. ESLint's `no-restricted-imports` enforces this at lint time; the games registry pattern (one manifest per game, shell never names a game) enforces it structurally.

For the full vocabulary (`gametype` = category, `game` = a specific playing, `board` = static starting config) and the schema/table/component naming conventions, see [`docs/naming.md`](docs/naming.md).

## Quick start

Prereqs: Node, Docker Desktop, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
brew install supabase/tap/supabase
git clone <this repo>
cd codenames
npm install
supabase start             # pulls Docker images on first run (~slow); ~30s after
npm run db:reset           # applies migrations + seeds the word list
npm run types:gen          # generates src/types/db.ts from the live schema
npm run dev                # http://localhost:5173
```

Local credentials are picked up automatically from `supabase status`; `.env.local` already points at the local API URL. Magic-link emails land in Mailpit at <http://localhost:54324> in dev — open it, click the link, and you're signed in.

For multi-player testing, open one regular window and one private/incognito window and sign in as two different emails. To play Tinyspy, create a club with both of you as members from `/c/new`, then click "Start Tinyspy" on the club page. The other tab auto-navigates into the game.

## Schemas overview

| schema | contents |
|---|---|
| `common` | profiles, clubs, club_members, club_active_game, messages (chat) — the cross-game social layer |
| `tinyspy` | games, game_players, words, clues, word_pool — one game's tables + RPCs |
| `public` | reserved for Postgres-managed bits (`gen_random_uuid`, extensions). We do not add app tables here. |

RLS: every cross-game table is gated by `common.is_club_member(club_id)`; tinyspy tables by `tinyspy.is_player_in_game(game_id)`. Both helpers are `security definer` to avoid infinite-recursion problems with the self-referential policies.

The full table inventory + RPCs is in [`docs/cheatsheet.md`](docs/cheatsheet.md).

## Routing model

Path-based, hand-rolled. See [`src/common/lib/router.ts`](src/common/lib/router.ts).

| URL | what mounts |
|---|---|
| `/` | `HomePage` — your clubs list + create-club link |
| `/c/new` | Create-club form |
| `/c/<handle>` | Club page — members, games sections, chat, "Start <game>" buttons |
| `/g/<gameId>` | The first registered game's `Root` (lazy chunk). Today: Tinyspy's `BoardScreen` |

Netlify rewrites every path to `index.html` (`public/_redirects`). Vite's dev server does the same automatically.

## Clubs lifecycle

1. **Create a club** (`/c/new`): pick a name (auto-slugified to a unique handle) and list the usernames of the other members. Membership is fixed at creation — no add/remove in v1.
2. **Visit the club** (`/c/<handle>`): see roster + chat + games (active/paused/completed) + a "Start &lt;game&gt;" button per registered gametype.
3. **Start a game**: the manifest's `startGameInClub` runs (for Tinyspy: `tinyspy.create_game(target_club)` — seats both members, picks words, generates the key card, sets `common.club_active_game`). All members auto-navigate into the new game via realtime.
4. **Switch games or pause**: starting a new game auto-pauses the current one. The paused game stays in the club's "Paused games" list, resumable from any member's tab.
5. **End naturally**: a terminal status (won / lost_*) fires a trigger that clears the `common.club_active_game` row. The game moves to "Completed games" in the list.

Solo clubs (`=<username>`) are auto-created on signup and host solo games (boggle, crosswords). UI-hidden from the regular clubs list; they exist as the anchor for per-user data going forward.

## Edge Functions

One Deno function lives under `supabase/functions/`:

| function | purpose |
|---|---|
| `tinyspy-suggest-clue` | When the active clue-giver clicks "Need a clue?", the FE invokes this function. It calls `get_clue_context` as the user (RLS-checked), builds a prompt from the result, and asks Claude Sonnet 4.6 via tool-use for a `{clue, count, agents, reasoning}` object. The reasoning surfaces as a tooltip below the input. |

**Architecture pattern.** The function is thin — it doesn't enforce game rules (that's `get_clue_context`'s job in plpgsql) and it doesn't shape responses for the FE (Anthropic's tool-use gives us already-typed JSON). Most of the body is prompt construction. Edge Functions are for what the database can't do well: calling external APIs with real SDKs, handling secrets, doing prompt engineering in TypeScript.

**Secrets.** Set `ANTHROPIC_API_KEY` once per environment:

```bash
# Local (for `supabase functions serve`)
cp supabase/functions/.env.example supabase/functions/.env
# then edit and add the key

# Production (encrypted secret store)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

The function also reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from runtime env — both auto-injected by the Edge Runtime. (The runtime injects `ANON_KEY` even though the FE uses the renamed `PUBLISHABLE_KEY`; same JWT, different surface name.)

**Local dev.**

```bash
supabase functions serve tinyspy-suggest-clue   # hot-reloads on file change
```

Naming convention: `<game>-<feature>` for game-specific functions, `common-<feature>` for cross-game ones (no cross-game functions yet).

## npm scripts

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build (picks up .env.production)
npm run lint         # ESLint (incl. cross-feature import-direction rules)
npm test             # FE + DB tests (Vitest, then pgTAP)
npm run test:fe      # Vitest only (add --watch for the dev loop)
npm run test:db      # pgTAP only (needs Docker + the local stack)
npm run db:reset     # wipe local DB, replay migrations + seed
npm run db:diff      # show schema drift vs migrations
npm run db:lint      # supabase db lint --level warning
npm run types:gen    # regenerate src/types/db.ts from local DB
npm run deploy       # db push + functions deploy + build + Netlify deploy
```

`types:gen` and `db:lint` set `SUPABASE_ACCESS_TOKEN=local` as a workaround for a CLI 2.x regression that requires a token even for `--local`.

## Tests

Two suites:

```bash
npm test            # both (FE then DB)
npm run test:fe     # Vitest only (fast; watch mode with --watch)
npm run test:db     # pgTAP only (needs Docker + the local stack running)
```

### Database layer (pgTAP)

The server-authoritative game logic lives in plpgsql RPCs, so most meaningful behavior is tested directly against the database with [pgTAP](https://pgtap.org/) — a Postgres extension that adds TAP-format assertion functions (`ok`, `is`, `throws_ok`, `results_eq`, …) to SQL.

Tests live under `supabase/tests/<schema>/`:

```
supabase/tests/
  common/
    chat_test.sql        # common.send_message + RLS
    clubs_test.sql       # create_club, slugify, solo-club auto-creation
  tinyspy/
    create_game_test.sql # tutorial file for tinyspy — read this first
    clue_context_test.sql
    game_loop_test.sql
    play_again_test.sql
    rls_test.sql
    sudden_death_test.sql
    win_test.sql
```

`supabase test db --local supabase/tests` recurses into subfolders automatically. To run one file:

```bash
supabase test db --local supabase/tests/tinyspy/create_game_test.sql
```

Each test file follows the same skeleton:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = tinyspy, common, public, extensions;
select plan(N);              -- declare the assertion count
-- ... assertions ...
select * from finish();      -- TAP summary; fails if N didn't match
rollback;                    -- isolate this test from later ones
```

The `begin / rollback` pair means each test leaves the database exactly as it found it — no fixtures to clean up.

**Authentication in tests.** Our RPCs call `auth.uid()` to identify the caller. `auth.uid()` reads the `sub` claim from `request.jwt.claims`, which PostgREST normally sets per request. The test files simulate "logged in as X" via:

```sql
select set_config('request.jwt.claims',
                  json_build_object('sub', some_uuid, 'role', 'authenticated')::text,
                  true);
select set_config('role', 'authenticated', true);
```

`create_game_test.sql` walks through this in detail as the tutorial file; subsequent files lean on that foundation. For common-layer tests, `clubs_test.sql` plays the same tutorial role.

**Common assertion functions** used in this project:

| function | purpose |
|---|---|
| `ok(boolean, desc)` | basic truthiness assert |
| `is(actual, expected, desc)` | equality (null-safe — unlike SQL `=`) |
| `isnt(a, b, desc)` | inverse |
| `matches(actual, regex, desc)` | regex match |
| `throws_ok(query, sqlstate, msg, desc)` | the query must raise this exact error (note the 4-arg form — the 3-arg version treats arg 3 as the expected message, easy gotcha) |
| `lives_ok(query, desc)` | the query must NOT raise |
| `results_eq(q1, q2, desc)` | row sets equal in order |

### Frontend layer (Vitest + React Testing Library)

A thin layer of unit tests covers the FE-only logic the pgTAP suite can't reach:

| target | location | what it locks in |
|---|---|---|
| Router (paths, navigation, popstate) | `src/common/lib/router.test.ts` | usePath subscribes correctly, navigate updates URL + dispatches popstate |
| Phase derivation | `src/tinyspy/lib/phase.test.ts` | the `(status × seat × clue)` matrix for `cellsClickable` etc. |
| useSession profile-verify | `src/common/hooks/useSession.test.ts` | the stale-JWT signOut branch |
| useBoard peer-key toggle | `src/tinyspy/hooks/useBoard.test.ts` | peerKey is null while `revealPeer` is false; populates when toggled on |
| GameLog ordering | `src/tinyspy/components/GameLog.test.tsx` | turn grouping + within-turn `revealed_at` sort |

We don't test trivial rendering. We do test the small bits of pure logic that have non-obvious behavior — extracted into testable modules so we can assert on them without rendering components or mocking hooks. Supabase calls in hook tests are mocked via `vi.mock('../lib/supabase', ...)` — `useSession.test.ts` is the cleanest example (uses `vi.hoisted` so the spies survive vi.mock's hoisting).

Not tested at this layer: full browser flow (Realtime + RPC + RLS chain). That would be Playwright and is deferred.

## Rules

The Tinyspy game logic intentionally tracks the rulebook closely. The canonical spec is in [`docs/duet-rules.md`](docs/duet-rules.md) — if you spot a behavior discrepancy, fix that file first, then the RPC.

Key things the engine gets right that are easy to get wrong:

- Reveals use the **clue-giver's** key view, not the guesser's.
- Green guesses are unlimited (no `clue + 1` cap — that's normal Codenames, not Duet).
- A timer token is spent on turn end (neutral or pass), never on a green reveal.
- When the last token is spent and agents remain, the game enters sudden death; any non-green reveal there is a loss.

## Production

Deployed at <https://tinyspy.netlify.app> with the Supabase backend on the free tier.

Redeploy in one command:

```bash
npm run deploy
```

It runs `supabase db push && supabase functions deploy && npm run build && netlify deploy -p -d dist`. Order matters: schema and functions first so the FE never references a column, RPC, or function the prod backend doesn't have yet. Both `db push` and `functions deploy` are idempotent — when nothing's pending they're quick no-ops, so the script is safe to run on every deploy.

Manual breakdown:

```bash
supabase db push --dry-run                # preview pending migrations (optional)
supabase db push                          # apply to hosted DB
supabase functions deploy                 # push Edge Function changes
npm run build                             # picks up .env.production[.local]
netlify deploy -p -d dist                 # upload to Netlify
```

The hosted Supabase project ref is in `supabase/.temp/project-ref` (created by `supabase link`); the publishable key is in `.env.production.local` (gitignored). For new contributors: get those two from the dashboard at Project Settings → API.

A few hosted-project settings can only be configured in the dashboard (not via `config.toml`):

- Auth → URL Configuration: site_url + redirect URLs must include the Netlify origin
- Auth → Email rate limits: free tier defaults are conservative; raise if needed
- Custom SMTP (we use Resend on `tinyspy.joelburton.com`) — Supabase's shared mailer caps you at 2 emails/hour; any real magic-link traffic requires your own SMTP provider
- Edge Function secrets — set via `supabase secrets set` (CLI) rather than the dashboard for atomicity. Currently just `ANTHROPIC_API_KEY` for `tinyspy-suggest-clue`.

## Status

This is alpha software (see [`CLAUDE.md`](CLAUDE.md) for what that means in practice). The architectural refactor from "single-game ad-hoc app" to "multi-game club-mediated platform" is complete; Tinyspy plays end-to-end on the clubs model. Next games (boggle, crosswords) slot into the same shape — one new folder under `src/`, one new line in `src/games.ts`, one new Postgres schema.

Known cosmetic gaps and trade-offs are tracked in [`CODE_REVIEW.md`](CODE_REVIEW.md) (predates the refactor; some items are obsolete).
