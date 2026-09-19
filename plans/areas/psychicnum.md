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
order, the comment pass. **The restructure (pass 1) is COMPLETE.**

**Pass 2, the audit: the READ is DONE (2026-09-19)** — Joel: *"this area never
got a true audit, though. do the audit."* Every roster file read end to end:
the thirty-one in `src/psychicnum/`, the three SQL files, the seven pgTAP
files, and the net (the five e2e specs, the gallery script, every sentence in
`docs/` that names the game). Baseline at the read: `tsc -b` clean, lint
clean, 82 of 82 unit tests green. **Seventeen findings, F-psychicnum-4 to
F-psychicnum-20; nothing in the code moved at the read.** The first four
carry a decision. **F-4 is RULED** (Joel, same day): every board is five-letter
words plus one nine-letter word, and that is the design — the "TEMP" prose
that called it a font-tuning aid is gone and the doc and the CSS say what the
board is. The rest are prose — stale claims, the marker pass, a banned word —
and two shape questions. Sixteen open. The earlier three findings (F-1 to F-3) shipped
during the restructure.

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
- **Doc — 1 file**: `docs/games/psychicnum.md` (600 lines). **DELETED
  2026-09-19**; the doc is `src/psychicnum/doc.md` now, and `todo.md` beside it
  — both on the roster, neither stamped (a `.md` carries no stamp).
- **The pgTAP suite — 7 files**, `supabase/tests/psychicnum/` (`concede`,
  `create_game`, `end_game`, `gameplay`, `replay`, `rls`, `turn_order`), all
  `cs-unmet`. Listed at the audit (2026-09-19): they are this game's own files
  and the stamp scope covers `supabase/`, so they are roster, not net.

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

### The audit's findings — 2026-09-19

Ordered by what they cost, not by file. The first three carry a decision; the
rest are prose and shape, and most have one obvious fix.

### RULED · F-psychicnum-4 · `board-sampling-hack` · every board is five-letter words plus one nine-letter word, and the comment says it is temporary

**Joel, 2026-09-19: keep the one longer word** — *"it's useful; remove
comments that claim it's a temporary fix."* So the board is a design, not a
leftover: the sample comment in `create_game` and the RPC header now describe
five-letter words plus one nine-letter word as the board's texture; the
`Board.module.css` knob comment says the knobs are set for that pair rather
than for a three-to-twelve spread; `doc.md`'s rules say it. No test pins the
lengths — offered, not built.

**Where:** `supabase/sql/psychicnum.sql` → `create_game`, the board sample.
The query is two branches unioned: `word_count - 1` words with `len = 5`, then
exactly one with `len = 9`. Above it:

```
-- TEMP (texture for font-sizing): all 5-letter words EXCEPT one 9-letter
-- word, so the board shows differing word widths while we tune the font.
-- Revert to the plain length-agnostic sample (just the 5-letter branch's
-- filter, no `len` clause, limit s_word_count) once the font work is done.
```

**The font work is done** — "tiles condense before they shrink" shipped
2026-09-19 across three games (`0504dce7`, `0a3272ec`, `c0ea43a4`). The hack
has been in since the game was written as a word game (`2bb7f894`,
2026-06-28) and rode the SQL split (`e67f0956`) into the repeatable half, which
is re-applied on every deploy — so **prod deals this board today**: every
psychicnum game is N−1 five-letter words and one nine-letter word, at any
difficulty band.

**Three things say otherwise, and none of them is pinned:**

- `Board.module.css` → `.grid`, on the two `wdth` knobs: *"This game draws
  from the dictionary, so its words run from three letters to a dozen on the
  same board — the widest spread of any tile game, which is why the two knobs
  are set here."* Under the hack the spread is exactly 5 and 9. The knobs were
  tuned against that board.
- `doc.md` → Game rules: *"N words sampled from `common.words` under a clean +
  American + non-slang + difficulty-band filter."* No length clause.
