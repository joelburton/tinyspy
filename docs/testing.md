# Testing

How we test this codebase. Read this before writing or extending a test.
Gametype-specific testing notes live with the game — in `docs/games/<game>.md`,
or in `src/<game>/doc.md` for a game whose area has been audited; this file is
the cross-cutting layer.

We're not aiming for a coverage number. We're aiming for tests that catch real
regressions and that document behavior clearly enough that a reader can predict
it.

## Our theory of testing

Two test layers do most of the work, and they're for different things:

- **pgTAP (database tests)** — `supabase/tests/<schema>/*_test.sql`. Runs
  against a real local Supabase Postgres. Tests **server-authoritative
  behavior**: RPCs, RLS policies, triggers, schema constraints, the game-rule
  logic that lives in PL/pgSQL.
- **Vitest (frontend tests)** — `src/**/*.test.ts(x)`. Runs against jsdom with a
  stubbed Supabase client. Tests **UI behavior and pure derivations**: React
  hook state machines, routing, pure helper functions (like phase derivation),
  components rendering correctly given mocked data.

The split mirrors the architecture: **game state lives in Postgres and mutates
only through RPCs.** Anything that proves the game *works* is a DB test.
Anything that proves the game is *usable* is a FE test.

Two narrower layers sit alongside them:

- **Deno tests (edge-function logic)** — `supabase/functions/**/*_test.ts`, run
  by `npm run test:edge`. The build-board edge functions can't be imported into
  a Vitest test (their `index.ts` calls `serve()` and loads remote
  `https:`/`jsr:` modules on import), so each extracts its **pure**
  board-building logic into a sibling `board.ts` / `gen.ts` and covers it there,
  dependency-free. The orchestration + I/O around it stay verified by `deno
  check` + the e2e suite. The AI/import functions aren't unit-tested (prompt
  churn; the output is human-judged).
