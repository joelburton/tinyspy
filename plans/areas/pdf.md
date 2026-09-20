# Area: pdf

The folders it reads: `pdf`, plus `shared/wordle-style/pdfTiles.ts`. The
process is [app-audit.md](../app-audit.md) §4; the plan holds the order, this
file holds the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPENED 2026-09-19.** Roster listed and agreed the same day; eleven
files stamped `cs-met-pdf`. Opened ahead of its position because `psychicnum`
paused pre-close on it: that game's printer builds on this folder, and Joel
wants the shared printer read before he blesses the game.

**The audit READ is DONE (2026-09-19).** Every roster file read end to end —
the ten in `src/common/pdf/`, `pdfTiles.ts`, the three markdown files — and
the evidence beside them: all fifteen `print<Game>Pdf.ts` files that call this
folder, the three `PlayArea.tsx` sites that call `buildWordSections`, the
`@media print` rule, the action registry's two print labels, jsPDF's own
docstring for its one-argument gray. Baseline at the read: `tsc -b` clean,
lint clean, 30 of 30 unit tests green in the folder, every roster stamp now
`cs-audited-pdf`. **Seventeen findings, F-pdf-1 to F-pdf-17; nothing in the
code moved at the read.** Four are the agreed collapse of `docs/pdf.md` and
what it turned up (F-1 to F-4); five are prose in the code (F-5 to F-9); five
are shape or behavior with a decision in them (F-10 to F-14); one is a bug
with an obvious fix (F-15); two are tests (F-16, F-17). The audit is committed (`0612f17f`).

**The prose pass is DONE (2026-09-19, uncommitted):** F-5 to F-8 shipped in
one sitting — the marker pass over every member, the six module blocks
dissolved onto their exports or into `//`, the rationale moved to the new
`doc.md` (lede, `## Intro to area`, `## Details`; `common/pdf` off
`INTROS_OWED`), the caller claims replaced by conditions, the three brands
replaced by codenames. `tsc -b` clean, lint clean, 44 of 44 green (the folder
plus the four guards). Committed (`c30d52b7`).

**The collapse is DONE (2026-09-19, uncommitted):** F-1 to F-3 shipped on
Joel's three rulings — `docs/pdf.md` deleted, the folder's `doc.md` carries
the design language, the Setup rows went to `setup-form/doc.md`, the setgame
hatch story to `docs/games/setgame.md`, seventy-odd cites repointed.

**All seventeen findings are SETTLED (2026-09-19)**, each ruled by Joel and
committed apiece, F-17 uncommitted at this writing. The roster is fourteen
stamped files (`fakeJsPdf.ts`, `columns.test.ts` and `pdfTiles.test.ts`
joined), all `cs-audited-pdf`. What the area still owes: the whole-area
re-read in one sitting (Closing), then `todo.md` — then the blessing, which
is Joel's.

## The roster

Agreed 2026-09-19. Eleven stamped files, three unstamped markdown files.

- **`src/common/pdf/` — ten files**, all `cs-unmet` at the opening and now
  `cs-met-pdf`: `frame.ts` + `.test.ts`, `columns.ts`, `wordColumns.ts` +
  `.test.ts`, `wordSections.ts`, `wordListBody.ts`, `eventLog.ts` + `.test.ts`,
  `marks.ts`. **Plus `fakeJsPdf.ts` (F-16) and `columns.test.ts` (F-17),
  created 2026-09-19** — a created file joins the roster.
- **`src/shared/wordle-style/pdfTiles.ts`**, `cs-unmet` at the opening and now
  `cs-met-pdf`. It lives in a shared family's folder and is read HERE (Joel,
  2026-09-19: *"add"*), because what it does is print. `shared/wordle-style`
  is therefore named by two rows of the plan's table, and both rows say so.
  **Plus its `pdfTiles.test.ts`, created by F-17 (2026-09-19).**
- **The folder's `doc.md` and `todo.md`**, and **`docs/pdf.md`** — roster, and
  none of the three carries a stamp (a `.md` has nowhere to put one).
  `todo.md` is empty: five headings, no items.

**Not the roster, and why:**

- **The sixteen games' `pdf/` folders** (`model.ts` + `print<Game>Pdf.ts`) are
  each game's own files, audited in that game's area and read here only as
  evidence.
- **The fifteen `e2e/*-print.e2e.ts` specs** are the same: each is audited with
  its game. This area may RUN them — that is what they are for — whenever it
  refactors something shared or moves the seam between a game and this folder
  (Joel, 2026-09-19).

## Planned work, agreed at the opening

