// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { useBoardCursorKeys } from '@/common/board-cursor/useBoardCursorKeys'
import { moveCursor, planBackspace, type GridCursor } from '@/common/board-cursor/gridCursor'
import { askConfirmation } from '@/common/floating-panels/confirmationService'
import type { ConfirmOptions } from '@/common/floating-panels/confirmations'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { BOARD_SIZE, RACK_SIZE, cellIndex, inBounds } from '../lib/board'
import { evaluatePlay } from '../lib/play'
import type { useRackOrder } from './useRackOrder'
import type { useStagedTiles } from './useStagedTiles'
import type { useSubmitMove } from './useSubmitMove'
import type { GCell, GGameData, GPlacement, GShownMoveRaw } from '../types'

/** Pass's question. scrabble's own rather than the registry's: passing here
 *  forfeits the turn's points and feeds the blocked-end streak, which is why
 *  it asks at all. */
const PASS_CONFIRM: ConfirmOptions = {
  title: 'Pass your turn?',
  message: 'You score nothing this turn, and if every player passes in a row the game ends.',
  confirmLabel: 'Pass',
  cancelLabel: 'Keep playing',
}

/**
 * The board column's commands, each ONE action behind its control: the cursor
 * keys (an arrow moves the cursor, a letter stages a tile at it, Backspace
 * takes one back), Submit (also Enter), Recall, Shuffle, Show move, Swap and
 * Pass. What a button says about itself and what it does are the same answer,
 * and a key comes with its action.
 *
 * Two gates. `isInteractive` stages tiles — on another player's turn too,
 * since scrabble lets you lay a move out before your turn comes. `canSubmit`
 * also needs my turn: Submit, Swap and Pass spend it. A move already out grays
 * the other two through its action's `pending`.
 */
