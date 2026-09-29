// cs-blessed-game-page

import type { Session } from '@supabase/supabase-js'
import type { GamePlayer } from '../members/member'
import type { GameEnding } from '../terminal/gameEnding'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'

/**
 * What a game is HANDED while it is being played — the values `<GamePage>`
 * passes down to a game's `PlayArea`.
 *
 * Reach for this when writing anything inside a game's play surface: the
 * PlayArea itself takes it as props, and its children take slices of it. It is
 * the runtime half of the game/shell contract, and its declaration half is
 * `GameManifest` in `gameManifest.ts` next door — a game says what it is there,
 * and gets this back here.
 *
 * **Its own module because its readers are its own.** Every file that imports
 * it is a game's own component, bar `gameManifest.ts` itself — which needs the
 * type only to say `PlayArea: ComponentType<GamePageCtx>`. `GameManifest`'s
 * readers are the other population: every game's manifest and the club surfaces
 * that list them, and at the split exactly one file imported both. Declaring a
 * game and playing one are different moments with different audiences.
 */
export type GamePageCtx = {
  session: Session
  gameId: string
  // This gametype's user-facing brand name, resolved by GamePage
  // from the matched `manifest.name`. Threaded through ctx so deep
  // PlayArea children (e.g. wordle's grid aria-label) can show the
  // brand without hardcoding the string — the brand lives in exactly
  // one place, the manifest, so a fork rebrands by editing only that.
  // Most UI reads `manifest.name` directly; this is for the parts
  // buried inside a game's lazy chunk, where importing the registry
  // would defeat code-splitting.
  brand: string
  // This game instance's human title from `common.games.title` — the
  // per-gametype title-builder's output (scrabble's first three words,
  // connections' puzzle date, …), the same string GamePage shows in the
  // header and the club list. Threaded through so a PlayArea can name the
  // specific game (e.g. on a printout).
  title: string
  // Everyone in this game's `common.game_players`. See
  // [Member] for why this is `players` (game context) and
  // not `members` (club context). A [GamePlayer] carries each
  // player's ending, ranking and `player_status` on top of the profile.
  players: GamePlayer[]
  // How the game ended — its reason pair, outcome and who ended it — or null
  // while it is played (docs/states.md → How a game ends).
  ending: GameEnding | null
  // The game has ended: `ending !== null`.
  isTerminal: boolean
  // The clock, already reduced to the two things a play surface wants: the
  // number to show, and whether the countdown ran out. Produced by
  // `useGameTimer` from the gametype's `TimerMode` and the server's tick count.
  //
  //   - `displaySeconds` — **counts UP for `countup` and DOWN for
  //     `countdown`**, so it is the number to render either way, with no
  //     per-game arithmetic. A countdown floors at 0 rather than going
  //     negative, and `none` is always 0. Frozen while the game is paused or
  //     terminal, so a finished game keeps showing its final value.
  //   - `expired` — **a countdown reached zero.** Only ever true for
  //     `countdown`; a count-up clock never expires because it is not counting
  //     toward anything.
  //
  // `expired` is the TRIGGER, not the outcome: GamePage watches it and fires
  // the manifest's `submitTimeout`, which is what actually ends the game. So it
  // flips before the game is over, and a PlayArea reading it as "the game
  // ended" would be a step early — `isTerminal` above is that question.
  timer: {
    displaySeconds: number
    expired: boolean
  }
  // ─── Where I stand ───
  // Each means exactly what its formula says (docs/win-lose.md → Where a
  // player stands), and a game reads these rather than recomputing its own.
  // Derived once in `useCommonGame`.
  //
  // I'm seated in this game; a club member watching is not.
  isPlayer: boolean
  // I walked away from a race, and forfeit any win.
  isConceded: boolean
  // I'm not playing any more, for whatever reason — conceding included.
  isLocallyTerminal: boolean
  // A player, and the game still wants moves from me.
  isStillPlaying: boolean
  // This game has a turn order, fixed when it was created.
  isTurnBased: boolean
  // The turn pointer as stored (`common.games.current_turn_user_id`): a record,
  // not a claim — it outlives the game's end. Turn games pass it to
  // `<TurnStatusLine>`.
  turnHolderId: string | null
  // Still playing, and the move is mine.
  isMyTurn: boolean
  // Still playing, and the move is someone else's — the waiting message reads
  // it, and a board dims on it unless it is interactive.
  isWaitingForTurn: boolean
  // The board responds to me; a commit asks `isMyTurn`.
  isBoardInteractive: boolean
  // The game's setup blob from `common.games.setup` — the
  // choices the SetupGameModal collected at start. Typed as
  // `Record<string, unknown>` here because each gametype's
  // shape is different; per-game PlayAreas cast to their own
  // setup type (`as CodenamesduetSetup`, `as ConnectionsSetup`, etc.)
  // on access. Read-only at this level — setup is fixed at
  // game-creation time.
  setup: Record<string, unknown>
  // `common.games.game_status`: the table-facts the info column shows, a copy
  // the game's status builder writes whole at create, Restart and every move
  // (docs/common-schema.md → Title, statuses and the two dates). Each game
  // casts it to its own type; every key is always present. Each player's own
  // copy is `player_status` on `players`.
  gameStatus: Record<string, unknown>
  // `common.games.updated_at`, which every write to the row moves — and every
  // move writes it, through the status builder. A game's `useGame` takes it and
  // refetches its own tables when it changes, so this one subscription is how
  // every game learns something happened.
  commonGameUpdatedAt: string
  // The GLOBAL feedback slot — the header's `<PageHeaderStatusSlot>`, where
  // peer and opponent news shows. A PlayArea calls
  // `globalFeedbackSlot.show(FeedbackMessage.peer(…))`; a producer like
  // `usePeerFeedback` takes the slot and shows into it. One instance for
  // the life of the page, so it is safe in a dependency array.
  globalFeedbackSlot: FeedbackSlot
  // The club this game belongs to (`common.games.club_handle`) —
  // so a PlayArea can start a FOLLOW-UP game in the same club
  // (waffle's "New game" menu item: same setup, fresh board,
  // new game id).
  clubHandle: string
  // Navigate to another game's page (`/g/<gametype>/<gameId>`): after a
  // PlayArea starts a follow-up game (see `clubHandle`), this jumps the
  // creator into it. Peers arrive via the game-invitation toast, as with any
  // new game. The one navigation a game does for itself — going back to the
  // CLUB is `menu.actBackToClub`, which knows when to ask first. Identity is
  // stable across renders.
  goToGame: (gametype: string, gameId: string) => void
  // The GamePage menu (the dropdown opened from the game logo). The PlayArea
  // owns its WHOLE menu — it calls `menu.setGameSections([...])` (usually via
  // the `buildGameMenu` helper) — and the shell hands down the three rows a
  // game cannot build itself: `menu.actHelp`, `menu.actBackToClub` and
  // `menu.actChat`. See common/menu/doc.md for the placement +
  // activation contract. Identity is stable across renders.
  menu: MenuApi
}
