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
 * hidden in a race unless the game opts in, Concede is hidden outside one, and
 * both are hidden once the game is over (there is no ending an ended game).
 *
 * The genuinely per-game bits:
 *   - `localFeedbackSlot` is the game's own below-board slot, where a not-ok
 *      answer is shown as `FeedbackMessage.notOk(res)` — the server's words,
 *      in the outcome the envelope carries;
 *   - `onRestarted` is for a restart a game has to tell somebody ELSE about.
 *      It is not for clearing local state: the page keys the play surface on
 *      `common.games.restarts`, so a restart already unmounts the surface on
 *      every client and takes all of it with it (game-page/doc.md). Seven games
 *      used to re-hide an answer and leave the history view here, and every one
 *      of them only half-worked — this fires on the client that pressed
 *      Restart, and nobody else's board was cleaned at all.
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
  myConceded,
  selfSolved,
  offersEndForAll,
  localFeedbackSlot,
  onRestarted,
}: {
  db: GameRpcClient
  gameId: string
  isTerminal: boolean
  // Which exit this game's mode offers: coop ends, a race concedes.
  mode: 'coop' | 'compete'
  // Compete: I've conceded (so I can't concede again). Always false in coop.
  myConceded: boolean
  // Compete: I have SOLVED it and am waiting for the others — so Concede goes
  // gray. Conceding there would silently forfeit a win already banked: the
  // winner query excludes conceded players, so "I'm done waiting" would throw
  // away the result. A solved player leaves via Back to club instead. Optional
  // because not every race HAS this state — where finishing ends the game for
  // everyone, or where there is nothing to solve, nobody can sit on a banked win.
  selfSolved?: boolean
  // Compete: this game can ALSO stop the whole table, so Concede's question
  // offers that as its second answer. They're different acts — conceding is a
  // loss on your record and it takes every player doing it to close a game the
  // group has simply lost interest in; ending is the group agreeing there's no
  // result — and the difference is subtle enough that the question explains it
  // rather than the board drawing two red buttons and hoping. Opt-in per game:
  // every schema defines `end_game`, but a race has to want a whole-table stop.
  offersEndForAll?: boolean

  // The game's below-board slot, where a not-ok answer is shown.
  localFeedbackSlot: FeedbackSlot
  // Optional: something a restart must say to the OTHER clients — connections
  // broadcasts a selection clear. Local state needs nothing here; see above.
  onRestarted?: () => void
}): StandardGameActions {
  // Stop the whole table. The body of coop's End, and — where a race offers it —
  // of Concede's second answer, so the two say the identical thing to the
  // server and read the identical answer back.
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

  // End — coop's exit. A race normally never draws it: its way out is Concede,
  // whose question offers ending as the alternative where the game has one.
  //
  // The exception is a racer who has ALREADY conceded. Choosing to end is
  // freely open to them — ending is the group agreeing there is no result, and
  // a conceder is still in the conversation (Joel, 2026-09-04) — but their
  // Concede is spent, and with it the question that carried both. So the
  // table stop comes back out on its own. The two are still never live at once,
  // which is what lets them share `⌥⌫`.
  //
  // Irreversible, so the registry gives it the confirm and the shared run asks.
  const actEndGame = useBoundAction('act-end-game', {
    terminal: isTerminal,
    describe: (): ActionState => {
      if (mode === 'compete' && !(offersEndForAll && myConceded)) return 'hidden'
      // HIDDEN at terminal, not disabled: there is no ending an ended game, and
      // `disabled` is for what is possible here and not right now. A conceder
      // still gets it while the others race — conceding is not ending.
      return isTerminal ? 'hidden' : 'active'
    },
    run: endForAll,
  })

  // Concede — a real loss for the conceder; the others keep racing. In a game
  // that can also stop the table, this is the ONE way out and its question is
  // where the two are told apart: `runAlternative` is what makes the registry
  // ask the two-answer version, so there is no flag to disagree with a body.
  const actConcede = useBoundAction('act-concede', {
    terminal: isTerminal,
    describe: (): ActionState | { state: ActionState; label: string } => {
      if (mode !== 'compete') return 'hidden'
      // Hidden once the game is over — there is no race left to drop out of.
      // Disabled, not hidden, for the two states where the race runs on without
      // you: the button says why (already conceded, or a win already banked).
      if (isTerminal) return 'hidden'
      const state: ActionState = myConceded || selfSolved ? 'disabled' : 'active'
      // Named in both branches: a row that fell back to the registry's "Concede
      // game" in one of them would rename itself as the game changed.
      return { state, label: offersEndForAll ? 'Concede / End game' : 'Concede game' }
    },
    runAlternative: offersEndForAll ? endForAll : undefined,
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
