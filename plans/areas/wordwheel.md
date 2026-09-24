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
**`src/wordwheel/doc.md` was written at Step 3** (2026-09-23), markdown like
the todo, roster all the same. **`lib/terminal.ts` and `lib/terminal.test.ts`
were created at Step 6**, stamped `cs-met-wordwheel`.

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

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-23

The doc's register was emptied at the opening. Every other `todo.md`, every
plan, and the docs were grepped for the game (`wordwheel`, `word wheel`,
`MooseWheel`). What they held:

**The end-for-all copy in `todo.md` is DELETED**, as spellingbee's was.
`common/game-page/todo.md` holds the work and says *"build it as one change,
not fourteen"*, and Joel's ruling there (*"`ended` is neutral in every
mode"*) leaves no per-game reading to check first. The copy's check was run
anyway, and it holds: `manifest.ts`'s compete `labelFor` answers
`verdict('Ended', …)` with `nobody reached "<rank>"`, never a loss, with the
all-conceded terminal caught ahead of it on `status.reason`; the in-game
verdict for a manual compete end is the shared
`gameEndedTerminalMessage('compete')`.

**`plans/tile-feedback.md` holds three wordwheel entries, and none is
`todo.md`'s** — all are pass 3's: the shape-1 section (*"Nothing more on the
board"*, Joel 2026-09-23, now that the refusal reads the same on both bee
boards); the roster row (tf0 — *"a pass through the MARKS, not the
framework"*); and the token row (BRAND tokens for both bee games, ruled at
spellingbee's tf2, with the center moved to the dusty purple `#7e6aa3` the
same day, `45f618f1`).

**Two things for the audit, not the todo** — both in files on this roster:

- `components/Tile.tsx` calls the outcome class a *"tone class"*, and
  `Wheel.module.css` → `.tile.answered .face`'s header says *"The tone"*.
  `common/game-page/todo.md` → Bugs files the shared `VERDICT_TONE` rename,
  and says a game's own `tone`-for-outcome prose is fixed per game.
- `theme.css`'s *"see docs/ui.md"* pointer, already recorded in the opening
  reads.

**Checked and holding nothing owed:**

