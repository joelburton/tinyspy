# game-page

The live game's page and everything it hands down to a game: the page, the context, the shared game state, the error boundary, and the manifest's device and keyboard gates. `useStandardGameActions` binds End, Concede and Restart for every game, and `GameHeaderMenu` draws the sections a game pushes.

## Intro to area

There is one game page, and every game plays on it. The route `/g/<gametype>/<gameId>` mounts `GamePage`, which asks the server once whether that game exists and then mounts the shell around a hole. The hole is where the game goes. Sixteen play surfaces take turns filling it, and none of them draws a header, a clock, a chat panel or a way back to the club, because the shell does all of that and the game never has to think about it.

What the shell owns divides cleanly. The chrome is the header — the logo that is also the menu, the players strip that a message can take over, the pause button, the clock, and on a phone the switch between the board page and the info page. The shared state is `useCommonGame`: the `common.games` row, the roster, presence, the two kinds of pause, suspend, and the timer. What a game gets is `GamePageCtx`, one object handed to the render-prop child, carrying the row's useful fields, the clock, the turn gate, the global feedback slot, the menu API and the two navigations. A game reads that object and renders a board.

Everything cross-peer runs through one Realtime channel named `game:<gameId>`, which the code calls the shared room. Presence rosters and broadcasts only reach peers who named the same channel, so the name has to be the same in every tab — no per-tab suffix. That is not tidiness. The club's "this is the game we are all looking at" pointer is cleared by whichever peer is last to leave the room, and a peer can only know it is last if everyone was counted in the same place. Split the name and presence sets stop merging: either nobody believes they are last and the pointer sticks, or everybody does and it thrashes. A game's own `useGame` hook opens a separate, per-tab channel for its own rows, which need no coordination.

Leaving has three shapes, and the menu's Back to club picks between them. A finished game just navigates — nothing is left behind and nobody else is affected. A solo game in progress suspends without asking, because the confirm exists to warn you that peers get dragged back to the club and a solo game has no peers. A multiplayer game in progress asks first, and on confirm broadcasts to the room so every peer navigates too.

## Details

**The tree the shell renders.** `GamePage` is the pre-flight; `GamePageInner` is the shell:

```
GamePageInner
├── PageHeader   menu(logo) · chat + scratchpad buttons · status slot | pause · timer · info switch
├── PauseBoundary
│     ├── not paused → children(GamePageCtx)   ← the game's board
│     └── paused     → PauseOverlay
├── Chat                  outside the boundary: still there mid-pause
├── GameScratchpadCompanion   opt-in per manifest, also outside
├── Help                  the manifest's rules component, lazily loaded
└── SuspendConfirmationBlockingModal
```

**The existence check is its own component, and it runs first.** `GamePage` does one `select id` and mounts nothing until it answers. It cannot instead read the answer out of `useCommonGame`, which fetches the same row a moment later, because that hook does far more than fetch: calling it joins the channel, tracks presence and asserts `set_current_view` — for a game that may not be there. Sequencing those internally would mean teaching a long hook to half-run, which is worse than one extra primary-key lookup on a path about to make six more reads. The answer is three-way on purpose: a read that FAILED is not a game that is gone, and collapsing them would tell a player their game was deleted because the network blinked.

**A pause unmounts the board.** `PauseBoundary` renders the overlay instead of `children`, so the play surface's selections, form state and per-gametype channels all start fresh on resume. Anything that must survive a pause therefore lives above the boundary — in `useCommonGame`, in the shell's own feedback and menu state, or in the database. Chat and the scratchpad are deliberately outside the boundary for the same reason: a stalled game is exactly when people want to talk.

**The last peer out clears the club's pointer.** On leaving the room a tab checks the presence set; if it is alone or empty it calls `unset_current_view`. Two peers leaving at the same instant can both see each other and both skip it, which leaves a stale pointer until the next `set_current_view` clears it as a straggler. Neither write is a response to anything a player clicked, so neither owes the player a surface — a failure is a console line on top of whatever modal `runRpc` already raised.

**A game's menu sections live in a store, not in the shell's state.** Every game owns its whole menu and pushes it with `ctx.menu.setGameSections([...])`, usually through the `buildGameMenu` helper, which frames Help, End/Concede and Back to club around the game's own rows. Those sections sit in `gameMenuStore` because only the menu reads them: a game pushing its menu re-renders the menu and not the board. The account submenu is appended by the shell, so no game can forget it. The menu empties itself during a pause — the play surface unmounts, and its cleanup clears the sections.

**Help is a per-game contract on the manifest.** A game declares `help: ComponentType<{ onClose, brand }>`; the menu's Help row mounts it, `onClose` unmounts it. It is lazily loaded with the game's chunk and wrapped in a Suspense boundary, so a slow fetch shows nothing for a beat rather than crashing. `GameHelpCompanion` is the frame all sixteen render into, which is why they are identical.

**A count-up clock survives the end of the game and a countdown does not.** A countdown is a budget: once the game is over it can only read 0:00, which tells nobody anything. A count-up answers "how long did that take?", which is worth seeing precisely when you are done — the timer stops ticking at terminal, so it freezes on the final figure. A stopped clock shows red either way, because red says "these digits are not moving" rather than passing judgment on why.

**The header survives a pause too.** The overlay covers the play surface only. A message already showing stays readable, and the menu stays openable, because a paused game is not a broken one and the way out runs through both.
