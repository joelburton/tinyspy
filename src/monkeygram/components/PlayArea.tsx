import type { GamePageCtx } from '../../common/lib/games'
import { useGame } from '../hooks/useGame'
import styles from './PlayArea.module.css'
import '../theme.css' // monkeygram-specific tokens (minimal today)

/**
 * MonkeyGram play surface.
 *
 * **Phase 1 stub.** This only proves the plumbing is alive end to
 * end: the game starts, the server deals each player a starter hand,
 * and the caller's OWN board loads (via RLS-scoped
 * `monkeygram.player_boards`). It renders the dealt hand and nothing
 * more. The draggable / keyboard-driven player board (ported from the
 * `monkeygram-ui/` prototype) plus the snapshot lifecycle land in
 * Phase 2.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { board, loading } = useGame(ctx.gameId)

  if (loading) return <p className="muted">Dealing tiles…</p>

  return (
    <div className={styles.area}>
      <p className={styles.heading}>
        Your hand — <strong>{board.hand.length}</strong> tiles
      </p>
      <div className={styles.hand}>
        {board.hand.map((t) => (
          <span key={t.id} className={styles.tile}>
            {t.letter}
          </span>
        ))}
      </div>
      <p className="muted">
        Phase 1 stub — the draggable player board and keyboard cursor arrive in
        Phase 2.
      </p>
    </div>
  )
}
