# codenamesduet — todo

## Bugs

- `.clueLabel` in `CluePanel.module.css` is read by nothing
  (`cssClasses.test.ts` holds it in `DEAD_CLASS_PENDING`).
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **Collapse the info-column action row's branches.** This game still FORKS on
  `over ? … : locally done ? … : …` and lists a different set of buttons in
  each, which is how a state can quietly lose a button — every one of these
  rows is missing back-to-club while a race runs on without you. psychicnum is
  the worked example (2026-09-14); copy its shape.

  **The shape.** One `<InfoActionsRow>`, every action listed once in one
  order, and the only thing that varies is the optional `{ text, outcome }`
  line. Which buttons are on screen is each action's own answer —
  `<ActionButton>` draws nothing for an action that says `hidden`.

  **The state rule** (Joel, 2026-09-14): `hidden` is *not even possible in
  this state* — you cannot end a game that has ended, or reveal an answer you
  are still hunting. `disabled` is *possible here, just not right now*, and it
  carries a tooltip saying why — a hint when you have used your last one. Most
  games' gate variable folds several of these together and has to be split
  before the actions can be honest; psychicnum's `canGuess` hid "terminal"
  inside "out of guesses" and is now `isStillPlaying`.

  **Two answer their asker differently**, which is what `ActionAsker` is for:
  Restart and New game are reachable all game from the menu and their keys —
  the confirmations are written for exactly that ("will be shelved, not lost",
  "Keep playing") — and get a BUTTON only at terminal. `describe: (asker) =>
  asker === 'button' && !isTerminal ? 'hidden' : 'active'`. Restart's is
  already done in `useStandardGameActions`; each game's own `act-new-game` is
  not.

  **Two things the collapse destroys if you are not watching.** Back-to-club
  is `weight={over ? 'primary' : 'secondary'}` — filled only once the game is
  over; hoisting the terminal branch's `weight="primary"` into the single list
  makes it shout all game. And the gray `shared.actionsDivider` span goes
  between the actions you take WHILE PLAYING and the ones about the END of the
  game — both sides are pressable mid-game, so nothing but the bar says where
  the meaning changes. It hides itself when nothing is left on its left.

  **A test gotcha:** `menuItems` reads the rows a game PUSHED, and `hidden` is
  what the menu drops at draw time — so "not in the menu" asserts `?.hidden
  === true`, not `toBeUndefined()`.

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

- **Ring the bell when a clue arrives for you to guess from** (Joel,
  2026-09-23). Every game whose turn moves the shared `current_turn_user_id`
  rings from `GamePage`'s `useTurnBell`; this game never writes that column,
  because its "your turn" is an event — being given a clue — so it rings from
  its own code, `playSound('bell')` where the clue lands for the guesser. The
  rollout is recorded in `src/common/sounds/todo.md`.

## Someday

- **The AI companion's minimum size, 240×140, is eyeballed.** The rule is that
  a companion's minimum comes from what its BODY needs, not from what looked
  right (`docs/ui.md` → Floating panels); every companion's pair is listed in
  `src/common/floating-panels/todo.md`, to be settled one game at a time.

- `Board.module.css` sets `ui-monospace, Menlo, monospace` on the board — the
  most consequential of the app's monospace uses, because it is a play
  surface rather than a form. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.

## Maybe

## Won't do

- **Mission / campaign mode** (2026-08-02). The rulebook's mission maps —
  variable starting turn counts. Cheap to build; nobody wants it, and a
  campaign implies cross-session persistence the club model doesn't carry.
- **Tile `aria-label`s** (2026-08-02). Screen readers are out of scope
  project-wide — see [`CLAUDE.md`](../../CLAUDE.md). The tiles keep their
  `aria-hidden`.
