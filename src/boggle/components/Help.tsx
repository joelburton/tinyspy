/**
 * Phase-4 rules modal. Expanded (scoring ladder, required vs bonus words, the
 * missed-words reveal) in Phase 5.
 */
export function Help({ onClose, brand }: { onClose: () => void; brand: string }) {
  return (
    <div>
      <h2>How to play {brand}</h2>
      <p>
        Find words by linking adjacent letter tiles — horizontally, vertically, or
        diagonally. A tile can be used once per word. Longer words score more.
      </p>
      <p>
        Words the board is built around are <strong>required</strong>; rarer real
        words you find are <strong>bonus</strong> words and still score.
      </p>
      <button type="button" onClick={onClose}>
        Got it
      </button>
    </div>
  )
}
