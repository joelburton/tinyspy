import { cls } from '../../lib/util/cls'
import { MODE_LABEL } from '../../lib/games'
import styles from './ModePill.module.css'

type Props = {
  mode: 'coop' | 'compete'
  /** When true (the club's handle starts with '=', i.e. a solo club),
   *  NO pill renders — neither "Co-op" (no one to cooperate with) nor
   *  "Compete" (a solo member may have enabled a 2-player game like
   *  bananagrams, but "Compete" makes no sense with one player). Mode is
   *  simply noise on a solo club's surfaces. Defaults to false. */
  soloClub?: boolean
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
export function ModePill({ mode, soloClub = false }: Props) {
  if (soloClub) return null
  return (
    <span className={cls(styles.pill, styles[mode])}>{MODE_LABEL[mode]}</span>
  )
}
