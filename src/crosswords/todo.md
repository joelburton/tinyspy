# crosswords — todo

## Bugs

- **Picture clues don't appear.** The NYT daily for 2026-09-06
  (<https://www.nytimes.com/crosswords/game/daily/2026/09/06>) has clues whose
  content is an image, and the board shows nothing for them — so those entries
  are unsolvable from the app. Investigate whether we can show them: what the
  source format carries for such a clue, whether the importer drops it or never
  had it, and whether the image can be stored with the puzzle rather than
  hot-linked.

## Soon

- Investigate how we flag check/reveal.

- **Collapse the strip's action-row branches** (`ToolStrip`). This game still FORKS on
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
  before the actions can be honest; psychicnum's `canGuess` hid "game ended"
  inside "out of guesses" and is now `isStillPlaying`.

  **Two answer their asker differently**, which is what `ActionAsker` is for:
  Restart and New game are reachable all game from the menu and their keys —
  the confirmations are written for exactly that ("will be shelved, not lost",
  "Keep playing") — and get a BUTTON only at the end. `describe: (asker) =>
  asker === 'button' && !isGameEnded ? 'hidden' : 'active'`. Restart's is
  already done in `useStandardGameActions`; each game's own `act-new-game` is
  not.

  **Two things the collapse destroys if you are not watching.** Back-to-club
  is `weight={over ? 'primary' : 'secondary'}` — filled only once the game is
  over; hoisting the ending branch's `weight="primary"` into the single list
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

- **Should Reveal puzzle win coop?** Revealed cells count toward `solved`,
  so Reveal puzzle on an empty grid fills it and the team has won
  (deliberate, per `reveal_cells`' comment; compete bans Reveal). The
  options: every reveal counts, as today (`perfect-play` already excludes
  reveals); a letter or word still counts but the whole puzzle ends the game
  `stopped`, as giving up; or any revealed cell means not `solved`.

## Maybe

- **The cursor speaks its own vocabulary.** Here a cursor is `{ row, col }`
  with `'across'`/`'down'`; the shared board cursor (`common/board-cursor`) is
  `{ x, y }` with `'h'`/`'v'`, and docs/naming.md wants one name per concept.
  Whether the two should share names is a question across both.

## Won't do

- **Lowercase letters.** Joel, 2026-10-06: crosswords keeps uppercase, unlike
  the games that went lowercase. Every edge of this game already uppercases —
  the .puz and .ipuz parsers, the NYT and Guardian conversions, the keyboard,
  `set_cell`, and `writeIpuz` on the way out — so uppercase is the case that
  never changes as a letter moves. The page blob's lowercase means pencil.
- **Words for what a check found.** 2026-10-06: a check says nothing about
  its result; its red marks are the answer, and the slot speaks only to say it
  skipped penciled cells.
