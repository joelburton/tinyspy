# waffle — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon
- **Collapse the info-column action row's branches.** Every state is one
  `<InfoActionsRow>` now (common/game-page), varying only an optional `{ text,
  outcome }` line — but this game still FORKS on `over ? … : locally done ? …
  : …` and lists a different set of buttons in each.

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
