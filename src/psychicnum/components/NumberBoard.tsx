import { cls } from '../../common/lib/cls'
import styles from './NumberBoard.module.css'

type Props = {
  /** Optional heading inside the board card. Empty during play (no prompt —
   *  the board IS the prompt); set to "The number was N" once terminal. */
  heading: string
  /** Highest number on the board; tiles run 1..max. */
  max: number
  /** Numbers already guessed; their tiles render spent (dimmed +
   *  disabled). */
  guessed: Set<number>
  /** The currently-picked number (highlighted), or null. Kept in
   *  sync with the text input by the parent. */
  selected: number | null
  /** Pick a number tile. Omitted when the board is non-interactive
   *  (terminal, or the viewer is out of guesses) — tiles render
   *  inert then. */
  onPick?: (n: number) => void
}

/**
 * psychicnum's "board": a 1..max grid of clickable number tiles. The tiles are
 * made as big as possible — the grid takes a DEFINITE size (the available
 * height, derived from the viewport, with a width safety so it never collides
 * with the fixed info column), and the cols×rows aspect-ratio keeps the tiles
 * square. That definite width is what the board column hugs (see
 * NumberBoard.module.css + PlayArea.module.css + docs/ui.md → "Board sizing").
 * We lay the tiles out in a roughly-square grid (`cols ≈ √max`) so they stay as
 * big as possible rather than spreading into one long row.
 *
 * Picking a tile sets the pending guess (mirrored by the text input below the
 * board); a guessed number's tile dims to a spent/disabled look, so the board
 * doubles as an at-a-glance record of what's been tried. In compete mode RLS
 * scopes `guessed` to the caller, so it reflects only the viewer's own attempts.
 */
export function NumberBoard({ heading, max, guessed, selected, onPick }: Props) {
  const numbers = Array.from({ length: max }, (_, i) => i + 1)
  const cols = Math.ceil(Math.sqrt(max))
  const rows = Math.ceil(max / cols)
  return (
    <div className={styles.board}>
      {heading && <p className={styles.heading}>{heading}</p>}
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: `${cols} / ${rows}`,
          // As big as the available height allows (height × aspect), but never
          // wider than the space the fixed info column leaves, and never so big
          // that a tile exceeds the max-tile size. A definite size, so the board
          // column can shrink-wrap to it. The ~6rem is the card padding + the
          // input row below; ~26rem ≈ the info column + gaps. The max-tile term
          // is `maxTile*cols + gap*(cols-1)` (gap is the fixed 0.4rem in the
          // grid CSS) — psychicnum's max tile is 125px (no manifest knob yet).
          width: `min(calc((100vh - var(--game-chrome-height) - 6rem) * ${cols} / ${rows}), calc(100vw - 26rem), calc(125px * ${cols} + 0.4rem * ${cols - 1}))`,
        }}
      >
        {numbers.map((n) => {
          const spent = guessed.has(n)
          return (
            <button
              key={n}
              type="button"
              className={cls(
                styles.tile,
                spent && styles.spent,
                selected === n && styles.selected,
              )}
              disabled={spent || !onPick}
              aria-pressed={selected === n || undefined}
              onClick={onPick ? () => onPick(n) : undefined}
            >
              <span>{n}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
