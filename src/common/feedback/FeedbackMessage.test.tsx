// cs-met-feedback

import { describe, expect, it } from 'vitest'
import { FeedbackMessage, KINDS, type Kind } from './FeedbackMessage'
import type { NotOkEnvelope } from '../supabase/envelope'

/**
 * A message's behavior comes from its KIND's row and nothing else: every
 * constructor names a kind, the getters read the row, and `overrides` is the
 * only way a site bends it. The cases here pin which constructor makes which
 * kind, where each one's outcome and actor come from, and that an override
 * lands on top of the row rather than beside it.
 */

const moth = { username: 'moth', color: 'green' }

const race: NotOkEnvelope = {
  type: 'not-ok',
  data: null,
  outcome: null,
  severity: 'race',
  message: 'Someone got there first',
  field: null,
  meta: null,
  dbcode: 'PN269',
  detail: null,
}

function expectRow(msg: FeedbackMessage, kind: Kind) {
  expect(msg.kind).toBe(kind)
  expect(msg.fill).toBe(KINDS[kind].fill)
  expect(msg.rank).toBe(KINDS[kind].rank)
  expect(msg.leavesBy).toBe(KINDS[kind].leavesBy)
  expect(msg.ms).toBe(KINDS[kind].ms)
}

describe('FeedbackMessage — each constructor and its kind', () => {
  it('notOk: every not-ok is a notOk, its outcome from the envelope', () => {
    const msg = FeedbackMessage.notOk(race)
    expectRow(msg, 'notOk')
    expect(msg.text).toBe('Someone got there first')
    // A race reads as warning by default (dbResult's severity table); the
    // author's own outcome would win if the envelope carried one.
    expect(msg.outcome).toBe('warning')
    expect(FeedbackMessage.notOk({ ...race, outcome: 'lost' }).outcome).toBe('lost')
    expect(FeedbackMessage.notOk({ ...race, severity: 'fault' }).outcome).toBe('error')
  })

  it('terminalVerdict: the pill text, the outcome and the actor come from the terminal message', () => {
    const msg = FeedbackMessage.terminalVerdict({
      pillText: 'Won: all found',
      infoColText: 'You won!',
      outcome: 'won',
      actor: moth,
    })
    expectRow(msg, 'terminalVerdict')
    expect(msg.text).toBe('Won: all found')
    expect(msg.outcome).toBe('won')
    expect(msg.actor).toBe(moth)
  })

  it('outOfRace: conceded or the game’s own words, neutral, with the fill', () => {
    expect(FeedbackMessage.outOfRace(true).text).toBe('Conceded — race continues')
    expect(FeedbackMessage.outOfRace(false).text).toBe('Lost — race continues')
    const solved = FeedbackMessage.outOfRace(false, 'Solved — waiting on the rest')
    expectRow(solved, 'standingState')
    expect(solved.text).toBe('Solved — waiting on the rest')
    expect(solved.outcome).toBe('neutral')
  })

  it('standingState: a game-specific standing state takes its outcome', () => {
    const msg = FeedbackMessage.standingState('lost', 'Sudden death: wrong loses')
    expectRow(msg, 'standingState')
    expect(msg.outcome).toBe('lost')
  })

  it('result and acknowledgment share a rank and differ in how they leave', () => {
    const r = FeedbackMessage.result('lost', 'Not a word')
    const a = FeedbackMessage.acknowledgment('neutral', 'Peel! You drew 3 tiles.')
    expectRow(r, 'result')
    expectRow(a, 'acknowledgment')
    expect(r.rank).toBe(a.rank)
    expect(r.leavesBy).toBe('gesture')
    expect(a.leavesBy).toBe('timer')
    expect(a.ms).toBe(1400)
  })

  it('hint leaves only by the ×', () => {
    const msg = FeedbackMessage.hint('noted', 'Hint: a fruit')
    expectRow(msg, 'hint')
    expect(msg.leavesBy).toBe('close')
  })

  it('waiting, peerStatus and note are all standingNotes, neutral', () => {
    const w = FeedbackMessage.waiting(moth)
    const p = FeedbackMessage.peerStatus(moth, 'writing clue')
    const n = FeedbackMessage.note('Chain is full — remove a word')
    for (const m of [w, p, n]) {
      expectRow(m, 'standingNote')
      expect(m.outcome).toBe('neutral')
    }
    // The mention sits mid-sentence in "Waiting for ● moth…", so that one
    // builds its node and sets no actor; peerStatus leads with the person.
    expect(w.actor).toBeUndefined()
    expect(p.actor).toBe(moth)
    expect(p.text).toBe('writing clue')
  })

  it('prompt is the bottom of the pile', () => {
    const msg = FeedbackMessage.prompt('Waiting for your move')
    expectRow(msg, 'prompt')
    expect(msg.rank).toBeGreaterThan(KINDS.standingNote.rank)
  })

  it('peer leads with the actor and takes its outcome per message', () => {
    const msg = FeedbackMessage.peer(moth, 'won', 'found APPLE +7')
    expectRow(msg, 'peer')
    expect(msg.actor).toBe(moth)
    expect(msg.outcome).toBe('won')
    expect(msg.text).toBe('found APPLE +7')
  })

  it('chat builds its own node — bold sender, ": " join — and sets no actor', () => {
    const msg = FeedbackMessage.chat(moth, 'hi everyone')
    expectRow(msg, 'chat')
    expect(msg.actor).toBeUndefined()
    expect(msg.ms).toBe(2000)
  })
})

describe('FeedbackMessage — overrides', () => {
  it('an override sits on top of the kind’s row, field by field', () => {
    const msg = FeedbackMessage.result('lost', 'Not a word', { leavesBy: 'timer', ms: 500 })
    expect(msg.kind).toBe('result')
    expect(msg.leavesBy).toBe('timer')
    expect(msg.ms).toBe(500)
    // Untouched fields still read the row.
    expect(msg.rank).toBe(KINDS.result.rank)
    expect(msg.fill).toBe(false)
  })

  it('an outcome override wins over a fixed one', () => {
    expect(FeedbackMessage.waiting(moth, { outcome: 'warning' }).outcome).toBe('warning')
  })

  it('a rank override moves one message, not the kind', () => {
    const bumped = FeedbackMessage.note('viewing move 3', { rank: 0 })
    expect(bumped.rank).toBe(0)
    expect(FeedbackMessage.note('another').rank).toBe(KINDS.standingNote.rank)
  })
})

describe('KINDS — the table’s own invariants', () => {
  it('a timer kind carries a duration and no other kind does', () => {
    for (const [kind, row] of Object.entries(KINDS)) {
      if (row.leavesBy === 'timer') expect(row.ms, kind).not.toBeNull()
      else expect(row.ms, kind).toBeNull()
    }
  })

  it('ranks are spaced so a kind can be moved by editing one number', () => {
    const ranks = [...new Set(Object.values(KINDS).map((r) => r.rank))].sort((a, b) => a - b)
    for (let i = 1; i < ranks.length; i++) expect(ranks[i] - ranks[i - 1]).toBeGreaterThanOrEqual(10)
  })

  it('only the two final states wear the fill', () => {
    const filled = Object.entries(KINDS).filter(([, r]) => r.fill).map(([k]) => k)
    expect(filled.sort()).toEqual(['standingState', 'terminalVerdict'])
  })
})
