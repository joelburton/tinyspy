# Tile + board feedback — the target vocabulary

**This is a DESIGN TARGET, not a description of the code.** Every other doc in
`docs/` describes what is; this one describes what we agreed the play surfaces
*should* say, so that an audit has something to check each game against.

**Where we are: 4 of 16 games converted** (wordle, waffle, psychicnum, connections) — see
[Roster](#roster--which-games-are-converted), which is the place to start a
session and the place to record finishing one. The channels and rules below are
settled and live in shared code; what remains is applying them game by game.

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
| **inset ring**, player color | WHOSE pick this is — everyone's on a shared board, mine included; nobody's otherwise | while they hold it |
| **background**, the answer's own color | **verdict** on my action, where the background is free — its PILL's tone, at full strength | until my next action, or until the board moves |
| **border color** | **verdict** on my action, where it isn't — its PILL's tone | until my next action |
| **outline, dashed** | **hint** | until used or cleared |
| **box-shadow** | **hover** — mouse only, subtle | while hovered |
| **border color** | the CURSOR — where the keyboard is pointing | until it moves; hidden until an arrow |
| **background**, a shade of the state | where my move currently ENDS (strands' tail, letterboxed's chain) | until the move grows or ends |
| **dim-down, tile** | **in flight** — sent, waiting on the server | until the answer arrives |
| **dim-down, board** | **not your turn** | until it is |
| **dim-down, board + its inputs** | **the game is over** | permanent |
| **board frame, flash** | your turn just started | brief |
| **board frame, steady gray** | you are viewing history | while viewing |
| **ink color** | dark on light = untouched · white on color = decided | permanent |
| **motion** | never alone — pairs with attention or invalid | brief |

**Width and color are separate channels on the same border**, which is what
lets "selected *and* just rejected" render without deciding which wins.

**On an INERT piece the border is free, and state may take it.** A decided tile —
psychicnum's guessed word, waffle's finished board — cannot be selected and cannot
have an action refused on it, so neither claimant on border colour can ever appear
there. That is what lets a decided tile wear a darker edge of its own fill as
quiet definition without competing with anything.

**A mark on a piece covers the piece, border included.** Attention and the
in-flight dim extend over the border box rather than stopping at the face, or an
edge carrying state shows straight through the mark that is meant to be speaking
(a tile mid-attention kept a green ring announcing the verdict its flash had not
finished pointing at). Losing the edge for the length of a flash costs nothing:
the mark is brief, and the edge comes back.

## The rules that make it work

### Chrome fades, game pieces don't

A disabled button gets the global `button:disabled { opacity: 0.5 }`. A game
piece never does — the shared `.tile:disabled` explicitly sets `opacity: 1`,
because a decided tile's color IS its message and must show at full strength.

A game piece may be dimmed only for **transient** inactivity — in flight, or not
your turn — never for being permanently spent.

### Identity: who did this to this tile

A shared board raises a question no state colour can answer — **which of us
decided this?** — and it is answered by the app's existing identity mark: a
player-coloured `<Dot>`, the same disc the turn log and the opponent strip use, so
a colour means one person everywhere it appears.

It is a **permanent attribution**, which is what separates it from the
peer-selection border (someone is doing something here, now) and from attention
(this just changed). It lives on the piece, in a corner, small: it answers a
question you ask deliberately — "who got that one?" — rather than one the board
should be announcing.

psychicnum is the first user, and its rules generalise:

- **Shared boards only.** In compete you see nobody's moves but your own, so a dot
  would be decoration. Draw it where the board is genuinely shared.
- **Everyone gets one, including you.** The audience rule says you don't need
  telling what you did — but a board where only *some* decided tiles carry a dot
  reads as missing data, not as "the unmarked ones were mine".
- **Only what a person actually did.** A tile decided by the game rather than by a
  player — a revealed secret, a server-dealt refill — carries no dot, and that
  absence is information (see the reveal rule above).
- **Inside the piece, clear of every edge**, so it can never be confused with the
  selection border, a verdict ring, or the history ring — and out of whichever
  corner that board's floating control occupies.

### Depth belongs to game pieces — not to chrome

Everything in this doc — the resting shadow, the hover lift, the press shrink and
darken — applies to **board tiles and the on-screen keyboard's keys, and nothing
else.** A button in the info column, in the game menu, in a dialog, or in a setup
form gets none of it, and that is not an oversight to be tidied up later.

The distinction is what the thing IS. A tile is an **object you manipulate**: you
pick it up, you push it, it has thickness, and elevation is how a flat screen says
so. A button is a **control you activate** — it has no physical claim to make, and
giving it one makes the page feel upholstered rather than crisp. The keyboard is
the one surface that sits on both sides of the line (it is chrome that stands in
for a physical keyboard, and its keys are pressed like pieces), which is exactly
why its keys are in and the rest of the chrome is out.

So chrome says what it needs to say with fill, border and text: the accent fill
every primary button wears, the bordered `secondary` variant, and `opacity: 0.5`
when disabled (common/theme.css → element resets). No shadow, no lift, no darken.

Which is the mirror of the rule below — chrome fades where a game piece never
does, and a game piece has depth where chrome never does. One consequence worth
stating plainly: **a control that looks like a tile is a bug**, because a player
who reads it as a game piece will try to play it.

**The one exception, and it proves the rule: a control that floats OVER a game
surface keeps a shadow** — psychicnum's Shuffle button sits on the board itself
(`.floatingShuffle`). There the shadow is not decoration but separation: without
it the button reads as part of the board it is lying on top of. Depth is doing the
same job it does for a tile — saying what is a physical layer — which is exactly
why it is allowed here and nowhere else in the chrome.

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

**An input surface that is also a READOUT stays visible when the game ends.**
Reversed 2026-08-17, at a table, after losing a wordle to FAVOR: the first
version of this rule said to hide the keyboard outright, on the grounds that its
keys are permanently useless rather than temporarily so, and that removing them
says it better than any amount of dimming. Which is true of the keys *as
buttons* — and the keyboard is not only buttons.

wordle's keyboard is where the alphabet's state lives: black letters are untried,
white ones tried, and each tried one carries its color. You read what you know
about the whole alphabet without reading a single letter — this doc's own
Ink-is-a-channel finding, from wordle's conversion. Hiding it at the final buzzer
takes away the summary of the game you just played at the exact moment you want
to study it, which is also what the paragraph above already says about the
finished board: *it stays weak, because a finished board is exactly what people
sit and read afterwards.* The keyboard is part of that board.

So: **dim or fade it to say the keys are spent, but leave it readable.** Exact
treatment still to pick — it has to read as inactive without dulling the letter
colors it exists to show, which is the tension worth looking at rather than
guessing. `<GuessKeyboard>` keeps its `gameOver` prop; only what the prop does
changes, so wordle and wordiply move together (see wordle.md → Deferred).

The general form, and the part that survives the reversal: **ask whether an input
surface is only an input.** A rack of tiles you can no longer play says nothing
once the game is over and can go; a keyboard that has been recording your guesses
for six turns is a record, and a record is the one thing a finished game should
keep showing.

A **frame** is the other way to say it, and it is the one in use. Both are named
(`.dimGameOver` / `.gameOverFrame`, `--mark-game-over-dim-color` / `--outcome-neutral-terminal-frame-color`) so
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

**The middle gray under the dim is the PREFERRED DEFAULT for a piece in flight**,
and the next game with the same shape should reach for it rather than re-deciding.
It holds in both directions: waffle's cells had a color that the move invalidated,
wordle's submitted row never had one at all, and both read correctly as "sent"
once they go there. A board that departs from it should say why.

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

### Revealing the answer is a STATE CHANGE, not a mark

A game's state colours say what is TRUE about a piece, and asking to see the
answer changes what you know rather than what the board is. So a revealed secret
takes the state it has always had — psychicnum's unfound secrets simply go green,
the same green a found one wears — instead of acquiring a ring, a badge, or a hue
of its own.

This is what stops every solution-game inventing an answer-key channel. psychicnum
had one (a neon green outline, in a token of its own, outside every palette), and
it existed only because the reveal used to be permanent and shared: if the board
could never go back, the board had to distinguish found from shown forever.

**Reveal being personal and reversible is what pays for this.** One toggle
separates "we found it" from "I am peeking", so the board doesn't have to. And
where a game shows WHO decided a tile, the distinction survives even with the
answer showing: a found tile carries its guesser's dot, a revealed one has nobody
to name.

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

### Check what a RESTART does to a mark — FIRST, every time

The lifetimes above all describe a game in progress, and every one of them is
silent about the two moments that end one. Both have bitten us repeatedly, in
several games, and both are cheap to check while a mark is being written and
expensive to find afterwards:

- **Restart.** The board goes back to the beginning and the log is deleted, so
  any mark still on screen is now about a move that no longer exists. Ask it of
  every piece of mark state a conversion adds — the flash, the verdict, the
  in-flight set, the selection.
- **Game over.** A finished board is a record. A mark that means "I am building
  this" or "the server is thinking about this" is a claim it cannot make, and
  nothing will come along to take it off.

Two things make the check pass reliably:

- **Read the shrinking LOG, not the local "I clicked restart" callback.** A
  restart handler fires only on the client that clicked it; a teammate's restart
  has to clear your board too, and the log arrives for everyone. It is the same
  signal the attention rule uses, read the same way.
- **Selections need clearing at BOTH ends.** They are ephemeral broadcast state
  that no server row will contradict, so they survive a restart and a game-over
  unless something says otherwise: connections broadcasts a clear on restart, and
  simply doesn't draw a selection on a board this player can no longer act on.

### A TEMPORARY verdict may take the background, where nothing else wants it

The channel table's first line gives the background to state, and state is
**permanent**. A verdict is not: it answers one action and goes when you take the
next one. Where a piece carries no state on its background, those two never
contend for it, and the verdict may fill the piece — which is much the strongest
way to say *these ones, together*, and the only way to say it at all when the
pieces judged don't form a shape (see the next rule).

Three conditions, all of them load-bearing:

- **The background must be genuinely free on that piece, at that moment.**
  Per-tile and per-moment, as the audit below says: connections' tiles carry no
  state (a decided one stops being a tile and becomes part of a band), so it
  qualifies; a waffle tile, coloured by its last swap, does not, and its verdict
  would take the border colour instead.
- **Attention must not land on the same piece.** Attention is also a background
  mark, and one channel cannot say "look here" and "that was wrong" at once.
  connections is safe by construction: attention lands on the arriving BAND,
  verdicts on tiles.
- **It is the colour that answer already wears elsewhere — specifically, its
  TURN-LOG BAR's.** Not a separately chosen shade, and not a lighter cousin of
  one: a wrong guess is one red, whether you meet it on the board now or in the
  log a minute later. That is the outcome family's 400-level `-border` tier (the
  800 `-strong` tier is for thin lines on white — a pill's border, a ring — and
  as a fill it lands much darker than the bar, which is how this was caught).
  Against a board of warm beige tiles the mark has to be unmistakably red /
  orange / gold to read as an answer at all; the 100-level pastels, tried first,
  read as "a slightly different beige". **The ink then follows the fill**: white
  on the red, dark on the orange and the gold, which is where each stays legible.

