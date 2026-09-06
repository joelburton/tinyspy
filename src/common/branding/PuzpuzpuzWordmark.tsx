// cs-blessed-branding

import wordmark from './puzpuzpuz-wordmark.png'
import styles from './PuzpuzpuzWordmark.module.css'

/**
 * The big PuzPuzPuz wordmark — the colorful "Puz! Puz! Puz!" lockup shown as the
 * top image on the two `.card` shell screens: the pre-login `LoginScreen` (in
 * place of a text title) and the signed-in clubs-list `HomePage` (above the
 * "● <name> — welcome!" greeting). One component so the two stay in visual
 * lockstep.
 *
 * Distinct from `<PuzpuzpuzLogo>`, the small square mark that triggers the page
 * menu on home and on a club page. This is the wide horizontal wordmark, and it
 * is artwork rather than a control — nothing hangs off it.
 *
 * Source is `src/common/branding/puzpuzpuz-wordmark.png` — a raster, unlike the
 * rest of our branding. The artwork has a soft drop shadow and hand-drawn letter
 * outlines that don't survive a trace, so the PNG *is* the master. It ships at
 * 840px, ~2x the ~416px it renders at inside the `.card`; `width: 100%` on the
 * img scales it down and the intrinsic dimensions supply the aspect ratio.
 *
 * Its ground is opaque near-white and vanishes into the card's own light ground,
 * which is what keeps the white sticker outline around the letters — a
 * transparency key-out would eat that outline along with the background.
 *
 * A default import (not `?url`): Vite treats any image import as an asset URL,
 * hashing it into the build output either way.
 */
export function PuzpuzpuzWordmark() {
  return <img src={wordmark} alt="PuzPuzPuz" className={styles.wordmark} />
}
