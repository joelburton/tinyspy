import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** The `define` Edge Function's response. `def === null` means
 *  "looked up, no definition found" (distinct from a fetch error). */
export type DefinitionResult = {
  word: string
  def: string | null
  source: string
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
 * (which fronts the `common.definitions` cache → Wiktionary). Pass the
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
        // (the same pattern tinyspy's clue suggester uses).
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
