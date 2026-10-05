// cs-blessed-codenamesduet

import type { GClueEvent, GEvent, GGuessEvent, GPuzzleTile } from '../types'

/** Every clue given, in the order given. */
export function cluesOf(events: ReadonlyArray<GEvent>): GClueEvent[] {
  return events.filter((e): e is GClueEvent => e.kind === 'clue')
}

/** Every guess, in the order made, each with the word on its tile. */
export function guessesOf(
  events: ReadonlyArray<GEvent>,
  tilesById: ReadonlyMap<string, GPuzzleTile>,
): GGuessEvent[] {
  return events
    .filter((e) => e.kind === 'guess')
    .map((e) => ({ ...e, word: tilesById.get(e.tileId!)!.word }) as GGuessEvent)
}

/**
 * Whether a turn was played in sudden death: past the game's turn budget.
 * Every such turn holds no clue and at most one guess. Derived rather than
 * stored — the budget and the turn number already say it.
 */
export function isSuddenDeathTurn(turnNum: number, maxTurns: number): boolean {
  return turnNum > maxTurns
}
