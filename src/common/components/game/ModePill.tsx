import { cls } from '../../lib/util/cls'
import { MODE_LABEL } from '../../lib/games'
import styles from './ModePill.module.css'

type Props = {
  mode: 'coop' | 'compete'
  /** When true (the club's handle starts with '=', i.e. a solo club),
   *  the mode pill is suppressed (mode is noise with one member) — EXCEPT
   *  for a compete game that seats an AI opponent (see `aiOpponent`),
   *  which renders "AI Compete". Defaults to false. */
  soloClub?: boolean
  /** The manifest's `aiOpponent` flag: this compete variant plays against
   *  an autonomous AI when solo (scrabble), vs a bare "compete for 1"
   *  (bananagrams), which reads as coop and gets no solo pill. Only
   *  consulted for solo clubs. */
  aiOpponent?: boolean
}

/**
 * A small colored pill labeling a gametype's interaction mode —
 * "Co-op" (teal) or "Compete" (purple).
 *
 * The mode lives on the manifest (`GameManifest.mode`), not baked into
 * the gametype's display name; this pill is how it reaches the user.
 * Rendered next to a gametype's name wherever that name appears — the
 * per-gametype Start buttons, the club's games list, the club editor.
 * Because the name no longer carries "(coop)" / "(compete)", a coop +
 * compete sibling pair reads as the same name distinguished by pill.
 *
 * See docs/ui.md → "Mode pills".
 */
export function ModePill({ mode, soloClub = false, aiOpponent = false }: Props) {
  if (soloClub) {
    // Solo club: no mode pill (noise with one member) — unless this compete
    // variant actually seats an AI opponent, which is worth labeling. A
    // compete WITHOUT an AI is "compete for 1" (a race with nobody to beat):
    // effectively coop, so it stays pill-less like coop does.
    if (mode !== 'compete' || !aiOpponent) return null
    return <span className={cls(styles.pill, styles.compete)}>AI Compete</span>
  }
  return (
    <span className={cls(styles.pill, styles[mode])}>{MODE_LABEL[mode]}</span>
  )
}
