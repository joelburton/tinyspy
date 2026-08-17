# The color refinement — a PLAN, to be built and deleted

**This is a plan, not a description of the code.** Nothing in the "target" half of
it is true yet. When the work lands, the durable half — the buckets, the variants,
and the rules for using them — moves into [ui.md](ui.md) as a *Color system*
section and this file goes away.

**Sequencing: this runs NEXT, before the remaining twelve tile-feedback
conversions** (connections landed 2026-08-17 and is approved). That order was
argued and chosen:

- **Almost nothing in the sweep moves a pixel.** The tier and bucket renames are
  value-identical. The real visual changes land on the terminal frames (worn only
  by the four converted games), psychicnum's tile edges, the crossword picker's
  stripe, and strands' history ring — all small, all lookable-at in one sitting.
- **The names are what keep getting mis-picked**, and twelve conversions are still
  to come. Every one of them would otherwise be written against the old names and
  rewritten afterwards — twelve more chances to pick the wrong tier.
- **Conversions keep walking into palette questions**: stackdown and strands need
  the UI-problem color, scrabble and bananagrams need drop-target colors,
  letterboxed decides whether a wash may fill a piece. Settling the palette first
  turns each of those from a fork into a lookup.
- **Eyeballing rides along for free.** The colors need seeing in all sixteen games
  either way; folding that into each conversion means opening each game once, for
  a reason you were opening it anyway. Start by re-looking at the four already
  converted, which is where the visual changes actually are.

## Why this exists

The palette grew a family at a time, and nobody ever wrote down what the *tiers*
are for. Four consequences, all found by audit on 2026-08-17:

