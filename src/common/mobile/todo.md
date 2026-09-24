# mobile — todo

## Bugs

## Soon

## Someday

## Maybe

- **A desktop window shorter than about 440px counts as a phone.** `--phone-l`
  has no pointer condition, so a short landscape desktop window collapses the
  page padding and turns window-family panels into full-screen sheets while
  they stay draggable (dragging keys off `--touch`), so dragging moves nothing.
  No real device matches. The fix, if it matters: add `(pointer: coarse)` to
  the `--phone-l` arm in both `breakpoints.css` and `useIsPhone.ts`, which
  makes `--phone` no longer purely about shape.
- **Should `:hover` be gated to pointer devices, and how widely?** A phone
  applies `:hover` when you tap and leaves it until you tap elsewhere, so a
  tapped element stays in its hover look: on a board tile that reads as a state
  it isn't in (strands left a dimmed tile after every word). The fix is to
  put the rule inside `@media (hover: hover)`, which a phone skips, and give
  touch its own press with `:active`, since a finger is either off or
  pressing. Already gated: spellingbee's hexes, strands' tiles and the header's
  marks (with `:active`). Not gated: the shared `.tile`, the on-screen
  keyboard's `.key`, and the boards of stackdown, wordwheel, boggle,
  letterboxed, setgame and connections' peer pick. The decision is the scope:
  **board pieces only** (the stuck look players actually notice), **every
  `:hover` in the app** (buttons and rows too, each gaining an `:active`
  press), or neither yet. docs/mobile.md → The rules every screen keeps points
  here.

## Won't do
