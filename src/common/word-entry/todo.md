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

- **`EntryRow` takes `.localFeedback` from another folder's stylesheet** —
  `game-page/PlayArea.module.css`. Raised from setup-form's audit
  (Joel, 2026-09-14): *"it feels wrong for someone else to import CSS that is
  named for one component."* The file is not in fact component-named — there is
  no `common/game-page/PlayArea.tsx` — but this folder should argue its own case
  when it opens. `.localFeedback` is the odd one of these readers: the others
  take an info-column readout kind, while this is the entry row's own feedback
  line sitting under the board. Decide whether it is play-surface chrome or this
  folder's. Same question in `terminal` and `info-sheet`, and the convention it turns on is
  [docs/deferred.md](../../../docs/deferred.md) → Common / architecture.

## Someday

## Maybe
