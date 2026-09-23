// cs-met-codenamesduet

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'
import styles from './Help.module.css'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * codenamesduet's help / rules modal — opened from the "Help" item in the
 * GamePage menu; the manifest's `help` contract. What your key card shows, how
 * a turn runs, the finished-player hand-off and sudden death, in the shared
 * `<GameHelpCompanion>` scaffold.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion
      brand={brand}
      onClose={onClose}
      size={{ width: 480, height: 540 }}
      minSize={{ width: 320, height: 300 }}
    >
      <p>
        You and your partner are spies trying to identify <strong>15 agents</strong> hidden
        among 25 words on the board.
      </p>

      <h3>What you see</h3>
      <p>
        Each word has a small square in its corner showing what <em>your</em> key
        card says about it:
      </p>
      <ul>
        <li><strong className={styles.hintAgent}>Green</strong> — an agent (you're hunting these)</li>
        <li><strong className={styles.hintNeutral}>Tan</strong> — a bystander</li>
        <li><strong className={styles.hintAssassin}>Red</strong> — an assassin (revealing one ends the game)</li>
      </ul>
      <p>
        Your card has 9 agents, 13 bystanders and 3 assassins. Your partner sees the
        same words with a different card; between you there are 15 agents to find.
      </p>

      <h3>Turns</h3>
      <ol>
        <li>The clue-giver types a <strong>count</strong> and <strong>one word</strong>.</li>
        <li>The partner guesses one word at a time.</li>
        <li>An agent — keep going. A bystander — the turn ends and one turn is spent. An assassin — game over.</li>
        <li>The guesser can stop at any time with <strong>Pass &amp; End Turn</strong>; that spends a turn too.</li>
      </ol>
      <p>
        A bystander you hit is closed to you, but your partner can still guess it — it
        may be their agent. Once all your agents are found, your partner gives every
        clue from then on.
      </p>
      <p>
        You have the turns chosen at setup (9, 10 or 11). When they run out, it's{' '}
        <strong>sudden death</strong>: no more clues, either of you guesses from
        memory, and anything but an agent loses.
      </p>
    </GameHelpCompanion>
  )
}
