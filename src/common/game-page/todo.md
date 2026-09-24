# game-page — todo

## Bugs

## Soon

- **`game-page/playArea.module.css` is four concerns in one file.** Renamed to
  lowercase 2026-09-14 (docs/code-conventions.md → CSS: a sheet read
  by others is not a component's), and the info column's concern left 2026-09-18
  — **subdividing the rest is still open.** What remains: the two-column shell
  (`.layout`, `.boardCol`, `.mobileFill`, `.responsiveInfoCol`, `.hugRectWidth`,
  `.floatingShuffle`) — the file's real subject; the below-board feedback slot
  (`.localFeedback`, `.moveAreaOrLocalFeedback`); the tile chrome (`.tile`,
  `.tileFace`, `.tileWord` + states); and the board-wide state marks
  (`.dimInFlight`, `.dimNotYourTurn`, `.gameOverFrame`,
  `.verdict*`, `.attentionFlash`, `.yourTurnFlash` + keyframes), which are
  [plans/tile-feedback.md](../../../plans/tile-feedback.md)'s subject.
  A concern that had its own file would have made setup-form's `.infoSetup`
  misfiling (F-setup-form-10) impossible to write. There is no
  `common/game-page/PlayArea.tsx` — the sheet was named for the play surface,
  not for a component here, which is what made it a magnet; the rename removed
  that invitation without moving a rule.

  **What the info column's departure settled, and what it did not.** Joel,
  2026-09-14: *"it's also wrong for stuff about info-col shared css to be in
  PlayArea.module.css, it would be much better in a shared InfoCol.module.css."*
  Done: `info-sheet/infoCol.module.css` holds the column box and its rows, and
  the dividing line drawn there is **which element wears the class** — the
  PlayArea root div's classes stayed, the column's and its rows' went. That line
  is the one to reuse for the remaining three, and it already answers the
  below-board slot (`.localFeedback` is worn inside the board column, not by the
  row).

  What it did NOT settle is `composes:`. Every game still writes `shared.X` off
  one import, so moving a class is a rename at each call site — the info-column
  move cost eighteen files — and `composes:` would let declarations move while a
  consumer keeps one import. The repo uses it nowhere yet; it is the open
  decision in `common/info-sheet/todo.md`, and Joel's
  steer 2026-09-18 is to take it up after a game or two has been audited, when
  there is a real sense of how much per-game styling the column needs. The
  rename risk is not the argument for it: `src/guards/cssClasses.test.ts` fails
  on a `styles.x` the module no longer defines, so a missed call site is a named
  test failure rather than a silently unstyled element (an earlier version of
  this item claimed otherwise).

- **Every race should offer a whole-table stop, and fourteen of the fifteen do
  not.** Joel, 2026-09-19, ruling on the question this item used to ask: *"yes,
  every race should offer it."* So what is left is wiring.

  A race the group has lost interest in can only be closed by every player
  conceding, one at a time, each taking a real loss on their record for a game
  nobody wanted to finish. Coop has End game for exactly this; compete hides it
  —
  `if (mode === 'compete' && !(offersEndForAll && myConceded)) return 'hidden'`.

  **bananagrams is the exception, and not because its game is different**: it is
  the only compete-ONLY game, so it had no coop half to inherit End game from
  and had to opt in. Every other compete mode is one half of a coop/compete
  pair, where the button exists and is simply hidden on this side. So the
  opt-in is the accident and the gap is the rule, which is what makes this a
  common item rather than any game's.

  **The wiring is one argument** — `offersEndForAll` on a game's
  `useStandardGameActions` call — and every schema already defines `end_game`.
  It turns on two controls, not one, which is the part worth knowing before
  reading the code: while you can still play, Concede's question offers ending
  the table as its SECOND answer (the two acts are too easy to confuse for two
  red buttons on a board); once you have conceded, your Concede is spent, so
  End game comes back out as a control of its own and the question is gone with
  it.

  **`ended` is neutral in every mode, compete included** (Joel, same day) —
  *"it's just players deciding to stop — no one won, no one lost. it's just
  ended."* So there is no per-game reading to check first, and no game's
  `labelFor` may say otherwise; a game whose prose or status line calls a
  compete `ended` a loss is wrong today and is part of this work.

  **Build it as one change, not fourteen.** Every game passing the same literal
  is the shape that invites the fifteenth to forget — if every race offers it,
  the hook can stop asking and `offersEndForAll` can go, with bananagrams'
  opt-in going with it. What that turns on is whether any race ever should NOT
  offer it, which is now answered: none.

## Someday

## Maybe

## Won't do

- **The info column's action box should reserve its height** (2026-09-15). It
  will not. Joel: *"while we have a general principle of 'don't shrink/grow
  things in the infoCol', we do that at the item level (ie, we make it so that
  the action buttons are always one line, if the opponentstrip would grow based
  on your last move, we'd reserve 2 lines for it, etc)."* So the don't-move rule is kept row by row, and a height on the
  stack is the container-level reservation it refuses. The `min-height: 6rem`
  that was doing that is gone.

  The wrapper itself stays, and is now `.noShrinkRow` rather than
  `.actionSlot` — it holds every row of the column except the event log / word
  list, of which the action row is one, and what they share is that none of
  them is the one squeezed when the column runs short. It earns its place because
  flex shrinking is negotiated between siblings: with it, `.infoCol` has two
  children and "the log gives" is structural; without it the rule would be
  `.infoCol > * { flex-shrink: 0 }` against `EventLog`'s `flex: 1` at equal
  specificity, decided by module import order.

  **What this leaves owed, per game:** the row-level reservations the
  principle asks for, filed in each game's `todo.md`. (An earlier version of
  this entry said `SetupDisclosure` adds a margin of its own on top of the
  column gap; it does not — its `0.3rem` sits between the summary and the list
  INSIDE the disclosure.)