**A temporary verdict and a permanent one are the SAME colour**, and the
temptation to separate them by tier has to be resisted for two reasons. Colour
matching is doing real work — a player learns one red — and, more sharply, **the
outcome palette is a gradient**: red for errors, orange for warnings, gold for a
near miss, sitting close together by hue. Lightening any of them walks it toward
its neighbour, so a "faded red" starts reading as an orange, which is not a
weaker version of the message but a different one. What separates temporary from
permanent is its LIFETIME, not its shade.

### A board mark dies when the board moves; the pill doesn't

Both halves of a verdict answer the same action, but they are attached to
different things, and that decides how they end:

- **The mark is attached to pieces**, and it is only true while those pieces are
  where you left them. A teammate's successful guess can take four of them off the
  board entirely, so a mark still sitting there is describing a position that no
  longer exists. It goes the moment anyone else acts.
- **The pill is attached to what you did**, and that stays true. A fast teammate
  guessing a half-second after you submitted must not rob you of your own answer —
  you asked a question and you are owed its reply, however quickly the board moved
  on.

So the two lifetimes are deliberately different, and the earlier "one message, one
lifetime" framing was too tidy. connections reads the guess LOG for this: a row
arriving that isn't mine (or the log shrinking, which is a restart) clears the
mark, while my own row landing — the tail of the very action being answered,
arriving a beat later over realtime — does not.