- **`docs/pdf.md` collapses into `src/common/pdf/doc.md`** (Joel, 2026-09-19:
  *"we'll be collapsing this in the doc.md in this area as part of this
  area"*), the way `docs/games/psychicnum.md` was absorbed by that game's
  `doc.md`. Inbound links get repointed and `src/guards/docLinks.test.ts`
  catches what a grep misses.

## Findings

*(`F-pdf-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-19

What the folder IS, for the record: one frame every printer opens with
(`newPrintDoc` → `drawHeader` → … → `savePrint`), three body families that
compose it (`eventLog.ts` the newspaper flow, `columns.ts` one track per
board, `wordListBody.ts` over `wordColumns.ts` + `wordSections.ts` the
balanced word list), and two mark vocabularies drawn from line segments
because the core fonts are WinAnsi (`marks.ts` ✓ ✗ –; `pdfTiles.ts` the four
Wordle states as border and fill weight). The code held up: the geometry is
right, the fakes model jsPDF closely enough to pin the cursors, and the
families are genuinely different shapes. What has drifted is every sentence
ABOUT the callers — the folder was written for five games and now serves
fifteen, and its prose still names the five.

### SHIPPED · F-pdf-1 · `doc-collapse` · `docs/pdf.md` collapses into `doc.md`, and the doc's own structure is broken

**Ruled and shipped 2026-09-19** (Joel: *"1. ok, but very brief: any details
will be in the games' docstrings or doc.md (if needed) 2. split 3.
setup-form"*). `docs/pdf.md` is deleted. `src/common/pdf/doc.md` carries the
design language in named sections after the intro and Details — Shades,
Color is for meaning, Backgrounds are white, The frame, The body families
(event log · tracks · word list · the crosswords exception, in that order),
Which games print (a `game · family` roster, one clause each), Characters,
Plumbing. The setgame hatch story moved to `docs/games/setgame.md` → Print to
PDF, and the two lessons that generalize stayed under Details. The Setup rows
section moved to `src/common/setup-form/doc.md` → Setup rows (a closed area,
edited — closed is not locked), with the archaeology and the stale bananagrams
claim dropped and its three brands made codenames; that folder's Details
bullet points at it. `docs/deferred.md`'s print section is gone, the
CLAUDE.md docs-table row points at the folder, the plan's row says so.
Seventy-odd cites repointed by exact-string replacement — a sweep, no stamps
moved. `docLinks`, `americanSpelling`, `folderDocs`, `csStamps`,
`setupRows` green; `tsc -b` and lint clean.

**Carried verbatim, on purpose:** the "✓ good / ✗ bad" sentence now sits in
`doc.md` → Color is for meaning, unchanged, because F-4 is its own decision.

The agreed work. What the read found in the 438 lines that the collapse has
to resolve rather than carry:

- **Two sections are numbered "Body family 3"** — the track games and the
  crosswords exception — and the families are told in the order 3, 1, 2, 3.
- **A wordiply paragraph is spliced into the general description** of the
  two-column flow mid-sentence ("…any future log-only game can do the same.
  Its terminal blocks … stack above the log. Letter page, two columns,
  newspaper flow: the board (+ the summary) sits at the top…"). The two halves
  are different subjects.
- **The module table's "used by" column is a census, and every row of it is
  wrong today** (F-2). The column goes; a row says what the module does and
  what shape a caller passes.
- **The per-game table** (sixteen rows, a notes column of per-game design)
  is the biggest block in the doc, and most of a row is that game's business
  — where its board goes, why its family, what it prints at terminal. Each
  game's doc carries the same story.

**Decisions in the collapse:**

1. **The per-game table.** *Keep the table in `doc.md` as a family roster*
   (game · family · one clause), and leave the design prose to each game's
   doc as its area opens — or *keep the notes column as it is* until the games
   are audited. Recommendation: the roster form now; a game area that opens
   later finds its story in its own doc, which every game already has.
2. **The setgame hatch section** (40 lines). setgame's own printer docstring
   carries the whole story a second time, and `docs/games/setgame.md` points
   here for it. *Move the section to `docs/games/setgame.md`* (its owner; the
   printer's docstring then shrinks to a pointer, at setgame's area) — or
   *cut it to the two lessons that generalize* ("convert the screen's path;
   don't redraw it", "equal slots aren't equal weight") under `## Details`,
   and repoint setgame.md at setgame. Recommendation: both halves — the
   two lessons stay here, the setgame story goes to setgame.
3. **The "Setup rows" section.** `setup-form`'s audit (F-setup-form-5) ruled
   the rule LIVES in `docs/pdf.md` and pointed `setupRows.ts` at it. The
   collapse moves it to `common/pdf/doc.md` under the same heading, and the
   four pointers (`setupRows.ts`, `setup-form/doc.md`, `docs/playarea.md`,
   `src/guards/setupRows.test.ts`) follow. *Or* it moves to
   `setup-form/doc.md` now that folder has a doc of its own — the rule is
   about what a recap ROW is, and the paper is one of its two readers.
   Recommendation: `setup-form/doc.md`, since a printer that omits a row and
   a disclosure that omits it are the same defect, and the guard that catches
   it is the recap guard.
4. **The crosswords exception** stays as a short named section: it is the
   one printer that composes nothing here, and the doc has to say so or a
   consistency pass "fixes" it. "(plan decision 7)" and the `~/src/crossplay`
   path go; the reason stays in its own words.
5. **Inbound links.** The CLAUDE.md docs table row; `docs/deferred.md` →
   "Printing to PDF — which games get it" (it says "nothing outstanding" and
   cites two anchors — the section is deleted); the anchors from
   `docs/games/*.md` (setup-rows ×5, backgrounds-are-white ×2, shading-on-paper
   ×1) and `docs/playarea.md`; and the forty-odd `docs/pdf.md` cites in `src/`
   (the setupSummary headers, the PlayArea print effects, the printers). A
   cite repoints to `common/pdf/doc.md` — or, where the sentence already
   carries the reason, just goes. `docLinks.test.ts` catches a dead path and a
   dead anchor; the prose cites need the grep.

### SHIPPED · F-pdf-2 · `stale-claims-in-the-doc` · sentences in `docs/pdf.md` that are no longer true

**Shipped 2026-09-19 with F-1**: none of the twelve survived the rewrite.

Each checked against the tree at the read:

- **`columns.ts` "used by wordle, waffle, strands"** — eight printers call
  `drawInTracks` (bananagrams, connections, letterboxed, psychicnum,
  stackdown, strands, waffle, wordle). The family paragraph lists five and
  misses psychicnum-compete, connections-compete and letterboxed.
- **`marks.ts` "used by psychicnum, codenamesduet"** — strands too (its
  event-log verdicts).
- **`wordColumns.ts` … "a `found: null` row is a bare word (every bananagrams
  row)"** — bananagrams left the word-list family 2026-08-06 and draws its own
  two-per-line list inside a track; nothing of bananagrams reaches
  `wordColumns`.
- **`frame.ts` "used by all"** — crosswords composes nothing from this folder.
- **"A game's `print<Game>Pdf` is then small: … either `drawEventLog` … or
  `drawWordListBody`"** — three families, not two; the track family is the
  largest.
- **"Define these once per module (`const BLACK = 0` …)"** — they are defined
  once, in `frame.ts`, and imported; no module defines its own.
- **"A global `@media print` rule (`common/theme.css`)"** — it lives in
  `common/core-css/base.css`, and its note names the menu item by its
  registry label.
- **"bananagrams … still hand-writes the `<li>`s on screen … Its two recaps
  have drifted; the work is owed to bananagrams"** — bananagrams renders
  `setupRows()` inside `<SetupDisclosure>` exactly as the other games do
  (`PlayArea.tsx`, the disclosure at the bottom of the info column). Nothing
  is owed.
- **"Status: shared `common/pdf/` helpers. Joel picked jsPDF over react-pdf
  (see [project memory] / the `scrabble-react-pdf` branch)"** — a status line
  from the build, citing a memory file and a spike branch. The decision
  stands; the cite goes.
- **"the only game with two print items"** (crosswords) — a "the only" that
  rots. The condition: crosswords prints an answer key because its solution
  is server-held and the puzzle printer builds from the template the FE
  already has.
- **"The log is titled Turns (the project's word for a turn — matches the
  shared `<EventLog>`)"** — `<EventLog>` takes a `heading` prop and the games
  pass five different words (see F-14).
