// cs-unmet

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordleone's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the `help: ComponentType<{ onClose, brand }>`
 * contract on GameManifest. The frame (panel + title + Got-it) is the
 * shared `<GameHelpCompanion>`; this is just the rules themselves.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion brand={brand} onClose={onClose} size={{ width: 460, height: 400 }}>
      <p>
        <strong>One row is already played.</strong> The top word has been
        colored against a hidden 5-letter word:
      </p>
      <ul>
        <li><strong>Green</strong> — right letter, right spot.</li>
        <li><strong>Yellow</strong> — in the word, wrong spot.</li>
        <li><strong>Gray</strong> — not in the word.</li>
      </ul>

      <p>
        The hidden word is the only legal word that fits those colors. Find it.
      </p>

      <p>
        A wrong guess is a <strong>miss</strong>: it tells you only that it was
        wrong. Guesses are unlimited. A word that isn't in the dictionary, or is
        already on the board, is refused and costs nothing. How obscure a word
        may be is a setup choice.
      </p>

      <p>
        <strong>Coop:</strong> one shared board — anyone can guess, and
        everyone sees every guess. <strong>Compete:</strong>{' '}
        the same puzzle on a board of your own — nobody sees your guesses until
        the game ends, and whoever solves it with the fewest misses wins (ties go
        to whoever got there first).
      </p>
    </GameHelpCompanion>
  )
}
