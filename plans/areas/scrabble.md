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

#### Nineteen citations to two documents that do not exist

From `game-lib` group F (`F-game-lib-44`), filed here 2026-09-04. Fixing that
finding's two dead citations in `common/lib/game/trie.ts` meant grepping for the
doc names, and the grep came back with this folder.

**Neither `docs/scrabble-ai.md` nor `docs/scrabble-ai-strength.md` exists** —
both are residue of shipped plans, which CLAUDE.md deletes when their work
lands. **Nineteen lines across eleven files still cite them**, several with a
section number to make it worse: `S3`, `S5`, `fixes §1`, `band rule`.

| file | citations |
|---|---|
| `lib/policy.ts` | 5 (all `-strength`) |
| `components/PlayArea.tsx` | 2 · `components/InfoCol.tsx` 2 · `components/BoardCol.tsx` 2 · `lib/rank.ts` 2 · `lib/setup.ts` 2 |
| `lib/suggest.ts`, `manifest.ts`, `components/SetupForm.tsx`, `components/InfoCol.module.css` | 1 each |

**The live home exists and is good**, which is what makes this cheap:
`docs/games/scrabble.md` **§11 "The move suggester (AI)"** (`:888`) and **§12
"The AI opponent (compete)"** (`:951`) are where that knowledge landed. Most
citations redirect to one of those two sections.

**The judgment, per site, is the same one `F-game-lib-44` made:** a pointer
whose *reasoning is already inline* should be deleted rather than redirected —
`trie.ts`'s `§7` cited an argument the paragraph above it already made in full,
so the address went and the argument stayed. Some of these nineteen will be that
case; the ones carrying a section number (`S3`, `S5`) most likely are not, since
they point at content the docstring summarizes rather than repeats.

**Not fixed from here** — eleven files, all `scrabble`'s, and §21's focused
scope. `common/lib/game/trie.ts` was `game-lib`'s and is done.

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
