# The seat's view — `gd.me` is my player, and a player holds every fact about a seat

**Status: DECIDED 2026-10-01, being built.** Joel and Claude settled this in
one conversation at the end of connections' BoardCol pass; this file is the
record. It pauses the per-game component passes (connections' InfoCol and
Board) until the three converted games — psychicnum, wordle, connections —
carry the shape below; those passes then resume on it.

It supersedes the spectating plan, deleted with step 1: there is no
spectating.

## The decisions

### 1. No spectating

You must be seated in a game to open it. A club member who opens a game they
are not in is sent to the club page with a toast ("You're not in this game").
RLS stays as it is — a member reading rows for a page they cannot open does no
harm — so this is one gate in the game page, not a schema change.

`create_game` requires the caller among `p_player_user_ids`: nobody starts a
game they are not in. (The "Ada facilitates a game between Bea and Cade" case
in the SQL docs goes.)

Why: every nullable `me`, every `?.` on my seat, every `SPECTATING:` tag and
the unanswerable "which board does a watcher see in compete" came from a
feature nobody has used. If it is ever wanted, it comes back with its own
design.

### 2. `auth`, not `authSession`

The loader prop is `auth: Session` (Supabase's type, unchanged), read as
`auth.user.id`: the signed-in user. Not `sess` (a third abbreviation beside
`cg`/`gd`, and there is a `common/session` folder), not `auth.id` (a wrapper
type for one field, and `user` is the word that says this is the login
identity and not a player). It lives on `PlayAreaLoaderProps` and
`useCommonGame`'s options, not on `cg`: the viewer is the page's business.

### 3. `gd.me` IS my player

`gd.me` is `gd.playersById[auth.user.id]`, the same object, never null (no
spectating). `cg.me` is the same with the common `GamePlayer`. Gone: the
`standing` group, `isPlayer`, the `myId` parameters on hooks and InfoCol, and
`solvedByMe`.

### 4. One home: every seat fact is on the player type

The test, in two questions:

- **Is it intrinsically about the table?** Whose turn it is, how the game
  ended, what the puzzle is, whether the board is shared. On `gd`:
  `gd.turns.turnHolder`, `gd.gameEnding`, `gd.puzzle`, `gd.isSharedBoard`.
  Putting "moth's id" on every player would be nonsense; that is the tell.
- **Would a component ask it of a player?** On the player, whether or not the
  value happens to be the same for everyone. A component asks a PLAYER for
  anything about a player and never knows which facts are table-wide; that
  knowledge is the hook's (and the DB's), which is the meta-goal.

So the player type carries, computed for every seat (cheap: at most six
players, one comparison each):

| on each player | what it is |
|---|---|
| the server's facts | `playerEnding`, `outcome`, `finalRanking`, `solvedAt`, the counts |
| read off them | `isConceded`, `isPlayerEnded`, `isEliminated`, `hasSolved` (= `solvedAt !== null`; a coop solve stamps every teammate, so it is right in both modes) |
| the turn | `isStillPlaying`, `isOnTurn` (was `isMyTurn`), `isWaitingForTurn`, `isBoardInteractive` — derived by the hook from `gd.turns`, so no component writes `turnHolder.user_id === me.user_id` itself |
| the former `readout` | `maxMistakes` / `maxGuesses`, `requiredCategoriesCount` / `requiredSecretsCount` (the same for every player; the field comment says so), `mistakeCount` / `guessesUsed`, `foundCount` (the player's own in every mode; what the team shares is `gd.team`'s — [team-facts](team-facts.md)) |
| the board | `board`: the seat's view — connections' `matchedCats` + `tilesLeft`, wordle's rows, psychicnum's tiles (decision 9). In coop every seat's board is the same board, which is what `oneBoard` means |
| the picks (connections) | `picks`: mine held by the hook, a teammate's by Broadcast in coop, an opponent's null in compete |

**Move, don't copy.** When a fact goes onto the player there is no `gd.x`
beside it, or the component is back to choosing. `readout` dissolves; it is
not mirrored.

