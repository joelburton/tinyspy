import { cls } from '../lib/cls'
import { MODE_LABEL } from '../lib/games'
import styles from './ModePill.module.css'

type Props = {
  mode: 'coop' | 'compete'
  /** When true (the club's handle starts with '=', i.e. a solo club),
   *  the co-op pill is suppressed — "Co-op" is noise when there's only
   *  one player. The compete pill is unaffected (a solo club can't host
   *  compete games, so in practice this just means "hide Co-op in solo
   *  clubs"). Defaults to false. */
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
  if (soloClub && mode === 'coop') return null
  return (
    <span className={cls(styles.pill, styles[mode])}>{MODE_LABEL[mode]}</span>
  )
}
