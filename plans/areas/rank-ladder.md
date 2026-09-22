# Area: rank-ladder

The folders it reads: `shared/rank-ladder`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-21.** Roster agreed the same day; seven files
`cs-met-rank-ladder` plus the two markdown ones, which carry no stamp. Baseline
at the opening: 20 of 20 green in the folder, lint clean, `tsc -b` clean.

## The roster

`src/shared/rank-ladder/` — every code file `cs-met-rank-ladder`:

- `rankLadder.ts` · `rankLadder.test.ts` — the ladder: `RANKS`, `GENIUS_AT`,
  `rankThreshold`, `rankPoints`, `currentRankIndex`. Its spec is the only place
  the FE↔SQL lockstep is written down
- `RankBar.tsx` · `RankBar.module.css` · `RankBar.test.tsx` — the seven-square
  bar. The stylesheet is the folder's largest file
- `Stats.tsx` · `Stats.module.css` — the two-cell Score/Words grid
- `doc.md` (a one-line lede; the `## Intro to area` is OWED — `shared/rank-ladder`
  is on `INTROS_OWED` in `src/guards/folderDocs.test.ts`) · `todo.md` (empty)

**Two things were agreed AS EVIDENCE rather than roster, at the opening:**

- **boggle's `components/Stats.tsx`** (Joel: *"examine boggle as evidence"*) —
  it imports `Stats.module.css` and nothing else from here, to draw its own
  four-cell grid. Read, reported below, not stamped.
- **the SQL twin `<schema>._rank_idx`** (Joel: *"examine and report in this
  area"*) — `supabase/sql/spellingbee.sql:156` and `wordwheel.sql:156`. Read and
  reported here rather than left to the two game areas; not stamped, since the
  files are each game's.

Evidence, to be read but NOT on the roster: both bee games' `InfoCol.tsx`,
`BoardCol.tsx`, `manifest.ts`, `SetupForm.tsx`, `lib/setupSummary.ts` and
`PlayArea.tsx` — nineteen import sites across the two — plus `docs/mobile.md`
and the five places `docs/games/spellingbee.md` cites the ladder.

## What the opening already established

**The FE↔SQL lockstep HOLDS, verified numerically rather than argued.**
`rankLadder.ts` fixes float drift in `rankPoints` (its docstring names the
failing case, `63.00000000000001`) and leaves `currentRankIndex` on float
division, while claiming all three implementations agree. The FE bar fill was
compared against the SQL integer win-check over **4,004,000 pairs** — totals
1..2000, scores 0..2×total, plus total=0 — with **zero disagreements**. The
algebra in the docstring is right, and the closing re-read does not need to
redo this.

**The `folderDocs` guard was red on a clean tree for this sprint's last several
areas, and it was not code.** `src/common/lib/game/trie.ts/` and
`src/common/lib/util/mulberry32.ts/` were empty DIRECTORIES named after files —
untracked, created 2026-09-20 17:23 by something that made the destination a
directory instead of moving into it. The real files are
`src/shared/dict-trie/trie.ts` (`cs-unmet`, its area unopened) and
`src/common/utils/mulberry32.ts` (`cs-blessed-utils`); both were verified
present and tracked before anything was removed. Five empty directories deleted
with `rmdir`, which refuses a non-empty directory — so the command succeeding is
the proof they held nothing. **`src` is now 3367 of 3367 green.** Nothing was
committed, because git tracked none of it.

## Findings

*(`F-rank-ladder-1 · slug · title`, one heading each; a status prefix when it has
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