- **The tiers get mis-picked, repeatedly.** connections' verdict fill was written
  first with the pale tier (read as "a slightly different beige"), then with the
  darkest tier (much darker than the same verdict's own turn-log bar), before
  landing on the tier the bars use. psychicnum had made the same mistake earlier
  and been fixed. The rule existed — buried in a paragraph about psychicnum's
  decided tiles in ui.md — but not where anyone would look for it.
- **Names stopped matching meanings.** `active` marks a *suspended* game on the
  club card and a *live* one in the crossword picker; `current` — the actually-live
  one — has a single user; `neutral` exists twice under two names (the outcome
  family and the ended-game frame).
- **Chrome borrowed the game's colors.** Hint buttons, the delete-confirm pill and
  the fault red all reach into a palette that is about what happened in a game,
  which is what makes both halves impossible to change independently.
- **Colors get written with no name at all.** 95 declarations across 40 files set a
  color literal directly, so those values can't be discussed, reused, or themed.

And one payoff that arrives later but is worth the cost on its own: **a second
theme becomes finishable work.** Today nobody could say how many colors this app
has. After the sweep it is a number, and a dark theme is "produce a second value
for each of these names" — enumerable and reviewable — instead of a hunt through
forty stylesheets. It also removes the near-duplicates that would otherwise each
need converting: right now there are at least **five reds** (`lost-strong`
`#c62828`, `lost-border` `#ef5350`, `sys-error` `#8e1b2e`, crosswords' `#d33`,
bananagrams' `#d84a4a`) where two are decisions, and three grays inside one narrow
band.

## The naming scheme

Every color token is `--<bucket>-<family>[-<variant>]`, and **the bucket prefix is
load-bearing, not decoration**: it makes a cross-bucket borrow look wrong at the
call site. `--chrome-destructive` in a button reads as correct; `--outcome-lost-fill`
in a button reads as a mistake — which is exactly the error the audit found, over
and over. (The general page furniture — `--color-text`, `--color-surface`,
`--color-divider`, `--color-accent` — keeps its `--color-` prefix. Those aren't a
family; they're the page.)

### The five variants, named for their ROLE

| variant | what it is for |
|---|---|
| **`-ink`** | text, and thin lines on a light ground: a pill's border, a verdict word in the info column, an outline ring. Must stay recognizably ITS color when thin — not so dark it reads as black or as another family's ink |
| **`-fill`** | filling a piece: a verdict tile, a turn-log outcome bar. The tier a player meets most often |
| **`-edge`** | the border on a piece wearing `-fill`. Quiet definition, not a ring: barely darker than the fill it edges |
| **`-terminal-frame`** | the band around a board that is no longer a live position. Big areas: it must read as a band without shouting the outcome at full saturation |
| **`-wash`** | a pill's background, and anywhere wanting a much lighter version of the same message |

**Role names, not lightness names**, and the reason is the same one ui.md already
gives for semantic tokens: `-pale` becomes the *darkest* thing on screen the moment
a dark theme lands, so a lightness-based name is a lie exactly when you most need
to trust it. All five above still mean what they say in any theme. It also avoids
the "what do we call the one darker than very-dark" problem.

`-terminal-frame` is deliberately specific rather than `-frame`: someone will reach
for a name like `-frame` meaning "an everyday border". This one has a single job —
*this board is not a live position* — worn at terminal and by a player who is out
of a race while others play on.

### The buckets

**`outcome-*` — how a move or a game went.** Five families, all five variants
reserved on each even where a cell has no consumer yet; a complete grid is what
tells the next contributor "there is already a color for this" instead of minting
one (the `--tile-*` ramp's policy).

| family | means |
|---|---|
| **won** | you won the game · this was a good move · this gameplay was successful |
| **lost** | you lost the game · this was a terrible move · this gameplay wasn't good |
| **near** | you're very close to being right |
| **warning** | you've already played this move · you shouldn't play this move · you used a hint |
| **neutral** | this move was neutral (we can't adjudicate it) · the game ended naturally |

- **`warning` keeps its name**, acknowledged as the one family named for a tone of
  voice rather than a result. It is well understood in use.
- **`near` is not connections-only** — codenamesduet's turn log uses the same
  partial-outcome bar for a turn that hit an agent *and* a neutral.
- There is **no `outcome-unplayed`**: "nobody has played this" is never a thing a
  game surface says. It lives in `gamelist-*` below.

**`gamelist-*` — the state of a game as an object in a list.** The club page's
cards and the crossword picker's stripes, which are the same vocabulary and should
say so. Six values, no variants (they are 4px stripes and corner triangles):

| token | means |
|---|---|
| `--gamelist-won` / `-lost` / `-neutral` | how a finished game went |
| `--gamelist-unplayed` | nobody here has played this puzzle |
| `--gamelist-open` | still open, we'll come back to it (today's `active`) |
| `--gamelist-live` | this is THE one to join right now (today's `current`) |

This folds in what was previously a separate "flags" bucket plus a documented
exception for the crossword picker. There is no exception now: the picker is a
game list.

**`chrome-*` — controls.** Their own names even where a hex matches an outcome's,
because the two answer different questions and must move independently. **They are
coincidentally equal, not kept in lockstep** — `--chrome-caution` may well be
darkened for use as an icon and a border without `outcome-warning` moving at all.
No variants: chrome states itself with text, border and icon; we do not fill a
button with a lighter version of its own color.

| token | for |
|---|---|
| `--chrome-caution` | Hint, Spoiler, AI suggest, Pass — consequential, not destructive |
| `--chrome-destructive` | Reveal, End game, Concede, Delete — irreversible |
| `--chrome-fault` | fault messages: the system failed |

**`view-*` — what you are looking at.** `--view-history` (blue) and
`--view-share-preview` (yellow). They wear the *same frame* as a finished board, so
a frame's color comes from either an outcome's `-terminal-frame` or from these —
one mark, two sources, no conflict.

**Per-game brand colors** stay in that game's `theme.css`: wordle's letter colors,
codenamesduet's agent/neutral/assassin, connections' four ranks, setgame's card
colors. These are game vocabulary ([ui.md → Two vocabularies](ui.md#two-vocabularies))
and are **not** outcome colors. Derivations of them (a rank color's edge) are named
there too. The **wordle colors keep their name** even though waffle reads them and
they live in the shared theme: "wordle" now names both a game and the family of
colors that judge letters the way wordle does.

**Reserved, not yet designed: the UI problem.** Some boards must point at pieces to
say *this input can't work here* — stackdown and strands ring duplicate tiles
because a typed letter can't say which of two you meant. Nothing has been judged,
so it must not wear an outcome color (today both use the outcome red), and it must
never be a fill, since a filled tile reads as a verdict. Designed when stackdown or
strands converts; see
[tile-feedback.md → A UI PROBLEM is not a verdict](tile-feedback.md).

## The rules

### Every color has a NAME — the magic-number rule

**A color literal or a color expression may appear only in a custom-property
definition.** Never at a use site.

```css
/* yes */                          /* no */
--center-hex: #aabbcc;             div { background: #aabbcc }
div { background: var(--center-hex) }
```

This is "no magic numbers, make a named constant", and the analogy sharpens two
things:

- **The self-evident-value exception is much smaller here.** `0` and `1` don't need
  names in code; `#fff` and `#000` look like that exception and aren't — white is a
  design decision (the repo already distinguishes `--color-surface` from white ink),
  and crosswords' grid uses raw `#fff` / `#000` / `#333` for three separate
  decisions wearing the costume of primitives. The genuine exceptions carry no
  decision at all: `transparent`, `currentColor`, `inherit`.
- **"Used once, so inline is fine" doesn't apply.** A second theme needs a *place to
  intervene*, and a color with no name is a color no theme can reach, however few
  times it appears.

The rule covers **expressions too**: `color-mix(...)` at a use site is the same
problem wearing a function. Every derived color is a named token whose value happens
to be an expression.

It is necessary, not sufficient. `--crosswords-wrong: #d33` passes it cleanly and is
exactly the drift we found — the color equivalent of `const TWO = 2`. A machine can
catch a magic number; only a person catches a bad name. Which is why the sweep pairs
the guard below with a human question, asked per game: *brand, or a UI color that
belongs in common?*

### Hand-picked or computed — both named, and the choice has a test

The value on the right-hand side may be a hex or an expression. Neither is more
"derived" than the other; what matters is that changing it is a one-place edit. The
test: **does the value need to track its source automatically, or does it need to be
right per-hue?**

| case | which | why |
|---|---|---|
| a member color's ring | computed | the input is one of eight member colors; the eight ring values get eight names, and the component picks a name rather than doing math (which is how `colorBorderFor()` already works for `<Dot>`) |
| connections' band edge | computed | same shape, four rank tokens, named in connections' own theme.css |
| `-edge` | computed | a small relative step where perceptual error between hues is tiny, and computing it guarantees the edge follows if the fill is ever tuned — which is what you want from an edge |
| `-ink` | **hand-picked** | gold text on white needs far more darkening than red text to reach the same legibility, so one formula gives a gold that is still unreadable *and* a red gone muddy. `oklab` narrows the gap and doesn't close it: it equalizes lightness, not legibility |
| `-terminal-frame` | **hand-picked** | it darkens *and* desaturates by different amounts per hue, because a green band at 600px reads louder than a red one at the same numbers |

**Perception, not math**, and the repo already has the receipt: wordle's yellow
deliberately sits at 2.57 contrast rather than 3.0, because the gold that reaches
3.0 stops reading as Wordle's yellow. A hand-picked value **carries its reason in
the token's comment** — that is house style, and it is the difference between a
deliberate exception and an oversight.

### Alias when it's a dependency, copy when it's a coincidence

`--gamelist-won: var(--outcome-won-fill)` is right when *the two differing would be
a bug*. It is wrong when they merely match today — a 4px list stripe might well want
a lighter green than a tile fill, and then someone tunes the outcome and silently
moves the club page. Same test ui.md already applies to promoting a token, pointed
downward, and the comment says which was intended. There is a difference between a
dependency and a coincidence, and the code should enforce which one this is.

### No cross-bucket borrowing

A control does not use an outcome color; a game list does not use a chrome color.
Where the hexes agree, that is what aliasing (or copying) is for. The prefixes make
a violation visible in review without anyone having to remember the rule.

### Colors come from common; brand colors come from the game

After the sweep there should be very few colors defined inside a game at all, and
each one should be either a **brand color** (or a derivation of one) or a
deliberate, commented exception. A color that would still be the same if the game's
brand changed — letterboxed's gray connector line, strands' missed-letter gray — is
a UI color that belongs in common under a shared name.

### Geometry is out of scope

No sides, margins, paddings, radii, sizes or flow changes in this sweep. We are
leaning on eyeballing to catch regressions, and if a game looks subtly wrong the
answer has to be "a color moved", not "something moved and we don't know what".
Same reason the work below splits into two commits.

## Current state — the audit this plan is built on

Run 2026-08-17 across every game. Hexes as they stand today.

| family | strong (→ `-ink`) | border (→ `-fill`) | bg (→ `-wash`) |
|---|---|---|---|
| won | `#2e7d32` | `#66bb6a` | `#c8e6c9` |
| lost | `#c62828` | `#ef5350` | `#ffcdd2` |
| near | `#f9a825` | `#ffb74d` | — |
| warning | `#ef6c00` | `#ffa726` | — |
| active | `#f9a825` | `#fdd835` | `#fff9c4` |
| current | `#e65100` | `#fb8c00` | `#ffcc80` |
| neutral | `#616161` | `#bdbdbd` | `#f5f5f5` |

Off the grid: the terminal frames `#3c6b46` (won) / `#6b3c3c` (lost) / `#4d4d4d`
(ended); the system red `#8e1b2e`; the view pair `#4a7bab` (history) / `#ffd21a`
(share preview); the pill's tint, derived as the fill tier at 18% over the surface;
and two derived edges (psychicnum's decided tiles, connections' bands), both the
fill stepped ~16% toward black.

What the audit found, beyond the names:

- **`-strong` is the workhorse** (31 uses): every pill border, every board outline
  ring, verdict text, the strike marks, button tones.
- **`-border` is the fill tier** (16): turn-log bars, psychicnum's decided tiles,
  connections' history tints and verdict fills, strands' hint bar.
- **`-bg` is nearly dead** (5 uses, 3 places): the delete-confirm pill, letterboxed's
  already-used letter, the crossword picker's unplayed stripe.
- **`active-strong` has exactly one consumer, and it is a bug** — strands' history
  ring, gold, from when the viewer was yellow. Fixing it leaves the token unused.
- **Two button tones are declared and never called** (`success`, `near`), and they
  are among the few things pulling outcome tokens into chrome.
- **Two reds live outside the families**: crosswords' `#d33` and bananagrams'
  `#d84a4a`, both meaning "you got this wrong" on a game surface.
- **95 unnamed color declarations across 40 files.** Worst: `GuessKeyboard` (11),
  crosswords' `Grid` (9), bananagrams' `PlayerBoard` and scrabble's `Board` (7
  each), then a long tail. Eight of GuessKeyboard's are `var(--x, #hex)` fallbacks —
  which ui.md *already forbids*, and one of which was found masking a dead value
  during wordle's conversion. There is also a `rgba(40, 120, 255, 0.0)` in the
  shared PlayArea: a fully transparent blue, dead or a debugging leftover.

## The work

**Two commits, deliberately.** Everything value-identical first, so a regression
afterwards is attributable to the second commit rather than to 25 files of churn.

### Commit 1 — renames and moves, no pixels

1. **The census.** Every raw color in every stylesheet, bucketed into *brand* /
   *should be common* / *decide at that game's conversion*. It makes the rest
   mechanical and gives "done" a definition.
2. **Rename the tiers**: `-strong` → `-ink`, `-border` → `-fill`, `-bg` → `-wash`.
3. **Bucket-prefix everything**: `--color-outcome-*` → `--outcome-*`, and the rest
   into `gamelist-*` / `chrome-*` / `view-*`.
4. **Split `active` / `current` into `gamelist-open` / `gamelist-live`**, and drop
   their tiers that never had a consumer.
5. **Name the chrome colors** and move every button off the outcome tokens. Delete
   the two dead button tones.
6. **Rename the turn log's outcome vocabulary** (`good | bad | partial | neutral`)
   to the family names, so the TypeScript and the CSS stop needing translation.
7. **Name the 95 unnamed colors**, each in the nearest right place: a common token
   if it is one, the game's `theme.css` if it is brand, and an allow-listed
   exception with a comment if the call belongs to that game's conversion. Kill the
   `var(--x, #hex)` fallbacks while here — they already violate a documented rule.
8. **Add the guard** (below), with a planted violation to prove it fails.

### Commit 2 — the values that actually change

9. **Add `-terminal-frame` to every outcome family.** Move the three frames onto
   won / lost / neutral, taking the won and lost values **a bit more green and red**
   than today's `#3c6b46` / `#6b3c3c`, which sit close to gray.
10. **Add `-edge` to every outcome family**, and move psychicnum's decided tiles
    onto it.
11. **Add `gamelist-unplayed`** and move the crossword picker's never-played stripe
    onto it.
12. **Fix strands' history ring** to `--view-history`.
13. **De-special-case the delete-confirm button**: text and border in
    `--chrome-destructive` like every other destructive control, no filled
    background.

### Then

14. **Eyeball**, starting with the four converted games (which is where the visual
    changes are), then each remaining game as its conversion comes up.
15. **Write the ui.md section** — the buckets, the five variants, and the rules
    above — moving the rule currently buried in ui.md's tile-ramp paragraph into it
    and leaving a pointer. Then delete this file.

**Deferred by design:** the two stray reds (crosswords, bananagrams) and any other
bespoke game color whose fate needs that game's context. The sweep *names* them and
marks them — in the guard's allow-list and in a code comment — so the decision is
in the way of the next person to touch that game, rather than in a doc they won't
read.

## The guard

A test that fails when a **color literal or color expression appears outside a
custom-property definition**, anywhere in `src/**/*.css`. Same shape as
`src/cssTokens.test.ts`, which already fails when a `var(--x)` names a token nobody
defines.

- Check **declarations, not lines** — values legitimately wrap (the peer ring's
  `color-mix` spans two).
- Catch `#rgb` / `#rrggbb` / `#rrggbbaa`, `rgb()` / `rgba()`, `hsl()`, `oklch()`,
  and `color-mix()`.
- Don't trip on `transparent`, `currentColor`, `inherit`, or `%23` inside SVG
  data-URIs.
- **Plant a violation first** and watch it fail: a guard nobody has seen fail is a
  guard that might be matching nothing.
- **Its allow-list is the deferred list, and it is executable** — an entry reads
  "decide at crosswords' conversion", and the next person to touch crosswords has to
  look at it.

Enforced floor: the rule above. Audit preference, not machine-checked: colors live
in a `theme.css`, and one sitting in a component module wants a reason.

## Open questions

- **Exact values for `-terminal-frame`**, once the frames are on it and the four
  converted games can be seen side by side.
- **May a `-wash` fill a game piece?** letterboxed does it today for an
  already-used letter, and it is the only piece wearing one. Decided when
  letterboxed converts; the likely answer is yes — a way to tint a tile with a very
  subtle outcome color.
- **Which cells genuinely need filling?** Some reserved variants may never have a
  consumer. Reserve them anyway, and let the vocabulary-completeness exception list
  in `src/cssTokens.test.ts` carry the ones with no reader.