- **A contract-slot guard, per MOUNT POINT** (2026-09-15). No guard. The shared
  `.hugRectWidth` reads `--cols` / `--max-tile-width` / `--grid-gap` and no
  `common/` file sets them, so a game that wears the class and forgets one gets
  an invalid `width` that the browser drops — the board then sizes itself. Joel: *"wouldn't it break the layout in any obvious
  way?"* It would, immediately, in the board being edited, and only when a new
  board first wears the class. The rule already names what a game owes it
  ("Each game supplies --cols / --max-tile-width / --grid-gap"). A guard would
  also be unsound: psychicnum fills `--cols` from an inline `style` on the
  parent element, so a CSS-only check reports it broken on day one.

- **The global feedback slot `GamePage.tsx` holds inline is `feedback`'s
  concern** (2026-09-15). The redesign happened and left it here. That area
  closed blessed on 2026-09-12 and its `todo.md` is empty, so there is nothing
  left to wait on — and `useFeedbackSlot`'s docstring now states
  this arrangement as the rule: "a page calls `useFeedbackSlot('global')` for
  the one in its header and hands it down as `ctx.globalFeedbackSlot`."
  `ClubPage` does the identical thing, so `GamePage` is one of two pages
  following it rather than an exception to anything.

- **The game page is the one page not wearing `.pageHeaderAndMainArea`**
  (2026-09-15). It keeps its own wrapper (`.pageHeaderAndPlaySurface`, which
  was `.frame` until Joel renamed it the same day), on measurement. It is
  still the one page without the shared pattern — home, login, claim-handle
  and club all wear it — but the argument the item made for adopting it is
  gone: "a header or padding change moves both numbers by hand" stopped being
  true when `--game-chrome-height` was composed from
  `2 × --page-padding-y + --pageHeader-height + --spacer-4 +
  --border-width-line + --spacer-2`, which is the same change that fixed the
  shell's 1px overflow.

  Three reasons not to adopt it, the first two measured across all fifteen
  solo-playable games at three viewports:

  - **the shell's derivation is uniform and right** once its input is —
    every game sat at exactly the same figure, so there was one number wrong
    in one place rather than fifteen pages each slightly off;
  - **boards do not ask their parent.** Eleven games compute their board's
    height from `100svh` directly, each minus its own reserve, so bounding
    the wrapper would not reach them;
  - **it would make the play surface shrinkable for the first time.** The
    shared pattern puts a `height` on the wrapper, and a flex item with an
    explicit height still has `flex-shrink: 1` — so an overflow would quietly
    squeeze a board instead of scrolling, on the page whose whole invariant
    is about fitting the viewport.

  **What would reopen it:** taking on those eleven per-game reserves (filed
  in each game's own `todo.md`). They are where the hand-maintained height
  arithmetic still lives, and a change there is the moment to ask again
  whether a board should measure the viewport at all or be handed a box.