- **Playwright e2e (browser + live stack)** — see [E2E smoke
  tests](#e2e-smoke-tests-playwright) below.

### Decide where a test goes

Use this when you're about to write a test:

| If you're verifying… | Test layer | Example |
|---|---|---|
| An RPC answers the right envelope — `ok` with its payload, or `not-ok` with its severity and code | pgTAP | "`codenamesduet.submit_guess` on a bystander answers `ok` with `result: 'bystander'`" |
| RLS prevents the wrong user from seeing data | pgTAP | "dee can't `SELECT` a game from a club she isn't in" |
| An RPC writes the right state transition | pgTAP | "ending a codenamesduet game flips `common.games.is_terminal=true` and writes the outcome jsonb" |
| A check constraint rejects bad input | pgTAP | "`messages.content` must be 1–1000 chars" |
| Server-side randomness produces the right distribution | pgTAP | codenamesduet's 25-tile key-card distribution check |
| A pure TypeScript function returns the right value | Vitest | `phase()` returns `'clue'` for a fresh game |
| A React hook moves through the right states | Vitest | `useSession` flips `loading → session → null` correctly |
| A component renders the right text given props | Vitest | `GameEventLog` renders a turn row from props |
| Something only a real browser against the live stack can show | Playwright e2e | "one player disconnects and the other's game pauses" |

The gray zone is **business logic at the boundary**: things like "if the game
just ended, the FE shows the play-again button." That's a state-derivation
question, and lives at whichever layer owns the derivation. Currently those
derivations live in pure helpers (`src/codenamesduet/lib/phase.ts`), so they're
FE-tested. Don't replicate them as pgTAP assertions.

### What we don't test

These are deliberate gaps:

- **Performance / load tests.** Friends-only audience; not a concern yet.
- **Specific message wording.** We assert on a not-ok's *code* and *severity*,
  not the exact sentence, unless the sentence is the subject. Wording changes
  shouldn't break tests.
- **CSS / visual regression.** Looked at by a person, through [the screenshot
  gallery](#the-screenshot-gallery); headless Playwright checks layout
  *geometry* (no page scroll, a board inside the viewport), not looks.

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

The `\ir ../_shared/setup.psql` line loads
[`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql),
which:

1. Inserts five `auth.users` rows for the standard personas (see
   [Personas](#personas) below).
2. Defines `pg_temp.as_user(uid uuid)`, for simulating an authenticated caller,
   and `pg_temp.create_club(name, usernames)`, for a test that just needs a
   club.

A test whose subject answers in an envelope — nearly every RPC — also loads
[`_shared/envelope.psql`](../supabase/tests/_shared/envelope.psql) for
`envelope_is` (below). `src/guards/pgtapIncludes.test.ts` fails a file that uses
a helper without including the file that defines it.

The trigger on `auth.users` materializes a `common.profiles` row + a solo club
for each persona, so every test starts with five profiles and five solo clubs
available. The `begin`/`rollback` wrap means none of it leaks across tests.

### Why `\ir`, not `\i`

`\ir` resolves the path **relative to the including file's directory**, so the
single line works from every subdirectory (`tests/common/`,
`tests/codenamesduet/`, `tests/psychicnum/`). `\i` would resolve relative to
psql's working directory, which varies depending on how the test is invoked.

### Why `.psql`, not `.sql`

`supabase test db` discovers any `*.sql` file under `supabase/tests/` and tries
to run it as a standalone test. Naming the include file `setup.psql` keeps `\ir`
happy (it doesn't care about extensions) while staying invisible to the test
discovery walker.

## Personas

The shared setup file loads five fixture users with stable roles. Use them by
these conventions so a reader can predict who's who without re-checking the
fixture block:

| persona | UUID | role |
|---|---|---|
| **ada** | `ada11111-1111-1111-1111-111111111111` | Default test subject. In the club, in the game. When the test just needs "some authenticated user," use ada. |
| **bea** | `bea22222-2222-2222-2222-222222222222` | Second player. In the club, in the game. Reach for bea when the test needs two people interacting. |
| **cade** | `cade3333-3333-3333-3333-333333333333` | In the club but not necessarily in the current game. Use cade for "a club member who isn't playing this particular game" scenarios. |
| **dee** | `dee44444-4444-4444-4444-444444444444` | Outside the club entirely. Use dee for "should be rejected by RLS / membership check." |
| **eda** | `eda55555-5555-5555-5555-555555555555` | Second outsider, for the rare two-non-member test. |

Mnemonic: ada/bea/cade are inside (alphabetically adjacent); dee/eda are outside
(the next two letters).

The UUIDs are self-evident on purpose. The first hex block embeds the persona
name (`ada11111…`, `bea22222…`, …) so a stack trace or query result referencing
one immediately tells you who the actor was — no "who's `1111…` again?" sidecar
lookup. The padding chars match the persona's position in the list (1 for ada, 2
for bea, …) so they're still well-formed UUIDs.

The roles are conventions, not constraints — there's nothing in `setup.psql`
that prevents you from making dee a club member in a specific test. But if
you're tempted to, ask whether the test is really about who you think it's
about. Crossing personas usually means a fixture is doing double duty in a way
that hurts readability.

## Common pgTAP helpers

### `pg_temp.as_user(uid uuid)`

Switches the session to act as a given authenticated user. Sets
`request.jwt.claims` (where `auth.uid()` reads from) and `role = authenticated`
(which RLS policies and grants check against). Defined in `_shared/setup.psql`.

Usage:

```sql
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');  -- now I'm ada
select codenamesduet.create_game(some_club_handle);                     -- runs as ada

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');  -- now I'm bea
select codenamesduet.submit_clue(...);                                  -- runs as bea
```

To drop back to the postgres superuser (e.g. to bypass RLS for a cross-user
assertion):

```sql
reset role;
-- ...read whatever...
```

To simulate an unauthenticated caller (clears the JWT claim while staying in the
postgres role so the function call itself succeeds and hits its own auth check):

```sql
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);
```

### pgTAP assertion functions

The ones we use most:

| function | meaning |
|---|---|
| `select plan(N)` | I expect to run N assertions. pgTAP reports a parse error if I run a different number — this catches dropped/extra assertions. |
| `select pg_temp.envelope_is(actual, expected, description)` | The RPC's envelope **contains** the expected fields — containment, not equality, so a test names only the fields it is about and a new `meta` breadcrumb breaks nothing. On a failure it names each field that differed. The everyday assertion for an RPC. |
| `select is(actual, expected, description)` | `actual = expected` (with proper NULL handling). The everyday assertion. |
| `select ok(boolean, description)` | The argument is true. Use when there's no obvious "expected value." |
| `select throws_ok($$ <sql> $$, sqlstate, message, description)` | The wrapped SQL raises an exception matching the SQLSTATE and (optionally) the message. Use `null` for the message to match any. **The message is matched EXACTLY**, not as a substring — pass the full string including any interpolated `(got X)` suffix, or use `null` to assert on the code alone. For partial matching use `throws_like` (SQL `LIKE` pattern) or `throws_matching` (regex). |
| `select lives_ok($$ <sql> $$, description)` | The wrapped SQL doesn't raise. The "no error" partner of `throws_ok`. |
| `select * from finish()` | Emit the closing TAP plan footer. Always at the end, just before `rollback`. |

### Asserting a refusal

An RPC catches its own raises and **answers** a not-ok envelope rather than
throwing ([envelopes.md](envelopes.md)), so a refusal is asserted with
`envelope_is`, naming the fields that are the point — usually `type` and
`severity`, plus `dbcode` when the test is proving which of several refusals
fired:

```sql
select pg_temp.envelope_is(
  common.anagrams('ab1'),
  '{"type":"not-ok","severity":"form-validation"}'::jsonb,
  'digits are rejected');
```

`throws_ok` is for what still throws: a direct table write that RLS or a grant
refuses (`42501`, `insufficient_privilege`), a constraint violation, or an
internal helper called directly rather than through the RPC that catches it.

## Per-gametype test setup

`_shared/setup.psql` covers what every test in the suite needs. On top of it,
most games have accumulated helpers that are useful within a gametype but not
across — a boggle test wants a board-has-word assertion that has no analog in
psychicnum — and keep them in a per-gametype `setup.psql`.

The pattern in use:

```
supabase/tests/
  _shared/
    setup.psql                 # ada/bea/cade/dee/eda, as_user, create_club (everyone)
    envelope.psql              # envelope_is (any test of an RPC)
  codenamesduet/
    setup.psql                 # this game's helpers
    create_game_test.sql       # \ir ../_shared/setup.psql
                               # \ir ../_shared/envelope.psql
                               # \ir setup.psql
                               # ...test body...
```

The doubly-included pattern: every test imports `_shared/setup.psql` first
(everyone needs personas), then optionally a per-gametype `setup.psql` if the
game has accumulated enough shared scaffolding to justify it. The per-gametype
file lives alongside the tests in `supabase/tests/<game>/`, using the same
`.psql` extension trick to stay invisible to discovery.

We import both explicitly, rather than chaining the shared include from inside
the per-gametype file. The reader sees every dependency at the top of the test
without having to open `setup.psql` to learn what it pulls in.

**Don't pre-emptively create per-gametype setup files.** Wait until the
duplication is real and the helpers have stabilized — extracting too early
invites a mini-framework whose shape doesn't match what the next game actually
needs. A game with no file simply hasn't needed one yet.

## Frontend testing

Stack: [Vitest](https://vitest.dev/) + [jsdom](https://github.com/jsdom/jsdom) +
[`@testing-library/react`](https://testing-library.com/docs/react-testing-library/intro/).
Config in `vite.config.ts`.

### Canonical examples

| file | what it tests | shape |
|---|---|---|
| [`src/common/session/useSession.test.ts`](../src/common/session/useSession.test.ts) | The session hook's state transitions (loading → session → null) | Mocks `supabase.auth.onAuthStateChange`, drives it manually via `act`, asserts on the hook's returned state via `renderHook`. The canonical "test a Supabase-hook in isolation" pattern. |
| [`src/common/routing/router.test.ts`](../src/common/routing/router.test.ts) | The hand-rolled router (`navigate`, `usePath`) | Uses jsdom's `window.location` and `window.history` directly. No mocking required — just drive the History API and assert. |
| [`src/codenamesduet/lib/phase.test.ts`](../src/codenamesduet/lib/phase.test.ts) | Pure phase derivation | No DOM, no mocking, no hooks — just `expect(phase(...)).toBe(...)`. The kind of test that's free to write and free to keep. |
| [`src/codenamesduet/hooks/useBoard.test.ts`](../src/codenamesduet/hooks/useBoard.test.ts) | The board hook's data flow | Mocks the Supabase client at module level, drives the hook through fetch/realtime updates. |
| [`src/codenamesduet/components/GameEventLog.test.tsx`](../src/codenamesduet/components/GameEventLog.test.tsx) | A component rendering its props | Renders the component, asserts on text and structure. No store, no mock — just the input → output. |

The pattern is: **mock at the lowest layer that lets you write the test
simply**. For `useSession`, that's the Supabase auth API. For `useBoard`, it's
the Supabase client. For a pure function, it's nothing.

**A shared test double lives beside the module it stands in for, as
`<name>.fake.ts`** — `realtime/channel.fake.ts` (a channel you drive through
subscribe, presence and teardown), `mobile/matchMedia.fake.ts` (jsdom has no
`matchMedia`, so every test renders desktop unless it installs this),
`web-storage/storage.fake.ts`, `boot/reload.fake.ts`. Reach for the fake before
hand-rolling a mock of the same thing.

### Patterns we follow

- **Asserting on text content, not on class names.** Class names get hashed by
  CSS Modules and would change every time a stylesheet shifts.
  `expect(screen.getByText('Sudden death')).toBeInTheDocument()`, not
  `expect(...).toHaveClass(styles.suddenDeath)`.
- **`act()` around state changes from mock callbacks.** When a test fires a fake
  realtime event or auth callback, React's act wrapper makes sure the resulting
  re-render flushes before we assert.
- **No snapshot tests.** They drift and get accepted blindly.
- **`mock` calls scoped per-test, not globally.** Vitest's `vi.mock` is fine,
  but prefer `vi.spyOn` inside individual tests when possible — keeps the
  mocking footprint visible at the use site.
- **Three rules for a test that touches an action**
  ([`common/actions`](../src/common/actions/doc.md)). A surface that takes an
  action it does not bind gets
  [`boundActionFixture(id)`](../src/common/actions/boundAction.fixture.ts) — the
  registry's real fixed half with a `vi.fn()` run — so the test asserts which
  action fired without a React tree and the dispatcher. A test that fires a
  confirming action for real mounts `<ConfirmationHost />`, because the host
  lives in `App.tsx` and a question with no host is answered no. A test that
  presses a key mounts `useActionDispatcher`, because a bare render binds
  actions with nothing feeding them keys.
- **Find a command by its id, not its words**, where the words vary.
  `describe()` renames a control per game and per state, so `getByRole('button',
  { name: /reveal/i })` breaks the first time a game says it better; ask for
  `[data-action="act-reveal"]` while keeping the role (in e2e, `actionButton` /
  `actionRow` from `e2e/helpers/actions.ts`). The words are the right handle
  only where the words are the subject of the test.

### What we don't do

- No render-with-router wrappers. The app uses a hand-rolled router that's so
  simple it doesn't need a `<Router>` provider; tests that need a path just
  `window.history.replaceState` and re-render.
- No "test the suspense fallback" — Suspense in this app is a thin lazy-loading
  affordance, not a behavior. The boundary is tested implicitly by manual smoke.
- No mocking of realtime-js internals. A test that needs a realtime event drives
  `channel.fake.ts`, or a narrower double where the test needs less
  ([realtime/doc.md](../src/common/realtime/doc.md) says why there are four).

## E2E smoke tests (Playwright)

A Playwright suite (`e2e/`, `npm run test:e2e`) for the surfaces Vitest and
pgTAP structurally can't reach — anything that needs a **real browser against
the live local stack**. The original and still-core reason is **realtime
presence / pause / multi-client behavior**: the unit suites mock the Supabase
client, so the realtime layer — exactly the part that has broken — is the part
they never exercise. Over time the suite grew to cover the other browser-only
surfaces too, and that growth is deliberate, not scope creep.

**Scope boundary (intentional):** this is NOT for routine game *logic* — move
legality, RPC results, RLS, pure derivations all stay in Vitest + pgTAP. E2E
covers only what a real browser + the live stack can exercise, which today falls
in these buckets:

- **realtime / presence / auth (the core)** — member presence dots (a present
  member's dot fills, a leaving member's goes hollow); the abandoned-game heal
  (`is_current_view` cleared when the club page loads); pause-on-disconnect (one
  player disconnects, the other's game pauses); the auth gate (a stale session
  lands on LoginScreen; an unclaimed session gets the username gate with a
  working sign-out). These run two real browser contexts.
- **responsive layout** — the `*-mobile.e2e.ts` specs: at phone viewports the
  board fills, the page never scrolls, and the info sheet slides in/out. Pure
  CSS/flex geometry jsdom can't measure (see [verify-layout-headless] in memory
  / docs/mobile.md).
- **real PDF generation** — the `*-print.e2e.ts` smokes: the "Print board (PDF)"
  menu item downloads a `%PDF-` file. jsPDF's runtime is unreachable by the
  mocked component tests (the `common/pdf/` unit tests use a fake jsPDF; these
  use the real one).
- **a subscription that names the wrong table** — `events-realtime.e2e.ts`, one
  test per game: the page is opened and then a row is written from Node through
  that game's own RPC, and the log's `#N` has to appear without the page doing
  anything. What that proves is a LIVE BINDING on the named table: a `{ schema,
  table, filter }` typo makes the channel join fail, so neither the event nor
  the attach-confirmation refetch behind it ever arrives and the row never
  shows. It does not separate the two — `useRealtimeRefetch` refetches on the
  attach as well — and it doesn't need to. The typo fails silently otherwise —
  no error, just a game that stops filling — and nothing that mocks the client
  can see it.
- **the turn-history overlay** — the `*-history.e2e.ts` specs: clicking an
  event-log `#N` replays it on the board with the frame/banner, and the shared
  exit paths (key / board click / any click) work. Overlay + no-reflow
  properties jsdom can't see.
- **game-specific browser behavior** — chat unread, clue-form focus traps,
  tap-to-trace, AI opponent, the bananagrams touch block, etc.

The list is illustrative, not a contract. When you add a spec, add it for a
browser-only surface in one of these buckets — not to re-test logic Vitest/pgTAP
already own.

**A realtime-dependent spec that fails is not automatically flake.** Before
re-running and shrugging, check whether the event was *lost* rather than late —
a channel can report `SUBSCRIBED` and never deliver anything, in which case a
longer timeout only fails slower. Only a spec that needs a change made by
someone else — another player, or the server as a consequence of a move —
delivered after the page has subscribed can see a lost event; anything the
page's first load or its own RPC answer covers cannot. [common/realtime/doc.md →
A page that has stopped
updating](../src/common/realtime/doc.md#a-page-that-has-stopped-updating) is the
diagnosis.

**Never change a player's frontend-owned state by RPC while that player's page
is open.** The page writes its own copy back over yours, and the result looks
exactly like a lost realtime event.

**A spec that clicks the wrong element fails somewhere else.** A locator that
still matches after a wording change — an event-log `<td>` where the pill used
to be the only match — clicks the wrong thing, dismisses nothing, and the
failure surfaces lines later as a count. Read a red for what the locator FOUND
before re-anchoring it: `psychicnum-turn-order` matched a bare `Correct`
against the log cell and reported a wrong count two lines down.

**Reach for e2e EARLY when triaging an integration bug — not only as a
regression guard after the fix.** When a bug lives in the live-stack layer
(realtime, or the auth/session boot that depends on a real JWT in localStorage,
`onAuthStateChange` and a real `getUser()` round-trip), a throwaway e2e that
drives the *real* flow shows what's broken faster than reasoning about it or
reproducing it in Node, where you're guessing at supabase-js internals and error
shapes. The fixtures already exist, so standing one up is cheap. Mocked unit
tests are complementary — they can pin error shapes the real backend won't
produce — but a clean mock can quietly hide the messy reality.

**How it works.** No magic-link flow: `e2e/helpers/fixtures.ts` creates
confirmed users + claims usernames + builds clubs/games through the admin API
and the same RPCs the app uses, then `e2e/helpers/session.ts` seeds each user's
Supabase session into `localStorage` (key `sb-127-auth-token`, the local-URL
default) *before* the app boots, so it loads already signed in. Two
`browser.newContext()`s = two independent users in one test.
`e2e/helpers/actions.ts` locates a command by WHICH command it is:
`actionButton` / `actionRow` match `data-action="act-…"` while keeping the role,
so a spec survives a game rewording its button.

**Running it:**

```bash
npm run test:e2e       # needs the local Supabase stack running; auto-starts the Vite dev server
```

Deliberately **not** part of `npm test` — it's slower and flakier (real realtime
timing), so run it before a push/deploy, not on every save. It accumulates
suffixed test users/clubs in the local DB; `gmake db-reset ENV=local` clears
them. If the local Supabase URL ever changes, recompute the storage key via
`createClient(url, key).auth.storageKey`.

The **WebKit + Firefox engines are installed** (`npx playwright install webkit
firefox`), so cross-engine (Safari / Firefox) layout repro is available beyond
the default Chromium run.

## The screenshot gallery

`gmake gallery` puts every game into every interesting state and photographs it,
writing an HTML contact sheet (`gallery/index.html`) you scroll. It lives beside
the tests because it uses Playwright and the same fixtures — but it is **not a
test**, and keeping it out of the suites is what keeps it cheap.

**Why it exists.** Every game × coop/compete × fresh/mid/won/lost/ended ×
desktop/mobile/PDF is hundreds of states — more than anyone opens by hand, so
cross-game *drift* goes unnoticed: a heading styled differently here, a verdict
phrased another way there, a mobile layout nobody has looked at since it
shipped. The barrier was always setup: a compete game needs several real
accounts, several browser sessions, and someone to play both sides. The harness
does that.

**Why not `toHaveScreenshot`.** Baseline snapshots answer "did anything
change?", which in a UI that changes daily means constant baseline churn for
changes you meant. The question here is "do these games look like one app?", and
only a person answers that. No CI gate, no baselines, no approval workflow. The
gallery also **cannot** be diffed: two consecutive runs with zero code change
produce no byte-identical tiles, because it plays real games with random
personas and boards.

**The machine check for a theme change is `scripts/css-token-snapshot.mjs`.**
It resolves every shared token in a real browser and diffs before against
after, normalizing through a canvas — `getComputedStyle` reports an `oklch()`
operation as `oklch(…)` and a hex as `rgb(…)`, so comparing serializations says
"changed" when the pixel is identical. Verified by planting a moved hex, a
renamed token and a new one.

### Running it

```bash
gmake gallery                        # every game, every technology (minutes)
gmake gallery GAME=waffle            # waffle: desktop, mobile and PDF
gmake gallery GAME=waffle TECH=pdf   # waffle's printouts only
gmake gallery-index                  # rebuild index.html from what's on disk
gmake gallery-keep NAME=before-mobile-pass   # promote this run into gallery-keep/
```

Needs the local stack **and** `npm run dev`. It doesn't reset the database —
each run makes its own clubs, seated with the **dev personas**
(`e2e/gallery/personas.ts`), so every game it builds is one you can open in a
browser and iterate against.

**Two folders.** `gallery/` is gitignored — every run rewrites all of it, so
committing it means a 400-file diff each time you glance at anything.
`gallery-keep/<date>-<name>/` is committed, for runs promoted deliberately
(before a visual pass, after it, anything you'd want to point at later). The
target copies the **whole** folder, because `index.html` links tiles by relative
path and a hand-picked subset renders a sheet of broken images.

### How it's built

The split that matters: **getting into a state is server work; looking at it is
browser work.** Only the second needs a browser, which is what removes the
flakiness — the browser never plays, so there are no realtime waits.

- **State builders** — one per game, `e2e/gallery/games/<game>.ts`, mirroring
  the per-game seams the repo already uses (`lib/history.ts`,
  `lib/setupSummary.ts`). Each declares the cells it has and how to reach them.
  The contract lives in `e2e/gallery/types.ts`.
- **Capture** — a context per club member, everyone lands on the game, only the
  viewer's page is shot. *Every* member joins because a game whose players
  aren't all connected presence-pauses, so a single-context screenshot of a
  two-player game captures nothing but the pause.
- **The index** — `e2e/gallery/index.ts`. A game per section, its five phases
  across, so cross-game comparison is vertical scrolling rather than a
  horizontal drag past sixteen tiles.

**Builders drive the game's own RPCs, never row inserts.** A gallery whose job
is "does this look right?" must never show a state the game can't produce — it
would send you chasing a layout bug in a screen no player can reach. Row inserts
also duplicate rules that live in plpgsql, and they're no faster: neither path
involves a browser. Direct SQL stays available as an escape hatch (reading a
hidden target, a private rack) but each use is commented with *why*, because
each one is a small lie.

**Terminal states come from setup where they can.** letterboxed with
`extra_words: 0` is two words from a full chain; the `create<Game>Game` fixtures
already take these parameters.

### Conventions

**One `lost` per mode, and prefer the game's OWN losing condition** — out of
guesses, out of time, stack not cleared. A concede or a manual stop is *shell*
behavior that renders near-identically in every game, so spending the slot on it
shows you the shared chrome over and over and the game's real defeat screen
never. Fall back to concede only where a game has no natural loss, and note it
on the cell so the sheet says why.

**Every state gets printed** — one PDF per game × mode × phase, on the desktop
pass (a PDF is the same document whatever the window size). The question is not
*"would a player print this?"* but *"is this a code path whose layout could
break?"* — and the empty and mid-game printouts are where the bugs are. PDFs are
kept as PDFs and linked, not rasterised and not embedded: a page render at
legible DPI is 3–6× the size of its source and softer, and an `<embed>` wraps
every tile in the browser's PDF viewer.

**A missing tile is informative** — it says nobody has looked at that state — so
the sheet draws the hole rather than closing the gap, and the runner lists
undeclared cells after every run. That stays a *note* rather than an assertion,
because the script can't tell "unreachable" from "not written yet".

### The one thing it does assert

A cell claiming `won` / `lost` / `ended` must leave `common.games.is_terminal`
true (`assertPhaseReached` in `run.ts`). This is the exception to "asserts
nothing", and it earns the exception: a screenshot renders a wrong state as
happily as a right one, so a builder that stops short publishes a plausible lie
instead of a hole.

The bug it catches most, and will keep catching: **in a compete game, one player
finishing is not the game finishing.** Compete gives each player their own
budget and the winner is decided when *everyone* is done, so a builder that
plays only the viewer leaves the rival racing and photographs a half-played
board under a heading saying someone won.

### Two harness gotchas

- **Invitation toasts.** Every context is a fresh browser profile, so the
  `puzpuzpuz:game-invites:seen` set in localStorage starts empty and every game
  the run has made stacks up as "X added you to a new Y game" over the info
  column. The runner seeds that set from the DB, scoped to the **member** — each
  game gets its own club, but the invite query asks "what games am I a player
  in?" and doesn't care about clubs.
- **Photographing the right chair.** A compete terminal hands out both verdicts
  at once; `won` and `lost` are the same game from two seats.
  `seatWithVerdict()` reads `common.game_players.result` rather than assuming
  the first member won — scrabble's end-of-game rack penalty can hand the win to
  whoever scored less on the board.

### Coverage

**Everything reachable is photographed.** The holes on the sheet are cells that
cannot exist: a mode the game doesn't have (bananagrams has no coop,
codenamesduet no compete), or a state its mode can't reach (a coop game with no
win, a compete game with no neutral end).

