# wordwheel — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **The compete leaderboard query is written out four times** in
  `supabase/sql/wordwheel.sql` — `submit_word` twice, `submit_timeout`,
  `end_game`. spellingbee made it one helper, `spellingbee._leaderboard`
  (its F-11, 2026-09-23); the same helper here.

- **The per-player results carry keys nothing reads.** The coop endings write
  `{ won, finished, team_score, team_rank_idx }` and the compete ones
  `{ won, found_words_score, rank_idx }`; the app reads `result.won` alone.
  spellingbee cut both to `{ won }` (its F-16 and R-1, 2026-09-23).

- **Two SQL comments say `common.end_game` replaces the status**
  (`submit_timeout`'s and `end_game`'s compete branches); it merges. The
  re-emitted keys stay — the ending states its final tally — and the
  comments say so, as spellingbee's F-14 did (2026-09-23).

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

- **Two hand-written Fisher–Yates shuffles, one per side** — `shuffled` in
  `components/BoardCol.tsx` and `shuffled` in
  `supabase/functions/wordwheel-build-board/index.ts`. Both become
  `src/common/utils/shuffle.ts`: the component calls `shuffle(items)` (the
  default rng is `Math.random` and a copy comes back, so behavior is
  unchanged), and the edge function imports the util by relative path with an
  explicit `.ts`, the way `scrabble-ai-move` imports `mulberry32`.

## Someday

## Maybe

- **`s`-heavy seeds.** An `s` tile lets each word pluralize once — the classic
  wheel's behavior, kept deliberately. If wheels with an `s` (especially an `s`
  *center*, which makes every word an s-word) feel too plural-y in play, a
  seed-level filter (or center exclusion) is a one-line follow-up in the
  import script or the edge function.

## Won't do

- **`Wheel.module.css` is deliberately NOT folded with spellingbee's
  `Letters.module.css` + `Letter.module.css`** (2026-07-31). The rest of the
  pair's CSS is shared (`shared/bee-games`), but these stay separate copies.
  They're structurally parallel in their skeletons (`.board`, `.grid`,
  `.floatAnchor`, a tile), so a fold looks mechanically easy. The reason not
  to: it means picking ONE vocabulary for the shared class names, and a
  honeycomb has hexes where a wheel has tiles. That trades [tokens.md's
  two-vocabularies rule](../../docs/tokens.md#two-vocabularies--global-and-per-game)
  — names track the game's own concepts — for a few dozen lines of dedup, and
  the rules inside don't share anyway: the hive is SVG polygons (a hexagon
  can't be a bordered box) where the wheel is round boxes, so the hive's depth
  is a filter in user units and the wheel's is the shared box-shadow. **If it's
  ever revisited**, the tractable middle is the interaction layer under neutral
  names, leaving each game's shape rules local. Don't fold the whole file just
  because the skeletons rhyme. *(wordwheel is the fork, so this copy governs;
  spellingbee's `todo.md` points here.)*
