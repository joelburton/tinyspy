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

### The grammar

```
--<bucket>-<thing>-<modifier>-<quality>
   outcome     lost      fill      color
   member      purple    dot       color
   tile        selected  border    width
```

**The bucket comes first, and it is load-bearing**: it makes a cross-bucket borrow
look wrong at the call site. `--chrome-destructive-color` in a button reads as
correct; `--outcome-lost-fill-color` in a button reads as a mistake — exactly the
error the audit found over and over. A leading `--color-` would bury the bucket in
the middle, where the eye skips it, and would sort every token under one useless
heading. Thing-first sorts and autocompletes the way you edit: everything about one
piece in one block.

**The quality always comes last, even for colors.** A closed set —
`-color`, `-width`, `-radius`, `-gap`, `-duration`, `-shadow` — so we don't grow
`-size` / `-thickness` / `-time` as synonyms. `-shadow` is in the set because a
shadow is a composite that *contains* a color rather than being one.

Stating the quality even when it's a color buys two things: nothing has an implicit
default you have to know, and `grep -- '-color:'` enumerates the whole palette,
which is what makes the census and the guard simple. It costs repeating the least
informative word about sixty times, which is a fair trade. The evidence that it
matters is already in the file: `--tile-border-width` sits beside
`--tile-selected-border`, which is a *color*, and only knowing tells you which is
which.

**Scales are the exception and stay quality-first.** `--radius-sm / -md / -lg` is
not a thing with qualities; the quality *is* the thing, and a future `--space-1/2/3`
would be the same. Stated so nobody "fixes" `--radius-md` into `--md-radius`.

### A fill that carries ink names its ink beside it

Not one global "white ink" token that assumes every fill can carry it — each fill
declares the ink that sits on it, one line apart in the same file. connections'
four rank bands become four fills and four inks (three of them dark, because the
pastels are light).

Two shared inks exist for the common cases — `--ink-on-dark-color` (white) and
`--ink-on-light-color` — and a fill points at one of them or names its own. What
this buys: the contrast audit becomes a loop over declared pairs instead of a hunt,
and it can be done by eye while playing, because the pair is always adjacent.

