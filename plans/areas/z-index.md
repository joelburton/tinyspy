# Area: z-index

The stacking order, end to end. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-18** (Joel: *"we can close the zindex area"*). Every
question answered, all six findings worked, the closing re-read done. **No files
were blessed and none needed to be** — this area had no roster by Joel's own
framing at the open, so closing is not gated on a stamp here the way an ordinary
area's is. Shipped in `ecec3ce4`, plus the re-read's corrections.

| | |
|---|---|
| **worked** (6) | F-1 · F-2 · F-3 · F-4 · F-5 · F-6 |
| **handed on** (1) | F-5's *conversion* — whether `CrosswordsNumberJumpBlockingModal` becomes a `<BlockingModal>` — to `src/crosswords/todo.md`, whose existing item carried the same two false claims and now says the conversion moves no layer |

**This one has no roster and takes no stamps** (Joel, 2026-09-18: *"it's not
really an area — we shouldn't associate any files with it. it's really a task:
to implement the rest of our zindex plan"*). It reads `core-css/base.css` →
THE Z- LAYERS, the two guards, and every `z-index` in `src/`, but it does not
own those files and does not bless them. What it owns is the decision below and
the six findings under it.

Joel's reasoning when he scheduled it (2026-09-16): *"it will be best to handle
the z-index issues in an area dedicated to this; so that everything has a clear
meaning for the zindex (and make the board actually sit where we document it
sitting at)."*

## The state, simply — AS FOUND, before the work

The ladder is honest from `--z-infocol` (1300) **up**, and fiction **below** it.
The three board rungs — `--z-board`, `--z-board-question`, `--z-ghost` — are
declared, parked in `cssTokens.test.ts`'s `DECLARED_AHEAD`, and read by nothing.
Under them, twenty-eight game-level literals sit at 0–10 and two drag ghosts sit
at 1000 and 100.

Nothing is visibly broken today, and the reason is not the ladder — it is the
**numeric gap** (locals ≤ 10, page-level ≥ 1000). The gap is doing all the work
the rungs claim to do.

## What was there — AS FOUND, before the work

Thirty-nine `z-index` declarations in `src/` CSS: **nine read a token**,
**thirty are literals** (twenty-eight at 0–10, plus the two ghosts). In
TypeScript, four sites pass a token and one is computed (stackdown's
`zIndex: t.z`).

| where | today | what the ladder says |
|---|---|---|
| shared tile internals (`attentionFlash` 0, `tileWord` 1, `dimInFlight` 2) | literal, **sealed** — `.tile` has `container-type: inline-size` | local; correct as-is |
| scrabble board (`.dropNo .tile`, `.flashAccept`, `.historyTile` = 2; `gridCursor` 5) | literal, **sealed** — `.board` has `container-type: inline-size` | local; correct as-is |
| stackdown tile pile (`zIndex: t.z`, 0…n) | computed, **sealed** — `.canvas` has `container-type` | `--z-board` claims to own 1000–1099 for exactly this (F-1) |
| crosswords `.number` 1, `.peerFrame` 2, `.rebusWrap` 5 | literal, **not sealed** — `.board` is `position: relative`, `z-index: auto` | `.rebusWrap` is the sole `--z-board-question` candidate (F-2) |
| bananagrams `.controls` 10, `.tileInvalid` 1, `.handError` 2, `.floatingRotate` 2, cursor 5 | literal, **not sealed** — `.grid` creates no context | local |
| waffle / wordwheel / connections / wordiply / psychicnum lifts (all 1) | literal | local |
| `.historyBanner` 5, RankBar 0/1/2, `.floatingShuffle` 2, scrabble `.rackShuffle` 3 | literal, **not sealed** | local |
| bananagrams ghost **1000**, scrabble ghost **100** | literal; both `position: fixed`, both genuinely page-level | `--z-ghost` (1200) — F-3 |

**The sealing is already half-true, and uneven, by accident.** `letterboxed`'s
and `strands`' `.board`, `stackdown`'s `.canvas`, `scrabble`'s `.board` and the
shared `.tile` are stacking contexts because they needed `container-type` for
`cqi` sizing. Crosswords' `.board` and bananagrams' `.grid` are not. So "local
≤ 10" is structurally true in some games and true only by the gap in others —
and nothing anywhere records which is which.

## Findings

### F-z-index-1 · `board-range-is-fiction` · `--z-board`'s 1000–1099 range is unclaimable — WORKED

`base.css` says `--z-board` "OWNS THE RANGE 1000–1099, for pieces stacked on
other pieces — stackdown's depth." stackdown writes `zIndex: t.z` (0…n) in
`Board.tsx`, inside `.canvas`, which is already a sealed stacking context — and
`vocabularies.test.ts` explicitly blesses that computed form as "per-tile data
inside a board's own context [that] has no business being a token." Offsetting
those numbers to 1000+z would change nothing that paints. The range describes a
thing that cannot come to exist.

### F-z-index-2 · `question-rung-has-no-job` · `--z-board-question` has no candidate — WORKED

The rung exists for crosswords' rebus entry and its read-only peek. `.rebusWrap`
is `position: absolute` **inside** `.board` and clamped to the grid, so it never
competes with anything page-level — whether or not boards get sealed. The rung
is dead under every option below.

### F-z-index-3 · `ghosts-still-disagree` · the two drag ghosts, and a wrong consequence — WORKED

The known one, still open: bananagrams' ghost is `z-index: 1000`, scrabble's is
`100`, the same element at two numbers, both `position: fixed` and both
genuinely page-level, with `--z-ghost` (1200) sitting unread for both. Two
things the record gets wrong:

- **`shared/grid-and-drag/todo.md` states the consequence wrongly** — *"scrabble's
  paints BELOW an open dialog, bananagrams's above."* `--z-dialog` is 2100, so
  **both** paint below a dialog. The sentence is from the retired `--z-index-*`
  ladder, where the numbers were different. The disagreement is real; the
  consequence written down is not.
- **bananagrams' `1000` is numerically `--z-board`**, so it is the wrong rung by
  name as well as by accident — and if the board is ever sealed at 1000, the
  ghost wins over it on DOM order rather than on rank.

### F-z-index-4 · `three-literals-are-two` · the doc counts a literal that is gone — WORKED

`docs/code-conventions.md` → The z- layers: *"Three values are deliberately still
literals … and scrabble's `ScrabbleBlankPickerBlockingModal` overlay at 50, a
full-screen `position: fixed` modal parked below the panel tier, so an open chat
or menu paints over it."* That file is a `<BlockingModal>` now and carries no
`z-index` at all — what is left in it is the letter grid. The guard's pending
list already has exactly two rows (the two ghosts), so the guard is right and the
doc is stale. Fix the doc's count and drop the blank-picker sentence.

### F-z-index-5 · `numberjump-comment-is-the-old-ladder` · a rule and its comment disagree — WORKED

`CrosswordsNumberJumpBlockingModal.module.css` says the backdrop *"takes the
POPOVER tier rather than the panel one — above board content, below the floating
chat, matching Menu/DefinitionPopover."* The rule reads
`z-index: var(--z-modal-blocking)` — 5000, which is above chat (3100), above the
menu (3200) and above toasts (4000). "Popover tier" is a name from the retired
ladder, and Menu and DefinitionPopover do not match each other either (3200 vs
9000). The same comment's second claim — that converting it to `<BlockingModal>`
*"MOVES its tier"* — is also false: `<BlockingModal>` resolves to
`--z-modal-blocking`, the tier it already has. That removes the stated reason for
leaving the hand-built modal alone; whether to convert it is still crosswords'
own call.

### F-z-index-6 · `cursor-points-at-no-tier` · the grid cursor cites a tier that does not exist — WORKED

`shared/board-cursor/gridCursor.module.css`: *"Above the cell's own contents
(letter + premium label) but below the drag ghost and any overlay — see the
board-layer tier in each game's board CSS."* No game's board CSS documents a
tier. The comment should say what is actually true of the `5`: it is local
layering inside the board, and in scrabble's case the board really does seal it.

## The decision

**Settled 2026-09-18, then CORRECTED the same day — see
[The correction](#the-correction-a-board-is-contained-not-ranked), which is the
part of this file to read if you read only one.** Joel took no view on the
branch — *"i don't have a good opinion here; you've handled the thinking on this
one"* — so Q1 is **`sealed-board`**, Q2 is **yes**, and `--z-board-question` is
**deleted**
(Joel on the deletion, which is the one part he ruled on directly: *"if we don't
need it, we can delete it. if we need it in the future, it'll be easy to add
again"*). The two questions and their reasoning are kept below as the record of
why.

**Q1 · Does the board become a sealed stacking context — `--z-board` gaining a
reader — or does `--z-board` retire alongside `--z-board-question`?**
**ANSWERED: `sealed-board`** — with the seal as `isolation: isolate` and NO
rung, which is the correction below. `--z-board` is deleted along with
`--z-board-question`.

`--z-board-question` retires under every option (F-2). `--z-ghost` survives under
every option: both ghosts are `position: fixed` siblings rendered **outside** the
board root (verified — `bananagrams/components/PlayerBoard.tsx` renders it as a
sibling of the frame, `scrabble/components/BoardCol.tsx` as a sibling of the
board), so they are genuinely page-level and genuinely need a rung. So the whole
area comes down to Q1.

- **`sealed-board`** *(recommended)* — each game's board root gets
  `position: relative; z-index: var(--z-board)`. Sixteen one-line declarations,
  five of which are already stacking contexts by accident and would simply be
  saying so on purpose. The guard's 0–10 allowance stops being a numeric
  coincidence and becomes something the browser enforces, and `--z-ghost` at
  1200 then genuinely means "over the board, under the info column." It is also
  the branch that answers Joel's own reason for the area — making the board sit
  where it is documented as sitting.

  **What sealing would trap: nothing, today.** Tooltips, the definition popover
  and toasts `createPortal` to `document.body`; both hand-built modals
  (scrabble's blank picker, crosswords' number jump) mount outside the board
  root; both ghosts are siblings. The cost is a standing constraint — a future
  board-anchored thing that wants to overhang into the info column would have to
  portal out.

- **`no-board-rung`** — do not seal; delete `--z-board` too; rewrite the board
  paragraph in `base.css` to say what is true: boards layer locally, the gap is
  the contract, `vocabularies.test.ts` is the enforcement. Smallest honest
  change, and it matches how the app already works — but it keeps a
  working-by-gap arrangement that has never been stressed.

**Q2 · Under either, do the ghosts converge on `--z-ghost` now?** **ANSWERED:
yes.** It is the one behavior change in the area — scrabble's ghost moves
100 → 1200, bananagrams' 1000 → 1200 — and it clears both rows off the guard's
pending list. The change is real but invisible: both values stay below
`--z-infocol` (1300) and below `--z-dialog` (2100), so neither ghost crosses a
page-level tier in either direction.

F-4, F-5 and F-6 are prose corrections that ship with the branch. F-5 corrects
the comment only — converting crosswords' number-jump modal to `<BlockingModal>`
is a tier question for that game, and goes to `src/crosswords/todo.md` for the
`crosswords` area.

## The correction: a board is contained, not ranked

**Ruled 2026-09-18, after the work was first written, when Joel said the system
had become harder to understand rather than easier** (*"i feel like i understand
our layer/stacking strategy and implementation less now than before we designed
a system for it"*). He was right, and the diagnosis is the durable part:

**The ladder was mixing two unlike things.** Some of it is things that LEAVE THE
FLOW — chat, toasts, the menu, the modals, tooltips, the mobile info sheet.
Those land in one shared contest, genuinely compete, and a rung is exactly the
right instrument. The rest was things that merely SIT IN THE LAYOUT — the board
and the info column, two flex siblings side by side that do not overlap and have
never competed. Numbering both on one list makes every question about the second
kind unanswerable, because the vocabulary was built for the first.

**What that made wrong, concretely.** The board needed CONTAINMENT — nothing
inside it should reach chat — and the first pass delivered containment plus a
rank, because `--z-board` was there and giving it a reader felt like the point.
The rank is what broke: it put the board at 1000 above an info column sitting at
`auto`, which INVERTS what the ladder itself claims (1300 over 1000), and that
inversion was then "checked" with an 18px geometry measurement instead of being
recognized. The follow-on suggestion — give `.infoCol` a z-index too — was the
same error twice: adding a number to something that does not compete, to settle
a conflict the first number had just manufactured.

**So the board is sealed with `isolation: isolate` and takes no rung**, and
`--z-board` is deleted alongside `--z-board-question`. The board keeps its
natural place in the flow: the info column still paints over it where they
touch, the RankBar tooltip no longer depends on a gap, and the drag ghost (1200)
and the mobile sheet (1300) are above the board exactly as they were before
anything was sealed. The ladder now holds only what leaves the flow — and
`--z-infocol` keeps its 1300 honestly, earned by the mobile sheet rather than by
the desktop column.

**The test to apply to any future rung: does this thing leave the flow?** If it
does not, it is not on the ladder, however important it looks.

## What the work did

**One class carries the whole decision.** `.boardSeal` in
`common/game-page/playArea.module.css` is `isolation: isolate`, and every game
composes it onto its board's root element — `cls(shared.boardSeal,
styles.board)`. Sixteen games, sixteen roots, and the comment on the class is
the one place the reasoning lives.

**Which element got it.** Each game puts its board component directly inside
`shared.boardCol`, so the seal goes on that component's own root: `styles.board`
in eleven games, `styles.canvas` (stackdown), `styles.grid` (boggle, whose
rotate button is inside it), and `styles.boardFrame` (bananagrams — the arena
PLUS its floating zoom controls at `z-index: 10`; sealing the scroll area inside
it would have dropped the controls behind the board). Five files needed the
shared import added.

**Both ghosts read `--z-ghost`** — bananagrams 1000 → the token, scrabble
100 → the token — and `dragGhost.module.css` now says why they render outside
the board root rather than calling the split unintended.

**`--z-board` and `--z-board-question` are both gone** from `base.css` and from
`DECLARED_AHEAD`, which lost all three of its z- entries: `--z-ghost` gained two
readers, the other two were deleted.

**The prose that described the old state.** `base.css`'s ladder header now says
what belongs on the ladder (things that leave the flow), what does not (the
board and the desktop info column), and that a board is sealed rather than
ranked; `docs/code-conventions.md`
lost its "three values are deliberately still literals" paragraph (the guard's
pending list is now empty, and the rule is that it stays empty);
`vocabularies.test.ts`'s 0–10 comment says the boards are why the rule can be
repo-wide; `gridCursor.module.css` stopped citing a "board-layer tier" that never
existed; and the number-jump modal's comment stopped claiming a popover tier and
a conversion that moves it.

**What was checked and left alone.** Nothing needs to escape a sealed board:
tooltips, the definition popover and the toasts portal to `document.body`; both
games' hand-built modals mount at `PlayArea`/`BoardCol` level; all three AI/note
companions mount at `.layout`; both ghosts are siblings of the board. Two tight
clearances were measured from the stylesheets while the board still carried a
rank — scrabble's `.rackShuffle` and the desktop RankBar tooltip. **Both are moot
now**: with the board sealed and unranked, neither element is under it, and the
clearances that mattered while it sat at 1000 protect nothing that is at risk.
They are recorded only because needing them at all was the signal that the rank
was wrong.

## Notes

**A stacking context is not a containing block**, and that is what rules out
three of the four ways to make one. `transform`, `filter`, `will-change` and
`contain: layout/paint` seal, but they also make the element a containing block
for fixed descendants — which would re-anchor a drag ghost to the board.
`isolation: isolate` and `position: relative` + a `z-index` both seal and change
no anchor. (Asked by Joel, 2026-09-18; the first answer here grouped `isolation`
with the containing-block family, which is wrong — its only other effect is on
`mix-blend-mode`, which `src/` never uses.)

**Browser support is not a question here.** Stacking contexts are CSS 2.1. The
only thing that varies is which properties *create* one, and the newest trigger
the repo relies on is `container-type` (Chrome 105 / Safari 16 / Firefox 110),
which the shared `.tile` and five board roots already require for `cqi` sizing.
There is no browserslist and no Vite `target` in the project.

**Where the numbers came from.** This audit supersedes the one recorded in
`turn-log` F-12 and quoted in plan §3 row 41 ("38 declarations, six on a rung,
thirty legitimate locals"). Re-counted 2026-09-18: thirty-nine declarations,
nine reading a token, thirty literals. The difference is the count, not the
conclusion.

## What is still held by the gap, and not by containment

Two sets of local numbers sit OUTSIDE any board, so the seal does not reach them.
Both are correct today and both are correct for the old reason — they are small,
not contained. Named here because each is a real question and neither was this
area's to answer.

**The history banner's `5`** (`common/event-log/historyViewer.module.css`). The
banner is `position: absolute; inset: 0` over the below-board region, rendered as
the FIRST child of its host, so it cannot rely on paint order and needs the
number. What it is beating today is nearly nothing — of everything it covers
(the feedback slot, `EntryRow`, `GuessKeyboard`, `MoveRow`, `WordEntry`) only
scrabble's `.rackShuffle` writes a z-index at all, at `3`. So the margin is two,
in one game.

Joel's worry, 2026-09-18, and it is the right one: *"if we started needing to
stack things for wordentry, we might end up with something at zindex 10, and it
would appear over the history banner."* **A bigger number does not fix it.** The
guard caps a bare literal at 10, so the banner could only move to 6–10 — and at
10 it ties the largest local in the app while spending the whole shared range on
one element. Worse, it would not close the hole: layering added inside the
word-entry would sit on a DESCENDANT of a sibling, competing in the same stacking
context whatever number the banner holds. The next person picks 11.

The lever that works is the one the boards used: **seal what the banner covers**,
so nothing inside it can out-stack the banner however big a number is written.
Two shapes, and the second is the recommendation — (a) `seal-the-covered-box`,
one wrapper per game inside the below-board region, airtight and a ten-game
refactor; (b) `a-component-that-layers-seals-itself`, a rule rather than a
wrapper — a below-board component that needs internal layering becomes its own
stacking context — which costs nothing today and applies exactly where the risk
appears. Either way the invariant should be written at `.historyBanner`, where
the `5` currently sits with no statement of what it is beating.

**The RankBar's `0` / `1` / `2`** (`shared/rank-ladder/RankBar.module.css`).
Asked and answered 2026-09-18: **do not seal this one.** A board could be sealed
because nothing inside it needs to escape; the RankBar fails that test at its one
interesting element. `.tooltip` exists to leave the bar's box, and below the
`--mobile` breakpoint it flips to `top: calc(100% + 8px)` and hangs DOWN over the
Score/Words figures — which are `<Stats>`, later in the DOM in both mounts
(`InfoCol` and the mobile status bar) and carrying no z-index. The bubble covers
them today only because its `2` beats Stats' `auto`. Seal the bar and Stats,
painting later, would go over the bubble. The other two numbers have nowhere to
go: a rule behind the squares and the squares on top of it, inside a 14px row.

If that `2` should be honest rather than merely small, the thing to make explicit
is the **tooltip**, not the bar — a satellite in `base.css`'s sense, attaching to
a layer rather than occupying one, the way a `<FilterSelect>` dropdown reads
`--z-host`.

## Predicted test breaks

*(named when the area starts changing things)*

- `src/guards/cssTokens.test.ts` — `DECLARED_AHEAD` fails from both sides, so
  every retired or newly-read `--z-*` token must come off that list in the same
  change.
- `src/guards/vocabularies.test.ts` — the z-index `pending` rows for
  `bananagrams/components/PlayerBoard.module.css` (`1000`) and
  `scrabble/components/BoardCol.module.css` (`100`) must be deleted when the
  ghosts convert; the list's shrink arms fail if they are left behind.
- `e2e/board-geometry.e2e.ts` if any board root's declaration changes its
  box — it should not, but the baseline is gitignored and fails loudly.

## Closing

- [x] Q1 answered, and Q2 with it — 2026-09-18, `sealed-board` + the ghosts
- [x] the whole area re-read in one sitting after the last group — 2026-09-18,
      and it found five stale claims, every one of them the correction failing to
      reach a paragraph the first pass had already written:
      `base.css`'s "a thousand — a different world — **the play surface**" (the
      play surface is no longer on the ladder at all) and its "under the info
      column beside it" (side-by-side things are not under each other);
      `docs/code-conventions.md` still carrying "a board's **rank** against chat"
      where the guard's own copy had been corrected hours earlier, and a
      board-vs-column sentence pointing at a table row that had been deleted; and
      — twice, in the doc and in `.infoCol` itself — the stacking-context /
      containing-block conflation that this area exists to have untangled, which
      is the same error in the same week from the same hand
- [x] `base.css` → THE Z- LAYERS and `docs/code-conventions.md` → The z- layers
      describe the app that exists
- [x] **DELETES: `--z-board-question` out of `base.css` and out of
      `DECLARED_AHEAD`** — the one removal in the area, ruled 2026-09-18
- [x] `shared/grid-and-drag/todo.md` line removed (the ghosts agree now)
- [x] F-5's conversion question handed to `src/crosswords/todo.md`
- [x] no roster, no stamps — this area blesses nothing
