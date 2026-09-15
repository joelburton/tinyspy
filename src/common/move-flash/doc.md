# move-flash

The marks a board wears for a beat and then takes off: the wash on the pieces a
move just changed, the frame at the moment the turn becomes yours, and a
general hot set a game lights for its own reasons. None of them is state — a
mark says "look here", never "this is how things are".

## Intro to area

A board in this app changes under people who are not watching it. Someone else
plays, the row arrives over the wire, and three pieces are simply different
from what they were a second ago; if you were reading another corner of the
board, nothing told you. The answer is the same everywhere: for about a second,
the pieces that changed wear something loud, and then the board goes back to
showing the game state and nothing else. This folder is the shared machinery
for that, and it answers three questions.

The first is which pieces just changed — and, harder, whether a move is what
changed them. A diff cannot tell: a board also changes when a restart deals a
fresh one, when a terminal reveal swaps the solution in, and when you open a
finished game and arrive at a board full of history. A diff sees only that
things differ, so left alone it lights the whole board up at exactly the
moments nothing has happened. The rule is to read the cause rather than infer
it from the state, because every proxy that can be measured off the board — how
many pieces differ, whether a count grew, whether a score moved — has a case
that breaks it. The cause is recorded on the server: a move writes a row, and
the things that are not moves do not. So `useChangeCause` takes the content, a
key for what "changed" means, and the server's move marker, and answers in three
parts: nothing changed, a move changed it (here is the content as it was, to
diff), or it changed and no move did it. Most games need only the middle answer
and do not reach for the hook directly — `useMoveAttention` wraps it with the
diff and the mark's lifetime, and a game supplies only what is its own: what
counts as changed, and when to stay quiet. The third answer is for a game that
has to DO something about a board it did not expect, which in practice means
showing the new one and taking its marks off.

The second question is whether the turn just became mine. In a turn-order game
the board looks exactly the same the instant it becomes yours, and you are by
definition looking somewhere else when it happens, because you have been
waiting. The dim lifting off the board is a real signal, but a removal is a
poor one — you notice things that appear far better than things that stop — so
`useTurnStartFlash` fires a frame around the board on the rising edge, and
never on mount.

The third is the general case: a set of pieces that should be hot for a moment
for a reason this folder has no opinion about. `useFlash` is that set — a game
hands it ids, they go hot, and they clear themselves. It is what marks an
ambiguous letter in the word a player typed, or outlines the cells of a word
the server just refused, neither of which is about a move at all.

What this folder decides is which pieces are hot and for how long; the drawing
is CSS, in `game-page/playArea.module.css`. The durations are not written twice:
`feedbackTiming.ts` holds them and publishes them to the stylesheet at startup,
and the marks are animations on those published durations, so what a mark looks
like and how long it lasts end at one instant that no timer can move. Who a mark
is FOR stays with the caller, because it differs per game: your own move is news
to everyone except you, so each game's diff is where the decision to leave
something unmarked is made.

## Details

**Who calls what.**

| hook | callers | what it marks |
|---|---|---|
| `useMoveAttention` (over `useChangeCause`) | waffle, connections and psychicnum `Board` | the wash on pieces a move changed |
| `useFlash` | stackdown `BoardCol`, strands `PlayArea`, scrabble `BoardCol` (one per outline color) | an ambiguous letter, or scrabble's green / yellow / red placement outlines |
| `useTurnStartFlash` | waffle, wordle, connections and psychicnum `PlayArea` | the frame around the board as the turn arrives |

setgame is on the two pieces underneath instead: `useChangeCause`, keyed on the
last claim's id, and `useFlash` for the arrivals. Its mark is not a wash for a
beat — a claim substitutes cards in place, so the departing cards are held on
screen before the swap, the claimer sees dim where everyone else sees lit, and
the two halves have lifetimes chosen against each other (`setgame/lib/flash.ts`).
That choreography is its own and stays its own.

**Two requirements on the caller's data path**, and both are worth checking
when a new game raises an attention mark. The content key and the move marker
must come from the same read, so that within one render a board that has moved
always carries the row that moved it. A marker that arrives a render after its
content is too late: the change is absorbed as an unexplained one, and the move
it would have announced is never marked. And a re-deal must DROP the marker
rather than carry it forward — the RPCs that re-deal a board delete the move
log with it, so the marker falls instead of advancing and a fresh board reads
as what it is rather than as a flurry of moves.

**The cause check runs during render**, not in an effect, so that the caller
can set its own flashing state from the result and have the mark and the change
land in the same commit. If the change paints a frame before the mark, the eye
catches the change first and the mark arrives as a second, unexplained event.

**A change no move caused is absorbed, not ignored.** `useChangeCause` re-seeds
on every change, whether or not a move caused it, so the next move diffs against
what is actually on screen — and it still reports the change, as the answer
whose `byMove` is false, because a game may have to act on it. The first render
seeds too, which is why opening a finished game — a full move log, a board
arrived at long ago — says nothing at all.

**The two named lifetimes live in `feedbackTiming.ts`**, because how long news
stays up is a property of the vocabulary rather than of a game: a player who
learns the beat in one game should read it in the next. It is the only home for
them: `publishMarkDurations` writes them onto the document root at startup and
the stylesheet reads the tokens, so CSS holds no number of its own. What a game
times is only the mark's CLASS, on the fade plus a little slack — early would
clip the animation, late now costs nothing, because the visible mark ends by
itself. `useFlash`'s callers pass their own durations.

**Both halves of the attention mark are animations on that one duration** — the
wash fading off the piece, and the dark ink it needs while it is up. They begin
together when the class lands and end together when the duration is spent, so
there is no state in which a piece shows its own color under the mark's ink.
Tying the ink to the class instead is what produced exactly that: a timer that
fires late (a throttled tab, a constant someone lengthened) left dark ink on a
piece that had handed its color back.

**`useFlash`'s trigger starts a timer**, so it is called from an event handler
or an effect and never during render. That is why the attention mark has a hook
of its own rather than using it: its diff has to run during render to land in
one commit with the change, so `useMoveAttention` takes the diff as a function
and raises the set itself.

The tile wash is drawn as an overlay rather than as a background, because a
background cannot be faded and the fade is what makes the mark hand the tile
back rather than blink off it. It is transparent until the animation raises it,
so a piece is never stuck under solid yellow if a duration never arrives. That
rule and the one about a game lifting its tile's content above the wash are
`game-page/playArea.module.css`'s; the color vocabulary the marks draw from is
[docs/ui.md](../../../docs/ui.md)'s.
