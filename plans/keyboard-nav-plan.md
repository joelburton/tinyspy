# Keyboard navigation for the board games — the plan

**A PLAN, not a description.** It is here to be built and then deleted: the
durable parts (the marks, the channels, the grammar) fold into
[tile-feedback.md](tile-feedback.md) and the games' docs
as each game lands, and this file goes away when the last one does.

The feature: **arrow keys move a cursor over a board's pieces, `Space` selects,
`Enter` commits.** Its purpose is not novelty — repeated mouse clicking hurts, and
five of our games currently have no keyboard path to a move at all.

## Which games, and the three tests that decide it

**In: waffle · psychicnum · connections · codenamesduet · strands.** Five, and all
five are rectangular grids, which is why the first stepper is the only stepper.

A game is out if it fails any of these:

1. **Is the board the input?** In boggle, spellingbee, wordwheel, wordle and
   wordiply the board is a *reference you read* — the letters you type are the
   answer, not a route to a piece. Nothing to navigate.
2. **Is the input the bottleneck?** Stepping costs time per move, which only
   matters when time per move is the constraint. **setgame** is a race and already
   letters its cards on a fixed grid, so a letter *is* a card — addressing beats
   stepping there. In a thinking game, three arrow presses versus one keystroke is
   noise.
3. **Does the geometry have a sane arrow mapping?** **stackdown** is a mahjong
   stack — `(x, y, z)` on a 9×9 grid with tiles deliberately overlapped, so "one
   cell left" isn't well defined and a player would have to learn the layout
   rather than the keys.

**letterboxed is out for a reason worth keeping:** its twelve letters are unique,
so typing the letter *is* the address, for free — no labels to add. The general
rule: **addressing wins when the address is one keystroke.** psychicnum's and
connections' words are unique too, but five to nine keystrokes and they have to be
spelled (`GRATIFIER`), so addressing stops being free and stepping wins.

## The grammar

One grammar for all five games, and for the home/club lists as far as it applies:

