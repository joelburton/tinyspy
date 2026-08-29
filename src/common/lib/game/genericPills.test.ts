// cs-unmet

import { describe, expect, it } from 'vitest'
import { getNotOkFeedback } from './genericPills'
import type { Envelope } from '../supabase/envelope'

/**
 * The one mapping from a refused answer to what a player sees.
 *
 * What these pin is the DIVISION, more than the values: the answer decides the
 * tone and the words, the surface decides everything else. A regression here
 * doesn't look like a crash — it looks like fifteen boards slowly disagreeing
 * about what a lost race is colored, which is what one shared function exists
 * to prevent.
 */

const notOk = (partial: Partial<Envelope & { type: 'not-ok' }>) =>
  ({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: 'Something went wrong.',
    field: null,
    meta: null,
    dbcode: null,
    detail: null,
    ...partial,
  }) as Envelope & { type: 'not-ok' }

describe('getNotOkFeedback', () => {
  it('takes the words the server sent, verbatim', () => {
    const msg = getNotOkFeedback(notOk({ severity: 'race', message: 'Already played' }))
    expect(msg.text).toBe('Already played')
  })

  // Orange, not red: the move isn't being taken and you should notice, but you
  // didn't play badly. Getting this wrong is the failure the whole `race`
  // severity exists to prevent.
  it('colors a lost race as a warning, not an error', () => {
    expect(getNotOkFeedback(notOk({ severity: 'race' })).tone).toBe('warning')
  })

  it('colors the three that are really failures as errors', () => {
    expect(getNotOkFeedback(notOk({ severity: 'fault' })).tone).toBe('error')
    expect(getNotOkFeedback(notOk({ severity: 'form-validation' })).tone).toBe('error')
    expect(getNotOkFeedback(notOk({ severity: 'service-error' })).tone).toBe('error')
  })

  it("lets an author's outcome override the default", () => {
    const msg = getNotOkFeedback(notOk({ severity: 'race', outcome: 'noted' }))
    expect(msg.tone).toBe('noted')
  })

  // The modal has already fired centrally, with diagnostics only the transport
  // layer could build. A `fault: true` here would route this message to
  // `showFaultModal` a SECOND time — a duplicate, and a poorer one.
  it('never marks a message as a fault, so no second modal fires', () => {
    const msg = getNotOkFeedback(notOk({ severity: 'fault' }))
    expect(msg).not.toHaveProperty('fault')
    expect(msg).not.toHaveProperty('diagnostics')
  })

  // The two the envelope cannot know: permanence belongs to the surface, and a
  // dot says who acted rather than what happened.
  it('decides nothing about mode or identity', () => {
    const msg = getNotOkFeedback(notOk({ severity: 'race' }))
    expect(Object.keys(msg).sort()).toEqual(['text', 'tone'])
  })
})
