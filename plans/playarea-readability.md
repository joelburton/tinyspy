# PlayArea readability — the target for each game's `PlayArea.tsx`

**Read this per GAME AREA, not as a sprint of its own.** Joel, 2026-09-19: as
the audit reaches the sixteen game areas, these recommendations get applied
game by game, in each game's own area. Like [tile-feedback.md](tile-feedback.md),
this is a design target a game area consults when it opens its `PlayArea.tsx`,
not a pass waiting its turn. Nothing here is built ahead of an area, and
nothing here is settled until the first game area settles it — **psychicnum is
the control** ([app-audit.md → §3, the games](app-audit.md#3-the-areas-in-order)),
so the shape it lands is the shape the other fifteen copy.

The recommendations were first offered on 2026-09-07 and re-surveyed against
the tree on 2026-09-19. Between those dates the audit rebuilt the action
system, the feedback slots and the reveal, so §2 is the fresh survey and §3
marks each recommendation as it stands now: still open, done, or new.

---

## 1. The question

Joel has been making the app more human-understandable. The per-game
`PlayArea.tsx` files are large and mix concerns: the data hook and its gates,
the derivations, the below-board feedback, the input engine, the bound
actions, the menu, narration, and a terminal-text builder. What would improve
readability and understanding — and now that the pieces a PlayArea composes
are shared, what shape should the composition itself have?

## 2. What the survey found (2026-09-19)

The sixteen PlayAreas run 616 to 1151 lines (12,746 in all); a quarter to two
fifths of every file is comment lines (26% crosswords, 41% connections).
`docs/playarea.md`'s BoardCol / InfoCol decomposition is sound and is not what
this is about — every game is on it. This is about the coordinator that is
left.

**What a PlayArea is made of now.** The recurring contents, and how many of
the sixteen carry each — so a reader knows what is the shared skeleton and
what is the game:

| piece | files | what it is |
|---|---|---|
| `useGame` + three gates (loading / failure / not found) | 16 | the data hook and the early returns |
| `useTabRing([])`, `useInfoSheet()` | 15 | the empty tab ring; the mobile info sheet |
| `useFeedbackSlot('local')` + `showTerminalVerdict` | 16 | the below-board slot and its verdict effect |
| `showOutOfRace` / `showWaiting` effects | 15 / 9 | the other standing conditions of the slot |
| `useStandardGameActions` (End, Concede, Restart) | 16 | the shared trio, bound |
| `act-new-game`, `act-print-board`, bound in the file | 16 | the two every game binds itself |
| `useSolutionReveal` + `describeReveal` | 10 | the reveal, shared since the `reveal` area |
| `usePeerFeedback` | 10 | peer narration into the global slot |
| `useCelebration`, `useTurnStartFlash` | 14 / 4 | the coop-win confetti; the your-turn flash |
| `useHistoryViewer` | 9 (+ scrabble's own) | the turn-history viewer |
| `summaryRows` via `setupRows` | 15 | the setup recap, built once for the column and the paper |
| `publishGameMenu` effect via `buildGameMenu` | 16 | the menu, pushed from the bindings |
| a pure `buildOver` tail | 15 | the terminal message per play state |

**Still true from the first survey:**

- **Null guards before the loading gate.** `game?.` appears 0 to 16 times per
  file (spellingbee, wordwheel 16; boggle, wordiply 14), and `if (!game)
  return` sits inside handlers and bound actions in twelve files. Six comments
  say some version of "above the early returns because effects must be", nine
  say "menu exists pre-load, but there's no mode yet", and print's `describe`
  answers `game ? 'active' : 'hidden'` in most games for the same reason.
- **The loading gate itself is written five ways.** `<p>Loading game…</p>`
  (six), `<p>Loading board…</p>` (two), `<div className={styles.loading}>Loading…</div>`
  (five), a multi-line `if (loading) {` block (three), and bananagrams, which
  returns nothing at all while loading. `common/loading`'s `<Loading>` is the
  word every other page shows, and four games' `todo.md` already file the swap.
- **`// ───` section headers exist but unevenly**: 2 (strands) to 15
  (stackdown) per file, and no two files order them alike. The same thing is
  headed "End / Concede / Replay — the shared trio", "the shared three", "the
  shared pair" and "Restart"; the menu is "GamePage menu" in two files and
  "Header menu" in one and unheaded in the rest.
- **Fifteen files cast `setup as XSetup`** (crosswords is the exception). The
  cast's source is `GamePageCtx.setup: Record<string, unknown>`, not `useGame`
  — the first survey misplaced it — and a game does it two or three times.
- **Fifteen files end with a pure `buildOver`** (50 to 140 lines) that no hook
  touches, and no game's `lib/` has a home for it yet.
- **Archaeology survives.** Twenty-two "used to" / "moved into" / "no longer"
  lines across the sixteen files, which the comment rule already bans.

**Changed since the first survey — the menu plumbing is done:**

- `actionsRef`, its type, its refresh effect and `useGlobalKeyHandler` are gone
  from every file. Every menu row is a **bound action** (`useBoundAction`),
  and `buildGameMenu({ menu, exits, extra })` frames Help + chat above and Back
  to club below. The 119 lines of ref ritual the first survey counted do not
  exist.
- The history viewer's keystroke exit is intrinsic to `useHistoryViewer`; no
  game wires it.
- The print model is a `pdf/model.ts` pure builder in ten games; the six
  word-list and rack games (boggle, spellingbee, wordwheel, bananagrams,
  scrabble, crosswords) build theirs in the action.

**What the menu still drifts on** — where the shared rows sit, which nobody
decided:

| shape of `extra` | games |
|---|---|
| Print first, then Restart · New game | bananagrams, boggle, scrabble, spellingbee, wordwheel |
| Restart · New game (· Reveal) first, then Print | codenamesduet, connections, letterboxed, setgame, stackdown, strands, waffle, wordiply, wordle |
| Hint · Spoiler, then Print, then Restart · New game · Reveal | psychicnum |
| its own twenty rows, under a puzzle header | crosswords |

And two games bind a command that has no row: setgame's Hint and scrabble's
Suggest a move are button-only. Each may be right; neither says so.

**New since the first survey — the action row and the actions:**

- **Only psychicnum has the unconditional `<InfoActionsRow>`.** Every other
  InfoCol mounts two to four of them inside an `over ? … : isLocallyDone ? … :
  …` branch, a different button list in each arm. Each game's `todo.md`
  already carries the item ("Collapse the info-column action row's branches",
  filed 2026-09-14 with psychicnum as the worked example), so the recommendation
  below points at it rather than restating it.
- **Two opposite conventions for a binding's `run` body.** psychicnum wraps
  its hint and spoiler in `useCallback` "because the bindings below close over
  them"; wordle's new-game is "a plain function, rebuilt every render: the
  binding below reads it at click time". wordle is right: `useBoundAction`
  reads its live half through a ref refreshed every render, so a stable
  callback buys a binding nothing. `useCallback` counts run 0 (four files) to
  13 (crosswords).
- **Per-game in-flight flags beside actions that already carry `pending`.**
  psychicnum's `hinting` / `spoiling` and stackdown's `submitting` are
  `useState` booleans read by `describe` to gray a button — where the bound
  action's own `pending` (from `useSingleFlight`) already grays the button and
  the menu row for the same flight (`common/actions/doc.md`). Where the action
  is the only caller, the flag is the old system's leftover.
- **The standing conditions of the slot are copied per game.** The
  `showTerminalVerdict` effect is five identical lines in sixteen files;
  `showWaiting` is a dozen identical lines in nine; `showOutOfRace` varies in
  its sentence and its gate.

## 3. The recommendations

Each carries its status as of 2026-09-19. The order is the order to walk them
at a game area; §4 says how.

### 3.1 Split each PlayArea into a loader and a loaded component — OPEN, the headline

A thin outer `PlayArea` owns `useGame` and the three gates (loading, failure,
not found) and hands a non-null game to an inner component. Every hook inside
the inner component can then assume the game exists: no `?.`, no `if (!game)
return` in handlers, no "above the early returns" or "menu exists pre-load"
comments, no `describe: () => (game ? 'active' : 'hidden')` on Print. The
single change that makes the rest of the file read as "what this game does"
instead of "what this game does when it exists".

**The precedent is `GamePageLoader`** (`common/game-page/`), which does exactly
this for the shell: its docstring says it "exists so `<GamePage>` never holds
a game that might not be there", and names the cost it removes — narrowing a
nullable row at each of the hooks that come before the guard. Joel, on the
first version of that split (2026-09-07): "we did a similar thing recently
with GamePage, i believe, and that certainly helped."

Three things fold into this one change, so they are not items of their own:

- **The loading gate becomes `<Loading>`** in every game (four `todo.md`
  entries close), and the not-found card is written once.
- **The one `setup` cast lives in the outer component.** The inner component
  takes `setup: XSetup` as a typed prop, and the fifteen files' two-or-three
  casts each become one — this is the first survey's "typed setup" item, which
  aimed at `useGame` and should have aimed here.
- **`mode ?? 'coop'` defaults disappear** with the null they were defaulting.

**Open before building, at psychicnum:** the inner component's name (a
`PlayArea` / `LoadedPlayArea` pair, or `PlayArea` / `PlaySurface`), and
whether the outer one is per game or one shared component taking a game's
`useGame` and its inner component — the sixteen `useGame` hooks return
different shapes, which argues for per game.

### 3.2 One section order for every PlayArea, written down once — OPEN

The order, stated in `docs/playarea.md` beside the column prop vocabulary,
so reading the second game costs nothing. A proposal, from what psychicnum
does today with the loader split applied:

1. **Data** — the loader's; the inner component starts with the game in hand.
2. **Page hooks** — tab ring, info sheet, celebration, turn flash.
3. **Derived** — `self`, `isCompete`, `myConceded`, the game's gate variable
   (`isStillPlaying` / `isLocallyDone`), `summaryRows`.
4. **The local slot and its standing conditions** — `useFeedbackSlot('local')`,
   `over`, the verdict / out-of-race / waiting effects.
5. **The move** — the input engine's coordinator half, where the game has one
   (stackdown's word buffer, setgame's selection, strands' trace).
6. **Narration** — `usePeerFeedback` and the game's own peer effects.
7. **The turn-history viewer** — `useHistoryViewer` and the snapshot.
8. **The commands, bound** — the shared trio, then the game's own, then New
   game and Print; every `useBoundAction` in one place (crosswords already
   heads it so).
9. **The menu** — one `publishGameMenu` effect.
10. **Render** — the render-time derivations, then the two columns.
11. **`buildOver`** — until 3.4 moves it out.

Section 8 before 9 is the one hard constraint (the menu lists the bindings);
the rest is a reading order and Joel's call. The header text for the shared
sections should be the same words in every file ("End / Concede / Restart —
the shared trio", not three variants).

### 3.3 The menu — plumbing DONE; the order and the effect are OPEN

**Done.** A row is a binding; nothing in a PlayArea keeps handler identities
in step with the menu. The first survey's `useEffectEvent` / `useGameMenu`
proposal is moot as plumbing.

**Open: a fixed order for the shared rows.** Today's majority (nine games)
is Restart · New game (· Reveal) and Print after; five put Print first;
psychicnum leads with its Hint · Spoiler. The order was never chosen, so it is
Joel's call rather than a count — settle it at psychicnum and the other
fifteen copy it. The candidate shape, if `buildGameMenu` grows named slots
instead of free-form `extra` sections:

```ts
buildGameMenu({
  menu,
  exits: [actConcede, actEndGame],
  assists: [actHint, actSpoiler],        // a game's hint / spoiler rows, if any
  board: [actRestart, actNewGame, actReveal],
  print: [actPrintBoard],
})
```

The builder then owns where a slot sits and the divider between slots, and a
game only says which bindings it has. `extra` survives for crosswords' twenty
rows. Whether the slots are worth it against today's `extra` sections is a
question of whether the drift above matters to a player who switches games;
it is a one-file change to the builder either way.

**Open: the effect.** Sixteen files write the same `publishGameMenu` effect —
`menu.setGameSections(buildGameMenu(...))`, a cleanup that clears, and a deps
list naming every binding (nine names in psychicnum). A `useGameMenu(menu,
sections)` hook that owns the effect and the cleanup would leave a game with
one call. One thing to know first: a bound action's identity flips when its
`pending` flips, so the effect re-pushes the menu on every in-flight toggle.
Harmless today — only the menu re-renders — and the hook is where to say so
once instead of in sixteen deps comments.

**Open: a row for every command, or a reason.** setgame's Hint and scrabble's
Suggest a move are bound with no menu row; the menu is the legend that names a
glyph (`docs/ui.md`), so a command with a button and no row teaches nothing.
Each game's area decides, and writes the reason at the binding if it stays
button-only.

### 3.4 Move `buildOver` out of the component file — OPEN

Into each game's `lib/`, next to `history.ts`, where it can be unit-tested
against every play state. That also puts it beside the other place play
states are named (the manifest's `labelFor`), which is a known two-home
hazard. Fifteen files; none has a `lib/` home for it yet, so the file name is
psychicnum's to choose (`lib/terminal.ts` reads with `terminalMessage.ts` in
`common/terminal/`). The `useMemo` on primitives that feeds the verdict effect
stays in the PlayArea — only the pure builder moves.

### 3.5 A comment pass with the call-site rule — OPEN

Many PlayArea comments are full explanations of shared mechanisms: a paragraph
on reading an envelope inside `createNewGame` (the same paragraph in several
games), the reveal rule restated at each `act-reveal`, "the waffle loading-race
lesson" retold at each `useCelebration`. The project's own rule is a sentence
and a pointer at a call site, with the explanation in the shared thing's
docstring or doc. Three families to delete outright rather than shorten:

- the twenty-two archaeological lines ("it used to be a bright ring", "Eleven
  games used to clean up here", "moved into BoardCol");
- the fifteen "above the early returns" / "pre-load" comments, which 3.1 makes
  false;
- psychicnum's "both are useCallbacks up here … because the bindings below
  close over them", which is false today (3.7).

Most files would drop well under a third comment lines.

### 3.6 The unconditional action row — OPEN, filed per game already

psychicnum's InfoCol mounts ONE `<InfoActionsRow>` holding every button, and
each binding's `describe(asker)` decides whether its button is there; every
other InfoCol branches in render. The item is in each game's `todo.md` with
the shape, the state rule (`hidden` = not possible in this state, `disabled` =
possible here, not right now, with a tooltip), and the two things the collapse
destroys if unwatched (Back to club's weight; the divider). Two things that
todo entry predates and the `reveal` area added:

- **`act-reveal` needs the button guard.** `describeReveal(...)` has no hidden
  case, so a game that stops branching in render writes `if (isStillPlaying
  && asker === 'button') return 'hidden'` in front of the shared call, or a
  Reveal button appears mid-game — and NOT a bare `'hidden'`, which also drops
  the row from the menu and from Help, where the glyph is taught.
- **The gate variable is usually a fold.** psychicnum's `canGuess` hid
  "terminal" inside "out of guesses" and had to become `isStillPlaying` before
  its actions could answer honestly; expect the same split in each game.

### 3.7 The actions — NEW: three per-game conventions to settle at psychicnum

- **A `run` body is a plain function.** `useBoundAction` reads the live half
  through a ref it refreshes every render, so `useCallback` around a body
  exists only to satisfy a deps list that no longer exists. Drop the wrap
  where the binding is the only reader; keep it where something else (a child
  prop, another effect) genuinely needs the identity.
- **No in-flight flag where `pending` covers it.** A bound action's `pending`
  is set from the press through the question to the answer, and both the
  button and the menu row gray on it. A game keeps its own flag only when
  something other than those surfaces reads it (stackdown's `submitting`
  dims the board, which is a real second reader; psychicnum's `hinting` and
  `spoiling` have none).
- **Every binding in one section, in one order** — the shared trio, the game's
  own, then New game and Print — and the same section in the InfoCol prop list
  and the menu. `docs/playarea.md`'s prop vocabulary already has `act*` names;
  the order is what is missing.

### 3.8 The standing conditions of the slot — NEW, weigh before building

`showTerminalVerdict` is the same five lines in sixteen files, `showWaiting`
the same dozen in nine. The smallest cut is a shared
`useTerminalVerdict(localFeedbackSlot, over)` in `common/feedback/` that owns
the show-on-edge / retract-in-cleanup effect, and a `useWaitingForTurn` beside
it taking the holder as two primitives. `showOutOfRace` stays per game: its
gate and its sentence differ. A caution from `docs/playarea.md` applies —
a review overclaims uniformity every time, so diff the sixteen effects before
extracting, and extract only the ones that are byte-identical. Decide at
psychicnum, whose three are the canonical shapes.

### ~~3.9 The history viewer owns its keystroke exit~~ — DONE

The hook binds `act-exit-history` itself; `useGlobalKeyHandler` is gone from
every PlayArea.

## 4. How a game area applies this

An area's own process is [app-audit.md → §4](app-audit.md#4-the-area-process--stamps-areas-and-what-broken-means):
list the files, read the folder's `todo.md`, the prose pass, then findings one
at a time. This plan enters at the findings: after the prose pass, walk §3 top
to bottom and record each as a finding with options in the area file. Two
rules on top:

- **psychicnum settles the shape.** Section order (3.2), the menu order and
  whether the builder grows slots (3.3), `buildOver`'s file name (3.4), and
  the standing-conditions cut (3.8) are decided once, there, and written into
  `docs/playarea.md` as the area harvests. The other fifteen areas copy; a
  game that cannot follow the shape says why in its own file, the way
  `docs/playarea.md` already records scrabble's fat BoardCol.
- **A refactor is a behavior-preserving no-op**, verified the way
  `docs/playarea.md → What building it taught us` says: the render tests, the
  geometry harness for anything that touches the columns, and for a
  heavy-input game a real gameplay e2e run before and after. The loader split
  (3.1) is the one most likely to move an effect's timing — a hook that ran
  on a placeholder now runs on data — so read every effect's edge as it moves.

When the sixteen conform, this plan's durable content is `docs/playarea.md`'s
section order and the folder docs of whatever shared hooks were cut, and the
plan is deleted.
