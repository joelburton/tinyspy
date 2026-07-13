# Test-coverage audit

An audit of what the three test layers (Vitest, pgTAP, Playwright e2e) cover today
and where the gaps are, weighed against the priors in [testing.md](testing.md) and
[CLAUDE.md](../CLAUDE.md) (alpha software; tests exist to catch real regressions,
not to hit a coverage number). Run 2026-07-12 against `main` @ `9fa4c53`.

How to read this: each section maps one layer's actual coverage, then the gaps are
ranked at the end. "Undertested" here means *a regression there would ship silently*,
not "a file lacks a test." Plenty of untested files are fine — thin wiring,
presentational components, one-liner buttons — and this audit says so.

## Snapshot

| layer | count | runs via | in `npm test`? |
|---|---|---|---|
| Vitest (`src/**/*.test.ts(x)`) | 128 files | `npm run test:fe` | yes |
| pgTAP (`supabase/tests/<schema>/*_test.sql`) | 116 files | `npm run test:db` | yes |
| Playwright (`e2e/*.e2e.ts`) | 46 specs | `npm run test:e2e` | no (deliberate) |
| Deno edge-fn tests | **1 file** (`waffle-build-board/gen_test.ts`) | `deno test` by hand | **no — wired into nothing** |
| Repo-wide invariant tests | 3 (`src/cssTokens.test.ts`, `src/logos.test.ts`, `src/schemaExposure.e2e.test.ts`) | Vitest | yes |
| CLI script tests | 3 (`supabase/scripts/crosswords/{puz,ipuz,contentHash}.test.ts`) | Vitest | yes |
| CI | none for tests (`.github/workflows/` has only the daily connections-import cron) | — | — |
| Coverage tooling | none configured | — | — |

Source surface for scale: ~409 non-test `.ts(x)` files under `src/`, 14 schemas'
worth of migrations, 13 edge functions.

## What's genuinely well covered

Credit where due, so the gaps below read in proportion:

- **Public RPC surface.** Every game's `create_game` / submit / concede / end flows
  have pgTAP tests; the newer games (waffle 11 files, wordwheel 11, wordle 10,
  spellingbee 10, codenamesduet 10) are thorough, including compete-mode branching,
  replay, and reveal-at-terminal partitions.
- **Hidden-solution shielding.** waffle (`solution_hide_test.sql`), wordle
  (`reveal_test.sql`), spellingbee/wordwheel (`reveal_partition_test.sql`),
  stackdown (`reveal_test.sql`) all pin the column-grant / terminal-gate behavior.
- **Pure game logic in the FE.** Nearly every game's `lib/` is tested (solvers,
  scoring, colors, history snapshots, cursors). The boggle TS solver even has a C
  parity oracle (`boggle-c-solver/`).
- **Crosswords lib + PDF.** 9 lib tests plus the only fully-tested PDF pipeline
  (`src/crosswords/pdf/{clues,layout,solution,generator}.test.ts`), and the CLI
  converters (`supabase/scripts/crosswords/`) are tested too.
- **Repo-wide invariants as tests.** `schemaExposure.e2e.test.ts` probes PostgREST
  for every registered schema (registry-driven — a new game is covered for free).
  This registry-driven pattern is the model several gaps below should copy.
- **Cross-cutting e2e.** auth boot, presence/pause, chat, scratchpad, suspend
  dialog, board geometry, page-no-scroll, info-sheet behavior — all covered with
  real multi-client browser contexts.

## Gap 1 — realtime publication guards exist for only 5 of 14 schemas

> **Update — addressed.** Recommendation #1 is implemented:
> [`supabase/tests/common/realtime_publication_test.sql`](../supabase/tests/common/realtime_publication_test.sql)
> is now the single registry-driven guard. One `set_eq` compares the
> `supabase_realtime` membership of all 14 schemas against a hand-maintained
> registry of every FE `postgres_changes` subscription — catching both a
> *missing* table (live updates silently die) and an *extra* one (replication
> overhead). The five older per-schema guards it subsumed were consolidated into
> it: `common/publication_test.sql` and `crosswords/publication_test.sql` were
> deleted, and the publication blocks inside spellingbee/wordwheel/wordiply
> `schema_test.sql` were trimmed (each now points at the central guard). The
> Gap 3 table's "publication guard" column is superseded by this. The rest of
> this section is the pre-implementation snapshot.

**The highest-value gap in the repo.** The publication invariant (every table a
channel subscribes to via `postgres_changes` must be in `supabase_realtime`, or the
Realtime server silently drops the *entire* subscription — [supabase.md](supabase.md))
has already bitten twice (spellingbee, wordwheel). The failure mode is invisible:
no error, live updates just stop.

