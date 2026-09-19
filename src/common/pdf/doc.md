# pdf

The shared half of printing a game to PDF: the page frame every printer opens
with, the three body layouts a game composes it with, and the marks a printed
tile can carry. The design language — shades, color, what a printout records —
lives here too, so every game's print looks like it belongs to one system.

## Intro to area

A game's board on screen is live, tinted and interactive; sometimes the friends
playing it want it on paper — mid-game, to think about a clue away from the
screen, or at the end, as the record of what happened. So every game's menu
offers "Print board (PDF)". The PDF is built in the browser with jsPDF, from the
state the game already holds, so there is no server call and nothing the viewer
was not allowed to see can reach the page.

A printout is ink on white, and it has to read on a black-and-white printer as
well as a color one. So the look is deliberately plain: black text, a board
grid and labels in a dark gray, minor rules in a lighter one, and a hue only
where it carries meaning — and never alone, since a mono printer flattens green
and red to the same gray. Where the screen says something with color, the paper
says it with a shape or a weight: a drawn ✓ or ✗, a heavier ring, a filled tile.

What every page shares is the frame: a `Brand: title` header with the date, a
one-line summary, a "Setup" recap of every option the game was played with, and
the save. Below that, the games' bodies differ too much for one template — a
two-column log beside a board is nothing like a board per player with its own
log, or a board with a word list under it — so this folder is a toolkit rather
than a template. A printer picks one of three body families and draws its own
board inside it: the newspaper flow (`eventLog.ts`) for a game whose story is
its sequence of turns; one track per board (`columns.ts`) for a game where each
player has their own board and a log that belongs to it; and the balanced word
list (`wordListBody.ts`, `wordColumns.ts`, `wordSections.ts`) for a word hunt.
Crosswords composes none of it — its printer is a port kept as it was.

## Details

**A toolkit, not a template.** The families share a frame and nothing else on
purpose. One `render()` with callbacks was the alternative, and the bodies
would have spent it all on exceptions; a printer that composes primitives is
short, and stays in control of its own page.

