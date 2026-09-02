# Area: utils

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/lib/util/` — the small, general helpers that belong
to no page, no game and no subsystem. `deep` set them aside with the note that
each would be "picked up by whichever area uses them"; that answer was wrong in
the ordinary way, because a helper read by ten callers across six areas has no
such area.

**Created 2026-09-02** by Joel, while resolving `deep`'s two storage findings,
and scheduled directly after `deep`.

**Status: NOT OPENED.**

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up. Nothing below is a commitment; the roster is agreed with
Joel when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

The folder as it stands, listed so the shell is useful rather than empty —
**not agreed**:

```
  22  cls.ts                     (on `deep`'s roster — see the question below)
  99  friendlyDate.ts        94  friendlyDate.test.ts
  35  keyboardHandoff.ts
  52  layoutWidth.ts
  42  linkify.tsx            91  linkify.test.tsx
  27  mulberry32.ts
  63  reloadOnStaleChunk.ts 107  reloadOnStaleChunk.test.ts   (`deep`'s — boot machinery)
```

**Two of the ten are already `cs-met-deep`**, and the question of whether they
move is Joel's:

- **`reloadOnStaleChunk`** is boot machinery that happens to live here.
  `main.tsx` calls it before the first render, `deep` audited it, and two of that
  area's findings are resolved against it. It should almost certainly stay
  `deep`'s.
- **`cls.ts`** is on `deep`'s roster as "one util", read by nearly every
  component. It has not been read yet — `deep`'s remaining passes are the data
  path and the realtime plumbing — so it could move here without losing
  anything.

## Findings

*(IDs are `F-utils-1`, `F-utils-2`, … — §21 → Areas. Every heading states its
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

**A shared "storage that cannot throw" helper, and a guard that requires it.**
Raised by `deep` 2026-09-02 while fixing `F-deep-11` and `F-deep-13`.

`localStorage` and `sessionStorage` throw where a browser blocks site data, so
every access needs a `try/catch`. **Eleven files touch storage and the same three
lines are written eight times** — `chatOpenStore`, `scratchpadOpenStore`,
`useStickyChoice`, `useDraggablePanel`, `chatUnread`, `gameInvites`, crosswords'
`PlayArea`, and now `reloadOnStaleChunk` and `loadTheme`. The rule is already
written down, in `useStickyChoice`'s docstring: *"`localStorage` failures are
non-fatal. Private mode throws on read and write."*

Two halves, and the second is the point:

- a helper (`readStored` / `writeStored`, or similar) that cannot throw;
- **a guard banning a raw `localStorage.` / `sessionStorage.` outside it** —
  because a convention held by eight files and broken by two is what produced
  both findings, and this repo answers that with a mechanism rather than care.

It was NOT built when the findings were fixed, deliberately: landing the helper
with two callers converted and eight left raw is a half-migration, and eight of
those files belong to areas that have not opened. The conversion is one sitting
for whoever owns it.

**The fallback is a real decision each time, not a wrap.** `reloadOnStaleChunk`
fails CLOSED — no storage means no reload — because an uncounted reload is a
loop, and the counter exists to prevent exactly that. A helper must not flatten
that choice into a single default.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