- `common/mobile/todo.md`'s `:hover` question lists wordwheel's board among
  the ungated (`Wheel.module.css`'s `.tile:not(.used):hover`, verified). The
  decision is the scope, shared and open; nothing to copy until it lands.
- `common/setup-form/todo.md`'s five monospace forms name wordwheel — but
  wordwheel's `SetupForm` sets no font. The mono face is
  `common/fields/ManualBoardField.module.css`'s, shared with spellingbee, so
  the entry's "five forms" count is stale in a detail. setup-form's to fix,
  not this area's.
- `shared/found-words/todo.md`'s `.loading` / `.empty` — this game deletes its
  own two uses at Step 2, the loader split; the shared rule goes when the last
  of the three has converted.
- `common/game-page/todo.md`'s per-game height reserves — wordwheel computes
  no `100svh` of its own; its column height is `foundWordsPlayArea.module.css`'s.
- `src/boggle/todo.md`'s Won't do on sharing `makeBeeGame` — boggle's ruling,
  wordwheel as evidence.
- `plans/playarea-readability.md` (its survey rows — pass 1's steps),
  `plans/keyboard-nav-plan.md`, `docs/states.md`, `docs/naming.md`,
  `docs/games/wordiply.md` / `letterboxed.md` / `boggle.md` and the shared
  folders' `doc.md`s — evidence or description, no work.
- The root `todo.md` names nothing of this game's.

**What `todo.md` holds after the step:** one Bug (`act-new-game` before the
game loads), five Soon (the leaderboard helper, the unread result keys, the
status-merges comments, the action-row collapse, the two shuffles), one
Maybe (`s`-heavy seeds), one Won't do (the board-stylesheet fold).

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-23

spellingbee's shape, copied: `PlayAreaLoader` owns `useGame` and the three
gates — `<Loading>`, `<EnvelopeErrorPage>`, `<NoSuchGamePage>` (its `detail`
names the read that came back empty, `rows=0 view=wordwheel.games_state`) —
and hands `PlayArea` a non-null game, the found-words rows, `rowsLoaded`, and
a narrowed `setup`. The cast happens once, in the loader's JSX; the inner
component takes `setup: WordwheelSetup` through `Omit<GamePageCtx, 'setup'>`.
The manifest's lazy line names the loader, and the test file mounts it at all
29 sites with `useGame` mocked exactly as before.

**What went with it**, all in this commit: the `wordwheelSetup` cast (its
readers now read `setup`), `game?.mode ?? 'coop'` twice, `game ? {center,
outer} : null`, `if (!game) return` inside Print's run and its `describe: ()
=> (game ? 'active' : 'hidden')`, `if (!game) return m` in `letterCounts`,
`game?.requiredWords ?? []` and its bonus twin, `game?.center_letter
.toLowerCase() ?? ''`, `game?.mode === 'compete' ? 'compete' : 'coop'`, the
`gameMode` variable with its readers and its `if (!gameMode) return //
menu exists pre-load`, `game?.required_words_score ?? 0` twice, the remaining
`game?.mode` reads (the scored rows, both narrations, `isCompete`), and the two
inline gates (`surface.loading` / `surface.empty`). boggle still reads both
classes, so nothing went dead in the shared sheet; `shared/found-words/todo.md`
waits on boggle alone now. The rank-climb effect's dep went `game` →
`game.mode`, which is all it reads.

**Two comments the split made false came out with their guards:** the peer
narration's *"Called unconditionally, before the early returns, and reads
`game?.mode` (null while loading …)"* and the standing conditions' *"Above the
early returns because effects must be."* There are no early returns in
`PlayArea` now. The rest of the comments wait for Step 8.

**The play-surface docstring was orphaned the same way spellingbee's was**: it
sat above `type SubmittedWord`, which has its own, so `PlayArea` had none. The
type moved up above the loader, and the docstring sits on its component, with
one sentence added saying the rows arrive from the loader.

**One behavior change, stated now**, the same one the earlier games
made: while the read is out the header menu has no game rows and `+` does
nothing, where before the rows were published pre-load and `+` asked the
new-game question and then could not act. **That IS the Bug in `todo.md`**,
which is deleted there — `describe: () => 'active'` is now true rather than
optimistic. The loading placeholder changes too: the shared `<Loading>` and
`<NoSuchGamePage>` replace the two bare divs.

**Verified:** `tsc -b` and eslint clean; wordwheel, found-words and the
guards: 45 files, 407 tests green.

### Step 3 — the `doc.md` skeleton, with the RPCs and FE submissions written — DONE 2026-09-23

spellingbee's shape: `src/wordwheel/doc.md`, seven headings, with the lede, a
short intro, the RPCs and the FE submissions written from
`supabase/sql/wordwheel.sql`, the edge function and the call sites — not from
the old doc — and Game rules, Schema, Frontend and Tests marked owed to pass 2.
The RPC section is the `ok` answers only; a refusal that is part of the story
is a clause without a code.

**The intro leads with the multiset**, the one thing this game is that
spellingbee is not: the tile-spend rule is why the builder post-filters, why
the frontend has a submit gate, why the tiles mark as a word is typed, and why
there is no S rule. Then the three paragraphs spellingbee's intro has — the
frontend knows the answer key, the board is built outside the database, and
whose list a word lands on — shortened where they are the same.

**The board example is a REAL board**, `D·AEEGINNR`: the seed `adeeginnr`
from the local `wordwheel.pangrams`, run through `candidate_words` at bands
3 / 5 and the edge function's own `buildBoard` (imported under Deno) — 83
required words for 401 points, 65 bonus; three required pangrams
(`endearing`, `engrained`, `grenadine`, 24 points each). Every example word in
the doc was checked against those lists: `dean` (required, 1), `dinner`
(required, 6 — both N tiles), `dene` (bonus, 1), `den` (three letters),
`rein` (fits the tiles, no D), `drean` (fits the tiles, has the D, not in
`common.words`), `dared` (two D tiles wanted, one on the wheel — dropped by
`buildBoard`, and the frontend's submit gate refuses it).

**Written against the code, where the code's own comments disagree:**

- The edge function's header table lists five codes with PN197 a `fault` and
  says *"this game has four"* form-validations; the code returns five
  `formValidation`s, PN197 among them, on the form's own line. The doc says
  five, as clauses (`PlayArea.tsx`'s New-game comment already says FIVE).
- `submit_timeout`'s header says compete ends `'ended' (nobody reached the
  target)`; the code writes `lost_compete` whenever `target_rank` is set, which
  a race always has. The doc says always `lost_compete` in a race.
- `concede`'s all-conceded ending: the doc uses spellingbee's corrected wording
  (*"adds only its reason over the race's last readout"*), since
  `common.end_game` merges — the `todo.md` Soon item on the two comments that
  say *replaces* still stands.

**One Step 2 leftover rides in this diff, said now:** `answerOf`'s
`center !== '' &&` guarded the `?? ''` that Step 2 removed — the center is
never empty once the loader holds the gate — so it came out with its docstring
clause (*"and empty until the game has loaded"*) and the test line that
exercised an empty center. spellingbee removed the same guard in its own
Step 2 (`explainReject`'s `center &&`); I missed it in this game's.

**Already done, which makes Step 4 small:** `lib/answer.ts` is ALREADY the
`AnswerMessage` shape — `Answer`, `answerMessage`, `answerOf`,
`peerAnswerMessage`, the words and the outcome together, arrived with
`outcome-fix`. The FE-submissions table reads it directly; there is no
inventory of scattered strings to convert, as spellingbee had. What Step 4
still owes is a read of whether anything else in the game writes a player's
words outside it.

**Seen with the code open, left for pass 2** (stale claims, the prose pass's):

- `wordwheel.sql` → `create_game`'s header: `bonus_words` shown as
  `[text, …]` (it is `{ word, points, is_pangram }` objects); the title example
  `E·CABDNO` (six letters, unsorted — a wheel has eight outer letters, sorted);
  *"Reject reasons (all 'P0001' unless noted)"*, from before the envelope.
- `submit_word`'s header: *"Throws (hard rejections): … P0001 … P0002"*, from
  before the envelope; and *"(src/wordwheel/lib/answer.ts and the shared
  word-hunt engine)"* — an off-wheel letter is refused by `BoardCol`'s submit
  gate, not by `answer.ts`, and word-hunt is `found-words` now.
- `submit_timeout`'s header: *"rejects everyone after the first with P0001
  (which the FE swallows silently)"* — a race envelope now.
- `end_game`'s header: `status.outcome='manual'` (the key is `reason`, the
  residue spellingbee found too), and *"declared by wordwheel's PlayArea via
  ctx.menu.setGameItems"* (it is `buildGameMenu` into `setGameSections`).
- The edge function's header: step 7 *"Return { id } to the FE"* (it relays
  `create_game`'s envelope), and the calling shape's setup lists
  `{timer, required?, legal?, target_rank?}` without `custom_center`,
  `custom_letters` or `unique_letters`.
- `board.ts` → `validateCustomLetters` wears three stacked comments, the middle
  one saying it *"Returns the fe-error-key"* and citing *"docs/supabase.md →
  Server errors"*; it returns a `LetterFault`.
- `manifest.ts`'s `startGameInClub` docstring: the edge function *"strips
  `setup.mode` if present"* — `parseBuildBoardRequest` strips nothing (the
  same claim spellingbee's manifest had).
- `lib/setup.ts`'s docstring: `create_game` *"rejects a `mode` field on setup
  with a loud P0001"* — no such check exists.
- `db.ts`'s docstring: `games_state` *"conditionally exposes the hidden
  `required_words` answer key based on common.games.is_terminal"* — both lists
  ship at load; read the view at pass 2 before rewording.
- `PlayArea`'s surface docstring still describes verdicts that do not exist
  (*"Genius (rank ≥ 6) vs Stopped"*, *"You won the race!"* vs *"Beaten to the
  punch."*, *"No winner at <rank>"*); `buildOver` writes none of them. Step 8
  reaches it first.

**Verified:** `tsc -b` and eslint clean; wordwheel and the guards: 41 files,
377 tests green (one fewer assertion in `answer.test.ts`, the empty-center
line).

### Step 4 — the `AnswerMessage` conversion — DONE 2026-09-23, nothing to convert

**Already done, by spellingbee's Step 4** (`d55648b8`, 2026-09-22): that step
changed the shared engine's contract — the engine reports, the game says — so
wordwheel converted in the same commit as part of the rollout. `lib/answer.ts`
is `Answer` (seven answers: spellingbee's eight less `bad_letters`, since the
submit gate vetoes an unspellable word before the engine sees it),
`answerMessage()`, `answerOf(report, center)` and `peerAnswerMessage(row)`.
`PlayArea`'s `onAnswer` shows the pill and drives the refused tiles from one
call; both peer narrations read the same file.

**What this step checked:**

- **No player's words about a move are written anywhere else.** Every other
  string on the roster that reaches a player is a standing condition, not an
  answer: `buildOver`'s terminal verdicts (Step 6 moves it), the out-of-race
  line, and `InfoCol`'s `You conceded`. The engine's `not-ok` is the server's
  sentence, a race or a bug.
- **The SQL half is pinned.** `submit_word`'s `ok`s carry no outcome, and the
  pgTAP says so on the accepted word (`gameplay_test.sql`, outcome and message
  both) and on both wins (`coop_target_test.sql`, `compete_test.sql`, written
  out as `"outcome":null` because `envelope_is` is containment). Planted and
  seen red at spellingbee's Step 4; not re-planted here, since neither the SQL
  nor the pins have changed since.
- **`answer.ts` against spellingbee's**, name-for-name: the differences are
  the game's (no `bad_letters`, the moose for the bee, a miss split by the
  center alone).

**One sentence fixed:** `answerMessage`'s docstring said *"The pill and the
header's peer lines read it"* — the refused word's tiles have read the same
call since `1bfeb02a`; it now names all three, as spellingbee's does.

**Left for pass 2's prose pass:** `answerMessage`'s docstring still carries a
second paragraph (*"The readings are its siblings' …"*) that spellingbee's no
longer has.

**Verified:** wordwheel's unit tests and the guards: 41 files, 377 tests
green.

### Step 5 — the actions and the row (readability 3.6, 3.7) — DONE 2026-09-23

spellingbee's Step 5 (`e3306824`), copied. **The row is one `<InfoActionsRow>`
now**, in the order `docs/playarea.md` states: Restart · New game · Concede ·
End | Back to club, Back to club filled only at terminal. The three-way fork
(`over ? … : isLocallyDone ? … : …`) is gone; the only thing that varies is
the row's line — the verdict, "You conceded", nothing while you can play. The
InfoCol's destructure, its prop-type block and the PlayArea's prop list read
in that order, and so does the menu. **No divider**: wordwheel has no hint and
no spoiler, so nothing sits left of it.

**The conventions, per binding:** New game is a button only at terminal,
`(asker) => asker === 'button' && !isTerminal ? 'hidden' : 'active'`, a menu
row and `+` all game; Restart, Concede and End were already the shared hook's.
`createNewGame` was already a plain `async` function, and no in-flight flag
existed to remove. **One `useCallback` dropped:** BoardCol's `handleShuffle`
had the shuffle binding as its only reader, so the binding's `run` is the
setter call itself; `handleLetterClick` and `handleChange` keep theirs, since
children read them. **Every binding in one section, in one order:** Print
moved from above the tile counts to after New game — the shared trio, New
game, Print — unchanged in body.

**Two behavior changes, stated now**, spellingbee's same two. *A conceded
racer gets Back to club* — the conceded row held only the grayed Concede,
which is what the todo named as the fork's loss. *The menu lists Restart · New
game above Print*, where Print came first, so the menu and the row read alike.
Back to club keeps `weight={over ? 'primary' : 'secondary'}`.

**The todo's Soon item is deleted.** Two tests pin the conventions, spellingbee's
two: Restart and New game are menu rows all game and buttons only at the end;
and the conceded racer's test now asserts Concede grayed, Back to club
present, and Restart / New game menu-only. **Verified by planting** New game's
old `'active'` and a Back to club that the conceded row drops: exactly those
two tests red; restored from scratchpad copies, green.

**Seen, left for pass 2** (both were spellingbee findings there): `InfoCol`
still takes a `setup` prop it never reads (spellingbee's F-2), and Print's
`run` recomputes `rankIdx` where the component already has `selfRankIdx`
(spellingbee's F-3).

**Verified:** `tsc -b` clean, lint clean over `src/wordwheel/`; the game's
unit tests and the guards: 41 files, 378 tests green.

### Step 6 — the builder leaves the component file (readability 3.4) — DONE 2026-09-23

spellingbee's Step 6 (`8f600f6a`), copied, names and all: the builder is
**`buildTerminalMessage`** in `lib/terminal.ts`, the value it produces is
`terminalMessage`, and InfoCol's `over` prop is `terminalMessage` too.
`PlayArea.tsx` no longer imports `gameEndedTerminalMessage`, the
`TerminalMessage` type or `Actor`; the `useMemo` on primitives that feeds the
verdict effect stays there.

**Checked before copying:** wordwheel's `buildOver` and its docstring were
byte-identical to spellingbee's as it stood before that game's Step 6
(`e3306824`), once the game names are swapped. So `lib/terminal.ts` and
`lib/terminal.test.ts` are spellingbee's Step-6 files with the names swapped —
the same body, the same `statusOutcome` → `reason` rename (a name left from
before `status.outcome` became `status.reason`), the same three docstring lines
saying "reason". No word a player reads changed.

`lib/terminal.test.ts` walks the whole input space — every terminal play state
in both modes, the caller winning and beaten, the winner known to the roster
and not, both collective losses told apart by reason — and ends on the table
check: no cell pairs a winning sentence with a losing outcome, and both texts
are filled. **Both files join the roster at `cs-met-wordwheel`.** The one test
comment naming `buildOver` names the new function; the old
`docs/games/wordwheel.md` never mentioned it.

**Still standing for Step 8:** `PlayArea`'s surface docstring describes
verdicts that do not exist (the Step 3 note); the builder's own docstring,
which moved with it, is right.

**Verified:** `tsc -b` clean, lint clean over `src/wordwheel/`; the game's
unit tests and the guards: 42 files, 386 tests green.

### Step 7 — the section order (readability 3.2) — DONE 2026-09-23

spellingbee's Step 7 (`a83dd240`), copied, header words and all.
`PlayArea.tsx` reads:

1. Page hooks — `useTabRing`, `useInfoSheet`, `useCelebration`
2. Derived — `summaryRows`, `hasBonus`, `myConceded`, `isCompete`, the found
   rows and their score + count, `selfRankIdx`, `targetRankIdx`,
   `isLocallyDone`
3. The local slot, and its two standing conditions — the slot, the terminal
   message and its winner derivations, out-of-race
4. **The move — a typed word, and its answer** — `letterCounts`,
   `legalIndex`, the refused-tiles mark, `center`, the engine
5. Narration — the coop peer-word line and the compete rank climb
6. The commands, bound — the shared trio, New game, Print
7. The menu
8. Render — `concededIds`, the leaderboard and `rankByUser`, `wordRows`, then
   the columns

**The move is the section the doc's eight do not have**, exactly as it was at
spellingbee's Step 7: the engine is still in the PlayArea. spellingbee then
moved its engine into `BoardCol` as a separate step on Joel's ruling
(*"in general, if pieces can be pushed down, that seems like a good thing?"*),
which removed the section again — and wrote that wordwheel would keep its
engine "until their areas open". **Not done in this step; asked, and done
next** — see below.

`BoardCol.tsx` reads in three: **The pending guess** (the tile claims, the
letter click, the change handler that trims claims, the typed word's letter
counts) · **The board's display order** (the shuffle's seed, memo and binding)
· **Render**.

**Every code line in both files is a pure move, checked by diff** — the
non-comment lines of each file before and after, sorted, are identical (446
in `PlayArea.tsx`, 188 in `BoardCol.tsx`). The old `// ───` sub-headers are
plain comments now (the celebration, the tile counts, the slot, the engine,
the shared trio, New game, the two narrations); the "two standing conditions"
block's header became the section's. Comments that moved or split with their
code, as spellingbee's did: `myConceded`'s kept its first sentence and
`concededIds` got its own (it went to Render); the parenthetical "`selfRankIdx`
… is derived above, beside the verdict" became `selfRankIdx`'s own comment in
Derived; the menu's comment is its section's header text; the out-of-race
effect's comment moved with `isLocallyDone` into Derived, and the effect got
spellingbee's one line.

**Left for Step 8, the comment pass:** the archaeological "(The local
outer-letter shuffle + the letter-click input moved into BoardCol)"; the
narration's "Peer/opponent activity → header feedback pills" paragraph, which
repeats the new header; the shared trio's "New game stays below"; and the
surface docstring's nonexistent verdicts (Step 3's note).

