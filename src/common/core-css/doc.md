# core-css

The stylesheets every page loads and none owns: the browser defaults we
overrule, every shared value that is not a themed color, a few global classes
that adjust rather than name, and one file per named pattern under `patterns/`.
If a color is not here, it is a theme's; if a look is not here, it belongs to
the component that wears it.

## Intro to area

Every game and the shell around them are meant to look like one app, and the
way to get that is to make most visual decisions exactly once. The app
splits those decisions in two: what stays the same under every theme, and what
a theme decides. A theme is almost entirely color — switching one shows the
same pixels in the same places — so a radius, a distance, a duration, a shadow
and the page's geometry are fixed for every theme, and this folder is where
they are fixed. The themes next door answer only "what color is each role".

The first job is the element layer, in `base.css`: the handful of browser
defaults that have to be overruled before anything else is sane. Everything
sizes border-box, the page paints its own ground and never scrolls, the four
heading levels each mean something and are sized accordingly, and the bare
`<button>` is neutral. That last one matters more than it sounds. Most buttons
in a game app are not buttons in the chrome sense — a board tile, a list row, a
chat bubble, a menu item — and if the element carried a fill and a border,
every one of them would have to start by canceling it. So chrome is something
a class opts into, and the element itself only takes the page's font, the hand
cursor and a radius.

The second job is the shared values, and the idea behind them is the
vocabulary: a short, closed list of the values a surface may write for one
kind of measurement, so that a number in a rule is a choice from a list rather
than a fresh decision nobody will remember making. Spacers, font sizes, line
heights, opacities, durations, letter spacings and border widths are each a
vocabulary, and they are not applied in a sweep — a surface converts when its
area is audited, and a guard holds the list of what has not converted yet.
Depth lives here too, though a shadow carries an alpha black and looks like a
color: what a shadow says is "this object stands off its ground", and that
sentence is the same in daylight and midnight. The z- layers are here for the
same reason, named for what they are rather than numbered, because their
failure mode is a menu painting behind a scrim rather than a drift nobody
notices.

`fixed.css` holds the colors that are exempt from theming, loaded once and
outside the theme chain: the eight member identity colors, which relate to
nothing else in the app, and the wordle judgment fills, which everyone arrives
already knowing. They are pictures the app owns rather than roles a theme
fills in. That is a statement about the chain, not the future; a dark page
would still want its own version of both.

Then the classes. `utilities.css` keeps only adjustments that name nothing —
`.muted` says "quieter than its neighbor" and nothing more — and the set stays
small because everything in it is unscoped. A class that names a thing goes
where it can be found by that name: `patterns/` when the thing has no
component of its own (the badge, the empty state, the focus ring, the page's
bound, a heading carrying a control), and the component's own module when it
has one — which is where the segmented choice lives. Each pattern is one file, because a file per pattern is
easy to merge later and one long file has to be read through.

All of this loads statically from `main.tsx`, before the theme, which is a
runtime choice and so arrives by dynamic import. The order between this
folder and the theme does not matter — a `var()` resolves when it is read,
and the two declare disjoint tokens — but the order within the folder does:
`utilities.css` is last so a class here can out-rank an element rule in
`base.css` at equal specificity.

## Details

- **Where a value goes.** A themed color: `themes/`. A color no theme may
  touch: `fixed.css`. A token that is not a color: `base.css`. A game's brand
  color: that game's `theme.css`. A value with one reader may be a token too,
  named for its component (`--toast-stripe-width`). The rules for all of this
  are [docs/tokens.md](../../../docs/tokens.md), which owns the color system
  and the non-color vocabularies; this folder is where the non-color half
  lives.
- **Two page-height numbers, on purpose.** `--game-chrome-height` is the
  total lump a play surface subtracts from the viewport, written as one
  number; `--game-header-bottom` is where the header's rule actually sits,
  composed from tokens because the body padding changes at the phone
  breakpoint. Using the first as a `top` overshoots by the padding and gap
  below the header.
- **A disabled control fades; a game piece never does.** The fade is one
  opacity, `--chrome-disabled-opacity`, on the element itself, and it is an
  effect rather than a per-family color. What tells you a control is dead is
  the missing hover, so the color only has to be different enough to spot.
  A game piece shows what happened to it instead.
- **The font is one variable file** — Roboto Flex, subset by
  `scripts/subset-font.py` — with width as the dial that earned it, so a word
  can fit a fixed tile without shrinking. Anything that measures text to fit
  it waits for `document.fonts.ready`, since measuring the fallback face fits
  to the wrong metrics. There is no italic; write `font-style: oblique`.
- **Browser printing is refused.** `@media print` blanks the page and points
  at the game menu's "Print board (PDF)"; the app is a live surface that
  does not reduce to paper.
- **The guards.** `guards/vocabularies.test.ts` is the shrinking list of
  literals not yet converted, and fails from both sides. `guards/cssTokens.test.ts`
  fails on a `var()` nothing defines and on a token nothing reads, with a
  declared-ahead list for the vocabulary steps that are live before their
  first reader. Owed work is in `todo.md`.
