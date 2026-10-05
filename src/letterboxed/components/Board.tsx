// cs-unmet

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import { coveredLetters, EDGE, layout, pathPoints, SPAN } from '../lib/board'
import { Tile } from './Tile'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Board.module.css'
import type { GTile } from '../types'

/** What this screen adds to the board, beyond the tiles. */
type BoardMarks = {
  // Set when the typed word was just refused: its letters shake. The number
  // is a replay nonce — the letters are keyed on it, so refusing the same word
  // twice shakes twice (a CSS animation only restarts on a new element).
  shakeNonce: number | null
  // True for a beat at the moment the turn becomes mine: the frame flashes.
  myTurnJustStarted: boolean
}

/**
 * The play surface: twelve letters on a square, the chain's covered letters
 * marked, and the word being built drawn as a line from letter to letter.
 *
 * ── Clicking ────────────────────────────────────────────────────────────────
 * A click appends that letter to the word in progress, EXCEPT that clicking
 * the letter the word already ends on submits it — the strands gesture, and it
 * is unambiguous here for a reason worth stating: two consecutive letters must
 * come from different sides, and a letter is trivially on its own side, so a
 * word can never repeat a letter back-to-back. The "append" reading of that
 * click is therefore always illegal, which leaves "submit" as the only sense
 * it could have.
 *
 * Letters that can't legally follow the current one are inert — clicking one
 * does nothing — but they are NOT dimmed. Fading them looks helpful and plays
 * badly: you plan a whole word before you commit to it, and a board where a third of the letters are unreadable at any moment is
 * a board you can't plan on. The rule is learned in one move; the legibility
 * cost is paid on every move. The server re-checks everything regardless.
 */
export function Board({
  tiles,
  words,
  typedWord,
  isInteractive,
  marks,
  onPick,
}: {
  // The box's twelve tiles, in side order.
  tiles: GTile[]
  // The chain on show — drives the covered marking and the ghost.
  words: string[]
  // The word being typed; empty while a past move is on show.
  typedWord: string
  // The board takes moves.
  isInteractive: boolean
  marks: BoardMarks
  // A tile clicked: append its letter, or submit if it is the word's last.
  onPick: (tile: GTile) => void
}) {
  const placed = useMemo(() => layout(tiles), [tiles])
  const covered = useMemo(() => coveredLetters(words), [words])
  const lastTile = tiles.find((t) => t.letter === typedWord.at(-1))
  // The path the word in progress traces.
  const points = useMemo(() => pathPoints(typedWord, placed), [typedWord, placed])

  // The GHOST: the last word of the chain on show, in a quieter line, so
  // everyone can see where the chain just went — in coop whoever played it,
  // since the chain is shared; in compete my own last word, a rival's chain
  // being withheld mid-race.
  //
  // It survives the word's FIRST letter, which is not a choice — it's carried
  // over from the previous word's tail — and clears on the second, the moment
  // the player has actually decided something. `typedWord.length < 2` is that
  // rule.
  //
  // The history viewer gets this for free: it passes no typed word and a past
  // move's chain, so stepping back through turns replays each word's path.
  const ghostPoints = useMemo(
    () => (typedWord.length < 2 ? pathPoints(words.at(-1) ?? '', placed) : ''),
    [typedWord, words, placed],
  )

  return (
    // The board is TWO layers in one square: an SVG carrying the box and the two
    // chain lines, and the tiles laid over it. Both are addressed in the same
    // 0-100 coordinates — the SVG through its viewBox, the tiles as percentages
    // — so they cannot drift.
    <div
      className={cls(
        shared.boardSeal,
        styles.board,
        marks.myTurnJustStarted && shared.yourTurnFlash,
      )}
    >
      <svg className={styles.lines} viewBox="0 0 100 100" role="presentation">
        <rect
          className={styles.box}
          x={EDGE}
          y={EDGE}
          width={SPAN}
          height={SPAN}
          rx="1.5"
        />

        {/* Both lines sit under the tiles so a tile is never obscured. The ghost
            is first so a live path drawn over it wins — they only overlap while
            the carried first letter is down, which draws no segment anyway. */}
        {ghostPoints && <polyline className={styles.ghostPath} points={ghostPoints} />}
        {points && <polyline className={styles.path} points={points} />}
      </svg>

      {placed.map(({ tile, x, y }) => {
        const isInWord = typedWord.includes(tile.letter)
        const isLast = tile === lastTile
        const isShaking = isInWord && marks.shakeNonce !== null
        // A letter may follow the word's last one only from another side; the
        // last letter itself takes the click as a submit.
        const canFollowLast = lastTile === undefined || isLast || tile.side !== lastTile.side
        return (
          <Tile
            // Keyed on the shake's nonce while this letter is in the refused
            // word, so the same refusal twice replays the movement; the letters
            // that are not in the word keep their identity.
            key={isShaking ? `${tile.id}#${marks.shakeNonce}` : tile.id}
            tile={tile}
            x={x}
            y={y}
            marks={{ isCovered: covered.has(tile.letter), isInWord, isLast, isShaking }}
            isInteractive={isInteractive}
            isPickable={isInteractive && canFollowLast}
            onClick={onPick}
          />
        )
      })}
    </div>
  )
}
