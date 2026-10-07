// cs-unmet

/**
 * THE CARD, DRAWN BY THE HOST: nothing until a start is refused, then the
 * picture, the words and one button, and the asker's promise settles no when
 * the button is pressed.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '../supabase/envelope'

const { mockReadRows } = vi.hoisted(() => ({ mockReadRows: vi.fn() }))
vi.mock('../supabase/db', () => {
  const builder = { select: () => builder, eq: () => builder }
  return { db: { from: () => builder } }
})
vi.mock('../supabase/dbResult', () => ({ readRows: mockReadRows }))

vi.mock('@/gametypes', () => ({
  manifestFor: (gametype: string) =>
    gametype === 'wordle_coop' ? { gametype, name: 'WordNerd', mode: 'coop' } : undefined,
}))

import { PawProtectionHost } from './PawProtectionHost'
import { ensureCanStart, ZTest_resetPawProtection } from './pawProtectionService'

function spent(): Envelope<{ max_daily_games: number | null; used_today: number }[]> {
  return {
    type: 'ok', data: [{ max_daily_games: 2, used_today: 2 }], severity: null, field: null,
    meta: null, dbcode: null, detail: null, message: null, outcome: null,
  }
}

beforeEach(() => {
  ZTest_resetPawProtection()
  mockReadRows.mockReset()
})

describe('PawProtectionHost', () => {
  it('draws nothing while no start is refused', () => {
    const { container } = render(<PawProtectionHost />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws the card for a refused start, and OK settles the asker no', async () => {
    mockReadRows.mockResolvedValue(spent())
    render(<PawProtectionHost />)

    let answer: boolean | null = null
    const asked = ensureCanStart({ clubHandle: 'trio', gametype: 'wordle_coop' }).then((a) => { answer = a })
    const ok = await screen.findByRole('button', { name: 'OK' })
    // The picture is decoration (an empty alt), so it has no role to find.
    expect(document.querySelector('img')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paw Protection' })).toBeInTheDocument()
    // The cap and the brand in the words, each in bold.
    expect(screen.getByText('2 games', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('WordNerd', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/per day\. You have exceeded your limit\./)).toBeInTheDocument()
    expect(answer).toBeNull()

    await userEvent.setup().click(ok)
    await asked
    expect(answer).toBe(false)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument())
  })
})
