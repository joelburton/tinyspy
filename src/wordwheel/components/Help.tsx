import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordwheel's help / rules modal — opened from the "Help" item in the GamePage
 * menu. Implements the common `help: ComponentType<{ onClose }>` contract on
 * `GameManifest`. Renders into the shared `<HelpPanel>` scaffold every game uses.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 460, height: 440 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        Use the 9 letters on the wheel to make as many words as you can. Every
        word must:
      </p>
      <ul>
        <li>Be at least 4 letters long.</li>
        <li>
          Include the <strong>center letter</strong> (the red one).
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
          <strong>pangram</strong> — bonus +15 on top of the length score. Every
          board has at least one.
        </li>
      </ul>
      <p>
        Click the letters or just type. Use Backspace to delete, Enter to submit,
        and Space (or the ⟲ button) to shuffle the outer letters.
      </p>
    </HelpPanel>
  )
}
