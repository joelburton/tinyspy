# Area: setgame

One of the sixteen game areas. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Brand: HareTrigger.** The codename `setgame` is what the code says everywhere —
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
that is `src/setgame/`, its two SQL files, and `docs/games/setgame.md`.)*

## Findings

*(IDs are `F-setgame-1`, `F-setgame-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**, including work done during the sprint.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/games/setgame.md` → Deferred,
deliberately and by name. That is the game's standing register; this file is the
sprint's record of the game.

### Already waiting for this area

Rows §7 → "Carried forward" already assigns here, indexed so opening this area doesn't start by re-reading the whole checklist. **That checklist is the one home** — each line there carries the evidence.

- `PlayArea.module.css` `.breakdown` + its three children are read by nothing

#### Adopt the shared leaderboard read — the common side is ALREADY WIDENED

From `game-lib` group B (`F-game-lib-11`), filed here 2026-09-04. Six games read
`status.leaderboard`; two call the shared helper and four write the same
defensive cast by hand. **Nothing here is blocked** —
`readLeaderboard<T>(status)` is generic over the row since `F-game-lib-15`, and
`StatusBlob` is already `Record<string, unknown>`, which is exactly the
parameter. Two call sites:

| where | today |
|---|---|
| `manifest.ts:120` (the club-page status line) | `(s.leaderboard as LeaderRow[] \| undefined) ?? []` |
| `components/PlayArea.tsx:442` | `(status?.leaderboard as LeaderRow[] \| undefined) ?? []` |

Each becomes `readLeaderboard<LeaderRow>(…)`. It is a small correctness gain as
well as one less copy: the hand-written version falls back to `[]` only when the
field is *missing*, while the helper also catches it being present and not an
array.

**`LeaderRow` is declared twice** — `manifest.ts:70` and `PlayArea.tsx:57` —
and setgame is the closest of the four to having one row: the two copies carry
the same four columns and differ only in whether `user_id` is optional. Worth
collapsing to one declaration while both call sites are open, rather than
keeping a copy per file that agrees today by luck.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
