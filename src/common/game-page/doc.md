# game-page

The live game's page and everything it hands down to a game: the page, the
context, the shared game state, the error boundary, the shared play-surface
stylesheet and the device-block card.
`useStandardGameActions` binds End, Concede and Restart for every game, and
`GameHeaderMenu` draws the sections a game pushes.

## Intro to area

There is one game page, and every game plays on it. The route
`/g/<gametype>/<gameId>` mounts three components in a row — a gate that asks
whether the game exists, a loader that joins its room and waits for its state,
and the page itself, a shell around a hole. The hole is where the game goes.
Every game's play surface takes its turn filling it, and none of them draws a
header, a clock, a chat panel or a way back to the club, because the shell does
all of that and the game never has to think about it.

What the shell owns divides cleanly. The chrome is the header — the logo that
is also the menu, the players strip that a message can take over, the pause
button, the clock, and on a phone the switch between the board page and the
info page. The shared state is `useCommonGame`: the `common.games` row, the
roster, presence, the two kinds of pause, suspend, and the timer. What a game
gets is `GamePageCtx`, one object of props the shell hands its `PlayArea`,
carrying the row's useful fields, the clock, the turn gate, the global feedback
slot, the menu API and the one navigation a game does for itself (into a
follow-up game; going back to the club is an action on the menu API). A game
reads that object and renders a board.

Everything cross-peer runs through one Realtime channel named `game:<gameId>`,
which the code calls the shared room. Presence rosters and broadcasts only reach
peers who named the same channel, so the name has to be the same in every tab —
no per-tab suffix. That is not tidiness. The club's "this is the game we are all
looking at" pointer is cleared by whichever peer is last to leave the room, and
a peer can only know it is last if everyone was counted in the same place. Split
the name and presence sets stop merging: either nobody believes they are last
and the pointer sticks, or everybody does and it thrashes. A game's own
`useGame` hook opens a separate, per-tab channel for its own rows, which need no
coordination.

Leaving has three shapes, and one action — Back to club, placed by the menu, the
info column's action row, the pause overlay and the device-block card alike —
picks between them. A finished game just navigates — nothing is left behind and
nobody else is affected. A solo game in progress suspends without asking,
because the confirm exists to warn you that peers get dragged back to the club
and a solo game has no peers. A multiplayer game in progress asks first, and on
confirm broadcasts to the room so every peer navigates too.

## Details

**A restart mounts a NEW play surface.** `common.games.restarts` counts the runs
of a board — `common.reset_game` bumps it — and the page keys the game's
`<PlayArea>` on it. So a restart unmounts the finished run and mounts a fresh
one, and every piece of local state goes with it: a half-typed word, an
optimistic row, a mark mid-beat, a history viewer, and the refs inside shared
hooks that no game's own code can reach. A game therefore writes NOTHING to
handle a restart; the alternative was each game noticing its own rows vanish and
clearing what it remembered, which several got wrong and none could reach a
shared hook with. Nothing else on the row can serve as the key — a mid-game
restart leaves `play_state`, `ended_at` and `status` exactly as they were.

**The three components, and the tree the last of them renders.** `App` matches
the route and renders `GamePageGate` with the URL's two parts and the session,
and nothing else. The gate resolves the gametype and asks whether the game
exists; `GamePageLoader` calls `useCommonGame` and waits; `GamePage` draws.
Each hands its props straight down, so the page receives what the gate resolved
plus everything the loader waited for — as values, never as maybe-values:

```
App                                  matches /g/<gametype>/<gameId>
└── GamePageGate                     which game type, and does this game exist?
    └── GamePageLoader               join the room, wait for its state
        └── GamePage                 the shell — everything below is common/
            ├── PageHeader           menu(logo) · chat + scratchpad · status slot | pause · timer · switch
            ├── PauseBoundary
            │     ├── not paused →   PlayAreaSlotLog
            │     │                    └── PlayAreaErrorBoundary
            │     │                          └── Suspense
            │     │                                └── <PlayArea {...GamePageCtx}>   ← THE GAME: its manifest's
            │     │                                                                    PlayArea, lazily loaded,
            │     │                                                                    the only game-specific
            │     │                                                                    component in the tree
            │     └── paused     →   PauseOverlay
            ├── Chat                 outside the boundary: still there mid-pause
            ├── GameScratchpadCompanion   opt-in per manifest, also outside
            └── Help                 the manifest's rules component, lazily loaded
```

The page builds the play surface's wrappers itself, because they are the same
for every game: the slot log outermost so its line lands before a broken game
can throw, the boundary inside it, and the Suspense innermost so a chunk that
fails to load gets the boundary's card rather than a blank page.

