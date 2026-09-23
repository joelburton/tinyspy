# spellingbee — todo

## Bugs

## Soon

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

- **Two hand-written Fisher–Yates shuffles, one per side** — `shuffled` in
  `components/BoardCol.tsx` and `shuffled` in
  `supabase/functions/spellingbee-build-board/index.ts`. Both become
  `src/common/utils/shuffle.ts`: the component calls `shuffle(items)` (the
  default rng is `Math.random` and a copy comes back, so behavior is
  unchanged), and the edge function imports the util by relative path with an
  explicit `.ts`, the way `scrabble-ai-move` imports `mulberry32`. The
  component's copy is `wordwheel`'s character for character.
- **The hive's hover is not gated, so a tap leaves a hex risen.** A touchscreen
  keeps `:hover` on the last-tapped element until you tap elsewhere, so
  `.hex:hover`'s lift + lighter shadow (`Letters.module.css`) sits there after
  every letter looking like state. strands hit this and was fixed by wrapping
  the rule in `@media (hover: hover)` — the same gate, for the same reason, as
  the tooltip bubble (`docs/ui.md` → Tooltips). The shared item in
  `docs/deferred.md` names three games; stackdown and wordwheel keep it there,
  and this game's share comes off that list when it ships here. Re-check on a
  phone: the `@media (prefers-reduced-motion: reduce)` block below it names
  `.hex:hover` too.

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

## Won't do

- **`Letters.module.css` and `Wheel.module.css` are deliberately NOT folded**
  with wordwheel's. The two are structurally parallel — `.board`, `.grid`,
  `.floatAnchor`, a tile — so a fold looks mechanically easy, and the reason
  not to is that it means picking ONE vocabulary for the shared names when a
  honeycomb has hexes where a wheel has tiles. The full entry, with what a
  revisit would tractably share, is [`wordwheel.md →
  Deferred`](../../docs/games/wordwheel.md#deferred); wordwheel is the fork and
  owns the pair's shared-vs-not ledger, so that copy is the one that governs.
