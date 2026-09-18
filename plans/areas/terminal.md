# Area: terminal

The folders it reads: `terminal`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — roster agreed and stamped 2026-09-18** (Joel: *"list is
good"*); taken out of order after `word-entry`, so §3's next in sequence is
still row 42, `word-list`. Seven files `cs-met-terminal`. Nothing read yet.

## The roster

`src/common/terminal/` — what shows when a game ends. Seven files
`cs-met-terminal`, plus the folder's own two docs (not stamped; the script's
scope is files with a first-line comment):

- `CelebrationBlockingModal.tsx` · `.module.css` · `.test.tsx` — the dialog a
  win puts up
- `useCelebration.ts` · `useCelebration.test.ts` — when it fires
- `terminalOutcomeVerb.ts` · `terminalOutcomeVerb.test.ts` — the verb a
  finished game is described with
- `doc.md` · `todo.md`

**`terminalMessage.ts` and `terminalMessage.test.ts` are EVIDENCE, not roster.**
They sit in this folder and read `cs-blessed-feedback` — `feedback` wrote them
and owns the verdict's words, which the plan's row 44 says outright. They were
left at that stamp rather than re-stamped: Joel agreed the list without ruling
on the question, and overwriting a blessing is not the reversible branch. They
are read against every claim here and quoted like any evidence; if the area
turns up a change they need, the stamp question comes back to Joel first.

**Left off the roster on purpose:** `common/reveal/` is row 45 and its own area
(showing the answer after the end is a different thing from the game ending),
and the twenty-odd game files that call `useCelebration` or `terminalMessage`
are consumers, each its own game's area.

## Findings

*(`F-terminal-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

**What `todo.md` hands the area**, its first read per §4: two items, both
`CelebrationBlockingModal`'s stylesheet — the `.title` `<h2>` set at `1.5rem`,
which is h1's size, and a `.button:focus-visible` that re-declares the shared
ring.

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
