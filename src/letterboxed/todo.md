# letterboxed — todo

## Bugs

- Two `font-weight: 650` (`Board.module.css`, `PlayArea.module.css`). A
  weight must be a multiple of 100 (docs/tokens.md → The non-color
  vocabularies); both are bugs to fix, not values to keep.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **The board's word list can be silently cut short.**
  `letterboxed.candidate_words` returns a set with no order and no bound, and
  `letterboxed-build-board` calls it through PostgREST (`index.ts:158`,
  `:266`), so `max_rows` (10,000) applies. Sampling 300 seeds locally, 2 went
  over at the default band 5 (largest 10,694 rows) and 5 at band 6 (largest
  12,714; an earlier sample reached 17,260). Rows past the cap are dropped
  arbitrarily, so those words are missing from the board's accepted list and a
  legal word is refused. Fix: a `.range()` paging loop ordered by a unique key
  (docs/supabase.md → Query bounds), or return the list as one `jsonb` value.
- **`log_hint_or_spoiler` takes no game-row lock.** Every other move locks the
  game row (`select … for update`) so concurrent moves serialize
  (docs/supabase.md → Server conventions). Decide whether a hint/spoiler log
  can race anything that matters; if it can't, say so in the function.

## Soon

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 8rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  **This one is measured and wrong.** At 1128x617 the board column holds a
  95px chain strip + a 12px gap + a 44px entry row = 151px against the 128px
  reserved, and the page ends up 4px past the viewport. Its own comment calls
  the figure "about 8rem", which is the honesty problem in one word.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

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

- **`shuffle` in `supabase/functions/letterboxed-build-board/board.ts` is a
  hand-written Fisher–Yates** — `src/common/utils/shuffle.ts` is the same
  function with the rng optional, so the local one goes, its three seeded
  call sites pass their `rnd` unchanged, and the edge function imports the
  util by relative path with an explicit `.ts`, the way `scrabble-ai-move`
  imports `mulberry32`. The exported `shuffle` also has its own case in
  `board_test.ts` (permutes without mutating), which is pinned beside the
  util now and goes with it.
- **`LeaderRow` is declared twice and the two copies disagree.** The
  `manifest.ts` copy has `user_id?` optional and no `won`; the `PlayArea.tsx`
  copy requires `user_id` and carries `won?` with a docstring about
  co-winners on a timeout. One of them is wrong about what the server
  writes, and reading `letterboxed.submit_word` is what settles it.

  The read itself is done (2026-09-21): both sites call
  `readLeaderboard<LeaderRow>(…)` from `common/game-page/`, so the
  hand-written cast is gone and the field being present but not an array is
  caught. Only the row is open.
## Someday

## Maybe

## Won't do
