# Mobile

How the app works on a phone and a tablet: the posture, the device model, what
input a game needs, the rules every screen keeps, and how a game page becomes
two pages. The detail lives where the code is — each section points there.

**Desktop-first, always.** Most players are on a laptop, so the desktop layout
is the default and mobile is an override layered on top: a `@media (--mobile)`
block under the rule it changes, never a mobile-first rewrite with `min-width`
queries. A mobile change must not move the desktop layout. And the aim is
**graceful, not pixel-perfect**: a screen that is usable and never scrolls on a
phone, not a bespoke mobile design for every component.

## Naming the device classes

A device is a point in a 2-D space, not a rung on a width ladder: a landscape
phone (~844×390) and a portrait tablet (~768×1024) are about as wide as each
other and opposite in shape. So a condition combines **width**, **shape**
(orientation or height) and **pointer**. Stylesheets write three names:

| condition | means | what it decides |
|---|---|---|
| `--mobile` | narrower than 56.25rem (900px): phones and portrait tablets | the layout folds — two columns become one, and the info column becomes a page |
| `--phone` | the tightest devices in either orientation | phone-tight tweaks: page padding, a button dropping its label, a name dropping to its dot |
| `--touch` | a coarse pointer, at any width | touch behavior: no dragging, the text-field floor, tap targets |

The names are `@custom-media` declarations in
[`breakpoints.css`](../src/common/mobile/breakpoints.css), injected into every
stylesheet by PostCSS; three have JavaScript copies (`useIsMobile`,
`useIsPhone`, `useIsCoarsePointer`) for the rare difference that changes what
React renders. How they are built, why a CSS variable can't do it, and the specs
that keep each hook matching its stylesheet are
[src/common/mobile/doc.md](../src/common/mobile/doc.md)'s. **Prefer the CSS
rule to the hook** wherever the difference is only visual: a rule and a hook are
two reads of one threshold and can disagree across a resize.

## Input is the primary axis

**What input a game needs on a touch device predicts whether it works there
better than screen size does.**

- **Prefer tap.** Most moves that are typed on a desktop can be expressed as
  taps — pick a tile, tap a letter, trace a path — so on touch they need no
  keyboard at all.
- **A transient OS keyboard is acceptable** when the moment of typing is short,
  like codenamesduet's clue. Where it covers the board, the page may scroll
  while the keyboard is up; shrinking the board to fit above it read worse.
