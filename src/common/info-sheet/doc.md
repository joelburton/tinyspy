# info-sheet

The info column's furniture: the bordered panel its readouts wear, the whose-turn
line, the per-player strip, the action row that holds a game's buttons in every
state — and the mobile half, where the whole column becomes a second full-screen
page reached by one switch in the header. `turnText` is the whose-turn wording
itself, written here because that line and the feedback pill `common/feedback`
draws must name the same player the same way.

## Intro to area

The game page is two columns: the board, and beside it a column of everything
that is true about the game right now — the live state, who everyone is and how
they are doing, whose turn it is, the buttons, and the event log. This folder is
that column's furniture. It holds no game logic and no board of its own; what it
holds are the pieces a game's `InfoCol` composes, so that the same kind of
information is drawn the same way in every game.

The readouts are furniture in the plain sense. `infoPanel` is a heading
over an evidently framed box — the shape the event log, the word list and
bananagrams's hand all wear, with each panel's interior left to itself, because a
scrolling log and a side-scrolling word grid share nothing but the frame.
`OpponentStrip` is the "how is everyone doing" row: a disc in each player's color,
the viewer first, and one metric cell the game supplies. `TurnStatusLine` is the
one-line whose-turn indicator, which a turn game renders in every state rather
than dropping when the game ends. `InfoActionsRow` is the action
slot, and it is one row rather than three because playing, being finished while
the others race on, and being over differ only in whether there is a sentence
beside the buttons and what that sentence says.

The rest of the folder is the mobile story, which is where the column gets
interesting. A phone has no room for two columns, so below the breakpoint the
board takes the whole screen and the info column becomes a second full-screen
page you switch to. A page rather than a drawer over the board, because a drawer
narrow enough to be a drawer is the whole screen on a phone anyway and leaves a
tablet showing half a board. `InfoSheet` is that page — a `display: contents`
no-op on desktop, a fixed full-bleed panel below `--mobile` — and
`InfoSwitchButton` is the one control that moves between the two, sitting at the
same edge of the header on both, because a control that rides along with the page
you are on is a control you have to hunt for. `docs/mobile.md` introduces the
mobile layout as a whole and points here; how the two pages share the header, and
what a game does to join them, is in Details below.

Moving the column off-canvas has a cost, and `MobileStatusBar` is that cost paid
back. The state a player reads constantly — how many agents are left, how many
swaps — goes off-canvas with everything else, and nobody should switch pages to
check it. So a game whose core state is invisible once the column slides away puts
one short line above the board instead, fed the very node the info column renders
so the two cannot word it differently.

## Details

**Who renders what.** The shell owns the switch, each game's PlayArea owns the
sheet, and the game's own `InfoCol` places the readouts:

```
GamePage (shell)                      ── mobile only ──▶  <InfoSwitchButton open>
  │  useIsInfoSheetOpen()                                   binds act-toggle-info-sheet
  │  setInfoSheetOpen(false) in a mount effect, keyed by gameId
  │
  └── <game>/PlayArea                                            ← the game's
        ├── useInfoSheet() → { isOpen, close }   closes on the mobile→desktop
        │                                        crossing, during render
        ├── <game>/BoardCol                                      ← the game's
        │     └── <MobileStatusBar>{the game's state node}</MobileStatusBar>
        │                                        display: none on desktop
        └── <InfoSheet open onClose>             display: contents on desktop;
              │                                  a fixed full-bleed page below --mobile
              └── <game>/InfoCol                                 ← the game's
                    │   .infoCol → .noShrinkRow → …    ← infoCol.module.css, here
                    ├── <p .infoState>                 the game's own readout
                    ├── <TurnStatusLine>               root class .infoState
                    ├── <OpponentStrip metricFor metricLabel leading?>
                    ├── <InfoActionsRow message?>{buttons}</InfoActionsRow>
                    │                                  root classes .infoActions
                    │                                  / .terminalActions
                    ├── <InfoDisclosure title>{…}</InfoDisclosure>
                    │                                  closed on load; common/setup-form's
                    │                                  <SetupDisclosure> is one
                    └── EventLog · WordList · HandCard    ← other folders and a
                            game, each wearing infoPanel.heading / .headerRow / .box

common/event-log: useHistoryViewer.showHistory() → setInfoSheetOpen(false)
                  opening a turn leaves the info page for the board it replays
```

