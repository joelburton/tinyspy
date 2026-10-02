// cs-unmet

import { useEffect, useRef } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { answerMessage } from '../lib/answer'
import type { GameData } from './useGame'

/**
 * In compete, show "X guessed a secret word" in the header slot each time an
 * opponent's count of secrets found goes up — the COUNT, never which word
 * (that stays private). Coop says nothing here: a teammate's guess is narrated
 * from the log instead.
 *
 * It reads as the HIT it is, the same as coop's line for a peer's correct
 * guess: green means "they found a word" in both modes, so the player doesn't
 * keep a compete-only color meaning.
 *
 * A delta detector over the players' counts. The first pass seeds every
 * opponent's count silently, so opening a game in progress replays no history;
 * after that, a player not seen before counts from 0. My own count is never
 * announced.
 */
export function useShowOppsFoundMessages(
  gd: GameData,
  myId: string,
  globalFeedbackSlot: FeedbackSlot,
): void {
  const foundSecretsCountSeenRef = useRef<Map<string, number>>(new Map())
  const isSeededRef = useRef(false)
  useEffect(function showOppsFoundMessages() {
    if (!gd.isCompete) return
    const seen = foundSecretsCountSeenRef.current
    if (!isSeededRef.current) {
      isSeededRef.current = true
      for (const player of gd.players) seen.set(player.id, player.foundSecretsCount)
      return
    }
    for (const player of gd.players) {
      const was = seen.get(player.id) ?? 0
      seen.set(player.id, player.foundSecretsCount)
      if (player.id === myId) continue
      if (player.foundSecretsCount <= was) continue
      // `found_peer`, not `hit_peer`: in compete a player may learn THAT an
      // opponent found a secret and never which, so the answer that names a
      // word is not reachable from here.
      const { outcome, text } = answerMessage({ answerType: 'found_peer' })
      globalFeedbackSlot.show(FeedbackMessage.peer(player, outcome, text))
    }
  }, [gd.players, gd.isCompete, myId, globalFeedbackSlot])
}
