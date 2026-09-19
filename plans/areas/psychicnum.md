# Area: psychicnum

**Brand: PsychicNum.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas, and **the first game area opened** — the
control: the deliberately minimal toy, so what it settles is about the SHAPE
of a game area rather than about the game. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in `src/psychicnum/todo.md`, not here.

**Status: OPENED 2026-09-19.** Roster listed; the restructure plan below is
written and its four decisions are Joel's (2026-09-19): "precedent" names,
"row order" for the menu, `lib/terminal.ts`, the section order as proposed.
The two e2e baseline runs are permitted. No stamps written. **Step 0 (the
baseline) and Step 1 (the owed work gathered) are done; Step 2 is next.**

**Three passes, back to back** (Joel, 2026-09-19 — the game rows in
app-audit.md §3 say two and should say three):

1. **The restructure** — [playarea-readability.md](../playarea-readability.md)
   applied to this game, step by step, each step a commit Joel reads. Done
   FIRST, because the audit's prose pass would otherwise polish comments and
   docstrings that the split and the comment pass rewrite or delete.
2. **The audit** — React, SQL and CSS together, on the restructured code: the
   prose pass, findings, the CSS that duplicates the shared sheets, the bugs,
   and the game `doc.md` that absorbs `docs/games/psychicnum.md`.
3. **The tile-feedback pass** against [tile-feedback.md](../tile-feedback.md),
   tf1 → tf2.

Joel's goals for the area, in his words (2026-09-19): implement the
readability recommendations; clearer documentation than `docs/games/psychicnum.md`,
which "is too long and has too much detail that should be with code, and often
repeats things clearly stated in code"; read the code carefully himself; figure
out what shapes are used by other games so they are documented once; fix any
bugs; reduce CSS that duplicates common CSS or the play-surface scaffold.

## The roster

Listed 2026-09-19 (`src/psychicnum/`, its SQL, its doc):

- **`src/psychicnum/` — 30 files.** components: `Board.tsx` + `.module.css`,
  `BoardCol.tsx` + `.module.css`, `GameEventLog.tsx` + `.module.css`,
  `Help.tsx`, `InfoCol.tsx`, `PlayArea.tsx` + `.module.css` + `.test.tsx`,
  `SetupForm.tsx` + `.test.tsx`, `StateLine.tsx`. hooks: `useGame.ts`. lib:
  `answer.ts` + `.test.ts`, `capitalize.ts`, `history.ts` + `.test.ts`,
  `setup.ts`, `setupSummary.ts`. pdf: `model.ts` + `.test.ts`,
  `printPsychicnumPdf.ts`. root: `db.ts`, `manifest.ts`, `theme.css`,
  `logo.svg`, `todo.md`.
- **SQL — 3 files** (the events migration is its own file):
  `supabase/migrations/20260615000002_psychicnum.sql`,
  `supabase/migrations/20260917000000_psychicnum_events.sql`,
  `supabase/sql/psychicnum.sql`.
- **Doc — 1 file**: `docs/games/psychicnum.md` (600 lines).

Stamps at the opening: ten files `cs-fixed-outcome-fix`, eighteen `cs-unmet`,
`logo.svg` and `todo.md` none.

**The net, not the roster**: five e2e specs (`psychicnum-history`, `-mobile`,
`-print`, `-terminal`, `-turn-order`, 454 lines), `PlayArea.test.tsx` (about
forty cases), `e2e/board-geometry.e2e.ts` (psychicnum is one of its boards),
the pgTAP suite. `common/pdf` (row 47) is the one shared folder psychicnum
imports that is not yet blessed; Joel: fine, the focus is the web-based parts.

## The restructure — plan

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is a behavior-preserving
no-op unless it says otherwise, verified by the net above. **Nothing shared is
cut at this game**: a shared hook is a rule-of-three cut, and one game cannot
prove sameness, so 3.3's slots, 3.3's `useGameMenu` and 3.8's standing-condition
hooks wait for the second game. What this game settles is the SHAPE — the
order, the names, the file — and writes it into `docs/playarea.md` at the
harvest.

### Step 0 — the baseline

Before any code moves: `tsc -b`, lint, the guards, `PlayArea.test.tsx`; then
the geometry harness with `BASELINE=1` and the five psychicnum e2e specs, run
green on the untouched tree so a later red is the step's. **Both e2e runs are
asked for first** — the ask is Joel's rule, no exemption. Predicted breaks
recorded below as each step starts.

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-19

Joel's ask. What was found:

