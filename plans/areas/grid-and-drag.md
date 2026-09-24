# Area: grid-and-drag

The folders it reads: `shared/grid-and-drag`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-24, blessed** (Joel: *"mark files in this as blessed, then clone the area, the commit"*).

## The roster

Agreed with Joel 2026-09-24 (*"i approve the field list. do the area audit."*):

| file | lines | stamp |
|---|---|---|
| `src/shared/grid-and-drag/useDragGesture.ts` | 175 | `cs-blessed-grid-and-drag` |
| `src/shared/grid-and-drag/useDragGesture.test.ts` | 179 | `cs-blessed-grid-and-drag` |
| `src/shared/grid-and-drag/dragGhost.module.css` | 35 | `cs-blessed-grid-and-drag` |
| `src/shared/grid-and-drag/dragging.css` | 10 | `cs-blessed-grid-and-drag` — created by F-grid-and-drag-3 |
| `src/shared/grid-and-drag/doc.md` | 77 | (markdown carries no stamp) |
| `src/shared/grid-and-drag/todo.md` | 11 | (markdown carries no stamp) |

Dependencies listed and left, since they belong to bananagrams' and scrabble's
areas: `bananagrams/components/BoardArena.tsx`, `HandCard.tsx`,
`PlayerBoard.tsx` and `PlayerBoard.module.css`, `bananagrams/hooks/usePlayerBoard.ts`
and its test; `scrabble/components/BoardCol.tsx` and `BoardCol.module.css`.
Each game's `theme.css` held the rule for its drag class, and
F-grid-and-drag-1 and F-grid-and-drag-3 reached into them.

## The READ

**The READ is DONE.** Every roster file was read end to end. The checks made
beside it:

- **The todo first.** It is empty. `docs/deferred.md` holds nothing for the
  folder, so there was nothing to drain.
- **What moved under it.** Nothing. The folder imports nothing and is not on
  the game-page shell, so no shell window applies.
- **Every caller against the contract.** Both games' `start` sites, `onDrop`,
  `onTap`, `onDragMove`/`onDragEnd`, what they render from `drag` and `hover`,
  both ghosts' CSS, and the body rule each game's `dragClass` names.
- **Waffle's drag** was compared before the area opened: it uses the browser's
  own drag-and-drop, as a mouse shortcut for its tap-two-tiles swap. **Ruling
  (Joel, 2026-09-24: *"ok, we'll keep as it."*):** the split stays. The rule
  for when a drag uses which is owed to `doc.md` at the harvest.
- **A headless check** of both games' `theme.css` in Chromium, through the dev
  server (F-grid-and-drag-1).

## Findings

## FIXED · F-grid-and-drag-1 · `theme-tokens` · Two games' tokens exist only while a tile is being dragged

The palette sweep (`2d88083e`, 2026-08-18) named each game's colors and
shadows in its `theme.css` and appended them to the last rule in the file.
In scrabble and bananagrams that rule is `body.<game>-dragging`, not `:root`.
A custom property declared there exists only while the hook has put that
class on `<body>`, which is only mid-drag.

**Verified headless:** loading each real `theme.css` in Chromium,
`--scrabble-rack-bg-color`, `--scrabble-dw-ink-color` and
`--scrabble-tile-shadow` read empty at rest and take their values once
`scrabble-dragging` is on the body. Likewise for bananagrams'
`--bananagrams-tile-resting-shadow` under `mg-dragging`. The tokens in `:root`
(`--scrabble-tile-bg`, `--bananagrams-tile-face`) read the same either way.

A `var()` naming an undefined property voids its whole declaration, so at rest:

- **scrabble:** the rack loses its wood background and its shadow; rack tiles
  lose their shadow; an exchange-selected rack tile loses its outline; the
  premium squares' DW and DL letters and plain squares' ink fall back to
  inherited color; the placed tiles lose their shadow and inner shadow.
- **bananagrams:** the board veil, the tile shadows (resting and placed) and
  the hand's shadow are gone.

