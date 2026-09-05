# Area: outcomes

The folders it reads: `outcomes`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** — roster agreed 2026-09-05, audited the same day.

## The roster

Three files, the whole of `src/common/outcomes/`:

| file | stamp |
|---|---|
| `outcomes.ts` | `cs-met-outcomes` |
| `doc.md` | *(markdown — no stamp)* |
| `todo.md` | *(markdown — no stamp; empty at the opening)* |

Two rulings at the opening, both Joel's:

- **`docs/outcomes.md` is not on the roster** — *"we'll clean up docs/outcomes
  later."* It is still read as evidence here, and findings ABOUT it are
  recorded below, because half of what this vocabulary claims about itself is
  written there rather than in the type.
- **`terminalOutcomeVerb.ts` and `turnOutcome.ts` stay where they are** —
  *"don't move those; they're in the right place."* They belong to `terminal`
  and `codenamesduet`.

## Findings

### F-outcomes-1 · `second-spelling` · The file that says "no second spelling" has one, in seven docstrings and a doc

`outcomes.ts`'s own docstring: *"**One list, seven words, no second
spelling**"*, with a parenthetical naming the spelling that was killed
(`success` / `error`). A different second spelling is alive and was never
named: **`good` / `bad` / `partial`** for `won` / `lost` / `near`.

It is prose only — every one of these files WRITES the right string and
DESCRIBES the wrong one, so nothing is broken and nothing fails:

| file | what the prose says |
|---|---|
| `src/strands/components/GameTurnLog.tsx` | *"the shared four-value vocabulary (`TurnOutcome`)"* — then names its members `good`, `partial`, `bad` |
| `src/letterboxed/components/GameTurnLog.tsx` | *"A PLAYED WORD IS `good`"*; *"`partial` (amber) marks help taken"* |
| `src/wordiply/components/GameTurnLog.tsx` | `good` / `bad` / `partial` |
| `src/wordle/components/GameTurnLog.tsx` | `good` (green) |
| `src/codenamesduet/lib/turnOutcome.ts` | `bad` / `partial` / `good` |
| `src/setgame/components/GameTurnLog.tsx` | *"`partial` is the shared amber bar"* |
| `docs/playarea.md` → the turn log | *"`outcome` is `good` / `bad` / `partial` / `neutral` → the shared `--outcomes-*` palette"* |

The doc row is the worst of them, because it is not a slip: it TEACHES the
dead spelling as the vocabulary, and the tokens it promises
(`--outcomes-good-*`, `--outcomes-partial-*`) do not exist. A reader following
it writes a `var()` that resolves to nothing.

Worth saying plainly: the docstrings are otherwise excellent — strands' is a
model of why each row got the bar it got. The words are the only thing wrong.

### F-outcomes-2 · `two-outcomes` · "outcome" names two different closed lists and neither one says so

The repo spends the word twice, and both spends are documented, guarded, and
correct on their own terms:

| | what it is | where | guarded by |
|---|---|---|---|
| `Outcome` | the TONE — how a thing reads | `outcomes/outcomes.ts`, `docs/outcomes.md` | `cssTokens.test.ts`, `raiseCodes.test.ts` |
| `status.outcome` | the CAUSE — why a game stopped (`timeout`, `manual`, `conceded`, `exhausted`, `solved`, …) | `docs/states.md` | `gameStatusLabels.test.ts` |

Neither doc mentions the other exists, and `docs/naming.md`'s watch list of
generic words does not carry `outcome` — though it is a textbook case for
*"a name with multiple plausible meanings is usually wrong"*, which that file
has as a naming principle. The lists do not even overlap in shape: `won` and
`lost` are tones, while the game-end causes are deliberately disjoint from
`play_state` values.

Not proposing a rename. Both names are right in their own context and both
have earned their spelling; what is missing is one sentence in each place
saying the other exists.

### F-outcomes-3 · `theme-roles-count` · The four-role claim is three roles short, and following it fails a guard

`outcomes.ts`: *"it has the same four theme roles as the rest."*
`docs/outcomes.md`: *"Roles are `base`, `fill`, `ink`, `edge`"*, and its
**Adding one** recipe says *"Give it all four `--outcomes-*` roles in both
themes."*

The bucket carries **seven** variants, and `cssTokens.test.ts` enforces the
grid as a rectangle — 7 families × 7 variants, in both themes:

```
base · ink · fill · edge · wash · bar · terminalFrame
```

So the recipe is not merely understated: somebody who adds an outcome by
following it ships three missing cells and the guard fails on a step the doc
never told them to take. `wash`, `bar` and `terminalFrame` all postdate the
prose.

### F-outcomes-4 · `hand-cut-subsets` · A subset of `Outcome` is retyped by hand a dozen times, and the repo already has the right idiom

`connections/lib/evaluate.ts` does it properly:

```ts
export type GuessOutcome = Extract<Outcome, 'won' | 'near' | 'lost'>
```

Nowhere else does. The hand-cut ones, none of which break if `Outcome`
renames a member:

