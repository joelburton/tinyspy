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
  `setup.ts`, `setupSummary.ts`. pdf: `model.ts` + `.test.ts`,
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

### Step 4 — the `AnswerMessage` conversion

Joel, 2026-09-19: *"this definitely part of the audits we'll do for games"*,
*"not a 'Soon' item"*, and it comes here, before the actions and the prose
passes. As psychicnum's `a5ff4ca4` and the two trims after it: an `ok` RPC
returns the FACT and nothing else; a call site names an `answerType`; one
function in `lib/answer.ts` turns that into the outcome and the text, with a
`_peer` twin per answer, so the pill, the log bar and the peer line read one
table. Today `lib/answer.ts` holds the three wire words and `ANSWER_OUTCOME`;
the peer lines ("found category", "was one away", "guessed wrong") are hand-
written in `PlayArea.tsx`, and the pill's words come from the envelope. The
decision in it — which answers this game has and what each says — is
presented with options before it is built. app-audit.md §3's game row
carries the conversion for every game.

### Steps 5–8 — the actions and the row · the builder to `lib/` · the section order · the comment pass

psychicnum's Steps 3–6, in that order, each a commit Joel reads; recorded
here as each lands.

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
