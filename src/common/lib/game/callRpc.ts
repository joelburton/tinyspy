import type { GenericFeedbackMsg } from '../games'
import { failureMessage } from './serverError'

/**
 * The player's word for what an RPC *is*, for the games' shared RPCs.
 *
 * Errors name the action — `word: Server; try refresh`, `restart|not-a-player|`
 * — and the name has to come from this side. A shared helper like
 * `common._require_turn` is called from nine of the sixteen SQL files and
 * cannot know which button reached it; a transport failure has no server
 * message at all. So the RPC name is mapped here, in TypeScript, where the
 * wording stays editable.
 *
 * Only entries whose RPC name would MISLEAD a player need to appear. Anything
 * unmapped falls back to the RPC name with underscores turned to spaces, which
 * is honest and readable (`submit_word` → `submit word`) — the map exists to
 * fix the handful named for their mechanism rather than the player's action.
 */
const ACTION: Record<string, string> = {
  // Named for the mechanism, not the deed.
  replay_board: 'restart',
  reset_game: 'restart',
  request_reveal: 'spoiler',
  request_hint: 'hint',
  reveal_solution: 'reveal',
  reveal_next_word: 'spoiler',
  reveal_next_hint: 'hint',
  create_game: 'new game',
  end_game: 'end game',
  // Long names that would crowd a one-line pill.
  submit_word: 'word',
  submit_guess: 'guess',
  undo_word: 'undo',
  clear_chain: 'clear',
  log_help: 'help',
}

/** The player-facing name for an RPC or edge function. */
export function actionName(rpc: string): string {
  return ACTION[rpc] ?? rpc.replace(/_/g, ' ')
}

/** The `{ error }` shape every supabase call resolves to. Structural and
 *  minimal — a schema-scoped client's `rpc` returns a builder with far more on
 *  it, and only the error is needed here. */
type CallResult = { error: { message?: string; code?: string } | null }

/**
 * Run an RPC and, on failure, hand back the message to show — already
 * classified, already worded, already carrying the action's name.
 *
 * The point of the wrapper is that no call site ever touches `error.message`
 * again. That's the habit this redesign exists to break: passing the server's
 * text straight to a pill is what put `TypeError: Load failed` and
 * `the chain is full at 5 words — undo to try another route` in front of
 * players.
 *
 * ```ts
 * const bad = await callRpc(db, 'submit_word', { target_game: gameId, submitted: word })
 * if (bad) { showLocalFeedback(bad); return }
 * ```
 *
 * Returns `null` on success, so the call site reads as a guard.
 */
export async function callRpc<F extends string, A extends object>(
  // Generic over the FUNCTION NAME so each game's schema-typed `db`
  // (`supabase.schema('letterboxed')`) satisfies it — the same structural trick
  // manifestRpcs.ts uses, and the reason this isn't typed against one client.
  db: { rpc: (fn: F, args: A) => PromiseLike<CallResult> },
  fn: F,
  args: A,
): Promise<GenericFeedbackMsg | null> {
  const { error } = await db.rpc(fn, args)
  if (!error) return null
  return failureMessage(error, actionName(fn))
}
