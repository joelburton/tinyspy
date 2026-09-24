# boggle — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **`submit_word` takes no game-row lock.** Every other game's move locks the
  game row (`select … for update`) so concurrent moves serialize
  (docs/supabase.md → Server conventions). Check whether two teammates'
  simultaneous submissions can race — both crossing the score bar, or one
  landing after the game has ended — and either take the lock or say in the
  function why it isn't needed.

## Soon

- **`deno check` fails on `supabase/scripts/generate-boggle-wordlist.ts`.**
  `import.meta.dirname` is `string | undefined` and goes straight into
  `resolve(…)` (TS2345). The script still runs, but under Deno's own checker
  it does not type-check.

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

## Someday

## Maybe

- **A compete "dupes-cancel" mode: a word more than one player finds scores
  zero for everyone.** The paper Boggle rule. Today each player keeps every
  word they find (primary key `(game_id, user_id, word)`). It would be a
  scoring change in `submit_word` / `_finish` plus a setup flag, and would
  unlock the ⦻ marker in `common/word-list`. Decide first how a player finds
  out: compete finds are private until the end, so a word would be accepted
  and then zeroed at scoring. Is that reveal the fun?

## Won't do

- **Share the bee games' `useGame` factory.** boggle reads `boggle.games`
  where spellingbee and wordwheel read a `games_state` view, with different
  columns and a different header type, so sharing `makeBeeGame` would mean
  parameterizing the table, the select and the row mapping — a hook turned
  into a framework. Joel: *"i prefer clarity and not over-generalizing."*
  Revisit only if a fourth game turns up.

  Boggle DOES share the rest of the found-words family (the submit engine,
  the reveal, the rows call, the row and word types, the typed-word dim); it
  is the header alone that is its own.
