# pause-suspend

Stopping a game while a player is missing or somebody wants a break, and the
banner that stands in for the board while it is stopped.
[docs/states.md](../../../docs/states.md) owns the vocabulary.

## Intro to area

A game here is a group of friends on a call, all looking at the same board, and
nobody is watching who is not playing. So when one of them drops off — a closed
laptop, wifi gone, a tab that crashed — the game cannot carry on without them:
the call has stalled, and the right thing to do is stop until they are back. The
other reason to stop is far more ordinary. Somebody is making tea and says so.
Both arrive at the same place, and this folder is the rule that recognizes it,
the gate that acts on it, and the banner that says what happened.

The rule is `computePause`, a pure function of two things: the user ids realtime
reports as connected, and the players this game expects. Anyone expected and not
connected is missing, and a game with somebody missing is paused. `useCommonGame`
unions that answer with the manual pause into a single boolean and hands it down.

The gate is `PauseBoundary`, which takes that boolean and renders either the play
surface or the banner, never both. It *unmounts* the play surface rather than
hiding it, and that is the design and not an implementation detail: every game's
in-progress state — a half-typed guess, a set of selected tiles — goes with it
and rebuilds clean on resume, so no game has to write cleanup for a pause it
never has to think about.

The banner is `PauseOverlay`, and mostly what it does is tell you who you are
waiting on: the whole expected team, one per row, a filled disc for present and a
hollow ring for away. A manual pause instead names whoever pressed Pause and
offers Resume, which any connected player may press. A presence pause should
clear itself the moment the missing player reconnects — but it can wedge, when
both players have walked away or a socket died in an OS sleep, so the banner also
carries the two ways out of a pause that will not clear: back to the club, or end
the game. Both go through PostgREST, which keeps working when Realtime does not.

Suspend is the folder's other word, and a different thing. A paused game is still
the game the club is looking at and means to resume in a minute; a suspended game
has been shelved, and the club has moved on to something else. One game can never
be both. All that lives here is the question asked before shelving a game other
people are in, because suspending drags every one of them back to the club page.

## Details

**`computePause` is a function and not a hook** because presence cannot have a
channel of its own. supabase-js requires every `.on()` handler to be attached
before `.subscribe()`, so one hook owns the game's channel and registers
postgres_changes, broadcast and presence together; it derives the connected ids
there and calls this helper with them. A `usePause` would need either a second
channel or a share of the first, and both are worse than a function.

**Who counts as expected is `useCommonGame`'s decision**: the game's players
minus anyone who conceded, so a player who has bowed out does not hold the rest
of the table hostage. A player invited but not yet arrived DOES count — a fresh
game sits paused, waiting, until everyone has joined, which is the point
([docs/common.md](../../../docs/common.md) → the game waits for invitees). The
flag is also forced false once the game has ended, so a finished board shows its
result instead of a banner.

**The decision is made once, there.** `PauseBoundary` acts on the flag it is
given and `PauseOverlay` draws whatever it is handed; neither asks again whether
the game is paused — the overlay reads the roster only to split present from
away. Resume releases the manual pause and nothing else: a presence pause
outlives it and clears when the missing player is back.

**New game state answers the question "should this survive a pause?"** Because
the boundary unmounts, anything inside a `PlayArea` is pause-transient by
construction, and state that is *meant* to vanish needs no wiring at all. State
that must survive goes in the database, or into `useCommonGame` above the
boundary — the members, presence, the clock. `docs/common.md` states the rule for
the app; this folder is where it is enforced.

**The two escapes are `GamePage`'s bindings, not the overlay's.** The overlay is
unmounted the moment the pause clears, so an action bound inside it would leave
the dispatcher's stack with it. `GamePage` sits above the boundary and stays
mounted, so it binds both and the overlay merely places them. Its `act-end-game`
hides itself unless paused, which is what keeps it from ever being live alongside
the game's own binding of that action.

**The render tree.** Only the banner is drawn from this folder. The suspend
question is not a component here at all — `suspendConfirm(title)` is words, and
`<ConfirmationHost>` at the app root draws them, which is how every question in
the app is asked:

```
GamePage                              the shell, above the pause — stays mounted
└── PauseBoundary                     one boolean: the play surface, or the banner
    ├── not paused →  the game's PlayArea, inside GamePage's own wrappers
    └── paused     →  PauseOverlay
                        ├── Dot              × the players it lists (members/)
                        ├── DotActor         "X paused the game" (members/)
                        ├── StandardButton   Resume (buttons/)
                        └── ActionButton × 2 back to club, end game — both
                                             bound by GamePage (actions/)

GamePage.requestBackToClub            multiplayer, mid-game:
└── askConfirmation(suspendConfirm(title))    drawn by ConfirmationHost, at the
                                              app root (floating-panels/)
```
