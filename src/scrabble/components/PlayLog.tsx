import type { Member } from '../../common/lib/games'
import type { PlayRow } from '../hooks/useGame'
import styles from './PlayLog.module.css'

/**
 * The right-column move history — every word, exchange, and pass, newest
 * first. Public in both modes (the words are already on the shared board).
 */
export function PlayLog({ plays, players }: { plays: PlayRow[]; players: Member[] }) {
  const nameOf = (userId: string) =>
    players.find((p) => p.user_id === userId)?.username ?? '?'

  return (
    <div className={styles.log}>
      <h3 className={styles.heading}>Moves</h3>
      {plays.length === 0 && <p className="muted">No moves yet.</p>}
      <ul className={styles.list}>
        {[...plays].reverse().map((p) => (
          <li key={p.seq} className={styles.row}>
            <span className={styles.who}>{nameOf(p.user_id)}</span>{' '}
            {p.kind === 'word' && (
              <>
                played <strong>{(p.words ?? []).join(' · ')}</strong>{' '}
                <span className={styles.score}>+{p.score ?? 0}</span>
              </>
            )}
            {p.kind === 'exchange' && <>exchanged {p.tile_count} tiles</>}
            {p.kind === 'pass' && <>passed</>}
          </li>
        ))}
      </ul>
    </div>
  )
}
