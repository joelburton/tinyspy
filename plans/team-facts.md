# Team facts — every player carries their side's facts, and their own

**Status: DECIDED 2026-10-06; psychicnum built, the rest not started.** Joel and Claude settled this
after an audit of how all sixteen games hold coop state. It replaces this
plan's 2026-10-02 design, under which `gd.team` held what the team shares and
a player's keys were their own in every mode. psychicnum, wordle and
connections were built on that design; every game now carries some form of
it, so every game changes again.

## The problem

The 2026-10-02 design got the counts right (each player's row holds their own
share, the builder sums the team's), but it left the front end choosing: a
coop readout shows `gd.team`, a compete one `gd.me`. `gd.stateLineData` made
that pick for the state line, and the other readers made it themselves —
boggle reads `gd.team ?? gd.me` in three places, scrabble reads
`gd.team?.rack ?? gd.me.rack!`, setgame re-sums `players[].nSetsFound`.

A shared OBJECT — a board, a chain, a rack — landed in one of three places:

| where | games |
|---|---|
| a copy on every player | psychicnum, wordle, connections, letterboxed, strands, waffle, stackdown, wordiply |
| once, in `team` | codenamesduet; crosswords (whose `useGame` then puts it on every player and nulls `gd.team`) |
| once, at the top of the blob | scrabble, setgame |

So the reader of a game's board had to know which game it was in.

## The decisions (Joel, 2026-10-06)

- **A side** is who a fact belongs to for showing: the team in coop, the
  player alone in compete.
- **`GFacts` is a game's exact list of facts** — its counts, the constants
  shown beside them (`maxGuesses`, `maxSwaps`), and the object its side plays
  on (`board`). Every game declares one in `types.ts`.
- **Every player carries `GFacts` twice.** Spread onto the player, the
  values are the **side's**: summed for a coop team, the player's own in
  compete. Under `own`, with the same shape, they are **that player's own**.
  So `gd.me.score` is always what to show, and `gd.me.own.score` is the rare
  reader that wants one player's contribution (a "who found what" hover, if
  one is ever built). In compete the two are equal, and `useGame` may give
  both the same values.

  ```ts
  type GPlayer = CommonPlayer & GFacts & { own: GFacts }
  ```

- **A shared object is a fact like any other.** In coop every player's
  `board` is the one board, by reference; in compete each player's is their
  own. An object shared in compete too — scrabble's and setgame's boards, the
  bag and deck counts — is a fact on every player in both modes. **Nothing
  game-specific stays at the top of `gd`** for being shared.
- **A record of who did what stays at the game level**, beside `gd.events`:
  the word hunts' `foundWords` (each row with its finder, filtered to what I
  may see) stays `gd.foundWords`. Their counts (`nFoundWords`,
  `foundWordsScore`, `rankIdx`) are facts like any other game's. setgame's
  claimed sets are already events.
- **`gd` has no `team`.** Everything it held is on the players.
- **`oneBoard` is dropped**, with its `common.gametypes.one_board` column (a
  migration). Its two readers, psychicnum's and connections' `BoardCol`,
  read `gd.coop`, which it equals in both games.
- **`solved` stays a common player key.** It already means "my side solved":
  every coop branch writes `solved_at` onto every teammate. Nothing records
  which teammate solved, so an `own.solved` would have no data.
- **A fact never shares a name with a common player key.** The spread would
  overwrite one with the other silently, so a compile-time check holds
  `GFacts`'s keys apart from the common player's (`id`, `name`, `color`,
  `ending`, `outcome`, `solved`, `conceded`, `onTurn`, `stillPlaying`,
  `finalRanking` …): one shared helper type, asserted in each game's
  `types.ts`, so a clash fails `tsc`.
- **The wire stays compact; storage does not change.** `game_data` carries
  the side's facts once, as `team` (null in compete), and each player's own
  facts; `useGame` builds every player as
  `{ ...common, ...(raw.team ?? ownFacts), own: ownFacts }`. A shared object
  is sent only in `team`, never again per player. The lock-step copies in
  storage (letterboxed's chain, waffle's board, strands' hint bar and ringed
  hint) stay; the builder reads the object off one row.
- **`summary_data` keeps its `team` key for now.**

## The naming rule for a loose copy

