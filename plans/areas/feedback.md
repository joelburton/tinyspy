# Area: feedback

The folders it reads: `feedback` · `terminalCopy` (in `terminal`) · `turnCopy` (in `info-sheet`). The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN, 2026-09-12; BUILT and AUDITED the same day.** The design was
decided before the opening (`plans/feedback-design.md`, every item DECIDED),
and that plan is the working record of the build; this file holds the
roster, the findings, the notes and the closing. By Joel's ruling the area
was BUILT first — most of the original roster was replaced outright, so a
prose pass over it would have audited files about to be deleted — and the
audit is of what the build left: the twenty-two files below, read in one
sitting after the old system was deleted. Eleven findings, none worked.

## The roster

Agreed 2026-09-12, eighteen files, all `cs-met-feedback`. **Twelve of them
were DELETED 2026-09-12** once every game had converted (struck below); what
the area still owns of the original roster is six files:

- `src/common/feedback/` — ~~`genericFeedback.ts`, `genericPills.ts` (+
  test), `localPills.ts` (+ test), `useLocalFeedback.ts` (+ test),
  `GenericFeedbackPill.tsx` (+ test + stylesheet)~~ — deleted;
  `usePeerFeedback.ts` (+ test), `useDismissLocalFeedbackOnKey.ts` (+ test),
  `FailureLine.tsx` (+ stylesheet; not feedback, decided on contact) — kept.
- ~~`src/common/terminal/terminalCopy.ts` and
  `src/common/info-sheet/turnCopy.tsx`~~ — deleted; their successors are on
  the created list below.

Files this area creates are stamped `cs-met-feedback` at birth and join
this list. Created 2026-09-12, the machinery (fifteen files):
`feedback/FeedbackMessage.tsx`, `feedback/feedbackSlotStore.ts`,
`feedback/useFeedbackSlot.ts`, `feedback/feedbackSlotRegistry.ts`,
`feedback/FeedbackPill.tsx` + `.module.css`, each with its test;
`terminal/terminalMessage.ts` + test; `info-sheet/turnText.tsx` + test;
`src/guards/feedbackNames.test.ts`.

