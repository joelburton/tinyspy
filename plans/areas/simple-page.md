# Area: simple-page

Area 5 of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; the plan holds the order, this file holds everything else.

**What it is.** The pages that are not home, club or game: `LoginScreen`, `ClaimHandleScreen`, `ErrorPage`, `Loading`. The roster's test is **"does `App` render it directly?"**

**Status: NOT OPENED.** Not opened. It also owns **the page shell** — a page is an optional header above a centered, width-bounded body, and the body is either a card or a layout (§7 → Carried forward). `CardOnlyPage` is a name already settled and waiting for it.

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up — §21 says an area opens by listing its files and
stopping, and that is still true. Nothing below is a commitment; the roster is
agreed with Joel when the area actually opens.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-simple-page-1`, `F-simple-page-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Things another area noticed that belong here. **Add freely** — a line here costs
nothing and is the alternative to losing it.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
