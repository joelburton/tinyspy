# PuzPuzPuz

A monorepo for online collaborative games among groups of friends. The shell, auth, clubs, and chat are common; each game lives in its own folder + Postgres schema + lazy chunk. Adding or removing a game is a folder-and-one-line operation; the architecture's removability is the structural integrity check (enforced by ESLint).

Sixteen games are live today (the parenthetical is each game's in-app brand):

- **bananagrams** (MonkeyGrams) — Bananagrams-style: build your own crossword from a shared tile bank.
- **boggle** (MothCubes) — Boggle-style: find words in a grid of lettered dice.
- **codenamesduet** (TinySpy) — [Codenames Duet](https://czechgames.com/en/codenames-duet/): two players give clues to each other to find all the agents before the turns run out.
- **connections** (WordKnit) — Connections-style: sort sixteen words into four hidden groups.
- **crosswords** (CrossPlay) — a collaborative/competitive crossword.
- **letterboxed** (SnakeBox) — Letter-Boxed-style: chain words around a square of twelve letters, each word starting where the last one ended.
- **psychicnum** (PsychicNum) — a deliberately tiny toy that keeps the multi-game wiring honest, with the smallest possible game-logic surface.
- **scrabble** (RackAttack) — Scrabble-style on the standard 15×15 premium board, with an AI opponent.
- **setgame** (HareTrigger) — Set-style: eighty-one cards over four attributes, and a *set* is three of them that are all-same or all-different in every one. The one game on the roster with no words in it.
- **spellingbee** (FreeBee) — Spelling-Bee-style: make words from seven letters around a required center.
- **stackdown** (StackDown) — a mahjong-style word game: clear a stack of lettered tiles by spelling words off the exposed ones.
- **strands** (PaulPath) — Strands-style word search: trace hidden theme words that tile the whole board.
- **waffle** (SyrupSwap) — Waffle-style swap-to-solve grid puzzle.
- **wordiply** (WordWire) — Wordiply-style: make the longest words that contain a short base.
- **wordle** (WordNerd) — Wordle-style guess-the-word.
- **wordwheel** (MooseWheel) — Word-Wheel-style: make words from nine wheel letters, each using the center.

Most multiplayer games ship as a cooperative + competitive sibling pair; codenamesduet is cooperative-only, and bananagrams is a single competitive race. The planned roster is essentially complete; any further game slots into the same shape — most are ports of games already implemented in other stacks (so the rules / problem-space are well understood, and the porting work focuses on fitting them cleanly into the Supabase + React shell).

Built as a learning exercise around Supabase (row-level security, Postgres RPCs, Realtime, Edge Functions) with all game logic enforced server-side. Frontend is React + Vite + TypeScript, no router library — the route set is flat enough that a hand-rolled router covers it.

## Audience

This is software for **groups of friends** playing together — not a public matchmaking platform.

The metaphor that anchors everything: this app **replaces a group of friends on a Zoom call playing one game together**. Not a games server, not a community hub. Like a Zoom call:

- **everyone present is a friend** — playing, or a club member watching (what a watcher sees is not yet designed; see `plans/spectating.md`);
- **only one game happens at a time** — the whole group is on the same thing;
- **starting a new game invites the group into it** — each friend gets a "… added you to a new game" toast with a Join button, and the game waits, paused, until everyone's there (you don't half-join a Zoom call).

The social primitive is the **club**: a named, fixed-membership room you create with the friends you want to play with. The club is the "Zoom call" — a persistent place where chat threads across every game the friends play. One game is the "current view" at a time across all gametypes; starting a new game suspends the previously-current one (which stays resumable). No public lobby, no strangers, no random pairings — friends-only by construction.

See [`docs/common.md`](docs/common.md) for the club model and [`CLAUDE.md`](CLAUDE.md) for the project-level priors (educational clarity, server-authoritative for cleanliness not anti-cheat, production data preserved and migrated forward).

## Stack

- **Frontend:** Vite + React 19 + TypeScript. Hand-rolled path-based router (no react-router). Each game's play surface, setup form and help are lazy chunks, loaded through its manifest, so the main bundle stays small as games are added.
- **Backend:** Supabase — Postgres (with RLS), PostgREST, Realtime (WebSocket), Auth (magic links via Resend SMTP), Edge Functions (Deno).
- **Hosting:** Netlify (FE), Supabase (everything else).
- **AI features:** Anthropic Claude via Edge Functions — codenamesduet's clue suggester and crosswords' clue explainer. (scrabble's move suggester + autonomous opponent are a local trie-search engine, not an LLM.)

## Architecture at a glance

```
src/
  App.tsx, main.tsx, gametypes.ts # shell + the gametype registry
  common/                         # the shell every game stands on (docs/common-folders.md)
  shared/                         # code a family of games shares, and only they
  guards/                         # repo-wide invariant tests
  <game>/                         # one folder per game (sixteen)

Makefile                          # data + deploy targets (GNU Make 4+; `gmake help`)
supabase/
  config.toml, seed.sql, seed.dev.sql
  deploy/                         # sourced prelude + one script per hosted-deploy step
  migrations/                     # per-schema SHAPE: tables, indexes, publication, seeds
  sql/                            # per-schema CODE: functions, views, policies, grants
                                  #   re-applied in full on every deploy (never a migration)
  tests/                          # pgTAP — per-schema folders + _shared/
  functions/                      # Edge Functions (Deno)
e2e/                              # Playwright specs + the screenshot gallery

docs/                             # see Documentation below
plans/                            # work in flight
CLAUDE.md                         # project priors for AI / contributors
```

The structural integrity check: **removing a game should be three actions** — delete its folder, delete its line from `src/gametypes.ts`, drop its Postgres schema (its migration, its `supabase/sql/` file, and a `drop schema` migration). ESLint's `no-restricted-imports` rules enforce this at lint time; the games registry pattern (one manifest per game, shell never names a game) enforces it structurally. See [`docs/common.md`](docs/common.md) for the removability invariant and [`docs/code-conventions.md`](docs/code-conventions.md) for the lint rules.

## Quick start

Prereqs: Node, Docker Desktop, GNU Make 4+ (`brew install make` → `gmake`), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
brew install supabase/tap/supabase
git clone <this repo>
cd tinyspy
npm install
supabase start             # pulls Docker images on first run (~slow); ~30s after
gmake db-reset ENV=local   # migrations + supabase/sql/ + data (common.words + the puzzle libraries) + dev personas
npm run types:gen          # generates src/types/db.ts from the live schema
npm run dev                # http://localhost:5173
```

Local credentials are picked up automatically from `supabase status`; `.env.local` already points at the local API URL. Magic-link emails land in Mailpit at <http://localhost:54324> in dev — open it, click the link, and you're signed in.

For multi-player testing, open one regular window and one private/incognito window and sign in as two different emails. Create a club with both of you as members ("+ New club" on the home page), then pick a game from the club page's "Start a new game" list. The other window gets a "… added you to a new game" toast — click Join (the game waits, paused, until everyone's there).

## npm scripts

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build (picks up .env.production)
npm run lint         # ESLint (incl. cross-feature import-direction rules)
npm test             # FE + DB tests (Vitest, then pgTAP)
npm run test:fe      # Vitest only (add --watch for the dev loop)
npm run test:db      # pgTAP only (needs Docker + the local stack)
npm run test:edge    # Deno tests for the edge functions' pure logic
npm run test:e2e     # Playwright against the live local stack (not part of npm test)

# Composable data + deploy steps live in the Makefile (GNU Make 4+, `gmake`):
gmake help                          # every target
gmake db-reset ENV=local            # wipe local DB: migrations + supabase/sql/ + data + dev personas
gmake db ENV=local                  # a working database: structure + data
gmake db-data ENV=local             # just the data, rebuilding only what's stale
gmake db-sql ENV=local              # re-apply supabase/sql/ alone — how an RPC change ships (docs/supabase.md)
gmake deploy ENV=prod               # schema + code + functions + FE
gmake dev-keys                      # every key the app answers, by page and game
gmake gallery                       # screenshot every game state (docs/testing.md)
# ENV is REQUIRED — no default. DEBUG=1 adds --debug to the supabase CLI.
npm run db:diff      # drift vs migrations (noisy: supabase/sql/ objects always show)
npm run db:lint      # supabase db lint --level warning
npm run types:gen    # regenerate src/types/db.ts from local DB
```

`types:gen` and `db:lint` set `SUPABASE_ACCESS_TOKEN=local` as a workaround for a CLI 2.x regression that requires a token even for `--local`.

## Tests

Two main suites — pgTAP for server-authoritative game logic, Vitest for FE behavior — plus Deno tests for the edge functions' pure logic and a Playwright suite for what only a real browser against the live stack can show. The patterns, persona conventions, and where a test goes live in [`docs/testing.md`](docs/testing.md).

```bash
npm test                                                        # both
npm run test:fe                                                 # Vitest only; --watch for dev loop
npm run test:db                                                 # pgTAP only; needs Docker + local stack
supabase test db --local supabase/tests/codenamesduet/win_test.sql    # one file
```

## Production

Deployed at <https://tinyspy.netlify.app> with the Supabase backend on the free tier.

Redeploy in one command:

```bash
gmake deploy ENV=prod
```

That links the checkout, pushes pending migrations, re-applies the repeatable SQL (`supabase/sql/`), regenerates the git-ignored boggle/scrabble word bundles and deploys the edge functions, then builds the FE and pushes it to Netlify. Order matters: schema and functions first so the FE never references a column, RPC, or function the prod backend doesn't have yet. Every step is idempotent — when nothing's pending it's a chain of quick no-ops, so it's safe to run on every deploy. It ships structure, code, functions and the FE — **not data**: new word lists or puzzle libraries need `gmake db-data ENV=prod`.

The steps, each its own target when one needs running alone:

```bash
gmake db-schema ENV=prod                  # push pending migrations
gmake db-sql ENV=prod                     # re-apply supabase/sql/
gmake deploy-funcs ENV=prod               # regenerate the word bundles, deploy the edge functions
gmake deploy-fe ENV=prod                  # build and push the FE to Netlify
```

A migration that moves data is rehearsed first against a production dump (`gmake db-rehearse`; [docs/supabase.md → Schema vs code](docs/supabase.md#schema-vs-code)).

The hosted Supabase project ref is in `supabase/.temp/project-ref` (created by `supabase link`); the publishable key is in `.env.production.local` (gitignored). For new contributors: get both from the dashboard at Project Settings → API.

A few hosted-project settings can only be configured in the dashboard (not via `config.toml`):

- **Auth → URL Configuration** — `site_url` + redirect URLs must include the Netlify origin.
- **Auth → Email rate limits** — free-tier defaults are conservative; raise if real magic-link traffic warrants it.
- **Custom SMTP** — we use Resend on `tinyspy.joelburton.com`. Supabase's shared mailer caps at 2 emails/hour; any real magic-link traffic requires your own SMTP provider.
- **Edge Function secrets** — set via `supabase secrets set` (CLI) rather than the dashboard for atomicity. Currently just `ANTHROPIC_API_KEY`, shared by the Claude-backed functions (`codenamesduet-suggest-clue` and `crosswords-explain-clue`).

## Documentation

The detail behind everything above lives in `docs/`. **[CLAUDE.md](CLAUDE.md) carries the full, current documentation map** — it indexes every doc (project priors, the architectural layer, each per-game doc, testing, conventions, and more). Start there and read by need, not in order.

## Status

In production with real accounts, games and chat history, so schema changes migrate forward and preserve data (see [`CLAUDE.md`](CLAUDE.md)). Sixteen games are live — bananagrams, boggle, codenamesduet, connections, crosswords, letterboxed, psychicnum, scrabble, setgame, spellingbee, stackdown, strands, waffle, wordiply, wordle, wordwheel — most multiplayer ones a coop + compete sibling pair (codenamesduet is coop-only, bananagrams a single competitive race); psychicnum is a deliberately-tiny toy that keeps the multi-game architecture honest. Further games slot into the same shape — one new folder under `src/`, one new line in `src/gametypes.ts`, one new Postgres schema.

Known cosmetic gaps and deferred work are in [`docs/deferred.md`](docs/deferred.md).
