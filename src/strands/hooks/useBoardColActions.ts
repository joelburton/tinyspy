// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { typeLetter } from '../lib/trace'
import type { GGameData, GTile, GTrace } from '../types'

/** No tiles — the resting value of the ambiguous-letter mark, reused so a
 *  render without one passes a stable empty list. */
const NO_TILES: GTile[] = []

/**
 * The board column's four commands, on their buttons and their keys: Submit
 * (Enter) sends the trace, ⌫ takes its last tile back, a typed letter extends
 * it (`typeLetter`, lib/trace.ts), and Hint cashes the bar. Hands back the
 * actions, `canPick` — the gate every pick asks — and the tiles a typed letter
 * matched when it matched several, ringed red for a beat.
 *
 * One trace is out at a time: Submit's run waits for `submitTrace`, and its own
 * `pending` is the in-flight guard `canPick` and Hint ask.
 *
 * ⌫ and Submit go DISABLED rather than hidden where they don't apply, so the
 * entry row keeps its slot — and a disabled action leaves its key for whoever
 * else wants it, which is how the history viewer gets Backspace.
 */
export function useBoardColActions({
  gd,
  isInteractive,
  isViewingHistory,
  trace,
  submitTrace,
  spendHint,
  localFeedbackSlot,
  moveCursorTo,
}: {
  gd: GGameData
  // The board is mine to touch right now: my move, on the live board.
  isInteractive: boolean
  isViewingHistory: boolean
  trace: GTrace
  submitTrace: (tiles: readonly GTile[]) => Promise<void>
  spendHint: () => Promise<void>
  // Where a typed letter that matches nothing says so.
  localFeedbackSlot: FeedbackSlot
  // Put the keyboard's cursor on a tile, hidden — where a submitted word or a
  // typed letter went.
  moveCursorTo: (tile: GTile) => void
}): {
  actSubmit: Action
  actDropLastCell: Action
  actHint: Action
  canPick: boolean
  ambiguousTiles: GTile[]
  clearAmbiguous: () => void
} {
  const canSubmit = isInteractive && trace.tiles.length > 0
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit ? 'active' : 'disabled'),
    run: () => {
      moveCursorTo(trace.tiles[trace.tiles.length - 1]!)
      return submitTrace(trace.tiles)
    },
  })

  // May I pick or take back a tile right now? The board responds to me, and no
  // word is with the server.
  const canPick = isInteractive && !actSubmit.pending

  const canDropLast = canPick && trace.tiles.length > 0
  const actDropLastCell = useBindAction('act-drop-last-cell', {
    describe: () => (canDropLast ? 'active' : 'disabled'),
    run: () => {
      localFeedbackSlot.dismiss()
      trace.dropLast()
    },
  })

  const [ambiguousMark, flashAmbiguous, clearAmbiguous] =
    useMark<{ tiles: GTile[] }>(AMBIGUOUS_PICK_FLASH_MS)

  // A pattern action, so it is handed whichever letter fired it.
  useBindAction('act-extend-trace', {
    describe: () => (canPick ? 'active' : 'disabled'),
    run: (key) => {
      if (!key) return
      const r = typeLetter(trace.tiles, key, gd.puzzle.tiles, trace.consumedTileIds)
      if (r.kind === 'extend') {
        // This keystroke resolved things, so any rings from a previous one stop
        // pointing.
        clearAmbiguous()
        trace.extend(r.tile)
        moveCursorTo(r.tile)
      } else if (r.kind === 'ambiguous') {
        // No message: that row IS the entry area, so a pill would hide the word
        // being built. The red rings ARE the message.
        flashAmbiguous({ tiles: r.candidates })
      } else {
        // Nothing on the board to point at, and nearly always a mistake rather
        // than a choice — so it gets words.
        localFeedbackSlot.show(
          FeedbackMessage.result(
            'lost',
            trace.tiles.length
              ? `No “${key.toUpperCase()}” next to that letter`
              : `No “${key.toUpperCase()}” left on the board`,
          ),
        )
      }
    },
  })

  // Live on an UNFILLED bar on purpose (`useSpendHint`); a hint already on the
  // board is the one state that grays it, since the board can ring only one
  // word legibly. Not turn-gated: spending a hint is a team decision, not a
  // move.
  const isHintShowing = gd.me.board.hintTiles !== null
  const actHint = useBindAction('act-hint', {
    describe: () => {
      const { hintPoints, hintCost } = gd.hintBarData
      if (!gd.me.stillPlaying || actSubmit.pending || isViewingHistory || isHintShowing) {
        return { state: 'disabled', tooltip: isHintShowing ? 'A hint is already showing' : undefined }
      }
      return hintPoints >= hintCost
        ? { state: 'active', tooltip: 'Reveal the tiles of one theme word' }
        : {
          state: 'active',
          tooltip: `Find ${hintCost - hintPoints} more valid word${hintCost - hintPoints === 1 ? '' : 's'}`,
        }
    },
    run: spendHint,
  })

  return {
    actSubmit,
    actDropLastCell,
    actHint,
    canPick,
    ambiguousTiles: ambiguousMark?.value.tiles ?? NO_TILES,
    clearAmbiguous,
  }
}