- `common/turn-log/TurnLog.tsx` — `export type TurnOutcome = 'won' | 'lost' | 'near' | 'neutral'`, the one with consumers in six games
- `common/feedback/localPills.ts` — `type OutcomeTone = 'won' | 'lost' | 'neutral'`
- `common/terminal/terminalCopy.ts` — `tone: 'won' | 'lost' | 'neutral'`
- `waffle` · `wordle` · `connections` · `psychicnum` — `gameOver: 'won' | 'lost' | 'neutral' | null`, twice each (`Board` and `BoardCol`)
- `boggle` · `scrabble` — `tone: 'won' | 'lost' | 'neutral'`
- `stackdown` — `WordFlash = { letters: string[]; tone: 'won' | 'lost' }`

**None of those files is on this roster.** What this area can settle is the
RULE — a subset of the vocabulary is written as `Extract<Outcome, …>`, never
retyped — and hand each conversion to the owning folder's `todo.md`.

### F-outcomes-5 · `union-not-tied-to-palette` · Nothing makes an eighth outcome get a color

`cssTokens.test.ts` hard-codes its families:

```ts
families: ['won', 'lost', 'near', 'warning', 'neutral', 'noted', 'error'],
```

`raiseCodes.test.ts`, in the same `src/guards/`, reads the union out of the
source instead (`union('outcomes/outcomes.ts', 'Outcome')`) and says why in a
comment: *"the assertion most likely to rot unwatched … the truth is a union
under `src/common/`."* The palette guard is the same assertion with the same
rot and no such reading, so adding a word to `Outcome` compiles, passes every
guard, and renders with no color.

**Guards are not part of the audit** (Joel's ruling at the `web-storage`
opening), so this is recorded for a ruling rather than fixed on sight — but
the precedent for the fix is eleven files away.

### F-outcomes-6 · `provisional-is-daylight-only` · A per-theme fact is written as a property of the palette

`docs/outcomes.md`: *"`noted` and `error` are marked **provisional** in the
palette: both are declared at ink weight with no separate base."*

True in `daylight.css`, where both are commented `INK WEIGHT, provisional` and
`--outcomes-noted-ink-color` is literally `var(--outcomes-noted-base-color)`.
False in `midnight.css`, where both carry a base and a separately-chosen ink
(`#42a5f5` / `#90caf9`, `#e53935` / `#ef9a9a`) like every other family. The
sentence describes one theme and claims the palette.

### F-outcomes-7 · `stale-link-text` · The doc names a path that has not existed since the reorg

`docs/outcomes.md`: the link TEXT reads `` `src/common/lib/outcomes.ts` `` while
its href is `../src/common/outcomes/outcomes.ts`. The link guard checks the
target, so it passes; only a reader is misled. Same sentence, both halves
visible at once.

### F-outcomes-8 · `turn-outcome-four` · The four-value log vocabulary is already pinching, and the doc says it isn't

`docs/outcomes.md` on `TurnOutcome`: *"That type lists four because four are
what the games have needed so far, not because a rule keeps the others out.
Nothing stops a log row being `warning` or `noted`; widen the type when a game
wants one."*

Two games already want one and took `near` instead, both saying so in their
docstrings:

- **letterboxed** paints hint and spoiler rows `near`, described as *"help
  taken, matching psychicnum's reveal rows and the amber of the Hint / Spoiler
  buttons themselves."* Help taken is `warning` by `docs/outcomes.md`'s own
  definition — *"Help you asked for … amber for the same reason its button
  is."*
- **strands** paints a spent hint `neutral` and argues the fourth value into
  the job at length, closing with *"it keeps the four bar colors reading as
  one scale … without a fifth thing competing for attention."*

So the truth is the opposite of the doc's: the four is not "what has been
needed", it is a deliberate ceiling that two games have already bent a word to
fit. Whether that ceiling is right is `turn-log`'s call, not this area's —
but the doc should stop describing it as an accident.

### F-outcomes-9 · `design-owed` · The folder's `doc.md` is a pointer, and it owes a Design

`src/common/outcomes/doc.md` is one sentence that forwards to
`docs/outcomes.md`, and `common/outcomes` is on `DESIGNS_OWED` in
`src/guards/folderDocs.test.ts`. What only the FOLDER can say — and what no
file in it says today — is why a vocabulary gets a folder of its own with a
single type in it, and what the boundary is between the vocabulary and the
things that consume it.

## Notes

- **The vocabulary itself is in good shape.** Seven words, each distinguishable
  from its neighbors in a sentence, one type, one spelling in code, and two
  independent guards already pinning it to the SQL and to the palette. Every
  finding here is about prose that drifted away from it, not about the list.
- **`raiseCodes.test.ts` reads the union and `cssTokens.test.ts` does not** —
  the same repo, the same folder, two answers to the same question. Worth
  carrying into whichever area owns guards, if one ever does.
- **Dependencies listed and left:** `common/themes/{daylight,midnight}.css`
  (the `--outcomes-*` bucket, `corecss`'s), `common/turn-log/TurnLog.tsx`
  (`TurnOutcome`, `turn-log`'s), `common/feedback/localPills.ts` and
  `common/terminal/terminalCopy.ts` (`feedback`'s and `terminal`'s).

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
