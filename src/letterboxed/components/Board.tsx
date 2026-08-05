import { useMemo } from 'react'
import { cls } from '../../common/lib/util/cls'
import { canFollow, coveredLetters, EDGE, layout, NODE_R, SPAN, type Node } from '../lib/board'
import styles from './Board.module.css'
import play from './PlayArea.module.css'

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
 * does nothing — but they are NOT dimmed. An earlier version faded them, which
 * looked helpful and played badly: you plan a whole word before you commit to
 * it, and a board where a third of the letters are unreadable at any moment is
 * a board you can't plan on. The rule is learned in one move; the legibility
 * cost is paid on every move. The server re-checks everything regardless.
 */
export function Board({
  sides,
  chain,
  word,
  onPick,
  disabled,
}: {
  /** Twelve letters in side order. */
  sides: string
  /** Words played so far — drives the "covered" marking. */
  chain: string[]
  /** The word being built (may be empty). */
  word: string
  /** Append this letter, or submit if it's the word's current last letter. */
  onPick: (letter: string) => void
  /** Terminal / not my turn / conceded: the board is inert. */
  disabled: boolean
}) {
  const nodes = useMemo(() => layout(sides), [sides])
  const covered = useMemo(() => coveredLetters(chain), [chain])
  const byLetter = useMemo(() => new Map(nodes.map((n) => [n.letter, n])), [nodes])

  const last = word[word.length - 1]
  // The path the word in progress traces. Every letter of `word` is on the
  // board (entry only admits board letters), so the lookup can't miss.
  const points = useMemo(
    () =>
      [...word]
        .map((c) => byLetter.get(c))
        .filter((n): n is Node => n !== undefined)
        .map((n) => `${n.x},${n.y}`)
        .join(' '),
    [word, byLetter],
  )

  return (
    <svg className={cls(styles.board, play.board)} viewBox="0 0 100 100" role="presentation">
      <rect
        className={styles.box}
        x={EDGE}
        y={EDGE}
        width={SPAN}
        height={SPAN}
        rx="1.5"
      />

      {/* The chain line sits under the letters so a node is never obscured. */}
      {points && <polyline className={styles.path} points={points} />}

      {nodes.map((n) => {
        const isLast = n.letter === last
        const inWord = word.includes(n.letter)
        // Illegal as the NEXT letter: same side as the one we're sitting on.
        // The current last letter is exempt — clicking it means submit.
        const blocked = !isLast && !canFollow(sides, last, n.letter)
        return (
          <g
            key={n.letter}
            className={cls(
              styles.node,
              covered.has(n.letter) && styles.covered,
              inWord && styles.inWord,
              isLast && styles.last,
              disabled && styles.disabled,
            )}
            onClick={() => {
              if (disabled || blocked) return
              onPick(n.letter)
            }}
          >
            <circle cx={n.x} cy={n.y} r={NODE_R} />
            <text x={n.x} y={n.y} dominantBaseline="central" textAnchor="middle">
              {n.letter.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
