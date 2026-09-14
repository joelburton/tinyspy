// cs-blessed-club-page

import type { ReactNode } from 'react'
import type { GameManifest } from '../manifest/gameManifest'
import { cls } from '../utils/cls'
import { GameLogo } from '../branding/GameLogo'
import { ModeBadge } from './ModeBadge'
import styles from './GameEntry.module.css'

/**
 * Where a listed game sits in the club's picture, as far as an entry draws it:
 * `current` is the one the club is looking at now (`is_current_view`),
 * `suspended` is still open but nobody is in it, `completed` is done.
 *
 * The word is `current`, not `active`: docs/states.md keeps view-state and
 * play-state apart, and "active" is the one that reads as both.
 */
export type ClubGameState = 'current' | 'suspended' | 'completed'

type Props = {
  // Drives the logo and the mode badge. Every caller has one in hand.
  manifest: GameManifest
  // The prominent first line — a gametype's name on the start list, a game's
  // generated title everywhere else. Always present: `common.games.title` is
  // `not null`, and `useClubGames` builds every row from one.
  title: ReactNode
  // True for the current-game callout, which takes a larger title than a list
  // row. Nothing else differs between the two.
  isCurrentGameCard?: boolean
  // The left end of the second line, as ONE node: `.meta` is a flex row, so
  // several children would be spread across it by the gap rather than read as
  // one sentence.
  meta: ReactNode
  // The right end of the second line, already worded. Omit it and the second
  // line is just `meta` — which is the start list, where there is no game yet
  // to have been played.
  date?: string
  // Suppresses the badge in a solo club. See ModeBadge for the AI exception.
  soloClub: boolean
  // Drives the corner flag. Omit it for an entry that is not a game yet — the
  // start list — where there is nothing to be open or done.
  state?: ClubGameState
}

/**
 * One game entry's face: the logo, and beside it a title line over a smaller
 * second line.
 *
 *   [logo]  <title> <mode badge>
 *           <meta> ······················ <date>
 *
 * Rendered by all three of ClubPage's game entries — the current-game card, a
 * "Your games" row, a "Start a new game" row — so the page's three surfaces
 * are one object drawn three times rather than three that happen to match.
 *
 * **It returns a fragment and owns no box.** A list row's box, hover, cursor
 * ring and click belong to `<SelectionList>`; the current-game card's border
 * and its `<Link>` belong to `<CurrentGameCard>`. The corner flag is drawn
 * here anyway: it positions against whichever of those contains it, so owning
 * a box was never what drawing it required. A caller's delete button stays the
 * caller's — it is a control, not part of the face.
 *
 * `date`, `state` and `isCurrentGameCard` are optional, and the start list is
 * why: it has no game yet to have been played, to be open or done, or to be
 * the current one.
 */
export function GameEntry({
  manifest, title, isCurrentGameCard = false, meta, date, soloClub, state,
}: Props) {
  return (
    <>
      {state && state !== 'completed' && (
        // A literal triangle rather than a colored circle, which would collide
        // with the member-color dot vocabulary — "flag in the corner" is its
        // own register, with no room to read it as "the yellow player is in
        // this game". aria-hidden because the status label says it in words.
        <span
          className={cls(
            styles.openFlag,
            state === 'current' ? styles.openFlagCurrent : styles.openFlagSuspended,
          )}
          aria-hidden="true"
        />
      )}
      <GameLogo manifest={manifest} />
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <span className={cls(styles.title, isCurrentGameCard && styles.titleCurrentGame)}>
            {title}
          </span>
          <span className={styles.badgeSlot}>
            <ModeBadge
              mode={manifest.mode}
              soloClub={soloClub}
              aiOpponent={manifest.aiOpponent}
            />
          </span>
        </div>
        <div className={styles.meta}>
          <span>{meta}</span>
          {date && <span className={styles.date}>{date}</span>}
        </div>
      </div>
    </>
  )
}
