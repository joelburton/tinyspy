# Area: web-storage

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/web-storage/` — `localStorage` and `sessionStorage`
wrapped so a browser that blocks site data cannot throw, plus the sticky-choice
hook that rides on them. Five files, three of them already `cs-blessed-utils`;
what is left unread is `useStickyChoice` and its test.

**Created 2026-09-04** by the restructure
([common-restructure.md](../common-restructure.md)). The wrapper half was
`utils`'s and is closed; the hook came from `hooks`, which dissolved.

**Status: NOT OPENED.**

Nothing below is a commitment; the roster is agreed with Joel when the area
actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-web-storage-1`, `F-web-storage-2`, … — §21 → Areas. Every heading
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

**1. `useStickyChoice.test.ts` should adopt `storage.fake.ts`, and drop its
guard exemption** — from `utils`, 2026-09-03, re-filed here from
[hooks.md](hooks.md) → note 6.

jsdom in this project ships **no `localStorage` at all**: `window.localStorage`
is `undefined` under our vitest config, so any test touching storage installs a
Storage-shaped fake first. This file hand-rolls one, as did
`chatOpenStore.test.ts`; `utils` extracted the third copy instead of writing it,
so `storage.fake.ts` now provides `installFakeStorage()` and, more usefully, a
`block()` that makes every method throw.

Two reasons this is worth doing when the area opens rather than never:

- the file is one of five entries in `src/guards/rawStorage.test.ts`'s `ALLOWED`
  list, and that list is meant to shrink — its second test already fails on an
  entry that has stopped being an offender;
- the hook's own third decision is *"storage failures degrade to in-memory
  state"*, which is exactly what `block()` exists to exercise.

`useStickyChoice.ts` itself was converted by `utils` and calls `readStored` /
`writeStored`; only the TEST still reaches for raw storage.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
