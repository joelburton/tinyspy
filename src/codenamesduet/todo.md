# codenamesduet — todo

## Bugs

- `.clueLabel` in the AI companion's stylesheet is read by nothing
  (`cssClasses.test.ts` holds it in `DEAD_CLASS_PENDING`).
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **Collapse the info-column action row's branches.** Every state is one
  `<InfoActionsRow>` now (common/game-page), varying only an optional `{ text,
  outcome }` line — but this game still FORKS on `over ? … : locally done ? …
  : …` and lists a different set of buttons in each.

  `ActionButton` already promises the way out: *"Nothing renders when the
  action is hidden, so a list of these needs no `if` around any of them."* So
  list every button once, in one order, and push the knowledge into each
  action's `describe()` — an action that should not appear mid-play says
  `hidden` itself.

  The blocker is that some `describe()`s are not truthful yet: `actNewGame`
  and `actRestart` answer `'active'` unconditionally, so listing them today
  would draw them during play. Making them honest is this game's judgment,
  which is why this is filed here rather than swept (Joel, 2026-09-16: *"there
  may be action rows where we need to do something very different between
  playing/terminal states and, if so, we can address this when we get to that
  game. but the common case would be the full collapse."*). It also restores
  the missing back-to-club by construction.

- **`CluePanel` needs a name that says what it is.** Joel: *"'CluePanel' is a
  terrible name: CLUE FOR WHAT?"* — and the first answer was wrong, which is
  the part worth keeping: it is NOT the AI suggester (that is
  `CodenamesduetAISuggestCompanion`, split out of the same file). It is the
  below-board clue strip — the giver's form, the guesser's clue display, the
  Pass button — and it is not a floating panel at all, so neither `Panel` nor
  `Modal` belongs in whatever it becomes.

- **The two finished-player banners in `InfoCol.tsx` put the actor
  mid-sentence** ("All your agents have been found! From here ● moth gives
  every remaining clue — keep guessing to find theirs."), which is why they
  pass `show="both"` — a phone dropping the name would leave a hole. Joel
  (2026-09-12): lead with the actor instead, "● moth gives remaining clues",
  which fits a phone better anyway and lets the banners take the default
  `show`. The peer-finished banner already leads and can shorten to match.

## Someday

- `Board.module.css` sets `ui-monospace, Menlo, monospace` on the board — the
  most consequential of the app's monospace uses, because it is a play
  surface rather than a form. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.

## Maybe
