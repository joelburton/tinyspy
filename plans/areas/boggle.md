# Area: boggle

One of the sixteen game areas. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Brand: MothCubes.** The codename `boggle` is what the code says everywhere —
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
that is `src/boggle/`, its two SQL files, and `docs/games/boggle.md`.)*

## Findings

*(IDs are `F-boggle-1`, `F-boggle-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**, including work done during the sprint.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/games/boggle.md` → Deferred,
deliberately and by name. That is the game's standing register; this file is the
sprint's record of the game.

### Already waiting for this area

Rows §7 → "Carried forward" already assigns here, indexed so opening this area doesn't start by re-reading the whole checklist. **That checklist is the one home** — each line there carries the evidence.

- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The fix is removing the tab stop, not restyling the ring

#### Adopt two shared found-words modules — the common side is ALREADY WIDENED

From `game-lib` group B, 2026-09-03 (`F-game-lib-15`). Boggle is a third member
of the found-words family that the original extraction stopped one game short
of, because spellingbee and wordwheel were byte-identical and boggle was merely
almost. **Nothing here is blocked** — both shared modules now accept boggle's
shapes, verified by compiling boggle's own types against them. Two call-site
changes, both deletions:

1. **`boggle/lib/displayRows.ts` (48 lines) + its test can go**, replaced by
   `common/lib/game/foundWordsDisplayRows.ts`. The two functions are the same
   algorithm line for line — same dedup by earliest `found_at`, same
   `findersByWord`, same shadowing, same sort — differing ONLY in that boggle
   omits `isPangram`, which `WordListRow` already declares optional. The shared
   parameters are now structural, so boggle's `FoundWordRow` fits as-is.

   **The note that said not to do this was false.** It read: *"boggle
   deliberately keeps a different rule (per-player duplicates in compete) — it
   has its own displayRows and must NOT use this one."* Boggle dedups by word to
   the earliest finder exactly as the shared one does, and its own tests say so
   (*"each found word once"*, *"dedups a word to its earliest finder"*). The
   note is corrected; it is recorded here because a false justification is worse
   than none — it is how a wrong decision survives by being cited.

2. **`PlayArea.tsx`'s two inline `(status?.leaderboard as LeaderRow[] …) ?? []`
   casts** become `readLeaderboard<LeaderRow>(status)`. That helper is now
   generic over the row (`F-game-lib-11`), because every compete game keeps a
   leaderboard and none of them agree on its columns.

**Deliberately NOT on this list: `makeFoundWordsGame`.** 57% of boggle's
`useGame` is byte-identical to it, but the rest is not — boggle reads `games`
where the hive games read a `games_state` view, with different columns and a
different header type. Sharing it would mean parameterising the table, the
select list and the row→object mapping, which turns a shared hook into a
framework. Joel, 2026-09-03: *"i prefer clarity and not over-generalizing …
the third sounds like one i'd skip."* The duplication there is cheaper than the
abstraction; revisit only if a fourth game turns up.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
