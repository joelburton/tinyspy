# boggle — todo

## Soon

- **`deno check` fails on `supabase/scripts/generate-boggle-wordlist.ts`.**
  `import.meta.dirname` is `string | undefined` and goes straight into
  `resolve(…)` (TS2345). The script still runs, but under Deno's own checker
  it does not type-check.

## Someday

- **Compete with no target needs a countdown.** The rule for every compete
  word hunt (plans/cross-game-consistency.md → "A compete word hunt needs
  a target, a countdown, or both"). Today an untimed compete game with no
  `win_percent` can be created, and nothing but a Stop or everyone conceding
  ends it, so nobody can win it. The change: `create_game` refuses it, and
  the setup form offers None in compete only with a countdown.

- **Every required word is the `goal-intrinsic`: a game with no target wins
  on it.** With no `win_percent` chosen, the game's goal is every required
  word (docs/win-lose.md → `goal-intrinsic`), as spellingbee's and
  wordwheel's todos have it. Today only a 100% target reads a full clear.
  The change: with no target, finding every required word wins — the team
  in coop, the first player to do it in compete. The timeouts stay as they
  are: coop's is the neutral `timeout-no-result`, compete's crowns the top
  score.

## Maybe

- **A compete "dupes-cancel" mode: a word more than one player finds scores
  zero for everyone.** The paper Boggle rule. Today each player keeps every
  word they find (primary key `(game_id, user_id, word)`). It would be a
  scoring change in `submit_word` / `_finish` plus a setup flag, and would
  unlock the ⦻ marker in `common/word-list`. Decide first how a player finds
  out: compete finds are private until the end, so a word would be accepted
  and then zeroed at scoring. Is that reveal the fun?

## Won't do

- **Share the bee games' `makeBeeGameData`.** boggle's blob is its own shape —
  a square of `{id, letters}` tiles, six counts on each player and the team,
  and no rank ladder — so sharing the bees' builder would mean parameterizing
  the puzzle, the counts and the state line: a function turned into a
  framework. Joel: *"i prefer clarity and not over-generalizing."* Revisit
  only if a fourth game turns up.

  Boggle DOES share the rest of the found-words family (the submit engine,
  the reveal, the rows call, the row and word types, the typed-word dim); it
  is `gd`'s builder alone that is its own.
- **The blob carries no raw board string** (Joel, 2026-10-04: "drop it").
  `puzzle.tiles` and `boardSideSize` are the board, decoded once in SQL; the
  tracer, `answerOf` and the PDF read the tiles. `boggle.games.board` stays
  the stored shape.
- **`gd` carries no win target** (Joel, 2026-10-04, agreeing the page shows it
  only in the setup rows). The setup rows read `setup.win_percent`; the club
  card reads `summary_data.targetWinPercent`.
