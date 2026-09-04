# Area: shared-game-chrome

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**What it is.** `common/components/game/` — the chrome around every play surface. 258 rules, and every game sits on it.

**Status: NOT OPENED.** Not opened. Also owns the **contract-slot guard**, checked per mount point (§9, §10).

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up — §21 says an area opens by listing its files and
stopping, and that is still true. Nothing below is a commitment; the roster is
agreed with Joel when the area actually opens.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

## Findings

*(IDs are `F-shared-game-chrome-1`, `F-shared-game-chrome-2`, … — §21 → Areas. Every heading states its
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

#### `GenericFeedbackPill`'s docstring names a property that doesn't exist

From `game-lib` group D, 2026-09-03. `common/components/feedback/GenericFeedbackPill.tsx:49`:

> *`msg.variant` is the transient-vs-permanent axis (docs/ui.md → …)*

**There is no `variant` on the message type.** `GenericFeedbackMsg`
(`common/lib/feedback/genericFeedback.ts`) declares `tone`, `text` and `mode`,
and nothing else. The axis the sentence describes is real, but it is derived —
twelve lines below the claim, at `:65`:

```ts
const outline = kind !== 'permanent'
```

So the docstring sends a reader looking for a prop to set, when the answer is
that `mode` decides it and there is nothing to set. Worth checking at the same
time whether any surface believes the docstring: **strands does** — see the note
filed in [strands.md](strands.md), where a message carries a `variant` that
nothing reads.

**Roster note:** this file is `cs-unmet` and no area's roster names it. It is
filed here because it is the below-board pill and every game sits on it, but
this area's stated scope is `common/components/game/` and the pill is in
`common/components/feedback/`. Confirm the assignment when the area opens; the
alternative homes are `common-hosts` and `hooks`.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
