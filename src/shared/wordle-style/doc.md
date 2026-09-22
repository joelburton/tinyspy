# wordle-style

The per-letter color codes of the hidden-target games: what the server says
about each letter of a guess, and how that is drawn on screen and on paper.

## Intro to area

A hidden-target game answers a guess with a string — one character per letter,
`g` for right-letter-right-spot, `y` for in-the-word-wrong-spot, `x` for not in
the word at all. That string is the whole of the feedback, and it belongs to the
server: it is computed by `common.wordle_colors` from an answer the browser does
not hold, and the frontend never recomputes it. This folder is everything that
happens once it arrives.

Which is less than it sounds like. `tileColor` turns one code into one CSS class
key, `tileColors.module.css` is the rule each of those keys names on screen, and
`pdfTiles` draws the same four states on paper — as border and fill weight
rather than hue, so a mono printer and a color one produce the same page. None
of them decides anything. The color VALUES are the `--wordle-*` tokens, which
live with the rest of the palette rather than here.

The decision the folder does own is that the class keys are named for colors
rather than for meanings — `wordleGreen`, not `correct`. docs/ui.md → The
buckets carries the argument; the consequence is what matters at this level.
These values ARE the class names, so a board indexes a stylesheet with them
directly, and a class renamed on one side of that lookup fails silently — the
tile simply draws with no color. That is what the second half of
`tileColor.test.ts` guards, over every stylesheet it can find painting these
classes.

## Where `blank` lives

`tileColors.module.css` paints the three JUDGED classes and stops there. Both
boards that draw a letter verdict — wordle's guess rows, waffle's lattice —
index it for a `g`/`y`/`x`, so the palette has one definition and the two games
cannot drift apart.

`blank` is each board's own, in its own stylesheet, and a board branches to it
by name rather than indexing. The judged three are one palette saying one thing;
an unjudged tile is a claim about that board instead — wordle's is a slot nobody
has typed into (transparent, the board's resting look), waffle's is a tile whose
colors have not arrived or were taken back for a swap in flight (a light fill,
since every other tile there has one). A shared class would have to mean both.

The split is also what makes each half checkable. The judged lookup is computed,
so `tileColor.test.ts` is what holds it; the `blank` branch is a plain
`styles.blank`, which `src/guards/cssClasses.test.ts` reads against the board's
own stylesheet.
