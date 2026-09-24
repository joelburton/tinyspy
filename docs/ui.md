# UI

The ideas the whole frontend is built on — read this before diving into the
code. Each section is a principle and where it lives; the detail is in the
folder that implements it. Values and the color system are
[tokens.md](tokens.md); the play surface is [playarea.md](playarea.md); the
phone is [mobile.md](mobile.md).

## Audience and platform: desktop-first

The play surface is a laptop or desktop browser, and styles are written for
it. A phone gets a real layout, but always as a `max-width` override of the
desktop rule (`@media (--mobile)`), never mobile-first — a `min-width` query in
a diff is the sign a rule got written backwards. The single breakpoint and what
each screen does on a phone are [mobile.md](mobile.md).

## Layout stability

**A game page's shape is allocated at mount, and that shape doesn't change
during play.** State rotates content *within* slots; it doesn't resize, move or
reflow the slots. A status line is sized for its longest string, the feedback
slot is the same height empty or full, a long list scrolls inside a fixed frame,
and a control that isn't available right now is disabled in place, not removed.
NYT Connections is the model: the grid is the grid from start to finish, and
what changes is which tiles are dark and what the feedback says.

It matters because the boards want every pixel (a banner that grows by a line is
a line the crossword doesn't get), and because a tile jumping when a message
above it wraps breaks the feeling of playing a game.

**The #1 offender is removing a flow element on a state change.**
`{isTerminal ? … : <WordEntryArea/>}` looks harmless, but the board above is
usually `flex: 1`, so when the row vanishes the board grows into the space.
Every time you write `{cond && <X>}` or a state ternary in a play surface, ask:
does `<X>` take layout space, and does a sibling grow to fill? If so, keep it
mounted and rotate its content, hide it with `visibility: hidden`, or give its
slot a fixed height. The pause gate is the model: it renders the play area OR
the pause banner in the same slot, never both.

**The exception is the game itself.** A board transition that IS the game —
connections' solved bands growing into the grid — is allowed: *if it's a side
effect of state changing, fix the layout; if it's the state change you're
celebrating, let it happen.* Loading is exempt too; the rule is about reflow
during play.

## Page-height fits the viewport

**A page is exactly the viewport's height, and the document never scrolls.**
Content that can grow — chat, a game log, the club's games — scrolls inside its
own frame (`flex: 1; min-height: 0; overflow-y: auto` in a bounded column), so
the header, the status slots and the action rows are always where the player
expects them, and a trackpad nudge can never push a board half off-screen.
Together with layout stability: the shape doesn't change during play, and it
never grows past the window. When space runs out, split into columns before
letting anything grow. The shared bound is `core-css/patterns/page.css`.

## Where a message goes

**Which surface a message gets is a question of whose news it is**, not how
important it is:

| surface | whose news | example |
|---|---|---|
| the **local** feedback slot, under the board | **my own** action, or a standing condition I'm in | "Not a word", "Waiting for ● moth…" |
| the **global** slot, in the page header | **other people's** news | a chat line, a partner's move narrated |
| a **toast**, bottom right | an **announcement** — including my own action on a page with no local slot | an invitation, "Wordle deleted" |
| a **fault** modal | the app itself is **broken** | a bug, a dead network |

"Waiting for ● moth…" is the case that tests it: it names a peer, but it says
*I* can't act, so it is mine and goes in the local slot.

### Feedback pill

Both slots draw the same pill, one look in every game. A message is a **kind**,
made by a named constructor, and the kind decides everything else — its fill,
how long it stays, what takes it away, and which message wins when two are
live. A condition that holds for a while (it's not your turn) is shown on the
rising edge of an effect and retracted in its cleanup, so "still true" and "on
screen" are one fact. **The outcome follows the event, not the viewer's
stake**: an opponent's found word is green like a teammate's, and the actor's
disc says *who* ([outcomes.md](outcomes.md)). The mechanics are
[`common/feedback`](../src/common/feedback/doc.md).

### Faults

A **fault** is a failure nobody planned for, and it looks unlike every answer:
a blocking modal, so "did a box pop up?" separates *the game refused my move*
from *the app is broken* before anyone reads a word. No call site raises one —
the database wrapper does, on its way back — and the same failure still lands
on the pill or the form line, as an escalation rather than a replacement.
[`common/faults`](../src/common/faults/doc.md), and
[envelopes.md](envelopes.md) for how a failure is classified.

### Toasts

A **toast** is an announcement, not a verdict: neutral chrome with a colored
stripe, stacked in the corner above chat and every window. The club page is why
they exist — it has no local slot, so "I just deleted that game" would
otherwise fall to the header, which is other people's and costs the members'
presence strip. [`common/toasts`](../src/common/toasts/doc.md).

## Terminal results — the moment vs the record

A finished game splits into **the record** — what the page says about it every
time anyone opens it — and **the moment**, a win worth marking, which happens
once. **The record is in-page**: the verdict rotates into the slot the entry
used during play, and the info column's action row says it again beside the
buttons, both from one `TerminalMessage` so they can't drift. **Only the
moment gets a modal** — the celebration, for a win and for nothing else, and
never on opening a game that was already won. **Losses stay quiet**: the red
pill says it, and a consolation modal would be one more thing to dismiss on the
way to feeling bad.

**A loss never opens the answer**, and neither does a game the friends agreed
to stop. Revealing it is **personal** (my looking doesn't open my partner's),
**temporary** (the same control hides it again, so the board as we finished it
is always one click back) and **unpersisted** (nothing stored, and a restart
starts blind). The one thing that opens an answer by itself is having produced
it. **Restart is offered at every ending**, as a button once the game is over
and a menu row all game. [`common/terminal`](../src/common/terminal/doc.md),
[`common/reveal`](../src/common/reveal/doc.md),
[`common/game-page`](../src/common/game-page/doc.md) for Restart.

## Confirm modals — never `window.confirm`

Every question goes through one shared blocking modal (`askConfirmation`), and
its confirm button **names the act** — "End game", "Suspend" — never a bare
"OK". An action's standing question lives in the action registry and is asked
by the shared run, so no placement can forget it: End game always asks; New
game asks only mid-game, and says the old game is shelved, not lost; leaving a
live game asks only when there are other players to surprise.

### Dialog buttons

Every dialog's buttons sit right-justified, **the primary action rightmost**
and Cancel to its left, from one shared rule (`modalActions.module.css`). The
pause banner is the exception: it stands in for the board rather than asking a
question, so its buttons center.

## Floating panels — five families, one shell

Everything window-like over the page — Help, chat, a dialog, a confirm — is one
shell, `FloatingPanel`, and declares a **family**, which says what kind of thing
it is: kept beside you while you play, a question that can wait, or the world
stopping until you answer. The family decides everything that follows from
that (whether it dims the page, moves, remembers where you put it), so a panel
can't claim one thing and do another. **If you can drag it, you can leave it
for later; if you can't, deal with it now.**
[`common/floating-panels`](../src/common/floating-panels/doc.md) has the
families, the names and the layers.

## Real forms, and everything else

The rule is about **who owns the keyboard**. In a **real form** — setup, the
profile and club forms, sign-in, a confirm — the focused element owns it, so
Tab moves between fields and a focus ring is honest. **Everywhere else** — the
pages, the boards, the info column — the app owns it: no Tab walk, no focus
rings, and a keystroke is a command. **Focused text entry** inside a non-form
surface — chat, the scratchpad, a clue field — owns its keys only while focused,
and Tab is the way back out. `data-floating-panel` is the edge of the first
kind. [`common/keyboard`](../src/common/keyboard/doc.md), and
[keyboard-shortcuts.md](keyboard-shortcuts.md) for the keys.

## Consistency across games

**A player switches games without relearning the frame.** The chrome reads the
same everywhere; only the play surface changes. The check is
[the screenshot gallery](testing.md#the-screenshot-gallery) — `gmake gallery`
puts every game into every state on one sheet, because drift is invisible one
game at a time and obvious in a column.

### What every game has

Every game gets these from the shell, and a game that wants to omit one is
stepping outside the frame, not toggling a feature: **chat**, **pause**
(presence and manual), a **timer** option in setup, **Help** with its key list,
the **game menu**, and **Back to club**, which asks first only when there are
other players to surprise. [`common/game-page`](../src/common/game-page/doc.md).

### GamePage menu

**Each game owns its whole menu**, framing included — the shell injects
nothing, and `buildGameMenu` assembles the standard shape. **A row is an
action**, so its words, glyph, key and availability all come from the binding,
and the menu decides nothing. **`<` means "up a level"** on every page.
[`common/menu`](../src/common/menu/doc.md).

## Player identity = a colored disc

**A player is a filled circle in their profile color** — the shared `<Dot>`,
never a `●` glyph. **Identity rides the disc, never the text**: a name stays in
ordinary ink, which keeps it legible and lets a tight surface drop the name and
keep the disc with nothing lost. **Don't spend a colored circle on anything that
isn't a player** — a rank tier is a square, the chat unread count is black.
[`common/members`](../src/common/members/doc.md).

## Interactive tile states

Board pieces share one look, from the `--tile-*` tokens and the shared
`.tileFace` / `.tile` classes, so a player who learns one board reads the next.
**A state changes a tile by re-setting its tokens**, never by out-cascading the
shared rule, which keeps it independent of stylesheet order. **A decided tile
takes the full-saturation result color** — the same one its event-log bar wears.
**Default to the warm tile ramp**, and leave it only when a game's tiles always
carry a meaning, as wordle's do.

**A game piece has no disabled state.** Unclickable is not disabled: a piece is
unusable *because something happened to it*, and the something is what it shows
— a used letter, a found word, a card that's gone. A disabled look on a board is
a control's look on a piece, and a finding. How a board says what happened is
[plans/tile-feedback.md](../plans/tile-feedback.md).

## The ring that says the keyboard is here

**One ring, `--chrome-cursor-ring`, and it means only "the keyboard is here".**
Real focus and a list's cursor both wear it. It never means *selected*: a
chosen state uses a dark neutral instead, so a control can wear both without
ambiguity. The ring's offset follows what it sits against
(`core-css/patterns/focus-ring.css`).

## Selection lists

**A `SelectionList` is a list you move a cursor through and pick exactly one
thing from** — the clubs, a club's games, the games to start. It is one tab
stop; arrows move a cursor and Enter acts, immediately. Its cursor is a
**selection** cursor, hidden until a movement key asks for it, where a board's
is **geographic** and always shown — the test is whether hiding it would make
the board harder to read. A menu is not one: a menu is actions and closes, a
list is places that stay. [`common/lists`](../src/common/lists/doc.md).

## What a `<button>` is

`<button>` is the most overloaded element in the app, so **the bare element is
neutral** and chrome is opt-in. Controls sort into four families by the
**feedback** they should give:

| family | kinds | feedback |
|---|---|---|
| **accidental** — not buttons to look at | a menu trigger, a list row, a text link, a whole content block (a chat bubble) | the surface's own: a row tints, a link underlines |
| **game pieces** | tiles, cards, hexes, cells | **depth** on hover, darkening on press |
| **keys** | on-screen keyboard caps | a little depth |
| **general buttons** | commands, form buttons, choices, toggles, tabs, dismiss | **color only** — no motion, no shadow |

**Depth belongs to pieces, color to controls** — a control that could lift
would be indistinguishable from a tile. A piece darkens on press rather than on
hover, because with reduced motion on a phone the darken is the only feedback a
tap gets. A general button is `<StandardButton>`, or `<ActionButton>` when it is
a command: **tone is the action's** (what it is — destructive, caution) and
**weight is the placement's** (how loud it is there). Every command is an
action, so a one-off hand-rolled `<button>` in a game is a finding.
[`common/buttons`](../src/common/buttons/doc.md),
[`common/actions`](../src/common/actions/doc.md).

## Button iconography

**Glyphs come from one registry** of Lucide icons named for what they MEAN
(`IconHint`, never a lightbulb), so a glyph means one thing everywhere —
[`common/icons`](../src/common/icons/doc.md). **The menu is the legend**: an
icon-only button's name is a hover bubble, which a touchscreen doesn't have, so
every action's glyph is drawn beside its name in the game menu, and a glyph the
menu doesn't teach yet gets a row. A few glyphs are conventions every app
shares and need no row ([`common/menu`](../src/common/menu/doc.md)).

### A disabled button still gets a tooltip — usually a *better* one

**Disabled means "you can't press this", not "inert".** A disabled control
raises a question an enabled one doesn't — *why not?* — so where there is a
nameable reason, its tooltip says it ("No hints when competing") rather than
repeating the action. The fade is slight on purpose: what tells you a control
is dead is that it doesn't answer the pointer.
[`common/tooltips`](../src/common/tooltips/doc.md).
