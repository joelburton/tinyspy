import { decode, type Card as CardCode, COLORS } from '../lib/cards'
import { CARD_BOX, SHAPE_PATHS, STRIPE, SYMBOL_BOX, SYMBOL_LAYOUT, SYMBOL_STROKE } from '../lib/shapes'
import { cls } from '../../common/lib/util/cls'
import styles from './Card.module.css'

/**
 * One card, drawn as inline SVG.
 *
 * A card is four attributes and the drawing spends one visual channel on each:
 * COUNT is how many symbols, SHAPE is which path, COLOR is the hue, and
 * SHADING is the fill — solid, striped (a `<pattern>`), or open (no fill, just
 * the outline). Nothing is decorative; every mark on the face is information,
 * which is why the face is otherwise bare.
 *
 * Symbol size does NOT vary with the count — one symbol is the same size as
 * each of three, exactly as on a real card — so `pips` changes how many are
 * drawn and nothing else about the layout.
 */
export function Card({
  card,
  selected = false,
  hinted = false,
  flash = null,
  disabled = false,
  readOnly = false,
  onClick,
}: {
  card: CardCode
  selected?: boolean
  /** Ringed by a coop hint: "there is a set through this card". */
  hinted?: boolean
  /** A transient mark — a set just claimed, or a card just dealt. */
  flash?: 'claimed' | 'dealt' | null
  disabled?: boolean
  /**
   * Draw the card as a READOUT rather than a control — a plain box, not a
   * button. Used by the last-set panel, where the cards are something to look
   * at rather than something to press.
   *
   * Not the same as `disabled`, and the difference bit: a disabled <button>
   * picks up the global `button:disabled { opacity: 0.5 }`, which on a card
   * dims the very colors that ARE its content. A readout is simply not a
   * button, so nothing has to be overridden.
   */
  readOnly?: boolean
  onClick?: () => void
}) {
  const { pips, color, shade, shape } = decode(card)
  const hue = `var(--setgame-${color})`
  const fill =
    shade === 'solid' ? hue : shade === 'striped' ? `url(#setgame-stripe-${color})` : 'none'

  // The symbols sit in a centered row. Computing the offsets here (rather than
  // with flexbox inside the SVG, which does not exist) keeps the whole face one
  // coordinate system, which is also what a printer would need.
  const { width: w, gap, height: h } = SYMBOL_LAYOUT
  const total = pips * w + (pips - 1) * gap
  const left = (CARD_BOX.width - total) / 2
  const top = (CARD_BOX.height - h) / 2

  const className = cls(
    styles.card,
    readOnly && styles.readOnly,
    selected && styles.selected,
    hinted && styles.hinted,
    flash === 'claimed' && styles.claimed,
    flash === 'dealt' && styles.dealt,
  )

  const face = (
    <svg
        className={styles.face}
        viewBox={`0 0 ${CARD_BOX.width} ${CARD_BOX.height}`}
        // SLICE, not the default `meet`: where the card's box is SHORTER than
        // CARD_BOX — which is exactly what mobile does, to buy the board width
        // back from the status bar — this crops the empty margin above and
        // below the symbols instead of shrinking them to fit. The symbols are
        // only 0.63 of the box's height, so there is whitespace to spend before
        // anything of the art is touched.
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {Array.from({ length: pips }, (_, i) => (
          <g
            key={i}
            transform={
              `translate(${left + i * (w + gap)} ${top})`
              + ` scale(${w / SYMBOL_BOX.width} ${h / SYMBOL_BOX.height})`
            }
            fill={fill}
            stroke={hue}
            strokeWidth={SYMBOL_STROKE}
          >
            <path d={SHAPE_PATHS[shape]} />
          </g>
        ))}
    </svg>
  )

  if (readOnly) return <div className={className}>{face}</div>

  return (
    <button
      type="button"
      className={className}
      // A card is never a tab stop: nothing on this board takes focus (the
      // board-focus rule), and Tab is swallowed outright by the key handler.
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
    >
      {face}
    </button>
  )
}

/**
 * The three stripe patterns, rendered ONCE per board.
 *
 * SVG pattern ids are document-global, so these cannot live inside `<Card>` —
 * eighteen cards would each define `#setgame-stripe-blue` and the browser would
 * resolve every reference to whichever won. One hidden `<svg>` at the board
 * level, referenced by every card, is the standard shape for this.
 *
 * The stripes are HORIZONTAL, which is not a taste call: the symbols are tall
 * and narrow, so vertical stripes gave a diamond two or three lines and it read
 * as "solid with a scratch on it". Across the long axis there is room for about
 * a dozen.
 */
export function CardDefs() {
  return (
    <svg className={styles.defs} aria-hidden="true">
      <defs>
        {COLORS.map((color) => (
          <pattern
            key={color}
            id={`setgame-stripe-${color}`}
            patternUnits="userSpaceOnUse"
            width={STRIPE.pitch}
            height={STRIPE.pitch}
          >
            <path
              d={`M 0 2 H ${STRIPE.pitch}`}
              stroke={`var(--setgame-${color})`}
              strokeWidth={STRIPE.thickness}
            />
          </pattern>
        ))}
      </defs>
    </svg>
  )
}
