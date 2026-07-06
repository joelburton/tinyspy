import homeTitle from './homeTitle.svg?url'
import styles from './PuzpuzpuzWordmark.module.css'

/**
 * The big PuzPuzPuz wordmark — the colorful "Puz! Puz! Puz!" lockup shown as the
 * top image on the two `.card` shell screens: the pre-login `LoginScreen` (in
 * place of a text title) and the signed-in clubs-list `HomePage` (above the
 * "Welcome, …" heading). One component so the two stay in visual lockstep.
 *
 * Distinct from `<PuzpuzpuzLogo>`, which is the small 32px square logo used as a
 * menu trigger (ClubPage header). This is the wide horizontal wordmark; it carries
 * its own aspect ratio via the SVG viewBox, so the CSS only sets the width.
 *
 * Source SVG is at `src/common/components/branding/homeTitle.svg`, imported as
 * `?url` so Vite hashes the asset and the URL resolves in the build output.
 */
export function PuzpuzpuzWordmark() {
  return <img src={homeTitle} alt="PuzPuzPuz" className={styles.wordmark} />
}
