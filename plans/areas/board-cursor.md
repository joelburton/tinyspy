# Area: board-cursor

The folders it reads: `shared/board-cursor`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-24. The READ is done; all five findings are worked.
The closing is next.**

## The roster

Agreed with Joel 2026-09-24 (*"i approve the roster. stamp it, then do the
audit."*):

| file | lines | stamp |
|---|---|---|
| `src/shared/board-cursor/useBoardCursorKeys.ts` | 100 | `cs-audited-board-cursor` |
| `src/shared/board-cursor/useBoardCursorKeys.test.ts` | 143 | `cs-audited-board-cursor` |
| `src/shared/board-cursor/gridCursor.ts` | 58 | `cs-audited-board-cursor` |
| `src/shared/board-cursor/gridCursor.test.ts` | 66 | `cs-audited-board-cursor` |
| `src/shared/board-cursor/gridCursor.module.css` | 48 | `cs-audited-board-cursor` |
| `src/shared/board-cursor/doc.md` | 3 | (markdown carries no stamp) |
| `src/shared/board-cursor/todo.md` | 11 | (markdown carries no stamp) |

Dependencies listed and left, since they belong to bananagrams' and scrabble's
areas: `bananagrams/hooks/usePlayerBoard.ts` and its test,
`bananagrams/components/BoardArena.tsx`; `scrabble/components/BoardCol.tsx`
and `Board.tsx`. Mentions only: `crosswords/hooks/useGridKeyboard.ts` (a
contrast in its docstring), `src/guards/vocabularies.test.ts` (a `pending`
row), and the docs that link the folder.

## The READ

**The READ is DONE.** Every roster file was read end to end. The checks made
beside it:

- **The todo first.** It is empty, and `docs/deferred.md` holds nothing for the
  folder.
- **What moved under it.** Nothing. The folder is not on the game-page shell;
  its one dependency is `common/actions`, whose area closed 09-11 and which
  converted this hook to bound actions then.
- **Every caller against the contract.** Both games' `useBoardCursorKeys`
  calls and their `onArrow`, `onLetter`, `onBackspace` and `onEnter`; both
  games' `moveCursor` / `stepBack` calls; both cursor renders and their
  per-game `.cursor` rule; the registry's four action entries.
- **A probe** of bananagrams' Backspace through its own test harness
  (F-board-cursor-1), removed afterwards.
- **`plans/keyboard-nav-plan.md`**, which names `useBoardCursorKeys` as what
  its five games will build on (see Notes).

## Findings

## F-board-cursor-1 · `backspace-order` · The first Backspace after typing removes nothing

The hook's docstring says `onBackspace` removes *"the tile behind the
cursor"*. Both games instead remove the tile UNDER the cursor, then step back:

```ts
// bananagrams/hooks/usePlayerBoard.ts
if (boardRef.current[idx(cur.x, cur.y)] !== '.') boardToHand(cur.x, cur.y)
setCursor(stepBack(cur, GRID - 1))
// scrabble/components/BoardCol.tsx
setStaged((prev) => prev.filter((s) => !(s.x === cursor.x && s.y === cursor.y)))
setCursor((cur) => stepBack(cur, BOARD_SIZE - 1))
```

Typing a letter advances the cursor past it, so the next Backspace clears the
empty cell the cursor sits on and steps back onto the letter. **Verified in
bananagrams' test harness:** type `A`, press Backspace once, and the `A` is
still on the board with the cursor back on it. A second press removes it.
scrabble runs the same order. (When scrabble's `nextEmpty` finds no empty
cell ahead the cursor stays on the placed tile, and the first press does
remove it.)

bananagrams' test pins the current half: *"Backspace returns the tile under the
cursor to the hand"*, starting with the cursor already on the tile.

- **(a) Back, then remove.** Step back first, then remove the tile there: a
  text editor's Backspace. One press after typing removes the letter typed.
  Pressed on a filled cell with nothing typed, it removes the tile BEHIND it
  instead of the one under it.
- **(b) The crossword rule.** Remove the tile under the cursor if there is
  one; otherwise step back and remove that one. One press after typing
  removes the letter, and a press on a filled cell still removes that cell.
  crosswords already works this way (its "two-step ⌫").
- **(c) Keep it,** and make the docstring say "under, then step back".

Either change is per game (the removal differs), but the ORDER could be one
shared helper in `gridCursor.ts` beside `stepBack`, so the two can't drift.

**Ruled 2026-09-24: (b), exactly as crosswords does it** (*"do b"*, then
*"b1"*): a removable tile under the cursor goes and the cursor stays; on an
empty cell the cursor steps back and the tile there goes. Then *"skip-commited"*:
the step back passes over scrabble's committed tiles, as typing passes over
them going forward. The order is `planBackspace` in `gridCursor.ts`; each game
reports a cell as `removable`, `locked` or `empty` (bananagrams: any tile is
removable; scrabble: staged is removable, committed is locked) and does its own
removal.
**Worked:** the helper and its tests; both games' `onBackspace`; bananagrams'
test gains the type-then-Backspace case; the Backspace wording from
F-board-cursor-5 (the hook's note, `BoardCol.tsx`, the registry) goes with it.

## F-board-cursor-2 · `cursor-widths` · The ring's `1px` and `5px` are on the vocabulary guard's pending list

`vocabularies.test.ts` carries `gridCursor.module.css: ['1px', '5px']` as
unconverted. The border-width vocabulary is `--border-width-line` (1px),
`--border-width-line-thick` (2px) and `--border-width-frame` (4px).

- **`1px` equals `--border-width-line`**, so by the conversion rule it changes
  silently.
- **`5px` fits nothing.** It is the heavy edge along the direction of travel,
  and the ring's whole job is that the heavy pair reads at a glance. By the
  a/b/c rule:
  - **(a) Add a level.** A fourth width token for it.
  - **(b) Fit `--border-width-frame` (4px).** The heavy edges get 1px thinner.
  - **(c) Keep `5px` bespoke,** with its reason written at the declaration.

**Ruled 2026-09-24: (a), named `--mark-gridCursor-heavy-width`** (*"a"*, then
*"a1"*): in `base.css` beside `--toast-stripe-width`, since a width is not a
theme decision. **Worked:** the `1px` is `--border-width-line`, the row is off
the guard's pending list.

## F-board-cursor-3 · `cursor-types` · `ArrowKey` is declared twice here, and each game declares its own `GridCursor`

- `ArrowKey` is exported from both `useBoardCursorKeys.ts` and
  `gridCursor.ts`, identically, and nothing outside the folder imports either.
  (crosswords declares a third in `crosswords/lib/cursor.ts`; that is its
  area's.)
- `gridCursor.ts` says the games' `Cursor` types are *"structurally identical
  to `GridCursor`, so they pass through without conversion"*. They are
  identical because each game writes the same shape out by hand: scrabble's
  `{ x: number; y: number; dir: 'h' | 'v' }` in `Board.tsx`, bananagrams'
  `Cell & { dir: 'h' | 'v' }` in `usePlayerBoard.ts`.

**No decision in it:** one `ArrowKey`, in `gridCursor.ts`, which the hook
imports; both games' `Cursor` become `GridCursor` (kept under their local
name if that reads better at their call sites), and the docstring sentence
goes.

**Worked 2026-09-24** (*"yes"*): `ArrowKey` lives in `gridCursor.ts` and the
hook imports it; both games' `Cursor` are gone for `GridCursor` itself (few
enough uses that an alias bought nothing), including bananagrams'
`BoardArena.tsx`; the sentence is gone.

## F-board-cursor-4 · `on-enter` · `onEnter` also fires on Space

`onEnter` is the commit's callback, and for a peel the commit carries Enter
AND Space. The docstring has to explain its own name: *"The commit action for
Enter (and Space in bananagrams…)"*. The option beside it is already called
`commit`, and the binding it returns `actCommit`.

**No decision in it:** `onEnter` becomes `onCommit`. Two call sites, the
folder's test, and bananagrams' test harness, which reads
`keyCfg.current.onEnter`.

**Worked 2026-09-24** (*"do next"*): renamed at both call sites and in the
folder's test, and the docstring says it fires on whichever keys the commit's
action carries. bananagrams' harness never read `onEnter` after all; nothing
there changed.

## F-board-cursor-5 · `prose` · Stale claims, rosters, archaeology and the docstring marker

- **Backspace, three places** (worked with F-board-cursor-1). The hook's `onBackspace` note says it removes
  *"the tile behind the cursor / the last staged one"*. scrabble's
  `BoardCol.tsx` says Backspace *"takes the last one back"*, and the registry's
  `act-recall-tiles` comment says `act-remove-tile` *"takes back the last
  one"*. Neither game removes the last one, and both remove the one under the
  cursor. The fix follows F-board-cursor-1's answer.
- **Counts and rosters.** The hook's docstring splits the work *"~5%"* /
  *"95%"*, and names the two games in its docstring, its `enabled` note and its
  test's header; `gridCursor.ts`, its test and the CSS header each name them
  again.
- **Archaeology.** `gridCursor.module.css`: *"scrabble's copy of this was even
  commented '(bananagrams style)'"*. Next door, about this folder's token: the
  bananagrams `theme.css` header says the cursor *"now uses"* the shared
  token and a note says it *"moved to"* it; scrabble's `theme.css` keeps a
  note about an alias that *"pointed straight at it and had no other
  reader"*.
- **Design in a docstring.** `gridCursor.ts`'s long crosswords paragraph (why
  crosswords keeps its own cursor, and the `{row, col}` / `'across'` naming
  split) is design, owed to `doc.md`. Its last sentence, that the split is a
  bigger question, is owed work: a Maybe in `src/crosswords/todo.md`.