Guard tests exist for: `common/publication_test.sql`, `crosswords/publication_test.sql`,
`spellingbee/schema_test.sql`, `wordwheel/schema_test.sql`, `wordiply/schema_test.sql`.

**No guard exists for the other 9 schemas**: codenamesduet, psychicnum, connections,
bananagrams, waffle, wordle, stackdown, scrabble, boggle — all of which subscribe to
their own `games` plus per-game tables (`found_words`, `guesses`, `progress`,
`player_boards`, `plays`, …).

Cheapest fix: one registry-driven pgTAP file (like `schemaExposure.e2e.test.ts` but
for `pg_publication_tables`) that enumerates every subscribed table across all
schemas, instead of nine copies of the per-game pattern. The subscribed-table list
would need to be maintained by hand (the channel registry lives in TS), but one file
beats nine.

## Gap 2 — edge functions are the least-tested layer

Verification today is `deno check` (types) plus whatever the e2e suite happens to
exercise live. The board builders matter most: they gate game creation, and four of
them contain substantial pure logic that lives **only** in the edge function (not in
a tested `src/` module):

| function | LOC | local untested logic | exercised live by e2e? |
|---|---|---|---|
| `wordwheel-build-board` | ~620 | multiset tile fitting, overlap cap, difficulty filtering | yes (`wordwheel.e2e.ts`) |
| `spellingbee-build-board` | ~570 | overlap cap, ING dampening, weighted sampling, custom-letter validation | yes (custom-letters flow) |
| `wordiply-build-board` | ~230 | base sampling, `try_base` loop, max-children gate | yes (`wordiply.e2e.ts`) |
| `waffle-build-board` | ~155 + `gen.ts` | orchestration (gen.ts itself IS tested — see below) | **no — e2e fixture hardcodes the board**, only the "New game" smoke hits it |

The rest reuse tested `src/` logic (boggle → `src/boggle/lib/generate.ts`,
scrabble-ai/suggest → `src/scrabble/lib/{policy,suggest,rank}.ts`, crosswords
importers → `src/crosswords/lib/{guardian,nyt,nytOverlay}.ts`), so only their
orchestration (request parsing, RPC handoff, error paths) is dark — a much smaller
exposure. The AI functions (`codenamesduet-suggest-clue`, `crosswords-explain-clue`,
`common-define`) are untested but low-value to test: prompt churn is high and the
output is judged by humans.

**A test exists but nothing runs it**: `supabase/functions/waffle-build-board/gen_test.ts`
(the minSwaps/scramble logic) runs only if someone remembers
`deno test supabase/functions/waffle-build-board/gen_test.ts` (it's in the
cheatsheet, and nowhere else). Any future edge-fn test will hit the same hole.
Worth a `test:edge` npm script, even if it stays out of `npm test`.

## Gap 3 — pgTAP asymmetries between sibling games

The per-schema matrix (dedicated files; ✓* = covered inline in another file):

| schema | files | RLS test | publication guard | timeout test | notable holes |
|---|---|---|---|---|---|
| common | 12 | ✓* (dee assertions in 7 files) | ✓ | ✓ | `require_player_count_max`, `reset_game` never tested at the common layer (only via game wrappers) |
| codenamesduet | 10 | ✓ | — | ✓ | — |
| psychicnum | 5 | ✓ | — | ✓ | — |
| connections | 7 | ✓ | — | ✓ | — |
| spellingbee | 10 | ✓ | ✓ | ✓ | `candidate_words` helper untested (wordwheel tests its fork) |
| bananagrams | 8 | ✓ | — | ✓ | — |
| waffle | 11 | ✓* (`solution_hide_test`) | — | ✓ | `compute_colors` never cross-checked against `common.wordle_colors` |
| wordle | 10 | ✓* (`reveal_test`) | — | ✓ | — |
| stackdown | 6 | **none** (3 policies, no outsider persona in any test) | — | ✓ | — |
| scrabble | 9 | ✓ | — | ✓ | `_new_bag` distribution / `_tile_value` table assumed correct |
| boggle | 6 | ✓ | — | ✓ | — |
| crosswords | 6 | ✓ | ✓ | **none** — `submit_timeout` is called by zero test files (the only schema where this is true) | given-cell immutability only implicit |
| wordwheel | 11 | ✓ | ✓ | ✓ | — |
| wordiply | 5 | **none** — `games_select` + `guesses_select` (the mode-aware guess-visibility policy behind "length-only during play") have no test | ✓ | ✓ | concede covered only inline in `gameplay_test.sql` |

