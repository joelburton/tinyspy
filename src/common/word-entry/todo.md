# word-entry — todo

## Bugs

## Soon

## Someday

## Maybe

## Won't do

- **`WordEntryArea` takes `.localFeedback` from another folder's stylesheet**
  (2026-09-18). No change. Raised from setup-form's audit (Joel, 2026-09-14): *"it feels wrong for someone else to import CSS that is named for
  one component."* Two things answer it. The sheet is **not** component-named —
  it was renamed to lowercase `playArea.module.css` on 2026-09-14 because no
  `PlayArea` component exists in `game-page` — and lowercase is exactly the
  repo's mark for a sheet others may read
  ([docs/deferred.md](../../../docs/deferred.md) → Common / architecture). And
  `.localFeedback` is play-surface chrome by its readers: seven games wrap a
  pill in it themselves, none of them touching this folder, and `WordEntryArea` does
  the identical thing for the five typing games. **What would reopen it:** the
  below-board classes leaving `playArea.module.css` for a sheet of their own,
  which is `game-page/todo.md`'s subdivision item — this folder follows them
  wherever they land. The same question in `terminal` and `info-sheet` is about
  different classes and answers for itself.
