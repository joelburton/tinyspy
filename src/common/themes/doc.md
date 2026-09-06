# themes

Every themed color in the app, written as a grid of roles that each theme
answers in full, and the loader that picks one theme's chain and has it in
place before the first paint. Daylight is what ships; midnight is a spike
behind `?theme=midnight`.

## Design

A theme is almost entirely color. Switching one shows the same pixels in the
same places, differing only in what color each thing is — the layout, the
spacing, the shadows and the durations are fixed in `core-css/` for every
theme. So a theme file is one thing: the complete answer to "what color is
each role", and nothing else.

The roles are organized into buckets by what they answer — the page's own
surfaces and text, the fields you type into, what kind of action a button
offers, how a move or a game went, the warm ramp every game's tiles converge
on, and so on — and within a bucket, into families. A family is a set of
members that each carry the same set of variants: every button family has its
filled color, its hover, its press, its ink, its outline; every outcome family
has its ink, its fill, its edge, its wash, its bar and its terminal frame.
Every cell is written, including the ones nothing reads yet, because a family
picked at one sitting is picked by one formula, and a value chosen alone two
years later beside the one button that needed it drifts out of family. Each
family has one anchor, `base`, that nothing paints and everything derives
from, and the formula is written beside every derived value — in the cell when
the browser computes it, in the comment when it was computed once and
recorded as a hex. A hand-picked value carries its reason instead. The palette
page reads every cell, which is what lets the dead-token guard stay strict
everywhere else.

A theme is one polarity, and it declares its own chain: a mode file that
holds what is true of every light theme or every dark one, then the theme
itself. The mode files are nearly empty, and that is a finding rather than a
placeholder — almost everything that felt like "light mode" turned out to be a
value, which is the theme's job. What is left is `color-scheme`, which is
also what keeps a phone browser from auto-darkening a page on top of us. The
loader loads one chain and never layers a theme over another, because a role
midnight forgot would then resolve to a plausible light value on a dark page,
which is worse than resolving to nothing.

The house language is light mode's. In code, comments and conversation a
hover "dims down", even though a dark theme does the opposite, because
polarity-neutral phrasing was confusing to read and to write. Midnight
therefore translates once, in its own formulas, and each flipped formula says
so; nobody translates while reading daylight. What midnight proved is that
the shape of the system survives the flip — the same families, the same
cells, most of the same formulas — while a few things are genuinely a
per-theme judgment: the page is lifted off black so a shadow has room to say
anything, ink and wash run the other way, and a dark red that means "serious"
on white has to lighten toward the salmon daylight rejected. The record of
that spike, and what a real dark mode would still cost, is
[plans/dark-mode.md](../../../plans/dark-mode.md).

Two rules govern how tokens relate. Names are semantic — `lost` and
`destructive` are families, neither is `red` — so a second theme does not turn
every name into a lie. And a token aliases another only when the two
differing would be a bug; where two messages merely agree today they are two
names on one copied hex, because a wrong alias silently moves something you
were not looking at while a forgotten copy is one grep away.

## Details

- **`docs/ui.md` owns the rules** — the color system, the buckets, how a
  value gets picked, alias versus copy, what is machine-checked. This folder
  is where those rules are answered, one role at a time, and the comments in
  `daylight.css` are the working record of each choice.
- **The wordle fills are not here; the wordle ink is.** The fills are
  exempt from theming (`core-css/fixed.css`) because everyone knows that
  green. The ink has to move with the theme, because on the keyboard it is
  what separates an untried key from a tried one, and that contrast has the
  page as its other half.
- **`--default-bg-color` is what a background is unless something says
  otherwise**, a step lighter than `--page-bg-color`, which is the `<body>`
  and nothing else. Every other background is a named exception.
- **Two outcome families are anchored provisionally.** `noted` and `error`
  arrived with one shipping value each, at ink weight, so their fills are as
  dark as their inks; re-anchoring them at a mid-tone is the color pass's
  agenda in `todo.md`, with the rest of the near-collisions parked there.
- **Print never flips.** `--print-ink-color` keeps daylight's value in every
  theme, because paper is paper.
- **`loadTheme.ts`** reads `?theme=` before React exists, imports that
  theme's chain, and is awaited in `main.tsx` so the first render is not one
  frame of undefined tokens. It is audited with the boot files.
- **The guard.** `guards/cssTokens.test.ts` fails on a `var()` nothing
  defines, on a defined token nothing reads, on a family short one of its
  variants, and on a `var()` with a color fallback — a fallback can only mask
  one of our own bugs.
