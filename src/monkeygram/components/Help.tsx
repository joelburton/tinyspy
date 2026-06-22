import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
}

/**
 * MonkeyGram's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help: ComponentType<{ onClose }>`
 * contract on `GameManifest`.
 */
export function Help({ onClose }: Props) {
  return (
    <FloatingPanel
      title="How to play MonkeyGram"
      onClose={onClose}
      defaultSize={{ width: 460, height: 420 }}
      minWidth={300}
      minHeight={260}
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
        that fills your board counts. (No timer; the friends can also end a
        stalled game from the menu.)
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
