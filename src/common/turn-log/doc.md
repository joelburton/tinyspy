# turn-log

The panel that carries a game's account of what happened, turn by turn, and the
viewer that opens one of those turns back up on the board.
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
banner's ✕, which is the game's own button calling the hook's `exitHistory`.
What a past board should look like stays the game's business (each one has a
`lib/history.ts`); what it wears while you are looking at it is this folder's: a
blue frame around the board, a matching ring on the open `#N`, and an opaque
banner naming the turn over the game's input area.

Between the two halves sits one question the picker answers: is the log you are
looking at the same sequence the board would replay? A game that addresses a
turn by its position in the log can only offer a live handle while that holds,
and `boardIsShown` is how it knows.

## Details

**It is a `<table>`, and that is the point.** A game that uses the same columns
across its rows gets them lined up — the numbers under the numbers, the actors
at the right edge — which a flex stack of rows cannot do without every game
agreeing on widths. So a row's pieces each get their own `<td>`, and a second
line of a turn is a second `<tr>` under a `rowSpan`ned bar, not a nested flexbox
inside one cell. The cost is that the shared cell styling has to be beatable by
a game's own class, which is why the default sits on `:where(.turnLogTable) td`.

**What stays the game's, on the viewer's side of the seam.** How a snapshot is
computed from the open turn (the board shape differs per game, and it is derived
after the loading guard where the log lives); how a turn is identified, which is
why the hook is generic — scrabble and codenamesduet name a turn by a game-wide
ordinal, everyone else by its position in the log; and where the banner hangs,
since the below-board region each game gives it is its own.

**`boardIsShown` is false more often than it looks.** Picking a single player
out of a shared multi-player coop game narrows the log, so the filtered list's
row 3 is not the board's turn 3 — a handle there would replay the wrong turn.
Coop's `Team` default keeps it live, which is the common case, and a solo game
is always live because its filter is a no-op. A game that keys turns by a stable
id cannot be misaddressed by filtering at all, so it ignores the flag and leaves
every handle live.

**The picker hands back everything that travels with the choice**, because
re-deriving any one of them per game is how the games drift apart: the control,
its default selection, the aggregate's label (which differs by mode), the row
filter, `boardIsShown`, and the empty-state wording. The last is the one
with a rule behind it — in compete, RLS hides an opponent's rows until the game
ends, so an empty opponent log has to say "Hidden until game ends." rather than
claim they have not played.

**The input under the banner is frozen to the eye and alive underneath.** The
banner is opaque and covers the whole below-board region, but the game's entry
stays mounted, so a half-typed word or a staged rack survives a trip through the
history and is there again on the way out. Neither half is the accident: don't
"fix" the docs that call it frozen, and don't unmount what is under it.

**Two stylesheets, split by who reads them.** `TurnLog.module.css` is what the
components draw themselves — the box, the table, the outcome bar, the turn
number, the who column — and a game never imports it. `gameTurnLog.module.css`
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
number's column, and de-emphasised text inside a row. It is two classes now,
`.turnNumber` and `.muted`, in the two files.

**One file holds four components, and the other concern's files say so.**
`TurnLog.tsx` is the panel plus the pieces a game builds a row from —
`TurnLogBar`, `TurnLogNumber`, `TurnLogActor` — which is the packaging exception
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
GameTurnLog                           the GAME's file, one per log game
└── TurnLog                           the panel: heading row, scroll box, table
    ├── picker        = useTurnLogPlayerPicker's result — the panel draws its
    │                   dropdown (a <FilterSelect>, lists/) and its empty line
    └── children      = the game's <tr>s, built from
          ├── TurnLogBar              the outcome bar cell
          ├── TurnLogNumber           the #N handle  → viewer.select(id)
          └── TurnLogActor            the who cell, wrapping <ActorDot> (members/)

PlayArea                              holds useHistoryViewer — the one flag
├── BoardCol → Board                  wears `.historyFrame` while viewing history
│   └── HistoryBanner                 the game gives it a label and exitHistory
└── InfoCol → GameTurnLog             historyId + onShowHistory back to the hook
```
