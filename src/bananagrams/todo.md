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

- **Collapse the info-column action row's branches.** This game still FORKS on
  `over ? … : locally done ? … : …` and lists a different set of buttons in
  each, which is how a state can quietly lose a button — every one of these
  rows is missing back-to-club while a race runs on without you. psychicnum is
  the worked example (2026-09-16); copy its shape. Its rows are built in
  `PlayArea.tsx` rather than an `InfoCol.tsx`.

  **The shape.** One `<InfoActionsRow>`, every action listed once in one
  order, and the only thing that varies is the optional `{ text, outcome }`
  line. Which buttons are on screen is each action's own answer —
  `<ActionButton>` draws nothing for an action that says `hidden`.

  **The state rule** (Joel, 2026-09-16): `hidden` is *not even possible in
  this state* — you cannot end a game that has ended, or reveal an answer you
  are still hunting. `disabled` is *possible here, just not right now*, and it
  carries a tooltip saying why — a hint when you have used your last one. Most
  games' gate variable folds several of these together and has to be split
  before the actions can be honest; psychicnum's `canGuess` hid "terminal"
  inside "out of guesses" and is now `isStillPlaying`.

  **Two answer their asker differently**, which is what `ActionAsker` is for:
  Restart and New game are reachable all game from the menu and their keys —
  the confirmations are written for exactly that ("will be shelved, not lost",
  "Keep playing") — and get a BUTTON only at terminal. `describe: (asker) =>
  asker === 'button' && !isTerminal ? 'hidden' : 'active'`. Restart's is
  already done in `useStandardGameActions`; each game's own `act-new-game` is
  not.

  **Two things the collapse destroys if you are not watching.** Back-to-club
  is `weight={over ? 'primary' : 'secondary'}` — filled only once the game is
  over; hoisting the terminal branch's `weight="primary"` into the single list
  makes it shout all game. And the gray `shared.actionsDivider` span goes
  between the actions you take WHILE PLAYING and the ones about the END of the
  game — both sides are pressable mid-game, so nothing but the bar says where
  the meaning changes. It hides itself when nothing is left on its left.

  **A test gotcha:** `menuItems` reads the rows a game PUSHED, and `hidden` is
  what the menu drops at draw time — so "not in the menu" asserts `?.hidden
  === true`, not `toBeUndefined()`.

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