- **"the PlayArea builds the plain-data model … in a menu-item effect"** — it
  is a bound action's `run`, built at click time; every printer's PlayArea
  says "a snapshot at CLICK time".

### SHIPPED · F-pdf-3 · `archaeology-and-other-owners` · what the doc carries that a `doc.md` bans

**Shipped 2026-09-19 with F-1**: the six passages are gone; the games'
stories are one clause each under the rule they illustrate, or nothing.

- **Archaeology**, six passages: the waffle/wordle exclusion and "What changed
  for waffle and wordle" (two copies); "This reverses an earlier rule that
  printed the relevant options only"; "The sweep that introduced this found
  what a hand-kept convention hides…" (the bananagrams bands and boggle's
  `undefined%`); "stackdown and bananagrams joined this family (2026-08-06)
  … after printing compete as ONE board…" and the RLS change that followed;
  "It used to print one merged list under one global tally".
- **Other games' stories told here**: connections' bands-as-borders and A–D
  letters; stackdown's occlusion trick; codenamesduet's three marks per tile;
  wordiply's board-less page; the setgame hatch (F-1). Each is the worked
  example of a rule this folder owns, so a SENTENCE naming the rule and the
  game can stay under the rule; the paragraphs belong to the games, which
  already carry them.
- **The `docs/deferred.md` section** "Printing to PDF — which games get it"
  exists to say nothing is deferred.

