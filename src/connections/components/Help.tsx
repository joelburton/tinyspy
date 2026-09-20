// cs-blessed-connections

import { GameHelpCompanion } from '@/common/game-page/GameHelpCompanion'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * connections' help modal — the rules, opened from the GamePage menu's Help
 * item (the manifest's `help` contract).
 *
 * The two modes are named apart here because the sharing rule is the thing
 * this game is easiest to get wrong about: coop shares every pick, a race
 * shares none of them.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <GameHelpCompanion brand={brand} onClose={onClose} size={{ width: 460, height: 440 }}>
      <p>
        <strong>Find four hidden categories of four.</strong> The 16 tiles on
        the board belong to four secret categories. Pick four tiles you
        think share a category and Submit. Same puzzles as NYT
        Connections.
      </p>

      <h3>Guesses</h3>
      <ul>
        <li>
          <strong>Correct</strong> — the four tiles slide up into a
          colored band naming the category.
        </li>
        <li>
          <strong>One away</strong> — three of your four belong
          together; one doesn&rsquo;t. It still costs a mistake.
        </li>
        <li>
          <strong>Wrong</strong> — costs a mistake. Four mistakes and
          you&rsquo;re out.
        </li>
      </ul>

      <h3>Together or racing</h3>
      <ul>
        <li>
          <strong>Coop</strong> — one board, one set of four mistakes,
          and everyone&rsquo;s picks are shared: a teammate&rsquo;s tile
          is framed in their color.
        </li>
        <li>
          <strong>Race</strong> — the same puzzle, worked apart. Your
          picks are yours alone; of a rival you see how many categories
          they&rsquo;ve found and whether they&rsquo;re still in. First
          to all four wins, and four mistakes puts you out while the
          others race on.
        </li>
      </ul>

      <p>
        Stuck? <strong>Hints</strong> in the info column hands you one
        tile from a category — yours alone, and nobody is told. When the
        game ends the board stays as you left it: your bands, and the
        tiles you never cracked. <strong>Reveal</strong> shows the
        categories nobody got, if you ask for them.
      </p>

    </GameHelpCompanion>
  )
}
