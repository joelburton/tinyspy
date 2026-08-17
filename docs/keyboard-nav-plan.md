# Keyboard navigation for the board games — the plan

**A PLAN, not a description.** It is here to be built and then deleted: the
durable parts (the marks, the channels, the grammar) fold into
[tile-feedback.md](tile-feedback.md) and [keyboard-shortcuts.md](keyboard-shortcuts.md)
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

- Three of the five commit on a *click* today — codenamesduet and psychicnum on the
  first pick, waffle on the second. Those keep their mouse behaviour exactly.
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
| border **colour** | **the cursor** — where the keyboard is pointing | new: position-by-input |
| border **width** | my selection (thick) | existing |
| **inset ring**, member colour | a peer is holding this piece | existing in connections + crosswords; to be named |
| background **shade** | where my move currently *ends* (strands' tail, letterboxed's chain) | state |

Four consequences of that table:

- **The look already exists.** `HomePage.module.css` draws the list cursor as
  `outline: 2px solid var(--color-accent)` inset — so the app already teaches
  "thin blue ring = where the keyboard is pointing", and the boards should adopt it
  rather than invent one. It gets **its own token** initialised to the accent, so
  the meaning has one value app-wide and can move away from
  `--color-member-blue` (currently the same hex) without touching a call site.
- **Cursor and selection compose** — width says "in my move", colour says "I am
  here", and neither needs to know about the other. A selected-and-cursored tile
  is a thick blue edge, which is what we want and not a special case.
- **The peer ring nests inside both.** connections draws it as
  `inset 0 0 0 4px <member colour>` and crosswords as `.peerFrame`; because it sits
  *inside* the edge, moth's ring and my cursor show at once and neither overrides
  the other. It lives on `box-shadow`, which the channel table gives to hover —
  not a collision (hover is an *outer* shadow and a shadow list carries both) but
  the table should say so.
- **The move's end is STATE, not a cursor.** In strands, arrowing over a different
  letter must not change the tail — only submitting does. So "where my word
  currently ends" is a property of the move in progress, drawn as a shade of the
  state colour, and it settles the position channel the doc left open: crosswords'
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

Identical rules for boards and for the home/club lists, because this is the part
that will drift if it is not shared:

- **The cursor is hidden until you press an arrow.** A mouse player may never
  learn the feature exists.
- **A click sets the cursor and hides it**, so switching back to keys resumes
  where your hand left off.
- **An inert board takes no cursor at all** — not your turn, terminal, viewing
  history. A cursor is a promise you can act.

Extract *only* that (a dozen lines of state), not the steppers: 1-D clamping and
2-D-with-absences are genuinely different, and forcing them together is
contortion.

**The lists change too**, for consistency: they show their ring as soon as the
list takes focus today, and `Space` scrolls the page (unhelpful, and it moves the
viewport away from the cursor). After: hidden until an arrow, set-and-hidden by a
click, `Space` swallowed and inert. **`Enter` picks; there is no selection step**,
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
bugs ([reference: the board focus rule](ui.md)). The cursor is React state and a
rendered mark, with keys captured at the window.

## Two prerequisites, landing first

Both are wanted regardless of whether the cursor feature survives contact.

**1. `⌥Z` takes over the shuffle, in all four shuffle games** (boggle,
spellingbee, wordwheel, psychicnum). `Space` is the board shuffle in those today,
and freeing it for one app-wide meaning is the point: if `Space` meant shuffle in
boggle and activate in psychicnum, that is exactly the drift this project exists
to remove. `⌥Z` is free (`⌥S` is not — it opens the scratchpad), and the Z-shape
is a good mnemonic for a shuffle.

**2. psychicnum drops its `EntryRow`.** It is the only arrow collision in the
whole set (`useArrowHistory` binds `↑`/`↓` to recall-last-guess and clear-entry),
and typing a word that is visible on screen was always the odd input. It goes with
the `words.includes(guess)` pre-check and its "Not on the board" pill (typing was
the only way to name a word that isn't there). The below-board slot becomes
waffle-shaped: the pill area alone, height reserved, no reflow. Under the pace
rule this costs nothing — the entry *was* direct addressing, but addressing is
only worth paying for in a race.

## Build order

**waffle first**: already converted, and it exercises both hard parts at once —
absent coordinates (its holes) and a selection that must stop auto-committing
(today the second click *is* the swap; the keyboard needs to hold two selections
and wait for `Enter`). That is the one real behaviour change the feature asks of a
game, and the mouse keeps its current two-click swap.

Then **psychicnum** (after its prerequisite), **connections** (peer rings + a
collapsing grid), **codenamesduet** (guesser only — the clue-giver's input is a
real text field and arrows there belong to the field), **strands** last, since it
brings the move-end state mark with it.

## Per-game notes

| game | absent coords | `Space` selects | `Enter` commits | extra |
|---|---|---|---|---|
| waffle | 4 holes | up to **two** tiles | the swap | must hold 2 selections without firing |
| psychicnum | trailing cells | one word | the guess | needs a submit trigger it lacks today |
| connections | — | up to four | the group | index clamps when a band collapses; peer rings nest |
| codenamesduet | — | one word | the guess | guesser only; needs a submit trigger |
| strands | — | letters, adjacency-gated | the word | tail-end is state; `⌫` steps back one |

## The `⏎ to guess` hint

In the three auto-commit games, `Enter` is an invisible affordance — mouse users
have no submit button to learn it from. Every one of them already has a
height-reserved below-board slot, so it can carry a **`⏎ to guess`** hint *only
while a keyboard selection is pending*: it teaches the key exactly when it is
relevant and never touches the mouse experience.

## Decided, so nobody re-opens them

- **Cursor state lives wherever that game's selection already lives** (waffle's
  `Board`, psychicnum's and connections' `BoardCol`). The two must agree, so they
  should be neighbours.
- **Read-only mid-move** (a peer ends your turn while you navigate): keep the
  index, hide the mark, ignore the keys — it returns where you left it.
- **The history viewer wins the first keypress.** Every one of these games exits
  the viewer on any key today, so an arrow while viewing returns to live and the
  next arrow moves. Existing behaviour; leave it.
- **`Space` toggles**, so a second press deselects — matching waffle's
  tap-the-same-tile-to-cancel and connections' toggle.
- **No scroll-into-view.** The no-scroll invariant means the whole board is always
  on screen, so a cursor can never be off-view. Free, and only the lists needed it.

## Code

**Compose `useBoardCursorKeys`** (`common/hooks/input/`) rather than writing a
second keyboard. It already owns the load-bearing parts — the window listener via
`useGlobalKeyHandler`, the modifier bail, the focused-field guard that stops a
keystroke meant for chat reaching the board, and the skip-Enter-when-a-button-has-
focus nicety. Duplicating those is how you ship a board that steals typing.

It needs: `onLetter` / `onBackspace` made optional, and an `onSpace` distinct from
its current `enterOnSpace` (bananagrams' "Space also peels"). That edits a hook
**scrabble and bananagrams depend on**, so their suites get run deliberately, not
incidentally.

Above it, a new hook owns what is actually new: the cursor index, the stepper, the
visibility rule, and activation. Per game that leaves a geometry, an
`isActionable` predicate, and an `onActivate`.

## Tests

- The **reachability invariant** over each geometry (see above).
- Per game: arrows move, `Space` toggles, `Enter` commits, `⌫` clears, an inert
  board ignores all four, and the mark stays hidden until an arrow.
- Every one verified by **planting the break first** — a guard that cannot fail is
  worse than none.