Every path also has to leave the board in the same state afterwards: connections
clears its selection on all three verdicts, including the one it refused locally,
so "what happens after an answer" is one rule rather than three.

### A UI PROBLEM is not a verdict, and must not wear outcome colors

**Not designed yet — captured so it isn't solved by accident.** Some boards need
to point at pieces for a reason that has nothing to do with how anyone is playing:
stackdown and strands both ring duplicate tiles to say *you can't just type this
letter, because there are two of them — you'll have to click*. Nothing has been
judged. Nobody did anything wrong. It is a statement about the INPUT, and it is
true before you act and stays true after.

Both games draw it today as a red border, which is wrong twice over: red is an
outcome colour and this is not an outcome, and if anything the message is closer
to a caution than to a failure. The rules it will have to follow, when those games
convert:

- **Not an outcome colour.** It needs a colour of its own, outside the won / lost /
  near / warning families, precisely so it can never be read as a judgement of a
  move (see [colors-refinement.md](colors-refinement.md), which reserves the
  question).
- **Never a fill.** A filled tile reads as a verdict, and that is the one thing
  this must not say. An edge or a ring, leaving the piece itself untouched.
- **Its lifetime is the CONDITION, not an action.** It lasts exactly as long as
  the ambiguity does — unlike every verdict, which ends at your next move.