The three that matter:

1. **crosswords `submit_timeout`** — a live RPC (timed games exist) with zero
   coverage, in a game whose terminal logic (`_maybe_finish`, coop/compete win
   helpers) is its most intricate part. Every sibling tests this. *(Now covered
   — `crosswords/timeout_test.sql`; see recommendation #2.)*
2. **wordiply RLS** — the newest game shipped without an `rls_test.sql`. Its
   `guesses_select` policy implements a real game rule (opponents' guess words
   hidden mid-game, lengths only), so a policy regression is a *gameplay* bug,
   not just a privacy one. *(Now covered — `wordiply/rls_test.sql`; see rec #3.)*
3. **stackdown RLS** — 3 policies, none exercised. Same reasoning at lower stakes
   (its hidden-solution reveal *is* tested). *(Now covered —
   `stackdown/rls_test.sql`.)*

Not worth chasing (deliberately): isolated tests for internal `_helpers` that are
fully exercised through their public RPCs (`_end_turn`, `_finish`, `_rank_idx`,
`_word`, …). testing.md's theory is to test the RPC surface; the internals are
covered transitively and isolating them would pin implementation detail.

## Gap 4 — FE: the shared layer is thinner than the per-game layer

Per-game `lib/` is well tested; the gaps cluster in `src/common/` modules that
**every game flows through** (widest blast radius, zero tests):

| module | LOC | why it matters |
|---|---|---|
| `src/common/hooks/game/makeFoundWordsGame.ts` | ~129 | the useGame factory behind spellingbee + wordwheel |
| `src/common/hooks/game/useStandardGameActions.ts` | ~114 | end/concede/replay wiring for every game |
| `src/common/hooks/game/useHistoryViewer.ts` | ~101 | the shared turn-history viewer state machine (7 games) |
| `src/common/lib/game/difficulty.ts` | ~94 | difficulty banding used by several setups |
| `src/common/lib/game/manifestRpcs.ts` | ~87 | RPC-name plumbing per manifest — a typo here is a runtime server error |
| `src/common/pdf/{frame,turnLog,wordColumns,wordListBody}.ts` | ~354 total | shared by every game's printer; only crosswords' (whole-cloth ported) pipeline has tests |

Per-game patterns:

- **`hooks/useGame.ts` is tested in 1 of 13 games** (connections; crosswords tests
  `useCells`, codenamesduet tests `useBoard`). The others rely on
  `PlayArea.test.tsx` component tests exercising the hook indirectly. That's a
  defensible pattern — but the three biggest/trickiest untested hooks are where it
  strains: `bananagrams/hooks/usePlayerBoard.ts` (~569 LOC — arena placement, hand
  derivation, snapshot-on-unmount), `stackdown/hooks/useGame.ts` (~283 LOC),
  `crosswords/hooks/{useGridKeyboard,usePeerCursors}.ts` (~257 + ~223 LOC —
  keyboard state machine, peer cursor sync).
- **PDF bodies**: `printXxxPdf.ts` untested for all 6 non-crosswords print games.
  Mitigated by the 4 `*-print.e2e.ts` smoke specs (download succeeds, non-empty),
  which is arguably the right level for visual output — but boggle + wordwheel
  print with *neither* a unit test *nor* a print smoke.
- **`lib/history.ts`**: tested in 6 of the 7 turn-log games; scrabble's equivalent
  (`boardUpToSeq` in `lib/board.ts`) is covered by `board.test.ts`, so this is
  actually complete — noted so nobody "fixes" it.

Low-value untested files (fine as-is): ~28 one-liner button wrappers, chat/club
presentational components, `Help.tsx` files, manifest metadata.

## Gap 5 — e2e: drifted scope, and holes inside its own scope

[testing.md](testing.md) declares e2e "deliberately narrow — realtime/presence/auth
only," but the suite is now 46 specs covering mobile layout, print smokes, history
viewers, AI opponents, and full gameplay loops. The practice is better than the doc
— **update testing.md's scope statement** rather than shrinking the suite.

Holes measured against what the suite *actually* tries to be:

| dimension | covered | missing |
|---|---|---|
| mobile layout (`*-mobile.e2e.ts`) | 10 games | **boggle, wordwheel, wordiply** (bananagrams exempt — touch-blocked) |
| history viewer e2e | codenamesduet, connections, psychicnum, wordle | **waffle, stackdown, scrabble** (feature exists in all three; scrabble's snapshot math is at least unit-tested) |
| print smoke | bananagrams, psychicnum, scrabble, spellingbee | **boggle, wordwheel** (crosswords' pipeline is unit-tested instead — acceptable) |
| gameplay smoke | most games | connections, psychicnum, wordle, stackdown have only feature-specific specs — fine per testing.md (game logic belongs to Vitest+pgTAP), listed for completeness, not as a to-do |
| concede flow | — | no e2e anywhere (pgTAP covers the server side thoroughly; the FE button → confirm → terminal flow is untested end-to-end) |

## Gap 6 — meta

- **Nothing runs the suites automatically.** No CI. `npm test` is a local habit;
  a forgotten run before deploy ships silently. A minimal GitHub Action running
  `test:fe` + `tsc -b` + `eslint` (the pieces that don't need a Supabase stack)
  would catch the cheap majority. pgTAP/e2e in CI would need a `supabase start`
  service container — heavier, optional.
- **The stackdown board generator** (`supabase/scripts/generate-stackdown-boards.ts`)
  enforces the strict no-trap invariant with zero tests. Mitigated by being
  generate-then-import (bad boards would be caught at generation time, and the
  shipped library is static) — worth a test only if the generator is touched again.
- **No coverage tooling.** Deliberately not recommended: the priors here optimize
  for regression value, not percentages, and a coverage gate would push toward
  testing the 28 button wrappers.

## Ranked recommendations

Ordered by (chance of silent breakage) × (blast radius) ÷ (cost to write):

1. ~~**Registry-driven publication guard for all 14 schemas** (one pgTAP file, or 9
   small per-schema ones). Guards the invariant that has already caused two
   incidents whose failure mode is silent. ~an hour.~~ **DONE** —
   `supabase/tests/common/realtime_publication_test.sql` (one `set_eq` over the
   full subscription registry; catches missing *and* extra tables). The five
   older per-schema guards it subsumed were consolidated into it (two deleted,
   three trimmed).
2. ~~**`crosswords/timeout_test.sql`** — the only schema with an untested
   `submit_timeout`, sitting on the most intricate terminal logic. Small file,
   pattern exists in 12 siblings.~~ **DONE** — 19 assertions covering the coop
   and compete timeout paths, the require_game_player gate, the crosswords-only
   no-op idempotency (siblings throw; it returns silently), and the guard that a
   racing timeout cannot clobber an already-recorded win.
3. ~~**`wordiply/rls_test.sql`** (and a smaller `stackdown/rls_test.sql`) — the
   mode-aware guess-visibility policy is a game rule with no test. Copy the
   wordwheel/spellingbee shape.~~ **DONE** — `wordiply/rls_test.sql` (11
   assertions) and `stackdown/rls_test.sql` (10), both exercising the
   club-membership gate plus every branch of the mode-aware policy
   (coop-sees-all / compete-sees-own / terminal-reveal), copied from the
   wordwheel shape. Verified with a mutation check: a broken-open compete
   policy fails the branch-(b) assertion.
4. **Unit tests for the three all-local board builders** (spellingbee, wordwheel,
   wordiply build-board logic — extract the pure parts into testable modules or
   test them via `deno test`), plus a **`test:edge` npm script** so the existing
   waffle `gen_test.ts` (and any future edge tests) actually run.
5. **Tests for the shared FE spine**: `makeFoundWordsGame`, `useStandardGameActions`,
   `useHistoryViewer`, `manifestRpcs` — four modules, every game's blast radius,
   all mockable with existing patterns from `useCommonGame.test.ts`.
6. **`common/pdf/` helper tests** (pure jsPDF-call assembly, testable like
   crosswords' `layout.test.ts`) — cheaper and higher-leverage than testing six
   per-game print bodies.
7. **Round out e2e to its de-facto scope**: mobile specs for boggle/wordwheel/wordiply,
   history-viewer specs for waffle/stackdown, print smokes for boggle/wordwheel,
   one concede-flow spec. Also fix testing.md's stale "deliberately narrow" scope
   paragraph.
8. **A hook test for the two hardest untested hooks** — `usePlayerBoard`
   (bananagrams) and `useGridKeyboard` (crosswords). Only these two; the
   PlayArea-component-test pattern is adequate for the rest.
9. *(Optional)* **Minimal CI** for the stack-free gates (`tsc -b`, eslint,
   `test:fe`).

Explicitly *not* recommended: isolated tests for transitively-covered SQL
`_helpers`; coverage percentage tooling; tests for AI/prompt edge functions;
tests for one-liner components; gameplay e2e for games whose logic is already
pgTAP+Vitest covered.
