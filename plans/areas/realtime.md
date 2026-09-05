# Area: realtime

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/realtime/` — channels, reconnect, refetch, presence.
Fifteen files, eight of them already `cs-blessed-deep` (the channel plumbing and
the deaf-window fix); what is left unread is the presence pair and the two
subscribe hooks. Its doc is
[docs/realtime-lost-events.md](../../docs/realtime-lost-events.md).

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)). `deep` read the plumbing
half and `hooks` was to have read the hooks; `hooks` dissolved, and the folder
is now one subject with one owner.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-realtime-1`, `F-realtime-2`, … — §21 → Areas. Every heading states
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

**1. `useRealtimeReconnect` is one of the five hooks gating `App.tsx`'s
blessing** (Joel, 2026-09-02). See [deep.md](deep.md), which holds the whole
list. Re-filed from [hooks.md](hooks.md) → note 1 when that area dissolved.

**2. Presence is what pauses a game**, and the pause boundary that reads it is
[pause-suspend](../app-audit.md)'s. Where the two meet — `#-present` versus
`#-expected` — is a seam both areas touch; whichever opens second inherits
whatever the first decided rather than re-deciding it.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
