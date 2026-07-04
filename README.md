# PuzPuzPuz

A monorepo for online collaborative games among groups of friends. The shell, auth, clubs, and chat are common; each game lives in its own folder + Postgres schema + lazy chunk. Adding or removing a game is a folder-and-one-line operation; the architecture's removability is the structural integrity check (enforced by ESLint).

The flagship game is **codenamesduet** — an online implementation of [Codenames Duet](https://czechgames.com/en/codenames-duet/), the cooperative variant where two players give clues to each other to find 15 agents before the timer runs out. **connections** is a Connections-style word-grouping puzzle. A tiny third game (**psychicnum**) exists to exercise the multi-game wiring with a game small enough that the architectural patterns dominate, not the game logic — it'll be removed after beta. **spellingbee** (a Spelling-Bee-style word finder), **bananagrams** (Bananagrams-style), **waffle** (a Waffle-style swap-to-solve puzzle), **wordle** (a Wordle-style guess-the-word game), **stackdown** (a mahjong-style word game — clear a stack of lettered tiles by spelling words off the exposed ones), **scrabble** (a Scrabble-style game on the standard 15×15 premium board), and **boggle** (a Boggle-style find-words-in-a-grid game) round out today's roster. Crosswords and other games slot in next; most are ports of games already implemented in other stacks (so the rules / problem-space are well understood, and the porting work focuses on fitting them cleanly into the Supabase + React shell).

Built as a learning exercise around Supabase (row-level security, Postgres RPCs, Realtime, Edge Functions) with all game logic enforced server-side. Frontend is React + Vite + TypeScript, no router library — a ~40-line hand-rolled router covers the flat route set.

## Audience

This is software for **groups of friends** playing together — not a public matchmaking platform.

The metaphor that anchors everything: this app **replaces a group of friends on a Zoom call playing one game together**. Not a games server, not a community hub. Like a Zoom call:

- **everyone present is playing** (there aren't spectators);
- **only one game happens at a time** — the whole group is on the same thing;
- **starting a new game invites the group into it** — each friend gets a "join this game" popup and the game waits, paused, until everyone's joined (you don't half-join a Zoom call).

The social primitive is the **club**: a named, fixed-membership room you create with the friends you want to play with. The club is the "Zoom call" — a persistent place where chat threads across every game the friends play. One game is the "current view" at a time across all gametypes; starting a new game suspends the previously-current one (which stays resumable). No invitations, no public lobby, no random pairings — friends-only by construction.

See [`docs/common.md`](docs/common.md) for the full club model and [`CLAUDE.md`](CLAUDE.md) for the project-level priors (educational clarity, server-authoritative for cleanliness not anti-cheat, alpha-software-break-things-freely posture).

## Stack

- **Frontend:** Vite + React 19 + TypeScript. Hand-rolled path-based router (no react-router). Each game's `Root` is a lazy chunk so the main bundle stays small as games are added.
- **Backend:** Supabase — Postgres (with RLS), PostgREST, Realtime (WebSocket), Auth (magic links via Resend SMTP), Edge Functions (Deno).
- **Hosting:** Netlify (FE), Supabase (everything else).
- **AI features:** Anthropic Claude via Edge Functions (codenamesduet's clue suggester is the current example).

## Architecture at a glance

```
src/
  App.tsx, main.tsx, games.ts    # shell + the games registry
  common/                         # cross-game UI, hooks, lib, db handle
  codenamesduet/                  # Codenames Duet
  psychicnum/                     # toy game; exercises multi-game wiring
  connections/  spellingbee/  bananagrams/  waffle/  wordle/
  stackdown/  scrabble/  boggle/   # the other live games (one folder each)

supabase/
  config.toml, seed.sql
  migrations/                     # per-schema baselines + future deltas
  tests/                          # pgTAP — per-schema folders + _shared/
  functions/                      # Edge Functions (Deno)

docs/                             # see Documentation below
CLAUDE.md                         # project priors for AI / contributors
```

The structural integrity check: **removing a game should be three actions** — delete its folder, delete its line from `src/games.ts`, drop its Postgres schema in a migration. ESLint's `no-restricted-imports` rules enforce this at lint time; the games registry pattern (one manifest per game, shell never names a game) enforces it structurally. See [`docs/common.md`](docs/common.md) for the removability invariant and [`docs/code-conventions.md`](docs/code-conventions.md) for the lint rules.

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

For multi-player testing, open one regular window and one private/incognito window and sign in as two different emails. To play codenamesduet, create a club with both of you as members from `/c/new`, then click "Start codenamesduet" on the club page. The other tab gets a "join this game" popup — click Join (the game waits, paused, until everyone's joined).

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

Two suites — pgTAP for server-authoritative game logic, Vitest for FE behavior. The patterns, persona conventions, and decision framework (pgTAP vs Vitest) live in [`docs/testing.md`](docs/testing.md).

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
npm run deploy
```

That runs `supabase db push && supabase functions deploy && npm run build && netlify deploy -p -d dist`. Order matters: schema and functions first so the FE never references a column, RPC, or function the prod backend doesn't have yet. Both `db push` and `functions deploy` are idempotent — when nothing's pending they're quick no-ops, so the script is safe to run on every deploy.

Manual breakdown:

```bash
supabase db push --dry-run                # preview pending migrations
supabase db push                          # apply to hosted DB
supabase functions deploy                 # push Edge Function changes
npm run build                             # picks up .env.production[.local]
netlify deploy -p -d dist                 # upload to Netlify
```

The hosted Supabase project ref is in `supabase/.temp/project-ref` (created by `supabase link`); the publishable key is in `.env.production.local` (gitignored). For new contributors: get both from the dashboard at Project Settings → API.

A few hosted-project settings can only be configured in the dashboard (not via `config.toml`):

- **Auth → URL Configuration** — `site_url` + redirect URLs must include the Netlify origin.
- **Auth → Email rate limits** — free-tier defaults are conservative; raise if real magic-link traffic warrants it.
- **Custom SMTP** — we use Resend on `tinyspy.joelburton.com`. Supabase's shared mailer caps at 2 emails/hour; any real magic-link traffic requires your own SMTP provider.
- **Edge Function secrets** — set via `supabase secrets set` (CLI) rather than the dashboard for atomicity. Currently just `ANTHROPIC_API_KEY` for `codenamesduet-suggest-clue`.

## Documentation

The detail behind everything above lives in `docs/`. Read these by need, not in order:

| file | what's there |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Project priors for AI assistants and contributors. Read first. |
| [docs/naming.md](docs/naming.md) | Terminology glossary (gametype, game, board, club, member, persona) — short. |
| [docs/code-conventions.md](docs/code-conventions.md) | How we write code: DB conventions, FE conventions, code clarity, naming rules, "Avoid SELECT *", `useEffect` commenting, known gotchas. |
| [docs/common.md](docs/common.md) | The architectural layer: clubs, profiles, the games registry, removability invariant, routing, the FE shell. |
| [docs/games/codenamesduet.md](docs/games/codenamesduet.md) | Codenames Duet rules + codenamesduet schema, RPCs, RLS, FE components, Edge Function, tests. |
| [docs/games/psychicnum.md](docs/games/psychicnum.md) | psychicnum rules + schema, the hidden-secrets column-grant pattern, FE, tests. |
| [docs/testing.md](docs/testing.md) | Test theory (pgTAP vs Vitest), persona conventions, common helpers, FE testing patterns. |
| [docs/deferred.md](docs/deferred.md) | Things explicitly deferred from code reviews and conversations. |
| [docs/cheatsheet.md](docs/cheatsheet.md) | One-screen lookup for commands, table inventory, RPC summaries, key files. |

## Status

Alpha software (see [`CLAUDE.md`](CLAUDE.md) for what that means in practice). Ten games are live — codenamesduet, psychicnum, connections, spellingbee, bananagrams, waffle, wordle, stackdown, scrabble, boggle (every multiplayer one a coop + compete sibling pair); psychicnum is a deliberately-tiny toy that keeps the multi-game architecture honest (slated for removal after beta). Further games slot into the same shape — one new folder under `src/`, one new line in `src/games.ts`, one new Postgres schema.

Known cosmetic gaps and deferred work are in [`docs/deferred.md`](docs/deferred.md).
