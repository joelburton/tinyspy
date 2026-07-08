// @vitest-environment node
// (pure-TS suite, no DOM — and the brute-force parity tests below are
// allocation-heavy enough that skipping jsdom is a real speedup)
import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from '../../common/lib/game/trie'
import { CENTER, cellIndex, inBounds, type Cell } from './board'
import { evaluatePlay, type Placement } from './play'
import { generateMoves, isLegal, type Bands } from './suggest'

// ---------------------------------------------------------------------------
// isLegal — the two-band legality predicate (S1)
// ---------------------------------------------------------------------------

describe('isLegal — the two-band legality predicate', () => {
  // A miniature dictionary with hand-picked difficulties. Real bands from
  // scrabble setup run 1..6; dict2 is typically stricter than dict3plus.
  const words = ['at', 'xi', 'cat', 'cats', 'qoph']
  const ratings = [1, 4, 1, 2, 6]
  const trie = buildTrie(words, ratings)
  const bands: Bands = { dict2: 2, dict3plus: 4 }

  const legalityOf = (word: string) => isLegal(trie, bands, walkWord(trie, word), word.length)

  it('gates 2-letter words by dict2', () => {
    expect(legalityOf('at')).toBe(true)  // difficulty 1 ≤ dict2 2
    expect(legalityOf('xi')).toBe(false) // difficulty 4 > dict2 2
  })

  it('gates 3+ words by dict3plus', () => {
    expect(legalityOf('cat')).toBe(true)  // 1 ≤ 4
    expect(legalityOf('cats')).toBe(true) // 2 ≤ 4
    expect(legalityOf('qoph')).toBe(false) // 6 > 4
  })

  it('a 2-letter word above dict2 can still be fine as a longer word’s prefix', () => {
    // 'xi' itself is out (band 4 > dict2 2), but nothing about the node
    // poisons paths through it — the predicate only reads the terminal value
    // at the length in hand. (No xi-prefixed 3+ word in the fixture; assert
    // the node is a live interior node, not a dead end.)
    expect(walkWord(trie, 'xi')).toBeGreaterThan(0)
  })

  it('rejects prefix-but-not-word nodes', () => {
    expect(legalityOf('ca')).toBe(false)  // interior node, eow = 0
    expect(legalityOf('cat'.slice(0, 1))).toBe(false) // 'c' likewise
  })

  it('is monotone in the bands: loosening dict3plus admits qoph', () => {
    expect(isLegal(trie, { dict2: 2, dict3plus: 6 }, walkWord(trie, 'qoph'), 4)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateMoves (S2) — shared machinery
// ---------------------------------------------------------------------------

const N = 15
const emptyBoard = (): Cell[] => new Array<Cell>(N * N).fill(null)

/** Lay a word of natural tiles onto a board (test fixture setup). */
function put(board: Cell[], x: number, y: number, word: string, dir: 'h' | 'v' = 'h'): void {
  for (let i = 0; i < word.length; i++) {
    board[cellIndex(dir === 'h' ? x + i : x, dir === 'h' ? y : y + i)] =
      { l: word[i].toUpperCase(), b: false }
  }
}

/** The parity-test currency: one canonical string per move. */
const canonKey = (ps: Placement[]): string =>
  [...ps]
    .sort((p, q) => p.y - q.y || p.x - q.x)
    .map((p) => `${p.x},${p.y},${p.letter},${p.blank ? 1 : 0}`)
    .join('|')

/** String-level legality: the word exists in the trie AND passes its band. */
const wordLegal = (trie: ReturnType<typeof buildTrie>, bands: Bands, word: string): boolean => {
  const node = walkWord(trie, word.toLowerCase())
  return node > 0 && isLegal(trie, bands, node, word.length)
}

/**
 * The naive brute-force reference generator. Its only virtue is being
 * OBVIOUSLY correct: try every distinct k-permutation of the rack multiset at
 * every start square in both orientations, lay the tiles in order skipping
 * over occupied squares, and keep whatever `evaluatePlay` accepts whose every
 * formed word passes the band predicate. No anchors, no cross-checks, no
 * trie-guided pruning — nothing shared with the A&J implementation it judges.
 *
 * Three concessions to speed, none changing the accepted set:
 *   - a cheap connectivity prefilter (touches an existing tile / covers
 *     center) before the `evaluatePlay` call, which re-checks it anyway;
 *   - a blank's declared letter only ranges over letters some dictionary
 *     word actually contains — every placed tile sits in ≥1 formed word, so
 *     a letter no word uses can never survive the word check;
 *   - a lay containing a blank probes geometric validity ONCE before
 *     expanding declarations — which runs a formed word occupies (and hence
 *     validity) is letter-independent, so one probe with a placeholder
 *     letter stands in for all the expansions.
 */
function bruteForce(board: Cell[], rack: readonly string[], trie: ReturnType<typeof buildTrie>, bands: Bands): Set<string> {
  const keys = new Set<string>()
  const boardEmpty = board.every((c) => c == null)
  const occ = (x: number, y: number) => inBounds(x, y) && board[cellIndex(x, y)] != null

  // Every distinct k-permutation (k = 1..rack size) of the rack multiset.
  const counts = new Map<string, number>()
  for (const g of rack) counts.set(g, (counts.get(g) ?? 0) + 1)
  const perms: string[][] = []
  const seq: string[] = []
  const buildPerms = () => {
    if (seq.length > 0) perms.push([...seq])
    for (const [g, n] of counts) {
      if (n === 0) continue
      counts.set(g, n - 1)
      seq.push(g)
      buildPerms()
      seq.pop()
      counts.set(g, n)
    }
  }
  buildPerms()

  const check = (placements: Placement[]) => {
    const ev = evaluatePlay(board, placements)
    if (!ev.valid) return
    if (!ev.words.every((w) => wordLegal(trie, bands, w.word))) return
    keys.add(canonKey(placements))
  }

  // The dictionary's alphabet (see the speed concessions above): any letter
  // some word contains has a child edge somewhere in the trie.
  const alphabet: string[] = []
  {
    const used = new Set<number>()
    for (let i = 0; i < trie.nNodes * 26; i++) if (trie.children[i] !== 0) used.add(i % 26)
    for (const c of used) alphabet.push(String.fromCharCode(65 + c))
  }

  // Expand each laid '?' into its possible declared letters, then judge.
  const expand = (laid: { x: number; y: number; glyph: string }[], i: number, acc: Placement[]): void => {
    if (i === laid.length) return check(acc)
    const { x, y, glyph } = laid[i]
    if (glyph === '?') {
      for (const letter of alphabet)
        expand(laid, i + 1, [...acc, { x, y, letter, blank: true }])
    } else {
      expand(laid, i + 1, [...acc, { x, y, letter: glyph, blank: false }])
    }
  }

  for (const perm of perms) {
    for (const horizontal of [true, false]) {
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          // Starting on an occupied square lays the same tiles as starting at
          // the next empty one — skip the duplicate work.
          if (board[cellIndex(sx, sy)] != null) continue
          const laid: { x: number; y: number; glyph: string }[] = []
          let x = sx
          let y = sy
          let offBoard = false
          for (const glyph of perm) {
            while (inBounds(x, y) && board[cellIndex(x, y)] != null) {
              if (horizontal) x++
              else y++
            }
            if (!inBounds(x, y)) { offBoard = true; break }
            laid.push({ x, y, glyph })
            if (horizontal) x++
            else y++
          }
          if (offBoard) continue
          const connected = boardEmpty
            ? laid.some((p) => cellIndex(p.x, p.y) === CENTER)
            : laid.some((p) => occ(p.x - 1, p.y) || occ(p.x + 1, p.y) || occ(p.x, p.y - 1) || occ(p.x, p.y + 1))
          if (!connected) continue
          if (laid.some((p) => p.glyph === '?')) {
            const probe = laid.map((p) => ({
              x: p.x, y: p.y, letter: p.glyph === '?' ? 'A' : p.glyph, blank: p.glyph === '?',
            }))
            if (!evaluatePlay(board, probe).valid) continue
          }
          expand(laid, 0, [])
        }
      }
    }
  }
  return keys
}

/** Exact move-set equality between generateMoves and the brute force, with a
 *  readable diff — plus the free internal assertions (no duplicate emissions,
 *  every move survives evaluatePlay's geometry gate). Returns the key set for
 *  follow-up presence assertions. */
function assertParity(
  label: string, board: Cell[], rack: readonly string[],
  trie: ReturnType<typeof buildTrie>, bands: Bands,
): Set<string> {
  const moves = generateMoves(board, rack, trie, bands)
  const keys = moves.map(canonKey)
  expect(new Set(keys).size, `${label}: generator emitted duplicate moves`).toBe(keys.length)
  const invalid = moves.filter((m) => !evaluatePlay(board, m).valid)
  expect(invalid, `${label}: generator emitted geometrically invalid plays`).toEqual([])

  const expected = bruteForce(board, rack, trie, bands)
  const got = new Set(keys)
  const missing = [...expected].filter((k) => !got.has(k)).sort()
  const extra = keys.filter((k) => !expected.has(k)).sort()
  expect({ missing, extra }, label).toEqual({ missing: [], extra: [] })
  return got
}

// ---------------------------------------------------------------------------
// generateMoves — handcrafted classics
// ---------------------------------------------------------------------------

describe('generateMoves — handcrafted boards', () => {
  const DICT: [string, number][] = [
    ['at', 1], ['ta', 3], ['as', 1], ['so', 1], ['os', 2],
    ['cat', 1], ['cats', 1], ['sat', 1], ['tat', 2], ['tas', 4],
  ]
  const trie = buildTrie(DICT.map(([w]) => w), DICT.map(([, r]) => r))
  const loose: Bands = { dict2: 6, dict3plus: 6 }

  it('hook: one S extends CAT and starts SO — found once despite both passes seeing it', () => {
    const board = emptyBoard()
    put(board, 5, 7, 'CAT')
    board[cellIndex(8, 8)] = { l: 'O', b: false }
    // S at (8,7) forms CATS across and SO down. The across pass emits it as
    // CATS via the forced left part (with SO verified by the cross-check
    // mask); the transpose pass emits it as SO (with CATS as the cross-check).
    // Identical placements, deduped to one move.
    const got = assertParity('hook', board, ['S'], trie, loose)
    expect(got.has('8,7,S,0')).toBe(true)
  })

  it('blank duplicating a natural rack letter: both variants emitted', () => {
    const board = emptyBoard()
    put(board, 5, 7, 'CAT')
    board[cellIndex(8, 8)] = { l: 'O', b: false }
    const got = assertParity('blank twin', board, ['S', '?'], trie, loose)
    expect(got.has('8,7,S,0')).toBe(true) // natural S
    expect(got.has('8,7,S,1')).toBe(true) // blank declared as S
    const natural = evaluatePlay(board, [{ x: 8, y: 7, letter: 'S', blank: false }])
    const blank = evaluatePlay(board, [{ x: 8, y: 7, letter: 'S', blank: true }])
    if (!natural.valid || !blank.valid) throw new Error('fixture plays should be valid')
    expect(natural.score).toBeGreaterThan(blank.score) // same word, blank scores 0
  })

  it('parallel play: 2-letter cross-words answer to dict2', () => {
    const board = emptyBoard()
    put(board, 5, 7, 'AT')
    const parallel = '5,8,T,0|6,8,A,0' // TA under AT → cross-words AT (1) and TA (3)
    const withLooseDict2 = assertParity(
      'parallel loose', board, ['T', 'A'], trie, { dict2: 3, dict3plus: 6 })
    expect(withLooseDict2.has(parallel)).toBe(true)
    const withStrictDict2 = assertParity(
      'parallel strict', board, ['T', 'A'], trie, { dict2: 2, dict3plus: 6 })
    expect(withStrictDict2.has(parallel)).toBe(false) // TA (3) > dict2 (2)
  })

  it('bridge play through an existing tile, both orientations', () => {
    const board = emptyBoard()
    board[CENTER] = { l: 'A', b: false } // (7,7)
    const got = assertParity('bridge', board, ['C', 'T'], trie, loose)
    expect(got.has('6,7,C,0|8,7,T,0')).toBe(true) // C_T across the A → CAT
    expect(got.has('7,6,C,0|7,8,T,0')).toBe(true) // vertical twin
  })

  it('extends an existing word on both ends at once', () => {
    const board = emptyBoard()
    put(board, 6, 7, 'AT')
    const got = assertParity('both ends', board, ['C', 'S'], trie, loose)
    expect(got.has('5,7,C,0|8,7,S,0')).toBe(true) // C‹AT›S → CATS
  })

  it('left parts stop at a neighboring anchor (the dedup invariant)', () => {
    // Two runs in one row with a 3-square gap: the gap squares flanking each
    // run are anchors, so a rack-built left part may only use the middle
    // square — plays reaching further left belong to the earlier anchor.
    const board = emptyBoard()
    put(board, 2, 7, 'AT')
    put(board, 7, 7, 'SO')
    assertParity('anchor-limited left part', board, ['C', 'A', 'T', 'S'], trie, loose)
  })

  it('words ending flush at column 14', () => {
    const board = emptyBoard()
    put(board, 11, 7, 'CAT')
    const got = assertParity('flush right edge', board, ['S'], trie, loose)
    expect(got.has('14,7,S,0')).toBe(true) // CATS ends exactly on the edge
  })

  it('first move: covers center, ≥2 tiles, both orientations, duplicate rack tiles deduped', () => {
    const board = emptyBoard()
    const got = assertParity('first move', board, ['A', 'T', 'T'], trie, loose)
    const moves = generateMoves(board, ['A', 'T', 'T'], trie, loose)
    for (const m of moves) {
      expect(m.length).toBeGreaterThanOrEqual(2)
      expect(m.some((p) => cellIndex(p.x, p.y) === CENTER)).toBe(true)
    }
    expect(got.has('7,7,A,0|8,7,T,0')).toBe(true) // AT across from the star
    expect(got.has('7,7,A,0|7,8,T,0')).toBe(true) // its vertical twin — a distinct move
  })
})

// ---------------------------------------------------------------------------
// generateMoves — randomized parity vs the brute force
// ---------------------------------------------------------------------------

describe('generateMoves — randomized parity vs brute force', () => {
  // Words over a 10-letter pool so random racks + soup actually connect.
  // Ratings deliberately spread over 1..6 so random bands bite.
  const DICT: [string, number][] = [
    ['at', 1], ['an', 1], ['as', 1], ['ad', 2], ['ai', 4], ['ar', 3], ['ae', 5],
    ['in', 1], ['is', 1], ['it', 1], ['id', 3], ['on', 1], ['or', 1], ['os', 2],
    ['od', 4], ['oi', 5], ['oe', 6], ['no', 1], ['na', 5], ['ne', 4], ['to', 1],
    ['ta', 2], ['ti', 3], ['te', 5], ['do', 1], ['da', 4], ['de', 3], ['so', 1],
    ['si', 4], ['re', 1], ['en', 2], ['es', 3], ['ed', 2], ['et', 4],
    ['ate', 1], ['eat', 1], ['tea', 1], ['tae', 4], ['eta', 3], ['oat', 2],
    ['oar', 2], ['ear', 1], ['era', 2], ['are', 1], ['art', 1], ['rat', 1],
    ['tar', 1], ['sat', 1], ['set', 1], ['sit', 1], ['its', 1], ['tis', 4],
    ['son', 1], ['ton', 1], ['not', 1], ['net', 1], ['ten', 1], ['tin', 1],
    ['nit', 3], ['ant', 1], ['tan', 1], ['ran', 1], ['and', 1], ['end', 1],
    ['den', 1], ['don', 2], ['nod', 2], ['rod', 1], ['red', 1], ['dot', 1],
    ['toe', 1], ['doe', 1], ['ode', 2], ['ice', 1], ['ire', 2], ['air', 1],
    ['cat', 1], ['act', 1], ['cot', 2], ['tic', 2], ['sic', 3], ['con', 2],
    ['cod', 2], ['doc', 2], ['arc', 2], ['car', 1],
    ['ants', 1], ['rant', 2], ['tarn', 3], ['rats', 1], ['star', 1], ['arts', 1],
    ['tars', 2], ['east', 1], ['eats', 1], ['sate', 2], ['seat', 1], ['teas', 1],
    ['note', 1], ['tone', 1], ['tore', 2], ['rote', 3], ['riot', 2], ['trio', 2],
    ['iota', 3], ['into', 1], ['coat', 1], ['taco', 2], ['cite', 2], ['dice', 2],
    ['iced', 3], ['side', 1], ['dies', 1], ['ides', 4], ['aide', 2], ['idea', 1],
    ['irate', 3], ['coats', 2], ['tacos', 2], ['ideas', 1], ['aside', 2],
  ]
  const trie = buildTrie(DICT.map(([w]) => w), DICT.map(([, r]) => r))
  const POOL = 'aetosrndci'

  // Seeded PRNG (mulberry32) — the seed is in the test name and every assert
  // label, so a failure is reproducible verbatim.
  const mulberry32 = (seed: number) => {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // Random connected tile soup. Existing runs need NOT be real words: neither
  // generator revalidates untouched runs (matching play_word, which only
  // checks the submitted words) — and soup shakes out cross-check bugs that
  // curated boards hide. ~10% of tiles are board blanks (b: true), which must
  // participate in words as their declared letter.
  const soupBoard = (rand: () => number, tiles: number): Cell[] => {
    const board = emptyBoard()
    const int = (n: number) => Math.floor(rand() * n)
    const letter = () => POOL[int(POOL.length)].toUpperCase()
    board[CENTER] = { l: letter(), b: false }
    const filled = [CENTER]
    for (let tries = 0; tries < 500 && filled.length < tiles; tries++) {
      const from = filled[int(filled.length)]
      const x = from % N
      const y = (from - x) / N
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][int(4)]
      if (!inBounds(x + dx, y + dy)) continue
      const i = cellIndex(x + dx, y + dy)
      if (board[i]) continue
      board[i] = { l: letter(), b: rand() < 0.1 }
      filled.push(i)
    }
    return board
  }

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    it(`random soup board, seed ${seed}`, () => {
      const rand = mulberry32(seed)
      const int = (n: number) => Math.floor(rand() * n)
      const board = soupBoard(rand, 8 + int(7))
      // Cost control (the plan's S2 note): racks ≤5, ≤1 blank — and a rack
      // WITH a blank is capped at 4 tiles, since each blank multiplies the
      // brute force's declaration-expansion work.
      const blanks = rand() < 0.35 ? 1 : 0
      const letters = blanks ? 3 : 4 + int(2)
      const rack = [
        ...Array.from({ length: letters }, () => POOL[int(POOL.length)].toUpperCase()),
        ...Array.from({ length: blanks }, () => '?'),
      ]
      const bands: Bands = { dict2: 1 + int(6), dict3plus: 1 + int(6) }
      assertParity(
        `seed ${seed} rack=${rack.join('')} bands=${JSON.stringify(bands)}`,
        board, rack, trie, bands,
      )
    })
  }

  for (const seed of [101, 102, 103]) {
    it(`random first move on an empty board, seed ${seed}`, () => {
      const rand = mulberry32(seed)
      const int = (n: number) => Math.floor(rand() * n)
      const blanks = rand() < 0.35 ? 1 : 0
      const letters = 4 + int(2) - blanks
      const rack = [
        ...Array.from({ length: letters }, () => POOL[int(POOL.length)].toUpperCase()),
        ...Array.from({ length: blanks }, () => '?'),
      ]
      const bands: Bands = { dict2: 1 + int(6), dict3plus: 1 + int(6) }
      assertParity(`seed ${seed} rack=${rack.join('')}`, emptyBoard(), rack, trie, bands)
    })
  }
})
