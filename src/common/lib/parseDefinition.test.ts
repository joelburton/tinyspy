import { describe, expect, it } from 'vitest'
import { parseDefinition } from './parseDefinition'

describe('parseDefinition', () => {
  it('returns Wiktionary prose as a single verbatim text part', () => {
    const def = 'noun: (informal) A fit of anger or panic; conniption fit.'
    expect(parseDefinition(def, 'w')).toEqual([
      { kind: 'text', value: def },
    ])
  })

  it('keeps inflection tags verbatim (no stripping)', () => {
    expect(parseDefinition('rough, cindery lava [n AAS]', 's')).toEqual([
      { kind: 'text', value: 'rough, cindery lava [n AAS]' },
    ])
    expect(
      parseDefinition('to exclaim in surprise [v AAHED, AAHING, AAHS]', 's'),
    ).toEqual([{ kind: 'text', value: 'to exclaim in surprise [v AAHED, AAHING, AAHS]' }])
  })

  it('shows an inflection-only stub verbatim rather than blank', () => {
    // The class of entry that used to render empty — the gloss is
    // nothing but the inflection tag. It must still display in full.
    expect(parseDefinition('[n SUPPRESSIONS]', 's')).toEqual([
      { kind: 'text', value: '[n SUPPRESSIONS]' },
    ])
  })

  it('surfaces an inline cross-ref as a ref part, keeping the rest', () => {
    expect(parseDefinition('an {advertisement=n} [n ADS]', 's')).toEqual([
      { kind: 'text', value: 'an ' },
      { kind: 'ref', word: 'advertisement' },
      { kind: 'text', value: ' [n ADS]' },
    ])
  })

  it('links a leading cross-ref and keeps the trailing tag', () => {
    expect(parseDefinition('<aah=v> [v]', 's')).toEqual([
      { kind: 'ref', word: 'aah' },
      { kind: 'text', value: ' [v]' },
    ])
  })

  it('accepts both angle and curly cross-ref styles', () => {
    expect(parseDefinition('<dad=n> [n DAS]', 's')).toEqual([
      { kind: 'ref', word: 'dad' },
      { kind: 'text', value: ' [n DAS]' },
    ])
    expect(parseDefinition('{aye=n} [n AYS]', 's')).toEqual([
      { kind: 'ref', word: 'aye' },
      { kind: 'text', value: ' [n AYS]' },
    ])
  })
})
