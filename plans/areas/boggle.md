# Area: boggle

**Brand: MothCubes.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/boggle/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/boggle/`, its two SQL files,
and `docs/games/boggle.md`. List the files and STOP)*

## Findings

*(`F-boggle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/boggle.md` instead; a note here never stands in for either)*

- **The `games` subscription waits on a write nothing makes** (seen
  2026-10-04, at seat-view step 1). `hooks/useGame.ts` subscribes to
  `boggle.games` for "replay_board's realtime TOUCH", but `replay_board`
  writes no `boggle.games` row: it deletes `found_words` and calls
  `common._reset_game`. The conversion retires both the subscription and the
  comment, since the page will follow `game_data` on `common.games`.

## The backfill

2026-10-05, the conversion's grown steps applied after the fact:

- **The answers** already had the shape: `lib/answer.ts` says every answer,
  every reader asks it, and the move envelopes carry no outcome.
- **The stylesheet split.** `PlayArea.module.css` held BoardCol's `.boardCol`
  and `.mobileStatus`; they moved verbatim to `BoardCol.module.css`, and
  PlayArea's keeps `.layout`.
- **The section order**: PlayArea's local-slot and narration headers in the
  house words; BoardCol in its three sections (no history viewer, so the board
  on screen is always the live one).
- **No narrower `Outcome`** anywhere.
- **The cross-game names**: both pieces of state carry their comment; "timer"
  / "timeout" not "clock", in the code, the SQL, the tests and the doc (the
  generator's wall-clock budget is real time, and stays). N25's "race" is the
  later sweep's.
- **The comment pass and the docstring marker**: history went (the old Help,
  the labels that "used to differ", the mobile-status height's past values, a
  token "any more"); member notes are `//` (`types.ts`, the printer, the typed
  word, the generator and solver options, the solver fixture).

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-04; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `found_words_select`'s three arms — coop shows every club member every row, a player always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | to be **taken over** by `makeGameData`'s seat rule over `game_data`; the policy keeps the member gate alone |
| `games_select` — a club member reads the board row | neither | to be kept: a member reading a row for a page they can open |
| `_write_statuses` — `game_status` {required_words_count, required_words_score, bonus_words_count, bonus_words_score}, `player_status` {found_required_words_count, found_required_words_score, found_bonus_words_count, found_bonus_words_score, player_ended_reason}, `clubpage_info` {found_words_count, found_words_score, target_win_percent, top_score, winner_user_id} | `ended_at` (the compete top score waits for it) | to be **dropped**; `_rebuild_data_cols` writes the blobs |
| the postgres-changes subscription on `found_words` and `games` (`useRealtimeRefetch` in `hooks/useGame.ts`), and the one-shot read of the `games` header | — | the frontend's, at its conversion: the page reads `game_data` |

boggle has no view.

## The `gd` and `summary_data` sketch — approved 2026-10-04

Seat-view step 2. Step 6 moves it into `types.ts` as the shape comment, and
this section goes then.

```
gd:
  id
  gametype
  brand
  club: {handle}
  mode
  coop
  compete
  oneBoard
  title
  setup
  setupRows
  puzzle:
    tiles: [tile, …]                       # row-major
    tilesById
    boardSideSize
    minWordLength
    words: [word, …]                       # the required ones first
    nReqdWords
    reqdWordsScore
    nBonusWords
    bonusWordsScore
  team                                     # null in compete
    nFoundWords
    foundWordsScore
    nFoundReqdWords
    foundReqdWordsScore
    nFoundBonusWords
    foundBonusWordsScore
  turns                                    # always null
  ending: {reason, detail, by, winner}
  ended
  outcome
  foundWords: [{by, word, points, bonus, at}, …]   # my rows only, mid-race
  players: [player, …]
  playersById
  me
  stateLineData
    nFoundReqdWords
    foundReqdWordsScore
    nFoundBonusWords
    foundBonusWordsScore
    nReqdWords
    reqdWordsScore
    nBonusWords
    bonusWordsScore

player:
  the common player
  nFoundWords
  foundWordsScore
  nFoundReqdWords
  foundReqdWordsScore
  nFoundBonusWords
  foundBonusWordsScore

tile:
  id                                       # the cell's index, as text
  letters                                  # "a", "qu"; null for a blank

word:
  word
  points
  bonus

summary_data:
  the common summary
  team                                     # the same group; null in compete
  targetWinPercent
  topScore                                 # compete; null until the end
```

The rulings behind it:

- Each player and the team carry all six counts: the totals (the strip, the
  ending's tally) beside the required/bonus split (the Stats grid).
- A blank tile is `letters: null`.
- The target stays out of `gd`: the page shows it only in the setup rows,
  which read `setup.win_percent`. The club card reads `targetWinPercent`.
- The raw board string (`boggle.games.board`, `"AB1D…"`) is not in the blob:
  `tiles` and `boardSideSize` replace it, and the tracer, `answerOf` and the
  PDF move onto the tiles at step 7.
- Equal bands are not a special case (2026-10-04): their bonus words are the
  unclean ones, shown and revealed like any bonus word. The Stats grid always
  draws its Bonus cells, and the word list always offers its Required/Bonus
  filter. `hasBonusDifficulty` and the zeros it writes into the Stats figures
  go at the conversion.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/boggle.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
