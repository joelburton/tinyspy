import { FloatingPanel } from '../../common/components/FloatingPanel'

type Props = {
  onClose: () => void
}

/**
 * MonkeyGram's help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the common `help: ComponentType<{ onClose }>`
 * contract on `GameManifest`.
 *
 * v1 copy: the bank loop (peel/dump) and word validation aren't in yet,
 * so the rules are simply "place all your starter tiles first."
 */
export function Help({ onClose }: Props) {
  return (
    <FloatingPanel
      title="How to play MonkeyGram"
      onClose={onClose}
      defaultSize={{ width: 440, height: 320 }}
      minWidth={300}
      minHeight={220}
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
        <strong>First to place every tile and hit “Done” wins.</strong> (This
        early version doesn’t check that your words are real — that comes later,
        along with drawing more tiles.)
      </p>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
