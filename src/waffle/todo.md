# waffle — todo

## Bugs

- **`create_game` accepts a one-player compete game.** The compete manifest's
  `numberOfPlayers` is `[2, 6]` and its comment says the RPC also enforces it,
  but `waffle.create_game` has no `< 2` check for compete, so only the FE's
  hidden Start button stops it. Add the check the other compete games have
  (wordle's is `PN498`, a fault, since the app never sends it).

## Soon
- **Does a finished coop game still need to skip the title's swap check?**
  `_sync_title` names a coop game after its correct words only once the
  team's `n_swaps_used` sum is above 0, so the deal's free words never title an
  untouched game — but a game that has ended is exempt. The only reason ever
  given was the mid-game `reveal_answer`, which wrote the solution without a
  swap and is gone. Today the exemption lets a game ended untouched be titled
  after the deal's free words. Keep it (with a reason) or drop it: Joel's call, with a pgTAP
  case in `gameplay_test.sql`.

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

## Someday

- **Teach Enter on screen.** A tap-tap swaps at once, so nothing on the board
  shows that two keyboard picks (arrows, Space) are swapped with Enter; only
  Help and the key list ("Swap ↵") say so. A `⏎ to swap` line under the
  board, shown while two keyboard picks wait, was declined here, as it was for
  codenamesduet; the slot under the board does have room, so this one would
  fit if it is wanted.
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