### SHIPPED · F-pdf-4 · `good-bad-gloss` · the printed ✓ and ✗ are glossed "good" and "bad"

**Ruled and shipped 2026-09-19** (Joel: *"do it"* — a find and a miss). The
two bullets in `doc.md` → Color is for meaning now name what the mark IS on
a tile (a find: correct, an agent, a solved word; a miss: a wrong guess, the
assassin, an unfound word) with the hue as the bonus. No outcome word is
spent on a per-tile mark.

Handed on by `outcomes` (2026-09-05): `common/pdf/doc.md` → "Color is for
meaning" (carried verbatim from `docs/pdf.md` by F-1) says *"✓ good — a correct/success mark, green. ✗ bad — a wrong/miss mark,
red."* No code symbol is called either word; `marks.ts` glosses its three as
"an agent / correct", "the assassin / a miss", "a neutral / bystander". The
question is what the collapsed doc calls them. Options: *"a find and a miss"*
(the two words the games use for a marked tile — psychicnum's `correct` /
`miss`, strands' `ok` / `no`, codenamesduet's `agent` / `assassin` all print
as one of the two); *keep "good / bad"* (the section is about when a page may
spend a hue, and the gloss is about the hue); *"won / lost"* (the outcome
words). Recommendation: a find and a miss — a printed mark is per TILE, and
the outcome vocabulary is about a game or a turn, so "won" on a tile would be
a new spend of the word.

### SHIPPED · F-pdf-5 · `docstring-marker-pass` · `/**` on a member, in every source file

**Shipped 2026-09-19.** Every member listed below is `//`; the inline
parameter notes too. The six module blocks are gone: `frame.ts`, `marks.ts`
and `pdfTiles.ts` open with a short `//` note pointing at `doc.md`, and
`columns.ts`, `wordColumns.ts` and `eventLog.ts` put the caller-facing
sentences on `drawInTracks`, `drawWordColumns` and `drawEventLog`. The
mis-indented `mode` note is aligned.

The rule (app-audit §4 → the docstring marker): a `/**` sits on a whole
declaration; a note on one member takes `//`. Candidates, all read, all
members:

- `frame.ts`: `PrintHeader`'s six members (`setup` and `mode` are seven-line
  rationales), `PrintDoc`'s three.
- `columns.ts`: `Track`'s three; `drawInTracks`'s two inline parameter notes.
- `wordColumns.ts`: `WordRow`'s three.
- `wordSections.ts`: `WordSection`'s two; `buildWordSections`'s two inline
  parameter notes.
- `wordListBody.ts`: `WordListOpts`'s two.
- `eventLog.ts`: the five members of `drawEventLog`'s option type — and the
  `mode` member's note is mis-indented two columns left of its siblings.
- `marks.ts`: `MarkOpts`'s four.
- `pdfTiles.ts`: `TileBox`'s `outlineBlank` (ten lines, a `/**` on one
  boolean).

And the other half of the same pass: **six of the seven source files open
with a `/** … */` block attached to nothing a hover shows** — `frame.ts`,
`columns.ts`, `wordColumns.ts`, `eventLog.ts`, `marks.ts`, `pdfTiles.ts` each
put the module's story above a `const` or an `import`, and the exported
function beneath gets a one-liner. The block's caller-facing sentences move
onto the export; the rest is F-6.

### SHIPPED · F-pdf-6 · `rationale-in-docstrings` · why-paragraphs that belong in `doc.md`

**Shipped 2026-09-19.** `doc.md` is written: the lede, a 27-line `## Intro
to area` (what a printout is for, ink on white, the frame and the three
families), and `## Details` holding what the docstrings gave up — the
toolkit decision, the recap prints every option and why the mode is
required, wrap-never-truncate, three tracks per page and width from the cap,
a section per player, drawn marks, the Wordle-tile fill, and the
set-before-you-draw convention. The archaeology (the extraction from
psychicnum, "exactly the old behavior", "reverses an earlier rule") is
deleted. Each docstring keeps its contract and points at `doc.md → Details`
in a clause. `docs/pdf.md` stays canonical for shades, color and the Setup
rows until F-1 absorbs it; those pointers are untouched.

The tell is "rather than" / "because" (fifteen hits across the six source
files with a module block); read, these are design or archaeology, not "who
calls this and how":