| key | means |
|---|---|
| arrows | move the cursor one cell |
| `Space` | **toggle** the piece under the cursor into / out of my selection |
| `Enter` | **commit** |
| `⌫` | clear — one step back where order matters (strands' trace), everything where it doesn't (connections' four) |

**`Enter` is the only key that ever commits, in every game.** That is the whole
safety property, and it is worth the asymmetry it creates with the mouse:

- Two of the five commit on a *click* today — codenamesduet on the first pick,
  waffle on the second. Those keep their mouse behavior exactly. psychicnum's
  click only picks; its Submit button commits, and that stays too.
- **The mouse's confirmation is spatial; the keyboard's has to be temporal.**
  Getting a pointer onto a tile is deliberate aiming, so a click can safely
  commit. Arrow-stepping has no aim — you can be one cell off from where you think
  you are — so the confirmation is a second keypress instead.
- The alternative ("`Space` is a click") only looks like one rule: *click* means
  three different things across these five, so a player could never know whether
  the key under their thumb was about to make a move. In codenamesduet that move
  can hit the assassin.

Under this grammar waffle is not a special case: it is connections with n=2.

**`⌫` is not a new key** — connections already clears its whole selection with it,
stackdown returns the most recently picked tile, strands drops the last tile from
the trace. The rule only needs stating so the rest inherit it.

## The marks

Nothing here is new machinery; it is the [tile-feedback](tile-feedback.md)
channels applied to a fourth question ("where am I?").

| radius / property | mark | channel |
|---|---|---|
| **outline** ring, `--chrome-cursor-ring` | **the cursor** — where the keyboard is pointing | new: position-by-input |
| border **width** | my selection (thick) | existing |
| **inset ring**, member color | a peer is holding this piece | existing in connections + crosswords; to be named |
| background **shade** | where my move currently *ends* (strands' tail, letterboxed's chain) | state |

What follows from that table:

- **The look already exists.** `<SelectionList>`'s `.cursor` draws the list
  cursor as `outline: var(--chrome-cursor-ring)` — 2px of `--chrome-cursor-color`,
  its own token per theme (core-css/patterns/focus-ring.css) — so the app already
  teaches "thin blue ring = where the keyboard is pointing", and the boards adopt
  that ring rather than invent one. Only the offset is the board's own:
  focus-ring.css leaves a board piece's offset to its board.
- **Cursor and selection compose** — the border says "in my move", the outline
  says "I am here", and neither needs to know about the other. A
  selected-and-cursored tile is the dark picked border inside the blue ring, which
  is what we want and not a special case.
- **The history ring never meets it.** psychicnum's `.historyTile` is also an
  outline, but it only draws while a past turn is open, and a board in the
  history viewer takes no cursor.
- **The peer ring nests inside both.** connections draws it as
  `inset 0 0 0 4px <member color>` and crosswords as `.peerFrame`; because it sits
  *inside* the edge, moth's ring and my cursor show at once and neither overrides
  the other. It lives on `box-shadow`, which the channel table gives to hover —
  not a collision (hover is an *outer* shadow and a shadow list carries both) but
  the table should say so.
- **The move's end is STATE, not a cursor.** In strands, arrowing over a different
  letter must not change the tail — only submitting does. So "where my word
  currently ends" is a property of the move in progress, drawn as a shade of the
  state color, and it settles the position channel the doc left open: crosswords'
  keyboard cursor is a *cursor*; strands' last-tapped letter and letterboxed's
  chain end are *move state*.

## Movement: pure geometry

**Arrows move exactly one cell. The predicate only gates `Space`.**

Skipping dead cells is the obvious design and it is wrong twice over:

- **It can strand a cell.** With "scan for the next live cell", a cell is
  reachable only if its row *or* column holds another live one. A 5-word
  psychicnum board lays out 3×2 — decide `(1,0)`, `(1,2)` and `(0,1)` and `(1,1)`
  can never be reached again. Three guesses out of seven.
- **It makes the same keypress mean different things over time.** `←` would be
  "one left" early and "three left" later. Pure geometry is learnable; state-
  dependent movement is not.

The cost is a few extra presses on a nearly-finished board. If that turns out to
be annoying, the refinement is *skip when there is a live cell in that direction,
step one when there isn't* — which keeps reachability. Ship the simple model
first.

**Shape versus state.** The stepper knows which coordinates **exist** (fixed for
the game's life); the predicate knows which existing cells are **actionable right
now**. waffle's four holes are shape — permanently skipped, because a hole is
negative space with no piece to draw a border on and nothing `Space` could ever do
there. Every "decided / banded / spent" case is state, and the cursor rests on
those happily: the mark shows, `Space` does nothing, exactly as clicking one does
today. psychicnum has both (its `⌈√N⌉` grid leaves trailing coordinates absent).

**The reachability invariant**: for any stepper, every existing coordinate must be
reachable from every other. A cheap graph walk over the stepper's own output,
written once, run per geometry — and verified by planting a break, not by watching
it pass.

## Visibility, and the two lists

### The app has two kinds of cursor, and only one of them hides

The rules below are about the second kind. Naming the first is what keeps
someone from later "fixing" it into consistency with them:

- A **geographic cursor** answers *where am I on this board*. The player needs
  it to read the board at all, so it appears immediately and never hides.
  Crosswords' grid is the clearest case — the cell you are typing into, and
  which way the letters run — and scrabble's and bananagrams' shared
  `gridCursor` is the same thing. These are OUT of this plan's scope and stay
  as they are.
- A **selection cursor** is an alternative to clicking. It answers *which row
  or tile would Enter act on*, and a player who never touches an arrow key has
  no use for it — which is why a mouse player should never see one. Every
  cursor this plan adds is one, and so is `<SelectionList>`'s.

The test between them: if hiding the cursor would make the board harder to
READ, it is geographic. If hiding it only costs a keyboard affordance nobody
using a mouse wanted, it is a selection cursor.

### The rules for a selection cursor

Identical for boards and for the home/club lists, because this is the part
that will drift if it is not shared:

- **The cursor is hidden until the player asks for it.** A mouse player may
  never learn the feature exists.
- **The first press REVEALS rather than moves**, for a *relative* move — an
  arrow, PageUp/PageDown. "One from where I am" has no honest answer before
  there is a "where I am", so the first press paints the resting cell and the
  next one steps.
- **An ABSOLUTE move reveals and moves in one press.** `Home` and `End` name a
  destination rather than a direction, so revealing at the resting row instead
  would ignore what was asked.
- **A key that acts ON THE CURSOR is INERT while it is hidden** — it neither
  acts nor reveals, and **only a movement key reveals**. On a list that key is
  `Enter`; on a board it is `Space`. Acting on a place the player cannot see
  would do something they did not choose (on a list, Enter navigates you off
  the page). Revealing would be worse than doing nothing: the natural response
  to a key that seems dead is to press it again, and that second press would
  then act. So an arrow is the only way in.
- **A board's `Enter` is not one of those keys.** It commits the SELECTION,
  which is always drawn (the picked tile's border), so it acts whether the
  cursor shows or not — a click and then `Enter` makes the move. It is also one
  action with the Submit button, and an action cannot be off for its key and
  on for its button.
- **A click sets the cursor and hides it**, so switching back to keys resumes
  where your hand left off.
- **An inert board takes no cursor at all** — not your turn, terminal, viewing
  history. A cursor is a promise you can act.

Extract *only* that (a dozen lines of state), not the steppers: 1-D clamping and
2-D-with-absences are genuinely different, and forcing them together is
contortion. **It is extracted with the first board** (psychicnum), and
`<SelectionList>` moves onto it in the same change rather than keeping its
inline copy.

**The lists changed first.** `<SelectionList>` showed its ring as soon as the
list took focus, which meant a mouse user landing on the homepage saw a blue
ring on the first club having touched nothing (both page lists autofocus), and
clicking a row painted one too. It now follows the rules above — **done
2026-09-11**, ahead of the boards, because the lists area was open and the
behavior is the same dozen lines the boards will need. `Space` was already
swallowed and inert there. **`Enter` picks; there is no selection step**,
because a list row has nothing to accumulate — inventing one to complete the
grammar would be inventing state to satisfy symmetry. The confirm step exists in
games because 2-D stepping is imprecise and a wrong commit is costly; a list is
1-D and a wrong `Enter` takes you somewhere you can leave instantly.

Two differences from boards, both justified: the **lists hold real focus** (the
list is the tab stop, the ring says which row) where boards hold none — 25 tiles
would bury every real control in the tab order — and the focused list's border
warming to the accent stays, because with the ring hidden it is what says "arrows
work here".

**No DOM focus on a board, ever.** A focused tile is promoted to `:focus-visible`
by the next keystroke and the ring sticks; that is the whole focus-sweep family of
bugs ([reference: the board focus rule](../docs/ui.md)). The cursor is React state and a
rendered mark, with keys captured at the window.

## Two prerequisites, landing first

Both are wanted regardless of whether the cursor feature survives contact.

**1. `⌥Z` takes over the shuffle — DONE.** `act-shuffle` carries `⌥Z` in all
four shuffle games (boggle, spellingbee, wordwheel, psychicnum), so `Space` is
free for one app-wide meaning.

**2. psychicnum drops its `WordEntryArea` — DONE.** It is the only arrow collision in the
whole set (`act-recall-last` and `act-clear-entry` bind `↑`/`↓`), and typing a
word that is visible on screen was always the odd input. It goes with the
`words.includes(guess)` pre-check and its `not_on_board` answer (typing was the
only way to name a word that isn't there); the local `already_guessed` check
stays. **The entry also carries psychicnum's only Submit button**, which is a
phone's only way to guess — so the below-board slot becomes connections-shaped,
not waffle-shaped: **Clear · Submit**, height reserved, no reflow. Under the pace
rule this costs nothing — the entry *was* direct addressing, but addressing is
only worth paying for in a race.

## Build order

**psychicnum first — DONE 2026-09-24.** It built the shared pieces, all in
`common/board-cursor/`: `useSelectionCursor` (which `<SelectionList>` runs
too), `stepCell`, `useBoardSelectionCursor` over the two, and
`reachability.fixture.ts`. See
[psychicnum — the first rollout](#psychicnum--the-first-rollout).

A later game brings a `BoardShape`, a reachability test over it, and an
`onToggle`, and draws the ring from the `cursor` it gets back. **It binds its
own Submit** (Enter), beside the button it draws — the hook has no commit, so
a game's Submit keeps its own rules (connections hides it in the viewer and
says "Submitting…"). **Check its `Help.tsx` too**: the rules text saying how
to make a move is written by hand, so it has to learn the arrows, Space and
Enter (the key list under it is automatic).

**connections second — DONE 2026-09-24.** Space is a click on the ringed tile
(`handleToggle`, so the union rule and the broadcast come with it); its own
`act-submit` stayed as it was; the cursor clamps onto the nearest tile when a
band takes a row away (`clampCell`); and the ring became the shared
`.selectionCursor`.

Then **waffle**, which brings the one real behavior change the feature asks of a
game: a selection that must stop auto-committing (today the second click *is*
the swap; the keyboard needs to hold two selections and wait for `Enter`). The
mouse keeps its current two-click swap. Then **codenamesduet** (guesser only — the clue-giver's input is a
real text field and arrows there belong to the field), **strands** last, since it
brings the move-end state mark with it.

## psychicnum — the first rollout

**DONE 2026-09-24.** Kept until the plan goes, as the worked example the later
games follow.

### What changes for a player

| today | after |
|---|---|
| Click a tile to pick it; Submit or `Enter` guesses | **Unchanged** |
| Type a word into the entry below the board | **Gone** — no typing |
| `↑` recalls the last guess, `↓` clears the entry | **Gone** — the arrows move the cursor |
| Naming a word not on the board answers "Not on the board" | **Gone** — only a board word can be picked |
| The entry row: Delete · the typed word · Submit | **Clear · Submit**, connections-shaped; the picked tile's border shows the word |
| — | **Arrows**: the first press shows the ring; each press after moves it one cell |
| — | **`Space`**: picks the word under the ring, or un-picks it; inert while the ring is hidden |
| — | **`⌫`**: un-picks |
| — | A click moves the ring to that tile and hides it |

- **A missing cell is a wall.** The board is `cols = ⌈√N⌉` with a short last row,
  so `↓` into a cell the last row lacks does nothing. A decided tile is not a
  wall: the ring rests on it and `Space` does nothing, as a click does nothing.
- **No ring, no keys** when it is not my turn, when I am out of guesses, at game
  over, and in the history viewer (whose first arrow returns to live, as any
  key does today).
- **Shuffle (`⌥Z`)** rearranges the words under a ring that stays on its cell.
  The pick belongs to the word, so it moves with the word.

### The steps

1. **The new action**, `act-toggle-tile` on Space — see [Code](#code).
2. **The selection-cursor hook**, in `common/board-cursor/` (moved out of
   `shared/`, since `<SelectionList>` in `common/lists` uses it and common never
   imports shared): the cursor cell, the visibility rules, and the stepper for a
   `cols × rows` grid with a short last row. `<SelectionList>` moves onto its
   visibility rules.
3. **The reachability test** over every psychicnum board size (5–20 words),
   verified by planting a break.
4. **psychicnum's `BoardCol`**: prerequisite 2 (the entry, the recall state, the
   pre-check and `not_on_board` — in `answer.ts`, `answer.test.ts` and
   `doc.md`); the cursor state beside the pick; its own `act-submit` on the
   Submit button; Clear is `act-clear-selection`, as in connections.
5. **psychicnum's `Board`**: a `cursor` prop and the ring, `outline:
   var(--chrome-cursor-ring)` with an offset tuned to the board. A click sets the
   cursor hidden. Tiles still never take DOM focus.
6. **Tests** — the list under [Tests](#tests), in `PlayArea.test.tsx`; the typing
   tests go. `psychicnum-mobile.e2e.ts` and `psychicnum-turn-order.e2e.ts` tap
   Submit by name, which keeps its name.
7. **Docs**: `psychicnum/doc.md` ("Click a tile or type it"),
   `board-cursor/doc.md` (its second kind of cursor), and the durable parts of
   this plan into [tile-feedback.md](tile-feedback.md).

## Per-game notes

| game | absent coords | `Space` selects | `Enter` commits | extra |
|---|---|---|---|---|
| waffle | 4 holes | up to **two** tiles; a third is refused | the swap | must hold 2 selections without firing; its own `act-submit` on Enter, labeled "Swap"; a tap acts on what is picked (with two picked it starts over); no cue |
| psychicnum | trailing cells | one word | the guess | Submit stays, as the commit's button; no cue |
| connections — **DONE** | — | up to four | the group | index clamps when a band collapses; peer rings nest |
| codenamesduet | — | one word | the guess | guesser only; its own `act-submit` on Enter, no button, labeled "Guess"; no cue |
| strands | — | letters, adjacency-gated | the word | tail-end is state; `⌫` steps back one |

## The `⏎ to guess` cue

In the two auto-commit games (codenamesduet, waffle), `Enter` is an invisible
affordance — there is no submit button to learn it from. Both already have a
height-reserved below-board slot, so it can carry a **`⏎ to guess`** cue *only
while a keyboard selection is pending*: it teaches the key exactly when it is
relevant and never touches the mouse experience.

**psychicnum takes no cue**: its Submit button is on screen, and its hover
bubble carries the shortcut (`Submit · ↵`).

**codenamesduet takes no cue either** (Joel, 2026-09-24): its below-board line
is already full — the clue, and the guesser's Pass & End Turn — and a cue
would not fit. Help and the key list ("Guess ↵") teach Enter. A way to teach
it on screen is a Someday in `codenamesduet/todo.md`.

**waffle takes no cue** (Joel, 2026-09-24), though its slot has the room:
Help and the key list ("Swap ↵") teach Enter, and a Someday in
`waffle/todo.md` holds the question.

## Decided, so nobody re-opens them

- **Cursor state lives wherever that game's selection already lives** (waffle's
  `Board`, psychicnum's and connections' `BoardCol`). The two must agree, so they
  should be neighbors.
- **Read-only mid-move** (a peer ends your turn while you navigate): keep the
  index, hide the mark, ignore the keys — it returns where you left it.
- **The history viewer wins the first keypress.** Every one of these games exits
  the viewer on any key today, so an arrow while viewing returns to live and the
  next arrow moves. Existing behavior; leave it.
- **`Space` toggles**, so a second press deselects — matching waffle's
  tap-the-same-tile-to-cancel and connections' toggle.
- **No scroll-into-view.** The no-scroll invariant means the whole board is always
  on screen, so a cursor can never be off-view. Free, and only the lists needed it.

## Code

**The keys are bound actions**, never a window listener: the one dispatcher
brings the modifier bail, the focused-field guard that stops a keystroke meant
for chat reaching the board, and the skip-Enter-when-a-button-has-focus nicety
with any action. Duplicating those is how you ship a board that steals typing.

**DONE:** `useBoardSelectionCursor` binds `act-move-cursor` and the new
`act-toggle-tile` (Space) itself, over `useSelectionCursor` and `stepCell`;
the game binds its Submit. It does not compose `useBoardCursorKeys`, which
stays the letter-grid hook: that one always binds a commit, and the commit
here is the game's ([board-cursor/doc.md](../src/common/board-cursor/doc.md)).
Per game that leaves a shape, an `onToggle`, and a Submit.

## Tests

- The **reachability invariant** over each geometry (see above).
- Per game: arrows move, `Space` toggles, `Enter` commits, `⌫` clears, an inert
  board ignores all four, and the mark stays hidden until an arrow — including
  that the FIRST arrow only reveals, that `Space` is inert while hidden — it
  does not pick and does not reveal — that `Enter` commits a clicked pick with
  the mark hidden, and that a click leaves it hidden.
- Every one verified by **planting the break first** — a guard that cannot fail is
  worse than none.
