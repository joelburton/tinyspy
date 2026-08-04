import homeTitle from './homeTitle.png'
import styles from './PuzpuzpuzWordmark.module.css'

/**
 * The big PuzPuzPuz wordmark — the colorful "Puz! Puz! Puz!" lockup shown as the
 * top image on the two `.card` shell screens: the pre-login `LoginScreen` (in
 * place of a text title) and the signed-in clubs-list `HomePage` (above the
 * "Welcome, …" heading). One component so the two stay in visual lockstep.
 *
 * Distinct from `<PuzpuzpuzLogo>`, which is the small square logo used as a menu
 * trigger (ClubPage header). This is the wide horizontal wordmark.
 *
 * Source is `src/common/components/branding/homeTitle.png` — a raster, unlike the
 * rest of our branding. The artwork has a soft drop shadow and hand-drawn letter
 * outlines that don't survive a trace, so the PNG *is* the master. It ships at
 * 840px, ~2x the ~416px it renders at inside the `.card`; `width: 100%` on the
 * img scales it down and the intrinsic dimensions supply the aspect ratio.
 *
 * Its ground is opaque near-white, which disappears against `.card`'s
 * `--color-surface` (#ffffff) — keeping the white sticker outline around the
 * letters, which a transparency key-out would eat along with the background.
 *
 * A default import (not `?url`): Vite treats any image import as an asset URL,
 * hashing it into the build output either way.
 */
export function PuzpuzpuzWordmark() {
  return <img src={homeTitle} alt="PuzPuzPuz" className={styles.wordmark} />
}
