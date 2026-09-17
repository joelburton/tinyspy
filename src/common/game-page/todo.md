# game-page — todo

## Bugs

- **`verdictTone.ts` calls an outcome a tone, and so does `--verdict-tone`.**
  Joel, 2026-09-16: *"there is one and only one word we use for 'outcome' and
  that is 'outcome'. do not use 'tone'. an outcome is not a tone … we do use
  'tone' for game chrome (like buttons); those take a 'tone'. that's a different
  vocabulary."* `VERDICT_TONE` is typed `Record<Outcome, string>` — it is keyed
  by the vocabulary and named after the other one, which is exactly the
  invitation a surface takes when it decides an outcome is a color it may pick.
  The file name goes with the export.

  **`--verdict-tone` is not a straight rename.** It and `--verdict-fill` are two
  color roles of one outcome — the 800 ink tier a ring draws in, and the 400
  fill tier a piece wears — so dropping "tone" leaves it needing a name that
  says which role it is, beside the `-fill` and `-ink` that already do.

  The GAMES' own `tone`-for-outcome (connections' `verdict.tone`, wordle's
  `rejectTone`, and the prose in wordiply / spellingbee / boggle / psychicnum)
  is being fixed per game as `outcome-fix` reaches each, by Joel's word. This
  item is the shared half that no game step owns.

## Soon

- **`game-page/playArea.module.css` is five concerns in one file.** Renamed to
  lowercase 2026-09-14 (docs/deferred.md → Common / architecture: a sheet read
  by others is not a component's), which was the half of this that was provably
  right — **subdividing it is still open.** 45 rules: the two-column shell (`.layout`,
  `.boardCol`, `.infoCol`, `.mobileFill`, `.responsiveInfoCol`, `.hugRectWidth`,
  `.floatingShuffle`) — which is the file's real subject; the info-column
  readouts (`.noShrinkRow`, `.infoState`, `.infoHelp`, `.infoActions`,
  `.terminalActions`, `.terminalExtra`; the outcome line's rules went to
  `info-sheet/InfoActionsRow.module.css` with the component, 2026-09-15); the
  below-board feedback
  slot (`.localFeedback`, `.moveAreaOrLocalFeedback`); the tile chrome (`.tile`,
  `.tileFace`, `.tileWord` + states); and the board-wide state marks
  (`.dimInFlight`, `.dimNotYourTurn`, `.gameOverFrame`,
  `.verdict*`, `.attentionFlash`, `.yourTurnFlash` + keyframes), which are
  [plans/tile-feedback.md](../../../plans/tile-feedback.md)'s subject. Joel,
  2026-09-14: *"it's also wrong for stuff about info-col shared css to be in
  PlayArea.module.css, it would be much better in a shared InfoCol.module.css."*
  A concern that had its own file would have made setup-form's `.infoSetup`
  misfiling (F-setup-form-10) impossible to write. There is no
  `common/game-page/PlayArea.tsx` — the sheet was named for the play surface,
  not for a component here, which is what made it a magnet; the rename removed
  that invitation without moving a rule.

  **The cost to weigh when this is picked up**, which the item used to
  understate by claiming the split "needs no component to change": every game
  writes `shared.infoCol` off one import, so moving a class to another sheet is
  a rename at each call site — **19 `.tsx` files** for the info-column classes
  alone — and a missed one is an unstyled element, not a build error.
  `composes:` would let the declarations split while consumers keep one import;
  the repo uses it nowhere yet, which is the open decision in docs/deferred.md's
  third bullet under the same heading.

  Joel, 2026-09-14: *"let's do 1 now, and continue to have an issue to subdivide
  it later. once we're at the point of being able to audit our first game, we'll
  be a in a better place."* The consumers ARE the games, so the split wants a
  game's own CSS pass open beside it.

- ~~**The info column's action box does not reserve its height.**~~ **Closed
  2026-09-15: it will not.** Joel: *"while we have a general principle of
  'don't shrink/grow things in the infoCol', we do that at the item level (ie,
  we make it so that the action buttons are always one line, if the
  opponentstrip would grow based on your last move, we'd reserve 2 lines for
  it, etc)."* So the don't-move rule is kept row by row, and a height on the
  stack is the container-level reservation it refuses. The `min-height: 6rem`
  that was doing that is gone.

  The wrapper itself stays, and is now `.noShrinkRow` rather than
  `.actionSlot` — it holds every row of the column except the turn log / word
  list, of which the action row is one, and what they share is that none of
  them is the one squeezed when the column runs short. It earns its place because
  flex shrinking is negotiated between siblings: with it, `.infoCol` has two
  children and "the log gives" is structural; without it the rule would be
  `.infoCol > * { flex-shrink: 0 }` against `TurnLog`'s `flex: 1` at equal
  specificity, decided by module import order.

  **What this leaves owed, per game:** the row-level reservations the
  principle asks for, filed in each game's `todo.md`. (An earlier version of
  this entry said `SetupDisclosure` adds a margin of its own on top of the
  column gap; it does not — its `0.3rem` sits between the summary and the list
  INSIDE the disclosure.)

- ~~**A contract-slot guard, per MOUNT POINT.**~~ **Closed 2026-09-15, no
  change.** The shared `.hugRectWidth` reads `--cols` / `--max-tile-width` /
  `--grid-gap` and no `common/` file sets them, so a game that wears the class
  and forgets one gets an invalid `width` that the browser drops — the board
  then sizes itself. Joel: *"wouldn't it break the layout in any obvious
  way?"* It would, immediately, in the board being edited, and only when a new
  board first wears the class. The rule already names what a game owes it
  ("Each game supplies --cols / --max-tile-width / --grid-gap"). A guard would
  also be unsound: psychicnum fills `--cols` from an inline `style` on the
  parent element, so a CSS-only check reports it broken on day one.


## Someday

- ~~The global feedback slot `GamePage.tsx` holds inline is `feedback`'s
  concern.~~ **Closed 2026-09-15: the redesign happened and left it here.**
  That area closed blessed on 2026-09-12 and its `todo.md` is empty, so there
  is nothing left to wait on — and `useFeedbackSlot`'s docstring now states
  this arrangement as the rule: "a page calls `useFeedbackSlot('global')` for
  the one in its header and hands it down as `ctx.globalFeedbackSlot`."
  `ClubPage` does the identical thing, so `GamePage` is one of two pages
  following it rather than an exception to anything.
- ~~**The game page is the one page not wearing `.pageHeaderAndMainArea`.**~~
  **Closed 2026-09-15: it keeps its own wrapper (`.pageHeaderAndPlaySurface`,
  which was `.frame` until Joel renamed it the same day), on measurement.** It is
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

## Maybe
