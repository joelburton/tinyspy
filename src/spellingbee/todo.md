# spellingbee — todo

## Bugs

## Soon

- **Look at two things on a phone.** A tapped hex should sit flat afterwards
  (its hover is gated on `(hover: hover)`) and still lift under a mouse; and a
  refused word's hexes shake by 5 of the hive's own units, which scales with
  the board — about 7.5px at full size. The keyframes are shared by every
  game, so a shake that reads wrong here wants a hex-only adjustment, not an
  edit to them. Neither has been seen outside jsdom.

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

  **Closed 2026-09-22, no change** — Joel looked at the one box: *"it looks
  fine."* The entry stays struck rather than deleted because nothing shipped for
  it; what closed is the question. It reopens only on a report from a real
  setup — someone typing seven letters without the hyphen, or a letter set with
  no obvious center to put first.

## Someday

- **The outcome color on a refused word's letters is a live experiment, and
  wordwheel is its control.** Here the letters the word used take the outcome's
  fill; wordwheel's tiles deliberately do NOT, so friends can play both and say
  whether coloring a letter tile helps at all (Joel, 2026-09-15). The doubt that
  started it: a refused TETE colors two hexes, because a hive letter stands for
  every use of it in the word, and a word has as many letters as it likes.
  **Whatever comes back decides it for both** — do not bring wordwheel into line
  to match. Its twin is in `wordwheel/todo.md`.

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

- **`Letters.module.css` + `Letter.module.css` and `Wheel.module.css` are
  deliberately NOT folded** with wordwheel's. The two sides are structurally
  parallel — `.board`, `.grid`, `.floatAnchor`, a tile — so a fold looks
  mechanically easy, and the reason
  not to is that it means picking ONE vocabulary for the shared names when a
  honeycomb has hexes where a wheel has tiles. The full entry, with what a
  revisit would tractably share, is [`wordwheel.md →
  Deferred`](../../docs/games/wordwheel.md#deferred); wordwheel is the fork and
  owns the pair's shared-vs-not ledger, so that copy is the one that governs.
