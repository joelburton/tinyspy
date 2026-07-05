import { HelpPanel } from '../../common/components/game/HelpPanel'

/**
 * boggle's help / rules modal — opened from the "Help" item in the GamePage
 * menu. Implements the `help: ComponentType<{ onClose }>` contract on
 * GameManifest. The frame (panel + title + Got-it) is the shared `<HelpPanel>`;
 * this is just the rules copy. (Previously boggle rendered a bare `<div>` with
 * no FloatingPanel, so its Help looked unlike every other game's — the shared
 * frame fixes that.)
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
        Find words by linking adjacent letter tiles — horizontally, vertically, or
        diagonally. Each tile can be used once per word. A “Qu” tile counts as both
        letters. Type a word and press <kbd>Enter</kbd>; press <kbd>↑</kbd> to bring
        back your last word and edit it.
      </p>
      <p>
        <strong>Required words</strong> are the ones the board was built around —
        they’re what the end-of-game reveal lists as “missed.”{' '}
        <strong>Bonus words</strong> are rarer real words you find; they still
        score (marked with a •) but aren’t part of the goal.
      </p>
      <p>
        Longer words score more (the exact ladder is a setup choice — Standard
        gives 1 point for 3–4 letters, ramping up to 11 for 8+). Click any found
        word to look up its definition.
      </p>
      <p>
        <strong>Coop:</strong> the whole club hunts the same board and shares one
        score. <strong>Compete:</strong> everyone races the same board on their
        own — most points wins; you see each other’s counts, not the words.
      </p>
      <p>
        Use <strong>Rotate board</strong> to turn the grid a quarter-turn (letters
        stay upright) so it faces whoever’s reading — it’s just your view, nobody
        else’s.
      </p>
    </HelpPanel>
  )
}
