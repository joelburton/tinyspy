// cs-blessed-club-page

import { cls } from '../utils/cls'
import { MODE_LABEL } from '../manifest/gameManifest'
import styles from './ModeBadge.module.css'

type Props = {
  mode: 'coop' | 'compete'
  // True for a solo club, which suppresses the badge — mode is noise with one
  // member. The exception is a compete game that seats an AI opponent (see
  // `aiOpponent`), which renders "AI Compete" instead.
  soloClub?: boolean
  // The manifest's `aiOpponent` flag: this compete variant plays against an
  // autonomous AI when solo (scrabble), unlike a bare "compete for 1"
  // (bananagrams), which reads as coop and gets no badge. Solo clubs only.
  aiOpponent?: boolean
}

/**
 * The badge labeling a gametype's interaction mode — "Co-op" or "Compete".
 *
 * Mode lives on the manifest (`GameManifest.mode`) rather than in the
 * gametype's display name, and this badge is how it reaches the player: it
 * goes beside that name wherever the name appears. So a coop + compete
 * sibling pair reads as one name told apart by its badge.
 *
 * `mode` is required; `soloClub` and `aiOpponent` together decide whether a
 * solo club sees anything at all. See common/club/doc.md → the mode badge.
 */
export function ModeBadge({ mode, soloClub = false, aiOpponent = false }: Props) {
  if (soloClub) {
    // Solo club: no badge (noise with one member) — unless this compete
    // variant actually seats an AI opponent, which is worth labeling. A
    // compete WITHOUT an AI is "compete for 1" (a race with nobody to beat):
    // effectively coop, so it goes bare the way coop does.
    if (mode !== 'compete' || !aiOpponent) return null
    return <span className={cls('badge', styles.compete)}>AI Compete</span>
  }
  return (
    <span className={cls('badge', styles[mode])}>{MODE_LABEL[mode]}</span>
  )
}
