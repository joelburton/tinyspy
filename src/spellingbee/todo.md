# spellingbee — todo

## Bugs

## Soon

- ~~**The custom-letters field became one box, and nobody has looked at it.**~~
  The setup form once took a center letter and six others in two boxes; it now
  takes the hyphenated string both the summary and the recap print (`A-CHIROT`)
  in a single `<ManualBoardField>`, which splits it. That shipped from the
  `forms` area on 2026-08-26 (`1599b751`, the field five games stopped
  hand-rolling), and the e2e spec was deliberately left RED so the UI change
  would be seen HERE rather than certified by the area that made it (Joel,
  2026-08-26). The spec was then quietly repaired on 2026-09-01 (`ec12c73a`,
  "ten specs described the DOM the CSS sprint replaced"), so the red flag came
  off without the look it was holding open.

## Someday

- **Compete with no target, when a countdown is set.** The rule for every
  compete word hunt (plans/cross-game-consistency.md §3b, "a compete word
  hunt needs a target, a countdown, or both"): something must be able to
  crown a winner. Today `create_game` refuses compete with no `target_rank`,
  so "best score in ten minutes" can't be played. The change: compete may
  leave the target empty when the timer is a countdown; the timeout then
  crowns the top score (`co-winners` on a tie, nobody if nobody scored), as
  boggle's does. The setup form offers None in compete only with a countdown.
  wordwheel's todo carries the same change.

- **Every word is the `goal-intrinsic`, and coop with no target should end
  on it.** Ruled 2026-09-25 (docs/win-lose.md → How a game ends — the terms
  already describe it). Today finding every required word ends and wins
  nothing (`gameplay_test` pins "coop has no end at a full clear"), and a
  coop game with no target is won and lost by nothing, so its timeout is the
  neutral `ended`. The change: a coop game with no target is `won` when the
  team finds every required word, and its timeout is `timeout-no-winner`
  (`lost`) rather than `no-result`. `plans/game-cards.md`'s spellingbee card
  shows today's behavior until then.

- **The `WordList` marker vocabulary** — ◐ ("more than one player found this
  word", in the first finder's color) and ⦻ ("scored zero because more than one
  player found it"). Both are compete-mode readings this game's list would
  show, and both are `common/word-list`'s to design: the entries live in
  `src/common/word-list/todo.md`, which is their one home. Listed here because
  a compete spellingbee is where they would first be read.

## Maybe

- **Four `create_game` refusals have no pgTAP case**: a target rank that is
  not a number (PN158), repeated outer letters (PN164), and a center that is
  not one letter or is an S (PN165, PN166). The edge function refuses bad
  custom letters first and the dialog before it, so none is reachable from
  the app; a case each would pin the server's own check.

## Won't do

- **`Letters.module.css` + `Letter.module.css` and `Wheel.module.css` +
  `Tile.module.css` are deliberately NOT folded** with wordwheel's. The two sides are structurally
  parallel — `.board`, `.grid`, `.floatAnchor`, a tile — so a fold looks
  mechanically easy, and the reason
  not to is that it means picking ONE vocabulary for the shared names when a
  honeycomb has hexes where a wheel has tiles. The full entry, with what a
  revisit would tractably share, is [wordwheel's `todo.md` → Won't
  do](../wordwheel/todo.md#wont-do); wordwheel is the fork and
  owns the pair's shared-vs-not ledger, so that copy is the one that governs.