Either of the first two can end the route instead of descending. Every way a
game URL can come to nothing is the gate's, and they wear two screens on
purpose: a gametype the registry has never heard of is a fault (an error page
with a diagnostics line — the app cannot name what the link asks for), while
a malformed id or an id that names no row is a calm `<NoSuchGamePage>`. The
gate also shows `<Loading>` while its read is out and an error page if that
read failed; the loader shows the same three for what happens after, since a
game deleted mid-session arrives at it as zero rows.

**The existence check is its own component, and that is why there are three.**
The gate does one `select id` and mounts nothing until it answers. It cannot
instead read the answer out of `useCommonGame`, which fetches the same row a
moment later, because that hook does far more than fetch: calling it joins the
channel, tracks presence and asserts `set_current_view` — for a game that may
not be there. React forbids calling a hook conditionally, so the only place
`useCommonGame` can wait for the gate's answer is a component the gate has not
mounted yet. Sequencing it internally instead would mean teaching a long hook
to half-run, which is worse than one extra primary-key lookup on a path about
to make six more reads. The answer is three-way on purpose: a read that FAILED
is not a game that is gone, and collapsing them would tell a player their game
was deleted because the network blinked.

**A pause unmounts the board.** `PauseBoundary` renders the overlay instead of
the play surface, so the play surface's selections, form state and
per-gametype channels all start fresh on resume. Anything that must survive a
pause therefore lives above the boundary — in `useCommonGame`, in the shell's
own feedback and menu state, or in the database. Chat and the scratchpad are
deliberately outside the boundary for the same reason: a stalled game is
exactly when people want to talk.

**The last peer out clears the club's pointer.** On leaving the room a tab
checks the presence set; if it is alone or empty it calls `unset_current_view`.
Two peers leaving at the same instant can both see each other and both skip it,
which leaves a stale pointer until the next `set_current_view` clears it as a
straggler. Neither write is a response to anything a player clicked, so neither
owes the player a surface — a failure is a console line on top of whatever
modal `runRpc` already raised.

**A game's menu sections live in a store, not in the shell's state.** Every
game owns its whole menu and pushes it with `ctx.menu.setGameSections([...])`,
usually through the `buildGameMenu` helper, which frames Help, End/Concede and
Back to club around the game's own rows. Those sections sit in `gameMenuStore`
because only the menu reads them: a game pushing its menu re-renders the menu
and not the board. The account submenu is appended by the shell, so no game can
forget it. The menu empties itself during a pause — the play surface unmounts,
and its cleanup clears the sections.

**Help is a per-game contract on the manifest.** A game declares
`help: ComponentType<{ onClose, brand }>`; the menu's Help row mounts it,
`onClose` unmounts it. It is lazily loaded with the game's chunk and wrapped in
a Suspense boundary, so a slow fetch shows nothing for a beat rather than
crashing. `GameHelpCompanion` is the frame every one of them renders into,
which is why they are identical — and like every companion it closes by its ✕
alone.

**A count-up clock survives the end of the game and a countdown does not.** A
countdown is a budget: once the game is over it can only read 0:00, which tells
nobody anything. A count-up answers "how long did that take?", which is worth
seeing precisely when you are done — the timer stops ticking at terminal, so it
freezes on the final figure. A stopped clock shows red either way, because red
says "these digits are not moving" rather than passing judgment on why.

**The header survives a pause too.** The overlay covers the play surface only.
A message already showing stays readable, and the menu stays openable, because
a paused game is not a broken one and the way out runs through both.

**What a game wears from here besides the page.** `playArea.module.css` is the
two-column scaffold every play surface composes — the row that holds both
columns, the board column that hugs its board, the shared tile and the
board-wide feedback marks; a game imports it directly and adds a thin module of
its own. The INFO column is not here: its box and its rows are
`info-sheet/infoCol.module.css`, the folder that owns the column, and the line
between the two sheets is which element wears the class — a game's PlayArea root
div wears the scaffold's `.layout` / `.mobileFill` / `.responsiveInfoCol`,
including the clamp that decides how much width the column takes from the board,
because that is a negotiation between the two columns.
`useStandardGameActions` binds End, Concede and
Restart once per game; the
actions say when they apply, so End is hidden in a race unless the game opts
in, Concede is hidden outside one, and both are hidden at terminal because
there is no ending an ended game. `DeviceBlockNotice` is the card a game
renders in place of its board on a device it cannot be played on, and its exit
is the same Back to club as everywhere else.
