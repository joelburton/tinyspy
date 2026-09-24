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

## Won't do
