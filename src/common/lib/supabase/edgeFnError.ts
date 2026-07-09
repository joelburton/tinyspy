/**
 * Unwrap the real server message from a `supabase.functions.invoke` error.
 *
 * `invoke` reports any 4xx/5xx as its own generic "Edge Function returned a
 * non-2xx status code" — the *actual* server error rides on `error.context`, a
 * `Response` whose body is readable **exactly once**. So we read `context.json()`
 * and pull its `{ error }` field, returning `null` when there's no context, the
 * body isn't the JSON shape we expect, or it carries no `error` string. Callers
 * pair it with their own fallback: `(await unwrapEdgeFnError(error)) ?? …`.
 *
 * This subtle read-once logic lived inline in `invokeStartGameEdgeFn` and was
 * hand-copied by scrabble's suggest handler; it's extracted here so it exists
 * exactly once (docs/scrabble-ai-fixes.md §5). A third copy still sits in
 * `crosswords/components/PlayArea.tsx` — flagged there, out of this branch's
 * scope.
 */
export async function unwrapEdgeFnError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response }).context
  if (!ctx) return null
  try {
    const parsed = (await ctx.json()) as { error?: string }
    return parsed && typeof parsed.error === 'string' ? parsed.error : null
  } catch {
    // body wasn't JSON; the caller falls back to its generic message
    return null
  }
}
