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
the todo, roster all the same.

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
