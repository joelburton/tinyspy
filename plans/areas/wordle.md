# Area: wordle

**Brand: WordNerd.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordle/todo.md`, not here.

**Status: OPEN** (2026-09-22). **Pass 1, the restructure, is DONE** (Steps
0–8). **Pass 2, the audit, is IN PROGRESS**: the prose pass shipped
(`39ec69c5`) and the five findings the todo and that pass raised are answered —
F-1, F-3, F-4 and F-5 shipped, F-2 ruled back to `game-page`. **The roster
READ is done (2026-09-22, below) and recorded twelve more, F-6 to F-17**:
eight with a decision in them, four prose, tests and small shapes. **All eight
decisions are answered** (2026-09-22): F-6, F-7, F-8, F-10 and F-11 shipped,
F-9 and F-12 ruled no-change (F-12 opened `plans/spectating.md`), F-13 ruled
pass 3's. **F-14 to F-17, the prose pass, SHIPPED the same day** — pass 2 is done bar the
closing re-read. Next: pass 3, tile-feedback (F-13's `useMark` conversion goes
with it), then the closing re-read.
`src/wordle/todo.md` is empty. Then pass 3, tile-feedback, then the closing
re-read.
**Three passes back to back**, psychicnum's and connections' shape:
restructure → audit → tile-feedback.

## The roster

Agreed with Joel 2026-09-22, `cs-met-wordle` — **44 stamped files** at the
opening, 46 with Step 6's two:

| where | how many | note |
|---|---|---|
| `src/wordle/` | 32 | nine arrived `cs-fixed-outcome-fix` — that area ruled its files belong to their own area, which is this one; **`lib/terminal.ts` + `.test.ts` created by Step 6** (2026-09-22) and stamped with the rest |
| `supabase/migrations/` | 2 | `20260625000000_wordle.sql`, `20260917000001_wordle_events.sql` |
| `supabase/sql/wordle.sql` | 1 | also `cs-fixed-outcome-fix` |
| `supabase/tests/wordle/` | 12 | every pgTAP file but one, and `setup.psql` — the fixture was `cs-unmet` at the opening and joined at F-16 (2026-09-22) |

**`src/shared/wordle-style/tileColors.module.css` was created by this area**
(2026-09-22, the judged-tile-colors move below) and is the 47th: it lives in a
CLOSED folder, but a file nobody has read is not blessed by the folder around
it, so it carries `cs-met-wordle` — the open area that wrote it is the one
coming for it.

`src/wordle/logo.svg` has nowhere to put a stamp (step 11's); `todo.md` is
markdown and carries none. **`src/wordle/doc.md` was written at Step 3**
(2026-09-22), markdown like the todo, roster all the same; `docs/games/wordle.md`
is deleted into it in pass 2, as psychicnum's and connections' docs were.

### What is NOT on it

- **`supabase/tests/wordle/colors_test.sql`** — `cs-blessed-wordle-style` since
  earlier the same day. It pins `common.wordle_colors`, the shared algorithm,
  not anything of wordle's, the way `pdfTiles.ts` stayed `pdf`'s. **Read here
  all the same** (Joel: *"you should still read it"*), as evidence.
- **`src/wordle/lib/colors.ts`'s PLACE** is settled rather than open:
  `wordle-style` ruled that `colorRank`'s two call sites are both wordle's and
  it stays here. The file IS on this roster; what is settled is that it does
  not move.

## The three passes

Joel, 2026-09-22: *"we're going to the same three-passes as we did for
psychicnum and connections."* Read from `plans/areas/psychicnum.md` and
`plans/areas/connections.md`; connections' eight steps are psychicnum's six
with the `doc.md` skeleton and the `AnswerMessage` conversion moved earlier,
and this game follows the eight.

1. **The restructure** — [playarea-readability.md](../playarea-readability.md)
   step by step, each step ONE COMMIT Joel reads. It goes first because the
   audit's prose pass would otherwise polish comments this rewrites or deletes.
2. **The audit** — React, SQL and CSS together, findings recorded below.
3. **tile-feedback**, against [tile-feedback.md](../tile-feedback.md).

The shape the first two games settled is
[docs/playarea.md → The shape of a game's PlayArea.tsx](../../docs/playarea.md);
this game conforms to it, and where it cannot, this file says why.

## The restructure — plan

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is a behavior-preserving
no-op unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-22

Run on the untouched tree with the roster stamped `cs-met-wordle` (Joel:
*"do step 0; you can run the e2e"*):

- `tsc -b` clean; lint clean over `src/wordle/`.
- The game's unit tests and the guards: 38 files, 369 tests, green.
- pgTAP, the whole suite: 181 files, 2545 tests, PASS — wordle's eleven among
  them.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed.
- wordle's four e2e specs: 5 tests, green in 7.6s (`wordle-history`,
  `wordle-keyboard`, `wordle-mobile` at two sizes, `wordle-print`).

**A later red is the step's.**

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-22

What the four sources held, and what moved.

**`docs/games/wordle.md` → Deferred had two items. One was already done.**
*"`wordle-keyboard.e2e.ts` reads a token that no longer exists"* — line 162
calling `token('--ink-on-dark-color')`, which resolves to nothing. Fixed
**2026-09-02** in `63069900`, and the spec now reads `--ink-onDark-color` with a
comment naming the trap (*"An undefined custom property does not throw"*). It
also passed in Step 0. **Deleted rather than moved**, which is what the register
is for: a shipped item left in a Deferred list reads as work for three weeks.

**The other item moved OUT of this game.** *"Stop HIDING the keyboard at
terminal; dim it instead"* — reversed 2026-08-17 after a real lost game, on the
grounds that the keyboard is where the alphabet's state lives and hiding it
removes that summary at the moment you want to study it. It went to
`src/shared/onscreen-keyboard/todo.md`, not `src/wordle/todo.md`, by the sorting
key `docs/deferred.md` states: *the file you'd edit to do the work*, which is
that folder's stylesheet. A judgment call, and cheap to reverse.

**Two consequences worth recording, because they are about work done HOURS
earlier today:**

- **`onscreen-keyboard` closed this morning without seeing this deferral**, and
  could not have: it was filed under a consumer's game doc, and the shared
  folder's own `todo.md` was empty. That is the gap `deferred.md`'s sorting key
  exists to prevent, and it took a game area to find it.
- **That area's F-2 made the deferral bite twice as hard.** wordiply used to
  UNMOUNT its keyboard at terminal; it now passes `gameOver` and hides it, which
  was the right fix for the reflow and is the wrong end state for the readout.
  The two games now share one treatment, which is exactly what the item wants
  before it is changed. The folder's `doc.md` said the withdraw was settled and
  now says only the BOX is.

**`docs/deferred.md`'s per-game index did not list wordle at all**, under a
table headed *"Only these games have open items today; the rest have none"* —
while the doc carried two. It has a row now, pointing at `src/wordle/todo.md`.

**`plans/tile-feedback.md` cited `wordle.md → Deferred`** for the item that
moved; repointed.

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-22

The shape psychicnum settled and connections confirmed: `PlayAreaLoader` owns
`useGame` and the three gates — `<Loading>`, `<EnvelopeErrorPage>`,
`<NoSuchGamePage>` (its `detail` names the read that came back empty,
`rows=0 view=wordle.games_state`, since this hook reads the view and not the
table) — and hands `PlayArea` a non-null game, the player states, the guess log
and a narrowed `setup`. The cast happens once, in the loader's JSX; the inner
component takes `setup: WordleSetup` through `Omit<GamePageCtx, 'setup'>`. The
manifest's lazy line names the loader; the test file mounts it at all 51 sites,
`useGame` mocked exactly as before.

**What went with it**, all in this commit: six `game?.` reads, `game?.mode ??
'coop'`, `game?.max_guesses ?? 6`, the `gameMode` variable and its three
readers, `if (!gameMode) return // menu exists pre-load`, `if (!game ||
!gameMode) return` inside Print's run, the three `setup as WordleSetup` casts
and the `wordleSetup` local, and the inline `<p>Loading game…</p>` and
`<p>Game not found.</p>`. Every mode read is `mode` now, bound once at the top
from a row that cannot be null.

**Two `todo.md` items are closed by construction** and deleted there: the
`<Loading>` swap (Someday), and the Bug that `act-new-game` answered `active`
before the row had loaded — the component it lives in does not render until the
row is in hand, so `describe: () => 'active'` is now true rather than optimistic.

**One behavior change, stated now**, the same one both earlier games made:
while the read is out the header menu has no game rows and `+` does nothing,
where before the rows were published pre-load and `+` asked the new-game
question and then could not act. That IS the bug above; the split is its fix.

**Caught by the net rather than by reading:** the setup-recap memo still listed
`game` in its deps after its body stopped reading it, which lint called as a
missing `mode`. Step 0's lint was clean, so the warning was this step's — the
deps are what the body reads now.

Verified: `tsc -b` clean, lint clean over `src/wordle/`, 369 unit tests and the
guards green. The e2e specs have not run for this step.

**`src/wordle/todo.md`'s remaining items are unchanged.** It already held two bugs (the reject ring
reading the previous refusal's outcome; `act-new-game` answering `active`
pre-load), three Soons (the hand-tuned `--avail-h`, the action row's branches,
no whole-table stop for a race) and one Someday (the `<Loading>` swap). Three of
those are the restructure's own work: Step 2 closes the `<Loading>` swap, Step 5
the action row, and `act-new-game`'s pre-load answer goes with Step 2's split.

### Step 3 — the `doc.md` skeleton, with the RPCs and FE submissions written — DONE 2026-09-22

As connections' `d9b5a1c0`: `src/wordle/doc.md`, seven headings, with the
lede, a short intro (three things that are high-level about this game: the
frontend never learns the word while the game runs, a guess can come back
without costing anything, and what separates the modes is what each player
can see), the RPCs and the FE submissions written from `supabase/sql/wordle.sql`
and the call sites — not from the old doc — and Game rules, Schema, Frontend
and Tests marked owed to pass 2. The RPC section is the `ok` answers only, per
Joel's ruling at psychicnum; a refusal that is part of the story is a clause
without a code. **One departure from the two earlier docs, on purpose:** the
intro's paragraphs open in plain prose, not bold, which is the rule
`docs/common-folders.md` states and `folderDocs` guards; psychicnum's and
connections' intros open with bold and are pass-2 material there, not here.
The guards are green with the file in place (31 files, 285 tests).

**Written against the code, and where the old doc and the code's own words
disagreed:**

- The old doc's RPC line says `submit_guess` returns `invalid` "gone from the
  payload", lists the not-ok codes, and describes the coop-only turn wiring in
  the same sentence as the answer shapes. The new section says what an `ok`
  carries, by `result`, and nothing else.
- The old doc's title table says a terminal game titles "the winning guess";
  read from `_sync_title`, a LOST game titles its last guess too — the answer
  appears only when the last guess was the win. The doc says that.
- **`manifest.ts` claims the RPC enforces compete's two-player minimum**
  (*"Lower bound 2; the RPC enforces it"*). It does not: `wordle.create_game`
  checks the maximum (`require_player_count_max(…, 6)`) and the mode's
  spelling, and `common.sql`'s own header says the sizing rules "stay
  per-gametype". The doc says the minimum is the manifest's rule. The false
  comment is pass 2's (a stale-claims finding, as connections' F-12 was).
- `submit_guess`'s SQL header and `lib/answer.ts`'s docstring both say the
  envelope carries the outcome; it does today, and the doc records that as
  today's state with the words "today each carries its outcome in the envelope
  beside the fact" — the inventory Step 4 starts from.

**What the doc recorded as it was at Step 3, which Step 4 changed:** the
`submit_guess` reply carried its outcome beside the fact, the two soft rejects
carried the server's sentence as well, and the words a player reads were
written in four places — `lib/answer.ts` (the two wire words and their
outcomes), the SQL (the two refusals' sentences), `BoardCol` (the too-short
refusal) and `PlayArea` (the two peer lines). The FE-submissions table listed
all six with where each was written, which is the inventory Step 4 started from.

### Step 4 — the `AnswerMessage` conversion — DONE 2026-09-22

connections' Step 4 (`8b96d546`), copied: an `ok` from `submit_guess` returns
the FACT and nothing else; a call site names an `answerType`; one function in
`lib/answer.ts` turns that into the outcome and the text, with a `_peer` twin
per answer, so the pill, the board's reject mark, the log bar and the header
line read one table.

**What shipped.** `lib/answer.ts`: `Answer` is the eight-member union
(`correct` · `correct_peer` · `incorrect` · `incorrect_peer` · `solved_peer` ·
`duplicate` · `not_a_word` · `too_short`), `answerMessage()`,
`eventToOutcome(row)` and `peerAnswerMessage(row)` replace `ANSWER_OUTCOME`.
My own accepted guess has an empty text — the colored row is the feedback —
and the peer twin says `guessed CRANE`, as before; `solved_peer` is the
compete opponent's `solved` flag, psychicnum's `found_peer` shape, since it is
a flag and not a row. `BoardCol`'s `softReject` takes the answer's name, its
too-short refusal reads the table, and its `res.message !== null` guards are
gone; `PlayArea`'s two peer lines call `peerAnswerMessage` and `answerMessage`;
`GameEventLog`'s bar calls `eventToOutcome`. The three `ok_envelope` calls in
`submit_guess` dropped their outcome and message arguments, and the four
gameplay pins assert `"outcome": null` — the two refusals `"message": null`
too. `answer.test.ts` rewritten to walk the union; `doc.md`'s `submit_guess`
entry and FE submissions say the new state.

**Not a word changed.** Every text is the one the surface showed before:
`Already guessed`, `Not in word list`, `Not enough letters`, `guessed CRANE`,
`solved it`. Every outcome the same. Joel's three word decisions at
connections had no counterpart here to make.

**The one thing this game does that the two earlier conversions did not:**
wordle is a game whose `ok` refusals carried a SERVER-written sentence — the
two soft rejects are `ok` because the frontend holds no word list and cannot
pre-check them, and `docs/envelopes.md` → Who writes the words says a server
that can write the sentence does. The conversion moves those two sentences to
`lib/answer.ts` all the same, by `docs/outcomes.md` → How a game does it: an
`ok` that is one of the game's answers carries no outcome, a message requires
an outcome, so the words go with it. That is the tension connections' Step 4
recorded and left standing in `envelopes.md`; it stands here too, and is the
shared doc's to resolve. **Joel's read is the check on this.**

**One behavior change, stated now: the todo's Bug is fixed, and deleted
there.** A `not-ok` bumped the reject nonce without setting `rejectOutcome`,
so a race ("Game over", "Already solved", "Not your turn") marked the active
row in whatever the last soft reject left — red after a not-a-word, under an
amber pill. The `not-ok` branch was open for the conversion and now calls
`setRejectOutcome(notOkOutcome(res))`, the same function the pill reads, so
the two cannot disagree. The todo said the fix was that one line; it was. No
test pins the mark's color; the mark itself is pass 3's.

**Verified by planting the outcome back** on the duplicate branch: the whole
pgTAP suite went red on exactly one test, `gameplay_test.sql`'s duplicate pin,
naming `message: want null, got "Already guessed"` and `outcome: want null,
got "warning"`; restored, green. `tsc -b` clean, lint clean over
`src/wordle/`, 379 unit tests green (the game's and the guards), the whole
pgTAP suite green (181 files, 2545 tests). The e2e specs have not run for
Steps 2–4.

**Seen with the SQL open, left for pass 2:** `submit_guess`'s coop terminal
write says *"Every terminal write states its `outcome` explicitly"* while the
key it writes is `reason` — the status-key rename left the comment behind. A
stale-claims item for the audit, with `manifest.ts`'s two-player claim.

### Step 5 — the actions and the row (readability 3.6, 3.7) — DONE 2026-09-22

connections' Step 5 (`e0d0d104`), copied. **The row is one `<InfoActionsRow>`
now**, in the order `docs/playarea.md` states: Reveal · Restart · New game ·
Concede · End | Back to club, Back to club filled only at terminal. The
three-way fork (`over ? … : isLocallyDone ? … : …`) is gone; the only thing
that varies is the row's line — the verdict, "You conceded" / "Waiting for
others" while a race runs on without you, nothing while you can play. The
InfoCol's destructure, its prop-type block and the PlayArea's prop list read
in that same order, and so does the menu. **No divider**: wordle has no hint
and no spoiler, so nothing sits left of it, and the shared `.actionsDivider`
draws only after a button anyway — omitting the span is the same screen.

**The conventions, per binding:** Reveal takes the button guard in front of
the shared `describeReveal` (`showInput && asker === 'button'` → hidden, a
grayed menu row all game, since the menu names the glyph); New game is a
button only at terminal, `(asker) => asker === 'button' && !isTerminal ?
'hidden' : 'active'`, a menu row and `+` all game; Restart's was already the
shared hook's; Concede and End were already the shared hook's, each hidden in
the mode that isn't its own. `createNewGame` is a plain `async function`. No
in-flight flag existed to remove. Print's `describe` is `'active'` — it still
read `game ? 'active' : 'hidden'`, a guard Step 2's split had made dead.

**One gate hoisted:** `showInput = !isTerminal && !isLocallyDone`, declared
beside `isLocallyDone` because the Reveal binding reads it; InfoCol takes
`showInput` in place of `isLocallyDone` (the help line and the row's line
read it), as connections' does.

**Two behavior changes, stated now.** *An out-of-race racer gets Back to
club* — the locally-done row had no way to leave except Concede, which the
todo named as the thing the fork loses; the unconditional row cannot lose it.
*The menu lists Reveal · Restart · New game* where it listed Restart · New
game · Reveal, so the menu and the row read alike. Everything else the
collapse could destroy was watched: Back to club keeps `weight={over ?
'primary' : 'secondary'}`, and Reveal stays grayed rather than gone while the
others race (that was already this game's arrangement, so nothing moved).

**The todo's Soon item is deleted** (the action-row collapse). Two new render
cases pin the conventions: the three end-of-game actions are menu rows all
game and buttons only at the end; and a racer who is done sees Reveal grayed,
Concede, and Back to club, with Restart and New game still menu-only. The
test file's action-row docstring says the one row.

Verified: `tsc -b` clean, lint clean over `src/wordle/`, 381 unit tests green
(the game's and the guards). The e2e specs have not run for Steps 2–5.

### Step 6 — the builder leaves the component file (readability 3.4) — DONE 2026-09-22

connections' Step 6 (`95d7872a`), copied, with Joel's rename ruling applied
from the start: the builder is **`buildTerminalMessage`** in
`lib/terminal.ts` — Joel's word is "terminal", not "over" — the value it
produces is `terminalMessage`, and InfoCol's `over` prop is `terminalMessage`
too. `<Board gameOver>` keeps its name, being the shared vocabulary backed by
the `.gameOver*` classes. `PlayArea.tsx` no longer imports
`gameEndedTerminalMessage` or the `TerminalMessage` type; the `useMemo` on
primitives that feeds the verdict effect stays there, as planned.

**A pure move, no signature change.** The builder's inputs were already
`mode · playState · timerExpired · selfWon · wonByClock · selfTiedWinner`,
every one a primitive the component derives; none compared a count to a
constant of the component file, so nothing had to be renamed on the way out.
Same branches, same words.

`lib/terminal.test.ts` walks the whole input space — every terminal play
state (`won` · `lost` · `ended` · `won_compete` · `lost_compete`) in both
modes, the clock run out and not, the caller winning on guesses or on the
clock and losing the same two ways — and the last case is a TABLE: no cell
pairs a winning sentence with a losing outcome, both texts are filled,
neither is punctuated. Both files join the roster at `cs-met-wordle`.

**Known and left for pass 2, as connections' F-2 was:** the builder decides
the reason from the client clock (`timer.expired`) where the server wrote why
into `status.reason` (`solved` · `exhausted` · `timeout` · `conceded` ·
`manual`), which the club-list label already reads. Two consequences: a
`lost_compete` because everyone conceded reads "Nobody solved", and a
timeout that lands while the local clock still shows a second reads as a
guesses loss. Pass 2's finding, with the SQL open.

Verified: `tsc -b` clean, lint clean over `src/wordle/`, 396 unit tests green
(the game's and the guards). The e2e specs have not run for Steps 2–6.

### Step 7 — the section order (readability 3.2) — DONE 2026-09-22

connections' Step 7 (`60e1f932`), copied: `PlayArea.tsx` reordered into the
eight sections in the one order (Page hooks · Derived · The local slot, and
its three standing conditions · Narration — what a PEER did, in the header
slot · The turn-history viewer · The commands, bound · The menu · Render),
each header stating the rule its section follows; `BoardCol.tsx` into six.
For wordle that is:

1. Page hooks — `useTabRing`, `useInfoSheet`, `useCelebration`,
   `useTurnStartFlash`
2. Derived — `self`, `isCompete`, `maxGuesses`, `guessesUsed`, `mySolved`,
   `myConceded`, `solvedIds`, `myGuesses`, `summaryRows`, the reveal,
   `isLocallyDone`, `showInput`, `readOnly`
3. The local slot — the slot, the terminal message and its winner
   derivations, out-of-race, waiting
4. Narration — the coop peer-guess line and the compete opponent-solve line
5. The turn-history viewer
6. The commands — the shared trio, Reveal, New game, Print
7. The menu
8. Render — `concededIds`, `rows`, the snapshot and its actor, then the
   columns

`BoardCol.tsx`'s six: **Which board is on screen** · **The pending guess**
(`current`, `pending`, the reset-on-shrink, `pendingWord`, `typeLetter`) ·
**The marks this column owns** (the reject nonce and its outcome, the timer
that clears it) · **Committing a guess** (`submitting`, `canGuess`,
`softReject`, `doSubmit`, the capture hook) · **The keyboard's letters**
(`keyStates`, `keyTones`) · **Render**. One more than the shape's five, and
one swapped: this game has no display order to shuffle, and it has a
keyboard whose tints are the same kind of thing — purely visual, this
client's reading of the rows, touching nothing else — so that section stands
where the shuffle would.

**Every code line in both files is a pure move, checked by diff** — the
non-comment lines of each file before and after, sorted, are identical (337
in `PlayArea.tsx`, 210 in `BoardCol.tsx`). Nine of the PlayArea's old `// ───`
sub-headers are demoted to plain comments inside the section they fall in
(the viewer, the celebration, the turn flash, the null-safe derived, the
reveal, the two narrations, the standing conditions, the shared trio) so the
file has eight headers and not seventeen; `BoardCol`'s three ("Edit the
active row", "Submit a guess", "Physical keyboard") the same. `readOnly` and
`concededIds` moved out of the render tail — the first to Derived, being
"what I may still do", the second to Render, being read by the column alone,
where connections put its own.