- `docs/games/psychicnum.md` → *Deferred* says "Nothing outstanding"; *Won't
  do* carries two rulings (anti-spam on guessing; a livelier `.infoState`).
  **Proposal:** the two won't-dos move to `todo.md`, and
  `docs/deferred.md`'s per-game row for psychicnum points at `todo.md`
  instead of the doc. The doc's *Deferred* section then has nothing to say
  and goes when the doc is rewritten in pass 2.

  **Shipped, and it grew a fifth `todo.md` section on Joel's call**
  (2026-09-19): *"don't add wont-dos to maybe; we should add a section to todo
  files for wont-do."* So `## Won't do` is now part of the skeleton — last,
  below the ramp, and the one section that is not a queue — in
  `docs/common-folders.md`, in `folderDocs.test.ts`'s `TODO_SECTIONS`, in
  app-audit.md §4's *Where a note goes*, and as an empty heading in all 76
  `todo.md` files. psychicnum's two went there as plain bullets: the
  strikethrough was the workaround for having nowhere to put them.

  Three things the proposal did not say. The doc's *Deferred* could not simply
  be left: with the register moved it would have gone on claiming "Nothing
  outstanding" while `todo.md` held the bug and the Soons, so its body is now a
  pointer at `todo.md` (the heading itself still goes in pass 2). And
  `deferred.md`'s *Where an item goes* gained the sentence the repointed row
  implies — a game whose area has been audited keeps its register in
  `src/<game>/todo.md`, reconciled game by game rather than in a sweep —
  because otherwise the one row contradicts the rule above it. Anti-spam's
  won't-do also stopped saying "the 7-guess cap": 7 is the default, and the SQL
  check is `guesses_remaining between 0 and 9`.
- `plans/tile-feedback.md` names psychicnum three times as open: the roster
  row (tf1 → tf2 is "a color and button check"), the census note that
  psychicnum "gained identity marks in player colors" and the question should
  be asked fresh at its pass, and the per-game tile check (psychicnum wears
  the shared tile). Nothing moves: these are pass 3's own instructions. See
  *tile-feedback, as Joel sees it* under Notes.
- The other fifteen games' `todo.md` files and `common/game-page/todo.md`
  mention psychicnum only as the worked example. Nothing moves.
