// cs-blessed-pause-suspend

import type { GamePlayer, Member } from '../members/member'

/**
 * Answers "is this game paused because somebody is missing?" — the presence
 * half of a pause, which `useCommonGame` then unions with the manual one.
 *
 * Pass the user ids realtime reports as connected on the game's channel, and
 * the players expected on it. Who is expected is the CALLER's call, and it is
 * this game's roster rather than the club's: a club of five can be playing a
 * two-player game, and the club list would report three people missing forever.
 * Who exactly is missing is not answered here — the overlay draws the whole
 * roster and marks each player present or away itself.
 *
 * Two edge cases the test pins, both of which show up in front of players: an
 * empty roster is NOT everyone missing (a fresh mount has no roster for a tick,
 * and would otherwise flash the overlay), and an id on the channel that is on
 * no roster is nobody (it can make the game neither more nor less paused).
 *
 * Paused is the transient gameplay stop — the clock stops, no moves are taken,
 * the overlay stands in for the board. It is not "suspended", which is about
 * whether the club is still looking at this game at all; docs/states.md →
 * paused defines both words and is the only place that does.
 */
export function computePause(presentUserIds: Set<string>, players: Member[]): boolean {
  return players.length > 0 && players.some((m) => !presentUserIds.has(m.user_id))
}

/** The game page's pause, worked out: who it waits for, who paused it by
 *  hand, and whether it is paused. */
export type GamePauseState = {
  stillPlayingHumanPlayers: GamePlayer[]
  manuallyPausedBy: Member | null
  paused: boolean
}

/**
 * The whole pause for a game page: the presence half (`computePause`) over the
 * players it waits for, unioned with a manual pause, and nothing at all once
 * the game has ended.
 *
 * **Who it waits for** is `stillPlayingHumanPlayers`: the players who have not
 * ended, minus the bots. A player who conceded or is otherwise done must not
 * wedge everyone else behind "Waiting for <name>…" when they close the tab; an
 * invited player who has not opened the game yet still counts, on purpose. A
 * bot holds a seat but never opens a tab, so counting it would park every game
 * with one behind the overlay forever. The filter is here rather than inside
 * `computePause` because the overlay draws its present and absent dots from
 * this same list, and a bot on it would be a ring that never fills.
 *
 * **Who paused it** resolves the manual pauser's id to a member. A club member
 * watching without having joined is not in `players`, so they resolve to a
 * nameless stand-in ("Someone paused") rather than nothing — otherwise Pause
 * would be a dead control for a non-player.
 *
 * **Never paused once the game has ended**, so `PauseBoundary` remounts the
 * play surface to show the result; a game that ends during a pause would
 * otherwise leave the overlay up over a finished game.
 */
export function computeGamePause({
  players,
  presentUserIds,
  manuallyPausedById,
  isGameEnded,
}: {
  players: GamePlayer[]
  presentUserIds: Set<string>
  manuallyPausedById: string | null
  isGameEnded: boolean
}): GamePauseState {
  const stillPlayingHumanPlayers = players.filter(
    (p) => p.player_ended_at === null && !p.ai_member,
  )
  const manuallyPausedBy: Member | null = manuallyPausedById === null
    ? null
    : players.find((m) => m.user_id === manuallyPausedById)
      ?? { user_id: manuallyPausedById, username: 'Someone', color: '' }
  const presencePaused = computePause(presentUserIds, stillPlayingHumanPlayers)
  const paused = (presencePaused || manuallyPausedBy !== null) && !isGameEnded
  return { stillPlayingHumanPlayers, manuallyPausedBy, paused }
}

/** Whether the game is paused, and the controls: what the header's Pause
 *  button and the pause overlay draw from. How it is worked out is
 *  `computeGamePause`'s. */
export type GamePause = {
  // Somebody the game waits for is away, or somebody clicked Pause.
  paused: boolean
  // Who is connected to the game right now.
  presentUserIds: Set<string>
  // Who clicked Pause; null when nobody did.
  manuallyPausedBy: Member | null
  // Pause and resume for every peer, this tab included.
  sendManualPause: () => void
  sendManualUnpause: () => void
}
