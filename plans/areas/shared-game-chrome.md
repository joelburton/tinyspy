# Area: shared-game-chrome — DISSOLVED 2026-09-04

> **This area no longer exists, and it never opened.**
> `common/components/game/` was dissolved by the restructure
> ([common-restructure.md](../common-restructure.md)) into the folders its 66
> files belong to — `game-page`, `info-sheet`, `turn-log`, `word-list`,
> `word-entry`, `terminal`, `pause-suspend`, `timer`, `reveal`, `move-flash`,
> `invitations`, `lists`. **Every path below is a pre-move path.**
>
> It had no roster and no findings. Its one live item — **the contract-slot
> guard, checked per mount point** — went to [game-page.md](game-page.md), which
> owns the mount points, along with the `GamePage` feedback-slot note below.
> `StrikeMarks` was never really its own: it moved into `src/connections/`,
> its only importer.

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**What it is.** `common/components/game/` — the chrome around every play surface. 258 rules, and every game sits on it.

**`turnCopy.tsx` went to `feedback` on 2026-09-04** — it holds two message
builders (`waitingTurnPill`, `yourTurnPill`), which are the same vocabulary as
`localPills` rather than chrome. `GamePage.tsx` stays here, but **the global
feedback slot it holds inline is `feedback`'s concern**: whatever that area
decides about slot ownership lands as a change this one applies.
See [feedback.md](feedback.md).

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

### Already waiting for this area

#### MOVED 2026-09-04 to `feedback` — `GenericFeedbackPill`'s docstring names a property that doesn't exist

Filed here on 2026-09-03 with a roster caveat, because the file was `cs-unmet`
and no area's roster named it. That is now settled: it belongs to `feedback`
([feedback.md](feedback.md) → "Already waiting for this area"), along with the
`strands` call site that believed the docstring.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
