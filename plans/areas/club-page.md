# Area: club-page

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**What it is.** The club room: its page and everything shown on it.

**Status: NOT OPENED.** Not opened. It carries the largest share of §7's "Carried forward" checklist — the viewport-fit chain, the `.frame` → `.page` rename, `<ModePill>` becoming a badge, the `=` solo-handle convention, the two-line row, the twice-rendered filters, the two-column fold, and two red e2e specs.

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up — §21 says an area opens by listing its files and
stopping, and that is still true. Nothing below is a commitment; the roster is
agreed with Joel when the area actually opens.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-club-page-1`, `F-club-page-2`, … — §21 → Areas. Every heading states its
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

**MOVED 2026-09-03 — chat has its own area now.** A `utils` item about
`chatOpenStore.test.ts` was filed here for an hour, on the reasoning that the
club is chat's venue. It was wrong: `<Chat>` is mounted by `GamePage.tsx:713` as
well as `ClubPage.tsx:1179`, so chat belongs to a page no more than the header
does. See [chat.md](chat.md), which §7 schedules between this area and
`shared-game-chrome`.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
