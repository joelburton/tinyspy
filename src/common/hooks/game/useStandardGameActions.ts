// cs-unmet

import type { DbError } from '../../lib/supabase/dbEnvelope'
import type { GenericFeedbackMsg } from '../../lib/games'
import type { GameStopResult } from '../../lib/games'
import { getNotOkFeedback } from '../../lib/game/genericPills'
import { runRpc } from '../../lib/supabase/dbResult'
import { showFaultModal } from '../../lib/fault/faultStore'
import { useCallback, useRef } from 'react'
import { END_GAME_CONFIRM, RESTART_CONFIRM, type ConfirmOptions } from '../ui/useConfirmation'

/** The shared game-menu actions this hook owns, as fire-and-forget handlers.
 *  A game wires these into its own `actionsRef` alongside any game-specific
 *  actions (e.g. waffle/wordle's Reveal), and hands them to its InfoCol. */
export type StandardGameActions = {
  endGame: () => void
  concede: () => void
  restart: () => void
}

/** The concede confirm — one sentence, shared (the games only trivially varied
 *  "others" vs "rest"; normalized here). Concede is compete-only. Exported for
 *  bananagrams, which owns its own concede handler (its per-player concede
 *  predates this hook) but must ask the same question. */
export const CONCEDE_CONFIRM = 'Concede the game? You drop out and the others keep playing.'

/** The minimal slice of a schema-scoped client this hook calls. Typing it this
 *  narrowly (rather than the full generated client) lets every game pass its own
 *  `db` without the per-schema union getting in the way. */
type GameRpcClient = {
  rpc: (
    fn: 'end_game' | 'concede' | 'replay_board',
    args: { target_game: string },
  ) => PromiseLike<{ data: unknown; error: DbError; status?: number; statusText?: string }>
}

/** `concede` has ONE ok: you dropped out. Whether that also ended the game is
 *  not in the answer — the terminal reaches every client by subscription, this
 *  one included, so there is nothing here for the conceder to act on. */
type ConcedeResult = { result: 'conceded' }

/** `replay_board` has ONE ok: the board was dealt again. */
type ReplayResult = { result: 'replayed' }

