# Area: wordiply

One of the sixteen game areas. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Brand: WordWire.** The codename `wordiply` is what the code says everywhere —
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
that is `src/wordiply/`, its two SQL files, and `docs/games/wordiply.md`.)*

## Findings

*(IDs are `F-wordiply-1`, `F-wordiply-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**, including work done during the sprint.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/games/wordiply.md` → Deferred,
deliberately and by name. That is the game's standing register; this file is the
sprint's record of the game.

### Already waiting for this area

*(§7 → "Carried forward" assigns nothing to this game. The item below came from
another area's audit, not from that checklist.)*

#### Adopt the shared leaderboard read — the common side is ALREADY WIDENED

From `game-lib` group B (`F-game-lib-11`), filed here 2026-09-04. Six games read
`status.leaderboard`; two call the shared helper and four write the same
defensive cast by hand. **Nothing here is blocked** —
`readLeaderboard<T>(status)` is generic over the row since `F-game-lib-15`, and
`StatusBlob` is already `Record<string, unknown>`, which is exactly the
parameter. Two call sites:

| where | today |
|---|---|
| `manifest.ts:117` (the club-page status line) | `(s.leaderboard as LeaderRow[] \| undefined) ?? []` |
| `components/PlayArea.tsx:297` | `(status?.leaderboard as LeaderRow[] \| undefined) ?? []` |

Each becomes `readLeaderboard<LeaderRow>(…)`. It is a small correctness gain as
well as one less copy: the hand-written version falls back to `[]` only when the
field is *missing*, while the helper also catches it being present and not an
array.

**The question this area actually has to answer is the row, not the read.**
`LeaderRow` is declared **twice** — `manifest.ts:79` and `PlayArea.tsx:43` — and
the two disagree: the PlayArea copy carries `letter_count?`, which the manifest
copy has never heard of. One of them is wrong about what the server writes.
Adopting the helper is the moment that becomes visible, because both call sites
then name the same type parameter.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
