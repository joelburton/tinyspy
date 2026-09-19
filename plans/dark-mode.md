# Dark mode

**NOT SCHEDULED.** This records what a spike proved, so the decision to build it
can be made later on evidence rather than re-derived.

The spike ran on 2026-08-20/21 as step 4 of [app-audit.md](app-audit.md),
whose question was narrow: *does the file split that sprint built hold up when
something other than the light theme asks it to?* It does. It is kept behind a
flag rather than deleted, because a second theme is the only instrument that
finds a whole class of bug, and it found several.

**Reach it with `?theme=midnight`.** The choice sticks in localStorage so it
survives navigating into a game; `?theme=daylight` clears it. There is no UI, on
purpose.

---

## 1. What was proved

**The architecture supports a dark theme.** All 161 roles daylight defines are
answered by midnight, one chain loads, and no token resolves to nothing. Every
family kept its SHAPE — only values and directions changed.

- **`edge` survived untouched.** The fill taken 84% toward black still reads as
  an edge on a dark board. Same formula, same space, no exception.
- **The button families derived identically**, with the sign flipped: hover and
  the outline's ink step UP rather than down, and the ink on a filled button goes
  near-black rather than white.
- **`wash` mixes toward the card**, so it is genuinely darker in midnight and the
  role name still fits. That is the argument for role names over lightness names,
  proven rather than asserted.
- **`ink` fails to derive in BOTH themes, for mirrored reasons.** Gold cannot go
  dark in daylight and cannot go light in midnight, so the family constrained at
  one end is constrained at the other by a different amount. The same finding
  twice is much stronger than having it once.
- **The treatment slots are byte-identical in both themes**, which is the correct
  outcome: a slot is a contract, not a decision.
- **`--ink-onDark-color` / `--ink-onLight-color` are unchanged too.** A role named
  for the ground it sits on is a role a theme has nothing to say about.
- **`--print-ink-color` is the one role that must NOT flip.** Paper is paper.

What a spike cannot prove is that the theme will be GOOD. It proves nothing
structural blocks it, and that what remains is color work.

## 2. What it cost to get there

Three changes the light theme needed anyway, all of which shipped:

- **The page background was never painted.** `--page-bg-color` existed, was
  documented, and was read by two components — so what sat behind every screen
  was the USER AGENT's canvas. Invisible in light mode, where that canvas is
  white and the token is `#fafafa`. Fixed; daylight's page moved `#ffffff` →
  `#fafafa`, the ground the cards were always designed for.
- **The judged letter ink had to become themeable.** On the keyboard the ink is
  what separates an UNTRIED key from a TRIED one — black on the pale cap, white
  on any judgment — and the untried cap follows the PAGE. Pin the judged ink to
  white and a dark page loses the distinction entirely. Three cells, one per
  kind, per theme.
- **The pill needed an `ink` cell.** Added for its own reasons the same morning,
  and it paid for itself immediately: it reads `--page-text-color`, so every pill
  flipped to light-on-dark with no further edit.

## 3. The depth problem — the one thing not solved

**⚠️ THE CEILING.** A shadow can only DARKEN what is under it, so the ground's own
lightness is the most a shadow can ever say:

| | L\* | step a 30% black makes | ceiling (shadow → pure black) |
|---|---:|---:|---:|
| daylight `#fafafa` | 98 | 26 | 98 |
| `#121212` | 5.5 | 1.9 | 5.5 |
| a slate `#1a1f2b` | 11.8 | 4.6 | 11.8 |
| the lifted slate `#262e3f` | 18.9 | 6.2 | 18.9 |
| a tan board ground `#776951` | 50 | 15 | 50 |

So **tuning the shadow's alpha is not a fix and never was.** Below about L\* 15
the cue is not available at any alpha. Three answers, and what we learned about
each:

**a. Lift the page off near-black — DONE, and worth it on its own.** There is no
law that dark mode means black; Solarized, Dracula and Nord are all hued, and
`#121212` is one convention rather than the convention. Going to `#262e3f` roughly
triples the shadow's room and reads as a considered surface rather than an
absence. It does not solve depth by itself.

