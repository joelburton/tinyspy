// cs-unmet

import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { reportUnhandled } from '../supabase/dbEnvelope'
import { showToast, DEFAULT_TOAST_MS } from '../toasts/toastStore'
import { sendSuspendBeforeDelete } from '../pause-suspend/sendSuspendBeforeDelete'
import type { ListedGame } from './useClubGames'

/** What `common.delete_game` puts in `data`. One `ok` answer, named anyway —
 *  a branch matching merely by being `ok` would draw a second one as this. */
type DeleteAnswer = { result: 'deleted' }

/**
 * Deletes a game of the club, once its delete button has been confirmed. The
 * current game's players are sent back to the club first
 * (`sendSuspendBeforeDelete`); any other game has nobody in it.
 *
 * Both answers are toasts (club/doc.md says why). The list is not refreshed
 * here: the delete nudges `useClubGames`, which re-reads.
 *
 * **It rejects on every answer but `deleted`.** `ClubGameDeleteButton` leaves
 * "Deleting…" only when this rejects, so a not-ok or an unreadable answer
 * throws rather than stranding the button with the game still listed.
 */
export async function deleteClubGame(game: ListedGame): Promise<void> {
  if (game.isCurrent) await sendSuspendBeforeDelete(game.gameId)

  const res = await runRpc<DeleteAnswer>(
    commonDb.rpc('delete_game', { target_game: game.gameId }),
  )
  if (res.type === 'not-ok') {
    // Every severity, a fault included: the toast is what survives dismissing
    // the fault's modal. No `ms`, so it waits to be dismissed.
    showToast({ message: res.message, tone: 'error' })
    throw new Error(res.message)
  } else if (res.type === 'ok' && res.data.result === 'deleted') {
    showToast({
      message: `${game.title} deleted`,
      tone: 'success',
      ms: DEFAULT_TOAST_MS,
    })
  } else {
    reportUnhandled('delete_game', res)
    throw new Error('delete_game: unreadable answer')
  }
}
