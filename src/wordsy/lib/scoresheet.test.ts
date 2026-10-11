// cs-unmet

/**
 * The scoresheets' rows, on the planted table (`ZTest_TABLE`: F B C D L C Q R,
 * worth 6 5 4 4 3 3 4 2, the F a +1 and the Q a +2).
 */
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_makeGameDataRaw, ZTest_TWO, ZTest_word } from './gameData.fixture'
import { makeGameSheets, makeRoundSheet } from './scoresheet'

describe('makeRoundSheet', () => {
  // me, the Fastest: ELF, 3 + 5 + 1 = 9, and the Fastest's 2. bea: BOB, 5.
  const gd = makeGameData(ZTest_makeGameDataRaw({
    rounds: [{ num: 1, ended: true, fastest: 'u1' }],
    events: [ZTest_word(1, 'u1', 1, 'elf', 9, 2), ZTest_word(2, 'u2', 1, 'bob', 5)],
  }), 'u1')
  const rows = makeRoundSheet(gd, gd.round)

  it('carries each word\'s score', () => {
    expect(rows.map((r) => r.score)).toEqual([9, 5])
  })

  it('puts the Fastest\'s bonus in its own column', () => {
    expect(rows[0]).toMatchObject({ fastestBonus: 2, beatBonus: null })
  })

  it('stars the round\'s best score', () => {
    expect(rows.map((r) => r.isStar)).toEqual([true, false])
  })

  it('puts a bonus for beating the Fastest in the other column, and stars a tie twice', () => {
    const tie = makeGameData(ZTest_makeGameDataRaw({
      rounds: [{ num: 1, ended: true, fastest: 'u2' }],
      events: [ZTest_word(1, 'u1', 1, 'dr', 6, 1), ZTest_word(2, 'u2', 1, 'ra', 2)],
    }), 'u1')
    const [mine] = makeRoundSheet(tie, tie.round)
    expect(mine).toMatchObject({ fastestBonus: null, beatBonus: 1, isStar: true })
  })

  it('stars the best total, so a bonus breaks a tie of word scores', () => {
    // WIPED 13 and PAWED 13, PAWED's player the Fastest for +2: 15 against 13.
    const tied = makeGameData(ZTest_makeGameDataRaw({
      players: [...ZTest_TWO, { id: 'u3', username: 'cy', color: 'green' }],
      rounds: [{ num: 1, ended: true, fastest: 'u3' }],
      events: [ZTest_word(1, 'u1', 1, 'wiped', 13), ZTest_word(2, 'u2', 1, 'maple', 9),
               ZTest_word(3, 'u3', 1, 'pawed', 13, 2)],
    }), 'u1')
    expect(makeRoundSheet(tied, tied.round).map((r) => r.isStar)).toEqual([false, false, true])
  })

  it('stars nobody when nobody scored', () => {
    const none = makeGameData(ZTest_makeGameDataRaw({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }],
      events: [ZTest_word(1, 'u1', 1, 'ae', 0), ZTest_word(2, 'u2', 1, '', 0)],
    }), 'u1')
    expect(makeRoundSheet(none, none.round).map((r) => r.isStar)).toEqual([false, false])
  })
})

describe('makeGameSheets', () => {
  // A short game, best two of three. bea won. My rounds: DR 6, B 5, ELF 9 +1:
  // the B is struck, 6 + 9 + 1 = 16.
  const gd = makeGameData(ZTest_makeGameDataRaw({
    setup: { timer: { kind: 'none' }, legal_band: 4, round_style: 'timer', n_rounds: 3, one_word: false },
    rounds: [
      { num: 1, ended: true, fastest: 'u2' },
      { num: 2, ended: true, fastest: 'u2' },
      { num: 3, ended: true, fastest: 'u2' },
    ],
    events: [
      ZTest_word(1, 'u1', 1, 'dr', 6), ZTest_word(2, 'u2', 1, 'cab', 9),
      ZTest_word(3, 'u1', 2, 'b', 5), ZTest_word(4, 'u2', 2, 'dab', 9),
      ZTest_word(5, 'u1', 3, 'elf', 9, 1), ZTest_word(6, 'u2', 3, 'crab', 11),
    ],
    players: [
      { id: 'u1', username: 'me', finalRanking: 2, total: 16 },
      { id: 'u2', username: 'bea', finalRanking: 1, total: 20 },
    ],
    ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
  }), 'u1')
  const sheets = makeGameSheets(gd)

  it('puts the winner\'s table first', () => {
    expect(sheets.map((s) => s.player.username)).toEqual(['bea', 'me'])
  })

  it('strikes the lowest word score, which then adds only its bonus', () => {
    const mine = sheets[1]!
    expect(mine.rows.map((r) => [r.num, r.isStruck, r.rowTotal])).toEqual([[1, false, 6], [2, true, 0], [3, false, 10]])
  })

  it('totals each table with the server\'s total, the rows summing to it', () => {
    for (const s of sheets) expect(s.rows.reduce((sum, r) => sum + r.rowTotal, 0)).toBe(s.total)
  })

  it('strikes the later round of a tie for the lowest', () => {
    expect(sheets[0]!.rows.map((r) => r.isStruck)).toEqual([false, true, false])
  })
})
