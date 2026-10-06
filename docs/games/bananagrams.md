# bananagrams (MonkeyGrams)

A **Bananagrams** clone: a real-time, simultaneous word-tile race. Each player
builds a private crossword from a hand of letter tiles, drawing more from a
shared **bunch** as they go; the first to place every tile when the bunch can't
refill the table goes out and wins. **Compete only** — a single manifest, bare
gametype `bananagrams`, no `mode` parameter (the `_compete` suffix only earns
its keep beside a `_coop` sibling). Solo is a race of one.

What sets it apart from the rest of the roster:

- **The board is the page's, not the server's.** Arranging your own tiles is
  private scratch state, not a validated move: the page owns the board and
  saves it back; the server owns the tiles you hold.
- **The hand is derived, never stored** — the tiles you hold less the letters
  on your board.
- **Desktop only**, and the roster's documented layout exception: the board
  fills the board column, and the hand, Peel and the dump zone live in the info
  column ([mobile.md](../mobile.md)).

## 1. Rules

- Each player is dealt a **starter hand** (15 or 21) from a shuffled bunch of
  up to 144 tiles; the rest of the 144 sit out of play in the **bag**.
- You build your crossword by dragging tiles or typing at the keyboard cursor.
  Rivals see how many tiles you have left to place, never your board.
- **Peel** when your hand is empty. If the bunch can give every player still
  racing one tile, everyone draws one and the race goes on. If it can't, you
  **go out and win** — Bananas!
- **Dump** an awkward tile to trade it for three. The draw comes from the
  bunch, topped up from the bag when the bunch is short; the dumped tile goes
  to the back of the bunch, or to the bag in **dump-to-bag** games, which
  shortens the race.
- **Shuffle** (⟲, `⌥Z`) reorders your hand for a fresh look.
- **Concede** drops you out with a loss; the others race on, and the last one
  to concede ends the game with no winner. **Stop** ends it for everyone with
  no result.
- A countdown that runs out ends the race with no winner.

### When a peel is checked

