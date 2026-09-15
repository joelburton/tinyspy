# Area: move-flash

The folders it reads: `move-flash`, plus setgame's own flash machinery and the
flash timings in `core-css/base.css` (both agreed 2026-09-15 — the area is where
flashing gets centralized, so what a game hand-rolled and what the shared
stylesheet times are in scope). The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: AUDITED 2026-09-15.** Roster agreed and stamped `cs-met-move-flash`;
every file read; **thirteen findings, all OPEN, none worked.** The prose ones
(F-1, F-2, F-5, F-9) go first, on Joel's word; the rest are decisions, one at a
time.

**What Joel said at the opening, which frames the reading:** setgame was built
BEFORE `plans/tile-feedback.md` existed — it was setgame that made him decide
a consistent thing should roll out — so its hand-rolled flash is the original
and has not been brought onto the shared hooks. psychicnum and connections
took the plan's findings early, as a test, over a month ago; the app has been
heavily refactored since, so choices made there may want improving.

## The roster

`src/common/move-flash/` — every file `cs-met-move-flash`:

- `feedbackTiming.ts`
- `useFlash.ts` · `useFlash.test.ts`
- `useMoveCausedChange.ts`
- `useTurnStartFlash.ts`
- `doc.md` (one-sentence lede, no intro) · `todo.md` (empty)

Outside the folder, on the roster by Joel's word:

- `src/setgame/lib/flash.ts` · `flash.test.ts` — setgame's own claim flash
  (`claimTransition`, `DEPART_MS` / `ARRIVE_MS`, `FlashKind`), `cs-met-move-flash`.
  The audit may centralize what it does.
- `src/common/core-css/base.css` — ONLY its flash rules (the two
  `--mark-*-flash-duration` tokens and their comment). Its stamp stays
  `cs-audited-corecss`: the file is `core-css`'s, and only these lines are read
  here. Whether the flash CSS moves into this folder is a decision for later,
  not now (Joel).

Listed and LEFT — importers, read as evidence when a finding needs them, not
roster: the attention wash and your-turn frame rules in
`game-page/playArea.module.css`; the games that call the hooks (waffle,
connections, psychicnum, wordle, stackdown, scrabble, strands); `setgame/components/PlayArea.tsx`.

## What the folder is, in one paragraph

Three questions, four files. **Did a move cause this change?** —
`useMoveCausedChange` pairs a content key with the server's move marker and
hands back the previous content only when both advanced together. **Which
pieces are hot, and for how long?** — `useFlash` is a self-clearing set of ids
behind one timer; `feedbackTiming` holds the two shared lifetimes, each twinned
by hand with a token in `base.css`. **Did the turn just become mine?** —
`useTurnStartFlash` fires on the rising edge, never on mount. The CSS half
lives outside the folder: the tile wash `.attentionFlash` and the board ring
`.yourTurnFlash` in `game-page/playArea.module.css`, the durations in
`base.css`, the one yellow in the theme.