**Two stylesheets, and the line between them is which element wears the class.**
`infoCol.module.css` here holds the column's box and every row in it — the eight
classes it declares, worn by a game's `InfoCol` on its own markup and by
`TurnStatusLine` and `InfoActionsRow` as their root class.
`game-page/playArea.module.css` keeps what the PlayArea ROOT DIV wears: `.layout`,
`.mobileFill`, and `.responsiveInfoCol` — the clamp that decides how much width
the column takes from the board, which stays with the shell because it is a
negotiation between the two columns rather than a rule about either. `.infoCol`
reads the `--info-col-width` a game sets on its `.layout`, as a rem of its own or
through that clamp, the way `MobileStatusBar` reads the `--mobile-status-height`
a game raises on its board column: a variable crossing a folder line is a
contract, not a misfiling. The action row's outcome inks are
`InfoActionsRow.module.css`'s, beside the component that draws the line.

**What an InfoCol places, and when.** The condition, not a list of games — a game
that grows a per-player metric grows a strip the same day.

| piece | placed when | what the game supplies |
|---|---|---|
| `InfoSheet` | the game has a mobile layout at all (bananagrams is desktop-only and has none) | the open flag from `useInfoSheet`, and `close` |
| `infoPanel` | a panel in the column is a heading over a framed box | the interior — `display`, `overflow`, padding |
| `OpponentStrip` | the game has a per-player metric worth showing inline | `metricFor`, a `metricLabel`, an optional `leading` row |
| `TurnStatusLine` | the game has a turn pointer to point at | the pointer, the roster, `isTerminal` |
| `InfoActionsRow` | always — it IS the action slot | the buttons, plus a `message` when there is something to say |
| `InfoDisclosure` | a section the player opens when they want it — "Setup options" in every game, codenamesduet's "Key card" | a `title` and the children it reveals |
| `MobileStatusBar` | the game's core state is invisible once the column slides away | the same state node the info column renders |

`InfoSwitchButton` is the exception: no game places it. `GamePage` renders it on
mobile, because the header is the shell's.

**A game's mobile pass is three pieces composed.** `useInfoSheet()` for the flag,
`<InfoSheet open onClose>` around its `InfoCol`, and `shared.mobileFill` on its
`.layout` — `cls(shared.layout, shared.mobileFill, styles.layout)` — which hands
the board the full width once the column has left the row. What stays in the
game's own stylesheet is the board's mobile sizing.

**Below the breakpoint the header is one frame over both pages, and its contents
split.** The sheet starts under the header rather than covering it, so the header
stays put across the switch; but a phone header cannot hold everything, so each
page keeps what you need while looking at it:

| | board page | info page |
|---|---|---|
| game menu | yes | yes |
| chat, scratchpad, the header's status slot | yes | — |
| pause, timer | — | yes |
| page switch | right edge | right edge |

The menu rides both pages because it is how you leave the game. Chat and the
status slot ride the board, where a peer's move is news you need mid-play; pause
and the timer ride the info page, with the other readouts. The switch is pinned
to the right edge on both rather than riding inside either group: the groups
differ between the pages, so a switch inside one would move each time you used
it. Desktop never splits. The branches are in `GamePage`.

**The status bar is a per-game judgment, not a default.** A game adopts
`MobileStatusBar` when its core state is invisible once the column slides away. A
game whose board already shows that state — solved bands you can count, strike
marks under the board, covered letters — does not: the bar would restate it and
cost the board a row. Opening the sheet loses nothing either way, since `InfoCol`
renders its own copy at the top and the full-bleed sheet covers the bar.

**Both surfaces render the same node.** The game extracts its state line into one
component and hands it to the info column and the bar alike; two hand-written
copies drift. The bar may carry a control as well as a readout — a routine move,
like asking setgame for a hint, should not cost a page switch — and the duplicate
is safe only because both copies are the same component fed the same label.

