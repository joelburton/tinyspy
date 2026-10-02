// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import type { Actor } from '@/common/members/member'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import historyViewerStyles from '@/common/event-log/historyViewer.module.css'
import { positionAt } from '@/common/board-cursor/boardPosition'
import { getGuessOutcome } from '../lib/answer'
import { makeBoardShape } from '../lib/boardShape'
import type { TileResults, TileWord } from '../lib/tileResults'
import type { HistoryView } from '../hooks/useHistoryView'
import { useTileShuffle } from '../hooks/useTileShuffle'
import { useTileCursor } from '../hooks/useTileCursor'
import { useDecidedTileMarks } from '../hooks/useDecidedTileMarks'
import { WordTile } from './WordTile'
import styles from './Board.module.css'

/** What is on the tiles. */
export type BoardTiles = {
  // The board's words, in the game's order. Three of them are the secrets.
  words: readonly TileWord[]
  // Each guessed word → whether it was a secret: the live board's (in compete,
  // my guesses only), or a past turn's.
  results: TileResults
  // Each guessed word → who guessed it. A revealed secret is not in it: nobody
  // guessed it.
  decidedBy: ReadonlyMap<TileWord, Actor>
  // How many guesses the server has recorded.
  moveCount: number
}

/** What the board wears on and around its tiles. */
export type BoardMarks = {
  pickedTile: TileWord | null
  inFlightGuess: TileWord | null
  endingOutcome: EndOutcome | null
  // A teammate holds the move.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine.
  myTurnJustStarted: boolean
}

type Props = {
  tiles: BoardTiles
  marks: BoardMarks
  // The past turn open on the board, if any.
  historyView: HistoryView
  // The tiles take a click or a key right now. When they may is `BoardCol`'s
  // to say.
  canPick: boolean
  // The players are working one board together: `gd.oneBoard` with more than
  // one of them at it.
  isSharedBoard: boolean
  // Picks a word, or un-picks with null.
  onPick: (word: TileWord | null) => void
}

/**
 * psychicnum's board: a grid of word tiles, the keyboard's way around them,
 * and the Shuffle floated over its top-right.
 *
 * A guessed word's tile colors **permanently** — green if it was a secret, red
 * if not — so the board is a record of what's been found and ruled out. Once
 * the game has ended it is also the answer key, through `results` like
 * everything else: PlayArea folds the revealed secrets in as hits, and a
 * revealed tile has no dot.
 */
export function Board({
  tiles,
  marks,
  historyView,
  canPick,
  isSharedBoard,
  onPick,
}: Props) {
  const shuffle = useTileShuffle(tiles.words)
  const boardShape = makeBoardShape(shuffle.tiles.length)
  const tileCursor = useTileCursor({
    displayedTiles: shuffle.tiles,
    boardShape,
    results: tiles.results,
    pickedTile: marks.pickedTile,
    canPick,
    onPick,
  })
  const decidedMarks = useDecidedTileMarks({
    results: tiles.results,
    moveCount: tiles.moveCount,
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
          const isGuessed = tiles.results.has(word)
          const decidedOutcome = isGuessed
            ? getGuessOutcome(word, tiles.results.get(word)!)
            : null
          return (
            <WordTile
              key={word}
              word={word}
              decidedOutcome={decidedOutcome}
              // Who guessed a tile is worth saying only where it can differ:
              // on a board the players share.
              guesser={isSharedBoard ? tiles.decidedBy.get(word) : undefined}
              marks={{
                isPicked: marks.pickedTile === word,
                isUnderCursor: cursorPosition === index,
                isInFlight: marks.inFlightGuess === word,
                isFlashing: decidedMarks.flashing.has(word),
                isShaking: decidedMarks.shaking.has(word),
                isHistoryLit: historyView.litWord === word,
              }}
              isDisabled={isGuessed || !canPick}
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
