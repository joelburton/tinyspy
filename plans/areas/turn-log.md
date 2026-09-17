# Area: turn-log

The folders it reads: `turn-log`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN, audited 2026-09-16.** Roster agreed (Joel: *"audit this area"*)
and stamped `cs-met-turn-log`; every file read, and the docs and games around it
read as evidence. Twenty-two findings — seventeen from the audit, and F-18, F-20,
F-21 and F-22 found afterwards, by Joel reading the work and by the re-read of
this file against it.

| | |
|---|---|
| **worked** (16) | F-1 … F-5 (the prose pass, one commit — and the sibling sweep F-4 grew into: every file in the repo that called the shared history marker yellow) · F-8 · F-9 · F-10 · F-11 · F-13 · F-14 · F-15 · F-16 · F-18 · F-19 (including its ten-game meaning-based sweep) · F-22 |
| **closed by F-22** (2) | F-6 · F-7 — the props they were about no longer exist |
| **skipped** (2) | F-12 → `z-index` · F-17 → `outcome-fix` — each caused the area it went to (plan §3 rows 40 and 39) |
| **open** (2) | F-20 · F-21 |

## The roster

`src/common/turn-log/` — every file `cs-met-turn-log`:

- `TurnLog.tsx` — the panel and the row vocabulary, four components since F-15:
  `TurnLog` (heading row, the scroll box, a `<table>` whose rows are the game's),
  `TurnLogBar` (the outcome bar cell), `TurnLogNumber` (the `#N` handle that
  opens a turn on the board) and `TurnLogActor` (the "who" cell)
- `HistoryBanner.tsx` — the viewer's banner: the label, the ✕, and the whole
  strip as a click-to-exit target (written by F-14) · `HistoryBanner.test.tsx`
- `TurnLog.test.tsx` — the panel's one behavior: it snaps to the newest entry
  when the log grows and leaves a scrolled-up box alone otherwise (written by
  F-9)
- `TurnLog.module.css` — the panel, the bar, the row vocabulary a game composes
  (`.main` / `.other` / `.primary` / `.meta` / `.who`, the divider, the
  multi-row hug)
- `useHistoryViewer.ts` — which past turn is open, `showHistory` /
  `exitHistory`, click-anywhere-to-exit, and the `act-exit-history` binding
- `useHistoryViewer.test.ts`
- `historyViewer.module.css` — the viewing look: the board `.historyFrame`, the
  `.historyNumber` ring, the `.historyBanner` over the input area with its label
  and ✕, `.historyBannerHost`, scrabble's `.peerPreview` recolor
- `useTurnLogPlayerPicker.tsx` — the "whose turns?" dropdown, its default, the
  row filter, `boardIsShown`, the honest empty line
- `useTurnLogPlayerPicker.test.tsx`
- `doc.md` (lede + intro + Details, written in the prose pass) · `todo.md`
  (one Bug, three Soons)

**Everything above is as of 2026-09-16, after F-9, F-14 and F-19 shipped** —
the roster's own names moved under it, which is the hazard
[[feedback_reread_the_header_after_a_fix]] names.

Evidence, read and left:

- The eleven games' `GameTurnLog.tsx` (every game but bananagrams, boggle,
  crosswords, spellingbee, wordwheel), which compose rows from this folder's
  atoms — psychicnum's single-row and codenamesduet's two-row turn read in
  full; the ten `PlayArea.tsx` that hold `useHistoryViewer` (every log game
  but wordiply) and the ten `BoardCol.tsx` that place the banner (they drew it
  by hand until F-14).
- `docs/playarea.md` → Turn log, Whose turns?, Turn-history viewer, Per-game
  history-viewer specifics, What building it taught us; `docs/ui.md` → the
  `handle` button kind, "Styled tooltips, not the native `title`";
  `docs/outcomes.md` → the `TurnOutcome` story; `docs/deferred.md` → the
  banner ✕ (rewritten by F-14 — it is a one-file look question now); `docs/mobile.md`, `naming.md`, `code-conventions.md`,
  `pdf.md` each once.
- `info-sheet/infoPanel.module.css` (`.heading`, `.headerRow`, `.box` — the
  panel wears them), `lists/FilterSelect.tsx`, `members/ActorMention.tsx`,
  `members/memberList.ts`, `actions/useBoundAction.ts`,
  `core-css/patterns/empty-state.css`, `themes/daylight.css` (the five tokens
  the two stylesheets read all resolve), `core-css/base.css` → the z ladder.
- `e2e/codenamesduet-history.e2e.ts` and the five other `*-history.e2e.ts`
  (six in all) that click a `[data-turn-number]` handle. **None of them clicks
  the banner ✕** — found at F-14, which is why `HistoryBanner.test.tsx` exists.
- `src/guards/vocabularies.test.ts` names both stylesheets in its `pending`
  allowlists (a guard is not roster).

## What the folder is, in one paragraph

Two things and the seam between them. **The log** is a panel — heading, a
"whose turns?" dropdown, an evident scroll box, a `<table>` — that owns no row:
each game renders its own `<tr>`s from a small vocabulary this folder supplies
(an outcome bar cell, a `#N` cell, a who cell, sizing and emphasis classes, a
divider, a two-row hug), so eleven logs look alike without sharing a row shape.
**The viewer** is one piece of state — which past turn is open on the board —
with three ways out: a keystroke (the hook binds the any-key
`act-exit-history`) and a click anywhere but another `#N`, both free, plus the
banner's ✕, which the game places and the shared `<HistoryBanner>` draws. What a past board LOOKS like is each game's `lib/history.ts`; what
it wears while viewing is this folder's stylesheet — a blue frame on the board,
a blue ring on the open `#N`, an opaque banner over the input area. **The
seam** is `boardIsShown`: the picker knows whether the rows on show are the
sequence the board replays, and the games that address a turn by log position
turn `#N` into a plain number when they are not.

## Findings

### F-turn-log-1 · `intro-owed` · `doc.md` is one lede, and the design is spread over four docstrings and a 300-line doc

