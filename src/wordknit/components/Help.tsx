import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordknit's help / rules modal — opened from the "Help" item in
 * the GamePage menu. Implements the common
 * `help: ComponentType<{ onClose }>` contract on `GameManifest`.
 *
 * **Placeholder content.** wordknit's gameplay is the NYT
 * Connections puzzle (find the four hidden groups of four words),
 * which most players already know. Real rules copy is deferred
 * until we have a unified visual register for help across games
 * — for now, a brief reminder + a pointer is enough for the
 * friends who actually play.
 *
 * tinyspy's `Help.tsx` is the visual model when richer copy lands.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 440, height: 360 }}
      minWidth={300}
      minHeight={240}
    >
      <p>
        <strong>Find four hidden groups of four.</strong> The 16 tiles on
        the board belong to four secret categories. Pick four tiles
        you think share a category and Submit.
      </p>

      <h3>Guesses</h3>
      <ul>
        <li>
          <strong>Correct</strong> — the four tiles slide up into a
          colored band naming the category.
        </li>
        <li>
          <strong>One away</strong> — three of your four belong
          together; one doesn't.
        </li>
        <li>
          <strong>Wrong</strong> — costs one mistake. Four mistakes
          and the game ends with the categories revealed.
        </li>
      </ul>

      <p>
        Same puzzle as NYT Connections. Selections are shared across
        everyone in the game — when a peer clicks a tile, you see it
        framed in their color.
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