- `create_game_test.sql` pins the count, the three secrets and the subset
  property — never a length. Which is how a TEMP survived twelve weeks.

**Options:**

- *"revert"* — what the comment itself instructs: one branch, the clean +
  american + non-slang + band filter, `limit s_word_count`, no `len`. The tile
  knobs then need a look with real boards (pass 3's business, since it is the
  board's look). A pgTAP assertion that a dealt board's lengths are not all
  one value would be cheap and would have caught this.
- *"keep, as a design"* — a board with one long word is a texture the game
  wants. Then the comment stops saying TEMP, `doc.md`'s rules say it, the CSS
  comment stops claiming a three-to-twelve spread, and a test pins it.
- *"a real mix"* — sample across lengths deliberately (say 4–9) rather than
  the accidental 5+one-9. A design decision, and `doc.md` would carry it.

**Recommendation: revert.** The comment records the intent, the font work it
waited on is in, and a deliberate texture would deserve to be designed rather
than inherited from a tuning aid.

### SHIPPED · F-psychicnum-5 · `terminal-reads-the-clock` · the terminal message decides the reason from the client clock, and cannot say "all conceded"

**Joel, 2026-09-19: "read the outcome."** `buildTerminalMessage` takes
`reason` — `status.outcome`, the server's word — in place of `timerExpired`;
`PlayArea` passes it and no longer reads `timer` at all. An all-conceded race
now reads *All conceded — no winner* on the pill and *All conceded* in the
info column, the club-list label's words. `terminal.test.ts` walks every
reason the RPCs write (`solved` · `exhausted` · `timeout` · `conceded` ·
`manual`, and absent) through every terminal state in both modes, and the
compete loss case has its third row. **Verified by planting two faults**: the
conceded arm dropped (1 red), and the coop loss reading `conceded` for the
clock (1 red).

**Where:** `lib/terminal.ts` takes `timerExpired` (from `timer.expired`, the
browser-side clock in `GamePageCtx`) and branches the loss on it: out of time,
else out of guesses. **The server already wrote the reason** —
`status.outcome` is `'exhausted' | 'timeout' | 'conceded' | 'manual' |
'solved'`, written by `submit_guess`, `submit_timeout`, `_maybe_finish_compete`
and `end_game` — and the manifest's `labelFor` reads exactly that (`LOSS`).
So the club page and the play surface answer "why did it end" from two
different sources.

**What it gets wrong today:** `_maybe_finish_compete` ends a race in
`lost_compete` with `outcome = 'conceded'` when every player has conceded.
The club page says *Lost (all conceded)*; the pill says *Out of guesses — no
winner* and the info column says *Out of guesses*. Every player in that game
has a full or partial budget and conceded on purpose. (`concede_test.sql`
pins the play state and not the outcome, and `terminal.test.ts` walks
`timerExpired` in both values, so both suites are green while the surfaces
disagree.)

**Options:**

- *"read the outcome"* — the builder takes `reason: status.outcome` instead
  of `timerExpired`: `timeout` → out of time, `conceded` → all conceded,
  anything else → out of guesses. One source, the server's, and the
  `terminal.test.ts` table gains a row per reason. `timer.expired` stays what
  it is for the clock's own display.
- *"add the arm, keep the clock"* — pass `allConceded` beside `timerExpired`.
  Fixes the words, keeps two sources.
- *"leave"* — an all-conceded race is rare among friends.

**Recommendation: read the outcome.** It is the reason the column exists, and
the manifest already trusts it.

### SHIPPED · F-psychicnum-6 · `compete-celebration-premise` · the reason compete gets no confetti stopped being true at Step 2

**Joel, 2026-09-19: "celebrate the winner."** The gate is `playState ===
'won' || (playState === 'won_compete' && iFoundThemAll)`; `iFoundThemAll`
moved up into Page hooks beside the hook that reads it, and the modal's body
says *You found all three first.* in a race. Four cases in `PlayArea.test.tsx`:
the racer who completed the set (with the budget row landing a render after
the play state, the order the two refetches can arrive in), the beaten racer,
a reload of a race already won, and the coop team. **Verified by planting
two faults**: the gate back to coop-only (1 red), and the gate reading
`won_compete` alone, which is "SOMEONE won" (2 red). The first-render rule's
two homes — `docs/ui.md` → Terminal results and `useCelebration`'s docstring
— said a game's own rows are null on the first render; that was true before
the loader split and this game is now the counterexample, so both carry the
one clause: a game's own rows count where its loader awaited them.

**Where:** `PlayArea.tsx` → Page hooks:

```
// That rules COMPETE out: `won_compete` means SOMEONE won, and telling my
// win from my loss needs `playerBudgets`, which is empty until the fetch
// lands.
const celebration = useCelebration(playState === 'won')
```

`useCelebration`'s rule 1 is *gate only on values correct on the FIRST
render*. Before the loader split, `playerBudgets` was `[]` on the first
render and filled later, so `iFoundThemAll` would have flipped false→true on
a reload of a finished race and popped confetti at a reviewer. **After the
split, `PlayArea` mounts with `playerBudgets` in hand** — `useGame` sets the
game, the budgets and the guesses in one load, and the loader holds the gate
until then. So `playState === 'won_compete' && iFoundThemAll` is correct on
the first render: a reload seeds `prevWon` true and stays quiet; a live win
flips it and pops. The premise the comment rests on is gone.

**Options:**

- *"celebrate the winner"* — `useCelebration(playState === 'won' ||
  (playState === 'won_compete' && iFoundThemAll))`, with the title and body
  reading for a race ("You win the race!"). The loser gets nothing, which is
  right. `PlayArea.test.tsx` gains a compete win case and a reload case.
- *"keep coop-only, fix the comment"* — if there is a reason a race winner
  should not get the modal (one modal at terminal is a rule the comment
  already cites; the winner's pill says *Won: the race*), the comment says
  that reason and drops the one that is false.

**Recommendation: celebrate the winner.** The coop team gets confetti for the
same three words; a racer who beat the table to them has done more.

### SHIPPED · F-psychicnum-7 · `default-timer-fifteen-seconds` · the default setup is a fifteen-second countdown, and ui.md says none

**Joel, 2026-09-19: "set it to none."** `DEFAULT_PSYCHICNUM_SETUP.timer` is
`{ kind: 'none' }`, the docstring's "casual game with stakes" sentence is gone,
and `docs/ui.md`'s sentence is true again without changing. The
`SetupForm.test.tsx` draw uses the default, so its timer field still renders
(the section is always present; only the picked kind changed).

**Where:** `lib/setup.ts` → `DEFAULT_PSYCHICNUM_SETUP.timer` is
`{ kind: 'countdown', seconds: 15 }`, with the docstring *"the timer defaults
to a count-down — a 'casual game with stakes'"*. Fifteen seconds is the whole
game. Ten other games' defaults are `{ kind: 'none' }`, and
`docs/ui.md` → the setup-choice list says *"psychicnum and codenamesduet
default to none"* — true of codenamesduet, false of this file since
`d29ba2ce` (2026-06-20). The club-saved default overrides it after the first
game, which is why nobody has met it lately; a fresh club meets it on its
first psychicnum game.

**Options:** *"none"* (what ui.md says and the roster does) · *"a real
countdown"* (5:00, if a casual-stakes clock is the design — then ui.md changes
instead) · *"keep 15"* (then `doc.md` says why).

**Recommendation: none.** A default is a decision, and this one reads as a
value left over from testing the timeout path.

### SHIPPED · F-psychicnum-8 · `spoiler-called-three-things` · the spoiler and the miss each read differently on four surfaces

**Joel, 2026-09-19: "we can use 'spoiler' for all of these."** The log cell
and the PDF line say *Spoiler*, the history banner says *Spoiler: CHERRY*, the
teammate's line says *got spoiler* (the twin of *got hint*), and the banner's
verdicts are *Correct* / *Wrong* like every other surface. Four code files,
three test files, `GameEventLog`'s docstring (which still listed the kind as
"a reveal") and the `doc.md` answer table. The only "revealed" left in the
folder is the plain English verb in prose.

