# The color refinement — a PLAN, to be built and deleted

**This is a plan, not a description of the code.** Nothing in the "target" half
of it is true yet. When the work lands, the durable half (the families, the
variants, the rules for using them) moves into [ui.md](ui.md) as an *Outcome
palette* section and this file goes away.

**Sequencing: this happens AFTER connections' tile-feedback conversion is
approved** ([tile-feedback.md](tile-feedback.md) → Roster). connections is
mid-flight on the current token names, and renaming underneath an unapproved
visual change makes it impossible to tell whether something looks wrong because
of the conversion or because of the palette.

## Why this exists

The outcome palette grew a family at a time, and nobody ever wrote down what the
*tiers* are for. Three consequences, all of them found by audit on 2026-08-17:

- **The tiers get mis-picked, repeatedly.** connections' verdict fill was
  written first with the pale tier (read as "a slightly different beige"), then
  with the darkest tier (much darker than the same verdict's turn-log bar), before
  landing on the tier the bars actually use. psychicnum had made the same mistake
  earlier and been fixed. The rule existed — buried in a paragraph about
  psychicnum's decided tiles in ui.md — but not where anyone would look for it.
- **Names stopped matching meanings.** `active` marks a *suspended* game on the
  club card and a *live* one in the crossword picker; `current` — the actually-live
  one — has a single user; `neutral` exists twice under two names (the outcome
  family and the ended-game frame).
- **Chrome borrowed the game's colors.** Hint buttons, the delete-confirm pill and
  the fault red all reach into a palette that is supposed to be about what happened
  in a game, which is what makes both halves impossible to change independently.

## The target model

### Variants — five, reserved on every outcome family

Every outcome family carries all five, whether or not each has a consumer today.
A complete grid is what tells the next contributor "there is already a color for
this" instead of minting one (the same policy the `--tile-*` ramp follows).

| variant | what it is for |
|---|---|
| **`-very-dark`** | the terminal frame around a finished board. Big areas: it must read as a band without shouting the outcome at full saturation |
| **`-dark`** | text, and thin lines on a light ground — the pill's border, a verdict word in the info column. Must stay recognizably ITS color when thin: not so dark it reads as black or as another family's `-dark` |
| **`-fill`** | filling a piece — a verdict tile, a turn-log outcome bar. The tier a player meets most often |
| **`-edge`** | the border on a piece filled with `-fill`. Quiet definition, not a ring: barely darker than the fill it edges |
| **`-pale`** | a terminal pill's background, and any place wanting a much lighter version of the same message |

**Why there is no "faded" variant for a temporary verdict.** A verdict wears the
same color whether it is permanent or transient. Two reasons: color matching is
doing real work (a player learns one red), and **the outcome palette is a
gradient** — red, orange, gold sit close together by hue, so lightening any of
them walks it toward its neighbour and a "faded red" reads as an orange. That is
not a weaker version of the message, it is a different message. Temporary and
permanent are separated by lifetime, not by shade.

**Why `-edge` is its own variant rather than `-dark` doing double duty.** They
pull opposite ways: text on white has to be dark enough to read at one pixel of
stroke, while an edge on a mid-tone fill has to be *barely* darker than what it
edges or it reads as a ring around the tile rather than as the tile's own
boundary. psychicnum found this the hard way and says so in its stylesheet —
*"deliberately NOT the outcome family's `-strong` tone, which is four steps down
and reads as a harsh ring rather than as an edge."* Today it derives its edge
locally instead; under this plan the derivation (if it stays a derivation at all)
moves into the global file behind a name, because a value computed in a game's
CSS is a value that can drift from the one next door.

**Open:** whether `-edge` is hand-picked per family or mechanically derived from
`-fill`. It makes no difference to the consumers, which is why it can be settled
later.

### Outcome families — six

| family | means |
|---|---|
| **won** | you won the game · this was a good move · this gameplay was successful |
| **lost** | you lost the game · this was a terrible move · this gameplay wasn't good |
| **near** | you're very close to being right |
| **warning** | you've already played this move · you shouldn't play this move · you used a hint |
| **neutral** | this move was neutral (we can't adjudicate it) · the game ended naturally |
| **unplayed** | there is no outcome: nobody has played this yet |

Notes on the two that were argued:

- **`warning` keeps its name**, acknowledged as the one family named for a tone of
  voice rather than for a result. It is well understood in use, and renaming it
  would cost more than the inconsistency does.
- **`unplayed`, not `null`.** Same meaning, and it avoids a CSS token that reads
  like a JavaScript value.
- **`near` is not connections-only** — codenamesduet's turn log uses the same
  partial-outcome bar for a turn that hit an agent *and* a neutral.

### Flags — two, no variants

Not outcomes, and they must not borrow outcome names. They mark **the state of a
game as an object you might go and play**, not how one went:

| flag | means | where |
|---|---|---|
| open / suspended (yellow) | still open, we'll come back to it | the club card's corner triangle; the crossword picker's stripe |
| live / current (orange) | this is THE one to join right now | the club card's corner triangle |

**A documented exception:** "flags are for triangular corner flags" is *almost*
true — the crossword picker uses the open/suspended flag color for a puzzle whose
game is live or was ended manually. That stays a flag rather than becoming an
outcome, because the alternative puts two grays (neutral and unplayed) next to
each other in a 4px stripe where they'd have to be nearly white to be told apart,
and because "a game we've opened and are theoretically playing" is not what
`neutral` means ("a move we can't adjudicate").

### Chrome — three, no variants

Chrome gets its own names even where a hex matches an outcome's, because the two
answer different questions and must be free to move independently. **They are
coincidentally equal, not kept in lockstep** — caution-chrome may well be darkened
for use as an icon and a border without warning-outcome moving at all.

| name | for | today |
|---|---|---|
| **caution** | Hint, Spoiler, AI suggest, Pass — consequential, not destructive | the warning orange |
| **destructive** | Reveal, End game, Concede, Delete — irreversible | the system dark red |
| **fault** | fault messages: the system failed | the same dark red, its own name |

No variants: chrome states itself with text, border and icon. We do not fill a
button with a lighter version of its own color.

### One more color to find: the UI problem

Not an outcome, not chrome, and it has no name yet. Some boards must point at
pieces to say *this input can't work here* — stackdown and strands ring duplicate
tiles because a typed letter can't say which of two you meant. Nothing has been
judged, so it must not wear an outcome color: today both games use the outcome
red, which reads as "you did something wrong" when the truth is closer to a
caution. It also must never be a fill (a filled tile reads as a verdict), so it
needs at most an edge-weight value — likely a single color with no variants, like
chrome.

Designed when stackdown or strands converts; reserved here so the palette pass
knows a family is coming. See
[tile-feedback.md → A UI PROBLEM is not a verdict](tile-feedback.md).

### View-state — two, no variants

`history-viewer` (blue) and `share-preview` (yellow). They wear the *same frame*
as a finished board, so a frame's color comes from either an outcome's
`-very-dark` or from these two — one mark, two sources, no conflict.

### Per-game palettes stay per-game

wordle's letter colors, codenamesduet's agent/neutral/assassin, connections' four
ranks, setgame's card colors. These are game vocabulary
([ui.md → Two vocabularies](ui.md#two-vocabularies)) and are **not** outcome
colors. The only variant they ever need is an edge — the darker border for a tile
filled with that color.

**The wordle colors keep their name**, deliberately, even though waffle reads them
and they live in the shared theme: "wordle" now names both a specific game and the
family of colors that judge letters the way wordle does, and that is well enough
understood to live with.

## Current state — the audit this plan is built on

Run 2026-08-17 across every game. Hexes as they stand today.

| family | strong (→ `-dark`) | border (→ `-fill`) | bg (→ `-pale`) |
|---|---|---|---|
| won | `#2e7d32` | `#66bb6a` | `#c8e6c9` |
| lost | `#c62828` | `#ef5350` | `#ffcdd2` |
| near | `#f9a825` | `#ffb74d` | — |
| warning | `#ef6c00` | `#ffa726` | — |
| active | `#f9a825` | `#fdd835` | `#fff9c4` |
| current | `#e65100` | `#fb8c00` | `#ffcc80` |
| neutral | `#616161` | `#bdbdbd` | `#f5f5f5` |

Plus, off the grid: the terminal frames `#3c6b46` (won) / `#6b3c3c` (lost) /
`#4d4d4d` (ended); the system red `#8e1b2e`; the view-state pair `#4a7bab`
(history) / `#ffd21a` (share preview); the pill's tint, derived as the `-fill`
tier at 18% over the surface; and two derived edges, psychicnum's decided tiles
and connections' bands, both the fill stepped ~16% toward black.

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

## The work

Roughly in order; each item is small, and the whole is one sweep rather than
something to fold into another change.

1. **Rename the tiers** — `-strong` → `-dark`, `-border` → `-fill`, `-bg` →
   `-pale`, across every family and consumer.
2. **Add `-very-dark` to every outcome family.** Move the three terminal frames
   onto won / lost / neutral, and take the won and lost values **a bit more green
   and red** than today's `#3c6b46` / `#6b3c3c`, which sit close to gray.
3. **Add `-edge` to every outcome family**, and move psychicnum's decided tiles
   onto it. connections' bands derive from a *rank* color rather than an outcome,
   so they stay per-game — but they should use the same recipe, named in one place.
4. **Add the `unplayed` family** and move the crossword picker's never-played
   stripe onto it.
5. **Rename `active` / `current` to the two flag colors**, drop their unused tiers
   (`active-strong` dies with the strands fix; `current-bg` / `current-strong` have
   never had a consumer), and record the picker exception.
6. **Name the chrome colors** — caution / destructive / fault — and move every
   button off the outcome tokens. Delete the two dead button tones.
7. **De-special-case the delete-confirm button**: text and border in the
   destructive color like every other destructive control, no filled background.
8. **Pull the two stray reds onto `lost`** (crosswords, bananagrams) as those games
   come up.
9. **Fix strands' history ring** to the shared history color.
10. **Rename the turn log's outcome vocabulary** (`good | bad | partial | neutral`)
    to the family names, so the TypeScript and the CSS stop needing translation.
11. **Write the ui.md section** — the families, the five variants and what each is
    for — and move the rule currently buried in ui.md's tile-ramp paragraph into
    it, leaving a pointer. Then delete this file.

## Open questions

- **Is `-edge` derived or hand-picked?** Either is fine; it lives in the global
  file regardless.
- **Exact values for `-very-dark`**, once the frames are on it and can be seen
  side by side.
- **May `-pale` fill a game piece?** letterboxed does it today for an already-used
  letter, and it is the only piece wearing pale. Decided when letterboxed converts;
  the likely answer is yes — a way to tint a tile with a very subtle outcome color.
- **Which families genuinely need all five variants?** `unplayed-very-dark` and
  `unplayed-fill` may never have a consumer. Reserve them anyway, and let the
  vocabulary-completeness exception list in `src/cssTokens.test.ts` carry the ones
  with no reader.
