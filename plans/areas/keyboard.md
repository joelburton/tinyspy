# Area: keyboard

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/keyboard/` — every way the app listens for a key:
capture, the global handler, the app shortcuts, tab rings, the backtick escape,
and the keyboard handoff. Eleven files, one of them (`keyboardHandoff.ts`)
already `cs-blessed-utils`. Its doc is
[docs/keyboard-shortcuts.md](../../docs/keyboard-shortcuts.md).

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)), which dissolved `hooks`
into the folders its hooks belong to.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-keyboard-1`, `F-keyboard-2`, … — §21 → Areas. Every heading states
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

**1. `useTabRing` has no test at all**, and its on-screen test is false for a
`position: fixed` element. It is the mechanism [tab-rings.md](../tab-rings.md)
was written to produce, so this area is where that plan's engine gets read. From
`homepage`'s deleted dependency read (2026-08-26) via [hooks.md](hooks.md) →
note 2 — re-derive rather than trust.

**2. `useAppShortcuts` — a docstring that named two pages when three call it**
(same source as note 1), and something bigger: **the hook binds at two scopes.**
`~` and `⌥\`` are global; `/` chat is page-dependent (`chat: false` on
HomePage). A hook that takes an option to turn off one of its three bindings is
a hook doing two jobs. Re-filed from [hooks.md](hooks.md) → note 3.

**The mounting half of that is NOT this area's:** `useAppShortcuts` returns JSX
and three pages must remember to render it, which is a question about what earns
a mount at the root — [common-hosts.md](common-hosts.md) → note 1.

**3. `useBacktickEscape` is one of the five hooks gating `App.tsx`'s blessing**
(Joel, 2026-09-02). See [deep.md](deep.md).

**4. `keyboardHandoff.ts` has a scheduled successor.** `handOffKeyboardOnTab` is
row 7 of the eight behaviors in [tab-rings.md](../tab-rings.md), and both its
callers (`ChatBody`, `GameScratchpadCompanion`) are floating panels — so the
CONVERSION is `floating-panels`', not this area's (`F-utils-7`, and the file
audits clean). Recorded here so this area does not "tidy" a file that has a
successor coming.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
