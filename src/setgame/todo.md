# setgame — todo

## Bugs

- **`create_game` accepts a one-player compete game.** The compete manifest's
  `numberOfPlayers` is `[2, 6]` and its comment says the RPC enforces the
  minimum, but `setgame.create_game` has no `< 2` check for compete, so only the
  FE's hidden Start button stops it. Add the check the other compete games have
  (wordle's is `PN498`, a fault, since the app never sends it).
- **A compete leaderboard is written only at the end.** setgame's blob
  carries no live leaderboard. The cross-game design fixes it
  (`plans/cross-game-consistency.md` §3b → one leaderboard per compete
  game): a `setgame._leaderboard()` called on every move, entries in
  `final_ranking` order, conceders unranked and last.

## Soon

- **The printer starts its body at `margin + 46`, two points under every
  other printout.** The shared printers read `pd.contentTop` (`margin + 44`,
  stated once in `common/pdf/frame.ts`); `printSetgamePdf` writes its own
  number. Either read `contentTop` like the rest, or keep the two points and
  say why beside it.
- **The printed log is headed "Turns"; the screen's log wears a tally.**
  `common/pdf`'s rule (2026-09-19) is that the paper's heading is the word
  the game's on-screen event log wears, and the shared `drawEventLog` now
  requires it — but setgame draws its own rows with `twoColGeom` and writes
  `'Turns'`, while `GameEventLog` passes `Found: n · Hints: n`, which is not a
  heading word at all. Decide what the paper says (a word the screen also
  shows, or the same tally) when the printer is read.

- **The live hint's ring is GREEN, and a hint is amber everywhere else.**
  `--setgame-hint-ring` is `#16a34a` — a saturated green, and green is this
  app's success color. The same hint's log bar is amber (`warning`, the word
  `lib/answer.ts` gives it, ruled 2026-09-16 as the word for a hint in
  every game), and its `Hint:` tag sits beside a row whose bar says caution. So
  the board and the log say two different things about one event.

  Found 2026-09-16 by `outcome-fix`, and left alone there because it is a LOOK
  decision rather than a word one: the ring is a "look here" mark, not a verdict.
  It now sits beside a second green ring — the found set's, in the won color
  (the seat-view conversion, 2026-10-05) — dashed where that one is solid, so a
  hinted tile and a found one differ only by the dash. What has to be decided is whether
  the hint RING is in that family or in the outcome vocabulary — and if the
  latter, amber has to survive the test the green was picked to pass: a thin
  dash on a white tile beside eleven other white tiles was genuinely easy to
  miss, which is why it stopped being gray. **Decide this with the item below**,
  which is the other open question about the same ring.

- **A viewed past turn is ringed in the HINT's color here, not the shared history
  color.** Every other game with a viewer rings the tiles a past turn
  touched in `--history-color` — the same blue as the board frame and the log's
  open `#N`, so all three parts of "you are looking at this past turn" read as one
  mark. setgame instead feeds `historyLitCards` into the same `ringed` prop its
  live hint uses, so a viewed turn wears `.ringed` — a dashed outline in
  `--setgame-hint-ring` (`#16a34a`, a green). The result is that the frame and the
  `#N` say history while the tiles say hint, in a green that is also this app's
  success color.

  Found 2026-09-16 in the history-names sweep. Not changed there because it is a
  LOOK decision, not a naming one: either the history case gets its own class in
  the shared color (the other nine games' shape), or setgame keeps one ring
  deliberately and says why. The prop itself was renamed `hinted` → `ringed` in
  that sweep, since it names a mark with two causes and `hint` is reserved for
  the priced hint itself.

- **The below-board reserve is a hand-tuned constant.**
  `components/Board.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 5rem`, where that last term stands for
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

## Maybe

## Won't do

- **The deck's order in `game_data`.** Nothing on the page shows it, during the
  game or after (Joel, 2026-10-05: "if we never need puzzle.deck, than don't
  include it").
