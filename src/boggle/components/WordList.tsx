import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { DefinitionPopover } from '../../common/components/DefinitionPopover'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { FoundWordRow, Player } from '../hooks/useGame'
import { buildDisplayRows } from '../lib/displayRows'
import { useRecentlyFound } from '../hooks/useRecentlyFound'
import styles from './WordList.module.css'

type Props = {
  foundWords: FoundWordRow[]
  players: Player[]
  /** All words the viewer/team has found (required + bonus). */
  foundWordsCount: number
  requiredWordsCount: number
  /** Post-terminal reveal: the required words nobody found, interleaved grey.
   *  Computed client-side (`required − found`); its presence is the "game over"
   *  signal that suppresses the recently-found flash. */
  revealWords?: ReadonlyArray<{ word: string }> | null
}

/**
 * Alphabetical found-words list — modeled on FreeBee's. Each row leads with a
 * circle marker carrying the attribution: a filled ● in the finder's color for
 * found words (deduped to the first finder), with the word itself in black; a
 * bonus word gets a trailing '•'; freshly-arrived words flash a finder-color
 * underline on the word for 5s (mid-game only). Post-terminal, the required
 * words nobody found are interleaved with a hollow grey ○ + grey word. Every
 * row is click-to-define. Column-major grid in a fixed-height box that scrolls
 * horizontally past the third column.
 */
export function WordList({
  foundWords,
  players,
  foundWordsCount,
  requiredWordsCount,
  revealWords,
}: Props) {
  const reveal = !!revealWords
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, colorVarFor(p.color))
    return m
  }, [players])

  const displayRows = useMemo(
    () => buildDisplayRows(foundWords, revealWords),
    [foundWords, revealWords],
  )

  const foundWordsOnly = useMemo(() => foundWords.map((r) => r.word), [foundWords])
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  const [defining, setDefining] = useState<{ word: string; rect: DOMRect } | null>(null)
  function openDefine(word: string, el: HTMLElement) {
    setDefining({ word, rect: el.getBoundingClientRect() })
  }
  function rowActivation(word: string) {
    return {
      onClick: (e: ReactMouseEvent<HTMLLIElement>) => openDefine(word, e.currentTarget),
      onKeyDown: (e: ReactKeyboardEvent<HTMLLIElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDefine(word, e.currentTarget)
        }
      },
      role: 'button' as const,
      tabIndex: 0,
      title: 'Click to define',
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        {reveal
          ? `${foundWordsCount} / ${requiredWordsCount} words — reveal`
          : `${foundWordsCount} / ${requiredWordsCount} words`}
      </div>
      <ul className={cls(styles.list, displayRows.length === 0 && styles.listEmpty)}>
        {displayRows.length === 0 ? (
          <li className={styles.empty}>No words yet</li>
        ) : (
          displayRows.map((entry) => {
            if (entry.kind === 'unfound') {
              return (
                <li
                  key={entry.word}
                  className={cls(styles.row, styles.unfound)}
                  {...rowActivation(entry.word)}
                >
                  <span className={cls(styles.dot, styles.dotUnfound)} aria-hidden="true">{'○'}</span>
                  <span className={styles.word}>{entry.word.toUpperCase()}</span>
                </li>
              )
            }
            const row = entry.row
            const color = colorByUser.get(row.user_id) ?? 'var(--color-text)'
            const isRecent = !reveal && recentlyFound.has(row.word)
            return (
              <li
                key={row.word}
                className={cls(styles.row, isRecent && styles.recent)}
                {...rowActivation(row.word)}
              >
                <span className={styles.dot} style={{ color }} aria-hidden="true">{'●'}</span>
                {/* Word in black; only the dot carries the finder color. The
                    recent-flash underline is set to the finder color inline
                    (CSS can't know it) — see `.recent .word`. */}
                <span
                  className={styles.word}
                  style={isRecent ? { textDecorationColor: color } : undefined}
                >
                  {row.word.toUpperCase()}
                </span>
                {row.is_bonus && <span className={styles.bonusDot}>{' •'}</span>}
              </li>
            )
          })
        )}
      </ul>
      {defining && (
        <DefinitionPopover
          initialWord={defining.word}
          anchorRect={defining.rect}
          onClose={() => setDefining(null)}
        />
      )}
    </div>
  )
}
