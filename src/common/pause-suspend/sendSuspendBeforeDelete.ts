// cs-unmet

import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'

/** The suspend broadcast: every other peer goes back to the club page on
 *  receipt. No sender: leaving together is the whole message. */
export type SuspendEvent = { type: 'suspend' }

/**
 * Sends the suspend broadcast into a game's room from outside it, so anyone on
 * that game's page goes back to the club before the game is deleted.
 *
 * It joins `game:<id>` — the room's stable name, so the same teardown race as
 * `useCommonGame` applies, and a room still leaving is waited out first
 * (channelTeardown.ts) — sends, and leaves at once.
 *
 * **It never blocks the delete.** The broadcast is friendliness, not
 * correctness: a peer handles a vanished game. So it waits only until the
 * channel reaches a final status, or one second if none comes, and a wedged
 * Realtime connection costs the broadcast rather than leaving the delete on
 * "Deleting…". When it did send, it pauses a moment so the peers have left
 * before their game's row disappears.
 */
export async function sendSuspendBeforeDelete(gameId: string): Promise<void> {
  const room = `game:${gameId}`
  await (channelLeaving(room) ?? Promise.resolve())
  const ch = supabase.channel(room)

  const isSubscribed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve(true)
      } else if (
        status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
      ) {
        clearTimeout(timer)
        resolve(false)
      }
    })
  })

  if (isSubscribed) {
    const event: SuspendEvent = { type: 'suspend' }
    await ch.send({ type: 'broadcast', event: 'suspend', payload: event })
  }
  void releaseChannel(ch)
  if (isSubscribed) await new Promise((r) => setTimeout(r, 150))
}
