# bananagrams — todo

## Bugs

- **The PDF inverts `dump_to_bag`.** `lib/setupSummary.ts` has both arms
  swapped — `setup.dump_to_bag ? 'back to the bunch' : 'out of play'` —
  against `lib/setup.ts` (`false` = back into the bunch, `true` = out of play
  in the bag), the setup form, and the screen recap. So the printout
  misstates the rule on EITHER setting. One line; fix first and separately.
  It was invisible only because the recap is written twice (below), so this
  string never rendered on the surface players read mid-game.
- **A manual end may print a winner that doesn't exist.** The terminal message
  in `PlayArea.tsx` is one chain over `status.outcome` — `timeout`,
  `conceded`, `selfWon`, then a final else that announces
  `${winnerName} went out — Bananas!`. There is no arm for `ended`, the
  terminal every other game routes to the shared `gameEndedTerminalMessage()`. **Verify
  before believing it**: end a game manually and read the pill. The chain
  may be unreachable for `ended`, in which case the finding is that the code
  cannot say so.
- **Three controls are unmounted behind JSX guards while their bindings say
  otherwise.** `HandCard` drops `<ShuffleButton>` once frozen
  (`showControls`) while `act-shuffle` still answers `active` whenever tiles
  remain, so `⌥Z` shuffles a frozen hand and Help lists a key with no control
  on screen; `PlayerBoard` drops Peel and Check words behind
  `!isTerminal && !isConceded` while `act-peel` and `act-check-board` answer
  `disabled`, so the menu and key list show gray rows for controls that are
  gone. The bindings should answer `hidden` when frozen and the guards go —
  one answer read by everything.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **A conceded racer's End game has no button.** Once `myConceded` is true,
  `act-end-game` answers `active` (the whole-table stop comes back to a
  player whose Concede is spent), but the conceded row is
  `<InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }} />` with no children
  (`PlayArea.tsx`), so the stop is reachable only from the menu row and
  `⌥⌫`. Place `<ActionButton action={actEndGame} show="icon" />` in that row,
  the way the playing row does.

## Soon

- **Collapse the info-column action row's branches.** Every state is one
  `<InfoActionsRow>` now (common/game-page), varying only an optional `{ text,
  outcome }` line — but this game still FORKS on `over ? … : locally done ? …
  : …` and lists a different set of buttons in each. Its rows are built in
  `PlayArea.tsx` rather than an `InfoCol.tsx`.

  `ActionButton` already promises the way out: *"Nothing renders when the
  action is hidden, so a list of these needs no `if` around any of them."* So
  list every button once, in one order, and push the knowledge into each
  action's `describe()` — an action that should not appear mid-play says
  `hidden` itself.

  The blocker is that some `describe()`s are not truthful yet: `actNewGame`
  and `actRestart` answer `'active'` unconditionally, so listing them today
  would draw them during play. Making them honest is this game's judgment,
  which is why this is filed here rather than swept (Joel, 2026-09-16: *"there
  may be action rows where we need to do something very different between
  playing/terminal states and, if so, we can address this when we get to that
  game. but the common case would be the full collapse."*). It also restores
  the missing back-to-club by construction.

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
