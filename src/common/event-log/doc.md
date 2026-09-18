# event-log

The panel that carries a game's account of what happened — one row per event —
and the viewer that opens one of those events back up on the board.
[docs/playarea.md](../../../docs/playarea.md) describes where both sit on the page.

## Intro to area

Every game here keeps a running account of itself: what was played, by whom, and
how it went. Players read it constantly — to see what a teammate just did, to
count what is left, to argue about a word — so it has to look the same in all of
them. But no two games have the same turn. A psychicnum turn is a number and a
verdict; a codenamesduet turn is a clue and however many guesses answered it; a
scrabble turn is a word, a score and a rack's worth of tiles; a connections turn
is four tiles on a second line. Any shared row shape would need a prop per game,
and the games would drift apart anyway.

So the panel owns no row. What this folder supplies is the frame around the rows
— the heading, the "whose turns?" control beside it, the evident scroll box that
snaps to the newest line — and a small vocabulary a game builds its own `<tr>`s
out of: a colored outcome bar, the `#N` handle, the who cell, and classes that
say which column takes the slack and which one is the lead value. A game writes
its own row anatomy and still comes out looking like the others, because the
pieces inside the row are shared even though their arrangement is not.

The viewer is the other half, and it is one piece of state: which past turn, if
any, is open on the board. Clicking a turn's `#N` opens it, and three things
close it again: a keystroke and a click anywhere that isn't another `#N`, both
built into the hook so a game adopting the viewer wires neither, and the
banner's ✕, which this folder's `<HistoryBanner>` draws where the game places it,
calling the hook's `exitHistory`. What a past board should look like stays the
game's business (each one has a `lib/history.ts`, or scrabble's `lib/play.ts`);
what it wears while you are looking at it is this folder's: a blue frame around
the board, a matching ring on the open `#N`, and an opaque banner naming the turn
over the game's input area.

Between the two halves sits the distinction the whole thing rests on: the
number and the link are different values. The number is the row's place in the
list you are looking at — it counts 1, 2, 3 under whatever filter is applied,
which from your seat is honest. The link is the row's own id, resolved by the
builder against the list it is folding. Two lists, two lookups, and a filter can
move one without touching the other — which is what lets a compete terminal open
an opponent's row and replay THEIR board, and what makes the number something
the log has to hand over rather than a thing the board can work out.

## Details

**It is a `<table>`, and that is the point.** A game that uses the same columns
across its rows gets them lined up — the numbers under the numbers, the actors
at the right edge — which a flex stack of rows cannot do without every game
agreeing on widths. So a row's pieces each get their own `<td>`, and a second
line of a turn is a second `<tr>` under a `rowSpan`ned bar, not a nested flexbox
inside one cell. The cost is that the shared cell styling has to be beatable by
a game's own class, which is why the default sits on `:where(.eventLogTable) td`.

**What stays the game's, on the viewer's side of the seam.** How a snapshot is
computed from the open turn (the board shape differs per game, and it is derived
after the loading guard where the log lives); how a row is identified, which is
why the hook is generic — every game names one by the events row's own id, and
codenamesduet by a turn number; and where the banner hangs, since the below-board region each game gives it is its
own.

**Every handle is live, under every filter.** A filtered log renumbers what it
shows and still opens exactly the row its number sits beside, because the number
and the link are two values.

**A builder resolves, and an id it does not hold replays nothing.** The list a
game folds is the board being looked at; the list the log shows is the picker's.
Ask for a row the folded list does not contain — a compete opponent's guess,
against your own board — and what comes back is the empty board and a neutral
label, not somebody else's game.

**The banner says the number that was clicked, and whose board it is.** The `#N`
travels up with the row's id when a handle is pressed — `showHistory(id, n)`,
back out of the hook as `historyN` — because only the log knows what number it
printed; a game's label builder is folding the other list and would count a
different one. Beside it, `<HistoryBanner>`'s optional `actor` names the player
when the board on screen is not the viewer's own, which only a compete terminal
can be: coop is one shared board, and naming a teammate there would claim it
belonged to them.

**The picker hands back everything that travels with the choice**, because
re-deriving any one of them per game is how the games drift apart: the control,
its default selection, the aggregate's label (which differs by mode), the row
filter, and the empty-state wording. The last is the one
with a rule behind it — in compete, RLS hides an opponent's rows until the game
ends, so an empty opponent log has to say "Hidden until game ends." rather than
claim they have not played.

**The input under the banner is frozen to the eye and alive underneath.** The
banner is opaque and covers the whole below-board region, but the game's entry
stays mounted, so a half-typed word or a staged rack survives a trip through the
history and is there again on the way out. Neither half is the accident: don't
"fix" the docs that call it frozen, and don't unmount what is under it.

**Two stylesheets, split by who reads them.** `EventLog.module.css` is what the
components draw themselves — the box, the table, the outcome bar, the turn
number, the who column — and a game never imports it. `gameEventLog.module.css`
is the row vocabulary a game puts on its own `<tr>`s and `<td>`s: `.divider`,
`.main`, `.other`, `.primary`, `.entryHead`, `.entryCont`, `.muted`. The
capital/lowercase pair is the repo's rule for it (docs/deferred.md → Common /
architecture): a capital name is one component's and only that component may
import it; a lowercase one is shared.

The split is by READER, and measuring it is what produced these two lists: of
the classes in the old single file, thirteen were read only by the components,
six only by the games, and two by both — and both of those turned out to be one
thing each wearing a shared name. `.who` was the components' (a docstring
mentioned it, no game used it), and `.meta` was doing two jobs at once: the turn
number's column, and de-emphasized text inside a row. It is two classes now,
`.turnNumber` and `.muted`, in the two files.

**One file holds four components, and the other concern's files say so.**
`EventLog.tsx` is the panel plus the pieces a game builds a row from —
`EventLogOutcomeBar`, `EventLogNumber`, `EventLogActor` — which is the packaging exception
in [code-conventions.md](../../../docs/code-conventions.md#component-names):
subparts that live only inside one component, individually small, reached for
together. Everything belonging to the **viewer** is in its own files, and their
names carry the word: `HistoryBanner.tsx`, `useHistoryViewer.ts`,
`historyViewer.module.css`. The banner is drawn over the game's input area, not
inside the log at all, so a reader hunting the viewer never opens a file named
for the log.

**The render tree.** Most of what is drawn below belongs to the game, which is
why this folder is hard to see from any one of its files:

```
GameEventLog                           the GAME's file, one per log game
└── EventLog                           the panel: heading row, scroll box, table
    ├── picker        = useEventLogPlayerPicker's result — the panel draws its
    │                   dropdown (a <FilterSelect>, lists/) and its empty line
    └── children      = the game's <tr>s, built from
          ├── EventLogOutcomeBar       the outcome bar cell
          ├── EventLogNumber           the #N handle  → showHistory(id)
          └── EventLogActor            the who cell, wrapping <ActorDot> (members/)

PlayArea                              holds useHistoryViewer — the one flag
├── BoardCol → Board                  wears `.historyFrame` while viewing history
│   └── HistoryBanner                 the game gives it a label, exitHistory, and
│                                      in compete the row author's actor
└── InfoCol → GameEventLog             historyId + onShowHistory back to the hook
```