- `frame.ts` module block: "Deliberately a toolkit, not a template: the games'
  body layouts differ too much…" — the folder's founding decision, `## Intro
  to area` material. `PrintHeader.setup`: "a printout is a record, and one
  that omits the constraints misreports the achievement … This reverses an
  earlier rule". `PrintHeader.mode`: "REQUIRED, deliberately: as an optional
  argument the fifteenth game forgets it…". `drawSetup`: two paragraphs
  ("Wrapping isn't hypothetical tidiness: MothCubes' `Letters` row…").
- `columns.ts` module block, twenty lines: why not the newspaper flow, why
  three per page, and bananagrams' story — a caller's story in the shared
  file (the `mobile` finding, again). `drawInTracks`'s own docstring keeps the
  one rule a caller must know (width from the cap, not the count).
- `marks.ts`: "Why drawn rather than typed", "Why they exist at all", and
  "Extracted from psychicnum's printer when codenamesduet became the second
  consumer. The signature changed in the move…" — the last is archaeology.
- `pdfTiles.ts`: the exception paragraph (twelve lines arguing with
  `pdf.md`), and "Why this is the one printer outside `common/pdf/`" — "the
  one" is a count, and the import direction it explains is
  `docs/common-folders.md`'s rule, cited in a clause.
- `wordSections.ts`: `WordSection`'s "printing them merged under one global
  tally reported the viewer's own numbers as if they were the table's…" and
  `buildWordSections`'s "Coop → one section, exactly the old behavior".
- `wordListBody.ts`: "bananagrams sizes to fill the width and clamps to the
  page height — hence the callback gets `y`" — a reason whose caller left the
  family (F-7).

### SHIPPED · F-pdf-7 · `stale-caller-claims-in-code` · sentences in the folder that name callers wrongly

**Shipped 2026-09-19.** Every sentence below names a condition or nothing:
the flags say what they draw, `emptyText` says its default, the families are
three, "every game but crosswords" and "all five" are gone. `whoLabel`'s note
keeps codenamesduet as the example of a two-actor turn, since the example is
the contract.

A "who uses this" rots; each of these has:

- `eventLog.ts`: "shared by the turn-based printable games (scrabble,
  psychicnum)" — five callers, and setgame takes `twoColGeom` alone. "The
  only per-game difference is the third column's header label" — `whoLabel`,
  `emptyText` and `startY` vary too, and codenamesduet varies all four.
  `eventLog.test.ts` repeats the pair.
- `wordColumns.ts`: "shared by the word-hunt printable games (boggle, and
  spellingbee next)"; `bonus` "boggle: mark the word…" and `pangram`
  "spellingbee: render the word in bold" — boggle, spellingbee and wordwheel
  all set `bonus`; spellingbee and wordwheel both set `pangram`. The flag
  says what it draws; which game sets it is the game's business.
- `wordListBody.ts`: `emptyText` "only bananagrams sets one — an empty grid
  is a real, printable state there" — no caller sets it (F-10), and
  bananagrams is not in this family. "bananagrams sizes to fill the width …
  hence the callback gets `y`" — same.
- `frame.ts`: "an event log via `eventLog.ts`, or a word list via
  `wordColumns.ts`" — the track family is missing; "Every game has one except
  crosswords" — a census where "a game with no recap on either surface has no
  Setup block" is the condition.
- `frame.test.ts`: "a regression here degrades all five print outputs at
  once" — fifteen.

### SHIPPED · F-pdf-8 · `brand-in-prose` · brands where prose says the codename

**Shipped 2026-09-19** in the three code files (boggle), and the doc's three
with F-1 (they moved to `setup-form/doc.md` as spellingbee, wordwheel,
boggle).

`MothCubes` in `frame.ts` (`drawSetup`), `frame.test.ts` (the wrap describe)
and `wordListBody.ts` (the `setupX` comment); `freebee`, `MooseWheel` and
`MothCubes` in `docs/pdf.md` → Setup rows (setup-form's note at its close).
`PrintHeader.brand`'s "RackAttack", "MothCubes" are the field's VALUES and
stay — that member is the brand.

### SHIPPED · F-pdf-9 · `header-height-written-thrice` · the header's height is a number three files agree on by hand

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec. do it."*).
`PrintDoc.contentTop` is cached by `newPrintDoc` from a `HEADER_H` stated
once in `frame.ts`; `columns.ts`, `twoColGeom` and `wordListBody.ts` read
it. `setupBlockHeight(rows)` is exported beside `drawSetup`, which draws with
the same `SETUP_LINE_H`; `drawEventLog`'s fit check reads it, and a new
`frame.test.ts` case pins that the promise and the drawing agree. The three
fakes carry `contentTop: 72`. setgame's `margin + 46` is a Soon item in
`src/setgame/todo.md`.

`margin + 44` is the top of the body in `columns.ts` ("clears the header,
matching twoColGeom's colTop"), in `eventLog.ts` (`twoColGeom`'s `colTop`)
and in `wordListBody.ts` (`boardTop`) — whose docstring says the offsets
"live here ONCE". setgame writes `margin + 46`. `eventLog.test.ts` pins
28 + 44. The number is what `drawHeader` draws (the date at +6, the title at
+8, the summary at +24) and nothing exports it. In the same family:
`drawEventLog`'s `blockH = 22 + 13 + n × 13` re-derives `drawSetup`'s line
height, so a change to one silently lies in the other.

Options: *`PrintDoc` gains `contentTop`* (cached in `newPrintDoc` beside
`pageBottom`, the header's height stated once in `frame.ts`) and the three
readers read it; `frame.ts` exports the setup line height (or a
`setupBlockHeight(n)`) for `eventLog` — or *leave it, and let the test be the
lock*. Recommendation: `contentTop` and the exported height. setgame's 46 is
a call site with a decision in it (deliberate air, or a copy of the number
gone wrong) — a line for `src/setgame/todo.md`.

### SHIPPED · F-pdf-10 · `knobs-nobody-turns` · parameters and defaults no caller uses

**Ruled 2026-09-19** (Joel: *"delete all but keep cols"*) **and shipped,
with one correction.** Gone: `newPrintDoc`'s margin parameter (`MARGIN`
inside), `WordListOpts.emptyText` and `drawWordColumns`'s `emptyText` (the
test for it too), `drawTileLegend`'s size parameter (`LEGEND_TILE = 7`, the
value both callers chose — wordle and waffle drop the argument, stamps
unmoved), `MarkOpts.weight`, `drawInTracks`'s `index`. `cols` stays.

**The correction: `export type { SetupRow }` is NOT deleted, because the
finding's premise was wrong.** The read said "one reader (bananagrams)"; the
re-export has ELEVEN — bananagrams' printer and ten games' `pdf/model.ts`,
each importing `PrintHeader` and `SetupRow` together from `frame`. That is a
print model's natural import, not a stray. Left as is; Joel decides whether
it goes anyway (an eleven-file sweep).

A default is a decision, and a knob with no reader is a claim of variation
that is not there:

- `newPrintDoc(margin = 28)` — all fifteen callers write `newPrintDoc()`.
- `WordListOpts` (`cols`, `emptyText`) — the docstring calls them "the knobs
  the three word-list printers actually vary"; boggle, spellingbee and
  wordwheel all pass nothing. `drawWordColumns`'s own `emptyText` is reached
  only through it.
- `drawTileLegend(…, size = 9)` — both callers pass 7, so the default is
  never taken.
- `MarkOpts.weight` — never passed; every mark takes the size-proportional
  default.
- `drawInTracks`'s `index` callback argument — no caller reads it.
- `frame.ts`'s `export type { SetupRow }` — a re-export with one reader
  (bananagrams), which could import `setup-form/setupRows` as `eventLog.ts`
  does.

Recommendation: delete all six; the legend's size becomes the 7 both callers
chose. Any one Joel wants kept as API is kept with its docstring saying who
is expected to vary it.

### SHIPPED · F-pdf-11 · `page-wide-setup-unguarded` · the track family ends with the same unguarded line, eight times

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*).
`drawSetupBelow(pd, m, y)` in `frame.ts` draws the recap at `y` or at the top
of a new page when `setupBlockHeight` says it will not fit, and gives it the
page's width so a long value wraps; three cases in `frame.test.ts`. The
eight track-family printers call it (a sweep by exact string; `left` dropped
from seven destructures; stamps unmoved) — stackdown keeps its solution
between the tracks and the recap. `Track` gains `bottom` (`pd.pageBottom`),
read by no caller yet.

Seven printers end `if (m.setup.length) drawSetup(doc, m.setup, left,
bottom + 18, m.mode)` verbatim and stackdown a variant (its solution first).
None checks `bottom + 18 + the block` against `pageBottom`, where
`drawEventLog` checks its own Setup block and moves it whole. A tall page runs
the recap off the sheet: bananagrams' board is capped at 26 tiles down and
its word list is unpaginated, so a full board plus forty words reaches the
bottom before the Setup is drawn. `Track` also carries no `bottom`, so a
caller cannot know where its column ends without reaching into `pd`.

Options: *(a)* `drawInTracks` takes `setup` + `mode` and draws the block
itself, guarded (eight lines deleted; stackdown's solution then has to draw
before the tracks or inside one); *(b)* a `drawSetupBelow(pd, m, y)` in
`frame.ts` that adds a page when the block will not fit, and the eight callers
switch to it; *(c)* leave. Recommendation: (b) — one guard, no change to
what any page shows unless it was already off the sheet — and `Track` gains
`bottom` so a track's own drawer can stop or spill.

### SHIPPED · F-pdf-12 · `eventlog-setup-runs-on` · the event-log family's recap does not wrap

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*). `drawSetup`
takes a required `maxW` — no caller wanted the run-on once the event-log
family stopped needing it — and `setupLineCount(doc, items, maxW)` wraps
with the same fonts through a shared private `setupRowLines`, so the count
and the drawing cannot disagree; `setupBlockHeight` takes lines.
`drawEventLog` measures and draws with `colW`; `drawSetupBelow` with the
page width. The F-9 test now pins a wrapped row (five lines for three rows);
the "no width" test is gone with the behavior.

`drawEventLog` passes no `maxW` to `drawSetup`, and `frame.ts` calls that
"the historical behavior, kept for eventLog's caller, whose column layout
pre-computes the block's height as one line per row". In a 267pt column a
six-name roster row runs into the gutter and the right column. The
pre-computation could count wrapped lines — `splitTextToSize` is available
before anything is drawn — and then the same wrap the word-list body gets
holds here. Options: *wrap* (measure, then draw) or *leave* (six-player
event-log games are rare; psychicnum coop is the case). Recommendation:
wrap; it is the defect the wrap was added for, one family over.

### SHIPPED · F-pdf-13 · `marks-leave-line-width` · every mark changes the document's line width and leaves it

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*). Each of the
three marks reads the line width before it draws and sets it back after;
the module note and `doc.md` → Details say so. The draw color is left set,
as every drawer in the folder leaves its own. psychicnum's now-untrue
warning comment is a Soon item in `src/psychicnum/todo.md` (that area is
paused pre-close; its printer's stamp does not move here).

`drawCheck`, `drawCross` and `drawDash` each call `setLineWidth` and return
without restoring it. The callers pay: psychicnum's board sets the border
weight "on EVERY rect — the marks bump the line width, so a stale value
would otherwise thicken every cell after the first marked one";
codenamesduet's inset sets it before each rect; strands resets after its
paths. A helper that mutates shared state and leaves it either restores it
(`getLineWidth` before, `setLineWidth` after — three lines each) or says so
in its docstring. Recommendation: restore, and drop psychicnum's warning
comment when its area next opens.

### SHIPPED · F-pdf-14 · `printed-heading-is-turns` · the printed log is headed "Turns" whatever the screen calls it

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*).
`drawEventLog` takes a required `heading`; the five printers pass the word
their screen passes (scrabble and psychicnum "Turns", connections and
wordiply "Guesses", codenamesduet "Clues") — a sweep, stamps unmoved. The
tests pass "Turns".

`drawEventLog` writes "Turns" for every caller; on screen the same log is
headed by a `heading` the game passes — codenamesduet says "Clues",
connections "Guesses", scrabble and psychicnum "Turns". The doc claims the
word "matches the shared `<EventLog>`", which has no fixed word. The
event-log area settled that the thing is the EVENT LOG and its table is
`<game>.events`; a printed heading is the game's word, as on screen. Options:
*a `heading` option beside `moveLabel`* (each printer passes what its screen
passes); *keep "Turns"* on paper as the one word. Recommendation: the option
— the paper and the screen are the same log and should say the same thing.
Small; a decision, so it waits.

### SHIPPED · F-pdf-15 · `section-heading-off-page` · a word-list section can start below the page's bottom

**Shipped 2026-09-19** (Joel: *"i'll take your rec"*). `drawWordColumns`
starts a new page when its heading (and subheading) plus one row will not
fit above `pageBottom`; a test pins that the heading is the first thing on
the new page and nothing is drawn below the sheet. The spill test's page
bottom moved from 20 to 60 so its scenario stays above the margin.

`drawWordColumns` draws its heading at `startY` with no room check. Stacked
sections (compete: one per player, then "Not found") arrive at whatever `y`
the previous section returned plus twenty; when that is past `pageBottom`,
`fitRows = max(1, floor(negative))` draws one row per column below the sheet
before paginating. Obvious fix: if the heading plus one row will not fit,
`addPage` and start at the margin; the test pins it with a `pageBottom` just
past a first section. Waiting; no decision in it.

### SHIPPED · F-pdf-16 · `three-fake-jspdfs` · the same fake is written three times, and two copies lack the method the third had to model

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*).
`src/common/pdf/fakeJsPdf.ts` exports `fakeDoc`, `fakePd` and `Call`; the
three specs import them and their hand-rolled copies are gone. The fake
models the methods the helpers READ (`getTextWidth`, `getLineWidth`,
`internal`, `splitTextToSize`) and records the rest. The word-list body
spec gained the case the thin fake let slip: the Setup value is drawn to the
board's right. **The helper joins the roster at `cs-audited-pdf`** (twelve
stamped files now), staged so the stamp guard sees it.

`frame.test.ts`, `wordColumns.test.ts` and `eventLog.test.ts` each hand-roll
`fakeDoc` + `fakePd`. Only `frame.test.ts` models `splitTextToSize` — with a
comment saying why: the recording no-op "returns the doc where the caller
needs a string[]". That trap is LIVE in `wordColumns.test.ts`:
`drawWordListBody` passes `maxW`, so `drawSetup` calls `splitTextToSize`,
gets the Proxy back, and `lines.forEach` records a `forEach` call and draws
nothing — the two body tests pass without a single Setup value being drawn.
Recommendation: one `fakeJsPdf.ts` in the folder (a test helper; it joins the
roster), used by all three, with `splitTextToSize` modeled once — the
`web-storage` precedent.

### SHIPPED · F-pdf-17 · `untested-columns-and-tiles` · the two files whose docstrings insist hardest have no spec

**Ruled and shipped 2026-09-19** (Joel: *"i'll take your rec"*).
`common/pdf/columns.test.ts` (six cases: one width from the cap for a lone
second-page track, the gutter layout, `top`/`bottom` on every track, the
tallest column on the LAST page, a lower cap, no tracks) and
`shared/wordle-style/pdfTiles.test.ts` (the four-state table, yellow lighter
than green, `outlineBlank` in the lighter gray, white-on-green and uppercase,
no letter for a blank, the legend's three swatches and its return).
`frame.test.ts` gained a `drawHeader` case: the date top-right, the summary
under the title, the title truncated clear of the date. Both new files are
`cs-audited-pdf` and on the roster; `marks.ts` stays untested by decision.

`columns.ts` has no test: width from the cap not the count, the page break
resetting `bottom`, `maxTracks` — the three rules its docstring is about.
`pdfTiles.ts` has none: the four-state table (which states fill, which
border, which draw nothing) and `outlineBlank`. `drawHeader`'s title
truncation clearing the date is unpinned too. `marks.ts` is pure segments
and can stay untested. Recommendation: specs for `columns.ts` and
`pdfTiles.ts` on the shared fake (F-16); `drawHeader` one case.

### What checked out

- **jsPDF's one-argument gray IS 0–255 as a Number** (its own docstring:
  "from 0 (black) to 255 (white) if communicated as Number type"), so the
  three constants and the doc's warning about it are right.
- **Every character the folder prints is WinAnsi**: the ellipsis in `fit`,
  the em dash in the empty-log row and strands' notes, the middle dot, the
  plain hyphen in "Co-op" and the ASCII apostrophe codenamesduet insists on.
- **The wrap's math**: `drawSetup` returns `y + 13 + lines × 13`, and
  `drawEventLog`'s block estimate agrees with it today (F-9 is about tomorrow).
- **`buildWordSections`** — roster order, the empty section for a player who
  found nothing, the finder dropped inside a section, "Not found" last — all
  as the tests say, and the sum-the-rows tally cannot disagree with the rows.
- **`drawInTracks`'s width-from-cap rule** holds for a second page; the
  reset of `bottom` at a page break is right.
- **The three-shade palette and the color-for-meaning rule** are obeyed by
  every printer read: the marks and connections' borders are the only hues,
  scrabble's premiums and the wordle tiles are the two stated exceptions,
  and setgame's cards are meaning.
- **The gallery, the print e2e specs and `docs/testing.md`** all describe the
  folder as it is.

## Notes

- **`docs/pdf.md` is roster** and is READ; it is not stamped (a `.md` has
  nowhere to put one). The collapse (F-1) is the area's largest single piece
  of work and the last, since the intro it writes is what the docstrings
  will point at.
- **The games' `pdf/` folders were read as evidence, not stamped** — every
  `print<Game>Pdf.ts`, to check the doc's caller claims and to see the seam
  each family exposes. Their stamps did not move.
- **Handed on, when those areas open**: setgame's `margin + 46` (F-9);
  psychicnum's "set the border weight on EVERY rect" comment (F-13); the
  stale `docs/pdf.md` cites in every game's `setupSummary.ts` and PlayArea
  print effect (F-1's link sweep repoints them mechanically; the stamps do
  not move).
- **The `Track` type has no `bottom`**, so a game's per-track drawer (a long
  stackdown word list, bananagrams' two-per-line words) cannot know where to
  stop; no game paginates inside a track today. Folded into F-11.
- **The empty-log row prints "—" for its number** — the one place the shared
  code prints a dash it did not draw. WinAnsi has it; noted only because
  `marks.ts` draws one.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED` (2026-09-19)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
