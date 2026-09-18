# Area: terminal

The folders it reads: `terminal`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-18** (Joel: *"close the area and commit"*, after the
re-read's report named the four blessed files it had changed). Seven files
`cs-blessed-terminal` (Joel: *"bless the files in this area"*, 2026-09-18) and
**all twenty-two findings worked**: ten prose in one pass, F-11 to F-14 one at
a time, every one answered as (a), then the re-read's eight with Joel's three
rulings. Roster agreed and stamped 2026-09-18 (Joel: *"list is good"*); taken
out of order after `word-entry`, so §3's next in sequence is row 42,
`word-list`.

**This file said CLOSED for one commit, and it was wrong.** Joel asked for the
blessing and nothing else; Claude inferred the close from it and from
`word-entry`'s wording the same day. Joel: *"why is terminal closed? did i tell
you to close it?"*, then *"re-open the area; that was ENTIRELY WRONG."* A
blessing is Joel's reading of the files; a close is a separate word he says.

**The whole-area re-read was done 2026-09-18, in one sitting, after Joel's own
edits** (`91e67ce8` "Tweaking celebration modal", `64bf03bd` "Tweak comments").
Eight more findings, F-15 to F-22: six prose and two decisions, all worked. Four
of the six were written by this area's own day — the doc.md tree drew the title
Joel had already changed, a test counted callers the way F-7 had just stopped
ui.md doing, ui.md kept two phrases F-2 had removed from the docstring, and the
hook's usage example matched no caller. Two of the worked findings changed
blessed files after the blessing (`useCelebration.ts`, the modal's test); the
stamps stand and the diff is for Joel to read.

**Nothing is open.** F-22 was ruled remove (*"remove both, since they're not
used"*): `title` is required, `primary` is gone.

**Ruled at the re-read:** the title is an **`h2` at `1.5rem`** — Joel:
*"changing the celebrationmodal to an h1 is annoying to your guard and doc
system. change it back to an h2, but keep it the current size"*, then *"i like
the celebrationmodal as it is, with the 1.5rem literal. do whatever you need so
you'll stop complaining about it."* So F-12 ends as its option (b) after all:
`.title { font-size: 1.5rem }` is back, uncommented (Joel: a comment explaining why a title was resized is junk),
the file's row in `vocabularies.test.ts` excuses the literal again, `docs/ui.md`
→ The heading levels names it as the one heading not taking its level's size,
and `base.css`'s *"the game play surface has no h1"* is true again. F-21 was
ruled keep (*"don't change it"*); the comment says what is there.

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

## The state, simply — AS FOUND

Three exports, and a game's end is made of them: a hook that says WHEN, a
modal that is the moment, and a verb for a compete strip's cell.

```
<PlayArea>                      fourteen of sixteen games — every one but setgame and wordiply
├── useCelebration(won)         the flip the game can read correctly on its FIRST render
└── {show && <CelebrationBlockingModal title body onClose={close} />}
      └── <BlockingModal>       floating-panels/ — family `modal-blocking`: dark scrim, immovable, a card at every size
            └── <FloatingPanel>
                  ├── <div .content role="dialog" aria-label={title}>   the handle four e2e specs and two PlayArea tests query
                  │     ├── .confetti     six glyphs: `pieceIn` once, then `pieceJump` forever
                  │     ├── <h2 .title>   1.5rem — the h1 size, not the h2 one (F-12)
                  │     └── <p .subline>
                  └── actions slot: [<StandardButton primary>] <StandardButton "Nice!">

<OpponentStrip metricFor>       info-sheet/ — seven compete info columns print `terminalOutcomeVerb(member)` in the cell
```

What each game hands the hook, as found (the gate is the caller's; the hook
only watches for the flip):

| game | `won` expression | reads |
|---|---|---|
| codenamesduet · connections · crosswords · psychicnum · spellingbee · stackdown · waffle · wordle · wordwheel | `playState === 'won'` | the games row |
| boggle | `status.mode === 'coop' && status.outcome === 'target'` | the games row |
| bananagrams | `isTerminal && selfWon` (`status.winner_username` is me) | the games row |
| scrabble | `won_compete && status.winner_user_id === me` | the games row |
| strands | `won`, or `won_compete` and my roster row's `result.won` | row + roster |
| letterboxed | `won`, or `won_compete` and (`status.winner_id === me` or my `status.leaderboard` row's `won`) | the games row |
| setgame · wordiply | — | no celebration |

Every gate reads only what `GamePageLoader` awaited before the PlayArea
mounted, which is the hook's rule 1 holding at all fourteen sites.
`terminalMessage.ts` (evidence) was checked against its claims: `FeedbackMessage.terminalVerdict(over)` exists,
`InfoActionsRow` takes `over.infoColText` + `over.outcome`, and
`TerminalOutcome` is one of the subsets `docs/outcomes.md` lists as surviving.
The folder's tests are green (4 files, 16 tests); `tsc -b` is clean.

## Findings

*(`F-terminal-1 · slug · title`, one heading each, with its status after it when
it has one; no status means OPEN. F-1 to F-10 are the prose pass; F-11 to F-14
were the decisions; F-15 to F-22 are the closing re-read.)*

### F-terminal-1 · `props-take-double-slash` · Five props wear `/**` — WORKED

`CelebrationBlockingModal`'s `Props` marks every member — `title`, `body`,
`onClose`, `primary`, `playSound` — with `/**`. §4 → The docstring marker: a
props block is one declaration, a note on one prop is `//`, and the docstring
that answers *how do I call this* is the component's own. `onClose`'s note also
restates the shell's scrim rule ("the backdrop is deliberately NOT
click-to-close") — that is `BlockingModal`'s decision ("see-and-acknowledge"),
so one clause and a pointer.

### F-terminal-2 · `docstring-archaeology-and-a-plan-cite` · The component's docstring narrates its history and cites §20 — WORKED

Three paragraphs of the docstring are not for a caller:

- *"Ported from crossplay's `SolvedDialog`"* — archaeology.
- *"A `modal-blocking` on the shared `<BlockingModal>` since 2026-08-25. It was
  hand-rolled — its own scrim, its own card, its own Escape handler — and §20
  warned against unifying it because `FloatingPanel` became a full-screen sheet
  on a phone…"* — a durable file citing the plan (§4 → Durable files never
  cite), and a change-narration. The one durable fact in it — a card family
  stays a card at every size, which is why a celebration can ride the shared
  shell — is the sentence to keep.
- *"Which win counts is per-game: the COOP solve in most, the COMPETE win in
  scrabble and bananagrams (whose coop has no win at all)"* — a census, and a
  wrong one: strands and letterboxed celebrate both, boggle gates on its coop
  `target` outcome, setgame and wordiply never (the table above). The
  condition, not the list: a game hands the hook whichever flip it can read
  correctly on its first render.
- *"the ONLY modal a terminal game pops"* — say it as the rule (a terminal
  game pops nothing else; the verdict is in-page), not as a count.

The body's `usePanelEscape` comment ("No Escape handler of its own — … owns
the key for every floating panel now") is right and stays; "now" goes.
The JSX comment on the title ("not something a structural move should quietly
settle") narrates the move; the reason the h2 is rendered here rather than
passed to the shell — the confetti has to come above it — is the keep.

### F-terminal-3 · `stylesheet-narrates-what-left` · The stylesheet's comments are mostly about rules that are gone — WORKED

`CelebrationBlockingModal.module.css`, top to bottom:

- The header: *"which is why the `.backdrop` and `.card` rules that used to
  open this file are gone"*, and the ⚠️ *"ONE THING WAS LOST in that move"*
  paragraph. The durable half — the card has no entrance of its own and cannot
  ride the content (`transform` changes no layout height, and `fitContent`
  would size the shell to the finished content while it inflated inside); the
  confetti's entrance is the celebration — stays as a statement of what IS.
- A misattached comment: *"Confetti row above the title. Each emoji bounces
  in…"* sits above `.content`, stacked on top of `.content`'s own headroom
  note; it describes `.confetti`, two rules down.
- `.title`'s ⚠️ block: *"a leftover from when h2's browser default was also
  1.5rem"* (archaeology) and *"Settle it at the first game's audit (todo.md)"*
  — a handoff to the wrong place; the todo item names this area. The question
  itself is F-12.
- The two trailing paragraphs — *"`.actions` is gone: … (Joel, 2026-08-25)"*
  and *"THE CELEBRATION'S BUTTONS ARE JUST BUTTONS. This module used to give
  them roomier padding … flagged here since 2026-08-21"* — are change-narration
  with attributions, on rules that no longer exist. What survives is one line:
  the buttons are `<StandardButton>`s and this file styles none of them.

### F-terminal-4 · `test-headers` · The two test docstrings describe a component that no longer exists, and count wrong — WORKED

- `CelebrationBlockingModal.test.tsx`: *"mostly presentational + an Esc
  handler"* — it has no Escape handler of its own (the shell's registry
  answers the key; the test rightly still presses it). *"default/overridden
  copy renders"* and `it('renders default copy')` — `copy` is banned for a
  message's words (docs/naming.md); it is TEXT. *"the contract a future
  consumer relies on"* — fourteen consumers exist.
- `useCelebration.test.ts`: *"Both halves of its contract are load-bearing"*
  and then four numbered items. *"waffle's coop win is the first consumer"* —
  "the first" is a claim that rots, and archaeology besides.

### F-terminal-5 · `verb-docstring` · `terminalOutcomeVerb.ts` has two docstrings, a dead path, a wrong example, and the third copy of one rationale — WORKED

- Two `/**` blocks, file-level and function-level, both opening with
  "reach for this"; one function, one docstring.
- *"the seven words in `lib/outcomes.ts`"* — the file is
  `common/outcomes/outcomes.ts`; there has been no `lib/` since the 2026-09-04
  restructure. The count (seven) is right.
- *"`${terminalOutcomeVerb(p)} · ${value}` (scrabble)"* — scrabble's InfoCol
  prints `${score} (${verb.toLowerCase()})`: score first, verb last, and
  lowercased. The example is wrong, and the lowercasing is F-14.
- *"Kept OUT of `member.ts` deliberately. That file is types-only…"* — the
  same rationale is written in `member.ts`'s docstring (which owns it: "Types
  only, and that is load-bearing … The one VALUE that reads these types was
  put in `common/terminal/terminalOutcomeVerb.ts` precisely so it stays out")
  and again in `memberList.ts`. One home per decision: here, one clause and a
  pointer at `member.ts`.
- *"the word the OpponentStrip prints"* — true of six of the seven callers;
  scrabble prints it in its own score cell inside the strip's `metricFor`, so
  the sentence holds if it says the compete strip's cell.

### F-terminal-6 · `hook-docstring-carries-the-body` · `useCelebration`'s docstring explains why the body is written the way it is — WORKED

*"Effect-free previous-render pattern: state is adjusted DURING render behind
a transition guard — React's endorsed 'storing information from previous
renders' shape."* is a note about the implementation and belongs on the `if`
it defends, as `//` — exactly where `useTurnStartFlash` (its named twin) puts
the same sentence. The three rules and the load-bearing paragraph about rule 1
are for the caller and stay.

### F-terminal-7 · `ui-md-census` · `docs/ui.md → Terminal results` counts the celebrating games, and counts wrong — WORKED

*"Fifteen of sixteen games celebrate; wordiply has no win state to
celebrate"* — fourteen do; setgame has no celebration either. *"Scrabble and
bananagrams celebrate the compete win instead … letterboxed celebrates
both"* — strands celebrates both too, and boggle gates on its coop `target`
outcome rather than `playState`. A census in a doc rots exactly this way; the
paragraph keeps the RULE (gate only on what is right on the first render; the
compete games that celebrate are the ones whose row or roster names the
winner) and drops the roll call. Same pass: `docs/deferred.md`'s *"`useCelebration`
is tone-agnostic"* — the hook knows nothing about the outcome; "tone" is the
chrome word (docs/outcomes.md), not an outcome's.

### F-terminal-8 · `todo-item-already-done` · `todo.md`'s second item describes a rule that left the stylesheet 2026-08-25 — WORKED

*"`CelebrationBlockingModal`'s `.button:focus-visible` re-declares the shared
ring."* — there is no `.button` rule in the file. `git grep` at `66a8791d`
(2026-08-18) finds the ring; at `a8a8587e` (2026-08-25, "the action button
becomes the standard button") it is gone. The item was written into `todo.md`
2026-09-04 (`303d5233`, the restart's harvest), ten days after the rule it
names had left — and this file's own Notes repeated it unverified at the
opening. A shipped todo is deleted; the stylesheet's paragraph about it is
F-3's.

### F-terminal-9 · `info-sheet-todo-stale-pointer` · `info-sheet/todo.md` says "Same question in `terminal`" — WORKED

Its `TurnStatusLine` item asks whether a folder should import another folder's
readout stylesheet and ends *"Same question in `terminal` and `word-entry`."*
It was true while `InfoActionsRow` lived here and read
`game-page/playArea.module.css`; that row moved to `info-sheet/` at
`game-page`'s close (2026-09-15), and nothing in `terminal/` imports any
stylesheet but its own. The three words come out. (`word-entry` answered its
half as F-word-entry-8.)

### F-terminal-10 · `doc-md` · `doc.md` is three sentences about `terminalMessage` and names neither the hook nor the verb — WORKED

The lede describes the one file that is NOT on this roster and says nothing of
`useCelebration`, `CelebrationBlockingModal` or `terminalOutcomeVerb`. Owed:
a lede that says what the folder is (a game's end — when to celebrate, the
celebration, and the words), the `## Intro to area` (the moment vs the
record; why the moment is the one modal; why the hook watches a flip and never
fires on mount; why the verb lives here and not beside `Member`), and a
`## Details` carrying the render tree above. `common/terminal` then comes off
`INTROS_OWED`.

### F-terminal-11 · `which-family` · The celebration is a `modal-blocking` in code and a `modal-normal` in three durable sentences — WORKED as (a)

In code it renders `<BlockingModal>` with the default family — `modal-blocking`:
dark scrim, immovable, a card on a phone — since `d7a0952a` (2026-08-25, "the
celebration joins the shell"), whose message chose that on purpose. Three
sentences say otherwise:

- `docs/ui.md` → the families table, `modal-normal`: *"a question worth
  thinking or talking about: setup, edit profile, the celebration"* — light
  dim, movable, a full-screen sheet on a phone.
- `docs/ui.md` → *"Two panels stay off the shell on purpose. The
  `<CelebrationBlockingModal>` is a hand-rolled fixed scrim with a small card
  and no media query…"* — false since 2026-08-25; harvested into ui.md
  2026-09-04 (`303d5233`) from the plan's §20, ten days after it stopped being
  true. Its own reason — Joel wants *"a small card over a dimmed board at every
  size, phone included"* — is what `modal-blocking` delivers and `modal-normal`
  would not.
- `floating-panels/BlockingModal.tsx`'s docstring: *"NOT for a modal you can
  move: that is a `modal-normal` (setup, edit profile, the celebration)"* —
  written 2026-08-24 (`004682d3`), true for one day, blessed 2026-09-11 with
  the claim still in it. That folder's `doc.md` render tree has it right
  (`BlockingModal … CelebrationBlockingModal (terminal)`).

**Decision: which family IS the celebration?**

- **(a) `modal-blocking`, as built** — a win is "deal with it now, then it's
  gone"; immovability is the signal; a card stays a card on a phone with the
  board behind it. Fix the three sentences (two in ui.md, one in a blessed
  file — closed is not locked). Recommended.
- **(b) `modal-normal`, as documented** — it gains a titlebar, a ✕, a drag, a
  light dim, and becomes a full-page sheet on a phone. Rename to
  `CelebrationModal` (the grammar marks blocking and fault, not normal), and
  the "small card at every size" sentence is deleted as a decision reversed.
  Note the cost is not a prop: `BlockingModal`'s `family` is
  `Extract<PanelFamily, 'modal-blocking' | 'modal-fault'>`, narrowed on purpose
  ("a movable blocking modal is the one thing the category cannot be"), so (b)
  means leaving that shell for `<FloatingPanel>` and rebuilding the footer row.

**Joel: *"f11: the code is right, so a."*** The three sentences were fixed, and
working them turned up that the ui.md paragraph had rotted in BOTH halves:

- the families table moves the celebration from the `modal-normal` row to
  `modal-blocking`, where the row now says what a celebration has in common
  with a confirm — deal with it now and it is gone — rather than implying the
  family is only for questions;
- *"Two panels stay off the shell on purpose"* named scrabble's blank picker as
  the second, and that stopped being true on 2026-09-10, when it became a
  `<BlockingModal>` (its own docstring says so). The one panel still
  hand-rolled is crosswords' `CrosswordsNumberJumpBlockingModal`, which the
  paragraph now names, as a todo rather than a decision — the same thing
  `src/crosswords/todo.md` already holds. Nothing durable was lost with the
  deleted sentences: the card-at-every-size decision is carried by the family
  table's own "cards, not windows" paragraph and by the component's docstring;
- `BlockingModal.tsx`'s docstring drops the celebration from its
  `modal-normal` list (blessed file, prose only).

### F-terminal-12 · `h2-at-h1-size` · The title is an `<h2>` drawn at `1.5rem`, which is h1's size — WORKED as (a)

`todo.md`'s first item. `base.css` gives h2 `1.25rem` so the four levels
descend; `.title` overrides to `1.5rem`, h1's size. `docs/ui.md` → The heading
levels lists `CelebrationBlockingModal` as its EXAMPLE of an h2 at `1.25rem`
— the one h2 in the app that is not. `BlockingModal`'s own `.title` takes the
element's size and states only spacing.

**Decision:**

- **(a) drop the override** — the title takes h2's `1.25rem`, like every
  other card's heading; the loudness is the 2.4rem confetti above it. The
  rule "the level is the decision — a heading takes no class to be the right
  size" holds with no exception. Recommended.
- **(b) keep `1.5rem` and say why** — the celebration's title is the loudest
  thing on screen at that moment; the comment says so and the ui.md table
  stops naming it as its example.

**Joel: *"a"* — and then, at the blessing and the re-read, the other way: see
the status paragraph. The title is an h2 at `1.5rem`, option (b), with the
comment and the guard row (b) described.** What (a) did while it stood: the
`font-size` line went, so the title took h2's `1.25rem` and the comment stated
what WAS — the size comes from the element, and
what is loud at that moment is the confetti above it. Two consequences worth
recording: `todo.md`'s remaining item was this question, so the file is now
empty in all four sections; and `vocabularies.test.ts` failed until its pending
row for this file dropped `1.5rem`, which is the guard working as designed — a
literal excused on that list has to be deleted from the row the moment it stops
being written. The second citation the audit had not named: `base.css`'s own
heading-block comment gives this component as its h2 example too, alongside
`docs/ui.md` — both are true again rather than one of them being fixed.

### F-terminal-13 · `defaults-are-decisions` · `title` defaults to a string every caller replaces, and `body` to a sentence that is false for scrabble — WORKED as (a)

`title = 'Congratulations!'` — all fourteen callers pass a title; the default
is dead. `body = 'You solved the puzzle.'` — four callers pass none: waffle,
wordle and letterboxed are puzzles, and **scrabble** is not — its compete win
reads "You win! 🎉" over "You solved the puzzle." A default is a decision, and
this one is wrong at one of its four sites.

**Decision:**

- **(a) no default body; the sub-line renders only when given** — the `<p>`
  is omitted, the card fits its content, scrabble's lie is gone with no edit
  in scrabble. `title` stays optional or becomes required (nothing depends on
  the default). Recommended.
- **(b) keep the default; scrabble passes a body** — a line for scrabble's
  area to write when it opens (its `todo.md`).
- **(c) a default true of every win** — "You won." under "You win! 🎉" says
  it twice.

**Joel: *"a"*.** `body` has no default and the `<p>` renders only when a game
gives one, so the four callers that pass none — waffle, wordle, letterboxed,
scrabble — show confetti + title + buttons. Scrabble's "You solved the puzzle."
is gone with no edit in scrabble; the other three lost a line that repeated
their own title. The spacing did not move: `.subline`'s bottom margin collapses
with `modalActions`'s `margin-top: var(--spacer-1)`, the larger of the two, so
the gap above the buttons is the same 1.5rem with the sub-line or without it.
No game doc quoted the removed sentence.

**The `title` rider is NOT settled and nothing was done to it.** All fourteen
callers pass a title, so its `'Congratulations!'` default is dead; whether the
prop becomes required was raised alongside (a) and Joel answered the body
question only.

### F-terminal-14 · `scrabble-lowercases-the-verb` · The verb's docstring says the capitalized word is the only form; scrabble's strip prints it lowercased — WORKED as (a)

`terminalOutcomeVerb.ts`: *"The capitalized word is the only form … the
strip's word is computed once, here."* `scrabble/components/InfoCol.tsx`'s
`metricFor` returns `${score} (${outcomeOf(player).toLowerCase()})` — "40
(won)". A second form, made at a call site. Not a bug on screen; a claim the
tree does not bear out, and the docstring's own scrabble example (F-5) is
wrong about it.

**Decision:**

- **(a) leave scrabble's cell as it is; the docstring stops claiming one
  form** — "the capitalized word is the form this returns" is what is true.
  Scrabble's `(won)` in parentheses after a score reads fine lowercased.
- **(b) scrabble prints the verb as returned** — `Won · 40` like its
  siblings; a two-line edit in scrabble now, or a line in scrabble's `todo.md`
  for its area. Recommended as the `todo.md` line: the strip's format is
  scrabble's to decide with its files open.

**Joel: *"a"* — and the audit's recommendation was the wrong one.** Reading
scrabble's call site before presenting changed the answer: its format is not a
slip but an argued decision, and its comment names the defect it fixes —
`OpponentStrip` separates PLAYERS with `·` (`{i > 0 && <span
className={styles.sep}>·</span>}`), so "Lost · 260" made "You: Lost · 260 · AI
1: 333" run three separators doing two jobs. Score first, verb as a
parenthetical annotation, lowercased because that is how an annotation after a
number reads. (b) would have walked that back.

So the docstring changed and no game did. It now says the capitalized word is
the form it RETURNS, keeps the load-bearing half — there is no lowercase
`'won' | 'quit' | 'lost'` intermediate, because that would look like the
outcome vocabulary and is not it — and ends "a cell that wants another case
makes it at the site". Its example lost the ` · ` shape, which the prose pass
had written in from setgame and wordiply, in favor of ` at ` plus scrabble's
annotation, and it now warns about the separator collision outright.

**Left for those two games, deliberately:** setgame (`Won · 12`) and wordiply
(`Won · 40%`) join with the mark the strip uses between players — the exact
collision scrabble's comment describes. Changing a screen from here is not this
area's call; their own areas have the files open.

### F-terminal-15 · `doc-tree-draws-an-h2` · `doc.md`'s render tree still drew the title as an `<h2>` — WORKED

Written at F-10, before Joel's edit made the heading an `<h1>`; the tree in
`## Details` was never followed. One character.

### F-terminal-16 · `hook-usage-is-invented` · `useCelebration`'s usage example matched no caller, and named the wrong awaiter — WORKED

`useCelebration(mode === 'coop' && playState === 'won')` — nine games write
`playState === 'won'` bare, since `won` is coop-only by the states vocabulary,
and none writes the mode check; `{show && <CelebrationBlockingModal
onClose={close} />}` passes no title, which every one of the fourteen does. It
is now waffle's two lines, verbatim. Same paragraph: *"all of which GamePage
awaits before rendering a PlayArea"* — the awaiting has been `GamePageLoader`'s
since `game-page` split the route (2026-09-15); `doc.md` had the right name and
the hook did not. `docs/ui.md` → Terminal results carried the same `<GamePage>`
claim one paragraph after the one F-17 fixes; both say `GamePageLoader` now.

### F-terminal-17 · `ui-md-keeps-what-f2-removed` · `docs/ui.md` → Terminal results kept the two phrases F-2 took out of the docstring — WORKED

*"ported from crossplay"* (archaeology) and *"**the only modal a terminal game
pops**"* (a count, and F-2's exact words) stood in the doc's paragraph on the
component after the docstring lost them. The paragraph now says it as the rule
the docstring does: it pops for a win and for nothing else, and a terminal game
pops no other modal, its verdict being in-page.

### F-terminal-18 · `nice-is-full-width` · `docs/ui.md` → Dialog buttons gave "Nice!" as its example of a right-justified lone button — WORKED

Joel's edit gave "Nice!" `fullWidth` (`width: 100%` on the `StandardButton`),
so it fills the action row rather than sitting at its right; every real
celebration is single-button, none passing `primary`. The re-read first
rewrote the sentence to name the celebration as the exception; Joel struck it
instead: *"the 'rule' that a dialog with a single button right-justifies it
shouldn't be considered a rule. there are times i may make the buttons
full-width; we need no rule to explain this."* The sentence is gone.

### F-terminal-19 · `test-counts-the-callers` · The test written at F-13 counts games, and one test name keeps a default that F-13 removed — WORKED

*"Four games take this shape."* — a census, written the same day F-7 stopped
`docs/ui.md` counting celebrating games; it now names the condition (a game
whose title says it all passes no body). `it('renders overridden title/body')`
— there is no default body to override; it is *renders the title and body it is
given*.

### F-terminal-20 · `psychicnum-todo-points-at-settled-items` · `src/psychicnum/todo.md` said its area would answer the two `CelebrationBlockingModal` items in this folder's `todo.md` — WORKED

*"Being first, it also answers what was punted to 'the first game area': the
two `CelebrationBlockingModal` items in `src/common/terminal/todo.md` (its title
at h1's size, its re-declared focus ring)."* Both were settled here — the size
by F-12 and then Joel's `<h1>`, the ring by F-8 (gone since 2026-08-25) — and
this folder's `todo.md` is empty. The sentence came out; the bullet's first
sentence (the control game for the audit) stands.

### F-terminal-21 · `headroom-comment-after-the-margin` · `.content`'s half-rem of padding is explained by a number that is no longer true — WORKED as (b)

The comment on `.content`: *"the card family's 1rem would clip the top of the
arc. This adds half a rem to reach 1.5rem."* Joel's edit put
`margin-top: var(--spacer-2)` (1rem) on `.confetti`, directly under that
padding, so the arc now has 2.5rem of room and the half-rem's stated reason —
reaching 1.5rem — no longer describes what the rule does.

**Decision:**

- **(a) drop the half rem and its comment** — the confetti's own margin is the
  headroom now, and one rule does the job. Half a rem less above the confetti
  than today.
- **(b) keep it; the comment says what IS** — the room above the arc is the
  card's padding plus this half rem plus the confetti's margin. No pixel moves.

**Joel: *"the celebration modal now looks the way want. so don't change it."***
The comment now says the room over the arc is this half rem plus the
confetti's own top margin; the padding is untouched.

### F-terminal-22 · `props-no-game-passes` · `title`'s default and `primary` have no caller — WORKED as (b)

The rider F-13 left open, with a second prop beside it. All fourteen callers
pass a `title`, so `'Congratulations!'` is dead; none passes `primary`, so the
"exactly one primary, never two" JSX and its focus rule are exercised by this
folder's unit test alone. Neither was removed — that is Joel's call, and the
`primary` shape was built for a "Play again" no game has offered.

**Decision:**

- **(a) `title` required, `primary` stays** — the default goes, the type says
  what every caller already does; `primary` keeps its place for the game that
  offers an action from the card.
- **(b) `title` required, `primary` removed** — the component is what the
  fourteen sites use: title, optional body, "Nice!". The test's fourth case
  goes with it.
- **(c) leave both** — nothing is wrong on screen.

**Joel: *"remove both, since they're not used."*** `title` is required and
has no default; `primary` is gone with its focus rule, its JSX comment and the
test's fourth case. `primary` had been the "Play again" half of the 2026-07-08
port's game-agnostic shape ("optional primary action, overridable copy,
toggleable sound"), and no game ever passed it: a game's actions after a win
live in the info column's action row, and the card offers only the way out.
"Nice!" is the lone button and the filled one; its `ref` and `weight` are no
longer conditional.

## Notes

- **Joel's own edits at the blessing** (`91e67ce8`, `64bf03bd`), recorded
  because two of them move what this file says:
  - the title became an **`<h1>`** with its class dropped, taking the element's
    1.5rem, and the `.title` rule left the stylesheet. Both places that gave
    this component as their **h2** example stopped: Joel's call for `base.css`
    (*"base.css doesn't need an example of what an h2 is for; remove that
    comment"* — the whole example column for that one level is gone), and
    `docs/ui.md`'s heading table dropped the name. The re-read raised what that
    left unstated (an h1 on the play surface contradicts base.css and the
    table), and the ruling is in the status paragraph: an h2 at 1.5rem.
  - `.confetti` gained a 1rem margin top and bottom, `.subline` lost its
    1.4rem, and the shared `modalActions` row went `--spacer-1` → `--spacer-2`
    (1.5rem → 1rem above every dialog's buttons, app-wide).
  - "Nice!" takes `fullWidth`.
  - the verb's docstring lost its "the capitalized word is the form this
    returns" paragraph and the `member.ts` pointer; `useCelebration`'s rule 3
    stopped naming waffle.
- **Two conformance fixes those edits needed**, made here so the blessing is
  not on a red tree: `<h1 className={styles.title}>` was a member the module no
  longer defines (`cssClasses` fails on it — it resolves to `undefined` and the
  class silently vanishes), so the className is gone; and `.confetti`'s two
  `1rem` literals became `var(--spacer-2)`, the same value, with this file's
  pending row in `vocabularies.test.ts` trimmed to the one literal it still
  writes. Neither changes a pixel.
- **`role="dialog" aria-label={title}` on the inner `.content` div is the
  test handle.** `FloatingPanel` sets no role, so this is the only dialog role
  in the tree, and `spellingbee-coop-win`, `wordwheel-coop-win`,
  `bananagrams.e2e` and the waffle / wordle `PlayArea.test` all query
  `getByRole('dialog', { name })`. Kept, and the prose pass added a `//`
  saying so.
- **The hook is the `useState` shape, not the ref shape**, so the StrictMode
  render-phase-edge failure does not apply: `setPrevWon` during render is
  React's "storing information from previous renders" pattern, which the
  double render handles. `spellingbee-coop-win.e2e.ts` exercises the flip
  live.
- **`terminalMessage.ts` / `.test.ts` stay `cs-blessed-feedback`** — the
  audit turned up no change they need, so the restamp question does not come
  back to Joel this round.
- **What `todo.md` handed the area** (its first read): two items, both the
  stylesheet — the h2 size (F-12) and the focus ring (F-8, already gone).
- **Three judgment calls in the prose pass**, all of them to avoid answering an
  open finding by accident. (1) The stylesheet's `.title` comment keeps a short
  form of the question — the level and the size disagree, open in `todo.md` —
  because F-12 is still open and deleting the comment would settle it silently;
  the archaeology and the handoff to "the first game's audit" are gone. (2) The
  component docstring says it rides the shared `<BlockingModal>` and why a card
  suits a celebration, but names no family, so F-11 lands in one place. (3) The
  verb docstring's wrong scrabble example became the two SHAPES with no game
  named (`Won at 40`, `Won · 12`), which is true today and survives F-14 either
  way; its "the capitalized word is the only form" sentence is untouched, being
  the claim F-14 decides.
- **`doc.md` was written now rather than at the close**, because F-10 is a prose
  finding. The closing re-read still owns it: four findings are unresolved and
  two of them (the family, the defaults) could change what it should say.
- Dates in this file come from `git log`: the shell move `d7a0952a`
  2026-08-25; the ring's departure between `66a8791d` 2026-08-18 and
  `a8a8587e` 2026-08-25; the ui.md harvest `303d5233` 2026-09-04; the
  BlockingModal docstring `004682d3` 2026-08-24; `floating-panels` blessed
  `096d61a1` 2026-09-11.

## Predicted test breaks

- F-13 (a), and this is what happened: `CelebrationBlockingModal.test.tsx` →
  *renders the default title and body* is now *renders the title alone when no
  body is given*, asserting the `<p>` is absent rather than empty. Nothing else
  in the repo referenced the removed sentence.
- F-12, F-11 (a): none — no unit test measures the title, and every dialog
  query keys on the inner `role="dialog"`, which no option moves.
- F-11 (b): the four e2e specs and two PlayArea tests above still find the
  dialog; `csStamps` would see the rename.

## Closing

- [x] the whole area re-read in one sitting after the last group — 2026-09-18,
      F-15 to F-22; the per-finding sibling greps (`§`, `crossplay`, `copy`,
      `lib/`, `only form`, the censuses, `1.5rem`, `modal-normal`) ran over the
      folder and `docs/`
- [x] the folder's `doc.md` written (lede + `## Intro to area` + `## Details`
      with the render tree); its row is off `INTROS_OWED` — re-read at the close
      (F-15 was in it)
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      — nothing is owed: every re-read item was ruled, and `todo.md` is empty
- [x] every file on the roster blessed, or its stamp says why not — seven
      `cs-blessed-terminal`, on Joel's word; four of them
      (`CelebrationBlockingModal.tsx`, its `.module.css` and `.test.tsx`,
      `useCelebration.ts`) changed at the re-read, after the blessing, and the
      close was asked for with that named
