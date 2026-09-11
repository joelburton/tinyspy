// cs-unmet

/**
 * Tests for the confirmation service — the imperative `askConfirmation` behind
 * every action's shared run. What it pins: a question asked with no host is
 * refused (answered `null`, and said so in the console); with a host claimed,
 * the promise waits for `settleConfirmation` and resolves to that answer; a
 * second question supersedes the first; the host's subscription sees the
 * pending question come and go; and releasing the host slot brings the refusal
 * back.
 *
 * The host component that draws the question is `ConfirmationHost.test.tsx`.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askConfirmation,
  registerConfirmationHost,
  settleConfirmation,
  usePendingConfirmation,
} from './confirmationService'

const QUESTION = { title: 'Do the thing?', message: 'It will be done.', confirmLabel: 'Do it' }

/** Whatever the current test claimed, released in afterEach — the slot and the
 *  pending question are module-level, so a leftover would answer the NEXT test. */
let release: (() => void) | undefined

afterEach(() => {
  settleConfirmation(null)
  release?.()
  release = undefined
  vi.restoreAllMocks()
})

/** Has this promise settled yet? Lets a test assert "still pending" without
 *  waiting on something that is meant not to happen. */
async function settledYet(p: Promise<unknown>): Promise<boolean> {
  let done = false
  void p.then(() => {
    done = true
  })
  // Enough microtask turns for a resolved promise's `.then` to have run.
  await Promise.resolve()
  await Promise.resolve()
  return done
}

describe('askConfirmation with no host mounted', () => {
  it('answers no at once, and says so in the console', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(askConfirmation(QUESTION)).resolves.toBeNull()
    expect(said).toHaveBeenCalledTimes(1)
    expect(said.mock.calls[0]![0]).toMatch(/no <ConfirmationHost>/)
  })
})

describe('askConfirmation with a host claimed', () => {
  it('stays pending until the question is settled', async () => {
    release = registerConfirmationHost()
    const answer = askConfirmation(QUESTION)
    expect(await settledYet(answer)).toBe(false)
    settleConfirmation('confirm')
    await expect(answer).resolves.toBe('confirm')
  })

  it.each([['confirm'], ['alternative'], [null]] as const)(
    'resolves to whatever it was settled with — %s',
    async (picked) => {
      release = registerConfirmationHost()
      const answer = askConfirmation(QUESTION)
      settleConfirmation(picked)
      await expect(answer).resolves.toBe(picked)
    },
  )

  it('a second question supersedes the first, which answers no', async () => {
    release = registerConfirmationHost()
    const first = askConfirmation(QUESTION)
    const second = askConfirmation({ ...QUESTION, title: 'The other thing?' })
    await expect(first).resolves.toBeNull()
    expect(await settledYet(second)).toBe(false)
    settleConfirmation('confirm')
    await expect(second).resolves.toBe('confirm')
  })

  it('refuses again once the host releases the slot', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    release = registerConfirmationHost()
    release()
    release = undefined
    await expect(askConfirmation(QUESTION)).resolves.toBeNull()
    expect(said).toHaveBeenCalledTimes(1)
  })
})

describe('usePendingConfirmation', () => {
  it('reflects the question on screen, and clears once it is settled', () => {
    release = registerConfirmationHost()
    const { result } = renderHook(() => usePendingConfirmation())
    expect(result.current).toBeNull()

    act(() => {
      void askConfirmation(QUESTION)
    })
    expect(result.current).toMatchObject({ title: 'Do the thing?', confirmLabel: 'Do it' })

    act(() => settleConfirmation('confirm'))
    expect(result.current).toBeNull()
  })
})
