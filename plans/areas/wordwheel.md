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
were created at Step 6**, stamped `cs-met-wordwheel`. **`components/Tile.module.css`
was created at the stylesheet split**, stamped the same.

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

### The stylesheet split — DONE 2026-09-23

spellingbee's split (`83cd582c`), copied. The per-importer rule, and again no
judgment was needed: `Wheel.module.css` had two importers and no class read
by both. `Wheel.tsx` reads `.board` / `.floatAnchor` / `.grid`; `Tile.tsx`
reads `.tile` / `.inert` / `.center` / `.used` / `.answered` / `.face`. So
**`Tile.module.css` is new**, holding every rule from `.tile` down — the
seat, the face, the center, the read-only tile, the hover and press, the
reduced-motion block, the spent tile, the answer — and `Wheel.module.css`
keeps the wrapper, the anchor and the square with its touch behavior.
**Rule bodies and `/* @@ */` markers moved verbatim**, checked by script:
with every non-marker comment stripped, the old file and the two new ones
are the same 89 lines.

**Both headers are rewritten.** The old one was false in three places: it
said the wheel is "ONE inline <svg> … viewBox 0 0 300 300" (it is boxes on a
square), that `--u` is "set on .boardCol in PlayArea.module.css"
(`beeBoard.module.css` declares it), and it carried the history ("It was an
SVG <circle> until 2026-09-15", "letterboxed made the same move"). The new
`Tile.module.css` header keeps the one reason that still explains the code:
boxes, so the depth is the shared shadow and a lifted face can rise over
touching neighbors. **One rule comment changed with them:** `.floatAnchor`'s
"Shrink-wraps the wheel svg" says the wheel's grid. The archaeology left in
rule comments ("Hover used to DIM", "(It was a DARKENED FILL …)", "exactly as
it was when the whole thing was one SVG circle") is the prose pass's,
untouched here.

**Prose pointers chased:** `todo.md`'s Won't-do fold entry, spellingbee's
`todo.md` twin of it, `docs/games/wordwheel.md`'s fold entry, and
`plans/tile-feedback.md`'s own-tile table (the tile is `Tile.module.css`
now). Each names the file the rules live in. `PlayArea.module.css`'s "(see
Wheel.module.css)" is about the 300 × 300 square, which stayed, so it is
still right. `docs/deferred.md` and `docs/code-conventions.md` no longer name
the file.

**`PlayArea.module.css` stays as it is**, spellingbee's ruling for the same
reason: it is one `.layout` rule declaring the six bee-games tokens, two of
which are read on `.layout` itself, and the bee-games contract declares all
six there. `BoardCol.tsx` wears no class of its own, so it needs no module.
**The restructure is complete.**

**Verified in the EMITTED css:** `vite build` to the scratchpad; the game's
chunk carries two module hashes (`_grid_1gywk` beside `_face_1kzo9`) and the
`prefers-reduced-motion` block once. `cs-stamp.mjs list met-wordwheel` shows
the new file; `cssClasses` and `csStamps` green with it staged. `tsc -b`
clean, lint clean; the game's unit tests and the guards: 42 files, 391 tests
green. **Not seen on a device or in a browser** — the rules are unchanged,
and the build shows both modules load.

## The audit — pass 2

### The prose pass — in the working tree 2026-09-24, one sitting

spellingbee's prose pass (`5df66582`), copied file for file, for Joel's read
before any finding is presented (the order [app-audit.md](../app-audit.md)
§4 sets):

- **`src/wordwheel/doc.md` is whole.** The intro's fifth paragraph (the end
  of a game is on the board — and only a coop team celebrates, since the
  race winner's confetti is still F-1's); Game rules with a Vocabulary table,
  Coop, Compete and The play states; Schema; Frontend, with the render tree
  and what is wordwheel's own; Tests, both suites as tables, the Deno runner
  and the four Playwright specs named. Written from the code, as Step 3's
  sections were, not from the old doc. What this game's sections carry that
  spellingbee's do not: the multiset in the rules (each tile once, the center
  free to repeat an outer, no S rule), `tile`, `seed` and `unique letters` in
  the vocabulary, the seed pool that scales with the band and the multiset
  title under Schema, the spend rule and the submit gate under Frontend, the
  dup-board fixture and `candidate_words_test` under Tests. Every random
  board's pangram is a REQUIRED word (a seed tagged at or below the required
  band has a required-quality nine-letter word at that band, and the exact
  multiset always fits), which the doc now says and the old one did not.
  **`docs/games/wordwheel.md` is deleted** (staged with `git rm`, so the
  deletion rides with the diff); CLAUDE.md's row, the manifest's docstring,
  `submit_word`'s comment and the edge function's three pointers are
  repointed, and `docs/naming.md`'s vocabulary list gains this doc's row
  beside connections' and spellingbee's. **The frozen migration's five
  pointers and the import script's one are repointed too** — spellingbee's
  pass left its migration alone, but Joel's prose-guards commit (`f2d5ff34`)
  then repointed that migration's comments itself, and `prosePaths` now
  refuses a named path that does not exist; an applied migration's COMMENTS
  are Joel's to correct (CLAUDE.md → Production software). The import script
  is `cs-unmet`, off the roster; only its pointer changed.
- **The marker pass**, the same files as spellingbee's: a note on a field or
  an argument is `//` (`lib/setup.ts`'s values, `unique_letters` among them;
  `lib/terminal.ts`'s input; `pdf/`'s model; `setupSummary`'s `board`; the
  edge function's `Setup`; `board.ts`'s three row types). The compete
  manifest's `labelFor` carried a `/**` inside the object literal.
  `board.ts`'s `validateCustomLetters` docstring sat above the `LetterFault`
  type with the same stale `//` block between them (a return shape the
  function does not have, and a `docs/supabase.md → Server errors` cite);
  the type and the function each have their own now.
