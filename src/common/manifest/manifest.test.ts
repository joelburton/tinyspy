// cs-unmet

/**
 * What `Manifest` gives every game: `submitTimeout` and `stopGame`, ONE
 * frontend path over every game's SQL definition (a regression here breaks
 * every game at once), and `makeLead`.
 *
 * The `db` is a fake handed to a test subclass, so there is no mocking at all.
 */

import { describe, expect, it, vi } from 'vitest'

import type { EndingLabel } from '../ending/endingLabel'
import { Manifest, type ManifestDb } from './manifest'

/** A leaf with only what these tests read; the rest is filled and never used. */
class TestManifest extends Manifest {
  readonly gametype = 'test_coop'
  readonly schema = 'test'
  readonly baseGametype = 'test'
  readonly mode = 'coop'
  readonly draftsOffTurn = false
  readonly name = 'Test'
  readonly shortDescription = 'A test game'
  readonly logoUrl = 'test.svg'
  readonly help = (() => null) as Manifest['help']
  readonly scratchpad = 'none'
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly PlayArea = (() => null) as Manifest['PlayArea']
  readonly setupForm = { Component: () => null, defaults: {} } as Manifest['setupForm']
  protected readonly db: ManifestDb

  constructor(db: ManifestDb) {
    super()
    this.db = db
  }

  startGameInClub(): ReturnType<Manifest['startGameInClub']> {
    throw new Error('not under test')
  }

  summaryFor(): string {
    return ''
  }

  // `makeLead` is protected; a leaf reaches it the way this does.
  leadFor(endingLabel: EndingLabel): string {
    return this.makeLead(endingLabel)
  }
}

/** The envelope PostgREST hands back, in both arms. */
const envelope = (fields: Record<string, unknown>) => ({
  data: {
    type: 'ok', data: null, outcome: null, severity: null, message: null,
    field: null, meta: null, dbcode: null, detail: null, ...fields,
  },
  error: null,
})

describe('Manifest.submitTimeout and Manifest.stopGame', () => {
  it('calls the named RPC with { p_game_id } and hands the ok envelope up', async () => {
    const rpc = vi.fn().mockResolvedValue(envelope({ data: { result: 'ended' } }))
    const manifest = new TestManifest({ rpc })

    const res = await manifest.submitTimeout('game-1')

    expect(res.type).toBe('ok')
    expect(res.type === 'ok' && res.data?.result).toBe('ended')
    expect(rpc).toHaveBeenCalledWith('submit_timeout', { p_game_id: 'game-1' })
  })

  it('relays a refusal WITHOUT deciding anything about it', async () => {
    // The peer race that ends every timed multiplayer game arrives as PN486,
    // and passes up intact so GamePage, which knows whether anyone is looking,
    // decides to swallow it.
    const rpc = vi.fn().mockResolvedValue(envelope({
      type: 'not-ok', severity: 'race',
      message: 'Game over', dbcode: 'PN486', field: '_',
    }))
    const manifest = new TestManifest({ rpc })

    const res = await manifest.stopGame('game-2')

    expect(res.type).toBe('not-ok')
    expect(res.type === 'not-ok' && res.severity).toBe('race')
    expect(res.message).toBe('Game over')
    expect(res.dbcode).toBe('PN486')
    expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'game-2' })
  })
})

describe('Manifest.makeLead', () => {
  const label = (word: string, long: string): EndingLabel => ({
    labelType: 'lost', word, long, pill: '', outcome: 'lost', endedBy: 'game',
  })

  it('puts the detail after the word, in parentheses', () => {
    expect(new TestManifest({ rpc: vi.fn() }).leadFor(label('Lost', 'out of guesses')))
      .toBe('Lost (out of guesses)')
  })

  it('is the bare word when there is no detail', () => {
    expect(new TestManifest({ rpc: vi.fn() }).leadFor(label('Stopped', ''))).toBe('Stopped')
  })
})
