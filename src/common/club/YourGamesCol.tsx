// cs-unmet

import type { RefObject } from 'react'
import { cls } from '../utils/cls'
import { navigate } from '../routing/router'
import { gamePath } from '../routing/routes'
import { SelectionList } from '../lists/SelectionList'
import { ClubGameRow } from './ClubGameRow'
import type { ClubGameState } from './GameEntry'
import { GametypeFilter } from './GametypeFilter'
import type { ListedGame } from './useClubGames'
import type { GamesListFilter } from './useGamesListFilter'
import styles from './clubCols.module.css'

type Props = {
  gamesFilter: GamesListFilter
  gamesListRef: RefObject<HTMLDivElement | null>
  // The last read of the club's games failed.
  hasReadFailed: boolean
  soloClub: boolean
  // A dialog of the page's is open, so the list keeps its cursor (SelectionList).
  isFrozen: boolean
  onDelete: (game: ListedGame) => Promise<void>
}

/**
 * The club page's right column, "Your games": every game the club has, the
 * current one included, under the gametype filter. Current, shelved or
 * finished is a corner flag on the row, not three sections (docs/states.md).
 *
 * The list is the page's other keyboard stop; Enter opens the game. The
 * heading's count is of what's showing, so it agrees with the list under a
 * filter. The filter can't empty the list (`useGamesListFilter`), so the empty
 * state is only "none yet" or a failed read.
 */
export function YourGamesCol({
  gamesFilter,
  gamesListRef,
  hasReadFailed,
  soloClub,
  isFrozen,
  onDelete,
}: Props) {
  function getGameState(g: ListedGame): ClubGameState {
    if (g.isCurrent) return 'current'
    if (g.isTerminal) return 'completed'
    return 'suspended'
  }

  const gamesListEmptyText = hasReadFailed
    ? 'Could not load this club’s games.'
    : 'No games yet.'

  return (
    <>
      <div
        className={cls('heading-with-controls', styles.headingRow)}
        // Tells this filter from its phone copy (club/doc.md).
        data-testid="heading-controls"
      >
        <h3>Your games ({gamesFilter.visible.length})</h3>
        <GametypeFilter filter={gamesFilter}/>
      </div>
      <SelectionList
        ref={gamesListRef}
        items={gamesFilter.visible}
        rowKey={(g) => g.gameId}
        label="Your games"
        frozen={isFrozen}
        fills
        density="packed"
        onActivate={(g) => navigate(gamePath(g.manifest.gametype, g.gameId))}
        empty={gamesListEmptyText}
        renderRow={(g) => (
          <ClubGameRow
            manifest={g.manifest}
            title={g.title}
            statusLabel={g.statusLabel}
            statusChangedAt={g.statusChangedAt}
            state={getGameState(g)}
            soloClub={soloClub}
            onDelete={() => onDelete(g)}
          />
        )}
      />
    </>
  )
}
