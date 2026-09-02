# Area: corecss

An area of app-audit's step 7. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**What it is.** The app's core stylesheets — the ones every page and every game
loads, that belong to no page and no game: the theme-independent half of the
chain (`fixed.css`, `base.css`, `patterns/*.css`, `utilities.css`), the themes and
the machinery that picks one, and `breakpoints.css`.

**Created 2026-09-02** by Joel, while resolving `deep`'s first finding: *"make a
new area: `corecss`; that will be the area where we do corecss stuff. It will come
after the `deep` area."*

**Status: NOT OPENED.** It exists on the same argument `deep` was created on: these files are underneath every surface, so
reading a page on top of a stylesheet nobody has read means auditing the same
questions once per page.

This file exists **before** the area opens so there is somewhere to put a note the
moment one turns up. Nothing below is a commitment; the roster is agreed with Joel
when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

The likely members, listed so the shell is useful rather than empty — **not
agreed**, and `deep` set them aside as "the vocabularies" precisely so an area
could take them properly:

```
src/common/fixed.css          colors no theme gets to touch
src/common/base.css           element resets + every non-color value
src/common/utilities.css      the adjustments that name nothing
src/common/breakpoints.css
src/common/patterns/badge.css · focus-ring.css · heading.css · page.css · segmented.css
src/common/themes/            light-mode · daylight · dark-mode · midnight
```

**`src/common/themes/loadTheme.ts` is NOT this area's** — settled 2026-09-02 by
`F-deep-9`, which put it on `deep`'s roster: `main.tsx` awaits it before the first
render, so it is boot machinery that happens to live in `themes/`. The stylesheets
it imports are still this area's. Four findings against it are recorded there
(`F-deep-13` … `F-deep-16`).

**ABSOLUTELY NOT in this area, or any area:** `/palette` and `/font`. They are
instruments, they are out of the sprint entirely, and they are not to be read,
edited or listed — see `F-corecss-1`'s neighbor in `deep`, which was closed on
exactly that rule.

## Findings

*(IDs are `F-corecss-1`, `F-corecss-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## F-corecss-1 · `stylesheet-map-rotted` · main.tsx's map of the stylesheet chain names two files that were deleted

**Moved here from `deep` on 2026-09-02** (Joel), where it was raised as
`F-deep-1` during the boot pass. The comment sits in `main.tsx`, which is `deep`'s
file, but what it describes is this area's chain — so the correction wants the
area that knows what the chain should say.

`main.tsx:11` describes `patterns/*.css` as "one named pattern per file — badge,
button, list, page, …". **`patterns/button.css` and `patterns/list.css` do not
exist** — `list.css` went when `<SelectionList>` landed and `button.css` when the
`forms` area moved buttons onto `StandardButton.module.css`. The three that DO
exist and are imported four lines below go unnamed: `focus-ring`, `heading`,
`segmented`.

Two smaller drifts in the same comment block:

- `main.tsx:12` calls `utilities.css` "the adjustments that name nothing: muted,
  error". Those two are still there, but the file is 137 lines and its own header
  says "Surfaces and text" — `.card`, `.link-button`, `.definable` and
  `[data-tooltip]` are surfaces and affordances, not adjustments.
- `loadTheme.ts:27` describes the same theme-independent half as "(fixed.css,
  base.css, utilities.css)" and omits `patterns/` entirely. Two files describe one
  chain and neither describes it correctly.

> resolution:

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

Rows §7 → "Carried forward" already assigns to `base.css`, indexed so opening
this area doesn't start by re-reading the whole checklist. **That checklist is the
one home** — its line carries the evidence.

- **Six chrome shadow levels nobody chose**, preserved from what the component
  modules already held and then given names, which is what made them look like a
  system. Five of the six have exactly one reader.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
