# Printing game boards to PDF

Some games can print their board to a PDF (a "Print board (PDF)" item in the GamePage
menu) — a paper record of the board + moves you can print mid-game or at the end. This
doc is the **shared design language** for those printouts, so every game's print looks
like it belongs to the same system (the on-screen consistency goal — see
[ui.md](ui.md) — extended to paper).

## Which games print

**All fifteen games print.** (waffle and wordle were a documented permanent
exclusion until 2026-08-02 — see the note under the table for what changed.)

| game | prints? | notes |
|---|---|---|
| bananagrams | ✅ | track family — a board + word list per player, **two** columns (the board is wide) |
| boggle | ✅ | word-list family |
| codenamesduet | ✅ | turn-log family — three facts per tile, all carried by drawn marks (see below) |
| connections | ✅ | turn-log family — category bands as coloured **borders** + an A–D letter (see below) |
| crosswords | ✅ | its own third body family (a whole-cloth ported printer); the only game with **two** print items — the puzzle and a separate answer key |
| letterboxed | ✅ | **track family** — one track per board (coop one, compete one per player); a covered letter is a heavy black ring + bold glyph, an untouched one a thin grey ring; the chain as a numbered list |
| psychicnum | ✅ | **both families, by mode**: coop = turn-log (one shared board + the newspaper flow); compete = track family (a board with the player's OWN ✓/✗, their score line and their guess list per track — a merged board is a lie when every player races their own copy) |
| scrabble | ✅ | turn-log family |
| spellingbee | ✅ | word-list family |
| stackdown | ✅ | track family — a board per player; the stack drawn in layer order, white fill IS the occlusion |
| strands | ✅ | **track family** — one track per board; colour encoded as shape |
| waffle | ✅ | **track family** — one column per board; the 4-state tile encoding |
| wordiply | ✅ | turn-log family — the only printer with **no board**: its page *is* the log |
| wordle | ✅ | **track family** — board + QWERTY keyboard + guesses, per player |
| wordwheel | ✅ | word-list family (forked from spellingbee's printer) |

**What changed for waffle and wordle.** They were excluded on the reasoning that both
are *board progressions* a single snapshot can't represent. That reasoning was about
the BOARD, and it turned out to be answerable: a wordle grid already IS its own
history — six rows of what you tried and what came back — and a waffle board plus its
swap log says the same. What actually blocked them was the **colour**: their feedback
is entirely green/yellow/grey, which a mono printer flattens to one grey, and the games
are meaningless without it. The 4-state tile encoding below solves that, so the
exclusion no longer holds.

Status: **shared `common/pdf/` helpers**. **Joel picked jsPDF** over react-pdf (see
[project memory] / the
`scrabble-react-pdf` branch): precise layout control, a lighter dep, and it matches the
existing jsPDF crossword-print code that landed with crosswords.

The extraction is a **toolkit of à-la-carte helpers**, not a template — the games' body
layouts differ too much (a 2-column newspaper turn flow vs. a board + side-setup + word
columns) to share one `render()` with callbacks. So the frame owns the truly-common
atoms and each game composes them with its OWN board renderer + a plain-data model:

| module | used by | what it does |
|---|---|---|
| `common/pdf/tiles.ts` | wordle, waffle | `drawTile` / `drawTileLegend` — the four Wordle-style letter states as **border + fill weight** rather than colour (see the exception note below) |
| `common/pdf/columns.ts` | wordle, waffle, strands | `drawInTracks` — lays a page out as N side-by-side player tracks, capped at 3 per page, spilling onto further pages |
| `common/pdf/marks.ts` | psychicnum, codenamesduet | `drawCheck` / `drawCross` / `drawDash` — the ✓ / ✗ / – outcome marks, DRAWN from line segments because jsPDF's core fonts are WinAnsi and have no such glyphs. Each takes a centre + size, so the caller owns placement (a cell corner, a keycard inset) |
| `common/pdf/frame.ts` | **all** | the shade constants, `PrintHeader` base model, `newPrintDoc`, `drawHeader`, `drawSetup`, `fit`, `savePrint` |
| `common/pdf/turnLog.ts` | scrabble, psychicnum, wordiply, connections, codenamesduet | `twoColGeom` + `drawTurnLog` — the newspaper 2-column `# / Player / <move>` flow (the only per-game difference is the move-column label) |
| `common/pdf/wordColumns.ts` | boggle, spellingbee, wordwheel | `drawWordColumns` — the balanced N-column alphabetical word list; per-word flags `bonus` (a dot) and `pangram` (bold) let each game opt in, and a `found: null` row is a bare word (no score/finder — every bananagrams row) |
| `common/pdf/wordListBody.ts` | boggle, spellingbee, wordwheel | `drawWordListBody` — the **whole word-list body skeleton** (board top-left / Setup to its right / `drawWordColumns` below), pinning the shared layout offsets in one place. The caller passes a `drawBoard(x, y) → { w, h }` callback (its only real difference) plus two knobs: `cols` and `emptyText` |

A game's `print<Game>Pdf` is then small: build a `PrintDoc`, `drawHeader`, then either
call `drawTurnLog` under its own board (turn-log family) **or** call `drawWordListBody`
with a board-drawing callback (word-list family), and `savePrint`.

## The aesthetic: clean + printable

A printout is not the app on paper. The screen is a live, tinted, dark-on-color
surface; a **printout is ink on white**, and it must read on a **black-and-white**
printer as well as a color one. So the look is deliberately plain: white paper, black
text, a few grey lines, and color used *only* where it carries meaning.

## Shades — the whole palette is three greys

Everything that isn't **explicitly colored** (see below) is drawn in exactly one of
three greyscale values. No other greys. jsPDF's single-argument `setTextColor(n)` /
`setDrawColor(n)` is a **0–255 greyscale level — `0` = black, `255` = white** (NOT 0–100).
So a value in the middle is a *medium-dark* grey, and "barely there" lives near the top
(≈`230`). Tune against the on-screen PDF; a physical printer darkens greys further (dot
gain), so calibrate line values on an actual printout.

| name | value | used for |
|---|---|---|
| **black** | `0` | all real text — titles, data, the turn log, section headings, board words, setup values. The default; most things are black. |
| **dark-grey** | `70` | **real-but-secondary marks** — the **board grid** and the one place text is a label rather than data (a table's `# / Player / …` column headers). Clearly visible, a step down from black, because these still carry the structure. |
| **medium-grey** | `180` | **minor lines only** — the thin dividers between turn rows, the rule under a table header. Faint on purpose (they just separate; they aren't content). |

Rule of thumb: **use black unless a thing is *specifically* not important.** Board content
+ its grid + real labels are black or dark-grey; only genuinely-minor separators (row
dividers) get the light medium-grey. Small ≠ unimportant: a small date in the corner is
still black.

Define these once per module (`const BLACK = 0`, `DARK_GREY = 70`, `MEDIUM_GREY = 180`)
and reference them by name, so the palette is legible and can't drift. (The exact grey
values are tunable — calibrate to taste against a printout — but the *roles* are fixed.)

## Color is for meaning, never decoration

Color (an actual hue) is reserved for things that **communicate**, and even then it must
not be the *only* signal, because the page may print in black-and-white:

- ✓ **good** — a correct/success mark, green.
- ✗ **bad** — a wrong/miss mark, red.

Because a mono printer flattens green and red to the same grey, **the meaning must also
be carried by shape or text** — a drawn ✓ vs ✗, or the words "Correct" / "Incorrect".
Color alone never distinguishes an outcome. (Helvetica has no ✓/✗ glyphs, so they're
drawn from line segments.)

**Do not** color anything decorative: no colored cell borders, no tinted headings, no
outcome-tinted tile fills. If you're reaching for color to make something *look* nicer
rather than to *tell the reader something*, use a shade instead.

## Backgrounds are white

The background of almost everything is **pure white** — no fills. Don't shade a tile, a
row, or a panel unless a filled background is *specifically agreed* to communicate
something (and even then, prefer a mark or a shade over a fill). In particular:

- **No alternate-row ("zebra") shading** in tables — separate rows with a thin
  medium-grey rule instead.
- **No outcome fills** on tiles — the ✓/✗ mark alone says correct vs miss.

**The agreed exception: Wordle-style letter tiles** (`common/pdf/tiles.ts`, used by
wordle and waffle). Those four states — not-yet-used, not-in-word, wrong-place,
right-place — are the entire game, not a decoration, and a letter tile has no room
for a mark beside its letter: the letter IS the content. So they're carried by
border-and-fill weight, read as an intensity ordering, darkest = best:

| state | printed as |
|---|---|
| not used yet | **no border at all** — an empty slot, not a result |
| not in word | border only, white inside |
| wrong place | light grey fill |
| right place | dark grey fill, white letter |

Using **greys rather than hues** is what keeps this honest: a colour printer and a
mono one produce the same page, so there's no signal that can be lost. This is the
same "unless a filled background is specifically agreed to communicate something"
carve-out scrabble's premium squares use — deliberate, and narrow.

(scrabble's board is the agreed exception: its premium-square colors + tan tiles are
*meaningful* board features, not decoration — and they live in scrabble's own board
renderer, not the shared frame, so the exception can't leak to other games.)

## Layout conventions (the shared shape)

The **header** is universal; the **body** comes in two families (see the module table
above) — a game picks one.

- **Header (all games):** **`Brand: game title`** top-left (brand from the manifest's
  `name`, the game title from `common.games.title` via `GamePageCtx.title`), the **date
  top-right** (small, black), and a **summary** line below that matches the game's
  on-screen status (e.g. "9 / 214 words · 14 pts", "1 of 3 secrets found · 3 guesses used").
- **A "Setup" section** — a smaller sub-heading listing **every** setup option, the
  **timer included**. A printout is a *record*, and a record that omits the constraints
  misreports the achievement: "we scored 300" reads differently when the next line says
  the whole game had a 20-minute clock. (This **reverses** an earlier rule that printed
  "the relevant options only" and dropped the timer as "not relevant on paper" — that
  was written thinking of the PDF as a board to play on rather than as a record of a
  game played.) The rows come from the game's shared `setupSummary`, so the paper and
  the info column can't drift apart — see [Setup rows](#setup-rows) below.
- **The heading carries the mode**: `Setup: Co-op` / `Setup: Compete`. Mode is locked at
  the **gametype** level (`manifest.mode`) and is never a control on the setup form, so
  it isn't a row — a heading qualifier is the right shape for something that frames the
  whole block, and it costs no line. It matters more on paper than on screen: a PDF is a
  standalone artifact with no app chrome to say what kind of game this was, where the
  screen already says so in the header and the club listing. That asymmetry is
  deliberate, not drift.
- **Margins** are tight-ish (~28pt) so content uses more of the paper, while staying
  inside a printer-safe edge.

### Setup rows

**One source per game feeds both the info column and the paper.** Each game exports
`setupRows(setup, ctx) => SetupRow[]` from `<game>/lib/setupSummary.ts` (the same
per-game seam `lib/history.ts` uses); `<SetupDisclosure>` renders it as `<li>`s and the
print model passes the identical array to `drawSetup`. Before this the two lists were
written by hand in different files, shared only their value formatters, and drifted in
both labels and rows — psychicnum went as far as reporting *different facts* on paper
than on screen.

Three rules hold the shape:

- **The recap is the setup dialog, read back.** Every control the dialog showed
  produces exactly one row, in the dialog's order. A control that didn't apply produces
  **no row** — omit rather than print "n/a", since a record must not assert a choice
  nobody made (`coop_style` exists only for 2+ coop, `first_turn_user_id` only with
  turns). The **roster is the first row**: who played is chosen in the create-game
  dialog too, so it follows the rule rather than being an exception, and it's the most
  useful fact on a record you keep.
- **Values are plain strings.** The PDF is WinAnsi and can't render a React node (or an
  `→`), so it's the lower bound — which is the right way round. Screen-only richness
  lives outside the shared rows.
- **Every row carries the setup `key` it describes**, which nothing renders. A
  roster-wide test uses it to assert that every key in a game's default setup produces a
  row, with an explicit opt-out list for keys that aren't player choices. A convention
  that two files agree is what we had, and it drifted; this makes it a failing build
  instead.

Fourteen games have one. **crosswords is the documented exception**: it never had a
recap on either surface — no `<SetupDisclosure>`, and its PDF is the whole-cloth ported
printer with no Setup block — so there was nothing to unify, and adding one would be new
UI rather than a sweep. `src/setupRows.test.ts` names it explicitly, so the exception is
a decision on record rather than a game the guard forgot.

The sweep that introduced this found what a hand-kept convention hides: bananagrams'
two word-check bands appeared on **neither** surface, and boggle printed
`Win at: undefined%` (the screen row tested `=== null` where an unset threshold is
`undefined` — latent behind a closed disclosure, glaring once it printed). Both were
found by the coverage test, not by reading.

**Body family 3 — track games (`columns.ts`; wordle, waffle, strands, stackdown, bananagrams).** One column per
BOARD: its grid, then whatever belongs to that grid (wordle adds its QWERTY
keyboard), then that board's own log. The newspaper flow is wrong here — it's one
stream wrapping between columns, which in compete would file one player's guesses
under another player's grid. Coop is a single track (one shared board); compete is
one per player at terminal, and just yours during play, since RLS means you hold
nobody else's until the game ends. **Capped at 3 tracks per page**: compete allows
six players, and six columns on a letter page puts a wordle keyboard under 9pt per
key. Three keeps the realistic two-or-three-player game on one sheet and spills the
rest rather than shrinking past legibility.

Note what this costs COOP: a single track is still a third of the page, because
`drawInTracks` sizes columns from the cap rather than from how many this page
happens to hold — otherwise a 4-player game's second page would draw one giant
board beside the first page's three. A lone coop board with white space to its
right is the accepted price of that consistency, and every game in this family
pays it.

**The cap is per call.** `drawInTracks` takes a `maxTracks`; three is only the
default. **bananagrams passes two**, because its crossword sprawls across a
25×25 arena and is far wider than a wordle or waffle grid — at a third of a page
its tiles shrink past reading. It also draws a **thin border around each board**,
which the fixed-shape games don't need: a Bananagrams grid is a ragged shape
floating in space, so without a frame its edge is wherever the last tile happens
to fall and the eye can't tell where one player's board stops and the next
begins.

**stackdown and bananagrams joined this family** (2026-08-06), both after
printing compete as ONE board — stackdown under a MERGED log (the viewer's stack
beneath everybody's words, so a two-player race read as though one person played
alone), bananagrams with the other player's grid simply absent. It's the exact
failure the family exists to prevent; neither was noticed until the gallery put a
compete printout next to its screen.

bananagrams needed an **RLS change** to be printable this way at all: its
`player_boards` was owner-only forever, so the FE could not see a rival's grid
even after the game ended. It now opens at terminal like every other compete
game's private table. See docs/games/bananagrams.md.

**Body family 1 — turn-log games (`turnLog.ts`; scrabble, psychicnum, wordiply, connections, codenamesduet).**
connections is the worked example of the colour rules two sections up. A solved
category is a full-bleed coloured band on screen; on paper it becomes a **thick
coloured border** (four full-width fills is an enormous amount of ink, and
"backgrounds are white" already forbids it) plus a **letter A–D in the top-left**.
The letter is the load-bearing half: mono flattens all four rank hues to one grey,
so it's the only thing left saying which category was which. It's a faithful
stand-in rather than an arbitrary tag — rank 0–3 IS the difficulty order the
colour encodes — and it does double duty in the turn log, where a correct guess
is labelled by the letter of the band it solved. The screen tokens are re-darkened
for print (`BORDER_RGB`): they're tuned as pale fills and nearly vanish stroked as
a line.

**stackdown** is the happy case where the house rules pay for themselves. A
mahjong-style stack is defined by *occlusion* — a raised tile hides what's under
it — and "every printed surface is white" turns out to be exactly the tool: a
white-filled tile painted over a lower one occludes it just as the screen does.
So drawing the tiles in `z` order reproduces the stack with no shading, and no
rule bent. It shares `letterCorner` with the board component, so a partly covered
tile tucks its letter into the same visible quadrant on paper as on screen. The
screen's depth ramp is deliberately dropped — the overlap already says what's on
top, so a shade would be decoration. (stackdown prints in the TRACK family above,
not this one — it's described here because the occlusion trick is the interesting
part of how its board is drawn, wherever that board sits.)

**codenamesduet** is the densest case: three independent facts share every tile —
what HAPPENED on it, what it is on *your* key, and (at terminal) what it is on
your partner's. All three become the same three drawn marks (✓ agent / – bystander
/ ✗ assassin), separated by POSITION rather than colour: the outcome top-left,
your key bottom-left, your partner's top-right, matching the screen's corners. The
two bystander triangles survive too, because a word your partner burned is still
yours to guess while one you burned is locked — an asymmetry you need when
planning a clue on paper. It's the one printout that deliberately shows MORE than
the screen: the board hides your own key mid-guess, and the print always shows it,
since thinking about clues away from a screen is the whole reason it exists.

**A hard constraint worth knowing before adding text to any printer:** jsPDF's
core fonts are **WinAnsi**. Characters outside it don't print — they come out as
mojibake. `→` did exactly that (as `!'`) and became `->`. `·` is fine; arrows,
checks and crosses are not, which is why `marks.ts` draws them.
wordiply is the **board-less** case: it has no board worth printing (its five guess
lines carry no state of their own), so it passes `startY: colTop` and the log begins
straight under the header. `drawTurnLog` needed no change — the parameter already
allowed it — and any future log-only game can do the same. Its terminal blocks (the
best-possible-word reveal, and compete's per-player scores) stack above the log. Letter page,
two columns, newspaper flow: the board (+ the summary) sits at the top of the **left**
column; the turn log flows down under it and **continues at the top of the right column**,
then onto further pages (every PDF lib paginates by page, not column, so it's a
hand-managed column cursor). The log is titled **"Turns"** (the project's word for a
turn — matches the shared `<TurnLog>`), a `#` / `Player` / <what-happened> table with a
thin rule between turns; the Setup section is appended at the end of the flow.

**Body family 2 — word-list games (`wordListBody.ts` over `wordColumns.ts`; boggle,
spellingbee, wordwheel).** A board top-left, the Setup to its **right**, and below them
the words in **N balanced, column-major, alphabetical columns** (each row
`word (·bonus dot) … +score  finder`). The whole skeleton — the board/Setup/words
placement and the layout offsets — is the shared `drawWordListBody`; each printer passes
only a `drawBoard(x, y) → { w, h }` callback and the `cols`/`emptyText` knobs.
The board is per-game: boggle draws a tile grid; spellingbee and wordwheel draw their
7-hex honeycomb / 9-tile wheel (from `spellingbee/lib/honeycomb.ts`, the same geometry
the on-screen SVG board uses — white hexes, the center distinguished only by a thicker
border). Both also use the `pangram` row flag (pangrams print **bold**). The tile size
is **fixed**, so a 6×6 prints bigger than a 4×4 — it isn't scaled to a column.

**The word list is a stack of SECTIONS, and that's what compete needs.** Coop passes
one unattributed section: a single shared hunt, one list, each row keeping its finder,
and the team's totals already stated in the page header. Compete passes **one section
per player** — heading, that player's own `n words · m pts`, then their words in
columns — because in compete both the words and the score are per-player facts. It
used to print one merged list under one global tally, which reported *the viewer's*
numbers as though they were the table's and left authorship to a name squeezed onto
the end of each row. `buildWordSections` (`common/pdf/wordSections.ts`) does the split
for all three games.

Three details of that split are deliberate. Sections follow **roster order**, and a
player who found nothing still gets one — finding nothing is a result, not a reason to
be omitted. The per-row **finder is dropped inside a player's section**, since the
heading already says whose it is. And words nobody found (the terminal reveal, which
arrives as `found: null` rows) go **last under "Not found"** rather than under any
player, because filing a miss under a name would credit it to them.

In compete the page **header** drops the tally too, stating only the shared target
(`30 words to find`, `Target: 50 pts · 30 words`) — there is no single number for a
table where everyone scored differently.

**Body family 3 — grid-plus-clue-columns (`src/crosswords/pdf/`; crosswords) — a
deliberate whole-cloth exception.** Crosswords does NOT use the shared `common/pdf`
scaffold at all; its printer is a **verbatim port of crossplay's own jsPDF module**
(`~/src/crossplay/packages/client/src/print/`), kept exactly as crossplay produces it
today (plan decision 7). The layout is crossplay's 12-unit grid: the puzzle grid with a
title block above it (title left, author/copyright stacked right — **not** `frame.ts`'s
`Brand: title` + date header), then the Across/Down **clues flowed into balanced columns**
with continuation pages when they overflow. The cell renderer preserves blocks, circles
(8% inset), shading, given underlines, pencil-as-italic-grey, and current fills;
`revealed`/`wrong` are ignored ("print shows the puzzle, not grading"). The answer-key
generator (`generateSolutionPdf`, `src/crosswords/pdf/solution.ts`) was **ported too**:
it shares the puzzle printer's title + grid geometry but fills every open cell with the
canonical solution letter. Unlike the puzzle printer (which the FE builds offline from
the template it already holds), the answer key needs the shielded solution, so the caller
fetches it via the `crosswords.export_solution` RPC and passes it in — fine under the
friends-only trust model (see [crosswords.md §7](games/crosswords.md)). It already went
through crossplay's own design process (`crossplay/docs/print-design.md`) and is already
greyscale, so it lands within the *spirit* of this doc without adopting its letterforms or
`frame`/`Setup` conventions.

This is a documented **deliberate difference**, not drift: a future consistency pass must
NOT "fix" it onto the shared frame (per [docs/ui.md](ui.md) → surface deliberate
differences before reversing them). The only touchpoints with `common/pdf` are incidental.

## Plumbing

- **Frontend only.** Everything the print needs is already client-side (the game's
  `useGame` + `GamePageCtx`) and RLS-scoped to what the viewer may see, so the print
  naturally shows only what's allowed. No edge function; generation is instant. The
  print module is a pure function `(model) → downloaded PDF`; the PlayArea builds the
  plain-data `model` from live state in a menu-item effect and lazy-loads nothing secret.
- **Browser print is redirected.** A global `@media print` rule (`common/theme.css`)
  replaces a browser Cmd/Ctrl-P with a note pointing at the "Print board (PDF)" option,
  since the live app doesn't reduce to paper.