`gd` is OUTPUT — the hook rebuilds it on every reload and nothing else writes
it — so the same number on six players is a view of one row, not two truths.

### 5. A player's id is `id`; `gd` and `cg` are frozen

`gd.me.user_id` says "user" about a player. A player's id is `id`: `gd.me.id`,
`p.id`, `playersById[p.id]`. This renames the common `Member.user_id` field,
which chat, club and presence read too, so it is cross-cutting and lands as
its own commit inside step 3 (done 2026-10-01 across the common layer and the
three converted games; the unconverted games pick it up as each converts); the
database column stays `user_id`.

`gd` and `cg` are **read-only, fully frozen**: the hook builds them and nothing
else writes them, ever. A surface that wants a different value rebuilds its
own; a hook that wants to add one adds it in `makeGameData`. Their types are
`Readonly` where TypeScript lets that be said cheaply.

### 6. What null means on another player

Null on another player's field means **this seat may not see it yet** (a race
in progress: an opponent's `board` and `picks`), never "didn't compute". At the
end the fields fill in. Under decision 8 the one that withholds is the game's
`useGame`, by a named rule per game, not a policy.

A seat fact that is expensive and that only I read today still goes on the
player type, null for the others, with a comment saying "computed for me
only": promoting it later fills in a value and moves no reader. (`gd.my…` for
a viewer-only value has no present example; that rule is not written until one
appears.)

### 7. One shape per reader: the common part of every `gd`, and `cg` beside it

Settled 2026-10-01 over psychicnum's sketch (the working copy sits at the top
of `src/psychicnum/hooks/useGame.ts`; the names are still being refined, and
nothing here is blessed). Reworded 2026-10-02 once decision 8 made the reader
define each blob: "common" had been two things under one word.

**Why.** `cg` was built as "what the page read" and every game restated it as
`gd` under other names: a second shaping per game, and a page group (pause, the
timer) riding into the game for nothing. Where a fact came from is internal to
the builder, so the facts every game shares are built ONCE, in their final
names, and a game's builder only adds what its own tables know.

- **The common part of every `gd`** is the game facts every game shares —
  `brand`, `mode`, `coop`, `compete`, `oneBoard`, `title`, `setup`, `turns`,
  `ending`, `outcome` — and the player with the standing terms. One common SQL
  helper writes it (`common._make_json_game_data`), each game's builder adds
  its own fields on top, and that is what keeps the shared fields from
  drifting between games. `brand` and `oneBoard` come off
  `common.gametypes`, so a game needs its manifest for nothing and `manifest`
  leaves `PlayAreaLoaderProps`. `winner` is common's too: the player ranked
  first.
- **`cg` is the shell: what `GamePage` reads, and nothing more.** `id`,
  `gametype`, `club`, `title`, `restartCount`, `ended`, and a roster of
  `id`, `username`, `color`, `ai`, `stillPlaying`, every field with a page
  reader. The page never sees a seat, an outcome or whose turn it is. So `gd`
  does not extend `cg`: both come whole from the database, the fields they
  share are written by the same helper, and `cg.me` and `gd.me` are two
  objects, the page's view of me and the game's.
- **The page's things stay the page's.** Pause, the timer, `sendSuspend`,
  `stillPlayingHumanPlayers`, `is_current_view`, `updated_at`: `useCommonGame`
  returns them beside `cg`, and they go on neither `cg` nor `gd`. A Pause
  button in an InfoCol one day is an action the page binds, like Stop.
- **The turn bell moves into the game**, beside the your-turn flash. Both are
  one moment (`useTurnArrival`) with two effects, and the flash already lives
  in each game's PlayArea; one hook, called once with `gd.me.onTurn`, does
  both. That is the one page read of the turn, and it goes with step 3.

