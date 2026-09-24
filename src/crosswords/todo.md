# crosswords — todo

## Bugs

- **Picture clues don't appear.** The NYT daily for 2026-09-06
  (<https://www.nytimes.com/crosswords/game/daily/2026/09/06>) has clues whose
  content is an image, and the board shows nothing for them — so those entries
  are unsolvable from the app. Investigate whether we can show them: what the
  source format carries for such a clue, whether the importer drops it or never
  had it, and whether the image can be stored with the puzzle rather than
  hot-linked.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **`replay_board` takes no game-row lock.** Every other game's replay locks
  the game row (`select … for update`) before resetting, because a replay
  interleaved with an in-flight move can let that move land on the fresh
  board, or let a game-ending move land after the reset and re-end the game
  (docs/supabase.md → Server conventions). `crosswords.replay_board` doesn't,
  and `common.reset_game` doesn't lock for it. psychicnum's `replay_board` is
  the model.
- **The cell RPCs take no game-row lock** (`set_cell`, `set_mark`,
  `check_cells`, `reveal_cells`). Per-cell writes carry their own `version`
  (newer wins), so this may be deliberate for the cells themselves; check
  whether the move that completes the grid, and so ends the game, can race
  another, and say in the functions why they don't lock.

## Soon

- **Collapse the info-column action row's branches.** This game still FORKS on
  `over ? … : locally done ? … : …` and lists a different set of buttons in
  each, which is how a state can quietly lose a button — every one of these
  rows is missing back-to-club while a race runs on without you. psychicnum is
  the worked example (2026-09-14); copy its shape. Crosswords is the one left
  out of the row conversion — its buttons are not ordinary action buttons — so
  decide first whether they can join at all.

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

- **Link a from-site puzzle back to its source.** For puzzles imported from a
  publisher (NYT, Guardian, …) it would be nice to offer a link to the puzzle
  on that site. The importer already keeps `author` and `copyright` from the
  source format; whether a canonical URL is available per publisher, or has to
  be composed from the puzzle's date and slug, is the thing to find out.
- **`CrosswordsNumberJumpBlockingModal` is a blocking modal not built as
  one** — a hand-rolled `position: fixed` box with its own scrim, where
  `<BlockingModal>` brings the backdrop, the tab ring, immovability and
  content-fit height. **The conversion moves no layer**: it already reads
  `--z-modal-blocking`, the tier that shell resolves from its family. What the
  shell would change is this game's own scrim, tab ring and Escape, which is
  why the decision sits here.
- The setup chooser is drifted on three values — `6px` where `--radius-md`
  is the vocabulary, and its own hover and rule colors. Unintended, per Joel.
- **The control bar picks a font size off the ramp.** `Controls.module.css`'s
  `.btn` writes `font-size: 0.9rem`, where the ramp's small step is `0.85rem` —
  a difference of 0.8px at the browser's default root, so it reads as a guess
  rather than a choice. The bar is a documented exemption from the shared
  button (its ON state is a game color), so the size is this game's to keep or
  collapse; the point is only that nothing yet says which.
## Someday

## Maybe

## Won't do