A peel can be **blocked**: the board fails the legality test, the failing
tiles turn red, and the game goes on. The test is the same everywhere
(`_win_blockers`): the tiles must be **one connected piece** (up, down, left,
right — a diagonal touch doesn't join), and, when words are checked, every run
of two or more must be a **real word** at the game's bands.

| | word check `off` | `win` | `strict` |
|---|---|---|---|
| winning peel | connected | connected, real words | connected, real words |
| ordinary peel | not checked | not checked | connected, real words |

Connectivity holds even in trust-the-friends `off`: a scattered board isn't a
grid. **Check words** runs the full test on demand, whatever the setting.

## 2. The board — a fixed 25×25 grid

The board is a flat 625-character string, `board[idx(x, y)]` = `board[y*25 +
x]`, each cell a lowercase letter or `'.'` (x = column, y = row, scrabble's
convention). You navigate it with a **zoom slider and the scrollbars**; the
grid never resizes.

That "never resizes" is what keeps the code simple: placing a tile can never
shift the view, so there is no growing, no re-centering and no scroll
compensation, and a placement is a string write at a bounded coordinate.

**Why 25×25.** A finished half-bag solo grid is about 72 tiles, and an
interlocking crossword fills about 30% of its bounding box, so roughly 15×15,
up to about 20 on the long axis. 625 cells leaves plenty of room, and still fits
a laptop at a readable tile size zoomed out. The edge is a real rule — you
can't place outside it — but it never binds in practice.

**Navigation.**
- **Zoom** sets px per cell. The smallest zoom is measured to fit the whole
  grid, so you can always see everything with no scrollbar. A zoom keeps the
  viewport's center fixed, and the keyboard cursor is kept in view.
- **Zoom to fit** (`act-zoom-fit`) moves the tiles to the middle of the grid,
  puts the cursor back at the center, and zooms to show them with a margin —
  the only thing that shrinks the view, and the one to reach for when you've
  built off toward an edge.
- A thick outer border marks the grid's real edge.

### The hand is derived

A player's `tiles` is everything they hold, hand and board together, as one
lowercase string. The hand on screen is `deriveHand(tiles, board)`: the held
letters less the ones on the board. That split is what makes peel and dump
conflict-free — the server only ever grows or swaps `tiles`, for every player
at once, while each page edits only its own board, so a dealt tile appears in
the hand by re-derivation and nothing has to merge.

Tiles are interchangeable by letter: there are no tile ids, and everything is
plain strings. The hand's **order** is the player's own (`useHandOrder`):
Shuffle reorders it, it never reaches the server, and `reconcileHandOrder`
keeps it in step as letters come and go (letters repeat, so it works on the
multiset).

The server knows only what you hold and where it sits, so a tile pushed off to
the side of the board counts as unplaced, the same as one in the hand: a
player's **`nUnplacedTiles`** — the number rivals see — is their tiles less the
board's largest connected block (`_main_block_size`).

### Saving the board

The board is high-frequency and private, so it never round-trips per move. The
page saves the whole grid (`save_player_board`) **about 0.8 s after the last
edit**, **when the editing board unmounts**, and **before a peel or Check words**, so
the server judges what the player sees. The unmount save is load-bearing:
`PauseBoundary` unmounts the play surface on pause, and presence-pause fires
whenever anyone disconnects.

Every save rebuilds the blobs, so the saver's board in `game_data` is the board
as last saved — what their page seeds from on a remount — and a rival's count
moves as the board does.

**An accepted race.** The unmount save is fire-and-forget (an unmount cleanup
can't await), so on a fast pause → resume the page can seed from a blob the
save hasn't rebuilt yet, losing up to one autosave window of placements. The
loss is a few re-placeable tiles, so it stays. The fix, if it ever matters, is
a board version the save stamps and the seed refuses to go behind.

### The keyboard cursor

The fast path for a word you've already formed; dragging stays the tool for
single tiles and rearranging. The cursor is the shared 2-D board cursor
(`useBoardCursorKeys`, [common/board-cursor](../../src/common/board-cursor/doc.md)),
clamped to the grid, starting dead center.

- **Click** a cell to put a horizontal cursor there.
- An arrow **along** the axis moves one cell; an arrow **across** it flips the
  axis. Forward is right (horizontal) or down (vertical).
- **Typing a letter** places it from the hand and advances. Over a filled cell
  it swaps: the old tile goes back to the hand first, so typing `A` over `A`
  always works and `A` → `B` needs a `B` you hold. A letter you don't hold
  flashes a red box around the hand and changes nothing.
- **Backspace** on a tile returns it to the hand and stays; on an empty cell it
  steps back and returns the tile there, so one press right after typing takes
  back the letter just typed (`planBackspace`).
- **Enter** and **Space** peel — they are `act-peel`'s keys, so they gray with
  the button.

The cells aren't focusable, so a press on the board or a hand tile blurs a
focused chat box (`blurActiveField`), handing the keyboard back to the game.

## 3. Schema — `bananagrams.*`

```
bananagrams.games          game_id, hand_size, word_check, dict_2, dict_3plus,
                           dump_to_bag,
                           bunch_at_setup text  -- the deal, in order; out of the grant
                           bunch text           -- the live draw pile; out of the grant
                           bag text             -- the out-of-play reserve; out of the grant
bananagrams.player_boards  game_id, user_id,
                           board text           -- 625 cells, as last saved; out of the grant
                           tiles text           -- what they hold; out of the grant
                           updated_at
bananagrams.events         id, game_id, user_id, kind ('peel' | 'dump' | 'went_out'),
                           tile text,           -- the letter dumped; null otherwise
                           n_drawn int,         -- 1 on a peel, 3 on a dump, 0 going out
                           took_turn, created_at
```

The four setup values the moves read are copied from `setup` at create
(`off`, 4, 4 and false when absent). `bunch_at_setup` is the shuffled tiles
this game was dealt from (length = the chosen bunch size), hands first, in deal
order — the record Restart re-deals from. `bunch` and `bag` are the two live
piles. Every letter is lowercase; the page draws the capitals.

**Who writes what.** `board` is the page's: only `save_player_board` writes it,
and only the caller's own. `tiles` is the server's: set at the deal, grown by a
peel, swapped by a dump.

### RLS + grants

Every table is club-readable through its games row. The column grants leave out
everything whose order is every draw to come (`bunch_at_setup`, `bunch`, `bag`)
and every player's `board` and `tiles`. The page reads none of these tables —
only the blobs — and a rival's board is withheld by the page's seat rule, not
by RLS (todo.md → Won't do).

### The page blobs

`bananagrams._rebuild_data_cols` writes them at create, at Restart, at the end
of every move and after every board save, each assigned whole: `shell_data`
through `common._make_json_shell_data`, and on top of the common part of
`game_data` and `summary_data` this game's own.
`bananagrams._rebuild_data_cols_for_all()` rebuilds every bananagrams game
without re-dating it. `static_game_data`, what nothing after create changes, is
written once by `_write_static_game_data`, from `create_game` and that
rebuild, never by a move ([common-schema.md → Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place.

| blob | bananagrams' part |
|---|---|
| `static_game_data` | the common part alone: there is no puzzle, and every tile and board is in play |
| `game_data` | `nBunchTiles` and `nBagTiles`, the two piles' counts (their order never leaves the server). `team: null`. `events`, every row `{id, userId, kind, tile, nDrawn, at}`. On each player: `tiles`, `nTiles`, `nUnplacedTiles`, and `board: {letters}` |
| `summary_data` | `nBunchTiles` — the club card's "12 tiles in the bunch" |

**Every player carries the facts** (`GFacts`: `tiles`, `nTiles`,
`nUnplacedTiles`, `board`, `nBunchTiles`, `nBagTiles`) twice — spread on,
their side's; under `own`, their own
([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)) — and since bananagrams is
compete only, the two are the same. The piles are one for every racer, so the
wire sends them once at the top and `useGame` puts them on every player; `gd`
has no piles or `team` of its own, and the state line reads `gd.me`.

**The seat rule** (`makeGameData`): a rival's `tiles` and `board` are null
until the game ends. Their counts stay, so the strip can show how close each
one is; once the game has ended every board shows, for the printout.

### How a game ends

The ending is `common.games`' reason, detail and outcome
([win-lose.md](../win-lose.md)):

| when | reason / detail | ranked |
|---|---|---|
| a winning peel | `reached_goal` / `complete` | the peeler alone, 1; everyone else short of the goal |
| the countdown ran out | `timeout` | nobody — a loss for everyone |
| the last racer conceded | `conceded` | nobody — a loss for everyone |
| somebody pressed Stop | `stopped` | nobody — neutral |

The winning peel stamps the peeler's `solved_at` and ends them `reached_goal` /
`complete` before ending the game, so the winner's own `ending` is set too.

## 4. RPCs

All `security definer`; no table write policies. Every write locks the
`bananagrams.games` row, so peels, dumps and saves serialize.

- **`create_game(p_club_handle, p_setup, p_player_user_ids)`** — shuffles the
  144-tile set (`_full_bag`) and splits it at `bunch_size`: that many become
  `bunch_at_setup`, the rest start the bag. Deals each player `hand_size`
  tiles, keeps the undealt rest as `bunch`, and seeds one empty board per
  player. Validates `hand_size ∈ {15, 21}`, `bunch_size ∈ [1, 144]`,
  `players × hand_size ≤ bunch_size`, `word_check ∈ {off, win, strict}`, and
  the two bands unless the check is `off`. The title is written here (§6).
- **`save_player_board(p_game_id, p_board)`** — writes the caller's own board,
  checked for shape only (625 cells, each a lowercase letter or `.`) and not
  against the tiles held: the board is private and trusted. Dropped, with a
  named answer, once the game has ended or for a player who conceded, so a
  late unmount save can't clobber a final board.
- **`peel(p_game_id)`** — refused for an ended game or a conceded caller, and a
  fault unless the hand is empty. Counts only the players still racing: if the
  bunch can't give each one a tile it's a winning peel; otherwise every racer
  draws one from the front of the bunch. Either can be blocked (§1); a blocked
  peel deals nothing. Writes a `peel` row (or `went_out`).
- **`dump(p_game_id, p_tile)`** — refused for an ended game or a conceded
  caller, if the bunch and bag together hold fewer than three, or if the caller
  doesn't hold the tile. Draws three from the front of the bunch, topping up
  from the front of the bag, then puts the dumped tile at the back of the bunch
  (or the bag, dump-to-bag) — after the draw, so it can't come straight back.
  Writes a `dump` row.
- **`check_board(p_game_id)`** — the legality test on the caller's own board,
  always with words, at the game's bands. Read-only; it reveals nothing that
  isn't on the player's screen.
- **`replay_board(p_game_id)`** — Restart: the same row, every board emptied,
  the same hands re-dealt from `bunch_at_setup`, the bunch restored to the
  deal's undealt rest, and the bag rebuilt as the full set less the deal (exact
  even after dumps, since tiles are a multiset). `solved_at` and the ending
  cleared. Any player, mid-game or after; the page confirms mid-game.
- **`concede(p_game_id)`** — `common._concede`: the caller out with a loss;
  the game ends `conceded` when the last racer goes.
- **`stop_game(p_game_id)`** — `common._stop`: ended for everyone, no result.
- **`submit_timeout(p_game_id)`** — every client fires it when a countdown
  reaches zero; the first ends the game `timeout`, the rest get the game-over
  race.

### What the RPCs answer

Every one returns an [envelope](../envelopes.md). With no shared board, almost
nothing is a race between players; the races are against the game ending under
you.

| | | |
|---|---|---|
| `peel` → `dealt` · `won` · `invalid` | `ok` | `invalid` carries `invalid_cells`; it is a state of play, not a refusal |
| `check_board` → `invalid` · `empty` · `clean` | `ok` | `invalid` carries `invalid_cells`; `empty` is its own, so a blank board is never congratulated |
| `save_player_board` → `saved` · `game-over` · `conceded` | `ok` | the two drops are named, so a save and a discard never look the same |
| `dump` → `dumped`, `create_game` → `created`, `stop_game` / `submit_timeout` → `ended`, `replay_board` → `replayed`, `concede` → `conceded` | `ok` | |
| "Game over", "Already conceded", "That game was already deleted" | `race` | the shared raises (`common._raise_game_over`, `_raise_already_conceded`, `_raise_game_deleted`) |
| `PN347` "Bunch too low to dump" · `PN348` "You don't have that tile" | `race` | the page's own gates losing to a rival's peel |
| `PN337`, `PN341`–`PN342`, `PN346`, `PN349`–`PN350` `BUG: …` | `fault` | shapes the board can't produce: a peel with tiles in hand, a dump of something not a tile, a save of the wrong shape |
| `PN094`–`PN103` `BUG: …` | `fault` | `create_game`'s ten, all composed by the setup dialog |

## 5. Frontend

**Layout.** The board fills the board column with a fixed-height local
feedback slot beneath it; the info column runs **state → rivals → help →
setup → the hand box → the action row**, a documented exception to the
canonical order ([playarea.md](../playarea.md)), because the hand and Peel live
there and the actions sit below them.

**The hand box** (`HandBox`) has the shared WordList / EventLog chrome: a plain "Hand"
heading over a framed box. The **dump zone** is at the top of the box, close to
the tiles you reach for; it brightens while a tile is dragged, greens when one
hovers it, and says "Bunch too low to dump" when the piles can't cover the
draw. A tile from the hand or dragged off the board can be dumped. The ⟲
shuffle floats over the tiles' corner and stays live after the game ends.

**The action row** is one `<InfoActionsRow>`: `Check words · Peel ┃ Restart ·
New game · Concede · Stop game · Back to club`. Each action answers whether it
shows: Peel and Check words go once the board is inert, Stop waits behind
Concede (whose question offers stopping the table) until a Concede is spent,
Restart and New game are buttons only once the game has ended, and Back to club
is filled then.

**`PeersStrip`** is this game's own vertical strip, kept over the shared
`OpponentStrip` because a race reads top-down: each rival's tiles left, closest
to done first, a conceded rival "out" at the bottom, the winner "done!".
Nothing in solo.

**The local slot** carries a peel's or dump's acknowledgment, the check's
answer, a refusal and the endings. The acknowledgment comes from the log's
newest row (`useShowDrawMessages`): "🍌 Peel!" for mine, "moth peeled" for a
rival's, "Dumped Q" with the exchange glyph for my own dump; a rival's dump
changes nothing of mine and isn't shown. The winner alone gets
`<CelebrationBlockingModal>` ("Bananas! 🍌").

**The endings** (`lib/gameEndingMessage.ts`, `lib/playerEndingMessage.ts`):
"🍌 Bananas! You went out first" / "moth went out — Bananas!"; "⏰ Time's up —
no winner"; "🏳️ All conceded — no winner"; a Stop's shared neutral message; and
"Conceded — race continues" while the others race on.

**Desktop only.** `PlayAreaLoader` shows the shared `DeviceBlockNotice` on any
coarse pointer — the gate keys off the pointer, not the width, since a touch
tablet is desktop-wide but has no mouse to drag with.

### The component tree

Folder [`src/bananagrams/`](../../src/bananagrams/), on the page blobs:
`useGame` is `makeGameData(game_data, me)` — no read, no subscription — and
every type the folder exports is in [`types.ts`](../../src/bananagrams/types.ts)
(the `gd` sketch at its top) and, for the ones that reach React,
[`reactTypes.ts`](../../src/bananagrams/reactTypes.ts).

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd; DeviceBlockNotice ← on touch
  └── PlayArea                  the outer coordinator: the moves, the slot, the endings
        └── EditingBoard        the interactive part: holds the editing board, lays out the columns
              ├── Board         the scrolling grid and the view controls
              │     └── Cell    one cell: its tile, the cursor, a drop's answer
              │           └── Tile
              ├── FeedbackPill ←      the local slot
              ├── InfoCol             the readouts, the hand and the action row
              │     ├── StateLine     "Tiles: You 14 · Bunch 60 · Bag 3"
              │     ├── PeersStrip    each rival's tiles left
              │     ├── SetupDisclosure ←
              │     ├── HandBox       the dump zone, ⟲ and the hand's tiles
              │     │     └── Tile
              │     └── InfoActionsRow ←   one row, every action
              └── Tile              the drag's ghost

  ← belongs to common/ ; everything else is this folder's
```

**Two coordinators**, where every other game has a `BoardCol` and an
`InfoCol`: the hand's tiles drop onto the board and the dump zone takes a tile
dragged off it, so one **editing board** (`useEditingBoard`: my board as I
edit it, the hand derived from it, and everything that changes them) spans both
columns. `EditingBoard` holds it between `PlayArea` (data, moves, slot,
endings) and the two views, and keeps its constant changes — a drag updates on
every pointer move — from re-rendering `PlayArea`'s hooks. Neither view owns
input. `Board` draws the grid; `EditingBoard` draws no grid of its own. The DOM contract the drag hit-tests
(`data-cell` / `data-x` / `data-y`, `data-zone="hand"` / `"dump"`,
`data-hand-tile`) is load-bearing.

`PlayArea`'s hooks: the two ending messages (`useGetGameEndingMessage`,
`useGetPlayerEndingMessage`), `useShowDrawMessages`, one per trip to the
server — `usePeel`, `useDump` and `useCheckBoard`, each showing its own answer
and handing a peel's or a check's failing cells back to the editing board to paint —
and `useActionsAndMenu` (Restart · New game, then Print, in the menu). The
editing board's: `useBoardAutosave`, `useBoardZoom`, `useBoardDrag` (on the
shared `useDragGesture`), `useHandOrder` and the shared `useBoardCursorKeys`;
it saves the board before a peel or a check, and binds `act-peel`,
`act-check-board` and `act-zoom-fit`.

**One `Tile`** draws the board's, the hand's and the ghost's. Its letter is
`60cqmin` of its holder plus the borders `cqmin` measures inside (1.2px for
the tile's own, 2.4px on the board where the cell has one too), so a letter is
0.6 of its tile at every zoom and in the hand.

### The answers (`lib/answer.ts`)

Every answer bananagrams gives — `peel`, `peel_peer` (a rival's peel, which
dealt me a tile too), `dump`, `went_out`, `peel_invalid`, and Check words'
`check_clean`, `check_empty` and `check_invalid` — and what each reads as, in
one place. `answerOfEvent` turns a log row into its answer; `went_out` says
nothing, since the ending says it. The rule this follows is
[outcomes.md → One event, one outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it).

## 6. The title

A pure identifier: `'#'` and the first six hex digits of the game's uuid,
uppercased (`#3F9A2C`). Every player builds a private grid, so anything drawn
from play would be meaningless (whose grid?) or a leak; an identifier keeps two
games in a club list tellable apart, and doubles as a lookup key.

## 7. Setup

`hand_size` (15 / 21, default 15); `bunch_size` (1–144, default 144 — fewer
tiles, a shorter game); **dump to bag** (default off); **word check** (Off /
At win / Every peel, default Off); the two shared `DictBandField` bands,
**2-letter words** [2–6] and **longer words** [1–6], default 4, always shown,
since Check words uses them whatever the setting; and the shared timer (none /
count-up / countdown). The form shows how many tiles the deal takes, and
`bunchSizeError` (shared with the server's gate) disables Start with a reason
until `bunch_size ≥ players × hand_size`.

## 8. Print to PDF

"Print board (PDF)" in the menu: the word-list body family, one column per
board ([common/pdf/doc.md](../../src/common/pdf/doc.md)). My column reads the
live board at click time (`PlayArea`'s `myBoardRef`, which the editing board keeps
pointed at it); a rival's board is null until the game has ended, so mid-game
the print is my column alone. Each board is cropped to its tiles
(`boardToGrid`) and sized to fill its column, with its words (`boardWords`,
every run of two or more across and down) de-duped, alphabetical, unscored.

## 9. Tests

- **`hooks/useGame.test.ts`** — `makeGameData` on the fixture
  (`lib/gameData.fixture.ts`): the seat rule, the links turned into players,
  the state line.
- **`hooks/useEditingBoard.test.ts`** — the editing board: the derived hand,
  the two saves (after an edit, on unmount), typing and Backspace, the
  hand-error flash, a peel and its blocked cells, Check words painting and
  clearing its cells, the dump's threshold, an inert board.
- **`hooks/usePeel.test.ts`**, **`hooks/useDump.test.ts`**,
  **`hooks/useCheckBoard.test.ts`** — each trip to the server: what every
  answer shows in the local slot and hands back to the editing board.
- **`components/Board.test.tsx`** — a cell per spot, the cursor's ring, a
  drop's answer (a lifted tile may land back on its own cell), the red cells,
  a press's coordinates.
- **`components/PlayArea.test.tsx`** — the wiring on the fixture: the board,
  the hand, the strip and the state line off the blob; the ending I won; the
  conceded row; the setup rows; the commands through the dispatcher (+, ⌥⌫'s
  two answers, Stop behind Concede, Restart) and the menu's order.
- **`lib/answer.test.ts`**, **`lib/gameEndingMessage.test.ts`**,
  **`lib/board.test.ts`**, **`lib/words.test.ts`**, **`lib/setup.test.ts`**,
  **`lib/setupRows.test.ts`**, **`components/SetupForm.test.tsx`**.
- **pgTAP** (`supabase/tests/bananagrams/`) — `game_data_test.sql` pins the
  blobs (create, a save, a dump, the winning peel, Restart, the rebuild); the
  rest: `create_game`, `save_player_board`, `peel`, `dump`, the legality test
  in every word-check setting and `check_board` (`legal_check_test.sql`),
  `replay_board` with conservation (hands + bunch + bag = 144), `concede`,
  `stop_game`, `submit_timeout`, and the grants (`rls_test.sql`).
- **e2e** — `bananagrams` (render, a placed tile surviving a reload, the
  win, a peel's draw, a dump, a rival's live count, New game, Stop),
  `bananagrams-block` (the touch block screen) and `bananagrams-print`; and
  `tab-swallow`'s bananagrams case.

## Won't do

- **Touch input or a mobile layout.** Desktop only by design: dragging tiles
  around a 25×25 grid wants a mouse, and typing at the cursor a keyboard.
