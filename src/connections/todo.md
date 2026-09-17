# connections — todo

## Bugs

- **`matched` on `GuessRow` is now derivable.** It is `result === 'correct'`,
  and `result` joined the row on 2026-09-17 so the history viewer's three tint
  classes could key on a three-value word instead of a narrowed `Outcome`. Its
  docstring defends it as "the rule, kept separate from the look" — an argument
  against asking a COLOR about the rules, which no longer applies now that the
  fact is there to ask. Collapse it, or rewrite the docstring to say why two
  fields carry one fact.

- **The Hints menu row is live when the list it toggles is not drawn.**
  `act-hint`'s `describe` answers `active` always, but `InfoCol` mounts
  `<HintList>` only in the `showInput` branch, so at terminal and for an
  eliminated or conceded player the row flips a flag nothing renders. It
  should answer `hidden` whenever `!showInput`.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **An eliminated racer still pauses the game for the survivors.** The
  presence-pause roster is the game's players minus conceders, and a fourth
  mistake eliminates without setting `conceded`, so closing an eliminated tab
  stops everyone still racing. Decide with the SQL open: either elimination
  sets `conceded` too (then `_maybe_finish_compete` and the club-list outcome
  words need re-reading, since "conceded" currently means walked away), or the
  roster rule grows a second exclusion, or the caveat is accepted and written
  as a rule in `docs/games/connections.md`.
- **`revealedHints` can move back into `<HintList>`.** It was lifted into
  `PlayArea` so the restart handler could clear it; a restart now unmounts the
  whole play surface, so local state is cleared wherever it lives
  (common/game-page/doc.md). The prop pair (`revealed` / `onReveal`) exists only
  to serve the lift.

- **Collapse the info-column action row's branches.** This game still FORKS on
  `over ? … : locally done ? … : …` and lists a different set of buttons in
  each, which is how a state can quietly lose a button — every one of these
  rows is missing back-to-club while a race runs on without you. psychicnum is
  the worked example (2026-09-14); copy its shape.

  **The shape.** One `<InfoActionsRow>`, every action listed once in one
  order, and the only thing that varies is the optional `{ text, outcome }`
  line. Which buttons are on screen is each action's own answer —
  `<ActionButton>` draws nothing for an action that says `hidden`.

  **The state rule** (Joel, 2026-09-14): `hidden` is *not even possible in
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

- **`shuffleTiles` in `lib/localOrder.ts` is a hand-written Fisher–Yates** —
  `shuffle(tiles)` from `src/common/utils/shuffle.ts` is the same function,
  so the export goes and `components/BoardCol.tsx` calls the util directly.
  Its three cases in `lib/localOrder.test.ts` (a permutation, the input
  untouched, an empty array) are pinned beside the util now and go with it;
  `reconcileLocalOrder` is untouched either way.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `connections.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

## Someday

## Maybe
