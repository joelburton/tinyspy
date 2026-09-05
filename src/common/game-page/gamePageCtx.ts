// cs-blessed-game-lib

import type { Session } from '@supabase/supabase-js'
import type { GamePlayer } from '../members/member'
import type { GenericFeedbackApi } from '../feedback/genericFeedback'
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
 * game and playing one are different moments with different audiences
 * (plans/areas/game-lib.md → `F-game-lib-12`).
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
  // connections's puzzle date, …), the same string GamePage shows in the
  // header and the club list. Threaded through so a PlayArea can name the
  // specific game (e.g. on a printout).
  title: string
  // Everyone in this game's `common.game_players`. See
  // [Member] for why this is `players` (game context) and
  // not `members` (club context). A [GamePlayer] carries the
  // per-player `conceded` / `result` bits on top of the profile.
  players: GamePlayer[]
  // Gametype-specific play_state string from
  // `common.games.play_state`. Pair with `isTerminal` for the
  // gate; use the string itself for specific banner copy. See
  // docs/states.md.
  playState: string
  // Materialized "any terminal play_state" from
  // `common.games.is_terminal`.
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
  // Turn-order gate for the opt-in turn-by-turn coop mode. True when
  // the viewer may act right now — ALWAYS true for free-for-all games
  // (the default) and solo, so a game that doesn't opt in is
  // unaffected. A turn game AND-s this into its existing input gate
  // (canGuess/readOnly/…). Derived once in `useCommonGame`.
  isMyTurn: boolean
  // Whose turn it is (`common.games.current_turn_user_id`), or null
  // for a free-for-all game. Turn games pass it to `<TurnStatusLine>`
  // to render "Your turn" / "Waiting for ● Name…"; free-for-all games
  // ignore it.
  currentTurnUserId: string | null
  // The game's setup blob from `common.games.setup` — the
  // choices the SetupGameModal collected at start. Typed as
  // `Record<string, unknown>` here because each gametype's
  // shape is different; per-game PlayAreas cast to their own
  // setup type (`as CodenamesduetSetup`, `as ConnectionsSetup`, etc.)
  // on access. Read-only at this level — setup is fixed at
  // game-creation time.
  setup: Record<string, unknown>
  // The game's live `common.games.status` jsonb — the per-
  // gametype "where is this game now" snapshot maintained by
  // each state-transition RPC (the duplicate-write discipline; see
  // docs/common.md → `common.update_state`). Typed as `Record<string, unknown> | null`
  // here because each gametype writes its own shape; per-game
  // PlayAreas cast to their own status type on access. Reflects
  // the latest value seen by `useCommonGame`'s realtime
  // subscription — updates in place as RPCs land.
  //
  // **Load-bearing across the roster, not a spare channel.** The settled
  // convention is `status.leaderboard` — a per-player array each compete
  // game's RPCs rewrite on every accepted move, which that game's PlayArea
  // reads for its OpponentStrip. Most of the compete games do this. Anything
  // changing how this field is fetched or delivered affects them all.
  status: Record<string, unknown> | null
  // Imperative API for the GLOBAL feedback area (the GamePage-header
  // slot — peer/opponent news, per the feedback naming convention in
  // docs/code-conventions.md). The PlayArea calls
  // `globalFeedback.show({...})` to surface transient or persistent
  // feedback in the `<PageHeaderStatusSlot>` (replacing the default
  // `<PageHeaderPlayersStrip>` while active); `globalFeedback.clear()` empties
  // the slot. See docs/ui.md → Feedback pill for the API + dismiss-mode
  // semantics. The functions' identities are stable across renders, so
  // they're safe to put in dep arrays.
  globalFeedback: GenericFeedbackApi
  // Navigate to this game's club page directly — no suspend-
  // confirm modal. Wired by `<GamePage>` to use the resolved
  // `club_handle` for terminal-game navigation; downstream
  // consumers (the PlayArea terminal action row's "Back to club"
  // button) call it without re-deriving the URL. Identity is stable
  // across renders. Only valid to call when the game is terminal —
  // for non-terminal back-to-club, use the menu (which fires the
  // suspend-confirm flow).
  goToClub: () => void
  // The club this game belongs to (`common.games.club_handle`) —
  // so a PlayArea can start a FOLLOW-UP game in the same club
  // (waffle's "New game" menu item: same setup, fresh board,
  // new game id).
  clubHandle: string
  // Navigate to another game's page (`/g/<gametype>/<gameId>`) —
  // the follow-up-game companion to `goToClub`: after a PlayArea
  // starts a new game (see `clubHandle`), this jumps the creator
  // into it. Peers arrive via the game-invitation toast, as with
  // any new game. Identity is stable across renders.
  goToGame: (gametype: string, gameId: string) => void
  // Imperative API for the GamePage menu (the dropdown opened from
  // the game logo). The PlayArea owns its WHOLE menu — it calls
  // `menu.setGameSections([...])` (usually via the `buildGameMenu`
  // helper), and uses `menu.openHelp` / `menu.requestBackToClub` for
  // the two shell actions. See docs/ui.md → GamePage menu for the
  // placement + activation contract. Identity is stable across renders.
  menu: MenuApi
}
