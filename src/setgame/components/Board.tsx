import { useState } from 'react'
import type { Card as CardCode } from '../lib/cards'
import type { Slot } from '../lib/staging'
import { letterForSlot } from '../lib/letters'
import { cls } from '../../common/lib/util/cls'
import { Card, CardDefs } from './Card'
import styles from './Board.module.css'

type Props = {
  /**
   * The board AS DISPLAYED, in slot order. A null is a slot whose card has been
   * claimed and whose replacement has not landed yet — the deal arrives one
   * card a second, so an empty place is a normal, visible state here rather
   * than an error.
   */
  board: readonly Slot[]
  /** Cards the player has picked, by card code (not by slot — see below). */
  selected: readonly CardCode[]
  /** Cards a coop hint is ringing. */
  hinted: readonly CardCode[]
  /** Transient marks, keyed by card code. */
  flashes: ReadonlyMap<CardCode, 'claimed' | 'dealt'>
  disabled: boolean
  /** Turn-by-turn coop, and it is someone else's turn — the board fades.
   *  A STRICT SUBSET of `disabled`, and deliberately its own flag: the board is
   *  also disabled at every terminal and while replaying a past turn, neither of
   *  which should fade (both are states people sit and study). */
  waiting: boolean
  onCardClick: (card: CardCode) => void
}

/**
 * The table: three rows of cards, growing rightwards.
 *
 * **Three rows, always.** Columns are what change — four at twelve cards, up to
 * seven at the twenty-one-card ceiling — because the deal adds three cards,
 * which is exactly one column. A board that grew downwards would reflow the
 * whole page instead.
 *
 * **Left-aligned, not centered**, which is the one layout decision here worth
 * arguing. A centered board shifts every card leftwards when a column arrives —
 * a full-table reflow at the exact moment everyone is mid-scan. Left-aligned, a
 * deal only ever adds cards on the right, and nothing already on the table
 * moves.
 *
 * **Selection is keyed by CARD, not by slot.** A rival can claim a card out
 * from under your selection; keyed by card, that card simply drops out of the
 * selection when it leaves the board, and its letter is free again. Keyed by
 * slot, the selection would silently re-point at whatever card refilled the
 * hole, and the next keystroke would claim something you never looked at.
 */
export function Board({
  board,
  selected,
  hinted,
  flashes,
  disabled,
  waiting,
  onCardClick,
}: Props) {
  const cols = Math.ceil(board.length / 3)

  // The column count drives the grid AND the card size (Board.module.css), so
  // it goes down as a custom property rather than as a class per width.
  //
  // Sizing uses a HIGH-WATER mark rather than the live count: cards may shrink
  // when a deal adds a column, and then never grow back. Growing back would
  // mean the endgame — where the board comes down as the deck empties — resized
  // every card a second time, which is the same disruption twice for no gain.
  // On a normal window the per-card cap binds anyway, so most games never
  // resize at all; this only bites on a narrow window or at the very rare
  // twenty-one-card board.
  const [widest, setWidest] = useState(cols)
  if (cols > widest) setWidest(cols)

  return (
    <div
      className={cls(styles.board, disabled && styles.disabled, waiting && styles.waiting)}
      style={{ '--cols': widest } as React.CSSProperties}
    >
      <CardDefs />
      {board.map((card, slot) => (
        <div key={slot} className={styles.cell}>
          {card === null ? (
            <div className={styles.empty} />
          ) : (
            <Card
              card={card}
              selected={selected.includes(card)}
              hinted={hinted.includes(card)}
              flash={flashes.get(card) ?? null}
              disabled={disabled}
              onClick={() => onCardClick(card)}
            />
          )}
          {/* The letter is the card's keyboard address, and it is bound to the
              SLOT rather than to the card — so `B` stays in the same place all
              game even as the card sitting there changes. That stability is
              what makes typing usable at all; a letter that wandered would be
              worse than no letters. */}
          <span className={styles.letter}>{letterForSlot(slot)}</span>
        </div>
      ))}
    </div>
  )
}
