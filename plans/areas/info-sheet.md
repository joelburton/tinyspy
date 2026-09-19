# Area: info-sheet

The folders it reads: `info-sheet`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-18; the prose pass done the same day (F-1 to
F-6, F-8, F-9, F-10, F-17), then F-11, F-12, F-15 and F-16 ruled and shipped, and
F-7 WITHDRAWN as a false premise — there was no bug. What remains is the two
conversions F-13 and F-14, which `docs/code-conventions.md` and the audit already
settled; nothing needs a decision.** Roster agreed 2026-09-18 (Joel: *"this is the roster. do
the audit"*); fifteen files stamped `cs-audited-info-sheet`. Taken in order after
`reveal` (row 45); this is row 46.

## The roster

`src/common/info-sheet/` — the info column: its mobile sheet, its switch, the
bordered panel its readouts wear, the whose-turn line and the action row.
Fifteen files `cs-audited-info-sheet`, plus the folder's own two docs (not
stamped):

- `InfoSheet.tsx` + `InfoSheet.module.css` — the mobile sheet
- `InfoSwitchButton.tsx` — the header's page switch
- `infoSheetStore.ts` + `useInfoSheet.ts` — which mobile page is showing
- `infoPanel.module.css` — the bordered panel (heading + 2px frame)
- `infoCol.module.css` — the column box and its rows; CREATED by F-11, moved out
  of `game-page/playArea.module.css` 2026-09-18, and on the roster from that day
- `MobileStatusBar.tsx` + `MobileStatusBar.module.css`
- `OpponentStrip.tsx` + `OpponentStrip.module.css`
- `TurnStatusLine.tsx` + `TurnStatusLine.test.tsx` — moved in from `turn-log`
  2026-09-12
- `InfoActionsRow.tsx` + `InfoActionsRow.test.tsx` + `InfoActionsRow.module.css`
  — moved in from `game-page` 2026-09-15
- `doc.md` · `todo.md`