Expect more cases than these two: any board that has to say "this input won't work
here" wants the same mark.

### A verdict may be drawn on a GEOGRAPHIC unit — and geography is the test

The channel table gives the verdict to **border color**, on the pieces judged.
wordle appears to break that: a refused word wears an outline (`.verdictRing`)
rather than five marked tiles. It doesn't, because what it marks is a **row** —
the five tiles are contiguous, aligned, and already read as one shape, so there is
a real unit on the board to draw around, and an outline can sit clear of the tiles
instead of crowding them.

The test is **geography, not count.** Judging several pieces at once does not
license a group mark; the pieces forming a shape does. connections judges four
tiles too, and they are scattered across the grid with unrelated tiles between
them — there is no unit there to outline, only four separate pieces, so the
verdict goes on each of them (as a fill, per the rule above). That is not an
exception, it is the rule with the answer geography gives.

So: **where the judged pieces don't form a geographic unit, the verdict is always
on the distinct pieces, and never an outline** (on a tile, an outline is a hint or
the history viewer). Where they do, drawing the unit is available — but it stays a
decision about that board's geometry, made by the game that has it, not inherited
from wordle. Either way the tone is still the pill's.

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

### Position splits in two: the cursor, and where my move ends

The doc left "position" unassigned for a long time because its three claimants
looked like one thing. They are two, and separating them answers all three:

- **The CURSOR is where my INPUT is pointing.** It moves as I look around, commits
  nothing, and belongs to the keyboard: crosswords' cell cursor, and the arrow
  cursor the five board games are getting (docs/keyboard-nav-plan.md). It takes
  **border color**, which is free because the two other claimants on that channel
  can't co-occur with it — a verdict lands on a submitted action, and a peer's
  presence is an inset ring.
- **The MOVE'S END is where the thing I am building currently stops.** strands'
  most-recently-taken letter, letterboxed's chain end. That is **state**, drawn as
  a shade of the state color, and the test that proves it: arrowing over a
  different letter must NOT change the tail — only taking that letter does. A
  cursor follows my attention; this follows my move.

Both are persistent, singular, and must be findable after you look away. They
differ in what changes them, which is why one is chrome and one is state.

**Rendering may vary by game even though the meaning doesn't.** Where a tile
already carries a state color, the move-end marker should be a *shade of that
color* — strands' last letter as a darker purple on its purple — so it reads as
"this one, most recently" without inventing a hue.

### The phone caveat: your finger covers the tile

