# pdf

The shared half of printing a game to PDF: the page frame every printer opens
with, the three body layouts a game composes it with, and the marks a printed
tile can carry. The design language in full — shades, color, what a printout
records — is [docs/pdf.md](../../../docs/pdf.md) until it is absorbed here.

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
[docs/pdf.md → Setup rows](../../../docs/pdf.md#setup-rows).

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
to them.

**Marks are drawn, and the shape carries the meaning.** jsPDF's core fonts are
WinAnsi, so ✓, ✗, arrows and stars do not exist to print — `→` came out as
mojibake and became `->`. The three marks in `marks.ts` are line segments, and
they exist because color may never be the only signal: a color printer gets
green and red as a bonus, and a mono one still reads the shape. They take a
center and a size so the caller owns placement — a cell's corner for one game,
a small keycard inset for another.

**The Wordle tiles are the one agreed fill.** "Backgrounds are white" says a
tile is not filled and an outcome rides a mark instead; that assumes room for a
mark beside the content, and a letter tile has none — the letter is the
content. The four states are also the whole game rather than a decoration. So
`shared/wordle-style/pdfTiles.ts` carries them as border and fill weight, in
grays rather than hues, which keeps the exception honest by construction: a
color printer and a mono one produce the same page. Scrabble's premium squares
are the other stated exception, and live in scrabble's own renderer.

**Every drawer sets what it needs before it draws.** Font, size, text color and
draw color are document state in jsPDF, so each row and each cell sets its own
rather than trusting what the previous call left. Line width is the one a
caller has to watch: the marks change it and do not restore it.