export function useBoardColActions({
  gd,
  rack,
  cells,
  cursor,
  setCursor,
  isInteractive,
  staged,
  rackOrder,
  submission,
  showMove,
  localFeedbackSlot,
}: {
  gd: GGameData
  // The rack I play from, by slot.
  rack: readonly string[]
  // The live board, with my just-played tiles on it.
  cells: GCell[]
  cursor: GridCursor
  setCursor: (cursor: GridCursor | ((cur: GridCursor) => GridCursor)) => void
  isInteractive: boolean
  staged: ReturnType<typeof useStagedTiles>
  rackOrder: ReturnType<typeof useRackOrder>
  submission: ReturnType<typeof useSubmitMove>
  showMove: (payload: GShownMoveRaw) => void
  // Where a tile I don't hold, or an illegal shape, says so.
  localFeedbackSlot: FeedbackSlot
}): {
  actSubmit: Action
  actRecallTiles: Action
  actShuffle: Action
  actShowMove: Action
  actExchange: Action
  actPass: Action
  // The staged play's score for Submit to show; 0 for a shape that is not
  // legal yet, null with nothing staged.
  submitScore: number | null
} {
  const canSubmit = isInteractive && gd.me.onTurn
  const placements: GPlacement[] = staged.tiles.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))
  const play = placements.length === 0 ? null : evaluatePlay(cells, placements)

  /** Is there a tile on this cell — played, or staged? */
  function isFilled(x: number, y: number): boolean {
    return cells[cellIndex(x, y)].tile !== null || staged.stagedAt(x, y) !== undefined
  }

  /** Stage the typed letter at the cursor — past any played tiles — and move
   *  the cursor on to the next empty cell. */
  function typeLetter(letter: string) {
    let { x, y } = cursor
    while (inBounds(x, y) && cells[cellIndex(x, y)].tile !== null) {
      if (cursor.dir === 'h') x++
      else y++
    }
    if (!inBounds(x, y)) return
    if (!staged.placeLetter(x, y, letter)) {
      localFeedbackSlot.show(FeedbackMessage.result('noted', `No “${letter.toUpperCase()}” tile`))
      return
    }
    let nx = x
    let ny = y
    do {
      if (cursor.dir === 'h') nx++
      else ny++
    } while (inBounds(nx, ny) && isFilled(nx, ny))
    setCursor(inBounds(nx, ny) ? { x: nx, y: ny, dir: cursor.dir } : { x, y, dir: cursor.dir })
  }

  function backspace() {
    const { remove, cursor: next } = planBackspace(cursor, BOARD_SIZE - 1, (x, y) => {
      if (staged.stagedAt(x, y)) return 'removable'
      return cells[cellIndex(x, y)].tile !== null ? 'locked' : 'empty'
    })
    if (remove) staged.recall(remove.x, remove.y)
    setCursor(next)
  }

  async function submitWord() {
    // An illegal shape never reaches the server; its reason is the board's
    // own sentence, a pill and not an answer.
    if (play === null) return
    if (!play.valid) {
      localFeedbackSlot.show(FeedbackMessage.result('lost', play.error))
      return
    }
    const slots = { removed: new Set(staged.tiles.map((t) => t.rackIdx)), oldLen: rack.length }
    if (await submission.sendWord(placements, play, slots)) {
      staged.recallAll()
      staged.clearPicks()
    }
  }

  async function swapTiles() {
    const slots = { removed: new Set(staged.pickedSlots), oldLen: rack.length }
    const tiles = [...staged.pickedSlots].map((i) => rack[i])
    if (await submission.sendSwap(slots, tiles)) staged.clearPicks()
  }

  async function passTurn() {
    // Asked here rather than by the registry: the question is scrabble's alone.
    if ((await askConfirmation(PASS_CONFIRM)) !== 'confirm') return
    await submission.sendPass()
  }

  /** Show my staged tiles to my teammates — one send per press; press again
   *  to show a changed move. */
  function showMoveToTeam() {
    showMove({
      placements,
      byId: gd.me.id,
      baseVersion: gd.version,
      words: play?.valid ? play.words.map((w) => w.word) : [],
      score: play?.valid ? play.score : 0,
    })
  }

  // Swap a few tiles for fresh ones — it waits for my turn, for a pick, and for
  // a bag deep enough to draw a fresh rack from. The two gates a player can do
  // something about say so in the bubble.
  const actExchange = useBindAction('act-exchange', {
    describe: () => {
      if (gd.nBagTiles < RACK_SIZE) return { state: 'disabled', label: 'Swap', tooltip: 'Need ≥ 7 tiles in the bag' }
      if (!canSubmit || staged.tiles.length > 0 || actSubmit.pending || actPass.pending) {
        return { state: 'disabled', label: 'Swap' }
      }
      if (staged.pickedSlots.size === 0) return { state: 'disabled', label: 'Swap', tooltip: 'Pick rack tiles first' }
      const n = staged.pickedSlots.size
      return { state: 'active', label: `Swap ${n} picked tile${n === 1 ? '' : 's'}` }
    },
    run: swapTiles,
  })

  // Pass — compete only (a coop table simply plays on), and only with nothing
  // staged: passing is what you do INSTEAD of a move.
  const actPass = useBindAction('act-pass', {
    describe: () => {
      if (gd.coop) return 'hidden'
      return canSubmit && staged.tiles.length === 0 && !actSubmit.pending && !actExchange.pending
        ? 'active'
        : 'disabled'
    },
    run: passTurn,
  })

  // The cursor keys, with Submit as their commit (Enter). A staged move shows
  // its score on a gray Submit until my turn comes.
  const { actCommit: actSubmit } = useBoardCursorKeys({
    enabled: isInteractive,
    commit: 'act-submit',
    canCommit: canSubmit && staged.tiles.length > 0 && !actExchange.pending && !actPass.pending,
    onArrow: (k) => setCursor((cur) => moveCursor(cur, k, BOARD_SIZE - 1)),
    onLetter: typeLetter,
    onBackspace: backspace,
    onCommit: () => void submitWord(),
  })

  // Every staged tile back to the rack at once; ⌫ takes one.
  const actRecallTiles = useBindAction('act-recall-tiles', {
    describe: () => (staged.tiles.length > 0 ? 'active' : 'disabled'),
    run: staged.recallAll,
  })

  // Live whenever there are tiles to reorder, a frozen board included:
  // rearranging your own rack is not acting on the game.
  const actShuffle = useBindAction('act-shuffle', {
    describe: () => (rackOrder.tiles.length === 0 ? 'hidden' : 'active'),
    run: rackOrder.shuffle,
  })

  // Coop with somebody to show it to, so it hides itself in a race and alone.
  const actShowMove = useBindAction('act-show-move', {
    describe: () => {
      if (!gd.coop || gd.players.length < 2) return 'hidden'
      return { state: staged.tiles.length > 0 ? 'active' : 'disabled', label: 'Show move to team' }
    },
    run: showMoveToTeam,
  })

  return {
    actSubmit,
    actRecallTiles,
    actShuffle,
    actShowMove,
    actExchange,
    actPass,
    submitScore: play === null ? null : play.valid ? play.score : 0,
  }
}
