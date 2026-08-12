import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * strands' help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help` contract on `GameManifest`.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 460, height: 460 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        Every letter on the board belongs to exactly one hidden word. Find them all
        and the board is cleared.
      </p>
      <ul>
        <li>
          <strong>Trace a word</strong> by clicking letters in order. Letters must
          touch — sideways, up and down, or <em>diagonally</em>.
        </li>
        <li>
          <strong>Or type it.</strong> Once a word has a first letter, typing picks
          the neighbour that matches — usually there's only one. When several
          letters could be meant, they ring red: click the one you want. (A word's
          <em>first</em> letter is usually a click, since the same letter appears
          all over the board.)
        </li>
        <li>
          <strong>Click the last letter again</strong> to submit it — or press{' '}
          <kbd>Enter</kbd>, or the submit button beside the word. <kbd>⌫</kbd>{' '}
          (and the button left of the word) takes back one letter; clicking an
          earlier letter in your trace backs up to just before it, and clicking far
          away starts over from there.
        </li>
        <li>
          <strong>Theme words</strong> turn purple and stay. The <strong>spangram</strong>
          {' '}— the one that runs edge to edge and names the theme — turns gold.
        </li>
        <li>
          <strong>Other real words</strong> you find earn hint points. Fill the bar and
          the Hint button lights up: it rings the letters of one hidden word, but not
          the order, so you still have to work it out.
        </li>
      </ul>
      <p className="muted">
        The clue at the top of the info column is the theme, not a spoiler — it's there
        from the start.
      </p>
    </HelpPanel>
  )
}
