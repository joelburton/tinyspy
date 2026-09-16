# Area: timer

The folders it reads: `timer`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: NOT OPENED.**

## The roster

*(agreed with Joel when the area opens — list the files and STOP)*

## Findings

*(`F-timer-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

- **A forward-fix at the listing, 2026-09-16, before the roster was agreed.**
  Listing the folder's importers showed bananagrams' `PlayArea.tsx` reaching in
  for `timerLabel` — the only game to. Joel: *"is there any real reason
  bananagrams is different?"* There was none: its info column rendered a
  hand-kept `<li>` list from before the shared recap existed, while its
  `lib/setupSummary.ts` fed only the PDF — and the two disagreed, the PDF
  printing `dump_to_bag` the wrong way round. Fixed on *"fix this"*: the
  disclosure maps `summaryRows` like every other game, the summary reads the
  dialog back in its own order and words, the dump row is the right way
  round, and `lib/setupSummary.test.ts` (new) plus a `PlayArea.test.tsx` spec
  pin it, plant-verified. `timerLabel`'s docstring ("two places print it") is
  true again without being touched. bananagrams' files keep `cs-unmet`; this
  folder's were not read.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
