# faults

The fault queue, and the blocking modal that shows what landed in it.

## Design

docs/ui.md → Faults says what a fault is and what it renders as: a failure nobody planned for — a bug, or a request that never reached the server — shown as a blocking modal, deliberately unlike every normal message. The shape test is *"did a box pop up?"*, which separates "the game refused my move" from "the app is broken" before anyone reads a word, and is answerable down a phone line. This is how the code holds that.

**Nothing authors a fault by hand, and nothing can.** The layer that received the failure raises the modal itself — `reportDbFault`, called from the wrappers, with the transport facts no call site could rebuild. Every call goes through a wrapper, so there is no second path and no decision at a call site about whether something "counts". A caller reaches past that only when the words are already chosen: a sentence the server worded, or a diagnostics line built by hand. This is also why a fault never reaches a feedback sink and no sink checks for one — the modal is raised before a call site has an answer to hand anywhere. The rule holds by construction rather than by a branch.

**The store decides nothing.** `showFaultModal` queues and emits; it does not classify, does not word anything, does not log. Everything that looks like judgment happened upstream, which is what keeps this file's rules readable as rules.

**One fault at a time, each its own modal.** No batching and no dedupe: two different failures are two different things to tell someone, and merging them would produce a message nobody wrote. Dismissing shows the next. A storm would be annoying, and the answer to that is to fix the storm.

**The queue caps at five, and overflow is dropped from the UI only.** "Silently" means no modal — whoever routed the fault already wrote its `[db]` console line before it ever reached the queue, so nothing is lost to diagnosis. The cap exists because a burst of failures should not leave someone clicking Close forty times to reach their game; past a handful, the modal has already done its whole job of saying the app is broken.

**Three lines, and only two are guaranteed.** "Error" in red is the shape test. The message beneath it is the envelope's own — the sentence the RPC author wrote at the raise, or Postgres's own text, or the frontend's sentence when nothing answered — and is never edited here, which is why it wraps freely and never ellipsises: a raw Postgres sentence is exactly the case that needs the room, and half of one is no use to whoever is reading it aloud to a friend. The small muted diagnostics line is the third, and it appears only when there is one: a fault routed through `reportDbFault` always has one, but a fault raised from words the server already wrote has no transport facts to put underneath, and the modal is two lines. That line is the same string the `[db]` console line carries, from one builder, so the screen and the log cannot drift.

**It is a `BlockingModal`, one tier above the ordinary one.** It inherits the whole category — the world stops, nothing underneath is live, Tab stays inside, it cannot be dragged aside — and its `modal-fault` family puts it above a blocking modal, because an error has to be readable in the middle of whatever question was already on screen. A backdrop click deliberately does not dismiss: a fault is see-and-acknowledge, so it takes a deliberate Close or Escape and never a stray click.

**The modal is an escalation, not a replacement.** The same failure still reaches the pill or the form line like any other answer, so dismissing the modal does not leave a form looking fine or a board still showing "FOOZLE: not a word" when the real news is that the server is down.

A real fault is a bug or a dead network, so there is no honest UI path to one on demand and the modal's look could never be checked. `window.pupfault()` is that path, and it installs in production as well as in dev: a fault is rare and unplannable, so the deployed site is the only place its look can be checked where it matters.
