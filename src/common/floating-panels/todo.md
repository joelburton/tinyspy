# floating-panels — todo

## Bugs

## Soon

- **Action row** — the end-aligned row of buttons that closes a floating
  panel (`modalActions`), plus a pinned-to-bottom variant `WordEditDialog`
  wrote its own copy of.
- **Two e2e specs were red waiting on this folder** on 2026-09-02:
  `page-no-scroll` and `anagram-finder`. Re-check before assuming.

## Someday

- **A companion's MINIMUM SIZE is still eyeballed.** None of the pairs is
  derived: `Chat` 260×240 · `ClubHelpCompanion` 280×180 · `GameHelpCompanion`
  per-game · `GameScratchpadCompanion` 240×200 · `CrosswordsNoteCompanion`
  300×200 · `CrosswordsExplainCompanion` 320×220 ·
  `CodenamesduetAISuggestCompanion` 240×140. The rule (docs/ui.md → Floating
  panels): the number comes from what the BODY needs — "the titlebar, the
  composer and four messages" — not from what looked about right. Two strays
  survive on panels nobody can resize, `BlockingModal` and `SetupGameModal`,
  each `minWidth: 320`. Both are GONE (2026-09-11): a floor stops a drag, and
  neither panel can be resized, so they governed nothing — except through
  `clampToViewport`, where the floor used to outrank the viewport and put a
  blocking card 8px off the right edge of a 320px phone. That is fixed in the
  clamp. Joel: *"as we get to these individually in areas, we can figure out."*
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
