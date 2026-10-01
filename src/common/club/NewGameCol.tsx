// cs-unmet

import type { RefObject } from 'react'
import { cls } from '../utils/cls'
import {
  MODE_LABEL,
  playerCountFits,
  playerCountLabel,
  type GameManifest,
} from '../manifest/gameManifest'
import { SelectionList } from '../lists/SelectionList'
import { CurrentGameCard } from './CurrentGameCard'
import { ModeFilter } from './ModeFilter'
import { StartGameRow } from './StartGameRow'
import type { ListedGame } from './useClubGames'
import type { StartListFilter } from './useStartListFilter'
import styles from './clubCols.module.css'

type Props = {
  currentGame: ListedGame | null
  startFilter: StartListFilter
  startListRef: RefObject<HTMLDivElement | null>
  numMembers: number
  soloClub: boolean
  // A dialog of the page's is open, so the list keeps its cursor (SelectionList).
  isFrozen: boolean
  onStart: (gametype: string) => void
  onDelete: (game: ListedGame) => Promise<void>
}

/**
 * The club page's left column, "New game" on a phone: the current game called
 * out, then the list of games the club can start, under the mode filter.
 *
 * The start list is one of the page's two keyboard stops, and focus starts on
 * it (club/doc.md → The keyboard). A row whose player count the club can't
 * seat is dimmed and declines Enter.
 */
export function NewGameCol({
  currentGame,
  startFilter,
  startListRef,
  numMembers,
  soloClub,
  isFrozen,
  onStart,
  onDelete,
}: Props) {
  function fitsClub(g: GameManifest) {
    return playerCountFits(g.numberOfPlayers, numMembers)
  }

  // A filter really can empty this list: a club with only coop gametypes,
  // filtered to Compete.
  const startListEmptyText = startFilter.mode === 'all'
    ? 'No games available in this club.'
    : `No ${MODE_LABEL[startFilter.mode]} games in this club.`

  return (
    <>
      {currentGame && (
        <div>
          <h3>Join the current game</h3>
          <CurrentGameCard
            gameId={currentGame.gameId}
            manifest={currentGame.manifest}
            title={currentGame.title}
            statusLabel={currentGame.statusLabel}
            statusChangedAt={currentGame.statusChangedAt}
            soloClub={soloClub}
            onDelete={() => onDelete(currentGame)}
          />
        </div>
      )}

      <div className={styles.startBlock}>
        <div
          className={cls('heading-with-controls', styles.headingRow)}
          // Tells this filter from its phone copy (club/doc.md).
          data-testid="heading-controls"
        >
          <h3>Start a new game</h3>
          <ModeFilter filter={startFilter} soloClub={soloClub}/>
        </div>
        <SelectionList
          ref={startListRef}
          items={startFilter.visible}
          rowKey={(g) => g.gametype}
          label="Start a new game"
          frozen={isFrozen}
          fills
          density="packed"
          autoFocus
          onActivate={(g) => onStart(g.gametype)}
          disabled={(g) => !fitsClub(g)}
          rowTitle={(g) => fitsClub(g) ? undefined : playerCountLabel(g.numberOfPlayers)}
          empty={startListEmptyText}
          renderRow={(g) => <StartGameRow game={g} soloClub={soloClub}/>}
        />
      </div>
    </>
  )
}
