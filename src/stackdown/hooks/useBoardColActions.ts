// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { exposedIds } from '../lib/board'
import type { GGameData, GTile } from '../types'
import type { useWordMove } from './useWordMove'

/** No tiles — the resting value of the ambiguous-tile mark, reused so a render
 *  without one passes a stable empty set. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * The board column's three commands, on their buttons and their keys: Submit
 * (Enter) sends the word, ⌫ returns its last tile, and a typed letter picks the
 * one exposed tile bearing it. Hands back the actions, `canPick` — the gate
 * every pick asks — `pickTile` for a click, and the tiles a typed letter matched
 * when it matched several, ringed red for a beat.
 *
 * One word is out at a time: Submit's run waits for `submitWord`, and its own
 * `pending` is the in-flight guard `canPick` asks.
 *
 * ⌫ and Submit go DISABLED rather than hidden where they don't apply, so the
 * entry row keeps its slot and never reflows; a control that stayed live over a
 * frozen board would be lying about what it can do.
 */
export function useBoardColActions({
  gd,
  isInteractive,
  move,
  offTileIds,
  localFeedbackSlot,
}: {
  gd: GGameData
  // The board is mine to touch right now: my move, on the live board.
  isInteractive: boolean
  // The word being built and its trip to the server.
  move: ReturnType<typeof useWordMove>
  // The tiles not drawn — cleared, or picked into the word: exactly the set the
  // exposure check needs.
  offTileIds: ReadonlySet<string>
  // Where a typed letter that matches nothing, or several, says so.
  localFeedbackSlot: FeedbackSlot
}): {
  actSubmit: Action
  actDeleteLast: Action
  canPick: boolean
  pickTile: (tile: GTile) => void
  ambiguousTileIds: ReadonlySet<string>
} {
  // A word is exactly five tiles, so that's the whole submit gate.
  const canSubmit = isInteractive && move.currentWord.tileIds.length === 5
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit ? 'active' : 'disabled'),
    run: () => move.submitWord(move.currentWord.tileIds),
  })

  // May I pick or take back a tile right now? The board responds to me, and no
  // word is with the server.
  const canPick = isInteractive && !actSubmit.pending

  /** Add a tile to the word — a click, or a typed letter that names one tile.
   *  Filling the fifth slot does NOT submit: the word waits for Submit or Enter,
   *  so a wrong fifth tile is recoverable. */
  function pickTile(tile: GTile) {
    if (!canPick) return
    move.clearFlash() // starting a new word drops any lingering word flash
    localFeedbackSlot.dismiss() // …and the previous move's result
    move.currentWord.appendTile(tile.id)
  }

  const canDelete = canPick && move.currentWord.tileIds.length > 0
  const actDeleteLast = useBindAction('act-delete-last', {
    // A word here is picked-up TILES, so this returns the last one rather than
    // erasing a letter — the registry's name would say the wrong thing.
    describe: () => ({
      state: canDelete ? 'active' : 'disabled',
      label: 'Return the last tile',
    }),
    run: () => {
      // A ⌫ click is a move like any keystroke, so it dismisses a result the
      // same way — it matters most on touch, where there is no next keystroke.
      localFeedbackSlot.dismiss()
      move.currentWord.retractTo(move.currentWord.tileIds.length - 1)
    },
  })

  const [ambiguousMark, flashTiles] = useMark<{ tileIds: ReadonlySet<string> }>(
    AMBIGUOUS_PICK_FLASH_MS,
  )

  // A letter plays the matching tile — but ONLY if exactly one exposed tile
  // bears it: the word is the pick order, so an ambiguous letter can't pick for
  // you. A pattern action, so it is handed whichever letter fired it.
  useBindAction('act-pick-tile', {
    describe: () => (canPick ? 'active' : 'disabled'),
    run: (key) => {
      const letter = (key ?? '').toUpperCase()
      // Any handled keystroke is a "next move" — dismiss the previous result.
      // The no-match / ambiguous branches below show a fresh one after this.
      localFeedbackSlot.dismiss()
      const exposed = exposedIds(gd.puzzle.tiles, offTileIds)
      const matches = gd.puzzle.tiles.filter((t) => exposed.has(t.id) && t.letter === letter)
      if (matches.length === 1) {
        pickTile(matches[0]!)
      } else if (matches.length === 0) {
        localFeedbackSlot.show(FeedbackMessage.result('lost', `No “${letter}” tile is on top`))
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles({ tileIds: new Set(matches.map((m) => m.id)) })
        localFeedbackSlot.show(
          FeedbackMessage.result('warning', `${matches.length} “${letter}” tiles are on top — click one`),
        )
      }
    },
  })

  return {
    actSubmit,
    actDeleteLast,
    canPick,
    pickTile,
    ambiguousTileIds: ambiguousMark?.value.tileIds ?? NO_TILES,
  }
}
