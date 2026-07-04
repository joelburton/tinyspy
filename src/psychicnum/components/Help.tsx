import { FloatingPanel } from '../../common/components/panels/FloatingPanel'

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
        <strong>Find the three secret words.</strong> The board shows
        a set of words; click one or type it to guess. A correct guess
        turns green, a miss turns red. Stuck? <strong>Get a hint</strong>{' '}
        to reveal one of the secret words — it shows up in the guess log.
      </p>

      <p>
        <strong>Co-op:</strong> the group shares one board and one
        budget — find all three together to win.{' '}
        <strong>Compete:</strong> everyone races on their own board;
        first to find all three wins. Run out of guesses — or the
        timer — and the numbers are revealed and the game ends.
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
