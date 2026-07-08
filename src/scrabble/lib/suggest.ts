/**
 * Scrabble move suggester — the AI that recommends plays (docs/scrabble-ai.md).
 *
 * This module is pure TS with no I/O: it runs inside the
 * `scrabble-suggest-move` edge function (which builds the rated trie from the
 * bundled word list) and in Vitest. It holds the legality predicate (S1) and
 * the Appel & Jacobson move generator (S2); ranking (S3) grows in beside it.
 *
 * The generator finds EVERY legal move — completeness is the whole game here
 * (ranking can only pick from what generation finds). Its correctness story is
 * the brute-force reference generator in suggest.test.ts: an obviously-correct
 * try-everything enumerator that the A&J implementation must match move-set-
 * for-move-set on randomized boards. Performance framing: this runs once per
 * hint click, not in a rejection-sampling loop, so clarity beats
 * boggle-solver-style micro-optimization — plain recursion, allocate freely.
 */

import { BLANK, BOARD_SIZE, CENTER, cellIndex, inBounds, type Cell } from './board.ts'
import type { Placement } from './play.ts'
import type { Trie } from '../../common/lib/game/trie.ts'

/** The game's two dictionary difficulty bands, straight off `scrabble.games`
 *  (`dict_2` / `dict_3plus` — server-only columns, fetched through the
 *  `get_suggest_context` definer RPC). 2-letter words get their own, usually
 *  stricter, band because the 2-letter list is where the weird scrabble-ese
 *  lives (AA, XI, QI…). */
export type Bands = { dict2: number; dict3plus: number }

/**
 * The legality predicate the whole suggester hangs on: is the word ending at
 * this trie node playable in this game? Matches `play_word`'s SQL by
 * construction — `difficulty <= (len = 2 ? dict_2 : dict_3plus)` — given a
 * rated trie built from the same `american OR british` word set the server
 * checks against (the dialect filter is applied at bundle time, so the trie
 * only contains eligible words; see generate-scrabble-wordlist.ts).
 *
 * Applied to EVERY word a placement forms: main words and the perpendicular
 * cross-words alike. Cross-words are routinely 2 letters — that's why the
 * per-length band split matters here, not just for main words.
 */
export function isLegal(trie: Trie, bands: Bands, node: number, len: number): boolean {
  const d = trie.eow[node]
  return d !== 0 && d <= (len === 2 ? bands.dict2 : bands.dict3plus)
}

const N = BOARD_SIZE
/** 26-bit "any letter is fine here" cross-check mask. */
const ALL_LETTERS = (1 << 26) - 1
/** Index of the blank in the rack-multiset counts array (letters are 0..25). */
const BLANK_IDX = 26

/** Letter → 0..25, tolerant of case (`| 0x20` lower-cases an ASCII letter).
 *  Board cells and placements carry uppercase; the trie is lowercase. */
const letterIdx = (letter: string): number => (letter.charCodeAt(0) | 0x20) - 97
const letterGlyph = (c: number): string => String.fromCharCode(65 + c)

/**
 * Every legal move on the board with this rack, as placement sets.
 *
 * Returns **placements only** — no words, no scores. S3 runs `evaluatePlay`
 * over each so the suggester's scores can't drift from what the game awards,
 * and its geometry gate doubles as a free internal assertion (a generator bug
 * surfaces as `valid: false`).
 *
 * The A&J recipe: implement for horizontal (across) plays only, then run
 * twice — once on the board, once on its transpose, swapping x/y back on the
 * second pass's placements. A single-tile play that forms both an across and
 * a down word is found by both passes with identical placements, so moves are
 * collapsed through a canonical-key map before returning.
 *
 * `rack` is glyphs `'A'..'Z'` / `'?'`; emitted `Placement.letter` is the
 * uppercase played letter (a blank's *declared* letter, with `blank: true`).
 * A natural tile and a blank playing the same letter are both emitted —
 * different scores, both legal; ranking sorts them out.
 */
