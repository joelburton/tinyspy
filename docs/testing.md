# Testing

How we test this codebase. Read this before writing or extending a test. Gametype-specific testing notes live in [`codenamesduet.md`](games/codenamesduet.md), [`psychicnum.md`](games/psychicnum.md), etc.; this file is the cross-cutting layer.

Audience: human contributors and AI assistants. Per the [CLAUDE.md](../CLAUDE.md) prior on alpha software, we're not aiming for production-grade test coverage — we're aiming for tests that catch real regressions and that document behavior clearly enough that a reader can predict it.

## Our theory of testing

Two test layers do most of the work, and they're for different things:

- **pgTAP (database tests)** — `supabase/tests/<schema>/*_test.sql`. Runs against a real local Supabase Postgres. Tests **server-authoritative behavior**: RPCs, RLS policies, triggers, schema constraints, the game-rule logic that lives in PL/pgSQL.
- **Vitest (frontend tests)** — `src/**/*.test.ts(x)`. Runs against jsdom with a stubbed Supabase client. Tests **UI behavior and pure derivations**: React hook state machines, routing, pure helper functions (like phase derivation), components rendering correctly given mocked data.

The split mirrors the architecture: **game state lives in Postgres and mutates only through RPCs.** Anything that proves the game *works* is a DB test. Anything that proves the game is *usable* is a FE test.

Two narrower layers sit alongside them:

