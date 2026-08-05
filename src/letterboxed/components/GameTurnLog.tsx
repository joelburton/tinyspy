import { cls } from '../../common/lib/util/cls'
import type { GamePlayer } from '../../common/lib/games'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { EventRow } from '../hooks/useGame'
import styles from './PlayArea.module.css'

/**
 * letterboxed's turn log — every move, retreats included.
 *
 * The log shows undos and clears rather than quietly deleting the played row,
 * which is why `letterboxed.events` is an append-only stream in the first
 * place. In turn-by-turn co-op an undo COSTS the undoer's turn, so it isn't
 * housekeeping to be hidden — it's a move, and usually one made for the next
 * player's benefit. The copy reflects that: "cleared the dead end", not
 * "deleted TRACE".
 */
export function GameTurnLog({
  events,
  players,
  selfId,
}: {
  events: EventRow[]
  players: GamePlayer[]
  selfId: string
}) {
  return (
    <div className={styles.chainBlock}>
      <div className={styles.blockTitle}>Moves</div>
      <ol className={styles.log}>
        {events.map((e) => {
          const actor = players.find((p) => p.user_id === e.user_id)
          return (
            <li key={e.id} className={cls(styles.logRow, styles[`log_${e.kind}`])}>
              <ActorDot actor={actor} fallback={e.user_id === selfId ? 'You' : 'A player'} />
              <span className={styles.logBody}>{describe(e)}</span>
              <span className={styles.logCovered}>{e.letters_covered}/12</span>
            </li>
          )
        })}
        {events.length === 0 && <li className={styles.logEmpty}>No moves yet</li>}
      </ol>
    </div>
  )
}

/** What a row says. Each kind names what HAPPENED, in the game's own words. */
function describe(e: EventRow): string {
  switch (e.kind) {
    case 'played':
      return e.word?.toUpperCase() ?? ''
    case 'undone':
      return `cleared the dead end (${e.word?.toUpperCase() ?? ''})`
    case 'cleared':
      return 'started the chain over'
    case 'hint':
      return 'took a hint'
  }
}
