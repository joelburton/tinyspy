# Area: word-list

The folders it reads: `word-list`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-20.** Nothing read yet.

## The roster

`src/common/word-list/` — every file `cs-met-word-list`:

- `WordList.tsx` — the readout itself: the heading's tallies, the bordered
  list, and the two row kinds (a found word with its finder's dot, an unfound
  one the reveal adds)
- `WordList.module.css` · `WordList.test.tsx`
- `useWordListFilter.tsx` — the two-axis filter in the header, and the empty
  line that names whichever axis emptied the list
- `useWordListFilter.test.tsx`
- `useRecentlyFound.ts` — which words arrived just now
- `useRecentlyFound.test.ts`
- `doc.md` (a three-line lede; the `## Intro to area` is owed, and
  `common/word-list` is the one `common/` row left on `INTROS_OWED` in
  `src/guards/folderDocs.test.ts`) · `todo.md` (every section empty — no
  earlier area handed this one anything)

Evidence, read and left `cs-unmet` — **and read with a refactor in mind**
(Joel at the opening: examine them "in case they're useful for any potential
refactoring of word-list"), since what the four callers have to build before
they can call is where a better seam would show:

- `src/boggle/components/InfoCol.tsx` and `src/boggle/lib/displayRows.ts`
- `src/spellingbee/components/InfoCol.tsx`
- `src/wordwheel/components/InfoCol.tsx`
- `src/shared/word-hunt/foundWordsDisplayRows.ts` — the shared row builder
  behind three of those four

NOT on the roster, ruled at the opening:

- `e2e/spellingbee-mobile.e2e.ts` (Joel: no), though it asserts this
  component's desktop-only `· Longest: N` clause at both viewports.
- `common/pdf/wordListBody.ts` · `wordColumns.ts` — a word list on paper, read
  and blessed by `pdf`.

## Findings

*(`F-word-list-1 · slug · title`, one heading each; a status prefix when it has
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
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
