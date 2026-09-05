# bananagrams — todo

## Bugs

- **The PDF inverts `dump_to_bag`.** `lib/setupSummary.ts` has both arms
  swapped — `setup.dump_to_bag ? 'back to the bunch' : 'out of play'` —
  against `lib/setup.ts` (`false` = back into the bunch, `true` = out of play
  in the bag), the setup form, and the screen recap. So the printout
  misstates the rule on EITHER setting. One line; fix first and separately.
  It was invisible only because the recap is written twice (below), so this
  string never rendered on the surface players read mid-game.
- **A manual end may print a winner that doesn't exist.** The terminal copy
  in `PlayArea.tsx` is one ternary chain over `status.outcome` — `timeout`,
  `conceded`, `selfWon`, then a final else that announces
  `${winnerName} went out — Bananas!`. There is no arm for `ended`, the
  terminal every other game routes to the shared `endedCopy()`. **Verify
  before believing it**: end a game manually and read the pill. The chain
  may be unreachable for `ended`, in which case the finding is that the code
  cannot say so.

## Soon

- **The setup recap is written twice, and has drifted three ways.** This is
  the last game rendering its recap from two sources: `PlayArea.tsx` calls
  `setupRows()` for the PDF and hand-writes the screen's `<li>`s inside
  `<SetupDisclosure>`. They already disagree — the roster row is absent on
  screen, the order differs (Bunch then Starter hand vs the reverse), the
  word-check label differs ("Word check" vs "Words"), and the dump line is
  inverted (the bug above). Every other game calls `setupRows()` once and
  renders it on both surfaces; delete the hand-written list and render the
  array the PDF already computes. A guard that compared the two surfaces
  would catch the next game that skips a migration — `setupRows.test.ts`
  only checks that every setup key produces a row.
- **`shuffleString` in `lib/board.ts` is a hand-written Fisher–Yates**, the
  only one of the repo's copies that takes a string rather than an array.
  `src/common/utils/shuffle.ts` is the shared one and stays array-only, so
  this is either `shuffle([...displayedHand]).join('')` at the one call site
  (`hooks/usePlayerBoard.ts`) or a one-line `shuffleString` kept as a wrapper
  over it — the wrapper reads better at the call site and keeps the two
  invariant tests in `lib/board.test.ts` where they are.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

## Maybe
