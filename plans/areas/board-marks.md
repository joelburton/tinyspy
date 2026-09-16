# Area: board-marks

The folders it reads: `board-marks` (named `move-flash` until F-12), plus
setgame's own flash machinery and the
flash timings in `core-css/base.css` (both agreed 2026-09-15 — the area is where
flashing gets centralized, so what a game hand-rolled and what the shared
stylesheet times are in scope). The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: AUDITED 2026-09-15; the prose pass done 2026-09-15; the findings
RE-READ 2026-09-15** after the game work recorded below; **the CLOSING RE-READ
done 2026-09-16** and the `doc.md` harvested the same day. Roster agreed, every
file read, every file `cs-audited-board-marks`; **not blessed** — that stamp is
Joel's.

**All fifteen findings are WORKED.** The closing re-read (its own section, below
the findings) added seven more: one conversion with a decision in it (F-16,
stackdown's second hand-rolled mark), and six stale claims the area's own fixes
had written into siblings — fixed in place.

**What Joel said at the opening, which frames the reading:** setgame was built
BEFORE `plans/tile-feedback.md` existed — it was setgame that made him decide
a consistent thing should roll out — so its hand-rolled flash is the original
and has not been brought onto the shared hooks. psychicnum and connections
took the plan's findings early, as a test, over a month ago; the app has been
heavily refactored since, so choices made there may want improving.

## The roster

`src/common/board-marks/` — every file `cs-audited-board-marks` (they were
`cs-met-board-marks` at the opening):

- `feedbackTiming.ts`
- `useFlash.ts` · `useFlash.test.ts`
- `useMark.ts` · `useMark.test.ts` — WRITTEN by this area (F-14)
- `useAnnouncedMark.ts` · `useAnnouncedMark.test.ts` — WRITTEN by this area
  (F-14, option B)
- `useChangeCause.ts` — renamed from `useMoveCausedChange.ts` (F-10), and its
  `useChangeCause.test.ts`, WRITTEN by this area
- `useMoveAttention.ts` · `useMoveAttention.test.ts` — WRITTEN by this area
  (F-4)
- `useTurnStartFlash.ts` · `useTurnStartFlash.test.ts` — the test WRITTEN by
  this area (F-7)
- `doc.md` (a one-sentence lede and no intro at the opening; the intro and
  `## Details` written by F-1 and harvested at the close) · `todo.md` (empty
  at the opening, empty at the close)

Outside the folder, on the roster by Joel's word:

- `src/setgame/lib/flash.ts` · `flash.test.ts` — setgame's own claim flash
  (`claimTransition`, `DEPART_MS` / `ARRIVE_MS`, `FlashKind`),
  `cs-audited-board-marks`. The audit may centralize what it does.
- `src/common/core-css/base.css` — ONLY its flash rules (the two
  `--mark-*-flash-duration` tokens and their comment). Its stamp stays
  `cs-audited-corecss`: the file is `core-css`'s, and only these lines are read
  here. Whether the flash CSS moves into this folder is a decision for later,
  not now (Joel).

Listed and LEFT — importers, read as evidence when a finding needs them, not
roster: the attention flash and your-turn frame rules in
`game-page/playArea.module.css`; the games that call the hooks (waffle,
connections, psychicnum, wordle, stackdown, scrabble, strands); `setgame/components/PlayArea.tsx` — which F-10 then converted, so it is edited
but not roster (`cs-unmet`, setgame's own area will read it).

## What the folder is, in one paragraph

*As it stood at the audit, 2026-09-15 — the folder has seven source files and
six tests now, and the current shape is `doc.md`'s.*

Three questions, four files. **Did a move cause this change?** —
`useMoveCausedChange` pairs a content key with the server's move marker and
hands back the previous content only when both advanced together. **Which
pieces are hot, and for how long?** — `useFlash` is a self-clearing set of ids
behind one timer; `feedbackTiming` holds the two shared lifetimes, each twinned
by hand with a token in `base.css`. **Did the turn just become mine?** —
`useTurnStartFlash` fires on the rising edge, never on mount. The CSS half
lives outside the folder: the tile's `.attentionFlash` and the board ring
`.yourTurnFlash` in `game-page/playArea.module.css`, the durations in
`base.css`, the one yellow in the theme.

Who calls what, **re-read 2026-09-15 after the game work below** (evidence for
the findings; the harvest turns this into the doc.md's caller table). The
`useFlash` row is much longer than it was at the audit — five more callers
arrived with the board work, and two of them spend a NAMED beat, which the
finding about unnamed lifetimes was written before:

| hook | callers | what the caller does with it |
|---|---|---|
| `useMoveAttention` (`useChangeCause` + `ATTENTION_FLASH_MS` inside) | waffle `Board`, connections `Board`, psychicnum `Board` | its own diff → the hot set → `.attentionFlash` per tile |
| `useChangeCause` alone | setgame `PlayArea` | the cause, with setgame's own choreography on top |
| `useFlash`, a NAMED beat | connections `BoardCol` ×2 (`ATTENTION_FLASH_MS`, `VERDICT_SHAKE_MS`), psychicnum `Board` (`VERDICT_SHAKE_MS`), stackdown `PlayArea` (`ATTENTION_FLASH_MS`) + `BoardCol` (`AMBIGUOUS_PICK_FLASH_MS`), strands `PlayArea` (`AMBIGUOUS_PICK_FLASH_MS`), setgame `PlayArea` (`ARRIVE_MS`, its own) | an attention flash, a head-shake, an input-problem ring, an arrival |
| `useFlash`, the DEFAULT | scrabble `BoardCol` ×3 | three verdict outlines on a beat nobody chose (F-3) |
| `useTurnStartFlash` | waffle, wordle, connections, psychicnum `PlayArea` | a boolean threaded `PlayArea → BoardCol → Board` → `.yourTurnFlash` on the grid |
| none — hand-rolled | boggle, spellingbee, stackdown, wordiply, letterboxed | a single tagged mark held in state and cleared by a ref'd timer (F-14) |

## Findings

### F-board-marks-1 · `intro-owed` · `doc.md` is one sentence, and the sentence undersells the folder

**WORKED 2026-09-15.** "Flashing the board pieces a move changed." Two of the four hooks are not
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

### F-board-marks-2 · `useflash-archaeology` · `useFlash`'s docstring is mostly how it used to be

**WORKED 2026-09-15.** Of its three paragraphs, the second is "Replaces the copy-pasted … that
scrabble had three of … and stackdown had one of" — how the code came to be,
which the conventions send to the commit message — and the third is a
parenthetical about stackdown's `WordFlash` not fitting. What a caller needs is
one paragraph: a set of ids that goes hot on `flash(items)` and clears itself
after `durationMs`; each call owns its own timer so two flashes on one board do
not interfere; a second `flash` restarts the clock and replaces the contents.
The "not a fit for a single tagged value" line can stay as one sentence of
scope, without naming stackdown.

### F-board-marks-3 · `unnamed-lifetimes` · Every `useFlash` caller spends a number the vocabulary has no name for

**HALF WORKED 2026-09-15.** `feedbackTiming.ts` says a lifetime is a property of the vocabulary, not of a
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


**The ambiguous-letter mark is named and shared**: `AMBIGUOUS_PICK_FLASH_MS`
(1000) in `feedbackTiming.ts`, read by stackdown and strands, which had typed
900 and 1000 for the same mark. Its docstring says why it is longer than the
attention flash — that one announces an event, this one asks for an action —
and that it is not published to CSS, the mark being a ring with nothing to
animate. Joel ruled the same day on its color: the mark takes the ERROR red — the
outcome vocabulary's member that never means a judgment, and darker than the
lost red — with the ring-versus-fill channel saying it a second time. stackdown
had the lost red and strands the chrome fault red; both read one token now
(recorded in tile-feedback.md's UI-problem section).

**Still open:** scrabble's three verdict outlines, which take `useFlash`'s
default rather than a named beat, and the default itself — a duration nobody
chose, sitting in the hook's signature.

**RE-VERIFIED 2026-09-15**, and the argument got easier. Every `useFlash` call
written since the audit names its beat from `feedbackTiming` — two of them
`VERDICT_SHAKE_MS`, which did not exist when this finding was written. scrabble's
three are now the only unnamed ones in the app, so dropping the default costs
exactly three call sites, and the file that would hold their name already holds
four beats it didn't.

**WORKED 2026-09-15.** `useFlash`'s `durationMs` is required — a mark's lifetime
is part of what the mark means, so a caller says which beat it raises and never a
number of its own. scrabble's three took vocabulary beats rather than a name of
their own: the rack slots just drawn are news arriving in place the player did
not choose, so `ATTENTION_FLASH_MS`; the cells just played and the cells of a
refused word are both a word's ANSWER on the board, so `WORD_ANSWER_MS`. That
retunes a game this sprint has not audited — yellow much shorter, the other two
half again longer — and Joel took that deliberately (2026-09-15): *consistency
first, and if it is wrong scrabble's own area changes it.* WHETHER those three
marks should exist at all is still scrabble's to say; the note below is
unchanged.

### F-board-marks-4 · `attention-timer-thrice` · The attention mark's lifetime is hand-rolled in three games, and the shared hook cannot serve it

**WORKED 2026-09-15**, as option (2). waffle, connections and psychicnum each carry the same nine lines: a
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


**What was built.** `useMoveAttention` — the attention mark end to end: it takes
the content, the key, the marker, a `changed` diff and a `quiet` flag, and
returns the hot set. `useMoveCausedChange` stays exported underneath, for
setgame's conversion and anything else that wants the cause without this mark.
The three games lost their `useState`, their empty-set constant and their
clearing effect; what each kept is its diff and its gate, passed in. waffle
hands its existing `changedCells` straight across; connections' diff now reads
the matched categories as objects rather than re-parsing its own key string.
`useMoveAttention.test.ts` pins the contract: nothing on mount however long the
log, the diff's set on a move, a re-deal absorbed silently, quiet suppressing,
a move that changed nothing visible marking nothing, and the next move diffing
against the absorbed board.

Option (1) was the area's own recommendation at the audit and lost on what a
game still had to know: that the cause result must be consumed during render,
that an empty set means quiet, and that the timer is its own — the three rules
worth sharing in the first place. It also dissolves F-8 for the common case:
the confusingly-named return value is no longer something a game handles.

### F-board-marks-5 · `cause-docstring` · `useMoveCausedChange`'s docstring is the folder's design essay, and two of its claims have rotted

**WORKED 2026-09-15.** Fifty-five lines. A caller needs the contract: what the three parameters are,
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

### F-board-marks-6 · `movecount-default` · Two boards default `moveCount` to 0, which silently turns the mark off

connections' and psychicnum's `Board` declare `moveCount?: number` with a
default of 0. A caller that forgets the prop gets a board that never flashes —
`0 > 0` is never true — and nothing says so. A default that disables a feature
is a decision the prop should not make; the prop wants to be required, as
waffle's is. Game-side, so the fix is two lines in two games' files when this
area's changes reach them (the area may fix another folder's problem now); noted
here because it is the hook's API that invites it.

**WORKED 2026-09-15.** Required in both, matching waffle's. Both already carried
a docstring saying the prop is the CAUSE the attention mark reads, so the only
thing missing was the type agreeing with it. Nothing else moved: every call site
was already passing it, which is exactly why a default that disables the feature
could sit there unnoticed.

### F-board-marks-7 · `cause-hook-untested` · Two of the three hooks have no test of their own

`useFlash` has a four-case unit test. `useMoveCausedChange` is covered only
end-to-end by waffle's `PlayArea.test.tsx` (a teammate's swap flashes; a
restart does not), and `useTurnStartFlash` only by three games' "not on mount /
on the transition" specs. The four cases the cause hook's docstring itself
lists — a move; a re-deal (content changes, marker drops); a move landing on
identical content (marker advances, content does not); a first render on a full
log — are exactly a unit test, and one would pin the contract F-4 builds on.
A file per unit: `useMoveCausedChange.test.ts`, `useTurnStartFlash.test.ts`.

**HALF WORKED 2026-09-15.** The cause hook got its unit test under its new name
(`useChangeCause.test.ts`) when F-10 renamed it, and `useMoveAttention.test.ts`
was written with the hook. `useTurnStartFlash` is still the only file in the
folder with no test of its own.

**WORKED 2026-09-16.** `useTurnStartFlash.test.ts`: silent on mount whichever way
the turn already sits, the rising edge, no fire when the turn leaves, firing
again next turn, never in a free-for-all, and no fire after unmount.

It earned its keep immediately. The seventh case was written to pin what the
audit had RECORDED about a turn leaving and returning inside the beat — and
failed, because the hook does the opposite. The area's own "what checked out"
list is corrected below. Every file in the folder now has a test of its own.

### F-board-marks-8 · `cause-hook-name` · The name asks a yes/no question and the hook answers with content

**WORKED 2026-09-15**, by F-10's rename. `useMoveCausedChange(content, key, moves)` reads as "did a move cause a
change?" — a boolean — and returns the content as it was BEFORE the move, or
null. Every caller writes `const before = useMoveCausedChange(…)`, naming the
return what the hook does not. Options: rename to what it returns
(`useContentBeforeMove`, `usePreMoveContent`); keep the name and let the return
type document it; or let F-4 option (2) absorb it. Decide with F-4, since that
finding may change what the hook is.

### F-board-marks-9 · `turn-flash-docstring` · Rationale and implementation notes in `useTurnStartFlash`'s docstring

**WORKED 2026-09-15.** "You notice things that appear far better than things that stop" is the design
reason (intro material); "React's endorsed … shape, and the house rule against
setState in effects" defends the implementation and belongs on the line it
defends, inside the body. The two rules and the free-for-all note are the
contract and stay. "Both mirroring `useCelebration`'s" — that hook has three
rules, of which these mirror the first two; say "the same never-on-mount and
rising-edge rules as `useCelebration`" or drop the cross-claim.

### F-board-marks-10 · `setgame-hand-rolled-cause` · setgame's cause check IS `useMoveCausedChange` keyed on an id, and it has not converted

**WORKED 2026-09-15**, after the finding's premise turned out to be wrong. `PlayArea`'s `seen` / `claimId` block does what the hook does — content key +
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


**The premise was wrong, and the correction is the finding.** setgame needs
THREE answers where the hook gave two. Its block runs a reset — show the new
board, drop every mark — whenever the board changed and a claim did not do it,
and `useMoveCausedChange` returned `null` both for that and for "nothing
changed". A conversion as the finding described it would have run the reset on
every render.

**What was built.** The hook now answers in three parts and is named for the
question it answers: `useChangeCause` returns `null`, `{ byMove: true, before }`
or `{ byMove: false }`. A move that landed on identical content is still
`null` — nobody looking can see it — and the re-seed still happens on every
change, so the next move diffs against the screen. `useMoveAttention` reads
`cause?.byMove` and is otherwise untouched, so no game changed.

setgame lost its `seen` state and its three-condition `byClaim` expression; its
`shown.length > 0` guard is the hook's first-render seeding. What stayed is
everything the choreography needs: the hold, `claimTransition(shown, board)`
measured against the SCREEN rather than against the board the hook hands back,
the `mine` split and the two lifetimes. Its arrivals moved onto `useFlash` with
`ARRIVE_MS`, which deleted the second clearing effect — the raise happens inside
the hold's timer, which is where `useFlash` is meant to be called from.

**`useFlash` gained a third return, `clear`.** setgame's reset takes a lit mark
off during render, and `flash([])` would have started a timer there. `clear`
only empties the set — it leaves any pending timer alone, since that timer
empties an already-empty set and a later `flash` cancels it first. Existing
callers destructure two elements and were not touched.

### F-board-marks-11 · `two-clocks` · Each lifetime is written twice, and a comment holds them together

**WORKED 2026-09-15**, by a route none of the three options named. `ATTENTION_FLASH_MS = 700` and `--mark-attention-flash-duration: 0.7s`;
`YOUR_TURN_FLASH_MS = 1200` and `--mark-yourTurn-flash-duration: 1.1s`. The JS
value removes the class, the CSS value runs the animation, and both files say
"change both". Two ways to make it one clock: (1) JS is the home — at boot (or
on the board root's `style`) write the tokens from the constants, so CSS reads
what JS decided; (2) CSS is the home — the class comes off on `animationend`
instead of a timer, and the constants go. (2) also closes a small real gap: a
throttled background tab can fire the timer late, and while the class lingers
the flash is at opacity 0 but `.tileFace.attentionFlash` still holds the dark
ink on a tile that has handed its color back. (3) keep two and the comment.
The your-turn pair is deliberately unequal (the class outlives the fade), which
(1) keeps by computing and (2) makes moot.


**What was built.** `feedbackTiming.ts` became the one home: it holds the two
fade durations and `publishMarkDurations()` writes them onto the document root
at boot (main.tsx, beside `trackLayoutWidth`), so no stylesheet declares them.
And the attention mark's ink stopped hanging off the class — it is now an
animation on the same published duration as the flash, so both halves start and
end together and the class's removal time is no longer load-bearing. The
`*_FLASH_MS` constants are composed as fade + 100ms slack and mean only "how
long the class is held": early clips the animation, late now costs nothing.
`.attentionFlash::before` gained `opacity: 0` so a duration that never arrives
shows no mark rather than a piece stuck under solid yellow.

Option (1) alone leaves two clocks and only one number, so a throttled timer
still splits the flash from the ink; (2) makes the mark's removal depend on an
event that a non-animating element, a future reduced-motion rule or jsdom never
fires. A transition-based exit — the fourth option, weighed at the build — dies
on the shorthand: `.tile` already sets `transition` on the same element as
`.tileFace`, so one element has one transition list and the ink's would be
silently dropped; and delaying the ink's return by the fade would delay every
other ink change on every tile in every game.

The your-turn ring keeps its animation and now reads a published token. It
never had the ink coupling, so nothing else about it changed; the deliberate
100ms by which its class outlives its fade is now the shared slack.

No game changed. All three attention callers put `.attentionFlash` on the
shared `.tileFace`, which is where both animations live.

### F-board-marks-12 · `folder-name` · `move-flash` named one of the folder's jobs

The folder holds the move-caused attention mark, a general transient set used
for input-problem and verdict marks, and the turn-start ring. The name and the
lede (F-1) say the first. Options: (1) keep the codename and let the lede say
what is inside — a folder name is an address, and thirteen importers plus the
plan's §3 row and this area's name would move on a rename; (2) rename to what
it is — `marks`, `transient-marks` — while the area is open and the sweep is
cheap; (3) split: `useFlash` is not about a move and could live with the
board chrome. Recommend (1) unless Joel wants the honest name now.

**RE-READ 2026-09-15: the premise got stronger, not weaker.** Since the audit
the folder has taken on the head-shake's beat and the refused-word answer's, and
`feedbackTiming.ts` is now where a mark's lifetime is decided for every game that
has one. Two of the folder's six files have "flash" in their name and four
don't. The address argument for (1) is unchanged; the honesty argument for (2)
has grown.

**WORKED 2026-09-16**, as option (2), renamed to **`board-marks`**. Not `marks`,
which Joel ruled too vague for a folder (2026-09-16): a bare plural with no scope.
`mark` itself is the word the repo already spends — the `--mark-*` token family,
ui.md's row, tile-feedback.md's vocabulary, and this folder's own lede — so
building on it adds no synonym, and `board-` is what tells it from the feedback
pill, the turn log and the header. `board-feedback` was ruled out on sight:
`common/feedback/` is the pill system and a closed area, and two folders named
feedback is the exact collision this sprint spends its time removing.

The sweep: the folder, its area file, the import path in fifteen files, the
`cs-*-move-flash` stamps, the finding slugs, `docs/common-folders.md`'s row
(which also moved to where the table's alphabetical order puts it) and the plan's
§3 row. What stays under the old name is this sprint's commit messages, which is
the one cost that can't be swept and is worth less than the name.

### F-board-marks-13 · `stale-path` · `tile-feedback.md` points at `common/hooks/game/useMoveCausedChange`

**WORKED 2026-09-15.** That folder went in the 2026-09-04 restructure. The plan is the design
reference this area is told to read, so the pointer is fixed in passing:
`common/board-marks/useMoveCausedChange`.

### F-board-marks-14 · `tagged-mark-hand-rolled` · Five games hand-roll the same self-clearing mark, because `useFlash` holds a set

**FOUND 2026-09-15, in the re-read after the board work.** `useFlash` holds a SET
of ids, and its docstring declines the other shape outright: *"a single nullable
tagged value — one mark with a reason attached — is a different shape and keeps
its own self-clearing state."* That was true of one game when it was written.
Five games now keep that state, and they keep it the same way — a nullable object
in `useState`, a timer in a `useRef`, a `show…` callback that clears the old
timer and starts a new one, and an unmount effect:

| game | what it holds | beat |
|---|---|---|
| boggle | `{ cells, outcome }` — a refused word's tiles | `WORD_ANSWER_MS` |
| spellingbee | `{ letters, outcome }` — a refused word's letters | `WORD_ANSWER_MS` |
| stackdown | a peer's mark, and its own | `ATTENTION_FADE_MS` + `WORD_ANSWER_MS` |
| wordiply | `{ word, outcome, attention }` — a held row | a two-stage timer |
| letterboxed | `{ word, nonce }` — the refused word | its own |

This is F-4 again, one channel over: the folder has the transient-state hook and
the folder's newest use case can't call it. The shape is a *tagged* mark rather
than a set of ids, and the two-stage version (attention first, then the answer)
is the sequence the vocabulary specifies, written out by hand three times.

Options, when it comes up: (1) `useMark<T>(durationMs)` — the tagged twin of
`useFlash`, returning `[mark, show, clear]`; (2) that plus a two-beat form for
the attention→answer sequence stackdown and wordiply write out; (3) leave it, and
let each game's own audit decide.

**RE-VERIFIED AT THE PRESENTATION, and the finding as filed was wrong about its
own membership.** The five are not one pattern. THREE are exact copies — boggle,
spellingbee and stackdown's word flash, the same fourteen lines. letterboxed's
refused word has NO CLOCK: it is cleared by the next keystroke, which is the
vocabulary's "until the next action" verdict lifetime, and a duration-based hook
would be wrong for it. stackdown's peer mark and wordiply's are a two-beat
SEQUENCE — two marks with a delay, not one mark.

**WORKED 2026-09-16**, as option (1) (the commit is dated the 16th; an earlier
revision of this line said the 15th). `useMark<T>(durationMs)` holds one mark
with its reason attached, null meaning the board is saying nothing; `useFlash`
keeps the other shape, a set of hot ids, and the two sit beside each other with
the difference stated in both docstrings. The three exact copies converted and
lost forty lines between them. letterboxed is not this hook's shape and was not touched.

**AND OPTION (B) TOO, 2026-09-16.** `useAnnouncedMark<T>()` is the sequence:
`{ value, phase: 'pointing' | 'answering' } | null`, the attention flash then the
outcome's color then off. Both lifetimes are baked rather than passed, because
the vocabulary fixes them; what is worth having in one place is WHEN the phases
change over — exactly `ATTENTION_FADE_MS`, the instant the attention flash
finishes fading and the piece's own color is visible again. Earlier paints the
answer under a flash still on top of it, and that rule was written out in two
games' comments and nowhere else. `announce: false` skips the first phase for a
player already looking at the piece, which is wordiply's own-word case.

It grew one thing beyond the presentation: an `onEnd` captured at `show`, because
wordiply keeps state BESIDE the mark that ends with it — a refused word's held
row, which has no server row coming to replace it. Without a hook point at the
end of the sequence that game could not convert at all. A cleared mark does not
run it: that mark was interrupted, and the caller knows more about what comes
next than the hook does.

Joel, 2026-09-16, on building it at two callers: *"we may have other games use
'announce-then-mark' pattern in the future."*

### F-board-marks-15 · `replay-hand-rolled` · Replaying a mark is solved four ways, and one of them silently doesn't

**FOUND 2026-09-15, in the re-read.** A CSS animation runs once per mount, so a
mark that must fire twice in a row needs the element remounted or the class
removed and re-added. `.verdictShake`'s own comment in `playArea.module.css` says
so — *"Replaying it needs a REMOUNT … on any board where the same piece can be
refused twice"* — and then every board answers it differently:

- **spellingbee, wordwheel**: a nonce keys the whole board element.
- **letterboxed**: a nonce inside each node's `key` string, so only the letters
  in the refused word remount.
- **connections, psychicnum**: `useFlash(VERDICT_SHAKE_MS)`, whose timer drops
  the class — the replay falls out of the mark clearing itself.
- **boggle**: the class rides the presence of a held value, which does NOT
  replay. Refuse the same word twice inside `WORD_ANSWER_MS` and the second
  refusal shakes nothing. Its pill still answers, so it reads as the board
  missing one, not as a bug.

The shared CSS states the requirement and provides nothing to meet it, which is
how four answers and one gap happen. Options: (1) fix boggle where it stands and
leave the idioms alone, writing the rule down where the requirement already is;
(2) `useMark` grows a raise counter; (3) a named `useReplayNonce()` hook.

**RE-VERIFIED AT THE PRESENTATION: three mechanisms, not four.** spellingbee and
wordwheel key the whole board; letterboxed keys each node; connections and
psychicnum get it from `useFlash`'s timer dropping the class, which replays only
AFTER the beat — structurally the same gap as boggle's with a 400ms window, but
their marks are per-guess and per-word so re-raising an identical set inside the
beat is not reachable. boggle's is: ArrowUp recalls the last word and Enter
re-submits it.

**WORKED 2026-09-16**, as option (1). boggle's mark carries a `nonce` counting
the raises and its answered tiles are keyed by it, which is letterboxed's idiom
exactly. The rule went where the requirement already was — beside `.verdictShake`
in `game-page/playArea.module.css`, which is where someone adding a mark is
standing — and once more in the folder's doc.md. The three idioms stayed: each is
right for its board's grain (a piece, a node, a whole board), and collapsing them
would fit worse. (2) helps only boards that hold a mark, which is the two that
already worked; (3) buys a name for a hook whose body is shorter than its import.

The boggle spec is planted-verified: with the old key restored it fails on the
tile being the same DOM node across two refusals.

## The closing re-read, 2026-09-16

The whole area in one sitting — the seven sources, the six tests, setgame's
flash pair, the mark rules in `playArea.module.css` and the flash lines in
`base.css` — plus, for each worked finding, the grep that would find the same
defect in a sibling ([app-audit.md](../app-audit.md) §4: a claim one group
disproved can still stand next door). Seven more. Six were the area's own
findings recurring one file over, or stale claims the area's own fixes wrote;
they are fixed in place. One is a conversion with a decision in it, and waits.

### F-board-marks-16 · `stackdown-second-mark` · stackdown still hand-rolls a self-clearing mark, one block below the `useMark` F-14 gave it

**FOUND at the re-read; OPEN — a decision.** F-14 converted stackdown's word
flash and recorded the file as done, and twenty-five lines below that
conversion `refusedWord` is the same fourteen lines again: a nullable value in
`useState`, a timer in a `useRef`, a clear-and-restart at the raise, an unmount
effect. It holds the player's own refused word — its tiles stay off the board
while the answer is read in the slots — and when the beat ends it runs three
things: `clearWord()`, the returned tiles' attention flash, and the null. That
END-OF-BEAT work is why it did not fit `useMark`, which has no hook point at the
end, and why F-14's re-verification (which counted "three exact copies") walked
past it.

It IS a shape the folder now has: `useAnnouncedMark` with `announce: false` is
exactly "wear the answer for `WORD_ANSWER_MS`, then run `onEnd`" — the wordiply
own-word case. Options: (1) convert to `useAnnouncedMark(…, { announce: false,
onEnd })`, which deletes the ref, the effect and the restart, and puts the
end-of-beat work where wordiply's already is; (2) give `useMark` an `onEnd` of
its own and convert to that — then two hooks carry the same option and the
difference between them shrinks to the announce phase; (3) leave it for
stackdown's area, which is where the file's other marks will be read anyway.
Recommend (1): no new surface, and the two callers of the sequence hook become
three, which is what Joel built it for (*"we may have other games use
'announce-then-mark' pattern in the future"*). Not built at the re-read
because it is a game's move path, and the choice between (1) and (2) is the
kind a decision is for.

**WORKED 2026-09-16**, as option (1) — Joel: *"1"*. `refusedWord` is
`useAnnouncedMark<number[]>()` raised with `announce: false` and an `onEnd`
that clears the word and flashes the returned tiles; the ref, the unmount
effect, the restart and the `useRef` import are gone (seventeen lines out,
fourteen in, most of them the comment). The path had NO spec — it was green
after the conversion because nothing exercised it — so `PlayArea.test.tsx` got
one: the slots wear the refusal and shake, `clearWord` is not called a
millisecond before `WORD_ANSWER_MS` and is called at it, and the tiles land
back wearing the attention flash with the slots' verdict gone. Planted: with
`announce: true` the hold grows by the fade and the spec fails on `clearWord`
never being called at the beat.

### F-board-marks-17 · `flash-archaeology-again` · F-2's defect, twice more

**WORKED 2026-09-16.** `useFlash`'s docstring had grown a new parenthetical —
"There was a default of 1000 here, which is a decision nobody made…" — written
by F-3's fix, which is the exact how-it-used-to-be paragraph F-2 had just cut
from the same docstring. And scrabble's `BoardCol` carried its twin: "All three
ran on a shared default of 1000 before, a number nobody picked." Both gone;
the commit message is where that lives.

### F-board-marks-18 · `stale-siblings` · Five claims the area's own work made false

**WORKED 2026-09-16**, each in place:

- `useFlash`'s last paragraph still said a tagged mark "keeps its own
  self-clearing state" — F-14 built `useMark` for exactly that and the
  docstring next door never heard. It names `useMark` now.
- `feedbackTiming.ts`'s header said `publishMarkDurations` "writes the two
  durations" and that "the `*_FLASH_MS` values" are fade plus slack. It writes
  three (the head-shake's joined), and `AMBIGUOUS_PICK_FLASH_MS` is a
  `*_FLASH_MS` that is a whole lifetime with no fade under it. The header now
  names the two composed constants rather than a pattern.
- `base.css`'s "Feedback timings" section said the two tokens are "both READ
  here". None is read there — every reader is in `playArea.module.css` — and
  there are three. It is a pointer now: not here, published from
  `feedbackTiming.ts`, read by the mark rules.
- `useTurnStartFlash`'s docstring named a `prev` that is `prevMyTurn`, and its
  rule 2 said nothing about a frame still up when the turn leaves — which the
  hook takes off at once, and F-7's test pins. One clause added.
- `tile-feedback.md` still said `useChangeCause` "hands back the previous
  content only when a move caused the change" and that setgame "folds in when
  it converts" (F-10 did both), that stackdown rings for 900ms and strands for
  1000ms "at a different number" (F-3 named one), listed the shared lifetime as
  a strands proposal (done), and had scrabble's three outlines "at about a
  second" (F-3 gave them named beats). All five corrected.

### F-board-marks-19 · `two-clocks-again` · `.verdictRing` shakes on a literal `0.4s` beside `.verdictShake` on the token

**WORKED 2026-09-16.** F-11 made `feedbackTiming.ts` the one home and F-14's
head-shake published `--mark-verdict-shake-duration`; `.verdictShake` reads it
and the comment between them says "one shake, one meaning, one duration". The
older `.verdictRing`, twenty rules up, still had `verdict-shake 0.4s` typed in.
It reads the token now — the same defect F-11 worked, in the sibling rule. Its
comment also sent the reader to "wordle's BoardCol, connections' Board" for the
replay nonce: wordle's is `Board.tsx`, and connections stopped wearing the ring
when F-14's work put it on `useFlash`. It points at `.verdictShake`'s rule,
where F-15 wrote the replay rule in full.

### F-board-marks-20 · `stale-example` · The flash keyframe's comment worked its example at a duration the fade no longer has

**WORKED 2026-09-16.** "At 350ms this is 300ms solid and a 50ms tail" — the
fade is 250ms, and the sentence before it already makes the point (the split is
a proportion, so retuning keeps the shape). The example is gone; a number in a
comment is the count that always rots.

### F-board-marks-21 · `test-claims` · Two test files carried claims the area itself had retired

**WORKED 2026-09-16.** `useFlash.test.ts` had a spec named "accepts a custom
duration" — from when there was a default to be custom against; F-3 made every
duration the caller's. Renamed for what it checks. And the "what checked out"
list below credited `useFlash`'s test with its unmount cleanup, which the test
did not exercise while `useMark`'s, `useAnnouncedMark`'s and
`useTurnStartFlash`'s all did; the spec is added, so the claim is true.
`useTurnStartFlash.test.ts`'s last spec cited THIS FILE by name for having
recorded the hook wrong — a durable file pointing at the area record, which the
rule forbids; the comment keeps the rule and drops the citation.

### F-board-marks-22 · `experiment-unrecorded` · The spellingbee / wordwheel experiment lived only here

**WORKED 2026-09-16.** Joel's 2026-09-15 ruling — spellingbee colors a refused
word's letters, wordwheel deliberately does not, friends decide for both — was
recorded in this file's game section and nowhere that outlives it. It is a
Someday in both games' `todo.md` now, each naming its twin, so the game area
that opens first meets it on its first read and does not "fix" one to match the
other.

### F-board-marks-23 · `unnamed-effects` · The area wrote seven non-trivial callbacks as bare arrows

**FOUND by Joel at the close, 2026-09-16; WORKED the same day.** The
convention (code-conventions.md → the hook-callback rule) names a `useEffect`
callback when it is non-trivial, and every effect this area wrote was a bare
arrow: the take-off timers in `useMoveAttention` and `useTurnStartFlash`, the
unmount cancels in `useFlash` and `useMark`, connections' flash-then-shake and
psychicnum's shake-after-flash (both 2026-09-15), and setgame's hold-then-swap,
whose body F-10 rewrote. Named for what they do: `takeMarkOffAfterBeat`,
`takeFrameOffAfterBeat`, `cancelTimerOnUnmount` (twice), `flashThenShake`,
`shakeAfterFlash`, `holdThenSwap`. The two multi-line `renderHook` callbacks in
the folder's tests took names too — as hooks (`useRecordedAnswers`,
`useAttentionOnChangedCells`), because `rules-of-hooks` refuses a hook call
inside a function not named as one. Left bare on purpose: the one-line
`useEffect(() => () => stop(), [stop])`, the `setTimeout` bodies (the
convention scopes itself to the three hooks and says so), and scrabble's three
effects, which are July's and scrabble's area's. The re-read had grepped for the
area's own findings recurring and not for this rule, which is a sibling of the
docstring-marker pass and belongs in the same sitting.

Also at the re-read, checked and true: the `doc.md` caller table against every
importer (the grep for the folder's path, then each hook's name); no `move-flash`
or `useMoveCausedChange` anywhere outside this file and the commit log; no date
later than today in any file the area touched; `common/board-marks` already off
`INTROS_OWED`; `publishMarkDurations` called at boot beside `trackLayoutWidth`;
the three `--mark-*-duration` tokens declared in no stylesheet; the two
`--mark-attention-*` colors in both themes. The one-paragraph summary above
("Three questions, four files") is marked as the audit's, not today's.

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
  fires. ~~A turn that leaves and returns inside 1.2s neither replays the ring
  nor restarts the timer, and that is fine.~~ **WRONG AS RECORDED — corrected
  2026-09-16 by F-7's test.** The transition sets `flashing` to whichever way the
  turn just went, so a turn LEAVING takes the frame off at once instead of
  letting it finish, and coming back is a fresh arrival with a full clock. Both
  halves are defensible — you acted, so the announcement is spent; you are being
  told again, so it is told properly — and both are pinned by a spec now. What is
  not defensible is reading a hook and recording the opposite of what it does,
  which is what a unit test is for and why F-7 existed.
- `useFlash`'s unmount cleanup, restart-on-reflash, and its test.
- `feedbackTiming`'s two values against their tokens: attention equal (the
  minimum the rule allows), your-turn longer on purpose.
- `claimTransition` and its five-case test, slot by slot, including the
  compaction case that a set difference misses.
- The theme's `--mark-attention-*` pair is declared in both themes; `ui.md`'s
  `mark-*` row and its `--mark-attention-tile-color` row are true today.
- `docs/playarea.md`'s "split flashes by their trigger" note is true today.

## Games this area changed, and what is still owed in each

Kept HERE rather than in `tile-feedback.md`'s roster, because more may land
before those games get their own audits (Joel, 2026-09-15) — and because this
work is not what the sprint usually does. Most of the audit is code quality,
readability, duplication: invisible to a player. **These are changes a player
feels**, which is why they are worth a record of their own.

None of these games is at tf2. Each got the MARKS brought onto the shared
vocabulary, not the full pass against the current framework, and the level is
Joel's to set.

### psychicnum

**Landed.** The head-shake for a wrong guess, waiting for the attention flash to
finish rather than riding it. Two stuck in-flight dims fixed: the history viewer
swapped in a snapshot that could never contain the word just guessed, and a
restart emptied the results the release condition reads. The ambiguous-pick
mark's color and lifetime are shared now.

**Owed.** Its proper tf2 pass, which the roster has wanted since 2026-08-20.

### connections

**Landed.** The band's attention flash reaches the player whose guess made it,
not just the teammates. A teammate's non-winning guess marks THEIR four tiles
for everyone, in the outcome's own color, with the shake. The verdict fill lost
its built-in shake — that is a channel of its own now, and it follows the flash.
Both oranges were darkened at their base so white ink reads on them (2.40:1,
blessed below the floor). The verdict nonce moved from a ref to state, so the
two raises cannot collide on a number.

**Owed.** Whether a wrong or near guess wants the attention flash as well as the
verdict; `revealedHints` moving back into `<HintList>`; `GuessOutcome`.

### stackdown

**Landed.** The entry slots became tiles, so an answer is the same fill and white
ink there as anywhere; `won` joined the shared tones for it. A refused word
answers in the slots and shakes, its tiles returning marked. A teammate's word is
marked on THEIR tiles instead of squatting in this player's entry row, and an
accepted word's tiles are held on the board, inert, while the answer is read. The
letter was lifted above the flash, which had been painting over it.

**Owed.** Its board's `.tile` is bespoke rather than the shared face; the
hover/press stand-in written for the dark-mode spike; the tile border's
button-blue borrow.

### letterboxed

**Landed.** The letters left the SVG and became tiles — the shared face, the
shared shadows, the shared hover and press, and any mark the vocabulary grows
next. A refused word shakes. A covered letter takes the chain green on its edge,
and the previous word's ghost line is the accent washed rather than gray.

**Owed.** Nothing recorded yet; it had no marks at all before today.

### wordiply

**Landed.** A submitted word no longer vanishes for a round trip — the row holds
it while its answer shows, and wears that answer's color. A teammate's word gets
the attention flash then the green. One table (`lib/answer.ts`) decides the
outcome, and the pill, the row and the log all read it.

**Owed.** Nothing recorded yet.

### boggle

**Landed.** The board reads as a board: the tray went from near-black to the
palest tile shade with an edge of its own, the tiles are the ordinary face with
shade-4 edges and the shared shadow, and the selected channel is the app's black
border instead of the action button's blue fill. The hover lift and the press
were dead — both rules were keyed on `[role='button']`, and the role had been
taken off the tile — so they work again for the first time since. A refused word
resolves ON the board: the tiles it used take the answer's own fill and white ink
and shake, the actor's alone, with no attention flash (you know what you just
typed). `lib/answer.ts` is the one table the pill, the tiles and the log read, so
red-for-wrong and orange-for-duplicate cannot disagree — and it is boggle's own,
which is the point: wordiply, which encourages long strange words, answers
differently. A typed word now lights the board as it is spelled: each
letter marks the tiles that could carry it, solid where one tile can and held
back where several can, so certainty only ever grows and no tile is lit and then
taken back. A letter the board can't follow doesn't darken the board — it dims
itself in the entry box, the way a bee game dims a letter off its puzzle. ("Show nothing until one route is left" was tried first and read as
borders flickering on and off — a player has no way to know why.)

**Owed.** Nothing recorded yet.

### spellingbee

**Landed.** The hive wears the shared piece gesture — a resting shadow, a lift on
hover with the shadow falling away, a 0.96 press. Hover had been a DIM, which is
the one thing hover means nowhere else in the app, and the press shrank by 0.9,
far enough to read as the hex jumping away from the finger. The lift and the shadow are in
the flower's coordinate units, because an SVG transform length and a filter
length are user units — so the depth scales with the board. The shadows are
tighter than the shared pair and cast straight down: blur ≤ offset, so nothing
falls above a piece that is meant to be lit from above. The BORDERS go the other
way and opt out of the scale (`vector-effect: non-scaling-stroke`), which lets
them be the shared 2px / 4px exactly; as user units the selected edge came out at
6px, half again as thick as the tiles on every other board. A letter the typed word is using takes the app's selected edge, black
and thicker — which also answers the pangram hunter's question, since the
unmarked hexes are the letters still missing. A refused word now answers on the
board too: the hive head-shakes and the letters the word used take the outcome's
fill and white ink, off one table (`lib/answer.ts`) that the pill reads as well.
The white click-flash overlay is gone — it was written when the press was a bare
`scale(0.9)` and easy to miss, and white at 0.7 over a pale hex read as the tile
blanking; the press does that job now.

**Owed.** (Filed in `spellingbee/todo.md` at the close, F-22.) The outcome
color on the letters is KEPT, and wordwheel deliberately
does NOT have it, so friends can play both and say whether coloring a letter tile
helps at all (Joel, 2026-09-15). The doubt that started it: a refused TETE colors
two hexes, because a hive letter stands for every use of it in the word — the
hive has seven tiles and a word has as many letters as it likes, and that
mismatch is the thing being tested. Whatever comes back decides it for both.

wordwheel is spellingbee's fork and still has all
of this in its old form — the same white flash, the same dim-on-hover, the same
0.9 press — but it is its own area and gets its own turn.

### wordwheel

**Landed.** The wheel left SVG. Its nine tiles were `<circle>`s, which cost the
shared depth tokens (an SVG shape takes no box-shadow) and, worse, a stacking
order — SVG paints in document order with no `z-index`, and the wheel's tiles
TOUCH, so a hovered tile could only ever rise BEHIND its neighbors. They are
round boxes now, placed by their own centers off the same geometry the PDF still
draws real circles from.

That turned up what the board actually is: the mustard is a TRAY, not a border.
Nine tangent seats merge into the flower, and the piece is the lighter circle
inside one. So the seat stays put and the face carries the gesture — rests with
the shared shadow, rises on hover while the shadow falls away, presses back down
by 0.96. Hover had been a DIM, which is the one thing hover means nowhere else.

A spent tile takes the app's selected border instead of a darkened fill. The dim
was the in-flight channel doing a selected tile's job, and two darkened reds are
harder to tell apart than an edge that changed color. Two tokens retired with it.

And the mark lands on the tile the player CLICKED. The spend rule read counts off
the word, which says how many of a letter are in use but not which tiles — fine
for a typed letter, wrong for a clicked one, and clicking one E while its twin
went dark is the board answering a different question than the one asked. A click
now claims its tile (`lib/spend.ts`), claims are spent before the fallback, and
what is left still prefers the center, which is the game's own rule.

A refused word head-shakes the whole wheel, as spellingbee's hive does and for
the same reason: the refusal is about the word, and the letters are all legal
tiles that did nothing wrong.

**Owed.** (Filed in `wordwheel/todo.md` at the close, F-22.) No outcome color
on the tiles, and that is the POINT: spellingbee has
one and this doesn't, so the pair is an experiment friends get to settle (Joel,
2026-09-15). Whatever comes back decides it for both. `Wheel.module.css` and spellingbee's
`Letters.module.css` now share
LESS than the fork ledger says they could: a hexagon can't be a bordered box, so
the hive stays SVG. The ledger says so.

### What this work changed for every game

- **A restart mounts a new play surface** (`common.games.restarts` + the page's
  key). Eleven per-game cleanups deleted, `onRestarted` gone from
  `useStandardGameActions`. The contract is in `game-page/doc.md`.
- **One event, one outcome** — the server decides where it answers, the frontend
  decides once where it does not, and the pill, the board and the log always
  agree. In `docs/outcomes.md`, and an audit rule in `app-audit.md`.
- **`TurnOutcome` is deleted**; a turn-log bar takes any `Outcome`. The `near`
  sweep it unblocked is in `turn-log/todo.md`.
- The head-shake channel, the "yellow means look here" default, two blessed
  contrast exceptions, `.verdictWon`, and the ambiguous-pick mark's one name and
  one color — all in `tile-feedback.md`.

## Notes

- **scrabble's three outlines, read against the vocabulary, for its tf pass
  (tile-feedback.md's roster already lists scrabble at tf0):** the yellow on
  just-drawn rack slots is attention-shaped (news the player did not choose,
  arriving in place); the green on the cells just played is the player's own
  move, which the audience rule says needs no mark (the verdict is the pill's);
  the red on a refused word is a verdict, whose lifetime the vocabulary says is
  "until the next action", not a timer. Not this area's to decide — F-3 gave all
  three a named beat, which says how long each stays, not whether it belongs.
- `.attentionFlash` in `playArea.module.css` cites "as waffle's letter does" —
  a game named in shared CSS. `game-page` is closed; left for the concern split
  its `todo.md` holds.
- Which games flash a move today, and which do not: the three attention
  callers plus setgame. wordle is the plan's worked case for "no mark needed"
  (a guess lands in empty space). The other eleven boards have no attention
  mark; the plan's roster is where that is tracked, per game.

## Predicted test breaks

*Written at the audit:* if F-4 lands, `waffle/components/PlayArea.test.tsx`
(the two `attentionFlash` specs) is the end-to-end check and should stay green,
being about the class and not the hook. If F-11 chooses `animationend`: the
same two specs, plus the three games' `yourTurnFlash` specs, assert the class
ON and never its removal, so jsdom's lack of animation events should not bite.

*What happened:* F-4 landed and waffle's two specs stayed green as predicted.
F-11 did not choose `animationend` (the class still leaves on a timer, and the
animations end on their own), so the second prediction never came due. The
breaks the area actually produced were the ones it wrote on purpose — F-7's
seventh spec, which failed against the hook and corrected this file, and
F-15's planted boggle spec.

## Closing

- [x] **"wash" → "attention-flash" across the prose** (Joel, 2026-09-15: at the
      close of this area). **DONE 2026-09-16.** The mark sense is gone from
      `playArea.module.css`, `feedbackTiming.ts`, the folder's `doc.md`,
      `tile-feedback.md`, the area file, the plan's §3 row, `common-folders.md`,
      and five games (connections, psychicnum, waffle, scrabble, and the two
      tests that narrated it). connections' `washedTiles` / `washTiles` became
      `attentionTiles` / `flashAttention`, matching the name stackdown already
      used — the synonym had reached identifiers, not only prose.

      What STAYS is every other sense, which is most of the word's 254 hits:
      the `--outcomes-*-wash-color` tier, a button's hover and press wash, a
      translucent tint described as a wash, "washed out" meaning faded, and
      wordle's row in this plan where "a wash" means the change broke even.
      Joel, 2026-09-16: *"'wash' is what we use for a lighter-version of a
      background."* That is the sense that owns the word, and the mark's use was
      the squatter.

      Guarded narrowly in `vocabularies.test.ts`, because a repo-wide ban would
      be mostly allowlist: the two words adjacent (attention, then the banned
      one) anywhere, and the banned one at all inside `common/board-marks/`. The
      guard bites this file too, which is why the phrase is not written out here. Planted both — a line in the
      folder's `todo.md` and a sentence in `docs/ui.md` — and both failed before
      being taken back out.
- [x] the whole area re-read in one sitting after the last group — **DONE
      2026-09-16**, seven more findings (F-16 – F-22 above), one open.
- [x] the folder's `doc.md` intro written and its row off `INTROS_OWED` (F-1,
      2026-09-15); **harvested 2026-09-16** — the lede names all three kinds of
      mark and the lifetimes, and `## Details` gained the announce-then-answer
      changeover rule. No render tree: the folder holds hooks, not components.
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      — **2026-09-16.** The folder's own `todo.md` is empty: the one open item
      (F-16) is stackdown's and waits on a decision, and the experiment is in the
      two bee games' todos (F-22). The game section below stays by Joel's word
      as a record of what landed; every "Owed" line in it now also lives in
      `tile-feedback.md`'s roster or the game's `todo.md`.
- [ ] every file on the roster blessed, or its stamp says why not — **JOEL'S.**
      The roster is `cs-audited-board-marks` throughout; nothing is blessed.
