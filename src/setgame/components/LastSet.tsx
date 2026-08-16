import type { GamePlayer } from '../../common/lib/games'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { EventRow } from '../hooks/useGame'
import { Card } from './Card'
import styles from './LastSet.module.css'

/**
 * The last set taken, drawn as three small cards.
 *
 * **Anyone's claim, in both modes**, tagged with the finder's identity dot. The
 * panel answers "what just disappeared?" — and on a shared table the cards
 * usually left because someone ELSE took them, so scoping it to the viewer
 * would fall silent exactly when the board changed under them. In compete that
 * is not a leak either: everyone watched those three cards go.
 *
 * The slot is **reserved from the first render** — the panel keeps its height
 * with nothing in it — so the first claim of the game doesn't shove the whole
 * info column downwards. That is the standing no-reflow rule, and it is easy to
 * get wrong here because the empty state is only visible for the first thirty
 * seconds of a game.
 *
 * This is also what stands in for a turn log, which v1 deliberately does not
 * have: "what just happened" is answered, "everything that ever happened" is
 * not. See docs/games/setgame.md → Deferred.
 */
export function LastSet({
  claim,
  players,
}: {
  claim: EventRow | null
  players: GamePlayer[]
}) {
  const finder = claim ? players.find((p) => p.user_id === claim.user_id) : undefined

  return (
    <div className={styles.panel}>
      <div className={styles.label}>
        {/* Always "Last set", never "Your last set". In coop the panel shows
            whoever found it, so the possessive would say the opposite of what
            the panel means — and in compete, where it IS only yours, "Last set"
            is still true. Who found it is carried by the dot beside it rather
            than by the wording. */}
        {/* Always "Last set", never "Your last set" — in coop the panel shows
            whoever found it, so the possessive would say the opposite of what
            the panel means, and in compete (where it IS only yours) "Last set"
            is still true. Who found it is named beside it instead, in EVERY
            mode including solo: one shape for the line means it never has to be
            re-read as the roster changes. */}
        <span>Last set{claim ? ':' : ''}</span>
        {claim && <ActorDot actor={finder} fallback="Someone" show="both" />}
      </div>
      <div className={styles.cards}>
        {claim
          ? claim.cards.map((card) => (
              <div key={card} className={styles.mini}>
                <Card card={card} readOnly />
              </div>
            ))
          : /* Three empty frames rather than nothing: they hold the slot open at
               exactly the height the real cards will need, and they read as
               "this is where a set will appear" instead of as a gap. */
            [0, 1, 2].map((i) => <div key={i} className={styles.placeholder} />)}
      </div>
    </div>
  )
}
