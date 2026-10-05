// cs-unmet

import type { ComponentProps } from 'react'
import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import type { GAnswerMark, GHistoryView } from '../types'
import { BoardRow } from './BoardRow'
import styles from './Board.module.css'

/** What is on the board. */
type BoardGrid = {
  // The words that have landed, in order: the team's on coop's shared board,
  // my own in compete.
  liveWords: string[]
  // The guess budget, and so the lines the board has.
  maxGuesses: number
  // The letters every word contains, dimmed where they appear.
  base: string
}

/** What the board wears on its lines. */
type BoardMarks = {
  // The letters being typed into the next line.
  typedWord: string
  // My own word, held in the next line while its answer shows.
  held: GAnswerMark['held']
  // The answer on whichever line its word is in, for a beat.
  flash: GAnswerMark['flash']
}

/**
 * The guess board — always exactly `maxGuesses` fixed-height lines (a HARD
 * layout-stability rule; the board must never grow/shrink). The word ENTRY is
 * the on-screen keyboard BELOW it (in BoardCol), but the word in progress
 * appears LIVE in the next line as it's typed.
 *
 * Each line is one of: a landed word (with its length, the only readout during
 * play); my own word, held where it was typed while its answer shows; the
 * typing line; or an empty line. A past row open on the board draws that
 * moment's words, with no marks and no typing line.
 */
export function Board({
  grid,
  marks,
  historyView,
  isInteractive,
}: {
  grid: BoardGrid
  marks: BoardMarks
  historyView: GHistoryView
  // The typing line shows: the move is mine, on the live board.
  isInteractive: boolean
}) {
  const shownWords = historyView.words ?? grid.liveWords
  // The marks belong to the live board only.
  const held = historyView.isViewing ? null : marks.held
  const flash = historyView.isViewing ? null : marks.flash
  const heldIdx = held === null ? -1 : shownWords.length
  const typingIdx =
    isInteractive
      ? shownWords.length + (held === null ? 0 : 1)
      : -1

  // The line the answer is on. MY line wins: guessing a word again is answered
  // where I just typed it, not on the line it landed in four turns ago. Only a
  // teammate's word — which has no held line of mine — marks a landed one.
  function getAnswerIdx(): number {
    if (flash === null) return -1
    if (held !== null && flash.value.word === held.word) return heldIdx
    return shownWords.indexOf(flash.value.word)
  }

  const answerIdx = getAnswerIdx()

  return (
    // data-board: the stable handle a spec uses to ask what the BOARD holds,
    // since the event log beside it shows the same words.
    <ol
      className={cls(shared.boardSeal,
        styles.board,
        historyView.isViewing && history.historyFrame)}
      data-board
    >
      {Array.from({ length: grid.maxGuesses }, (_, lineIdx) => {
        /** What kind of line this is. */
        function getKind(): ComponentProps<typeof BoardRow>['kind'] {
          if (lineIdx < shownWords.length
            || lineIdx === heldIdx) return 'landed'
          if (lineIdx === typingIdx) return 'typing'
          return 'empty'
        }

        /** What the line spells. */
        function getWord(): string {
          if (lineIdx < shownWords.length) return shownWords[lineIdx]!
          if (lineIdx === heldIdx) return held!.word
          if (lineIdx === typingIdx) return marks.typedWord
          return ''
        }

        return (
          <BoardRow
            // A held line keys on its word, so the server's line that replaces
            // it is a new element.
            key={lineIdx === heldIdx ? `held-${held!.word}` : lineIdx}
            word={getWord()}
            base={grid.base}
            kind={getKind()}
            answer={lineIdx === answerIdx ? flash : null}
          />
        )
      })}
    </ol>
  )
}
