# waffle — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **`create_game` accepts a one-player compete game.** The compete manifest's
  `numberOfPlayers` is `[2, 6]` and its comment says the RPC also enforces it,
  but `waffle.create_game` has no `< 2` check for compete, so only the FE's
  hidden Start button stops it. Add the check the other compete games have
  (wordle's is `PN498`, a fault, since the app never sends it).

## Soon
- **Does `waffle._solution_for` still hand coop the solution during play?**
  Each swap row now stores its board's colors, so the turn-history viewer no
  longer needs the answer to recolor a past board — the reason
  `_solution_for`'s own comment gives for the coop branch, which also still
  says compete writes no swap log. `PlayArea.tsx`'s comment above the swap
  handler repeats the stale reason. Tightening the branch to terminal-only is
  Joel's call, with its own pgTAP; either way the two comments are wrong today.

- **The below-board reserve is a hand-tuned constant.**
  `components/Board.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 3.5rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

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

- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `waffle.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

- **The two header milestones have no unit test.** `PlayArea.tsx` narrates a
  peer solving and a peer running out of swaps as `peerMilestone`s off the
  players' rows; the kind itself is pinned in `common/feedback`'s test and by
  wordle's compete-solve test, but nothing checks that waffle fires each one
  on its edge and only once.

## Someday

- `SolutionReveal` sets monospace twice, so the revealed grid's letters line
  up in a column. The alignment need is real; whether monospace is how to
  meet it is not obvious now that the app font's digits are tabular and its
  width dial can hold a column. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.
- `PlayArea.tsx` returns its own `<p>Loading game…</p>` while the read is
  pending, where `src/common/loading`'s `<Loading>` is the word every page
  shows for that moment. Swap it in, or say why this surface's is different.

## Maybe

## Won't do