**What the reorder showed:** `solvedIds` sat between the two narrations
while three readers asked it (the compete narration, Concede's `selfSolved`,
the print model); it is Derived now. The winner derivations (`selfWon`,
`wonByClock`, `selfTiedWinner`) stayed beside the terminal message, being
its inputs and nobody else's. Two orphan comments are stale and left for
Step 8, the comment pass: the "Reveal solution — TERMINAL ONLY … No handler
of its own any more" block after New game, and the "verdict in the slot is
the terse verdict ALONE" block before the JSX. `Derived`'s old header said
"null-safe; real values after the loading guard", a sentence Step 2's split
made false; the section header says what the section is for.

**`Board.tsx` was not touched.** connections' Step 7 organized its `Board`
on Joel's word that day; wordle's is one component whose body is a baseline
adjustment and a render, with nothing to section.

Verified: `tsc -b` clean, lint clean over `src/wordle/`, 396 unit tests green
(the game's and the guards). The e2e specs have not run for Steps 2–7.

### Step 8 — the comment pass (readability 3.5) — DONE 2026-09-22

psychicnum's Step 6 rules, connections' four files: `PlayArea.tsx`,
`BoardCol.tsx`, `Board.tsx`, `InfoCol.tsx`. **627 comment lines in, 515 out**
(316 lines removed, 204 written). **Proved a pure comment pass** — with every
comment form stripped (block, line, and the JSX `{/* … */}` whose continuation
lines a naive grep reads as code), all four files are byte-identical before and
after.

**Two comments were FALSE, not stale.** `Board.tsx`'s docstring explained the
reveal by a `firstRows` that "captures that initial count once": there is no
such identifier, and the thing that exists — `flipBaseline` — is state
precisely BECAUSE it moves, which the comment twelve lines below it says. The
same docstring credited `forwards` for holding the final color where the
keyframes use `both`, and `Board.module.css` explains at length why the
difference is load-bearing. **And the surface's docstring said the PlayArea
"owns the game data (`useGame`)"**, which Step 2 made false — the loader holds
the hook and hands the rows down as props.

**Joel's three rules did the cutting.** Rule 3 (a product ruling is not a
comment): the turn-flash's "a removal is a poor signal — you have been waiting,
so you are looking somewhere else", `isLocallyDone`'s "the default 'Lost — race
continues' would be flatly wrong", the reveal's "no irreversible thing sits
behind a menu item that reads like a display toggle", the action row's "the
row's few slots belong to playing, and moving on is a thing you go looking
for", the below-board slot's "(Joel's call)". Rule 2 (why-here): `createNewGame`'s
"A plain function, rebuilt every render" paragraph, which psychicnum cut in the
same words. Rule 1 reached one comment only — `typeLetter`'s "the ⌫ cap" — this
game's chords having stayed in the registry.

**Archaeology:** `readOnly`'s "(De Morgan of the old positive
`guessingAllowed`)", the celebration's "(the waffle loading-race lesson)",
`GuessAnswer`'s "Written as one object with `colors?` that distinction was
invisible", New game's "(waffle's 'same again!' feature)". **Call sites to a
sentence and a pointer:** the envelope paragraph in `createNewGame`
(docs/envelopes.md), `useCaptureKeys`'s four-clause list of what the shared core
handles, `softReject`'s three paragraphs. **The two orphan comments Step 7
parked are gone** — the Reveal block after New game and the verdict block before
the JSX, both describing things that had moved.

**`plans/tile-feedback.md` is cited nowhere in the four files now** — `gameOver`
points at `common/board-marks/doc.md`, a plan being deleted when it ships. It is
still cited twice in `Board.module.css`, which is pass 3's.

**`InfoCol.tsx`'s prop notes were `/**`, and are `//`** — the marker rule, the
same fix connections' column needed. `BoardCol`'s `historyActor` was the only
other one.

**One defect found by reading:** `BoardCol.tsx` carried a mojibake em dash
(`â` + `\u0080\u0094\u0094`) mid-comment, which is why that block had to be
rewritten through a script rather than an edit.

Verified: `tsc -b` clean, lint clean over `src/wordle/`, 396 unit tests green.
**The restructure is complete.** The e2e specs have not run for Steps 2–8.

## The audit — pass 2

### The prose pass — shipped 2026-09-22, one sitting

In the working tree for Joel's read, before any finding is presented
(the order [app-audit.md](../app-audit.md) §4 sets):

- **`src/wordle/doc.md` is whole.** The intro's fourth paragraph (the end of a
  game is on the board); Game rules with a Vocabulary table, Coop, Compete and
  The play states; Schema; Frontend, with the render tree and what is
  wordle's own; Tests, both suites as tables and the four Playwright specs
  named. Written from the code, as Step 3's sections were, not from the old
  doc — and where the old doc and the code disagreed, the code won: the old
  doc's "Malformed … guesses are soft-rejected" (a short word is a fault), its
  `wordle.{games, players, guesses}` (the table is `events`), its title table
  saying a terminal game titles the winning guess (a lost one titles its last
  guess), and its `hides_solution` paragraph (nothing reads the column).
  **`docs/games/wordle.md` is deleted**; CLAUDE.md's row and the manifest's
  docstring are repointed. The frozen migration's `See docs/games/wordle.md`
  stays, an applied migration being nobody's to edit.
