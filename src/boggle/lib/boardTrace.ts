/**
 * Client-side board tracing — "can this word be spelled along adjacent tiles,
 * no tile reused?" The FE uses it to gate guesses before submitting: only
 * traceable words go to `submit_word` (trusting-commit — the server doesn't
 * re-trace; see docs/games/boggle.md §4). Mirrors the solver's DFS rules,
 * including multiface tiles (Qu, …) matching their two letters together and
 * blank tiles matching nothing.
 */
import { parseBoard, type Board } from './solver'

const A = 'a'.charCodeAt(0)

/** Can `word` be traced on a parsed board? */
export function traceable(board: Board, word: string): boolean {
  const w = word.toLowerCase()
  const len = w.length
  if (len === 0) return false
  const target = new Int8Array(len)
  for (let i = 0; i < len; i++) target[i] = w.charCodeAt(i) - A

  const { n, first, second } = board
  const used = new Uint8Array(n * n)

  // From `cell`, try to consume the word starting at `pos`. The cell must match
  // word[pos] (and word[pos+1] too, for a multiface tile).
  function dfs(cell: number, pos: number): boolean {
    if (first[cell] !== target[pos]) return false
    let next = pos + 1
    if (second[cell] >= 0) {
      if (next >= len || second[cell] !== target[next]) return false
      next++
    }
    if (next === len) return true

    used[cell] = 1
    const row = (cell / n) | 0
    const col = cell % n
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = row + dr, nc = col + dc
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
        const ncell = nr * n + nc
        if (used[ncell]) continue
        if (dfs(ncell, next)) { used[cell] = 0; return true }
      }
    }
    used[cell] = 0
    return false
  }

  for (let cell = 0; cell < n * n; cell++) {
    if (dfs(cell, 0)) return true
  }
  return false
}

/** Convenience: trace against a raw board string (the `boggle.games.board` shape). */
export function traceableStr(boardStr: string, word: string): boolean {
  return traceable(parseBoard(boardStr), word)
}