The rest of the moved tokens are read only during a drag anyway (both ghosts'
shadows, bananagrams' drop-target green), so they happened to work.

Checked for the same fault across every `theme.css` and `common/themes/*.css`:
only these two rules. setgame's colorblind class and stackdown's midnight
override are deliberate scoped overrides.

**No decision in it:** every token moves into its file's `:root`, and the
drag rule keeps only `user-select` and `cursor`. It restores the look the
tokens were named from, so it is a visible change on both boards. Both files
are outside the roster; the fix ships with this area because this area found
it.

**Resolution (Joel, 2026-09-24: *"commit, then do f1."*):** in both
`theme.css` files every token, with its comments, moved into `:root`, and the
drag rule now holds only `user-select` and `cursor`. No value changed.
Re-checked headless: all 20 of scrabble's tokens and all 13 of bananagrams'
resolve at rest. The guards pass. The boards themselves were not looked at.

## FIXED · F-grid-and-drag-2 · `touch-drag` · scrabble drags by touch; its docs and `mobile.md` say it doesn't and mustn't

`useDragGesture` never looks at `pointerType`, and a finger fires pointer
events like a mouse. scrabble's board and rack set `touch-action: none` (since
the game's first commit), which stops the browser taking the touch as a
scroll. By the code, dragging a rack tile onto the board with a finger works on
a phone. Not tried on a device.

Against that:

- `docs/mobile.md`: *"Never build touch-drag. Dragging is a mouse
  affordance."*
- `docs/games/scrabble.md` (the header note and §7): *"drag gets no touch
  support; play is the keyboard cursor (tap a square, type)"*.
- `scrabble/components/PlayArea.tsx`'s mobile comment says the same.
- `docs/features.md` files scrabble as keyboard-required.

bananagrams is blocked on every touch device, so this is scrabble only.

- **(a) Follow the docs.** In the hook, a touch press can still tap but never
  starts a drag, the way a press with no letter can't. scrabble's
  `touch-action: none` goes. A phone player who drags today would lose it.
- **(b) Follow the code.** Keep touch drag in scrabble, and correct
  `scrabble.md`, the `PlayArea.tsx` comment and `features.md`; `mobile.md`'s
  rule gains scrabble as its stated exception.

**Resolution (Joel, 2026-09-24: *"follow-the-docs. realistically, even if drag
works perfectly on a phone, it would be unpleasant. the minimal really useful
device would be a tablet with a keyboard attached."*):**

- **The hook.** `start` arms a touch press with no letter, so it can tap but
  never drag. `start`'s docstring says so.
- **scrabble's CSS.** The board and the rack tiles go from `touch-action: none`
  to `manipulation`, which is what the shared `.tile` in
  `game-page/playArea.module.css` gives every tapped surface: no double-tap
  zoom, no tap delay.
- **The docs already said this,** so none changed.
- **A new test** checks that a touch press past the threshold settles as a
  tap. Planting the old line turns it red.
- **Verified:** the scrabble, bananagrams and folder suites, the guards,
  `tsc -b` and eslint pass. Not tried on a device.

## FIXED · F-grid-and-drag-3 · `drag-class` · Each game names its own body class for the same rule, and the grab cursor rarely shows

`dragClass` is an option only so each game can spell the class its
`theme.css` styles. The two rules are identical:

```css
body.scrabble-dragging { user-select: none; cursor: grabbing; }
body.mg-dragging       { user-select: none; cursor: grabbing; }
```

And `cursor: grabbing` on the body shows only where nothing sets its own
cursor. During a drag the pointer is almost always over a board square or a
tile, and those do: scrabble's cells say `pointer`, its tiles and rack tiles
`grab`; bananagrams' tiles `grab`. So mid-drag the cursor is an open hand or a
pointing finger over the board.

bananagrams' `theme.css` also says `PlayerBoard` toggles the class; the hook
does.

- **(a) The hook owns the class.** One rule in the folder, reached from
  `dragGhost.module.css` as `:global(body.tile-dragging)` with a `*` arm so
  the cursor wins over every tile; `dragClass` leaves the options and both
  games' body rules go (after F-grid-and-drag-1 empties them of tokens).
- **(b) Keep a class per game** and fix the cursor in each game's rule.

**Resolution (Joel, 2026-09-24: *"i'll take your rec"*, which was (a),
`hook-owns-it`):**

- **The rule.** A new plain stylesheet, `dragging.css`, imported by the hook,
  styles `body.tile-dragging` and every element under it with
  `user-select: none; cursor: grabbing`.
- **The hook.** `useDragGesture` exports `DRAGGING_CLASS` and sets it itself;
  `dragClass` is gone from the options.
- **The games.** scrabble and bananagrams dropped `dragClass:`, and both
  `theme.css` drag rules are deleted, taking the stale "toggled by
  `PlayerBoard`" comment with them. bananagrams' header no longer says it
  holds "one global rule".
- **The test** asserts `DRAGGING_CLASS` instead of its made-up `x-dragging`.
- **Verified headless:** with the real `dragging.css` loaded, an element that
  sets its own `cursor: pointer` reads `grabbing` once the body has the class,
  and `pointer` without it. The scrabble, bananagrams and folder suites, the
  guards, `tsc -b` and eslint pass. A real drag was not looked at.

## FIXED · F-grid-and-drag-4 · `ghost-tier` · The ghost's header says the tier is not a per-game decision; each game declares it

`dragGhost.module.css` says both ghosts read `--z-ghost` and that this is
not a per-game decision, yet `z-index: var(--z-ghost)` sits in each game's
own `.ghost` and not in the shared rule. The same header copies each game's
radius and shadow values into prose, where they will drift from the rules,
names the two games, and describes its rule as mechanics only while the rule
also sets the bold, centered letter both ghosts share.

**No decision in it:** `z-index` moves into the shared `.ghost` and out of
both games' rules; the header says what the rule is for without the copied
values or the roster.

**Resolution (Joel, 2026-09-24: *"commit then do the rest."*):**
`z-index: var(--z-ghost)` is in the shared `.ghost` and out of both games'
rules. The header now lists everything the shared rule sets, the tier and the
letter included. It says why the ghost renders outside the board root, and
that the look is the game's, without the copied values or the game names.
Both games' ghost comments now point at "everything a ghost shares" instead of
listing three of its properties. The guards pass.

## FIXED · F-grid-and-drag-5 · `docstring-marker` · The header docstring sits on `DRAG_THRESHOLD`; the hook has none

- The 30-line `/** */` at the top of `useDragGesture.ts` attaches to the next
  declaration, `const DRAG_THRESHOLD`. `useDragGesture` itself has no
  docstring, and its return value (`drag`, `hover`, `start`) is described
  nowhere but `start`'s own.
- The header opens with how the hook was made (*"factored out of bananagrams
  and scrabble"*), names its callers, and spends a paragraph on what was
  deliberately left in each game. That is design, owed to `doc.md`.
- The members of `DragGesture`, `DragState` and `UseDragGestureOpts` carry
  `/** */` notes; a note on one member takes `//`.

**No decision in it:** a caller-facing docstring on `useDragGesture` saying
what it does, what the callbacks mean and what it returns; the design to
`doc.md` at the harvest; `//` on the members.

**Resolution (Joel, 2026-09-24: *"commit then do the rest."*):**

- **The header went.** `useDragGesture` has its own docstring, for the caller:
  what a press becomes, what `drag`, `hover` and `DRAGGING_CLASS` mean during
  a drag, that a canceled pointer neither drops nor taps, and that the options
  may be new closures on every render.
- **A false claim went with it.** The header said the games read their cells
  from different attributes (`data-x/y` vs `data-row/col`) and shapes
  (`{x,y}` or `{row,col}`). Both read `data-x` and `data-y` into `{x, y}`.
  That turned up F-grid-and-drag-7.
- **The members** of `DragGesture` and `UseDragGestureOpts` carry `//`, and
  `DragState`'s had none. Two notes named a caller's use (the tap → cursor
  path, bananagrams' dump slot) and now say what the field is. `letter`'s
  note names a finger as the second press that can't drag.
- **The design paragraph** (what each game keeps) is owed to `doc.md`; see
  Notes.

## FIXED · F-grid-and-drag-6 · `test-claims` · The test's header says jsdom has no `PointerEvent`; the hook's once-bound listeners are untested

- *"jsdom has no `PointerEvent`, but ... a `MouseEvent` ... stands in fine."*
  The repo's jsdom is 29.1.1, and it has `PointerEvent`. The tests could
  dispatch the real thing.
- The hook's header claims the window listeners bind once and read the
  latest callbacks through a ref. Nothing tests it. bananagrams relies on it:
  its `onDrop` reads `bunchCount` and `bagCount` to decide whether a dump is
  allowed.

**No decision in it:** dispatch `PointerEvent`, drop the claim, and add a test
that rerenders with a new `onDrop` mid-gesture and checks the new one is the
one called. Planted to fail first.

**Resolution (Joel, 2026-09-24: *"commit then do the rest."*):** the tests
dispatch jsdom's `PointerEvent`, and the header lost the claim (and its
`/**`, which sat on `type Src`). A new test starts a drag, rerenders with a
new `onDrop`, and releases: only the new one is called. Planting a hook that
never refreshes its options turns it red. Folder suite 7/7; scrabble,
bananagrams, the guards, `tsc -b` and eslint pass.

## FIXED · F-grid-and-drag-7 · `cell-at-point` · Both games pass the same `cellAtPoint`

Found while working F-grid-and-drag-5. The option exists because the header
said each game reads its grid differently. They don't:

```ts
// scrabble/components/BoardCol.tsx
function cellAtPoint(x: number, y: number): XY | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
  if (!el) return null
  return { x: Number(el.dataset.x), y: Number(el.dataset.y) }
}
// bananagrams/hooks/usePlayerBoard.ts — the same, split over two statements
```

Both cell types are `{ x: number; y: number }`, which is
`docs/code-conventions.md → Grid coordinates`' rule for these two games.

- **(a) The hook reads the cell.** `cellAtPoint` leaves the options, `TCell`
  becomes `{ x, y }`, and the `[data-cell]` / `data-x` / `data-y` contract is
  written in the hook's docstring. Both games lose their copy.
- **(b) Keep it an option.** A future grid could address its cells
  differently.

**Resolution (Joel, 2026-09-24: *"i'll take your rec. then commit."*, which
was (a), `hook-reads-the-cell`):**

- **The hook** exports `GridCell` (`{ x, y }`) and `cellAtPoint`, whose
  docstring states the `data-cell` / `data-x` / `data-y` contract. It calls
  it itself, so `cellAtPoint` left the options and `TCell` left every type:
  `useDragGesture<TSource>`, `DragGesture<TSource>`.
- **Both games** deleted their copy and import the shared one, since each
  `onDrop` still asks what square a drop landed on. bananagrams' test mock of
  the module gained a `cellAtPoint`.
- **The folder's test** stubs `document.elementFromPoint` (jsdom does no
  layout) and gives the hover a real marked square instead of echoing the
  pointer. Three new tests cover `cellAtPoint`: a square, an element inside
  one, and off the grid. Planting swapped coordinates turns three red.
- **Verified:** the folder's tests pass (10/10), as do the scrabble and
  bananagrams suites, the guards, `tsc -b` and eslint. A real drag was not
  looked at.

## What checked out

- **The state machine.** A press arms; the first move past 4 px with a letter
  starts the drag; release drops or taps; `pointercancel` tears down without a
  drop or tap and clears the body class. A press with no letter can only tap,
  which is how both games keep committed tiles and empty squares from being
  picked up.
- **Both callers' drop and tap logic** matches the hook's contract: an
  occupied target snaps back, and a tap moves the cursor (and in scrabble's
  rack toggles exchange).
- **The ghost renders outside the board root** in both games, as the z-index
  area settled, and `pointer-events: none` keeps it out of the hit-testing.
- **The per-move re-render.** `drag` is state, so every pointer move re-renders
  the hook's owner. Not measured; nothing reported it, so it is not a finding.

## Notes

- **HARVESTED into `doc.md`** (2026-09-24, Joel: *"write doc.md."*): its intro
  carries both halves below, and Details the rest. **Was owed to `doc.md` at the harvest** (from the header F-grid-and-drag-5
  removed): the hook owns the mechanics and each game keeps the meaning — its
  `onDrop` (stage, move, recall, reorder, dump), its `onTap` (move the cursor,
  mark for exchange), and its keyboard cursor and typing, which live in
  `common/board-cursor` or the game. And Joel's ruling on waffle: the
  browser's own drag-and-drop where a drag is a mouse shortcut for a tap move
  between like things; this hook where the drop's meaning depends on where it
  lands, or a tap means something else.

## Predicted test breaks

*(none yet)*

## The closing re-read

Done 2026-09-24, in one sitting (Joel: *"do the re-read"*):
- **Read end to end:** the four roster code files (`useDragGesture.ts`, its
  test, `dragGhost.module.css`, `dragging.css`), `doc.md` and `todo.md`.
- **Read where the fixes landed:** both `theme.css` files, both games' ghost
  rules, and scrabble's `BoardCol.tsx` and bananagrams' `usePlayerBoard.ts`
  around the drag.
- **Grepped the fault classes repo-wide:** per-game drag classes, `TCell` and
  row/col claims, touch claims, who runs the drag, `elementFromPoint` and
  `data-cell` contract claims.

It found:

- **A sibling's stale claim.** scrabble's `Board.tsx` said it forwards
  pointer-downs "so PlayArea can run the shared drag gesture". BoardCol runs
  it, and the comment now says so.
- **In the area's own new prose:**
  - It called a grid cell a "square" in some places and a "cell" in others,
    beside `GridCell` and `data-cell`. It now says "cell" throughout.
  - The hook's docstring had a garbled clause about how a grid marks its
    cells.
  - The cancel comment, in the hook and in the test, gave a touch scroll as
    its example. A finger can no longer start a drag, so the example is now
    the browser taking the pointer for a pan.
  - The ghost header's "Neither is where it renders" didn't parse.
  - A stray blank line opened the hook's `describe`.
- **Checked and true:** jsdom has no `elementFromPoint`, as the test's new
  comment says. bananagrams' `BoardArena` and `HandCard` still describe the
  `data-cell` contract correctly. It now lives in the hook's `cellAtPoint`,
  and the views still carry it.
- **Verified:** the scrabble, bananagrams and folder suites, the guards,
  `tsc -b` and eslint pass.

## Closing

- [x] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
  (nothing is owed, so `todo.md` stays empty)
- [x] every file on the roster blessed, or its stamp says why not

## Closing summary

**`grid-and-drag` is CLOSED 2026-09-24, blessed** (Joel: *"mark files in this
as blessed, then clone the area, the commit"*). `useDragGesture.ts`, its test,
`dragGhost.module.css` and the new `dragging.css` are
`cs-blessed-grid-and-drag`.

It was a small folder whose biggest find sat next door. **What changed the
app:** since the color-naming sweep of 2026-08-18, scrabble's and bananagrams'
colors and shadows had been declared inside the body rule that exists only
while a tile is dragged. So at rest, scrabble's rack had no wood, its tiles no
shadows, and its premium letters the wrong ink, and bananagrams' tiles lost
their shadows. A headless check proved it. The tokens now live in `:root`.

The rest:
- **Touch.** A finger no longer drags in scrabble, matching `docs/mobile.md`
  and scrabble's own docs (Joel: a keyboard-attached tablet is the smallest
  useful device).
- **One dragging class.** The hook owns one body class and one rule. The rule
  reaches every element, so the closed hand now shows over the board.
- **One `cellAtPoint`.** The hook reads the grid cell itself; both games had
  the same copy.
- **Smaller fixes.** The ghost's tier moved into the shared rule, the hook got
  a real docstring, and the test lost a false jsdom claim and gained a test of
  the latest-options behavior.
- **Waffle** keeps the browser's own drag, by Joel's ruling. `doc.md` states
  the rule for which to use.

The closing re-read found a stale sibling claim in scrabble's `Board.tsx`
and five slips in the area's own new prose. `doc.md` now carries the design.

**Handed off:** nothing. `todo.md` is empty.
