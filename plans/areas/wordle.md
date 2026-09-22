# Area: wordle

**Brand: WordNerd.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordle/todo.md`, not here.

**Status: OPEN** (2026-09-22). Pass 1, the restructure: Steps 0–5 done, Step
6 (the builder to `lib/`) next. **Three passes back to back**, psychicnum's and
connections' shape: restructure → audit → tile-feedback.

## The roster

Agreed with Joel 2026-09-22, `cs-met-wordle` — **44 stamped files**:

| where | how many | note |
|---|---|---|
| `src/wordle/` | 30 | nine arrived `cs-fixed-outcome-fix` — that area ruled its files belong to their own area, which is this one |
| `supabase/migrations/` | 2 | `20260625000000_wordle.sql`, `20260917000001_wordle_events.sql` |
| `supabase/sql/wordle.sql` | 1 | also `cs-fixed-outcome-fix` |
| `supabase/tests/wordle/` | 11 | every pgTAP file but one |

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

## Findings

*(`F-wordle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/wordle.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordle.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
