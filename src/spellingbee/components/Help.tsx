import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * spellingbee's help / rules modal — opened from the "Help" item
 * in the GamePage menu. Implements the common
 * `help: ComponentType<{ onClose }>` contract on `GameManifest`.
 *
 * Phase 3 copy: the rules-of-the-game in 4 short bullets, plus
 * a footnote on the rank ladder (which the UI doesn't render
 * yet — that's Phase 4). Same FloatingPanel scaffold the other
 * games use.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 460, height: 420 }}
      minWidth={300}
      minHeight={260}
    >
      <p>
        Use the 7 letters on the honeycomb to make as many words
        as you can. Every word must:
      </p>
      <ul>
        <li>Be at least 4 letters long.</li>
        <li>Use only letters from the honeycomb (letters can repeat).</li>
        <li>
          Include the <strong>center letter</strong> (the yellow one).
        </li>
      </ul>
      <p>Scoring:</p>
      <ul>
        <li>4-letter word: 1 point.</li>
        <li>5+-letter word: 1 point per letter.</li>
        <li>
          A word that uses <strong>all 7</strong> letters is a{' '}
          <strong>pangram</strong> — bonus +10 on top of the
          length score. Every board has at least one.
        </li>
      </ul>
      <p>
        Click the letters or just type. Use Backspace to delete,
        Enter to submit, and Space (or the ⟲ button) to shuffle
        the outer letters.
      </p>
    </FloatingPanel>
  )
}
