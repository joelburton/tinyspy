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
baseline) and Steps 1-6 are ALL DONE — the owed work gathered, the loader /
loaded split, the actions and the row, the builder to `lib/`, the section
order, the comment pass. **The restructure (pass 1) is COMPLETE; pass 2, the
audit, is next.**

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

- **`src/psychicnum/` — 31 files.** components: `Board.tsx` + `.module.css`,
  `BoardCol.tsx` + `.module.css`, `GameEventLog.tsx` + `.module.css`,
  `Help.tsx`, `InfoCol.tsx`, `PlayArea.tsx` + `.module.css` + `.test.tsx`,
  `SetupForm.tsx` + `.test.tsx`, `StateLine.tsx`. hooks: `useGame.ts`. lib:
  `answer.ts` + `.test.ts`, `capitalize.ts`, `history.ts` + `.test.ts`,
  `setup.ts`, `setupSummary.ts`, **`terminal.ts` + `.test.ts` (created by
  Step 4, 2026-09-19)**; `capitalize.ts` was on this list and is DELETED
  (2026-09-19, Joel: *"is capitalize even used in psychicnum? … if not, delete
  it"*) — zero references anywhere in the repo, and its own docstring named two
  callers that do not exist. pdf: `model.ts` + `.test.ts`,
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
  (`common/buttons`'), the race with no whole-table stop (handed to
  `common/game-page` 2026-09-19 — see pass 2 below), the `<Loading>` swap
  (Step 2 closes it).

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-19

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

**Shipped as planned**, with `Omit<GamePageCtx, 'setup'>` letting the inner
component take the narrowed `setup`; the cast happens once, in the loader's JSX.

**The missing-game gate is `<NoSuchGamePage>`** (Joel, 2026-09-19, reading the
step: *"shouldn't that be an error page or a 404 (and therefore also be logged
to the console?)"*). It is — `common/game-page/NoSuchGamePage.tsx`, blessed, and
its own docstring calls it *"the one 'no such game' page, for every way to have
no game"*: the Not-Found card with no `k=v` line, plus a `console.debug` of a
`detail` the page never shows. `GamePageLoader` answers this same gate with it
ten lines from where psychicnum's loader was copied from.

The first pass kept the old inline `<p>Game not found.</p>` on the claim that
no such component existed — **a false absence**, from grepping the page's TEXT
and a guessed name (`NoSuchGame`) and reading two misses as proof. The sixteen
games that inline a `<p>` are a defect repeated sixteen times, not a precedent,
and they are why that docstring's "the one" is untrue today. psychicnum's
`detail` names the read that came back empty
(`rows=0 view=psychicnum.games_state game=…`) rather than repeating the
gametype the two gates above already logged.

**The other fifteen are NOT filed** (Joel, same message): the shape every game
should have gets written once when psychicnum's audit is done, and this goes in
it — see Closing.

**Three things beyond the list, each because the split made it visible:**

- **The file docstring was on the wrong declaration** and the split moved it
  further from its subject. `src/guards/orphanedDocstrings.test.ts` had
  psychicnum on its shrinking allowlist for exactly this
  (`PlayArea.tsx › HintAnswer`): the surface's docstring sat above the two RPC
  answer types, so the editor lit it up as theirs and the component read as
  undocumented. It now sits on `function PlayArea`, its words untouched — Step 6
  rewrites those — and psychicnum's allowlist line is deleted, which is how that
  guard is meant to shrink.
- **`mode` and `game.mode` were two spellings of one value**, and converting
  the two `game?.mode` reads would have left five of each. Every read is `mode`
  now.
- **Three comments went** rather than being reworded, each a second copy of
  something the code or a nearer comment already says: "both are useCallbacks up
  here …" (the bindings below are visibly what read them), "every command is
  bound above the early returns …" (each binding says it where it is), and the
  pre-load clause inside `myConceded`'s note.

### Step 3 — the actions and the row (readability 3.6, 3.7) — DONE 2026-09-19

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

**Shipped, and both premises were re-verified first.** `useBoundAction` sets
`liveRef.current = live` DURING the render and the bound value's identity is
memoized on `pending` alone — so `run` and `describe` need no stable identity,
the three `useCallback`s are gone, and the menu effect's deps are as stable as
before. `ActionButton` reads `state === 'disabled' || action.pending` and
`menuModel.ts` reads the same pair, so deleting `hinting` / `spoiling` loses no
gray: `describe` for Hint and Spoiler is now
`isTerminal ? 'hidden' : isStillPlaying ? 'active' : 'disabled'`, and the
in-flight beat is `pending`'s.

**The InfoCol's action row was ALREADY drawing "row order"** — Hint · Spoiler |
Reveal · Restart · New game | Concede · End | Back to club. What disagreed with
it were its own destructure and prop-type list (End and Concede before Restart
and New game) and the menu, which read Hint · Spoiler | Print | Restart · New
game · Reveal. All three now read the same, and the menu's Print sits last,
being the one row with no twin in the row.

**`shuffled` is `shuffle()` from `common/utils`**, and the `todo.md` item is
deleted. Behavior is unchanged: the same Fisher–Yates, the same `Math.random`
default, a copy back.

Also gone with the flags: `useState` and `useCallback` are no longer imported.
`getHint`, `getSpoiler` and `createNewGame` are plain `async function`s
declared in the bindings block, each one directly above the binding that runs
it.

### Step 4 — the builder leaves the component file (readability 3.4) — DONE 2026-09-19

The pure builder moves to `lib/`, with a test that walks every play state in
both modes (won · lost · ended · won_compete · lost_compete, with and without
the timer). The `useMemo` on primitives that feeds the verdict effect stays in
the PlayArea. The manifest's `labelFor` names the same play states for the
club page; the two files sit in the same folder after this, which is the
most that can be done about the two-home hazard without a shared vocabulary.

**Decision 3 — the file name.** `lib/terminal.ts` (reads with
`common/terminal/terminalMessage.ts`, whose type it returns) · `lib/over.ts`
(named for the value every PlayArea calls `over`) · `lib/verdict.ts` (the
word the pill uses). **Decided: `lib/terminal.ts`** (Joel, 2026-09-19).

**Shipped.** `lib/terminal.ts` holds `buildTerminalMessage`; `PlayArea.tsx`
imports it and no longer imports `gameEndedTerminalMessage` or the
`TerminalMessage` type at all. The `useMemo` on primitives that feeds the
verdict effect stays in the PlayArea, as planned.

`lib/terminal.test.ts` walks the whole input space — every terminal play state
(`won` · `lost` · `ended` · `won_compete` · `lost_compete`) in both modes, with
the timer expired and not — because the builder reads nothing else. Thirteen
cases, and the last is a TABLE: one place to see that no cell pairs a winning
sentence with a losing outcome, that both texts are filled, and that neither is
punctuated (the pill is a label). **Verified by planting six faults**, each of
which reds it: a coop win typed `lost` (2), the compete `selfWon` branch
inverted (2), the manual-end branch made unreachable (4), a punctuated pill (1),
the coop timer branch dropped (1), and coop made to read `selfWon` (3).

**The export's name is SUPERSEDED.** This decision also said the export keeps
`buildOver` so the call site would not change; Joel read the file after Step 2
and ruled otherwise (2026-09-19): *"we generally use the word 'terminal' rather
than 'over', so it would be helpful to make other variables based around that."*
Done at that moment, ahead of the move: the builder is **`buildTerminalMessage`**
— which is what it returns — the value it produces is `terminalMessage`, and
InfoCol's `over` prop is `terminalMessage` too. `<Board gameOver>` is NOT
renamed: it is a shared vocabulary, backed by `.gameOverFrame` /
`.gameOverWon` / `.gameOverLost` in `game-page/playArea.module.css`, and
renaming one game's prop would desync it from the class it draws. Ordinary
English "over" in prose stays.

**Five prose sites in `common/` still say `buildOver()`** —
`terminal/terminalMessage.ts` (twice), `terminal/doc.md` (twice),
`feedback/FeedbackMessage.tsx`, `info-sheet/InfoActionsRow.tsx` — and two of
them say "every game's `buildOver()`", which is now fifteen of sixteen. Left
alone deliberately: the other fifteen rename when the shape doc lands, and
these sentences are corrected there rather than made awkward for one game.
Listed under Closing.

### Step 5 — the section order (readability 3.2) — DONE 2026-09-19

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

**Shipped, and every code line in the diff is a pure move** — nothing was
rewritten, which is what makes the step's no-op claim checkable by reading the
diff. The eight headers now read: Page hooks · Derived · The local slot, and
its three standing conditions · Narration — what a PEER did, in the header
slot · The turn-history viewer · The commands, bound · The menu · Render.

**The celebration was the one real defect, not a gap.** Its fourteen lines of
prose sat ABOVE the turn-flash header while `useCelebration` sat BELOW it, so
two sections were interleaved and the argument for gating on `playState` alone
read as an argument about the frame flash. Prose and call are together now,
under Page hooks.

**Two headers were demoted rather than kept.** "Terminal secrets reveal" is a
sub-comment inside Derived, since that is where the plan puts the state and a
section rule there would make nine sections out of eight; "Info-column readouts
(setup choices + live state)" became a plain sentence inside Render, where its
two lines sit.

**Two header sentences state the RULE the section follows**, rather than
listing what is in it — a list would rot the moment something joined. Derived
says the sections below share these answers and must not disagree; Narration
says both effects are about somebody else, which is what puts them in the
global slot rather than the local one.

**`BoardCol.tsx` took the same treatment** (Joel, 2026-09-19: *"can you do a
similar section-ordering for BoardCol? … it would benefit from that same kind
of organization"*). Five sections, and they are the jobs its own docstring
already names: **Which board is on screen** (`isViewingHistory`, the one thing
derived from a prop, and what every writer to the board answers to) · **The
pending guess** (the state this column owns, plus `selected` and
`handleEntryChange`, which had been separated from it by the shuffle) ·
**Committing a guess** (`submitGuess`) · **The board's display order** (the
shuffle, moved to last because it is the one job that touches nothing else) ·
**Render**. Pure moves again, and a stray double blank line went with them.

What the reorder showed: `selected` and `handleEntryChange` both belong to the
pending guess and both sat on the far side of the shuffle block, so the one
piece of state this column owns was told in three places.

### Step 6 — the comment pass (readability 3.5) — DONE 2026-09-19

**Three rules Joel gave while reading BoardCol's `act-shuffle` comment**
(2026-09-19), and they govern this step:

1. **A comment does not name a keystroke.** *"this shouldn't mention the
   keystroke, that will become stale (& isn't needed)."* The chord lives in the
   action registry, and the recall key lives in `common/word-entry` — a comment
   that repeats either is a second copy that nothing updates.
2. **"Why this lives here" is not worth a comment.** *"notes about why this
   here isn't helpful; it's obvious."* A reader looking at the line is already
   looking at where it lives.
3. **"Why Joel decided this" is not a comment.** *"explanations of why is
   active at terminal isn't useful for code understanding; it's more about 'why
   joel decided this', and not useful for comments."* A product ruling belongs
   in a doc, if anywhere.

All three landed on that one comment at once — eleven lines that named ⌥Z,
argued that the binding belongs in this column rather than the PlayArea, and
defended staying live on a finished board. `describe: () => 'active'` says the
last of those already, so the whole comment is gone. Three more in the same
file went with it: the two naming ArrowUp for the entry's recall (rule 1), and
the *Committing a guess* header's "the RPC lives here rather than in the
PlayArea because…" (rule 2) — and the clause I had just written into the
shuffle section's lede was rule 3 again.

With the code settled: the call-site rule (a sentence and a pointer where a
shared mechanism is explained — the envelope paragraph in `createNewGame`,
the reveal rule at `act-reveal`, the celebration's loading-race story), the
archaeology deleted ("It used to be a bright ring", "moved into BoardCol",
"the old terminal branch argued for"), and the file docstring rewritten — it
describes a pre-decomposition surface today ("GameEventLog: coop shows
everyone's guesses", "Header copy"). InfoCol's and BoardCol's comments get
the same pass since both files are open by then.

**Shipped: 123 comment lines out, 74 in, across four files** — `Board.tsx`
joined, being psychicnum's and carrying the worst of what the pass found.

**All three call sites went to a sentence and a pointer**, and both pointers
were READ before being cited: `useCelebration`'s docstring carries the
first-render rule in full, and `describeReveal`'s already names this game's own
narrowing ("psychicnum hides the BUTTON while you are still hunting") — so the
call site now adds only the narrowing and stops re-arguing the rule. The
envelope paragraph is three lines pointing at `docs/envelopes.md`.

**One comment was not archaeology but a FALSEHOOD.** `Board.tsx`'s docstring
said the terminal reveal rings every secret's tile via a `secretWords` prop.
There is no such prop, there is no ring, and `--psychicnum-secret-ring` appears
nowhere in the repo — the reveal folds into `results` as a hit and the tile
simply goes green. Found by sweeping for "used to", which is exactly how a
sentence true before a change gets left behind asserting something that was
never true after it.

**The file docstring is rewritten around the decomposition** — PlayArea holds
no board and draws no control; BoardCol and InfoCol do, and this component
decides what each is handed. The four-bullet mode table went: three of its
bullets described surfaces that have moved out, and what survives is the one
rule worth stating — green means "a secret was found" in BOTH modes, so
nothing here teaches a compete-only color.

**Joel's three rules did most of the cutting.** Beyond BoardCol's four: the
back-to-club paragraph defending a filled button at terminal (rule 3), the
mobile status bar's "deliberate trade" (3), the `detail`-choice argument at
the no-such-game gate (3), "which is what puts them here rather than in the
header slot" (2), and the info column's "the order is the one the old terminal
branch argued for" (archaeology + 3), which now points at `docs/playarea.md`
for the order instead.

### After the restructure — pass 2, the audit

The area's ordinary process from here: the prose pass, then findings one at a
time. Already known to belong to it:

- ~~**CSS** (Joel's goal)~~ **DONE 2026-09-19, and the premise was wrong.**
  The note said "`Board.module.css` at 196 lines against the shared tile
  chrome", which reads as duplication. Measured: 186 lines of which **~38 are
  CSS**, and it duplicates nothing. The only name it shares with the shared
  sheet is `.tile`, and both are worn by the same element on purpose — the
  shared one carries the cursor and the touch behavior, this one adds
  `position: relative` for the identity dot. `.correct` / `.incorrect` do not
  restate the chrome either: they set `--tile-slot-fill/edge/ink`, feeding the
  shared tile through its token seam.

  The rest measured clean too: no class is defined and unworn; one raw value in
  four files (`outline-offset: 2px` on `.historyTile`, argued at length against
  the board frame's 3px and worse as a token); `BoardCol.module.css` is three
  rules that feed shared components through their own tokens;
  `GameEventLog.module.css` is one (`white-space: normal`, because a clue is a
  sentence and the shared log's cells do not wrap); `PlayArea.module.css` is one
  declaration. **So the goal — reduce CSS that duplicates common CSS or the
  play-surface scaffold — was met before this area opened, and there is nothing
  to remove.**

  `theme.css` STAYS (Joel, 2026-09-19), the one game file with zero non-comment
  lines — the other fourteen have one to fourteen. Its comment carried three
  false claims and now does not: the game was "on the chopping block post-beta"
  (it is the audit's control on a complete roster), the file existed for parity
  "across all three" games (sixteen), and it named
  `--outcomes-near-bar-color` — an outcome this game never produces.

  **Left alone, as a judgment call rather than a defect:** `Board.module.css`
  runs about 4:1 comment to rule. Some of that is geometry a reader cannot
  recover from the code; some is the design-argument kind Joel spent 2026-09-19
  cutting out of the TypeScript. Thinning it is a different act from fixing a
  false claim.
- **The doc** (Joel's goal): `src/psychicnum/doc.md` is designed here, the
  first game area — Schema / Tests / Rules sections — and absorbs what
  `docs/games/psychicnum.md` says that the code does not; what the code says,
  the doc stops repeating. The shape is the other fifteen's template.

  **The skeleton exists as of 2026-09-19** (Joel: *"while we won't write the
  full doc.md until later in this area, please make the skeleton doc.md file,
  per the plan"*), with seven headings — Intro to area · Game rules · Schema ·
  RPCs · FE submissions · Frontend · Tests — five of them marked owed. **Two
  are written**, both at Joel's ask and both so he can see what the game does:

  - **RPCs** — `create_game` and `submit_guess` at a few sentences each, with
    the JSON passed and returned, and `submit_guess`'s four `ok` shapes as a
    table (hit · completes the set · miss · the guess that spends the last
    budget) plus PA002. The rest of the RPCs are named and owed to pass 2.
  - **FE submissions** — what the frontend decides before a guess reaches the
    server. "Not on the board" is one rule the FE applies itself; the
    empty-entry gate belongs to `useCaptureKeys` rather than to this game; the
    in-flight dim is derived from `results` rather than cleared. Writing it
    turned up that **"already guessed" was NOT an FE check** — a guessed TILE
    was unclickable but nothing stopped typing the word — which is what
    F-psychicnum-1 below then fixed.

  **A new file is invisible to the guards until it is `git add`ed.** A British
  spelling went into this doc and `americanSpelling.test.ts` passed — it walks
  `git ls-files`, and the file was untracked. Staged, it failed on exactly that
  line. The same trap the stamp guard has. (And the note you are reading failed
  the guard a second time, for quoting the word as evidence: CLAUDE.md means
  that list absolutely, examples included — reach for `gaol` or `connexion` if
  prose ever needs to show one.)
- **The shared shapes** (Joel's goal): what this game's restructure settled is
  written into `docs/playarea.md` once, as the rule; the area file records
  only where psychicnum could not follow it.
- ~~**The race with no whole-table stop**~~ **HANDED ON 2026-09-19, and it was
  never psychicnum's.** Reading it out to Joel turned up that fourteen of the
  fifteen compete games have the same gap: End game exists and is hidden on the
  compete side. bananagrams is the one exception because it is the only
  compete-ONLY game — it had no coop half to inherit the button from, so it had
  to opt in — which makes the opt-in the accident and the gap the rule. The
  item now lives in `common/game-page/todo.md`, and psychicnum's copy is gone.
  Joel settled the one thing it said to check first: `ended` is neutral in every
  mode, compete included (*"it's just players deciding to stop — no one won, no
  one lost"*), so no game's `labelFor` may say otherwise.

### Then pass 3 — tile-feedback, tf1 → tf2

See Notes.

## Findings

*(`F-psychicnum-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### SHIPPED · F-psychicnum-1 · already-guessed-race · a duplicate guess is a race, not a verdict

**Joel's ruling** (2026-09-19, reading the new `doc.md`): *"given that the FE
prevents resubmitting a word, the RPC getting an already-guessed word is either
a bug or a race. We should reclassify this as a race and use a PN number."* And,
scoping it: *"i don't know that all places that raise PA002 are races — but it
certainly is for psychicnum."* (It was psychicnum's only PA raise; `common`'s
PA001 / PA003 / PA004 are untouched.)

**The premise was half true, and making it true is most of the change.** A
guessed TILE was already unclickable, but nothing stopped typing the word — so
the server's branch was reachable by ordinary play, which is why it had been an
`ok` in `warning` (`PA002`). `docs/envelopes.md` states the test exactly: *"was
anything local consulted first? A rule the client also enforces produces a race
when the server sees it; a rule only the server knows produces a verdict."* So
the classification could not change without the client check.

**What shipped:**

- `BoardCol.submitGuess` refuses a repeat before calling, beside the
  "Not on the board" check it already had. Its scope needs no thought: `results`
  is everyone's guesses in coop and the caller's own in compete, because RLS
  never shows more — which is exactly the server's scope.
- `lib/answer.ts` gains `already_guessed: 'warning'` — the same reading the four
  word games give a repeat ("you have it, and now you know"), and the same word
  the server used to send, so nothing the player sees changed.
- The raise is `PN497`, `hint = 'race'`, text unchanged. Both routes say
  "Already guessed", so which one caught it does not show.
- `BoardCol`'s `dbcode === 'PA002'` branch is gone and `GuessAnswer` is no
  longer nullable — the raise that made it so is a `not-ok` now, and
  `FeedbackMessage.notOk` handles it like every other refusal.
- Both pgTAP pins rewritten; the whole suite re-run green (179 files, 2511).
- `docs/envelopes.md`'s paragraph naming psychicnum as the deliberate exception
  now records the reversal instead — it is the canonical statement of the rule,
  and it named this game by name.

**A second thing the doc got wrong, caught by Joel in the same reading:** it
said the frontend does not "decide whether a word is a secret … all four reach
it as rows over the subscription." He asked *"doesn't the RPC return whether
the word is a secret?"* — it does. The answer arrives TWICE and the two are
different channels: the reply carries the caller's own verdict and the pill
reads it immediately; the board's permanent green or red comes from the
`events` row over the subscription, which is what every client sees and what a
reload rebuilds from. That is the same fact the in-flight dim is built on. The
section says so now, and the "never decides" claim is narrowed to what is true —
the FE holds no secrets mid-game, so it cannot tell a hit from a miss itself.

### SHIPPED · F-psychicnum-2 · answer-message · the outcome and the text move to one function

**Joel's design** (2026-09-19), after reading the doc: *"i've discovered it's
unpleasant to spread this between rpc + fe."* An `ok` RPC returns the FACT and
nothing else; the call site names an `answerType`; one function in `answer.ts`
turns that into the outcome and the text. *"this replaces the static FE-table
approach we use now."* `docs/envelopes.md` is NOT amended for now, on his word —
its rule 2 ("where the RPC can write the sentence, it does") still stands in the
doc while this game does the opposite.

**What it was fixing, measured here:** one event had two sources and three
hand-written sentences. The pill took its color from `res.outcome`; the
event-log bar and the peer line took theirs from `ANSWER_OUTCOME` — the same
table written twice, once in SQL and once in TS, pinned by two tests that each
assert a literal and never compare each other.

**The union turned out to carry a RULE, not just a payload.** A hit is narrated
three ways, and the compete one is load-bearing: a racer may learn *that* an
opponent found a secret and never which. So `opponent_found` is its own
answerType with no `word` field at all — the leak is now unrepresentable rather
than merely avoided. `spoiler` is the same shape one layer down.

**What shipped:** `Answer` is a discriminated union on `answerType` (Joel's
name — `kind` collides with the events column, and `type` with `res.type` at
the very call site where both appear); `answerFromEvent` replaces `answerOf`;
`answerMessage(answer)` replaces `ANSWER_OUTCOME` and returns `{ outcome, text }`.
Five `ok_envelope` calls dropped their outcome argument, and sixteen pgTAP pins
now assert **`"outcome":null`** rather than dropping the key — the envelope
always carries it, so asserting the null is what makes its reappearance fail.
Verified by planting an outcome back: two gameplay pins red. `Correct` /
`Incorrect` became `Correct: APPLE` / `Wrong: BERRY`, which is what the peer
line already said, so my own move and a teammate's now read alike.

**Mid-task mistake worth keeping:** reverting that plant with
`git checkout -- <file>` succeeded where I expected it to fail, and took the
whole file's uncommitted work with it. The `||` fallback never ran, because the
first command had not failed. Redone from scratch; nothing else was lost.

### F-psychicnum-3 · help-text-wrong · the Help modal tells players three things that are not true

**Found in the prose pass, 2026-09-19**, and it is the player-facing text
rather than a comment — which is why it is a finding and not a fix. Three
errors, all of them the number-guessing game showing through:

1. *"**Get a hint** to reveal one of the secret words"* — **a hint does not
   reveal a word.** It logs the dictionary CLUE for an unfound secret; the
   thing that hands over the word is the SPOILER, which the modal never
   mentions. This is the one distinction this game's vocabulary is most careful
   about, said backwards to the player.
2. *"the **numbers** are revealed"* — words. psychicnum was guess-the-number
   until 2026-06-28.
3. *"…are revealed and the game ends"* — **nothing is revealed automatically.**
   The reveal is a local, reversible toggle nobody has to press, and it is
   deliberately not automatic: `replay_board` hunts the same board and the same
   three secrets again, so a pre-revealed board would leave Restart nothing to
   find.

It also never mentions the spoiler, the per-player budget in compete, or that
the board is shared in coop but raced separately in compete — which the second
paragraph half-says and half-contradicts ("everyone races on their own board").

**SHIPPED 2026-09-19** on Joel's word, as proposed. Four paragraphs now: the
board and the budget; the two assists named apart, with the sentence the old
text got backwards (*a hint gives the dictionary clue — not the word; a spoiler
hands you the word, though you still have to guess it*); coop versus compete
including what a racer CAN see of a rival (their found count and their budget,
never their words); and the ending, where the secrets are not shown unless you
ask. The modal grew from 420×280 — the smallest of the sixteen by a wide
margin — to 460×400, which puts it among its siblings.

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

**The e2e ran clean for Steps 2 and 3 together** (2026-09-19, Joel's word,
after both were committed): the geometry harness without `BASELINE=1` — every
touched board at its Step 0 baseline — and the five psychicnum specs, 8 tests.
Nothing predicted broke and nothing unpredicted did.

**The second run covered nine commits** (2026-09-19, `80394e51..e74e45ce`):
Steps 4–6, BoardCol's sections, the doc, PN497 + the FE dedup, and the answer
machinery. Geometry green again. **One spec red, predicted before the run and
worse than a plain break**: `psychicnum-turn-order` dismisses the result pill
with `getByText(/^(Correct|Incorrect)$/)`, and the pill now says
`Correct: APPLE`. The anchored regex did not stop matching — the event log's
result cell says a bare `Correct` — so `.first()` resolved to a `<td>`, the
click dismissed nothing, and the failure surfaced two lines later as a count.
**A spec that clicks the wrong element fails somewhere else**, which is the
whole argument for reading a red rather than re-anchoring it. Fixed by matching
the trailing `: `, which is what separates the pill from the log.

- Step 2: `PlayArea.test.tsx` imports change if Decision 1 lands on
  "precedent" (it mounts the loader); its `useGame` mock is unchanged.
  **Held**: the import and about twenty mount sites now name `PlayAreaLoader`,
  the mock is untouched, and all 336 unit tests pass. The one break not
  predicted was `orphanedDocstrings.test.ts`, which failed BECAUSE the step
  fixed a listed orphan — its allowlist entry had to go.
- Step 3: the spec "the rows fire the same RPCs as the buttons, and gray once
  I have no guesses left" asserts the gray from `isStillPlaying`, not from
  the flags, so it should hold; verified at the step. **Held** — all 336 unit
  tests pass, including the menu-order specs, which read rows by id rather
  than by position.

## Closing

- [x] `e2e/psychicnum-terminal.e2e.ts` renamed to what it asserts (2026-09-19):
      the title is "…go green, then hide again", the helper is `greenTiles`,
      and the docstring says the spec measures a FILL rather than narrating the
      ring it once looked for. It also cited `psychicnum.games_view`, a view
      that has never existed under that name — the gate is `games_state`
- [x] **"Wrong" throughout the game** (Joel, 2026-09-19), closing the split the
      `answerMessage` work opened. The log keeps writing its own words — a word
      and a verdict are two columns there, not a sentence — but the verdict WORD
      is the game's, so the cell says Wrong. **The printed board said `Incorrect`
      too**, which the split had hidden: `pdf/model.ts` builds its turn lines
      from `is_correct` directly and so was never going through `answerMessage`
      at all. Six sites in all, three of them comments
- [ ] the whole area re-read in one sitting after the last group
- [x] **`docs/games/psychicnum.md` is DELETED** (2026-09-19). Its Won't-do
      moved to `todo.md` at Step 1; the rest is in `src/psychicnum/doc.md`,
      which is 313 lines against its 593 — the shape Joel set for a game doc
      (a first-thing-to-read, the rules, API-like RPC/FE-submission sections,
      a component diagram, and nothing the code or a shared doc already says).
      **Twelve inbound links repointed, and six of them were wrong before the
      move**: `wordiply`, `wordwheel`, `letterboxed`, `spellingbee`, `setgame`
      and `connections` all cited psychicnum's doc for "the sibling-manifest
      pattern's canonical write-up", which that doc itself said lives in
      `docs/common.md`. They point one hop further now, at the real home.
      `docs/code-conventions.md` ×2, `docs/common.md`, `docs/testing.md`,
      `CLAUDE.md` and `psychicnum/manifest.ts` took the new path.
      **`src/guards/docLinks.test.ts` caught four a grep had not** — relative
      links from inside `docs/games/` that name `psychicnum.md` with no
      directory (three in connections, one in spellingbee)
- [x] **the shape this game settled is in `docs/playarea.md`** (2026-09-19),
      as "The shape of a game's PlayArea.tsx", above the BoardCol / InfoCol
      decomposition it precedes: the loader and the loaded component with the
      three gates and why each is the shared one; the eight sections in order,
      with the rule that a section header states the RULE rather than listing
      its contents; the commands in one block with no `useCallback` and no
      in-flight flag, and the one order the bindings block, the info column's
      prop list and the menu rows keep; and `buildTerminalMessage` leaving for
      `lib/terminal.ts`. The other fifteen conform as each area opens (Joel),
      and where one cannot, its area file says why.
      **The five `common/` prose sites are done too**, and two of them were
      counting rather than naming a condition: "every game's `buildOver()`"
      is now "each game builds its own… `buildTerminalMessage` where a game has
      been converted, `buildOver` in the games that have not", which stays true
      at every point of the rollout instead of being wrong at fifteen of them.
- [ ] `plans/app-audit.md` §3's game row says three passes (it says two)
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
