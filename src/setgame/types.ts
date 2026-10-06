// cs-unmet

/**
 * setgame's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts stay
 * in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, and the tiles keyed by id). `GEventRaw` / `GEvent` are the
 * same pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { CoopTurnSetup, SetupOf, SetupRow } from '@/common/setup-form/types'
import type { COLORS, FILLS, SHAPES } from './lib/tiles'

/**
 * One tile: its four attributes as digits, each 1..3, in the order count,
 * color, fill, shape — `"3121"` is three symbols, the first color, the second
 * fill, the first shape (`lib/tiles.ts` reads them). Each tile is in the deck
 * once, so the id is the tile.
 */
export type GTile = {
  id: string
}

export type GColor = (typeof COLORS)[number]
export type GFill = (typeof FILLS)[number]
export type GShape = (typeof SHAPES)[number]

/** A tile's four attributes, unpacked for drawing. */
export type GTileFace = {
  // How many symbols are drawn.
  count: 1 | 2 | 3
  color: GColor
  fill: GFill
  shape: GShape
}

/** Which deck a game is played with — the setup knob. */
export type GDeckKind = 'full' | 'junior'

/** Which pigments the three color values are painted with. */
export type GPalette = 'traditional' | 'colorblind'

/**
 * setgame's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/setgame.sql → The page blobs): the common part, with the
 * table, the deck's count, the team, the log and each player's counts on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`.
 *
 * Nothing in it is private to a seat: the table is face-up and every claim was
 * made in front of everyone, in both modes.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The one table, shared in both modes.
  board: {
    // In slot order: a tile's slot is its place on screen and its key letter.
    tiles: GTile[]
  }
  // The tiles still to be dealt. The deck's order never leaves the server.
  nTilesInDeck: number
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every row, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/** What the team shares in coop (plans/team-facts.md): the players' counts,
 *  summed. */
export type GTeam = {
  nSetsFound: number
  nHintsUsed: number
}

/**
 * What the state line shows — "Found: 4 • Deck remaining: 57 • Hints: 1": the
 * team's counts in coop, my own in compete. Decided once, in `makeGameData`, so
 * the line draws it and picks nothing.
 */
export type GStateLineData = {
  nSetsFound: number
  nTilesInDeck: number
  // Null in compete, where there are no hints.
  nHintsUsed: number | null
}

/**
 * Every answer setgame gives about a move — the whole roster of what this game
 * tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it).
 *
 * `claim` and `hint` are a log row's `kind`; `claim_peer` is a teammate's claim
 * in the header (coop, free-for-all); `not_a_set` is the frontend's own
 * refusal — three picked tiles that are not a set never leave the client, and
 * write no row.
 */
export type GAnswer =
  | { answerType: 'claim' }
  | { answerType: 'claim_peer' }
  | { answerType: 'hint' }
  | { answerType: 'not_a_set' }

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // A claim takes three tiles; a hint shows one to three.
  kind: 'claim' | 'hint'
  tiles: GTile[]
  // The table right after: what the history view draws.
  boardAfter: GTile[]
  // A claim takes the player's go; a hint does not.
  tookTurn: boolean
  at: string
}

/** A player as setgame's game_data shows them: the common player, with their
 *  own counts. */