Who calls what, as read 2026-09-15 (evidence for the findings; the harvest
turns this into the doc.md's caller table):

| hook | callers | what the caller does with it |
|---|---|---|
| `useMoveCausedChange` + `ATTENTION_FLASH_MS` | waffle `Board`, connections `Board`, psychicnum `Board` | diff before/after during render → `setFlashing(set)` → `useEffect` timer clears it → `.attentionFlash` per tile |
| `useFlash` | stackdown `BoardCol` (900), strands `PlayArea` (1000), scrabble `BoardCol` ×3 (default 1000) | an input-problem mark (the ambiguous letter) or a verdict outline (scrabble's green / yellow / red) — none of them a move's attention mark |
| `useTurnStartFlash` | waffle, wordle, connections, psychicnum `PlayArea` | a boolean threaded `PlayArea → BoardCol → Board` → `.yourTurnFlash` on the grid |
| none of the above | setgame `PlayArea` + `lib/flash.ts` | its own cause check keyed on the last claim's id, a hold-then-arrive choreography, its own two lifetimes, three mark kinds |

## Findings

### F-move-flash-1 · `intro-owed` · `doc.md` is one sentence, and the sentence undersells the folder

"Flashing the board pieces a move changed." Two of the four hooks are not
about a move's pieces at all: `useFlash` marks an ambiguous letter or a
scrabble verdict, and `useTurnStartFlash` marks the board frame when the turn
arrives. The `## Intro to area` owed: the situation (a board changes under a
player who is looking elsewhere; the change must announce itself for a beat and
then hand the state back), the three questions above and which hook answers
each, that the CSS half lives in `game-page` and `base.css`, and how the
lifetimes stay in step. `## Details`: the caller table, the two requirements on
a game's data path (content and marker arrive together; a re-deal drops the
marker), the audience rule as the caller's judgment, the render-time diff and
why the mark must land in the same commit as the change. The design prose that
today sits in `useMoveCausedChange`'s docstring is most of the intro already
written — it moves, it is not rewritten. See F-12 for whether the lede's
name-vs-contents gap is a rename.

### F-move-flash-2 · `useflash-archaeology` · `useFlash`'s docstring is mostly how it used to be

Of its three paragraphs, the second is "Replaces the copy-pasted … that
scrabble had three of … and stackdown had one of" — how the code came to be,
which the conventions send to the commit message — and the third is a
parenthetical about stackdown's `WordFlash` not fitting. What a caller needs is
one paragraph: a set of ids that goes hot on `flash(items)` and clears itself
after `durationMs`; each call owns its own timer so two flashes on one board do
not interfere; a second `flash` restarts the clock and replaces the contents.
The "not a fit for a single tagged value" line can stay as one sentence of
scope, without naming stackdown.

### F-move-flash-3 · `unnamed-lifetimes` · Every `useFlash` caller spends a number the vocabulary has no name for

`feedbackTiming.ts` says a lifetime is a property of the vocabulary, not of a
game, and names two: attention (700) and your-turn (1200). The three `useFlash`
callers use 900 (stackdown's ambiguous letter), 1000 (strands' ambiguous
letter — the same mark, a different number) and the hook's default of 1000
(scrabble's three verdict outlines). None is named, none is explained, and the
default in the hook's signature is a decision nobody made
(feedback: a default is a decision; hand-tuned constants get composed or named).
tile-feedback.md says every mark's lifetime is part of its specification and
lists them: attention ~0.7s · verdict "until the next action" · in flight "until
the server answers". The ambiguous-letter mark is the UI-problem channel and has
no listed lifetime at all.

Options, when it comes up: name the lifetimes the callers actually use in
`feedbackTiming.ts` (`INPUT_PROBLEM_FLASH_MS` for the ambiguous letter, and
scrabble's verdict outlines take the same or their own) and drop the default
from `useFlash` so a caller must say which beat it means; or leave the numbers
per game and let each game's tf pass name them. The first is this area's job
by the file's own rule.

### F-move-flash-4 · `attention-timer-thrice` · The attention mark's lifetime is hand-rolled in three games, and the shared hook cannot serve it

waffle, connections and psychicnum each carry the same nine lines: a
`useState<ReadonlySet>` seeded with a module-level empty set, a render-time
`setFlashing(diff)` when `useMoveCausedChange` speaks, and a `useEffect` that
starts a timer on `ATTENTION_FLASH_MS` and clears the set. `useFlash` — the
folder's own "transient set" — cannot be used there, because its trigger is a
callback that starts a timer, and a timer may not start during render; the
attention diff has to run during render so the mark and the change land in one
commit. So the folder has a transient-set hook that the folder's central use
case cannot call. This is the centralization Joel expects the area to find.

Options: (1) a second small hook that takes its input FROM render —
`useAttentionFlash(justChanged: ReadonlySet<T>)` latches a non-empty input
during render and clears it after `ATTENTION_FLASH_MS` in an effect; the three
callers shrink to `const flashing = useAttentionFlash(before ? diff(before) : NONE)`.
(2) fold cause + diff + lifetime into one:
`useMoveAttention({ content, contentKey, moveCount, changed: (before, now) => Set })`
returning the hot set — each game supplies only its diff. (3) leave as is.
Recommend (1): the diff is where the audience rule lives and it differs per
game (waffle marks its own in-flight cells whose color resolved; connections
skips its own move), so it stays visible at the call site, and the eight
identical lines go.

### F-move-flash-5 · `cause-docstring` · `useMoveCausedChange`'s docstring is the folder's design essay, and two of its claims have rotted

Fifty-five lines. A caller needs the contract: what the three parameters are,
what it returns and when, the two requirements on the data path, and that the
comparison runs during render so the caller may set its own state from the
result. The rest is the intro (F-1): "the lesson is setgame's, and it cost
three bugs", the "every proxy has a case that breaks it" argument, "the cause
was recorded on the server the whole time". Two sentences are wrong today:
"Both games read them in one `Promise.all`" — three games call it, and
psychicnum reads its board in one request and its guesses in a second (the
content it keys on and the marker both come from the second, so the guarantee
holds, but not for the reason stated); and "setgame … folds into this hook when
it converts" is a plan in a docstring (feedback: a filed issue is not a
docstring) — it is F-10's, and the docstring says only what is true.

### F-move-flash-6 · `movecount-default` · Two boards default `moveCount` to 0, which silently turns the mark off

connections' and psychicnum's `Board` declare `moveCount?: number` with a
default of 0. A caller that forgets the prop gets a board that never flashes —
`0 > 0` is never true — and nothing says so. A default that disables a feature
is a decision the prop should not make; the prop wants to be required, as
waffle's is. Game-side, so the fix is two lines in two games' files when this
area's changes reach them (the area may fix another folder's problem now); noted
here because it is the hook's API that invites it.

### F-move-flash-7 · `cause-hook-untested` · Two of the three hooks have no test of their own

`useFlash` has a four-case unit test. `useMoveCausedChange` is covered only
end-to-end by waffle's `PlayArea.test.tsx` (a teammate's swap flashes; a
restart does not), and `useTurnStartFlash` only by three games' "not on mount /
on the transition" specs. The four cases the cause hook's docstring itself
lists — a move; a re-deal (content changes, marker drops); a move landing on
identical content (marker advances, content does not); a first render on a full
log — are exactly a unit test, and one would pin the contract F-4 builds on.
A file per unit: `useMoveCausedChange.test.ts`, `useTurnStartFlash.test.ts`.

