import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * setgame's help / rules modal — opened from the "Help" item in the GamePage
 * menu. Implements the common `help` contract on `GameManifest`.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 480, height: 470 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        Every card has four things about it: <strong>how many</strong> symbols
        (one, two or three), their <strong>color</strong>, their{' '}
        <strong>shape</strong>, and their <strong>shading</strong> (solid,
        striped or hollow).
      </p>
      <p>
        A <strong>set</strong> is three cards where, for <em>each</em> of those
        four things, the three cards are either <strong>all the same</strong> or{' '}
        <strong>all different</strong>. Two-and-one is never a set — that is the
        whole rule, and the only one worth memorizing.
      </p>
      <ul>
        <li>
          Three cards that are all one color, all solid, all ovals, showing 1,
          2 and 3 symbols — a set (three attributes the same, one all
          different).
        </li>
        <li>
          Three cards all showing one symbol, all the same color, all solid,
          but a diamond, a squiggle and an oval — also a set.
        </li>
        <li>
          Two solid cards and a striped one — <strong>not</strong> a set,
          whatever else matches.
        </li>
      </ul>
      <p>
        Click three cards, or type the letters underneath them.{' '}
        <strong>Backspace</strong> clears your picks. Three that aren't a set
        are simply refused and your picks clear — there is no penalty for
        looking.
      </p>
      <p>
        When a set is claimed those cards leave and new ones drop into the same
        places. If the table ever has no set at all, three more cards are dealt
        — so there is always something to find.
      </p>
      <p>
        The game ends when the deck is empty and the cards left hold no set. In
        co-op that is a win: <strong>clearing the deck</strong> means no sets
        left to find, not using up every card — ending with six or nine
        stranded is perfectly normal. In compete, whoever claimed the most sets
        wins, and a tie is a tie.
      </p>
    </HelpPanel>
  )
}