**Verified:** `tsc -b` clean, lint clean over `src/wordwheel/`; the game's
unit tests and the guards: 42 files, 386 tests green.

### The engine moves into BoardCol, and the board goes inert — DONE 2026-09-23

Joel, asked after Step 7 whether to follow spellingbee: *"i'll take your rec"*
— the move with the inert board, in its own commit after Step 7's. spellingbee
did this as two commits (`da10576e`, `48b4e58d`); here it is one change, both
halves copied.

**What moved into `BoardCol`:** the `useFoundWordSubmit` call, `legalIndex`,
`letterCounts` (its readers — `<TypedWord>`, the submit gate — are all
BoardCol's; its deps are the two letter props now, not the whole `game`),
`center`, the refused-tiles mark, `commit` with the `submit_word` call and the
`SubmittedWord` reply type, and `onAnswer`. BoardCol **gains** `gameId`,
`mode`, `selfId`, `readOnly`, `foundWords`, `requiredWords`, `bonusWords`; it
**loses** `refused`, `letterCounts`, `word`, `onChange`, `onSubmit`,
`lastWord`, `isTerminal`. **What stayed:** the local feedback slot (the
standing conditions, the shared trio and New game write it too) and
`foundWords` (the score, the word list, the print and the peer line read it).
**InfoCol is untouched.** `PlayArea` is back to the doc's eight sections;
`BoardCol` reads **Committing a guess** · **The pending guess** · **The
board's display order** · **Render**, spellingbee's four.

**Three behavior changes, spellingbee's three, all from one flag.**
`PlayArea`'s Derived computes `readOnly = isTerminal || isLocallyDone` and
hands BoardCol that one flag:

- *A conceded racer's entry closes.* The entry was disabled on `isTerminal`
  alone while the engine refused on `isTerminal || myConceded`, so a
  conceder's keys filled a word nobody could see (the out-of-race line holds
  the slot) and marked its tiles.
