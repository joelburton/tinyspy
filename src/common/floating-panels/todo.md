# floating-panels — todo

## Bugs

- **A pending question outlives the thing it was asked about.** `askConfirmation`
  keeps its question in a module-level `pending`, and `<ConfirmationHost>` is a
  root sibling of the routed content in `App.tsx`, so navigation does not unmount
  it. `settleConfirmation` is called by the host's three buttons and nothing
  else, so nothing drops a question whose subject is gone. Concretely: you press
  Restart on a game page, and while "Restart this game?" is up a peer suspends
  the game — their broadcast navigates your tab to the club page, and the
  question is still there, over a page that has nothing to do with it.

  The second half is worse than the stale dialog. `useBoundAction` reads its
  handlers out of a ref AFTER the await, deliberately (the body that runs should
  be the one from the moment of the answer, not the moment of the press), and a
  ref survives the unmount — so pressing Restart there fires `replay_board` on
  the game you just left, wiping a shelved board for everyone. The same shape
  reaches End game, Concede, New game, the whole-grid reveal, and the suspend
  question, which joined them when it moved to the service.

  Two things to decide with these files open, and they are why this is not a
  one-line fix: what "the asker went away" means — the component that asked
  unmounting, or the route changing — and whether an answer should run through a
  ref that outlived its component at all. Nothing is decided yet.

## Soon

- **A test cannot find one panel among several, so an e2e sniffs react-rnd's
  classes.** `e2e/puzzle-pickers.e2e.ts` scopes the crosswords NYT picker with
  `.locator('.react-draggable, [class*="rnd"]')` filtered by its heading,
  because once a picker opens there are TWO "Cancel" buttons on screen — the
  picker's and the setup dialog's underneath — and the test has to press the
  right one. Those are the LIBRARY's class names, not ours, so nothing in this
  repo keeps them true. Left here by F-setup-form-11 (Joel: option 1, 2026-09-14)
  because what a panel offers a test is this folder's call: a `data-testid`
  derived from the panel's title is the obvious candidate, and it would serve
  every "which panel" locator, not just this one. The sibling half — our own
  hashed class sniffed for the "next up" line — was fixed in setup-form.

- **Action row** — the end-aligned row of buttons that closes a floating
  panel (`modalActions`), plus a pinned-to-bottom variant `WordEditDialog`
  wrote its own copy of.
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