The `## Intro to area` owed: what a turn log is for (the game's own account
of what happened, in order, with who and how it went), why the panel owns no
row and what it supplies instead, the viewer as one flag plus three exits, and
the `boardIsShown` seam. `## Details`: why a `<table>` (columns line up
across rows a flex stack cannot); why `#N` is a `<span>` (ui.md's `handle`
kind — a focused button re-fires on Space, the viewer's exit key); why the bar
is a positioned span with a `::before` spacer (an empty cell collapses);
`.main` takes the slack and `.who` never does; the six things the picker
carries together and why re-deriving any one drifts; what stays per game
(snapshot computation, turn identity, the banner's host); the render tree —
who mounts what, the games' nodes marked. Most of it is written, in
`TurnLog.tsx`, the two stylesheet headers, the two hooks and `playarea.md`;
it moves rather than being rewritten, and the archaeology stays behind.

**WORKED 2026-09-16.** The lede names both halves. The intro is four narrative
paragraphs: why a log has to look the same in every game while no two games
have the same turn, so the panel owns no row and supplies the frame plus a
vocabulary; the viewer as one flag with three exits nobody wires; and the
`boardIsShown` question between them. `## Details` took six — why a `<table>`
and what it costs, what stays the game's on the viewer's side of the seam, why
`boardIsShown` is false more often than it looks, why the picker's six results
travel together, the input that is frozen to the eye and alive underneath (the
Note), and the render tree, drawn with the game's own two files in it because
that is the shape no single file shows. `common/turn-log` is off `INTROS_OWED`.

**Three things this finding listed did NOT move**, deliberately: why `#N` is a
`<span>`, the bar's `::before` spacer, and the `.main`/`.who` sizing model. Each
already has one home a reader reaches first — `TurnLogNumber`'s docstring and
the two stylesheet headers — and copying them into `doc.md` is the tour
`docs/common-folders.md` forbids.

### F-turn-log-2 · `orphaned-turnoutcome-docstring` · A deleted type's docstring sits on top of the component's

`TurnLog.tsx` lines 10–12: *"The outcome a row's left bar paints — the outcome
families, by name, shared across games: `won` … `lost` … `near` … `neutral`"*
— the docstring of `TurnOutcome`, the type `outcomes` deleted (the four words
it lists are the three-short list that story is about). Its declaration went;
the `/**` block stayed, stacked directly over `TurnLog`'s own docstring, so a
hover shows the first one. Delete it.

**WORKED 2026-09-16.** Deleted.

### F-turn-log-3 · `stale-claims` · Eight claims in the folder that describe something the repo no longer has

- `TurnLog.tsx` docstring and `TurnLog.module.css` header: *"See docs/ui.md →
  'Turn log'"* — `ui.md` has no such section; the section is `docs/playarea.md`
  → Turn log.
- Both again: the content classes *"`.primary` / `.meta` / `.who` / `.actor` /
  `.dot`"* — no `.actor` or `.dot` rule exists and nothing reads one; the
  cluster moved to `ActorDot`, which the stylesheet's own later comment says.
- `TurnLogNumber`'s docstring: the `data-turn-number` marker *"lets a
  click-anywhere-to-exit handler tell … (see codenamesduet's PlayArea)"* — the
  handler is `useHistoryViewer`'s, and codenamesduet's PlayArea has no such
  code.
- `historyViewer.module.css` → `.bannerHost`: *"The rest (codenamesduet,
  connections, psychicnum) put the banner inside the narrower … swap box"* —
  six games wear it now (letterboxed, strands and setgame joined), and *"All
  three had a byte-identical private one-liner"* is the archaeology that dated
  it.
- `TurnLogActor`'s docstring: *"(psychicnum had already wrapped it locally as
  `whoCell`)"* — archaeology, and confusing, because psychicnum's log STILL
  names a local `whoCell` helper, which now wraps this component.
- `headerAction`'s docstring: *"verified 2026-08-21"* and *"the section-header
  pattern pass is the moment to do it"* — a dated census and a cite to a pass
  that is this area (F-6 works it).
- `useHistoryViewer`'s docstring: *"extracted once turn-history reached three
  games (the rule of three — see docs/playarea.md)"* — archaeology; the doc's
  "Resolved along the way" bullet is the copy that may keep it.
- `useHistoryViewer.ts` → `select`: the seven-line story of the phone bug
  ("the feature was unusable on a phone rather than broken, which is why it
  read as 'probably works'") — the same paragraph is in `playarea.md` word for
  word; the comment keeps the rule (opening a turn leaves the info page,
  unconditionally) and loses the story.

**WORKED 2026-09-16.** All eight, as written. A ninth turned up while editing:
`.turnLogBox` carried TWO comment blocks, the first claiming the 2px border is
this rule's and the second (correct) saying the frame is `infoPanel.box` — one
block now. The `headerAction` ⚠️ went from both the prop and the JSX, with its
one durable observation moved into the `todo.md` entry that owns the question
(`space-between` with one child already puts the heading where a bare `<h3>`
sits, so the arm buys nothing even for a caller with an empty slot).

### F-turn-log-4 · `playarea-md-stale` · The doc this folder points at is wrong about the viewer's color, its wiring, its paths and its games

`docs/playarea.md` → Turn-history viewer and What building it taught us:

- **"yellow"**, four times, for the viewing frame and the `#N` ring ("a yellow
  'viewing' outline", "the matching yellow ring", "rings itself yellow",
  "history-yellow"). The frame is `--view-history-color`, the muted blue, and
  the stylesheet's header spends a paragraph on why it must NOT be yellow.
  `e2e/codenamesduet-history.e2e.ts`'s header says "the yellow history frame"
  too (not roster; noted for its game).
- *"Two are intrinsic to the hook; only the keystroke path is wired per game
  (it must cooperate with the game's own key handler)"* — all three are the
  hook's since `act-exit-viewer`; the same doc's "Resolved" bullet and the
  hook's docstring both say so.
- Two pre-reorg paths written as fact: `common/components/game/lists/TurnLog.tsx`
  (→ Turn log) and `common/hooks/game/useHistoryViewer.ts` (→ Turn-history
  viewer).
- *"a TinySpy turn can span a clue + several guesses"* — the brand; prose says
  the codename.
- The section's opening list of viewer games names eight and omits letterboxed
  and setgame; ten PlayAreas hold the hook, and the decomposition section 170
  lines later counts ten correctly.
- wordle: *"`boardIsShown = teamView || picked === selfId`"* — no `teamView`
  exists in wordle; the picker computes `boardIsShown` for every game.
- Two archaeology paragraphs (`<TurnLogItem>` deleted, `HistoryPanel`
  deleted) under Whose turns?, and one self-cite ("the game-owns-its-rows rule
  is in Turn log above", linked to its own heading, written inside Turn log).

Nobody's folder owns `playarea.md`; the turn-log and viewer sections are this
area's to correct because they describe this folder.

**WORKED 2026-09-16.** Every bullet. Two more pre-reorg paths sat in the same
sections (`common/turn-log/…` without the `src/` the rest of the doc writes),
and psychicnum's per-game bullet said "a yellow ring" for the same token.

**And the sweep the first bullet implies.** The claim is not playarea.md's
alone: `--view-history-color` is `#4a7bab` and every history marker in the app
reads it, so "yellow" was wrong in twenty-odd places. Fixed in the same commit
(areas are coverage, not a fence — a verified wrong sentence is not another
area's to keep): codenamesduet (6 files), stackdown (5), wordle (5), strands
(2), scrabble (3 — and `docs/games/scrabble.md`, which named a
`--scrabble-viewer` token that no longer exists), letterboxed (2); five files
under `docs/games/`, and the four `*-history.e2e.ts`. Two neighbors were wrong
about more than the color and were rewritten to what the code does now:
codenamesduet's log names a `viewedRow` class it has never had, and
`docs/mobile.md` said waffle's picked-up tile wears `--view-history-color` at
4px when it wears the shared `.tile.selected` mark. Left alone, correctly:
waffle's turn-start flash and spellingbee's center letter really are yellow,
and `historyViewer.module.css`'s paragraph on why the frame must NOT be yellow
is the one place the word belongs.

### F-turn-log-5 · `prop-markers` · `/**` on members throughout

`TurnLog`'s inline props type (six members), `TurnLogBar` (one),
`TurnLogNumber` (three), the `HistoryViewer` interface (five), the
`TurnLogPlayerPicker` type (six) and the picker's params (five) all wear `/**`
per member. The rule is `//` on a member of a declaration; the component's
own docstring is the `/**`. `useTurnLogPlayerPicker`'s `boardIsShown` note is
twelve lines and the best explanation of the seam in the repo — it moves to
`doc.md` → Details and the member keeps two lines.

**WORKED 2026-09-16.** All twenty-six members, and `boardIsShown` moved as
described. Three docstrings were over the hover budget once their members
stopped carrying the load, so they were cut to what a caller needs: `TurnLog`
(24 → 14 lines, the row-vocabulary list now a clause pointing at `doc.md`),
`useHistoryViewer` (26 → 16, the per-game seam compressed to the two wiring
lines and a pointer), and `useTurnLogPlayerPicker` (30 → 17, the "You" label
archaeology and the six-things paragraph moved to `doc.md`).

### F-turn-log-6 · `header-action-required` · `headerAction` is optional in name only, with a ⚠️ in two places saying so

The `todo.md` Soon, re-verified: eleven `<TurnLog>` sites, eleven pass
`headerAction`. The prop's docstring and a JSX comment both carry a ⚠️ block
explaining the dead `<h3>`-alone arm. Options: (1) required; the arm and both
warnings go; (2) leave. Recommend (1).

**CLOSED 2026-09-16 by F-22, which deleted the prop.** The panel takes the
picker whole now, so there is no `headerAction` to make required and no arm to
delete — it draws the heading row unconditionally. The ⚠️ blocks had already
gone in the prose pass, and the `todo.md` Soon is deleted with them.

### F-turn-log-7 · `empty-text-default-dead` · Two defaults for one line, and one of them is never read

`<TurnLog emptyText = 'Nothing yet.'>` and the picker's `emptyLabel =
'Nothing yet.'`. Every one of the eleven callers passes `emptyText={who.emptyText}`,
so the panel's default never draws, and the honesty rule ("Hidden until game
ends.") lives in the picker. Options: (1) `emptyText` required on the panel;
the picker keeps the one default; (2) leave. Recommend (1): a default is a
decision, and this one is made twice.

**CLOSED 2026-09-16 by F-22.** `emptyText` is not a prop any more: the panel
reads `who.emptyText` itself, so the second default could not exist. The
picker's `emptyLabel` is the one place the word is decided.

### F-turn-log-8 · `classname-no-caller` · `className?` on the panel, "for a rare per-game override" no game makes

No `<TurnLog>` site passes `className`. The docstring describes the override
that would use it (a different width or flex) and none exists. Options:
(1) drop the prop and the `cls` around the root; (2) leave. Recommend (1).

**WORKED 2026-09-16, option (1).** Re-verified first: still eleven sites, still
none passing it, before F-22 or after — and F-22 had left it as the only
optional prop without a caller (`entryCount` has one, and a reason). The root is
`<section className={styles.turnLog}>` now, and the stylesheet stopped promising
the override: `flex: 1` lives there rather than per-game, which is why the panel
takes no class from outside at all — there is nothing left for one to say.

### F-turn-log-9 · `scroll-key-fresh-array` · Six games snap the log to the bottom on every render

`TurnLog` scrolls to the newest row in an effect keyed on `scrollKey`, and its
docstring offers "the rows array, or its length". Six games pass
`scrollKey={shown}` where `shown = who.filter(rows)`, and `filter` builds a
NEW array every call (`[...rows]` or `.filter`), so the key changes on every
render of the PlayArea — including the once-a-second render a configured clock
causes. In a timed game, scrolling the log up lasts until the next tick. Four
games pass `shown.length` and codenamesduet a sum, which do not have the bug.
Options: (1) the prop becomes `rowCount: number`, so the type says what "the
rows changed" means and the six sites pass `shown.length`; (2) the picker
memoizes `filter`'s result; (3) leave. Recommend (1). One thing to know: with
a count, switching the picker between two players with equal row counts will
not snap — which is arguably right, since nothing new arrived.

**WORKED 2026-09-16, option (1), and the prop is `entryCount: number`.** Joel
took the fix and improved the name: "entry" is the folder's own word
(`.entryHead` / `.entryCont`), and the recommended `rowCount` would have been
literally wrong at connections, whose one entry is two `<tr>`s. Ten sites pass
`shown.length`; codenamesduet keeps `clues.length + sortedGuesses.length` and
carries a comment saying why its number is bigger than its entry count — an
entry there is a TURN, and guesses land inside a turn that already exists (they
grow its second `<tr>` rather than adding an entry), so counting turns alone
would miss the snap.

**The "no runtime spec" line under Predicted test breaks is no longer true.**
`TurnLog.test.tsx` is new and pins three cases: a re-render that adds no entry
leaves `scrollTop` where the player put it, an entry arriving snaps, and a
count that moves by more than one entry snaps too (codenamesduet's). Verified
by planting — swapping the dep for a fresh object each render fails the first
case and only the first. jsdom does no layout, so the snap is observable as
`scrollTop` being put back to 0.

**What a player will feel:** in a game with a clock, scrolling back up the turn
log stays where you left it instead of being yanked to the bottom on the next
tick.

### F-turn-log-10 · `native-title-tooltip` · The `#N` handle uses the native `title`

`TurnLogNumber` sets `title="Click to view this turn on the board"`. `ui.md` →
"Styled tooltips, not the native `title`" rules it out. Options: (1) the
tooltips folder's hook, if it can attach to a `<span>` handle the way it does
to the header's marks; (2) drop the attribute — the hover tint already says
"clickable", and the `#N` reads the same in every game; (3) leave. Recommend
(1), to be confirmed with the tooltips API open; (2) if it cannot.

**WORKED 2026-09-16, and there were TWO**, the second one mine: F-14 carried
`title="Click to exit"` into `<HistoryBanner>` verbatim from the nine
hand-written banners. Joel ruled them separately:

- **the banner gets no tooltip at all** — *"the 'x' for the history banner
  doesn't need a tooltip of any kind. 'x'-to-close is obvious."*
- **the `#N` handle gets the app's own bubble**, `data-tooltip`. Confirmed
  possible first: `TooltipHost` delegates by `closest('[data-tooltip]')`, so it
  attaches to any element — letterboxed's `ChainStrip` and crosswords' `Controls`
  already do it off a button. `DefinableWord`'s documented exception (the native
  title, because a hundred definable words in a list would trail popups) was
  offered as a reason to keep the native one here too, and not taken.

**And the specs stopped matching on wording** — Joel: *"matching by title or
exact label is inherently flaky."* Three unit assertions found the handle by
`getByTitle('Click to view this turn on the board')` and six e2e found the
banner by `[title="Click to exit"]`; when the title went, all nine would have
failed for a reason that reads like a bug in the app. They match the marker now:
`data-history-banner` on the banner (new, the repo's `[data-board]` convention),
and the `#N`'s own text for the handle.

### F-turn-log-11 · `color-black-literal` · `.turnNumber:hover { color: black }`

A literal ink where the vocabulary has `--page-text-strong-color` (`#000000`).
Options: (1) the token; (2) leave. Recommend (1).

**WORKED 2026-09-16, the token.** Re-verified first, and it was worth doing: it
was the LAST literal black in `src/` (`color: black` matched this one line and
nothing else), and it was not cosmetic — `daylight.css` sets the token to
`#000000`, so the two agreed there, but `midnight.css` sets it to `#ffffff`, so
under `?theme=midnight` this rule painted a hovered `#N` black on a dark
surface. Every other line in these two stylesheets already read a token; this
was the hole.

**And `cssTokens.test.ts` turned the finding round.** The token was on
`DECLARED_AHEAD` — declared by both themes and read by NOTHING — so this rule is
now its first and only reader, and the guard failed until its allowlist line
came out. So it was not "a literal where a token existed"; it was a literal and
an unread token, one hole with two halves. Third guard this session to work by
the shrinking-allowlist pattern, after `cssClasses` and `orphanedDocstrings`.

### F-turn-log-12 · `z-index-literal` · `.historyBanner { z-index: 5 }` is not on the ladder

The z ladder in `base.css` says a rung migrates when its component's area is
audited. The banner overlays the below-board input inside the board column,
so `5` works only because it competes with nothing above the column's own
stacking. (The class was `.banner` when this was written; F-19 renamed it.)
Options: (1) `var(--z-board)` — the banner is part of the play surface;
(2) measure whether anything under it is positioned with a z-index at all and
drop the declaration if not; (3) leave. Recommend (2) then (1): measure first.

**SKIPPED 2026-09-16 — it belongs to the `z-index` area, scheduled next (plan
§3 row 39) out of this finding.** The measuring was done, and it overturned the
recorded recommendation, which is why the finding could not be worked here:

- **`var(--z-board)` would have been wrong.** `base.css` rules that layering
  INSIDE a component's own stacking context is not on the ladder — "everything
  local today is ≤ 10 and everything page-level is ≥ 1000" — and the banner is
  `inset: 0` against a box the GAME makes a positioning context, so it never
  joins the root stacking context at all. `5` is inside the permitted band, and
  `vocabularies.test.ts` draws its line at 10 to allow exactly this.
- **`--z-board-question` was considered** (Joel asked) and does not fit: it is
  "a box over ONE square, showing or taking something for that square"
  (crosswords' rebus), where the banner covers the whole below-board region and
  reports rather than takes.
- **The board is not at 1000.** `--z-board`, `--z-board-question` and `--z-ghost`
  are declared and read by NOTHING; the guard's own comment says `--z-board`
  gaining a reader is the signal that boards became sealed. The ladder documents
  a state the app is not in, and this `5` is one of thirty local numbers rather
  than an outlier.
- **The audit it produced** — 38 declarations across `src/`, six on a rung,
  thirty legitimate locals, and two real offenders (the drag ghost at `1000` in
  bananagrams and `100` in scrabble, one element at two numbers, with
  `--z-ghost` waiting) — is written into the plan's row 39 so the area starts
  from it. One live defect was fixed on the way past: `dragGhost.module.css`
  pointed at `docs/css-audit.md`, which does not exist.

Joel's reasoning for the area: *"it will be best to handle the z-index issues in
an area dedicated to this; so that everything has a clear meaning for the zindex
(and make the board actually sit where we document it sitting at)."*

### F-turn-log-13 · `unnamed-effects` · Two bare-arrow effects in the hook, one under a nine-line header

`useHistoryViewer.ts`: the click-anywhere effect — the one with the longest
comment in the file — has no name; nor does the ref-sync effect above it. Names:
`exitOnClickAway` and `syncHistoryIdRef` (it was `syncViewingIdRef` when this was
written; F-19 renamed the ref). The handler inside the first, `onDocClick`, says
where it is bound rather than what it does. Options: (1) name both effects and
the handler; (2) name only the click-anywhere effect. Recommend (1).

**WORKED 2026-09-16, option (2) — Joel took the narrower one.** The
click-anywhere effect is `exitOnClickAway`; the ref-sync effect and `onDocClick`
stay as they are. The rule (`code-conventions.md` → "`useEffect` — name it, when
non-trivial") is about the effect a reader loses the thread on, and the
three-line ref-sync is not that one. Eighteen bare `useEffect(() =>` remain
across `common/`, so this folder was never unusual — only open.

### F-turn-log-14 · `banner-drawn-nine-times` · The viewing banner's markup is hand-written in nine games; this folder owns only its classes

`.banner` + `.bannerLabel` + the ✕ in `.bannerExit` is drawn by nine
`BoardCol.tsx` files (every viewer game but letterboxed), each with the ✕
typed by hand — which `docs/deferred.md` already records as owed
(`<CloseButton>`), counting EIGHT games; setgame joined since. Options:
(1) `<HistoryBanner label onExit>` in this folder, the nine sites converted,
the deferred item closed; (2) only the ✕, game by game, as the deferred item
says (Joel, 2026-08-26: filed rather than swept, since each game has its own
pass); (3) leave. Recommend (1): the banner is the viewer's, the viewer is
this folder's, and the per-game ruling was about a sweep of games' files, not
about this area giving them a component. If (2) or (3), the deferred count is
still corrected.

**WORKED 2026-09-16, option (1).** Joel: *"your proposal is 'make the history
banner a component'. yes, absolutely."* `HistoryBanner.tsx` takes `label` +
`onExit`; ten `BoardCol.tsx` converted. `label` is a **ReactNode**, not a
string — scrabble's banner names a teammate with a `<Dot>` and comes out
pixel-identical with its expression moved across verbatim. What stays the
game's: its own label text, the host box, the `bannerHost` conditional, and
when to show it. Three games' `historyViewer.module.css` import went with the
markup (waffle, stackdown, wordle read nothing else from it).

**One visible change, on Joel's ruling**: letterboxed had no ✕ and let its label
wrap. It has a ✕ now and truncates — *"letterboxed should get an 'x' and it
should NEVER have allowed wrapping, so ellipsis-truncating is better."*

**The recorded prediction was wrong twice.** "The seven `*-history.e2e.ts` click
through by text (✕) — they should hold, and they are the proof": there are SIX
such files, and **none of them clicks the ✕** — they exercise the keystroke and
the click-away only. So the ✕ had no test at all while it was written out nine
times. `HistoryBanner.test.tsx` is new and covers it (the label renders as
given, the strip exits, the ✕ exits exactly once — verified by planting, which
fails the last when `stopPropagation` goes).

**`docs/deferred.md` is rewritten rather than closed.** The item was "the ✕ is
hand-written in eight games"; that condition is gone, and what remains is a
one-file look question — `<CloseButton>` is a `StandardButton` with a hover wash
and an `em` box, where the banner's exit is a bare glyph, so swapping it changes
how the ✕ reads in ten games and wants a look rather than a sweep.

### F-turn-log-15 · `three-components-one-file` · `TurnLog.tsx` exports three components; `TurnLogActor` has a file of its own

The `todo.md` Soon. `TurnLog`, `TurnLogBar`, `TurnLogNumber` share a file;
the fourth atom, `TurnLogActor`, does not. The todo asks for a look before a
split. Looked: all three earn their keep (eleven, eleven and ten readers), so
the `PlayAreaMountLog` answer — one no longer needed — is not available.
Options: (1) one file per component, matching `TurnLogActor`
(`TurnLogBar.tsx`, `TurnLogNumber.tsx`); (2) keep the family and say so in
`doc.md`; (3) the reverse — fold `TurnLogActor` in. Recommend (1): the repo's
"filename is the component" rule, and the folder already does it once.

**WORKED 2026-09-16, (2) AND (3) together — Joel: *"2. and we can move
turnlogactor in."*** `TurnLog.tsx` is the panel plus the row vocabulary
(`TurnLogBar`, `TurnLogNumber`, `TurnLogActor`), `TurnLogActor.tsx` is deleted,
and eleven games fold that import into the one they already had.

**The escape the todo hoped for was closed**, which is what settled it: the
`game-page` precedent (`PlayAreaMountLog.tsx`, resolved by finding one component
no longer earned its keep) is unavailable — `TurnLog` has 14 readers,
`TurnLogBar` 13, `TurnLogNumber` and `TurnLogActor` 11 each. All four are load
bearing, so the only real question was whether they are one vocabulary. They
are: a game imports them together, in one line, to write one `<tr>`.

**`HistoryBanner` stays out, and Joel's reason is sharper than the one I gave.**
I had it separate because it is not a row piece; he put it on the folder's actual
seam — *"it's about the history viewer and isn't related directly to the
turn-log, and it needs to be a file that clearly say 'history'."* So the split is
by CONCERN and the filenames announce it: `HistoryBanner.tsx`,
`useHistoryViewer.ts` and `historyViewer.module.css` all carry the word, against
`TurnLog.tsx` and `TurnLog.module.css`. That is written into `doc.md` → Details,
where the next reader of this folder meets it.

**The general rule is Joel's, and it is now in
[code-conventions.md](../../docs/code-conventions.md#component-names)** rather
than in this folder, since setgame (`Card.tsx`) and `members`
(`ActorMention.tsx`) have the same question open:

> *"in general, for rules about 'one file per component': in most cases,
> components should be separate files (clear case: InfoCol and BoardCol and
> PlayArea should always be separate files — they're large and complex). The
> 'subparts of a turn log' are used only by the TurnLog component and are
> relatively small and straightforward. that's why it's ok to package them
> together."*

So the test is **size and dependence, never subject**: a component that could be
looked for on its own gets its own file, however related it is. One clarification
went into the doc because a literal reading is false — "used only by `TurnLog`"
means used only *within* it; `TurnLogBar` and the rest have eleven callers each,
and every use site is inside a `<TurnLog>`.

### F-turn-log-16 · `stylesheet-name-eleven-importers` · `TurnLog.module.css` is read by eleven games and is named as one component's

The `todo.md` Soon and `deferred.md`'s cross-cutting item. Every game's log
imports it as `turnLog` and composes `turnLog.main` and friends — it is a
shared sheet in every way but its name. Options: (1) rename to
`turnLog.module.css` (eleven imports, the vocabularies guard's three
allowlist rows, `outcomes.md` and `playarea.md` mentions); (2) `composes:` —
a decision about the shape of the repo's CSS, which the deferred item says it
is, so it waits there; (3) leave. Recommend (1); it is the convention the
deferred item names, and it changes no pixel.

**WORKED 2026-09-16 — and the recommended rename was the wrong instrument.**
Joel asked how much of the file each side actually reads, and measuring it
changed the answer: of its 21 classes, **thirteen were read only by the
components** (`.turnLog`, `.turnLogBox`, `.turnLogTable`, `.bar`, `.barInner`
and its seven outcome variants, `.turnNumber`), **six only by the games**
(`.turnLogDivider`, `.main`, `.other`, `.primary`, `.entryHead`, `.entryCont`),
and two by both. One lowercase name would have declared thirteen
component-private rules "shared" in the same gesture that fixed six.

So it **split by reader** instead: `TurnLog.module.css` keeps what the
components draw (capital, and no game imports it), and
**`gameTurnLog.module.css`** — Joel's name, matching the eleven `GameTurnLog.tsx`
that read it — takes the row vocabulary.

**Both "shared" classes turned out to be one thing wearing a shared name.**

- **`.who` was never shared.** The measurement said "1 game", and the game was
  wordle — in a DOCSTRING. Its markup uses `<TurnLogActor>` like everyone else.
- **`.meta` was doing two jobs**: the turn number's column (seven games writing
  `<td className={turnLog.meta}>#{i + 1}</td>` by hand as the inert fallback) and
  de-emphasised text inside a row ("(no guesses)", a `Hint:` label, `3/12`, a
  reason after a word). It is two classes now — **`.turnNumber`** with the
  components, **`.muted`** with the games. Joel: *"`.meta` is a dumb name for the
  turn-numbers"*, and `.muted` earns its vagueness only where there is no
  consistent meaning.

**`<TurnLogNumber>` draws both cases now**, which is what let the column class
stay private. Joel: *"they're the same thing — just some can be clicked and some
can't."* Omitting `onShowHistory` renders the plain number, so the seven games
that hand-wrote the fallback each lost a branch, and `.turnNumber` /
`.turnNumberHandle` split by affordance exactly as he predicted: the handle adds
a hit target, a pointer and a hover, and nothing else.

**One class renamed, not seven.** The moved classes were already bare — the old
file's own header said composable classes keep bare names and let the import
alias namespace them. `.turnLogDivider` was the exception, a content class
wearing a structural prefix, so it is `.divider`.

**The guard moved the literals with their rules:** `vocabularies.test.ts`'s
`pending` rows for `1rem` (`.primary`) and `1px` (`.divider`) key on the new file
now, which it failed until they did.

### F-turn-log-17 · `near-for-help-rows` · Five games log a hint, a spoiler or a reveal as `near`

The `todo.md` Bug, ruled 2026-09-15: `near` is "almost right"; a hint, a
spoiler, a reveal or an unknown word is `warning`. psychicnum's hint and
reveal rows read `outcome="near"` (confirmed); stackdown, letterboxed, setgame
and strands are the others the todo lists, strands with its own argument for
`neutral`. The bar tokens for `warning` exist. Options: (1) work the five
now — this folder's bar is what draws the word, and the ruling is made;
strands' `neutral` case decided in the same pass; (2) each game at its own
area; (3) leave. Recommend (1).

**SKIPPED 2026-09-16 — it belongs to the `outcome-fix` area, scheduled out of
this finding at plan §3 row 39, ahead of `z-index`.** Joel refused the shape the
options offered: *"i don't want this to be anything like a search-and-place of
'near' to 'warning'."* The rule instead:

> *"the outcome should be determined ONCE in ONE PLACE. that place is often
> directly from the server… the server's outcome, if provided, is always right.
> … it should be impossible for a turn log entry to ever have 'near' or
> 'warning' or such if the determined outcome was 'lost'."*

**The wrong `near`s stay wrong on purpose** — Joel: *"we can use the
incorrect-near as a way to prove those get fixed in the 'outcome-fix' area."*
Converting them here would destroy the test case.

**The re-verification corrected the recorded list, which matters for the area
that inherits it.** It is FOUR games, not five: psychicnum (a hint row and a
reveal row), stackdown (hint / reveal), letterboxed (hint / spoiler), setgame
(every non-claim event). **strands was miscounted.** Its `near` is `hint_word` —
a valid non-theme word that EARNS hint progress, which is "progress but not the
goal", exactly what `near` is for. Its spent hint is a different row kind
entirely, on `neutral`, with a paragraph defending it. Nothing in strands is
wrong.

**And connections, which I first presented as the clean example, is the cause
rather than the cure.** It converts once at the row seam — the placement Joel
wants, its docstring even naming the PDF as a fourth consumer — but into
`GuessOutcome = Extract<Outcome, 'won' | 'near' | 'lost'>`, with a reverse
`RESULT_FOR_OUTCOME` that only type-checks because the set is narrowed. Joel:
*"ANY OUTCOME IS A VALID OUTCOME."* `docs/outcomes.md` already lists that type
as an open narrowing, and names the mechanism: a word made unsayable upstream is
why four games squeezed help into the nearest word that compiled.

### F-turn-log-18 · `viewing-and-description-both-passed` · Two props for one fact, in two games

psychicnum and codenamesduet take BOTH `isViewingHistory` and `historyLabel`
from their PlayArea, and their banner is guarded `isViewingHistory &&
historyLabel &&`. The two cannot disagree: both derive from `historyId` — the
flag is `historyId !== null`, and the label is `snap?.description ?? null` where
`snap` is non-null exactly when `historyId` is. Neither `describe` can return an
empty string (psychicnum falls back to `'This turn'`, codenamesduet always
builds `#N: …`), so the second term of the guard is dead. Found by Joel reading
the converted banner, 2026-09-16.

stackdown and letterboxed already show the shape that makes it impossible:
one prop, `historyLabel: string | null`, and `const isViewingHistory =
historyLabel != null` inside the column. Options: (1) the two games take one
prop, like the other two; (2) leave. Recommend (1) — the invariant becomes true
by construction instead of re-checked at the banner.

**WORKED 2026-09-16 — and it was never two games.** Joel: *"why are the games
different in how they handle this? it seems like the problem is much bigger than
2 games… we have a shared hook."* He was right; the hook was never the cause.
Every game gets the same five values from it and then invented its own way to
hand them down — **four different contracts for one feature**:

| how the flag reached the column | games |
|---|---|
| passed as a prop | codenamesduet, connections, psychicnum, scrabble, strands |
| derived from `historyLabel` | setgame, stackdown, waffle |
| derived from `historySnap` | wordle |
| never named — `historyLabel !== null` inlined SEVEN times | letterboxed |

So the recorded finding ("two games pass both") was a symptom. The finding is
that the viewer had no prop contract, and each game answered independently
because nothing said what to pass — against a rule `docs/playarea.md` already
states: *"a `BoardCol`/`InfoCol` prop that means the same thing in two games MUST
be spelled the same… Drift here causes real head-scratching."*

**The single rule, now written into that section: one prop says whether history
is open, and the flag is DERIVED, never passed.** All ten columns write
`const isViewingHistory = <that prop> !== null` at the top of the body, and no
PlayArea passes a flag. What the columns use it for was identical in all ten
before the change, which is why one rule covers them: the board's frame, the
input gate, the `historyBannerHost` class, and the banner's guard.

**Two exceptions that follow the rule rather than breaking it:** connections and
wordle take the whole `historySnap` (their board data comes out of it too) and
derive from that; scrabble takes `historyTarget`, its union of a past turn and a
peer preview, because its column owns the plays the label is built from. The rule
is the derivation, not which prop carries the answer.

**One thing had to be fixed first:** strands typed its label `string` and passed
`?? ''`, where everyone else passes `?? null` — so `!== null` would have been
permanently true there. Found by re-verifying rather than by the change failing,
since an always-open viewer type-checks perfectly.

### F-turn-log-19 · `history-names-say-history` · Nothing about the viewer said "history"

Joel, 2026-09-16, reading the converted files: *"a player is always 'viewing' a
board; the thing this describes is 'history viewing'"* and *"stuff like
'selectTurn', 'select', 'viewingId' are *bad*. things about history should make
that BRIGHTLY OBVIOUS."*

The hook's five members were copied into ten games under eight spellings —
`viewingId` / `viewingIndex` / `viewingSeq` / `viewTarget` for one value,
`select` / `selectTurn` / `setViewingIndex` for one function — and two games
(setgame, strands) kept the object where eight destructured, which made
codenamesduet's *"destructured to match the other games"* false as well.

**WORKED 2026-09-16**, to one rule of Joel's: **nothing about history or the
peer preview carries a name without `history` or `preview` in it.** The
vocabulary is now in `docs/naming.md` — `historyId`, `historyIdRef`,
`isViewingHistory`, `showHistory`, `exitHistory`, `historyLabel`, and
`onShowHistory` / `onExitHistory` as the props. What that reached:

- the hook and its interface; `act-exit-viewer` → **`act-exit-history`**
  (registry, dispatcher spec, e2e, six games' comments, `playarea.md`)
- `TurnLogNumber`'s per-row pair → `isOpenInHistory` / `onShowHistory`
- ten games' PlayArea / BoardCol / InfoCol / GameTurnLog / Board, their specs,
  and scrabble's `useSharedMove`
- the snapshot builders, which a PlayArea called with no hint of what they were
  about: `turnSnapshot` and strands' `snapshotAt` → `historySnapshot`,
  `TurnSnapshot` → `HistorySnapshot`, letterboxed's `chainAt` / `describeAt` →
  `historyChainAt` / `historyLabelAt`, wordle's `SnapshotRow` →
  `HistorySnapshotRow`, waffle's `boardAfter` → `historyBoardAfter`, and
  **scrabble's `boardUpToSeq` in `lib/play.ts` → `historyBoard`** — the one that
  lives in no file named history and was the easiest to read as ordinary play
- the CSS: `.frame` → `.historyFrame`, `.viewedNumber` → `.historyNumber`, the
  four banner classes → `.historyBanner*`, `.sharePreview` → `.peerPreview`, and
  eight games' own `.viewedTile` / `.viewedCell` / `.viewedRow` / `.viewed` →
  `.historyTile` / `.historyCell` / `.historyRow`
- the tokens: `--view-history-color` → `--history-color`,
  `--view-history-banner-color` → `--history-banner-color`,
  `--view-sharePreview-color` → `--peer-preview-color`, and `--viewer-accent`
  → `--history-accent` (the one that named neither)

**scrabble keeps one local distinction**, which the rule allows: its hook value
is a union, so it aliases `historyId` to `historyTarget` and its shared-move
branch is `peerPreview` (was `viewShared`). The derived `historyId` it hands the
log is the open turn's `seq`.

**The `highlight*` family, 2026-09-16, after Joel read a converted props block.**
Seven games passed the viewed turn's marks under names that said nothing —
`highlightTiles` / `highlightOutcome` (connections), `highlight` (codenamesduet,
waffle, strands, setgame), `highlightWord` (psychicnum), `highlightRow` (wordle)
— with the docstring opening `Turn-history:` because the name would not. Two
more spelled the same idea differently and so escaped the first list:
**stackdown's `green`** (its history ring, named for its color) and **scrabble's
`viewingCells`**. They are all `historyLit*` now:

- `historyLitTiles` (connections, codenamesduet, waffle, strands, stackdown,
  scrabble), `historyLitCards` (setgame — its pieces are a real `Card` type, and
  the tiles rename waits for setgame's own area), `historyLitWord` (psychicnum),
  `historyLitOutcome` (connections' tint), and **`historyLitBoardRow`** (wordle
  — Joel's catch: a bare `Row` reads as a turn-log row)
- connections' locals `isViewed` / `VIEWED_TINT` → `isHistoryLit` /
  `HISTORY_LIT_TINT`; codenamesduet's `NO_CELLS` → `NO_TILES`
- **stackdown's `highlight` is the LIVE flash** and stays live: it is `flashTiles`
  now, which is what it was, and it no longer collides with the seven above

**`Lit` over `Highlight`, Joel's call:** *"'highlight' is both a verb and a noun,
and therefore doesn't communicate well"* — `historyHighlightTiles` could be read
as an instruction, `historyLitTiles` can only be a list. It is not a new word
either: boggle's PlayArea, its spec and `RankBar`'s all already say a tile is
"lit".

**Two things Joel ruled out of it:** `HistoryBanner`'s own props stay `label` /
`onExit` (the component's name carries the word), and `history.historyFrame` at
the call sites is fine — *"history.historyFrame is great."*

### The meaning-based sweep — F-19's unfinished half

**Why a per-game read and not a sweep.** The rename above was built from
spellings, so anything spelled otherwise survived. One of the three misses had
NO clue in its name at all: stackdown's history ring was called `green`. Nothing
in `green`, `highlight`, `snap` or `renderBoard` tells a grep what it is about,
and no cross-game list of identifiers can find them. What finds them is starting
at the hook and following what comes out of it — and that path is per game
(`historyId` → that game's snapshot builder → its own props → its own board and
stylesheet). The two greps (`view`, `highlight`) stay useful as a BACKSTOP after
each read; used as the method they are what produced the incomplete rename.

**What "read end to end" means**, so every row below means the same thing:

1. the `useHistoryViewer` call in `PlayArea`, and every local derived from what
   it returns;
2. every prop those values travel through — `BoardCol`, `InfoCol`, `Board`,
   `GameTurnLog` — **including ones whose names give no hint**;
3. that game's `lib/history.ts` (scrabble: `lib/play.ts`) — every export, and
   every field of its `HistorySnapshot`;
4. the classes its stylesheets apply while viewing;
5. then `view` and `highlight` grepped over that game only, to catch what the
   read missed.

Folded into the same pass, since the files are open: the `/**`-on-props fix
(a member of a declaration takes `//`), and any prop docstring still opening
`Turn-history:` where the name now says it.

**Must NOT move**, the opposite trap: `viewerFinished` (codenamesduet — "viewer"
there is the PERSON), `viewport`, `viewBox`, `DefinitionView`, `is_current_view`.

The four games whose names already turned out to be lying go first.

- [x] **stackdown** — read 2026-09-16. Five things, and only one was findable
      by any pattern:
      - **`snap`** → `historySnap`. The snapshot local says nothing; it is the
        same name in every game, so expect it in all ten rows.
      - **`HistorySnapshot.description`** → `historyLabel`, so the field and the
        prop it feeds match end to end (the highlight batch matched the lit-tile
        fields and left this one).
      - **`flashTiles` was a collision I made.** The highlight batch renamed
        `Board`'s live-flash prop `flashTiles` — which is already the name of the
        `useFlash` TRIGGER eleven lines above the call site in `BoardCol`, so one
        word meant a set and a function in one file. The prop is `ambiguousTiles`
        now, which is what those tiles are (`AMBIGUOUS_PICK_FLASH_MS`).
      - `const { historyId: historyId, … }` — a self-alias the rename left.
      - the `/**`-on-props pass: 22 members across `Board.tsx` and
        `BoardCol.tsx`, and two docstrings still opened `Turn-history:` where
        the name now says it.
      Clean: `GameTurnLog`, `InfoCol`, the stylesheets, and the backstop greps
      (every remaining `viewed` / `viewing` in the game is prose).
- [x] **scrabble** — read 2026-09-16. Six things:
      - `viewTurn` → `historyTurn`, `viewedPlay` → `historyPlay` (the two known);
        `sharedTent` → `peerPreviewTent`; `snap` does not appear here — scrabble
        computes its board inline as `renderBoard`.
      - **`kind: 'shared'`** — the union's peer-preview branch said neither
        history nor preview. It is `kind: 'peerPreview'`, matching the
        `.peerPreview` class and `--peer-preview-color` the batch already set.
      - **`historyLitTiles` → `historyLitCells`, and this is the batch getting a
        noun wrong.** scrabble's board squares ARE cells in its own vocabulary —
        `greenCells`, `redCells`, `cellIndex`, `data-cell`, `NO_CELLS` — so the
        batch's `Tiles` made the one prop in that family read as a different kind
        of thing. A tile in scrabble is the lettered piece you place ON a cell.
      - **A stale color claim, the same species as the yellow sweep:** `Board`'s
        `isViewingHistory` said the replay wears a "green frame". It wears the
        shared history frame, which is blue; green is the outline on the cells
        that turn played.
      - the `/**`-on-props pass: 18 members across `Board.tsx` and `BoardCol.tsx`.
      - **The stackdown todo's question is confirmed here**: `hover`,
        `greenCells` and `redCells` are three live marks blanked at the call site
        on `isViewingHistory`, the same shape.
      - **`turnSummary` → `historyLabelFor(play, nameOf)`.** One caller, and it
        is the history banner's label; its docstring said "the turn-viewer banner
        line" while its name said nothing. It is scrabble's stand-in for the
        `historyLabel` every other game returns from its snapshot — built at the
        banner because `plays` already lives in that column.
      - `historyPlay` → **`historyPlayRow`** (Joel: the type is `PlayRow`, and
        "play" alone reads as a verb — the same test that chose `Lit` over
        `Highlight`).
      Filed in scrabble's todo, found by the read: `PlayArea`'s `moveText` is a
      SECOND copy of `historyLabelFor` for the print table, marked SPIKE in its
      own comment — the banner and the printed sheet being the two places a
      player reads a turn back.
      Considered and LEFT: `renderBoard` (`historyTurn ? historyBoard(...) :
      board`) is genuinely the live board when not viewing — the documented
      "board to show" contract, like stackdown's `offBoard`. And the SENDER side
      of show-a-move (`useSharedMove`, `shareMove`, `SharedMovePayload`,
      `sharerId`) is a transport of its own, not the preview: the preview is what
      the receiver draws.
- [x] **codenamesduet** — read 2026-09-16. Five things:
      - `viewedClue` → `historyClue` (the known one); `snap` → `historySnap`;
        `HistorySnapshot.description` → `historyLabel`, the same end-to-end match
        stackdown needed.
      - **`.historyCell` → `.historyTile`**, the mirror of scrabble's lesson:
        follow the GAME's noun. codenamesduet's board squares are tiles in its
        own stylesheet (`.overlayTile`, `.tileKey`, `.tilePending`), so the class
        was the outlier and `historyLitTiles` was already right. scrabble went
        the other way for the same reason (`greenCells`, `redCells`), which is
        the rule: the noun is the game's, not the sweep's.
      - the `/**`-on-props pass: 21 members, and this game needed the converter
        WIDENED — its `Board` declares `type Props = { … }` where the others use
        an inline literal, so the first pass silently converted nothing there.
      - four `Turn-history:` prefixes dropped where the name now says it.
      Clean: `InfoCol`, `GameTurnLog`'s body, the backstop greps. `viewerFinished`
      is here and stays — its "viewer" is the PERSON, the trap the plan names.
- [x] **strands** — read 2026-09-16. Four things:
      - `snap` → `historySnap`, `HistorySnapshot.description` → `historyLabel`,
        and the hook's return was kept whole as `viewer` → **`historyViewer`**
        (this game and setgame are the two that do not destructure).
      - **`.discViewed` → `.ringHistory`, and the family split with it.** Joel,
        mid-read: unless the CSS separates the circle from the border around it,
        the word should be tile rather than disc. It DOES separate them, and the
        names were not tracking it — four of the eight `disc*` classes are
        `fill:` at `r=0.38` (they ARE the disc) and four are `fill: none` +
        `stroke:` at `r=0.42–0.47` (a ring OUTSIDE the disc, as `discLastRing`'s
        own comment said). So the fills keep `disc*` and the rings became
        `ringLast` / `ringHistory` / `ringAmbiguous` / `ringHint`.
      - the `/**`-on-props pass: 19 members.
      - `cssClasses.test.ts` caught what the read missed: `e2e/strands-typing`
        selects `circle[class*="discAmbiguous"]`, which would have waited for an
        element that could never appear and failed as a timeout reading like
        flake.
      Left, per the plan: `hintCoords` is a hint, not history — and the board
      draws a hint's ring and the history ring with the same vocabulary on
      purpose ("these cells, no claim about order").
- [x] **connections** — read 2026-09-16. Four things:
      - `snap` → `historySnap` (a PROP here as well as a local — `BoardCol` takes
        the snapshot itself), and `HistorySnapshot.description` → `historyLabel`.
      - **A stale yellow the sweep missed**: `GameTurnLog`'s `historyId` said its
        `#N` handle "wears the shared yellow ring". The yellow sweep is grep-based
        and line-based, and the words "history" and "viewer" were on the line
        ABOVE this one — exactly the miss a read catches and a pattern cannot.
        (Checked the whole repo again afterwards: it was the last one.)
      - the `/**`-on-props pass: 34 members across `Board.tsx` and `BoardCol.tsx`,
        the most of any game so far.
      - three `Turn-history:` prefixes dropped, and `HISTORY_LIT_TINT`'s
        docstring rewritten around the name it has now.
      Left, correctly: `boardView` is the live derived board, and `viewerTrack`
      in `pdf/model.ts` is the PERSON — the second instance of that trap after
      codenamesduet's `viewerFinished`.
- [x] **wordle** — read 2026-09-16, and the quietest row so far: no name was
      lying, only under-saying.
      - `snap` → `historySnap` (a prop here too, as in connections), and
        `HistorySnapshot.description` → `historyLabel`.
      - the `/**`-on-props pass: 22 members; six `Turn-history:` prefixes
        dropped where the name now carries it (the one left is a section
        header, which is prose doing its job).
      Its `BoardCol` is the shape the others could copy: it takes `historySnap`
      alone and derives `const isViewingHistory = historySnap !== null` rather
      than being handed both — the thing F-18 is about in psychicnum and
      codenamesduet.
- [x] **waffle** — read 2026-09-16. Nothing lying here either:
      - `snap` → `historySnap`, `HistorySnapshot.description` → `historyLabel`,
        and a second `const { historyId: historyId, … }` self-alias (stackdown
        had the other — both are the rename's own litter).
      - the `/**`-on-props pass: 25 members; four `Turn-history:` prefixes
        dropped.
      - three comments described `historyLitTiles` as "the cells the viewed swap
        moved" — the noun the deferred cell/tile sweep is about, but here it sat
        directly on a prop named `…Tiles`, so the comment now matches the name
        beside it. The other ~141 `cell` identifiers in this game are the
        sweep's, not this row's.
- [x] **psychicnum** — read 2026-09-16. `snap` → `historySnap`,
      `HistorySnapshot.description` → `historyLabel`, the `/**`-on-props pass
      (27 members), and five `Turn-history:` prefixes. No stray `view`
      identifier at all — the only game with a clean grep on the first pass.
      This is one of F-18's two games: its `BoardCol` takes `isViewingHistory`
      AND `historyLabel`, and guards the banner on both.
- [x] **setgame** — read 2026-09-16, and the row that caught the sweep's own
      worst mistake:
      - **`isViewingHistory` held a SNAPSHOT.** The bare-`viewing` pass renamed
        every local `viewing` to `isViewingHistory`, and this game's `viewing`
        was `historyId === null ? null : historySnapshot(…)` — an object, not a
        flag. So the file read `isViewingHistory ? isViewingHistory.historyLitCards
        : ring`. It is `historySnap` now. A boolean name on an object is worse
        than the vague name it replaced, and only reading the line caught it.
      - `viewer` → `historyViewer` (this game and strands keep the object), and
        `HistorySnapshot.description` → `historyLabel`.
      - **`hinted` → `ringed`.** The prop takes EITHER the live hint's cards or
        the history-lit ones, so it named one of its two causes — and `hint` is
        reserved in this repo for priced help, which the history ring is not.
        `ringed` names the mark.
      - the `/**`-on-props pass: 9 members.
      Filed in setgame's todo, found by the read: a viewed past turn is ringed
      in `--setgame-hint-ring` (a green) rather than the shared `--history-color`,
      so its frame and `#N` say history while its cards say hint. A look
      decision, not a naming one.
- [x] **letterboxed** — read 2026-09-16, the last row. Three things:
      - a THIRD `historyId: historyId` self-alias (stackdown and waffle had the
        others) — the rename's litter, three games' worth, all found by reading.
      - **`.snapshot` → `.historyFramed`.** The grouping box around the chain
        strip and the board exists for one reason, which its own comment states:
        *"it exists so ONE viewing outline can wrap both"*. Its name said
        neither history nor what it does.
      - the `/**`-on-props pass: 17 members across `Board.tsx`, `BoardCol.tsx`
        and `ChainStrip.tsx` — and `ChainStrip` is the second leaf below a Board
        to need it, after setgame's `Card`.
      No `snap` local here: letterboxed has no snapshot object, just
      `historyChainAt` / `historyLabelAt`. Left, like the other games' "board to
      show" values: `shownChain` is the live chain when not viewing.

**The sweep is done: all ten rows read.** Two guards caught what the reads
missed, both by the shrinking-allowlist pattern: `cssClasses.test.ts` found the
e2e selector strands' rename broke, and `orphanedDocstrings.test.ts` failed
because `setgame/components/Card.tsx › flash` — a known orphan it had been
carrying — was fixed during the setgame row and its allowlist line went stale.
That line is deleted.

**What the ten rows add up to**, which is the argument for reading over
grepping: the pattern pass found `viewing*`/`viewed*`/`select*`, and the reads
found ten more names it could never have reached — `green` (stackdown's history
ring), `viewingCells`, `turnSummary`, `sharedTent`, `kind: 'shared'` (scrabble),
`.discViewed` (strands), `hinted` (setgame), `.snapshot` (letterboxed), plus a
`snap` local in six games and three `historyId: historyId` self-aliases the
rename itself left. It also found two things that were WRONG rather than vague:
setgame's `isViewingHistory` holding a snapshot object, and scrabble's Board
claiming a "green frame" for a blue one.

The known four are listed as each row's starting content deliberately, and are
NOT fixed ahead of the read — a read graded against a list finds the list.

**How it was done, since a repeat would want the same care:** the identifier
renames ran through a comment-aware pass so prose could be reviewed separately
— but the pass treats a string literal as code, and it clobbered twelve of them
(four `it(…)` titles, two `aria-label` lookups, a `FeedbackMessage.note` text
and four e2e screenshot paths), all restored by hand. `cssClasses.test.ts`
caught the one call site the class rename missed (`HistoryBanner` imports the
sheet as `styles`, not `history`). And `git ls-files` skips UNTRACKED files, so
the three files this area had just written were silently absent from every
sweep until `git add -N`.

### F-turn-log-20 · `board-is-shown-says-nothing` · The picker's history gate is named for its premise, not its answer

`useTurnLogPlayerPicker` returns `boardIsShown`, and F-19's rule reaches it:
every consumer is a history decision, and the name mentions neither history nor
the decision. Seven games gate on it, all in the same shape —

    {who.boardIsShown ? (
      <TurnLogNumber n={i + 1} isOpenInHistory={…} onShowHistory={…} />
    ) : (
      <td className={turnLog.meta}>#{i + 1}</td>
    )}

— and the two that key a turn by a stable id say in their docstrings that they
IGNORE it (codenamesduet by `turn_number`, scrabble by `seq`), which is the
tell: a value whose documentation is about who does and does not consult it for
one purpose is named for that purpose. `boardIsShown` states the premise ("the
board is showing these rows"); what a caller wants is the answer.

Options: (1) `canOpenHistory` — the question the call site asks, and `can…`
cannot be read as anything but a boolean; (2) `historyIsAddressable` — truer to
the mechanism (a filtered log's row 3 is not the board's turn 3) and clumsier;
(3) leave. Recommend (1). The doc.md Details paragraph "`boardIsShown` is false
more often than it looks" moves with it, as does `playarea.md` → Whose turns?,
which explains it under that name.

### F-turn-log-21 · `turn-number-is-the-history-control` · The `#N` handle's three names say "turn number", and one of them exists only for the viewer

`TurnLogNumber`, `.turnNumber` and `data-turn-number` are the component, the
class and the DOM marker of one thing. They divide differently than the names
suggest:

- **`data-turn-number` has exactly one functional reader**, and it is the
  history hook: `useHistoryViewer`'s click-anywhere-to-exit does
  `closest('[data-turn-number]')` to tell "the user is selecting a turn" from
  "the user clicked away". Nothing else in `src/` reads it; the three
  `*-history.e2e.ts` that use it as a selector are driving the viewer. It is a
  history mechanism wearing a name about numbering.
- **`TurnLogNumber` and `.turnNumber` are more arguable.** The cell is a turn's
  number in every game; what makes it a CONTROL is the history viewer, and when
  `boardIsShown` is false the games render a plain `<td>` instead — so the
  component is "the number, as a handle" and the class styles the handle.

Options: (1) the marker alone becomes `data-history-handle` (one hook, one test,
three e2e selectors) and the component and class stay — the split the code
actually has; (2) all three take history names (`HistoryHandle`,
`.historyHandle`, `data-history-handle`), which reads better in
`useHistoryViewer` and worse in a game's log, where the cell really is the turn
number; (3) leave. Recommend (1).

### F-turn-log-22 · `four-props-one-handshake` · Every game wired the same four props out of the picker by hand

Joel, 2026-09-16, reading F-6: *"if all the games with a turn-log pass the same
kind of filtering header-row, should any of that move into turnlog component?"*

The CONTROL was already shared — `useTurnLogPlayerPicker` owns the `<select>`,
its per-mode default, the filter, `boardIsShown` and the honest empty wording,
and no game re-implements any of it. What was not shared was the handshake: ten
of the eleven `<TurnLog>` call sites were byte-identical apart from the heading
string.

    <TurnLog
      heading="Guesses"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      entryCount={shown.length}
    >

Four of the five props were mechanically derived from `who` and `shown` in every
game. That is not duplicated logic, it is a repeated handshake — and it is the
kind that bites: **F-9, the area's only real bug, was a mis-wired one of these
four**, six games passing the rows array where a count was wanted.

**WORKED 2026-09-16.** `<TurnLog heading who shown>`, with `entryCount?` as the
one escape hatch. What the research had to establish first, because it decides
the shape: `shown` CANNOT move inside the panel. Nine games build it with
`who.filter`, but scrabble filters by hand (a bot's play has `user_id: null`, so
a row's identity is `user_id ?? ai:<seat>`) and codenamesduet filters TURN
NUMBERS rather than rows. So the game keeps computing it and the panel reads its
length — which is also what makes F-9's bug impossible by construction: you
cannot pass an array where a count is wanted, because the array is what is
wanted.

- `picker: { dropdown: ReactNode; emptyText: string }` — structural, so any
  `TurnLogPlayerPicker<R>` satisfies it whatever `R` is.
- `entryCount = shown.length` by default; codenamesduet overrides it, with its
  existing reason moved onto the override.
**The naming took three passes, all Joel's.** The prop was `who` first, because
ten games called the local that — and `who` is wrong for an object that is a
dropdown, a filter, two flags and a line of text. Then `picker`, which collided
with the hook's own member for the visible control (`picker.picker`). Where it
landed:

- the hook's member is **`dropdown`** — what a reader sees on the heading row.
  (`control` was proposed and rejected: *"'control' is such a generic word"*.)
- the panel's prop is **`picker`**.
- the games' local is **`turnLogPicker`**, not `picker` — Joel: *"i want the
  game code to be readable, and given that we get this from a hook called
  'useTurnLogPlayerPicker', why are you avoiding putting the name turn log in
  it?"* The honest answer was length, which is not a reason. So a game reads
  `turnLogPicker.filter(guesses)` and `picker={turnLogPicker}`, and `turnLog`
  (the stylesheet alias) sits beside it without either being ambiguous.

**A raw regex for the local clobbered nine lines of prose**, in five games,
where `who` meant the WHO COLUMN or a person — "the answer to 'who guessed
what?'", "the person who went looking for it". The comment-aware pass exists
precisely for this and I did not use it. Restored by hand, and worth the
reminder: the rename helper skips comments, `re.sub` does not.

**It closes F-6 and F-7**, which were both about props that no longer exist.

**A spec of mine was passing for the wrong reason, and this caught it.**
`TurnLog.test.tsx` found the scroll box with `section > div` — true only while
the heading row was conditional and absent (the spec passed no `headerAction`).
With the row unconditional, that selector returns the HEADER, and "leaves a
scrolled-up box alone" was asserting that a header does not scroll. The helper
takes `:nth-of-type(2)` now, and the planting was redone against the fix.

## What checked out

- The `<span>`-not-`<button>` rule for `#N` is the same in `TurnLog.tsx`, the
  stylesheet and `ui.md`'s `handle` kind, and the reason (Space is the exit)
  holds against `useHistoryViewer`.
- `historyIdRef` (was `viewingIdRef`) has its one promised reader (scrabble's
  BoardCol, via its PlayArea); `competeSharesOneGame` its two (scrabble,
  setgame); `boardIsShown` is read by every position-keyed game; `.entryHead` /
  `.entryCont` by exactly the two multi-row logs (codenamesduet, connections);
  `.peerPreview` (was `.sharePreview`) by scrabble.
- All eleven logs put `.turnLogDivider` on the turn-start row; all eleven pass
  the picker as `headerAction` and its `emptyText`.
- Every token the two stylesheets read resolves in `daylight.css`, and the
  bar has a class per outcome word, `error` included.
- The picker returning a ReactNode from a hook is deliberate and explained
  (six things travel together); the tests pin the vocabulary, the late-roster
  re-derivation and the honest empty line. 25 tests, green.
- The mobile rule (opening a turn leaves the info page) is stated the same
  way in the hook and in `playarea.md`.

## Notes

- `docs/playarea.md` → Turn-history viewer says "the framed board … input
  frozen" and the stylesheet says the input stays MOUNTED under the banner so
  an in-progress entry survives. Both are true (frozen to the eye, alive
  underneath); worth one sentence in `doc.md` so nobody "fixes" either.
- "Owed: a screenshot of wordle's turn-log hover, which needs Playwright" is
  written under a closed area's summary in the plan; it is a gallery item, not
  this folder's, and stays where it is.
- `docs/outcomes.md` tells the `TurnOutcome` story correctly and names
  `TurnLog.module.css`; F-16's rename would touch it.

## Predicted test breaks

**Still ahead.** F-6, F-7 and F-8 change the panel's props: `tsc -b` fails at
every `<TurnLog>` site that stops matching (eleven files). F-13 changes nothing
observable. F-16 renames a file the vocabularies guard names three times (its
`pending` rows) and that `outcomes.md` / `playarea.md` link — the link guard
catches the docs, the stamp guard needs `git mv`. F-17 changes the word five
games' logs paint; any per-game spec asserting `near` on a help row moves with
it.

**What actually happened, for calibration.** F-9 did fail `tsc` at all eleven
sites as predicted — but the prediction's "no runtime spec" was itself the
finding (`TurnLog.test.tsx` is new). F-14's prediction was wrong twice: there
are SIX `*-history.e2e.ts`, not seven, and none of them clicks the ✕, so they
proved nothing about it. F-19 was caught by two guards nobody had predicted —
`cssClasses.test.ts` on an e2e selector, and `orphanedDocstrings.test.ts` on an
allowlist line that went stale when a fix landed.

## Closing

- [ ] the whole area re-read in one sitting after the last group — with the
      effect-name grep over every file touched
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED` (the
      prose pass, 2026-09-16)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
