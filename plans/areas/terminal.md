# Area: terminal

The folders it reads: `terminal`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-18, fourteen findings, ten worked.** Roster
agreed and stamped 2026-09-18 (Joel: *"list is good"*); taken out of order
after `word-entry`, so §3's next in sequence is still row 42, `word-list`.
Seven files `cs-audited-terminal`. **The prose pass (F-1 to F-10) is done**
(2026-09-18, Joel: *"do the prose pass"*); four findings wait for a decision
(F-11 to F-14), and none of them was pre-empted — the `.title` size, the
family, the defaults and scrabble's lowercased verb all still read as they did.

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
wait for a decision.)*

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

### F-terminal-11 · `which-family` · The celebration is a `modal-blocking` in code and a `modal-normal` in three durable sentences

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

### F-terminal-12 · `h2-at-h1-size` · The title is an `<h2>` drawn at `1.5rem`, which is h1's size

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

### F-terminal-13 · `defaults-are-decisions` · `title` defaults to a string every caller replaces, and `body` to a sentence that is false for scrabble

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

### F-terminal-14 · `scrabble-lowercases-the-verb` · The verb's docstring says the capitalized word is the only form; scrabble's strip prints it lowercased

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

## Notes

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

- F-13 (a): `CelebrationBlockingModal.test.tsx` → *renders the default title
  and body* expects "You solved the puzzle."; it becomes a test that no
  sub-line renders without a body. (The name lost the banned word in the prose
  pass, F-4.)
- F-12, F-11 (a): none — no unit test measures the title, and every dialog
  query keys on the inner `role="dialog"`, which no option moves.
- F-11 (b): the four e2e specs and two PlayArea tests above still find the
  dialog; `csStamps` would see the rename.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` written (lede + `## Intro to area` + `## Details`
      with the render tree); its row is off `INTROS_OWED` — re-read at the close,
      since F-11 and F-13 could change what it should say
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