The rule it enables, which nothing enforces today: **a fill may carry white ink
only if it clears 3:1; otherwise it takes dark ink, and any exception is documented
in the token.** Only wordle's palette records its floors today — and it also
records a deliberate exception (its yellow sits at 2.57, because the gold that
reaches 3.0 stops reading as Wordle's yellow). Everything else is assumed.

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

**`outcome-*` — how a move or a game went.** Five families, **all five variants on
each**, even where a cell has no consumer yet.

That reservation is only for outcomes — gamelist, chrome, view, member and gamemode
are single values, which is what makes the grid affordable. And the reason to pick
an unused value *now* rather than when something needs it is not tidiness: a family
picked all at once is picked by one formula, where a `warning-terminal-frame`
chosen alone in two years would be reasoned about differently from the three we
pick together this week. Unused cells are marked **reserved — do not delete**, and
one policy line in `src/cssTokens.test.ts` covers them all rather than an entry per
token.

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
| `--gamelist-won-color` / `-lost-color` / `-neutral-color` | how a finished game went |
| `--gamelist-unplayed-color` | nobody here has played this puzzle |
| `--gamelist-suspended-color` | non-current and non-terminal: we'll come back to it |
| `--gamelist-current-color` | a club member is viewing this right now |

**The two state words come from [states.md](states.md), not from us.** It defines
*current* ("at least one club member is viewing its GamePage right now", at most one
per club, backed by `is_current_view`) and *suspended* ("just a description for a
non-current, non-terminal game" — already the CSS class name `.openFlagSuspended`).
It also contains this: *"Convention: don't use `'active'` as a play_state value.
'Active' overloads view-state and play-state — using it for play_state invites the
confusion this whole vocabulary exists to prevent."* The token is called
`--color-outcome-active-border`. So this rename doesn't just tidy a name, it fixes a
violation of a rule we wrote down and then broke in the palette.

*Shelved* is deliberately not used here even though it's in the codebase: it's the
**verb** (`sendSuspend` "shelves the game"; connections' new-game confirm "says
shelved, not ended") and *suspended* is the resulting state. You shelve a game and
it becomes suspended — a distinction worth keeping rather than collapsing.

This folds in what was previously a separate "flags" bucket plus a documented
exception for the crossword picker. There is no exception now: the picker is a
game list.

**`chrome-*` — controls.** Their own names even where a hex matches an outcome's,
because the two answer different questions and must move independently. **They are
coincidentally equal, not kept in lockstep** — `--chrome-caution-color` may well be
darkened for use as an icon and a border without `outcome-warning` moving at all.

**Colour and treatment are separate axes, and only colour is a token.** A button is
*filled* or *outline* — that is a class — and the tone says what kind of action it
is. They compose 3 × 2, and the grid isn't hypothetical: strands already ships a
filled caution (its ready-to-use Hint), and a filled destructive is easy to imagine
("the thing you should do here is delete"). Which is why there is no
`--chrome-primary-color`: "primary" describes the *treatment*, and calling Restart
or New game "primary" would be wrong in exactly the way this sweep exists to fix.

| token | for |
|---|---|
| `--chrome-action-color` | an action you can take — Submit (filled), Restart / New game (outline) |
| `--chrome-caution-color` | Hint, Spoiler, AI suggest, Pass — consequential, not destructive |
| `--chrome-destructive-color` | Reveal, End game, Concede, Delete — irreversible |
| `--chrome-fault-color` | fault messages: the system failed. Same value as destructive, own name |
| `--chrome-cursor-color` | where the keyboard is pointing in a list or a button set |
| `--chrome-disabled-opacity` | how far a disabled control fades |

Each of the three tones also carries **`-hover-color`** and **`-ink-color`**:

- **`-hover-color` is "this tone, one step more committed"**, and the treatment
  decides where it lands: the background on a filled button, the border + text (and
  the icon, via `currentColor`) on an outline one. Two tokens per tone would need a
  reason to differ and there isn't one — if a darker blue is right as a fill, it is
  right as an edge. An outline button takes the shared `--page-surface-hover-color`
  wash *as well*, and needs both: the gray alone reads as the button getting duller
  rather than more engaged, which is exactly what it does today.
- **`-ink-color` is read only by the filled treatment** (an outline button's text is
  the tone itself, on the page). It exists because "filled buttons have white text"
  was an assumption nobody had checked.

`--chrome-cursor-color` takes no hover — a cursor is moved, not hovered. And
**disabled stays an effect rather than three more colours**: the filled and outline
forms degrade identically under opacity (2.04 vs 2.00 at today's 0.5), so per-tone
disabled values would solve one problem twice and rot the day a base is tuned. It
gets a *name* because it is currently a magic number in three places with one
undocumented departure — strands uses 0.8, having judged 0.5 as reading "switched
off" rather than "not yet", which may well be a global problem it noticed first.

**The ink measurements.** Label contrast on each filled tone:

| filled tone | white ink | dark ink |
|---|---|---|
| action `#1976d2` | **4.60** ✓ | 3.78 |
| action, hovered `#1565c0` | 5.75 | 3.03 |
| caution `#ef6c00` | **3.08** ✗ | 5.65 |
| caution, hovered `#c05600` | 4.59 | 3.79 |
| destructive `#8e1b2e` | **8.95** ✓ | 1.94 |

strands' filled Hint carries white at 3.08 — under the 4.5 floor for a label, and
nobody chose it; it fell out of the assumption. **Decision: white stays for now**,
and the thing to revisit is the orange itself — an orange that can carry white ink,
rather than an orange with dark ink on it. The token is where that question now
lives, in the way of whoever next touches it.

**The hover-direction rule.** The ink is picked for the resting fill but has to hold
on the hover fill too, so a filled tone's hover must move in the direction that is
safe for its ink: darker for white, lighter for dark. All three darken today, which
is correct while all three carry white. If caution ever takes dark ink, its hover
has to flip with it — and if it can't, the resting fill was the wrong colour.

**`view-*` — what you are looking at.** `--view-history-color` (blue) and
`--view-share-preview-color` (yellow). They wear the *same frame* as a finished
board, so a frame's color comes from either an outcome's `-terminal-frame` or from
these — one mark, two sources, no conflict.

**`member-*` — player identity.** Eight hues, each with the uses it is put to:
`--member-purple-dot-color`, `--member-purple-border-color`, and (when chat text
needs it) `--member-purple-ink-color`. The hue sits in the *thing* slot and the use
in the *modifier* slot, so the grammar stays one grammar and the tokens sort by
member — which is the unit you tune, since the question is "does purple work as a
dot, as a border, as text?". That splitting is not hypothetical: the eight
`-border` values are hand-tuned per hue today precisely because a formula couldn't
do it, and chat ink may well need a darker purple than the dot does.

**`gamemode-*` — coop vs compete.** `--gamemode-coop-ink-color` /
`--gamemode-compete-ink-color`, deliberately outside the outcome palette so a mode
pill never reads as a result. Named `gamemode`, not `mode`, because "mode" already
means three things here (dark mode, colorblind mode, coop/compete).

**`mark-*` — the board feedback vocabulary.** The dims, the attention wash, the
flash durations, the peer ring's geometry, the grid cursor: everything
[tile-feedback.md](tile-feedback.md) defines. It is a bucket for the same reason
the others are — these get borrowed otherwise.

**`page-*`, `control-*`, `tile-*`, `kbd-*`, `rank-*`** carry the rest: page
furniture, form-control chrome, the warm tile ramp, the on-screen keyboard, the
word-rank ladder. They are already effectively buckets; this only regularizes their
spelling.

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

### Collapsing a lookalike onto a shared token needs CERTAINTY, not a hex match

The sweep will keep finding colors that are the same as — or within a hair of — an
existing token, used in the same place and the same way: a gray in a turn log, a
tile background on a verdict. Collapsing those onto the shared token is the whole
point of the exercise, **and it is also how you silently change a game nobody is
looking at yet.**

So the bar is certainty, not similarity:

- **Collapse only when you are 100% sure** — the value matches, *and* the role
  matches, *and* the game's own docs or comments don't claim a reason for it being
  its own thing.
- **Otherwise do not "fix" it.** Log it in the per-game register below, leave the
  color exactly as it is (named, per the magic-number rule, but unmoved), and let
  the decision happen when that game is converted and on screen. A wrong collapse
  is worse than a delayed one: it is invisible until someone plays that game and
  notices a color they can no longer explain.

The register is the deliverable of the census, and it is deliberately per game
rather than one long list, because that is the unit the decisions get made in.

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

1. **The census — DONE 2026-08-17**, and its output is [the register](#the-register--what-the-census-found-per-game)
   above: 284 color declarations measured against the nearest shared token, with
   the five cross-cutting patterns pulled out of the per-game noise. The script is
   `scripts/color-census.py`, kept because re-running it after the sweep is the
   "did we get them all" check — the per-game lists should come back as brand
   colors and nothing else.
2. **Execute [the mapping](#the-mapping--every-token-in-commonthemecss)** once it
   is approved — tiers, buckets and the quality suffix in one pass, since they
   touch the same lines.
3. **Add the `var()` takes ONE argument rule** to the guard alongside the
   magic-number one. The main rule catches `background: var(--x, #hex)` (the
   property isn't a `--` definition) but would miss a fallback hiding *inside* a
   token definition, and neither defensible use of a fallback survives contact with
   a better form: a hex fallback drifts silently from the token it shadows, and an
   optional-override fallback is a default declaration written in the wrong place.
4. **Move every button off the outcome tokens** onto `chrome-*`, and delete the two
   dead button tones — and give the three tones their `-hover` and `-ink` pairs,
   which is where the filled-caution contrast question gets its home. Splitting
   `active` / `current` into `gamelist-suspended` / `gamelist-current` happens with
   the mapping above.
5. **Rename the turn log's outcome vocabulary** (`good | bad | partial | neutral`)
   to the family names, so the TypeScript and the CSS stop needing translation.
6. **Name the 95 unnamed colors**, each in the nearest right place: a common token
   if it is one, the game's `theme.css` if it is brand, and an allow-listed
   exception with a comment if the call belongs to that game's conversion. Where a
   fill is being named, **name its ink beside it**. Kill the `var(--x, #hex)`
   fallbacks while here — they already violate a documented rule.
7. **Normalize `rgba(0, 0, 0, 0.3)` to `rgb(0 0 0 / 30%)`** — two spellings for one
   thing, currently about half and half. Cosmetic, but it makes the guard's regex
   and every future diff simpler, and this is the one sweep where it is free.
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

## The register — what the census found, per game

Run 2026-08-17 over every stylesheet: **284 color declarations**, each measured
against the nearest common token in oklab (`SAME` ≈ indistinguishable, `near` ≈
close enough to ask the question). This is the input to the collapse rule above:
**nothing here is a to-do**. It is a list of questions, most of which get answered
when that game is converted and on screen.

### Cross-cutting first — five patterns, not sixteen decisions

These account for well over half of the unnamed colors, and each is one shared
token rather than a per-game call:

1. **`#fff` as ink on a colored fill** — ~15 sites across nine games (codenamesduet,
   connections, waffle, wordle, psychicnum, spellingbee, wordwheel, boggle,
   scrabble). One name; connections' verdict work already minted
   `--verdict-ink-on-dark` for exactly this and it should widen.
2. **Raw `rgba(0,0,0,…)` shadows** — ~20 sites. The tile ramp already has
   `--tile-shadow` / `--hover-shadow`; dialogs, panels, toasts, chat bubbles and
   floating menus each roll their own. A small shared elevation set covers them.
3. **Dialog scrims** — `rgba(0,0,0, .25–.45)` in CelebrationDialog, BlankPicker,
   NumberJumpDialog, FloatingPanel. One `--scrim`, and the variation between them
   is almost certainly accidental.
4. **`var(--x, #hex)` fallbacks** — GuessKeyboard's eight, plus Menu and
   InfoSwitchButton. Already forbidden by ui.md, and the keyboard's fallbacks are
   *byte-identical* to the tokens they shadow, so deleting them changes nothing.
5. **`#000` / `#333` / `#111` as structure** — crosswords' grid rules and blocks,
   psychicnum's and connections' tile borders. Black is a decision here (the
   selection border owns `--tile-selected-border`), so these need names before
   anyone can ask whether they're the same black.

### Per game

**codenamesduet** — the clearest "do not collapse". `--codenamesduet-agent` is
byte-identical to `outcome-won-ink`, and `-agent-key` to `outcome-won-fill`. They
are the *keycard vocabulary*, not outcomes ([ui.md → Two
vocabularies](ui.md#two-vocabularies)), and the identical hex is what makes this
tempting and wrong. Leave, and say so in the token's comment. Its `-neutral`,
`-assassin`, and the three `-text` variants are the same story.

**crosswords** — the biggest register (30), and mostly a self-contained design
system: `--crosswords-header-bg` / `-row-hover` / `-row-rule` land on top of
neutral-`wash`-ish grays, `-cursor` sits a hair off the old `active-border`,
`-clue-num` and `-pencil` are control grays (one is byte-identical to
`--color-control-text-2`). Plus `--crosswords-wrong` `#d33`, which means "you got
this wrong" and is not `outcome-lost` — the stray red we already knew about. All
of it waits for crosswords' conversion; the sweep only names the raw `#fff` /
`#000` / `#333` in `Grid.module.css`.

**scrabble** — the premium-square palette (`-tw` / `-dw` / `-tl` / `-dl`) is brand
and stays. Its `Board.module.css` carries five *unnamed* premium-square text colors
(`#6b8378`, `#7a3b34`, `#2c4f6b`) which need names in its `theme.css` at minimum.
`--scrabble-tile-selected` `#ffd24d` sits near `--color-attention`, which is worth
a question: is a selected rack tile *attention*, or its own thing?

**setgame** — three symbol colors plus a colorblind trio (the same names
redefined), `-leaving-bg` / `-arriving-bg` / `-held-veil` from its own in-flight
choreography. The arriving/leaving pair are the pre-vocabulary ancestors of
attention and the in-flight dim; they fold in **at setgame's conversion**, not
here.

**strands** — `--strands-missed` `#9e9aa7` and `--strands-hint-ring` `#8a8a94` are
UI grays wearing brand names (they would not change if strands' purple changed);
candidates for common, decided at its conversion. Its `--strands-active` /
`-active-ring` purples are genuinely brand.

**bananagrams** — its whole tile palette (`-tile-face` / `-tile-edge` / `-tile-ink`)
sits *near* the shared warm ramp without being it, and `--bananagrams-error`
`#d84a4a` is the second stray red. Its board also uses two raw greens
(`rgba(120,200,130,…)`) for drop targets — which the tile-feedback vocabulary will
want as the prospective-verdict colors, so leave them until then.

**wordwheel / spellingbee** — near-twins by design. `--spellingbee-accent` is
byte-identical to a shared rank fill, `--wordwheel-accent` is a red near
`--color-member-red`, and both have `-used` and `-edge` variants that look like the
`-edge` tier by another name. One decision covering both, at the first one's
conversion.

**boggle · letterboxed · wordiply** — one brand color each (`-board-bg`, `-accent`,
`-accent`), nothing to decide. letterboxed's connector gray, called out earlier as
"a UI color wearing a brand name", turns out not to be a token at all yet — it
comes from `--color-control-text-2` via `--letterboxed-ghost`, so it is already
shared and only wants a better name.

**stackdown** — no colors of its own at all: everything is shared tokens plus raw
shadows and one `rgba(0,0,0,.2)` border. Purely cross-cutting.

**connections · psychicnum · waffle · wordle** — converted, and clean apart from the
cross-cutting `#fff` ink and `#000` borders. wordle's two theme colors
(`--wordle-key-bg`, `--wordle-tile-border-filled`) are byte-identical to
`--color-surface-hover` and `--color-divider`; those are collapse candidates a
person should confirm, since a keyboard key's resting fill and a hovered surface
being the same colour today may well be a coincidence.

## The mapping — every token in `common/theme.css`

**Approve this before anything is renamed.** A rename is cheap to run and expensive
to redo, and the decisions only become visible with the whole list in front of you.
107 tokens today; the target adds the reserved outcome cells and the two shared
inks.

`NEW` = no value yet, picked during the sweep. `alias` = defined as `var(--other)`
because the two must move together. `copy` = same value today, deliberately
independent.

### outcome — 5 families × 5 variants

| new | from |
|---|---|
| `--outcome-won-ink-color` | `--color-outcome-won-strong` |
| `--outcome-won-fill-color` | `--color-outcome-won-border` |
| `--outcome-won-wash-color` | `--color-outcome-won-bg` |
| `--outcome-won-edge-color` | NEW (psychicnum's local `color-mix(fill 84%, black)`) |
| `--outcome-won-terminal-frame-color` | `--color-game-over-won`, taken a bit greener |
| `--outcome-lost-*` | same five, from `-lost-strong` / `-border` / `-bg`, NEW edge, `--color-game-over-lost` taken a bit redder |
| `--outcome-near-ink-color` | `--color-outcome-near-strong` |
| `--outcome-near-fill-color` | `--color-outcome-near-border` |
| `--outcome-near-wash-color` · `-edge-color` · `-terminal-frame-color` | NEW |
| `--outcome-warning-ink-color` | `--color-warning-strong` |
| `--outcome-warning-fill-color` | `--color-warning-border` |
| `--outcome-warning-wash-color` · `-edge-color` · `-terminal-frame-color` | NEW |
| `--outcome-neutral-ink-color` | `--color-outcome-neutral-strong` |
| `--outcome-neutral-fill-color` | `--color-outcome-neutral-border` |
| `--outcome-neutral-wash-color` | `--color-outcome-neutral-bg` |
| `--outcome-neutral-edge-color` | NEW |
| `--outcome-neutral-terminal-frame-color` | `--color-game-over` |

### gamelist — six values, no variants

| new | from |
|---|---|
| `--gamelist-won-color` | alias → `--outcome-won-fill-color` |
| `--gamelist-lost-color` | alias → `--outcome-lost-fill-color` |
| `--gamelist-neutral-color` | alias → `--outcome-neutral-fill-color` |
| `--gamelist-unplayed-color` | copy of `--color-outcome-neutral-bg` — a 4px stripe wants its own lightness |
| `--gamelist-suspended-color` | `--color-outcome-active-border` |
| `--gamelist-current-color` | `--color-outcome-current-border` |

**Deleted** (no consumer, and the concepts they named are gone):
`--color-outcome-active-bg`, `--color-outcome-active-strong`,
`--color-outcome-current-bg`, `--color-outcome-current-strong`.

### chrome — controls

| new | from |
|---|---|
| `--chrome-action-color` · `-hover-color` | `--color-accent` · `--color-accent-hover` |
| `--chrome-action-ink-color` | NEW — white (4.60 on the fill) |
| `--chrome-caution-color` | copy of `--color-warning-strong` — free to move without the outcome |
| `--chrome-caution-hover-color` | NEW — today strands computes it as `color-mix(… 85%, black)` |
| `--chrome-caution-ink-color` | NEW — white for now, at 3.08; the open question is a deeper orange, not darker ink |
| `--chrome-destructive-color` | copy of `--color-sys-error-red` — Reveal / End / Concede / Delete |
| `--chrome-destructive-hover-color` · `-ink-color` | NEW — darker red; white (8.95) |
| `--chrome-fault-color` | `--color-sys-error-red` — the system failed. Same value as destructive, its own name |
| `--chrome-cursor-color` | copy of `--color-accent` — the list/focus outlines, about half of that token's 54 uses |
| `--chrome-disabled-opacity` | the global `button:disabled { opacity: 0.5 }`, named |

### view · mark · ink

| new | from |
|---|---|
| `--view-history-color` | `--color-history-viewer` |
| `--view-share-preview-color` | `--color-share-preview` (copy of attention's value, deliberately independent) |
| `--mark-attention-color` | `--color-attention` |
| `--mark-attention-wash-color` | `--tile-attention` |
| `--mark-in-flight-dim-color` · `--mark-not-your-turn-dim-color` · `--mark-game-over-dim-color` | `--dim-*` |
| `--mark-attention-flash-duration` · `--mark-your-turn-flash-duration` | `--*-flash-duration` |
| `--mark-peer-ring-width` · `--mark-peer-ring-gap` | `--peer-ring-*` |
| `--mark-grid-cursor-color` | `--grid-cursor` |
| `--ink-on-dark-color` · `--ink-on-light-color` | `--verdict-ink-on-dark` / `-on-light`, widened past verdicts (nine games write raw `#fff` today) |

### page · control

| new | from |
|---|---|
| `--page-bg-color` · `--page-surface-color` · `--page-surface-border-color` · `--page-surface-hover-color` | `--color-bg` · `--color-surface` · `--color-surface-border` · `--color-surface-hover` |
| `--page-text-color` · `--page-text-muted-color` · `--page-divider-color` | `--color-text` · `--color-muted` · `--color-divider` |
| `--control-bg-color` · `--control-border-color` · `--control-border-strong-color` · `--control-text-muted-color` | `--color-control-bg` · `-border` · `-border-2` · `-text-2` |

`-2` suffixes go: they say "the second one", which is a fact about the order they
were written in.

### member · gamemode

| new | from |
|---|---|
| `--member-<hue>-dot-color` (×8) | `--color-member-<hue>` |
| `--member-<hue>-border-color` (×8) | `--color-member-<hue>-border` |
| `--gamemode-coop-ink-color` · `--gamemode-compete-ink-color` | `--color-mode-*-text` |

### tile · kbd · rank · wordle

| new | from |
|---|---|
| `--tile-1-color` … `--tile-5-color`, `--tile-1-edge-color` … `-5-edge-color` | `--tile-N` / `--tile-N-border` |
| `--tile-disabled-color` · `--tile-disabled-edge-color` | `--tile-disabled` / `-border` |
| `--tile-bg-color` · `--tile-border-color` · `--tile-ink-color` | `--tile-bg` · `--tile-border` · `--tile-text` |
| `--tile-selected-border-color` · `--tile-border-width` · `--tile-selected-border-width` | `--tile-selected-border` · `--tile-border-width` · `--tile-border-width-selected` |
| `--tile-shadow` · `--tile-hover-shadow` | `--tile-shadow` · `--hover-shadow` |
| `--kbd-key-border-color` · `--kbd-control-border-color` | `--kbd-*-border` |
| `--rank-fill-color` · `--rank-edge-color` | `--rank-fill` · `--rank-edge` |
| `--wordle-green-color` · `--wordle-yellow-color` · `--wordle-gray-color` · `--wordle-blank-color` | `--wordle-*` |
| `--wordle-green-edge-color` · `--wordle-yellow-edge-color` · `--wordle-gray-edge-color` | `--wordle-*-border` |

### unchanged

`--radius-sm/md/lg` (a scale — quality-first by the exception above),
`--icon-button-size`, `--entrybox-font-size`, `--page-padding-x/y`,
`--game-chrome-height`, `--game-header-bottom`. All already state their quality.

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
- **Two rules, not one.** (a) no color literal or expression outside a `--`
  definition; (b) **`var()` takes exactly one argument** — no fallbacks, anywhere,
  including inside a token definition where rule (a) can't see them. ui.md already
  forbids fallbacks; this is what makes it true.
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
- **`-terminal-frame` for `near` and `warning`** — reserved by policy, and nothing
  will read them for a while. Pick them anyway, at the same sitting as won and lost.
- **An orange that can carry white ink.** Filled caution is at 3.08 today. The fix
  we want is a deeper orange that clears the floor while still reading as orange and
  not as destructive's maroon — not dark ink on the current one. Try it during the
  eyeball pass, with `--chrome-caution-ink-color` as the fallback if no orange works.
- **Is `--chrome-disabled-opacity` right at 0.5?** It puts every disabled label at
  2.0:1. Conventionally exempt, but strands already moved to 0.8 in one place. One
  number, worth trying at 0.65 and 0.8 against real screens.
