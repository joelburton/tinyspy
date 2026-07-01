import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** A word's categorization from `common.words` — band, dialects, slur/crude
 *  levels, slang, wordle-list membership. Present on any in-list word; absent
 *  when `unknown`. Surfaced as the small muted line under a definition. */
export type WordMeta = {
  difficulty: number
  american: boolean
  british: boolean
  canadian: boolean
  australian: boolean
  slur: number
  crude: number
  slang: boolean
  wordle: boolean
}

/** The `define` Edge Function's response. `def === null` means
 *  "looked up, no definition found" (distinct from a fetch error);
 *  `unknown` means the word isn't in the master word list at all.
 *  `source` is the one-char provenance code ('s'/'e'/'w'/'m') or null. */
export type DefinitionResult = {
  word: string
  def: string | null
  source: string | null
  unknown?: boolean
  meta?: WordMeta
}

type State = {
  result: DefinitionResult | null
  loading: boolean
  error: string | null
}

/** What the effect resolves into — tagged with the word it's for so
 *  the public `loading` flag can be derived rather than set
 *  synchronously in the effect (which would cascade-render). */
type Loaded = {
  forWord: string | null
  result: DefinitionResult | null
  error: string | null
}

/**
 * Declarative read-through lookup against the `define` Edge Function
 * (which fronts the `common.words` definition columns → Wiktionary). Pass the
 * word to define, or `null` to sit idle; the hook refetches whenever
 * the word changes and cancels the in-flight result if it changes
 * again first (so chasing cross-refs quickly never flashes a stale
 * definition).
 *
 * Both the click-to-define popover and the "look up any word" dialog
 * drive this the same way — they just set `word`.
 *
 * Note `loading` is derived (word set, but the resolved result is for
 * a different word), not stored — the effect only ever calls setState
 * inside its async callback, never synchronously in its body.
 */
export function useDefinition(word: string | null): State {
  const [loaded, setLoaded] = useState<Loaded>({
    forWord: null,
    result: null,
    error: null,
  })

  useEffect(() => {
    if (!word) return
    let cancelled = false

    supabase.functions
      .invoke('define', { body: { word } })
      .then(({ data, error }) => {
        if (cancelled) return
        // Dual-check: a transport error OR an in-body `error` field
        // (the same pattern codenamesduet's clue suggester uses).
        if (error || data?.error) {
          setLoaded({
            forWord: word,
            result: null,
            error: error?.message ?? data?.error ?? 'lookup failed',
          })
          return
        }
        setLoaded({
          forWord: word,
          result: data as DefinitionResult,
          error: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [word])

  // Derive the public state. We're loading whenever a word is set but
  // the resolved result is still for a previous (or no) word.
  const loading = word !== null && loaded.forWord !== word
  if (word === null || loading) {
    return { result: null, loading, error: null }
  }
  return { result: loaded.result, loading: false, error: loaded.error }
}
