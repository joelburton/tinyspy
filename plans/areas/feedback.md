# Area: feedback

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Status: NOT OPENED.** Created 2026-09-04, and runs immediately after
`game-lib`.

**What it is.** Everything between an envelope and a player reading words:
what a message IS, who owns a slot, and how one reaches React. It is the only
area created because of a DESIGN problem rather than a directory — see
[feedback-system.md](../feedback-system.md), which documents the system as it
stands today and is this area's first read. **The design it builds to is
[feedback-design.md](../feedback-design.md)**, started 2026-09-04 and kept
current as decisions land; the questions under "What the opening should
decide" below are answered there, not here.

**This area redesigns, it does not just audit.** Joel, 2026-09-04: *"this whole
area feels poorly designed and **very** poorly named. this isn't something we
can fix with individual findings, but with a clear design-review and very
refactored code."* So the shape of the work is: agree a vocabulary first, then
refactor to it — not walk the files filing corrections.

## The boundary

**Starts** where `runRpc` / `runEdgeFn` / `readRows` hand back an `Envelope`.
**Ends** where a slot's contents reach `<GenericFeedbackPill>`.

**Below it, and NOT this area's** — the envelope itself, its three builders, the
wrappers, `notOkOutcome`, `reportDbFault`. That layer came out of the
error/envelope sprint (finished 2026-09-01), is coherent, and is blessed under
`deep`. [feedback-system.md §10](../feedback-system.md) lists what is good there
so a review does not spend its budget re-deciding it.

**Two things inside the boundary that stay with their own areas**, because the
file is theirs and only a fraction of it is feedback:

- **`GamePage.tsx`** (`shared-game-chrome`) and **`ClubPage.tsx`**
  (`club-page`) each hold a global slot's state inline. The slot is this area's
  concern; the pages are not. Whatever this area decides about slot ownership
  lands as a change those areas apply — or as a hook this area writes and they
  adopt.
- **`FaultModal.tsx`** (`common-hosts`) is the fault channel's rendering. Faults
  are raised centrally below this area's boundary and are not a slot, so the
  modal is out; the fact that severity picks the channel is in.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP. Listed
here because the area was created by naming its files; re-measure at the
opening, per §21's "a shell's guessed roster is a note, never a count".)*

**Fourteen files, ~1,120 lines**, from four places:

```
FROM game-lib (six files, 379 lines — see "What came from game-lib" below)
  87  lib/feedback/genericFeedback.ts     GenericFeedbackMsg, GenericFeedbackApi
  94  lib/game/localPills.ts              the three below-board builders
  34  lib/game/localPills.test.ts
  55  lib/game/genericPills.ts            getNotOkFeedback
  71  lib/game/genericPills.test.ts
  38  lib/game/terminalCopy.ts            TerminalCopy, endedCopy

FROM hooks (six files, 558 lines)
 107  hooks/feedback/useLocalFeedback.ts          the local slot
 141  hooks/feedback/useLocalFeedback.test.ts
 104  hooks/feedback/useGlobalFeedback.ts         peer narration (NOT a slot)
 132  hooks/feedback/useGlobalFeedback.test.ts
  31  hooks/feedback/useDismissLocalFeedbackOnKey.ts
  43  hooks/feedback/useDismissLocalFeedbackOnKey.test.ts

FROM shared-game-chrome (one file, 100 lines)
 100  components/game/turnCopy.tsx        two more message builders

PREVIOUSLY UNASSIGNED (one file + its test and CSS)
  88  components/feedback/GenericFeedbackPill.tsx
      components/feedback/GenericFeedbackPill.test.tsx, .module.css
```

`GenericFeedbackPill` is the reason the area is justified on ownership alone: it
is the end of every path in this system and **no area's roster named it** — it
sat at `cs-unmet` while six areas shared its vocabulary.

**Deliberately NOT here:** `lib/game/feedbackTiming.ts`. Its name says feedback
but its contents are the durations of BOARD marks — the attention wash, the
your-turn frame — which belong to tile-feedback, not to pills. It stays in
`game-lib`, which is also where its open finding stays.

## What came from game-lib

Six files, and three of them had already been through a comment pass and an
audit under that area. **That work stands** — it is why this area starts from a
system it can describe rather than one it has to read cold:

