# Area: wordle

**Brand: WordNerd.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordle/todo.md`, not here.

**Status: OPEN** (2026-09-22). **Pass 1, the restructure, is DONE** (Steps
0–8); **pass 2, the audit, is open — the prose pass shipped (`39ec69c5`),
and five findings are recorded, all OPEN**: the two todo items (F-1, F-2)
and three the prose pass saw (F-3 to F-5). Next: the findings one at a time.
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
| `supabase/tests/wordle/` | 11 | every pgTAP file but one |

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

### F-wordle-4 · `compete-min-unchecked` · the server accepts a one-player race

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

### F-wordle-5 · `unused-setup-prop` · `InfoCol` takes a `setup` it never reads

`InfoCol`'s props type declares `setup: WordleSetup` under *Setup
disclosure*, `PlayArea` passes it, and the component destructures only
`setupRows` beside it — the disclosure renders the rows. The type import is
what keeps the lint quiet: an unused member of a props type is not an unused
variable. Options: **delete it** — the prop, the pass-through and the
`WordleSetup` import from `InfoCol.tsx`; or keep it for a reader nobody has
named. Recommendation: delete it, a prop with no reader being a claim the
component makes about itself that is false.

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
