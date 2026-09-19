# Area: pdf

The folders it reads: `pdf`, plus `shared/wordle-style/pdfTiles.ts`. The
process is [app-audit.md](../app-audit.md) §4; the plan holds the order, this
file holds the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPENED 2026-09-19.** Roster listed and agreed the same day; eleven
files stamped `cs-met-pdf`. Opened ahead of its position because `psychicnum`
paused pre-close on it: that game's printer builds on this folder, and Joel
wants the shared printer read before he blesses the game.

## The roster

Agreed 2026-09-19. Eleven stamped files, three unstamped markdown files.

- **`src/common/pdf/` — ten files**, all `cs-unmet` at the opening and now
  `cs-met-pdf`: `frame.ts` + `.test.ts`, `columns.ts`, `wordColumns.ts` +
  `.test.ts`, `wordSections.ts`, `wordListBody.ts`, `eventLog.ts` + `.test.ts`,
  `marks.ts`.
- **`src/shared/wordle-style/pdfTiles.ts`**, `cs-unmet` at the opening and now
  `cs-met-pdf`. It lives in a shared family's folder and is read HERE (Joel,
  2026-09-19: *"add"*), because what it does is print. `shared/wordle-style`
  is therefore named by two rows of the plan's table, and both rows say so.
- **The folder's `doc.md` and `todo.md`**, and **`docs/pdf.md`** — roster, and
  none of the three carries a stamp (a `.md` has nowhere to put one).
  `todo.md` is empty: five headings, no items.

**Not the roster, and why:**

- **The sixteen games' `pdf/` folders** (`model.ts` + `print<Game>Pdf.ts`) are
  each game's own files, audited in that game's area and read here only as
  evidence.
- **The fifteen `e2e/*-print.e2e.ts` specs** are the same: each is audited with
  its game. This area may RUN them — that is what they are for — whenever it
  refactors something shared or moves the seam between a game and this folder
  (Joel, 2026-09-19).

## Planned work, agreed at the opening

- **`docs/pdf.md` collapses into `src/common/pdf/doc.md`** (Joel, 2026-09-19:
  *"we'll be collapsing this in the doc.md in this area as part of this
  area"*), the way `docs/games/psychicnum.md` was absorbed by that game's
  `doc.md`. Inbound links get repointed and `src/guards/docLinks.test.ts`
  catches what a grep misses.

## Findings

*(`F-pdf-1 · slug · title`, one heading each; a status prefix when it has
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