Any mark drawn on the tile you just tapped is partly under your hand. This bites
**self-feedback** — the invalid border, the in-flight dim — and not attention,
which is raised by what someone else did and is nowhere near your finger.

## Naming: semantic tokens, and their reach

The house style is already right — **tokens are named for meaning, never for
color**, and both channels we have already exist:

| token | in the shared theme |
|---|---|
| `--view-history-color` | documented as *"a neutral amber, NOT an outcome color"* |
| `--mark-attention-tile-color` | a **translucent** warm-yellow overlay, composed as the first layer of `background` so it reads as *"itself, but lighter"* over any tile shade |

`--mark-attention-tile-color` deserves note: it is exactly the translucent wash this doc
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
| **orange** | warning: you cannot do that *yet* | invalid-move border |
| **gold** | a near miss: you were close | the turn log's one-away bar; a one-away verdict |
| **green** | a good outcome | game state only |
| **red** | a bad outcome | game state only — never a verdict on a keystroke |
| **gray** | you are viewing history | board frame |

**Orange and gold are different messages and must stay different colors.** "You
can't do that" is a caution about an action; "you were one away" is a result. They
shared one value until 2026-08-17 (`--outcome-near-ink-color` was orange, and
the pill's `warning` and `near` tones both drew from it), which made connections'
"You already tried that" and "One away!" indistinguishable in every place either
appeared. Gold is the color the turn log's one-away bar already wore; the strong
tier now matches it, and warning has its own `--color-warning-*` family.

**A verdict wears the tone its PILL wears** — the two are one message arriving in
two places, and a red pill beside an orange edge reads as two different verdicts.
So the color question is already answered elsewhere: whatever tone this level of
answer takes in the feedback pill (docs/ui.md → Feedback pill) is the tone the
mark on the board takes. "Not in the word list" is an error, and it is red in both
places; "already guessed" is a warning, and it is orange in both; "one away" is a
near miss, and it is gold in both.

An earlier version of this doc said *invalid → amber, because red is spoken for by
outcomes*. That was wrong twice: it invented a second rule for a question the pill
had already settled, and it would have made the two halves of one message
disagree.

**Yellow reads the same at both scopes**, which is what makes it learnable: a
tile flashing yellow says *this changed*, and a board frame flashing yellow says
*your turn started*. Both are news. wordle and waffle also use yellow as a tile
*state* color, which does not collide — that is a fill, this is a flash and a
frame.

## Roster — which games are converted

**4 of 16 done.** The order is chosen by which decisions a game forces, not by
size: wordle needed the fewest, waffle moved the framework into shared code,
psychicnum brought identity, connections made identity a rule and put a verdict on
the background. Pick the next one up from the "forces" column.

| game | status | what it forced / what it will force |
|---|---|---|
| **wordle** | ✅ 2026-08-16, board marks 08-17 | first through: the in-flight dim, the verdict ring in its pill's tone, hover-as-shadow, blue history, the keyboard as a control surface. Then the four board-scope marks + the keyboard withdrawn at terminal. It went first because it needed the fewest decisions — no selection, no hint, no cursor |
| **waffle** | ✅ 2026-08-17 | the framework INTO common: selection as a black border, the shared in-flight dim, the move shown optimistically with its verdict withheld, attention gated on the swap log, both turn marks, the game-over frame. No verdict mark and none needed — the only refused swap is one a teammate beat you to, and their swap arriving is what you want to see |
| **psychicnum** | ✅ 2026-08-17 | the **identity dot**, and reveal-as-state (which retired the answer-key channel). Self-attention deliberately off: one tile changes and the in-flight dim already pointed at it |
| **connections** | ✅ 2026-08-17 | the **identity mark** as a named shared channel (`.peerRing`) — and, on the way, the rule that identity is drawn for EVERYONE on a shared board or for nobody, which the permanent dot already said and the ring contradicted. Also: the first verdict on the BACKGROUND (its tiles carry no state, so it was free), the first mark whose lifetime ends because someone ELSE acted, and the split that came out of it — a board mark dies when the board moves, its pill does not. Its bands are inert pieces wearing the shared tile face, and they flash for a teammate's solve |
| codenamesduet | — | the keycard's `.triPeer` / `.triMine` triangles (which are the game, not attribution), and a board where only one seat can act |
| setgame | — | its own in-flight + arriving/leaving marks predate all of this and are the richest set anywhere; `--setgame-*` tokens want folding into the shared ones. Selection is a `box-shadow` ring and must become a border |
| stackdown | — | the ambiguous-letter mark — a red border *and* a red ring today, and the first user of the **UI-problem** channel above: it is not a verdict, so it loses the outcome red and never becomes a fill. Plus a board whose pieces OVERLAP |
| strands | — | the same ambiguous-letter treatment (see stackdown), the earned hint economy (the **hint** channel's first real user), the move-end state mark, and a history-viewer ring still drawn in gold from when the viewer was yellow — it takes the shared blue like every other game's |
| letterboxed | — | a board whose primary mark is a LINE between cells, not a tile fill |
| scrabble | — | premium squares (puzzle notation vs progress), the drag-and-drop prospective verdict (`.dropOk` / `.dropNo`), and the share-preview frame |
| bananagrams | — | drag-and-drop, its own grid cursor, and the one documented desktop-only layout |
| crosswords | — | printed notation on the cell (circles, shades, break marks), `.peerFrame`, and the position channel's other half |
| boggle | — | packed tiles where a hover shadow may not read; its own tile |
| spellingbee | — | hexes: not squares, packed edge to edge, and `.hexFlash`'s replay-on-repeat lifetime |
| wordwheel | — | same hexes, same questions |
| wordiply | — | OPEN: at terminal its verdict pill takes over the KEYBOARD's space, where wordle leaves that space empty and keeps the verdict above. Not worth categorising until its turn |

### The sanity check: a converted game should have LESS CSS

Not an invariant, but the smell test for whether a conversion actually converted
anything. The whole point is that marks move to common and a game stops carrying
special cases, so its own stylesheet should get *smaller* — and if it doesn't,
either the game kept a private version of something shared, or it invented a mark
instead of using one.

One qualifier: **growth is fine when it is traceable to a mark the game never
had** — the board-scope marks, an identity dot, an in-flight dim — and a warning
when it is a special case. Measure rules and declarations rather than lines; this
repo's comment density would drown the signal.

Where the first three landed (against `788193d0`, the branch point):

| game | rules | declarations | |
|---|---|---|---|
| waffle | 24 → **12** | 50 → **41** | plus its `theme.css` deleted outright |
| wordle | 19 → 21 | 59 → 59 | a wash: lost `.busy` + the reject ring, gained `.letter` + `.inFlight` |
| psychicnum | 6 → 7 | 26 → 31 | grew, and legitimately: it GAINED the identity dot. Its `theme.css` went too |
| connections | 23 → **17** | 67 → **56** | the first conversion that only SUBTRACTED: out went the wrong-guess shake + its keyframes + its reduced-motion block, and the band stopped re-declaring the tile box it now composes |

And the aggregate, stated honestly so nobody quotes the check as already proven:
common grew a lot on the way here (`PlayArea.module.css` 34 → 66 rules), because
the whole shared framework was built while only three games were converted. The
check is **per game, after its conversion**; the repo-wide total only turns
positive as the remaining thirteen amortise what is already there. Each further
game should add roughly nothing to common and take something out of itself.

Cross-cutting, not owned by any one game:

| | departure |
|---|---|
| history viewer | DONE — the shared frame was yellow; it is now the blue `--view-history-color`, so yellow means only "attention" |
| in-flight marks | was "missing in all but three games"; now shared (`.dimInFlight`) and worn by the four converted ones. Still absent everywhere else |
| identity, transient | DONE as a CHANNEL, local as an implementation — connections draws `.peerPick`, an inset border in the picker's colour held clear of the selection edge. It lived in common until the palette sweep and moved into connections: one user, and crosswords' peer cursor will differ in inset and thickness, so promote on evidence |
| the shared tile | see the next section — nine boards still roll their own |

## Per-game check: is this board's tile the SHARED tile?

Ask it on every conversion, because the answer is usually no. The shared pair —
`.tileFace` for the box and `.tile` for "and you can act on it" (common
PlayArea.module.css) — is worn by **five** boards today: waffle, connections,
psychicnum, codenamesduet, and wordle (the face alone; its tiles are inert).
connections wears it twice over, since its solved-category BANDS are "one long
tile" and now compose the face rather than re-declaring the same box. Nine others
roll their own:

| board | its own tile lives in |
|---|---|
| boggle | `PlayArea.module.css` |
| spellingbee | `Letters.module.css` (hexes) |
| wordwheel | `Wheel.module.css` (hexes) |
| stackdown | `Board.module.css` |
| strands | `Board.module.css` |
| setgame | `Card.module.css` |
| scrabble | `Board.module.css` + `Rack.module.css` |
| bananagrams | `PlayerBoard.module.css` |
| crosswords | `Grid.module.css` (cells) |

Some of those are genuinely different objects — a hex is not a square, a crossword
cell carries printed notation, a scrabble square carries a premium — and they will
keep their own geometry. But **the look-and-feel underneath is the same thing in
all of them**, and a board that defines its own radius, border, shadow and ink is
a board that drifts: it is how we ended up with five hover treatments and two
selection idioms in the first place.

So on each conversion, separate the two questions. *Does this piece need its own
shape?* Often yes. *Does it need its own box, edge, shadow, and token names?*
Almost never — and where it does, that is worth a sentence in the game's own
stylesheet saying which shared value it is departing from and why.

## The audit — what doesn't fit

Run 2026-08-16 against every game's board/tile CSS. The point was **not** to
produce a to-do list but to find things we already do that the vocabulary above
has no room for. It found six, and one of them is load-bearing enough to
reopen a decision.

### 1. Selection is a BACKGROUND FILL today, not a border

The framework says border-width. The shared `.tile` says otherwise, in as many
words:

```css
.selected { --tile-bg-color: var(--tile-selected-bg); }   /* dark fill, light ink */
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

**How identity resolves:** the mark is an **INSET RING** in the picker's color,
not the border — connections draws one and crosswords' `.peerFrame` does the same
thing, arrived at independently, so the convention already existed and only needed
a name.

**On a shared board, EVERY pick is ringed, mine included; on any other board, none
are.** This started life as "mine stays neutral, a peer's carries their color" —
I don't need telling which tiles I just clicked — and that was wrong for the same
reason it is wrong for the permanent dot: a board where only *some* picks carry a
color reads as missing data rather than as "the unmarked ones are yours". So the
transient ring and the permanent dot follow one rule, which is easier to hold than
two. What "shared" means is coop with somebody else in the game: solo, every pick
is mine and a color is decoration on top of the selection border; in compete the
selection never leaves the client that made it.

Inset is what makes it compose. One piece can be selected (thick border), under my
cursor (border color) and ringed as someone's (inset ring) at the same moment,
each at its own radius, with nothing overriding anything. It rides on `box-shadow`,
which this doc's table gives to hover — not a collision, since hover is an *outer*
shadow and a shadow list carries both, but worth knowing before a third shadow is
added.

**The ring sits a couple of pixels INSIDE the edge**, not flush against it
(connections' `--connections-peer-inner-border-inset`). A picked tile is usually selected too, so the color and the
thick black selection border would otherwise meet as one band and read as a
single two-tone edge; the gap shows the tile's own fill between them, which is
what keeps them two marks saying two things. It matters most when a player's
color is dark enough to be mistaken for the selection black.

That is the TRANSIENT half of identity: someone is doing something here, now. The
PERMANENT half — "moth called this one", forever — is the **player-color dot**
(`<Dot>`, shared with the turn log and opponent strip), and psychicnum ships it.
Keeping the two apart is deliberate: one visual for both lifetimes would mean discs
blinking in and out as a teammate changed their mind.

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

`--wordle-gray-fill-color` could not be lightened past about `#959595` without dropping
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

**Keyboard navigation** is now planned in detail —
[keyboard-nav-plan.md](keyboard-nav-plan.md) — for the five games where clicking
pieces IS the move (waffle, psychicnum, connections, codenamesduet, strands). The
marks it uses are all above; the plan holds the grammar (`Space` toggles, `Enter`
alone commits), the movement model, and the rollout. It folds in here as each game
lands.

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