Two ways a hole can lie:

- **An undeclared mode is invisible.** The gap report can't tell a mode the
  builder never declared from one the game doesn't have, so the check is manual
  and belongs in review: **a game's declared cells must cover every mode its
  manifest registers.**
- **A declared cell can fail silently** if its ✗ line scrolls past. The runner
  prints a ⚠ list of declared cells with no file on disk after every run; read
  it rather than trusting the sheet.

## Repo-wide invariant guards

Most tests here sit beside their subject — `waffle/lib/colors.test.ts` next to
`colors.ts`. A guard has no such subject: it sweeps the whole repository, so
there is nothing to co-locate with. **Those live in `src/guards/`**, and
[its README](../src/guards/README.md) is how to write a new one.

A guard reads the repo off disk (`process.cwd()`-relative, so the CWD is the
repo root, not the test's folder) and/or imports the game registry, so a new
game is covered automatically — or forces a one-line update — instead of each
game needing its own copy.

**A guard sees what git tracks.** The sweeps walk `git ls-files`, so a NEW
file is invisible to them until it is `git add`ed: a British spelling sat in
an untracked `doc.md` through a green spelling run and failed the moment the
file was staged, and the stamp guard has the same blind spot. Stage a new file
before trusting a green run. The full set:

| guard | what it sweeps |
|---|---|
| `cssTokens` | every stylesheet + `.tsx` in `src/` — token defined ⇄ token read |
| `noRawServerMessage` | every call site in `src/` — no server `error.message` into a UI sink |
| `logos` | every `src/<game>/logo.svg` parses as standalone XML |
| `setupRows` | every game's `lib/setupSummary.ts` (via `import.meta.glob`) |
| `gameStatusLabels` | every manifest's `labelFor` over its reachable states: an unknown state never reads as live, no reason doubles as a play state; `npm run report:labels` prints every line ([game-status-labels.md](game-status-labels.md)) |
| `deployLists` | `supabase/config.toml`, `supabase/deploy/env.sh`, `Makefile` vs the registry |
| `edgeFnErrorKeys` | every `json({ error: … })` in `supabase/functions/` carries an error key (none remain: functions answer envelopes) |
| `edgeFunctionImports` | every module an edge function reaches resolves under Deno — no `@/` alias, no extensionless import |
| `raiseCodes` | every `PN`/`PA` raise in `supabase/sql/` — unique, hinted, outcome read back |
| `dbCallShape` | `runRpc` takes an RPC, `readRows` takes a query — never crossed |
| `dbCallWrapped` | every `.rpc(` / `.from(` in `src/` reaches a wrapper at all |
| `callSiteShape` | every call site asks `=== 'not-ok'`, never the negated form |
| `gameDeletedFirst` | a deleted game is checked BEFORE membership, at every player-callable site |
| `concedeLock` | each elimination game locks its own row before `_set_conceded` |
| `schemaExposure.e2e` | the running PostgREST stack, per registered schema |
| `docLinks` | link targets in `docs/`, `plans/`, every folder's `doc.md` / `todo.md`, `CLAUDE.md`, `README.md` |
| `prosePointers` | every file — a prose pointer to a doc's section names a heading or bold phrase that exists |
| `prosePaths` | every file — a repo path named in prose (`src/…`, `` `lib/answer.ts` ``) exists |
| `americanSpelling` | the whole repo — no British form of any word on its list |
| `cssClasses` | every class name — defined ⇄ used, in both directions |
| `vocabularies` | a converted surface writes vocabulary values, not literals |
| `orphanedDocstrings` | `src/`, `supabase/functions/`, `e2e/`, `scripts/` — no docstring stranded above another |
| `fieldTests` | every field component has its own test file |
| `pgtapIncludes` | every pgTAP file `\ir`s the file defining each helper it uses |
| `rawStorage` | every `localStorage` / `sessionStorage` touch in `src/` goes through `common/web-storage/storage.ts` |
| `csStamps` | every file in the sprint's scope carries a valid `cs-` stamp |
| `folderDocs` | every feature folder's `doc.md` + `todo.md` are in shape |
| `actionIds` | an action's two spellings agree — `act-new-game` ⇄ `actNewGame` |
| `registeredChords` | nothing outside `common/actions/` matches a registered chord by hand |
| `componentKeys` | every hand-written key handler in `src/` matches through a row — an action's or `common/keyboard/componentKeys.ts`'s — so Help and `gmake dev-keys` can list it |
| `commonNeverImportsShared` | `src/common/` never imports `src/shared/` — the one-way rule ([common-folders.md](common-folders.md)) |
| `escapeListeners` | only the two sanctioned places listen for Escape globally |
| `memberPalette` | the member color names agree between `MEMBER_COLORS` and the SQL that spells them |

A few in more detail:

- **`src/guards/schemaExposure.e2e.test.ts`** (Vitest) — every registered game
  schema is reachable through PostgREST (the `[api] schemas` exposure that a `db
  reset` doesn't re-read). Derived from the game registry, so a new game is
  covered for free.
- **`supabase/tests/common/realtime_publication_test.sql`** (pgTAP) — the single
  source of truth for the [publication
  invariant](supabase.md#the-publication-invariant-load-bearing) (every table a
  channel subscribes to via `postgres_changes` must be in `supabase_realtime`,
  or the whole subscription silently dies). One `set_eq` compares the
  publication against a registry of every FE subscription — catching both a
  missing table (live updates die) and an extra one (replication overhead).
  **Update its `expected` list when a hook adds or drops a `postgres_changes`
  subscription** (re-derive with `grep -rn "table:" src`).
- **`supabase/tests/common/events_skeleton_test.sql`** (pgTAP) — the shape every
  game's log table shares: named `events`, keyed by a `bigint identity`, with
  `game_id`, `user_id`, `kind`, `took_turn` and `created_at`, a `(game_id, id)`
  read index, and a check-constrained, defaultless `kind`. Its roster names each
  game's log table and whether that table has been brought to the skeleton; the
  assertions apply to the converted ones, and are bidirectional, so a table
  reshaped without flipping its roster row fails as loudly as the reverse. It
  pairs with the publication test above: between them a log table cannot be
  renamed without both files agreeing on what it is now called.

- **`src/guards/docLinks.test.ts`** (Vitest) — every relative markdown link in
  the markdown we own resolves: the file exists and a `#fragment` matches a real
  heading. A renamed heading breaks a link that still *looks* right in the
  source. Note the anchor rule it encodes: GitHub **deletes** heading
  punctuation but keeps the spaces around it, so `## Terminal results — the
  moment vs the record` is `#terminal-results--the-moment-vs-the-record` with
  **two** hyphens. Writing one (or keeping the literal `—`) dangles silently.
- **`src/guards/prosePointers.test.ts`** and **`prosePaths.test.ts`** (Vitest)
  — the same promise for the cross-references that aren't links. A comment's
  "see docs/mobile.md → The info-sheet recipe" must name a heading or a
  **bold** phrase of that file (a quoted phrase or a finding id must appear in
  it), and a path named in prose must exist. A doc rewrite renames headings
  and a refactor moves files, and without these both leave comments pointing
  at nothing. Each guard's docstring says what it counts as a match and what it
  skips.

## Running the suites

```bash
npm test               # FE first, then DB; the canonical "is everything green" (NOT e2e)
npm run test:fe        # Vitest only (add `-- --watch` for the dev loop)
npm run test:db        # pgTAP only — needs the local Supabase stack running
npm run test:edge      # Deno tests for the edge-function pure logic (deno test)
npm run test:e2e       # Playwright realtime smoke tests — see above
```

**CI.** `.github/workflows/ci.yml` runs the stack-free gates — `tsc -b`,
`eslint`, and `test:fe` — on every push + pull request. `test:db` / `test:e2e`
need a live stack (a Supabase service container / browsers), and `test:edge`
needs Deno set up, so those stay local for now.

**Vitest is stack-free, and `src/test-setup.ts` holds it to that.** The global
`fetch` is replaced by one that records the request and throws, and an
`afterEach` fails the test that made it. It records as well as throwing because
throwing alone proves nothing: app code catches its own transport failures by
design, so a leaked lookup renders its error state and the test passes — which
is how two of them sat there reaching the local stack on every run. A test that
MEANS to reach the stack imports `fetchTheRealStack` from the same file, as
`schemaExposure.e2e` does. The same file stubs the stale-build probe
(`common/boot/reloadOnStaleBuild`) as "current" for every test, since a game
page mount and every RPC fall-through would otherwise make that fetch; the
module's own test unmocks it.

Single-file pgTAP run, for tightening one test:

```bash
supabase test db --local supabase/tests/codenamesduet/create_game_test.sql
```

`supabase test db` does its own `create extension if not exists pgtap` against
the local DB before invoking pg_prove, so individual test files don't need to
install the extension themselves.

After a migration change, `gmake db-reset ENV=local` replays every migration
against a fresh local database (it wipes the local data, and reseeds the dev
personas). **A change confined to `supabase/sql/` needs only `gmake db-sql
ENV=local`** — functions, views, policies and grants are re-applied in place, no
reset and no data loss ([supabase.md → Schema vs
code](supabase.md#schema-vs-code)). `npm run test:db` never re-applies either,
so run one of them first.

## Test failure debugging

pgTAP output looks like:

```
# Failed test 12: "submit_guess: wrong guess returns 'wrong'"
#         have: lost
#         want: wrong
```

The `have` / `want` lines and the test name are usually enough to find the
assertion. If the failure is upstream — an error before `plan(N)` was satisfied
— pgTAP shows:

```
# Looks like you planned 17 tests but ran 14
```

That means an unhandled exception aborted the test mid-run. Look at the psql
output preceding the TAP report for the actual error.

Vitest output is conventional Jest-style: test name, failed expectation, line
number. The most common gotcha is forgetting `await` on something async, which
manifests as "expected X to be defined" — the assertion runs before the promise
settles.

## Maintaining the persona convention

If you add a sixth persona, document it in
[`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql)
alongside the existing five, and update the table above. If you rename one, do
it consistently across every test in a single commit — the personas are
convention-as-API; partial renames hurt readability more than they help.

If a specific test needs a persona who *isn't* in the standard set (e.g., "the
user whose username is exactly 40 characters"), it's fine to insert that user
inline within the test rather than promoting them to the shared setup. Promote
only when the same user shows up in three or more tests.
