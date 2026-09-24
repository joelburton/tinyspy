# feedback

The feedback pill a game shows under its board or in the page header, and
everything behind it: the message and its kinds (`FeedbackMessage`), the slot
that holds the live ones and picks which to draw (`useFeedbackSlot`), the hook
that narrates a peer's stream into the header (`usePeerFeedback`), the any-key
dismisser, and the registry a console trigger and a test reach a mounted slot
through. One shape for every message the app says to a player about their own
last action, the state they are in, or what someone else just did — and one
rule for which of them is on screen.

## Intro to area

A message is a kind, not a string. Every message is built by a named
constructor — the server said no, the front end's own verdict on a move, the
game is over, it is a teammate's turn, someone else found a word — and the kind
that constructor names is what decides the rest: whether the pill wears a
tinted background, how long it stays, what takes it away, and which message
wins when two are live. A call site therefore picks a *meaning* and gets an
appearance, rather than picking an appearance and hoping sixteen games agree.
The table of kinds is the whole of that decision, in one place — `KINDS` in
`FeedbackMessage.tsx`, where the comment on each row says what the kind is for.

That is enforced rather than encouraged, which is why a message is a class with
a private constructor. An object literal cannot be one and a spread loses the
getters, so a hand-built message — or one that quietly re-ranks itself — is a
compile error, in tests as much as in a game. Each constructor does take an
overrides argument for the site that genuinely has to bend its kind, and that
stays rare by being conspicuous: the bending is written where it happens
instead of accumulating in the table.

A slot is a list, and it never throws anything away. It holds every live
message and draws the lowest-ranked one, and a message leaves only the way its
own kind says it leaves — the player's next action, a timer, the ×, or the
owner retracting it. Nothing is discarded on the way in, and that is the
part worth understanding, because the tempting alternative fails: if showing a
message removed whatever shared its rank, an owner-cleared message would be
destroyed rather than covered, and its owner — having shown it on a rising
edge — would never show it again. The screen would then go quiet about
something still true. Because nothing is discarded, a rank is a priority and
nothing more: two kinds share one where neither outranks the other, and the
slot draws the newer of them.

A condition is an effect. Anything that is true for a while — it is not your
turn, the chain is full, you are out of the race, your partner is writing a
clue — is shown on the rising edge of a boolean and retracted in the effect's
cleanup, so "still true" and "on screen" are the same fact and neither can
drift from the other. The cleanup covers every way the condition can end at
once, including ones nobody enumerated: the turn arriving, the game finishing,
a player conceding, the page closing. It also means the slot itself needs no
idea what any message is about.

There are two slots because there are two questions, and they are split by
*who the message is about*. What you did and what you are in the middle of
belongs near the board, where you are already looking; what someone else did
belongs in the page header, beside the people it names. The case that tests the
split is "Waiting for ● moth…" — it names a peer, but it tells *you* that you
cannot act, so it is your standing condition and it goes near the board, in
every game. What earns the header is news another player generated: their move
narrated, their chat line, a description of what they are doing that changes as
they do it. And the header has a cost the board does not: a message parked
there outranks chat and every narration for as long as it holds, and hides the
players strip while it does, so nothing belongs there for the length of a game.

## Details

- **The slot dies with its host.** `useFeedbackSlot` makes one per PlayArea or
  page and clears every pending timer on unmount, so a message cannot outlive
  the surface that showed it. The page hands its instance down as
  `ctx.globalFeedbackSlot`.
- **Dismissal is one hook, and it is deliberately ignorant.** The any-key
  watcher hands the slot a `dismiss()` and never asks what is showing; the slot
  removes the top message only if that message's kind leaves by a gesture. So
  the rule lives in one place and a not-ok survives a keystroke without anyone
  re-checking for it.
- **Tapping a pill is the next action, too.** The rule for a gesture-cleared
  message was always "your next action clears it"; a keystroke or a tile click
  is one, and so is tapping the message itself. On a touchscreen there is no
  next keystroke, so the tap is the one way the rule can fire. A not-ok or a
  hint keeps its × as the only target, since a body that swallowed the tap
  would make the × look decorative.
- **A peer's stream and a peer's state need different machinery.**
  `usePeerFeedback` watches an append-only stream and narrates each new row,
  seeding the backlog silently so a reconnect does not replay it. A signal read
  off a changing number instead — a rank climbing, a `solved` flag flipping —
  is a delta detector, and those stay in the games that need them.
- **Pause does not clear feedback.** The overlay covers the play surface, not
  the header, and a showing message stays readable across a pause and resume. A
  message that should not survive one is its owner's to retract.
- **`window.puppill('hey', 'hint')`** from the browser console puts a message
  into a mounted slot, the way `puptoast` does for toasts. Every real message
  needs a real event behind it, so there is no honest UI path to one on demand.
- **The words a message says are not always written here.** A terminal
  verdict's sentence is built in `common/terminal`, and a waiting line's in
  `common/info-sheet`, because both of those have a second surface that must
  say the same thing. A game's own answers — correct, wrong, already guessed —
  are built in that game's `lib/answer.ts`, which returns an `AnswerMessage`
  (the `{ outcome, text }` pair `result()` takes) so the game's pill, log bar
  and peer line read one table. The type lives here because the pair is this
  folder's; which answers a game has is the game's.
