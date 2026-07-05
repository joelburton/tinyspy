import { HelpPanel } from '../../common/components/game/HelpPanel'
import styles from './Help.module.css'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * codenamesduet's help / rules modal — opened from the "Help" item in
 * the GamePage menu. Implements the common
 * `help: ComponentType<{ onClose }>` contract on `GameManifest`.
 *
 * Renders into the shared `<HelpPanel>` (the FloatingPanel frame + title +
 * Got-it): draggable + resizable so a user can shrink it into a corner while
 * reading the chat or watching the board, no backdrop so other UI stays
 * interactable.
 *
 * The parent (`GamePage`) mounts this component only when the
 * help modal is open, so there's no `open` prop — `onClose`
 * unmounts it. Each open lands centered; position isn't persisted.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
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
        You see a 5×5 grid, tinted with <em>your</em> view of each card:
      </p>
      <ul>
        <li><strong className={styles.hintAgent}>Green</strong> — an agent (you're hunting these)</li>
        <li><strong className={styles.hintNeutral}>Tan</strong> — a bystander</li>
        <li><strong className={styles.hintAssassin}>Red</strong> — the assassin (revealing one ends the game)</li>
      </ul>
      <p>
        Your partner sees the same 25 words but with their <em>own</em> color view — different
        agents, different assassin. Together you have 15 unique agents to find.
      </p>

      <h3>Turns</h3>
      <ol>
        <li>The clue-giver types a clue: a <strong>count</strong> + a <strong>word or phrase</strong>.</li>
        <li>The partner guesses one card at a time on the board.</li>
        <li>Hitting a green agent? Keep going.</li>
        <li>Hitting a tan? Your turn ends — one of your turns is used.</li>
        <li>Hitting an assassin? Game over.</li>
      </ol>
      <p>
        You have <strong>9 turns</strong>. When they run out, you enter sudden death —
        any wrong reveal loses the game.
      </p>

    </HelpPanel>
  )
}
