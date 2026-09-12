# faults

The fault queue, and the blocking modal that shows whichever fault is at its
head. A fault is a failure nobody planned for, a bug or a request that never
reached the server, and [docs/ui.md → Faults](../../../docs/ui.md) owns what
one is and what it renders as.

## Design

Almost everything the server says back to a player is an answer: that was not
a word, the game is over, it is not your turn. Answers are expected, and they
appear where the player's action was. A fault is the other thing, the app
itself breaking, and it has to look unmistakably different, so that "did a box
pop up?" settles which kind of trouble a friend is in before anyone reads a
word. This folder is that box: a short queue of faults, and the one modal,
mounted at the root of the app, that shows the front of the queue.

The design idea worth knowing is who raises a fault, because no call site
does. Every database call goes through a wrapper, and the wrapper is the layer
that holds the facts a fault needs: what was called, what status came back,
how long it took. So the wrapper writes the console line and puts the fault on
this queue, before the call site has even received its answer. Two things
follow from that. A call site cannot forget to raise the modal, and a fault
never gets as far as a pill or a form line choosing whether to show it. The
same failure does still land on the pill or the form line afterward, as an
escalation rather than a replacement, so dismissing the modal never leaves a
form looking fine when the real news is that the server is down. The store, for
its part, only holds and hands over. It does not classify, word or log
anything, which is what keeps its rules readable as rules.

Each fault is shown alone, and dismissing it reveals the next. Two failures are
two different things to tell someone, and merging them would produce a message
nobody wrote. The queue is deliberately short: past its cap a new fault gets no
modal at all, and nothing is lost by that, since the console line was written
before the fault reached the queue. A burst of failures should not leave
someone clicking Close forty times to reach their game; after a handful, the
modal has done its whole job of saying the app is broken.

The modal is a blocking modal like any other, one tier above the ordinary
ones, so it can be read in the middle of whatever question was already open.
What it shows is not written here. Its message is the envelope's own sentence,
whoever wrote it, and the diagnostics under it are the same line the console
carries, built once. docs/ui.md → Faults lays out the three lines.

## Details

- **The store decides nothing.** `showFaultModal` queues and emits. The words
  and the `[db]` console line come from `reportDbFault` in `dbEnvelope.ts`,
  and the mandatory `else` at every call site reaches the queue through
  `reportUnhandled`, which goes the same way.
- **A caller reaches past the wrapper only when the words are already chosen:**
  a sentence the server worded, or a diagnostics line built by hand.
- **The diagnostics line is optional and drawn only when present.** A fault
  routed through the wrapper always has one. A fault raised by hand from words
  the server already wrote has no transport facts to put underneath, and the
  modal is two lines.
- **The message wraps freely and never ellipsises.** A raw Postgres sentence is
  exactly the case that needs the room, and half of one is no use to whoever is
  reading it aloud to a friend.
- **The red "Error" is an `<h3>` drawn in the body.** The modal hands the shell
  no title, so the heading's size comes from base.css and only its color,
  weight and margin are this folder's.
- **Its family is `modal-fault`**, which is what puts it above a blocking
  modal. `FloatingPanel`'s family table says what that resolves to.
- **A backdrop click does not dismiss.** A fault is see-and-acknowledge, so it
  takes a deliberate Close or Escape and never a stray click.
- **`window.pupfault()` pops a realistic fault from the console**, and it is
  installed in production as well as in dev: a real fault is a bug or a dead
  network, so there is no honest UI path to one on demand, and the deployed
  site is the only place the modal's look can be checked where it matters. The
  twin of `window.puptoast()`.
- **Two test seams**, `clearFaultsForTest` and `peekFaultsForTest`, exist so a
  component test can assert that a failure was routed to the modal rather than
  to a slot.
