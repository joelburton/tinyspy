# floating-panels — todo

## Bugs

## Soon

- **`FaultModal` draws its own title instead of passing one.** It renders
  `<BlockingModal>` with no `title` and puts the red "Error" in the body as an
  `<h3>` it styles itself, where every other blocking modal hands its title to
  the shell. Either the shell's title can carry a fault's look (a color and a
  weight it does not offer today) or the fault is a deliberate exception and
  should say so. Decide with the shell open — what a `title` renders as is this
  folder's question, not `faults`'.

## Someday

- **A companion's MINIMUM SIZE is still eyeballed.** None of the pairs is
  derived: `Chat` 260×240 · `ClubHelpCompanion` 280×180 · `GameHelpCompanion`
  per-game · `GameScratchpadCompanion` 240×200 · `CrosswordsNoteCompanion`
  300×200 · `CrosswordsExplainCompanion` 320×220 ·
  `CodenamesduetAISuggestCompanion` 240×140 (kept as is, codenamesduet's
  `todo.md` → Won't do). The rule (docs/ui.md → Floating
  panels): the number comes from what the BODY needs — "the titlebar, the
  composer and four messages" — not from what looked about right. Joel: *"as
  we get to these individually in areas, we can figure out."*
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

## Won't do

- **The action row's pin-to-bottom stays `WordEditDialog`'s own.** The row is
  shared (`modalActions.module.css`); `WordEditDialog` adds only `.pinBottom`
  (`margin-top: auto`) so the row sits at the foot of that tall dialog however
  short the form. Joel, 2026-09-24: *"keep only for wordeditdialog"* — one
  dialog wants it, so it is not a shared variant.