**Evidence, not roster:** `turnText.tsx` + `turnText.test.tsx` are
`cs-blessed-feedback` (`feedback` owns the words; the row says so), the way
`terminal` treated `terminalMessage.ts`. The fourteen game `InfoCol.tsx` files,
eight `BoardCol.tsx` files and `GamePage.tsx` that place these are consumers,
each its own area. `game-page/playArea.module.css` began as evidence — two roster
components took their root class from it — and F-11 then edited it, moving the
column's eight classes out; it is not stamped for this area, since what it keeps
is the shell's. `docs/playarea.md → Info-column
readouts`, `docs/mobile.md → The two mobile pages` / `the info-sheet recipe` /
`The mobile status bar`, `docs/ui.md → Terminal results` and
`docs/common-folders.md`'s folder table are read as evidence and fixed where
they are wrong.

**`todo.md` handed the area four items:** one Bug (the row's
`Exclude<Outcome, 'error'>`, ruled a question 2026-09-15 — F-12), two Soon (a
shared `<InfoCol>`; `TurnStatusLine` wearing `.infoState` from `game-page`'s
sheet, "this folder should argue its own case" — both F-11) and one Someday
(`infoPanel.headerRow` is `.heading-with-controls` by hand — F-16).

## The state, simply — AS FOUND

Seven small things that share a folder because they all sit in, or stand in
for, the info column. Three of them are the MOBILE story: below `--mobile` the
info column becomes a second full-width page (`InfoSheet`, `display: contents`
on desktop), one header button switches between the two pages
(`InfoSwitchButton`, binding `act-toggle-info-sheet`), and the flag lives in a
module store because the sheet is rendered inside each game's PlayArea while
the button is in the shell's header (`infoSheetStore`; `useInfoSheet` is a
game's handle on it and closes the sheet when the viewport crosses up to
desktop). `MobileStatusBar` is the cost of that design paid back: the one line
of live state the column took off-canvas, put above the board, `display: none`
on desktop.

The other four are info-column FURNITURE every game composes: `infoPanel` (the
heading + 2px frame the event log, the word list and bananagrams's hand wear),
`OpponentStrip` (● name: metric, viewer first, the game supplies `metricFor`),
`TurnStatusLine` (Your turn / Waiting for ● name…, inert at terminal) and
`InfoActionsRow` (the game's buttons with an optional outcome-inked line — the
one row for playing, locally-terminal and over).

```
GamePage (shell)                         ── mobile only ──▶ <InfoSwitchButton open>      binds act-toggle-info-sheet → setInfoSheetOpen(!open)
  │  useInfoSheetOpen() · setInfoSheetOpen(false) on mount (per gameId)
  └── <game>/PlayArea
        ├── useInfoSheet() → { isOpen, close }            closes on the mobile→desktop crossing (render-phase)
        ├── BoardCol
        │     └── <MobileStatusBar>{the game's state node}</MobileStatusBar>     eight games; display:none on desktop
        └── <InfoSheet open onClose>                      display:contents on desktop; fixed full-bleed page below --mobile
              └── <game>/InfoCol  (.infoCol → .noShrinkRow → …)   ← classes from game-page/playArea.module.css
                    ├── <p .infoState>                    the game's own readout
                    ├── <TurnStatusLine>                  nine games, gated on currentTurnUserId !== null; root class .infoState (game-page's)
                    ├── <OpponentStrip metricFor metricLabel leading?>     thirteen games
                    ├── <InfoActionsRow message?>{buttons}</InfoActionsRow>   sixteen games; root classes .infoActions/.terminalActions (game-page's)
                    └── EventLog · WordList · HandCard    each wearing infoPanel.heading / .headerRow / .box
useHistoryViewer.showHistory() → setInfoSheetOpen(false)   opening a turn leaves the info page
```

The folder's tests are green (3 files, 10 tests). What the reading THOUGHT it
measured — a 0px-tall terminal turn line — was the audit's own scaffold and not
this folder's code: the character in the source is a literal U+00A0 and the line
is 17px. F-7 is withdrawn and carries the whole story.

## Findings

*(`F-info-sheet-1 · slug · title`, one heading each, with its status after it
when it has one; no status means OPEN. F-1 to F-10 are prose and conformance,
F-11 to F-17 carry a decision or a change. Dates from `git log`: the recipe
extracted `d248e4a1` 2026-07-09; the turn line `574ca929` 2026-07-13; the sheet
made a full-bleed page and the switch button `6d93b8c3` 2026-08-04; the ✕
deleted 2026-08-25; the folder move `c2f9baf2` 2026-09-04; `TurnStatusLine` +
`turnText` moved in `4f664af2` 2026-09-12; `InfoActionsRow` moved in and
`playArea.module.css` lowercased 2026-09-14/15.)*

### F-info-sheet-1 · `props-wear-docstrings` · Fourteen prop and member notes open with `/**` — WORKED

§4 → The docstring marker: a prop takes `//`; the docstring is the component's.
`InfoSheet` (`open`, `children`), `InfoSwitchButton` (`open`),
`useInfoSheet`'s exported `InfoSheetApi` (`isOpen`, `close` — and the type
itself has no docstring), `OpponentStrip` (`metricFor`, `metricLabel`,
`leading`), `TurnStatusLine` (all four). `InfoActionsRow`, written by
`game-page` last week, already has it right. The notes themselves are good and
stay.

### F-info-sheet-2 · `switch-docstring-says-24rem` · `InfoSwitchButton`'s docstring argues from a sheet width the same commit abolished — WORKED

*"`<InfoSheet>` is `min(24rem, 100%)` wide, which is 384px against an iPhone's
390"* — written in `6d93b8c3` (2026-08-04), the commit whose CSS made the sheet
`width: 100%` and whose own comment records `min(24rem, 100%)` as the thing
retired. The argument the paragraph makes (two full-screen pages, so the
affordance is navigation) is right; its premise is that the sheet is
full-bleed, which is what to say. Three sentences in `docs/mobile.md` say the
old width or the old ✕ too: the recipe paragraph (*"`.infoWrap` is
`display: contents` … a fixed slide-in sheet on mobile, with a close ✕"* — the
class is `.wrap` and there is no ✕), the `<InfoSheet>` bullet (*"+ the ✕"*), and
the status-bar section (*"on a phone the ~24rem sheet covers the bar; on a
tablet both are on screen"* — full-bleed covers it on both).

**And twelve files outside the folder said it too**, found by sweeping the same
two phrases at the pass. Eleven opened their mobile comment on the vanished menu
item — eight game `PlayArea.tsx` (codenamesduet, connections, scrabble,
spellingbee, stackdown, waffle, wordle, wordwheel) and three
`PlayArea.module.css` (codenamesduet, psychicnum, wordle); the header's page
switch replaced it. Five named the retired `wide` prop: spellingbee's and
wordwheel's *"the sheet is `wide` (full device width)"*, waffle's and
connections's *"Plain (not `wide`)"*, and crosswords's *"`wide`: the Across|Down
columns want the full device width"* — crosswords being the twelfth file, with
only that half. All fixed with the area, since this folder owns the fact. What
STAYS is crosswords's *"the off-canvas 'Game info' sheet"*: that is the switch's
own label, in `actions/registry.ts`.

### F-info-sheet-3 · `used-to-in-seven-files` · The folder narrates how it used to work, in code that should say what is — WORKED

CLAUDE.md: *"how it used to work" is not useful.* `InfoSheet.module.css` has
three blocks of it (the sheet *"used to start at `top: 0`"*, *"used to be
`min(24rem, 100%)`"*, and the ✕ *"used to be kept in the DOM … DELETED
2026-08-25"* with a Unicode comparison of two glyphs neither of which exists in
the file); `InfoSheet.tsx` (*"It used to be a 24rem drawer with its own ✕"*);
`useInfoSheet.ts` (*"It used to be: this hook returned a mobile-only 'Game
info' menu item, which was a placeholder"*); `InfoSwitchButton.tsx` (*"which is
what the old 'Game info' menu item and the sheet's own ✕ used to be"*);
`infoPanel.module.css` (*"bananagrams's even carried the comment 'Matches the
shared WordList / EventLog chrome'"*); `OpponentStrip.module.css`
(*"Consolidated from the near-identical per-game copies"*); `InfoSheet.module.css`'s
header and `TurnStatusLine.tsx` (*"Extracted from … once three games shared it
byte-for-byte"*, *"Extracted from scrabble compete's InfoCol state line"*).
Where a "used to" carries the REASON — the header is a stable frame across both
pages, so the sheet starts at `--game-header-bottom`; one switch in one place,
so no second dismiss — the reason stays in the present tense and the history
goes. `infoSheetStore`'s and `useInfoSheet`'s design paragraphs (why a store,
why the affordance is not here) move to `doc.md → Details` (F-8) and each
docstring keeps its caller's ten lines.

### F-info-sheet-4 · `censuses` · Rosters of consumers in five files and two docs, most of them wrong — WORKED

`OpponentStrip.tsx`: *"Four games render exactly this shape … waffle,
connections, spellingbee, psychicnum"* — thirteen InfoCols place it; *"Not
used by bananagrams"*. `OpponentStrip.module.css`: *"shared by waffle /
connections / spellingbee / psychicnum / boggle / scrabble"*.
`TurnStatusLine.tsx`: *"all six opting-in games"* — nine. `infoPanel.module.css`:
*"Worn by the event log, the word list, and bananagrams's hand"*, *"NOT used by
stackdown's board `.canvas`"*. `InfoSheet.module.css`: *"three games shared it
byte-for-byte (psychicnum / wordle / codenamesduet)"*. `docs/playarea.md`: the
turn line *"used by connections / psychicnum / strands / waffle / wordiply /
wordle / scrabble coop"* — letterboxed and setgame missing. `docs/mobile.md`:
*"The eight opt-in turn-order coop games"* (nine) and the status bar's
*"Adopted by:"* list, which omits setgame though a bullet above describes its
bar. The rule ([no pointless counts]) is to name the condition — *a compete
game with a per-player metric*, *a turn-order game*, *a game whose core state
leaves the screen with the column* — and delete the roster; each doc keeps the
one game it holds up as the worked example.

### F-info-sheet-5 · `infopanel-credits-the-picker-hook` · `infoPanel.module.css` says the picker HOOKS render the heading row, and one of them does not — WORKED

*"The heading row and its filter group (`.headerRow` / `.selectGroup`) are here
too, because the picker HOOKS render them — the event log's
`useEventLogPlayerPicker` and the word list's `useWordListFilter`."*
`EventLog.tsx` renders `.headerRow` and `.heading` itself and
`useEventLogPlayerPicker` imports nothing from this folder; `WordList.tsx`
renders its own `.headerRow`; only `useWordListFilter` renders `.selectGroup`.
The reason the classes are here is simpler and true: a heading-with-a-control
row is worn by two components in two folders, so neither folder's private
module can own it. Say that.

### F-info-sheet-6 · `turn-line-docstring-gates-on-coop_style` · `TurnStatusLine` says it is rendered for `setup.coop_style === 'turns'`; every caller gates on the pointer — WORKED

*"Rendered by an InfoCol ONLY for a turn game (setup.coop_style === 'turns')"*
— no InfoCol tests `coop_style`; all nine render it when
`currentTurnUserId !== null` (scrabble adds `!isCompete`). The consequence the
docstring draws — presence fixed at create-time, so no reflow — still holds,
because the pointer is null for the whole game or for none of it; the condition
just has to be the real one. Same file: *"the shared `.infoState` type register"*
is game-page's class (F-11), and the *"non-breaking space"* comment is F-7.

### F-info-sheet-7 · `terminal-turn-line-collapses` · At terminal the whose-turn line renders a plain space and is 0px tall, so the column reflows by a line — **WITHDRAWN 2026-09-18: THE PREMISE IS FALSE.** There is no bug

`if (isTerminal) return <p className={shared.infoState}>{' '}</p>` — `' '` is
U+0020, collapsible whitespace, and a block holding only that has no line box.
Measured headless in Chromium with the scaffold's rules (`margin: 0`,
`font-size: 0.95rem`, a flex column with `gap: 1rem`): **0px**, against 17px
for `&nbsp;` and 17px for `<strong>Your turn</strong>`. So on the play→terminal
flip in every turn-order game the line vanishes and everything below it moves
up by a line — the exact reflow the props docstring (*"KEEPS its height"*), the
component docstring (*"an inert height-holder"*), the code comment (*"hold the
line's height with a non-breaking space"*), `docs/playarea.md` (*"goes inert but
keeps its height — a blank height-holder"*) and the test's name (*"goes inert
at terminal"*) all say cannot happen. Since `574ca929` (2026-07-13); the test
asserts only that two strings are absent, which a 0px paragraph passes.

The fix is the character the comment already claims: `{' '}`. The test
then asserts the paragraph's text IS a non-breaking space — the thing jsdom can
see that stands in for the height it cannot measure. No decision in it; waiting
for the word.

**WITHDRAWN — the character was never U+0020.** The source holds a LITERAL
U+00A0, written as the character itself: the bytes on that line are
`7b 27 c2 a0 27 7d`, i.e. `{'` + U+00A0 + `'}`. (The quotation two paragraphs up
carries the same literal, which is the trap in miniature.) Measured with the
character read out of the shipped file rather than retyped: **17px**, the same as
`<strong>Your turn</strong>` beside it. So the line holds its height, the comment
saying *"hold the line's height with a non-breaking space"* is accurate, and
`docs/playarea.md`, the component docstring, the prop note and the test's name
were all telling the truth. Nothing was broken.

**How the audit got it wrong, and that is the generalisable part.** U+00A0 renders
identically to U+0020 in every view of a source file — editor, `sed`, `grep`, and
this file quoting it. The audit read `{' '}`, wrote "U+0020, collapsible
whitespace", and the measurement script then reproduced 0px because its scaffold
was typed by hand with a plain space. The measurement was real; it was not
measuring the app. **A claim about a character is a claim about bytes**, and
`od` / `codePointAt` is the check. It surfaced only because a find-and-replace of
that exact line failed to match. A literal U+00A0 appears nowhere else in `src`,
`e2e`, `docs`, `supabase` or `scripts`; that line now carries a comment saying
what the character is and why the difference matters.

**Joel's ruling, which stands on its own:** *"it's ok for the whose-turn line to
disappear at terminal. changing things at terminal is ok."* So dropping the line
is permitted — which makes it a choice about appearance rather than a repair, and
the code keeps the blank row because that is what four places document and what
ships. Asked whether the ruling should become a general rule in
`docs/ui.md → Layout stability` (which grants terminal exceptions one at a time,
by name), he chose to keep it local: nothing in `ui.md` changes.

### F-info-sheet-8 · `doc-md-is-a-lede` · `doc.md` is one paragraph; the folder's design lives in two docstrings and `docs/mobile.md` — WORKED

Owed: the `## Intro to area` (what the info column is on desktop and on a
phone, who mounts what, why the flag is a store) and a `## Details` with the
render tree above — this folder holds components, so it gets the "who renders
me / what do I render" diagram (`game-page/doc.md` is the model) — plus the
design paragraphs F-3 moves out of `infoSheetStore` and `useInfoSheet`, and
the caller table (which games place which of the four pieces, by condition).
`common/info-sheet` then comes off `INTROS_OWED`.

**What it became:** a rewritten lede, a four-paragraph intro (the column and its
four pieces of furniture · the mobile page and why a page and not a drawer ·
`MobileStatusBar` as that design's cost paid back), and a `## Details` of four
items — the render tree, a *placed when / what the game supplies* table keyed by
condition rather than by game, the store argument harvested from F-17, and the
turn line's fixed presence. It leaves the terminal line's HEIGHT to
`docs/playarea.md`, which owns the terminal-readout rule — one home per decision.
(It was written that way because F-7 claimed the height was not held; that claim
turned out to be false, and the split is still right.)
`docs/mobile.md` keeps the mobile design; the doc cites it rather than restating
it.

### F-info-sheet-9 · `stale-doc-claims` · `docs/playarea.md` and `docs/mobile.md` describe the folder as it was — WORKED, except the folder-table row F-11 decides

- `playarea.md`: *"Shared in `common/game-page/playArea.module.css` —
  `.infoState` / `.infoHelp` / `.infoActions` / `.terminalActions` /
  `.outcome_*` / `.terminalExtra`"* — `.outcome_*` are `InfoActionsRow.module.css`'s
  since 2026-09-15.
- `playarea.md`: *"a bold, outcome-colored result line (won = green / lost =
  red / manual-end = neutral, via the `--outcomes-*-ink-color` tones)"* — an
  outcome is never a tone ([vocabulary]); it is the outcome's ink.
- `playarea.md`: the turn-line roster (F-4) and *"three are named classes … the
  setup recap is a shared component instead"* — fine; but the readouts table
  lists `.infoActions` as *"the action-button row … swaps"* with no mention of
  `<InfoActionsRow>`, which is what every game places now.
- `mobile.md`: the three sentences in F-2, and *"the ~24rem sheet"* again in the
  status-bar section.
- `docs/common-folders.md`'s folder table: *"the chrome its panels share"* —
  true of `infoPanel`, false of the readout classes. Left for F-11 at the prose
  pass and fixed by it: the classes moved here, so the row now names the sheet
  as well as the panel frame.

### F-info-sheet-10 · `alias-inside-common` · `InfoActionsRow.tsx` imports another `common/` folder through `@/` — WORKED

`import shared from '@/common/game-page/playArea.module.css'` — the rule
(`docs/common-folders.md → Imports use the @/ alias when they leave their
folder`) is relative within a top-level folder: `TurnStatusLine.tsx` next to it
writes `'../game-page/playArea.module.css'`. Fixed to the relative form at the
prose pass; F-11 (b) then made both of them `'./infoCol.module.css'`, their own
folder's sheet, which is what the rule wanted in the first place.

### F-info-sheet-11 · `readouts-live-in-game-page` · The folder table gives info-sheet the info column's shared chrome, and the info column's shared classes live in `game-page` — WORKED as (b), ruled 2026-09-18

`docs/common-folders.md` says `info-sheet` is *"the info column: its mobile
sheet, its switch, the chrome its panels share"*. What the folder holds is the
panel frame (`infoPanel`) and four components. The classes every InfoCol puts
on its own markup — `.infoCol` (the column), `.noShrinkRow`, `.infoState`,
`.infoHelp`, `.infoActions`, `.terminalActions`, `.actionsDivider`,
`.terminalExtra` — are in `game-page/playArea.module.css`, and two of THIS
folder's components take their root class from that sheet: `TurnStatusLine`
wears `.infoState`, `InfoActionsRow` wears `.infoActions` + `.terminalActions`
(its own module holds only the line's rules, and says so). `todo.md` filed both
halves — the setup-form audit's *"it feels wrong for someone else to import
CSS that is named for one component"* (Joel, 2026-09-14; the sheet has since
been lowercased, which answers the NAME and not the home) and the shared
`<InfoCol>` idea. `game-page`'s own sheet header calls these *"the info-column
READOUTS"*, a family distinct from *"the two-column SHELL"* it also holds.

**Decision:**

- **(a) leave the classes in `game-page`, fix the table.** The readouts are
  part of the play-surface scaffold, which is one sheet on purpose; the
  folder-table row says *"its mobile sheet, its switch, the panel frame"* and
  the two components go on importing a lowercase shared sheet, which the
  naming rule permits. Nothing moves.
- **(b) move the readout family here, as `info-sheet/infoCol.module.css`.**
  The eight classes above leave `playArea.module.css` (which keeps the shell:
  `.layout`, `.boardCol`, `.infoCol`'s column geometry stays with the shell
  since `.layout` sizes it — or moves too, to be decided in the work);
  lowercase, so every game's InfoCol reads it as it reads `playArea` today.
  The table's claim becomes true, `TurnStatusLine` and `InfoActionsRow` import
  their own folder's sheet, and `docs/playarea.md`'s *"Shared in
  `common/game-page/playArea.module.css`"* points here. Fourteen InfoCols and a
  handful of PlayAreas change an import line; no pixel moves.
  **Recommended** — it is the todo's own question answered the way the folder
  table already assumes, and it is the floor the shared `<InfoCol>` would be
  built on.
- **(c) build the shared `<InfoCol>` now.** The Soon item in full: one
  component with named slots in the canonical order, games composing through
  `composes:`. Bigger than this area — the slots have to be named and decided
  first (what is a slot, what is free-form, a game that wants none of one), and
  `composes` is used nowhere in the repo yet. Record it as the direction (b)
  enables, and open it as its own piece of work.

**Ruled (b), 2026-09-18** — Joel: *"i think would should move the
info-sheet/info-col classes to here. we can consider the 'composes' stuff later,
after we've audited a game or two, and we'll have a better sense of how much
individual styling games need over the shared infocol classes."*

The audit had recommended (b) and I argued for (a), on the strength of a standing
ruling: 2026-09-14 (`8bf5c549`), *"let's do 1 now, and continue to have an issue
to subdivide it later. once we're at the point of being able to audit our first
game, we'll be a in a better place."* Two things put that aside. **The move and
`composes:` are separable** — one is where declarations live, the other is how a
game extends them, and the second genuinely cannot be decided until a game has
been audited, which is the same reason the whole subdivision was deferred. And
**the risk the todo cited is guarded**: `src/guards/cssClasses.test.ts` fails on a
`styles.x` whose module no longer defines it, so a missed call site is a named
test failure, not a silently unstyled element. What shipped is one concern of the
five, the one whose home `docs/common-folders.md` already claimed.

**The line drawn, which is the reusable part: WHICH ELEMENT WEARS THE CLASS.**
A game's PlayArea root div wears `.layout`, `.mobileFill` and
`.responsiveInfoCol`, so those stayed — `.responsiveInfoCol` in particular, which
is the clamp deciding how much width the column takes from the board, a
negotiation between the two columns and not a rule about either. Everything worn
by the column or a row inside it moved: `.infoCol` (+ its `--mobile` override),
`.noShrinkRow` (+ `.noShrinkRow p`), `.infoState`, `.infoHelp`, `.infoActions`,
`.terminalActions`, `.actionsDivider` (+ its two sibling rules), `.terminalExtra`.
That test also settled the sub-question the option had left open ("`.infoCol`'s
column geometry stays with the shell since `.layout` sizes it — or moves too"):
it moves, and `--info-col-width` crossing the folder line is a contract, the way
`MobileStatusBar` reads the `--mobile-status-height` a game raises on its board
column.

**What it cost:** eighteen code files repointed one import (fourteen game
`InfoCol.tsx`, bananagrams's `PlayArea.tsx` and `PlayerBoard.tsx`, and this
folder's `TurnStatusLine` + `InfoActionsRow`). Seventeen of them wear only moved
classes, so the identifier stays `shared` and the diff is the import line alone;
`bananagrams/PlayerBoard.tsx` is the one file wearing both sheets, and its
game-page import is now `shell`. No class was renamed and no pixel moved. The
two e2e selectors that match on the hashed name (`[class*="infoCol"]`,
`[class*="infoState"]`) still match, since the hash carries the source file's
name and the new file is `infoCol`.

**Docs that moved with it:** the folder-table row (now true), `docs/playarea.md`'s
"Shared in …", `docs/deferred.md`'s offender bullet, `game-page/doc.md` (the
don't-move-row-by-row item came here, and "what a game wears" names the line),
`game-page/todo.md` (four concerns, and its "not a build error" claim corrected),
`info-sheet/todo.md` (the `.infoState` Soon item is answered and deleted) and
`vocabularies.test.ts`'s `pending` rows, which are keyed by path.

### F-info-sheet-12 · `exclude-error-on-the-row` · `InfoActionsMessage.outcome` is `Exclude<Outcome, 'error'>` for a reason `docs/outcomes.md` now calls false — WORKED as (a), ruled 2026-09-18

The `todo.md` Bug. The type's docstring: *"`error` is the one member left out:
it is a fault's word, and docs/outcomes.md is explicit that it is never an
outcome."* `docs/outcomes.md → A narrower Outcome type is almost always a
mistake` (2026-09-15) says the reverse — *"`error` is a full member, a game may
answer with it, and if one did it would take an error pill and an error bar in
the log like any other word"* — and names this row as *"the other narrowing …
an open question, filed in the folder that has to answer it"*. The test loops
six members *"for every member the type admits"*; the stylesheet has six
`.outcome_*` rules.

**Decision:**

- **(a) drop the exclusion.** `outcome: Outcome`; an `.outcome_error` rule
  inked from the outcomes ramp's error ink; the test loops all seven. The row
  then says what the vocabulary says: any outcome is a valid outcome, and a
  game that answers `error` gets an error-inked line beside its buttons the
  way it gets an error pill. **Recommended** — the type follows the vocabulary,
  and the argument for a ceiling (nobody passes it) is the census the rule
  forbids.
- **(b) keep it, with a true reason.** The row's message is either a
  `TerminalMessage` (whose outcome is `TerminalOutcome`, `won | lost |
  neutral`) or a live sentence a game writes; neither is a fault, and a fault
  has the fault modal. Then the docstring says that, and stops citing
  outcomes.md for the opposite. Against: outcomes.md has already ruled that
  "no caller passes it today" is not a reason.

**Ruled (a), 2026-09-18.** `outcome: Outcome`, an `.outcome_error` rule inked
from `--outcomes-error-ink-color` (which both themes already carried), and the
test's loop takes the seventh word — its header already said *"for every member
the type admits"*, so the loop had been narrower than its own claim. What decided
it against (b), which had a real structural argument: `outcomes.md` owns this
vocabulary, and the narrowing that survives there earned it with a reason about
the WORLD — a finished game has no more moves, so `near` and `warning` cannot
apply — while this one was a reason about plumbing. Keeping it left the three
surfaces that show an outcome disagreeing: the pill and the event log's bar admit
all seven, and only the row admitted six.

`Exclude<Outcome, …>` now appears nowhere in the repo; `TerminalOutcome`'s
`Extract` is the one subset left, which is what `outcomes.md` says it should be.
`docs/outcomes.md`'s "other narrowing is an open question" paragraph is answered
in place, and `todo.md`'s Bugs section is empty.

### F-info-sheet-13 · `useInfoSheetOpen-is-the-holdout` · The boolean hook is named for the thing, not the question — ruled already

`docs/code-conventions.md`: *"A hook returning `boolean` is named for the
question it answers … One folder still spells it the other way —
`useInfoSheetOpen`. It converts when that folder is next worked on rather than
in a sweep."* That is this folder, now. `useIsInfoSheetOpen`; two callers
(`GamePage.tsx`, `useInfoSheet.ts`); the doc's sentence goes. No decision left
in it — the doc made it.

### F-info-sheet-14 · `metricLabel-optional-for-nobody` · `OpponentStrip.metricLabel` is optional "so games not yet converted still compile"; all thirteen pass one

*"Every strip should pass one; it's optional only so games not yet converted
still compile."* — the conversion finished. Required, the excuse gone, and the
docstring's rule (*"so the bare numbers aren't ambiguous"*) becomes the type's.
`leading?` stays optional (two of thirteen use it). No decision in it.

### F-info-sheet-15 · `pending-literals` · Fourteen literals the vocabulary guard still excuses, most with a token waiting — WORKED, ruled 2026-09-18

From `vocabularies.test.ts`'s `pending` rows for this folder, judged against
`base.css`:

| file | literal | verdict |
|---|---|---|
| `OpponentStrip.module.css` | `font-size: 0.85rem` · `0.75rem` | `--font-size-2` · `--font-size-3` — fit |
| `OpponentStrip.module.css` | `opacity: 0.5` on `.sep` | `--opacity-2` — fit |
| `OpponentStrip.module.css` | `letter-spacing: 0.04em` on `.leading` (0.75rem uppercase) | `--letter-spacing-label` (0.03em) — fit; `word-entry` ruled the axis is SIZE, and this is the small one |
| `OpponentStrip.module.css` | gaps `0.25rem` · `0.5rem` | `--spacer-5` · `--spacer-4` — fit |
| `OpponentStrip.module.css` | gaps `0.3rem` · `0.35rem` · `--dot-size: 0.6rem` | no token — the a/b/c question: `0.35rem` and `0.3rem` are both "a little under spacer-4" and one of them can go; `--dot-size` is the Dot's own knob |
| `infoPanel.module.css` | `gap: 0.5rem` · `0.35rem` | `--spacer-4` — fit; `0.35rem` as above |
| `infoPanel.module.css` | `border: 2px` on `.box` | `--border-width-line-thick` — fit |
| `infoPanel.module.css` · `MobileStatusBar.module.css` · game-page's `.infoState` | `font-size: 0.95rem` | **no token, three readers**: the info column's text size. Name it (`--font-size-…` between 1 and 2), or fit to `--font-size-1` / `-2` and accept the change |
| `InfoSheet.module.css` | `transition: … 160ms` | `--transition-duration-travel` (180ms) — fit; `docs/ui.md` says a sheet is *"slower for a reason"*, and 180 is slower |

The `0.95rem` row is the only real decision; the rest are fits under the
a/b/c rule. Each fit shortens the guard's `pending` row for the file.

**One premise had moved by the time this was presented:** the audit listed the
third `0.95rem` reader as game-page's `.infoState`, and F-11 had since brought it
into this folder — so all three readers were info-sheet's, which is what made the
question this area's to answer.

**Ruled (a) `name-the-step`, 2026-09-18** — Joel first said to fit the three to
`--font-size-1`, then *"actually, instead let's do name-the-step"*. So
`base.css` gains **`--font-size-packed: 0.95rem`**, a role name beside the ramp
rather than a step on it, on the `--letter-spacing-*` model (named for what the
text IS). The role: text where vertical space is the scarce thing — the info
column's state line, its panel headings, and the mobile status bar that stands in
for the column on a phone. It is deliberately not a number between 1 and 2: the
ramp's steps get quieter as they descend and this is body loudness in a tighter
space, and inserting a number would renumber the two below it everywhere they are
read.

**The fits, all converted:** `OpponentStrip` — `0.85rem`/`0.75rem` →
`--font-size-2`/`-3`, `opacity: 0.5` → `--opacity-2`, `letter-spacing: 0.04em` →
`--letter-spacing-label`, the three `0.25rem` gaps/margins → `--spacer-5`;
`infoPanel` — `gap: 0.5rem` → `--spacer-4`, `border: 2px` →
`--border-width-line-thick`; `InfoSheet` — `160ms` →
`--transition-duration-travel` (180ms, and ui.md's "slower for a reason" holds);
`infoCol` — the exact fits that arrived with F-11's move, `gap: 1rem` (×2) →
`--spacer-2`, `gap: 0.5rem` → `--spacer-4`, `border: 1px` →
`--border-width-line`.

**Left open, and still on the guard's `pending` rows:** `infoCol`'s `0.9rem` on
`.infoHelp` (a near-miss to `--font-size-2` that nobody has judged — the muted
help line one step under the state line), `infoPanel`'s `0.35rem`, and
`OpponentStrip`'s `0.3rem` / `0.35rem` / `0.6rem` — the a/b/c question the table
above already names, where two values are both "a little under `--spacer-4`" and
one of them can go. `--dot-size` stays the `<Dot>`'s own knob.

**Two guards moved with it.** `cssTokens.test.ts`'s `DECLARED_AHEAD` lost
`--opacity-2`, `--transition-duration-travel` and `--letter-spacing-label`, which
had been defined ahead of any reader and now have one — the guard failed by name
until they were removed, which is the mirror arm working. And the conversion
turned up a **false claim in a blessed folder**: `StandardButton.module.css`
argued its `font-size: 1em` with *"an info-column button is 0.95rem because the
column is"*, and the column has never set a font-size — nothing between `body`
and the button does, so a button in the info column has always been 1rem. The
same comment's *"against the info column's 0.95rem it is 1.18"* was wrong for the
same reason. Both fixed here (a closed area is not locked for prose), and the
useful consequence: this change resizes exactly three things and no control.

### F-info-sheet-16 · `headerRow-is-the-heading-pattern` · `infoPanel.headerRow` is `.heading-with-controls` written by hand — WORKED as (2), NO CHANGE to the CSS, ruled 2026-09-18

The `todo.md` Someday. `core-css/patterns/heading.css` has the shared row
(heading left, controls right, `min-width: 0` deciding who yields);
`.headerRow` is the same three declarations plus a `gap` — and `.selectGroup`
is the two-filters case of the same. Convert the two readers (`EventLog.tsx`,
`WordList.tsx`) to the pattern class and delete `.headerRow`; or keep
`.headerRow` as the info column's step-down (its heading is `0.95rem`, ui.md
notes the column steps headings down) and say so. A decision, small; the todo
already leans convert.

**Two things re-verification changed before this was presented.** After F-15
converted the gap the two rules are BYTE-IDENTICAL, not "three plus a gap" — the
only difference left is the pattern's `> :first-child { min-width: 0 }`. And the
"keep it for the step-down" reason is dead on its face: `heading.css` states
outright that it does not touch the heading's size or margin, because the LEVEL
owns those. So the option had to be re-argued from scratch, on whether a shared
component should wear a global class at all.

**Ruled (2) `leave-it`, 2026-09-18 — `.headerRow` stays and the CSS does not
change.** The reason, now written on the rule itself: `.heading-with-controls` is
a GLOBAL class, written as a string in `className`, and its readers are PAGES
(`ClubPage` ×2, `HomePage`). `EventLog` and `WordList` are shared components, and
a component in `common/` reaching for a global class couples its look to
`core-css`'s cascade rather than to a module it imports, where a hashed name
cannot be reached by anything that did not ask for it. Two copies of five
declarations is the price, and it is the cheaper half: what the pattern adds
beyond them is the `min-width: 0`, and neither heading needs it — the event log's
is one word, and the word list's `.longest` is `nowrap` precisely *"so a narrow
info column breaks BETWEEN tallies rather than inside one"*, which is wrapping
wanted on purpose.

**What DID change is prose, in two files that claimed these rows.**
`patterns/heading.css` listed *"Turns [ Everyone ▾ ]"* and *"Words: 34 · Score:
118 [ Kind ▾ ] [ Who ▾ ]"* among its examples, said *"this row is used in both"*
(a page and a game's info column), and called the word list *"the tightest
instance's answer"* — all three false, since its only readers are two pages.
`docs/ui.md` carried the same three. Both now say the info column has the same
shape and deliberately does not wear the class, and why. This is the pattern
having been written FOR these two rows and never wired to them, which is also
what made the finding look like an obvious convert.

### F-info-sheet-17 · `store-docstring-is-the-design` · `infoSheetStore`'s file header is the folder's design, twenty lines above two functions — WORKED

*"Why a store and not component state"*, the one-game-at-a-time argument, the
GamePage reset, the desktop no-op — all true, all design, none of it what a
caller of `setInfoSheetOpen` needs. `useInfoSheet`'s header carries the other
half (*"The switching affordance is not here"*). Both move to `doc.md → Intro`
/ `Details` (F-8); each file keeps: what the flag means, that GamePage resets
it per game, and a pointer. Prose, no decision; listed apart from F-3 because
it is the harvest source rather than archaeology.

## Notes

- `InfoSwitchButton` writes `icon={icon ?? IconInfoSheetOpen}` though its
  `describe()` always returns one; the `??` is for `actionSurface`'s `icon?:`
  type, which falls back to the registry's glyph anyway. Left.
- `InfoSheet`'s `role="dialog"` / `aria-modal` / `aria-label` and the switch's
  `aria-expanded` are existing ARIA and stay (CLAUDE.md → Screen readers);
  `infosheet-dialog.e2e.ts` asserts the role.
- The two info-sheet e2e headers (`infosheet-dialog`, `infosheet-resize`)
  quote a GamePage comment about *"consolidating the old Game info menu item
  and the sheet's ✕"* that no longer exists in `GamePage.tsx`; e2e is out of
  the roster, noted for whoever reads them next.
- `MobileStatusBar`'s docstring is long but every paragraph is for the caller
  (render it first in `boardCol`; feed it the same node; fixed height); kept
  as is.
- `OpponentStrip.tsx`'s *"belongs to the `PageHeaderPlayersStrip` dot family"*
  names a component that still exists.

## Predicted test breaks

- F-7: moot — withdrawn. (The assertion it wanted, that the paragraph's text IS
  U+00A0, is still the only thing that would pin the character against a future
  reader "fixing" it. Offered, not built.)
- F-11 (b): **as predicted.** No runtime break; `vocabularies.test.ts` went red
  on three vocabularies until the `pending` rows followed the literals to the new
  path — and one stale entry had to go with them, since `0.5rem`'s only remaining
  home in `playArea.module.css` is a `padding`, which that vocabulary parks. The
  css-class guard stayed green throughout, which is also the proof it would have
  caught a missed call site.
- F-12 (a): as predicted — `InfoActionsRow.test.tsx`'s loop adds `error`, and
  nothing else moved. No caller needed changing, since the type only widened.
- F-13: none — two call sites renamed together.
- F-14: any InfoCol test rendering `<OpponentStrip>` without `metricLabel`
  fails to typecheck; thirteen pass it, so expect none.
- F-15: as predicted, and one more. `vocabularies.test.ts` failed on six
  vocabularies until every `pending` row was trimmed to what the file still
  writes — and `cssTokens.test.ts` then failed too, because three tokens left
  `DECLARED_AHEAD` the moment they gained a reader.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Intro + Details written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
