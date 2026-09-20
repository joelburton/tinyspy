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
  `theme.css`, `logo.svg`, `todo.md`. **No `doc.md` yet** — pass 2 writes it
  in psychicnum's shape (Intro to area · Game rules · Schema · RPCs · FE
  submissions · Frontend · Tests) and `docs/games/connections.md` (820 lines)
  is deleted into it.
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
| the Hints row live when the list is not drawn (Bugs) | Step 3, the actions |
| collapse the action row's branches (Soon) | Step 3, the row |
| `shuffleTiles` hand-written (Soon) | Step 3, since `BoardCol` is open there — as psychicnum's was |
| `revealedHints` back into `<HintList>` (Soon) | a restructure step with the column open, or pass 2 |
| `matched` derivable on `EventRow` (Bugs) | pass 2 — a decision |
| an eliminated racer pauses the survivors (Soon) | pass 2, with the SQL open — a decision |
| the three Maybes | pass 2 or pass 3, as each says |

### After the restructure — pass 2, the audit

The area's ordinary process from here: the prose pass, then findings one at a
time. Already known to belong to it:

- **The answers move to the `AnswerMessage` shape** (Joel, 2026-09-19: *"this
  definitely part of the audits we'll do for games"*, and *"not a 'Soon'
  item. it will be part of this audit"* — so it is written here and not in
  `todo.md`). `lib/answer.ts` holds only the three wire words and
  `ANSWER_OUTCOME`; the peer lines ("found category", "was one away",
  "guessed wrong") are written by hand in `PlayArea.tsx`, and the pill's words
  come from the envelope. The rule (`common/feedback/doc.md`) is that a game's
  own answers are built in its `lib/answer.ts` as the `{ outcome, text }`
  pair, so the pill, the log bar and the peer line read one table;
  psychicnum's `answerMessage()` and `peerAnswerMessage()` are the shape. A
  finding with a decision in it — which answers this game has and what each
  says — as psychicnum's F-2 was. app-audit.md §3's game row carries it for
  every game.
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

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/connections.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
