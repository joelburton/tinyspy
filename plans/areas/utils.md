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

**Status: OPEN — roster agreed with Joel 2026-09-03**, and the seven files below
are stamped `cs-met-utils` (§21: agreed, on an open area's roster, not yet read).

## The roster

**Seven files, 433 lines.** Agreed 2026-09-03 by listing them and stopping.

```
  99  friendlyDate.ts        94  friendlyDate.test.ts
  35  keyboardHandoff.ts
  42  linkify.tsx            91  linkify.test.tsx
  27  mulberry32.ts
  45  outcomes.ts                                    (lib/ root, not lib/util/)
```

Three units carry a test; `keyboardHandoff` and `mulberry32` have none, which is
a question for the audit rather than an assumption.

**`outcomes.ts` is IN** (Joel, 2026-09-03, answering the shell's open question).
It sits at the root of `lib/` rather than in `lib/util/`, but it matches this
area's membership rule word for word — no page, no game, no subsystem — and the
competing owner (`corecss`, since the outcome families are also a color bucket)
would only ever see its color half. The other two loose files at that root went
to **`game-lib`**.

### Already read — `deep`'s, and not re-read here

Six files, 408 lines, all `cs-blessed-deep`. Listed so the folder's contents are
complete; they are `deep`'s record, not this area's:

```
  21  cls.ts                     F-deep-36 — "one util", read by nearly every component
  31  layoutWidth.ts
  22  logStamp.ts                created BY F-deep-28, out of realtimeDiag.ts
  68  panic.ts               96  panic.test.ts
  63  reloadOnStaleChunk.ts 107  reloadOnStaleChunk.test.ts   F-deep-4, F-deep-11
```

`reloadOnStaleChunk` is boot machinery that happens to live in this folder —
`main.tsx` calls it before the first render. `logStamp.ts` is the reverse: this
folder GAINED a file from an area auditing somewhere else.

**This shell's original roster was wrong in three ways**, recorded because the
same trap is set for every unopened area: it predated `panic.ts` /
`panic.test.ts` entirely, listed `layoutWidth.ts` as unread when it is blessed,
and gave stale line counts for `cls.ts` and `layoutWidth.ts`. Its summary line —
"eight files, none of them read" — was wrong in both halves. **A shell's guessed
roster is a note, never a count**; check the stamps at the opening.

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

**RESOLVED at the opening — `outcomes.ts` is on the roster.** See "The roster"
above. The other two loose files at that root went to **`game-lib`**, the area
created 2026-09-03 out of this one's opening: `games.ts` + its test, along with
the split of `games.ts` into five vocabularies. Joel's call on why they are not
here: *"i don't want to dive into game-stuff yet."*

**A shared "storage that cannot throw" helper, and a guard that requires it.**
Raised by `deep` 2026-09-02 while fixing `F-deep-11` and `F-deep-13`.
**IN SCOPE for this area** (Joel, 2026-09-03, at the opening) — so this area
writes files that were not on the roster it agreed.

**One question to settle before building it, not now: how far does the
conversion go?** Eight of the eleven callers belong to areas that have not
opened, and two recorded rules point opposite ways — a migration done to one
layer is a regression, but a scoped pass never edits another area's code. The
answer decides whether this is one sitting or three files.

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
