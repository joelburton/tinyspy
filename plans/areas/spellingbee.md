# Area: spellingbee

**Brand: FreeBee.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/spellingbee/todo.md`, not here.

**Status: OPEN** (2026-09-22). The roster is agreed and stamped; nothing has
been read. **Three passes back to back**, psychicnum's, connections' and
wordle's shape: the restructure ([playarea-readability.md](../playarea-readability.md)
step by step, with the stylesheet split), then the audit — React, SQL and CSS
together, the `AnswerMessage` conversion in it — then the tile-feedback pass
against [tile-feedback.md](../tile-feedback.md). The first read is
`src/spellingbee/todo.md`, then the shell commits since the folder last
changed (app-audit.md §4).

## The roster

Agreed with Joel 2026-09-22 (*"agree to the list"*), `cs-met-spellingbee` —
**40 stamped files** at the opening:

| where | how many | note |
|---|---|---|
| `src/spellingbee/` | 23 | `lib/answer.ts` + `.test.ts` arrived `cs-fixed-outcome-fix` — that area ruled its files belong to their own area, which is this one. `hooks/useGame.ts` was left `cs-unmet` by `bee-games` for this area on purpose |
| `supabase/migrations/20260617000000_spellingbee.sql` | 1 | |
| `supabase/sql/spellingbee.sql` | 1 | |
| `supabase/tests/spellingbee/` | 12 | every pgTAP file but one, and `setup.psql` |
| `supabase/functions/spellingbee-build-board/` | 3 | `index.ts`, `board.ts`, `board_test.ts` — **the first edge function on a game roster.** This game's own code, so it is read here; nothing in the shape the earlier games settled covers a Deno chunk, so what its read looks like is this area's to work out |

`src/spellingbee/logo.svg` has nowhere to put a stamp; `todo.md` is markdown
and carries none. `src/spellingbee/doc.md` does not exist yet — it is written
at the restructure's Step 3, and `docs/games/spellingbee.md` is deleted into it
in pass 2, as the three earlier games' docs were.

### What is NOT on it

- **`supabase/tests/spellingbee/rank_idx_test.sql`** — `cs-blessed-rank-ladder`
  (2026-09-21). It pins `common._rank_idx`, the shared function, not anything
  of spellingbee's, the way wordle's `colors_test.sql` stayed `wordle-style`'s.
  Read here all the same, as evidence.
- **The shared folders it imports** — `shared/bee-games`, `shared/found-words`,
  `shared/rank-ladder` — all CLOSED and blessed. Their contracts are read
  against this game, not re-audited.
- **The four e2e specs** (`spellingbee`, `spellingbee-coop-win`,
  `spellingbee-mobile`, `spellingbee-print`) — `cs-unmet`, off the roster as
  every game's have been.

## The reading

### The folder's `todo.md` — read 2026-09-22

One Bug (`act-new-game` answers `active` before the game row has loaded), three
Soon (the info-column action row's branches; the two hand-written Fisher–Yates
shuffles, one FE and one in the edge function; compete's missing end-for-all),
one Someday (the refused-word letter color, a live experiment with wordwheel as
its control — hands off both sides until it comes back). Maybe and Won't do are
empty. Nothing is converted into a finding yet; that is the restructure's
Step 1.

**One item is already stale in a detail:** the action-row item names
`shared.actionsDivider` in `common/game-page/playArea.module.css`. The info
column got its own stylesheet (`2badb0f2`), so the class is
`common/info-sheet/infoCol.module.css` now — and `InfoCol.tsx` already imports
`shared` from there. The prose is stale, not the code.

### The two standing registers, reconciled — 2026-09-22

Joel: *"look for todos in the games/spellingbee file or deferred.md … move
[the useful ones] to the area's todo. delete ones that are stale."*

`docs/games/spellingbee.md` → Deferred held four entries; `docs/deferred.md`
holds one that names this game and three that only mention it. Where each
went:

| entry | verdict |
|---|---|
| the custom-letters e2e "fills two boxes that are now one" | **moved to `todo.md` → Soon, then RULED.** The spec is no longer red: the UI shipped 2026-08-26 (`1599b751`) and `ec12c73a` repaired the spec on 2026-09-01 — the exact certification the deferral said not to accept, so the look still owed Joel the pass it was held for. He gave it the same day: *"i looked at it, it looks fine. no change needed."* Struck through in `todo.md`, not deleted — nothing shipped for it, the question closed |
| the two `SetupForm.module.css` files are byte-identical | **stale, deleted.** Both files are gone (`1599b751`, `ManualBoardField`). `wordwheel.md` → Deferred's cross-reference to it went with it — the pointer would have dangled, and a Deferred section listing shipped work is wrong |
| the `Letters.module.css` / `Wheel.module.css` fold | **still true, copied to `todo.md` → Won't do** as a pointer. wordwheel owns the ruling and keeps the governing copy |
| the `WordList` marker vocabulary (◐, ⦻) | **still true, copied to `todo.md` → Someday** as a pointer. The entries live in `common/word-list/todo.md` |
| deferred.md: ungated `:hover` on tappable board elements, three games | **still true here, verified, moved to `todo.md` → Soon.** `.hex:hover` lifts the hex and lightens its shadow with no `@media (hover: hover)`, so a tap leaves it risen. deferred.md keeps the item for stackdown and wordwheel; this game comes off that list when it ships |
| deferred.md: `touch-action` zoom suppression, confirm on a real iOS device | **left.** A cross-cutting device check that names the hive among five surfaces; not this game's to close |
| deferred.md: two struck-through DONE items mentioning spellingbee | **left.** History, correctly marked |

`docs/deferred.md`'s per-game table also had **no spellingbee row** under a
headline that says only the listed games have open items — while the game's doc
carried four. It has one now, pointing at the folder's `todo.md`, the way
connections, psychicnum and wordle do.

### What moved under the area — read 2026-09-22

§4's window is empty by construction here: the opening commit (`a9a5695c`)
stamped all 23 FE files, so "since the area's files last changed" is today. The
honest anchor is **`5f69e95b` (2026-09-15, "the hive behaves like a board")**,
the last commit that wrote this game's code for its own sake — everything since
is a shared area reaching in. In that window **32 commits touch
`src/common/game-page/`**, and the cumulative diff rewrites
`playArea.module.css` (392 lines), `GamePage.tsx`, `GamePageGate.tsx`,
`useCommonGame.ts`, `gamePageCtx.ts` and `verdictTone.ts`, and adds
`readLeaderboard.ts`.

**What that makes a FALSE finding here:**

- *"This state survives a restart"* — and now also *"survives a game→game
  navigation"*: `GamePageGate` derives `exists` from `{ id, exists }`, so a
  different `gameId` says `checking` and unmounts the subtree (`e3d8f969`).
- *"A finished player wedges the pause"* — `activePlayers` is now `players`
  minus conceded, minus `locally_terminal`, minus `ai_member` (`624c8dc2`).
  **Checked, and there is nothing owed here:** spellingbee's SQL sets no
  `locally_terminal` and it is right not to — conceding is this game's only
  per-player done state (`PlayArea.tsx`'s `isLocallyDone`), and a conceder was
  already out of the roster. It has no bots either.
- *"`computePause` also answers who is absent"* — it answers a boolean
  (`197d455a`), and the suspend confirm is `askConfirmation(suspendConfirm(…))`,
  not a mounted modal (`b5f21539`).

**What the game already reads, so a finding has to be about what it wrote
ITSELF:** `useMark` (`PlayArea.tsx`, the word answer), `VERDICT_TONE`
(`Letter.tsx`), `shared.boardSeal` (`Letters.tsx`), `--avail-h` composed rather
than hand-summed (`BoardCol.tsx`, `PlayArea.module.css`), and `InfoCol.tsx`'s
import off the info column's own stylesheet.

**One candidate the window produced** (for the prose pass, not worked):
`Letter.tsx`'s tone-class comment says the class "sets nothing but the two
custom properties". `verdictTone` carries three since `7cca2427` —
`--verdict-fill`, `--verdict-ink` and `--verdict-edge` — so the count is wrong,
and whether the hex should wear the edge is a real question rather than a typo.

## The restructure

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is behavior-preserving
unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-22

Run on the untouched tree with the roster stamped `cs-met-spellingbee` (Joel:
*"do step 0"*, then *"Both"* to the e2e question):

- `tsc -b` clean; lint clean over `src/spellingbee/` **and**
  `supabase/functions/spellingbee-build-board/` — the edge function is on this
  roster, so it is in the net from the start.
- The game's unit tests and the guards: 35 files, 341 tests, green.
- The edge function under `deno test`: 11 tests, green — the letter masks,
  pangram scoring, the overlap cap and the custom-letters validator. **This is
  the piece no earlier game area had**, and it is a second runner, not a vitest
  project: `deno test --allow-all supabase/functions/spellingbee-build-board/`.
  `deno check` is not a substitute — it does not run them, and a chunk that
  type-checks can still fail to boot.
- pgTAP, the whole suite: `gmake db-sql ENV=local` then `npm run test:db` —
  181 files, 2559 tests, PASS. Twelve of spellingbee's thirteen files are the
  roster's; `rank_idx_test.sql` is `rank-ladder`'s and ran with them.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed. (Nothing to commit — the file is gitignored.)
- spellingbee's four e2e specs: **7 tests, green in 15.1s** (`spellingbee`,
  `spellingbee-coop-win`, `spellingbee-mobile`, `spellingbee-print`). The
  custom-letters spec is among them, which is the last of the entry ruled above.

**A later red is the step's.**

## Findings

*(`F-spellingbee-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/spellingbee.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] `docs/games/spellingbee.md` reconciled with `todo.md`: its Deferred
      section moved into the todo (2026-09-22, above), and `docs/deferred.md`
      points at the folder's register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
