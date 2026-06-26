import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * psychicnum's help / rules modal — opened from the "Help" item
 * in the GamePage menu. Implements the common
 * `help: ComponentType<{ onClose }>` contract on `GameManifest`.
 *
 * **Placeholder content.** psychicnum is a deliberately minimal
 * toy whose job is to exercise the multi-game architecture (see
 * docs/psychicnum.md). The rules fit in three sentences; we
 * keep the modal small to match.
 *
 * codenamesduet's `Help.tsx` is the visual model when richer copy is
 * useful here (unlikely — psychicnum is on the chopping block
 * post-beta).
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 420, height: 280 }}
      minWidth={280}
      minHeight={200}
    >
      <p>
        <strong>Guess the secret number 1–10.</strong> Everyone in
        the game can guess; you share seven tries total.
      </p>

      <p>
        First correct guess wins for the whole group. Run out of
        tries — or the timer — and the number is revealed and the
        game ends.
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
