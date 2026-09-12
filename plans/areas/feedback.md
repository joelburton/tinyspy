# Area: feedback

The folders it reads: `feedback` · `terminalCopy` (in `terminal`) · `turnCopy` (in `info-sheet`). The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN, 2026-09-12.** The design was decided before the opening
(`plans/feedback-design.md`, every item DECIDED), and that plan is the
working record for this area; this file holds the roster, the notes and the
closing. By Joel's ruling the area is BUILT first and audited at the closing
re-read: most of the roster is replaced outright, so a prose pass over it
would audit files about to be deleted. `F-feedback-n` is for what the build
turns up that the design did not foresee.

## The roster

Agreed 2026-09-12, eighteen files, all `cs-met-feedback`:

- `src/common/feedback/` — sixteen code files: `genericFeedback.ts`,
  `genericPills.ts` (+ test), `localPills.ts` (+ test),
  `useLocalFeedback.ts` (+ test), `useGlobalFeedback.ts` (+ test),
  `useDismissLocalFeedbackOnKey.ts` (+ test), `GenericFeedbackPill.tsx`
  (+ test + stylesheet), `FailureLine.tsx` (+ stylesheet; not feedback,
  decided on contact).
- `src/common/terminal/terminalCopy.ts` and
  `src/common/info-sheet/turnCopy.tsx` — the two builders that live
  elsewhere.

Files this area creates are stamped `cs-met-feedback` at birth and join
this list. Created 2026-09-12, the machinery (fifteen files):
`feedback/FeedbackMessage.tsx`, `feedback/feedbackSlotStore.ts`,
`feedback/useFeedbackSlot.ts`, `feedback/feedbackSlotRegistry.ts`,
`feedback/FeedbackPill.tsx` + `.module.css`, each with its test;
`terminal/terminalMessage.ts` + test; `info-sheet/turnText.tsx` + test;
`src/guards/feedbackNames.test.ts`.

Edited by the area, owned elsewhere (stamps do not move):
`common/chat/useChatFeedback.tsx` (+ test), `game-page/GamePage.tsx`,
`club/ClubPage.tsx`, `game-page/useStandardGameActions.ts`,
`shared/word-hunt/useWordSubmit.ts`, and every game's PlayArea and BoardCol
that creates a message. `e2e/chat-feedback.e2e.ts` and nine game specs
assert on pill text.

## Findings

*(`F-feedback-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
