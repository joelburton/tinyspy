import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordle's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the `help: ComponentType<{ onClose }>`
 * contract on GameManifest. The frame (panel + title + Got-it) is the
 * shared `<HelpPanel>`; this is just the rules copy.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel brand={brand} onClose={onClose} size={{ width: 460, height: 380 }}>
      <p>
        <strong>Guess the hidden 5-letter word.</strong> Type a word and
        press Enter; each letter is colored as feedback:
      </p>
      <ul>
        <li><strong>Green</strong> — right letter, right spot.</li>
        <li><strong>Yellow</strong> — in the word, wrong spot.</li>
        <li><strong>Gray</strong> — not in the word.</li>
      </ul>

      <p>
        A guess must be a real 5-letter word, or it won't be accepted (and
        won't cost you a guess). You get a limited number of guesses
        (5–8, set at start; 6 is classic).
      </p>

      <p>
        <strong>Coop:</strong> one shared board and budget — either of you
        can guess, and you both see every guess. <strong>Compete:</strong>{' '}
        same hidden word, your own board — you don't see each other's
        guesses, and whoever solves it in the fewest guesses wins (ties
        go to whoever got there first).
      </p>

    </HelpPanel>
  )
}