### F-move-flash-8 · `cause-hook-name` · The name asks a yes/no question and the hook answers with content

`useMoveCausedChange(content, key, moves)` reads as "did a move cause a
change?" — a boolean — and returns the content as it was BEFORE the move, or
null. Every caller writes `const before = useMoveCausedChange(…)`, naming the
return what the hook does not. Options: rename to what it returns
(`useContentBeforeMove`, `usePreMoveContent`); keep the name and let the return
type document it; or let F-4 option (2) absorb it. Decide with F-4, since that
finding may change what the hook is.

### F-move-flash-9 · `turn-flash-docstring` · Rationale and implementation notes in `useTurnStartFlash`'s docstring

"You notice things that appear far better than things that stop" is the design
reason (intro material); "React's endorsed … shape, and the house rule against
setState in effects" defends the implementation and belongs on the line it
defends, inside the body. The two rules and the free-for-all note are the
contract and stay. "Both mirroring `useCelebration`'s" — that hook has three
rules, of which these mirror the first two; say "the same never-on-mount and
rising-edge rules as `useCelebration`" or drop the cross-claim.

### F-move-flash-10 · `setgame-hand-rolled-cause` · setgame's cause check IS `useMoveCausedChange` keyed on an id, and it has not converted

`PlayArea`'s `seen` / `claimId` block does what the hook does — content key +
monotone marker, the marker dropping on `replay_board` because the events are
deleted — with one extra guard, `shown.length > 0`, which the hook covers by
seeding in its initializer. The hook takes a number and a claim id is one, so
the conversion is `useMoveCausedChange(board, boardKey, lastClaim?.id ?? 0)`
and `claimTransition(before, board)` on the result. What does NOT convert and
stays setgame's: the hold (the departing cards stay on screen for `DEPART_MS`
before the swap, which is a choreography no other game has), the `mine`
audience split (held vs leaving), and the two lifetimes (600 / 1200, chosen
against each other). The `arriving` mark after the swap is exactly F-4's
transient set with `ARRIVE_MS`. So the shared machinery can take the cause
check and the arrival's lifetime; the hold is setgame's forever. Whether the
three `--setgame-*-bg` colors fold into `--mark-attention-*` is setgame's tf
pass (tile-feedback.md's roster says so), not this area's.

### F-move-flash-11 · `two-clocks` · Each lifetime is written twice, and a comment holds them together

`ATTENTION_FLASH_MS = 700` and `--mark-attention-flash-duration: 0.7s`;
`YOUR_TURN_FLASH_MS = 1200` and `--mark-yourTurn-flash-duration: 1.1s`. The JS
value removes the class, the CSS value runs the animation, and both files say
"change both". Two ways to make it one clock: (1) JS is the home — at boot (or
on the board root's `style`) write the tokens from the constants, so CSS reads
what JS decided; (2) CSS is the home — the class comes off on `animationend`
instead of a timer, and the constants go. (2) also closes a small real gap: a
throttled background tab can fire the timer late, and while the class lingers
the wash is at opacity 0 but `.tileFace.attentionFlash` still holds the dark
ink on a tile that has handed its color back. (3) keep two and the comment.
The your-turn pair is deliberately unequal (the class outlives the fade), which
(1) keeps by computing and (2) makes moot.

### F-move-flash-12 · `folder-name` · `move-flash` names one of the folder's three jobs

The folder holds the move-caused attention mark, a general transient set used
for input-problem and verdict marks, and the turn-start ring. The name and the
lede (F-1) say the first. Options: (1) keep the codename and let the lede say
what is inside — a folder name is an address, and thirteen importers plus the
plan's §3 row and this area's name would move on a rename; (2) rename to what
it is — `marks`, `transient-marks` — while the area is open and the sweep is
cheap; (3) split: `useFlash` is not about a move and could live with the
board chrome. Recommend (1) unless Joel wants the honest name now.

### F-move-flash-13 · `stale-path` · `tile-feedback.md` points at `common/hooks/game/useMoveCausedChange`

That folder went in the 2026-09-04 restructure. The plan is the design
reference this area is told to read, so the pointer is fixed in passing:
`common/move-flash/useMoveCausedChange`.

### What checked out

- `useMoveCausedChange`'s logic: a move that does not change the content
  (waffle swapping two of the same letter) is absorbed silently; a re-deal
  drops the marker and is absorbed; the first render seeds and says nothing on
  a finished game's full log; two moves in one refetch flash together. The
  "arrive together" requirement is real — a marker landing one render after
  its content is absorbed, then ignored — and every current caller meets it
  (waffle's swaps, connections' guesses and setgame's events ride the board's
  `Promise.all`; psychicnum's content and marker both come from its guesses
  read).
- `useTurnStartFlash`: never on mount, rising edge only, free-for-all never
  fires. A turn that leaves and returns inside 1.2s neither replays the ring
  nor restarts the timer, and that is fine.
- `useFlash`'s unmount cleanup, restart-on-reflash, and its test.
- `feedbackTiming`'s two values against their tokens: attention equal (the
  minimum the rule allows), your-turn longer on purpose.
- `claimTransition` and its five-case test, slot by slot, including the
  compaction case that a set difference misses.
- The theme's `--mark-attention-*` pair is declared in both themes; `ui.md`'s
  `mark-*` row and its `--mark-attention-tile-color` row are true today.
- `docs/playarea.md`'s "split flashes by their trigger" note is true today.

## Notes

- **scrabble's three outlines, read against the vocabulary, for its tf pass
  (tile-feedback.md's roster already lists scrabble at tf0):** the yellow on
  just-drawn rack slots is attention-shaped (news the player did not choose,
  arriving in place); the green on the cells just played is the player's own
  move, which the audience rule says needs no mark (the verdict is the pill's);
  the red on a refused word is a verdict, whose lifetime the vocabulary says is
  "until the next action", not a timer. Not this area's to decide; the area's
  F-3 gives them named beats to choose from when it is.
- `.attentionFlash` in `playArea.module.css` cites "as waffle's letter does" —
  a game named in shared CSS. `game-page` is closed; left for the concern split
  its `todo.md` holds.
- Which games flash a move today, and which do not: the three attention
  callers plus setgame. wordle is the plan's worked case for "no mark needed"
  (a guess lands in empty space). The other eleven boards have no attention
  mark; the plan's roster is where that is tracked, per game.

## Predicted test breaks

*(none yet — nothing has changed)*

If F-4 lands: `waffle/components/PlayArea.test.tsx` (the two `attentionFlash`
specs) is the end-to-end check and should stay green, being about the class
and not the hook. If F-11 chooses `animationend`: the same two specs, plus the
three games' `yourTurnFlash` specs, assert the class ON and never its removal,
so jsdom's lack of animation events should not bite — verify.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