- *The wheel is inert when the game is over or I conceded.* Tile taps had
  been gated nowhere — `Wheel` always got `onLetterClick`. Now BoardCol passes
  `onLetterClick={readOnly ? undefined : …}`; `Wheel` and `Tile` take the click
  as optional, and a tile without one wears `.inert`: `cursor: default`, and the
  hover rise and the press gated `:not(.inert)` beside the existing
  `:not(.used)`. Full color and the resting shadow stay. **Shuffle stays
  live.** A spectator with no seat is not folded in, as in spellingbee.
- *A half-typed word's marks clear when the board goes read-only.*
  `typedCounts` is empty while `readOnly` — derived, not cleared. The claims
  need no clearing: `spentTiles` honors a claim only up to the word's count,
  and the count is zero.

**Five tests**, spellingbee's five with the wheel's tile hooks (`data-disabled`
for spent, `_inert_` in the class): a conceded racer types nothing; a tap adds
its letter while I can play; a conceded racer's wheel is inert (all nine) and
a tap adds nothing; a half-typed word loses its marks when the game ends; a
finished game's wheel is inert. **Verified by planting each old behavior back
from a scratchpad copy:** the ungated tap turned the two inert tests red; the
kept marks turned the half-typed test red; restored, green.

**The open entry was NOT caught at first**, and that is a defect in
spellingbee's copy too: once the board went inert, the read-only board draws
no marks whatever the word holds, so *"a conceded racer types nothing"* stayed
green with `disabled={false}` planted on the entry. wordwheel's copy now
asserts first that `act-type-letter` answers `disabled` — red with the plant,
green restored. **spellingbee's test was planted the same way and stays green**;
filed in `src/spellingbee/todo.md` → Soon rather than edited, since that area
is closed and blessed. **Then fixed on Joel's word** (*"let's fix the todo you
just filed for spellingbee"*): the same assertion added there, red with the
open entry planted, green restored; the todo item deleted. The file keeps its
`cs-blessed-spellingbee` stamp — only Joel moves it.

