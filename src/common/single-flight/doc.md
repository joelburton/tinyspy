# single-flight

One run of an async action at a time: a second press while the first is still out is dropped, not queued. One hook, wrapped around the handler of anything whose second call would do real, unwanted work.

## Design

**The guard goes on the handler, not on the control.** An action in this app is
usually reachable three ways — a button in the terminal row, a row in the game
menu, and a keyboard shortcut — so graying the button fixes one third of the
problem and leaves the other two live. Wrapping the handler covers every trigger
at once, whatever fires it, and is why the shortcut needs no guard of its own.

**The sharp case is New game, and nothing self-heals it.**
`common.create_game` vacates the club's current-view pointer and inserts a new
current game, so two calls really do produce two games: the first is orphaned in
the club list, and every peer gets two invitation toasts. A game that reaches
that state stays there.

**A second shape uses it too:** a control that stays live across a round trip
and changes the board rather than leaving the page — waffle's swap, setgame's
hint — where the second press runs against the state the first press is still
changing.

**The drop is silent, and only the caller can report it.** `pending` exists for
that: feed it to whatever control should show the wait, and a slow network reads
as "working" rather than "nothing happened". A caller that ignores `pending`
shows the player nothing at all when a press is dropped, which is a choice
worth making on purpose rather than by omission. Whether a MENU ROW grays while
its action is out is not settled here — see `common/menu`.

**Not for every repeated call.** An idempotent call every client fires
(`submit_timeout`) is meant to arrive more than once, and an action a state flag
already gates (End and Concede stop themselves once `isTerminal` / `myConceded`
flips) is guarded by the state it changes. Reach for this where a second call
does work the first one already did.

**The gate closes on the click, not on the answer to a confirm.** Confirms here
are the async styled modal, not a thread-blocking `window.confirm`, so a second
trigger can arrive while the question is on screen; closing the gate first means
one question rather than two stacked. Canceling clears the gate like any other
path.
