# Area: connections

**Brand: WordKnit.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/connections/todo.md`, not here.

**Status: OPENED 2026-09-19** (Joel: *"open the connections area. this will
be our second game audited; it has a lot of similarities to psychicnum, so it
should end up being similarly-shaped"*). Roster agreed the same day — fifty
files `cs-met-connections` (Joel: *"the things marked with
cs-fixed-outcome-fix can go to cs-met-connections. the puzzle importer should
be part of this area"*).

**Three passes, back to back**, the shape `psychicnum` settled (app-audit.md
§3, the game rows): the **restructure** —
[playarea-readability.md](../playarea-readability.md) step by step, each step
a commit Joel reads — then the **audit**, React, SQL and CSS together, then
the **tile-feedback pass** against [tile-feedback.md](../tile-feedback.md).
The restructure goes first because the audit's prose pass would otherwise
polish comments the split and the comment pass rewrite or delete.

**The order, corrected 2026-09-19 from psychicnum's COMMIT history** (Joel:
*"make sure you've read what did in that game and the history of its commits
since the section opened"*). psychicnum's area file lists Steps 0–6 and then
pass 2; its log shows what came between: the `doc.md` skeleton with the RPC
and FE-submission sections written (`ba44e3d9`), then the `AnswerMessage`
conversion (`a5ff4ca4`, `b02d8dbd`, `1ceafbc3`), then an e2e run, then pass
2. For this game Joel moved both EARLIER — right after the loader split,
before the actions, the section order and the comment pass — so the steps
here are: 0 baseline · 1 owed work · 2 loader split · **3 the doc's RPC and
FE-submission sections · 4 AnswerMessage** · 5 actions and the row · 6 the
builder to `lib/` · 7 the section order · 8 the comment pass. Then pass 2.

**This is the SECOND game, which changes one thing about the restructure.**
psychicnum cut nothing shared — *"a shared hook is a rule-of-three cut, and
one game cannot prove sameness"* — so the readability plan's slots (3.3), its
`useGameMenu` and its standing-condition hooks (3.8) were left for the second
game. Here they can be weighed against two games; whether two is enough is
Joel's call when each comes up.

## The roster

Listed 2026-09-19 (`src/connections/`, its SQL, its pgTAP, its doc), from
`git ls-files`. Stamps at the opening: twelve files `cs-fixed-outcome-fix`
(the move path `outcome-fix` worked), thirty-seven `cs-unmet`, and the
markdown and the logo none.

- **`src/connections/` — 38 files** (6,317 lines of code; the three biggest
  are `PlayArea.test.tsx` at 989, `PlayArea.tsx` at 792, `BoardCol.tsx` at
  564). components: `Board.tsx`, `BoardCol.tsx`, `GameEventLog.tsx` +
  `.module.css`, `Help.tsx`, `HintList.tsx` + `.module.css`, `InfoCol.tsx`,
  `PlayArea.tsx` + `.module.css` + `.test.tsx`, `SetupForm.tsx` + `.test.tsx`,
  `StrikeMarks.tsx` + `.module.css`. hooks: `useGame.ts` + `.test.ts`. lib:
  `answer.ts` + `.test.ts`, `board.ts`, `evaluate.ts` + `.test.ts`,
  `history.ts` + `.test.ts`, `localOrder.ts` + `.test.ts`, `rankColors.ts`,
  `setup.ts`, `setupSummary.ts`, **`terminal.ts` + `.test.ts` (created by
  Step 6, 2026-09-19)**. pdf: `model.ts` + `.test.ts`,
  `printConnectionsPdf.ts`. root: `db.ts`, `manifest.ts` + `.test.ts`,
  `theme.css`, `logo.svg`, `todo.md`, and **`doc.md`, written at Step 3**
  (2026-09-19) in psychicnum's shape (Intro to area · Game rules · Schema ·
  RPCs · FE submissions · Frontend · Tests), the RPC and FE-submission
  sections filled and the rest owed to pass 2, which also deletes
  `docs/games/connections.md` (820 lines) into it.
- **SQL — 3 files**: `supabase/migrations/20260615000003_connections.sql`,
  `supabase/migrations/20260917000005_connections_events.sql`,
  `supabase/sql/connections.sql` (1,520 lines).
- **The pgTAP suite — 11 files**, `supabase/tests/connections/`:
  `club_game_status`, `compete`, `concede`, `create_game`, `end_game`,
  `gameplay`, `next_puzzle`, `replay`, `rls`, `turn_order`, and `setup.psql`
  (the per-game helpers; `.psql` carries no stamp). This game's own files, and
  the stamp scope covers `supabase/`, so roster.
- **The puzzle importer — 1 file**: `supabase/scripts/import-connections-puzzles.ts`
  (211 lines; the NYT archive, through the REST API). It lives in
  `supabase/scripts/`, which no row of §3 names, and is this game's alone —
  roster by Joel's ruling at the opening.
- **Doc — 1 file**: `docs/games/connections.md`, roster and unstamped, deleted
  at the harvest the way psychicnum's was.

**Not the roster, and why:**

- **The net**: five e2e specs (`connections-enter-submit`, `-history`,
  `-mobile`, `-print`, `-replay`), the gallery script
  `e2e/gallery/games/connections.ts`, `e2e/board-geometry.e2e.ts` (this is one
  of its boards), `PlayArea.test.tsx` and the pgTAP suite. Run, not read as
  roster; the e2e runs are asked for first, every time.
- **The `connections.puzzles` rows** the importer fills — data, which has
  nowhere to carry a stamp (step 11's).

## The restructure — plan

Each step is one commit Joel reads; every step is a behavior-preserving no-op
unless its heading says otherwise, verified by the net. The shape is
psychicnum's, written into
[docs/playarea.md → The shape of a game's PlayArea.tsx](../../docs/playarea.md):
this game conforms to it, and where it cannot, this file says why.

### Step 0 — the baseline

Run 2026-09-19 (Joel: *"do it"*), on the untouched tree with the roster
stamped `cs-met-connections`:

- `tsc -b` clean, lint clean over `src/connections/` and the importer.
- The game's unit tests and the guards: 40 files, 372 tests, green
  (`PlayArea.test.tsx`, `useGame.test.ts`, `answer`, `evaluate`, `history`,
  `localOrder`, `manifest`, `pdf/model`, `SetupForm`).
- The geometry harness re-seeded with `BASELINE=1`: twelve boards written,
  and the new file is byte-identical to the one it replaced — no board had
  drifted since the last seed.
- The five connections e2e specs: 9 tests, green in 17 seconds.

**Step 0 is DONE (2026-09-19).** A later red is the step's.

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-19

Every place that owed or named connections work, read, and where each item
went:

- **`docs/games/connections.md` → Deferred held three real items** — the
  `as GameRow | undefined` cast in `useGame.ts` (still there, now at line
  295), Joel's 2026-08-25 "next puzzle" remark with the question of which
  behavior he meant, and the per-tile match animation. **All three are
  `todo.md` → Maybe now**, the doc's section body is a pointer at the todo
  (the heading goes when the doc is deleted in pass 2), and `deferred.md`'s
  row links the todo the way psychicnum's does. The animation item says pass 3
  is where it is weighed. The "next puzzle" item lost its quoted message text:
  the override's words moved since it was written.
- **`todo.md` already held three Bugs and five Soons.** One Soon is gone: *"a
  race here has no way to stop the whole table"* is the item psychicnum found
  to be every compete game's, and `common/game-page/todo.md` has owned it
  since 2026-09-19. The rest stay, and the restructure's steps close several
  of them as they open the file each lives in — see *Which step closes what*.
- **`plans/tile-feedback.md`** names connections as tf1 (2026-08-17) with one
  open question in its shape section (does a wrong or near guess want the
  FLASH as well as the verdict?). Pass 3's instructions; nothing moves.
- **`common/game-page/todo.md`'s "tone" item** names connections'
  `verdict.tone` as being fixed by `outcome-fix`; it was — no `tone` for an
  outcome is left in this game (the one hit is a chrome comment about the
  amber hint list). Nothing owed. stackdown's and strands' todos name
  connections only as the worked example.

**Which step closes what**, from the todo as it stands:

| item | closed by |
|---|---|
| `act-new-game` live before the row loads (Bugs) | Step 2, the loader split |
| the Hints row live when the list is not drawn (Bugs) | Step 5, the actions |
| collapse the action row's branches (Soon) | Step 5, the row |
| `shuffleTiles` hand-written (Soon) | Step 5, since `BoardCol` is open there — as psychicnum's was |
| `revealedHints` back into `<HintList>` (Soon) | a restructure step with the column open, or pass 2 |
| `matched` derivable on `EventRow` (Bugs) | pass 2 — a decision |
| an eliminated racer pauses the survivors (Soon) | pass 2, with the SQL open — a decision |
| the three Maybes | pass 2 or pass 3, as each says |

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-19

The shape psychicnum settled, copied: `PlayAreaLoader` owns `useGame` and
the three gates — `<Loading>`, `<EnvelopeErrorPage>`, `<NoSuchGamePage>`
(its `detail` names the read that came back empty, `rows=0
table=connections.games`, since this hook reads the table and not a view) —
and hands `PlayArea` a non-null game plus the ten things the hook returns
beside it, including the selection state (`selections`, `unionTiles`,
`toggleTile`, `sendClear`) that `useGame` keeps for the Broadcast. The cast
happens once, in the loader's JSX; the inner component takes
`setup: ConnectionsSetup` through `Omit<GamePageCtx, 'setup'>`. The
manifest's lazy line names the loader; the test file mounts it at all
thirty-five sites, `useGame` mocked exactly as before.

**What went with it**, all in this commit: every `game?.` (six), `gameMode`
and its `if (!gameMode) return` in `createNewGame`, the `mode ?? 'coop'`
default, the three `setup` casts, `boardView`'s null branch and the `!` at
its read, Print's `describe: () => (game && boardView ? 'active' : 'hidden')`
(now `'active'`) and the `if (!game || !boardView) return` inside its run,
the two `game.mode` reads in the render section (every read is `mode` now),
and four comments whose reason was the early return: "hoisted ABOVE the early
return so the print-model build … reads the SAME values", "Above the early
returns because effects must be", "(`myConceded` is derived above the early
returns so the header-menu effect can read it)", and "menu exists pre-load".
The old inline `<p>Loading board…</p>` and `<p>Game not found.</p>` are gone.

**One behavior change, stated now**, the same one psychicnum's split made:
while the read is out the header menu has no game rows and `+` does nothing,
where before the rows were published pre-load and `+` asked the new-game
question and then could not act. That was the `act-new-game` Bug in
`todo.md`, closed by this step and deleted there.

**Not this step's, and left for Step 7 and Step 8:** `boardView` still
computes `locallyDone` and `unmatched` that the render section computes a
second time — the memo existed for the early return and no longer needs to
be one, but where those derivations sit is the section order's question. The
surface's docstring still describes the pre-split file; Step 8 rewrites it.

Verified: `tsc -b` clean, lint clean, 372 unit tests green (the game's and
the guards). The e2e specs have not run for this step.

### Step 3 — the `doc.md` skeleton, with the RPCs and FE submissions written — DONE 2026-09-19

As psychicnum's `ba44e3d9`: `src/connections/doc.md`, seven headings, with
the lede, a short intro (three things that are high-level about this game:
the frontend knows the answer, a coop guess is picked together over
Broadcast, the archive is a queue), the RPCs and the FE submissions written
from the SQL and the call sites — not from the old doc — and Game rules,
Schema, Frontend and Tests marked owed to pass 2. The guards are green with
the file staged.

**Written against the code, and where the old doc disagreed:** the old RPC
section says a duplicate guess is "an `ok` with nothing to say" and that a
racing correct guess is "silently no-op'd"; the SQL raises PN301 and PN300,
both races, and the doc says so in a clause. It also spells the setup key
`puzzleId`; the key is `puzzle_id`. Both are the old doc's to lose when pass
2 deletes it.

**Corrected the same day** (Joel: *"i specifically told you during psychicnum
that listing PN codes/not-ok responses is useless clutter in the RPC
section"*): the first draft listed the refusals per RPC with their codes.
The section is the `ok` answers only; a not-ok that is part of the game's
story is a clause without a code.

**Two things the doc records as they are TODAY, which Step 4 changes:** the
`submit_guess` reply carries its outcome in the envelope beside the fact,
and the words a player reads are written at three call sites (`BoardCol`'s
three verdicts and its refusal, `PlayArea`'s three peer lines) with
`lib/answer.ts` holding only the outcome table. The FE-submissions table
lists all seven with where each is written, which is the inventory Step 4
starts from.

### Step 4 — the `AnswerMessage` conversion — DONE 2026-09-19

Joel, 2026-09-19: *"this definitely part of the audits we'll do for games"*,
*"not a 'Soon' item"*, and it comes here, before the actions and the prose
passes. psychicnum's shape (`a5ff4ca4` and the two trims after it), copied:
an `ok` RPC returns the FACT and nothing else; a call site names an
`answerType`; one function in `lib/answer.ts` turns that into the outcome and
the text, with a `_peer` twin per answer, so the pill, the log bar and the
peer line read one table.

**The three word decisions, Joel's (2026-09-19):**

1. The word for a wrong guess was three words on my own surfaces — the pill
   `Incorrect`, the log and the history banner `Not a match`, the printer
   `miss`. Ruled: *"pill='Wrong', history-banner='Not a match'"*. The log's
   own row keeps `Not a match` too, since it writes its own words.
2. A pair shares its wording (*"make similar"*): `Correct` / `Correct`,
   `One away!` / `One away!`, `Wrong` / `Wrong`. The peer lines `found
   category`, `was one away`, `guessed wrong` are gone.
3. The local pill stays `Correct` and never names the category (Joel: *"the
   category wouldn't fit in the pill"*). I had argued for it from a band
   "under the pill"; the band is on the board ABOVE the pill — corrected when
   he asked.

**What shipped.** `lib/answer.ts`: the wire word is `GuessResult` now (its
five readers renamed — `evaluate` produces one, `BoardCol` sends and reads
it, `useGame` reads it off a row, `history.ts` off a turn, `Board.tsx` for
the tint), `Answer` is the seven-member union, `answerMessage()`,
`eventToOutcome(row)` and `peerAnswerMessage(row)` replace `ANSWER_OUTCOME`.
`useGame`'s seam reads `eventToOutcome`; `BoardCol`'s three ok branches and
its refusal call `answerMessage` and the `res.outcome !== null` guards are
gone; `PlayArea`'s peer lines call `peerAnswerMessage`. The log, the history
banner and the printer keep their own words and take the color only. The
two `ok_envelope` calls in `submit_guess` dropped their outcome argument, and
the three gameplay pins assert `"outcome": null` — **verified by planting**
one outcome back: the correct-guess pin went red and named itself, restored
green. `answer.test.ts` rewritten to walk the union; `doc.md`'s FE
submissions and the `submit_guess` entry say the new state; the render
test's pin says `Wrong` and its mock envelope carries no outcome.

**Not changed, on purpose:** `docs/outcomes.md` → How a game does it still
describes the `ANSWER_OUTCOME` table and "the pill reads the envelope",
which psychicnum's conversion left standing and this one leaves too — two
games now do the opposite of what it says, and that paragraph is a
`common` doc's to rewrite. `EventRow.matched` stays; its todo Bug is pass
2's.

Verified: `tsc -b` clean, lint clean, 381 unit tests green (the game's and
the guards), the whole pgTAP suite green (179 files, 2512 tests). The e2e
specs have not run for Steps 2–4.

### Step 5 — the actions and the row (readability 3.6, 3.7) — DONE 2026-09-19

psychicnum's Step 3, copied. **The row is one `<InfoActionsRow>` now**, in the
order `docs/playarea.md` states: Hints | Reveal · Restart · New game ·
Concede · End | Back to club, the divider after Hints, Back to club filled
only at terminal. The three-way fork (`over ? … : !showInput ? … : …`) is
gone; the only thing that varies is the row's line — the verdict, "You
conceded" / "You're out" while a race runs on without you, nothing while you
can play. The InfoCol's destructure, its prop-type block and the PlayArea's
prop list read in that same order, and so does the menu.

**The conventions, per binding:** Hints answers `hidden` — row and button —
once you can no longer submit (the todo Bug); Reveal takes the button guard
in front of the shared `describeReveal` (`showInput && asker === 'button'` →
hidden, a grayed menu row all game, since the menu names the glyph); New
game is a button only at terminal, `(asker) => asker === 'button' &&
!isTerminal ? 'hidden' : 'active'`, a menu row and `+` all game; Restart's
was already the shared hook's. `createNewGame` is a plain `async function`.
No in-flight flag existed to remove. The bindings gather in one order: the
shared trio, Hint, Reveal, New game, Print — with `boardView` still sitting
between New game and Print because Print reads it (Step 7's to move).

**Two gates hoisted beside `myConceded`**, since the Hint and Reveal
bindings read them: `locallyDone` (was declared twice — in `boardView` and
the standing conditions) and `showInput` (was in the render section). Each
is declared once now.

**`revealedHints` moved back into `<HintList>`** (the todo Soon; the column
was open): the list owns its revealed set, PlayArea's `useState` +
`useCallback` and InfoCol's `revealed` / `onReveal` pair are gone, and the
list folds with the Hints button (`open={hintsOpen && showInput}`).
`shuffleTiles` is `shuffle()` from `common/utils` (the todo Soon; `BoardCol`
was open); `lib/localOrder.ts` keeps `reconcileLocalOrder` alone, its three
shuffle cases gone with the function.

**Two behavior changes, stated now.** *Reveal joins the game menu* — today
it was a terminal-row button with no menu twin; the row's order puts it
beside Restart and New game, grayed until the game is over. *An out-of-race
compete player sees a grayed Reveal button* where before they saw none:
the state rule's "possible here, not right now" with the tooltip, as
psychicnum's already does; the test that pinned its absence now pins the
gray. Everything else the collapse could destroy was watched: Back to club
keeps `weight={over ? 'primary' : 'secondary'}`, and the divider is there.

**Four todo items are deleted**: the Hints row, the action-row collapse,
`shuffleTiles`, `revealedHints`. Two new render cases pin the conventions
(the three end-of-game actions are menu rows all game and buttons only at
the end; Hints goes with the input, and the grayed Reveal takes its place).

Verified: `tsc -b` clean, lint clean, 380 unit tests green (the game's and
the guards). The e2e specs have not run for Steps 2–5.

### Step 6 — the builder leaves the component file (readability 3.4) — DONE 2026-09-19

psychicnum's Step 4, copied, with its rename ruling applied from the start:
the builder is **`buildTerminalMessage`** in `lib/terminal.ts` — Joel's word
is "terminal", not "over" — the value it produces is `terminalMessage`, and
InfoCol's `over` prop is `terminalMessage` too. `<Board gameOver>` keeps its
name, being the shared vocabulary backed by the `.gameOver*` classes.
`PlayArea.tsx` no longer imports `gameEndedTerminalMessage` or the
`TerminalMessage` type; the `useMemo` on primitives that feeds the verdict
effect stays there, as planned.

**A no-op with one signature change**: the builder took `selfMatched` and
compared it to `CATEGORY_COUNT`, a constant of the component file; it takes
`selfWon` now, which the PlayArea computes from the `iMatchedThemAll` it
already had for the reveal. Same branches, same words.

`lib/terminal.test.ts` walks the whole input space — every terminal play
state (`won` · `lost` · `ended` · `won_compete` · `lost_compete`) in both
modes, the clock run out and not, the caller eliminated and not — and the
last case is a TABLE: no cell pairs a winning sentence with a losing outcome,
both texts are filled, neither is punctuated. Both files join the roster at
`cs-met-connections`.

**Known and left for pass 2, as psychicnum's F-5 was:** the builder decides
the reason from the client clock (`timer.expired`) where psychicnum's now
reads the server's word, `status.outcome`; and a race that ended because
everyone conceded reads "Everyone eliminated". Pass 2's finding, with the
SQL open.

Verified: `tsc -b` clean, lint clean, 394 unit tests green (the game's and
the guards). The e2e specs have not run for Steps 2–6.

### Step 7 — the section order (readability 3.2) — DONE 2026-09-19

psychicnum's Step 5, copied: `PlayArea.tsx` reordered into the eight
sections in the one order (Page hooks · Derived · The local slot, and its
three standing conditions · Narration — what a PEER did, in the header slot
· The turn-history viewer · The commands, bound · The menu · Render), each
header stating the rule its section follows; `BoardCol.tsx` into five (Which
board is on screen · The marks this column owns · Committing a guess · The
board's display order · Render). For connections that is:

1. Page hooks — `useTabRing`, `useInfoSheet`, `hintsOpen`, `useAcknowledge`,
   `useCelebration`, `useTurnStartFlash`
2. Derived — `myConceded`, `locallyDone`, `showInput`, `iMatchedThemAll` and
   the reveal, `summaryRows`, `boardView`
3. The local slot — the slot and its any-key dismiss, the terminal message,
   out-of-race, waiting
4. Narration — the coop peer effect
5. The turn-history viewer
6. The commands — the shared trio, Hint, Reveal, New game, Print
7. The menu
8. Render — `concededIds`, `remainingTiles`, the snapshot and its actor,
   `ownerByTile`, `colorByUserId`, `found`, then the columns

**Every code line in the diff is a pure move, checked by diff** — each side
of the diff was counted, and the only line removed without being re-added is
the render-time `unmatched` (with its `matchedRanks`), which Step 2 had
reserved for this step: `boardView` already derives it, and the render reads
`boardView.unmatched` now. Nine of this file's old `// ───` sub-headers are
demoted to plain comments inside the section they fall in (the celebration,
the turn flash, the local slot, the viewer, the peer events, the shared
three, the reveal, New game) so the file has eight headers and not
seventeen; `BoardCol`'s two ("When the verdict mark expires", "The board's
three commands") the same. The old standing-conditions header's two rule
lines became the section header's.

