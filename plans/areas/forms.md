# Area: forms

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**What it is.** The design language of forms: the shared field components, the setup scaffolding, and the common buttons. The sixteen game `SetupForm`s are consumers, not members.

**Status: NOT OPENED.** Audited once before the restart (2026-08-25 → 08-26) and **re-audited from scratch when it reopens**; that file was deleted 2026-09-02 (§21 → the restart). Its forward-pointing items are in §7 → "Carried forward".

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up — §21 says an area opens by listing its files and
stopping, and that is still true. Nothing below is a commitment; the roster is
agreed with Joel when the area actually opens.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-forms-1`, `F-forms-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Handed here by `game-lib` — the one `lib/` → `components/` import in the setup contract

`src/common/lib/setup/setupForm.ts` imports `FormErrors` from
`components/fields/formState` for `SetupBodyProps.errors`. A `lib/` module
reaching into `components/` is the wrong direction, and it is the only
runtime-erased edge of its kind left in the game contract (`game-lib`'s split
moved it here rather than fixing it — `plans/areas/game-lib.md` →
`F-game-lib-1`, "What the split does NOT fix"). The fix is this area's because
`FormErrors` is a form concept: either it moves down to a `lib/` home the setup
contract can import from, or the setup contract stops naming it. Filed
2026-09-04; the docstring on `setupForm.ts` points here.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
