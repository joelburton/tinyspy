# Testing

How we test this codebase. Read this before writing or extending a test. Gametype-specific testing notes live in [`tinyspy.md`](tinyspy.md), [`psychicnum.md`](psychicnum.md), etc.; this file is the cross-cutting layer.

Audience: human contributors and AI assistants. Per the [CLAUDE.md](../CLAUDE.md) prior on alpha software, we're not aiming for production-grade test coverage — we're aiming for tests that catch real regressions and that document behavior clearly enough that a reader can predict it.

## Our theory of testing

Two test layers exist, and they're for different things:

- **pgTAP (database tests)** — `supabase/tests/<schema>/*_test.sql`. Runs against a real local Supabase Postgres. Tests **server-authoritative behavior**: RPCs, RLS policies, triggers, schema constraints, the game-rule logic that lives in PL/pgSQL.
- **Vitest (frontend tests)** — `src/**/*.test.ts(x)`. Runs against jsdom with a stubbed Supabase client. Tests **UI behavior and pure derivations**: React hook state machines, routing, pure helper functions (like phase derivation), components rendering correctly given mocked data.

The split mirrors the architecture: **game state lives in Postgres and mutates only through RPCs.** Anything that proves the game *works* is a DB test. Anything that proves the game is *usable* is a FE test.

### Decide where a test goes

Use this when you're about to write a test:

| If you're verifying… | Test layer | Example |
|---|---|---|
| An RPC returns the right value or raises the right error | pgTAP | "`tinyspy.submit_guess` returns `'G'` and decrements `turns_remaining`" |
| RLS prevents the wrong user from seeing data | pgTAP | "dee can't `SELECT` from `tinyspy.games` she's not a player in" |
| A trigger fires on the right state transition | pgTAP | "ending a tinyspy game deletes the matching `common.games` (with is_active filter) row" |
| A check constraint rejects bad input | pgTAP | "`messages.content` must be 1–1000 chars" |
| Server-side randomness produces the right distribution | pgTAP | tinyspy's 25-tile key-card distribution check |
| A pure TypeScript function returns the right value | Vitest | `phase()` returns `'clue'` for a fresh game |
| A React hook moves through the right states | Vitest | `useSession` flips `loading → session → null` correctly |
| A component renders the right text given props | Vitest | `GameLog` shows "G" for revealed greens |
| Cross-component integration in the browser | manual smoke test | "Start a game, send a clue, see it appear in partner's window" |

The grey zone is **business logic at the boundary**: things like "if the game just ended, the FE shows the play-again button." That's a state-derivation question, and lives at whichever layer owns the derivation. Currently those derivations live in pure helpers (`src/tinyspy/lib/phase.ts`), so they're FE-tested. Don't replicate them as pgTAP assertions.

### What we don't test

These are deliberate gaps:

- **End-to-end browser tests** (Playwright, Cypress, etc.). We rely on manual smoke testing instead. The cost of an E2E harness against a live Supabase stack is high; the value at this stage is low. If a regression keeps slipping past pgTAP + Vitest + smoke, that's the signal to add E2E.
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

`\ir` resolves the path **relative to the including file's directory**, so the single line works from every subdirectory (`tests/common/`, `tests/tinyspy/`, `tests/psychicnum/`). `\i` would resolve relative to psql's working directory, which varies depending on how the test is invoked.

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
select tinyspy.create_game(some_club_id);                         -- runs as ada

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');  -- now I'm bea
select tinyspy.submit_clue(...);                                  -- runs as bea
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
| `select throws_ok($$ <sql> $$, sqlstate, message_substring, description)` | The wrapped SQL raises an exception matching the SQLSTATE and (optionally) message substring. Use `null` for the message to match any. |
| `select lives_ok($$ <sql> $$, description)` | The wrapped SQL doesn't raise. The "no error" partner of `throws_ok`. |
| `select * from finish()` | Emit the closing TAP plan footer. Always at the end, just before `rollback`. |

The pattern of `throws_ok($$ <sql> $$, 'P0001', 'must contain alphanumerics', '<test name>')` reads naturally: "running this SQL throws SQLSTATE P0001 with a message containing the substring."

