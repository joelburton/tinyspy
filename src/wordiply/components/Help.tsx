import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordiply's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help` contract on `GameManifest`.
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
        You're given a short <strong>starter</strong> — a combination of 2–4
        letters (not always a word). You have <strong>five guesses</strong>.
        Every guess must:
      </p>
      <ul>
        <li>
          <strong>Contain the starter</strong> as a run of letters (e.g. for
          starter <strong>PART</strong>: PARTY, aPART, dePARTs).
        </li>
        <li>Be <strong>longer</strong> than the starter.</li>
        <li>Be a real word in the dictionary.</li>
      </ul>
      <p>
        After each guess you'll see <strong>how long the word was</strong> —
        that's it. The goal is your <strong>longest</strong> word.
      </p>
      <p>At the end you'll see:</p>
      <ul>
        <li>
          Your <strong>length score</strong> — how close your longest word got
          to the longest possible word (as a %).
        </li>
        <li>
          Your <strong>letter count</strong> — the total letters across all
          five guesses.
        </li>
        <li>The longest possible word.</li>
      </ul>
      <p>
        In compete, the longest word wins; a tie breaks on the higher letter
        count (then, if timed, the faster finish). Just type, and press Enter
        to submit.
      </p>
    </HelpPanel>
  )
}