Edited by the area, owned elsewhere (stamps do not move):
`common/chat/useChatFeedback.tsx` (+ test), `game-page/GamePage.tsx` +
`gamePageCtx.ts`, `club/ClubPage.tsx`, `page-header/PageHeaderStatusSlot.tsx`,
`word-entry/EntryRow.tsx`, `terminal/TerminalActionRow.tsx`,
`game-page/useStandardGameActions.ts` (+ test), `guards/orphanedDocstrings`
and `guards/vocabularies` (allowlist lines), `shared/word-hunt/useWordSubmit.ts`
(+ test; gains `hideAccepted`), and every game's PlayArea, BoardCol and
InfoCol that creates a message — all sixteen games converted 2026-09-12, one
commit each (`plans/feedback-design.md`'s status block has the hashes), plus
scrabble's Controls, codenamesduet's CluePanel, bananagrams' PlayerBoard,
and waffle's and connections' Board (their `TerminalOutcome` import). Two
e2e specs changed where they asserted the old behavior:
`e2e/psychicnum-turn-order.e2e.ts` (a result over the whose-turn note) and
`e2e/letterboxed.e2e.ts` (the accepted word no longer times out). The
deletion swept comments in a dozen more files that named the old pill or
builders by name — stamps untouched.

## Findings

*(`F-feedback-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The area's question

## F-feedback-1 · `failure-line-home` · `FailureLine` lives in `feedback/` and its own docstring says it is not feedback

The plan row asked for this to be settled at the opening, and the opening
deferred it ("not feedback, decided on contact") to the build. Now the build
is done the folder holds one file that does not belong to its Design:
`FailureLine.tsx` opens *"Not a `<FeedbackPill>` and not the fault modal"*
and calls itself *"the dialog-and-panel counterpart to `<Field>`'s
`error`"*. Its eleven importers are all dialogs, screens and forms —
`Field.tsx` and `errorUnder.ts` in `fields/` among them — and no game and
nothing else in this folder reads it. Nothing in it touches a slot, a message
or a kind.

Options:

1. **Move it to `fields/`, beside `<Field>`** — the file its docstring names
   as its other half, and the folder two of its importers already live in.
   Two files move (`FailureLine.tsx`, `FailureLine.module.css`); eleven
   import paths change; `fields/` is `cs-blessed-forms`, so the two arrive
   there stamped `cs-met-feedback` and the `forms` area's blessing is
   unchanged. **Recommended.** The feedback folder's Design can then say
   what the folder is without a paragraph explaining the exception.
2. **Keep it here and say so in `doc.md`** — one sentence in Details: "not a
   feedback message; here because a surface's failure line is the third
   thing a player reads after the pill and the modal". Costs nothing; leaves
   a reader who opens the folder for the pill finding a form component.

### Behavior

## F-feedback-2 · `same-rank-owner-notes-erase-each-other` · Two owner-cleared notes at one rank: showing the second ends the first for good

`show` keeps one message per rank: *"the newcomer replaces whatever shares
its rank"* — the older entry is DROPPED, not hidden. For a `result` that is
the point (a second "Not a word" replaces the first). For an owner-cleared
kind it is a hole: the owner's effect showed its message on a rising edge
and will not show it again until that edge falls and rises, so a sibling
condition of the same rank that comes and goes takes the first message with
it and nothing brings it back.

The instance in the roster's callers is letterboxed. `showWaiting`
(`waiting`, a `standingNote`, rank 60) and `showChainFull` (`note`, a
`standingNote`, rank 60) are both true when a player's fifth word fills the
shared chain and the turn passes: both effects fire on the same render,
`showChainFull` is declared second, and its `show` drops the waiting entry.
The teammate's only legal move is taking a word back; that clears
`chainFull`, its cleanup retracts the note, and the slot is EMPTY for the
rest of that turn while the info column still says "Waiting for ● moth…".
On a phone, the effect above the code says, *"this is the only whose-turn
indicator"*. Every other rank-60 site shows one message at a time
(codenamesduet's `useTurnStatus` picks one of two into the global slot;
setgame's `waiting` goes global and its prompt local), so today this is one
game — but the rule that makes it possible is the store's, and any game
that adds a second standing note walks into it.

Options:

1. **Only a gesture- or timer-cleared message replaces its rank-mate; owner
   kinds stack.** In `show`, drop a same-rank entry only when the NEWCOMER
   leaves by gesture or timer. Two standing notes then both live; the slot
   draws the newest (the tie rule already says so), and when it is retracted
   the older is drawn again. The "second Not a word" rule is untouched.
   One store line, one test. **Recommended** — it fixes the class, and the
   design's sentence about ranks ("two kinds share a rank only where
   replacing each other is wanted") stays true of the kinds it was written
   for.
2. **Letterboxed fixes itself:** `showChainFull` passes `{ rank: 65 }` as
   an override, so the two stack. The store rule stands as written; the
   next game with two standing notes has to know to do the same.
3. **Leave it** and record it in `feedback/todo.md`. The gap is one turn, in
   one mode, on one game.

### Shape

## F-feedback-3 · `canned-not-ok-is-a-result` · The console's and the store test's "not-ok" are results wearing `notOk`'s row

`feedbackSlotRegistry.ts`:

```ts
notOk: (text) => FeedbackMessage.result('error', text, { ...KINDS.notOk }),
```

and `feedbackSlotStore.test.ts`:

```ts
const notOk = FeedbackMessage.result('warning', 'Someone got there first', { ...KINDS.notOk })
```

Both make a message whose `kind` is `'result'` with `notOk`'s fill, rank
and exit — which is exactly the hand-built, re-ranked message the class's
docstring says the private constructor exists to forbid, done through the
`overrides` door. `puppill('hey', 'notOk')` therefore does not show a
`notOk`; it shows a result that behaves like one, and anything that reads
`kind` (a test, a future pill variant) sees the wrong answer. The honest
form exists eleven lines into `FeedbackPill.test.tsx`: `FeedbackMessage.notOk({ type: 'not-ok', … })`
with a literal envelope.

Options:

1. **Build a real envelope at both sites** — the registry's canned `notOk`
   takes a minimal `NotOkEnvelope` with the console's text as `message`
   (severity `'reject'`, so the outcome is what the constructor decides);
   the store test does the same, or borrows the pill test's literal.
   **Recommended.**
2. **Leave the registry's** (a console toy) and fix only the test.

## F-feedback-4 · `actor-type-spelled-five-times` · `Actor` is exported from `FeedbackMessage.tsx`, and five other sites spell `Pick<Member, 'username' | 'color'>` by hand

`terminalMessage.ts` (`TerminalMessage.actor`), `turnText.tsx`
(`waitingForText`'s parameter), `ActorMention.tsx` (`DotActor`'s `actor`
prop) and psychicnum's `Board.tsx` / `BoardCol.tsx` (`decidedBy`'s value)
each write the same two-field pick that `FeedbackMessage.tsx` names
`Actor` — *"the person a message is about — the two identity fields of a
`Member`"*. Two of them (`terminalMessage`, `turnText`) are imported BY
`FeedbackMessage.tsx`, which is presumably why they did not import the
name back: a type-only import erases and cannot cycle, but the direction
reads wrong.

Options:

1. **Move `Actor` to `members/member.ts`**, beside `Member` — the file
   whose docstring says it is *"types only, and that is load-bearing"* for
   exactly this reason — and have all six sites import it from there.
   `FeedbackMessage.tsx` re-exports nothing. `member.ts` and
   `ActorMention.tsx` are `cs-blessed-members`; the plan allows a later
   area to fix a blessed file. **Recommended.**
2. **Leave it.** Five identical picks compile; the name exists for the one
   file that hands the value to the pill.

## F-feedback-5 · `empty-pending-list` · The names guard's allowlist is empty, its second test iterates nothing, and code-conventions still says games are on it

`feedbackNames.test.ts` keeps `const pending = new Set<string>([])` with a
docstring saying the list *"stays so a regression has a named place to be
excused"*, and the test *"every pending file still offends"* loops over an
empty set and passes by construction. `docs/code-conventions.md`'s rule
still ends *"the files still on its `pending` list are games not yet
converted"* — there are none. The `orphanedDocstrings` and `vocabularies`
guards keep allowlists that are meant to shrink to zero and then stay; this
one was born as a conversion tracker, not an allowlist, and its job ended
when the last game converted.

Options:

1. **Delete `pending` and the second test; the guard becomes one flat
   assertion.** A future regression is fixed, not excused — there is no
   longer a category of file allowed to write the bare name. The
   code-conventions sentence becomes "enforced by `feedbackNames.test.ts`".
   **Recommended.**
2. **Keep the mechanism**, and only fix the code-conventions sentence.

### Prose

## F-feedback-6 · `class-docstring-on-leavesby` · `FeedbackMessage`'s class docstring sits above `LeavesBy`; the class has none

Lines 12–27 of `FeedbackMessage.tsx` — *"A FEEDBACK MESSAGE — the one thing
a feedback slot holds and a pill draws"*, the reach-for-a-constructor
paragraph, the why-a-class paragraph — are followed by a blank line and
`/** How a message leaves its slot. */ export type LeavesBy`. Hovering
`FeedbackMessage` at a call site shows nothing. The `orphanedDocstrings`
guard did not catch it because the block is followed by another `/**`.
Fix: the block moves to sit on `export class FeedbackMessage`; the file
keeps a shorter header if one is wanted.

## F-feedback-7 · `peer-feedback-cites-a-missing-doc` · `usePeerFeedback` and its test cite `docs/peer-feedback-audit.md`, which does not exist, and the docstring is fifty lines of history

Two cites in `usePeerFeedback.ts` (*"→ §1.1"*, *"→ bucket B"*), one in its
test, and one comment each in spellingbee's and wordwheel's `PlayArea.tsx`
(*"bucket B in docs/peer-feedback-audit.md"*) point at a file that is not
in the repo. Around them the docstring tells how five hand-rolled copies
drifted and which three had the seed timing wrong — the story of the fix,
not what a caller needs. The rationale a reader does need (gate before
seeding; why two-fetch hooks pass `ready`) already sits as a comment on the
gate line inside `narrateNewItems`, so the docstring says it twice. Fix: a
docstring of the hover length — what it does, the three parameters a
caller decides, and that `messageFor` returns a `FeedbackMessage` or
`null` — with the cites gone at all four files.

## F-feedback-8 · `dismiss-hook-stale-cite` · `useDismissLocalFeedbackOnKey` cites an anchor `ui.md` no longer has, and calls the message an "own-move pill"

*"docs/ui.md → Feedback pill (dismissal modes)"* — the Feedback pill
section has no such heading since the rewrite, and its rule is now the
kind's `leavesBy`, which the hook's last paragraph already describes
correctly. *"clear their own-move pill"* is the old vocabulary for a
`result`. One paragraph to rewrite.

## F-feedback-9 · `member-notes-wear-docstring-marker` · `FeedbackSlot`'s eight members and `FailureLine`'s two props are noted with `/**`

The rule is `/**` on a file, a type or a function, and `//` on a field,
prop or member. `feedbackSlotStore.ts`:

```ts
export type FeedbackSlot = {
  readonly name: SlotName
  /** Put a message up. Returns its id, for `retract`. */
  show: (message: FeedbackMessage) => string
```

and `FailureLine.tsx`:

```ts
type Props = {
  /** What went wrong, in a sentence. */
  children: ReactNode
```

Every other roster type does it the other way (`KindDefaults`,
`TerminalMessage`, `FeedbackPill`'s `Props`, `usePeerFeedback`'s
parameter). Nothing a person can see changes; ten markers.

## F-feedback-10 · `examples-not-from-the-repo` · Two examples in docstrings are not what the repo says

- `useFeedbackSlot.ts`'s worked example (and the test that mirrors it) name
  the effect `announceWaiting`; the nine games that write it call it
  `showWaiting`, and `docs/ui.md`'s example does too. The example is the
  one a newcomer copies.
- `terminalMessage.ts` says boggle spends the pill on the tally
  *"(`Ended: 12/40`)"*; boggle's text is `` `Ended: ${tally}` `` where
  `tally` is `"12 words, 34 points"`.

## F-feedback-11 · `designs-owed` · The folder's `doc.md` has no Design and a lede written before the build; `terminal/` and `info-sheet/` say nothing about their feedback file

`feedback/doc.md` is a title and one paragraph that still describes the
folder from outside. The `DESIGNS_OWED` row is open. The Design to write
is the one the plan already tells in prose — a message is a kind, the kind
decides how it looks and leaves, a slot keeps one message per rank and draws
the lowest, a condition is an effect that retracts — for a reader who has
never opened the folder, with the sharp specifics (the ranks, the console
trigger, the registry) under Details. `terminal/doc.md` and
`info-sheet/doc.md` each need the one sentence saying `terminalMessage` /
`turnText` lives there and that `feedback` owns its words — the plan's own
rows already say so.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

The two specs above; both changed with their games and are green.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