export function generateMoves(
  board: Cell[], rack: readonly string[], trie: Trie, bands: Bands,
): Placement[][] {
  // The rack as a multiset — decrement/increment around recursion. This makes
  // dedup of repeated tiles automatic: two E's can't generate a move twice.
  const counts = new Int32Array(27)
  for (const glyph of rack) counts[glyph === BLANK ? BLANK_IDX : letterIdx(glyph)]++

  const byKey = new Map<string, Placement[]>()
  const record = (ps: Placement[]) => {
    const sorted = [...ps].sort((p, q) => p.y - q.y || p.x - q.x)
    const key = sorted.map((p) => `${p.x},${p.y},${p.letter},${p.blank ? 1 : 0}`).join('|')
    if (!byKey.has(key)) byKey.set(key, sorted)
  }

  acrossPass(board, counts, trie, bands, record)

  const transposed: Cell[] = new Array<Cell>(N * N).fill(null)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) transposed[cellIndex(y, x)] = board[cellIndex(x, y)]
  acrossPass(transposed, counts, trie, bands, (ps) =>
    record(ps.map((p) => ({ x: p.y, y: p.x, letter: p.letter, blank: p.blank }))),
  )

  return [...byKey.values()]
}

/**
 * Generate every across (single-row) move on this board. The down moves are
 * this same function over the transposed board — so "vertical" below always
 * means perpendicular-to-the-play, whichever real direction that is.
 */