The "Wrong throughout" pass (Closing, above) settled the miss on the pill,
the log and the PDF. Two words are still spread:

| surface | a spoiler row | a miss | a hit |
|---|---|---|---|
| the button and the menu | Spoiler | — | — |
| the event log (`GameEventLog.tsx`) | **Answer** | Wrong | Correct |
| the PDF (`pdf/model.ts`) | **— Answer** | — Wrong | — Correct |
| the history banner (`lib/history.ts` → `describe`) | **Revealed CHERRY** | **BERRY — not a secret** | **APPLE — a secret!** |
| a teammate's header line (`lib/answer.ts`) | **revealed word** | Wrong: BERRY | Correct: APPLE |

"Revealed" is the one that costs something: the reveal-solution vocabulary
reserves *reveal* for the whole-solution toggle, and the 20260917 migration
renamed the kind from `reveal` to `spoiler` for exactly that reason — so the
banner and the peer line say the word the schema gave up. `GameEventLog`'s
docstring also still lists the row kind as *"a **reveal** (a revealed
answer)"*.

**Options:** *"one word"* — the spoiler row says *Spoiler* on the log, the
PDF and the banner, and the peer line says *got spoiler* to match *got hint*;
the banner's miss and hit say *Wrong* / *Correct* like everywhere else ·
*"banner stays prose"* — the banner is a sentence and may phrase; only
"Revealed" changes.

