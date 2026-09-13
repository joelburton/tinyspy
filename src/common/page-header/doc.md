# page-header

The top strip every page carries (`PageHeader`) and the marks in it: the menu
trigger (`PageHeaderMenu`), the icon-only header mark every other control is
built on (`PageHeaderButton`), the chat and scratchpad toggles, and the status
slot that shows the players strip until the page's global feedback slot has a
message to draw instead. It is no one page's, which is why it lives here
rather than under home, club or game.

## Intro to area

The header is furniture, not content. Home, club and game all wear the same
strip — a menu trigger hard against the page's top-left, a thin rule beneath,
and whatever that page needs on the line — and it is one component with two
slots that always render, even when the right one is empty. That is a
structural decision rather than a stylistic one: three pages each assembling
the same skeleton by hand is how the three drifted apart before, and a page
that wants something new on the right adds a child instead of restructuring a
header.

Its height is a contract, and the strip never grows. The number is composed
from the logo's size plus the menu trigger's padding, because that trigger is
the tallest thing on the line, and a second file composes from the same token
to place the mobile info sheet exactly under the rule. So the strip is fixed
at that height and every child that varies caps itself — the feedback pill
does not wrap, the players strip ellipsizes, the marks are fixed — and a
child that overflows is fixed at the child. Letting the strip give would move
the sheet by exactly the growth, and clipping the strip would hide the open
menu, whose popover hangs inside it.

Every control on the strip except the menu is one kind of thing: an icon-only
mark with no border and no fill, a soft background on hover, and a look that
belongs to the header alone — its stylesheet is a module, so nothing else can
wear it by borrowing a class name. A mark says four things, and each has its
own channel so none of them is the background twice over: the glyph's fill
says who wrote to you, a border says the panel it toggles is open, the
background says hovered or pressed, and dimming says inert. It also declines
focus on mousedown, which is not optional here: the games that read keystrokes
off the window would otherwise lose the next letter typed after a click.

The status slot is the one cell whose contents change. By default it is the
roster — each player's name in plain ink behind a disc in their color, because
the disc is what carries identity everywhere else in the app and a colored
name would only compete with it. On the club page the disc is also a presence
light, hollow when the member is away. While the page's global feedback slot
holds a message, the pill takes the cell instead; that costs the roster, which
is why the header is reserved for news about other people and never for what
you did yourself. Which messages earn it is the feedback folder's rule; this
folder only draws whichever of the two the page needs, in a cell whose height
the header already fixes.

The spacing between marks is a base and not the separation you see. Each mark
carries its own hover padding as part of its look, so the visible distance
between two of them is the gap plus both paddings, and it differs per pair on
purpose — the two panel bubbles on a game page sit closest. That is why the
gap is a bespoke number rather than a ramp step, and why the numbers inside
the strip are too: a row of identity marks tuned by eye against the disc.

A mark is an action surface where it can be. The scratchpad mark binds its
action, so the mark, its bubble and the menu row a game places for the same
thing all say the same words and carry the same key; the chat mark shows the
app-root chat action for the same reason, and only differs in that it toggles
where the key does not.

## Details

- **The height token** is `--pageHeader-height` in base.css, `logo + 2 ×
  0.25rem`, and `--game-header-bottom` composes from it. The strip is
  `content-box` so that composition adds the padding and the rule to a content
  height rather than a total.
- **The strip ellipsizes because it is a block.** `text-overflow` does nothing
  for flex items, so the players strip is a block container with inline-level
  entries and a margin between them; a flex row clipped a long roster mid-name
  with no sign.
- **The chat mark decides its own fill.** `chat/chatUnread.ts` publishes two
  facts — how many are unread, and the latest sender's palette-color *name* —
  because resolving a sender needs the club roster, which only chat has. Turning
  that into a paint is the mark's: a named sender fills the glyph with their
  color, and a sender the roster cannot name goes muted rather than taking
  `colorVarFor`'s body-ink fallback, because this fill claims to name someone
  and with nobody to name it should stop claiming.
- **The unread count is black, never a player hue**, so it cannot read as a
  sender; it is a lozenge (`--radius-round`) that widens for two digits, at the
  app's smallest type, and its sizes are its own by decision.
- **Hover text is `data-tooltip`**, drawn by the tooltip host, on the marks
  and on the club strip's "In the club" / "Away" alike — never the native
  `title`, which some browsers delay past noticing.
- **The `?` key finds the menu through `pageMenuStore`**: `PageHeaderMenu`
  registers its handle while mounted and releases it on unmount. The game page
  alone passes `returnFocusOnClose`, because a focused trigger over a board
  that reads window keydowns would swallow them.
- **On a phone the roster drops to dots**, and the game header splits its
  contents across the board page and the info page; the header itself is the
  same strip on both (docs/mobile.md).
- `ChatButton` shows the app-root `act-open-chat` through `useAppAction` (its
  bubble names the key via `nameWithKey`); `ScratchpadButton` binds
  `act-open-scratchpad` itself.
