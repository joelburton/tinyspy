import { useCallback } from 'react'
import { END_GAME_CONFIRM, type ConfirmOptions } from '../ui/useConfirmDialog'

/** The shared game-menu actions this hook owns, as fire-and-forget handlers.
 *  A game wires these into its own `actionsRef` alongside any game-specific
 *  actions (e.g. waffle/wordle's Reveal), and hands them to its InfoCol. */
export type StandardGameActions = {
  endGame: () => void
  concede: () => void
  replay: () => void
}

/** The concede confirm — one sentence, shared (the games only trivially varied
 *  "others" vs "rest"; normalized here). Concede is compete-only. */
const CONCEDE_CONFIRM = 'Concede the game? You drop out and the others keep playing.'

/** The minimal slice of a schema-scoped client this hook calls. Typing it this
 *  narrowly (rather than the full generated client) lets every game pass its own
 *  `db` without the per-schema union getting in the way. */
type GameRpcClient = {
  rpc: (
    fn: 'end_game' | 'concede' | 'replay_board',
    args: { target_game: string },
  ) => PromiseLike<{ error: { message: string } | null }>
}

/**
 * The End / Concede / Replay handlers shared by the found-words + board games
 * (spellingbee, wordwheel, wordiply, boggle, waffle, wordle). Their PlayAreas
 * each hand-rolled the same three handlers (byte-identical modulo the
 * schema-scoped `db`); this owns the one copy. The genuinely per-game bits stay
 * callbacks/params, so no deliberate difference is flattened:
 *   - `showError` formats the game's own failure pill (the games differ:
 *      `showLocalFeedback('error', m)` vs a `stickyPill` / `ownAction` pill);
 *   - `replayConfirm` is the per-game replay sentence;
 *   - `onReplayed` runs a game's post-replay cleanup (wordle/waffle re-hide the
 *      answer + leave the history view; the others pass nothing).
 *
 * **New game is NOT here.** It diverges too far to share cleanly — wordle creates
 * via a direct `create_game` RPC (no edge fn), spellingbee/wordwheel strip the
 * one-off custom letters, waffle reads its args through a click-time ref, and the
 * edge-fn name + gametype vary — so its shared shell (~4 lines) is smaller than
 * the per-game `createGame` it would need. It stays a per-game handler, wired
 * into `actionsRef` next to these three.
 *
 * Confirms preserve today's behavior: End goes through the styled modal
 * (`confirm`); Concede + Replay use `window.confirm`. (Unifying those two onto
 * the modal is a deliberate, separate follow-up — kept out so this is a pure
 * refactor.)
 *
 * Returns fire-and-forget `() => void` handlers, stable while their inputs are.
 */
export function useStandardGameActions({
  db,
  gameId,
  isTerminal,
  myConceded,
  confirm,
  replayConfirm,
  showError,
  onReplayed,
}: {
  db: GameRpcClient
  gameId: string
  isTerminal: boolean
  /** Compete: I've conceded (so I can't concede again). Always false in coop. */
  myConceded: boolean
  /** The styled end-game confirm (a game's `useConfirmDialog().confirm`). */
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  /** The per-game replay sentence shown in `window.confirm`. */
  replayConfirm: string
  /** Show a failure message as this game's own local pill. */
  showError: (message: string) => void
  /** Optional post-replay cleanup (wordle/waffle re-hide the answer, etc.). */
  onReplayed?: () => void
}): StandardGameActions {
  // End (coop's neutral mutual stop / any-mode manual end) — irreversible, so
  // it's confirmed through the styled modal.
  const endGame = useCallback(() => {
    void (async () => {
      if (isTerminal) return
      if (!(await confirm(END_GAME_CONFIRM))) return
      const { error } = await db.rpc('end_game', { target_game: gameId })
      if (error) showError(`End game failed: ${error.message}`)
    })()
  }, [db, gameId, isTerminal, confirm, showError])

  // Concede (compete) — a real loss for the conceder; the others keep racing.
  const concede = useCallback(() => {
    void (async () => {
      if (isTerminal || myConceded) return
      if (!window.confirm(CONCEDE_CONFIRM)) return
      const { error } = await db.rpc('concede', { target_game: gameId })
      if (error) showError(`Concede failed: ${error.message}`)
    })()
  }, [db, gameId, isTerminal, myConceded, showError])

  // Replay board — restart THIS board for everyone. Confirmed MID-GAME only (it
  // wipes the group's progress); at terminal there's nothing left to lose. The
  // reset arrives via each game's realtime refetch (the RPC's games touch).
  const replay = useCallback(() => {
    void (async () => {
      if (!isTerminal && !window.confirm(replayConfirm)) return
      const { error } = await db.rpc('replay_board', { target_game: gameId })
      if (error) {
        showError(`Replay failed: ${error.message}`)
        return
      }
      onReplayed?.()
    })()
  }, [db, gameId, isTerminal, replayConfirm, showError, onReplayed])

  return { endGame, concede, replay }
}
