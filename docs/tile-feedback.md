# Tile + board feedback — the target vocabulary

**This is a DESIGN TARGET, not a description of the code.** Every other doc in
`docs/` describes what is; this one describes what we agreed the play surfaces
*should* say, so that an audit has something to check each game against. Nothing
below is implemented uniformly yet, and several games contradict it today (see
[Known departures](#known-departures)).

It lives on its own for now. Once the audit is done and the games have been
brought into line, this folds into [ui.md](ui.md) as part of the visual language
and this file goes away.

Scope: the marks a **tile** and a **board** can wear during play. Not the
feedback pill, the turn log, or page chrome — those are ui.md's already.

## Why this exists

Three things forced it:

- **We were inconsistent.** Invalid moves were a red border in one game, a pill
  in another, and a shake in a third. Hover darkened here, lightened there, and
  did nothing somewhere else. None of it was decided; it accumulated.
- **These are multiplayer games, so most attention is owed to what SOMEONE ELSE
  did.** A change under your eyes announces itself. A change in the corner of
  the board while you are reading another corner does not — and that is the
  common case in coop.
- **Several messages can be true at once.** A tile can be carrying game state,
  be part of the move you are building, be hovered, have just changed under you,
  and be waiting on the server. Five things, and only so many ways to draw a
  square.

## The channels

Each row owns one CSS property (or one overlay), so they compose without an
ordering rule.

| channel | meaning | lifetime |
|---|---|---|
| **background** | the game state this tile is in | permanent |
| **background**, over the state | **attention** — this changed, look here | ~0.7s |
| **border width** | **selected** — part of the move I am building (see the ruling in the audit: this replaces the current background fill) | until submitted or cleared |
| **border color**, player | a PEER's selection — whose it is; mine stays neutral | while they hold it |
| **border color** | **verdict** on my action (invalid → amber) | transient; see below |
| **outline, dashed** | **hint** | until used or cleared |
| **box-shadow** | **hover** — mouse only, subtle | while hovered |
| **position** | where I am in the input I'm building | until the input moves or ends |
| **dim-down, tile** | **in flight** — sent, waiting on the server | until the answer arrives |
| **dim-down, board** | **not your turn** | until it is |
| **dim-down, board + its inputs** | **the game is over** | permanent |
| **board frame, flash** | your turn just started | brief |
| **board frame, steady gray** | you are viewing history | while viewing |
| **ink color** | dark on light = untouched · white on color = decided | permanent |
| **motion** | never alone — pairs with attention or invalid | brief |

**Width and color are separate channels on the same border**, which is what
lets "selected *and* just rejected" render without deciding which wins.

## The rules that make it work

### Chrome fades, game pieces don't

A disabled button gets the global `button:disabled { opacity: 0.5 }`. A game
piece never does — the shared `.tile:disabled` explicitly sets `opacity: 1`,
because a decided tile's color IS its message and must show at full strength.

A game piece may be dimmed only for **transient** inactivity — in flight, or not
your turn — never for being permanently spent.

### Dim means inactive; the scope says what is inactive

`dim-down` on a **tile** means *this tile is busy*. On the **board** it means
*you cannot act at all*. Same verb, different noun, so there is one thing to
learn.

**The two scopes compound.** Your move can be in flight at the moment the turn
passes to someone else, so both apply — and two 50% black overlays give 75%
black, not 50%. If both can co-occur, their values must be chosen as a pair.

**The finished board is the one permanent dim.** Every other dim is transient by
rule — in flight, not your turn — because a *piece* that is permanently spent
must keep its color at full strength. A finished GAME is a different claim: the
whole surface is a record rather than a position, and there is no active-versus-
spent distinction left on it to protect. It is worn by the board and by whatever
inputs belong to it (a keyboard, a rack), because a game that ends leaving its
keyboard looking live is the inconsistency this exists to fix. It stays weak:
a finished board is exactly what people sit and read afterwards.

A **frame** is the other way to say it, and it is the one in use. Both are named
(`.dimGameOver` / `.gameOverFrame`, `--dim-game-over` / `--color-game-over`) so
the choice is one class either way, and each gets its own token even where a value
matches a neighbor's, so game-over can move without dragging the history frame or
the not-your-turn dim with it.

**The game-over frame and the history-viewer frame are ONE MARK IN TWO COLORS.**
Same property, same width, same offset; only the color differs. Both say *what
you are looking at is not a live position*, and the color says which kind — a
gray-blue you chose to enter and can leave, or a dead gray you cannot. Drawing
either one differently from the other is a bug and not a variant: two frames that
differ in shape are two things to learn, and the difference would carry no
meaning. The frame's color takes the game's **outcome** — dark red for a loss,
dark green for a win, dead neutral for a game merely ended — dark enough that it
never reads as the outcome palette, which at strength means a tile's state.

They can co-occur, since a finished game can be put into the viewer, and an
element has only one outline: the board drops the game-over frame while the viewer
is open, because the viewer is the state you chose.

**A dimmed piece has to start dark enough that the dim reads as darker.** Dimming
is relative, and the eye judges it against the board around it, not against what
the tile used to be. waffle showed the trap: a swap in flight has to drop the
color it just invalidated, and the obvious replacement — the pale un-evaluated
fill — landed, once dimmed, exactly where a *state* color lives (the
not-in-the-word gray), so "held" read as "changed to gray". Starting from that
gray instead, the dim can only take it darker than anything the palette says,
which is the one thing no state can be confused with. So when a mark replaces a
fill *and* dims it, pick the fill for where the dim lands, not for where it
starts.

### The words for changing a color

Four distinct operations, and the difference decides which is even available:

| term | what it does |
|---|---|
| **lighten** | shift an actual color lighter (red → pink) |
| **darken** | shift an actual color darker (yellow → gold) |
| **dim-up** | a translucent **white** layer over everything |
| **dim-down** | a translucent **black** layer over everything |

Lighten and darken are surgical but need to know which single color they are
operating on. **Dim-up/dim-down are overlays, so they work on composites** — a
card with colored symbols on it, a tile with a letter — in one move. Most of
our tiles are composites, so the overlays do most of the work.

**Do not use dim-up on game pieces.** On a light page a white wash is nearly
indistinguishable from fading toward the background, which is exactly the
chrome-disabled look that game pieces must not have.

### Attention is a judgement about what the viewer already knows

Not "who acted". Two questions, asked of each viewer, and a mark is owed only
when both answers are no:

- **Will this change announce itself to them?**
- **Do they already know what it is going to say?**

Which means marks have an **audience** — the player who acted and everyone else
may see different things for the same event — and that working out that audience
is a judgement call per mark, not a rule that can be run mechanically.

Three worked cases:

- **setgame.** A claim takes three cards away and deals three more into the same
  slots. The claimer picked those cards, so the *leaving* mark is for everyone
  else. Nobody knows what the *replacements* will be, so the *arriving* mark is
  for everyone, the claimer included.
- **wordle.** A guess lands as a whole new row in blank space. It announces
  itself to everyone, actor or not, so nobody gets a mark at all.
- **waffle.** You know exactly which two letters you moved and have no idea what
  they will score — and the answer arrives in the two tiles you are already
  looking at. So the acting player is marked too: not for the move, for the
  color.

### Read the cause; never infer it from the diff

Attention is driven by diffing — the cells that differ from a moment ago are the
cells that changed under the player. But **a board changes for reasons that are
not moves**: a restart deals a fresh one, a terminal reveal swaps the solution
in, opening a finished game arrives at a board built long ago. A diff cannot tell
those from a move. It sees only that things differ, so it lights the whole board
up at precisely the moments when nothing has happened.

Every proxy for "was this a move?" that can be measured off the board — how many
cells differ, whether the count grew, whether a score moved — has a case that
breaks it. setgame spent three bugs learning that, two of which shipped. And the
answer was recorded on the server all along: **a move writes a row, and the
things that are not moves don't.**

So the gate on any attention mark is the move log, not the board:

- **setgame** keys on the last claim's id; `replay_board` deletes the events, so
  a re-deal has no claim behind it.
- **waffle** keys on the swap log's length; `restart` deletes the swaps.

Two requirements make it work, and both are worth checking in a new game:

- **The re-deal must clear the log**, so the marker drops rather than advancing.
- **The board and the log must arrive together** — both games read them in one
  `Promise.all`, so within a render a board that has moved always comes with the
  row that moved it.

The shared piece is `common/hooks/game/useMoveCausedChange`: hand it the content,
a key for "changed", and the server's move marker, and it hands back the previous
content only when a move caused the change. setgame implements the same rule by
hand (it has its own hold-then-arrive choreography around it) and folds in when
it converts.

### Attention is only needed for change IN PLACE

A change **appended into empty space announces itself**; a change **substituted
in place does not**. That is the mechanical half of the first question above:

- setgame substitutes cards where they sat → needs the mark badly.
- waffle recolours tiles that were already there → needs it.
- wordle appends a guess row into blank space → nothing to mark.

### Is the background already spoken for?

Attention wants the background, and so does game state. Whether that is a
conflict is **per tile and per moment**, not per game:

- **Free**: setgame's cards, connections' tiles *before* they are banded.
- **Spoken for**: wordle, waffle, psychicnum — and connections' tiles *after*.

Two things stop this being a real problem. Attention is under a second, so
the state is obscured only briefly and can be a translucent wash rather than an
opaque fill. And **a decided tile is inert** — once a connections tile joins a
band it can never change again, so it leaves the attention channel entirely.

### Every mark has a lifetime, and it is part of the specification

Permanent (state) · ~0.7s (attention) · until the server answers (in flight) ·
until the next action (verdict) · while hovered. Most of the confusion in
setgame came from marks whose lifetime nobody had written down.

One consequence: **a verdict must outlive the selection it is about.** Where a
rejected selection clears, the invalid border has to persist a moment longer, or
it vanishes together with the thing it was marking.

### A verdict can be about what you're ABOUT to do

Drag-and-drop feedback (bananagrams, scrabble `.dropOk` / `.dropNo`) is a verdict
in every sense except timing: it judges a **prospective** action, and it is
continuous — recomputed as the pointer moves — where a normal verdict is
transient and follows something you already did. Whether that is the same row
widened or a row of its own is undecided.

One rule it already follows, worth generalising: **a mark on a prospective
target is an outline, never a background**, so whatever is already in the cell
stays readable. The entire point is to judge the fit, so the mark must not hide
what you are fitting against.

### Attention says WHERE to look; an arrival animation says WHAT happened

Two jobs that look like one. setgame needs **where**: three cards changed in
three different corners and nothing tells you which. wordle needs only **what**:
a guess lands in the row you were already staring at, so the location is never in
question — its reveal flip just says "this arrived", with some delight.

So a game whose state change is **already animated at the moment it lands** does
not also need an attention flash. Ask which question is open before reaching for
one.

### Motion is UNDER-used, and the absence is not a decision

Where you find no motion, assume it was forgotten rather than rejected — it is
fiddlier CSS than the alternatives and easy to skip. Propose it. Two places it is
almost always right:

- **press** — things depress when pushed; it needs no color and no learning;
- **rejection** — a shake says "no" in a way no border can, and it is the only
  channel a player cannot mistake for state.

Its one hard constraint is unchanged: `prefers-reduced-motion` must leave a
message behind, so motion never carries a meaning alone.

### Motion is never the only carrier

`prefers-reduced-motion` must always leave a message behind, so motion always
pairs with a color or a border. It is worth using, though: peripheral vision
detects motion better than color, which is exactly the attention problem.

**Untested on phones.** Frame rate on low-end devices, and whether a shake reads
as feedback or as a layout glitch on a screen the board fills, both need
checking before we lean on it.

### Hover may need more than a shadow on packed boards

A drop-shadow works because it reads as elevation against the surface around the
tile. Where tiles are **packed edge to edge** — spellingbee's and wordwheel's
hexes — there is barely any surface to cast onto, and the shadow lands on a
neighbour instead of on the board. Those boards may add a **subtle dim-up** to
make the hovered tile feel more active.

Note this is the one place dim-up is allowed on a game piece, and it is allowed
precisely because it is *not* saying inactive: it is momentary, it tracks the
pointer, and hover carries no meaning anyway. Case by case, only where the
shadow demonstrably doesn't read.

### The position channel — where I am in the input I'm building

Distinct from selection (*which pieces are in my move*) and from hover (*where
my pointer happens to be*). Position is **persistent, singular, and must be
findable after you look away** — you glance up, and you need to resume from
exactly one place.

Three games need it, reached by three different inputs:

- **crosswords** — the keyboard cursor, plus the whole active word travelling
  with it (`.cursor` + `.inWord`, cursor wins).
- **strands** — the most recently tapped letter, so you can add the next one to
  the trace after looking away.
- **letterboxed** — the end of the chain, which is the letter the next word must
  start from.

**Its rendering may vary by game even though its meaning doesn't.** Where the
tile already carries a state color, the marker should be a *shade of that
color* — strands' last-tapped letter as a darker purple on its purple — so it
reads as "this one, most recently" without inventing a hue. Where the background
is free, it can take the background outright, as crosswords does.

Deliberately **unassigned for now**: it needs a channel, but which one is best
decided after a few simpler games have been converted and we can see what is
actually still free.

### The phone caveat: your finger covers the tile

Any mark drawn on the tile you just tapped is partly under your hand. This bites
**self-feedback** — the invalid border, the in-flight dim — and not attention,
which is raised by what someone else did and is nowhere near your finger.

## Naming: semantic tokens, and their reach

The house style is already right — **tokens are named for meaning, never for
color**, and both channels we have already exist:

| token | in the shared theme |
|---|---|
| `--color-history-viewer` | documented as *"a neutral amber, NOT an outcome color"* |
| `--tile-attention` | a **translucent** warm-yellow overlay, composed as the first layer of `background` so it reads as *"itself, but lighter"* over any tile shade |

`--tile-attention` deserves note: it is exactly the translucent wash this doc
proposes as the answer to attention-versus-state, and it has been in the theme
since scrabble needed it. The mechanism was solved before the vocabulary was.

**So the work is reach, not convention.** setgame invented
`--setgame-arriving-bg`, `--setgame-leaving-bg` and `--setgame-held-veil` locally
rather than using or extending the shared ones. As each game is converted, marks
that are universal — attention, history, busy, verdict, hint — move into the
shared `--color-*` / `--tile-*` families, and only genuinely game-specific values
stay game-scoped.

**Two names for one color is correct**, even where the values match. History and
attention must be separately named so either can move without the other. (They
won't match: history is going gray or blue, attention stays yellow.)

### How marks compose, mechanically

The shared theme already documents this and the framework should build on it
rather than replace it: the shared `.tile` reads **only tokens** for its colors,
so a state class overrides by **re-setting a token**, not by out-cascading
another stylesheet. That is what lets a game layer its own result fills over the
shared tile without specificity fights, and it is how any new mark should be
added.

## Colours

| color | means | where |
|---|---|---|
| **yellow** | attention: new, or changed | tile background flash; the your-turn board flash |
| **amber** | warning: you cannot do that *yet* | invalid-move border |
| **green** | a good outcome | game state only |
| **red** | a bad outcome | game state only — never a verdict on a keystroke |
| **gray** | you are viewing history | board frame |

**Amber, not red, for an invalid move.** Typing a letter that matches two tiles
is not an error, it is a "pick one" — and red is spoken for by outcomes. Amber
is already the app's warning tone (`--color-outcome-partial`).

**Yellow reads the same at both scopes**, which is what makes it learnable: a
tile flashing yellow says *this changed*, and a board frame flashing yellow says
*your turn started*. Both are news. wordle and waffle also use yellow as a tile
*state* color, which does not collide — that is a fill, this is a flash and a
frame.

## Known departures

Where the code contradicts the above today. This is the audit's starting list,
not the audit itself.

| game | departure |
|---|---|
| setgame | draws **selection as a `box-shadow`** ring, which would collide with hover. Needs to become a real border. |
| waffle | in-flight swap is a **blinking blue outline**, not a dim. Its tiles also carry live-changing state color, so it is the hardest case for attention-as-background. |
| stackdown | the ambiguous-letter mark is a **red** border *and* a red `box-shadow` ring — wrong hue (should be amber) and occupies the hover channel. |
| strands | same red ambiguous-letter treatment. |
| history viewer | the shared frame is **yellow** (`historyViewer.module.css`); should be gray, so yellow means only "attention". Scope stays as it is — board, and sometimes another region such as a rack. |
| most games | **no in-flight mark at all.** This is the biggest gap and the most additive. |

**wordle: CONVERTED** (2026-08-16) — in-flight veil, rejection ring matching its
pill's tone, elevation hover, gray-blue history, and the keyboard rebuilt as a
control surface. It went first because it needed the fewest decisions: no
selection, no hint, and no cursor, so it did not force the position channel.

## The audit — what doesn't fit

Run 2026-08-16 against every game's board/tile CSS. The point was **not** to
produce a to-do list but to find things we already do that the vocabulary above
has no room for. It found six, and one of them is load-bearing enough to
reopen a decision.

### 1. Selection is a BACKGROUND FILL today, not a border

The framework says border-width. The shared `.tile` says otherwise, in as many
words:

```css
.selected { --tile-bg: var(--tile-selected-bg); }   /* dark fill, light ink */
```

with the comment: *"Selected fills the tile dark with light ink — the NYT 'I
picked this' idiom, now canonical everywhere."* It was deliberately unified
across games, replacing psychicnum's accent ring and connections' bg-darken.

So this isn't drift; it's a considered decision that contradicts the framework —
and it puts selection on the **background**, the channel we assigned to state.

**RULED (2026-08-16): selection moves to the border.** The fill goes, in the
several places that use it. It unpicks a unification made on purpose, and the
players have learned it — but they know this is beta, and the background is
needed for state and attention, which have nowhere else to go. Selection does.

### 2. Hover is five different things, and one of them borrows selection's color

| | hover treatment |
|---|---|
| shared `.tile` | `box-shadow` ring **in the selected color** |
| stackdown | `border-color` → accent |
| spellingbee / wordwheel | `filter: brightness(0.96)` |
| strands | `opacity: 0.75` |
| setgame | background gray |

The shared one is the problem: it rings the tile in `--tile-selected-bg`, so
hover and selected speak the same color. And strands' hover is `opacity`, which
in our vocabulary is a *dim* — i.e. hover currently says "inactive" there.

`filter` is also a channel the framework doesn't name at all.

### 3. Navigation state — the keyboard cursor — is missing from the framework

crosswords, bananagrams and scrabble all carry a **cursor**: where the keyboard
is pointing, persistent, and in crosswords a whole-word highlight travels with
it (`.cursor` + `.inWord`, "cursor wins"). bananagrams shares a
`gridCursor.module.css` with direction variants.

This is neither state, selection, hover, nor attention — it's *where I am*, it
persists, and in crosswords it takes the background.

**Now named as the position channel** (above), with a third claimant the audit
initially missed: strands' most recently tapped letter, which answers the same
question by tap rather than by keyboard. **Deliberately left unassigned** until
a few simpler games are converted and we can see which channels are still
free — assigning it now would be guessing.

### 4. Puzzle notation isn't game state, but it lives on the tile

crosswords renders `.circle`, `.shade`, `.markRightBreak`, `.markBottomHyphen` —
these are properties of the **puzzle as printed**, not of your progress, and
they use background and border. scrabble's premium squares are the same kind of
thing: permanent board facts that never change and mean nothing about play.

The framework's "background = game state, permanent" quietly assumed state
*changes*. There are two permanents here — the board's own markings and your
progress — and they compete.

Crosswords already resolves it, and the resolution generalises: **the puzzle's
own markings take the background and border; your progress is carried by
separate marks** (`.markRevealed`, `.markWrong`) laid over the cell. Where a
board has permanent printed facts, those get the surface and state moves to a
mark.

### 5. Drag-and-drop has its own live affordance

bananagrams and scrabble both draw `.dropOk` / `.dropNo` during a drag — an
outline in the outcome-strong green/red pair, deliberately *not* a background so
the letter underneath stays readable. That's a verdict, but on a *prospective*
action rather than a submitted one, and it's continuous rather than transient.

It also occupies the outline channel, which we assigned to hints — though in
practice that doesn't collide: hints are dashed and drop targets solid, and the
games that drag barely overlap with the games that hint. **Mostly interesting
rather than a problem**; the one open question is whether "verdict" widens to
cover prospective actions or gets its own row (see above).

### 6. Identity is a real channel, and three games already use it

- **connections** colors a selected tile by **who selected it**.
- **crosswords** draws `.peerFrame` — a teammate's cursor, a thin inset border
  in that peer's color, set inline.

Two games, two mechanisms, one meaning: *a peer is doing something HERE*. That
confirms identity as a channel.

**Correction:** this finding first listed codenamesduet's `.triPeer` / `.triMine`
triangles as a third case. They are not — they are the **keycard**: what my key
says about a tile versus what my partner's does. That asymmetry is the game
itself, not attribution, and it is deliberately not a circle precisely so it
cannot be mistaken for a player dot.

**How identity resolves without a new channel:** apply the audience rule to
selection. **My own selection is neutral; a peer's carries their color.** I
don't need telling which tiles are mine — I just clicked them. That makes the
two uses of border-color disjoint in practice, since a verdict only ever lands
on my own action. A *permanent* attribution ("moth called this one") is a
different need and would be a **player-color dot**, reusing the `<Dot>` /
`ActorDot` vocabulary the turn log and opponent strip already share. Nothing
needs that today.

### Smaller notes

- **connections' solved band** stops being a tile at all — four tiles collapse
  into one full-width row. Nothing in the vocabulary covers a tile *ceasing to
  exist*, which is the cleanest possible answer to "how do I mark an inert
  tile": remove it.
- **letterboxed draws lines, not tiles** (`.path`, `.ghostPath` at differing
  opacity). A board whose primary mark is an overlay between cells.
- **spellingbee's `.hexFlash`** is a tap-feedback overlay keyed by a bumping
  nonce so re-tapping the same tile replays it — the one existing example of
  "replay this mark on repeat" that our lifetimes don't describe.
- **strands' most recently tapped letter** is not hover and not state — it is
  the position channel above, reached by tap.
- **strands documents a touch trap** worth promoting to a rule: a touchscreen
  keeps `:hover` on the last-tapped element until you tap elsewhere, so any
  hover treatment sticks on a phone. That's an argument for hover being subtle
  and mouse-only, and for never carrying meaning in it.
- **In-flight marks exist in exactly three games** — setgame, waffle,
  codenamesduet (`.tilePending`). Confirms it as the biggest gap.

## What wordle's conversion taught

The first game through. Five things generalise.

### Ink color is a channel, and it is easy to spend by accident

On wordle's keyboard, **black letters mean untried and white letters mean
tried** — you read the state of the whole alphabet without reading a single
letter. Nobody designed that; it fell out of "white text on a colored fill".

It nearly got spent: three of the key states carried white ink below the 3:1
contrast floor, and the obvious fix — dark ink on the light ones — would have
raised every number and destroyed the signal. **Before changing a color for
contrast, ask what the ink is already carrying.**

### A state color that carries white ink has a floor, and it constrains the palette

`--wordle-gray` could not be lightened past about `#959595` without dropping
white text under 3:1. That is a hard boundary on a purely aesthetic decision, and
it is invisible until measured — so measure before choosing, not after.

Where the floor and the design genuinely conflict, **say which won and why, in
the token**: wordle's yellow deliberately sits at 2.57 rather than 3.0, because
the gold that reaches 3.0 stops reading as *Wordle's* yellow, and that
recognition is worth more than the last half point. A deliberate exception with
its reasoning attached is fine; an undocumented one is indistinguishable from an
oversight.

### The keyboard is chrome that carries game state

Its keys are **chrome first**. That is why ENTER can take a background for an
*affordance* (the accent blue every Submit wears) without breaking
"background = state", and why the same blue on a board tile would be wrong.

The general form: when a surface is both, decide which it is *first*, and the
rest follows. A control that happens to display state is still a control.

### An animation that paints a property must paint ALL of that state's properties

wordle's reveal flip set `background` and `border-color`, but painted the border
with the FILL rather than the darker edge — and `animation-fill-mode: both`
freezes the final frame, so that stuck. The result: a tile that flipped in front
of you kept `border == fill` forever, while the same tile rendered on a page
reload took the static class and got its proper edge. **Two identical tiles with
different borders, decided by whether you were watching when they landed.**

Any keyframe that overrides a state's styling owns *all* of it, or the styling
becomes history-dependent.

### Verify the rendered value, not the source

Two changes in this conversion looked correct in the CSS and did nothing at all:

- `outline: 3px solid var(--color-outcome-partial)` — that token does not exist,
  and an undefined custom property makes the **whole declaration** invalid, so
  the outline silently never drew.
- `background: var(--kbd-key-bg, #f2f2f3)` — the fallback is unreachable because
  wordle *sets* `--kbd-key-bg`. The real value lived three aliases away.

Neither is visible to `tsc` or eslint, and both survived review of the diff.
On this kind of work the diff is not evidence; the computed value is.

## Not yet in scope

**Keyboard navigation.** Grid-ish games may gain keyboard movement as an
alternative to clicking (a real accessibility need — repeated mouse clicking
hurts). The expected shape, when we get there: a **thin** border as the cursor,
clearly lighter than selection, becoming the **thick** selection border when the
player actually commits to that tile. That is the position channel above,
reached by a third input, and it is a good reason not to spend the border's
thin/thick range on anything else.

## Open questions

- **How dark is the board dim for "not your turn"?** Waiting is often *thinking*
  time — you are planning your next move — so the board must stay readable. The
  intensity can be low because the area is the whole board; a whole-surface
  change is noticeable at a strength a single tile would not be.
- **Does the in-flight dim read as "working" rather than "dead"?** A blink says
  activity, a static veil says held. It worked in setgame, where the veiled
  cards were leaving; waffle's two tiles are staying and swapping.
- **Exact values** for every overlay, and the paired values for the compounding
  case above.

## Why the in-flight mark is worth doing first

It is the one channel almost nothing implements, so it is additive rather than a
migration — and it buys something concrete: **it is what earns you the right not
to guess the answer.** Colouring a wordle row locally before the server replies
means inventing a verdict and reconciling it when the real one disagrees. Dimming
it instead says "sent, waiting" honestly, costs one class, and never has to be
undone.

### What the dim does NOT excuse: showing the move itself

The move is a different thing from its answer. A client can render the
arrangement it just asked for — it computed that arrangement, and it validated
the move before sending it — and refusing to is worse than useless: a waffle
player who drags two tiles and sees them sitting exactly where they were reads
it as "my swap didn't take", and the dim that follows looks like the app
struggling rather than the server thinking.

So a piece in flight shows **the move, without its verdict**. waffle's two tiles
take their new letters the moment you drop them, and go to the neutral
un-evaluated fill rather than keeping their old colors (which would assert a
verdict that is no longer true) or guessing new ones (which would assert one we
don't have).

The optimism is therefore about **acceptance, not computation** — and that is the
residual risk it carries. A move can still be refused after the fact: a teammate
spent the last swap first, the turn moved, the game ended. Anything drawn
optimistically must be able to snap back, and that revert is the whole price of
doing it.
