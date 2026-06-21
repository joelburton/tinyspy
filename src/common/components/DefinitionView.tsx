import { useDefinition } from '../hooks/useDefinition'
import { parseDefinition } from '../lib/parseDefinition'
import styles from './DefinitionView.module.css'

type Props = {
  /** The word to define. `null` renders nothing (idle). */
  word: string | null
  /** Called when the user clicks a cross-reference inside the
   *  definition — the host re-points `word` at it, navigating the
   *  lookup in place ("see X" without retyping). */
  onNavigate: (word: string) => void
}

/**
 * The shared body of both the click-to-define popover and the
 * "look up any word" dialog: given a word, fetch its definition and
 * render it, with Scrabble cross-references as clickable links.
 *
 * It owns no word state of its own — the host (popover / dialog)
 * holds `word` and passes `onNavigate` so a cross-ref click flows
 * back up and becomes the next `word`. That keeps the two hosts thin
 * (they differ only in *how* the first word is chosen: a clicked list
 * row vs. a typed query) while sharing all the render + fetch logic.
 */
export function DefinitionView({ word, onNavigate }: Props) {
  const { result, loading, error } = useDefinition(word)

  if (!word) return null

  return (
    <div className={styles.view}>
      <div className={styles.headword}>{word.toLowerCase()}</div>
      {loading && <div className={styles.status}>Looking up…</div>}
      {!loading && error && (
        <div className={styles.error}>Couldn’t look that up. {error}</div>
      )}
      {!loading && !error && result?.unknown && (
        <div className={styles.status}>Unknown word.</div>
      )}
      {!loading && !error && result?.def === null && !result.unknown && (
        <div className={styles.status}>No definition found.</div>
      )}
      {!loading && !error && result?.def != null && (
        <p className={styles.body}>
          {parseDefinition(result.def, result.source).map((part, i) =>
            part.kind === 'ref'
              ? (
                <button
                  key={i}
                  type="button"
                  className={styles.ref}
                  onClick={() => onNavigate(part.word)}
                >
                  {part.word}
                </button>
              )
              : (
                <span key={i}>{part.value}</span>
              ),
          )}
        </p>
      )}
      {!loading && result?.source === 'w' && result.def != null && (
        // CC BY-SA attribution for live Wiktionary text (see
        // docs/common.md). Seeded glosses ('s'/'e'/'m') need none.
        <div className={styles.attribution}>via Wiktionary (CC BY-SA)</div>
      )}
    </div>
  )
}
