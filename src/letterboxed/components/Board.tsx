// cs-unmet

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import { canFollow, coveredLetters, EDGE, layout, pathPoints, SPAN } from '../lib/board'
import shared from '@/common/game-page/playArea.module.css'
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
  shakeNonce = null,
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
  /** Set when the word on the board was just refused: its letters shake, which
   *  is what side to side means everywhere in this app. The number is a replay
   *  nonce — the letters are keyed on it, so refusing the same word twice shakes
   *  twice (a CSS animation only restarts on a new element). */
  shakeNonce?: number | null
}) {
  const nodes = useMemo(() => layout(sides), [sides])
  const covered = useMemo(() => coveredLetters(chain), [chain])
  const last = word[word.length - 1]
  // The path the word in progress traces.
  const points = useMemo(() => pathPoints(word, nodes), [word, nodes])

  /**
   * The GHOST: the last submitted word's path, in gray, so everyone can see
   * where the chain just went — in coop that's whoever played it, since the
   * chain is shared and arrives by realtime; in compete `chain` is your own
   * (rivals' are column-shielded), so it's your own last word and can't leak.
   *
   * It survives the word's FIRST letter, which is not a choice — it's carried
   * over from the previous word's tail — and clears on the second, the moment
   * the player has actually decided something. `word.length < 2` is that rule.
   *
   * The history viewer gets this for free: it passes `word=''` and a snapshot
   * `chain`, so stepping back through turns replays each word's path.
   */
  const ghostPoints = useMemo(
    () => (word.length < 2 ? pathPoints(chain[chain.length - 1] ?? '', nodes) : ''),
    [word, chain, nodes],
  )

  return (
    // The board is TWO layers in one square: an SVG carrying the box and the two
    // chain lines, and the letters laid over it as ordinary boxes. The letters
    // left the SVG so they could be tiles — a `<circle>` takes no box-shadow, no
    // shared tile face and none of the shared marks, so every one of those had to
    // be hand-translated into SVG idioms and re-scaled by hand. The two layers
    // cannot drift: both are addressed in the same 0-100 coordinates, the SVG
    // through its viewBox and the letters as percentages.
    <div className={cls(styles.board, play.board)}>
      <svg className={styles.lines} viewBox="0 0 100 100" role="presentation">
        <rect
          className={styles.box}
          x={EDGE}
          y={EDGE}
          width={SPAN}
          height={SPAN}
          rx="1.5"
        />

        {/* Both lines sit under the letters so a node is never obscured. The ghost
            is first so a live path drawn over it wins — they only overlap while
            the carried first letter is down, which draws no segment anyway. */}
        {ghostPoints && <polyline className={styles.ghostPath} points={ghostPoints} />}
        {points && <polyline className={styles.path} points={points} />}
      </svg>

      {nodes.map((n) => {
        const isLast = n.letter === last
        const inWord = word.includes(n.letter)
        // Illegal as the NEXT letter: same side as the one we're sitting on.
        // The current last letter is exempt — clicking it means submit.
        const blocked = !isLast && !canFollow(sides, last, n.letter)
        return (
          <div
            // Keyed on the shake's nonce while this letter is in the refused
            // word, so the same refusal twice replays the movement; the letters
            // that are not in the word keep their identity.
            key={inWord && shakeNonce !== null ? `${n.letter}#${shakeNonce}` : n.letter}
            className={cls(
              styles.node,
              covered.has(n.letter) && styles.covered,
              inWord && styles.inWord,
              isLast && styles.last,
              disabled && styles.disabled,
              inWord && shakeNonce !== null && shared.verdictShake,
            )}
            // The node's own coordinates, as a share of the square — the same
            // numbers the SVG above positions by. `--node-d` (its diameter) is in
            // the stylesheet, and the margins there pull it back onto its center.
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            onClick={() => {
              if (disabled || blocked) return
              onPick(n.letter)
            }}
          >
            {n.letter.toUpperCase()}
          </div>
        )
      })}
    </div>
  )
}
