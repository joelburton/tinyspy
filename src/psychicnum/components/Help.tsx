// cs-unmet

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * psychicnum's help / rules modal — opened from the "Help" item
 * in the GamePage menu. Implements the common
 * `help: ComponentType<{ onClose }>` contract on `GameManifest`.
 *
 * The two assists are named apart here because they are the pair
 * this game is easiest to get wrong about: a hint gives the clue, a
 * spoiler gives the word.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion
      brand={brand}
      onClose={onClose}
      size={{ width: 460, height: 400 }}
      minSize={{ width: 280, height: 200 }}
    >
      <p>
        <strong>Find the three secret words.</strong> The board shows a
        set of words; click one or type it to guess. A correct guess
        turns green and a miss turns red — both for good, so the board
        keeps the record of what you&rsquo;ve ruled out. Every guess
        costs one from your budget.
      </p>

      <p>
        Stuck? Two kinds of help, neither of which costs a guess. A{' '}
        <strong>hint</strong> gives you the dictionary clue for one
        secret you haven&rsquo;t found — not the word. A{' '}
        <strong>spoiler</strong> hands you the word itself, though you
        still have to guess it. Both land in the turn log, where they
        stay.
      </p>

      <p>
        <strong>Co-op:</strong> one board, one budget, everyone&rsquo;s
        guesses in view — find all three together to win.{' '}
        <strong>Compete:</strong> the same words, but your guesses are
        yours alone and so is your budget; you see how many each rival
        has found and how much budget they have left, never which
        words. First to all three wins.
      </p>

      <p>
        Run out of guesses — or out of time, if the timer is on — and
        the game is over. The secrets aren&rsquo;t shown unless you
        ask: <strong>Reveal solution</strong> is there at the end, and
        you can turn it back off.
      </p>

    </GameHelpCompanion>
  )
}