**Naming inside a group.** The `is…`/`has…` rules were written for
free-standing names; a path supplies the context, so inside a group a
predicate about the subject is bare: `me.conceded`, `me.solved`, `me.onTurn`,
`turns.holder`, `ending.by`. The prefix stays where the bare word would name a
thing (`isBoardInteractive`, never `boardInteractive`). A group that may not
apply is null as a whole (`turns === null`: no turn order; `ending === null`:
still playing); inside a group that applies, a link names a player
(`turns.holder` is never null in a turn game: the pointer is set at create and
only ever advanced or rewound).
A player, not an id, wherever the lookup cannot miss (`holder`, `by`).
`outcome` sits top-level on the game and on the player, since a player's
outcome arrives at the game's end whether or not they ended early.

**The shape**, with `#` where a name does not say it. `oneBoard` is "the game
has one board" (true in solo coop), a fact; "shared", which the Boards read to
decide whose dot goes on a tile, is `oneBoard && players.length > 1` and is the
Board's to ask. `board` is what this seat's tiles show and nothing a sentence
about the game would quote: `guessCount` went, because it was `guessesUsed`
read from the rows for the flash's timing, and two lookalike names must not
hide a difference only one reader knows.

```
gd:                                       # the common part is every line not marked game
  id
  gametype
  brand
  mode
  coop
  compete
  oneBoard
  title
  setup
  setupRows                               # game
  puzzle: {words, secrets}                # game; what the game is solved against (docs/naming.md → puzzle); secrets null until the game ends
  team: {nFoundSecrets, nGuessesUsed}     # game; what the team shares; null when the game has no team (team-facts.md)
  turns: {holder}                         # null: no turn order; holder is a player
  ending: {reason, detail, by, winner}    # null while playing; by is a player
  outcome                                 # null until the game ends
  events                                  # game; the log; my rows only, mid-race
  players: [player, …]                    # seat order
  playersById
  me                                      # same object as playersById[auth.user.id]

player:
  id
  username
  color
  seat                                    # null in a free-for-all game
  ending: {at, reason, detail}            # null unless they ended before the game ended
  outcome                                 # null until written
  finalRanking                            # null until written
  solvedAt
  conceded
  solved
  stillPlaying
  onTurn
  waitingForTurn
  nReqdSecrets                            # game; the same on every player
  maxGuesses                              # game; the same on every player
  nFoundSecrets                           # game; own, in every mode
  nGuessesUsed                            # game; own, in every mode
  board: {tiles}                          # game; what this seat's tiles show (decision 9); null for an opponent mid-race
```

