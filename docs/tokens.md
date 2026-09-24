# Tokens

How the app names and picks its values: the color system, the vocabularies for
everything that is not a color, the typeface, and when a token is global or a
game's own. Read it before writing CSS that needs a value. The values
themselves are in the stylesheets — `common/themes/daylight.css` for themed
colors, `common/core-css/base.css` for the rest — each with its reason or
formula beside it; this is the system they follow.

## Themes

**A theme is almost entirely color.** Switching one shows the same pixels in
the same places, differing only in color. The layout is precise and hard to
change, and themes do not touch it: a radius, a width, a duration and a page
padding are the same under every theme, and live outside the theme files.

**A theme is one polarity**, and declares its chain — a mode file holding what
is true of every light (or dark) theme, then the theme itself. The loader loads
one chain and never layers a theme over a base, because a role a dark theme
forgot would then resolve to a plausible light value, which is worse than
resolving to nothing. Daylight ships; midnight is a spike behind
`?theme=midnight` ([plans/dark-mode.md](../plans/dark-mode.md)). How the files
are arranged is [`common/themes/doc.md`](../src/common/themes/doc.md) and
[`common/core-css/doc.md`](../src/common/core-css/doc.md).

**Light mode is the language.** In code, comments and conversation a hover
"dims down", even though a dark theme does the opposite; polarity-neutral
phrasing was confusing to read and to write. The token names stay role names
(`--page-text-strong-color` is "the most ink available against this page"), so
the sentence survives the flip.

**No `var()` fallbacks.** We own the whole custom-property namespace, so a
fallback cannot guard against a missing third-party token — it can only mask a
typo or a rename of our own, and it drifts silently from the real value. The
guard (`cssTokens.test.ts`) fails on an undefined `var()` instead.

## The color system

Every color has a **name**, and every name says which **bucket** it belongs to.

### The grammar

```
--<bucket>-<thing>-<modifier>-<quality>
   outcomes    lost      fill      color
   member      purple    dot       color
   tile        selected  border    width
```

- **The bucket comes first**, so a cross-bucket borrow looks wrong at the call
  site: `--outcomes-lost-fill-color` in a button reads as a mistake.
- **The quality comes last, even for colors**, from a closed set (`-color`,
  `-width`, `-radius`, `-gap`, `-duration`, `-shadow`). Nothing has an implicit
  default, and `grep -- '-color:'` lists the palette. Scales are the exception:
  `--radius-md`, where the quality *is* the thing. So are the z- layers:
  `--z-chat`, not `--z-index-chat`, because the token is the layer and not a
  value for a property (`base.css` → THE Z- LAYERS).
- **Hyphens separate different questions; camelCase joins words that answer
  one** (`--button-quiet-primary-hover-color`, but `terminalFrame`). Part count
  is not something to optimize.
- **A bucket that names a component is spelled as the code spells it**
  (`--pageHeader-height`, `--floatingPanel-titlebar-height`), so grepping the
  name lands on the file. A bucket naming a concept stays kebab (`--page-*`,
  `--tile-*`, `--<game>-*`).
- **A game's own tokens take the game's name as the bucket**, and one referenced
  from outside `src/<game>/` is an error.
- **Not every token is a decision.** A **contract slot** is a blank a game fills
  in (`--tile-bg-color`, `--grid-gap`); **local math** is arithmetic
  (`--cols`); **`--_localName`** is a value built up inside one file.
- **A value with one reader is not a token** — it stays a number in its class.
  If one component's value does earn a token, it carries that component's whole
  name: shortening it to look general is how a one-off acquires the appearance
  of a system.

### The buckets

| bucket | what it answers |
|---|---|
| `outcomes-*` | how a move or a game went — one family per outcome ([outcomes.md](outcomes.md)) |
| `pill-*` | the feedback pill's tones, which ARE the outcome families, aliased |
| `gamelist-*` | a game as an object in a list (club cards, pickers) |
| `button-*` | what kind of action a control offers — normal · success · destructive · caution · quiet — plus the slots a treatment reads |
| `chrome-*` | app furniture that isn't a button or a field: fault, cursor, caret, link, floating control |
| `toast-*`, `view-*`, `mark-*` | a toast's stripe; what you are looking at (history, share preview); what a surface wears temporarily to say something about itself |
| `member-*` | player identity, one per profile color. Related to nothing else — a green player is not the winning green. Exempt from theming |
| `flex-color-*` | two flexible colors that mean nothing, for a one-off need (the mode badges) so it doesn't mint a new color |
| `page-*`, `field-*` | the page's surfaces and text; the things you type into |
| `tile-*`, `kbd-*`, `rank-*` | the warm tile ramp, the on-screen keyboard, the rank ladder. The ramp has no semantic meaning; its numbers are its meaning |
| `wordle-*` | the letter-judgment palette, named for colors on purpose ("wordle green" is what people say). Exempt from theming |
| `shadow-*` | how high a floating surface sits: anchored · lifted · floating. Not a color, but a shadow can only darken, so it is a theme's |
| per-game | a game's **brand** colors, in its `theme.css`, and never one of the families above |

