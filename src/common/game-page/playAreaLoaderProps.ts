// cs-blessed-game-page

import type { Session } from '@supabase/supabase-js'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'
import type { CommonGame } from './shell'

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
 * type only to say `PlayArea: ComponentType<PlayAreaLoaderProps>`. `GameManifest`'s
 * readers are the other population: every game's manifest and the club surfaces
 * that list them, and at the split exactly one file imported both. Declaring a
 * game and playing one are different moments with different audiences.
 */
export type PlayAreaLoaderProps = {
  // The game, as the page has it: its shell_data, plus me.
  cg: CommonGame
  // The game's `game_data` blob, as its status builder wrote it
  // (plans/seat-view.md → The page is written, not assembled). The game's
  // `useGame` reads it as its own `GGameDataRaw`; null until the builder has
  // written one.
  gameData: unknown
  // The signed-in user: `auth.user.id`. Their player is `cg.me`.
  auth: Session
  // The GLOBAL feedback slot — the header's `<PageHeaderStatusSlot>`, where
  // peer and opponent news shows. A PlayArea calls
  // `globalFeedbackSlot.show(FeedbackMessage.peer(…))`; a producer like
  // `useShowPeerFeedback` takes the slot and shows into it. One instance for
  // the life of the page, so it is safe in a dependency array.
  globalFeedbackSlot: FeedbackSlot
  // The GamePage menu (the dropdown opened from the game logo). The PlayArea
  // owns its WHOLE menu — it calls `menu.setGameSections([...])` (usually via
  // the `buildGameMenu` helper) — and the shell hands down the three rows a
  // game cannot build itself: `menu.actHelp`, `menu.actBackToClub` and
  // `menu.actChat`. See common/menu/doc.md for the placement +
  // activation contract. Identity is stable across renders.
  menu: MenuApi
  // Navigate to a follow-up game's page: after a PlayArea starts the next game
  // of this same gametype, this jumps the creator into it, taking only the new
  // id — the page supplies the gametype, so a game never builds one. Peers
  // arrive via the game-invitation toast, as with any new game. The one
  // navigation a game does for itself — going back to the CLUB is
  // `menu.actBackToClub`, which knows when to ask first. Identity is stable
  // across renders.
  goToFollowUpGame: (gameId: string) => void
}
