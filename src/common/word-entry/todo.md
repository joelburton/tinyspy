# word-entry — todo

## Bugs

- **`useArrowHistory` answers `disabled` where it should answer `hidden`.**
  A caller that offers no recall at all (letterboxed, through `<EntryRow>`)
  still binds `act-recall-last`, and `describe` says `disabled`, so the
  game's Help lists a permanently gray `↑` row and its doc says "No ↑/↓
  recall". The prop conflates two things: `recall === undefined` (recall is
  not offered here → `hidden`) and `''` (offered, nothing to recall yet →
  `disabled`). Tell them apart, and fix the prop note that says "omit or ''"
  are the same.

## Soon

## Someday

## Maybe
