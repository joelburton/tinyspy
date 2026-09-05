# single-flight

One run of an async action at a time: a second press while the first is still out
is dropped, not queued. One hook, wrapped around the handler of anything whose
second call would do real, unwanted work.

## Design

A player presses New game. The request goes to the server, the network takes a
moment, nothing on screen has changed yet — so they press it again. That second
press is not a mistake anyone can be blamed for, and for most actions it costs
nothing. For a few, it creates a mess that does not clean itself up: two games
where there should be one, the first orphaned in the club list, everyone in the
club holding two invitations. This folder exists for those few.

The guard goes on the **handler**, not on the control, and that is the decision
worth understanding. An action here is usually reachable three ways at once — a
button under the board, a row in the game menu, and a keyboard shortcut — so
graying the button fixes a third of the problem and leaves the other two live.
Wrapping the handler covers every trigger there is, whichever one fires, which is
also why the keyboard shortcut needs no guard of its own.

Dropping a press is silent by design, and that means the caller has to say
something or the player sees nothing at all. The hook hands back a `pending`
flag for exactly that: feed it to whatever control should show the wait, and a
slow network reads as "working" rather than "that did nothing". Ignoring
`pending` is allowed, but it should be a choice someone made rather than
something that happened.

Reach for this where a second call does work the first one already did. A call
every client is meant to fire (a timeout submission) is fine arriving twice, and
an action that flips a state flag stops itself once the flag flips — End and
Concede are guarded by the state they change. The cases that need the hook are
the ones where nothing else is watching.

## Details

- **The sharp case, concretely.** `common.create_game` vacates the club's
  current-view pointer and inserts a new current game, so two calls really do
  produce two games — and a club that reaches that state stays there.
- **A second shape uses it too**: a control that stays live across a round trip
  and changes the board rather than leaving the page — waffle's swap, setgame's
  hint — where the second press runs against state the first press is still
  changing.
- **The gate closes on the click, not on the answer to a confirm.** Confirms
  here are an async styled modal, not a blocking `window.confirm`, so a second
  trigger can arrive while the question is on screen; closing first means one
  question rather than two stacked. Canceling clears the gate like any other
  path.
- **Whether a MENU ROW grays while its action is out** is not settled here — see
  `common/menu`.
