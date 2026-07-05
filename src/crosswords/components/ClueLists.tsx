import { useEffect, useRef } from 'react'
import type { Clue, Direction } from '../lib/types'
import { cls } from '../../common/lib/util/cls'
import styles from './ClueLists.module.css'

type ListProps = {
  title: string
  direction: Direction
  clues: Clue[]
  side: 'left' | 'right'
  /** The clue the cursor is currently navigating (yellow). */
  activeNumber: number | null
  /** The crossing clue passing through the cursor cell (soft yellow). */
  secondaryNumber: number | null
  onClueClick: (number: number, direction: Direction) => void
}

function ClueList({
  title, direction, clues, side, activeNumber, secondaryNumber, onClueClick,
}: ListProps) {
  const activeRef = useRef<HTMLLIElement | null>(null)

  // Keep the highlighted clue in view as the cursor moves.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeNumber, secondaryNumber])

  return (
    <section className={cls(styles.section, styles[side])}>
      <div className={styles.title}>{title}</div>
      <ol className={styles.list}>
        {clues.map((c) => {
          const isActive = c.number === activeNumber
          const isSecondary = c.number === secondaryNumber
          return (
            <li
              key={c.number}
              ref={isActive || isSecondary ? activeRef : undefined}
              className={cls(styles.item, isActive && styles.active, isSecondary && styles.secondary)}
              onMouseDown={(e) => {
                e.preventDefault()
                onClueClick(c.number, direction)
              }}
            >
              <span className={styles.num}>{c.number}</span>
              <span className={styles.text}>{c.text}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

type Props = {
  across: Clue[]
  down: Clue[]
  /** The clue number under the cursor for each axis. */
  acrossNumber: number | null
  downNumber: number | null
  /** Which axis the cursor faces — picks which list is "active" vs "secondary". */
  dir: Direction
  onClueClick: (number: number, direction: Direction) => void
}

export function ClueLists({ across, down, acrossNumber, downNumber, dir, onClueClick }: Props) {
  return (
    <>
      <ClueList
        title="Across"
        direction="across"
        clues={across}
        side="left"
        activeNumber={dir === 'across' ? acrossNumber : null}
        secondaryNumber={dir === 'down' ? acrossNumber : null}
        onClueClick={onClueClick}
      />
      <ClueList
        title="Down"
        direction="down"
        clues={down}
        side="right"
        activeNumber={dir === 'down' ? downNumber : null}
        secondaryNumber={dir === 'across' ? downNumber : null}
        onClueClick={onClueClick}
      />
    </>
  )
}
