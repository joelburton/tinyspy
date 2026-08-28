// cs-unmet

/**
 * SIGNING IN — the one form whose failures never name a field.
 *
 * It talks to `supabase.auth` rather than to an RPC of ours, and that answers
 * with a message and nothing else. So everything it can say belongs on the
 * form's own line, and this is the surface that pins that arm on purpose
 * rather than for want of a better place.
 *
 * The other thing worth holding: the "sent to" line names the address the link
 * ACTUALLY went to. It read the live field once, so editing the box after
 * sending re-labeled the sentence with an address nothing had been sent to.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))
vi.mock('../../lib/supabase/supabase', () => ({
  supabase: { auth: { signInWithOtp, verifyOtp } },
}))

import { LoginScreen } from './LoginScreen'
import { errorUnder } from '../fields/errorUnder'

const MESSAGE = 'The server said this exact thing.'

async function typeEmail(address: string) {
  const user = userEvent.setup()
  const box = document.querySelector('[name="email"]') as HTMLInputElement
  await user.clear(box)
  await user.type(box, address)
  return user
}

beforeEach(() => {
  signInWithOtp.mockReset()
  verifyOtp.mockReset()
})

describe('LoginScreen — where a failure lands', () => {
  it("puts an auth failure on the form's line, never under a box", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: MESSAGE } })
    render(<LoginScreen />)

    const user = await typeEmail('moth@example.com')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    expect(errorUnder('email')).not.toBe(MESSAGE)
  })

  it('clears the last failure when you try again', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: MESSAGE } })
    render(<LoginScreen />)

    const user = await typeEmail('moth@example.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())

    signInWithOtp.mockResolvedValueOnce({ error: null })
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument())
  })
})

describe('LoginScreen — after the link is sent', () => {
  it('names the address it was sent TO, not the one now in the box', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginScreen />)

    const user = await typeEmail('moth@example.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText('moth@example.com')).toBeInTheDocument())

    // Keep typing after sending. The sentence must not follow along — nothing
    // was sent to the new address.
    await user.type(document.querySelector('[name="email"]')!, 'x')

    expect(screen.getByText('moth@example.com')).toBeInTheDocument()
    expect(screen.queryByText('moth@example.comx')).not.toBeInTheDocument()
  })
})