### SHIPPED · F-psychicnum-9 · `todo-stale` · two shipped items and a non-item are still in `todo.md`

**Joel, 2026-09-19: "fix."** The three bullets are deleted; Bugs is empty.

- **Bugs:** *"`act-new-game` answers `active` before the game row has
  loaded…"* — Step 2 closed it: the bindings mount with the game.
- **Someday:** *"`PlayArea.tsx` returns its own `<p>Loading game…</p>`…"* —
  Step 2 closed it: the loader returns `<Loading>`.
- **Soon:** *"This is the control game for the app audit…"* — not work owed
  to anyone; the area file and `doc.md` both say it.

No decision: delete the three. The tile-fill item in Soon is pass 3's and
stays.

### SHIPPED · F-psychicnum-10 · `docstring-marker-pass` · a field note written `/**` in nine files

**Joel, 2026-09-19: "do it."** Every indented `/**` in the nine files is a
`//` now, words untouched; no column-0 docstring moved. `lib/terminal.ts` was
already right by then (its two notes were written `//` with F-5). The test
files keep their `/**` on helper functions — those are declarations of their
own, not members.

The pass every area makes (app-audit.md §4). `Board.tsx` and `PlayArea.tsx`
have it right (`//` on every prop); these do not:

- `InfoCol.tsx` — the whole props block, twenty-odd `/**` on members.
- `GameEventLog.tsx` — `Props`: `guesses`, `isTerminal`, `historyId`,
  `onShowHistory`.
- `StateLine.tsx` — three of the four props.
- `BoardCol.tsx` — one: `historyActor` (the rest are `//`).
- `hooks/useGame.ts` — `PsychicnumGame.words` / `.secrets`,
  `PlayerRow.found_secrets_count`, three `EventRow` fields, the return type's
  `failure`.
- `lib/setup.ts` — every field of `PsychicnumValues`.
- `lib/answer.ts` — each arm of the `Answer` union, and `AnswerMessage.text`.
- `lib/history.ts` — the three `HistorySnapshot` fields.
- `lib/terminal.ts` — `selfWon`, `winnerName`.
- `pdf/model.ts` — `PrintTrack.result`, the two `PsychicnumPrintModel`
  fields, `words` and `guesses` in the builder's parameter.

