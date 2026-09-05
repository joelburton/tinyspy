# Area: account

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/account/` — your own menu and profile editing:
`EditProfileModal`, `ColorChoiceList`, `editProfileStore`,
`useAccountMenuSection`. Six files.

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)), which dissolved `hooks`
into the folders its hooks belong to.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-account-1`, `F-account-2`, … — §21 → Areas. Every heading states
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

**1. `useAccountMenuSection`'s docstring spends its length on what the code
replaced** — archaeology, which [docs/code-conventions.md](../../docs/code-conventions.md)
rules out. From `homepage`'s deleted dependency read (2026-08-26) via
[hooks.md](hooks.md) → note 2; re-derive rather than trust.

**2. `useEditProfileOpen` is one of the five hooks gating `App.tsx`'s
blessing** (Joel, 2026-09-02) — it is one of the two store reads that decide
what hangs off the root. See [deep.md](deep.md).

**3. Where `<EditProfileModal>` mounts is NOT this area's question.** It sits a
level down from the root for no stated reason, and settling that is
[common-hosts.md](common-hosts.md)'s — the area whose whole subject is what
earns a mount at the root. What is this area's is the modal itself.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
