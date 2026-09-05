# Area: definitions

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/definitions/` and `src/common/anagram-finder/` —
click-a-word lookup, the dictionary-curation dialogs, and the anagram dialog.
Eighteen files. Click-to-define is common to every word game
([common.md](../../docs/common.md)).

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)), which dissolved `hooks`
into the folders its hooks belong to.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-definitions-1`, `F-definitions-2`, … — §21 → Areas. Every heading
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

**1. `useDefinePopover` is called at sixteen sites**, each holding its own
`{ word, rect }`. **The HOOK's shape is this area's**; whether sixteen copies of
that state should instead be one root-mounted anchored host is
[common-hosts.md](common-hosts.md) → note 3's question, and `TooltipHost` is the
evidence that the root-mounted form works. Re-filed from [hooks.md](hooks.md) →
note 4.

**2. `useWordEdit` is one of the five hooks gating `App.tsx`'s blessing**
(Joel, 2026-09-02) — the second of the two store reads that decide what hangs
off the root. See [deep.md](deep.md).

**3. Where `<WordEditDialog>` mounts is NOT this area's question** — same shape
as `EditProfileModal`, and same owner: [common-hosts.md](common-hosts.md).

**4. `anagram-finder` carries a red e2e.** The `anagram-finder` spec is one of
the two known to be waiting on [floating-panels.md](floating-panels.md); the
dialog is this area's, the panel machinery under it is not.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
