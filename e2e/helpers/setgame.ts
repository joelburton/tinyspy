import { asUser, type E2EClub, type E2EMember } from './fixtures'

/**
 * setgame's card algebra, for the specs and the gallery.
 *
 * Restated here rather than imported from `src/setgame/lib/cards.ts` — nothing
 * else under `e2e/` reaches into `src/`, and this is six lines. The TS suite
 * proves the real implementation; what these need is only a way to FIND a legal
 * move on whatever board a game dealt, since setgame has no fixture board (a
 * board is a shuffle, so every run gets a different one).
 */

/** The card completing a set with `a` and `b` — per base-3 digit, the value
 *  that makes the three sum to 0 mod 3. */
export function third(a: number, b: number): number {
  let result = 0
  for (const place of [27, 9, 3, 1]) {
    result += ((6 - (Math.floor(a / place) % 3) - (Math.floor(b / place) % 3)) % 3) * place
  }
  return result
}

/** Three cards on `board` that form a set, or null. The deal-three rule means a
 *  playing game always has one. */
export function findSetOn(board: readonly number[]): [number, number, number] | null {
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      const completer = third(board[i], board[j])
      if (completer === board[i] || completer === board[j]) continue
      if (board.includes(completer)) return [board[i], board[j], completer]
    }
  }
  return null
}

/** Three cards on `board` that are NOT a set — for the FE's local rejection. */
export function findNonSetOn(board: readonly number[]): [number, number, number] {
  const completer = third(board[0], board[1])
  const odd = board.find((c, i) => i > 1 && c !== completer)
  if (odd === undefined) throw new Error('setgame: no non-set on this board')
  return [board[0], board[1], odd]
}

/**
 * The keyboard address of a slot — the fixed 3x7 grid from
 * `src/setgame/lib/letters.ts`, restated for the same reason as the algebra.
 * Row-major over seven columns, while the board array is column-major.
 */
export function letterForSlot(slot: number): string {
  return 'ABCDEFGHIJKLMNOPQRSTU'[(slot % 3) * 7 + Math.floor(slot / 3)]
}

/** The board as the server has it. */
export async function boardOf(viewer: E2EMember, gameId: string): Promise<number[]> {
  const res = await asUser(viewer.session.access_token)
    .schema('setgame')
    .from('games_state')
    .select('board')
    .eq('id', gameId)
    .single()
  if (res.error) throw new Error(`setgame board: ${res.error.message}`)
  return (res.data as { board: number[] }).board
}

/** Claim one set as `member`. */
export async function claim(
  member: E2EMember,
  gameId: string,
  cards: readonly number[],
): Promise<void> {
  const res = await asUser(member.session.access_token)
    .schema('setgame')
    .rpc('submit_set', { target_game: gameId, cards })
  if (res.error) throw new Error(`setgame.submit_set: ${res.error.message}`)
}

/**
 * Play a game to its natural end, always taking the first set the board offers
 * and rotating through `actors`. Returns how many sets were claimed.
 *
 * About 25 claims on a full deck — every one a real RPC, so the terminal that
 * lands is the one a table would actually reach.
 */
export async function playOut(
  club: E2EClub,
  gameId: string,
  actors: E2EMember[] = [club.members[0]],
): Promise<number> {
  let taken = 0
  for (;;) {
    const board = await boardOf(actors[0], gameId)
    const live = findSetOn(board)
    if (!live) return taken
    await claim(actors[taken % actors.length], gameId, live)
    taken += 1
    if (taken > 40) throw new Error('setgame playOut ran away')
  }
}