**The desktop shape is the base rule; the bar's shape is an override.** A
component rendered on both surfaces keeps its info-column look in its plain class
and puts the compressed look in `[data-mobile-status] .x { … }` at the foot of the
same stylesheet — the attribute `MobileStatusBar` stamps on its wrapper. No media
query, since the bar exists only below the breakpoint, and no `compact` prop to
thread. Compressing at the base would impose the phone's height budget on a
desktop with room to spare. `shared/rank-ladder`'s stylesheets are the worked
example.

**The bar's height is fixed, and a height budget subtracts it.** It sits above a
`flex: 1` board, so any growth would move the board mid-game. A readout that is a
small block rather than a line, or that holds a tap target, raises
`--mobile-status-height` and is fixed at that. A board that sizes itself from a
height budget such as `--avail-h` takes the bar out of it too, or it is sized for
space it no longer has and the page scrolls.

**The open flag is a module slot, not component state.** The two halves that need
it live in different subtrees — the sheet inside each game's PlayArea, since the
thing it wraps is that game's own `InfoCol`; the button in the shell's header,
which sits above PlayArea and re-renders independently of it. Threading a boolean
down would mean adding it to `GamePageCtx` and touching every game, and lifting
the sheet out of PlayArea is not possible when the InfoCol it wraps is the game's.
So it is `infoSheetStore`. One slot is safe for the same structural reason the app
shows one game at a time (`is_current_view` — `docs/common.md`): exactly one
`<GamePage>` is ever mounted, it is keyed by game id, and it clears the flag on
mount, so a sheet left open in one game never greets you already-open in the next.
`useInfoSheet` clears it again when the viewport crosses up to desktop — without
that the flag is sticky, and a widen-then-narrow round trip drops you back on the
info page you thought you had left.

**The rows run in one order, top to bottom:** the state (the game's own line and
the turn line), the opponent strip, the action row, the help line, a terminal
extra, the disclosures, then the log. A terminal extra sits above the setup recap
because the reveal is the payoff and the recap is bookkeeping — the recap must
never push the answer down.

**The action row holds what changes the game or the turn** — Hint, Reveal, End.
A control that changes only how the board is seen, like Shuffle, floats on the
board instead, and stays live at terminal ("could I have found that with a
reshuffle?"). A move itself — a clue, a typed word — is entered in the board
column, not here.

**At terminal the column swaps rather than grows.** The state line and the setup
recap stay; the help line goes; the action row trades its play buttons for the
verdict line and the game's terminal actions. The one row allowed to appear is
`.terminalExtra`, for an end-of-game readout too tall for the below-board slot
(its comment in `infoCol.module.css` says why that growth is safe). The one
growth allowed during play is a disclosure, which the player opens and closes.

**The turn line renders in every state, including the finished one.** Its presence
is fixed for the whole game — whether a game is turn-ordered is decided at
create-time and the pointer is either set all game or never — so the line never
appears or disappears under the reader.

**A finished game has nobody's turn, so no readout may keep asserting one.** A
line that is only a turn indicator goes inert and keeps its height, which is
`TurnStatusLine` at terminal. A line that carries other live state replaces only
its turn clause with "Ended" and keeps the rest behind the same `·` — scrabble
compete's `Your turn · 7 in bag` becomes `Ended · 0 in bag`, because a bare
"0 in bag" reads as a fragment. Either way it names the state, never the result:
the verdict is already in the action row and the below-board slot, and a third
copy is noise. A turn count is state, not a claim about whose turn it is, and
needs no terminal branch.

**Being locally terminal looks like being over.** A player who can no longer act
while the others play on gets the terminal look — a bold line in the action row
("You conceded") beside their buttons, not a quietly changed help line — and the
below-board slot says it too, a little fuller ("Conceded — race continues",
`FeedbackMessage.outOfRace`). That holds for terminal too: both places, always,
and the second is not a redundancy to trim.

**The don't-move rule is kept row by row, not by the column.** `.noShrinkRow`
wraps every row of the column except the log, so the log is the one thing
squeezed when the column runs short — flex shrinking is negotiated between
siblings, so the wrapper is what makes "the log gives" structural. It reserves no
height. Each row keeps its own shape instead: the action row is always one line,
an opponent strip reserves the lines it can grow to. A `min-height` on the stack
would be exactly the container-level reservation the rule refuses.
