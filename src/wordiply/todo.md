# wordiply — todo

## Bugs

- **`concede` may wedge a race in `playing`: it re-runs a two-table end check
  without locking `wordiply.games` first.** `wordiply.concede` calls
  `common.concede` (which locks only `common.games`), then re-runs the "every
  active player has spent five" check, reading `wordiply.events` and
  `game_players.conceded`. `submit_guess` asks the same question under a lock
  on `wordiply.games`. If a racer's fifth guess and another's concede land
  together, each may read a snapshot from before the other's write, both find
  someone still racing, and neither ends the game — the wedge the lock-order
  rule prevents (`docs/common-schema.md` → Concede). Not yet shown to happen:
  whether it can depends on where `submit_guess` touches `common.games`
  relative to its check. The likely fix is the elimination games' shape — lock
  `wordiply.games` before `common.concede`. `src/guards/concedeLock.test.ts`
  does not see this, since it keys off calling `_set_conceded`, and wordiply
  calls `common.concede`; the guard's key may want widening to "any concede
  that re-checks game tables".
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

- **`LeaderRow` is declared twice and the two copies disagree.** The
  `PlayArea.tsx` copy carries `letter_count?`, which the `manifest.ts` copy
  has never heard of. One of them is wrong about what the server writes, and
  reading `wordiply.submit_word` is what settles it.

  The read itself is done (2026-09-21): both sites call
  `readLeaderboard<LeaderRow>(…)` from `common/game-page/`, so the
  hand-written cast is gone and the field being present but not an array is
  caught. Only the row is open.
## Someday

## Maybe

- **A composite score for compete's ranking.** The winner is the
  lexicographic comparator (length score → letter count → …), so the letter
  count only matters on an exact length-score tie: in practice only the
  marquee word counts, which flattens a five-guess game. The replacement:
  normalize the letter count to 0–100 against its ceiling (5 ×
  `max_word_length`) and rank on `w·length% + (1−w)·volume%`, one weight
  deciding how many extra letters outweigh one letter of marquee (at `w = 0.6`
  on a max-16 board, about a dozen). One number that IS the ranking is also
  easier to read than a comparator. Co-winners stays as the exact-tie
  fallback. The comparator lives in SQL and in the frontend's verdicts, so it
  is a two-place change with its tests re-pinned. (The winner is already this
  app's invention — Guardian's Wordiply crowns nobody — so the metric is ours.)
- **A coop target.** Coop has no win: spending the five guesses is a neutral
  end. A `target_score` (on the composite above, if it lands) would make
  reaching it a win and arm the clock, the spellingbee pattern. With a target
  set, spending the guesses below it becomes a LOSS rather than a neutral end
  (`docs/win-lose.md` → Where a coop loss comes from) — the point of the
  feature, and a bigger change than arming the clock. Without a target, coop
  stays as it is.

## Won't do
