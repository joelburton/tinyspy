# PlayArea — the shared play surface

The play surface is what a game draws under the page header: a board column
beside an info column. This doc is the map of it: the layout contract, how a
board sizes itself, and how a game's `PlayArea.tsx` is shaped and split into
`BoardCol` / `InfoCol`. Each shared piece of the surface is owned by a folder,
and the sections below name that folder rather than repeat it. For the visual
principles around it, see [ui.md](ui.md).

## PlayArea layout

The scaffold is
[`common/game-page/playArea.module.css`](../src/common/game-page/playArea.module.css):
CSS only, no behavior, composed with a thin per-game module via `cls()`. The
info column's own box and rows are
[`common/info-sheet/infoCol.module.css`](../src/common/info-sheet/infoCol.module.css).
The line between them is which element wears the class: the PlayArea root's
classes are the scaffold's, the column's and its rows' are the column's.

**The contract:**

- **No whole-page scroll.** The layout fills the viewport, `height:
  calc(100svh - var(--game-chrome-height))`, and only inner regions (the event
  log or word list, chat) scroll. See [ui.md → Page-height fits the
  viewport](ui.md#page-height-fits-the-viewport).
- **Two columns, no chrome around them.** A board column (`.boardCol`) and an
  info column (`.infoCol`), and the only thing between them is the divider: the
  info column's `border-left`, with the layout gap on one side and the column's
  `padding-left` on the other.
- **The info column has a fixed width and never grows during play.** It holds
  the readouts above the event log or word list. It is the column that goes
  off-canvas on a phone, so anything critical to playing (the entry, the move
  controls) goes in the board column.
- **The board column hugs its board.** `.boardCol` is `flex: 0 0 auto` and only
  as wide as its board; auto margins center it in the space the info column
  leaves, so the info column sits flush right. Its content stack centers
  vertically, which is inert for a board that flex-fills the height. Whatever
  is stacked below the board (the entry row, the feedback slot) stretches to
  the board's width.

**What stays in each game's own module:** the board grid, any result tile fills,
the board's tray frame, and the words of its readouts. bananagrams is the layout
exception: a fixed arena that fills its column, with the hand in the info column
(see [its doc](games/bananagrams.md)).

**Locked names:** board column / `.boardCol`, info column / `.infoCol`, the
divider, **event log** (`<EventLog>`, chronological) vs **word list**
(`<WordList>`, alphabetical). Below the board: `.belowBoard` (the game's
wrapper), `.moveArea` (its move controls), `.moveAreaOrLocalFeedback` (the
reserved-height box the controls and the pill swap inside) and `.localFeedback`
(the pill's centering box).

The below-board skeleton, where a game has one (a game whose pill shares a
spot with something else — crosswords' active-clue bar — names that spot for
itself):

```
.boardCol
  <board>
  .belowBoard                  ← the game's own class, its CSS per game
    .moveAreaOrLocalFeedback   ← shared; reserves --swap-box-min-height
      .moveArea | .localFeedback
```

**The swap rule:** when the controls and the pill never show at once, one
`.moveAreaOrLocalFeedback` box holds the height and the pill replaces the
controls (every `<WordEntryArea>` game). When both show at once (wordle's
keyboard and its pill), there is no swap box: `.moveArea` and `.localFeedback`
sit side by side and `.localFeedback` reserves its own height
(`--local-feedback-min-height`). A game whose move is made on the board keeps
an empty `.moveArea` (`display: contents`) with a comment saying why.

- **`.moveArea` names the controls, never the box they swap in.** A
  controls-holding element does not take a feedback name, even where it shares
  the spot with the pill.
- **No class is bare `feedback`.** The class names the slot it is.

## Info-column readouts

The readouts above the log follow one order in every game — state, opponent
strip, action row, help, terminal extra, setup disclosure, then the log — and
each kind is drawn the same way everywhere. The order, what each row is for, how
each behaves at terminal, and the two allowed kinds of growth are
[src/common/info-sheet/doc.md](../src/common/info-sheet/doc.md)'s; the setup
recap's rows are
[setup-form/doc.md → Setup rows](../src/common/setup-form/doc.md#setup-rows).

## Text entry — capture, not `<input>`

A game that takes a single token (a word, a number) captures keystrokes off the
window and shows the pending value in a read-only box, because a focused
`<input>` loses focus the moment a board tile is clicked. Free text, such as
codenamesduet's clue, stays a real `<input>`. The entry control, when to use
`<WordEntryArea>` vs `<WordEntryRow>`, and the caret are
[src/common/word-entry/doc.md](../src/common/word-entry/doc.md)'s; the capture
hooks and who owns the keyboard are
[src/common/keyboard/doc.md](../src/common/keyboard/doc.md)'s; the 2-D cursor of
the board-cursor games is
[src/common/board-cursor](../src/common/board-cursor/doc.md)'s.

The below-board slot is made by the PlayArea with `useFeedbackSlot('local')`
and handed to the BoardCol to draw; its rules are
[src/common/feedback/doc.md](../src/common/feedback/doc.md)'s. When a game ends,
the verdict pill takes the entry's place in that slot.

## Event log

`<EventLog>` is the panel only: heading, scroll box, `<table>`. A game renders
its own `<tr>`s inside it, composing the shared cells and classes, and the log
header carries the shared "whose turns?" picker. The row-building rules, the
picker's vocabulary and the cell atoms are
[src/common/event-log/doc.md](../src/common/event-log/doc.md)'s.

## Word list

The shared **`<WordList>`** is the alphabetical counterpart of the event log,
worn by the found-words games. What it is, how it is narrowed and what its marks
mean are [src/common/word-list/doc.md](../src/common/word-list/doc.md)'s; the
reveal that fills its unfound rows is
[src/shared/found-words/doc.md](../src/shared/found-words/doc.md)'s.

## Turn-history viewer

A game whose board can replay a past turn lets the player click a turn's `#N` in
the log to see the board as it was then. The affordance, the frame, the banner
and the exits are shared, in `useHistoryViewer` and
[src/common/event-log/doc.md](../src/common/event-log/doc.md). What stays the
game's is how a snapshot is computed, in its `lib/history.ts`, whose docstring
says what the snapshot shows.

## Board sizing

**Vocabulary.** The board is the **`.board`** element; inside it is usually a
**`.grid`**, where the tiles are laid out (spellingbee's hex cluster is still a
grid). Border, background and padding belong to the `.board`; the `.grid` has
none. Whatever the real-world piece is — a Scrabble tile, a Codenames card, a
Boggle cube — we call it a **tile**.

**Every board hugs, and "fill" is the no-cap case.** A board computes a definite
width and the column hugs it. Each game has a maximum tile size; with no cap the
board grows to all the width available, so an uncapped game looks like it fills.

**The inputs.** `.layout` defines **`--avail-w`**, the width left beside the
info column:

```css
--avail-w: calc(var(--client-width, 100vw) - var(--info-col-width)
                - var(--layout-gap) - 2 * var(--page-padding-x));
```

It is built from shared tokens, so a change to the info-column width, the gap or
the page padding reaches every board. **`--info-col-width`** has no default in
the scaffold; each game declares it on its `.layout`, as a rem. A game whose
column holds a wide word list composes `.responsiveInfoCol` instead, which turns
the width into a clamp so the column, not the board, gives way as the viewport
narrows. On a phone, `.mobileFill` hands the board the full width.

**Two shapes of board.**

- A **rectangular** board composes `.hugRectWidth` onto its `.grid`: `width:
  min(var(--avail-w), <cols × max tile width + gaps>)`. Its height flex-fills
  the column, capped by a maximum tile height. The grid is `repeat(var(--cols),
  1fr)` with a fixed `--grid-gap`, so capping a tile never stretches the gaps.
  `--cols` / `--rows` are static where the shape is fixed and set inline where
  it varies.
- A **square** board is bounded by both dimensions, so it computes one `--side`
  from `--avail-w` and **`--avail-h`** (the height above its below-board row),
  with a single `--max-tile-size` cap. The square games' formulas differ enough
  that each lives in its own board module.

**The tinker knobs.** Each game's board module carries a `─── TINKER HERE ───`
block with its tile caps and `--grid-gap`. Commenting a cap out uncaps that
axis.

**Word tiles.** A single glyph scales with its tile via `cqmin` / `cqi`;
multi-character content fits itself via `cqi` and `--len` (`.tileWord` in the
scaffold).

### Why the width is computed

A hugging flex column can only hug a child whose width is already known. A
square's width comes from its height, and a flex-filling board's width comes
from its column, so either one would be circular and the column would collapse.
Computing the width from the viewport breaks the cycle.

Two details keep the pair on screen in every engine, and both are commented
where they live:

- **`.layout` has a definite width, not shrink-to-fit.** A word list's
  max-content width at the game-over reveal leaks up into shrink-to-fit sizing
  in WebKit and balloons the frame; a fixed width can't be inflated. Chromium
  never showed it, so check a change here in WebKit and Firefox too.
- **`--client-width`, not `100vw`.** `100vw` includes a classic scrollbar, which
  overstates the width and pushes the info column off the right edge. The root's
  `clientWidth` excludes it; `common/mobile/layoutWidth.ts` measures it with a
  `ResizeObserver`, so a scrollbar that appears because of content is caught.
  Overlay scrollbars hide the bug, so headless runs can't see it.

---

## The shape of a game's PlayArea.tsx

psychicnum set this shape, and each game conforms to it as its area of the
audit opens; where one cannot, its area file says why.
[plans/playarea-readability.md](../plans/playarea-readability.md) tracks what is
left per game.

### Four layers

| layer | owns | interface |
|---|---|---|
| **`Board`** | the presentation of one board state | state down, clicks up |
| **`BoardCol`** | the live input engine (drag, cursor, keyboard, word-building); draws `Board` and the below-board slot | takes the board to show (live or a snapshot) and `isBoardInteractive`; emits one committed action up |
| **`InfoCol`** | arranging the shared pieces (`OpponentStrip`, `InfoActionsRow`, `SetupDisclosure`, `EventLog`) around the game's readout | props down, including the bound actions it places; a few named callbacks up. Next to no state |
| **`PlayArea`** | game data (`useGame`), the RPCs, and the state both columns need (the viewed turn, the local slot) | wires the two columns together |

**The load-bearing contract: `BoardCol` owns editing; `PlayArea` hands it the
board to show.** `BoardCol` does not own the live game state, only how the
player is editing the board it was given. That is what makes the history viewer
a drop-in: viewing a past turn is handing `BoardCol` a snapshot and the
viewer's label.

**bananagrams does not fit the two columns**, because its input engine spans
both: the hand is a drag source into the board, the dump is a drop target, and
the hand is derived from the board. It lifts the engine into `usePlayerBoard`,
draws two views with no input of their own (`BoardArena`, `HandCard`), and has
two coordinators: `PlayArea` above `PlayerBoard`. See
[its doc](games/bananagrams.md).

### The loader and the loaded component

Two components in `PlayArea.tsx`, and the manifest lazy-loads the first:

```tsx
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, …, loading, failure } = useGame(ctx.gameId)

  if (loading) return <Loading />
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <NoSuchGamePage detail={`rows=0 view=<game>.games_state game=${ctx.gameId}`} />

  return <PlayArea {...ctx} game={game} setup={ctx.setup as unknown as <Game>Setup} />
}

function PlayArea({ game, … }: PlayAreaProps) { … }
```

The names are `GamePageLoader` → `GamePage`'s, one layer down. **The three gates
are the point**: everything below starts with a game in hand, so the surface
never writes `game?.`, never defaults a mode, and never guards a handler against
data that has not arrived.

- **`<Loading>`**, the word every page shows for that moment.
- **`<EnvelopeErrorPage>`**, because a failed read is not a missing game. Both
  leave `game` null, and only one of them means the game is gone.
- **`<NoSuchGamePage>`**, whose `detail` names the read that came back empty.
  `GamePageGate` and `GamePageLoader` have already checked the common row, so
  reaching this gate means the game's own row is missing.
- **The cast happens once**, in the loader's JSX, so the inner component takes
  the game's own setup type via `Omit<GamePageCtx, 'setup'>`.

While the read is out, the header menu has no game rows and `+` does nothing,
which is intended: a menu row for a game not yet loaded could only gray itself
or lie.

### The sections, in this order

```
Page hooks        what the surface IS: the tab ring, the info sheet, the marks
                  that fire at a moment (a win's celebration, a turn's flash)
Derived           who I am in this game and what I may still do
The local slot    …and its standing conditions: the verdict, out-of-race,
                  whose turn. Messages about ME
Narration         messages about somebody ELSE, into the header's global slot
The turn-history viewer
The commands, bound
The menu
Render            the render-time derivations, then the columns
```

A section header states the rule the section follows, never a list of what is
in it; a list rots the moment something joins.

`BoardCol.tsx` gets the same treatment one layer down, in the jobs its
docstring names:

```
Which board is on screen   live, or a past turn's snapshot — and everything that
                           would WRITE to the board answers to it
The pending guess          the state this column owns, and everything that reads it
Committing a guess         the move RPC, kept beside the entry it commits
The board's display order  the shuffle — purely visual, touches nothing else
Render
```

A piece of state sits with the section that owns it, not where it was first
needed.

### The commands, and the one order three readers keep

Every command is in one block, each handler declared directly above the binding
that runs it. **None of them is a `useCallback`**: `useBoundAction` refreshes
its live half through a ref during render, and the bound value's identity turns
on `pending` alone. **No handler carries an in-flight flag**: `pending` already
grays the button and the menu row, so a `const [hinting, setHinting]` would be a
second source for one fact.

The bindings block, the info column's prop list and the game menu's rows read in
one order, because the row and the menu are two views of one set of bindings.
psychicnum's is:

```
Hint · Spoiler | Reveal · Restart · New game | Concede · End | Back to club
```

with the menu adding Print at the end, the one row with no twin in the action
row. A menu is easy to reorder, so this is a starting order, not a lock.

### What leaves the component file

**The terminal message.** A pure `buildTerminalMessage(...)` returning a
`TerminalMessage`, in `lib/terminal.ts` beside the game's other decisions about
what a move meant — except for spellingbee and wordwheel, whose endings read
alike and share one in `shared/bee-games/terminal.ts`. The `useMemo` that feeds
the verdict effect stays in the component. Its test walks every terminal play
state in every mode for every reason the server writes — a small, closed space
worth exhausting.

## Prop conventions for the columns

A `BoardCol` / `InfoCol` prop that means the same thing in two games is spelled
the same in both, or reading the second game means re-deriving the first.

- **Flat prop lists, grouped by region, not prefixed.** No `actionsOnHint` /
  `oppStripHintCount`: they stutter against `on*` and force one taxonomy on
  props that serve two regions. Order the props to mirror the render order,
  separated by `// ── Section ──` headers **on the type block**, beside the
  per-prop docstrings; the destructure is a flat list, and the call site follows
  the same order. There is no `React.memo` in the app, so grouping props into
  objects buys nothing. Use a real object only for a cluster that always travels
  together to one child, such as the OpponentStrip's inputs.
- **One vocabulary.** The standing terms — `isTerminal`, `isPlayer`,
  `isConceded`, `isLocallyTerminal`, `isStillPlaying`, `isMyTurn`,
  `isWaitingForTurn`, `isBoardInteractive` — mean what [win-lose.md → Where a player
  stands](win-lose.md#where-a-player-stands--the-terms-as-formulas) defines, and
  nothing else. Beside them: `terminalMessage`, `isCompete`, `historyLabel`, `onExitHistory`,
  `onShowHistory`, `players`, `myId`, `playerStates`, `concededIds`, `setup`,
  `solution`, `onEndGame`, `onConcede`, `onBackToClub`, … When a new column needs a prop an earlier one
  already has, reuse the name; diverge only when the meaning differs, and say
  so. The ones that drift:
  - **The viewer passes one prop saying it is open, and the flag is derived.**
    A column writes `const isViewingHistory = historyLabel !== null` rather than
    taking both. A column whose board data comes out of the snapshot takes the
    snapshot and derives from that; scrabble takes `historyTarget`, a union of a
    past turn and a teammate's shared move. The rule is the derivation, not
    which prop carries it.
  - **Below-board feedback is `localFeedbackSlot`** (`FeedbackSlot`): the column
    shows its own results into it and draws it with `<FeedbackPill>`.
  - **`historyId`** is the events row's own id everywhere except scrabble, whose
    id is a union; the hook is generic over `Id`. The viewed turn's marks are
    `historyLit…` everywhere, never named for a color.
  - **Where the snapshot is computed is not uniform, on purpose.** Most
    PlayAreas compute it and hand a ready board down; scrabble's BoardCol takes
    the raw plays and runs `historyBoard` itself, because those plays already
    live there for the live board. Its header says so.

## What building it taught us

Where the four-layer table is too clean:

- **A word buffer tangled with server state stays in the data hook.** When the
  pending word is coupled to optimistic updates and realtime bookkeeping
  (stackdown's `currentWord`, scrabble's `staged`), `PlayArea` passes the
  editing primitives down and `BoardCol` emits the finished word up. "BoardCol
  owns editing" means the gesture → word, not the word's state.
- **The below-board slot belongs to the coordinator.** Things other than the
  board column show into it — the terminal verdict, and results from info-column
  actions like Hint or Reveal — so `PlayArea` makes the slot and passes it down,
  and `BoardCol` draws it and shows its own input results.
- **Split state by its trigger, not by where it renders.** A flash drawn inside
  `BoardCol` lives in `PlayArea` when a teammate's move is one of its triggers.
- **Viewing history and an inert board are two flags.** `isBoardInteractive`
  says whether the live board responds; the history viewer changes what the
  board shows without touching it. So a key handler reads `if
  (isViewingHistory) exit; if (!isBoardInteractive) return`.
- **`BoardCol` owns its RPCs when the result mutates deep input state.**
  scrabble's moves claim `lastActionRef` before the await and their results
  rewrite `optimistic` and `staged`; splitting the RPC from that state would
  tear one machine in half. Emit up when the coordinator can own the result; own
  the RPC when it can't.
- **Prove a decomposition with the geometry harness, not render tests.** Render
  tests, `tsc` and eslint all pass on a botched CSS move;
  `e2e/board-geometry.e2e.ts` (a `BASELINE=1` run before, a compare after)
  catches a moved boundary. For a game whose input engine the unit tests can't
  reach, add a gameplay e2e first and run it on both sides of the cut.
