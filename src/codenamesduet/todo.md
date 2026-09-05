# codenamesduet — todo

## Bugs

- `.clueLabel` in the AI companion's stylesheet is read by nothing
  (`cssClasses.test.ts` holds it in `DEAD_CLASS_PENDING`).

## Soon

- **`CluePanel` needs a name that says what it is.** Joel: *"'CluePanel' is a
  terrible name: CLUE FOR WHAT?"* — and the first answer was wrong, which is
  the part worth keeping: it is NOT the AI suggester (that is
  `CodenamesduetAISuggestCompanion`, split out of the same file). It is the
  below-board clue strip — the giver's form, the guesser's clue display, the
  Pass button — and it is not a floating panel at all, so neither `Panel` nor
  `Modal` belongs in whatever it becomes.

## Someday

- `Board.module.css` sets `ui-monospace, Menlo, monospace` on the board — the
  most consequential of the app's monospace uses, because it is a play
  surface rather than a form. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.

## Maybe
