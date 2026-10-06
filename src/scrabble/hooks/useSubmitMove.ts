// cs-unmet

import { useCallback, useMemo, useRef, useState } from 'react'
import { useMark } from '@/common/board-marks/useMark'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { cellIndex, makeCellId } from '../lib/board'
import type { evaluatePlay } from '../lib/play'
import type { GCell, GGameData, GMoveSlots, GPlacement } from '../types'

/** No cells — a mark between flashes. */
const NO_CELLS: ReadonlySet<number> = new Set()

/**
 * What the three move RPCs answer. `stale` is not here: a board that moved
 * under you is a RACE, so it arrives on the not-ok arm in the server's own
 * words ("Board changed"). `drawn` and `terminal` are kept for now; `drawn`'s
 * length is the count of new rack tiles to flash.
 */
type PlayAnswer =
  | { result: 'accepted'; drawn: string[]; version: number; terminal: boolean }
  | { result: 'invalid'; bad_words: string[] }
type SwapAnswer = { result: 'exchanged'; drawn: string[]; version: number; terminal: boolean }
type PassAnswer = { result: 'passed'; version: number; terminal: boolean }

/** A word play the board has judged legal, as `evaluatePlay` read it. */
type LegalPlay = Extract<ReturnType<typeof evaluatePlay>, { valid: true }>

/**
 * A move's trip to the server — a word, a swap, a pass — and what each
 * answer shows: the pill (`answerMessage`), the green ring on the cells a
 * word took, the red one on the new cells of a word the dictionary refused.
 * Each send runs as its action's `run`, so the action's `pending` is the
 * in-flight guard.
 *
 * **A move claims the rack before the await.** My own write can bump the
 * board's version while the RPC is still out, and the column's version effect
 * must read that as MY move — rebuild my rack — rather than an opponent's,
 * which would warn of a conflict and leave a stale claim behind for the next
 * real one. So the slots a move takes are claimed first (`takeMyMove` hands
 * them over once the move lands), and every answer that wrote nothing — a
 * refusal, the dictionary's no — gives the claim back.
 *
 * **A played word stays on the board until the blob has it**: its tiles are
 * held in `liveCells` (`clearHeldTiles` lets go once it lands), so an accepted
 * word never blinks off.
 */
export function useSubmitMove({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  // Where a move's answer, or its refusal, shows.
  localFeedbackSlot: FeedbackSlot
}): {
  // The live board with my just-played tiles held on it.
  liveCells: GCell[]
  // The cells of the word just played, ringed green.
  playedCells: ReadonlySet<number>
  // The new cells of a refused word, ringed red.
  refusedCells: ReadonlySet<number>
  // Send a legal word; true when it was played.
  sendWord: (placements: GPlacement[], play: LegalPlay, slots: GMoveSlots) => Promise<boolean>
  // Swap these slots' tiles; true when it went through.
  sendSwap: (slots: GMoveSlots, tiles: string[]) => Promise<boolean>
  sendPass: () => Promise<void>
  // The claim a landed move of mine left: its slots and how many it drew; null
  // when the move that landed was not mine.
  takeMyMove: () => { slots: GMoveSlots; nDrawn: number } | null
  clearHeldTiles: () => void
} {
  const [heldPlacements, setHeldPlacements] = useState<GPlacement[]>([])
  const [playedMark, flashPlayed] = useMark<{ cells: ReadonlySet<number> }>(WORD_ANSWER_MS)
  const [refusedMark, flashRefused] = useMark<{ cells: ReadonlySet<number> }>(WORD_ANSWER_MS)
  const myMoveRef = useRef<{ slots: GMoveSlots; nDrawn: number } | null>(null)

  const liveCells = useMemo(() => {
    if (heldPlacements.length === 0) return gd.board.cells
    const cells = [...gd.board.cells]
    for (const p of heldPlacements) {
      const id = makeCellId(p.x, p.y)
      cells[cellIndex(p.x, p.y)] = { id, tile: { id, letter: p.letter, blank: p.blank } }
    }
    return cells
  }, [gd.board.cells, heldPlacements])

  /** Claim the slots for a move about to go out; hand back how to undo it. */
  function claim(slots: GMoveSlots, nDrawn: number): () => void {
    const before = myMoveRef.current
    myMoveRef.current = { slots, nDrawn }
    return () => {
      myMoveRef.current = before
    }
  }

  async function sendWord(placements: GPlacement[], play: LegalPlay, slots: GMoveSlots) {
    // Drawn is a guess until the answer says how many came.
    const unclaim = claim(slots, placements.length)
    const words = play.words.map((w) => w.word)
    const res = await runRpc<PlayAnswer>(db.rpc('play_word', {
      p_game_id: gd.id,
      p_base_version: gd.version,
      p_placements: placements,
      p_words: words,
      p_score: play.score,
    }))
    if (res.type === 'not-ok') {
      unclaim()
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'accepted') {
      myMoveRef.current = { slots, nDrawn: res.data.drawn.length }
      setHeldPlacements(placements)
      flashPlayed({ cells: new Set(placements.map((p) => cellIndex(p.x, p.y))) })
      const { outcome, text } = answerMessage({ answerType: 'word', words, score: play.score, bingo: play.bingo })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return true
    } else if (res.type === 'ok' && res.data.result === 'invalid') {
      // The dictionary refused it — the one check this client cannot make.
      // Nothing was written, so the claim comes back.
      unclaim()
      const badWords = res.data.bad_words
      const { outcome, text } = answerMessage({ answerType: 'invalid', badWords })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      const isBad = new Set(badWords)
      const cells = new Set<number>()
      for (const w of play.words) {
        if (!isBad.has(w.word)) continue
        for (const c of w.cells) if (c.isNew) cells.add(cellIndex(c.x, c.y))
      }
      flashRefused({ cells })
      return false
    } else {
      unclaim()
      reportUnhandled('play_word', res)
      return false
    }
  }

  async function sendSwap(slots: GMoveSlots, tiles: string[]) {
    const unclaim = claim(slots, tiles.length)
    const res = await runRpc<SwapAnswer>(db.rpc('exchange_tiles', {
      p_game_id: gd.id,
      p_base_version: gd.version,
      p_rack_tiles: tiles,
    }))
    if (res.type === 'not-ok') {
      unclaim()
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'exchanged') {
      myMoveRef.current = { slots, nDrawn: res.data.drawn.length }
      const { outcome, text } = answerMessage({ answerType: 'exchange', nTiles: tiles.length })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return true
    } else {
      unclaim()
      reportUnhandled('exchange_tiles', res)
      return false
    }
  }

  async function sendPass() {
    const res = await runRpc<PassAnswer>(db.rpc('pass_turn', {
      p_game_id: gd.id,
      p_base_version: gd.version,
    }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'passed') {
      // No pill: the turn handing on is the answer, and the log has it.
      return
    } else {
      reportUnhandled('pass_turn', res)
      return
    }
  }

  const takeMyMove = useCallback(() => {
    const myMove = myMoveRef.current
    myMoveRef.current = null
    return myMove
  }, [])

  const clearHeldTiles = useCallback(() => setHeldPlacements([]), [])

  return {
    liveCells,
    playedCells: playedMark === null ? NO_CELLS : playedMark.value.cells,
    refusedCells: refusedMark === null ? NO_CELLS : refusedMark.value.cells,
    sendWord,
    sendSwap,
    sendPass,
    takeMyMove,
    clearHeldTiles,
  }
}
