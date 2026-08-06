# Plan — one setup summary, shared by the screen and the PDF

**Working doc.** Delete it once the work lands; the durable rules move into
[pdf.md](pdf.md) and [ui.md](ui.md), which are current-state docs.

Branch: `pdf-setup`.

## The problem

A game's setup recap is written **twice**, by hand, in two files that never
consult each other:

| | where | shape |
|---|---|---|
| screen | `<game>/components/InfoCol.tsx` | literal `<li>`s inside `<SetupDisclosure>` |
| PDF | `<game>/components/PlayArea.tsx` | a `setup: [{ label, value }]` array passed to the print model |

Only the **value formatters** are shared (`difficultyValue`, `timerLabel`,
`band`), which is why the values mostly agree while the labels and the row set
do not. They have drifted:

| game | screen | PDF |
|---|---|---|
| letterboxed | Word limit, Dictionary, **Timer** | Word limit, Dictionary |
| boggle | **Board**, **Dictionary (required)**, **Dictionary (legal)**, Scoring, **Min word length**, Win at, Timer | **Dice**, **Required words**, **Bonus words**, **Min length**, Scoring |
| scrabble | **Dictionary (2-letter)**, **Dictionary (longer)**, Timer, +1 | **2-letter words**, **Longer words (3+)** |
| psychicnum | **Tiles**, **Secret words**, Dictionary | **Difficulty**, **Guesses** |

Two different faults are tangled here, and they get different answers:

- **Omissions were deliberate** — [pdf.md](pdf.md) told printers to list "the
  *relevant* setup options only" and to drop the timer. That rule is being
  **reversed** (below), so the omissions become bugs.
- **The labels were never deliberate.** "Board" vs "Dice", "Min word length" vs
  "Min length" are one fact named twice by two files. psychicnum is the worst:
  the paper reports Difficulty/Guesses against the screen's Tiles/Secret words —
  nearly disjoint, so the printout describes a different aspect of the game than
  the panel does.

## The decisions

1. **The PDF shows every setup option, timer included.** A printout is a
   *record*, and a record that omits the constraints misreports the achievement
   ("look how well we did, and we only had 20 minutes"). This **reverses**
   pdf.md's "relevant options only" + "timer is excluded".

2. **One shared function per game emits the rows; both consumers render it.**
   Per-game `<game>/lib/setupSummary.ts`, mirroring the `lib/history.ts` seam.

3. **Rows are plain strings.** The PDF is WinAnsi and cannot take a React node
   (or an `→`), so it is the lower bound — which is the right way round. Screen-
   only richness stays outside the shared rows.

4. **The recap is the setup dialog, read back.** Every control the dialog showed
   produces exactly one row, in the dialog's order; a control that did not apply
   produces no row; nothing else appears. Omit rather than print "n/a" — a
   record must not assert a choice nobody made (`coop_style` only exists for 2+
   coop, `first_turn_user_id` only with turns).

5. **The roster is the first row.** Who played is chosen in the create-game
   dialog, so it satisfies rule 4 rather than being an exception, and it is the
   most useful fact on a record you keep.

6. **Mode rides the heading, not a row.** `Setup: Co-op` / `Setup: Compete`.
   Mode is locked at the **gametype** level (`manifest.mode`), never a control on
   the form, so a row would violate rule 4 — a heading qualifier is the correct
   shape for something framing the whole block. It also costs no line. Wording
   comes from wherever the mode pills already get it, so paper can't invent a
   third spelling.

7. **The screen deliberately does NOT repeat the mode.** The PDF is a standalone
   artifact with no app chrome and must carry its own framing; the screen already
   says the mode in the header and the club listing. Different needs, not drift —
   worth stating in the docs so it doesn't read as an inconsistency later.

## Making it enforceable

A convention that two files agree is exactly what we had, and it drifted. So
each row carries the **setup key** it describes:

```
type SetupRow = { key: string; label: string; value: string }
```

Nothing renders `key`. One roster-wide Vitest uses it: for every game, every key
in that game's default setup must produce a row, with an explicit opt-out list
for keys that are not player choices. That turns "hopefully in sync" into a
failing build, and the opt-out list becomes useful documentation in its own right
— it is exactly where letterboxed's stale `max_words` key would have surfaced.

**Considered and rejected:** one declarative `SETUP_FIELDS` array that the *form*
renders and the recap reads, making order and coverage structural rather than
asserted. Theoretically right, but the forms use bespoke controls (`SelectField`,
`DifficultyField`, timer pickers, seat pickers) and it does not pay for itself.
The keyed-row test buys most of the guarantee for a fraction of the work.

