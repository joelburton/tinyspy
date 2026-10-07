// cs-unmet

import { runRpc } from '../supabase/dbResult'
import type { Envelope } from '../supabase/envelope'
import type { EndingLabel } from '../ending/endingLabel'
import type { GameManifest, GameStopResult } from './gameManifest'

/**
 * The one view of a game's `db` handle that `Manifest` needs: calling
 * `submit_timeout` and `stop_game` with a game id. Every game's
 * `supabase.schema('<game>')` satisfies it, since every schema defines both.
 *
 * Both halves of the awaited result are needed, not just `error`: on a 2xx the
 * ENVELOPE arrives in `data`, and reading it is `runRpc`'s whole job.
 */
export type ManifestDb = {
  rpc: (
    fn: 'submit_timeout' | 'stop_game',
    args: { p_game_id: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

/**
 * **What every game's manifest is built on.** A game's `manifest.ts` extends
 * it in up to two levels and creates each leaf once:
 *
 *     Manifest                        every game: the RPCs and helpers below
 *       PsychicnumManifest            what both modes share (abstract)
 *         PsychicnumCoopManifest      what one mode says
 *
 *     export const psychicnumCoopManifest = new PsychicnumCoopManifest()
 *
 * That instance is the manifest: `src/gametypes.ts` lists it, and the shell
 * calls its members as `manifest.stopGame(id)`. A single-mode game has no
 * middle level. Each member's contract is documented on `GameManifest`.
 *
 * **Three things TypeScript asks of a subclass**, each a compile error when
 * missed:
 *
 *   - A field whose type is a literal is `readonly` or annotated. A class field
 *     takes its type from its initializer, not from the member it fills, so
 *     `mode = 'coop'` is a `string`; write `readonly mode = 'coop'` and
 *     `numberOfPlayers: [number, number] = [1, 6]`.
 *   - Method parameters are typed.
 *   - A middle level's field cannot read `this.mode` in its initializer: the
 *     leaf's fields are set after it. What varies by mode is a method, which
 *     reads `this.mode` when called, or a field in the leaf.
 *
 * Call members on the manifest. A method taken off it and called later
 * (`const { stopGame } = manifest`) has lost `this`.
 */
export abstract class Manifest implements GameManifest {
  abstract readonly gametype: GameManifest['gametype']
  abstract readonly schema: GameManifest['schema']
  abstract readonly baseGametype: GameManifest['baseGametype']
  abstract readonly mode: GameManifest['mode']
  abstract readonly draftsOffTurn: GameManifest['draftsOffTurn']
  abstract readonly name: GameManifest['name']
  abstract readonly shortDescription: GameManifest['shortDescription']
  abstract readonly logoUrl: GameManifest['logoUrl']
  abstract readonly help: GameManifest['help']
  abstract readonly scratchpad: GameManifest['scratchpad']
  abstract readonly numberOfPlayers: GameManifest['numberOfPlayers']
  abstract readonly PlayArea: GameManifest['PlayArea']
  abstract readonly setupForm: GameManifest['setupForm']

  // Optional, so not abstract: an abstract member binds every leaf, and only a
  // compete leaf with an AI opponent declares it.
  declare readonly aiOpponent?: GameManifest['aiOpponent']

  abstract startGameInClub(
    ...args: Parameters<GameManifest['startGameInClub']>
  ): ReturnType<GameManifest['startGameInClub']>

  abstract summaryFor(
    ...args: Parameters<GameManifest['summaryFor']>
  ): ReturnType<GameManifest['summaryFor']>

  // The game's own schema handle (`import { db } from './db'`).
  protected abstract readonly db: ManifestDb

  /**
   * End the game on its countdown, through the game's `submit_timeout`.
   *
   * Every connected client fires it on the same countdown edge, so all but one
   * get PN486, a race. This hands that envelope up like any other; GamePage
   * decides to swallow it.
   */
  submitTimeout(gameId: string): Promise<Envelope<GameStopResult>> {
    return runRpc<GameStopResult>(this.db.rpc('submit_timeout', { p_game_id: gameId }))
  }

  /** Stop the game now, through the game's `stop_game`. */
  stopGame(gameId: string): Promise<Envelope<GameStopResult>> {
    return runRpc<GameStopResult>(this.db.rpc('stop_game', { p_game_id: gameId }))
  }

  /**
   * An ending label as a club line leads with it: the word, then its detail in
   * parentheses when it has one ("Lost (out of guesses)").
   */
  protected makeLead(endingLabel: EndingLabel): string {
    return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
  }
}
