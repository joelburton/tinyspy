import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * letterboxed's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help` contract on `GameManifest`.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 470, height: 470 }}
      minSize={{ width: 300, height: 280 }}
    >
      <p>
        Twelve letters sit three to a side of a square. Spell words from them
        until you have touched <b>all twelve</b>.
      </p>
      <h4>The two rules</h4>
      <ul>
        <li>
          <b>Every step crosses the box.</b> Two letters in a row may never come
          from the same side. (Clicking a letter that can't follow the one
          you're on simply does nothing.)
        </li>
        <li>
          <b>Each word starts where the last one ended.</b> The box fills in that
          first letter for you, and won't let you delete it.
        </li>
      </ul>
      <p>
        Letters can be reused as often as you like — it's covering all twelve
        that ends the game, inside the word limit the table picked.
      </p>
      <h4>Playing</h4>
      <ul>
        <li>Click letters to build a word; click the last one again to submit.</li>
        <li>Or type — Backspace rubs out a letter, Enter submits.</li>
        <li>
          <b>Undo</b> takes the last word back and gives you the word back too,
          so a dead end is never fatal. In turn-by-turn co-op it costs your go.
        </li>
      </ul>
      <p className="muted">
        Every board can be solved in two words. Whether you find those two is
        another matter.
      </p>
    </HelpPanel>
  )
}
