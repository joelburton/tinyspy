// cs-met-connections

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * connections's help modal — the rules, opened from the GamePage menu's Help
 * item (the manifest's `help` contract).
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion brand={brand} onClose={onClose} size={{ width: 440, height: 360 }}>
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

    </GameHelpCompanion>
  )
}
