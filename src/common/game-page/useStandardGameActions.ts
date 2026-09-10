// cs-unmet

import type { DbError } from '../supabase/dbEnvelope'
import type { GenericFeedbackMsg } from '../feedback/genericFeedback'
import type { GameStopResult } from '../manifest/gameManifest'
import { getNotOkFeedback } from '../feedback/genericPills'
import { runRpc } from '../supabase/dbResult'
import { useBoundAction, type ActionState, type BoundAction } from '../actions/useBoundAction'
import { reportUnhandled } from '../supabase/dbEnvelope'

/** The three exits every game offers some combination of, as bound actions —
 *  hand each straight to a menu list or an `<ActionButton>`. */
export type StandardGameActions = {
  actEndGame: BoundAction
  actConcede: BoundAction
  actRestart: BoundAction
}

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
 * End, Concede and Restart, bound for this game — the three exits whose only
 * per-game part is which `db` they call and where a failure is shown.
 *
 * Every game calls this and places what it wants: coop shows End, a race shows
 * Concede, and a game that offers neither simply doesn't put them anywhere. The
 * actions themselves say when they apply, so a caller never asks — End is
 * hidden in a race unless the game opts in, Concede is hidden outside one, and
 * both go disabled once the game is over.
 *
 * The genuinely per-game bits stay callbacks:
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
 * the per-game `createGame` it would need. Each game binds `act-new-game` itself.
 *
 * Nothing here asks a confirmation: each action's question lives in the registry
 * and the shared run asks it, mid-game only.
 */
export function useStandardGameActions({
  db,
  gameId,
  isTerminal,
  mode,
  myConceded,
  offerEndInCompete,
  showError,
  onRestarted,
}: {
  db: GameRpcClient
  gameId: string
  isTerminal: boolean
  /** Which exit this game's mode offers: coop ends, a race concedes. */
  mode: 'coop' | 'compete'
  /** Compete: I've conceded (so I can't concede again). Always false in coop. */
  myConceded: boolean
  /**
   * Compete: ALSO offer the whole-table End beneath Concede. They're different
   * acts — conceding is a loss on your record and it takes every player doing it
   * to close a game the group has simply lost interest in; ending is the group
   * agreeing there's no result. Opt-in per game: every schema defines
   * `end_game`, but most races have no use for a whole-table stop.
   */
  offerEndInCompete?: boolean

  /** The game's local-feedback sink. Receives the full classified message so
   *  tone and fault styling survive the trip (see the docstring above). */
  showError: (msg: GenericFeedbackMsg) => void
  /** Optional post-restart cleanup (wordle/waffle re-hide the answer, etc.). */
  onRestarted?: () => void
}): StandardGameActions {
  // End — the coop exit, and the opt-in second exit in a race. Irreversible,
  // so the registry gives it the confirm; the shared run asks.
  const actEndGame = useBoundAction('act-end-game', {
    terminal: isTerminal,
    describe: (): ActionState => {
      if (mode === 'compete' && !offerEndInCompete) return 'hidden'
      return isTerminal ? 'disabled' : 'active'
    },
    run: async () => {
      const res = await runRpc<GameStopResult>(db.rpc('end_game', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // The one race is `isTerminal` losing to the subscription that feeds
        // it: somebody else stopped the game while the confirm was open.
        showError({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
      } else if (res.type === 'ok' && res.data?.result === 'ended') {
        // Nothing to do: the terminal arrives by subscription.
      } else {
        reportUnhandled('end_game', res)
      }
    },
  })

  // Concede — a real loss for the conceder; the others keep racing.
  const actConcede = useBoundAction('act-concede', {
    terminal: isTerminal,
    describe: (): ActionState => {
      if (mode !== 'compete') return 'hidden'
      return isTerminal || myConceded ? 'disabled' : 'active'
    },
    run: async () => {
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
        reportUnhandled('concede', res)
      }
    },
  })

  // Restart — restart THIS board for everyone. The reset arrives via each
  // game's realtime refetch (the RPC's games touch). A replayed board is a
  // perfectly legal thing to replay again, so it stays offered at terminal;
  // the shared run's single flight is what stops a second wipe landing on a
  // board someone has already started guessing on.
  const actRestart = useBoundAction('act-restart', {
    terminal: isTerminal,
    describe: (): ActionState => 'active',
    run: async () => {
      const res = await runRpc<ReplayResult>(db.rpc('replay_board', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // The one race here is the game having been deleted out from under the
        // page — a club member tidying the list while you had it open.
        showError({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
      } else if (res.type === 'ok' && res.data?.result === 'replayed') {
        // The fresh board arrives by subscription; this is the game's own
        // post-replay cleanup (wordle/waffle re-hide the answer).
        onRestarted?.()
      } else {
        reportUnhandled('replay_board', res)
      }
    },
  })

  return { actEndGame, actConcede, actRestart }
}
