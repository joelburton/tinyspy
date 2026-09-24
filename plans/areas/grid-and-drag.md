# Area: grid-and-drag

The folders it reads: `shared/grid-and-drag`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-24. The READ is done; six findings await Joel.**

## The roster

Agreed with Joel 2026-09-24 (*"i approve the field list. do the area audit."*):

| file | lines | stamp |
|---|---|---|
| `src/shared/grid-and-drag/useDragGesture.ts` | 178 | `cs-audited-grid-and-drag` |
| `src/shared/grid-and-drag/useDragGesture.test.ts` | 129 | `cs-audited-grid-and-drag` |
| `src/shared/grid-and-drag/dragGhost.module.css` | 38 | `cs-audited-grid-and-drag` |
| `src/shared/grid-and-drag/doc.md` | 3 | (markdown carries no stamp) |
| `src/shared/grid-and-drag/todo.md` | 11 | (markdown carries no stamp) |

Dependencies listed and left, since they belong to bananagrams' and scrabble's
areas: `bananagrams/components/BoardArena.tsx`, `HandCard.tsx`,
`PlayerBoard.tsx` and `PlayerBoard.module.css`, `bananagrams/hooks/usePlayerBoard.ts`
and its test; `scrabble/components/BoardCol.tsx` and `BoardCol.module.css`.
Each game's `theme.css` holds the rule for its drag class, and
F-grid-and-drag-1 and F-grid-and-drag-3 reach into them.

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

## F-grid-and-drag-2 · `touch-drag` · scrabble drags by touch; its docs and `mobile.md` say it doesn't and mustn't

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

## F-grid-and-drag-3 · `drag-class` · Each game names its own body class for the same rule, and the grab cursor rarely shows

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

## F-grid-and-drag-4 · `ghost-tier` · The ghost's header says the tier is not a per-game decision; each game declares it

`dragGhost.module.css` says both ghosts read `--z-ghost` and that this is
not a per-game decision, yet `z-index: var(--z-ghost)` sits in each game's
own `.ghost` and not in the shared rule. The same header copies each game's
radius and shadow values into prose, where they will drift from the rules,
names the two games, and describes its rule as mechanics only while the rule
also sets the bold, centered letter both ghosts share.

**No decision in it:** `z-index` moves into the shared `.ghost` and out of
both games' rules; the header says what the rule is for without the copied
values or the roster.

## F-grid-and-drag-5 · `docstring-marker` · The header docstring sits on `DRAG_THRESHOLD`; the hook has none

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

## F-grid-and-drag-6 · `test-claims` · The test's header says jsdom has no `PointerEvent`; the hook's once-bound listeners are untested

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

*(none yet)*

## Predicted test breaks

*(none yet)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
