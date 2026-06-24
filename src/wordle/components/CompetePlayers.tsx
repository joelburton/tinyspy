import { colorVarFor } from '../../common/lib/memberColor'
import { orderSelfFirst } from '../../common/lib/peers'
import { cls } from '../../common/lib/cls'
import type { Member } from '../../common/lib/games'
import { tileColor } from '../lib/colors'
import type { WordleGuess, WordlePlayerState } from '../hooks/useGame'
import styles from './CompetePlayers.module.css'

type Props = {
  members: Member[]
  playerStates: WordlePlayerState[]
  /** Every guess the viewer can see: their own during play, and (once
   *  the game is terminal and RLS opens) everyone's. Grouped per player
   *  here. */
  guesses: WordleGuess[]
  selfId: string
  maxGuesses: number
  /** When true (terminal), opponents' guess grids are shown too — the
   *  end-of-game reveal. During play only the caller's own grid renders. */
  revealAll: boolean
}

/**
 * Compete-mode right column: one block per player, viewer first. Each
 * block is a header — color dot + colored name + `used/max guesses` + a
 * ✓ once they've solved — over that player's mini guess grid.
 *
 * The viewer always sees their own grid (the same mini squares the coop
 * GuessList shows); opponents' grids are hidden until the game ends
 * (`revealAll`), matching `wordle.guesses`' mode-aware RLS. The per-
 * player counts + solved flags come from `wordle.players`, which is
 * club-readable throughout, so the headers are live for everyone.
 */
export function CompetePlayers({
  members,
  playerStates,
  guesses,
  selfId,
  maxGuesses,
  revealAll,
}: Props) {
  return (
    <div className={styles.players}>
      {orderSelfFirst(members, selfId).map((player) => {
        const ps = playerStates.find((p) => p.user_id === player.user_id)
        const used = ps?.guesses_used ?? 0
        const solved = ps?.solved ?? false
        const isSelf = player.user_id === selfId
        const showGrid = isSelf || revealAll
        const rows = guesses.filter((g) => g.user_id === player.user_id)
        const color = colorVarFor(player.color)
        return (
          <section key={player.user_id} className={styles.player}>
            <div className={styles.header}>
              <span className={styles.dot} style={{ background: color }} />
              <span className={styles.name} style={{ color }}>
                {player.username}
              </span>
              <span className={styles.count}>
                {used}/{maxGuesses} guesses
              </span>
              {solved && (
                <span className={styles.check} title="Solved">
                  ✓
                </span>
              )}
            </div>
            {showGrid && rows.length > 0 && (
              <ol className={styles.grid}>
                {rows.map((g) => (
                  <li key={g.guess_index} className={styles.squares}>
                    {[...g.guess].map((ch, i) => (
                      <span
                        key={i}
                        className={cls(styles.sq, styles[tileColor(g.colors[i])])}
                      >
                        {ch.toUpperCase()}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}
    </div>
  )
}