Inside its group a name is bare and the path supplies the context:
`me.nFoundSecrets` (my side's) and `me.own.nFoundSecrets` (mine) are both
right, and the reader knows which from the path.

A copy pulled out of its group — a local, a prop that carries just the one
number — has lost that context and **must say which it is**. The spelling is
mechanical: **a dot becomes an underscore.** `me_nFoundSecrets`,
`me_own_nFoundSecrets`, `me_board_tileResults`. docs/code-conventions.md →
TypeScript casing has the rule and its boundary (a value handed to a child
for the child's purpose takes the purpose's name: `canPick`, never
`me_onTurn`); its examples change from `team_…` to these.

## The shape

psychicnum's, as the example:

```
game_data:
  team: {nFoundSecrets, nGuessesUsed, nReqdSecrets, maxGuesses, board}   # the side's, once; null in compete
  players: [player, …]

player (game_data):
  <the common keys>
  nFoundSecrets, nGuessesUsed, nReqdSecrets, maxGuesses   # this player's own
  board                                                   # compete only; coop's is team's

gd:
  players: [player, …]
  me

player (gd):
  <the common keys>
  nFoundSecrets, nGuessesUsed, nReqdSecrets, maxGuesses, board   # the side's
  own: {nFoundSecrets, nGuessesUsed, nReqdSecrets, maxGuesses, board}

summary_data:
  team: {…}                       # unchanged for now
```

## What it touches

Each game is one commit, its e2e run, in this order: psychicnum first (the
canary, where the wire's exact types are settled), then the routine games,
then codenamesduet last. Per game: the SQL builders (`team` gains the shared
object, the players lose it in coop), `types.ts` (`GFacts`, the player type,
the overlap check), `useGame`, the fixture, every reader of `gd.team` or a
top-level board, and the pgTAP pins of the blob.

**The games with a twist:**

- **psychicnum, wordle, connections, stackdown:** the board moves from every
  player into `team`; the readers of `gd.team` read `gd.me`.
- **letterboxed, waffle, strands:** the same, reading the lock-step object off
  one row. letterboxed's `team` builder already reads its counts that way.
  strands' hint bar, sent in `team` today with a null on each coop player,
  becomes a fact like the rest.
- **wordiply:** its accepted words become `board` in `GFacts`, sent once in
  coop. (Built 2026-10-06. `useSubmitGuess`'s dedup and
  `useMarkForeignGuesses` still read `gd.events`, and must: the dedup counts
  rejects, which the server dedups on too, and the foreign mark needs the
  newest row's player and id. Neither is on the board.)
- **crosswords:** `useGame` already puts the one grid on every player; it
  stops nulling the rest.
- **scrabble:** the board and `nBagTiles` move from the top of the blob into
  `GFacts`, with the rack (`team.rack`) and the score.
- **setgame:** the board and `nTilesInDeck` move into `GFacts`; the two
  re-sums of `players[].nSetsFound` (`useGetGameEndingMessage`,
  `pdf/model.ts`) read `gd.me.nSetsFound`.
- **spellingbee, wordwheel, boggle:** the counts move; `foundWords` stays.
  The bee pair's `targetRankIdx`, today in `team` and repeated on every
  player, is one fact like the rest. boggle's three `gd.team ?? gd.me`
  readers read `gd.me`.
- **bananagrams:** compete only, so `team` is always null and every fact is
  the player's own.
- **codenamesduet, last:** its board's tiles are shared, but each seat sees a
  different key (`guessableBy`, the partner's key hidden), which `useGame`
  works out per seat. Sketched before it is built.

## Settled in psychicnum (Joel, 2026-10-06)

- **`gd.stateLineData` goes** where it only copied the side's facts:
  `StateLine` takes `facts: GFacts` and is handed `gd.me`. The bee pair's
  rank names are computed onto every player's facts beside the indexes, so
  its `stateLineData` went too; strands' `hintBarData`, which copied
  `gd.me.hintPoints` and `gd.setup.hint_cost`, went the same way.
- **A key sent in `team` alone is null on each coop player**, every key
  present: `GPlayerRaw`'s `board` is `GBoardRaw | null`, and `team` is
  `GFactsRaw | null`. `useGame` gives a coop player's `own.board` the one
  board, by reference.
- **The overlap check is `FactsApart`** (src/common/game-page/gameData.ts),
  used in the player type itself: `GPlayer = PlayerRaw & FactsApart<GFacts> &
  { own: GFacts }`.
- **`summary_data.team` keeps its two counts**, built by its own
  `_make_json_team_counts`; game_data's `team` is every fact.
- **`oneBoard` is dropped in its own commit**, right after psychicnum's
  (migration 20261006000003, which also strips the key from the stored static
  blobs).
- **A total that can only ever be the puzzle's stays in `puzzle`** (stackdown's
  `nReqdWords`; Joel, 2026-10-06): it is game-level, with no per-player goal
  it could become, so it is not a fact. `StateLine` takes it beside the facts:
  `<StateLine facts={gd.me} puzzle={gd.puzzle} />`. A total that could one day
  be a per-player goal is asked when its game is reached.
- **An object shared in both modes stays once at the top of the wire**
  (scrabble's board and bag, setgame's board and deck; Joel, 2026-10-06):
  `useGame` puts it on every player, the same object on each, so it is sent
  once in a race too and `gd` keeps nothing game-specific at its top.

## Open

- **codenamesduet's per-seat view**, when it is reached.
- **`summary_data`**, after `gd`.

## Where the knowledge lands when this ships

- docs/common-schema.md's game_data contract: `team` on the wire as the
  side's facts, once; the player's own facts beside the common keys; what
  `useGame` builds from them.
- docs/code-conventions.md: `GFacts`, the side, `own`, and the loose-copy
  examples.
- seat-view's shape drops `gd.team`.
- Every comment that cites this plan (the games' `useGame.ts` and `types.ts`,
  `src/guards/gameSummaries.test.ts`, docs/games/waffle.md,
  src/connections/doc.md) says the rule in its own words or points at
  docs/common-schema.md. Then this file is deleted, with its `CLAUDE.md` row.
