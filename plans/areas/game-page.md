# Area: game-page

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/game-page/` — the live game's page and everything it
hands down: `GamePage`, `gamePageCtx`, `useCommonGame`, `useStandardGameActions`,
the error boundary and its mount log, `ModePill`, `GameHelpCompanion`, and the
manifest's device and keyboard gates (`DeviceBlockNotice`, `useGameHasKeyboard`).
Nineteen files, one of them (`gamePageCtx.ts`) already `cs-blessed-game-lib`.

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)), which dissolved
`shared-game-chrome` — `common/components/game/` — into the folders its files
belong to. This is the one that took the page itself.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-game-page-1`, `F-game-page-2`, … — §21 → Areas. Every heading
states its status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**1. The contract-slot guard**, checked per mount point (app-audit.md §9, §10).
Inherited from `shared-game-chrome` when it dissolved: this area owns the mount
points, so it owns the guard over them. See
[shared-game-chrome.md](shared-game-chrome.md).

**2. The global feedback slot `GamePage.tsx` holds inline is `feedback`'s
concern.** Whatever that area decides about slot ownership lands as a change
this one applies. Also inherited from `shared-game-chrome`; see
[feedback.md](feedback.md).

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