**Two backgrounds, everything else an exception.** `--page-bg-color` is the
`<body>` and nothing else; `--default-bg-color`, a step lighter, is what a
background is unless something says otherwise. **Two cursors**, independent:
the chrome one is the keyboard ring in lists and menus; the board one
(`--mark-gridCursor-color`) is the entry ring on a tile grid.

### A family is a complete grid

A family is a set of MEMBERS that each carry the same VARIANTS. The variant
list differs per bucket — a button never needs `piecefill`, an outcome never
needs a hover — but within one family every member has every variant,
**including cells nothing reads yet**. A family picked at one sitting is picked
by one formula; a cell derived alone later, beside the one use that needed it,
drifts out of family. **We reserve cells, not concepts**: filling a grid
completes a formula already chosen, while adding a member invents a meaning and
waits for a real use.

**Names are semantic, not colors.** `lost` and `destructive` are families;
neither is `red`. **Role names, not lightness names**, too: `-pale` would be
the darkest thing on screen the moment a dark theme lands.

The outcome variants:

| variant | for |
|---|---|
| `-base` | the anchor the family was designed from. Nothing paints it |
| `-fill` | filling a piece: a verdict tile, an event-log bar. What a player meets most |
| `-edge` | the border on a piece wearing `-fill`: quiet definition, barely darker |
| `-ink` | text and thin lines on a light ground; must stay recognizably its color when thin |
| `-wash` | a much lighter version of the same message |
| `-bar` | a status bar showing an outcome; `fill` today, named so it can differ |
| `-terminalFrame` | the band around a board that is no longer live — big, so less saturated |

**A decided piece takes `-fill`, not `-wash`**: the result palette at full
saturation, so it carries the same message as the game's other outcome signals.

### How a value gets picked

Each family has one chosen anchor, `-base`, a mid-tone. Every other cell
derives **from base, never from a sibling**, so each formula stays independent
and a family that needs a different step is visibly the exception. A value is
picked one of three ways: **chosen** (the base), **derived once** (a formula
run at authoring time, recorded as a hex beside its formula), or **derived by
the browser** (the formula is the value). **The formula is always written
beside the value** — a hex without its formula is stranded, and "change the
base and the rest follows" stops being true. Chosen and derived values sit
together in the theme, because a theme saying "ink is darker by this much" is a
theme making a decision.

What derives, and what does not:

- **Derives from base:**
  - `-fill` is base.
  - `-edge` is base mixed toward black in **sRGB** (84% base).
  - A button's hover and press are base darkened in **oklch lightness**, and its
    outline treatment's ink is a larger step down the same way.
  - The outline's hover and press are base mixed over the card in **oklab**, a
    little and then twice as much.
  - `-terminalFrame` is fixed oklch lightness and chroma at base's hue. Green is
    the exception, lifted because at that lightness it reads as black, and
    neutral is achromatic.
- **Chosen per member, with the step recorded as a comment:**
  - **`-ink`.** The step from fill to legible ink differs by hue — gold needs
    far more darkening than red for the same legibility, and cannot go dark
    without ceasing to be gold — so no one formula gives all of them.
  - **`-wash`.** The pale values come from a ramp whose hue rotates, so no single
    mix reproduces them.
  - **The member borders**, tuned by hand.
  - **The tile ramp.** Hue holds while chroma rises as it darkens — one material
    getting thicker, not a tint plus a darkening — so it is tuned, shade by
    shade.

The test between computed and chosen: does the value need to **track its source
automatically**, or to be **right per hue**? A small relative step computes
cleanly; legibility does not, because oklab equalizes lightness, not
legibility. A chosen value carries its reason in its comment.

**[`/palette`](../src/common/devtools/palette.ts) is how this holds.** It
renders every family, members × variants, for tuning side by side, and it reads
every token — so a reserved cell has a reader and the dead-token guard stays
strict everywhere else. Its data file spells every token out in full; a name
built from a template would stop guarding anything.

### Every color has a NAME

- **A color literal or expression appears only on a `--…:` line**, never at a
  use site — `color-mix()` included. `#fff` is not a primitive: white is a
  design decision. `transparent`, `currentColor` and `inherit` carry none.
