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
      size={{ width: 500, height: 520 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        <strong>The table.</strong> Eight consonant cards sit in four columns
        worth <strong>5, 4, 3 and 2</strong>. Everyone writes one word at the
        same time, using any letters at all; only the letters on the cards
        score.
      </p>
      <p>
        <strong>Scoring.</strong> Each card your word uses scores its column's
        value, and each card scores once: two Bs against one B card score one
        B. A card marked <strong>+1</strong> or <strong>+2</strong> adds that
        to its column's value. Letters with no card score nothing. The score of
        the word you are typing shows under the entry as you go.
      </p>
      <p>
        <strong>A round.</strong> Type a word and press <strong>Enter</strong>.
        The first word in starts the clock (<strong>30 seconds</strong>, unless
        Setup says otherwise); its player
        is the <strong>Fastest Wordsmith</strong> and cannot change it. Everyone
        else may keep submitting until the clock runs out, and their last word
        stands. Then every word is revealed and scored on a scoresheet, and the
        next round is dealt once everyone has pressed{' '}
        <strong>Start round</strong>. The Fastest Wordsmith holds{' '}
        <strong>No Flip</strong> next round: they may not be first in.
      </p>
      <p>
        <strong>Bonuses.</strong> Beat the Fastest Wordsmith's score for{' '}
        <strong>+1</strong> (+2 in rounds 4–6, +3 in round 7). As the Fastest,
        tie or beat enough opponents (all of them up to three) for{' '}
        <strong>+2</strong> (+3, +4).
      </p>
      <p>
        <strong>Words.</strong> A word must be in the dictionary, and new:
        nothing anyone scored in an earlier round, nor another form of it
        (fish, fishes and fishing are one word). A word that is refused costs
        nothing but the retype.
      </p>
      <p>
        <strong>The end.</strong> After the last round, your best rounds plus
        every bonus is your total. Highest total wins; a tie is shared.
      </p>
      <p><strong>Setup options:</strong></p>
      <ul>
        <li>
          <strong>Dictionary</strong> — how obscure a word may be.
        </li>
        <li>
          <strong>Length</strong> — seven rounds, the best five counted (the
          rulebook's game), or three rounds, the best two.
        </li>
        <li>
          <strong>Round</strong> — a timer of 1 to 120 seconds, or no timer: everyone
          takes as long as they need, a <strong>First Wordsmith</strong> named
          at the deal stands in for the Fastest, and the round ends once
          everyone has submitted.
        </li>
        <li>
          <strong>One word a round</strong> — with the timer, everyone's first
          word is final, and the round ends as soon as everyone has one in
          (or when the clock runs out). No timer always plays this way.
        </li>
      </ul>
    </GameHelpCompanion>
  )
}