**The CSS is not visually verified** — jsdom has no hover; the class is
asserted, the look is not. The old `docs/games/wordwheel.md`'s one sentence
saying `PlayArea` computes `letterCounts` now says `BoardCol`.

**Verified:** `tsc -b` clean, lint clean over `src/wordwheel/`; wordwheel,
spellingbee and the guards: 47 files, 473 tests green.

### Step 8 — the comment pass (readability 3.5) — DONE 2026-09-23

spellingbee's Step 8 (`96b84a17`), copied, under psychicnum's Step 6 rules,
over six files: `PlayArea.tsx`, `BoardCol.tsx`, `InfoCol.tsx`, and the
wheel's three — `Wheel.tsx`, `Tile.tsx`, `TypedWord.tsx`. **558 comment lines
in, 425 out.** **Proved a pure comment pass** — with every comment form
stripped (block, line, trailing, and the JSX `{/* … */}`) and blank lines
dropped, all six files are byte-identical before and after. `Wheel.tsx` lost
the blank line between its docstring and `export function Wheel`, which the
proof's blank-line drop covers.

**`PlayArea.tsx` and `InfoCol.tsx` take spellingbee's comments word for
word**, with the hive made the wheel: their code was already the same once
the names are swapped (checked by diff), so every comment spellingbee's pass
rewrote had its twin here. **`BoardCol.tsx` and the wheel's three were
written by hand**, since the multiset — the tile counts, the claims, the
submit gate, the spend order — has no twin in the hive; spellingbee's
wording was used wherever a comment does.

