// cs-unmet

import { manifestFor } from '@/gametypes'
import { BlockingModal } from '../floating-panels/BlockingModal'
import { StandardButton } from '../buttons/StandardButton'
import paw from './paw.jpg'
import styles from './PawProtectionModal.module.css'

type Props = {
  // The gametype whose cap is spent, and the cap.
  gametype: string
  cap: number
  // The button, or Escape — the same act either way, because there is only one
  // way out. A card has no ✕.
  onDismiss: () => void
}

/**
 * Paw Protection's own card: the club's daily cap on this game is spent, said
 * kindly. A blocking modal — the player pressed Start and nothing is going to
 * happen, which is worth stopping for — but not an error's look: no outcome
 * color, no diagnostics, the picture beside the words and one button.
 *
 * A poster rather than the category's card (BlockingModal's `layout`): wider
 * on a desktop, and the whole screen on a phone, where the picture sits above
 * the words. The words name the game by its brand alone, and the cap and the
 * brand are bold (Joel, 2026-10-07).
 */
export function PawProtectionModal({ gametype, cap, onDismiss }: Props) {
  const brand = manifestFor(gametype)!.name
  const games = cap === 1 ? 'game' : 'games'
  return (
    <BlockingModal
      layout="poster"
      onClose={onDismiss}
      buttons={
        <StandardButton show="label" label="OK" weight="primary" onClick={onDismiss} autoFocus />
      }
    >
      <div className={styles.pawProtection}>
        <img src={paw} alt="" className={styles.picture} />
        <div className={styles.notice}>
          <h1 className={styles.heading}>Paw Protection</h1>
          <p className={styles.words}>
            For your health and safety, this club can only play{' '}
            <strong>{cap} {games}</strong> of <strong>{brand}</strong> per day. You have
            exceeded your limit.
          </p>
        </div>
      </div>
    </BlockingModal>
  )
}
