# Area: session

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/session/` — who is signed in and who they are:
`useSession`, `useProfile`. Three files.

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)), which dissolved `hooks`
into the folders its hooks belong to. This file exists so the two notes that
came with those hooks have a home.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-session-1`, `F-session-2`, … — §21 → Areas. Every heading states
its status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**1. Two things in `useProfile`, both from `homepage`'s dependency read**
(2026-08-26, in an audit since deleted — the findings are gone, the files are
not; re-derive rather than trust): **a failed profile fetch is SILENT**, and an
**orphaned docstring** sits above the wrong function. Re-filed here from
[hooks.md](hooks.md) → note 2.

**2. `useSession` is one of the five hooks gating `App.tsx`'s blessing.** Joel
declined to bless it until the hooks it calls are read (2026-09-02); it is still
`cs-fixed-deep` for that reason. The other four are `realtime`'s, `keyboard`'s,
`account`'s and `definitions`'. See [deep.md](deep.md).

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
