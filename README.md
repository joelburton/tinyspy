# Codenames Duet

An online two-player implementation of [Codenames Duet](https://czechgames.com/en/codenames-duet/) — the cooperative variant where both players give clues to each other to find 15 agents before the timer runs out.

Built as a learning exercise around Supabase: row-level security, Postgres RPCs, and Realtime, with all game logic enforced server-side. The frontend is a small React + Vite + TypeScript app.

## Stack

- **Frontend:** Vite + React 19 + TypeScript. No router — the App is a small state machine with the join code in the URL hash for refresh-safety.
- **Backend:** Supabase (Postgres + Auth + Realtime). Free-tier hosted in production; local Docker stack via the Supabase CLI in dev.
- **Auth:** magic-link email (passwordless), via `signInWithOtp`.
- **Game logic:** entirely in plpgsql RPCs marked `security definer`. The client only calls RPCs and subscribes to Realtime updates — it cannot insert into game tables directly.

## Quick start

Prereqs: Node, Docker Desktop, and Homebrew (or another way to install the Supabase CLI).

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

Local credentials are picked up automatically from `supabase status`; `.env.local` already points at the local API URL. Emails (magic links) land in Mailpit at <http://localhost:54324> in dev — open it, click the link, and you're signed in.

For two-player testing, open one regular window and one private/incognito window and sign in as two different emails.

## Layout

```
src/
  App.tsx              ← top-level state machine (login → home → lobby → board)
  test-setup.ts        ← Vitest setup (jest-dom matchers)
  lib/
    supabase.ts        ← typed Supabase client wrapper
    labels.ts          ← KeyLabel type + LABEL_CLASS + labelName
    url.ts             ← URL hash helpers (read/write #game=…)
    phase.ts           ← pure derivePhase(inputs) — game-state matrix
  hooks/
    useSession.ts      ← auth state + onAuthStateChange + profile-verify
    useGame.ts         ← games + game_players, realtime
    useBoard.ts        ← words + own key (and peer key post-game)
    useClues.ts        ← clues
  components/
    LoginScreen.tsx    ← magic-link form
    HomeScreen.tsx     ← create / join controls
    LobbyScreen.tsx    ← join code + seat list
    BoardScreen.tsx    ← 5×5 grid + composition root
    CluePanel.tsx      ← clue form / pass button / waiting states
    GameLog.tsx        ← turn-by-turn replay
    GameOverBanner.tsx ← win/loss banner + play-again
  types/db.ts          ← generated from Supabase schema, do not edit

supabase/
  config.toml          ← local Supabase config (ports, auth, rate limits)
  migrations/          ← timestamped SQL, the source of truth for schema
                         (incl. 20260612000001_seed_word_pool.sql)
  seed.sql             ← stub; the word list lives in the migration above
  tests/               ← pgTAP test suites
  functions/
    suggest-clue/      ← Deno Edge Function: "Need a clue?" → Anthropic
    .env.example       ← local-only secret template (.env is gitignored)

docs/
  duet-rules.md        ← canonical spec the RPCs implement against
  cheatsheet.md        ← one-page lookup for commands, tables, RPCs
CODE_REVIEW.md         ← v1 review findings (deferred items + intent docs)
```

## Schema overview

| table          | purpose                                            |
|----------------|----------------------------------------------------|
| `profiles`     | one per auth user, holds `display_name`           |
| `games`        | one per match: status, turn, clue-giver, tokens   |
| `game_players` | seat A/B per game, holds player's key view jsonb  |
| `word_pool`    | seeded Duet word list (read only by RPCs)         |
| `words`        | 25 rows per game: word + reveal state             |
| `clues`        | one row per turn, unique on (game_id, turn_number) |
| `messages`     | in-game chat, one row per message; RLS-scoped to players in the game |

RLS pattern: `is_player_in_game(game_id)` is a `security definer` helper that lets RLS policies say "the current user is in this game" without recursing on `game_players` itself.

## RPCs

All marked `security definer`, all granted to the `authenticated` role only.

| function                              | purpose                                                            |
|---------------------------------------|--------------------------------------------------------------------|
| `create_game()`                       | New game with random 6-char code; caller becomes seat A.          |
| `join_game(code)`                     | Idempotent: existing player gets back the game id; new joiner takes seat B if free. |
| `start_game(target_game)`             | Picks 25 words, generates the Duet key card distribution, seats both keys, flips status to `active`. |
| `submit_clue(target_game, word, n)`   | Clue-giver only, clue phase only, one per turn (enforced by unique index). |
| `submit_guess(target_game, position)` | Reveals using the clue-giver's key view; green continues, neutral ends turn, assassin ends game. |
| `pass_turn(target_game)`              | Guesser ends the turn voluntarily.                                |
| `play_again(prev_game)`               | From a finished game, creates a successor and pre-seats both players. Idempotent — first caller creates, second caller gets the same id. |
| `send_message(target_game, content)`  | Posts a chat message. Seat membership + length (1–1000 chars) checked. |
| `get_clue_context(target_game)`       | Read-only. Returns the data the `suggest-clue` Edge Function needs (caller's unrevealed greens/neutrals/assassin + previous clues). Caller must be the current clue-giver in an active game. |

## Edge Functions

One Deno function lives under `supabase/functions/`:

| function | purpose |
|---|---|
| `suggest-clue` | When the active clue-giver clicks "Need a clue?", the FE invokes this function. It calls `get_clue_context` as the user (RLS-checked), builds a prompt from the result, and asks Claude Sonnet 4.6 via tool-use for a `{clue, count, agents, reasoning}` object. The reasoning surfaces to the player as a tooltip below the input row. |

**Architecture pattern.** The function is intentionally thin — it doesn't enforce game rules (that's `get_clue_context`'s job) and it doesn't shape responses for the FE (Anthropic's tool-use gives us already-typed JSON). Most of its body is prompt construction. The Edge Function is for things the database can't do well: calling external APIs with real SDK support, handling secrets, doing prompt engineering in TypeScript.

**Secrets.** The function needs `ANTHROPIC_API_KEY`. Set it once per environment:

```bash
# Local (for `supabase functions serve`)
cp supabase/functions/.env.example supabase/functions/.env
# then edit and add the key

# Production (encrypted secret store)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

The function also reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from its runtime env — both auto-injected by the Edge Runtime, no setup needed. (Note: the runtime injects `ANON_KEY` even though the FE now uses the renamed `PUBLISHABLE_KEY`; they're the same JWT value, different name on different surfaces.)

**Local development.**

```bash
supabase functions serve suggest-clue   # hot-reloads on file change
```

The FE's `supabase.functions.invoke('suggest-clue', { body: { gameId } })` routes to either local or hosted depending on which `VITE_SUPABASE_URL` is set.

## npm scripts

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build (Vite picks up .env.production)
npm test             # FE + DB tests (Vitest, then pgTAP)
npm run test:fe      # Vitest only (add --watch for the dev loop)
npm run test:db      # pgTAP only (needs Docker + the local stack)
npm run db:reset     # wipe local DB, replay migrations + seed
npm run db:diff      # show schema drift vs migrations
npm run db:lint      # supabase db lint --level warning
npm run types:gen    # regenerate src/types/db.ts from local DB
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

The server-authoritative game logic lives in plpgsql RPCs, so most of the meaningful behavior is tested directly against the database with **[pgTAP](https://pgtap.org/)** — a Postgres extension that adds TAP-format assertion functions (`ok`, `is`, `throws_ok`, `results_eq`, …) to SQL.

```bash
supabase test db --local supabase/tests/lobby_test.sql      # one file
```

Each test file follows this skeleton:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(N);              -- declare the assertion count
-- ... assertions ...
select * from finish();      -- TAP summary; fails if N didn't match
rollback;                    -- isolate this test from later ones
```

The `begin / rollback` pair means a test file leaves the database exactly as it found it — no fixtures to clean up between runs.

**Authentication in tests.** Our RPCs call `auth.uid()` to identify the caller. `auth.uid()` reads the `sub` claim from `request.jwt.claims`, which PostgREST normally sets per request. The test files simulate "logged in as X" via:

```sql
select set_config('request.jwt.claims',
                  json_build_object('sub', some_uuid, 'role', 'authenticated')::text,
                  true);
select set_config('role', 'authenticated', true);
```

`supabase/tests/lobby_test.sql` walks through this in detail as the tutorial file; subsequent files lean on that foundation. Recommended reading order: `lobby_test.sql` → `start_game_test.sql` → others as you need.

Current pgTAP files: `lobby_test`, `start_game_test`, `game_loop_test`, `play_again_test`, `rls_test`, `sudden_death_test`, `win_test`, `chat_test`, `clue_context_test`. Total: 9 files, ~80 assertions.

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

Tests assume the standard local schema (run `npm run db:reset` if anything has drifted). `word_pool` is populated by migration `20260612000001_seed_word_pool.sql` and is therefore always present after a reset.

### Frontend layer (Vitest + React Testing Library)

A thin layer of unit tests covers the FE-only logic the pgTAP suite can't reach:

| target | location | what it locks in |
|---|---|---|
| URL hash helpers | `src/lib/url.test.ts` | regex parsing, `replaceState` (not `pushState`) |
| Phase derivation | `src/lib/phase.test.ts` | the `(status × seat × clue)` matrix for `cellsClickable` etc. |
| useSession profile-verify | `src/hooks/useSession.test.ts` | the stale-JWT signOut branch |
| useBoard peer-key toggle | `src/hooks/useBoard.test.ts` | peerKey clears when `revealPeer` flips back to false |
| GameLog ordering | `src/components/GameLog.test.tsx` | turn grouping + within-turn `revealed_at` sort |

We don't test trivial rendering (button labels, CSS classes that exist only for styling). We do test the small bits of pure logic that have non-obvious behavior — extracted into `src/lib/url.ts` and `src/lib/phase.ts` so they're testable without rendering components or mocking hooks.

Supabase calls in hook tests are mocked via `vi.mock('../lib/supabase', ...)` — `useSession.test.ts` is the cleanest example of the pattern (uses `vi.hoisted` so the spies survive vi.mock's hoisting). Not tested at this layer: end-to-end browser flow (Realtime + URL hash + RPC + RLS chain) — that would be Playwright and is deferred to post-deploy.

## Rules

The game logic intentionally tracks the rulebook closely. The canonical spec is in [`docs/duet-rules.md`](docs/duet-rules.md) — if you spot a behavior discrepancy, fix that file first, then the RPC.

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

It runs `supabase db push && supabase functions deploy suggest-clue && npm run build && netlify deploy -p -d dist`. Order matters: schema and functions first so the FE never references a column, RPC, or function the prod backend doesn't have yet. Both `db push` and `functions deploy` are idempotent — when nothing's pending they're quick no-ops, so the script is safe to run on every deploy.

If you want to do the steps by hand:

```bash
supabase db push --dry-run                # preview pending migrations (optional)
supabase db push                          # apply to hosted DB
supabase functions deploy suggest-clue    # push Edge Function changes
npm run build                             # picks up .env.production[.local]
netlify deploy -p -d dist                 # upload to Netlify
```

The hosted Supabase project ref is committed to `supabase/.temp/project-ref` by `supabase link`; the publishable key is in `.env.production.local` (gitignored). For new contributors: get those two values from the dashboard at Project Settings → API.

A few hosted-project settings can only be configured in the dashboard (not via `config.toml`):
- Auth → URL Configuration: site_url + redirect URLs must include the Netlify origin
- Auth → Email rate limits: free tier defaults are conservative; raise if needed
- Custom SMTP (we use Resend on `tinyspy.joelburton.com`) — Supabase's shared mailer caps you at 2 emails/hour; any real magic-link traffic requires your own SMTP provider
- Edge Function secrets — set via `supabase secrets set` (CLI) rather than the dashboard for atomicity. Currently just `ANTHROPIC_API_KEY` for the `suggest-clue` function.

## Status

Playable end-to-end (local + hosted). Known cosmetic gaps and trade-offs are tracked in [`CODE_REVIEW.md`](CODE_REVIEW.md) — most notably no mobile audit, no display-name editing, and the `game_players` SELECT policy is open enough that a player could in principle read the partner's `key_card` (client convention hides it).