**The Setup recap prints every option, the timer included.** A printout is a
record, and a record that omits the constraints misreports the achievement:
"we scored 300" reads differently when the next line says the whole game had a
twenty-minute clock. The rows come from the game's own `lib/setupSummary.ts`,
the same array its info column renders, so the paper and the screen cannot
drift. The mode rides the heading (`Setup: Co-op`) rather than a row — it is
fixed per gametype and never a control on the form — and the field is required
on every print model because an optional one gets forgotten and a bare "Setup"
looks perfectly fine. The screen need not repeat the mode; a PDF has no chrome
and must carry its own framing. Which controls earn a row is
[setup-form/doc.md → Setup rows](../setup-form/doc.md#setup-rows).

**A long recap value wraps; it is never truncated.** Two rows have no natural
length bound: a letter game's `Letters` row prints the whole board, and the
roster prints every username. The `Letters` row exists to be copied off the
paper into the next game's dialog, and half a board is worse than a wrapped
one. The word-list body passes `drawSetup` its width and wraps; the event-log
family pre-computes the block's height as one line per row and does not.

**Three tracks per page.** Compete allows six players, and six tracks on a
letter page are about 88pt each — a wordle keyboard needs ten keys across,
which lands under 9pt per key and stops being readable. Three keeps the
realistic two- or three-player game on one sheet and spills the rest onto
further pages rather than shrinking past legibility. The width is computed
from that cap and not from how many tracks a page holds, so a lone track on a
second page is the same size as the three before it; a lone coop board with
white space beside it is the accepted price. A game whose board is wide asks
for fewer — bananagrams' crossword sprawls across a 25×25 arena and takes two.

**Compete prints a word section per player.** In compete the words and the
score are per-player facts. One merged list under one tally reported the
viewer's own numbers as if they were the table's, and left authorship to a name
squeezed onto the end of each row. Sections follow roster order so two
printouts of one game agree; a player who found nothing still gets a section,
since finding nothing is a result; the finder is dropped inside a player's
section because the heading already says whose it is; and words nobody found
go last under "Not found", because filing a miss under a name would credit it
to them. In compete the page header drops the tally too, stating only the
shared target — there is no single number for a table where everyone scored
differently.

**Marks are drawn, and the shape carries the meaning.** The three marks in
`marks.ts` are line segments (see [Characters](#characters)), and they exist
because color may never be the only signal: a color printer gets green and red
as a bonus, and a mono one still reads the shape. They take a center and a size
so the caller owns placement — a cell's corner for one game, a small keycard
inset for another.

**The Wordle tiles are the one agreed fill.** [Backgrounds are
white](#backgrounds-are-white) says a tile is not filled and an outcome rides a
mark instead; that assumes room for a mark beside the content, and a letter
tile has none — the letter is the content. The four states are also the whole
game rather than a decoration. So `shared/wordle-style/pdfTiles.ts` carries
them as border and fill weight, in grays rather than hues, which keeps the
exception honest by construction: a color printer and a mono one produce the
same page. Scrabble's premium squares are the other stated exception, and live
in scrabble's own renderer.

**Two lessons about drawing a shape on paper**, learned on setgame's cards and
true of any shape a printer has to draw. *Convert the screen's path; don't
redraw it.* A print-only approximation of a shape drifts from the board's — a
hand-drawn squiggle came out a thin ribbon with no interior, so solid, hatched
and open were indistinguishable on it. A mechanical rewrite of the board's own
path cannot drift. *Equal slots aren't equal weight.* Given the same width, a
diamond tapers and a squiggle is a ribbon, but an oval is at full width the
whole way down, so the ovals crowd while the others look airy; draw the heavy
one narrower than its slot.

**Every drawer sets what it needs before it draws.** Font, size, text color and
draw color are document state in jsPDF, so each row and each cell sets its own
rather than trusting what the previous call left. Line width is the one a
caller has to watch: the marks change it and do not restore it.

## Shades

Everything that is not explicitly colored is drawn in one of three grayscale
values, and no other grays. jsPDF's single-argument `setTextColor(n)` /
`setDrawColor(n)` is a 0–255 gray level — `0` is black, `255` is white — so a
value in the middle is a medium-dark gray and "barely there" lives near the
top. A physical printer darkens grays further (dot gain), so calibrate line
values on an actual printout, not only on screen.

| name | value | used for |
|---|---|---|
| **black** | `0` | all real text — titles, data, the log, section headings, board words, setup values. The default. |
| **dark gray** | `70` | real-but-secondary marks — the board grid, and the one place text is a label rather than data (a table's `# / Player / …` column headers). Clearly visible, a step down from black, because these still carry the structure. |
| **medium gray** | `180` | minor lines only — the thin dividers between turn rows, the rule under a table header. Faint on purpose; they separate, they aren't content. |

Use black unless a thing is *specifically* not important. Small is not
unimportant: a small date in the corner is still black. The three are
`frame.ts`'s `BLACK`, `DARK_GRAY` and `MEDIUM_GRAY`; every printer imports them
and none defines its own.

## Color is for meaning

A hue is reserved for things that communicate, and even then it must not be
the only signal, because the page may print in black-and-white:

- ✓ — a find: the tile was correct, an agent, a solved word. Green on a
  color printer.
- ✗ — a miss: a wrong guess, the assassin, an unfound word. Red.

A mono printer flattens green and red to the same gray, so the meaning is
also carried by shape or text — a drawn ✓ against a drawn ✗, a letter A–D
inside a colored border. Color alone never distinguishes an outcome.

Nothing decorative is colored: no colored cell borders, no tinted headings, no
outcome-tinted tile fills. Reaching for color to make something *look* nicer
rather than to *tell the reader something* means a shade is wanted instead.

## Backgrounds are white

The background of almost everything is pure white — no fills. A tile, a row or
a block is not shaded unless a filled background is specifically agreed to
communicate something, and even then a mark or a shade is preferred over a
fill. No alternate-row shading in tables — rows are separated by a thin
medium-gray rule. No outcome fills on tiles — the ✓/✗ mark alone says correct
against miss.

The two agreed exceptions are the Wordle tiles (above, under Details) and
scrabble's premium squares and tan tiles, which are meaningful board features
and live in scrabble's own renderer, so the exception cannot leak.

## The frame

- **The header**: `Brand: game title` top-left (the brand from the manifest's
  `name`, the title from `common.games.title`), the date top-right, small and
  black, and a summary line below that matches the game's on-screen status
  ("9 / 214 words · 14 pts").
- **The Setup recap**: a smaller sub-heading whose text carries the mode
  (`Setup: Co-op`, `Setup: Compete`), then one `label: value` line per row of
  the game's `setupRows()`. Where it sits is the family's choice: to the
  board's right in the word-list family, at the end of the flow in the
  event-log family, under the tracks in the track family.
- **Margins** are tight (28pt) so content uses more of the paper, inside a
  printer-safe edge. Letter size, points as the unit.
- **The filename** is `<brand>-<title>.pdf`, slugified, with a per-game
  fallback when the title has no filename-safe characters.

## The body families

**Event log** (`eventLog.ts`). The board sits at the top of the left column;
the log flows down under it as a `#` / `Player` / <what happened> table with a
thin rule between rows, continues at the top of the right column, then onto
further pages — a hand-managed cursor, since a PDF paginates by page and not by
column. The Setup recap is appended at the end of the flow and moved whole to
the next column when it will not fit. A game with no board worth printing
starts the log at the column top. `twoColGeom` is the geometry a board drawn
above the log shares with it; setgame takes the geometry alone and draws its
own rows, since its row is a picture of three cards and not a line of text.

**Tracks** (`columns.ts`). One column per board: its grid, whatever belongs to
that grid (wordle adds its keyboard), then that board's own log. The newspaper
flow is wrong here — one stream wrapping between columns would file one
player's guesses under another player's grid. Coop is a single track; compete
is one per player at terminal, and just yours during play, since RLS means you
hold nobody else's until the game ends. Three per page, and why, is under
Details.

**Word list** (`wordListBody.ts` over `wordColumns.ts` and `wordSections.ts`).
The board top-left at a fixed size (a 6×6 prints bigger than a 4×4), the Setup
to its right, and below them the words in balanced, column-major, alphabetical
columns, each row `word (· bonus dot) … +score  finder`, a pangram in bold. The
list is a stack of sections: one for coop, one per player for compete (under
Details).

**Crosswords is a deliberate exception.** Its printer is a whole-cloth port of
the crossplay module it came from, kept as that produces it: a title block over
the grid, the clues flowed into balanced columns with continuation pages, and a
separate answer key, which needs the server-held solution and so fetches it
through an RPC. It is already grayscale and lands within the spirit of this
doc without adopting the frame or the Setup recap. A consistency pass must not
"fix" it onto the shared frame; the only touchpoints with this folder are
incidental. See [docs/games/crosswords.md](../../../docs/games/crosswords.md).

## Which games print

All sixteen. The family is the shared shape; what a game shows inside it is
that game's own, in its printer and its doc.

| game | family |
|---|---|
| bananagrams | tracks, two per page |
| boggle | word list |
| codenamesduet | event log |
| connections | event log in coop, tracks in compete |
| crosswords | its own port; a puzzle and an answer key |
| letterboxed | tracks |
| psychicnum | event log in coop, tracks in compete |
| scrabble | event log |
| setgame | event log geometry, its own rows |
| spellingbee | word list |
| stackdown | tracks |
| strands | tracks |
| waffle | tracks |
| wordiply | event log, no board |
| wordle | tracks |
| wordwheel | word list |

## Characters

jsPDF's core fonts are WinAnsi. A character outside it does not print — it
comes out as mojibake. `·`, `…`, `—` and the ASCII apostrophe are fine; `→`,
`✓`, `✗`, `★` and `○` are not, which is why `marks.ts` draws the marks from
line segments, an arrow is written `->`, and "Co-op" takes a plain hyphen.

## Plumbing

- **Frontend only.** Everything the print needs is already client-side, in the
  game's own state, and RLS-scoped to what the viewer may see, so the print
  naturally shows only what is allowed. No edge function; generation is
  instant. A print module is a pure function `(model) → downloaded PDF`; the
  game's PlayArea builds the plain-data model from live state when the menu
  item is chosen, so the menu need not rebuild as the board changes.
- **Browser print is redirected.** An `@media print` rule in
  `common/core-css/base.css` replaces a browser Cmd/Ctrl-P with a note pointing
  at the menu item, since the live app does not reduce to paper.
- **The gallery renders every printout** (`gmake gallery TECH=pdf`) and the
  `*-print.e2e.ts` specs download a real one per game; the folder's own tests
  drive the helpers with a fake jsPDF and pin the cursors.