**Nine comments were FALSE, not stale.** From spellingbee's list, the same
four: the surface docstring's verdicts (Step 3's note), the celebration's
first-render reason for compete not celebrating (the winner id is on the
common row), Print's "the explicit compete filter already scope[s]" (the
print reads `foundWords`; RLS alone scopes it), and the trio's header naming
Restart "Replay". This game's own: `Wheel`'s "server validates on submit"
(the submit gate is the frontend's) and its `.floatAnchor` "around the svg"
(the wheel is boxes, no svg); `BoardCol`'s `letterCounts` "tile spending"
(its readers are the typed word's dim and the submit gate — spending reads
`typedCounts`); `Tile`'s `disabled` "once this tile's letter is already in
the typed word" (it is the tile being spent — with two tiles of a letter, the
letter can be in the word and one tile still free); and Print's
"wordwheel's own difference: pangrams print bold" (spellingbee's do too).

**The rules did the cutting.** Rule 3: End's "a valid outcome, not a
punishment", the shuffle's "the post-game fidget is deliberate" and "Always
clickable, even when locked", InfoCol's "the thing you watch" and "the wheel
makes the move obvious", `onAnswer`'s "a peer is never told about somebody
else's miss", the slot prop's "the ONLY copy the player sees", and the
submit gate's "FOOD" argument. Rule 2: the shuffle's "Bound HERE rather than
in the PlayArea", the Committing header's "First, because the engine owns
the pending word", the claims' "live here because this column owns both
halves", `createNewGame`'s "A plain function, rebuilt every render"
paragraph, and `Wheel`'s "Only wordwheel uses this wheel, so it stays local".
Rule 1: the shuffle's ⌥Z and `handleChange`'s ArrowUp.

**Archaeology:** `Tile`'s "the test hooks that replaced `role="button"`",
"`onMouseDown` is still intercepted, now only", and "the same move
letterboxed's letters made"; `Tile`'s pointer at spellingbee's `Letter` "for
the same note at length" (that note is short now; the sentence is here
instead); "(this game is a fork of it; there is no "wordwheel-ws"
upstream)"; "Same rule as boggle's"; "(the waffle loading-race lesson)";
the info-column JSX comment's "(same as psychicnum / connections /
codenamesduet / waffle)". **Call sites to a sentence and a pointer:** the envelope paragraph
in `createNewGame` (docs/envelopes.md), the `ready` gate
(`usePeerFeedback`), `commit`'s paragraph (the engine's `commit` contract),
NEW_GAME_CONFIRM, and `Wheel`'s spend-order paragraph (`lib/spend.ts`, whose
docstring carries it in full). **The four Step 7 parked comments are gone.**
Every prop note is `//`.

**One pointer repointed:** `createNewGame`'s "(docs/games/wordwheel.md)" — a
doc pass 2 deletes — cites `doc.md → FE submissions`, which already says a
hand-picked board is a one-off.

**For pass 2, spellingbee's F-1 again:** a race's winner gets no confetti.
The celebration comment now says only what is true — a race's `won_compete`
is not celebrated — without the old reason.

**Verified:** `tsc -b` clean, lint clean over `src/wordwheel/`; the game's
unit tests and the guards: 42 files, 391 tests green.

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
