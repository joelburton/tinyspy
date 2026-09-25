// cs-blessed-game-page

import type { DbError } from '../supabase/dbEnvelope'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { GameStopResult } from '../manifest/gameManifest'
import { runRpc } from '../supabase/dbResult'
import { useBoundAction, type ActionState, type BoundAction } from '../actions/useBoundAction'
import { reportUnhandled } from '../supabase/dbEnvelope'

/** End, Concede and Restart as bound actions — hand each straight to a menu
 *  list or an `<ActionButton>`. */
export type StandardGameActions = {
  actEndGame: BoundAction
  actConcede: BoundAction
  actRestart: BoundAction
}

/** The minimal slice of a schema-scoped client this hook calls, so a game can
 *  pass its own `db` without the per-schema union getting in the way. */
type GameRpcClient = {
  // A METHOD taking a `string`, not `rpc: (fn: 'end_game' | …) => …`: each game's
  // client accepts only its own schema's names and those sets differ (duet, being
  // coop-only, has no `concede`). Method syntax is checked bivariantly, which is
  // what lets them all fit — as a property, the games stop compiling. The
  // three names this file passes are pinned by its test.
  rpc(
    fn: string,
    args: { target_game: string },
  ): PromiseLike<{ data: unknown; error: DbError; status?: number; statusText?: string }>
}

/** `concede` has ONE ok: you dropped out. Whether that also ended the game is
 *  not in the answer — the terminal reaches every client by subscription, this
 *  one included, so there is nothing here for the conceder to act on. */
type ConcedeResult = { result: 'conceded' }

/** `replay_board` has ONE ok: the board was dealt again. */
type ReplayResult = { result: 'replayed' }

/**
 * End, Concede and Restart, bound for this game — the actions whose only
 * per-game part is which `db` they call and where a failure is shown.
 *
 * Every game calls this and places what it wants: coop shows End, a race shows
 * Concede, and a game that offers neither simply doesn't put them anywhere. The
 * actions themselves say when they apply, so a caller never asks — End is
 * hidden in a race while you are still playing, Concede is hidden outside one
 * and once you are out, and both are hidden once the game is over (there is no
 * ending an ended game). The two share the flag and `⌥⌫`, so at most one is
 * ever on screen, and never a disabled one.
 *
 * **Every race can also stop the whole table** (Joel, 2026-09-19: *"yes, every
 * race should offer it"*): Concede's question offers ending as its second
 * answer. They are different acts — conceding is a loss on your record, and it
 * takes every player doing it to close a game the group has lost interest in;
 * ending is the group agreeing there is no result, which is neutral — and the
 * difference is subtle enough that the question explains it rather than the
 * board drawing two red buttons.
 *
 * The genuinely per-game bits:
 *   - `localFeedbackSlot` is the game's own below-board slot, where a not-ok
 *      answer is shown as `FeedbackMessage.notOk(res)` — the server's words,
 *      in the outcome the envelope carries;
 *
 * **New game is NOT here.** Creating the next game diverges per game — which
 * call makes it, and what setup it carries over — by more than the handful of
 * shared lines a binding here would save. Each game binds `act-new-game` itself.
 *
 * Nothing here asks a confirmation: each action's question lives in the registry
 * and the shared run asks it, mid-game only.
 */
