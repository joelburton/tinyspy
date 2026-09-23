# board-marks

The marks a board wears for a beat and then takes off: the attention flash on
the pieces a move just changed, the frame at the moment the turn becomes yours,
and the marks a game raises for its own reasons — with every mark's lifetime.
None of them is state — a mark says "look here", never "this is how things are".

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

The third is the general case: something that should be up for a moment for a
reason this folder has no opinion about. That is `useMark`, and it is one hook
rather than several because marks differ in three ways — what they carry,
whether they announce themselves before showing an answer, and when they come
off — and all three are decisions a game makes per mark and sometimes per
raise. wordiply announces a teammate's word and not your own from one line. So
they are arguments at the call, and the hook's docstring is their contract.
None of this is about a move.

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
| `useMoveAttention` (over `useChangeCause`) | waffle, connections and psychicnum `Board` | the attention flash on pieces a move changed |
| `useMark` | every game that marks something of its own, most more than once | a refused word's answer, a teammate's word announced then answered, a head-shake, an ambiguous letter, an arrival, a placement outline |
| `useTurnStartFlash` | waffle, wordle, connections and psychicnum `PlayArea` | the frame around the board as the turn arrives |

setgame is on `useChangeCause` underneath as well, keyed on the last claim's id.
Its mark is not a flash for a beat — a claim substitutes cards in place, so the
departing cards are held on screen before the swap, the claimer sees dim where
everyone else sees lit, and the two halves have lifetimes chosen against each
other (`setgame/lib/flash.ts`). That choreography is its own and stays its own.

**A mark that holds a SET is derived once, beside the hook** — a board reads
`mark?.value.ids ?? NO_TILES` against a module-level empty constant and hands
that down, so nothing below knows a mark is involved. The constant is the point:
a render at rest must hand children the same object, or everything memoized on
it recomputes on renders the mark had no part in. Such a set is emptied with
`clear()`, never by raising a mark of nothing — an empty raise is still a raise,
with a nonce and a clock.

**One requirement on the caller's data path**, worth checking when a new game
raises an attention mark: the content key and the move marker must come from the
same read, so that within one render a board that has moved always carries the
row that moved it. A marker that arrives a render after its content is too late —
the change is absorbed as an unexplained one, and the move it would have
announced is never marked.

**A re-dealt board is not one of the cases this has to survive.** A restart bumps
`common.games.restarts`, which the page keys its play surface on, so the whole
surface unmounts and every hook in it — this one included — starts again against
the new board and says nothing. What the cause gating is really for is the change
that arrives WITHOUT a remount: a terminal reveal swapping the solution in, which
would otherwise light the whole board at the moment nothing happened.

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

**Every mark's lifetime lives in `feedbackTiming.ts`**, because how long news
stays up is a property of the vocabulary rather than of a game: a player who
learns the beat in one game should read it in the next. It is the only home for
them: `publishMarkDurations` writes the animated ones onto the document root at
startup and the stylesheet reads the tokens, so CSS holds no number of its own.
What a game times is only the mark's CLASS, on the fade plus a little slack —
early would clip the animation, late now costs nothing, because the visible mark
ends by itself.

So `useMark` has no default duration: a caller names the beat it is raising, and
passing a number of its own is a claim that the mark is a kind the vocabulary
does not have yet — setgame's hold-then-arrive is the one that is, and its two
numbers live with the choreography they time. The lifetime that is not a
duration is
`NO_TIMER` — the mark with no clock, standing until the action that answers it
clears it: letterboxed's refused word and connections' verdict, which lives
exactly as long as the pill it arrived with.

**Announce, then answer, and the changeover is the fade.** A piece that has to
be pointed at AND then wear an outcome takes the two in sequence, and the
answer's color goes on at exactly the instant the attention flash finishes
fading — the instant the piece's own color becomes visible again. The order and
both instants are the vocabulary's rather than a game's; what a game chooses is
whether to announce at all, since your own move is news to nobody but the
table.

**Both halves of the attention mark are animations on that one duration** — the
flash fading off the piece, and the dark ink it needs while it is up. They begin
together when the class lands and end together when the duration is spent, so
there is no state in which a piece shows its own color under the mark's ink.
Tying the ink to the class instead is what produced exactly that: a timer that
fires late (a throttled tab, a constant someone lengthened) left dark ink on a
piece that had handed its color back.

**A mark may be raised during render**, which is what lets one land in the same
commit as the change it points at — the marks whose cause is a comparison of
renders rather than a click. So `useMoveAttention` exists for what it KNOWS
rather than for when it may run: it is a move-gated differ over
`useChangeCause`, and a game raising a mark of its own needs nothing but `show`.

**A mark that must fire twice in a row needs a key that changes**, because a CSS
animation runs once per mount. The counter comes with the mark; what a board
chooses is the GRAIN: the pieces a word used (boggle, letterboxed, connections,
spellingbee, wordwheel), or the board itself should a board shake as one. A
whole-board key keeps a counter of its own, since a mark is null most of the
time and keying on it would remount a second time as the mark ends. The rule and its reason live beside
`.verdictShake` in `game-page/playArea.module.css`, which is where someone adding
a mark will be standing.

The tile's attention flash is drawn as an overlay rather than as a background, because a
background cannot be faded and the fade is what makes the mark hand the tile
back rather than blink off it. It is transparent until the animation raises it,
so a piece is never stuck under solid yellow if a duration never arrives. That
rule and the one about a game lifting its tile's content above the flash are
`game-page/playArea.module.css`'s; the color vocabulary the marks draw from is
[docs/ui.md](../../../docs/ui.md)'s.