### SQLSTATE conventions

Our RPCs raise three SQLSTATEs:

| code | meaning | when |
|---|---|---|
| `42501` | `insufficient_privilege` | not authenticated; not a member; not authorized for this action |
| `P0001` | `raise_exception` (custom) | rule violation in the body — wrong phase, bad input, business-logic reject |
| `P0002` | `no_data` | row not found (game doesn't exist, etc.) |

Tests assert on the code, not the wording. The exact error string is described in `throws_ok`'s third parameter as a *substring match* so we can tighten it when we genuinely want to lock down the message and stay loose otherwise.

## Per-gametype test setup (future)

`_shared/setup.psql` covers what every test in the suite needs. As games grow more complex, there'll be helpers that are useful within a gametype but not across — e.g., a boggle test might want `pg_temp.assert_board_has_word(g uuid, w text)`, which has no analog in psychic-num or tinyspy.

The pattern in use:

```
supabase/tests/
  _shared/
    setup.psql                 # ada/bea/cade/dee/eda + as_user (everyone uses this)
  tinyspy/
    setup.psql                 # find_position, find_position_set, tinyspy_setup
    create_game_test.sql       # \ir ../_shared/setup.psql
                               # \ir setup.psql
                               # ...test body...
```

The doubly-included pattern: every test imports `_shared/setup.psql` first (everyone needs personas), then optionally a per-gametype `setup.psql` if the game has accumulated enough shared scaffolding to justify it. The per-gametype file lives alongside the tests in `supabase/tests/<game>/`, using the same `.psql` extension trick to stay invisible to discovery.

We import both explicitly, rather than chaining the shared include from inside the per-gametype file. The reader sees every dependency at the top of the test without having to open `setup.psql` to learn what it pulls in.

**Don't pre-emptively create per-gametype setup files.** Wait until the duplication is real and the helpers have stabilized — extracting too early invites a mini-framework whose shape doesn't match what the next game actually needs.

Today's state: **tinyspy** has a per-gametype `setup.psql` (three helpers: `find_position`, `find_position_set`, `tinyspy_setup`). **psychic-num**'s only helper is inline target-pinning at one site — still below the promotion threshold.

## Frontend testing

Stack: [Vitest](https://vitest.dev/) + [jsdom](https://github.com/jsdom/jsdom) + [`@testing-library/react`](https://testing-library.com/docs/react-testing-library/intro/). Config in `vite.config.ts`.

### Canonical examples

| file | what it tests | shape |
|---|---|---|
| [`src/common/hooks/useSession.test.ts`](../src/common/hooks/useSession.test.ts) | The session hook's state transitions (loading → session → null) | Mocks `supabase.auth.onAuthStateChange`, drives it manually via `act`, asserts on the hook's returned state via `renderHook`. The canonical "test a Supabase-hook in isolation" pattern. |
| [`src/common/lib/router.test.ts`](../src/common/lib/router.test.ts) | The hand-rolled router (`navigate`, `usePath`) | Uses jsdom's `window.location` and `window.history` directly. No mocking required — just drive the History API and assert. |
| [`src/tinyspy/lib/phase.test.ts`](../src/tinyspy/lib/phase.test.ts) | Pure phase derivation | No DOM, no mocking, no hooks — just `expect(phase(...)).toBe(...)`. The kind of test that's free to write and free to keep. |
| [`src/tinyspy/hooks/useBoard.test.ts`](../src/tinyspy/hooks/useBoard.test.ts) | The board hook's data flow | Mocks the Supabase client at module level, drives the hook through fetch/realtime updates. |
| [`src/tinyspy/components/GameLog.test.tsx`](../src/tinyspy/components/GameLog.test.tsx) | A component rendering its props | Renders the component, asserts on text and structure. No store, no mock — just the input → output. |

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

## Running the suites

```bash
npm test               # FE first, then DB; the canonical "is everything green"
npm run test:fe        # Vitest only (add `-- --watch` for the dev loop)
npm run test:db        # pgTAP only — needs the local Supabase stack running
```

Single-file pgTAP run, for tightening one test:

```bash
supabase test db --local supabase/tests/tinyspy/create_game_test.sql
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
