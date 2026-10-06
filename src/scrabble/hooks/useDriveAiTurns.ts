// cs-unmet

import { useEffect, useRef } from 'react'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { GGameData } from '../types'

/** What `scrabble-ai-move` puts in `data`: how many turns it played, 0..40 —
 *  and 0 is common, since every client pokes and one wins. Nothing reads it;
 *  the poke is fire-and-forget. */
type AiPoked = { result: 'moved'; turns: number } | null

/**
 * Play a bot's turn when it holds one: poke the `scrabble-ai-move` edge
 * function, which plays every bot in a row until a person's turn or the end.
 * Every client at the table pokes; the RPCs it calls are guarded by the turn
 * and the version, so a second poke is a harmless no-op.
 *
 * Once per board `version`, so a bot that is thinking is not poked again; its
 * move bumps the version, which re-arms this. A poke that FAILS disarms it
 * instead, so the next render that still sees the bot on turn tries again —
 * else the version never moves and the table stalls with nothing in the logs.
 */
export function useDriveAiTurns(gd: GGameData): void {
  const isAiTurn = !gd.ended && gd.turns !== null && gd.turns.holder.aiLevel !== null
  const version = gd.version
  const gameId = gd.id
  const pokedVersionRef = useRef<number | null>(null)

  useEffect(function pokeAiMove() {
    if (!isAiTurn || pokedVersionRef.current === version) return
    pokedVersionRef.current = version
    function disarm() {
      if (pokedVersionRef.current === version) pokedVersionRef.current = null
    }
    void runEdgeFn<AiPoked>('scrabble-ai-move', { game_id: gameId }).then((res) => {
      if (res.type === 'ok' && res.data?.result === 'moved') {
        // A move bumped `version`, which re-arms this on its own.
      } else if (res.type === 'not-ok') {
        // Every one is a `BUG:`, and `runEdgeFn` has raised the modal: a stuck
        // bot should be loud.
        disarm()
        console.error('scrabble-ai-move poke failed', res.message)
      } else {
        disarm()
        reportUnhandled('scrabble-ai-move', res)
      }
    })
  }, [isAiTurn, version, gameId])
}
