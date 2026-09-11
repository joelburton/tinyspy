# floating-panels — todo

## Bugs

## Soon

- **Overlay surface** — the one look for a surface floating above the page:
  surface, edge, radius, shadow. Today `Menu.popover` + `.flyout`,
  `Toast.toast`, `FloatingPanel.shell` and `DefinitionPopover` each write it.
  A shared pattern file.
- **Action row** — the end-aligned row of buttons that closes a floating
  panel (`modalActions`), plus a pinned-to-bottom variant `WordEditDialog`
  wrote its own copy of.
- **Two e2e specs were red waiting on this folder** on 2026-09-02:
  `page-no-scroll` and `anagram-finder`. Re-check before assuming.

- **Six `typeof window` guards for a case that cannot happen.**
  `FloatingPanel.tsx` (2) and `useDraggablePanel.ts` (4) read `innerWidth` /
  `innerHeight` behind a no-window check — but this is an SPA with no server
  render and jsdom has a `window` (docs/code-conventions.md → Known gotchas).
  Not a sweep: each supplies a FALLBACK (`1024`/`768`, or the rect's own size),
  so dropping the guard changes what the expression returns, and whether any
  test leans on those numbers wants checking with the file open.

## Someday

- **A companion's MINIMUM SIZE is still eyeballed.** None of the pairs is
  derived: `Chat` 260×240 · `ClubHelpCompanion` 280×180 · `GameHelpCompanion`
  per-game · `GameScratchpadCompanion` 240×200 · `CrosswordsNoteCompanion`
  300×200 · `CrosswordsExplainCompanion` 320×220 ·
  `CodenamesduetAISuggestCompanion` 240×140. The rule (docs/ui.md → Floating
  panels): the number comes from what the BODY needs — "the titlebar, the
  composer and four messages" — not from what looked about right. Two strays
  survive on panels nobody can resize, `BlockingModal` and `SetupGameModal`,
  each `minWidth: 320`; those are not floors at all, and below ~336px they
  force the panel wider than the screen. Joel: *"as we get to these
  individually in areas, we can figure out."*
- **The multiple-movable-things strategy**, for the companion layer and the
  dialog layer both: (a) a strict order, (b) opened order, (c) raise on
  interaction. Crosswords can plausibly have the note, the explainer and the
  anagram finder open at once. (a) is in force TODAY by accident, via DOM
  render order, which is also the only reason Help-over-setup works.
- **Do the two scrim colors earn their keep?** `--scrim-light-color` (40%)
  for `modal-normal` and `--scrim-color` (45%) for the blocking pair is a
  difference nobody can see, and immovability already signals the category.
  Either make them visibly different (~35% and ~55% was the proposal) or
  collapse them.

## Maybe
