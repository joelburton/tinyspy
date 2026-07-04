import { FloatingPanel } from '../../common/components/panels/FloatingPanel'

type Props = {
  onClose: () => void
  brand: string
}

/**
 * stackdown's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the `help: ComponentType<{ onClose }>`
 * contract on GameManifest.
 */
export function Help({ onClose, brand }: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={{ width: 480, height: 420 }}
      minWidth={300}
      minHeight={260}
    >
      <p>
        <strong>Clear the stack by spelling words.</strong> Thirty lettered
        tiles are stacked on a grid — higher tiles cover the ones beneath
        them. Only <strong>exposed</strong> tiles (nothing on top) can be
        picked.
      </p>
      <ul>
        <li>
          Click exposed tiles in order to build a word. The letters appear
          in the slots below the board.
        </li>
        <li>
          The fifth letter <strong>submits</strong> automatically. A real
          5-letter word is accepted and those tiles leave for good,
          exposing what was underneath.
        </li>
        <li>
          Not a word? It's logged as a miss and the tiles return to the
          board. Click a tile in the word to take it back (and every tile
          after it).
        </li>
      </ul>
      <p>
        Every board is built to be fully solvable — there are exactly six
        words hidden in the stack, and clearing all six wins.
      </p>
      <p>
        <strong>Coop:</strong> one shared stack — anyone can place the next
        tile, and you build each word together. <strong>Compete:</strong>{' '}
        same stack, your own copy — first to clear all six wins (you only
        see each other's running word counts).
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