No decision; the rule is written. A read per file, not a sweep.

### SHIPPED · F-psychicnum-11 · `comments-on-the-wrong-line` · orphaned, misattached and false comments the restructure left

**Joel, 2026-09-19: "do it."** The orphan and the misattached comment in
`InfoCol` deleted; the stray definable-word comment in `GameEventLog` moved
onto the `<DefinableWord>` cell and "both row kinds" is "every row kind";
`BoardCol`'s docstring says it derives `isViewingHistory` from the label;
"count count" fixed; and the budget row is looked up ONCE (`myBudgetRow`, in
Page hooks where its first reader is), with `selfSecretsFound`,
`iFoundThemAll`, `selfBudget` and `selfWon` all read off it. Two of the seven
items had already gone with F-5 (`isTerminal && mode`) and F-6.

- `InfoCol.tsx` → props type: `/** The number of board tiles (setup echo). */`
  sits above nothing — the prop it described is gone.
- `InfoCol.tsx` → above `rowMessage`: *"The exit — error-toned (red), and
  BOTH are placed: compete's CONCEDE … and coop's neutral "End" … Icon-only …
  the styled tooltip carries the label and the key."* That describes the
  Concede / End buttons forty lines below; the comment that belongs to
  `rowMessage` starts on the next line.
- `GameEventLog.tsx`: *"A guessed / revealed word is a real dictionary word,
  so it is definable; a HINT row's `word` is a clue sentence, so it is not."*
  — followed by a blank line and `turnNumber`. It belongs beside
  `<DefinableWord>` in the row. The next comment says the `#N` cell is *"shared
  by both row kinds"*; there are three.
- `BoardCol.tsx` docstring: *"PlayArea hands it the board to render … +
  `isViewingHistory`"* — the flag is derived in this file from `historyLabel`,
  and the section header under it says so.
- `PlayArea.tsx` → Narration: *"an opponent's public found_secrets_count count
  ticks up"*.
- `PlayArea.tsx` → the verdict memo: `isTerminal && mode ? … : null` — `mode`
  is `game.mode`, never falsy since the split; a leftover of `mode ?? 'coop'`.
- `PlayArea.tsx`: `selfSecretsFound` is computed in the local-slot section,
  and `iFoundThemAll` in Derived is the same row's same column against
  `SECRET_COUNT` — three `playerBudgets.find(me)` calls for one row, and
  `selfWon` is `mode === 'compete' ? iFoundThemAll : true` written a second
  way. One `mine = playerBudgets.find(me)` in Derived, then `selfBudget`,
  `selfSecretsFound` and `iFoundThemAll` off it.

No decision in any of these.

### SHIPPED · F-psychicnum-12 · `two-spellings-of-one-fact` · InfoCol re-derives two answers the context already carries