- **Deno tests (edge-function logic)** — `supabase/functions/**/*_test.ts`, run by `npm run test:edge`. The build-board edge functions can't be imported into a Vitest test (their `index.ts` calls `serve()` and loads remote `https:`/`jsr:` modules on import), so each extracts its **pure** board-building logic into a sibling `board.ts` / `gen.ts` and covers it there, dependency-free. The orchestration + I/O around it stay verified by `deno check` + the e2e suite. The AI/import functions aren't unit-tested (prompt churn; the output is human-judged).
- **Playwright e2e (browser + live stack)** — see [E2E smoke tests](#e2e-smoke-tests-playwright) below.

### Decide where a test goes

Use this when you're about to write a test:

| If you're verifying… | Test layer | Example |
|---|---|---|
| An RPC returns the right value or raises the right error | pgTAP | "`codenamesduet.submit_guess` returns `'G'` and decrements `turns_remaining`" |
| RLS prevents the wrong user from seeing data | pgTAP | "dee can't `SELECT` from `codenamesduet.games` she's not a player in" |
| An RPC writes the right state transition | pgTAP | "ending a codenamesduet game flips `common.games.is_terminal=true` and writes the outcome jsonb" |
| A check constraint rejects bad input | pgTAP | "`messages.content` must be 1–1000 chars" |
| Server-side randomness produces the right distribution | pgTAP | codenamesduet's 25-tile key-card distribution check |
| A pure TypeScript function returns the right value | Vitest | `phase()` returns `'clue'` for a fresh game |
| A React hook moves through the right states | Vitest | `useSession` flips `loading → session → null` correctly |
| A component renders the right text given props | Vitest | `GameTurnLog` renders a turn row from props |
| Cross-component integration in the browser | manual smoke test | "Start a game, send a clue, see it appear in partner's window" |

The grey zone is **business logic at the boundary**: things like "if the game just ended, the FE shows the play-again button." That's a state-derivation question, and lives at whichever layer owns the derivation. Currently those derivations live in pure helpers (`src/codenamesduet/lib/phase.ts`), so they're FE-tested. Don't replicate them as pgTAP assertions.

### What we don't test

These are deliberate gaps:

- **Performance / load tests.** Friends-only audience; not a concern yet.
- **Specific error message wording in the FE.** We assert on error *codes* and *categories*, not on the exact human-readable string. Wording changes shouldn't break tests.
- **CSS / visual regression.** Manual.

## Common pgTAP setup

Every pgTAP file shares the same five-line opening:

```sql
begin;

set search_path = <schema>, common, public, extensions;

\ir ../_shared/setup.psql

select plan(N);

-- ...assertions...

select * from finish();
rollback;
```

The `\ir ../_shared/setup.psql` line loads [`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql), which:

1. Inserts five `auth.users` rows for the standard personas (see [Personas](#personas) below).
2. Defines the `pg_temp.as_user(uid uuid)` helper for simulating an authenticated caller.

The trigger on `auth.users` materializes a `common.profiles` row + a solo club for each persona, so every test starts with five profiles and five solo clubs available. The `begin`/`rollback` wrap means none of it leaks across tests.

### Why `\ir`, not `\i`

`\ir` resolves the path **relative to the including file's directory**, so the single line works from every subdirectory (`tests/common/`, `tests/codenamesduet/`, `tests/psychicnum/`). `\i` would resolve relative to psql's working directory, which varies depending on how the test is invoked.

### Why `.psql`, not `.sql`

`supabase test db` discovers any `*.sql` file under `supabase/tests/` and tries to run it as a standalone test. Naming the include file `setup.psql` keeps `\ir` happy (it doesn't care about extensions) while staying invisible to the test discovery walker.

## Personas

The shared setup file loads five fixture users with stable roles. Use them by these conventions so a reader can predict who's who without re-checking the fixture block:

| persona | UUID | role |
|---|---|---|
| **ada** | `ada11111-1111-1111-1111-111111111111` | Default test subject. In the club, in the game. When the test just needs "some authenticated user," use ada. |
| **bea** | `bea22222-2222-2222-2222-222222222222` | Second player. In the club, in the game. Reach for bea when the test needs two people interacting. |
| **cade** | `cade3333-3333-3333-3333-333333333333` | In the club but not necessarily in the current game. Use cade for "a club member who isn't playing this particular game" scenarios. |
| **dee** | `dee44444-4444-4444-4444-444444444444` | Outside the club entirely. Use dee for "should be rejected by RLS / membership check." |
| **eda** | `eda55555-5555-5555-5555-555555555555` | Second outsider, for the rare two-non-member test. |

Mnemonic: ada/bea/cade are inside (alphabetically adjacent); dee/eda are outside (the next two letters).

The UUIDs are self-evident on purpose. The first hex block embeds the persona name (`ada11111…`, `bea22222…`, …) so a stack trace or query result referencing one immediately tells you who the actor was — no "who's `1111…` again?" sidecar lookup. The padding chars match the persona's position in the list (1 for ada, 2 for bea, …) so they're still well-formed UUIDs.

The roles are conventions, not constraints — there's nothing in `setup.psql` that prevents you from making dee a club member in a specific test. But if you're tempted to, ask whether the test is really about who you think it's about. Crossing personas usually means a fixture is doing double duty in a way that hurts readability.

## Common pgTAP helpers

### `pg_temp.as_user(uid uuid)`

Switches the session to act as a given authenticated user. Sets `request.jwt.claims` (where `auth.uid()` reads from) and `role = authenticated` (which RLS policies and grants check against). Defined in `_shared/setup.psql`.

Usage:

```sql
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');  -- now I'm ada
select codenamesduet.create_game(some_club_handle);                     -- runs as ada

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');  -- now I'm bea
select codenamesduet.submit_clue(...);                                  -- runs as bea
```

To drop back to the postgres superuser (e.g. to bypass RLS for a cross-user assertion):

```sql
reset role;
-- ...read whatever...
```

To simulate an unauthenticated caller (clears the JWT claim while staying in the postgres role so the function call itself succeeds and hits its own auth check):

```sql
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);
```

### pgTAP assertion functions

The four we use most:

| function | meaning |
|---|---|
| `select plan(N)` | I expect to run N assertions. pgTAP reports a parse error if I run a different number — this catches dropped/extra assertions. |
| `select is(actual, expected, description)` | `actual = expected` (with proper NULL handling). The everyday assertion. |
| `select ok(boolean, description)` | The argument is true. Use when there's no obvious "expected value." |
| `select throws_ok($$ <sql> $$, sqlstate, message, description)` | The wrapped SQL raises an exception matching the SQLSTATE and (optionally) the message. Use `null` for the message to match any. **The message is matched EXACTLY**, not as a substring — pass the full string including any interpolated `(got X)` suffix, or use `null` to assert on the code alone. For partial matching use `throws_like` (SQL `LIKE` pattern) or `throws_matching` (regex). |
| `select lives_ok($$ <sql> $$, description)` | The wrapped SQL doesn't raise. The "no error" partner of `throws_ok`. |
| `select * from finish()` | Emit the closing TAP plan footer. Always at the end, just before `rollback`. |

The pattern of `throws_ok($$ <sql> $$, 'P0001', 'guess must be 5 letters', '<test name>')` reads naturally: "running this SQL throws SQLSTATE P0001 with exactly that message." When the message carries an interpolated value you don't want to pin, drop to `null` (code-only) or `throws_like`.

### SQLSTATE conventions

Our RPCs raise three SQLSTATEs:

| code | meaning | when |
|---|---|---|
| `42501` | `insufficient_privilege` | not authenticated; not a member; not authorized for this action |
| `P0001` | `raise_exception` (custom) | rule violation in the body — wrong phase, bad input, business-logic reject |
| `P0002` | `no_data` | row not found (game doesn't exist, etc.) |

Tests usually assert on the code, not the wording. When a test *does* pin the message (e.g. to prove which of several `P0001` branches fired — see `waffle/validation_test.sql`), remember the match is exact: pass the full string, or stay loose with `null` / `throws_like`.

## Per-gametype test setup

`_shared/setup.psql` covers what every test in the suite needs. On top of it, most games have accumulated helpers that are useful within a gametype but not across — e.g., a boggle test wants a board-has-word assertion that has no analog in psychicnum. This is now the norm: nine games carry a per-gametype `setup.psql` (boggle, codenamesduet, connections, crosswords, scrabble, spellingbee, stackdown, waffle, wordle); only psychicnum and bananagrams stay below the promotion threshold.

The pattern in use:

```
supabase/tests/
  _shared/
    setup.psql                 # ada/bea/cade/dee/eda + as_user (everyone uses this)
  codenamesduet/
    setup.psql                 # find_position, find_position_set, codenamesduet_setup
    create_game_test.sql       # \ir ../_shared/setup.psql
                               # \ir setup.psql
                               # ...test body...
```

The doubly-included pattern: every test imports `_shared/setup.psql` first (everyone needs personas), then optionally a per-gametype `setup.psql` if the game has accumulated enough shared scaffolding to justify it. The per-gametype file lives alongside the tests in `supabase/tests/<game>/`, using the same `.psql` extension trick to stay invisible to discovery.

We import both explicitly, rather than chaining the shared include from inside the per-gametype file. The reader sees every dependency at the top of the test without having to open `setup.psql` to learn what it pulls in.

**Don't pre-emptively create per-gametype setup files.** Wait until the duplication is real and the helpers have stabilized — extracting too early invites a mini-framework whose shape doesn't match what the next game actually needs.

Example: **codenamesduet**'s per-gametype `setup.psql` carries three helpers (`find_position`, `find_position_set`, `codenamesduet_setup`). At the other end, **psychicnum**'s only helper is inline target-pinning at one site — still below the promotion threshold, which is why it (and bananagrams) has no file.

## Frontend testing

Stack: [Vitest](https://vitest.dev/) + [jsdom](https://github.com/jsdom/jsdom) + [`@testing-library/react`](https://testing-library.com/docs/react-testing-library/intro/). Config in `vite.config.ts`.

### Canonical examples

| file | what it tests | shape |
|---|---|---|
| [`src/common/hooks/session/useSession.test.ts`](../src/common/hooks/session/useSession.test.ts) | The session hook's state transitions (loading → session → null) | Mocks `supabase.auth.onAuthStateChange`, drives it manually via `act`, asserts on the hook's returned state via `renderHook`. The canonical "test a Supabase-hook in isolation" pattern. |
| [`src/common/lib/routing/router.test.ts`](../src/common/lib/routing/router.test.ts) | The hand-rolled router (`navigate`, `usePath`) | Uses jsdom's `window.location` and `window.history` directly. No mocking required — just drive the History API and assert. |
| [`src/codenamesduet/lib/phase.test.ts`](../src/codenamesduet/lib/phase.test.ts) | Pure phase derivation | No DOM, no mocking, no hooks — just `expect(phase(...)).toBe(...)`. The kind of test that's free to write and free to keep. |
| [`src/codenamesduet/hooks/useBoard.test.ts`](../src/codenamesduet/hooks/useBoard.test.ts) | The board hook's data flow | Mocks the Supabase client at module level, drives the hook through fetch/realtime updates. |
| [`src/codenamesduet/components/GameTurnLog.test.tsx`](../src/codenamesduet/components/GameTurnLog.test.tsx) | A component rendering its props | Renders the component, asserts on text and structure. No store, no mock — just the input → output. |

The pattern is: **mock at the lowest layer that lets you write the test simply**. For `useSession`, that's the Supabase auth API. For `useBoard`, it's the Supabase client. For a pure function, it's nothing.

### Patterns we follow

- **Asserting on text content, not on class names.** Class names get hashed by CSS Modules and would change every time a stylesheet shifts. `expect(screen.getByText('Sudden death')).toBeInTheDocument()`, not `expect(...).toHaveClass(styles.suddenDeath)`.
- **`act()` around state changes from mock callbacks.** When a test fires a fake realtime event or auth callback, React's act wrapper makes sure the resulting re-render flushes before we assert.
- **No snapshot tests.** They drift and get accepted blindly.
- **`mock` calls scoped per-test, not globally.** Vitest's `vi.mock` is fine, but prefer `vi.spyOn` inside individual tests when possible — keeps the mocking footprint visible at the use site.

### What we don't do

- No render-with-router wrappers. The app uses a hand-rolled router that's so simple it doesn't need a `<Router>` provider; tests that need a path just `window.history.replaceState` and re-render.
- No "test the suspense fallback" — Suspense in this app is a thin lazy-loading affordance, not a behavior. The boundary is tested implicitly by manual smoke.
- No mocking of Realtime channel internals. If a test needs to simulate a realtime event, mock the higher-level `from(...).on(...).subscribe(...)` callback that the hook actually calls.

## E2E smoke tests (Playwright)

A Playwright suite (`e2e/`, `npm run test:e2e`) for the surfaces Vitest and pgTAP structurally can't reach — anything that needs a **real browser against the live local stack**. The original and still-core reason is **realtime presence / pause / multi-client behavior**: the unit suites mock the Supabase client, so the realtime layer — exactly the part that has broken — is the part they never exercise. Over time the suite grew to cover the other browser-only surfaces too, and that growth is deliberate, not scope creep.

**Scope boundary (intentional):** this is NOT for routine game *logic* — move legality, RPC results, RLS, pure derivations all stay in Vitest + pgTAP. E2E covers only what a real browser + the live stack can exercise, which today falls in these buckets:

- **realtime / presence / auth (the core)** — member presence dots (a present member's dot fills, a leaving member's goes hollow); the abandoned-game heal (`is_current_view` cleared when the club page loads); pause-on-disconnect (one player disconnects, the other's game pauses); the auth gate (a stale session lands on LoginScreen; an unclaimed session gets the username gate with a working sign-out). These run two real browser contexts.
- **responsive layout** — the `*-mobile.e2e.ts` specs: at phone viewports the board fills, the page never scrolls, and the info sheet slides in/out. Pure CSS/flex geometry jsdom can't measure (see [verify-layout-headless] in memory / docs/mobile.md).
- **real PDF generation** — the `*-print.e2e.ts` smokes: the "Print board (PDF)" menu item downloads a `%PDF-` file. jsPDF's runtime is unreachable by the mocked component tests (the `common/pdf/` unit tests use a fake jsPDF; these use the real one).
- **the turn-history overlay** — the `*-history.e2e.ts` specs: clicking a turn-log `#N` replays it on the board with the frame/banner, and the shared exit paths (key / board click / any click) work. Overlay + no-reflow properties jsdom can't see.
- **game-specific browser behavior** — chat unread, clue-form focus traps, tap-to-trace, AI opponent, the bananagrams touch block, etc.

The list is illustrative, not a contract. When you add a spec, add it for a browser-only surface in one of these buckets — not to re-test logic Vitest/pgTAP already own.

**Reach for e2e EARLY when triaging an integration bug — not only as a regression guard after the fix.** When a bug lives in the live-stack layer (realtime, or the auth/session boot that depends on a real JWT in localStorage + `onAuthStateChange` + a real `getUser()` round-trip), a throwaway e2e that drives the *real* flow tells you what's actually broken faster than reasoning about it or reproducing in Node — where you're guessing at supabase-js internals and error shapes. Concretely: the "stuck on the username gate" bug ate an afternoon of Node repro scripts that kept showing the code *should* work; a 30-second e2e (sign in → delete the user → reload) would have shown immediately that the deleted-user path recovers fine, redirecting to the real cause (a valid session on the gate with no escape hatch). The fixtures already exist, so the cost of standing one up is low and the signal is the real thing, not a mock. Mocked unit tests are complementary — they can pin error shapes the real backend won't produce — but they're where a *clean* mock can quietly hide the messy reality (see `useSession.test.ts`).

**How it works.** No magic-link flow: `e2e/helpers/fixtures.ts` creates confirmed users + claims usernames + builds clubs/games through the admin API and the same RPCs the app uses, then `e2e/helpers/session.ts` seeds each user's Supabase session into `localStorage` (key `sb-127-auth-token`, the local-URL default) *before* the app boots, so it loads already signed in. Two `browser.newContext()`s = two independent users in one test.

**Running it:**

```bash
npm run test:e2e       # needs the local Supabase stack running; auto-starts the Vite dev server
```

Deliberately **not** part of `npm test` — it's slower and flakier (real realtime timing), so run it before a push/deploy, not on every save. It accumulates suffixed test users/clubs in the local DB; `npm run db:reset` clears them. If the local Supabase URL ever changes, recompute the storage key via `createClient(url, key).auth.storageKey`.

The **WebKit + Firefox engines are installed** (`npx playwright install webkit firefox`), so cross-engine (Safari / Firefox) layout repro is available beyond the default Chromium run.

## Repo-wide invariant guards

A couple of tests guard an invariant across ALL schemas/games from a
hand-maintained registry, so a new game is covered automatically (or forces a
one-line update) instead of each game needing its own copy:

- **`src/schemaExposure.e2e.test.ts`** (Vitest) — every registered game schema is
  reachable through PostgREST (the `[api] schemas` exposure that a `db reset`
  doesn't re-read). Derived from the game registry, so a new game is covered for
  free.
- **`supabase/tests/common/realtime_publication_test.sql`** (pgTAP) — the single
  source of truth for the [publication invariant](supabase.md) (every table a
  channel subscribes to via `postgres_changes` must be in `supabase_realtime`, or
  the whole subscription silently dies). One `set_eq` compares the publication
  against a registry of every FE subscription — catching both a missing table
  (live updates die) and an extra one (replication overhead). **Update its
  `expected` list when a hook adds or drops a `postgres_changes` subscription**
  (re-derive with `grep -rn "table:" src`).

## Running the suites

```bash
npm test               # FE first, then DB; the canonical "is everything green" (NOT e2e)
npm run test:fe        # Vitest only (add `-- --watch` for the dev loop)
npm run test:db        # pgTAP only — needs the local Supabase stack running
npm run test:edge      # Deno tests for the edge-function pure logic (deno test)
npm run test:e2e       # Playwright realtime smoke tests — see above
```

**CI.** `.github/workflows/ci.yml` runs the two stack-free gates — `tsc -b` and
`eslint` — on every push + pull request. `test:fe` is also stack-free and a
candidate to add; `test:db` / `test:e2e` would need a Supabase service container,
so they stay local for now.

Single-file pgTAP run, for tightening one test:

```bash
supabase test db --local supabase/tests/codenamesduet/create_game_test.sql
```

`supabase test db` does its own `create extension if not exists pgtap` against the local DB before invoking pg_prove, so individual test files don't need to install the extension themselves.

After SQL changes, `npm run db:reset` to replay all migrations against a fresh DB. The reset wipes everything in the local DB; that's accepted under the alpha-software prior.

## Test failure debugging

pgTAP output looks like:

```
# Failed test 12: "submit_guess: wrong guess returns 'wrong'"
#         have: lost
#         want: wrong
```

The `have` / `want` lines and the test name are usually enough to find the assertion. If the failure is upstream — an error before `plan(N)` was satisfied — pgTAP shows:

```
# Looks like you planned 17 tests but ran 14
```

That means an unhandled exception aborted the test mid-run. Look at the psql output preceding the TAP report for the actual error.

Vitest output is conventional Jest-style: test name, failed expectation, line number. The most common gotcha is forgetting `await` on something async, which manifests as "expected X to be defined" — the assertion runs before the promise settles.

## Maintaining the persona convention

If you add a sixth persona, document it in [`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql) alongside the existing five, and update the table above. If you rename one, do it consistently across every test in a single commit — the personas are convention-as-API; partial renames hurt readability more than they help.

If a specific test needs a persona who *isn't* in the standard set (e.g., "the user whose username is exactly 40 characters"), it's fine to insert that user inline within the test rather than promoting them to the shared setup. Promote only when the same user shows up in three or more tests.