## Shape

- `common/lib/game/setupRows.ts` — the `SetupRow` type (promote the one
  `drawSetup` already takes) + any shared row builders worth having (roster,
  timer).
- `<game>/lib/setupSummary.ts` — `setupRows(setup, ctx) => SetupRow[]` per game.
- `InfoCol` maps rows to `<li>{label}: {value}</li>`.
- `PlayArea` passes the same array straight into the print model.
- `common/pdf/frame.ts` — `drawSetup` takes the mode and renders
  `Setup: Co-op` / `Setup: Compete`. **Required** on the shared print model, not
  an optional argument: an optional one means the fifteenth game forgets it and
  prints a bare "Setup" that looks fine — the same silent-default failure that
  cost us `hides_solution` twice.

## Watch for

- **The Setup block gets taller on every PDF.** boggle goes 5 rows → 7+, and in
  the word-list family (`wordListBody.ts`) Setup sits in roughly 25% of the width
  beside the board. That column needs a look, and the roster row makes it worse
  for a big club.
- **crosswords builds no setup array at all** — the only game missing one. Find
  out whether that is deliberate (its "setup" is a puzzle choice) or an oversight.
- **bananagrams keeps its disclosure in `PlayArea.tsx`**, not an `InfoCol.tsx`
  (the v3 layout exception). Its rows move the same way, just from a different
  file.
- **Row counts today** (screen `<li>`s): boggle 7, connections 5, wordwheel 5,
  scrabble 4, spellingbee 4, stackdown 4, strands 4, wordle 4, codenamesduet 3,
  letterboxed 3, psychicnum 3, waffle 3, wordiply 2. Use these as a floor: a game
  whose shared row count comes out *below* its current screen count has lost
  something.

## Status — DONE

All fifteen games swept. Delete this file; the durable rules live in
[pdf.md → Setup rows](pdf.md#setup-rows).

1. `pdf.md` corrected — the reversal, the `Setup: <mode>` heading, the new
   "Setup rows" section, and `PrintHeader.setup`'s own doc-comment.
2. `common/lib/game/setupRows.ts` — the `SetupRow` type (with `key`) + the
   shared builders `rosterRow` / `coopRows` / `timerRow`.
3. `drawSetup` renders `Setup: Co-op` / `Setup: Compete`; `PrintHeader.mode` is
   **required**, which is what made the compiler enumerate the sweep.
4. **Fourteen games** have `<game>/lib/setupSummary.ts`, feeding the info column
   and the print model *the same array object*. **crosswords** is the documented
   exception: it never had a recap on either surface (no `<SetupDisclosure>`, and
   its PDF is the whole-cloth ported printer with no Setup block), so there was
   nothing to unify — adding one would be new UI.
5. `src/setupRows.test.ts` — the roster-wide guard. It pins that every game has a
   summary (or is a documented exception), that every key of a game's default
   setup produces a row (or is named in `NOT_A_ROW` with a reason), that the
   roster leads, and that values are plain strings. Verified by planting: delete
   a row and it fails.

### What the sweep turned up

- **bananagrams' `dict_2` / `dict_3plus` appeared on NEITHER surface.** Real
  controls (the word-check bands), simply missing from both lists. The coverage
  test found them; they're now conditional rows that follow `word_check`.
- **boggle printed "Win at: undefined%".** The screen row tested `=== null` while
  an unset threshold is `undefined` — latent behind a closed disclosure, glaring
  once it printed. Now `== null`.
- **Constants dropped**, per "the recap is the dialog read back": psychicnum's
  "Secret words: 3", stackdown's "Tiles: 30" / "Words to clear: 6", connections'
  "Words: 16" / "Categories: 4" / "Mistakes allowed: 4". None is a control; they
  belong in Help.

## Order of work

1. **Correct `pdf.md` first**, so the repo does not contradict itself mid-flight
   (the "relevant options only" + "timer excluded" rules). ← *do this first*
2. Land the shape on **two games**: letterboxed (small, familiar) and psychicnum
   (the one that is actually wrong, not merely inconsistent).
3. Add the keyed-row roster test once two games prove the shape.
4. Sweep the remaining thirteen mechanically.
5. Verify PDFs by rendering: `pdftoppm` per docs/pdf.md, checking the taller
   Setup block against the board in each body family.
6. Delete this file; the rules live in `pdf.md` + `ui.md`.