function acrossPass(
  board: Cell[],
  counts: Int32Array,
  trie: Trie,
  bands: Bands,
  emit: (placements: Placement[]) => void,
): void {
  const { children } = trie
  const cellAt = (x: number, y: number): Cell => (inBounds(x, y) ? board[cellIndex(x, y)] : null)
  const occupied = (x: number, y: number): boolean => cellAt(x, y) != null

  const boardEmpty = board.every((c) => c == null)

  // ANCHORS: the empty squares a move can hang off — orthogonally adjacent to
  // ≥1 existing tile (any of the 4 directions: a square with only a *vertical*
  // neighbor is still an anchor here; the across "word" may be a single new
  // tile riding on its cross-word, which the transpose pass then owns).
  // Empty board: the one anchor is CENTER (the first play must cover it).
  const anchor = new Uint8Array(N * N)
  if (boardEmpty) {
    anchor[CENTER] = 1
  } else {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (occupied(x, y)) continue
        if (occupied(x - 1, y) || occupied(x + 1, y) || occupied(x, y - 1) || occupied(x, y + 1))
          anchor[cellIndex(x, y)] = 1
      }
  }

  // CROSS-CHECK MASKS: for every empty square, the set of letters (26-bit
  // mask) that keep the perpendicular word legal. No vertical neighbors →
  // all-ones. Otherwise walk the contiguous run above (prefix) through the
  // trie ONCE, then for each candidate letter step to its child and walk the
  // run below (suffix); the letter is allowed iff the word it completes
  // passes the band predicate. Cross-words are routinely length 2, so the
  // dict2 band applies HERE, not just to main words. Board blanks participate
  // as their declared letter (`Cell.l`) — exactly as `formedWords` reads them.
  const mask = new Int32Array(N * N).fill(ALL_LETTERS)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (occupied(x, y)) continue
      if (!occupied(x, y - 1) && !occupied(x, y + 1)) continue
      let top = y
      while (occupied(x, top - 1)) top--
      let bottom = y
      while (occupied(x, bottom + 1)) bottom++
      const len = bottom - top + 1

      let prefixNode = 0
      for (let yy = top; yy < y && prefixNode >= 0; yy++) {
        prefixNode = children[prefixNode * 26 + letterIdx(cellAt(x, yy)!.l)] || -1
      }
      let m = 0
      // A dead prefix (the existing tiles above don't spell a trie prefix)
      // means NO letter can sit here in this pass — mask stays 0.
      if (prefixNode >= 0) {
        for (let c = 0; c < 26; c++) {
          let node = children[prefixNode * 26 + c]
          for (let yy = y + 1; yy <= bottom && node !== 0; yy++) {
            node = children[node * 26 + letterIdx(cellAt(x, yy)!.l)]
          }
          if (node !== 0 && isLegal(trie, bands, node, len)) m |= 1 << c
        }
      }
      mask[cellIndex(x, y)] = m
    }

  // GENERATION, per anchor. `placements` is a shared stack (push/recurse/pop).
  for (let row = 0; row < N; row++)
    for (let anchorCol = 0; anchorCol < N; anchorCol++) {
      if (!anchor[cellIndex(anchorCol, row)]) continue
      const placements: Placement[] = []

      /**
       * Extend rightward from `col`, having matched the word so far down to
       * `node`. `wordStartCol` is where the whole word begins (forced
       * prefixes count) — the emit-time length is `col - wordStartCol`.
       *
       * The emit guard is the subtle part. `col > anchorCol` enforces "the
       * move covers its anchor": the anchor is empty by definition, so
       * covering it means a tile was placed — which simultaneously guarantees
       * ≥1 new tile, connectivity to the existing tiles (or center coverage
       * on the first move), and kills the duplicate emissions a
       * left-part-only word would produce. Emitting only on an empty square
       * or past the edge enforces right-side maximality (never emit a run
       * that abuts an existing tile on its right); left-side maximality is
       * structural — the word starts after an edge, an empty square, or at a
       * forced prefix's own start. Length ≥ 2 needs no explicit check:
       * 1-letter strings aren't in the trie.
       */
      const extendRight = (col: number, node: number, wordStartCol: number): void => {
        const cell = col < N ? cellAt(col, row) : null
        if (cell != null) {
          // Standing on an existing tile: follow its letter through the trie
          // (dead node → no word continues through here). No rack use, no
          // cross-check, no emit while standing on it.
          const next = children[node * 26 + letterIdx(cell.l)]
          if (next !== 0) extendRight(col + 1, next, wordStartCol)
          return
        }

        // Empty square (or past the right edge): emit-check first.
        if (col > anchorCol && isLegal(trie, bands, node, col - wordStartCol))
          emit(placements.slice())
        if (col >= N) return

        const m = mask[cellIndex(col, row)]
        for (let c = 0; c < 26; c++) {
          if (!(m & (1 << c))) continue
          const child = children[node * 26 + c]
          if (child === 0) continue
          if (counts[c] > 0) {
            counts[c]--
            placements.push({ x: col, y: row, letter: letterGlyph(c), blank: false })
            extendRight(col + 1, child, wordStartCol)
            placements.pop()
            counts[c]++
          }
          if (counts[BLANK_IDX] > 0) {
            counts[BLANK_IDX]--
            placements.push({ x: col, y: row, letter: letterGlyph(c), blank: true })
            extendRight(col + 1, child, wordStartCol)
            placements.pop()
            counts[BLANK_IDX]++
          }
        }
      }

      if (occupied(anchorCol - 1, row)) {
        // FORCED left part: the maximal occupied run ending at anchor−1 IS
        // the word's start — walk it through the trie from the root. If the
        // walk dies this anchor yields nothing across, which is correct:
        // existing tiles need not spell a word prefix.
        let start = anchorCol - 1
        while (occupied(start - 1, row)) start--
        let node = 0
        for (let x = start; x < anchorCol && node >= 0; x++) {
          node = children[node * 26 + letterIdx(cellAt(x, row)!.l)] || -1
        }
        if (node >= 0) extendRight(anchorCol, node, start)
      } else {
        // RACK-BUILT left parts, over the squares left of the anchor, up to
        // `limit` = the run of consecutive empty NON-anchor squares
        // immediately left. Two invariants ride on "non-anchor":
        //   (a) dedup — a play reaching further left would cover an earlier
        //       anchor and is generated there instead, so every move is
        //       emitted exactly once per pass;
        //   (b) no cross-checks needed — non-anchor ⇒ no perpendicular
        //       neighbors ⇒ any letter is vertically safe.
        // Built as a letter list; the placements' columns are only knowable
        // once the length is fixed, so they're materialized per extendRight.
        let limit = 0
        while (
          limit < anchorCol &&
          !occupied(anchorCol - 1 - limit, row) &&
          !anchor[cellIndex(anchorCol - 1 - limit, row)]
        ) limit++

        const leftLetters: { c: number; blank: boolean }[] = []
        const buildLeft = (node: number): void => {
          const len = leftLetters.length
          for (let i = 0; i < len; i++) {
            const l = leftLetters[i]
            placements.push({
              x: anchorCol - len + i, y: row, letter: letterGlyph(l.c), blank: l.blank,
            })
          }
          extendRight(anchorCol, node, anchorCol - len)
          for (let i = 0; i < len; i++) placements.pop()

          if (len >= limit) return
          for (let c = 0; c < 26; c++) {
            const child = children[node * 26 + c]
            if (child === 0) continue
            if (counts[c] > 0) {
              counts[c]--
              leftLetters.push({ c, blank: false })
              buildLeft(child)
              leftLetters.pop()
              counts[c]++
            }
            if (counts[BLANK_IDX] > 0) {
              counts[BLANK_IDX]--
              leftLetters.push({ c, blank: true })
              buildLeft(child)
              leftLetters.pop()
              counts[BLANK_IDX]++
            }
          }
        }
        buildLeft(0)
      }
    }
}