**b. Give boards a ground — TRIED, then REJECTED as the general answer.** At
`#776951`, one rung above the tile ramp, the stackdown tile shadow went from a
step of 5 to 33 out of 255. It works. But **"floating board" is a real design
intent for several games**, and forcing a ground on all of them is an ugly
compromise sixteen times over. It stays available per game where the board wants
a surface anyway; it is not the general solution. Two things it taught:

- a ground must sit OUTSIDE the range of the pieces standing on it. Set to shade
  1 it collided with stackdown's exposed tile, which is also shade 1, and the top
  of a stack came out flush with its board.
- a ground makes the shadow's ALPHA a theme's business — matching daylight's
  perceptual step on a tan ground needs roughly double it.

**c. Dim-up on hover — NOT TRIED, and the most likely answer.** A veil that
lightens the hovered piece a little. It is not motion, so it survives
`prefers-reduced-motion`; it does not care what the background is; and it costs
nothing on a light page if a theme sets it to zero.

**And the rule already permits it.** [tile-feedback.md](tile-feedback.md) allows a
hover dim-up on packed boards, on the grounds that it is *"not saying inactive:
it is momentary, it tracks the pointer, and hover carries no meaning anyway…
case by case, only where the shadow demonstrably doesn't read."* A dark page is
that case, now measured rather than eyeballed. So this is the existing exception
with a trigger we can evaluate numerically, not a new rule.

The cost is small and real: tile-feedback frees the background *"for state and
attention, which have nowhere else to go"*, and a veil spends a little of it. A
low-alpha overlay that tracks the pointer and vanishes is about the least that
channel can be spent on.

### CHROME is not stuck — and it shows exactly where the pieces are

Everything above is about GAME PIECES. The chrome that floats — panels, menus,
popovers, toasts — has the same ceiling over it and gets out from under it, for a
reason worth naming because it is precisely what a tile lacks.

The numbers, for the three-rung altitude ladder that now carries chrome's depth
(`daylight.css` → SHADOW: anchored · lifted · floating):

| | ground | step the daylight 12% makes |
|---|---|---|
| daylight | `#fafafa`, L\* 98 | 10.2 L\* |
| midnight | `#262e3f`, L\* 18.9 | 2.9 L\* |

Matching daylight's step on this page takes roughly **45%** — about three and a
half times the ink. **And there is room for it**: 18.9 of ceiling against a cue
that needs about 10. At Material's `#121212` there would have been 5.5 and no
alpha would have reached it, so the lifted page from **a** is what keeps the
shadow cue alive for chrome even though it could not save the pieces.

**The escape a tile doesn't have: a panel's surface color is free.** Midnight
already sets the surface 5.3 L\* above the page (`#2f394c` on `#262e3f`), so part
of the altitude is carried before any shadow draws, and the dark-UI convention —
higher surface means lighter surface — can carry the rest. A tile cannot do this:
its fill is spoken for by the game's ramp, where **the numbers ARE the meaning**
(stackdown reads stack depth off them), so the shadow is the only channel it has
left. That is the whole difference between chrome and a piece here, and it is why
**b** and **c** exist at all.

So chrome has two candidate answers — heavier ink, or lighter surfaces per rung —
and the fork is not settled. `midnight.css` → SHADOW carries trial alphas (that
3.5× measurement, trimmed for the surface step) marked as guesses nobody has
looked at on a screen; they are there so the role is answered and the themes stay
in step, not because they are right. **Cheap to settle once the theme is real**:
put the three rungs on a dark page together and see whether ink alone reads.

One piece of chrome is not covered and belongs with **b** rather than here:
`--shadow-boardFloat` (the Shuffle button) is still theme-blind in `base.css`
alongside the two tile shadows, because it sits on a game's ground rather than on
the page — so its answer is per game, like every other ground question.

### ⚠️ Reduced motion + dark mode = no hover cue at all, today

The shared rule drops the lift under `prefers-reduced-motion` and keeps the
shadow, on the stated grounds that *"neither movement was carrying a message on
its own — hover's is the deepened shadow."* That is true on white and false on a
dark page, where the shadow is exactly the half that cannot carry. Whatever else
happens, this hole has to be closed before a dark theme ships.

