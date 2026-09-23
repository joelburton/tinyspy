// cs-blessed-spellingbee

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * spellingbee's help / rules modal — opened from the "Help" item in the
 * GamePage menu; the manifest's `help` contract. The word rules, the scoring,
 * bonus words, the two modes and how to enter a word, in the shared
 * `<GameHelpCompanion>` scaffold. One text for both modes: the modal is not
 * told which one is being played.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion
      brand={brand}
      onClose={onClose}
      size={{ width: 460, height: 500 }}
      minSize={{ width: 300, height: 260 }}
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
          length score. A random board always has at least one;
          letters you pick yourself may not.
        </li>
      </ul>
      <p>
        Some words are bonus words, marked with a dot (•). They score
        like any other word but aren't part of the goal, so your score
        can pass the total shown.
      </p>
      <p>
        <strong>Coop:</strong> everyone finds words for one shared list
        and score, and a word counts once, for whoever finds it first. If
        you chose a target rank, reaching it together wins.{' '}
        <strong>Compete:</strong> everyone plays the same honeycomb on
        their own list — you see each other's rank but not their words —
        and the first to reach the target rank wins.
      </p>
      <p>
        Click the letters or just type. Use Backspace to delete,
        Enter to submit, and the ⟲ button (or <kbd>⌥Z</kbd>) to shuffle
        the outer letters.
      </p>
    </GameHelpCompanion>
  )
}