/**
 * The End / Concede / Replay handlers shared by twelve games (spellingbee,
 * wordwheel, wordiply, boggle, waffle, wordle, psychicnum, stackdown, scrabble,
 * connections, strands, letterboxed). Their PlayAreas
 * each hand-rolled the same three handlers (byte-identical modulo the
 * schema-scoped `db`); this owns the one copy. The genuinely per-game bits stay
 * callbacks/params, so no deliberate difference is flattened:
 *   - `showError` is the game's own local-feedback sink (`useLocalFeedback`'s
 *      `showLocalFeedback`, whatever the game names it). The hook hands it a
 *      fully-built `GenericFeedbackMsg`, so a failure keeps everything the
 *      classifier decided: an expected race is a pill in its copy's tone
 *      ("Game over" as info), and a FAULT keeps the bare-red look + manual
 *      dismissal that a string could not carry;
 *   - `onRestarted` runs a game's post-replay cleanup (wordle/waffle re-hide the
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
  showError,
  onRestarted,
}: {
  db: GameRpcClient
  gameId: string
  isTerminal: boolean
  /** Compete: I've conceded (so I can't concede again). Always false in coop. */
  myConceded: boolean
  /** The styled end-game confirm (a game's `useConfirmation().confirm`). */
  confirm: (opts: ConfirmOptions) => Promise<boolean>

  /** The game's local-feedback sink. Receives the full classified message so
   *  tone and fault styling survive the trip (see the docstring above). */
  showError: (msg: GenericFeedbackMsg) => void
  /** Optional post-restart cleanup (wordle/waffle re-hide the answer, etc.). */
  onRestarted?: () => void
}): StandardGameActions {
  // End (coop's neutral mutual stop / any-mode manual end) — irreversible, so
  // it's confirmed through the styled modal.
  const endGame = useCallback(() => {
    void (async () => {
      if (isTerminal) return
      if (!(await confirm(END_GAME_CONFIRM))) return
      const res = await runRpc<GameStopResult>(db.rpc('end_game', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // The one race is `isTerminal` losing to the subscription that feeds
        // it: somebody else stopped the game while the confirm was open.
        showError({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
      } else if (res.type === 'ok' && res.data?.result === 'ended') {
        // Nothing to do: the terminal arrives by subscription.
      } else {
        showFaultModal({ text: 'BUG: end_game fell through to unhandled' })
      }
    })()
  }, [db, gameId, isTerminal, confirm, showError])

  // Concede (compete) — a real loss for the conceder; the others keep racing.
  const concede = useCallback(() => {
    void (async () => {
      if (isTerminal || myConceded) return
      if (!window.confirm(CONCEDE_CONFIRM)) return
      const res = await runRpc<ConcedeResult>(db.rpc('concede', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // Both races reachable here are the two gates above losing to the
        // subscription that feeds them: the game ended, or this player already
        // conceded. Sticky — a drop-out that did not happen is worth reading.
        showError({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
      } else if (res.type === 'ok' && res.data?.result === 'conceded') {
        // Nothing to do here. The conceded flag, the roster the others see, and
        // a terminal if this was the last racer all arrive by subscription.
      } else {
        showFaultModal({ text: 'BUG: concede fell through to unhandled' })
      }
    })()
  }, [db, gameId, isTerminal, myConceded, showError])

  /**
   * Restart is in flight — drop a second click rather than firing a second
   * `replay_board`.
   *
   * Why this needs a guard and the other two don't: `isTerminal` / `myConceded`
   * already stop a double End / Concede once the first RPC lands, and a second
   * call that beats the round trip just errors harmlessly ("game is not
   * active"). Replay has no such state — a replayed board is a perfectly legal
   * thing to replay again — so a double-click genuinely runs it twice, and the
   * second wipe can land *after* someone has started guessing on the fresh
   * board. At terminal there's no confirm to slow the second click down either.
   *
   * A ref, not state: this gates an event handler and drives no UI, so it must
   * not re-render (and must be readable synchronously by the very next click —
   * a state update wouldn't have committed yet). Same pattern the games use for
   * their own submit handlers.
   */
  const restarting = useRef(false)

  // Restart — restart THIS board for everyone. Confirmed MID-GAME only (it
  // wipes the group's progress); at terminal there's nothing left to lose. The
  // reset arrives via each game's realtime refetch (the RPC's games touch).
  //
  // The mid-game question goes through the styled modal now (2026-08-03) — it
  // was one of the legacy `window.confirm` calls docs/ui.md flagged to migrate
  // when touched, and this is the touch: Restart became reachable in all
  // thirteen games, so the destructive one deserved a real dialog with a named
  // confirm button rather than a browser alert with an "OK".
  const restart = useCallback(() => {
    void (async () => {
      // Checked BEFORE the confirm so a second click during the round trip is
      // dropped silently rather than re-prompting.
      if (restarting.current) return
      if (!isTerminal && !(await confirm(RESTART_CONFIRM))) return
      restarting.current = true
      try {
        const res = await runRpc<ReplayResult>(db.rpc('replay_board', { target_game: gameId }))
        if (res.type === 'not-ok') {
          // The one race here is the game having been deleted out from under
          // the page — a club member tidying the list while you had it open.
          showError({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
        } else if (res.type === 'ok' && res.data?.result === 'replayed') {
          // The fresh board arrives by subscription; this is the game's own
          // post-replay cleanup (wordle/waffle re-hide the answer).
          onRestarted?.()
        } else {
          showFaultModal({ text: 'BUG: replay_board fell through to unhandled' })
        }
      } finally {
        // Cleared on every path — a failed replay must stay retryable.
        restarting.current = false
      }
    })()
  }, [db, gameId, isTerminal, confirm, showError, onRestarted])

  return { endGame, concede, restart }
}
