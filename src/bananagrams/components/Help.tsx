import { HelpPanel } from '../../common/components/game/HelpPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * bananagrams's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help: ComponentType<{ onClose }>`
 * contract on `GameManifest`.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 460, height: 420 }}
      minSize={{ width: 300, height: 260 }}
    >
      <p>
        <strong>Race to lay out all your tiles in a crossword.</strong> You
        each get a private board and a hand of letter tiles. Build words that
        connect — across and down — until your hand is empty.
      </p>

      <p>
        <strong>Drag</strong> tiles from your hand onto the board, or{' '}
        <strong>click a cell</strong> and type to place a word from the keyboard.
        Only you see your board; everyone else sees just how many tiles you have
        left to place.
      </p>

      <p>
        <strong>Peel! 🍌</strong> — when your hand is empty, hit{' '}
        <strong>Peel!</strong> Everyone draws another tile from the shared bunch
        and the race keeps going. If the bunch is too low to refill everyone,
        the peeler <strong>goes out and wins</strong> — Bananas!
      </p>

      <p>
        <strong>Stuck with an awkward tile?</strong> Drag it to the{' '}
        <strong>dump slot</strong> to trade it for three from the bunch (the cost
        of getting unstuck). Use <strong>⟲ Shuffle hand</strong> any time to
        reorder your hand for a fresh look.
      </p>

      <p>
        Your words don’t have to be real — placement isn’t checked, so anything
        that fills your board counts. Had enough? <strong>Concede</strong> to
        drop out and take the loss — the others keep racing, and if everyone
        concedes the game ends.
      </p>

    </HelpPanel>
  )
}