- **The marker pass**, in the shape [[docs/code-conventions.md]] → Code
  clarity states: a note on a prop, a field or a union member is `//`
  (`useGame.ts`, `BoardCol.tsx`'s `GuessAnswer`, `GameEventLog.tsx`'s props,
  `lib/setup.ts`'s fields, `lib/history.ts`'s snapshot, `pdf/model.ts`'s two
  types and its argument fields, the manifest's status shape). Two docstrings
  sat on the wrong declaration — `PlayArea`'s above `WORD_LENGTH`, `BoardCol`'s
  above `REJECT_MARK_MS` — and now sit on their functions. The manifest's
  `labelFor` carried two stacked docstrings, the first naming a `modeLabel`
  that does not exist; it is gone.
- **The stale claims.** `manifest.ts` said the RPC enforces compete's
  two-player minimum (it checks the maximum only — the comment says so now,
  and whether the server should check is a finding). `PlayArea.tsx` named
  `wordle.players_state`, a view that does not exist. `submit_guess`'s and
  `end_game`'s SQL comments said `outcome` where the key written is `reason`;
  so did `todo.md`'s End-for-all item. `end_game_test.sql` said a second call
  "raises P0001 (the FE swallows it)" twice, comment and assertion label,
  against an assertion that reads a race envelope. `loss_test.sql`'s header
  named two error keys that exist nowhere (`'game-not-in-play|'`,
  `'no-guesses-left|'`), "the line 429 guard", and a `PN258` that no file
  defines. `gameplay_test.sql`'s header listed malformed among the soft
  rejects while its body asserts the fault. `PlayArea.test.tsx`'s header
  credited `colors.test.ts` with "the render mapping" (it tests `colorRank`)
  and cited a memory file by name. `SetupForm.tsx` said mode does not change
  the form (the coop-pacing section gates on it). Two stylesheets pointed at
  `docs/ui.md → "PlayArea layout"`, a heading in `docs/playarea.md`.
- **The archaeology.** Every dated aside and "used to" in the roster:
  `_sync_title`'s inner comment (two regressions and a deleted flag, now the
  rule), the `reveal_answer` tombstone in `wordle.sql` (a removed function
  with no drop under it, prod having never carried it), `create_game`'s
  "26 of 2315 — 5 slurs, 4 …" census of the clean filter (now the argument),
  the manifest's `ended` comment, `Board.module.css`'s media-gate history
  with its measured pixel sizes and "the other twelve games",
  `GameEventLog.module.css`'s keycap story, `theme.css`'s two "moved to
  common" notes, `lib/colors.ts`'s two bug narratives (now the reason each
  variable exists), `lib/history.ts`'s three rosters of games, and the
  `used to` in `replay_test`, `compete_test`, `concede_test` and
  `banded_answer_test`; `setup.test.ts`'s and `SetupForm.test.tsx`'s dated
  passages. "Rules copy" in `Help.tsx`; "the first cross-field refusal in the
  roster" and "full six-row shape" (a budget is 5–8).
