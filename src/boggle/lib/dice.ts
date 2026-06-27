/**
 * Boggle dice sets, ported verbatim from wsboggle (`dice.py`, itself from
 * tboggle). Each set is a bag of six-sided dice; `n` is the board side length
 * (so `n = 4` → a 4×4 board of 16 dice). All sets ship — they're integral to the
 * game, and the 4×4/5×5 families have several distinct cube mixes.
 *
 * Face encoding on a die string:
 *   - `A`–`Z` — that letter
 *   - `1`–`6` — a **multiface** tile contributing two letters at once (you can't
 *     use half a tile): 1=Qu 2=In 3=Th 4=Er 5=He 6=An
 *   - `0`     — a **blank** tile (displays as "·"); it matches no letter, so no
 *     word can pass through it. (wsboggle's C maps it to `__`.)
 */

export interface DiceSet {
  /** registry key (also the value stored in a game's setup) */
  name: string
  /** player-facing label */
  desc: string
  /** board side length; board is n × n */
  n: number
  /** one 6-char face string per die; length === n * n */
  dice: readonly string[]
}

/** Display text for a single raw face char. */
const FACE_DISPLAY: Record<string, string> = {
  '0': '·', '1': 'Qu', '2': 'In', '3': 'Th', '4': 'Er', '5': 'He', '6': 'An',
}

export function faceToDisplay(face: string): string {
  return FACE_DISPLAY[face] ?? face
}

/** Turn a row-major raw board string into an n×n grid of display strings. */
export function boardToDisplay(board: string, n: number): string[][] {
  if (board.length !== n * n) throw new Error(`board length ${board.length} != ${n * n}`)
  const grid: string[][] = []
  for (let y = 0; y < n; y++) {
    grid.push(Array.from({ length: n }, (_, x) => faceToDisplay(board[y * n + x])))
  }
  return grid
}

export const DICE_SETS: readonly DiceSet[] = [
  {
    name: '4-classic', desc: '4×4 Classic', n: 4, dice: [
      'AACIOT', 'ABILTY', 'ABJMOQ', 'ACDEMP',
      'ACELRS', 'ADENVZ', 'AHMORS', 'BIFORX',
      'DENOSW', 'DKNOTU', 'EEFHIY', 'EGKLUY',
      'EGINTV', 'EHINPS', 'ELPSTU', 'GILRUW',
    ],
  },
  {
    name: '4', desc: '4×4 Revised', n: 4, dice: [
      'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
      'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
      'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
      'EIOSST', 'ELRTTY', 'HIMNU1', 'HLNNRZ',
    ],
  },
  {
    name: '5-orig', desc: '5×5 Original', n: 5, dice: [
      'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
      'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJK1XZ', 'CCENST',
      'CEIILT', 'CEIPST', 'DDHNOT', 'DHHLOR', 'DHHLOR',
      'DHLNOR', 'EIIITT', 'CEILPT', 'EMOTTT', 'ENSSSU',
      'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU',
    ],
  },
  {
    name: '5-challenge', desc: '5×5 Challenge', n: 5, dice: [
      'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
      'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJK1XZ', 'CCENST',
      'CEIILT', 'CEIPST', 'DDHNOT', 'DHHLOR', 'IKLM1U',
      'DHLNOR', 'EIIITT', 'CEILPT', 'EMOTTT', 'ENSSSU',
      'FIPRSY', 'GORRVW', 'IPRRRY', 'NOOTUW', 'OOOTTU',
    ],
  },
  {
    name: '5-big-deluxe', desc: '5×5 Big Deluxe', n: 5, dice: [
      'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
      'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJK1XZ', 'CCNSTW',
      'CEIILT', 'CEIPST', 'DDLNOR', 'DHHLOR', 'DHHNOT',
      'DHLNOR', 'EIIITT', 'CEILPT', 'EMOTTT', 'ENSSSU',
      'FIPRSY', 'GORRVW', 'HIPRRY', 'NOOTUW', 'OOOTTU',
    ],
  },
  {
    name: '5', desc: '5×5 Big 2012', n: 5, dice: [
      'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
      'AEEGMU', 'AEGMNN', 'AFIRSY', 'BBJKXZ', 'CCENST',
      'EIILST', 'CEIPST', 'DDHNOT', 'DHHLOR', 'DHHNOW',
      'DHLNOR', 'EIIITT', 'EILPST', 'EMOTTT', 'ENSSSU',
      '123456', 'GORRVW', 'IPRSYY', 'NOOTUW', 'OOOTTU',
    ],
  },
  {
    name: '6-super', desc: '6×6 Super Big', n: 6, dice: [
      'AAAFRS', 'AAEEEE', 'AAEEOO', 'AAFIRS', 'ABDEIO', 'ADENNN',
      'AEEEEM', 'AEEGMU', 'AEGMNN', 'AEILMN', 'AEINOU', 'AFIRSY',
      '123456', 'BBJKXZ', 'CCENST', 'CDDLNN', 'CEIITT', 'CEIPST',
      'CFGNUY', 'DDHNOT', 'DHHLOR', 'DHHNOW', 'DHLNOR', 'EHILRS',
      'EIILST', 'EILPST', 'EIO000', 'EMTTTO', 'ENSSSU', 'GORRVW',
      'HIRSTV', 'HOPRST', 'IPRSYY', 'JK1WXZ', 'NOOTUW', 'OOOTTU',
    ],
  },
  {
    name: '6', desc: '6×6 Super Big Simple', n: 6, dice: [
      'AAAFRS', 'AAEEEE', 'AAEEOO', 'AAFIRS', 'ABDEIO', 'ADENNN',
      'AEEEEM', 'AEEGMU', 'AEGMNN', 'AEILMN', 'AEINOU', 'AFIRSY',
      'AEIOUS', 'BBJKXZ', 'CCENST', 'CDDLNN', 'CEIITT', 'CEIPST',
      'CFGNUY', 'DDHNOT', 'DHHLOR', 'DHHNOW', 'DHLNOR', 'EHILRS',
      'EIILST', 'EILPST', 'EIOSSS', 'EMTTTO', 'ENSSSU', 'GORRVW',
      'HIRSTV', 'HOPRST', 'IPRSYY', 'JK1WXZ', 'NOOTUW', 'OOOTTU',
    ],
  },
]

export const DICE_BY_NAME: Record<string, DiceSet> =
  Object.fromEntries(DICE_SETS.map((s) => [s.name, s]))