- `todo.md` already holds: the pre-load `+` bug (Step 2 closes it), the
  permanent-fill color derived twice (pass 3's), the hand-written shuffle
  (Step 3 converts it, since BoardCol is open), the `ShuffleButton` tab stop
  (`common/buttons`'), the race with no whole-table stop (pass 2 decides), the
  `<Loading>` swap (Step 2 closes it).

### Step 2 — the loader / loaded split (readability 3.1)

The outer component owns `useGame` and the three gates; the inner receives a
non-null game and starts with it in hand. What goes with it, all in this one
commit: every `game?.` and `mode ?? 'coop'`; `if (!mode) return` in
`createNewGame`; `if (!game) return` in Print and its `describe: () => (game
? 'active' : 'hidden')`, which becomes `'active'`; the six "above the early
returns" and "menu exists pre-load" comments; the loading gate becomes
`<Loading>`; the `setup as PsychicnumSetup` cast happens once, in the outer
component, and the inner takes `setup: PsychicnumSetup`.

**One behavior change, stated now.** The bindings and the menu effect move
into the inner component, so while the read is out the header menu has no
game rows — Help, chat and Back to club only — and `+` does nothing. Today the
menu shows the game's rows pre-load with Hint and Spoiler grayed, and `+`
asks the new-game question and then cannot act (the bug on file). A menu row
for a game not yet loaded can do nothing, so the rows appearing with the game
is the honest shape; the loading beat is short. `PlayArea.test.tsx` mocks
`useGame` loaded, so no spec sees the beat.

**Decision 1 — the names.** Two options, real code for each:

*Option "precedent"* — the loader is named for what it does, the play surface
keeps the name everything calls it, exactly as `GamePageLoader` → `GamePage`:

```tsx
// manifest.ts
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// PlayArea.tsx
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading, failure } = useGame(ctx.gameId)
  if (loading) return <Loading />
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <NoSuchGame />   // or the inline <p>, decided at the step
  return (
    <PlayArea
      {...ctx}
      game={game}
      playerBudgets={playerBudgets}
      guesses={guesses}
      setup={ctx.setup as PsychicnumSetup}
    />
  )
}

function PlayArea({ game, playerBudgets, guesses, setup, session, … }: PlayAreaProps) {
  const mode = game.mode
  …
}
```

Cost: the manifest's one line changes per game as each converts, and the
test file mounts the loader (the same tree, `useGame` mocked as today).

*Option "keep the export"* — the manifest and the test file are untouched;
the inner component takes a new name:

```tsx
export function PlayArea(ctx: GamePageCtx) {
  … the gates …
  return <LoadedPlayArea {...ctx} game={game} … />
}

function LoadedPlayArea({ game, … }: LoadedPlayAreaProps) { … }
```

Cost: the component a reader spends the file in is the one with the awkward
name, and `docs/playarea.md`'s "PlayArea is the thin coordinator" would name
the twenty-line gate rather than the coordinator.

**Decided: "precedent"** (Joel, 2026-09-19). The manifest line is one edit
per game, and the name that matches the shell's is the one the other fifteen
will copy without asking. Both stay in one file: the loader is about twenty
lines, and `PlayArea.tsx` stays the file every doc names.

### Step 3 — the actions and the row (readability 3.6, 3.7)

The row is already unconditional here (this is the template). What changes:

- `getHint`, `getSpoiler`, `createNewGame` lose `useCallback` — `useBoundAction`
  reads its live half through a ref refreshed every render, and the comment
  claiming the bindings need stable callbacks is false.
- `hinting` / `spoiling` go. The bound action's `pending` grays the button
  (`ActionButton` ORs it in) and the menu row (`menuModel.ts` reads
  `item.pending`), and nothing else reads the flags. `describe` for Hint and
  Spoiler becomes `isTerminal ? 'hidden' : isStillPlaying ? 'active' : 'disabled'`.
- The bindings gather under one header, in one order: the shared trio, then
  Hint, Spoiler, Reveal, then New game and Print — and the InfoCol prop list
  and the menu list them in that same order.
- `BoardCol`'s hand-written Fisher–Yates becomes `shuffle()` from
  `common/utils` (the `todo.md` item; BoardCol is open in this step).

**Decision 2 — the menu's row order.** Today psychicnum's `extra` reads Hint ·
Spoiler | Print | Restart · New game · Reveal — the only game with that shape.
Three orders on the table, each shown as the menu a player would see:

*"Board first"* — what acts on THIS board, then moving on, then paper:

```
Help · Open chat
─────────────────
Hint · Spoiler · Reveal solution
─────────────────
Restart · New game
─────────────────
Print board (PDF)
─────────────────
Concede · End game · Back to club
```

*"Row order"* — the menu reads exactly as the info column's action row does,
divider for divider (the row is Hint · Spoiler | Reveal · Restart · New game ·
Concede · End · Back to club):

```
Help · Open chat
─────────────────
Hint · Spoiler
─────────────────
Reveal solution · Restart · New game
─────────────────
Print board (PDF)
─────────────────
Concede · End game · Back to club
```

*"Majority"* — the nine games' shape today, Print after the moving-on pair,
with psychicnum's assists ahead:

```
Help · Open chat
─────────────────
Hint · Spoiler
─────────────────
Restart · New game · Reveal solution
─────────────────
Print board (PDF)
─────────────────
Concede · End game · Back to club
```

**Decided: "row order"** (Joel, 2026-09-19 — with the note that a game menu
is now simple enough to read and edit that moving rows later is easy, so
this is an order to start from rather than a lock). The row and the menu are
two views of the same bindings, and a player who learned the row finds the
menu in the same order; it is also the order the InfoCol comment already
argues for. Written once in `docs/playarea.md` beside the row's order; the
builder's slots wait for the second game.

### Step 4 — `buildOver` leaves the component file (readability 3.4)

The pure builder moves to `lib/`, with a test that walks every play state in
both modes (won · lost · ended · won_compete · lost_compete, with and without
the timer). The `useMemo` on primitives that feeds the verdict effect stays in
the PlayArea. The manifest's `labelFor` names the same play states for the
club page; the two files sit in the same folder after this, which is the
most that can be done about the two-home hazard without a shared vocabulary.

**Decision 3 — the file name.** `lib/terminal.ts` (reads with
`common/terminal/terminalMessage.ts`, whose type it returns) · `lib/over.ts`
(named for the value every PlayArea calls `over`) · `lib/verdict.ts` (the
word the pill uses). **Decided: `lib/terminal.ts`** (Joel, 2026-09-19), and
the export keeps its name, `buildOver`, so the call site does not change.

### Step 5 — the section order (readability 3.2)

The file is reordered to the readability plan's proposal and each section
gets the shared header words. For psychicnum that is:

1. Page hooks — `useTabRing([])`, `useInfoSheet()`, `useCelebration`, `useTurnStartFlash`
2. Derived — `myConceded`, `selfBudget`, `iFoundThemAll`, `isStillPlaying`, `summaryRows`
3. The local slot and its standing conditions — the slot, `over`, verdict / out-of-race / waiting
4. Narration — the coop peer effect, the compete opponent-progress effect
5. The turn-history viewer
6. The commands, bound — the shared trio, Hint, Spoiler, Reveal, New game, Print
7. The menu
8. Render — the render-time derivations (`concededIds`, `results`, `decidedBy`, `shown`, the snapshot, `found`), then the columns

The reveal's `useSolutionReveal` sits with the derived values (it is state
the Reveal binding reads), and `seenOpponentFoundRef` moves beside the effect
that owns it. **Decision 4: this order** (Joel, 2026-09-19); it goes into
`docs/playarea.md` as the rule at the harvest.

### Step 6 — the comment pass (readability 3.5)

With the code settled: the call-site rule (a sentence and a pointer where a
shared mechanism is explained — the envelope paragraph in `createNewGame`,
the reveal rule at `act-reveal`, the celebration's loading-race story), the
archaeology deleted ("It used to be a bright ring", "moved into BoardCol",
"the old terminal branch argued for"), and the file docstring rewritten — it
describes a pre-decomposition surface today ("GameEventLog: coop shows
everyone's guesses", "Header copy"). InfoCol's and BoardCol's comments get
the same pass since both files are open by then.

### After the restructure — pass 2, the audit

The area's ordinary process from here: the prose pass, then findings one at a
time. Already known to belong to it:

- **CSS** (Joel's goal): `Board.module.css` at 196 lines against the shared
  tile chrome in `game-page/playArea.module.css`; `PlayArea.module.css` is one
  class (`.layout`); `theme.css` has zero non-comment lines and exists "for
  structural parity" — whether an empty file earns its place is a finding.
- **The doc** (Joel's goal): `src/psychicnum/doc.md` is designed here, the
  first game area — Schema / Tests / Rules sections — and absorbs what
  `docs/games/psychicnum.md` says that the code does not; what the code says,
  the doc stops repeating. The shape is the other fifteen's template.
- **The shared shapes** (Joel's goal): what this game's restructure settled is
  written into `docs/playarea.md` once, as the rule; the area file records
  only where psychicnum could not follow it.
- **The race with no whole-table stop** (`todo.md`): a behavior decision, made
  with the SQL open.

### Then pass 3 — tile-feedback, tf1 → tf2

See Notes.

## Findings

*(`F-psychicnum-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

- **tile-feedback, as Joel sees it** (2026-09-19): *"i believe we've
  implemented all the ideas of tile-feedback already for psychicnum (and if
  not, we should discuss the missing parts, because i'm very happy with the
  tile-feedback stuff in it now, so those ideas may now be contravened)."*
  What tile-feedback.md itself still lists for psychicnum agrees with him in
  substance: the tf1 → tf2 re-pass is "mostly a color check", its one census
  question is whether the identity dot's player colors are the shared ones,
  and the psychicnum shape section's only proposal is marked settled. The one
  thing on file that could read as a missing part is `todo.md`'s "a decided
  tile's permanent fill derives its color a second time", which tile-feedback
  is named as owning — a shared class set for a permanently-decided piece.
  That is a code-shape question about where a color is looked up, not a
  change to what the board shows; pass 3 decides whether it is worth a shared
  class or a one-line pointer at `ANSWER_OUTCOME`.
- `common/pdf` (row 47) is unblessed and psychicnum's printer builds on it.
  Joel: it's fine; the focus is the web-based parts.
- The area's opening deviated from §4 on purpose: the restructure runs before
  the prose pass (Joel, 2026-09-19), for the reason under *Three passes*.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

- Step 2: `PlayArea.test.tsx` imports change if Decision 1 lands on
  "precedent" (it mounts the loader); its `useGame` mock is unchanged.
- Step 3: the spec "the rows fire the same RPCs as the buttons, and gray once
  I have no guesses left" asserts the gray from `isStillPlaying`, not from
  the flags, so it should hold; verified at the step.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/psychicnum.md` reconciled with `todo.md`: its Won't-do
      moved into the todo (Step 1), and the doc itself replaced by the game
      `doc.md` designed in pass 2
- [ ] the shape this game settled written into `docs/playarea.md`, and
      app-audit.md §3's game row says three passes
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