**What the reorder showed:** the shared-three comment block (End / Concede /
Replay) sat above the reveal, twelve lines from the `useStandardGameActions`
call it describes; they are together now. `BoardCol`'s `submitting` state
sat at the top of the file with the history flag, and its shuffle state was
split from the shuffle across a hundred lines; each is with its section. Two
orphan comments after the menu ("Hints + End are buttons…", "the guess
dispatch … moved into BoardCol") are stale and left for Step 8, which is the
comment pass.

**`Board.tsx` took the same treatment** (Joel, 2026-09-19: *"do a similar
organizing pass over Board component"*). Four sections: **The rows** (the
sorted bands and the row count, which had sat on the far side of the
attention block) · **Attention** · **A band** (the renderer) · **Render**.
Pure moves, checked by diff the same way.

**And the verdict is a FILL, not a ring** (Joel, same message: *"i noticed
some comments suggests there was a ring around outcomes, but i think that's
outdated now — rings are just for selection and selecting-member-color"*).
Confirmed against the stylesheets: this game's verdict class is
`.verdictFill` (a pale tier of the pill's outcome on the tile's free
background); the shared `.verdictRing` exists for boards whose background is
not free, and connections never wears it. The two rings that do exist are
the `.selected` border and `.peerPick`, the inset band in the picker's
color; the history viewer's `.historyTile` is also an outline, the shared
viewer blue, and its mentions stay. Every "ring" written about the verdict —
seventeen sites across `Board.tsx`, `BoardCol.tsx`, `PlayArea.tsx`,
`lib/history.ts` and its test, `useGame.ts` — now says fill, mark or lit.
`BoardCol`'s `ringShown` is `verdictShown`, since the name carried the
falsehood. One more name went with it, by the standing rule that an outcome
is never a tone: `Board.tsx`'s `VERDICT_TONE`, the class map keyed by
`Outcome`, is `VERDICT_CLASS`.

Verified: `tsc -b` clean, lint clean, 394 unit tests green (the game's and
the guards). The e2e specs have not run for Steps 2–7.

### Step 8 — the comment pass (readability 3.5) — DONE 2026-09-19

psychicnum's Step 6, under the three rules Joel gave there — a comment does
not name a keystroke, "why this lives here" is not worth a comment, "why
Joel decided this" is not a comment — plus the call-site rule (a sentence and
a pointer where a shared mechanism is explained elsewhere) and the
archaeology cut. Four files: `PlayArea.tsx`, `BoardCol.tsx`, `Board.tsx`,
`InfoCol.tsx`. **404 comment lines out, 199 in.**

**The surface's docstring is rewritten around the decomposition** — it
described the pre-split file: a five-bullet mode table whose surfaces had
moved out (the OpponentStrip is InfoCol's, the eliminated look is the row's,
the "terminal copy" is `lib/terminal.ts`'s), a five-step submission flow that
is `BoardCol`'s, and a pointer at `docs/deferred.md → Feedback channels`. It
says now what psychicnum's says: holds no board, draws no control; `mode` is
what differs and where; what a guess is worth is `lib/answer.ts`'s.
`BoardCol`'s docstring the same — it called itself "the input engine" and
listed what it did not own.

**The rules did most of the cutting.** Keystrokes (rule 1): "Enter submits
… (macOS doesn't focus a `<button>` on click …)", "Its ⌫ comes with the
action", "⌥Z shuffles", "(the floating pill and ⌥Z)". Why-here (rule 2): "A
plain function, rebuilt every render: the binding below reads it at click
time…", "Passed into Board so it anchors to the visual board, not the
column", the `sendClear()`-per-branch paragraph. Rulings (rule 3): the
back-to-club weight, "Sitting out with the puzzle unspoiled is the better
version of spectating", the refusal's "worth more as one rule than as a
small convenience". Archaeology: "connections used to be one of the two
games registered hides_solution = false…", "It used to be two FE reads plus
a pure `nextUnplayedPuzzle` helper…", "A RESTART used to be the other half
of this…", "This used to squeeze seven outcomes into three by hand…", "the
waffle loading-race lesson", "the trap the rank squares fell into", the
`(2026-08-02)` band note. Call sites to a sentence and a pointer: the
celebration (`useCelebration` states its three rules), the reveal
(`common/reveal/doc.md`), the envelope paragraphs in `createNewGame` and
`handleSubmit` (`docs/envelopes.md`), the mobile recipe (`docs/mobile.md`).
`plans/tile-feedback.md` is cited nowhere in the four files now — a comment
points at `common/board-marks/doc.md`, since a plan is deleted when it
ships. The two orphan comments after the menu are gone. `InfoCol`'s
twenty-odd member notes written `/**` are `//` (the marker pass; psychicnum's
column had it right).

**Two comments were not stale but FALSE, and are corrected rather than
cut:** the narration comment quoted peer lines that Step 4 replaced ("Bea
found ANIMALS!", "was one away", "guessed wrong"); and the celebration's
reason for coop-only — *"did I win the race?" needs `selfMatched` from
`useGame`, which is 0 until the fetch lands* — stopped being true at Step 2,
since the loader now holds the surface back until the rows are in hand. The
comment says coop-only without that reason; **whether the race's winner
should get the confetti too**, as psychicnum's does since its F-6, is pass
2's finding.

Verified: `tsc -b` clean, lint clean, 394 unit tests green (the game's and
the guards). **The restructure is complete**, and the e2e ran clean for
Steps 2–8 (see Predicted test breaks).

### After the restructure — pass 2, the audit

The area's ordinary process from here: the prose pass, then findings one at a
time. Already known to belong to it:

- **The doc**: `src/connections/doc.md` in psychicnum's shape, absorbing what
  `docs/games/connections.md` says that the code does not; the doc is then
  deleted.
- **From `todo.md`**: `matched` derivable on `EventRow`; the eliminated racer
  who pauses the survivors (with the SQL open); `revealedHints` back into
  `<HintList>` if no restructure step has taken it.

## Findings

*(`F-connections-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### The audit's findings — 2026-09-19

**The READ is DONE.** Every roster file the restructure had not opened, end to
end: `useGame.ts` + its test, the eight `lib/` files, `pdf/model.ts` + test and
the printer, `manifest.ts` + test, `db.ts`, `theme.css`, `GameEventLog.tsx` +
css, `Help.tsx`, `HintList.module.css`, `PlayArea.module.css`, `StrikeMarks.tsx`
+ css, `SetupForm.tsx` + test, the rest of `PlayArea.test.tsx`, the SQL file's
every comment, both migrations, the eleven pgTAP files, the importer, and the
old doc. And the checks beside them: what reads `club_game_status` (nothing in
`src/`, only the generated types), whether the daily-import workflow exists
(it does), what `next_puzzle_test` actually asserts (PN302, not the `warning`
its header claims), and what the stylesheets draw.

What the game IS, for the record: the code held up. The evaluator, the seam,
the projection, the printer's A–D and the pgTAP suite are right; the
restructure left a surface in the shape psychicnum settled. What has
drifted is the prose — an unusual amount of it, because this game was the
FIRST to do several things (Broadcast, the archive, the calendar it later
lost, the events rename, the race codes) and each change left its previous
explanation standing next door. Twenty findings: six with a decision in them
(F-1 to F-6), one about a shared doc (F-7), and the rest prose, tests and
small shapes.

### SHIPPED · F-connections-1 · `race-winner-celebration` · the race's winner gets no confetti, and the stated reason is gone

**Joel, 2026-09-19: "the same here."** The gate is `playState === 'won' ||
(playState === 'won_compete' && iMatchedThemAll)`; `iMatchedThemAll` moved up
into Page hooks beside the hook that reads it (Derived's reveal now reads the
name rather than declaring it), and the modal's body says *You found all four
first.* in a race. Four cases in `PlayArea.test.tsx` — the racer who matched
all four with the bands landing a render after the play state, the beaten
racer, a reload of a race already won, and the coop team. The card's handle
there is its `<h2>`, not its words: coop's verdict PILL also says *You win!*.
**Verified by planting two faults**: the gate back to coop-only (1 red), and
the body fixed to the coop sentence (1 red). `doc.md` said "a coop solve
celebrates" in two places and now says what the rule is.

`useCelebration(playState === 'won')` — coop only. The comment's reason (cut
at Step 8, since it was false) was that "did I win the race?" needs a count
from `useGame` that is 0 until the fetch lands, so a won race opened fresh
would pop confetti at a reviewer. Since Step 2 the loader holds the surface
back until the rows are in hand, so both gates are correct on the first
render, which is exactly what `useCelebration` requires. psychicnum's F-6
found the same dead reason and gave its race winner the celebration
(`playState === 'won_compete' && iFoundThemAll`). Options: *the same here* —
`playState === 'won' || (playState === 'won_compete' && iMatchedThemAll)`,
with the modal's body reading per mode — or *keep coop-only* as a design
choice with a comment that says it is one. Recommendation: the same here; a
race's winner has more to celebrate than a team, and the pill alone says
"Won: the race" in the corner.

### SHIPPED · F-connections-2 · `terminal-reads-the-clock` · the terminal message decides the reason from the client clock, and cannot say "all conceded"

**Joel, 2026-09-19: "do it."** The builder's inputs are `mode · playState ·
reason · selfWon · selfEliminated`, `reason` being `status.outcome`; the call
site reads `status` off the context (the prop it never destructured) and the
`timer` prop is gone from this component. `lost_compete` gained *All conceded
— no winner* / *All conceded*; a MIXED table stays "Everyone eliminated",
which is the server's own call in `connections.concede` and what the
club-list label says from the same word. `lib/terminal.test.ts` walks every
word `status.outcome` can hold (plus `undefined`) instead of a boolean, and
`PlayArea.test.tsx` gained the WIRE: an all-conceded race whose clock never
ran out reads the server's word. **Verified by planting two faults**: the
builder blind to `conceded` (2 red) and the call site back on
`timer.expired` (1 red). The SQL's timeout header and `doc.md`'s status
paragraph said the club-list label reads the column; both now name the pill
beside it.

`buildTerminalMessage` takes `timerExpired` off `timer.expired` — the
browser's clock — where the RPC that ended the game wrote WHY into
`common.games.status.outcome` (`solved` · `mistakes` · `timeout` · `conceded`
· `manual`), which the club-list label already reads. Two consequences: a
`lost_compete` because everyone conceded reads "Everyone eliminated", and a
timeout that lands while the local clock still shows a second reads as a
mistakes loss. psychicnum's F-5 fixed the same: the builder takes `reason`
from `status.outcome`. Options: *read `status.outcome`*, the builder's inputs
becoming `mode · playState · reason · selfWon · selfEliminated`, with "All
conceded — no winner" as the third `lost_compete` sentence — or *leave the
clock*. Recommendation: read the server's word.

### F-connections-3 · `help-text-wrong` · the Help modal tells players three things that are not true

Player-facing text, so a finding rather than a fix:

- *"Wrong — costs one mistake."* — a one-away costs one too (the SQL charges
  both, and the Help's own line above it does not say so).
- *"Four mistakes and the game ends with the categories revealed."* — nothing
  autoreveals; the ended board is the bands plus the tiles never cracked, and
  Reveal is a button (the `reveal` area's rule, and this game's own since
  2026-08-02).
- *"Selections are shared across everyone in the game — when a peer clicks a
  tile, you see it framed in their color."* — coop only; compete keeps every
  pick local.

And its docstring calls the whole thing "placeholder content … deferred until
we have a unified visual register", with "copy" twice. Joel's words for the
three lines; the docstring loses the placeholder claim either way.

### F-connections-4 · `matched-derivable` · `EventRow.matched` is `result === 'correct'`

From `todo.md` → Bugs. The seam derives both from one column; the docstring
defends `matched` as "the rule, kept separate from the look", which argued
against asking a COLOR — an argument that ended when `result` joined the row
on 2026-09-17. Six readers ask `g.matched` (the projection, the log, the
history builder, the printer twice, BoardCol's "a teammate's guess that did
not win"). Options: *keep the field, rewrite its note* — it is the fact
readers ask, spelled once at the seam so no reader tests a wire word — or
*drop it* and have the six ask `result === 'correct'`. Recommendation: keep
it; the field is what makes the seam a seam.

### F-connections-5 · `eliminated-racer-pauses-survivors` · an eliminated racer still pauses the game for the survivors

From `todo.md` → Soon, with the SQL open now. The presence-pause roster is
the game's players minus conceders (`common.game_players.conceded`), and a
fourth mistake eliminates in `connections.players.mistake_count`, which
`common` cannot see — so closing an eliminated tab pauses everyone still
racing. Three ways out: *(a) elimination also sets `conceded`* in
`submit_guess` at the fourth mistake, so the shared roster rule sees it —
and `_maybe_finish_compete`'s outcome word is then computed from mistake
counts (every player at four → `mistakes`, otherwise `conceded`) so the
club-list label stays true; *(b) a second exclusion in the roster rule*,
which needs the eliminated fact exposed to `common`; *(c) accept it* and
write the caveat as a rule in `doc.md`. Recommendation: (a) — one flag
meaning "out of the race", however you got there, and the pgTAP concede and
compete suites pin the words.

### F-connections-6 · `unread-view` · `club_game_status` has no reader, and its comments describe a calendar that is gone

The view (`supabase/sql/connections.sql`), its thirty lines of comment ("the
setup-form calendar asks … colors each calendar square"), its pgTAP file
(`club_game_status_test.sql`, "powers the calendar widget"), and the puzzles
grant's "the setup-form date picker reads this list" all describe the picker
deleted 2026-08-13. Nothing in `src/` reads the view; only the generated
types name it. The old doc kept it "as the club-history read any future
surface would want, and crosswords' `club_nyt_status` is modeled on it".
Options: *drop it* — the view, the test, the comments; a `drop view if
exists` at the top of the repeatable file removes it from every database,
and `npm run types:gen` follows — or *keep it and rewrite the comments* to say
what it is for today, which is nothing. Recommendation: drop; a reader that
wants it can write it, and the file it is modeled on is crosswords' own.

### F-connections-7 · `outcomes-doc-describes-the-old-shape` · `docs/outcomes.md` → How a game does it is the `ANSWER_OUTCOME` table

The shared doc says "each game has a `lib/answer.ts`" with a static table
from answer words to outcomes, that "the PILL reads the RPC's envelope", and
that a game pins its SQL half "with an `outcome` assertion in pgTAP".
psychicnum's conversion and this one do the opposite on every point — an `ok`
carries no outcome, the pill reads `answerMessage`, and the pgTAP pins assert
the null — and app-audit.md's game row now makes that every game's audit
work. Options: *rewrite the section to the new shape now*, naming the
rollout (two of sixteen; the others convert as their areas open) — or *leave
it until the games conform*, as psychicnum's `a5ff4ca4` chose for
`envelopes.md`'s rule 2. Recommendation: rewrite now; a doc that describes
what the next fourteen areas will remove is a doc that misleads each of them
at its opening.

### F-connections-8 · `stale-table-name` · `connections.guesses` in prose the rename left behind

The table is `events` (2026-09-17). `useGame.ts`'s docstring says
`connections.{games, guesses, players}` three times; `GameEventLog` and the
old doc say "the guesses log". The frozen migration's comments say `guesses`
throughout and stay as they are — an applied migration is never edited, and
its comments were true on the day (docs/supabase.md → Schema vs code). The
2026-09-17 migration is the record of the rename.

### F-connections-9 · `docstring-marker-pass` · `/**` on a member, in eight files

A note on one member of a declaration takes `//` (app-audit.md §4 → the
docstring marker). Candidates, all read, all members: `useGame.ts` —
`EventRow`'s five, `PlayerRow`'s one, and `failure` in the return type;
`lib/history.ts` — `HistorySnapshot`'s five; `pdf/model.ts` — `PrintBand`,
`PrintTrack` (three), `ConnectionsPrintModel`, and the four on the options
object; `lib/setup.ts` — `player_user_ids`; `StrikeMarks.tsx` — both props;
`GameEventLog.tsx` — three props. `InfoCol` and `Board` are done (Steps 8
and 7).

### F-connections-10 · `banned-word-copy` · "copy" for a message's words, in six files

`manifest.ts` (three: "Start-button copy", "terminal copy", "Terminal copy
carries the winner's name"), `GameEventLog.tsx` (two), `Help.tsx` (two),
`lib/history.test.ts` ("the canonical copy"), `supabase/sql/connections.sql`
(two, in `submit_timeout`'s header). A message's words are its TEXT.

### F-connections-11 · `archaeology` · "used to", dated asides, and what was replaced

Each a paragraph about a previous shape, deleted or cut to what is true
today: `manifest.ts` — the find-or-create story told twice ("There is no
find-or-create any more … the branch that used to live here") and "the label
used to say categories, matched and found"; `manifest.test.ts`'s header (the
same story, fourteen lines); `SetupForm.tsx` — "What this replaced, and why
none of it is missed" (eight lines), and the FALSE "`startGameInClub`'s
find-or-create branch still exists and now simply never fires";
`lib/setup.ts` — "It used to be `''`", and the old raise text
`bad-puzzle-id|`; `lib/setupSummary.ts` — "have gone. All three were on the
old info-column list"; `pdf/model.ts` — two dated asides (2026-08-02,
2026-08-06); `HintList.module.css` — "carries over unchanged from when this
was a floating modal"; `PlayArea.module.css` — `.mistakesInline`'s "The old
NYT-style placement", `.peerPick`'s "It lived in common until the palette
sweep …" (six lines); `PlayArea.test.tsx` — "connections used to be one of
the two games that opened its answer unasked" (a describe's header) and "The
two used to be one `null`"; the SQL — `next_puzzle_for_club`'s "It used to be
`returns table(...)`" and "The dialog used to be a calendar", `create_game`'s
"`puzzle_id` used to ride along …" (seven lines), `submit_guess`'s "Until
2026-08-01 the play_state was 'solved' too" and "It used to put the outcome
word in `result`", `_maybe_finish_compete`'s "This used to write
'lost_compete_mistakes'", `end_game`'s "see those for the bug history";
`next_puzzle_test.sql`'s "They used to `return table(...)`".

### F-connections-12 · `stale-claims-in-code` · sentences in the folder that are no longer true

Each checked against the tree:

- `useGame.ts` → `isEliminated`: "lines up with how PlayArea gates its 'you're
  out' branch on `mode === 'compete'`" — PlayArea gates on `locallyDone`.
- `useGame.ts` → `toggleTile`: "see docs/games/connections.md → 'Peer
  selection'" — the doc is deleted at the harvest; `doc.md` is the home.
- `useGame.test.ts`: "tears the old one down via `removeChannel`" — the hook
  calls `releaseChannel`.
- `lib/board.ts`, `lib/evaluate.ts`: "the BoardScreen" (×2, no such
  component); "in the v1 deployment".
- `lib/evaluate.ts` → `sameTileSet`: "the server doesn't enforce this — we
  trust the FE to not submit duplicates. A race … would count as two
  mistakes" — the server raises PN301 and counts nothing.
- `lib/rankColors.ts`: "the matched-category strips above the tile grid" —
  the bands are rows IN the grid; and a consumer census.
- `lib/setup.ts`: "Two fields today" — four (`coop_style`,
  `first_turn_user_id`, `puzzle_id`, `timer`); "Future fields … land
  alongside" is a plan.
- `lib/history.ts`: the opening sentence still says "the position of a turn
  within the log" two paragraphs above "addressed by the row's own id".
- `SetupForm.tsx`: "the server's `warning` outcome is not read here" — the
  spent archive is PN302, a not-ok, and has been since 2026-08-29.
- `manifest.ts`: "tables, RPCs, RLS — see supabase/migrations/…" — the RPCs
  and RLS are `supabase/sql/`'s; "the docs file docs/games/connections.md";
  the compete label's "the 'opponents see mistakes only' decision" — see
  F-13.
- `theme.css`: "(in CSS, not here) the peer-selection identity frame + the
  wrong-guess shake" — the shake is the shared `.verdictShake`; "documented
  in plans/tile-feedback.md → Identity" cites the plan.
- `PlayArea.module.css`: "minus the max tile-height cap — none here yet" —
  `.board` sets `--max-tile-height: 9rem`; "psychicnum's WordBoard" (×2; it
  is `Board`); "connections is the only game with multi-letter WORD tiles"
  (psychicnum's are words); two `plans/tile-feedback.md` cites.
- `GameEventLog.tsx`: the docstring's `"Matched: Colors"` — `verdictLabel`
  writes the bare name, and its own note says so.
- `printConnectionsPdf.ts`: the four screen hex values copied into a comment,
  with "keep in step" — cite `theme.css` instead of duplicating it.
- The SQL — `submit_guess`'s header: "partial unique catches dup-race … no-op"
  (PN300), "if MIN(mistake_count) across all players >= 4 → lost_compete"
  (`_maybe_finish_compete`: nobody alive, conceders included), "raises 'game
  is not in progress'" (PN245 "Game over"); "never on the duplicate no-op
  `return`s" and "the duplicate `return` above" (×3 — they raise); "Either
  way, no-op"; two paragraphs saying the envelope's `outcome` "says what it is
  WORTH" — Step 4's own leftover, since the `ok` carries none now;
  `submit_timeout`'s "the FE can distinguish by looking at the mistakes count
  vs. the absence of mistakes"; `end_game`'s "the FE shows the green 'Game
  ended' modal" (a pill, and `neutral` is not green) and "render in green";
  `replay_board`'s "The 'Replay board' menu item" (the row says Restart);
  `create_game`'s "Setup shape" listing two keys of four.
- The pgTAP headers: `gameplay_test` — "a second 'correct' for the same rank
  is a silent no-op" and "(7b) A repeat … is a silent no-op" above an
  assertion of PN301, and "silently no-ops (partial-unique-index conflict
  caught)" above one of PN300; `turn_order_test` — "a race no-op `return`"
  and "a duplicate (soft no-op)"; `compete_test` — "the 20260620
  connections_compete migration" (no such file), "per-player mistake
  decrement" (increment), "rejected with P0001" (PN251), "(lost_compete +
  lost_compete_timeout)"; `next_puzzle_test` — "Empty is `ok` with
  `outcome: 'warning'`" in a file whose own pins assert PN302 and PN303.

### F-connections-13 · `compete-visibility-claim` · "opponents see mistakes only" is stated in five places, and the strip shows FOUND

`connections.players.matched_count` is public — the migration added it so the
compete strip could show race progress, and the strip's `metricLabel` is
"Found". The prose never caught up: `manifest.ts` ("the 'opponents see
mistakes only' decision means we don't surface per-player matched_count"),
the SQL's players RLS comment ("the 'see opponents' mistake counts'
property"), `submit_guess`'s compete `{}` status comment ("leaking
per-opponent matched_count … would violate the 'mistakes only' visibility
decision"), the frozen migration's header and publication comment
("opponent-mistakes strip"), and the old doc's table row ("OpponentStrip
showing per-player mistake counts"). The design is the shipped one: the
strip shows found counts; guesses and which categories stay private during
play. The prose says that; the migration's comments stay (F-8's rule) and
the SQL file's are corrected.

### F-connections-14 · `constants-have-two-homes` · four and four, written in the component file and again as `>= 4`

`CATEGORY_COUNT` and `MISTAKE_BUDGET` live in `PlayArea.tsx`, which is why
`lib/terminal.ts` had to take `selfWon` rather than a count (Step 6);
`useGame.ts` writes the budget as `mistakeCount >= 4` for `isEliminated`,
with "4-mistake" in three comments. psychicnum's F-19 gave `SECRET_COUNT` one
home in `lib/setup.ts`. The same here: both constants beside the wire types
in `lib/board.ts` (they are facts about a Connections board), `useGame`,
`PlayArea` and the printer's `maxMistakes` reading them.

### F-connections-15 · `compete-label-shape` · the compete "all conceded" label is a second branch for a word the table already has

`labelFor` for `lost_compete`: `conceded ? outcome('Lost', 'all conceded') :
statusLine(outcome('Lost', COMPETE_LOSS[…]), 'no winner')` — `COMPETE_LOSS`
already maps `conceded` to "all conceded", so the branch exists only to drop
"no winner" from that one case. A decision about the label's words (Joel's):
*one line, every cause with "no winner"* — or *keep the branch* because a
table that all walked away from has no winner to mention. Small.

### F-connections-16 · `importer-runs-daily` · the importer's docstring says it is run by hand

"For v1 this is run manually … It graduates to a scheduled Edge Function /
GitHub Action when that annoyance compounds" — and
`.github/workflows/connections-import.yml` has run it daily since the doc's
Puzzles section was written, which says so two paragraphs before repeating
the manual-run sentence itself. The docstring says what runs it. (Its
`SUPABASE_SERVICE_ROLE_KEY` default is the well-known local demo key; the
comment beside it says so, and that is fine.)

### F-connections-17 · `test-prose` · what the tests say about themselves

`PlayArea.test.tsx` names a keystroke in a describe ("⌥Z shuffles the tiles")
and carries the two archaeology headers under F-11; `manifest.test.ts`'s
header is the find-or-create story; `useGame.test.ts`'s is F-12's
`removeChannel`; `localOrder.test.ts`'s is done (Step 5). The pgTAP headers
are F-12's. `next_puzzle_test`'s header contradicts its own pins, which is
the worst kind — a reader trusts the header.

### F-connections-18 · `sql-prose-pass` · the repeatable file's comments, as a set

Beyond the specific claims above: the file opens every function with a
ten-to-forty-line essay, most of it design rationale and history ("Why a
view rather than two FE queries", "the reasoning for that is at the raise
below", "(Joel, 2026-08-29)" ×3). psychicnum's F-14 took the same pass over
its SQL: the contract stays on the function, the rationale goes to `doc.md`
→ Schema and RPCs, the dated rulings and the history go. This is the pass
that also lands F-8, F-10, F-11, F-12 and F-13's SQL halves.

### F-connections-19 · `doc-harvest` · `doc.md`'s four owed sections, and the old doc's deletion

Game rules, Schema, Frontend and Tests are owed to pass 2 (Step 3). What
`docs/games/connections.md` says that the code does not, to carry across
and nothing more: the vocabulary (category · rank · tile · matched ·
mistake_count and why each word), the two modes' rules and the compete
visibility rule, why there is no `tiles` table and no matched-categories
table, the two realtime channels and why each is stable-named, the coop
selection semantics (the union; clear on a correct guess only), the mobile
no-status-bar decision, the event-log picker's compete behavior, the
printer's A–D. Then the doc is deleted, its inbound links repointed
(`docLinks.test.ts` catches the anchors; the prose cites need the grep).

### F-connections-20 · `todo-stale` · what `todo.md` says that this pass settles

The Bug (`matched`) and the Soon (the eliminated racer) are F-4 and F-5 and
leave the todo with their rulings; the "next puzzle" Maybe is a question for
Joel this pass can ask; the animation Maybe is pass 3's.

### F-connections-21 · `ellipsising` · a British spelling the guard's list does not carry, in nine places

Found while reading psychicnum's `lib/terminal.ts` beside connections' (F-2's
verification): its docstring says the pill is a "fixed-height, **ellipsising**
row". Connections' own says *ellipsizing* and is right. `-ise` where American
writes `-ize` is the CLAUDE.md rule, and `americanSpelling.test.ts` says in
its own words that the list "grows when one gets through". This one got
through nine times: `psychicnum/lib/terminal.ts`, `wordiply`, `crosswords`,
`stackdown` and `wordle`'s PlayAreas, `wordle/components/InfoCol.tsx`,
`letterboxed/lib/board.ts`, `docs/ui.md` → the pill, and
`plans/areas/common-hosts.md`. Every one is the same sentence about the pill,
copied outward from whichever wrote it first.

**Options:** *fix and guard* — the nine lines to `ellipsizing`, and
`ellipsising → ellipsizing` joins the guard's map so it cannot come back — or
*fix only*, leaving the word off the list. Recommendation: fix and guard;
the guard's docstring asks for exactly this, and a word this sentence keeps
copying is the kind that returns.

### The prose pass — shipped 2026-09-19, one sitting

Everything above with no decision in it, in the working tree for Joel's
read: **F-8** (`events` in `useGame`'s docstring and effect comment, the
log's docstring), **F-9** (the marker pass in the eight files), **F-10**
("copy" out of six files), **F-11** (every "used to" and dated aside listed,
plus three more the sweep caught in `create_game_test.sql`), **F-12** (every
claim listed — but one WITHDRAWN: `useGame.test.ts`'s "via `removeChannel`"
is true, `releaseChannel` calls it, and the test's mock counts that call),
**F-13**'s prose halves (the manifest, the players policy, the compete
status comment; the frozen migration's stay), **F-16** (the importer says
what runs it), **F-17** (the test headers, and `end_game_test.sql`'s four
`P0001`s the read had not listed; the keystroke describes stay, as
psychicnum's did — blessed there), **F-18** (the SQL's essays cut to the
contract: `next_puzzle_for_club`'s header from forty lines to twenty-three,
`submit_guess`'s header rewritten to what the function does today, the
orphaned "Register with common.gametypes" and "Terminal-transition cleanup"
paragraphs deleted, since the rows are the migration's and the sentence is
`doc.md`'s), and **F-19** — `doc.md` has its Intro's last paragraph, Game
rules (with a Vocabulary table, Coop, Compete, The play states), Schema,
Frontend and Tests; `docs/games/connections.md` is deleted; CLAUDE.md's row,
`naming.md`'s vocabulary link, `code-conventions.md`'s pause link (now
`states.md → paused`), four sibling game docs' links and the todo's cite
are repointed. `PlayArea.test.tsx` also stopped citing the plan twice
(`docs/ui.md → Interactive tile states`, and the two endings said in a
sentence), and `stackdown.md`'s "they are the only two" became a condition.

Left for their rulings, on purpose: F-3's three Help sentences (the
docstring is done); F-4's `matched` note keeps its text under `//`; F-6's
view, its thirty lines of calendar comment and its test; F-14's `>= 4`;
F-15's branch; F-20's todo items; and the SQL's `_maybe_finish_compete`
comment, which F-5 may rewrite.

**Verified:** `tsc -b` and eslint clean; 394 unit tests green
(`src/connections` + `src/guards` — `docLinks` caught the four sibling-doc
links on the first run and passed once they were repointed); `gmake db-sql
ENV=local` then `npm run test:db` — 179 files, 2512 tests, PASS, with the
three renamed pgTAP assertions in it.

### What checked out

- **The evaluator** — every boundary in `evaluate.test.ts` (1-, 2-, 3-,
  4-overlap, ties, order, a defensive copy) is what the code does.
- **The seam** — `eventToOutcome` and `matched` at one place in `useGame`;
  the history builder folds strictly-before by id; the projection is one
  band per rank.
- **`_maybe_finish_compete`** — alive is not conceded and under four
  mistakes; the outcome word is `conceded` only when every player conceded.
- **The printer** — A–D as the mono-safe signal, the viewer's track carrying
  the full answer once, a rival's only what they earned; every character
  WinAnsi; the coop heading "Guesses" is the screen's word.
- **`next_puzzle_for_club`** — per player, across clubs, by date, as its
  eight pins say; `puzzle_for_date` filters nothing.
- **The importer** — the upstream shape validated on the first record, rank
  from the array index, an idempotent upsert on `source_id`.
- **`setup.psql`** — the fixture puzzle's alien date and source id keep the
  suite clear of the imported archive.

## Notes

- **What psychicnum's area taught, read before this one opened** (Joel:
  *"make sure you've read psychicnum's area to understand lessons-learned"*):
  - **Step 0 is a baseline, and both e2e runs are asked for first** — the
    geometry harness with `BASELINE=1` and this game's five specs, green on
    the untouched tree, so a later red is the step's.
  - **Step 1 gathers the owed work into `todo.md`** before anything moves:
    the doc's *Deferred* (here a real section, at line 731 of an 820-line
    doc), the todo's own items (three Bugs, several Soons — the action-row
    collapse is already written up there with psychicnum as the worked
    example), tile-feedback.md's rows for this game, and `deferred.md`'s
    per-game row, which then points at the todo.
  - **The `doc.md` skeleton goes in early**, seven headings, and the RPC and
    FE-submission sections are written first so Joel can see what the game
    does — writing them turned up a real bug at psychicnum.
  - **A new file is invisible to every guard until it is `git add`ed.**
  - **The restructure is a behavior-preserving no-op per step**, verified by
    the net; a step that changes behavior says so in its heading.
  - **A spec that clicks the wrong element fails somewhere else** — read a red
    before re-anchoring it. `PlayArea.test.tsx` here is 989 lines.
  - **The closing re-read finds the day's own findings next door**, and half of
    what it finds is prose the day wrote. Grep the fault class after the eye.
  - **`theme.css` stays** even when nearly empty; a CSS "duplication" note is a
    measurement, not a smell — psychicnum's turned out to be 38 lines that
    duplicated nothing.
- **`supabase/scripts/` has no row in app-audit.md §3.** This game claimed
  its importer; the other per-game importers there are each their game's to
  claim the same way, or the folder wants a row.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

**The e2e ran clean for Steps 2–8 together** (2026-09-19, Joel's word, after
Step 8 was committed): the geometry harness without `BASELINE=1` — every
touched board at its Step 0 baseline — and the five connections specs, 9
tests, green in twenty seconds. Nothing predicted broke and nothing
unpredicted did; the split, the row, the reorder and the moved builder are
the no-ops they claimed to be.

- Step 2: `PlayArea.test.tsx` imports and mounts `PlayAreaLoader` (the same
  tree, `useGame` mocked as before); its "still says Game not found" case
  had to change, since the gate is the shared Not-Found card now — it asserts
  the card's title and the console line naming the empty read. **Held**
  otherwise: 372 green. Nothing else predicted; no column moved, so the
  geometry harness has no reason to.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/connections.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
