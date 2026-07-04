# Printing game boards to PDF

Some games can print their board to a PDF (a "Print board (PDF)" item in the GamePage
menu) — a paper record of the board + moves you can print mid-game or at the end. This
doc is the **shared design language** for those printouts, so every game's print looks
like it belongs to the same system (the on-screen consistency goal — see
[ui.md](ui.md) — extended to paper).

Status: **shared `common/pdf/` helpers**, with three games printing today (scrabble,
psychicnum, boggle). **Joel picked jsPDF** over react-pdf (see [project memory] / the
`scrabble-react-pdf` branch): precise layout control, a lighter dep, and it matches his
existing jsPDF crossword-print code that will land in puzpuzpuz.

The extraction is a **toolkit of à-la-carte helpers**, not a template — the games' body
layouts differ too much (a 2-column newspaper turn flow vs. a board + side-setup + word
columns) to share one `render()` with callbacks. So the frame owns the truly-common
atoms and each game composes them with its OWN board renderer + a plain-data model:

| module | used by | what it does |
|---|---|---|
| `common/pdf/frame.ts` | **all** | the shade constants, `PrintHeader` base model, `newPrintDoc`, `drawHeader`, `drawSetup`, `fit`, `savePrint` |
| `common/pdf/turnLog.ts` | scrabble, psychicnum | `twoColGeom` + `drawTurnLog` — the newspaper 2-column `# / Player / <move>` flow (the only per-game difference is the move-column label) |
| `common/pdf/wordColumns.ts` | boggle, spellingbee | `drawWordColumns` — the balanced N-column alphabetical word list; per-word flags `bonus` (a dot) and `pangram` (bold) let each game opt in |

A game's `print<Game>Pdf` is then small: build a `PrintDoc`, `drawHeader`, draw its own
board, call `drawTurnLog` **or** `drawWordColumns`, `savePrint`.

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
- **A "Setup" section** — a smaller sub-heading listing the *relevant* setup options only
  (e.g. the dictionary/difficulty bands); the **timer is excluded** (not relevant on paper).
- **Margins** are tight-ish (~28pt) so content uses more of the paper, while staying
  inside a printer-safe edge.

**Body family 1 — turn-log games (`turnLog.ts`; scrabble, psychicnum).** Letter page,
two columns, newspaper flow: the board (+ the summary) sits at the top of the **left**
column; the turn log flows down under it and **continues at the top of the right column**,
then onto further pages (every PDF lib paginates by page, not column, so it's a
hand-managed column cursor). The log is titled **"Turns"** (the project's word for a
turn — matches the shared `<TurnLog>`), a `#` / `Player` / <what-happened> table with a
thin rule between turns; the Setup section is appended at the end of the flow.

**Body family 2 — word-list games (`wordColumns.ts`; boggle, spellingbee).** A
**fixed-size** board top-left (so a 6×6 prints bigger than a 4×4 — it isn't scaled to a
column), the Setup to its **right**, and below them the words in **N balanced,
column-major, alphabetical columns** (each row `word (·bonus dot) … +score  finder`).
The board is per-game: boggle draws a tile grid; spellingbee draws its 7-hex honeycomb
(from `spellingbee/lib/honeycomb.ts`, the same geometry the on-screen SVG board uses —
white hexes, the center distinguished only by a thicker border). Spellingbee also uses
the `pangram` row flag (pangrams print **bold**).

## Plumbing

- **Frontend only.** Everything the print needs is already client-side (the game's
  `useGame` + `GamePageCtx`) and RLS-scoped to what the viewer may see, so the print
  naturally shows only what's allowed. No edge function; generation is instant. The
  print module is a pure function `(model) → downloaded PDF`; the PlayArea builds the
  plain-data `model` from live state in a menu-item effect and lazy-loads nothing secret.
- **Browser print is redirected.** A global `@media print` rule (`common/theme.css`)
  replaces a browser Cmd/Ctrl-P with a note pointing at the "Print board (PDF)" option,
  since the live app doesn't reduce to paper.
