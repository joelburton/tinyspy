# Area: scrabble

One of the sixteen game areas. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Brand: RackAttack.** The codename `scrabble` is what the code says everywhere —
schema, folder, gametype, this file. The brand appears in the manifest's `BRAND`
and nowhere else (docs/naming.md).

**Status: NOT OPENED.**

**A game area is TWO passes, back to back** (§7 → The areas, in order): the audit
pass — React, SQL and CSS together — and then the **tile-feedback** pass against
[tile-feedback.md](../tile-feedback.md), which is a design target read per area
rather than a sprint of its own. The game's tf level is tracked there.

This file exists **before** the area opens so there is somewhere to put a note the
moment one turns up. Nothing below is a commitment; the roster is agreed with Joel
when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP. For a game
that is `src/scrabble/`, its two SQL files, and `docs/games/scrabble.md`.)*

## Findings

*(IDs are `F-scrabble-1`, `F-scrabble-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**, including work done during the sprint.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/games/scrabble.md` → Deferred,
deliberately and by name. That is the game's standing register; this file is the
sprint's record of the game.

### Already waiting for this area

Rows §7 → "Carried forward" already assigns here, indexed so opening this area doesn't start by re-reading the whole checklist. **That checklist is the one home** — each line there carries the evidence.

- The AI suggest-a-move box is the fifth `SelectionList` site and did not fit — three options written up in `docs/games/scrabble.md` → Deferred
- `ScrabbleBlankPickerBlockingModal`'s overlay at `z-index: 50`, below the panel tier — the ladder's known anomaly
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The fix is removing the tab stop, not restyling the ring

#### The manual-end terminal is hand-written, and reads differently from every other game

From `game-lib` group C, 2026-09-03. `components/PlayArea.tsx:765`:

```ts
if (playState === 'ended') return { verdict: 'Ended', message: 'Ended', tone: 'neutral' }
```

Thirteen games call the shared `endedCopy(mode)` from
`common/lib/game/terminalCopy.ts`, which returns `Game ended` (coop) /
`Game ended — no winner` (compete) with `Game over` as the message. RackAttack
says `Ended` on both surfaces instead, so the same event reads differently here
than anywhere else in the app.

Two things wrong beyond the drift:

- **`verdict` and `message` are the same string**, which is the one thing
  `TerminalCopy` exists to separate — its own docstring calls them "two cuts at
  the same outcome, for two surfaces of different width".
- **No comment says why.** MothCubes also diverges here and explains itself (a
  compete word hunt spends the pill's width on the tally); this looks
  unconverted rather than decided.

The fix is almost certainly `return endedCopy(mode)`. Left for this area in case
the divergence turns out to be wanted, in which case it needs a comment instead.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