- **A component module references a color, never holds one.** Values live in
  the theme (or the game's `theme.css` for brand). A component that declares
  its own `--x: #fff` has a slot with no name, and a second theme would miss it.
  Shadows are the exemption: geometry plus an alpha black.
- The guard catches a magic number; only a person catches a bad name.

### Alias when it's a dependency, copy when it's a coincidence

An **alias** is right when *the two differing would be a bug*: a game shown as
won on the club page and a game won on the board say the identical thing, so
`--gamelist-won-color` aliases the won fill — even though one is a stripe and
the other a tile. A **copy** is right when two messages merely agree today: the
fault red and the destructive-button red are different sentences.

**A copy keeps the same hex** — copying decouples the name, never invents a
shade. **The default is copy; an alias has to earn itself**, because a
forgotten copy is one grep away and a wrong alias silently moves something in a
part of the app you had no reason to open. "Uncertain" means uncertain about
the MESSAGE, not the value.

- **No cross-bucket borrowing.** A control does not use an outcome color;
  where hexes agree, alias or copy.
- **Collapsing a lookalike needs certainty, not a hex match**: the value
  matches, the role matches, and nothing claims a reason for it being its own.
  Otherwise leave it, and decide when that game is on screen.

### What's machine-checked

`src/guards/cssTokens.test.ts` fails on: a `var()` nothing defines; a defined
token nothing reads; a `button` / `outcomes` / `pill` family short a variant;
a button token saying "fill"; a color literal off a `--…:` line; a component
module holding a color; a `var()` with a color fallback. `palette.test.ts`
fails when a family stops being a rectangle.

## The non-color vocabularies

A short, closed list of values per kind of measurement, so a number in a rule
is a choice from a list rather than a fresh decision. The steps are in
`base.css`; the text grays are the one themed set.

| vocabulary | kind |
|---|---|
| `--spacer-*` | the space BETWEEN things — `gap` and `margin`, never padding. `-1` is the biggest |
| `--font-size-*`, `--font-size-packed` | the type ramp, plus one role size off it for text where vertical space is scarce |
| `--line-height-*` | line heights |
| the text grays (themed) | `--page-text-color` · `-muted` · `-label` · `-strong` |
| `--opacity-*` | numbered for now; wants role names once its kinds are clear |
| `--transition-duration-paint / -nudge / -travel` | a color settling · a piece answering the pointer by moving · something arriving or growing |
| `--letter-spacing-label / -display / -wide` | tracking |
| `--border-width-line / -line-thick / -frame` | a divider or field edge · "this box is a thing" · "something is happening to what's inside" |

**`font-weight` has no tokens**: CSS already names it, and a weight must be a
multiple of 100.

**Numbered when the number is the whole meaning, named when there are kinds.**
There is nothing about "2-ness" in `--font-size-2`, so the sizes are numbered;
a `--red-1` would push a real meaning ("the losing-move ink") out of view. The
test: can two members trade places and still be the same kind of thing, more or
less of it? `label` is a hair darker than `muted`, not lighter, because a label
is structure that must stay readable in small caps, not de-emphasized content.

**Tokens are for values with many readers.** A value with one reader stays a
number in its class. Board geometry and a game's tuned surfaces (its radii, its
dims) are outside the vocabularies.

### The a/b/c rule — a value that doesn't fit

A value outside the vocabulary is surfaced and decided, never kept because it
is already there: **(a)** add it to the vocabulary, as a level nobody had
named; **(b)** fit it to an existing level — the usual answer; **(c)** keep it
bespoke, with a reason written in the file. A value equal to a vocabulary
value is changed silently; a near-miss is looked at once, in context. The rule
is Joel's: *"there is no such thing as 6 bespoke values."*

## The typeface

**Roboto Flex, self-hosted, one variable file.** The point is not that the
system font is bad: `system-ui` is three faces with three sets of metrics, so
nobody on Windows or Android had seen the app as designed.

- **Width is the dial that decided it.** A whole word on a fixed-width tile can
  get narrower instead of smaller, which matters most on a phone. **Grade** is
  ink without width, so text can darken with nothing moving.
- **Self-hosted**, from the app's own origin, with `font-display: swap` and a
  preload.
- **Digits are tabular by default**, so scores and timers are width-stable with
  no CSS.
- **Anything that measures text to fit it waits for `document.fonts.ready`**,
  or it fits the fallback face and goes stale on a cold cache.
- **The subset is Latin plus a few arrows and relations.** A symbol outside it
  is decided by the area that wants it (the a/b/c rule for characters): a
  standalone mark becomes a Lucide icon, while a glyph inside a sentence (`⌥Z`
  in a key hint) needs a small design decision per site. The subset is built by
  `scripts/subset-font.py`.

## Two vocabularies — global and per-game

A token or class is either about the **frame** or about a **game**, and the two
don't mix.

- **Global** — concepts about the frame: outcomes, errors, the chrome. They are
  global because consistency is the point: a player shouldn't relearn what a
  win looks like per game.
- **Per-game** — concepts from a game's own rules (codenamesduet's agent and
  assassin, connections' four difficulty colors), namespaced in that game's
  `theme.css`, and **not collapsed** even when two games have something that
  feels "positive".

**The promotion rule.** A per-game token becomes global only when **both** two
or more games already use it **and** it would be wrong or confusing for them to
differ. "Both happen to use green" doesn't qualify; "both are showing the player
they won" does. Promoting later is easy; demoting a global token is hard,
because consumers everywhere depend on it.