**Joel, 2026-09-19: "one answer each."** `InfoCol` takes `isMyTurn` (the
shell's, the one `BoardCol` gates the entry on) and gates the help line on it;
`myTurn` and its derivation are gone. `<TurnStatusLine>` reads the
`isTerminal` prop the column already had rather than `terminalMessage !==
null`. The existing turn-order specs cover the help line through
`ctx.isMyTurn` — **verified by planting**: the gate dropped reds "on a
teammate's turn" (1 red).

- It takes `isTerminal` as a prop (for the log's picker) **and** derives
  `isTerminal={terminalMessage !== null}` for `<TurnStatusLine>` — the same
  fact by two routes, one of which depends on the memo never returning null
  for a terminal game.
- It takes `currentTurnUserId` and re-derives `myTurn = currentTurnUserId ===
  null || currentTurnUserId === selfId` to gate the help line, while
  `GamePageCtx.isMyTurn` is the shell's answer and `BoardCol` reads that one.
  The Derived section's rule is that the columns must not answer the same
  question differently.

**Options:** pass `isMyTurn` and use the `isTerminal` prop · leave, since the
two derivations happen to agree today.

### SHIPPED · F-psychicnum-13 · `manifest-prose` · the manifest's comments describe a different file

**Joel, 2026-09-19: "do it."** The loader comment says the PlayArea reads
`game.mode`; the ClubPage plan is gone; the setup-form comment lost its "now"
and its short field list; the status-blob comment lists the shape per mode
as the SQL writes it; and `lost_compete` reads `LOSS` for every reason, with
the ternary deciding only whether "no winner" follows. The generated
status-label table is unchanged (`gameStatusLabels.test.ts` green). The two
"copy"s wait for F-17.

- On `playAreaLoader`: *"branches on `manifest.mode` (or, at runtime, on
  `common.games.gametype` to derive mode)"* — it reads `game.mode`, the column
  `useGame`'s docstring says exists so nobody parses the gametype string.
- The file docstring: *"Today the registry filters by gametype string;
  tomorrow, ClubPage may render baseGametype siblings as a single grouped
  block"* — a plan in a docstring (docs are current state).
- On `setupFormLoader`: *"mode is locked at gametype level now, not a setup
  choice"* — archaeology.
- The `labelFor` block comment lists the status blob as `{ guesses_remaining }`
  / `{ outcome, guesses_used, winner_username }` and omits
  `found_secrets_count` / `required_secrets_count`, which `StatusBlob` and
  `create_game`'s seed both carry.
- `psychicnumCompeteGame.labelFor` → `lost_compete`: the ternary's first arm
  hand-writes `'all conceded'`, which is `LOSS.conceded` — the table exists so
  the word is written once. Only the trailing `'no winner'` differs.
- Two of the banned word (F-psychicnum-17).

### SHIPPED · F-psychicnum-14 · `stale-prose-in-sql-and-tests` · sentences in the SQL and pgTAP that name something not there

**Joel, 2026-09-19: "do it."** All ten sites, prose only: the SQL's seven
(both "game is not active"s say "Game over"; the hint and spoiler headers say
the header line's words; `submit_timeout`'s P0001 is the game-over race and
its realtime-touch comment names Reveal solution rather than two strings that
never existed; `end_game`'s "green" is "neutral"), the migration's dead path
added to its header's "read this as" note, and the four test files. The SQL
re-applied locally and the whole pgTAP suite re-run green.

`supabase/sql/psychicnum.sql`:

- `end_game` header: *"(green "Game ended", not the red "you lost")"* —
  `ended` is neutral, and neutral is not green (docs/outcomes.md).
- `submit_timeout` header: *"a second concurrent fire … raises P0001; the FE
  swallows"* — it is `_raise_game_over`'s `PN486`, a race the FE shows as a
  pill. And the realtime-touch comment: *"BoardCol shows the fallback "Game
  over." instead of the "The words were …" reveal"* — neither string exists.
- `request_hint` / `request_spoiler` headers: *"X asked for a hint"* / *"X
  revealed a word"* — the peer line says *got hint* / *revealed word*
  (`lib/answer.ts`; F-psychicnum-8 may change the second).
- `submit_guess` header: *"raises 'game is not active'"* — the text is *Game
  over*.
- The migration `20260615000002` cites `src/common/lib/games.ts`, a path that
  does not exist (`src/common/manifest/gameManifest.ts`). The file is frozen,
  but its header already carries a post-hoc "read this as" note, which is
  where a second line would go.

`supabase/tests/psychicnum/`:

- `end_game_test.sql`: *"raises P0001"* four times, beside assertions of
  `PN486`.
- `gameplay_test.sql` header: *"request_hint/reveal"*; two assertion numbers
  used twice (`(10)`, `(11)`).
- `create_game_test.sql`: *"(10) Target is a 1..10 int"* — the number game;
  the header says setup validation covers *"guesses + timer"* and the file
  covers word_count and difficulty too.
- `replay_test.sql`: *"42501 = common.require_game_player's 'not-a-player|'"*
  beside an assertion of `PN253`.

No decision in any of these.

### SHIPPED · F-psychicnum-15 · `stale-claims-in-docs` · eleven sentences in `docs/` about this game that are no longer true

**Joel, 2026-09-19: "do it."** Ten sentences changed across seven docs; the
eleventh (ui.md's timer default) came true with F-7 and needed nothing. The
game-end-screens paragraph in ui.md was deleted outright — both games use the
shared row and pill. Link and spelling guards green.

All outside the roster; a closed area is not locked, and each is a one-line
fix in its doc:

- `docs/ui.md` → setup choices: *"psychicnum and codenamesduet default to
  none"* — see F-psychicnum-7, whichever way it goes.
- `docs/ui.md` → Help: *"connections and psychicnum carry placeholder content
  until they earn real copy"* — psychicnum's Help was rewritten
  (F-psychicnum-3).
- `docs/ui.md` → Terminal results: *"psychicnum's ringed secrets"* — they go
  green; nothing is ringed (`Board.tsx`'s docstring).
- `docs/ui.md` → game-end vocabulary: *"psychicnum and codenamesduet each
  render their game-end screens differently today"* — both use the shared
  terminal row and pill.
- `docs/common.md` → global shortcuts: *"psychicnum's guess field — opted in
  with `data-game-input`"* — no such attribute anywhere in `src/psychicnum`;
  the entry is a display `<div>` and keys are read off the window.
- `docs/code-conventions.md` → realtime: *"psychicnum's useGame subscribes to
  `games` AND `guesses`"* — three tables, and the third is `events`.
- `docs/code-conventions.md` → PlayArea: *"just a text input (psychicnum)"* —
  it has a grid of tiles.
- `docs/playarea.md` → the info-column table: *"(psychicnum: tiles / secrets
  / difficulty)"* — the recap is roster, pacing, guesses, words on board,
  dictionary, timer (`lib/setupSummary.ts`).
- `docs/states.md`: *"the simplest is psychicnum coop (`playing` / `won` /
  `lost`)"* — plus `ended`.
- `docs/win-lose.md` → the hint table's paragraph: *"psychicnum's compete
  reveal … the revealed word"* — the spoiler.
- `docs/testing.md`: *"psychicnum's only helper is inline target-pinning"* —
  the number game's word; it pins a board and three secrets.

No decision, except the first.

### SHIPPED · F-psychicnum-16 · `e2e-prose` · the specs write screenshots into dead session folders, and three comments are stale

**Joel, 2026-09-19: "drop them."** The two psychicnum specs' screenshot calls
are gone, and so are the three siblings' with the same dead path
(`wordle-history`, `codenamesduet-history`, `connections-history`) — the sweep
this finding caused, no stamp moved. The gallery is the visual record. The
history spec's "(still monolithic)" is gone and the terminal spec's token name
has its `s`. The "end copy" waits for F-17. The e2e suite was not run: no
assertion changed.

- `psychicnum-history.e2e.ts` and `psychicnum-turn-order.e2e.ts` call
  `page.screenshot({ path: '/private/tmp/claude-501/…/<session>/scratchpad/…' })`
  — two different sessions' scratchpad paths, committed. Playwright creates
  the directory, so the run does not fail; the files land in a folder nothing
  reads. Drop the screenshots, or point them at `e2e/.artifacts/`.
- `psychicnum-history.e2e.ts` docstring: *"the feature added on the (still
  monolithic) PlayArea"* — archaeology, and untrue since the decomposition.
- `psychicnum-terminal.e2e.ts`: the comment names `--outcome-won-fill-color`;
  the token is `--outcomes-won-fill-color`. And one of the banned word
  (F-psychicnum-17).

### F-psychicnum-17 · `banned-word-copy` · "copy" for a message's words, in five files

`manifest.ts` (*"Start-button copy"*, *"terminal copy"*),
`components/SetupForm.tsx` (*"Copy is mode-neutral on purpose"*),
`supabase/sql/psychicnum.sql` → `submit_timeout` (*"the FE's terminal copy can
show mode-appropriate copy"*), `e2e/psychicnum-terminal.e2e.ts` (*"the shared
neutral end copy"*), `e2e/psychicnum-turn-order.e2e.ts` (*"the turn copy"*,
*"the slot's copy"*), `PlayArea.test.tsx` (*"the turn copy"*). The word is
*text* (or *words*, *line*, *label*). No decision.

### F-psychicnum-18 · `history-tile-comment` · thirty-four lines of comment on a two-declaration rule, with archaeology in them

`Board.module.css` → `.historyTile`: `outline: 3px solid var(--history-color);
outline-offset: 2px;` under a comment that says the ring was inset *"until
2026-08-20"*, gives the contrast ratios that decision was made on, argues the
2px and the 3px, and maps the overlap with the board frame on edge tiles. The
CSS check (above) left the file's comment ratio as a judgment call; this one
comment is the bulk of it, and the dated sentence is archaeology by the
repo's own rule. What a reader needs is four lines: outside the tile like
every history ring, 2px off so it reads as a ring rather than a border, 3px
because an offset ring is not backed by a fill, and the known overlap with the
frame on edge tiles.

**Options:** *"thin to the four"* · *"leave"* (Joel read it 2026-09-19 and
left it).

### F-psychicnum-19 · `pdf-prose` · a count that is wrong and a number written twice

- `pdf/printPsychicnumPdf.ts` → `drawGuessList`: *"psychicnum's budget is
  seven guesses, so a track's list never paginates"* — the budget is 3 to 9,
  and hint and spoiler rows are in the list too. The list does not paginate;
  the reason given is not why.
- `pdf/model.ts` → `track`: `` `${found} of 3 secrets found` `` — the 3 is
  `SECRET_COUNT` in `PlayArea.tsx`, which the print model does not import.
  One home, or the builder takes it as an argument.

### F-psychicnum-20 · `docstrings-that-name-what-is-not-there` · in `useGame`, `Help` and `setup`

- `hooks/useGame.ts` → the return type's `failure`: *"The surface renders this
  instead of "Game not found.""* — that `<p>` went at Step 2; it renders
  `<EnvelopeErrorPage>`, against `<NoSuchGamePage>` for the other case.
- `components/Help.tsx` docstring: *"Implements the common `help:
  ComponentType<{ onClose }>` contract"* — the contract is `{ onClose, brand }`
  and the component takes both.
- `lib/setup.ts` → `guesses`: *"the shared pool every club member draws
  from. 7 is the historical default"* — per player in compete; "historical"
  is archaeology. → `timer`: *"`countdown` flips the game to `lost`"* —
  `lost_compete` in a race. The type docstring: *"see the migration's
  validation block"* — the validation is in `supabase/sql/psychicnum.sql` →
  `create_game`, not the migration.

No decision in any of these.

### What checked out

Read and found sound, so the next sitting need not re-derive it: the three
gates and the split; the eight sections and the one order the bindings, the
prop list and the menu keep; `submit_guess`'s scope rules (coop = anyone's
row, compete = the caller's) matching `BoardCol`'s local checks exactly;
`events_select`'s three arms and the column grant on `secrets`; the realtime
touch after every terminal write that skips `psychicnum.games`; the empty
entry never submitting (`useCaptureKeys` disables Submit on `''`, so
`BoardCol` needs no gate); `historySnapshot` resolving by id against the
filtered list; the print model's per-player tracks; the Answer union carrying
the no-word rule for `found_peer`; the status-label doc's psychicnum rows
against `labelFor`; the `events` table in the publication after the rename
(`events_skeleton_test.sql`). `BoardCol`'s two `useCallback`s are not the
commands block's, so the shape rule does not reach them.

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
- [x] `plans/app-audit.md` §3's row 53 says THREE passes (2026-09-19), with the
      reason the restructure goes first, and points at `docs/playarea.md` for
      the shape this game settled
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