`isBoardInteractive` is not on a game's player: only scrabble drafts off-turn,
and another game that lets you act off-turn may not be about the board at all.
The common term stays computed until scrabble's area decides what it is.
`winner` singular or plural (setgame's ties) is not yet decided.

### 8. The page is written, not assembled: three blobs on `common.games`

Decided 2026-10-01, from the ideas-only shaped-page exploration that sat
beside the plans (retired with this). Decision 7's
shape stands; this decides WHO builds it. Taken now, before any game's `gd`
maker is written from split reads, because the two would have been thrown away
within the week.

**The idea.** Each game's status builder writes, in the move's own
transaction, everything a page shows onto `common.games`, already in the
page's shape and names. The front end reads that and nothing else from the
game's tables; the RPCs keep working on the real tables. The real columns are
read by SQL only, except the two the subscriptions filter on, `id` and
`club_handle`, and `updated_at`, the refetch signal.

**Three jsonb columns, one per reader**, each complete for its reader, so no
page merges two sources:

- **`summary_data`** — the game summed up in a line: everything a list of
  games shows for it, so the blob stands on its own as game_data does: `id`,
  `gametype`, `title`, `statusChangedAt`, `ended`, `outcome`, the `ending`
  group, and the game's numbers beside them. The club page's list is its one
  reader today; a page of my games across clubs would read the same column
  (done 2026-10-02: the club page reads the blob and `is_current_view`, which
  common flips without the game's builder; a game not yet writing the blob is
  not listed).
- **`shell_data`** — what `GamePage` shows: **the same shape for every game**,
  written by one common function. From the shell's reads today: `id`,
  `gametype`, `club: {handle}` (a group, so a count or a description has a
  home later), `title`, `restart_count`, `ended`, the roster (`id`,
  `username`, `color`, `ai`, `stillPlaying`), and `setup` if the shell ever
  wants it. `cg` is this blob read through one static type, plus `me`.
- **`game_data`** — what the play surface shows, in decision 7's shape: the
  game's own, written by the game's builder on top of the common player
  fields, which a common helper writes so they cannot drift between games.
  `gd` is this blob plus `me` and the id-to-player links (`turns.holder`,
  `ending.by`, `ending.winner`, `decidedBy` are ids in JSON and players in
  `gd`). It carries `events`: one less table, and the end of "the status
  says five while the rows say four".

Every blob carries `id`, `gametype` and the club's handle, so one printed or
stored on its own never leaves you wondering which game it was. `setup` goes
into whichever blobs want it; it is frozen at create, so the copy is never
stale.

**Two pass-through views, no logic.** `club_games_view` returns `summary_data`;
`game_view` returns `shell_data` and `game_data`. The table grants the client its
filter columns and the signal, so a Postgres Changes message is a nudge and
each page answers it by re-reading its view. A view shapes nothing per caller:
that was tried on paper and became a second builder in a worse language.

**Reads collapse.** The club page reads one view. `useCommonGame` reads
`game_view` and `common.timers` (the tick must not re-send the game row), joins
the room, and hands `game_data` down beside `cg`, opaque to common. A
game's `useGame` makes no read at all; it is a pure function of the blob and
`auth.user.id`. The gate reads the seat off the shell's roster. Only a game
with writes outside the builder (crosswords' cells) keeps a read of its own.

**The security line is `useGame`.** What a seat may not see yet — an
opponent's guesses mid-race, the secrets before the end, found words that are
not yours — is withheld by the game's hook, by a named, Vitest-tested rule,
not by a policy or a view. This is not security and does not pretend to be
(CLAUDE.md → Trust model); it protects the components from ever being handed
what they must not show. **Every convenience RLS and view the FE leans on
today moves to the hook on purpose**: before a game converts, its policies and
views that mention `auth.uid()` or `ended_at` are listed in its area file, and
each one is taken over or dropped by name.

**The shape rule across games.** `game_data` cannot be identical between
gametypes, but it is as alike as the games allow: the same concept wears the
same name everywhere (`winners`, never a game's "champions"; `mistakes`, never
"budgeted errors"), per docs/win-lose.md's vocabulary. psychicnum's sketch is
the first instance; the next game's blob starts from it.

**Known, to settle when met.**

- `is_current_view` is written outside the builder (`set_current_view`), so it
  stays a readable real column for the club page, or that RPC rewrites the
  `summary_data`. The first is simpler and honest: it is a pointer, not a page
  fact.
- Whether a subscription's filter column must be granted for the subscription
  to deliver: one test on the local stack before the first view.
- A profile color changed mid-game reaches an open game at the next move.
  Accepted.
- A shape change needs every past game rebuilt, so a rebuild-every-page RPC
  ships with the first builder, not after.
- crosswords, scrabble and bananagrams (writes outside the builder, large
  rows) get their tweaks when their areas open.
- Secrets that should truly be hidden could move to a table the builder merges
  from; overkill now, written down so the door is known.

### 9. A tile is an instance the builder writes: `GTile`, and the screen's `Tile`

Decided 2026-10-03. A game with tiles has two names, the same in every game:

- **`GTile` is the tile as the server knows it**: its identity and its settled
  facts, one object, in `types.ts`. Every game's has an `id`, a string, the
  game's own key — psychicnum's is the word repeated, stackdown's its tile
  number as text, wordle's a cell's place — so a set, a map, a `data-tile`
  handle and a shared piece all key the same way, and a tile with repeated
  letters is still one tile. The rest is the game's: psychicnum's is
  `{id, word, correct, decidedBy}` (`correct` and `decidedBy` null until the
  word is guessed); wordle's is a cell in a row, the letter and the color the
  server judged for it; connections' is `{id, word}`, the word its id, since its Board pass
  extracts `Tile`, a loose tile having no settled fact — the moment it has one
  it is in a band, which is a `GMatchedCat`. The builder writes the array in
  that shape, `id` included, under the seat's `board` where the facts are the
  seat's (`board.tiles`), with `tilesById` built beside it in `useGame` as
  `playersById` is; `useGame` turns the tile's ids into players under the same
  key, as `turns.holder` and `ending.by` are turned. What the frontend never
  does is assemble the tile from parallel lists: the JSON reads as `gd` does,
  which is the point of the page being written, not assembled.
- **`Tile` is the component that draws one**, taking the `GTile` and
  `TileMarks`, the screen's own facts about it — picked and by whom, under
  the cursor, in flight, flashing, shaking, history-lit. Marks are per client
  and per render and never in the blob; the board decides WHICH marks a tile
  wears and `Tile` decides HOW each is drawn. Named for the thing, not for
  what is printed on it: psychicnum's `WordTile` and wordle's `LetterTile`
  become `Tile`, and connections' inline `<button>` becomes one.
- **Tiles are passed; ids are held.** A component or hook hands a `GTile` on,
  and the thing in hand answers its own questions (`tile.correct !== null`),
  so no set of "decided words" is built to be looked up. What a hook keeps
  across renders — the pick, the guess in flight, the flashing and shaking
  sets, the display order — is the tile's `id`, named as one
  (`pickedTileId`), because a blob rebuilds every tile object; the hook looks
  the live tile up in `tilesById` on the way out and hands back a `GTile`. A
  held object would be stale and never `===` the board's again. A collection
  that crosses a boundary is a collection of tiles unless it must be held.
- **A game whose player never acts on a single tile has no `GTile`.** The
  `id` exists for the thing that is picked, held or keyed; wordle has no such
  thing — the row is typed, judged and marked whole — so its builder writes
  `rows: [{word, colors}]`, its `Tile` draws one letter on one color, and no
  key is written that nothing reads.
- **The puzzle's lists stay.** `gd.puzzle.words` and `gd.puzzle.secrets` are
  the puzzle, frozen at create; `board.tiles` is a seat's view of it. The
  words appear in both, and the rule for that is: the builder writes every
  array the page draws, in the shape it draws it, and a list that is a
  projection of another is kept when it names a different thing. The blobs
  are tiny, and no game multiplies a large board by its racers; revisit only
  if a blob ever measures in the hundreds of kilobytes.
- **The builders stay `language sql`**, one `select` each; a
  `jsonb_agg(jsonb_build_object(…))` over `unnest(words) with ordinality
  left join events` is the house idiom (connections' `_make_json_board`
  already joins this way), and the join can be run by hand to see the rows
  the array is built from.

**The order of work:** psychicnum first, as its own commit right after its
naming pass (done 2026-10-03: `_make_json_board` writes `board.tiles`;
`GTileResults`, `board.tileResults` and `board.decidedBy` went;
`lib/addRevealedSecrets.ts` and the history replay produce `GTile[]`;
`WordTile` → `Tile`); wordle in its naming
pass, where it is a check and the `LetterTile` → `Tile` rename; connections in
its Board pass, where `Tile` is extracted and its tile stays a `string`;
every later game writes `GTile` as part of its conversion, since none has a
`gd` of this kind yet.

**The wider pattern, not answered here:** the facts about one thing kept in
parallel lists keyed by its identity, with whoever draws it doing the join —
a tile is the clearest case, and the event logs' authors and the printers'
tracks are others. Each is tested against this decision when its area is
next open (todo.md → Someday).

## What this touches

- **Writing first (done 2026-10-01).** CLAUDE.md → Audience ("Spectators are
  friends too" goes; you must be seated to open a game), the plans table (this
  file in, the spectating plan deleted), README, docs/common-schema.md
  (seated-only; `create_game` requires the caller seated), docs/win-lose.md →
  Where a player stands (the terms are per player; `isOnTurn`; `isPlayer`
  gone), docs/code-conventions.md → Names about the viewing player (`auth`,
  `gd.me`, frozen `gd`/`cg`), docs/playarea.md's vocabulary line.
- **The gate (done 2026-10-01).** `GamePageGate` reads the game's row and the
  user's seat before anything mounts: not seated → the club page with a toast.
  `common._create_game`, which every game's `create_game` calls, refuses a
  player list without the caller (PN510); pinned directly in common's pgTAP
  and through psychicnum's `create_game`. No e2e fixture seated a game without
  its creator.
- **Common (done 2026-10-01).** `computePlayerStanding(player, game)` in
  `game-page/playerStanding.ts` computes the standing terms for every seat and
  `useCommonGame` folds them onto each `GamePlayer` (`GamePlayerRow` is the
  columns alone; `PlayerStanding` the terms); `Standing` and `whereIStand` are
  gone; `cg.me`; `PlayAreaLoaderProps.auth`; the test fixture derives the
  standing and requires the viewer among the players; `solvedByMe` deleted —
  `hasSolved` is `solved_at !== null`, which holds because psychicnum, wordle
  and connections stamp every teammate on a coop solve. **A game whose coop
  solve does not (stackdown sets a per-game bit in compete only; strands' coop
  branch stamps nobody) fixes that SQL in its own conversion.** The three
  converted games read `cg.me` into their `gd.standing` for now; their
  reshape moves it onto the player.
- **The builders, per decision 8, psychicnum first — boldly.** Every
  unconverted game is broken until its turn anyway, so the slice goes
  straight through and each game's tests catch it up. In order:
  1. **Migration (shape).** `summary_data`, `shell_data` and `game_data` on
     `common.games`, nullable so an unconverted game's row is empty rather
     than failing; `game_status` and `player_status` stay until a later
     migration retires them (Joel's call). `brand` and `oneBoard` on
     `common.gametypes`, seeded for every gametype in the same file; the
     manifest keeps its copy, kept in sync by hand for now, and what to evict
     from it is decided later.
  2. **`common._make_json_shell_data`** and **`common._make_json_game_data`**,
     the common part of every game_data (`seat` from `turn_seat`, the players
     in seat order, the standing terms per seat — `computePlayerStanding`
     moves here), the first called from `_create_game` and both from each
     game's `_rebuild_data_cols`. Written as named pieces a reader can follow —
     plpgsql has no block scoping to lean on — each pinned in pgTAP, so
     `select shell from common.games` shows the page what it gets. (Done
     2026-10-02.)
  3. **`useCommonGame` on shell_data** (done 2026-10-02). It reads `shell_data` and
     `game_data` off `common.games` and nothing else from that table;
     subscribes to the row alone; reads and ticks the timer exactly as before
     (`common.timers` is untouched); returns `cg` (`shell_data` plus `me`),
     `gameData` (opaque, beside `cg` rather than inside it, since the shell is
     what the page reads and nothing more), and pause, timer and `sendSuspend`
     beside them. The gate reads the seat off shell_data in one read. A null
     shell_data is a named failure (PN511), not a missing game. `manifest` leaves
     `PlayAreaLoaderProps`. The turn bell moved into `useTurnStartFlash`, so
     the page reads nothing about the turn. The two pass-through views wait
     until the change message's size matters; reading the columns directly
     changes nothing above them. psychicnum's page mounts on this and fails at
     its hook, which is the signal to go on.
  4. **psychicnum's game_data** (done 2026-10-02). Its `_rebuild_data_cols` writes
     `game_data` and `summary_data` on top of `common._make_json_game_data`, in named
     pieces (`_make_json_puzzle`, `_make_json_events`, `_make_json_board`,
     `_make_json_players`, `_make_json_summary_data`), each pinned in pgTAP
     (`tests/psychicnum/game_data_test.sql`), and writes `common._make_json_shell_data`;
     `psychicnum._rebuild_data_cols_for_all()` beside it. Its `useGame` is a pure function
     of the blob and `auth.user.id`: the links become players, and the seat
     rule withholds a rival's rows and board mid-race. Its reads,
     `useRefetchOnGameUpdate`, the `games_state` view, `_secrets_for` and the
     mode arm of `events_select` went (the inventory is
     plans/areas/psychicnum.md → The convenience RLS). The statuses are not
     written any more; the club page reads `summary_data`. The log's rows are
     camelCase in the blob (`userId`, `correct`, `at`), as every other key is.
  5. **wordle's game_data** (done 2026-10-02, the psychicnum way). Its
     `_rebuild_data_cols` writes `game_data` (`puzzle: {target}`, `events`,
     and on each player `maxGuesses`, `nGuessesUsed`, `tieBrokenByClock`,
     `board: {rows}`) and `summary_data` (`team: {nGuessesUsed}`, `maxGuesses`,
     `answerBand`, `nWinnerGuesses`) in named pieces, pinned in
     `tests/wordle/game_data_test.sql`. Its `useGame` is a pure function of
     the blob and `auth.user.id`; the seat rule withholds a rival's rows and
     board mid-race. The `games_state` view, `_target_for`, the mode arm of
     `events_select` and `_write_statuses` went (the inventory is
     plans/areas/wordle.md → The convenience RLS); the statuses are not
     written any more. `readout` and `standing` dissolved onto the player;
     every `SPECTATING:` branch in the folder went, and with it the
     watcher's "X won" message and the `winnerName` it read.
  docs/win-lose.md's formulas and code-conventions' naming section carry the
  path names once this ships.
- **connections — done 2026-10-02**, the same way: `_make_json_puzzle` /
  `_events` / `_board` / `_team` / `_players` / `_game_data` /
  `_summary_data`, `_rebuild_data_cols(_for_all)`; `useGame` is
  `makeGameData(blob, auth.user.id)` with the picks room kept beside `gd`;
  `readout`, `standing`, `boardEvents` / `matchedCategories` /
  `remainingTiles` dissolved onto the player (`board: {matchedCats,
  tilesLeft}`); the mode arm of `events_select` and `_write_statuses` went
  (plans/areas/connections.md → The convenience RLS); every `SPECTATING:`
  branch went, with the watcher's "X won" message. The three count columns
  took the blobs' names and coop's mistakes became each player's own
  (`20261002000002_connections_own_counts.sql`).
- **Next, in this order (2026-10-03):** psychicnum's naming pass
  (`nFoundSecrets`, `nReqdSecrets`, `nGuessesUsed`, with the two columns, plus
  `BoardCol` reading `gd.me.outcome` and the doc's stale lines), then
  psychicnum's `GTile` (decision 9) as its own commit, then wordle's naming
  pass (`nGuessesUsed`, `nWinnerGuesses`, the column, and `LetterTile` →
  `Tile`; done 2026-10-03).
- **Then** connections' InfoCol and Board passes resume on the new shape
  (done 2026-10-03: BoardCol, Board with `Tile` and `Band`, InfoCol, and the
  tile as `{id, word}`), and the next game converts straight onto it.

## How a game converts — the steps

What the three conversions settled, as the list the next game walks. Each
step names where its rules live; this list does not restate them.

**A. Read, then design, no code.**

1. **Inventory the game.** Its `doc.md`, `todo.md` and area file; what its
   loader reads and subscribes to; every policy and view that mentions
   `auth.uid()` or `ended_at`, listed in the area file as "The convenience
   RLS", each to be taken over or dropped by name; the status keys its page
   shows; whether its coop solve stamps every teammate.
2. **Sketch `gd` and `summary_data`**, one key per line, and get the names
   approved before any code. Every seat fact on the player, `board` among
   them (→ One home); `team` holding what the team shares, null in compete
   (plans/team-facts.md); `puzzle` frozen at create; links as ids in the
   blob and players in `gd`; counts `nFoo` and the permitted abbreviations
   (docs/code-conventions.md → A few words may be abbreviated); camelCase
   keys; `stateLineData` decided once; `ended` / `ending` / `stillPlaying`;
   and the tile question answered up front (→ A tile is an instance the
   builder writes): a `GTile` with a string `id` where the player acts on a
   single tile, none where the unit is the row.

**B. SQL.**

3. **The builders**, `language sql`, one `select` each, named pieces
   (`_make_json_puzzle`, `_board`, `_team`, `_players`, `_events`,
   `_game_data`, `_summary_data`, and `_make_json_tile(s)` where there is a
   tile); `_rebuild_data_cols(id, p_update_status_changed_at)` in plpgsql,
   called at create, Restart and the end of every move;
   `_rebuild_data_cols_for_all()` beside it.
4. **The shape and the endings.** Count columns take the blob's names by a
   new migration; the statuses stop being written; the convenience RLS goes
   by name; a coop solve stamps every teammate; `_maybe_finish_compete`
   takes the reason pair from its caller (docs/win-lose.md →
   `resource-exhausted`: the ending names the last player's act).
5. **pgTAP.** A `game_data_test.sql` pinning each piece: a fresh game whole,
   the blob after moves, the seat rule, the summary; the game's other files
   follow the renames; `supabase migration up --local`, the SQL file
   re-applied, every file of the game's run.

**C. The frontend's data.**

6. **`types.ts`** under the four rules (docs/code-conventions.md → A game's
   types), test-only exports `ZTest_`: `GGameDataRaw` and `GGameData`,
   `GPlayerRaw` and `GPlayer`, `GTeam`, `GStateLineData`, `GEventRaw` and
   `GEvent`, `GTile` if any; the shape sketch in a comment.
7. **`useGame`** is `makeGameData(blob, auth.user.id)`, pure and memoized on
   the blob: `playersById` and `tilesById` beside their lists, links
   resolved, the seat rule applied, every outcome read once through
   `lib/answer.ts`; no reads, no subscription. Live state that only one
   column reads is that column's hook (connections' `usePicks`).
8. **The fixture** builds the raw blob from facts, as the builder would,
   under `ZTest_` names.

**D. The component passes** (plans/component-readability.md: one per pass —
propose numbered with no code, Joel answers by number, build, close read):

9. **PlayArea**: the coordinator; the two ending builders from
   `gd.me.outcome`; it picks the board to show; every `SPECTATING:` branch
   goes.
10. **BoardCol**: owns the move; `isInteractive` computed once; hooks read
    through their names; the action's own `pending` is the one in-flight
    guard; the key-dismiss hook lives here; a leaf gets the answer; the
    state line in `MobileStatusBar` where the game has one.
11. **Board and its pieces**: a component per visual unit with its own CSS
    module; Board decides which marks each piece wears, the piece draws
    them; `useTileShuffle` and `useTileCursor`; held things are ids and say
    so, passed things are tiles; `data-tile` is the id.
12. **InfoCol and the components it renders**: `getScoreOrOut` reading
    "out" for any player who has ended; help on my move alone; the event
    log takes `events` and `historyView`; a label asks the rule, not the
    color.
13. **The naming pass**, if the conversion left any.

**E. Close each slice.**

14. **Prose**: the game's `doc.md` (blob table, component tree, tests
    table), this plan's done line, the readability plan's "what this game
    added", the game's `todo.md` (rulings under Won't do with the date and
    the words).
15. **Checks**: `tsc -b`, the game's vitests, lint, the guards after the
    last edit, the game's pgTAP; a new test verified by planting its bug;
    e2e only when Joel says. One commit per pass, on his word.

## The convenience RLS, per game

Before a game converts, its policies and views that mention `auth.uid()` or
`ended_at` are listed in its area file, and each one is taken over or dropped
by name: plans/areas/psychicnum.md, plans/areas/wordle.md and
plans/areas/connections.md → The convenience RLS.

## Owed when the problem children open

crosswords (one shared grid, per-cell authors), scrabble (one board, private
racks, a shared bag) and bananagrams (per-player boards, a shared bag) may not
fit "a seat's view" cleanly. Decide the exception, if any, when each area
opens, with the simple games already on the shape.