- **The stale claims** — spellingbee's, each with its twin here, and this
  game's own. `lib/setup.ts` and `setup.psql`: `create_game` "REJECTS a
  `mode` field" (no such check). `manifest.ts`: "the shipped word list the FE
  scores locally" as an architectural decision to read up on, "strips
  `setup.mode`" (strips nothing), the picker "iff compete". `SetupForm.tsx`:
  "Coop: a short paragraph + the timer. That's it." (coop has *Win at*, the
  bands, the board constraint and the letters box), "Solid..Genius" against
  `TARGET_RANK_CHOICES` of 1..6, `value`/`onChange` and a cast to
  `WordwheelSetup` (it is `values`/`set` and `WordwheelValues`). `db.ts`: the
  view "conditionally exposes the hidden `required_words`" behind a grant
  that blocks it (both ship). `lib/setupSummary.ts`: "Order mirrors
  `SetupForm.tsx`" (the target rank sits after the bands here, before them
  there) and "fields take back" (one box). `lib/terminal.ts`: `rankLabel`
  named as still used, and "see the comment at the call site". `pdf/`:
  `wordColumns` (the body is `drawWordListBody`) and "required-but-missed"
  (bonus fold in). `lib/wheel.ts`: the box "a square SVG viewBox" with
  margin "for strokes / focus rings" (round boxes; nothing focuses). The
  edge function's header: step 7 "Return { id }" (it relays the envelope),
  the create_game call missing `mode`, the setup shape listed without
  `custom_center` / `custom_letters` / `unique_letters`, **PN197 as a
  `fault` and "this game has four" form-validations** (the code returns
  five `formValidation`s, PN197 on the form's own line — Step 3's note), and
  "~36.7k pool" (no count is stated now); `MIN_REQUIRED_WORDS_COUNT`
  "PROVISIONAL" (the old doc recorded it settled 2026-08-03) — and the SQL's
  twin, "Tune against the seed data's word_counts once the import has run".
  `board.ts`: `difficulty` "Kept for logging" (nothing in `index.ts` reads
  it; the fetch filters on it server-side, which the note now says). In the
  SQL: `create_game`'s header gave `E·CABDNO` (six letters, unsorted — it is
  `D·AEEGINNR`, the doc's real board, with the repeated letter noted),
  `bonus_words` as `[text, …]`, and "Reject reasons (all 'P0001' unless
  noted)" with two 42501 rows (every raise is a PN envelope; the list is now
  by kind, every one a fault but the custom-letters validation);
  `submit_word`'s header said the letters check is "src/wordwheel/lib/answer.ts
  and the shared word-hunt engine" (the tile check is `BoardCol`'s submit
  gate; the engine is `useFoundWordSubmit`) and listed "P0001 … P0002";
  `submit_timeout`'s said `outcome`, compete ends "'ended' (nobody reached
  the target)" (it writes `lost_compete`), "P0001 (which the FE swallows
  silently)" and "identical in shape to connections / psychicnum's";
  `end_game`'s said `status.outcome`, `ctx.menu.setGameItems` and "no
  intrinsic 'you won' terminal state in coop"; `replay_board`'s named a
  "Replay board" menu item and a `RestartButton`. The `games_select` policy
  said "The wordlists are gated separately at the column level + games_state
  view" (nothing is gated). The pgTAP headers: `compete_test`'s
  `'alreadyFound'` and `outcome=` ×2; `coop_target_test`'s "outcome
  'target'"; `gameplay_test`'s `alreadyFound` as a `result` (×4 with the
  section headers and the assertion label), "P0001; non-player 42501" and
  `outcome='timeout'`; `reveal_partition_test`'s "non-bonus required words"
  bucket (bonus fold in) and its list that "splits every word into two
  stylable buckets"; `replay_test`'s "Replay board" / `RestartButton`;
  `candidate_words_test`'s "see MEMORY: `db reset needs import`" (a memory
  file — now `gmake db-data ENV=local`, docs/cheatsheet.md); `useWordSubmit`
  ×3 (the engine is `useFoundWordSubmit`). `theme.css`'s "see docs/ui.md"
  for the two-vocabularies rule (docs/tokens.md — the opening reads' note).
- **The archaeology.** `wordwheel-ws` ×6 in the SQL (a port source this game
  never had — spellingbee's, carried by the fork); `submit_word`'s "the win
  used to be a `won: true` field"; the dup comment's "(Joel, 2026-09-01)";
  the SQL's and `schema_test`'s "no longer hidden" / "now" / "anymore" /
  "again" (six places); `candidate_words`' "Both bands are now";
  `create_game`'s "is a jsonb array … now"; `coop_target_test`'s "Coop used
  to have no win at all"; `create_game_test`'s "(NOW 8)";
  `custom_letters_test`'s "is now 8"; `schema_test`'s "now lives in
  common.words"; `Tile.module.css`'s "Hover used to DIM", "(It was a
  DARKENED FILL …)" and "exactly as it was when the whole thing was one SVG
  circle" (the split's note); `SetupForm.tsx`'s "Only the input shape
  moved"; `PlayArea.test.tsx`'s memory-file cite, "no longer picks between
  two callbacks", "which the conceded row used to" and "went from "End" to
  the full phrase"; the edge function's "Fix:" and its two "Joel's words,
  approved 2026-08-12 … verbatim from ERROR_COPY". Rule 3:
  `DEFAULT_WORDWHEEL_SETUP_COMPETE`'s "design conversation" pick, and
  `answerMessage`'s second paragraph (Step 4's note).
- **Not touched, on purpose:** the four e2e headers (`cs-unmet`, off the
  roster); `Help.tsx` (already short; its body's ⌥Z is UI copy); `todo.md`'s
  attributions; the two "common.end_game REPLACES status wholesale" comments
  (`todo.md` → Soon holds them, spellingbee's F-14); `useGame.ts`,
  `lib/spend.ts`, `lib/tiles.ts`, `InfoCol.tsx`, `Wheel.tsx`, `Tile.tsx`,
  `TypedWord.tsx`, `Wheel.module.css`, `PlayArea.module.css` and the lib
  tests, which needed nothing; `rank_idx_test` (blessed, rank-ladder's).

**Seen on the way and left for the findings**, none of it prose: the race
winner's confetti (F-1, Step 8's note); `InfoCol`'s unread `setup` (F-2,
Step 5's); Print's `rankIdx` recomputing `selfRankIdx` (F-3, Step 5's); the
edge function selects `difficulty` and never reads it, and synthesizes
`is_legal` as always-true — the `CandidateRow` field nothing reads
(spellingbee's pass saw the same); `todo.md`'s four Soon items. **Seen in
spellingbee, its area closed and blessed, and left:** its SQL still carries
the twins of four things fixed here — "Both bands are now", "is a jsonb
array … now", "alreadyFound (per mode rule", and the `games_select` policy's
"gated separately at the column level + games_state view".

**Verified:** `tsc -b` clean; eslint clean over `src/wordwheel/` and the
edge function; the game's unit tests and the guards green (42 files, 391
tests — `prosePaths` caught the migration's and the import script's six
pointers at the deleted doc, repointed); `deno test`, 15 green;
`gmake db-sql ENV=local` then `npm run test:db`, 182 files, 2656 tests,
PASS.

### The audit's read — 2026-09-24

**The READ is DONE.** Every roster file end to end, React, SQL and CSS
together: the manifest, `db.ts`, `useGame.ts`, the seven `lib/` files and
their five tests, the eight components and their three stylesheets,
`theme.css`, the printer, `PlayArea.test.tsx` and `SetupForm.test.tsx`,
`doc.md`, `todo.md`; the repeatable SQL file whole, the frozen migration,
`setup.psql` and all twelve pgTAP files, plus `rank_idx_test.sql` as
evidence; and the edge function's three files.

**The checks beside the files:** the shell commits since the area opened
(`ed8f81c4`..HEAD is this area's thirteen and nothing else — no commit under
`src/common`, `src/shared`, `common.sql`, `_shared/` or the docs the roster
cites); what `common.end_game`, `common.reset_game`, `common.concede`,
`_raise_game_deleted` and `_raise_game_over` do (`end_game` and
`update_state` MERGE the status, `reset_game` assigns it; the game-over helper
scopes itself to the two end RPCs by its own docstring, so `submit_word`'s
own PN357 for the same words is the sibling's shape too and is not raised
here); what `makeBeeGame` refetches (the found list; the header once);
`useFoundWordSubmit`'s contract, which is where F-15 turns — its `submit`
clears the word through its own setter, so nothing the game wired to
`onChange` runs on a submit; `WordEntryArea`'s `submitDisabled` (a per-value
veto the key and the button read together); `common/utils/shuffle.ts` (exists,
takes `Math.random` by default); every sibling answer spellingbee's audit
settled (its F-1 to F-17 and R-1 to R-5, each checked for a twin here — the
twins are F-1 to F-14 below; F-10 and F-12 have none, `submit_word` already
calling `_raise_game_deleted` and the narration ruled for both games); every
`doc → Section` pointer the roster cites (`prosePointers` green); and what
reads the per-player result keys (nothing but `won`, F-2).

What the game IS, for the record: the code held up where spellingbee's did,
and the fork's own mechanism — the claims, the spend order, the submit gate —
is where the read found something spellingbee's could not. The trusting-commit
split is clean end to end, the compete privacy rests on the same one policy
with its three arms pinned, the edge function's pure core is separated and
tested with the fit rule at its center, and the terminals say what they
should. What the read found is of four kinds: the four items `todo.md`
already held (F-1 to F-4, each a spellingbee ruling with a twin here); ten
more spellingbee twins the prose pass and the steps had noted (F-5 to F-14);
**two bugs in the claim mechanism, both proved with a scratch test and both
this game's own** (F-15, F-16); and one naming (F-17). Seventeen findings.
`todo.md` → Soon empties when F-1 to F-4 ship.

## Findings

*(`F-wordwheel-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### SHIPPED · F-wordwheel-1 · `leaderboard-four-times` · the compete leaderboard query is written out four times

**Joel, 2026-09-24: "i'll take your rec"** — the helper. `wordwheel._leaderboard
(target_game, required_score) returns jsonb`, `language sql stable`, beside
`candidate_words`, revoked from public with no grant: spellingbee's with the
schema swapped. The four sites are one assignment each; the win's two
redundant `coalesce`s went with its copy. The three re-keys into
`common.end_game`'s per-player shape stay inline (F-2 is theirs). The
`todo.md` → Soon entry is gone.

**Verified:** `gmake db-sql ENV=local`, then `npm run test:db`, 182 files,
2656 tests, PASS. **Planted** every score in the helper as 0: ONE case red,
`compete_test`'s mid-game score — spellingbee's plant turned three, because
its frozen-leaderboard cases came with its F-17, and this game's twin is
F-13's fourth bullet. The other three sites call the same helper, so its
content is pinned through the mid-game site, and a lost call would empty the
leaderboard, which `compete_test`'s entry-count checks catch. Restored.

From `todo.md` → Soon; spellingbee's F-11, ruled *"1 — the leaderboard
alone."* The subquery that sums each player's `found_words` into `{ user_id,
found_words_score, rank_idx, found_words_count }` appears in `submit_word`
twice (the win, with two redundant `coalesce`s, and the running update), in
`submit_timeout` and in `end_game`, the same `left join … group by
gp.user_id` each time. Options: **a helper**, `wordwheel._leaderboard
(target_game uuid, required_score int) returns jsonb`, `language sql
stable`, revoked from public with no grant, the four sites one assignment
each and the three re-keys into `common.end_game`'s shape staying inline —
spellingbee's helper with the schema swapped; or leave it. Recommendation:
the helper, as ruled there. `compete_test`'s mid-game score and the win's
leaderboard pin its content.

### SHIPPED · F-wordwheel-2 · `results-unread-keys` · the per-player results carry keys nothing reads

**Joel, 2026-09-24: "i'll take your rec"** — `{ won }` everywhere. The two
coop endings write `{ won: false }`; the three compete endings build each
result from the roster, `jsonb_object_agg(gp.user_id, {won})`, instead of
re-keying the leaderboard. `submit_word`'s leaderboard variable is
`status_leaderboard`, as in the other two (spellingbee's R-1 made the same
rename). `coop_target_test` pins a loss's result as exactly `{"won": false}`,
`compete_test` the winner's as exactly `{"won": true}`. The `todo.md` → Soon
entry is gone.

**Verified:** `gmake db-sql ENV=local`, `npm run test:db`, 182 files, 2658
tests, PASS. **Planted** an extra key on every result: both new cases red.
Restored.

From `todo.md` → Soon; spellingbee's F-16 (coop) and R-1 (compete), both
ruled. The coop endings — `submit_timeout`, `end_game` — write `{ won:
false, finished: true, team_score, team_rank_idx }` per player where the win
writes `{ won: true }`; the compete endings — `submit_word`'s win,
`submit_timeout`, `end_game` — write `{ won, found_words_score, rank_idx }`.
The app reads `result.won` and nothing else (`terminalOutcomeVerb`; no SQL
reads `result`). Options: **every result is `{ won }`** in both modes, the
three compete re-keys shrinking to a roster-built `jsonb_object_agg(user_id,
{won})`, with `coop_target_test` and `compete_test` pinning a result as
exactly `{ won }`; or leave them. Recommendation: `{ won }` everywhere, as
ruled twice there.

### SHIPPED · F-wordwheel-3 · `status-merges` · two SQL comments, a test comment and a test label say `common.end_game` replaces the status, and it merges

**Joel, 2026-09-24: "i'll take your rec"** — the prose, spellingbee's
wording. `submit_timeout`'s and `end_game`'s compete comments say the status
merges and the ending states its final tally anyway; `compete_test`'s comment
says what the club label and the OpponentStrip read off the terminal status;
`coop_target_test`'s label is *"the terminal status carries target_rank"*. No
code changed; the re-emission stays. The `todo.md` → Soon entry is gone.
**Verified:** `gmake db-sql ENV=local`, `npm run test:db` PASS; guards green.

From `todo.md` → Soon; spellingbee's F-14, ruled *"the prose."*
`common.end_game` merges (`coalesce(status, '{}') || end_game.status`).
Written when it replaced: `submit_timeout`'s and `end_game`'s compete
branches (*"common.end_game REPLACES status wholesale, so we must re-emit"*),
`compete_test`'s comment above its timeout assertions, and
`coop_target_test`'s label *"(end_game replaces status wholesale)"*. The
code is right either way; what keeps the re-emission is `common.end_game`'s
own header — a terminal write states what the ending adds, a final tally
among them. Options: **correct the prose** (each comment gives that reason;
the two tests lose the claim); or also drop the re-emission. Recommendation:
the prose, as ruled there.

### SHIPPED · F-wordwheel-4 · `two-shuffles` · two hand-written Fisher–Yates shuffles, one per side

**Joel, 2026-09-24: "i'll take your rec"** — both. The two private
`shuffled`s are gone. `BoardCol` imports `shuffle` from
`@/common/utils/shuffle`; the edge function imports it as
`'../../../src/common/utils/shuffle.ts'`, as `spellingbee-build-board` does.
The deleted docstring's reason for shuffling the centers (repeated boards on
one seed vary their center) moved to the call site as a comment. Same
algorithm, same `Math.random`, on both sides. The `todo.md` → Soon entry is
gone, which empties Soon.

**Verified:** `tsc -b` and eslint clean; wordwheel, the guards and
`common/utils`, 46 files, 419 tests green; `deno check` clean and `deno test`,
15 green. **Booted:** a POST to the local function with the anon key came back
as the function's own envelope (`PN112`, no club), so the cross-folder import
resolves at runtime. That probe returns before the center loop, so no board
was built. A follow-up plant (the import pointed at a missing file) took the
local edge-runtime container down rather than answering `BOOT_ERROR`; the file
is restored, and the container needs a restart.

From `todo.md` → Soon; spellingbee's F-6, ruled *"do both."* `shuffled` in
`components/BoardCol.tsx` and `shuffled` in the edge function's `index.ts`
are the same loop over `Math.random`, and `src/common/utils/shuffle.ts`
exports `shuffle` (a copy back, `Math.random` by default, no imports so an
edge function can load it by relative path). Options: **both call the shared
util** — the component by alias, the edge function as
`'../../../src/common/utils/shuffle.ts'` the way `spellingbee-build-board`
and `scrabble-ai-move` import — the edge function's docstring line about
varying the center moving to the call site; or leave them. Recommendation:
both, and `deno test` plus a boot probe to prove the cross-folder import
resolves, as spellingbee's did.

### SHIPPED · F-wordwheel-5 · `race-winner-celebration` · the race's winner gets no confetti

**Joel, 2026-09-24: "i'll take your rec"** — the same here. The gate is
`playState === 'won' || (playState === 'won_compete' && winnerId ===
session.user.id)`, `winnerId` moving up beside the hook that reads it; the
modal's body reads `targetRankIdx` and says *first* in a race.
`PlayArea.test.tsx` gains spellingbee's five celebration cases. `doc.md`'s
three statements of the rule and its Tests row, and `lib/terminal.ts`'s
docstring, say the rule now.

**Verified:** `tsc -b` and eslint clean; wordwheel and the guards green.
**Planted** the gate back to coop only (*"pops for the race I won"* red) and to
any `won_compete` (*"does not pop for a race somebody else won"* red).
Restored. No e2e run: `wordwheel-coop-win` exercises the coop half only.

(The local stack was restarted with Joel's leave after F-4's plant took the
edge runtime down; the database came back from its backup, pgTAP green, and
`wordwheel-build-board` answers its own envelope again.)

spellingbee's F-1 (Step 8's note), ruled *"do f1"* — and connections',
psychicnum's and wordle's before it. `useCelebration(playState === 'won')`
in `PlayArea.tsx` is coop only, and the comment says so as a fact with no
reason. The winner is on the common row as `winnerId`, so a gate that names
the race's winner is right on the first render, as `useCelebration`
requires. The modal's body reads `setup.target_rank ?? 6` directly, where the
derived `targetRankIdx` beside it is the same value. No test pins the
current behavior either way. Options: **the same here** — the gate becomes
`playState === 'won' || (playState === 'won_compete' && winnerId ===
session.user.id)`, `winnerId` moving up beside the hook, the body reading
`targetRankIdx` and adding *first* in a race, and `PlayArea.test.tsx`
gaining spellingbee's five celebration cases; `doc.md` says the rule in
three places and its Tests row, and `lib/terminal.ts`'s docstring in one;
or keep coop only with a comment that says it is a choice. Recommendation:
the same here, for the reason the four siblings gave.

### SHIPPED · F-wordwheel-6 · `unused-setup-prop` · `InfoCol` takes a `setup` it never reads

**Joel, 2026-09-24: "i'll take your rec"** — deleted: the member, the
pass-through in `PlayArea`, and the `WordwheelSetup` import. **Verified:**
`tsc -b` and eslint clean; wordwheel and the guards, 42 files, 396 tests green.

spellingbee's F-2 (Step 5's note), ruled *"delete it."* `InfoCol`'s props
type declares `setup: WordwheelSetup` under the setup disclosure, `PlayArea`
passes `setup={setup}`, and the component destructures only `setupRows`
beside it; the `WordwheelSetup` import has no other use. `PlayArea`'s own
`setup` stays (the setup rows, `hasBonus`, `targetRankIdx`, the celebration
body). Options: **delete it** (the member, the pass-through, the import), or
keep it for a reader nobody has named. Recommendation: delete it.

### SHIPPED · F-wordwheel-7 · `print-recomputes-rank` · the print handler works out the rank the component already has

**Joel, 2026-09-24: "i'll take your rec"** — the handler's `rankIdx` line is
gone and the coop header reads `selfRankIdx`; the printed header cannot
change. **Verified:** `tsc -b` and eslint clean; wordwheel and the guards, 42
files, 396 tests green. No unit test reaches the print handler; no e2e run.

spellingbee's F-3 (Step 5's note), ruled *"fix."* `PlayArea.tsx` computes
`selfRankIdx = currentRankIndex(foundWordsScore, game.required_words_score)`
in Derived; the print handler computes `rankIdx` from the same call with the
same two inputs, and only its coop header reads it. Options: **read
`selfRankIdx`** and drop `rankIdx`, or leave it. Recommendation: read it.

### SHIPPED · F-wordwheel-8 · `empty-letters-guard` · `BoardCol` guards against outer letters that cannot be empty

**Joel, 2026-09-24: "i'll take your rec"** — the `if (!outerLetters) return
[]` line is gone. **Verified:** `tsc -b` and eslint clean; wordwheel and the
guards, 42 files, 396 tests green.

spellingbee's F-4, ruled *"fix."* The `outerShuffled` memo opens with `if
(!outerLetters) return []`. `outerLetters` is `game.outer_letters`, `char(8)
not null` in the migration, typed `string`, off a row the loader has already
held the surface for; `create_game` refuses anything but eight lowercase
letters, and `Array.from('')` is `[]` anyway. Options: **delete the line**,
or keep it as a defense. Recommendation: delete it; a guard for a state the
column forbids tells the reader that state exists.

### SHIPPED · F-wordwheel-9 · `ungated-hover` · a tap leaves a tile raised on a touchscreen

**Joel, 2026-09-24: "i'll take your rec"** — gated. The two hover rules sit
inside `@media (hover: hover)` in `Tile.module.css`, with spellingbee's
comment; `:active` and the reduced-motion block stay ungated.
`common/mobile/todo.md`'s `:hover` question lists wordwheel's tiles among the
gated now.

**Verified:** `vite build` emits `@media (hover:hover){…tile…:hover{z-index:1}
…:hover …face{…}}` with `:active` after it, outside; wordwheel and the guards,
42 files, 396 tests green. jsdom evaluates neither media queries nor
`:hover`, so no unit test sees it. **Checked on a device by Joel,
2026-09-24: "f9 works."**

spellingbee's F-7, ruled *"gate it."* `.tile:not(.used):not(.inert):hover`
and its `.face` rule in `Tile.module.css` lift the face and lighten its
shadow; a touchscreen keeps `:hover` on the last element tapped, so after
every letter one face stays raised. `common/mobile/todo.md`'s `:hover`
question lists wordwheel's board among the ungated (Step 1 checked it).
spellingbee and strands wrap the rule in `@media (hover: hover)`, the gate
`docs/ui.md` → Button iconography uses for tooltips; `:active` stays
ungated (a press ends when the finger lifts), and so does the reduced-motion
block (its `transform: none` is a no-op on a face that no longer lifts).
Options: **gate the two hover rules**, and take this game's name off the
shared item in `common/mobile/todo.md`; or leave it. Recommendation: gate
it, and look at it on a phone.

### SHIPPED · F-wordwheel-10 · `unread-fetch-fields` · the board builder carries two fields nothing reads

**Joel, 2026-09-24: "i'll take your rec"** — both dropped. `is_legal` left
`CandidateRow`, the fetch's mapping and `board_test.ts`'s rows, and the type's
docstring says every row is legal by construction (spellingbee's wording).
`difficulty` left `fetchPangrams`' select (the `.lte('difficulty', …)` filter
stays), `PangramRow` with its "Not read here" comment, and the test's pool
rows.

**Verified:** `deno check` clean on `index.ts` and `board_test.ts`; `deno
test`, 15 green; the local function boots (a POST answers `PN112`, its own
envelope). No board built; no e2e run.

spellingbee's F-8, ruled *"do it"*, plus one of this game's own.
`fetchCandidateWords` in `index.ts` adds `is_legal: true` to every row,
`CandidateRow` in `board.ts` declares it, `board_test.ts`'s rows set it, and
no line in `board.ts` reads it — `candidate_words` already filters to the
legal band. And `fetchPangrams` selects `difficulty` from the pool, the
`.lte('difficulty', …)` filter having already used it server-side;
`PangramRow` declares it, `board_test.ts`'s pool rows set it, and nothing
reads it (the prose pass corrected its "Kept for logging" to say so).
Options: **drop both** — `is_legal` from the type, the mapping and the test
helper, with a docstring saying the rows are legal by construction;
`difficulty` from the select, the type and the test rows — or drop one, or
leave them. Recommendation: drop both; `deno check` makes a reader of either
a type error.

### SHIPPED · F-wordwheel-11 · `help-text` · the Help modal promises a pangram a custom board need not have, and omits bonus words and the modes

**Joel, 2026-09-24: "i'll take your rec"** — the rewrite, in the words shown
him. The pangram line says a random board always has one and hand-picked
letters may not; a paragraph on bonus words (the dot, a score past the total);
a paragraph on the two modes, *Coop:* and *Compete:* in bold; this game's tile
and center lines kept; the default height 500. The docstring says what the
modal covers and that one text serves both modes. **Verified:** `tsc -b` and
eslint clean; wordwheel and the guards, 42 files, 396 tests green. No test
reads the Help copy; not looked at on screen.

spellingbee's F-13, ruled *"1"* — the rewrite. `Help.tsx` says of the
pangram *"Every board has at least one."* True of a random board (grown from
a nine-letter seed), false of a custom one: the player's letters need only
yield one required word. The modal also says nothing about bonus words (the
dot, and why a score can pass the maximum), the target rank, or what a race
is. spellingbee's body is the shape: the pangram line made true, a paragraph
on bonus words, a paragraph on the two modes with *Coop:* and *Compete:* in
bold, the default height 500. This game's own lines — the tile used at most
once, the purple center — stay. Options: **rewrite the body** the way
spellingbee's was, the words shown before they ship since it is UI copy; or
fix the false sentence only. Recommendation: the rewrite.

### SHIPPED · F-wordwheel-12 · `small-shapes` · code that says a little more or less than it does

**Joel, 2026-09-24: "i'll take your rec"** — five, with the Tile item narrowed:

- **PN183** reads *"BUG: legal difficulty of % with required at %"*.
- **The band casts are caught**, each in its own `begin … exception when
  invalid_text_representation`: **PN505** (required) and **PN506** (legal),
  the guard's next-free numbers. `create_game_test` gains the two
  not-a-number refusals (`"three"`, `"5.5"`).
- **The dead branches are gone**: `submit_timeout`'s compete ending is plainly
  `lost_compete` (its comment says `create_game` refuses a race without a
  target), and the compete `labelFor`'s `ended` arm is `Ended · nobody reached
  "…"` with a line saying the clock is `lost_compete`'s. No test reads
  `labelFor`.
- **`Tile`**: only the unreachable `cursor: default` left `.tile.used`. The
  `onClick={disabled ? undefined : onClick}` gate STAYS — the recommendation
  as presented, differing from the finding: jsdom does not honor
  `pointer-events`, so the JS gate is the half of the rule a test can see.
- **`ordinals`** is exported from `lib/spend.ts`; `Wheel` reads it as
  `tileOrdinals` in place of its inline copy.

**Verified:** `gmake db-sql ENV=local`, `npm run test:db`, 182 files, 2660
tests, PASS. **Planted** each catch on the wrong exception: `create_game_test`
dies on the bare `invalid input syntax for type integer` (`"three"`, then
`"5.5"`), which is the finding. Restored. `tsc -b` and eslint clean;
wordwheel and the guards, 42 files, 396 tests green.

spellingbee's F-16, ruled *"do it"* — its four have twins here — and two of
this game's own:

- **PN183's message** reads *"BUG: legal difficulty of % below the required
  % "* — a trailing space, and wrong when the legal band is above 6, which
  the same raise also catches.
- **The band casts are unguarded.** `(setup->>'required')::int` and `legal`
  raise a bare 22P02 on a non-number and escape the envelope as a crash,
  where `target_rank`'s identical cast is caught and becomes PN180. The
  dialog never sends one, so this is shape; spellingbee's took two new
  codes from `raiseCodes.test.ts` rather than reusing.
- **Two dead branches**: `submit_timeout`'s compete `case when
  current_target_rank is not null then 'lost_compete' else 'ended'` (a race
  always has a target; `create_game` refuses one without), and the compete
  `labelFor`'s `ended` arm checking `reason === 'timeout'`, which a compete
  game cannot reach (`docs/game-status-labels.md` already shows only
  `Ended · nobody reached`).
- **`Tile` gates the click twice.** `onClick={disabled ? undefined :
  onClick}` sits under `.tile.used { pointer-events: none }`, which already
  takes the click; and that rule's `cursor: default` is unreachable, since
  a box with no pointer events never shows a cursor of its own.
- **`Wheel` recomputes the ordinals.** `Wheel.tsx` derives each tile's
  ordinal among same-letter tiles inline, in a block, and `lib/spend.ts`
  has the same loop as its private `ordinals`. One export, two readers.

Options: **fix all six**; or pick. Recommendation: all six.

### SHIPPED · F-wordwheel-13 · `test-gaps` · rules nothing exercises

**Joel, 2026-09-24: "i'll take your rec"** — all four, spellingbee's F-17
assertions with this game's names and numbers:

- **A conceder cannot submit** — `concede_test` asserts PN358.
- **The realtime touches**, read off `ctid`: `gameplay_test`'s timeout and
  manual end, `concede_test`'s last concede (and a non-final concede NOT
  touching), `replay_test`'s `games` row.
- **The frozen leaderboard** — `compete_test`: the winner's entry `24/3`
  (Nice), a rival's score as it stood (1).
- **New game drops the custom letters** — a `PlayArea.test` case from a
  hand-picked setup. `doc.md`'s Tests row had already claimed this case; it
  exists now.

`doc.md`'s four pgTAP rows say what their files now pin. The two tests F-15
and F-16 need ship with them.

**Verified:** `npm run test:db`, 182 files, 2668 tests, PASS; PlayArea.test
54 green. **Planted**, one at a time, each red on exactly its own case: each
of the four touches commented out; the concede touch made unconditional (the
non-final case); the conceded gate made never-true; the helper's scores
zeroed (the mid-game case and both frozen cases — three, as spellingbee's);
New game keeping the letter keys. All restored.

spellingbee's F-17, ruled *"fix"*, four twins here — plus the two tests
F-15 and F-16 need, which ship with them:

- **A conceder cannot submit** (PN358). `doc.md` states it twice as the
  reason a conceder cannot win; `concede_test` never submits after a
  concede.
- **The realtime touches.** `submit_timeout`, `end_game` and the last
  `concede` update every `found_words` row in place, and `replay_board` its
  `games` row; the three headers call them load-bearing and nothing asserts
  them. Read off `ctid`, not `xmin` (a pgTAP file is one transaction).
- **New game drops the custom letters.** `createNewGame` strips both keys;
  the `PlayArea.test` case starts from a setup with none, so it cannot tell.
- **The frozen leaderboard.** A win freezes it "as it stood"; `compete_test`
  checks the mid-game one and the winner's id, not the final entries.

Options: **write all four** (three pgTAP, one Vitest), each planted to prove
it can fail; or pick. Recommendation: all four.

### SHIPPED · F-wordwheel-14 · `stale-claims` · sentences on the roster that survived the prose pass

**Joel, 2026-09-24: "i'll take your rec"** — all of them, the migration's
three included, in the wording shown him:

- **`lib/setup.ts`**: the bands paragraph says a narrow `required` can leave
  no board with 15 required words, refused under that field; `legalError`
  and `customLettersError` return an error under their field or `{}`;
  `wordwheelSetupError` has spellingbee's wording.
- **`theme.css`**: *"per-game now"* → *"per-game"*.
- **The fixtures**: *"outer `cabdfg`"* → `cabdfghi` in `PlayArea.test.tsx`
  and `answer.test.ts`.
- **pgTAP**: `gameplay_test`'s five 42501 / P0001 labels name the race or
  PN253; its sections run (1)–(13) and the header lists them by section (the
  old header's *"leaderboard populated"* and *"during play"* claimed what the
  file never checked, and went with it); `replay_test`'s comment names PN253;
  `schema_test`'s two; `create_game_test`'s header lists what the file checks,
  adds *4b. The word bands*, and names what is not pinned.
- **The applied migration**: the bands are the setup's (3 / 5 by default),
  the hook is `useFoundWordSubmit`, the center is the purple tile. Comments
  only — no SQL line changed.

**Verified:** `npm run test:db`, 182 files, 2668 tests, PASS; `tsc -b` and
eslint clean; wordwheel and the guards, 42 files, 397 tests green.

**Left, and said:** spellingbee's `lib/setup.ts` keeps the same *"or
`null`"* in `legalError` and `customLettersError`; that area is closed.

The read's case, as it was spellingbee's (its F-15): these are in bodies
and labels the prose pass, reading headers, did not reach.

- **`lib/setup.ts`**: *"The board pool is selected so the pangram is
  gettable at the required band … so any choice is solvable"* — PN195 and
  PN198 exist because a narrow band can starve the builder;
  `wordwheelSetupError`'s docstring says the manifest *"shows the returned
  string and disables Start until it's `null`"* and `legalError`'s /
  `customLettersError`'s say *"or `null`"* — all three return `FormErrors`
  (`{}` when fine).
- **`theme.css`**: *"Only the TEXT color is per-game now"*.
- **`PlayArea.test.tsx`'s `loadedGame` and `answer.test.ts`'s header**: the
  wheel is *"outer `cabdfg`"* — six letters; the fixture is `cabdfghi`.
- **pgTAP**: `gameplay_test` — five labels naming *"42501"* / *"P0001"* for
  PN253 / PN357 / PN486, three sections numbered *(10)*, and the header's
  list numbered apart from its sections; `replay_test` — *"42501 =
  common.require_game_player's 'not-a-player|'"* (PN253); `schema_test` —
  *"to exercise the conditional-exposure case"* and *"outer_letters is
  char(8) now"*; `create_game_test`'s header OVERCLAIMS — it names
  `is_current_view`, the center's shape, the outer alphabet and
  `target_rank`'s range, and asserts none of the first three and only the
  range's top (the same overclaim spellingbee's R-2 found).
- **The frozen migration** keeps its *"useWordSubmit"*, *"band <= 3"* and
  *"the red center circle"*. An applied migration's comments may be
  corrected, and the prose pass repointed this one's doc pointers on Joel's
  own precedent (`f2d5ff34`), so these three are in scope on the same
  ground, and listed here rather than left.

Options: **fix them all** in one sitting; or leave them. Recommendation: fix
them all, the migration's three included.

### SHIPPED · F-wordwheel-15 · `claims-survive-submit` · a clicked tile's claim outlives the word it was clicked for — a BUG

**Joel, 2026-09-24: "i'll take your rec"** — cleared in `onAnswer`. The
claims state moved above the `useFoundWordSubmit` call, whose `onAnswer` now
opens with `setClaims([])` and a line saying why; `handleChange`'s comment no
longer lists the submit's clear and says `onAnswer` drops the claims instead.
Checked before building: `onAnswer` runs synchronously inside `submit` on
every path after the clear, the accepted one included (optimistic, before the
commit), so it cannot wipe a click made for the next word. `doc.md`'s rule
says a claim holds for its word only, and the Tests row names the new case.

**Verified:** a `PlayArea.test` case — click the outer E, type `bad`, Enter,
type `e`: the center is spent, the outer E is not. **Planted** the
`setClaims([])` line out: that case red, the bug reproduced. Restored. `tsc
-b` and eslint clean; wordwheel and the guards, 42 files, 398 tests green.

**Proved with a scratch test, then deleted.** Click the outer E on a wheel
whose center is also E, type the rest, press Enter (the word is refused or
accepted; either clears the box), then type a bare `e`: the OUTER E marks,
where the rule says a typed letter spends the center.

The engine's `submit` clears the typed word through its own `setWordState('')`
(`useFoundWordSubmit.ts`), never through the `onChange` the game wired, so
`BoardCol`'s `handleChange` — whose comment says the box clearing on submit
trims the claims — does not run on a submit. The claims array keeps every
click from the last word; the next keystroke's `trimClaims` keeps any whose
letter the new word has, and `spentTiles` honors it first. `lib/spend.ts`'s
docstring (*"a click is recorded as a CLAIM … and the claims are honored
first"*) and the `PlayArea.test` case *spends the tile you CLICKED* are
both true within one word; nothing types a second word after a click.
Options: **clear the claims in `onAnswer`** — every submit passes through it
once, after the engine has cleared the word — with a `PlayArea.test` case
(click the outer E, submit, type `e`, the center is spent); **derive** the
honored claims at render as `trimClaims(claims, word)` (not enough on its
own: a stale older claim still ranks before a fresh click, since `trimClaims`
keeps in order); or **route the engine's clear through `onChange`**, a
shared-hook change for one caller. Recommendation: clear in `onAnswer`, and
`handleChange`'s comment says the submit path is that line.

### SHIPPED · F-wordwheel-16 · `refusal-ignores-claims` · a refused word's tiles are picked by render order, not by the tiles the word spent — a BUG

**Joel, 2026-09-24: "i'll take your rec"** — the mark carries the CLAIMS, not
the tile indices this finding first recommended: the mark stays up for
`WORD_ANSWER_MS` with Shuffle live, and an index would then point at a seat
holding a different letter, where a claim's ordinal survives the shuffle (the
reason claims exist). `onAnswer` keeps the word's claims before F-15's clear
and passes them on the mark; `Wheel` picks the answered tiles with
`spentTiles(letters, counts, claims)`, as it picks the spent ones. The
mark's type gains `claims`; both comments say what it carries. `doc.md`'s
Tests row names the case.

**Verified:** a `PlayArea.test` case — click the outer E, type `bd`, Enter:
the outer E answers and the center does not. **Planted** the `[]` back: that
case red, the bug reproduced. Restored. `tsc -b` and eslint clean; wordwheel
and the guards, 42 files, 399 tests green.

**Proved with the same scratch test.** Click the outer E, type `bd`, Enter:
`EBD` is too short, and the CENTER E shakes and wears the answer, though the
outer E was the tile in the word until the moment of submit.

`BoardCol`'s `onAnswer` hands `useMark` only the word's letter counts;
`Wheel` then picks the tiles with `spentTiles(letters, counts, [])` — no
claims — so a twin that was clicked answers on its sibling. `doc.md` →
Frontend says the tiles *"it would have spent"* shake, and the case *fills
one tile per use of a letter, never both twins* passes because it types the
letter. `BoardCol` has everything at `onAnswer` time to say which tiles:
`claims`, the counts and `outerShuffled` (the render order). Options: **the
mark carries the tile indices** — `onAnswer` computes `spentTiles([center,
...outerShuffled], counts, claims)` and `Wheel` reads the set straight off
the mark (computed before F-15's clear, if both ship); or **leave it**, twins
being identical tiles. Recommendation: the indices — the board's own rule
for a click is that it answers the question that was asked, and a refusal
is the same question a beat later. A `PlayArea.test` case: click the outer
E, refuse, the outer E shakes and the center does not.

### SHIPPED · F-wordwheel-17 · `tile-spent-naming` · one tile state, four names

**Joel, 2026-09-24: "i'll take your rec"** — `spent` throughout: the `Tile`
prop (`spent?: boolean`, its comment already stating the rule), `Wheel`'s
`spent={spent.has(i)}`, the class `.spent` in all eight selectors, the handle
`data-spent`. The finding's "eight test sites" were 25 in `PlayArea.test`
(F-15 and F-16 added some) plus one reading the class name (`_used_`), found
when it went red; no e2e spec reads either. The test's own comments stopped
saying *enabled* / *disabled*, and the stylesheet's *"a spent one is inert"*
says *"takes no input"*, since `.inert` is the read-only state. spellingbee's
hex keeps `used`: its letters are reusable, so the difference is deliberate.

**Verified:** `tsc -b` and eslint clean; wordwheel and the guards, 42 files,
399 tests green; `vite build` emits `._spent_…`.

A tile the typed word is spending is `disabled` (the `Tile` prop),
`.used` (its class), `data-disabled` (its test hook) and *spent* (`doc.md`,
`lib/spend.ts`, the token `--tile-spent-edge-color`, every comment). The prop
name already produced one false docstring (Step 8's *"once this tile's
letter is already in the typed word"*), and `disabled` is the word the shared
`.tile:disabled` uses for the read-only state this component calls `inert`.
Options: **rename to `spent`** — the prop, the class (`.spent`), the hook
(`data-spent`), and the eight test sites that read `data-disabled`; or leave
it. Recommendation: rename; the name should carry the rule the docstring
has to keep restating.

### What checked out

The multiset is threaded consistently: `tileCounts` / `fitsTiles` in the
builder, `wordFitsWheel` at the submit gate, `TypedWord`'s per-character
count and `spentTiles`' per-letter spend all agree, and the pgTAP dup-board
fixture and the Deno tests pin the same rule from both ends. The
`unique_letters` path — form key, edge-function filter, PN196 under the
checkbox, saved with the default, ignored for custom letters — is complete
and its refusal test lands where the doc says. `candidate_words` stays a set
test and the test that pins that boundary holds. The five edge-function
refusals are each under the right field, PN197 on the form's own line
included. The read-only board (the engine move's `readOnly`) is one flag end
to end.
`narrateRankClimbs`' double narration at a race's end was ruled no change at
spellingbee's F-12 for both games. The `_raise_game_over` helper's docstring
scopes it to the two end RPCs, so `submit_word`'s own *Game over* (PN357) is
consistent with spellingbee and not raised. `wordwheel.pangrams.word_counts`
is written by the import and read by nothing in the app (the migration says a
future gate may filter on it); data stays. The builder's worst case — 25
seeds × up to 9 centers, each a `candidate_words` round trip before PN198 —
is the same shape as spellingbee's 25 × 7 and has not been seen to bite.
`PlayArea.module.css`'s claim that all three found-words games reserve 24rem
is true (boggle's and spellingbee's are 24rem).

## Pass 3 — tile-feedback

Read 2026-09-24 against `plans/tile-feedback.md` and spellingbee's pass 3
(`673bf142`, and the per-hex shake `dce68b6d`). **The board held up**, most
of it settled at spellingbee's pass, which ruled for both bee games. Already
true, and left alone: T-1's khaki spent edge and its reason in the comment;
T-2's `--verdict-edge` on the answered face; T-3's `warning` and lifetime
cases in `PlayArea.test`; T-5's purple center as a BRAND token; each tile
shaking on its own, both grain lists already saying so; a finished or
conceded board inert with no spent edges (`typedCounts` empties when read
only); restart a remount (`GamePage` keys on `restarts`).

- **RULED — NO · A · `own-tile`** — *"no, it'll be to confusing to use a class
  and just override everything."* The face is a CSS box, so unlike the hex it
  COULD compose `.tileFace`, but a circle inset in its seat would override
  width, height, padding, radius, border width and font. It keeps its own box;
  `Tile.module.css` says which shared values it takes, and the plan's
  own-tile table and wordwheel section record it as a choice.
- **SHIPPED · the plan** — wordwheel's roster row at **tf2**; the count line
  at 6 of 16 (it read 4 — codenamesduet's tf2 on 2026-09-23 had never been
  counted); the section marked tf2, its spend sentence naming the clicked
  twin (F-16), and an own-tile paragraph; the packed-boards hover section says
  wordwheel's circles need no brightening, each face sitting inside a mustard
  ring, and no longer calls them hexes.
- **SHIPPED · `hover-comment-orphaned`** — `Tile.module.css`'s "the piece
  rises while its shadow falls away … `z-index` is on the SEAT" sat above
  `.inert`, away from the rule it explains; it now heads the hover gate with
  F-9's sentence.

**Seen, and left:** `docs/ui.md` → Interactive tile states still describes
selection as a dark fill and hover as a ring (spellingbee's pass noted it too);
not this area's.

**Verified:** wordwheel and the guards green; `vite build` clean. No behavior
changed.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/wordwheel.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

**E2E after F-1 to F-17, 2026-09-24** (Joel: "run the related e2e"): the four
wordwheel specs — `wordwheel`, `wordwheel-coop-win` (2), `wordwheel-mobile`
(2 viewports), `wordwheel-print` — 6 passed, 12.1s. None broke.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordwheel.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [x] the tile-feedback pass done, and the game's tf level updated there (tf2, 2026-09-24)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
