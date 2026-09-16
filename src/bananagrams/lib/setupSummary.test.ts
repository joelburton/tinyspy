// cs-unmet

import { describe, expect, it } from 'vitest'
import type { Member } from '@/common/members/member'
import { DEFAULT_BANANAGRAMS_SETUP as DEFAULTS } from './setup'
import { setupRows } from './setupSummary'

const me: Member = { user_id: 'u1', username: 'me', color: 'red' } as unknown as Member

const rowValue = (rows: ReturnType<typeof setupRows>, key: string) =>
  rows.find((r) => r.key === key)?.value

describe('bananagrams setupRows', () => {
  it('says where a dumped tile goes, the right way round', () => {
    // `dump_to_bag: true` takes the tile OUT OF PLAY; `false` returns it to the
    // bunch (`BananagramsSetup.dump_to_bag`). The printed record had these
    // swapped, which is what this pins.
    expect(rowValue(setupRows({ ...DEFAULTS, dump_to_bag: true }, 'compete', [me]), 'dump_to_bag'))
      .toBe('to the bag (out of play)')
    expect(rowValue(setupRows({ ...DEFAULTS, dump_to_bag: false }, 'compete', [me]), 'dump_to_bag'))
      .toBe('back to the bunch')
  })

  it("reads the word check back in the dialog's own words", () => {
    expect(rowValue(setupRows({ ...DEFAULTS, word_check: 'strict' }, 'compete', [me]), 'word_check'))
      .toBe('Every peel')
    expect(rowValue(setupRows({ ...DEFAULTS, word_check: 'off' }, 'compete', [me]), 'word_check'))
      .toBe('Off')
  })

  it('shows the dictionary bands only when words are checked', () => {
    const off = setupRows({ ...DEFAULTS, word_check: 'off' }, 'compete', [me])
    expect(off.map((r) => r.key)).not.toContain('dict_2')
    const on = setupRows({ ...DEFAULTS, word_check: 'win' }, 'compete', [me])
    expect(on.map((r) => r.key)).toEqual(
      expect.arrayContaining(['dict_2', 'dict_3plus']),
    )
  })

  it('follows the dialog: roster first, then hand, bunch, dump, check, bands, timer', () => {
    const rows = setupRows({ ...DEFAULTS, word_check: 'win' }, 'compete', [me])
    expect(rows.map((r) => r.key)).toEqual([
      'players', 'hand_size', 'bunch_size', 'dump_to_bag', 'word_check', 'dict_2', 'dict_3plus', 'timer',
    ])
  })
})
