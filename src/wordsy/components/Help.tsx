// cs-unmet

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * wordsy's help / rules modal — opened from the "Help" item in the GamePage
 * menu. Implements the common `help` contract on `Manifest`.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion
      brand={brand}
      onClose={onClose}
      size={{ width: 480, height: 470 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        Eight consonant cards sit in four columns worth <strong>5, 4, 3 and
        2</strong>. Everyone writes one word at once, using any letters at
        all — only the letters on the cards score.
      </p>
      <p>
        A word scores each card it uses at its column's value, once per card:
        two Bs against one B card score one B. Red cards add <strong>+1</strong>,
        blue cards <strong>+2</strong>.
      </p>
      <p>
        Type a word and press <strong>Enter</strong>. The first word in starts
        a <strong>30-second</strong> clock, and that player — the Fastest
        Wordsmith — can't change it. Everyone else may submit again until the
        clock runs out; your last word stands. Then every word is revealed and
        scored, and the next round starts once everyone has pressed{' '}
        <strong>Start round</strong>. With <strong>one word a round</strong>, everyone's first word
        is final, and the round ends once everyone has one in.
      </p>
      <p>
        <strong>Bonuses:</strong> beat the Fastest Wordsmith for +1 (+2 in
        rounds 4–6, +3 in round 7); as the Fastest, tie or beat enough
        opponents for +2 (+3, +4). The Fastest holds <strong>No Flip</strong>{' '}
        next round and can't be first in.
      </p>
      <p>
        A word must be in the dictionary, and new: nothing anyone scored in an
        earlier round, and no other form of it (fish, fishes and fishing are
        one word).
      </p>
      <p>
        After seven rounds, your best five rounds plus every bonus is your
        total — in a short game, three rounds and the best two. Highest total
        wins; a tie is shared.
      </p>
    </GameHelpCompanion>
  )
}