- **Not touched, on purpose:** `Board.module.css`'s two `plans/tile-feedback.md`
  cites are pass 3's, which reads that plan against this board; the e2e
  headers are `cs-unmet` and off the roster (`wordle-history.e2e.ts` still
  says "the (still monolithic) PlayArea"); `InfoCol.tsx` and
  `lib/answer.ts` needed nothing.

**Seen on the way and left for the findings**, none of it prose: `InfoCol`
takes a `setup` prop it never reads (typed, passed by `PlayArea`, not
destructured); the builder's clock inference and `status.reason`
(connections' F-2); the compete minimum the server does not check.

**Verified:** `tsc -b` and eslint clean; the guards and the wordle unit
tests green (39 files, 396 tests — `orphanedDocstrings` caught the fixed
`labelFor` still on its allowlist, and the row is gone); `gmake db-sql
ENV=local` then `npm run test:db`, 181 files, 2545 tests, PASS.

### The todo, emptied into findings — 2026-09-22

The two Soon items are F-1 and F-2 below, each with its options; they leave
`todo.md` when they ship or are ruled, and the list is empty before the
closing re-read (Joel, 2026-09-19, at connections).
The Bugs, Someday, Maybe and Won't-do sections were already empty. **Nothing
moved under the area**: `git log` on `src/common/game-page/` since this area
opened is empty, so there is no shared change to read against the game.

F-3 to F-5 are what the prose pass saw and left, recorded here so the next
sitting has them in the file and not in a memory.

## Findings

*(`F-wordle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### SHIPPED · F-wordle-1 · `hand-tuned-reserve` · the board's height cap subtracts a `15rem` that nothing composes

**Joel, 2026-09-22: "do 1."** The cap reads its terms now:
`100svh − --game-chrome-height − --guessKeyboard-height −
--local-feedback-min-height − 2 × --board-col-gap`. Four tokens carry it, and
each had to become reachable first, since a property declared on a sibling or
a descendant cannot be read by the board:

- **`--guessKeyboard-height`** is new, in `core-css/base.css` beside
  `--game-chrome-height`, composed from two new primitives
  (`--guessKeyboard-row-height: 3.2rem`, `--guessKeyboard-row-gap: 0.4rem`)
  that `GuessKeyboard.module.css` now READS in place of its two literals. Its
  "TWO FAMILIES" comment is three, and the third's rule is read-only, like the
  theme's.
- **`--local-feedback-min-height`** was a `var()` fallback on the shared
  `.localFeedback` and nothing else — so wordle would have needed a second
  copy of `2.75rem` to subtract it. The default is declared in `base.css` and
  the fallback is gone, which is also the convention `cssTokens.test.ts`
  states (no `var()` fallbacks; the guard is the net instead).
  bananagrams' 2.5rem override is untouched, still winning by proximity.
- **`--board-col-gap`** already existed and needed nothing — but the second
  gap was `BoardCol.module.css`'s own `0.75rem`, written to match it. It reads
  the token now, so the cap can subtract `2 ×` one term.

**Two behavior changes, stated now.** The reserve is 14.65rem where it was
15rem, so when the cap BINDS the board is up to 0.29rem wider (the reserve
times `cols/rows`) — the "hair of slack" was rounding left over from summing
by hand, and composing exactly is what removes it. Say so and it comes back as
a named term. Nothing moves when the cap is inert, which is every window with
room. And `GuessKeyboard.module.css` no longer writes a literal `gap`, so its
`pending` row in `vocabularies.test.ts` is gone; **Joel's 2026-09-22 ruling
that the two keyboard gaps are a tuned pair is not reversed** — the value is
named, not put on the ramp — but it now lives in the two stylesheets' comments
rather than under the guard's eye, which is a real loss of enforcement and is
his to overturn.

**Verified:** `tsc -b` clean; eslint clean; 404 unit tests green (wordle, the
keyboard, the guards); the five changed stylesheets parse under postcss.
**Planted** the literal `gap: 0.4rem` back into the keyboard: the spacer
vocabulary goes red naming that file, so the guard does watch it and the row's
removal is the right half of the edit. **No e2e has run for this.**

`Board.module.css` caps the grid's width at `(100svh − chrome − 15rem) ×
cols/rows`, the `15rem` standing for everything else in the board column —
which the comment itemizes as the keyboard (10.4rem), the feedback slot
(2.75rem) and two column gaps (0.75rem each), 14.65rem, "rounded up for a
hair of slack". **Every term checks out today**: the keyboard is three
3.2rem rows with two 0.4rem gaps, the slot's `min-height` is 2.75rem, and
the column gap is `--spacer-3`, 0.75rem. But nothing holds them together: a
taller keycap, a deeper slot or a wider gap moves the stack and not the cap,
and the page-fits-the-viewport e2e cannot see it, since it measures the play
surface against the window and this is slack one level in. The shell's own
`--game-chrome-height` was the same construction until it turned out to omit
a 1px rule, and is composed from its terms now.

Options: **compose it** — the slot already publishes
`--local-feedback-min-height` and the layout publishes `--board-col-gap`, so
the cap can read those two and a `--keyboard-height` the keyboard's
stylesheet would declare, leaving only the rounding as a literal; **pin it
with a test** — a jsdom or e2e assertion that the reserve equals the sum of
the measured parts, so a drift is red rather than clipped; or **leave it**,
the terms being stable and the comment naming them. Recommendation: compose
it — three tokens, no new file, and the comment's arithmetic becomes the
code's.

### RULED · F-wordle-2 · `no-end-for-all` · a race can only be closed by every racer conceding

**Joel, 2026-09-22: hand it over.** Not wordle's work, and not wordle's
question: `common/game-page/todo.md` holds both halves already. The design was
ruled on **2026-09-19** — *"yes, every race should offer it"* — and the shape
of the work with it: *"Build it as one change, not fourteen"*, ending with
`offersEndForAll` gone and bananagrams' opt-in going with it. So a
`offersEndForAll: true` here would be the second opt-in that sweep has to
unpick.

**What this area owed and now answers: the reading.** The todo asked for the
reading to be checked before any wiring, and Joel ruled the same day that
`ended` is neutral in every mode, so a game whose prose or status line calls a
compete `ended` a loss is part of that work. **wordle's three are clean**, each
neutral and mode-blind: `manifest.ts`'s `labelFor` answers
`verdict('Ended', null)` with no mode branch; `lib/terminal.ts` returns
`gameEndedTerminalMessage(mode)` before it looks at the mode, and that message
is `outcome: 'neutral'` / "Game ended — no winner"; `wordle.end_game` writes
`'ended'` with every player `{"won": false}` and `reason: 'manual'`. The game
is ready for the sweep and contributes nothing else to it.

**`src/wordle/todo.md`'s copy is deleted** — one home per decision, and the
home is the shared todo. See the note below: eight other games carry the same
copy.

Compete offers Concede alone. A table that has lost interest closes the game
one concession at a time, each a loss on that player's record for a game
nobody wanted to finish. The mechanism exists: `useStandardGameActions`
takes `offersEndForAll`, which grows Concede's question a second answer
("End for everyone") that calls `end_game`, and a conceder gets End back on
its own — bananagrams is the worked example, and wordle's `end_game` already
writes the neutral `ended` in either mode. **The reading the todo asked to
check first checks out**: `labelFor` reads `ended` as "Ended", mode blind,
and `buildTerminalMessage` hands `ended` to the shared neutral message before
it looks at the mode — nobody won is not everybody lost, on both surfaces.

Options: **wire it** — `offersEndForAll: true` on this game's
`useStandardGameActions` call, a `PlayArea.test.tsx` case for the two-answer
question, and the doc's Compete paragraph gaining the sentence; or **leave a
race to its racers**, which is a design position psychicnum holds today
(its doc says there is no way to stop a race for the whole table, and points
at `common/game-page/todo.md`). Recommendation: wire it — but this is a
cross-game question with a shared todo behind it, so the ruling may belong
to `game-page` rather than here.

### SHIPPED · F-wordle-3 · `terminal-reads-the-clock` · the terminal message decides the reason from the client clock, not `status.reason`

**Joel, 2026-09-22: read `status.reason`, and take connections' words.** The
builder's inputs are `mode · playState · reason · selfWon · wonByClock ·
selfTiedWinner` — `timerExpired` out, `reason` in, arity unchanged. The call
site reads `status?.reason` beside the `status?.winner_user_id` it already
read, and the **`timer` prop is gone from `PlayArea`**, the verdict having been
its only reader. `lost_compete` gained *All conceded — no winner* / *All
conceded*, connections' words verbatim so the two games read alike; a MIXED
table stays "Nobody solved", which is `_maybe_finish_compete`'s own call
(`exhausted` unless EVERY player conceded) and what the club-list label says
from the same word.

The fallback branch is the exhausted one, so a row carrying no `reason` — one
written before the status key was renamed — still fills both texts rather than
going blank. `lib/terminal.test.ts` walks every word the column can hold plus
`undefined` instead of a boolean, and `PlayArea.test.tsx` gained the WIRE: an
all-conceded race whose clock is still running reads the server's word on both
surfaces.

**Verified by planting two faults**: the builder blind to `conceded` (2 red —
the unit table and the wire) and the call site passing `reason: undefined`
(1 red, the wire alone, which is the split that says each test is pinning its
own half). `tsc -b` clean, eslint clean, 398 unit tests green. `doc.md`'s *The
play states* said the verdict does not read the reason; it says the two
surfaces name one ending, and that the clock-vs-count win is what the builder
still works out for itself.

`buildTerminalMessage` takes `timerExpired` off `timer.expired` — the
browser's clock — where the RPC that ended the game wrote WHY into
`common.games.status.reason` (`solved` · `exhausted` · `timeout` ·
`conceded` · `manual`), which `labelFor` already reads for the club list.
Two consequences: a `lost_compete` because everyone conceded reads "Nobody
solved", and a timeout that lands while the local clock still shows a
second reads as a guesses loss. The doc's *The play states* says as much,
as today's state. connections' F-2 and psychicnum's F-5 fixed the same
thing: the builder takes `reason` from `status`.

Options: **read `status.reason`** — the builder's inputs become `mode ·
playState · reason · selfWon · wonByClock · selfTiedWinner`, `lost_compete`
gaining an "All conceded — no winner" sentence, `lib/terminal.test.ts`
walking every word the column can hold, and the call site reading `status`
(a prop it already destructures for the winner); or **leave the clock**.
Recommendation: read the server's word.

### SHIPPED · F-wordle-4 · `compete-min-unchecked` · the server accepts a one-player race

**Joel, 2026-09-22: "add the raise."** `wordle.create_game` gained the
siblings' guard, verbatim in shape, after `require_valid_mode` (which has to
run first, the guard branching on the mode): under two players in compete is
`PN498`, `hint = 'fault'`, detail *compete needs >= 2 players*. **`PN498` is
the next free code** from `raiseCodes.test.ts`'s own line — *480 allocated;
next PN is 498*.

`create_game_test.sql` gained two cases, plan 20 → 22: a solo race refused by
its code, and — the half the siblings' tests do not pin — **two racers still
created**, so a guard that over-rejects is as red as one that never fires.
**Verified by planting** the condition to `false`: the whole suite goes red on
exactly one test, `create_game_test`'s #13; restored, 181 files / 2547 tests
PASS.

**The finding undercounted the siblings.** It credited psychicnum and
connections; it is **ten of the fifteen compete games**, and
`docs/features.md` already tracked wordle in the gap by name. That row now
says ten games and lists three, and its paragraph says all three remaining
manifests claim an enforcement their servers do not have — setgame,
stackdown and waffle, each that area's to fix, untouched here.

Two prose fixes went with it: `manifest.ts`'s comment said *"Lower bound 2 —
this manifest's rule; the RPC checks only the maximum"* (the prose pass wrote
that, correctly, a day before it stopped being true) and now names both ends
with the code; `doc.md`'s Compete paragraph says the server checks both, and
that the lower one is unreachable through the app — the club page hides a
gametype the roster cannot fill (`ClubPage.tsx:680`), and the players picker
refuses a short selection (`PlayersSection.tsx:65`).

`wordleCompeteGame` says `[2, 6]` and its comment now says the minimum is
the manifest's rule, which is true: `wordle.create_game` checks the maximum
(`require_player_count_max(…, 6)`) and the mode's spelling, and a compete
game with one player is created. psychicnum's and connections' `create_game`
each raise a fault (`'BUG: race with fewer than two players'`) for the same
case, on the reasoning that a solo race is a coop game with a timer, and
`docs/features.md` records wordle among the games with no such check.
Nothing reaches it today — the setup dialog hides compete in a one-player
club — so a raise here is the server-side catch, not a fix for anything a
player can do.

Options: **add the raise**, the sibling games' shape, with the next free
`PN` code and a `create_game_test.sql` case; or **leave it**, the manifest
gating it and the trust model not asking for a second gate. Recommendation:
add it — the two audited siblings have it, and a fault costs nothing.

### SHIPPED · F-wordle-5 · `unused-setup-prop` · `InfoCol` takes a `setup` it never reads

**Joel, 2026-09-22: "delete it."** Three lines in two files: the
`setup: WordleSetup` member of `InfoCol`'s props, the `setup={setup}`
pass-through in `PlayArea`'s JSX, and the `WordleSetup` import that the
member was the only use of. The `// ── Setup disclosure ──` heading keeps its
one real prop, `setupRows`, which is what `<SetupDisclosure rows={…}>`
renders.

**`PlayArea`'s own `setup` stays** and is not the same prop: it is read once,
by `setupRows(setup, mode, members)`, and that memo feeds both the info column
and the print model. Only the hand-down was dead.

**Nothing was planted, and that is the finding.** A prop with no reader is
invisible to every test by construction — there is no failure to plant,
which is why it survived the restructure's own prop pass (the `<Board>` props
note above) and why the lint is quiet: an unused member of a props type is not
an unused variable. `tsc -b` clean, eslint clean, 398 unit tests green;
`PlayArea.tsx` is the only file that renders `<InfoCol>`, tests included.

`InfoCol`'s props type declares `setup: WordleSetup` under *Setup
disclosure*, `PlayArea` passes it, and the component destructures only
`setupRows` beside it — the disclosure renders the rows. The type import is
what keeps the lint quiet: an unused member of a props type is not an unused
variable. Options: **delete it** — the prop, the pass-through and the
`WordleSetup` import from `InfoCol.tsx`; or keep it for a reader nobody has
named. Recommendation: delete it, a prop with no reader being a claim the
component makes about itself that is false.

### The audit's read — 2026-09-22

**The READ is DONE.** Every roster file end to end, React, SQL and CSS
together: the four components and their five stylesheets, `useGame`, the
eight `lib/` files and their tests, the printer and its model, the manifest,
`db.ts`, `theme.css`, the shared `tileColors.module.css`, `PlayArea.test.tsx`
and `SetupForm.test.tsx`, the repeatable SQL file, both migrations, the eleven
pgTAP files and `setup.psql`, plus `colors_test.sql` as evidence. And the
checks beside them: the shell commits since the area opened (F-1's own, the
keyboard change, the tile-colors move — nothing under `game-page`), that
`GamePage` keys the surface on `restarts`, what the shared `.verdictRing` and
`useMark` do, what `useCelebration` requires of its gate, what the outcome
vocabulary says a refused move reads as and what the sibling games say, and
every doc anchor the folder cites.

What the game IS, for the record: the code held up. The hidden-target
pattern is sound end to end (the grant, the definer view, the re-shield on
Restart, the title that never spells an unearned answer), the seam is one
function, the printer refuses the answer under the same rule the screen uses,
and the pgTAP suite pins the rules it names. What the read found is of three
kinds: two things the shell moved under this game that its code still defends
against (F-7, F-13); decisions this game never made where its siblings have
(F-6, F-8, F-9, F-12); and prose that drifted, the same way connections' did.
Twelve findings: eight with a decision in them (F-6 to F-13), then prose,
tests and small shapes (F-14 to F-17).

### SHIPPED · F-wordle-6 · `race-winner-celebration` · the race's winner gets no confetti

**Joel, 2026-09-22: "do it."** The gate is `playState === 'won' || (playState
=== 'won_compete' && selfWon)`; `winnerId` and `selfWon` moved up into Page
hooks beside the hook that reads them (the local slot's tie-break reads the
names from there). The modal keeps *Solved! 🎉* and gains a body per mode —
*You solved it in the fewest guesses.* / *The team found the word.* — my words,
not ruled. Three cases in `PlayArea.test.tsx` replace the one that pinned
coop-only: the race I won celebrates as it lands, a race somebody else won does
not, and a race opened already won does not. **Verified by planting** the gate
back to coop-only: the first case red, the other two green, restored. `doc.md`
said "a coop solve celebrates" in three places and its Tests row said "mine
only"; all four say the rule now.

`useCelebration(playState === 'won')` — coop only, and the comment beside it
says so "by the states vocabulary (compete writes `won_compete`)", which is a
description of the gate rather than a reason for it. psychicnum's F-6 and
connections' F-1 asked the same question and both gave the race's winner the
celebration (`playState === 'won' || (playState === 'won_compete' &&
iFoundThemAll)`), with the modal's body reading per mode (*"You found all
three first."*). Here the winner is `selfWon`, read off `status.winner_user_id`
— on the common row, so correct on the first render, which is what the hook's
rule 1 requires. `PlayArea.test.tsx` → "does not celebrate a compete win" pins
the current behavior and would flip. Options: *the same here* — the gate
becomes `playState === 'won' || (playState === 'won_compete' && selfWon)`, the
modal's title stays *Solved! 🎉* and gains a body per mode, the test pins the
winner celebrating and the beaten racer not — or *keep coop-only* as a design
choice with a comment that says it is one. Recommendation: the same here, for
the reason connections gave — a race's winner has more to celebrate than a
team, and the pill alone says "Won: fewest guesses" in the corner.

### SHIPPED · F-wordle-7 · `restart-defenses-dead` · two render-phase guards, two specs and a doc sentence defend against a restart that cannot reach them

**Joel, 2026-09-22: "delete them."** `BoardCol`'s `prevRowCount` state and its
branch are gone, and the `pendingLanded` comment says why a stale `pending` is
harmless (rows only grow; a Restart remounts). `Board`'s `flipBaseline` is a
plain `useState(rows.length)` seed — the mount-time line still tells a landed
row from one already there — with the move-back branch and its three
paragraphs gone; `!isViewingHistory` stays in `flipping`, since a snapshot's
rows never flip. The two specs are deleted. **One case was kept, rewritten
without the restart**: the flip rule still has a pin — a row that lands during
the session flips, the rows present at mount do not — because deleting the
restart spec would have left the flip with no test at all, and its comment says
why no restart appears in it. `doc.md` → Frontend says a Restart remounts the
surface. 399 tests green.

**§4's standing trap, checked here as it asks.** `GamePage` renders
`<PlayArea key={commonGame.restarts}>` (`GamePage.tsx:442`), so a Restart
unmounts this whole surface on every client and mounts a fresh one — `pending`,
`current`, `flipBaseline` and every ref inside the shared hooks start over.
Four things in this folder still defend against the case:

- `BoardCol.tsx` → the `prevRowCount` state and its render-phase branch:
  "Rows only SHRINK on a reset … drop the stale in-flight word AND any
  half-typed buffer from the previous run". Rows shrink on nothing else — the
  live `rows` prop is append-only in both modes, and the history snapshot goes
  to `<Board>` by a different prop.
- `Board.tsx` → `flipBaseline` "MOVES BACK, which is why it is state and not a
  mount-time count: a restart deletes the guesses". With the remount the
  replayed game's first row flips because the board is new; the
  `!isViewingHistory` guard beside it is guarding a branch that never runs.
- `PlayArea.test.tsx` → "restart resets the board fully — no stale pending row
  from the finished run" and "still flips the first guess of a replayed board"
  both `rerender` with a shrunken `rows` and NO remount — the exact shape
  `F-word-list-5` was filed in, red only because the test skipped the remount
  the app always performs.
- `doc.md` → Frontend: "a Restart moves the line so the replayed game's first
  row flips too."

Options: *delete the four* — `prevRowCount` and its branch go, `flipBaseline`
becomes a plain `useState(rows.length)` seed (the mount-time line is still
what tells a landed row from one that was already there), the two specs go or
are rewritten to mount a fresh surface, and the doc sentence says a restart
remounts — or *keep them* as belt-and-braces. Recommendation: delete; §4's own
words are that code still defending against a restart "reads as load-bearing
to the next person", and the two specs are worse than dead, since they pass
against a path the app cannot take.

### SHIPPED · F-wordle-8 · `won-by-timeout` · a race the clock ends with a solver is under-recorded by the server and mis-described by the client

**Joel, 2026-09-22: option 1.** `wordle._finish_compete(target_game,
clock_ran_out)` is the one place a race's ending is written — the winner, the
results, the state and the whole status, `winner_guesses` included;
`_maybe_finish_compete` keeps only the still-racing check and calls it with
`false`, `submit_timeout`'s compete branch is one line calling it with `true`.
**One deviation from the shape shown**: the second argument is a boolean, not
the reason — the reason needs the winner, which the finisher computes, so
passing a reason in would have meant computing the winner twice. The client
builder takes `selfSolved` (PlayArea's `mySolved`) and says, for a
`won_compete` whose reason is `timeout`: *Won: solved before time ran out* to
the winner, *Lost: time ran out* to a racer who had not solved, while a solver
who was outranked still reads *beaten on guesses* and a tie still reads *beaten
on the clock* — my words, placeholders until ruled. Tests: `terminal.test.ts`
walks the five timeout cells and its table gains the `selfSolved` axis;
`PlayArea.test.tsx` wires a timed-out race to the racer still guessing;
`end_game_test.sql` gains the compete timeout with a solver (state, reason,
winner, the count, the loser) and without one. **Verified by planting two
faults**: the finisher without `winner_guesses` (2 red — the new pin and
`compete_test`'s) and the client without the timeout branch (2 red), both
restored. `tsc -b`, lint, 401 unit tests, pgTAP 181 files / 2554 PASS.

`submit_timeout`'s compete branch builds the winner, the per-player results and
the terminal status by hand — a duplicate of `_maybe_finish_compete`'s three
queries — and the duplicate is missing a key: it writes `winner_user_id` and
`winner_username` but not **`winner_guesses`**, so the club-list label for a
race the clock decided reads `Won by alice · dict "Wordle"` where every other
`won_compete` reads `Won by alice · 4 guesses · …` (`labelFor` → `count(…)`
returns null on the missing key). On the client, `buildTerminalMessage` reads
no `reason` for `won_compete`: a racer who had not finished when time ran out
sees *Lost: beaten on guesses* / *Opponent won*, which is not what happened to
them — they were never beaten on guesses, the clock stopped them — and the
solver sees *Won: fewest guesses* with nobody else's count to be fewest than.
`terminal.test.ts`'s table walks `reason: 'timeout'` against `won_compete` but
asserts only the outcome, and **no pgTAP exercises a compete timeout at all**
(`end_game_test` covers coop's). `docs/win-lose.md` files wordle as "best —
fewest guesses · rank the finishers" on timeout, which is what the SQL does;
the words and the status are what lag it.

Options: *(a) one finisher* — `_finish_compete(target_game, reason)` builds
the winner, the results and the whole status once, `_maybe_finish_compete`
calls it with its computed reason and `submit_timeout` with `'timeout'`, so
`winner_guesses` cannot be missed twice; `buildTerminalMessage` gains the
`won_compete` + `timeout` pair on both sides (Joel's words — something like
*Won: solved before time ran out* / *Lost: time ran out*), and
`compete_test.sql` or `end_game_test.sql` gains the compete timeout, both the
solver-wins and the nobody-solved cases. *(b) the minimum* — add
`winner_guesses` to the timeout branch and the two FE sentences, leave the
duplication. Recommendation: (a); the missing key is what the duplication
costs, and it will cost again.

### RULED · F-wordle-9 · `not-a-word-reads-lost` · one soft reject is red and the other amber

**Joel, 2026-09-22: option 2 — keep red, and write the reason.** No color
moved. `lib/answer.ts` carries the reason above the `not_a_word` case: a
duplicate is a move refused for form (the word exists, it is already there)
while a non-word is a wrong answer of its own kind, the one thing typed at
this board that is not a word. `answer.test.ts`'s row says the red is on
purpose and points at it. The pill and the row ring read the same line as
before.

`lib/answer.ts`: `duplicate` → `warning` / *Already guessed*, `not_a_word` →
`lost` / *Not in word list*. Both are the same kind of answer — the rules
applied, no guess spent, no row written, the typed row still there to edit —
and `docs/outcomes.md` defines `warning` as exactly that: *"A move not being
taken. Not a losing move — that is `lost`, red — but it is not happening and
you should notice, the way a duplicate word needs noticing."* The roster
mostly agrees: wordiply's `not_a_word` is `warning`, and every game's
already-guessed is `warning` (psychicnum, connections, spellingbee, boggle,
wordwheel, strands, wordiply). strands is the exception with a reason written
down — its "not a word" is "the one real miss", in a game where guesses are
otherwise unlimited. wordle's has no reason written; `answer.test.ts` pins the
color without saying why. The board's reject mark and the pill both take the
color from this one place, so the change is one line and one test row.
Options: *`warning` for both*, since neither is a verdict on your play — or
*keep red* as wordle's own reading (a non-word is a typo, a duplicate is a
lapse) with the reason written where the table is. Recommendation: `warning`;
the vocabulary's own definition names this case, and a player who mistypes a
word did not lose anything.

### SHIPPED · F-wordle-10 · `help-text` · the Help modal assumes two players and omits two rules

**Joel, 2026-09-22: "fix it."** My words, since none were given: the guess
paragraph reads *A guess must be a real 5-letter word that isn't already on the
board; anything else is refused and costs nothing. How obscure a word may be is
a setup choice.* — the duplicate rule and the band in one paragraph — and the
modes read *anyone can guess, and everyone sees every guess* / *the same
hidden word on a board of your own — nobody sees your guesses until the game
ends*. The countdown is not mentioned: every game's timer is the shell's. No
block was added, so the size stays 460×380.

Player-facing text, so a finding rather than a fix (Joel's words):

- *"either of you can guess, and you both see every guess"* — coop takes one
  to six players; "either" and "both" are true of exactly two.
- The duplicate rule is unstated: a word already on the board is refused and
  costs nothing, which is the one refusal a player will meet by accident.
- *"you don't see each other's guesses"* — until the game ends, when every
  board opens (and the event log's picker can read them back).
- Nothing about the legal band — that a guess may be crude or British, only
  too obscure — or that a countdown ends the game. Whether Help should say so
  is the same call connections' F-3 made (it named what a racer can see of a
  rival).

The size (460×380) sits with the mid-sized siblings and was chosen, not
measured; nothing here moves it unless the text grows a block.

### SHIPPED · F-wordle-11 · `word-length-two-homes` · `WORD_LENGTH` exists so screen and paper agree, and the screen does not read it

**Joel, 2026-09-22: "do it."** `WORD_LENGTH` lives in `lib/setup.ts` beside
`GUESS_OPTIONS`, read by `PlayArea` (the print model), `Board` (the tile loop,
and `--cols` set inline beside `--rows`), `BoardCol` (all four), `SetupForm`
(both band fields) and `printWordlePdf` (the fallback). `Board.module.css`
lost its `--cols: 5` declaration and its two "5" comments say `--cols`. The
player-facing "5-letter" in Help and the info column stays as text. `tsc -b`,
lint, 399 tests green.

`PlayArea.tsx` declares `const WORD_LENGTH = 5` with the docstring *"Named
here so the printed grid and the on-screen one can't disagree"*, and hands it
to the print model alone. The on-screen one spells the number itself:
`Board.tsx` (`Array.from({ length: 5 })`), `BoardCol.tsx` four times (the
typing cap, the submit check, `maxLength`, the keyboard-tint loop),
`SetupForm.tsx` twice (`length={5}` on both dictionary fields),
`printWordlePdf.ts` (`?? 5`), and `Board.module.css` (`--cols: 5`). Same class
as connections' F-14 (`constants-have-two-homes`) and psychicnum's F-19. The
player-facing "5-letter word" in Help and the info column is text, not
arithmetic, and stays. Options: *one home in `lib/`* — `lib/setup.ts` beside
`GUESS_OPTIONS`, since `SetupForm` reads it too and every file that needs it
already imports from `lib/` — read by the board, the column, the form, the
printer and the model; the stylesheet keeps its `--cols` (a CSS token cannot
read a TS constant, and `Board.tsx` already sets `--rows` inline, so it could
set `--cols` the same way if Joel wants the one home to be total) — or
*leave it*. Recommendation: `lib/setup.ts`, with `--cols` set inline beside
`--rows`.

### RULED · F-wordle-12 · `spectator-notice` · "Watching — you're not in this game" is two games' sentence for a state the shell owns

**Joel, 2026-09-22: "CLAUDE.md is wrong; there can be spectators. make a new
plan file … so we can comprehensively think about this. keep the line in
wordle for now."** Neither option, then: `plans/spectating.md` opened —
PROPOSED, nothing decided — with the inventory (the finding undercounted:
waffle and stackdown show a notice too, as the action row's `neutral` line, so
it is FOUR games in three shapes, not two) and the seven questions a design has
to settle; CLAUDE.md's audience bullet says spectators are friends too and
points at the plan; README's "there aren't spectators" line follows. wordle's
line stays.

`InfoCol.tsx` shows *Watching — you're not in this game.* when `isPlayer` is
false; scrabble's `BoardCol` shows the same words; the other fourteen games
show a non-player nothing in particular. The state is real — a club member can
open a game they are not seated in (`docs/common.md` → "spectators a free
future affordance") — and CLAUDE.md's prior is that there are no spectators. So
this is not wordle's sentence to keep or drop: what a non-player sees is
`game-page`'s question (CLOSED 2026-09-15, not locked). Options: *file it to
`common/game-page/todo.md`* — one notice, or none, for all sixteen — and keep
wordle's line until the shell answers; or *drop the line here now* and let the
column read as a player's would. Recommendation: file and keep; a lone honest
sentence beats fifteen silences, and removing it here would be deciding the
shell's question from one game.

### RULED — PASS 3's · F-wordle-13 · `reject-mark-hand-rolled` · the row's reject mark keeps its own clock beside a vocabulary that publishes one

**Joel, 2026-09-22: option 2 — leave it for pass 3.** Nothing changed. Pass 3
reads this mark against tile-feedback.md and converts it to `useMark` in the
same sitting, whatever channel it lands on; the shape is under option 1 below.

`BoardCol.tsx`: `rejectNonce` + `rejectOutcome` as two `useState`s, a
`useEffect` with a `setTimeout`, and `REJECT_MARK_MS = 900` — "a touch past
the shake, so the mark is still there when the movement stops". The shake is
`VERDICT_SHAKE_MS = 400` (`feedbackTiming.ts`, published as
`--mark-verdict-shake-duration`, which `.verdictRing` animates on), so 900 is
not a touch past it but more than double, hand-tuned. `board-marks` re-opened
2026-09-20 to merge every mark hook into one `useMark` — sixteen call sites in
ten games, connections' verdict among them — whose timers live in the hook and
whose durations come from `feedbackTiming.ts`; wordle's mark was not one of
the sixteen (`board-marks/doc.md` names only `useTurnStartFlash` for this
game). `<Board>` keys the active row on the nonce so a repeat refusal
re-shakes, which `useMark`'s own `nonce` does. Options: *convert now*, in pass
2 — `useMark<Outcome>(VERDICT_SHAKE_MS)` (or the beat Joel picks), `show(outcome)`
at both raise sites, the row keyed on the mark's nonce, the two states, the
effect and the constant gone — or *leave it for pass 3*, which reads this very
mark against tile-feedback.md (its line about wordle: "a refused word wears an
outline"), so the channel may change under the hook. Recommendation: pass 3,
recorded here so it is not lost; converting a mark whose channel is about to
be weighed is work done twice.

### SHIPPED · F-wordle-14 · `stale-claims` · sentences in the folder that are no longer true, and cites that point at nothing

**Shipped 2026-09-22, one sitting** (Joel: *"commit, then continue"*): every
bullet below, as listed — the cast comment and its cite gone, "finished" is
"solved" in the component and the test, the two dangling cites repointed
(`docs/ui.md → Feedback pill`) or dropped, `BoardCol` hands the snapshot,
`.tileFace` in both stylesheet comments, the reduced-motion edge is
`--reveal-border`, the `BRAND` comment names its two readers, the grant comment
names `legal_guess`, the setup shape lists six keys, PN056's comment and the
four assertion labels say a fault naming no field and `SetupForm.test.tsx`'s
header says the form holds the rule, out-of-turn joins the hard rejections,
Restart in the two `replay` headers, the `42501` line and the "old hardcoded"
aside gone, the board-scope marks' comment points at `common/board-marks/doc.md`,
and the log's docstring is a sentence and a pointer. **Left for pass 3**:
`Board.module.css`'s two `plans/tile-feedback.md` cites, as that pass reads
them. The terminal-flow describe's docstring was already corrected at F-6.

Each checked against the tree:

- `PlayArea.tsx` → `createNewGame`: "so the cast is the usual per-game
  narrowing" — there is no cast; Step 2's loader narrows `setup` once.
- `PlayArea.tsx` → the reveal: "a wordle can only be FINISHED by typing the
  answer" — solved; a wordle finishes on the budget and the clock too.
  `PlayArea.test.tsx` → "SOLVING shows the answer unasked" says the same.
- `PlayArea.tsx` cites `docs/ui.md → the two feedback slots` and
  `docs/common.md → GamePageCtx.setup`; `lib/terminal.ts` cites
  `docs/mobile.md → feedback text`. None of the three phrases exists in the
  doc it names.
- `Board.tsx` → the `isViewingHistory` prop: "PlayArea also hands historical
  `rows`" — `BoardCol` does.
- `Board.module.css` → `.grid` and `.tile`: "wordle's tiles are the shared
  `.tile`", "The box comes from the SHARED `.tile`" — the board composes
  `shared.tileFace`; `.tile` is the button class the same comments say wordle
  does not take.
- `Board.module.css` → `.reveal`'s reduced-motion arm paints
  `border-color: var(--reveal-bg)` where the keyframes paint
  `var(--reveal-border)` — the one place a settled tile's edge is its fill.
- `manifest.ts` → `BRAND`: "both manifests' name and the start-game error read
  it" — nothing but the two `name`s reads it.
- `manifest.ts` docstring: "the brand lives only in the BRAND const below" is
  true; "The game itself is `doc.md`'s" fine. `labelFor`'s comment "compete
  never updates these" — true.
- `supabase/sql/wordle.sql` → the column grant: "everything EXCEPT `target`" —
  `legal_guess` is withheld too (and `games_state` omits it); the frontend
  reads the band off `setup`, so nothing is broken, but the sentence is.
- `wordle.sql` → `create_game`'s header: the setup shape lists four keys of
  six (`coop_style`, `first_turn_user_id` missing) — connections' F-12 had the
  same.
- `wordle.sql` → PN056: "it names the field the form can fix" — the raise is
  `column = '_'`, `hint = 'fault'`; it names nothing, correctly, since the
  form floors the control and `validate` gates Start, so the server seeing it
  means a broken client. `create_game_test.sql` labels four assertions "names
  the max_guesses field" / "the answer_source field" / "the legal_guess field"
  / "the legal band" against envelopes asserting `"field":"_"`.
  `SetupForm.test.tsx`'s header makes the same claim in its first paragraph
  and its last describe says the opposite ("raises NO form-validations") — the
  second is right.
- `wordle.sql` → `submit_guess`'s header lists the hard rejections and omits
  out-of-turn (PN243, `_require_turn`, which `turn_order_test` pins).
- `wordle.sql` → `replay_board`'s header and `replay_test.sql`'s: 'The "Replay
  board" game-menu item' — the row says Restart (connections' F-12 corrected
  its twin).
- `replay_test.sql`: "42501 = common.require_game_player's 'not-a-player|'" —
  the assertion under it is PN253 and the raise text is gone.
- `legal_guess_test.sql`: "it would have been legal under the old hardcoded
  ≤4" — archaeology.
- `PlayArea.test.tsx` → the terminal-flow describe: "the word stays HIDDEN at
  every terminal, win included, until THIS viewer asks" — a solver sees it
  unasked, and the describe's own fourth case pins that.
- `PlayArea.test.tsx` → the board-scope marks: "the vocabulary in
  plans/tile-feedback.md" — a plan cite in a durable file, the third in the
  folder beside `Board.module.css`'s two (pass 3's to repoint at
  `common/board-marks/doc.md`, the way connections' Step 8 did).
- `GameEventLog.tsx`'s docstring restates the shared picker's behavior for a
  paragraph ("solo is your handle, coop is 'Team' plus each player…") — a
  sentence and a pointer at `useEventLogPlayerPicker` is the rule.

### SHIPPED · F-wordle-15 · `small-shapes` · types, props and derivations that say a little more or less than the code

**Shipped 2026-09-22, with F-14**: `guesses_used: number` on both arms,
`historyActor: Actor | undefined` required, `Player` and its `Member` import
gone from `useGame.ts`, `PlayArea` reads its own `mode` / `maxGuesses` /
`mySolved`, the strip's `metricFor` asks the rows for everyone. **Left, being
Joel's words**: the two sentences for one standing state (the pill's *Solved —
waiting on the rest* / *Out of guesses — waiting* beside the row's *Waiting for
others*).

- `BoardCol.tsx` → `GuessAnswer.guesses_used: number | null` — the column is
  `not null default 0` and both `ok` shapes return `p_used` or `new_used`;
  `WordlePlayerState` types the same fact `number`.
- `BoardCol.tsx` → `historyActor?: Actor | null` is optional while `PlayArea`
  always passes it — the reasoning that made `<Board>`'s props all required
  (Notes, 2026-09-22) applies one prop up.
- `useGame.ts` → `export type Player = Member` has no reader.
- `PlayArea.tsx` reads `game.mode` and `game.max_guesses` in the JSX where
  `mode` and `maxGuesses` were derived above, and computes
  `selfSolved: solvedIds.includes(session.user.id)` beside `mySolved`, the
  same fact.
- `InfoCol.tsx` → the strip's `metricFor` branches `isSelf ? guessesUsed :
  playerStates.find(…)` where the find answers both.
- Two sentences for one standing state: the pill says *Solved — waiting on the
  rest* / *Out of guesses — waiting* while the row's line says *Waiting for
  others* (Joel's words, if they should be one).

### SHIPPED · F-wordle-16 · `roster-gap-setup-psql` · `supabase/tests/wordle/setup.psql` reads `cs-unmet`

**Shipped 2026-09-22**: `setup.psql` is `cs-met-wordle` (`cs-stamp.mjs set`),
the roster's 48th file; the roster table below counts it. A `met` stamp is the
one Claude sets on an agreed roster — the pgTAP folder was agreed at the
opening, and connections' fixture took the same stamp the same way.

The roster names eleven pgTAP files; `setup.psql` — the per-file fixture every
one of them `\ir`s — carries a stamp and it is not this area's. connections'
closing re-read found the same (its finding 13) and stamped it
`cs-met-connections`. Roster by Joel's word, as there.

### SHIPPED · F-wordle-17 · `test-gaps` · rules nothing exercises

**Shipped 2026-09-22**: the compete timeout came with F-8; `concede_test`
gained the mixed table (ada concedes, bea burns her budget → `lost_compete`,
`exhausted`, no winner); `compete_test` gained the tie-break, pushing one
`solved_at` a minute into the future so the count alone cannot pick;
`PlayArea.test.tsx` gained the tie read from the rows, both sides. **Verified
by planting three faults**: the tie-break ordered `desc` (1 red), a mixed table
reading `conceded` (1 red), the client never inferring a clock win (1 red),
each restored. `doc.md`'s Tests rows name the new pins. pgTAP 181 / 2559 PASS,
402 unit tests.

- **A compete timeout**, either outcome (F-8): `submit_timeout`'s compete
  branch has no pgTAP at all.
- **The mixed `lost_compete`** — one racer conceded, one spent the budget —
  reading `exhausted` rather than `conceded`, which `_maybe_finish_compete`'s
  comment calls out and `concede_test` does not reach (it pins all-conceded).
- **The tie-break** — `compete_test` says `now()` is constant in a transaction
  so it is "not exercised"; `solved_at` can be set directly as the superuser,
  the way `replay_test` ages the clock.
- **`wonByClock` and `selfTiedWinner`** — `terminal.test.ts` walks the builder
  given the flags; nothing feeds the flags from `playerStates`. A render case
  with two solvers on the same count, one the winner, would pin the inference
  `PlayArea` makes ("if any OTHER solver used the same guess count as the
  winner, the clock broke the tie").

### What checked out

- **The hidden target** — the column grant, the definer helper gated on
  `is_terminal`, the invoker view, and the re-shield on Restart; `_sync_title`
  never spells an unearned answer, in both modes, and `reveal_test` pins the
  regression it once had.
- **The seam** — `eventToOutcome` and `peerAnswerMessage` on one `answerMessage`;
  the two `ok` shapes carry the fact alone and `gameplay_test` pins the nulls.
- **`_maybe_finish_compete`** — racing is not conceded, not solved and under
  budget; the winner is fewest guesses then earliest solve, conceders out;
  `conceded` only when every player conceded.
- **The presence roster** — a solver or an exhausted racer is
  `locally_terminal`, not `conceded` (F-connections-5's fix, pinned in
  `compete_test`).
- **The evaluator's absence** — the frontend recomputes no color; the printer's
  keyboard is derived per player from `colorRank`, never pooled.
- **The events table** — `kind = 'guess'`, `took_turn = true`, read by `id`;
  the migration numbered the existing rows in write order and checked itself.
- **Turn order** — seated by `create_game`, gated before the soft rejects,
  advanced on an accepted non-terminal guess, rewound by Restart.
- **The loader and the eight sections** — the shape `docs/playarea.md` states,
  with the standard trio, Reveal, New game and Print bound in one block and
  read in one order by the row and the menu.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`src/wordle/doc.md` instead; a note here never stands in for either)*

### Nine games carry a copy of the end-for-all item — 2026-09-22

Found while answering F-2, and for `game-page` rather than for here: wordle,
wordiply, wordwheel, crosswords, stackdown, spellingbee, letterboxed, waffle
and boggle each hold the same paragraphs in their own `todo.md`, restating a
decision whose home is `common/game-page/todo.md`. wordle's is deleted with
F-2; the other eight are each that area's to drop, or the sweep's to clear
when it ships. Nothing here proposes touching them.

### `<Board>`'s props are all required — 2026-09-22

Joel, reading the file: six of the thirteen were optional with defaults
(`isViewingHistory`, `historyLitBoardRow`, `rejectNonce`, `gameOver`,
`notMyTurn`, `myTurnJustStarted`) while `BoardCol` passed every one; nothing
else renders `<Board>`, tests included. Three were already required on
`BoardCol` itself, so the defaults could not fire. They are required now.
`rejectOutcome`'s existing reason is kept and loses its `REQUIRED:` label,
which only distinguished it while its neighbors were optional.

### The judged tile colors moved to `wordle-style` — 2026-09-22

Out of Joel's question while reading `Board.module.css`: *"wouldn't this be in
wordle-style because waffle would also need this?"* It was — `.wordleGreen` /
`.wordleYellow` / `.wordleGray` were byte-identical in wordle's and waffle's
`Board.module.css`, and nothing shared painted them. They are now
`src/shared/wordle-style/tileColors.module.css`, imported as `tileColors` by
both boards, which is the import both files already do twice (`shared`,
`history`).

**`blank` stayed with each board, and that is the decision in it.** The two
games mean different things by an unjudged tile — wordle's is a slot nobody has
typed into (transparent, the board's resting look), waffle's is a tile whose
colors have not arrived (a light fill, since every other tile there has one) —
so the boards branch: `color === 'blank' ? styles.blank : tileColors[color]`.
That branch made the `blank` half MORE checked than it was: a computed
`styles[color]` is invisible to `cssClasses.test.ts`, while a written
`styles.blank` is not.

**The two cascade questions were asked and answered before the move, not
after.** (1) waffle's `.inFlight` and a judged color are never on the same tile:
`PlayArea.tsx` sends `unjudgeCells(self.colors, pendingSwap)`, so a swapping
cell is `blank`. (2) Everything shared that lands on a colored tile beats it on
SPECIFICITY rather than order — `.tile.selected` and `.tileFace.verdictFill`
are doubly qualified with that written in their comments, and `.dimInFlight` /
`.attentionFlash` paint pseudo-element overlays. So no same-specificity race
crossed a module boundary that wasn't already crossing one.

`tileColor.test.ts` moved with it: its discovered PAINTERS are three sheets now
(the shared one, the keyboard, wordle's event log), and the keyboard's lone
`blank` exemption became a two-line list with the reason each gives. Planted
both halves — a renamed class in the shared sheet fails the palette guard, a
renamed `.blank` in waffle fails `cssClasses` twice.

**Not the event log and not the keyboard.** `GameEventLog.module.css` and
`GuessKeyboard.module.css` paint the same three names with different
declarations (a chip's `background`/`color`; a key plus its hover token), so
there was never one block for four files to share — only two.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] `docs/games/wordle.md` reconciled with `todo.md` (Step 1) and absorbed
      into `src/wordle/doc.md` (the prose pass); the file is deleted
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
