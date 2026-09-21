# Area: found-words

The folders it reads: `shared/found-words`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-21**, roster agreed the same day (Joel: *"all of
these below, stamp them all as cs-met"*). Eleven files `cs-met-found-words`
plus the two markdown ones, which carry no stamp. Nothing read yet.

## The roster

`src/shared/found-words/` — every code file `cs-met-found-words`:

- `useFoundWordSubmit.ts` · `useFoundWordSubmit.test.ts` — the submit engine: a
  typed word, a shipped legal list to look it up in, and a growing found set to
  dedup against. The folder's largest file by some way, and the one wordiply
  takes without taking anything else
- `foundWordsDisplayRows.ts` · `.test.ts` — the merge: found words deduped to
  their first finder, the reveal appended, alphabetized
- `wordListRows.ts` · `.test.ts` — the one call above it that composes the
  reveal and the merge, made by both the screen and the printer
- `revealWords.ts` · `.test.ts` — what nobody found, from the two shipped lists
- `foundWords.ts` — the family's row and shipped-word types
- `foundWordsPlayArea.module.css` — the play-surface scaffolding the three games
  compose
- `typedWord.module.css` — the in-progress word's look
- `doc.md` (a lede; the `## Intro to area` is OWED — `shared/found-words` is one
  of the eight rows left on `INTROS_OWED` in `src/guards/folderDocs.test.ts`) ·
  `todo.md`

**`useFoundWordSubmit.ts` came in carrying `cs-fixed-outcome-fix`** — the
error/envelope sprint's stamp, from the area that rewrote how this hook
reports a refusal. Re-stamped `cs-met-found-words` with the rest at Joel's
word, so the whole roster reads as one area's.

**`wordListRows.ts` and its test were written by `word-list`** (F-word-list-15,
`87120a09`) and left `cs-unmet` when that area closed, on Joel's ruling at
F-word-list-31 that this area would reach them. It has.

Evidence, to be read but NOT on the roster — the four callers:
`src/spellingbee`, `src/wordwheel` and `src/boggle` use the whole folder;
`src/wordiply` takes `useFoundWordSubmit` alone and has no `found_words` table.
`shared/bee-games` imports this folder's two types (the family-imports-family
edge `docs/common-folders.md` records) and is its own area, row 54.

**What moved under this area is nearly all of it.** The folder was created
2026-09-21 by `plans/found-words.md` — renamed from `word-hunt`, given the
family's types, the typed-word look and the play-surface scaffolding, and joined
by boggle. That plan is still on disk awaiting Joel's read and is the record of
every decision in here; its nine `C-n` check findings were worked the same day.

## Findings

*(`F-found-words-1 · slug · title`, one heading each; a status prefix when it has
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
