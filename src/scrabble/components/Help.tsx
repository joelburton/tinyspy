import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * scrabble's help / rules modal — opened from the GamePage menu's "Help"
 * item. Implements the `help: ComponentType<{ onClose }>` contract.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 500, height: 460 }}
      minWidth={320}
      minHeight={280}
    >
      <p>
        <strong>Build words on the board from your rack of 7 tiles.</strong>{' '}
        Click a rack tile to hold it, then click an empty square to place it.
        Click a placed (not-yet-committed) tile to take it back.
      </p>
      <ul>
        <li>
          Your tiles for one turn must form a single across-or-down line and
          connect to what's already there. The first word must cross the
          center ★.
        </li>
        <li>
          <strong>Play word</strong> scores every word you make — the main
          word plus any crossing words — using the letter values and the
          colored premium squares. Using all 7 tiles scores a{' '}
          <strong>+50 bingo</strong>.
        </li>
        <li>
          A word that isn't in the dictionary is rejected with no penalty —
          your tiles just come back.
        </li>
        <li>
          A <strong>blank</strong> (no number) can be any letter — you choose
          when you play it, and it's fixed for the rest of the game.
        </li>
        <li>
          Stuck? Select tiles and <strong>Exchange</strong> them for new ones
          (needs ≥ 7 tiles left in the bag).
        </li>
      </ul>
      <p>
        <strong>Coop:</strong> one shared rack and score — plan the best word
        together over chat; anyone can play it. <strong>Compete:</strong>{' '}
        your own rack, taking turns; highest score when the tiles run out
        wins.
      </p>
      <p className="muted">
        Click any word in the move log to see its definition, or press{' '}
        <strong>~</strong> to look up any word.
      </p>
    </FloatingPanel>
  )
}
