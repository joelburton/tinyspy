# feedback — todo

## Bugs

- `GenericFeedbackPill.tsx`'s docstring says *"`msg.variant` is the
  transient-vs-permanent axis"*. There is no `variant` on the message; the
  axis is derived from `mode.kind` a dozen lines below. One call site believed
  it — strands' under-board clue pill passes `variant: 'outline'`, which is
  silently dropped.

## Soon

**This folder is a redesign, not a tidy.** Joel: *"this whole area feels
poorly designed and very poorly named. this isn't something we can fix with
individual findings, but with a clear design-review and very refactored
code."* `plans/feedback-system.md` says what the system IS and
`plans/feedback-design.md` is the target it builds to (every statement marked
DECIDED / PROPOSED / OPEN); both fold into this folder's `doc.md` when the
work lands. The boundary: from where a wrapper hands back an `Envelope` to
where a slot's contents reach `<GenericFeedbackPill>`. The envelope layer
below it is not this folder's. `terminalCopy` (in `terminal`) and `turnCopy`
(in `turn-log`) are message builders and belong to this vocabulary, and
"copy" is the wrong word for a message's words in this repo — its TEXT.

- **`stickyPill` and `getNotOkFeedback` cannot compose.** `stickyPill` is
  documented as the one builder for every "here's what your last action did"
  message and has 29 of 81 sites; 52 hand-build `mode: { kind: 'sticky' }`,
  and 40 of those are `{ ...getNotOkFeedback(res), mode: { kind: 'sticky' } }`
  — the line `genericPills.ts` itself prints as the contract. The two shared
  helpers of one vocabulary can't be used together, because one returns an
  object and the other takes positional arguments, so the mode is written by
  hand on the most common path in the app. Joel: *"stickyPill seems like a
  pointless function."* Its body is one field; its siblings own real
  decisions. The working pattern is a builder per recurring MESSAGE, not per
  mode.
- **The outcome-tone union is spelled twice.** `localPills.ts` declares
  `type OutcomeTone = 'won' | 'lost' | 'neutral'` with a docstring citing
  `TerminalCopy.tone`, the type it is copying, one file away. `terminalPill`
  exists to be handed `over.tone`, so the parameter should be
  `TerminalCopy['tone']`. The same union is spelled in eight more places
  across the games as `gameOver` props.

## Someday

## Maybe
