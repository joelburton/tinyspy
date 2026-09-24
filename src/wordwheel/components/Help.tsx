// cs-met-wordwheel

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordwheel's help / rules modal — opened from the "Help" item in the
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
        Use the 9 letters on the wheel to make as many words as you can. Every
        word must:
      </p>
      <ul>
        <li>Be at least 4 letters long.</li>
        <li>
          Include the <strong>center letter</strong> (the purple one).
        </li>
        <li>
          Use each tile <strong>at most once</strong> — the same letter can
          appear on two tiles (even the center), and then a word may use it
          twice, but never more times than it has tiles.
        </li>
      </ul>
      <p>Scoring:</p>
      <ul>
        <li>4-letter word: 1 point.</li>
        <li>5+-letter word: 1 point per letter.</li>
        <li>
          A word that uses <strong>all 9</strong> tiles is a{' '}
          <strong>pangram</strong> — bonus +15 on top of the length score. A
          random board always has at least one; letters you pick yourself may
          not.
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
        <strong>Compete:</strong> everyone plays the same wheel on
        their own list — you see each other's rank but not their words —
        and the first to reach the target rank wins.
      </p>
      <p>
        Click the letters or just type. Use Backspace to delete, Enter to submit,
        and the ⟲ button (or <kbd>⌥Z</kbd>) to shuffle the outer letters.
      </p>
    </GameHelpCompanion>
  )
}
