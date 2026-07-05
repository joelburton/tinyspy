import { HelpPanel } from '../../common/components/game/HelpPanel'

/**
 * crosswords' help / rules modal — opened from the "Help" item in the
 * GamePage menu. Implements the `help: ComponentType<{ onClose, brand }>`
 * contract on GameManifest.
 */
export function Help({ onClose, brand }: { onClose: () => void; brand: string }) {
  return (
    <HelpPanel
      brand={brand}
      onClose={onClose}
      size={{ width: 480, height: 480 }}
      minSize={{ width: 320, height: 280 }}
    >
      <p>
        Fill the grid so every across and down entry matches its clue. Click a cell or
        a clue to move there; the highlighted word follows your cursor. Type letters
        to fill; the two clue lists on the right scroll to keep your clue in view.
      </p>
      <p>
        <strong>Keys:</strong> letters fill and advance; <kbd>Backspace</kbd> clears
        (and steps back once the cell is empty); <kbd>Space</kbd> steps forward;{' '}
        <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> jump to the next / previous clue;{' '}
        arrows move (a sideways arrow flips your direction); <kbd>Shift</kbd>+arrow
        jumps to the end of the word. Click a cell you're already on to switch between
        across and down.
      </p>
      <p>
        <strong>Co-op:</strong> the whole club solves one shared grid together —
        everyone's typing shows up live. Solve it and you all win.{' '}
        <strong>Compete:</strong> everyone races the same puzzle on their own private
        grid; the first to finish it correctly wins.
      </p>
      <p>Desktop &amp; keyboard only — there's no on-screen keyboard.</p>
    </HelpPanel>
  )
}