Related and unresolved: **does hover lift at all?** Three sources disagree and one
disagrees with itself — see the UNRESOLVED block in
[tile-feedback.md](tile-feedback.md).

## 4. What is left, if we build it

All of it is color work, not structural work.

- **Values picked against the wrong context.** Most of midnight was written
  against an L\* 5.5 page and the page is now 18.9. `--page-text-color` at
  `#e8eaee` gives 11.3:1 where it gave 13.7 — fine by the numbers, different by
  feel, and representative of the rest.
- **The neutral grays**, which were chosen before the page had a hue and mostly
  still read as neutral against a slate.
- **`--button-destructive-*`.** Daylight's destructive is a DARK red, which is how
  it says "serious". A dark red on a dark page is invisible, so midnight lightens
  it — and a light red is exactly the salmon daylight rejected for looking
  friendly. The tone loses gravity in the flip and no formula fixes it; it is a
  per-theme judgment.
- **The tile ramp**, twelve values picked in one sitting and never eyeballed.
- **The family questions that move pixels**, each measured 2026-08-20
  ([`docs/ui.md` → What derives, measured](../docs/ui.md#what-derives-measured))
  and each a conversation rather than a formula: `near` and `warning` fills sit
  3.9° of hue apart, so the two names barely read as two; `warning` spans 21°
  between its ink and its fill; `lost`'s and `near`'s washes are off-hue
  Material 100s, and a wash frozen as a hex is the tier most likely to be wrong
  on a dark page; the eight member borders were hand-tuned and a dark set is
  eight fresh judgments, or a derivation off the dot that has yet to be found;
  and whether the grid cursor's amber derives from anything (blue's does not
  need to — it is the focus ring — and yellow's matches no operation the other
  roles use).
- **Assets**: 17 game logos carry baked color, and the wordmark and favicon carry
  near-whites that fail on a dark page (app-audit step 11). What a theme may do
  to each is §7 below.
- **`<meta name="color-scheme">` in index.html** says light and would need to
  agree with whatever ships.

## 5. The cost is keeping it, not building it

From the day a second theme ships, every new game and every new surface answers
two themes forever. The parity guard makes "forgot a role" impossible; nothing
makes "answered it badly" impossible — a role can be present, wrong, and
invisible until someone opens that page in that theme. Which is exactly how
stackdown's tiles were transparent for a day.

The instrument for that is **the palette page's theme toggle**
(app-audit step 3), which now has something to toggle to. Both themes' families
side by side, with the formula under each cell, is how "answered it badly"
becomes something you catch in one screen rather than one game at a time. **Build
that before converting anything else.**

## 6. What ships today, and what to delete

Behind the flag, and green under every guard:

```
src/common/themes/dark-mode.css   what is true of every dark theme (one line)
src/common/themes/midnight.css    the complete role → hex grid
src/common/themes/loadTheme.ts    picks ONE chain and imports it
```

`loadTheme` stamps the theme's name on `<html>`, which is what makes a
theme-scoped rule possible without loading two themes at once. That is worth
keeping in mind generally.

**Written fast, to test dark mode, and not carefully considered** — delete with
the spike, or supersede when stackdown takes its real tile-feedback pass:

- `src/stackdown/theme.css` — the `--stackdown-tile-hover-shadow` token and the
  `html[data-theme='midnight']` override that maxes both shadows to 100% black.
- `src/stackdown/components/Board.module.css` — the hover rule. Its old blue
  border was a CONTROL color on a game piece, which is its own small bug and
  worth fixing whatever happens here.

Two guards exist because of this spike and should outlive it either way: **the
themes are in step** (every theme answers exactly the same roles, both
directions) and **the tile ramp descends 1 → 5 in every theme**. Both were
verified by planting the bug they exist to catch.

## 7. Brand — what a theme may move, and the assets

Design from the 2026-08 CSS conversations, kept here because a second theme is
the first thing that needs it. Nothing below has been built.

### The ladder

Does a cupcake theme turn spellingbee's hexes pink? The answer is a ladder, and
the rung is decided by **whether the color carries information the player
brought with them**:

| | example | may a theme move it? |
|---|---|---|
| **imported semantics** | wordle's green / yellow | no — the color IS the rule |
| **recognition** | spellingbee's center yellow | hue locked, shade free |
| **decoration** | letterboxed's green | freely |

> **The test: would a returning player MISREAD the board, have to LOOK TWICE to
> be sure they were in the right game, or merely NOTICE it looked different?**

- **Level 1 is not brand at all.** wordle's green belongs with the outcome
  colors: it is the semantic layer speaking a foreign vocabulary, and changing
  it breaks comprehension, not recognition. That is why `wordle-*` sits in
  `fixed.css`, exempt from theming, beside the member colors.
- **A color can be locked by the game's NAME rather than by memory.** A bee is
  yellow; spellingbee's center wants a gold even for a player who never saw the
  NYT version. Expect this wherever a brand names an animal or an object.
- **The rungs apply per DIMENSION, not per color.** letterboxed's hue is
  arbitrary but its convention — filled = last letter, border = current —
  carries the meaning, so it is decoration on hue and imported semantics on
  which step gets which role. A theme may move the hue and must not touch the
  assignments.
- **"Same hue, tweak the shade" is not always enough.** wordle's gray IS "not
  in the word", but on a dark page the absent tile and the page converge and
  absent tiles stop reading as tiles. NYT makes them darker than the page plus
  a border: the tile's relationship to the page inverts. What is locked is the
  relationship, not the value.
- **A bespoke per-theme brand color lives in the game's own file, one line per
  theme** (`:root { --spellingbee-gold: <honey> }` /
  `:root[data-theme="midnight"] { --spellingbee-gold: <bumblebee> }`), never
  as a per-game line in every theme file — that would be common knowing about
  spellingbee, and adding a game would mean editing every theme. Before
  accepting that a color is bespoke, look once: spellingbee's accent was
  byte-identical to a shared rank fill.

### The assets

**Some of the app's color is not in CSS at all**, and no guard can see it: 17
game `logo.svg` files with baked color literals, plus the wordmark and the "P".
Count DISTINCT colors before estimating any of them — `codenamesduet/logo.svg`
has 754 literals and five colors, 749 of them one purple across 747 paths, so
retheming it is one fill rule, not an art project.

**The technical fact that decides feasibility per icon:** an SVG loaded through
`<img>` or `background-image` cannot see the page's custom properties; only an
inlined SVG can. So "the gold follows the theme" is a property of how a logo
is MOUNTED, not of the file, and tokenizing one means inlining it. That sorts
the work by rung rather than by file:

| rung | example | fix |
|---|---|---|
| 1, locked | wordle's tiles | transparent background; `<img>` is fine, nothing to theme |
| 2, hue-locked | spellingbee's gold | inline + a token fill |
| 3, free | the arbitrary-hue brands | inline + a reference to the palette |

A fourth option, cheapest where it fits: **a mark that survives both
polarities** — avoid near-white and near-black and let shape carry the
identity. It does not always fit; wordle's icon is tiles on white.

**The wordmark** (`PuzpuzpuzWordmark`, a PNG whose ground is opaque near-white
and whose docstring says the PNG is the master) looked like the hardest asset
and is not: a decorative, singular hero lockup carrying no state is the one
class of asset where **one version per theme is the right answer rather than a
failure** — cupcake's exclamation marks as unicorn horns. "Themes change color,
not structure" governs the system; a lockup is not part of the system. Leaning
into the sticker, one wordmark reading as a sticker on a dark page, stays
available as the cheap answer. The "P" (`favicon.svg` / `puzpuzpuz.svg`, the
same 13 values) fails on a dark page at its two near-whites, not its purples.
The six rasters in `public/` are out of scope: the OS renders them against a
home screen we will never know, so they need to be robust, not themed.

**A theme recipe is source, and the SVG is the build output.** For a rung-2
logo, write down what the artwork IS in terms that outlive any theme —
constraints, not the drawing: *"the bee is ink-on-transparent; the field takes
the game's accent; the border must contrast with the page."* A recipe
recording geometry goes stale the first time someone nudges a wing. It lives in
that game's `doc.md`, and it pays off only for recognition assets; a pure
decoration is a fresh creative act per theme and a recipe would constrain the
fun.