| file | state when it moved |
|---|---|
| `genericFeedback.ts` | **blessed** under `game-lib` (group A wrote it, in the `gameManifest` split) |
| `terminalCopy.ts` | **blessed** under `game-lib` (group C) |
| `localPills.ts` + test, `genericPills.ts` + test | audited under `game-lib` group D; comment pass done, findings filed, none fixed |

Their stamps are now `cs-met-feedback`: this area will redesign them, so they
re-enter unread by ITS standard, and the blessing is a record of the read they
have had rather than of a shape anyone has committed to.

**Two findings moved with them** (`F-game-lib-27`, `F-game-lib-28`, both closed
there as MOVED, not as resolved):

### F-feedback-1 · `sticky-pill-and-not-ok-dont-compose`

`stickyPill` is documented as *"the one builder for every 'here's what your last
action did' message"* and has 29 of 81 sites; 52 hand-build
`mode: { kind: 'sticky' }`, and 40 of those are
`{ ...getNotOkFeedback(res), mode: { kind: 'sticky' } }`.

Those 40 are not rogue — `genericPills.ts` prints that line as the contract. The
finding is that **the two shared helpers of one vocabulary cannot compose**:
`getNotOkFeedback` returns an object, `stickyPill` takes positional arguments.
So the mode — which `localPills.ts` calls the decision worth getting right, with
nothing at runtime to catch a wrong one — is written by hand on the most common
path in the app.

Joel's read, 2026-09-04, and the reason this is a design question rather than a
fix: *"stickyPill seems like a pointless function."* Its body is one field. Its
two siblings own real decisions — `terminalPill` widens `text` to `ReactNode`,
`outOfRacePill` owns copy — and `permanent` has two builders and **two**
hand-written sites in the whole app. `timed` and `manual` have no builder and 50
sites, and nobody has missed them. So the working pattern is *a builder per
recurring message*, not per mode, and `stickyPill` is the one that doesn't fit.

### F-feedback-2 · `outcome-tone-union-spelled-twice`

`localPills.ts` declares `type OutcomeTone = 'won' | 'lost' | 'neutral'` with a
docstring citing `TerminalCopy.tone` — the type it is copying, declared one file
away. `terminalPill` exists to be handed `over.tone`, so the parameter should be
`TerminalCopy['tone']`.

The union is spelled out in eight more places across the game areas as
`gameOver` props. Not this area's, but worth knowing if the tone vocabulary is
ever centralized.

## Findings

*(IDs are `F-feedback-1`, `F-feedback-2`, … — §21 → Areas. Every heading states
its status; no status prefix means OPEN. The two above arrived with the files
and are OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to
losing it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name.

### What the opening should decide, before any file is changed

From [feedback-system.md](../feedback-system.md). These are the questions the
current names are dodging, and a rename pass that skips them will produce the
same mess with different words:

1. **Is a "pill" a message, a slot, a builder, or a component?** Today it is all
   four (`GenericFeedbackMsg`, `localFeedback`, `stickyPill`,
   `GenericFeedbackPill`).
2. **What does "message" mean?** A string on the envelope, a *different* string
   on `TerminalCopy`, and an object everywhere else.
3. **Does the half-built message get a name?** `getNotOkFeedback` returns an
   unnamed `Pick<…>`, which is why nothing can take it as a parameter.
4. **Is `TerminalCopy` a second message type?** Its `verdict` becomes a pill's
   `text`, its `message` is a line on another surface, its `tone` is the pill's
   `tone` renamed.
5. **Who owns a slot?** The local one is a hook; the global one is inline state
   in two different pages.
6. **What is `useGlobalFeedback`?** Not the global slot — a peer-narration
   producer writing into someone else's. It needs a name with a subject.
7. **Should "cannot be dismissed" be expressed twice?** `mode: 'permanent'` on
   the message, and `useLocalFeedback({ locked })`, which eleven games pass.
8. **Do `text: ReactNode` and a server's `message: string` want to be one
   field?** Joel, 2026-09-04: *"we have at least two different types: for
   feedback msgs with react-nodes and text for the message text."*

### Already waiting for this area

- **`GenericFeedbackPill.tsx:49`** documents a `msg.variant` property that does
  not exist; the axis is derived from `mode.kind` twelve lines below. Filed at
  `shared-game-chrome` before this area existed — it belongs here now, and
  `strands`' dead `variant: 'outline'` (filed in `strands.md`) is the one call
  site that believed it.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