- **The marker.** The members of `BoardCursorKeysOptions` carry `/** */`
  notes; a note on one member takes `//`. Both test files open with a `/**`
  that sits on the first declaration after it (an import, `const C`).
- **`onArrow`'s note**, *"a perpendicular game may rotate first"*, is opaque:
  it means `moveCursor` may turn the cursor instead of moving it.

**No decision in it**, apart from the Backspace wording.

**Worked 2026-09-24** (*"do f5"*): each bullet as written. The crosswords
paragraph is `doc.md`'s first Details item, and the naming split is a Maybe in
`src/crosswords/todo.md`. bananagrams' accent note now says in the present that
`--bananagrams-cursor` is not the cursor, since the name still says it is. Two
more found on the way: the hook's docstring said three of its actions are
pattern actions (two are: the arrows and the letters), and both games' comments
and bananagrams' test said "its 5%", pointing at the split that went.

## What checked out

- **The gating.** `enabled` false disables all four actions; `canCommit` gates
  only the commit and defaults to `enabled`'s answer. A disabled action keeps
  its key from the browser, so Space never scrolls the page. The tests pin
  both, and state that the dispatcher's own gates are tested with it.
- **The movement math.** Rotate-or-step, never both; clamped to `[0, max]`;
  `stepBack` leaves the cross axis alone. Both games pass their grid's last
  index. The tests cover each.
- **The ring.** Both games render it as a child of a `position: relative`
  cell, and each game's `.cursor` holds only its `border-radius` (3px scrabble,
  4px bananagrams), as the header says. Its `z-index: 5` is local, inside the
  sealed board.
- **The token.** `--mark-gridCursor-color` follows the `--mark-<mark>-color`
  shape, is defined in both themes, and `docs/tokens.md` describes it.

## Notes

- **The keyboard-nav plan will build on `useBoardCursorKeys`**
  (`plans/keyboard-nav-plan.md` → Code): optional `onLetter` / `onBackspace`,
  an `onSpace` distinct from a peel's Space, and a new hook above it for the
  selection cursor. `gridCursor` and its ring are out of that plan's scope by
  its own ruling (a geographic cursor, not a selection cursor). Nothing is
  built ahead of the plan; the harvest should say the hook expects a third
  user.

## Predicted test breaks

*(none yet)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
