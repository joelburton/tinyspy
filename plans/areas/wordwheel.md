# Area: wordwheel

**Brand: MooseWheel.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordwheel/todo.md`, not here.

**Status: OPEN 2026-09-23.**

**Three passes back to back**, the earlier games' shape: the restructure
([playarea-readability.md](../playarea-readability.md) step by step, with the
stylesheet split), then the audit — React, SQL and CSS together, the
`AnswerMessage` conversion in it — then the tile-feedback pass against
[tile-feedback.md](../tile-feedback.md). The first read is
`src/wordwheel/todo.md`, then the shell commits since the game's own last
commit (app-audit.md §4).

## The roster

Agreed with Joel 2026-09-23 (*"i do; stamp the files"*), `cs-met-wordwheel` —
**46 stamped files** at the opening:

| where | how many | note |
|---|---|---|
| `src/wordwheel/` | 28 | `components/PlayArea.tsx`, `lib/answer.ts` + `.test.ts` arrived `cs-fixed-outcome-fix`; that area ruled its files belong to their own game's area, which is this one |
| `supabase/migrations/20260712000000_wordwheel.sql` | 1 | |
| `supabase/sql/wordwheel.sql` | 1 | |
| `supabase/tests/wordwheel/` | 13 | every pgTAP file but one, and `setup.psql` |
| `supabase/functions/wordwheel-build-board/` | 3 | `index.ts`, `board.ts`, `board_test.ts` |

`src/wordwheel/logo.svg` has nowhere to put a stamp, and `todo.md` is markdown
and carries none; both are on the roster all the same, as is
`docs/games/wordwheel.md`, deleted into `src/wordwheel/doc.md` in pass 2.

### What is NOT on it

- **`supabase/tests/wordwheel/rank_idx_test.sql`** — `cs-blessed-rank-ladder`.
  It pins `common._rank_idx`, the shared function. Read here as evidence.
- **The shared folders it imports** — `shared/bee-games`, `shared/found-words`,
  `shared/rank-ladder` — all closed and blessed. Their contracts are read
  against this game, not re-audited.
- **The e2e specs** (`wordwheel`, `wordwheel-coop-win`, `wordwheel-mobile`,
  `wordwheel-print`) and `e2e/gallery/games/wordwheel.ts` — `cs-unmet`, off
  the roster as every game's have been.
- **`supabase/scripts/import-wordwheel-pangrams.ts`** — `cs-unmet`, off by
  Joel's ruling at the opening (*"no"*), as spellingbee's import script was.

## The reading

### The two standing registers, reconciled — 2026-09-23

Joel: *"start the opening reads"*. `docs/games/wordwheel.md` → Deferred held
three entries, and `docs/deferred.md` held only the row pointing at it. Each
entry was checked against the code before it moved:

| entry | verdict |
|---|---|
| spellingbee's `Letters.module.css` + `Letter.module.css` / `Wheel.module.css` not folded | **still true, moved to `todo.md` → Won't do**, this copy still the governing one. The skeleton classes (`.board`, `.floatAnchor`, `.grid`) still rhyme; the hive's depth is still `filter`, the wheel's still `box-shadow`. The "(the CSS audit's §2.1)" cite came off — a durable file cites no plan. spellingbee's `todo.md` pointer and the doc's own Frontend-section link to `#deferred` were repointed at `src/wordwheel/todo.md#wont-do` |
| `s`-heavy seeds | **still true, moved to `todo.md` → Maybe.** It waits on how play feels, not on anything owed. The edge function, `board.ts` and the import script all still allow `s`, with no seed filter |
| the custom-letters helper text is `.muted`, for parity with spellingbee | **stale, deleted.** No `.muted` is left in either game's `SetupForm` or in `common/fields`; the typed field is the shared `ManualBoardField` now, the same change that made spellingbee's matching entry stale |

The Deferred section is gone from `docs/games/wordwheel.md`, the row from
`docs/deferred.md`, and `REGISTERS_LEFT` in `folderDocs.test.ts` went 7 → 6.
Guards green (34 files, 293 tests).

### The folder's `todo.md` — read 2026-09-23

**One Bug:** `act-new-game` answers `active` before the game row has loaded.
**Six Soon items:** the compete leaderboard query written out four times; the
per-player results carrying keys nothing reads; two SQL comments saying
`common.end_game` replaces the status; the info-column action row's branches;
the two hand-written Fisher–Yates shuffles; compete's missing end-for-all. The
first three are copies of spellingbee fixes (its F-11, F-16 + R-1, F-14). One
Maybe and one Won't do, both from the drain above. Someday is empty.

References checked and still true: `shuffled` is at `components/BoardCol.tsx`
and at `wordwheel-build-board/index.ts`, and `common/utils/shuffle.ts` exists;
`InfoCol.tsx` already imports `shared` from `common/info-sheet/infoCol.module.css`,
where `.actionsDivider` lives. Nothing is a finding yet; that is Step 1.

### What moved under the area — read 2026-09-23

The anchor is **`45f618f1` (2026-09-23, "wordwheel: the center tile is a
dusty purple, not red")**, the game's own last commit, and the one before it
(`1bfeb02a`, the refused word's tiles shake) is the same day. Both came out of
spellingbee's tile-feedback pass, so the game's code is very recent. The
window over `src/common/game-page/` holds six commits:

| commit | what it changed in `game-page` | what it makes untrue here |
|---|---|---|
| `c79abd5d` turn bell | `GamePage` rings `useTurnBell` when the common turn pointer makes it your turn | **nothing.** wordwheel never moves the turn pointer (`wordwheel.sql` has none), so the bell never rings, and no roster file claims a sound |
| `ed04fc24`, `7ac721e8`, `3f2b422d`, `58c52ce8`, `5dee94fa` | comment pointers only, repointed after `docs/ui.md`, `docs/mobile.md`, `docs/common.md` and `docs/deferred.md` were split or retired | **one pointer on the roster.** `theme.css` says *"Two-vocabularies rule (see docs/ui.md)"*; the rule lives in `docs/tokens.md` now (`5dee94fa`). The roster's other doc pointers were checked and still name a live heading: `docs/mobile.md → The info-sheet recipe`, `docs/ui.md → Terminal results` and `→ Layout stability`, `docs/common.md#the-sibling-manifest-pattern` |

The roster's many `docs/games/wordwheel.md` pointers (the manifest, the edge
function, both SQL files, `PlayArea.tsx`) are all live today and all go stale
at pass 2, when that doc moves into `src/wordwheel/doc.md`.

## The restructure

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is behavior-preserving
unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-23

Run on the untouched tree at `ed8f81c4`, the roster stamped
`cs-met-wordwheel` (Joel: *"commit then continue"*, then *"both"* to the e2e
question):

- `tsc -b` clean; lint clean over `src/wordwheel/` and
  `supabase/functions/wordwheel-build-board/`.
- The game's unit tests and the guards: 41 files, 377 tests (1 skipped), green.
- The edge function under `deno test --allow-all
  supabase/functions/wordwheel-build-board/`: 15 tests, green.
- pgTAP, the whole suite: `gmake db-sql ENV=local` then `npm run test:db` —
  182 files, 2656 tests, PASS. `rank_idx_test.sql` is `rank-ladder`'s and ran
  with the roster's thirteen.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed. (Nothing to commit — the file is gitignored.)
- wordwheel's four e2e specs: **6 tests, green in 13.7s** (`wordwheel` 1,
  `wordwheel-coop-win` 2, `wordwheel-mobile` 2, `wordwheel-print` 1).

**A later red is the step's.**

## Findings

*(`F-wordwheel-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/wordwheel.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordwheel.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
