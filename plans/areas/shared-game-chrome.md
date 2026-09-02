# Area: shared-game-chrome

Area 7 of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; the plan holds the order, this file holds everything else.

**What it is.** `common/components/game/` — the chrome around every play surface. 258 rules, and every game sits on it.

**Status: NOT OPENED.** Not opened. Also owns the **contract-slot guard**, checked per mount point (§9, §10).

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up — §21 says an area opens by listing its files and
stopping, and that is still true. Nothing below is a commitment; the roster is
agreed with Joel when the area actually opens.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-shared-game-chrome-1`, `F-shared-game-chrome-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
