// cs-unmet

/**
 * THE QUESTION EVERY START ASKS FIRST.
 *
 * What matters here is the answer: yes without a card when there is no cap or
 * room under it, no after the card is dismissed when the cap is spent, and no
 * at once when the read failed or no host is up to draw the card. The card
 * itself is `PawProtectionHost`'s test.
 *
 * The read is mocked at the wrapper (`readRows`), with a builder that accepts
 * the select/eq chain and is otherwise inert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '../supabase/envelope'

const { mockReadRows } = vi.hoisted(() => ({ mockReadRows: vi.fn() }))
vi.mock('../supabase/db', () => {
  const builder = { select: () => builder, eq: () => builder }
  return { db: { from: () => builder } }
})
vi.mock('../supabase/dbResult', () => ({ readRows: mockReadRows }))

import {
  dismissRefusal,
  ensureCanStart,
  ensureCanStartRegistered,
  registerPawProtectionHost,
  registerPawSubject,
  usePendingRefusal,
  ZTest_resetPawProtection,
} from './pawProtectionService'
import { renderHook } from '@testing-library/react'

type Row = { max_daily_games: number | null; used_today: number }

function rows(data: Row[]): Envelope<Row[]> {
  return {
    type: 'ok', data, severity: null, field: null, meta: null,
    dbcode: null, detail: null, message: null, outcome: null,
  }
}

const FAILED: Envelope<never> = {
  type: 'not-ok', data: null, outcome: null, severity: 'fault',
  message: 'The read failed.', field: null, meta: null, dbcode: 'PN900', detail: null,
}

const SUBJECT = { clubHandle: 'trio', gametype: 'wordle_coop' }

beforeEach(() => {
  ZTest_resetPawProtection()
  mockReadRows.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ensureCanStart', () => {
  it('answers yes, with no card, when the gametype has no cap', async () => {
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: null, used_today: 7 }]))
    await expect(ensureCanStart(SUBJECT)).resolves.toBe(true)
    expect(renderHook(() => usePendingRefusal()).result.current).toBeNull()
  })

  it('answers yes while there is room under the cap', async () => {
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: 3, used_today: 2 }]))
    await expect(ensureCanStart(SUBJECT)).resolves.toBe(true)
  })

  it('shows the card when the cap is spent, and answers no once it is dismissed', async () => {
    registerPawProtectionHost()
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: 3, used_today: 3 }]))
    const { result, rerender } = renderHook(() => usePendingRefusal())

    let answer: boolean | null = null
    const asked = ensureCanStart(SUBJECT).then((a) => { answer = a })
    await vi.waitFor(() => { rerender(); expect(result.current).not.toBeNull() })
    expect(answer).toBeNull()

    dismissRefusal()
    await asked
    expect(answer).toBe(false)
    rerender()
    expect(result.current).toBeNull()
  })

  it('a cap of zero is spent before the first start', async () => {
    registerPawProtectionHost()
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: 0, used_today: 0 }]))
    const asked = ensureCanStart(SUBJECT)
    await vi.waitFor(() => expect(renderHook(() => usePendingRefusal()).result.current).not.toBeNull())
    dismissRefusal()
    await expect(asked).resolves.toBe(false)
  })

  it('answers no at once, with no card, when the read failed', async () => {
    // The wrapper has shown that fault; a start on top of it would show another.
    registerPawProtectionHost()
    mockReadRows.mockResolvedValue(FAILED)
    await expect(ensureCanStart(SUBJECT)).resolves.toBe(false)
    expect(renderHook(() => usePendingRefusal()).result.current).toBeNull()
  })

  it('answers no, and says so, when the cap is spent and no host is up', async () => {
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: 1, used_today: 1 }]))
    await expect(ensureCanStart(SUBJECT)).resolves.toBe(false)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no <PawProtectionHost>'))
  })

  it('answers yes for a club with no row — the server names that bug', async () => {
    mockReadRows.mockResolvedValue(rows([]))
    await expect(ensureCanStart(SUBJECT)).resolves.toBe(true)
  })
})

describe('the registered subject', () => {
  it('is what ensureCanStartRegistered asks about', async () => {
    registerPawProtectionHost()
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: 1, used_today: 1 }]))
    const release = registerPawSubject(SUBJECT)
    const asked = ensureCanStartRegistered()
    await vi.waitFor(() => expect(renderHook(() => usePendingRefusal()).result.current).not.toBeNull())
    dismissRefusal()
    await expect(asked).resolves.toBe(false)
    release()
  })

  it('lets a start through, and says so, when no page has registered one', async () => {
    await expect(ensureCanStartRegistered()).resolves.toBe(true)
    expect(mockReadRows).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no subject registered'))
  })

  it('a stale release leaves a newer page\'s subject alone', async () => {
    mockReadRows.mockResolvedValue(rows([{ max_daily_games: null, used_today: 0 }]))
    const releaseFirst = registerPawSubject(SUBJECT)
    registerPawSubject({ clubHandle: 'duo', gametype: 'syrup_coop' })
    releaseFirst()
    await expect(ensureCanStartRegistered()).resolves.toBe(true)
    expect(mockReadRows).toHaveBeenCalledTimes(1)
  })
})