- **Never build touch-drag.** Dragging is a mouse affordance. A drag is turned
  off on a coarse pointer where a tap does the same move (waffle's swap); a game
  whose move fundamentally needs drag or typing is **keyboard-required** or
  **desktop-only**.
- **Keyboard-required games are not gated.** A tablet with a keyboard attached
  looks exactly like a bare phone to the browser, so they get the phone layout
  and a bare phone simply can't enter moves. **A desktop-only game is blocked**
  on every coarse pointer with the shared
  [`<DeviceBlockNotice>`](../src/common/game-page/DeviceBlockNotice.tsx), so
  nobody limps through a broken experience.

### Where each game plays

Each game's class — tap-only, transient keyboard, keyboard-required,
desktop-only — is [features.md → Mobile suitability](features.md#mobile-suitability).

## The rules every screen keeps

- **The page never scrolls** ([ui.md → Page-height fits the
  viewport](ui.md#page-height-fits-the-viewport)), and on a phone the usual way
  it breaks is **sideways**: a wide row, a fixed two-column body, or a long
  unbreakable token. Check it in a real browser at a phone width — jsdom has no
  layout.
- **`100svh`, not `100vh`**, in every full-height calc. On mobile Safari `100vh`
  is the height with the toolbar hidden, and a page that never scrolls never
  hides it; `svh` is the visible box. It equals `vh` on desktop.
- **A media query is for layout *shape*, not for running out of room.** A rule
  about fitting the height a board has left belongs at every width: a desktop
  window can be as short as a phone (a laptop at 200% scaling is). Every game's
  `--avail-h` is set at every width, and the mobile blocks only add to it.
- **A board sized from a height budget subtracts everything that shares the
  column** — the below-board row, the mobile status bar and its gap, and the
  board's own frame if it has one (strands' `--board-frame`). Desktop has slack
  to hide a missed term; a phone doesn't.
- **Text fields are at least 16px on touch.** A smaller focused field makes iOS
  zoom the page, and it never zooms back. `base.css` floors `input, textarea`
  at `max(16px, 1em)`; a class that sets a field's own font-size outranks that
  rule and carries its own floor beside it. A `<button>` never triggers the
  zoom — a bigger button on touch is tap-target sizing, a different thing.
- **Anything tappable gets the tap treatment:** no browser tap highlight, a
  designed press, and `touch-action: manipulation` so double-tap doesn't zoom
  and taps don't wait. On an SVG board `touch-action` goes on the `<svg>` root:
  on an SVG child it is silently ignored.
  [`tap-targets.e2e.ts`](../e2e/tap-targets.e2e.ts) checks the real tap targets,
  and a new tapped board joins its list.
- **`:hover` on anything tappable belongs inside `@media (hover: hover)`.** A
  touchscreen keeps `:hover` on the last element tapped, so a hover style sits
  there after every move looking like state. Most boards don't gate it yet
  ([common/core-css/todo.md](../src/common/core-css/todo.md)).
- **Long user strings are bounded twice**: handles and club names are capped in
  SQL, and the surfaces that show them carry `overflow-wrap: anywhere`, because
  a short token with no break opportunity still pushes a phone page sideways.
- **The page is light only.** `color-scheme: only light` stops a phone
  browser's auto-dark from inverting colors one at a time by lightness, which
  wrecks the palette's contrast pairs
  ([src/common/themes/doc.md](../src/common/themes/doc.md)).

## A game page on a phone

### The info-sheet recipe

Below `--mobile` a game page is **two full-screen pages**: the board fills the
screen, and the info column becomes a second page. One switch button, pinned to
the right edge of the header, moves between them, and the header stays put
across both, each page keeping the controls you need while looking at it.

A game joins by composing three things — `useInfoSheet()`, `<InfoSheet>` around
its `<InfoCol>`, and `shared.mobileFill` on its layout — with no CSS of its own.
What stays the game's is its board's own mobile sizing. The pieces, the header
split and the reasons are
[src/common/info-sheet/doc.md](../src/common/info-sheet/doc.md)'s.

### The mobile status bar — core state above the board

Moving the info column off the board takes its live readout with it, so
`<MobileStatusBar>` puts that one line back above the board, below `--mobile`
only. **A game adopts it when its core state is invisible once the column
slides away** — a per-game judgment: a board that already shows its own state
needs none. How to feed it and size it is info-sheet's doc.

Whose turn it is goes the same way: the turn line is behind the sheet, so a
turn-order game shows "Waiting for ● Name…" in the below-board slot while it
isn't your turn ([src/common/feedback/doc.md](../src/common/feedback/doc.md)).

### Tight rows

A below-board row that doesn't fit a phone gives way in the same few ways:
buttons go icon-only (`show={useIsPhone() ? 'icon' : 'both'}`), a label
shortens where something else already says it, and a text that won't fit lowers
its font floor under `@media (--phone)`. Each rule sits beside the one it
changes.

## Other surfaces

- **Panels on touch** are pinned in place (a drag handle on touch swallowed the
  close button's tap), and on a phone they fill the screen; the chat sheet sizes
  itself to the visible viewport so the OS keyboard never covers its input
  ([src/common/floating-panels/doc.md](../src/common/floating-panels/doc.md)).
- **The club page uses tabs, not a sheet**: its two columns are equals, both
  lists you choose from, so neither becomes an aside
  ([src/common/club/doc.md](../src/common/club/doc.md)).
- **A name drops to its dot.** The header's player strip shows dots only below
  `--mobile`, and a feedback pill's actor loses the name on a phone; the dot
  already carries the identity
  ([src/common/members/doc.md](../src/common/members/doc.md)).
- **The card pages** (home, login, claim-username) wrap long tokens and tighten
  their padding ([`utilities.css`](../src/common/core-css/utilities.css) → `.card`).

## Verifying

Layout is checked in a real browser, never jsdom: each converted game has a
`<game>-mobile.e2e.ts` at a tall and a short phone viewport, and
`page-no-scroll.e2e.ts`, `tap-targets.e2e.ts` and `panels-touch.e2e.ts` cover
the shared rules. What headless Playwright can't reproduce — the safe-area
insets on a notched phone, iOS's gesture heuristics — is owed as an on-device
check in the app-wide [todo.md](../todo.md).
