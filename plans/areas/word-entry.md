# Area: word-entry

The folders it reads: `word-entry`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — roster agreed and stamped 2026-09-18, nothing audited yet.**
Taken OUT OF ORDER at Joel's ask (*"open word-entry area (it's not the next, but
we're taking this one out of order)"*); §3's next in sequence is row 42,
`word-list`. Nine files `cs-met-word-entry`.

## The roster

`src/common/word-entry/` — nine files `cs-met-word-entry`, plus the folder's own
two docs (not stamped; the script's scope is files with a first-line comment):

- `EntryBox.tsx` · `EntryBox.module.css` — the typed-word box. No `<input>`;
  keystrokes come off the window
- `EntryRow.tsx` · `EntryRow.test.tsx` — the row that wraps the box: Delete, the
  box, Submit, and the feedback line under it
- `MoveRow.tsx` · `MoveRow.module.css` · `MoveRow.test.tsx` — the below-board
  move row
- `useArrowHistory.ts` · `useArrowHistory.test.ts` — ↑/↓ recall of earlier
  entries
- `doc.md` · `todo.md`

**Deliberately NOT on it**, both ruled by Joel at the open:

- **`shared/onscreen-keyboard/GuessKeyboard`** — *"isn't related at all"*. It has
  its own area (§3 row 52).
- **`common/keyboard/useCaptureKeys`** — *"already handled"* (that area closed
  2026-09-10, blessed). `EntryBox` is built on it, and Joel allowed it **as
  evidence**: *"you can use it as evidence if its useful"* — read it, compare
  against it, quote it; it takes no stamp from this area and joins no roster
  (§4 → `cs-found` means found, not read).

## Findings

*(`F-word-entry-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

**What `todo.md` hands the area** — its first read, per §4, so the audit does not
re-derive what earlier areas already found:

- **A bug.** `useArrowHistory` answers `disabled` where it should answer
  `hidden`. A caller offering no recall at all (letterboxed, through
  `<EntryRow>`) still binds `act-recall-last`, so that game's Help lists a
  permanently gray `↑` row while its doc says "No ↑/↓ recall". The prop
  conflates `recall === undefined` (not offered here → `hidden`) with `''`
  (offered, nothing yet → `disabled`), and its note saying "omit or `''`" are
  the same needs fixing with it.
- **A question this folder is expected to argue.** `EntryRow` takes
  `.localFeedback` from `game-page/playArea.module.css`. Raised from
  `setup-form`'s audit (Joel, 2026-09-14: *"it feels wrong for someone else to
  import CSS that is named for one component"*), and parked for this folder to
  answer: is that line play-surface chrome or this folder's own? It is the odd
  reader of that stylesheet — the others take an info-column readout kind, while
  this is the entry row's feedback line under the board. The same question sits
  in `terminal` and `info-sheet`, and the convention it turns on is
  [docs/deferred.md](../../docs/deferred.md) → Common / architecture.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