export type GPlayerRaw = PlayerRaw & {
  // This player's own, in every mode; the team's are `team`'s.
  nSetsFound: number
  nHintsUsed: number
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players and the table's tiles keyed by id (plans/seat-view.md). There is
 * no seat rule: every row and count is public in both modes.
 *
 * gd:
 *   id
 *   gametype
 *   brand
 *   club: {handle}
 *   mode
 *   coop
 *   compete
 *   title
 *   setup
 *   setupRows
 *   board:                                   # the one table, shared in both modes
 *     tiles: [tile, …]                       # in slot order: a tile's place and its key letter
 *     tilesById
 *   nTilesInDeck                             # the tiles still to be dealt
 *   team: {nSetsFound, nHintsUsed}           # null in compete
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # every row, every player's
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {nSetsFound, nTilesInDeck, nHintsUsed}   # the team's in coop, mine in compete
 *
 * player:
 *   the common player
 *   nSetsFound                               # own, in every mode
 *   nHintsUsed                               # own
 *
 * tile:                                      # GTile
 *   id                                       # "3121": count, color, fill, shape
 *
 * event:
 *   id
 *   by
 *   kind                                     # claim / hint
 *   tiles: [tile, …]                         # a claim's three, a hint's one to three
 *   boardAfter: [tile, …]                    # the table right after
 *   tookTurn
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the table's tiles
 * keyed by id, the setup rows built and the state line decided. Read-only:
 * `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'board' | 'turns' | 'ending' | 'events' | 'players'> & {
  board: {
    tiles: GTile[]
    // The same tiles, keyed by id.
    tilesById: Record<string, GTile>
  }
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
  events: GEvent[]
  ending: {
    reason: NonNullable<GGameDataRaw['ending']>['reason']
    detail: string
    by: GPlayer | null
    winner: GPlayer | null
  } | null
  // The players in seat order, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object.
  me: GPlayer
  stateLineData: GStateLineData
}

/** A player as `gd` holds them: nothing of theirs is withheld or relinked. */
export type GPlayer = GPlayerRaw

export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who did it.
  by: GPlayer
}

export type GHistoryView = {
  // A past turn is open on the board (`viewedEventId` is set): the board takes
  // no pick while it is.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The table as it stood just after the viewed turn, or null when live.
  tiles: GTile[] | null
  // The viewed turn's own tiles, ringed; empty when live.
  litTiles: GTile[]
  // The banner's words for the viewed turn, or null when live.
  label: string | null
}

export type GActions = {
  // Each key is spelled as its action's id (`act-restart` → `actRestart`), so
  // a grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Deal THIS deck again from the top — the same game, everything the players
  // did wiped.
  actRestart: Action
  // A fresh shuffle, with this game's setup, players and mode.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden in coop.
  actConcede: Action
  // The whole table stops, with no result.
  actStopGame: Action
  // Print the game's log.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

export type GSetupValues = CoopTurnSetup & {
  timer: TimerMode
  // Which deck to play with: the full 81 tiles, or **junior** — the fill
  // dropped, so every tile is solid, 27 tiles, dealt nine at a time. This is
  // the difficulty dial every other game has in some form. Dropping an
  // attribute is the real Set Junior's own idea, and it is a genuinely
  // different game to scan rather than a slower version of the same one.
  deck: GDeckKind
  // The palette. `traditional` is Set's own red / green / purple;
  // `colorblind` swaps in blue / orange / magenta, which stay separable under
  // red-green color vision deficiency (~8% of men).
  //
  // It matters more here than the same option would in most games, because
  // two tiles can differ ONLY by color — the other three attributes are
  // identical on them, so shape and fill cannot rescue a pair you can't tell
  // apart.
  //
  // A PER-GAME choice, so a mixed table has to agree on one. The property it
  // really tracks belongs to a PLAYER, not a game; if that ever bites, the
  // answer is a profile preference rather than a second setup field.
  palette: GPalette
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds. */
export type GSetup = SetupOf<GSetupValues>

/**
 * `common.games.summary_data`, as `setgame._rebuild_data_cols` writes it
 * (supabase/sql/setgame.sql): the common part, and setgame's keys beside it.
 * Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written.
 *
 * `team` is the same group `game_data` carries, null in compete.
 * `nTableSetsFound` is the sets the whole table has taken, in both modes — the
 * one count the club card reads.
 * `perfectClear` is a coop win that left the table empty, null unless a coop
 * win. `winnerIds` is every player ranked first — a tie is an ordinary result
 * here — and `nWinnerSets` the sets they share; both null in coop, or with no
 * winner.
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  nTableSetsFound: number
  nTilesInDeck: number
  perfectClear: boolean | null
  winnerIds: string[] | null
  nWinnerSets: number | null
}
