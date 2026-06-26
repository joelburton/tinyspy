import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * waffle's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the `help: ComponentType<{ onClose }>`
 * contract on GameManifest.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 460, height: 360 }}
      minWidth={300}
      minHeight={240}
    >
      <p>
        <strong>Unscramble the waffle.</strong> The grid spells six
        five-letter words — three across, three down — but the letters
        are jumbled. <strong>Swap two tiles</strong> at a time (tap one,
        then tap another) to put every letter in its place.
      </p>

      <p>Each tile is colored like Wordle, and updates as you swap:</p>
      <ul>
        <li><strong>Green</strong> — right letter, right spot.</li>
        <li><strong>Yellow</strong> — belongs in that word, wrong spot.</li>
        <li><strong>Gray</strong> — not in that word.</li>
      </ul>

      <p>
        You have a limited number of swaps. <strong>Coop:</strong> share
        one board and one budget — solve it together. <strong>Compete:</strong>{' '}
        same puzzle, your own board — whoever solves it in the fewest
        swaps wins.
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