export function useStandardGameActions({
  db,
  gameId,
  isTerminal,
  mode,
  isLocallyTerminal,
  localFeedbackSlot,
}: {
  db: GameRpcClient
  gameId: string
  isTerminal: boolean
  // Which exit this game's mode offers: coop ends, a race concedes.
  mode: 'coop' | 'compete'
  // I'm out of the race — conceded, lost (out of budget, eliminated), or
  // finished while the others play on. Never true in coop. The page's own
  // value (`GamePageCtx`).
  isLocallyTerminal: boolean

  // The game's below-board slot, where a not-ok answer is shown.
  localFeedbackSlot: FeedbackSlot
}): StandardGameActions {
  // Stop the whole table. The body of coop's End, and of a race's Concede's
  // second answer, so the two say the identical thing to the server and read
  // the identical answer back.
  const endForAll = async () => {
    const res = await runRpc<GameStopResult>(db.rpc('end_game', { target_game: gameId }))
    if (res.type === 'not-ok') {
      // The one race is `isTerminal` losing to the subscription that feeds it:
      // somebody else stopped the game while the question was open.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data?.result === 'ended') {
      // Nothing to do: the terminal arrives by subscription.
    } else {
      reportUnhandled('end_game', res)
    }
  }

  // End — coop's exit. A racer still playing never sees it: their way out is
  // Concede, whose question offers ending as the alternative.
  //
  // A racer who is OUT gets it on its own. Anyone in a game may end it for all
  // — ending is the group agreeing there is no result, and a player who is out
  // is still in the conversation (Joel, 2026-09-04, 2026-09-24) — but conceding
  // is closed to them (see Concede), and with it the question that carried
  // both. The two are still never live at once, which is what lets them share
  // `⌥⌫`.
  //
  // Irreversible, so the registry gives it the confirm and the shared run asks.
  const actEndGame = useBoundAction('act-end-game', {
    terminal: isTerminal,
    describe: (): ActionState => {
      if (mode === 'compete' && !isLocallyTerminal) return 'hidden'
      // HIDDEN at terminal, not disabled: there is no ending an ended game, and
      // `disabled` is for what is possible here and not right now. A conceder
      // still gets it while the others race — conceding is not ending.
      return isTerminal ? 'hidden' : 'active'
    },
    run: endForAll,
  })

  // Concede — a real loss for the conceder; the others keep racing. It is a
  // race's ONE way out while you can still play, and its question is where
  // conceding and stopping the table are told apart: `runAlternative` is the
  // body for its second answer.
  const actConcede = useBoundAction('act-concede', {
    terminal: isTerminal,
    describe: (): ActionState | { state: ActionState; label: string } => {
      if (mode !== 'compete') return 'hidden'
      // Hidden once the game is over — there is no race left to drop out of —
      // and once you are out: a conceder has conceded, a player who lost has
      // nothing to concede, and a finisher would only throw away a win they may
      // hold, without ending anything sooner for the others. End has come out
      // as its own control (above).
      if (isTerminal || isLocallyTerminal) return 'hidden'
      // Named for both answers its question offers.
      return { state: 'active', label: 'Concede / End game' }
    },
    runAlternative: endForAll,
    run: async () => {
      const res = await runRpc<ConcedeResult>(db.rpc('concede', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // Both races reachable here are the two gates above losing to the
        // subscription that feeds them: the game ended, or this player already
        // conceded. Sticky — a drop-out that did not happen is worth reading.
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
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
    // Reachable all game from the menu and its key — RESTART_CONFIRM is written
    // for exactly that ("clears everyone's progress", "Keep playing"). It gets
    // a BUTTON only at the end: mid-game the info column's few slots belong to
    // playing the game, and restarting is a thing you go looking for.
    describe: (asker): ActionState =>
      asker === 'button' && !isTerminal ? 'hidden' : 'active',
    run: async () => {
      const res = await runRpc<ReplayResult>(db.rpc('replay_board', { target_game: gameId }))
      if (res.type === 'not-ok') {
        // The one race here is the game having been deleted out from under the
        // page — a club member tidying the list while you had it open.
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
      } else if (res.type === 'ok' && res.data?.result === 'replayed') {
        // Nothing to do. The fresh board arrives by subscription, and the local
        // state of the run that just ended goes when the page remounts the play
        // surface on the new `restarts` count — on every client, not just this
        // one (common/game-page/doc.md). Eleven games used to clean up here, and
        // every one of them only tidied the presser's board.
      } else {
        reportUnhandled('replay_board', res)
      }
    },
  })

  return { actEndGame, actConcede, actRestart }
}
