// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import historyViewerStyles from '@/common/event-log/historyViewer.module.css'
import { positionAt } from '@/common/board-cursor/boardPosition'
import { makeBoardShape } from '../lib/boardShape'
import { useTileShuffle } from '../hooks/useTileShuffle'
import { useTileCursor } from '../hooks/useTileCursor'
import { useDecidedTileMarks } from '../hooks/useDecidedTileMarks'
import { Tile } from './Tile'
import styles from './Board.module.css'
import type { GTile, GHistoryView } from '../types'

/** What the board wears on and around its tiles. */
type BoardMarks = {
  pickedTile: GTile['word'] | null
  inFlightGuess: GTile['word'] | null
  endingOutcome: EndOutcome | null
  // A teammate holds the move.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine.
  myTurnJustStarted: boolean
}

type Props = {
  // The tiles on the board, in the puzzle's order: the live board's (in
  // compete, my guesses only), the Reveal's, or a past turn's.
  tiles: readonly GTile[]
  // How many guesses the server has recorded on this board — the cause the
  // attention flash is gated on.
  moveCount: number
  marks: BoardMarks
  // The past turn open on the board, if any.
  historyView: GHistoryView
  // The tiles take a click or a key right now. When they may is `BoardCol`'s
  // to say.
  canPick: boolean
  // The players are working one board together: `gd.oneBoard` with more than
  // one of them at it.
  isSharedBoard: boolean
  // Picks a word, or un-picks with null.
  onPick: (word: GTile['word'] | null) => void
}

/**
 * psychicnum's board: a grid of tiles, the keyboard's way around them, and
 * the Shuffle floated over its top-right.
 *
 * A guessed word's tile colors **permanently** — green if it was a secret, red
 * if not — so the board is a record of what's been found and ruled out. Once
 * the game has ended it is also the answer key, through the same tiles:
 * PlayArea folds the revealed secrets in as hits, and a revealed tile has no
 * dot. The board decides WHICH marks a tile wears; `Tile` decides how each is
 * drawn.
 */
export function Board({
  tiles,
  moveCount,
  marks,
  historyView,
  canPick,
  isSharedBoard,
  onPick,
}: Props) {
  // The display order is this client's permutation of the words; the tiles
  // are looked up by word to draw in it.
  const shuffle = useTileShuffle(tiles.map((t) => t.word))
  const tileByWord = new Map(tiles.map((t) => [t.word, t]))
  const decidedWords = new Set(tiles.filter((t) => t.correct !== null).map((t) => t.word))
  const boardShape = makeBoardShape(shuffle.tiles.length)
  const tileCursor = useTileCursor({
    displayedTiles: shuffle.tiles,
    boardShape,
    decidedWords,
    pickedTile: marks.pickedTile,
    canPick,
    onPick,
  })
  const decidedMarks = useDecidedTileMarks({
    tiles,
    moveCount,
    isViewingHistory: historyView.isViewing,
  })

  const cursorPosition =
    tileCursor.cell === null
      ? null
      : positionAt(tileCursor.cell.x, tileCursor.cell.y, boardShape.numCols)

  return (
    <div
      className={cls(shared.boardSeal, styles.board)}
      // The e2e handle for board measurement.
      data-board
      // The counts size the board (Board.module.css).
      style={{ ['--cols' as string]: boardShape.numCols, ['--rows' as string]: boardShape.numRows }}
    >
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          historyView.isViewing && historyViewerStyles.historyFrame,
          marks.isWaitingForTurn && shared.dimNotYourTurn,
          marks.myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(marks.endingOutcome, historyView.isViewing),
        )}
        style={{
          gridTemplateColumns: `repeat(${boardShape.numCols}, 1fr)`,
          gridTemplateRows: `repeat(${boardShape.numRows}, 1fr)`,
        }}
      >
        {shuffle.tiles.map((word, index) => {
          // Every displayed word is one of the board's tiles.
          const tile = tileByWord.get(word)!
          return (
            <Tile
              key={word}
              tile={tile}
              // Who guessed a tile is worth saying only where it can differ:
              // on a board the players share.
              showGuesser={isSharedBoard}
              marks={{
                isPicked: marks.pickedTile === word,
                isUnderCursor: cursorPosition === index,
                isInFlight: marks.inFlightGuess === word,
                isFlashing: decidedMarks.flashing.has(word),
                isShaking: decidedMarks.shaking.has(word),
                isHistoryLit: historyView.litWord === word,
              }}
              isDisabled={tile.correct !== null || !canPick}
              onClick={() => tileCursor.pickClicked(word)}
            />
          )
        })}
      </div>
      {/* Shuffle floats over board's top-right and stays after game ended. */}
      <ShuffleButton
        action={shuffle.actShuffle}
        tooltip="Shuffle the words"
        className={shared.floatingShuffle}
      />
    </div>
  )
}
